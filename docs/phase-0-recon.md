# NS-Design-Email — Phase 0: reconnaissance and attachment spike

Status: **Part 1 blocked (source files not supplied). Part 2 answered from documentation.**
Date: 2026-09-16
Nothing has been built. No implementation code exists in this repo.

---

## Repository state

This repository was empty at the start of Phase 0 — no commits, no branches on the
remote. The Send Quote precedent files referenced in the brief are not present:

- `nuheat_send_quote_sl.js` (v1.7.0, `customscript_nuheat_send_quote_sl`)
- `nuheat_send_quote_cs.js` (v1.4.0, loaded via `form.clientScriptModulePath`)
- `nuheat_master_proposal.js`
- `nuheat_bus_grant.js`
- `nuheat_vat_rates.js`

They live in the File Cabinet under `SuiteScripts/NuHeat/`, to which this session has
no access. No other repository was consulted; `NS-Opportunity-SO-Sync` and
`NS-Work-Instructions-Setter` were not touched.

---

## Part 1 — Reconnaissance: BLOCKED

Every question in Part 1 (a–d) asks what specific existing code does. None of it can
be answered without reading that code, and answering from general NetSuite knowledge
would produce exactly the kind of plausible-but-wrong brief this phase exists to
prevent. Reporting the block rather than guessing.

### What is needed to answer each question

| Q | Question | File(s) required |
|---|---|---|
| a | How the Suitelet is reached from the opportunity — the user event script that adds the button, its script ID, deployment ID, and how it builds the URL | The **user event script deployed to Opportunity** that adds the Send Quote button. Not named in the brief and not in this repo. Likely `SuiteScripts/NuHeat/nuheat_*_ue.js`; a File Cabinet listing of `SuiteScripts/NuHeat/` would identify it. |
| b | How `loadOpportunityData()` resolves the sales rep — which field, and what it returns (id, name, email, phone) | `nuheat_master_proposal.js` |
| c | The exact `email.send` call shape including `relatedRecords`, and how the message reaches the Communication tab | `nuheat_send_quote_sl.js` |
| d | Which form-building parts are reusable — contact dropdown, To/CC/BCC hidden-field pattern, `parseEmails`, `validateEmailField` | `nuheat_send_quote_sl.js` and `nuheat_send_quote_cs.js` |

### Request to the client

Please supply, in order of value:

1. **`nuheat_send_quote_sl.js`** — answers c and most of d. Highest value single file.
2. **`nuheat_send_quote_cs.js`** — the client-side half of d (`parseEmails`,
   `validateEmailField`, the hidden-field marshalling, the submit path).
3. **The Opportunity user event script that adds the Send Quote button** — answers a
   in full. If its filename is not known, a listing of `SuiteScripts/NuHeat/` will
   identify it.
4. **`nuheat_master_proposal.js`** — answers b.

`nuheat_bus_grant.js` and `nuheat_vat_rates.js` are quote-pricing concerns and are
very unlikely to be relevant to a design email. Not requested for now.

Also useful, and not derivable from source:

- The **script ID and deployment ID** of the user event script, as recorded in
  NetSuite (Customization > Scripting > Scripts). Source gives the file, not the
  deployment.
- Confirmation of **which environment** this repository is to represent (Sandbox or
  Production), so environment-specific values are handled correctly from the start.

Once these are in, Part 1 can be answered properly and Phase 1 briefed.

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

**Answer: not established by documentation. Design on the assumption that it must be
saved, and treat "attach unsaved" as a Sandbox experiment, not a foundation.**

What the documentation does say:

- `ServerRequest.files` returns the uploaded file as a **`file.File` object**, keyed
  by field ID — `request.files['custpage_file']`
  ([ServerRequest.files](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4567654371.html)).
- `email.send`'s `options.attachments` is typed **`file.File[]`**
  ([N/email Module](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4358681681.html)).
  So the two types nominally match.
- The N/file module overview states the module can be used to "send files as
  attachments **without uploading them to the File Cabinet**"
  ([N/file Module](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4205693274.html)).

Why that is not enough to build on:

- That "without uploading" statement is written about files built in memory with
  `file.create()`. **No documentation was found that says it holds for a `file.File`
  that arrived via `request.files`.** The two are not obviously the same object
  state — the request-borne file is unsaved and has no `folder` set.
- Every official example of attaching to an email goes `file.load({id: ...})` →
  `attachments`, i.e. from a file that already exists in the File Cabinet
  ([Send an Email with an Attachment](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_0110070601.html),
  [Attaching Files to an Email](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4148832559.html)).
- Every Suitelet upload example goes `request.files.<id>` → set `.folder` →
  `.save()`. Community discussion reports that attaching an unsaved request file
  raises `Wrong parameter type: options.attachments is expected as file.File[].`, and
  the commonly recommended workaround is to save, send, then delete
  ([NetSuite Professionals](https://netsuiteprofessionals.com/blog/answer/re-netsuite-ss-2-0-attach-file-object-to-email-being-sent-keeps-getting-error-wrong-parameter-type-options-attachments-is-expected-as-file-file/)).
  This is community evidence, not documentation, and it is not conclusive — but it
  points the same way.

**Open question for the client:** does `email.send` accept an unsaved
`request.files` object in this account? A five-line Sandbox Suitelet settles it.

**Recommendation regardless of the answer: save to the File Cabinet anyway.** Even if
the unsaved path works, saving is the better design here:

- The CAD drawings become attachments on the Opportunity, so there is a record of
  exactly what was sent — which is the point of moving off the central mailbox.
- The sent message on the Communication tab can reference real files.
- Re-send and audit become possible.

The cost is File Cabinet growth and a folder to put them in — a script parameter for
the target folder, per house rules, never a hard-coded internal ID. Whether files are
retained or deleted after send is a client decision, not a technical one.

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
- **Pick from files already attached to the Opportunity.** If drawings are already
  being filed against the record by another process, a multi-select of existing files
  is strictly better than uploading: no size limit on selection, no duplication, and
  a much simpler Suitelet. Worth asking the client whether that is how drawings
  already arrive — it may remove the upload problem entirely.

---

## Open questions for the client — consolidated

1. Supply `nuheat_send_quote_sl.js`, `nuheat_send_quote_cs.js`, the Opportunity user
   event script that adds the Send Quote button, and `nuheat_master_proposal.js`.
2. The script ID and deployment ID of that user event script as recorded in NetSuite.
3. Does this repository represent Sandbox or Production?
4. What do real CAD drawing PDFs weigh, and how many are typically sent at once?
5. Sandbox test: do multiple `FILE` fields on one Suitelet form all arrive in
   `request.files`?
6. Sandbox test: does `email.send` accept an unsaved `request.files` object in
   `attachments`?
7. Are drawings already attached to the Opportunity record by some other process? If
   so, selecting existing files may beat uploading.
8. Should uploaded drawings be retained in the File Cabinet after sending, or deleted?
   If retained, which folder — the value will be supplied as a script parameter.

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
