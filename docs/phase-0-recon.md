# NS-Design-Email — Phase 0: reconnaissance and attachment spike

Status: **complete.** Part 1 answered from the committed reference source; Part 2
answered from documentation.
Date: 2026-09-16
Nothing has been built. No implementation code exists in this repository.

---

## Reference source

The five 2026 Quote scripts this reconnaissance is based on are committed, unmodified,
under `reference/`. They are read-only copies from the NetSuite File Cabinet at
`SuiteScripts/NuHeat/2026 Quote/` and must never be edited from this repository — see
`reference/README.md`. Line numbers below are **hints**, correct as of the imported
copies; grep for the function name rather than trusting the number.

`NS-Opportunity-SO-Sync` and `NS-Work-Instructions-Setter` were not touched, and
nothing found here implies they would need to be.

---

## Part 1 — Reconnaissance

### a) How the Send Quote Suitelet is reached from the Opportunity

Two scripts, both deployed against the Opportunity. This is the pattern Send Design
copies.

**The user event** — `reference/nuheat_opportunity_ue.js`, v1.0.0

- Script ID `customscript_nuheat_opportunity_ue`, deployment
  `customdeploy_nuheat_opportunity_ue`, applies to Opportunity, **Before Load** only.
- Entry point is `beforeLoad(context)` (~line 35); it is the only entry point the
  module returns.
- It **returns early unless the mode is VIEW or EDIT**, comparing
  `context.type` against `context.UserEventType.VIEW` / `.EDIT`. So the button never
  appears on CREATE — sensible, since an unsaved record has no ID to pass.
- **That is the only condition on the button's appearance.** Nothing is tested about
  the record's status, value proposition, sales rep, or whether quotes exist. A user
  can press the button on any saved Opportunity; the Suitelet deals with the
  consequences.
- Before adding, it calls `form.removeButton({ id: 'custpage_send_quote' })` inside
  its own try/catch, on the basis that the call throws when the button is absent.
- The button itself:

```javascript
form.addButton({
    id: 'custpage_send_quote',
    label: 'Send Quote',
    functionName: 'openSendQuoteSuitelet'
});
```

- The whole of `beforeLoad` is wrapped in try/catch which logs and swallows, so a
  failure here degrades to "no button" rather than blocking the record from loading.

**How the button is wired to the client script**

`functionName` is a bare string. It is resolved against the client script attached to
the form by the very next line:

```javascript
form.clientScriptModulePath = './nuheat_opportunity_cs.js';
```

The `./` is relative to the user event script's own folder in the File Cabinet, which
is why all five modules sit together in `2026 Quote`. **The client script has no
script record of its own and needs none** — it is attached to the form, not deployed.

> Trap: the header comment block of `nuheat_opportunity_cs.js` declares
> `Script ID: customscript_nuheat_opportunity_cs` and
> `Deployment ID: customdeploy_nuheat_opportunity_cs`. Given it is loaded via
> `clientScriptModulePath`, those records are very unlikely to exist. Treat the header
> as aspirational documentation rather than fact, and do not copy those two lines into
> the Send Design client script without checking.

**How the URL is built** — `reference/nuheat_opportunity_cs.js`, v1.0.0,
`openSendQuoteSuitelet()` (~line 43)

```javascript
var SEND_QUOTE_SCRIPT_ID     = 'customscript_nuheat_send_quote_sl';
var SEND_QUOTE_DEPLOYMENT_ID = 'customdeploy_nuheat_send_quote_sl';

var rec           = currentRecord.get();
var opportunityId = rec.id;

if (!opportunityId) {
    alert('Please save the Opportunity record before sending a quote.');
    return;
}

var suiteletUrl = url.resolveScript({
    scriptId:          SEND_QUOTE_SCRIPT_ID,
    deploymentId:      SEND_QUOTE_DEPLOYMENT_ID,
    returnExternalUrl: false,
    params: {
        opportunityId: opportunityId
    }
});

window.open(suiteletUrl, '_blank');
```

Four points worth carrying over verbatim:

1. **Script and deployment IDs are string constants at the top of the client script**,
   never internal IDs, and `url.resolveScript` does the resolving. Send Design does the
   same with its own IDs.
