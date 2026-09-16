# Phase 1 — Send Design implementation

Status: **code complete and tested in Sandbox**, where the client reports it behaves as
expected. Not merged, and not deployed to Production.

Decisions this implements are recorded in `docs/phase-0-recon.md`. Where the code and
that document disagree, the document is the intent and the code is the defect.

---

## Files

| File | Version | Purpose |
|---|---|---|
| `lib/dsn_lib_config.js` | 1.0.0 | Constants, script parameter accessors, shared helpers |
| `dsn_email_template.js` | 1.0.0 | Template 3334's HTML with `{{MERGE_TAG}}` substitution |
| `dsn_ue_opportunity.js` | 1.0.0 | `beforeLoad`, adds the Send Design button |
| `dsn_cs_opportunity.js` | 1.0.0 | Opens the Suitelet. No script record |
| `dsn_sl_send_design.js` | 1.0.0 | The form and the send |
| `dsn_cs_send_design.js` | 1.0.0 | **Added beyond the brief** — see below. No script record |

`node --check` passes on all six. No arrow functions, no `let`/`const`, no template
literals, no `Array.prototype.includes`, no `log.warn`, and no `safeLog`-style helper
that would discard a level silently. No numeric internal IDs appear in any of them.

### File Cabinet layout

Relative module paths resolve against the requiring file's own folder, so the layout is
not optional:

```
<Send Design folder>/
    dsn_ue_opportunity.js
    dsn_cs_opportunity.js
    dsn_sl_send_design.js
    dsn_cs_send_design.js
    dsn_email_template.js
    lib/
        dsn_lib_config.js
```

The four `dsn_*` scripts load `./lib/dsn_lib_config`; the Suitelet also loads
`./dsn_email_template`. Nothing loads anything from the 2026 Quote folder.

### Helper lineage

`escapeHtml`, `parseEmails` and `validateEmailField` are **copied** from
`nuheat_send_quote_sl.js` / `nuheat_send_quote_cs.js` into `lib/dsn_lib_config.js`, not
referenced — these scripts sit in their own folder and cannot `./` import the 2026 Quote
modules. The headers record the origin. They are now this project's to maintain: changes
here do not reach Send Quote, and changes there do not reach here.

---

## The extra file, and why

**`dsn_cs_send_design.js` is not in the brief's file list.** Two required behaviours
cannot be built without a client script on the Suitelet form:

1. **The Cancel button.** `form.addButton` takes a `functionName`, which NetSuite
   resolves against the form's client script. A Cancel button with no client script has
   nothing to call.
2. **"Selecting a contact populates To."** That is client-side by definition.

The only alternative is an inline `<script>` writing to the DOM — which is the precise
pattern the Phase 0 decisions rejected for Send Quote. So the client script is the
conservative choice, not an expansion of scope.

It is kept to those two jobs and **does no validation**. Every check runs server-side on
POST against what was actually submitted, so nothing here can be bypassed to reach
`email.send` — because nothing here is what guards it. It is loaded via
`form.clientScriptModulePath`, has no script record, and its header claims neither a
script ID nor a deployment ID.

The contact dropdown is keyed on **contact internal ID**. The address is looked up from
a hidden `LONGTEXT` field carrying a JSON map of id → email, which the client script
reads with `rec.getValue` and applies with `rec.setValue`. That is not the rejected
pattern: there is no hidden mirror of a visible input and no DOM write, so the record
model stays the single source of truth. A contact with no email leaves To **unchanged** —
never cleared, never set to an empty string.

---

## Script parameter failure modes

The test applied to each: **ask what empty means.** If empty makes the script do less,
fail closed. If empty removes a restriction, throw.

### `custscript_dsn_qualifying_statuses` → **fail closed**

On `customscript_dsn_ue_opportunity`. Empty makes the script do *less*: no status
qualifies, so the button never appears. Nobody sends an email they should not have. The
failure is visible — a user reports a missing button within a day, and the fix is a field
edit.

Throwing would be worse than the disease. This runs in `beforeLoad`, so a throw risks
interfering with **viewing the Opportunity at all**, which is a far larger failure than a
missing button. Logged at `audit` so an empty parameter is discoverable in the execution
log rather than presenting as "the button has vanished" with no explanation.

### `custscript_dsn_salesrep_default_props` → **fail closed**

On `customscript_dsn_sl_send_design`. Empty makes the script do *less*: nothing matches,
so the default falls through to the project engineer everywhere.