2. **`returnExternalUrl: false`** — internal URL, so the user's existing session
   carries; the Suitelet runs as them.
3. **The Opportunity ID travels as a single query parameter, `opportunityId`**, and the
   Suitelet reads it back as `context.request.parameters.opportunityId`. Match that
   name unless there is a reason not to.
4. **`window.open(..., '_blank')`** — new tab, the Opportunity stays open behind it.

The function is both returned from the module and assigned to
`window.openSendQuoteSuitelet`. Returning it is what NetSuite actually resolves
`functionName` against; the `window` assignment is belt-and-braces. Harmless, and worth
keeping for symmetry rather than debugging its absence later.

> Trap, inherited by any copy: in **EDIT** mode the button opens the Suitelet in a new
> tab while unsaved changes sit in the original tab. The Suitelet re-loads the
> Opportunity from the database, so it sees the *saved* state and silently ignores
> whatever the user has just typed. For Send Design this matters more than it does for
> Send Quote — if the user has just changed the project engineer or value proposition
> and not saved, the email will be built from the old values. Worth deciding
> deliberately whether Send Design appears in EDIT mode at all, or warns.

### b) How the sender's contact details are resolved

`reference/nuheat_master_proposal.js`, `loadOpportunityData(opportunityId)` (~line 437)
and the `loadSalesRepData(salesRepId)` helper immediately below it (~line 519).

The chain is:

1. `record.load` the Opportunity.
2. `var salesRepId = oppRecord.getValue({ fieldId: 'salesrep' });` — the standard field.
3. `loadSalesRepData(salesRepId)` `record.load`s the **Employee** record and reads:

| Returned as | Source |
|---|---|
| `id` | the `salesrep` value from the Opportunity |
| `name` | Employee `firstname` + `lastname`, trimmed |
| `email` | Employee `email` |
| `phone` | Employee `phone` |
| `initials` | first letters of `firstname` / `lastname`, uppercased |

4. **Then the phone is overridden.** Back in `loadOpportunityData`, a comment marked
   v1.5.7 reads `custbody_sales_rep_phone` **from the Opportunity** and, if non-empty,
   replaces `salesRepData.phone`. The Opportunity field takes priority; the Employee
   `phone` field is the fallback.

So the answer to "which employee field the phone comes from" is `phone` on the Employee
record — but only when the Opportunity's `custbody_sales_rep_phone` is empty.

**Does it generalise to any employee?** Mostly yes, with two caveats.

`loadSalesRepData` is generic in everything but its name: give it any employee internal
ID and it returns id / name / email / phone / initials. Pointing the same logic at
`custbody_pe` instead of `salesrep` will work. The two things that do **not** generalise:

- **The phone override is sales-rep-specific.** `custbody_sales_rep_phone` is a sales
  rep field. There is no reason to expect a project-engineer equivalent, so unless the
  client confirms one exists, the PE's phone comes from the Employee record's `phone`
  and nothing else. **Open question for the client:** is there a PE phone override
  field on the Opportunity?
- **The fallbacks are branded for a sales rep.** When `salesRepId` is empty, or the
  Employee load throws, the function returns hard-coded values:
  `name: 'Your Account Manager'`, `email: 'info@nu-heat.co.uk'`,
  `phone: '01404 540604'`, `initials: 'NH'`. Those are wrong for a project engineer,
  and two of them are environment/business constants living in source.

> Trap, and a real one: the catch around the Employee load calls
> `safeLog('warn', ...)`. `safeLog` (~line 211) is defined as
> `if (log && typeof log[level] === 'function') { log[level](title, details); }`.
> **`log.warn` does not exist in SuiteScript**, so `typeof log.warn === 'function'` is
> false and the call is silently discarded. The result: if the Employee record fails to
> load, the proposal quietly goes out showing the switchboard number and
> `info@nu-heat.co.uk` under the heading "Your Account Manager", **and nothing is
> logged at all**. The module's own changelog at line 166 shows `safeLog` was
> introduced precisely to stop `log.warn is not a function` throwing — it fixed the
> crash and converted three warnings into silence. Three sites are affected
> (~lines 556, 1510, 1517). Not ours to fix; worth knowing, and worth **not**
> reproducing — Send Design should log a failed employee lookup at `log.error` or
> `log.audit` with the raw ID.