The key point is that this produces a wrong **default**, not a wrong **send**. The chosen
sender is displayed on the form in a mandatory field and the user can change it before
submitting. A visible, correctable default does not justify blocking the feature. Also
logged at `audit`.

### `custscript_dsn_attachment_folder` → **throw**

On `customscript_dsn_sl_send_design`. Empty does **not** make the script do less — it
removes the restriction that saved drawings land in one known, controlled folder.
Customer drawings would either fail with a raw NetSuite error the user cannot act on, or
be written somewhere nobody is looking.

Unlike the other two there is no safe reduced behaviour to fall back to: the entire point
of the step is that the file goes to a specific place. The accessor throws, naming the
parameter and the script record.

It is called **at the top of `onRequest`, on GET as well as POST**, so the failure
surfaces before the user has chosen a sender and attached five drawings — not after.

---

## File naming scheme

The File Cabinet requires unique names within a folder, and two Opportunities will both
send `Drawing1.pdf`. Every saved file is renamed:

```
<tranid>_<YYYYMMDD-HHMMSS>_<n>_<sanitised original name>

OPP1234_20260916-142530_1_Ground_Floor.pdf
```

- **`tranid`** scopes the file to its Opportunity, and makes the folder browsable by eye.
- **timestamp** separates one send from the next, including a resend of the same drawing
  after a redraw — the case the no-sub-status decision exists to support.
- **`n`** is the attachment field position, separating two files in a *single* send that
  happen to share a name.
- **sanitised original name** keeps the file recognisable to the person who sent it.

Sanitising reduces each part to `A-Za-z0-9._-`, collapses runs of dots to one and strips
leading and trailing dots and underscores, so `Plan /../ v2 (final) 50%.pdf` becomes
`Plan_._v2_final_50.pdf`. The File Cabinet treats the name as a name rather than a path,
so this is tidiness rather than a security boundary — but a saved drawing called
`Plan_.._v2.pdf` invites a question nobody should have to answer. The original portion is
truncated to 120 characters, keeping the whole name well inside the File Cabinet's limit.

The original name is preserved in the success page and the audit log, so the mapping from
"what I attached" to "what got saved" is never lost.

---

## Order of operations on POST

Deliberate, because it determines what is left behind when something fails:

1. Resolve the attachment folder (throws if unset).
2. Re-resolve the Opportunity and its sender candidates **from the record**. The form
   posts a candidate key (`salesrep` / `pe` / `user`), never an employee ID, so a
   tampered or stale POST cannot author an email as an arbitrary employee.
3. Collect the present `FILE` fields.
4. **Validate everything** — sender resolved, To present and valid, CC and BCC valid if
   present, at least one attachment, and every file within 10 MB. All failures are
   collected and shown together rather than one per attempt.
5. Only then save, load, and send.

So an invalid address or an oversized drawing **never leaves a file behind in the File
Cabinet**. Size is read from the unsaved `request.files` object, which the spike confirmed
is populated (`docs/phase-0-recon.md`, Part 2 Q3).

**One consequence worth stating:** when validation fails the form re-renders with the
sender and the To/CC/BCC values restored, but **the file selections cannot be restored** —
no browser allows it. The error banner says so explicitly. This is a real friction point
and the reason validation collects all errors at once rather than surfacing them one at a
time.

---

## Notes on specific decisions in the code

- **Sender preference order.** The brief gives four rules but not the case where the value
  proposition prefers the sales rep and no sales rep is set. It is expressed as a
  preference order — `[salesrep, pe, user]` or `[pe, salesrep, user]` — so that case has a
  defined answer (project engineer, then current user) instead of falling off the end.
- **The same employee as both rep and PE** appears twice in the dropdown. That is
  deliberate: the two entries differ in role label and in the address printed in the body
  (shared design mailbox versus their own), so they are genuinely different choices.
- **A failed employee load drops that candidate** and logs at `log.error`. It is never
  swallowed and never replaced with a branded fallback. `nuheat_master_proposal.js` logs
  the same condition through `safeLog('warn')`, which is discarded because `log.warn` does
  not exist, and then sends anyway as "Your Account Manager" on the switchboard number.
- **An unreadable file size is allowed through**, with an `audit` log. `file.save()`
  enforces the real limit regardless, and refusing a drawing whose size merely could not be
  *measured* would block legitimate sends. The spike confirmed size is populated, so this
  guards against future change rather than the expected path.