Also noted: `loadOpportunityData` returns a good deal more than the sales rep —
`tranId`, `title`, `quoteEmailRef` (`custbody_quote_email_ref`), customer name / first
name / id / email, `siteAddress` (`custbody_opp_site_adress`, misspelled in NetSuite
and correctly misspelled in the code), `status`, and a formatted `proposalDate`. Much
of that is directly useful to a design email.

### c) The `email.send` call

`reference/nuheat_send_quote_sl.js`, `sendProposalEmail(...)` (~line 956). The call
itself (~line 985):

```javascript
var emailParams = {
    author:     senderId,
    recipients: toList,
    subject:    subject,
    body:       body,
    relatedRecords: {
        entityId:      oppData.customerId || undefined,
        transactionId: opportunityId
    }
};

if (ccList.length > 0)  { emailParams.cc  = ccList; }
if (bccList.length > 0) { emailParams.bcc = bccList; }

email.send(emailParams);
```

**How `author` is chosen — and this is the part Send Design changes.**

```javascript
var senderId = oppData.salesRep.id || runtime.getCurrentUser().id;
if (!senderId) {
    senderId = runtime.getCurrentUser().id;
}
```

The sender is **derived, never chosen**: the Opportunity's sales rep if there is one,
otherwise the logged-in user. The user is not asked and is not shown who the email will
come from. Send Design's brief explicitly requires the user to *choose* the sender, so
this is a rewrite, not a reuse — but the derivation is still the right **default** to
preselect.

Note the second `if` is dead code: `||` has already substituted the current user, so
`senderId` cannot be falsy by then unless `getCurrentUser().id` is itself falsy, in
which case the reassignment changes nothing. Harmless, but don't copy it.

**How `relatedRecords` is populated, and what puts the message on the Communication tab**

`relatedRecords` is what does it — this is the whole mechanism, and there is no
separate "create a Message record" step anywhere in the file.

- `transactionId: opportunityId` — an Opportunity is a transaction, so the sent message
  is filed against the Opportunity and appears under its **Communication > Messages**
  subtab.
- `entityId: oppData.customerId || undefined` — files the same message against the
  customer, so it also shows on the customer's Communication tab.

The `|| undefined` matters: `relatedRecords` keys must be omitted rather than passed
empty, and `undefined` is how this code omits one. Copy that idiom.

For Send Design the shape is identical. Attachments join it as an `attachments` array
of `file.File` objects alongside `body` — see Part 2.

Two further things about this function worth carrying:

- **It throws rather than sending to nobody**: `if (toList.length === 0) throw new
  Error('No valid recipient email addresses provided.');`
- **The caller catches**. At ~line 925 the send is wrapped, and a failure produces
  `emailResult = { success: false, error: emailErr.message }` which is rendered onto the
  success page rather than thrown at the user as a stack trace. Good pattern; keep it.
  Note that for Send Design the ordering question is sharper — if files have already
  been saved to the File Cabinet and the send then fails, the report page must say so
  clearly, and the client's retention decision (below) determines whether the saved
  files are cleaned up.

### d) What is reusable, and what needs rewriting

**Directly reusable, copy with minimal change**

| Piece | Where | Note |
|---|---|---|
| Button + `clientScriptModulePath` + `url.resolveScript` wiring | `nuheat_opportunity_ue.js` / `_cs.js`, in full | The pattern of (a). Change the IDs, the button label, and the param name if needed. |
| `parseEmails(emailStr)` | `nuheat_send_quote_sl.js` ~line 294 | Three lines, no dependencies, ES5-clean: split on comma, trim, drop empties. Copy verbatim. |
| `validateEmailField(value)` | `nuheat_send_quote_cs.js` ~line 249 | Comma-split, `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` per address, empty passes. Copy verbatim. |
| The `saveRecord` validation shape | `nuheat_send_quote_cs.js` ~line 271 | Check, `dialog.alert`, `return false`; whole thing in try/catch that also returns false. The *checks* change; the shape does not. |
| `relatedRecords` construction | `nuheat_send_quote_sl.js` ~line 990 | Identical need. |
| `escapeHtml` and the branded CSS / inline-HTML layout helpers | `nuheat_send_quote_sl.js` ~lines 2452, 2168 | Optional, but gives Send Design a form that looks like Send Quote for free. |
| `showErrorPage` / `showSuccessPage` structure | ~lines 2427, 2324 | Same need: report what happened after a POST. |
| GET/POST split in `onRequest` | ~line 304 | `GET` → render form, `POST` → handle submission, everything in try/catch → `showErrorPage`. |

**Reusable with real modification**

*The contact dropdown* (`nuheat_send_quote_sl.js` ~line 743, plus `fieldChanged` in the
CS ~line 63). The search — `search.Type.OPPORTUNITY` filtered to the record with
`contact` joins for `internalid` / `firstname` / `lastname` / `email` — is exactly what
Send Design needs for its To field, and should be lifted as-is. The dropdown around it
needs fixing:

> Trap: **the option value is the contact's email address, not the contact's internal
> ID.** Two contacts sharing a mailbox produce duplicate option values, and every
> contact without an email gets `value: ''` — the same value as the
> `-- Select a contact --` placeholder. Selecting such a contact does nothing at all;
> `fieldChanged` reads `''` and deliberately returns without clearing the To field. The
> `(no email)` label is the only feedback. For Send Design, key the options on contact
> ID and look the email up on selection, or filter emailless contacts out of the list.

*The sender selection.* Nothing to reuse — Send Quote has no sender picker. But
`loadSalesRepData`'s employee-record read (b) is the right way to resolve whoever is
picked, and `custbody_pe` / `salesrep` are the right two names to preselect from.

**Needs rewriting for a form whose job is attachments**

- **The To/CC/BCC hidden-field pattern — rewrite it, do not copy it.** What Send Quote
  does: three real NetSuite `TEXT` fields (`custpage_email_to/_cc/_bcc`) set to
  `FieldDisplayType.HIDDEN`, with three *hand-written* `<input>` elements
  (`custpage_email_to_input`, etc.) rendered inside an INLINEHTML block, and a raw
  `<script>` that copies visible → hidden on `input`, `change`, and form `submit`
  (~lines 2254–2298). It exists purely so the inputs can be styled inside a grey box.

  > Trap, and the most consequential one in these files: the sync writes
  > `toHidden.value = toInput.value` **directly to the DOM**, bypassing NetSuite's
  > client-side record model. But `saveRecord` validates with
  > `rec.getValue({ fieldId: 'custpage_email_to' })`, which reads the *model*. The two
  > can disagree. The contact-selector path stays consistent because `fieldChanged`
  > calls `rec.setValue` as well as touching the DOM — but a user who simply **types**
  > an address only updates the DOM. Validation can therefore pass on a stale value
  > while the POST carries the new one, and since the server's `parseEmails` does no
  > validation whatsoever, an invalid address typed by hand can reach `email.send`
  > unchecked. Send Design should use ordinary visible NetSuite fields and let the
  > model be the single source of truth. Cosmetics are not worth this.

- **The whole quote-selection sublist** (~lines 560–735) — irrelevant. Send Design
  selects no quotes.
- **`buildEmailBody` / the merge-tag template** (~line 1027) — the Send Quote body is
  built around `{{PROPOSAL_URL}}` and quote references. A design email needs its own
  template and its own merge tags, driven by `custbody_value_proposition`.
- **Preview** (`handlePreview`, ~line 332, and `previewProposal` in the CS) — Send
  Quote previews generated HTML. There is no equivalent for a design email; drop it.
- **The `FILE` fields themselves** — no precedent anywhere in these files. Entirely new
  code, and the subject of Part 2.

### Other traps and defects noted in passing

Recorded because they are worth knowing, **not** to be fixed here — this is another
project's code.