- **`{{PROJECT_REF}}` is escaped two ways.** In body text it is HTML-escaped; inside the
  two CONFIRM DRAWINGS `mailto:` subjects it is percent-encoded, because a reference like
  `OPP123 - 12 High St & Co` contains spaces and `&`, either of which breaks a `mailto`
  href that has only been HTML-escaped. The template exposes `{{PROJECT_REF_URL}}` for
  those two occurrences.
- **The phone clause is removed before substitution**, not substituted with an empty
  string, so no `via design@nu-heat.co.uk or .` can be produced. If the markup is ever
  edited so the clause no longer matches, `buildBody` **throws** rather than shipping a
  malformed sentence.

---

## Verification performed

`node --check` on all six files. Beyond that, a harness under the session scratchpad
stubbed the NetSuite modules and exercised the real code: **52 assertions, all passing**
(10 on the user event, 42 on the Suitelet and template). It covers every one of the
eighteen scenarios below, including that nothing is saved when a send is refused, that the
PE's own address never appears in the body, and that the footer reads correctly with the
phone clause dropped.

**The harness was never a substitute for Sandbox.** It proves the logic; it cannot prove
anything about how NetSuite actually behaves — `form.addButton`, `FILE` field parsing,
`file.save()`, `email.send` and `relatedRecords` were all stubs. One bug it did find and
which is fixed: `..` surviving filename sanitisation.

**Sandbox has since confirmed the feature behaves as expected.** That confirmation is the
client's, covering the feature as a whole rather than a signed-off row-by-row result, so
the table below is kept as the scenario list it always was — useful again on the next
change to these scripts, and the place to record per-row results if they are ever needed.

---

## Test scenarios

| # | Scenario | Expected |
|---|---|---|
| 1 | Opportunity not Won | No button |
| 2 | Won, EDIT mode | No button |
| 3 | Won, VIEW mode | Button appears |
| 4 | Value proposition 1, PE set | Defaults to sales rep |
| 5 | Value proposition 3, PE set | Defaults to project engineer |
| 6 | Value proposition 3, PE blank | Defaults to sales rep |
| 7 | Sales rep and PE both blank | Defaults to current user, **and the form says why** |
| 8 | User overrides the default | Email authored by the chosen sender |
| 9 | PE sender | Body shows `design@nu-heat.co.uk`, the PE's name and officephone |
| 10 | Sales rep sender | Body shows their own email and officephone |
| 11 | Sender with blank officephone | Phone clause dropped, sentence still reads correctly |
| 12 | No attachment | Refused, nothing sent |
| 13 | One file over 10 MB | Refused by name, nothing saved, nothing sent |
| 14 | Three attachments | All three saved and attached |
| 15 | Two Opportunities sending identical file names | Both save without collision |
| 16 | Invalid To address | Refused before any file is saved |
| 17 | Contact with no email selected | To unchanged, not cleared or corrupted |
| 18 | Successful send | Message appears on the Opportunity's Communication tab |

Worth adding to the list when Sandbox time allows:

- **Five attachments** (the maximum), to confirm the spike's three-field result holds at
  five.
- **A send with CC and BCC populated**, confirming BCC is genuinely blind and that the
  message on the Communication tab records what was expected.
- **A resend of the same drawings on the same Opportunity**, which is the workflow the
  no-sub-status decision exists to support, and the case the timestamp in the file name is
  there to handle.

---

## Open items

1. **The email subject is not specified in the brief.** The code uses
   `'Your installation drawings - ' + projectRef`. Template 3334's own subject was not
   supplied with the HTML; if it differs, this is a one-line change.
2. **`{{PROJECT_REF}}` is assumed to be the Opportunity's `tranid`**, falling back to
   `title`. The retired `custrecord_cad_opportunity` held a link to the Opportunity, so
   the tranid is the closest equivalent — but what it *displayed* is worth confirming
   against a real sent email before go-live.
3. **Retention and orphan handling are still undecided** (Phase 0 open questions 4 and 5).
   The code currently keeps every saved drawing, including after a failed `email.send`.
   Since validation happens before saving, the only way to orphan files is a genuine send
   failure, which the user sees.
4. **The spike is gone.** Its findings are recorded in `docs/phase-0-recon.md`, Part 2
   Q3 — that is now the only record of them, since the documentation is silent on every
   one. The client has removed the deployed script from Sandbox.