1. **`safeLog('warn', ...)` is silently discarded** —
   `nuheat_master_proposal.js` ~lines 556, 1510, 1517. Detail in (b). The most
   important of the three hides a failed sales-rep lookup.
2. **Hard-coded internal ID in source** — `nuheat_master_proposal.js` ~line 225:
   `var FOLDER_ID = 26895192;` ("Quote HTML Files"). Exactly what the Send Design brief
   forbids, and a good illustration of why: the value is environment-specific and will
   be wrong in the other account. Send Design takes its folder from a script parameter.
3. **Hard-coded business constants** — `info@nu-heat.co.uk`, `01404 540604`,
   `'Your Account Manager'`, a GTM container ID, a brand palette. Fine as a fallback
   identity, awkward when the fallback fires silently.
4. **DOM/model divergence on the email fields** — detail in (d). The one most likely to
   produce a support call.
5. **Contact options keyed on email** — detail in (d).
6. **Dead branch after `||` in the sender derivation** — detail in (c). Cosmetic.
7. **`runtime` is imported but unused** in `nuheat_opportunity_ue.js`. Harmless.
8. **Defensive `try/catch` around `getValue` for custom body fields**
   (`custbody_opp_site_adress`, `custbody_sales_rep_phone`) with a comment saying the
   field "may not exist on all environments". Reasonable given two accounts, but it
   means a renamed field degrades to blank rather than erroring. If Send Design does
   the same for `custbody_pe` or `custbody_value_proposition`, log the miss loudly —
   a design email with no value proposition is not a design email.
9. **`custbody_opp_site_adress` is misspelled** ("adress") — and that is the real field
   ID in NetSuite. Do not correct it.

---

## Part 2 — The attachment spike

Answered from NetSuite documentation. Two standing caveats:

- **No account access.** Nothing here has been verified against a live NetSuite
  instance. Anything marked *open question* must be tested in Sandbox before the
  design depends on it.
- **Documentation access was partial.** `docs.oracle.com` is blocked by this
  environment's network egress proxy, so the Oracle Help Center pages could not be
  opened directly. The findings below are drawn from search-engine extracts of those
  pages plus secondary sources; the canonical URLs are cited so the client can
  confirm each statement against the page itself. Where a claim rests only on a
  secondary or community source, it says so.

### Q1 — Can a file from `context.request.files.<fieldId>` go straight into `email.send`'s `attachments` array, or must it be saved to the File Cabinet first?

**Resolved by decision, not by documentation. Saving to the File Cabinet is approved,
so the question no longer gates the design.** Recorded here for completeness.

What the documentation says:

- `ServerRequest.files` returns the uploaded file as a **`file.File` object**, keyed by
  field ID — `request.files['custpage_file']`
  ([ServerRequest.files](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4567654371.html)).
- `email.send`'s `options.attachments` is typed **`file.File[]`**
  ([N/email Module](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4358681681.html)).
  The two types nominally match.
- The N/file overview says the module can send files as attachments "without uploading
  them to the File Cabinet"
  ([N/file Module](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4205693274.html)) —
  but that is written about files built in memory with `file.create()`, and **no
  documentation was found extending it to a file that arrived via `request.files`**.
  Every official attachment example loads from the File Cabinet first; community reports
  say the unsaved object raises
  `Wrong parameter type: options.attachments is expected as file.File[].`

**The design saves first regardless**, which moots it:

1. Read the file from `context.request.files.<fieldId>`.
2. Set `.folder` to the target folder — **from a script parameter**, never a hard-coded
   internal ID. (`nuheat_master_proposal.js` hard-codes `FOLDER_ID = 26895192`; that is
   the anti-pattern, not the pattern.)
3. `.save()`, keep the returned ID.
4. `file.load({ id: ... })` and put the loaded objects in `attachments`.

This is also the better design on its own merits: the drawings become a durable record
of exactly what was sent, which is the point of moving off the central mailbox, and it
matches what the native email already does today.

Two decisions still sit with the client:

- **Retention.** Are the saved drawings kept indefinitely, or deleted after a successful
  send? Keeping them is the assumption unless told otherwise.
- **Failure handling.** If the save succeeds and `email.send` then fails, are the
  orphaned files removed or left? The Send Quote send is already wrapped in a try/catch
  that reports failure on the result page (see Part 1c), so the hook exists either way.
### Q2 — Maximum file size: Suitelet FILE field, and `email.send` total

**The email limits are documented and firm:**

- **Each individual attachment: 10 MB maximum.**
- **Total message size including all attachments: 15 MB maximum.**

Both apply to `email.send()` and `email.sendBulk()`
([N/email Module](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4358681681.html),
[Size Limits for Emails and Attachments](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_7130136991.html)).
Note that attachments are encoded for transmission and so consume **more** than their
on-disk size against that 15 MB ceiling — budget for roughly a third of headroom
rather than assuming 15 MB of files will fit.

**The File Cabinet / SuiteScript side:**

- Files created or saved through SuiteScript are limited to **10 MB**; exceeding it
  raises `SSS_FILE_CONTENT_SIZE_EXCEEDED`.
- Methods that load content into memory, such as `File.getContents()`, carry the same
  **10 MB** in-memory limit. This limit is documented as not applying when content is
  streamed, as in `File.save()`
  ([N/file Module](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4205693274.html)).

**The Suitelet FILE field limit specifically: not found in documentation.** No Oracle
page was located stating a maximum upload size for a Suitelet `FILE` field. In
practice the binding constraint is the 10 MB SuiteScript file limit on the save, and
then the 10 MB per-attachment limit on the send — so **10 MB per drawing** is the
number to design to, whatever the field itself would accept.

**Open question for the client:** what do the CAD drawing PDFs actually weigh? This
is the single number that decides the shape of the feature:

- **Typical drawing well under 10 MB, two or three per email, comfortably under
  15 MB total** — attach directly. Simplest design, do that.
- **Drawings routinely approaching 10 MB, or several summing past 15 MB** — attaching
  cannot work reliably and the design changes: upload to the File Cabinet, attach the
  files to the Opportunity, and put **links** in the email rather than attachments.
  This is, incidentally, what Send Quote already does with the hosted proposal, so
  there would be a precedent to follow.

A sample of ten real drawings with their file sizes would answer this in minutes and
is worth having before Phase 1 is briefed.

**"It works by hand today" does not prove it works in script.** The native Communication
tab upload and the File Cabinet browser upload do not go through `file.save()` or
`File.getContents()`, and so are not subject to the 10 MB SuiteScript ceiling. A drawing
that attaches perfectly well by hand today can fail in the Suitelet with
`SSS_FILE_CONTENT_SIZE_EXCEEDED` for no reason the user can see. This is the single
most likely way for Phase 1 to look finished and then fail in production, which is why
real attachment sizes are still needed from the client.

### Q3 — How are multiple files accepted?

**Confirmed: a NetSuite `FILE` field holds exactly one file.** Native file fields
permit single-file uploads only, and `FILE` fields are not supported on sublists at
all — so a dynamic "add another row" list of uploads is not available through the
standard form API.

There is a documented-adjacent complication worth flagging: at least one secondary
source states that **NetSuite will not parse multipart form data containing multiple
files in a single Suitelet request**. If that is true of NetSuite-rendered Suitelet
forms, then even several `FILE` fields on one form would yield only one file per POST,
and the whole approach changes. However, the same source elsewhere recommends
multiple `FILE` fields "for small, predictable scenarios", which contradicts that
reading — the limitation is most likely about hand-rolled multipart POSTs from
external clients, not about a form NetSuite built and posted to itself.

**This contradiction could not be resolved from documentation, and it is the single
most important thing to test.** A throwaway Sandbox Suitelet with three `FILE` fields
that logs how many arrive in `request.files` resolves it in under an hour, and it
should be done before Phase 1 is briefed, because the answer determines whether the
feature is buildable in its intended form.

Assuming multiple `FILE` fields do work, on a sensible fixed number:

**Four fields is the recommendation.** The reasoning: at 10 MB per attachment against
a 15 MB total, no more than three or four files of realistic drawing size can be sent
at once in any case, so more fields would be fields that can never all be used. Four
covers the common cases without making the form look like a filing cabinet. Fields
beyond the first should be optional, and empty ones skipped silently.

Better mechanisms, and why none is recommended for Phase 1:

- **Custom HTML with a `multiple` file input and drag-and-drop**, built via
  `form.addField({type: INLINEHTML})` with a client script doing the upload. Gives
  the nicest user experience and no fixed limit. Costs: hand-rolled markup and upload
  handling, browser compatibility surface, and it abandons the Send Quote form
  patterns that Part 1 exists to harvest. Not worth it for a first release.
- **Base64 into a LONGTEXT field**, encoding client-side and decoding with
  `file.create()`. Sidesteps multipart parsing entirely and is the documented
  workaround where multipart is the problem. Costs: base64 inflates payload by ~33%
  against already-tight limits, and it needs real client-side code. Keep this in
  reserve — it is the fallback if the Sandbox test shows multiple `FILE` fields do
  not work.
- ~~Pick from files already attached to the Opportunity.~~ **Ruled out.** The Phase 0
  brief raised this as a possible way round the upload problem entirely. The client has
  since confirmed the drawings are **not** in the File Cabinet — users attach them from
  a desktop or network drive at send time — so there is nothing to pick from, and the
  upload path is unavoidable. This is why the multiple-`FILE`-field question above still
  has to be answered rather than designed around.

---

## Open questions for the client — consolidated

Phase 0 resolved most of the original list. What remains:

**Blocking Phase 1 design**

1. **Real attachment sizes.** How large are typical CAD drawing PDFs, and how many go
   out at once? Ten real examples with their file sizes is enough. This decides whether
   Send Design attaches or links, and it is not answered by "it works by hand today" —
   see Q2.
2. **Sandbox test: do multiple `FILE` fields on one Suitelet form all arrive in
   `request.files`?** A throwaway Suitelet with three `FILE` fields that logs the keys
   it receives. If they do not, the design falls back to base64 (Q3) and Phase 1 is a
   materially bigger job.

**Answerable at any point before Phase 1 ships**

3. Is there a **project-engineer phone override field** on the Opportunity, equivalent
   to `custbody_sales_rep_phone` for the sales rep? If not, the PE's phone comes from
   the Employee record's `phone` and nothing else.
4. Which **folder** do uploaded drawings go to? The value arrives as a script parameter;
   the client supplies the folder, not the ID in source.
5. **Retention** — are saved drawings kept after a successful send, or deleted?
6. **Orphan handling** — if the save succeeds and the send then fails, remove the saved
   files or leave them?
7. Should the Send Design button appear in **EDIT** mode? Send Quote's does, and it
   reads saved state, so unsaved edits are silently ignored (Part 1a).
8. Does this repository represent **Sandbox or Production**? Still outstanding from
   Phase 0, and it needs settling before any environment-specific value is committed.

**Resolved since the Phase 0 brief**

- Saving uploads to the File Cabinet is **approved**, which removes the risk in Q1.
- The drawings are **not** already in the File Cabinet, so the upload path is real.
- All of Part 1 — the reference source arrived and is committed under `reference/`.

---
## Sources

- [N/email Module](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4358681681.html)
- [Size Limits for Emails and Attachments](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_7130136991.html)
- [N/file Module](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4205693274.html)
- [ServerRequest.files](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4567654371.html)
- [Send an Email with an Attachment](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_0110070601.html)
- [Attaching Files to an Email](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4148832559.html)
- [Attaching Files to Email Messages](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N514371.html)
- [Emailing Transactions](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N513303.html)
- [SuiteScript 2.1 Suitelet Script Type](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4387799600.html)
- [How to Upload Multiple Files in a NetSuite Suitelet — Suite Insider](https://suiteinsider.com/how-to-upload-multiple-files-in-a-netsuite-suitelet-best-practices-and-techniques/) (secondary)
- [NetSuite Professionals — attachments expected as file.File[]](https://netsuiteprofessionals.com/blog/answer/re-netsuite-ss-2-0-attach-file-object-to-email-being-sent-keeps-getting-error-wrong-parameter-type-options-attachments-is-expected-as-file-file/) (community)
