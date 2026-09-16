# Phase 2 — documents as links

*(Phase 2a — form layout and email presentation — is recorded at the end of this
document.)*

Status: **code complete, not tested in NetSuite.** Nothing is deployed and nothing is
merged. Verification is `node --check` plus the stubbed harness (below). **One question
could not be settled from documentation and needs a Sandbox check before go-live — see
Step 1 (b).**

Phase 1 behaviour that does not change: sender resolution, button visibility, the
employee-record contact details, the template mechanics, and the **10 MB per-file check**.

---

## Files changed

| File | Version | Change |
|---|---|---|
| `lib/dsn_lib_config.js` | 1.0.0 → **1.1.0** | Category list script ID, 15 MB message ceiling, `buildPublicFileUrl` |
| `dsn_email_template.js` | 1.0.0 → **1.1.0** | `{{DOCUMENT_LINKS}}`, `{{INTRO_COPY}}`, `buildDocumentLinks` |
| `dsn_sl_send_design.js` | 1.0.0 → **1.1.0** | Category/label fields, publish step, conditional size rules, links on the success page |
| `dsn_cs_send_design.js` | 1.0.0 → **1.1.0** | Pre-fills the label from the category |

Unchanged: `dsn_ue_opportunity.js`, `dsn_cs_opportunity.js`.

`node --check` passes on all six files. House style holds throughout: no arrow functions,
`let`/`const`, template literals, `Array.prototype.includes`, or `log.warn`. No numeric
internal IDs.

---

## Step 1 — what the documentation does and does not settle

### (a) Making a file available without login — **settled**

`File.isOnline` is the property, and it is documented as *"the Available Without Login
status of a file. If set to true, users can download the file outside of a current
NetSuite login session"*
([File.isOnline](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4229270451.html)).

The Help Center's own worked example, *Create a File, Set Property Values, and Save It to
the File Cabinet*, sets `isOnline` and `folder` on the file object and **then** calls
`save()`
([article_0110070044](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_0110070044.html)),
so setting it before the save is the documented pattern.

One thing that would otherwise bite: **by default, files uploaded through SuiteScript are
available only with login, regardless of which folder they are saved in.** Marking the
folder is not enough; the property has to be set on the file
([Setting Available Without Login](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/chapter_N2997713.html)).

**What the code does.** It sets `isOnline = true` before `save()`, then reloads the saved
file and checks. If the reloaded file reports `isOnline` false, it sets the property and
saves again, logging at `audit` that it had to. Under the documented reading that branch
never runs. If the documented reading turns out not to hold in this account, the link
still works — and the log says which is true, turning an assumption into an observation.

### (b) What `File.url` returns — **NOT settled. This needs a Sandbox check.**

`File.url` exists and is documented
([File.url](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4229268651.html)),
and the Help Center shows it being read and logged — but **none of the documentation
reachable from this environment states whether the value is relative or absolute.**
`docs.oracle.com` is blocked by the network egress proxy here, so only search extracts
were available, and they do not answer it. It is not an assumption worth building on
quietly.

What *is* settled is the other half: **`url.resolveDomain` returns a bare host name with
no scheme**, and `hostType: url.HostType.APPLICATION` is the correct value for UI access,
returning `<accountID>.app.netsuite.com`
([url.resolveDomain](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4861456597.html)).
So `'https://' + url.resolveDomain({ hostType: url.HostType.APPLICATION })` is the right
prefix if one is needed.

**What the code does instead of guessing.** `config.buildPublicFileUrl` handles both
answers: a value already starting with `http://` or `https://` is returned unchanged;
anything else gets the scheme and domain prefixed. This is correct whichever way the
question resolves, and needs no change once it is known.

**The smallest Sandbox test that settles it** — the same shape as the multipart spike:

> A Suitelet that saves a one-line text file with `isOnline = true`, reloads it, and
> writes `fileObj.url` to the page and to `log.audit`. One run. If the value starts with
> `https://` it is absolute; if it starts with `/` it is relative. Then paste the URL that
> `buildPublicFileUrl` produced into a private browsing window with no NetSuite session
> and confirm the file opens.

That second half also answers (c), below.

### (c) Whether the file is then immediately reachable — **partly settled, and there is a live risk**

Documentation says files are available only to logged-in users *"except for files that
have the Available without Login option enabled on the File Cabinet record"*
([Permissions and File Cabinet Files](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4799276714.html)),
which implies the flag is sufficient and nothing else is needed. No documentation was
found stating a further step for an ordinary File Cabinet file. (The "Available for
SuiteBundles" flag and descriptive URLs are a different mechanism, for bundled files.)

**However, this is an actively changing area of NetSuite and it is worth the client
knowing before go-live.** Two changes surfaced:

- **2024.2 changed external URL formats**, with the `h` parameter replaced by `ns-at`
  carrying a different value, old URLs redirecting until the account is upgraded
  ([NetSuite Insights](https://netsuite.smash-ict.com/breaking-changes-to-external-suitelet-urls/),
  [ScaleNorth](https://scalenorth.com/insights/changes-external-suitelet-urls)).
- **2025.1 split roles into internal and external**, reportedly removing the "Online Form
  User" role that "Available Without Login" relied on for Suitelets, with external URLs
  returning "You do not have privileges to view this page"
  ([NetSuite Professionals](https://archive.netsuiteprofessionals.com/t/27164314/netsuite-2025-1-splits-roles-into-internal-and-external-it-a)).

Both reports concern **Suitelet** external URLs rather than File Cabinet files, and both
are secondary sources rather than documentation. They may not touch this feature at all.
But the entire value of Phase 2 rests on a link working for someone with no NetSuite
login, so the no-session test above is not a nicety — it is the acceptance test for the
whole phase, and it is worth repeating after any NetSuite version upgrade.

---

## Step 2 — the category list

Referenced as `customlist_dsn_link_category`, by script ID, in `lib/dsn_lib_config.js`.
Nothing in the code knows any of its values. The client creates it with *Design drawings*,
*Installation information* and *Useful information*, and can add to it later without a
deployment — which is the point of it being a list.

The dropdown is `source`d from it, so the form picks up new values automatically. The
server reads a chosen value's display name with `search.lookupFields` against the same
script ID, for the label fallback.

---

## Step 3 — the form

Per slot: the existing `FILE` field, a category `SELECT` sourced from the list, and a
`TEXT` field for the button label.

The client script fills the label from the category's **display text** when the category
changes — `getText`, not `getValue`, which would put a number on the button. The user then
edits it freely. One editable field rather than a category plus a suffix, so there are no
joining rules and nothing ambiguous about what the customer ends up reading.

Changing the category **overwrites** an existing label, on the grounds that changing the
category is deliberate and the old label is usually now wrong. Clearing the category
leaves the label alone.

**No document can produce an unlabelled button.** At submit: the user's text wins; if it
is empty the category name is used; if that is empty too the send is refused, naming the
slot and the file. A yellow button with nothing written on it tells the customer nothing
and looks broken.

**The checkbox** — "Also attach the files to the email", default **unticked**. Ticking it
attaches as well as links, and reinstates the 15 MB total. The refusal message says
explicitly that the limit applies *because* the box is ticked, and that unticking it is
the fix — otherwise the user is left staring at a limit they did not know they had opted
into.

---

## Step 4 — publish and link

After each file is saved to the attachment folder it is reloaded, published, and its URL
captured. **Reloading is not optional**: `File.url` depends on the internal ID and hash,
neither of which exists until the save has happened.

Each URL is logged at `audit` next to the original name, the saved name and the label, so
a customer reporting a dead link can be traced to the exact file that was sent without
guessing which send it came from.

### The naming scheme is now load-bearing, and needed strengthening

Phase 1's scheme stays — tranid, timestamp, index, sanitised original — and Step 4 is
right that it is now doing a second job. Two changes were needed to make it actually carry
that weight:

1. **The timestamp now includes milliseconds.** With second granularity, two sends from
   the same Opportunity inside one second produced identical names.
2. **The name is checked against the folder before saving**, appending `_2`, `_3` and so
   on until one is free.

The reason both were needed: **saving a file whose name already exists in the folder
overwrites it rather than failing.** So a clash would not surface as an error — it would
silently re-point a link already sitting in an earlier customer's inbox at a later
customer's drawing. That is precisely the failure Step 4 says the scheme exists to
prevent, and milliseconds alone reduce the odds without closing the hole. One search per
file is cheap insurance against a silent, undetectable, customer-visible fault.

A failed uniqueness search does not block the send: it logs at `error` and uses the
preferred name. Refusing an ordinary send because a search glitched is the larger risk.

---

## Step 5 — the template

`{{DOCUMENT_LINKS}}` sits immediately after the opening paragraph. Each document renders
as a CTA button copied from the CONFIRM DRAWINGS button in the same template, **including
its MSO conditional pair** — `<!--[if !mso]><!-- -->` … `<!--<![endif]-->` around the
anchor-wrapped table, then a `display:none; mso-hide: none;` div holding the Outlook
fallback. Both halves are required; without them Outlook renders both and the button
appears twice.

`{{INTRO_COPY}}` replaces the fixed sentence *"Please find your bespoke installation
drawings attached"*, which stops being true when nothing is attached:

- **Links only:** "Your bespoke installation drawings are ready. Please use the buttons
  below to open each document."
- **Linked and attached:** "Please find your bespoke installation drawings attached. They
  are also available using the buttons below."

**Escaping.** Labels are HTML-escaped — they are user free text going into element
content. URLs are **HTML-escaped but deliberately not percent-encoded**: see "one thing in
the brief I would change", below.

The success page lists every document with its label, its full URL as a clickable link,
the original and saved names, and the size, plus a line stating whether anything was
attached. A document whose URL could not be built is called out in red, because the email
has already gone and the sender needs to know a button in it is dead.

---

## One thing in the brief I would change

> "The URL goes in an href, so percent-encode where needed, the same treatment
> `{{PROJECT_REF_URL}}` already gets."

**Percent-encoding the file URL would break every link.** The two cases are not alike:

- `{{PROJECT_REF_URL}}` is a *value being placed inside* a query string — a raw project
  reference like `OPP123 - 12 High St & Co`. It must be percent-encoded, or its spaces and
  `&` corrupt the surrounding `mailto:`.
- `File.url` is *already a complete URL* with an already-encoded query string. Running it
  through `encodeURIComponent` would turn `?` into `%3F` and `&` into `%26`, producing a
  single opaque string that resolves to nothing.

What an `href` actually requires is **HTML escaping**, so the `&` separators become
`&amp;` and the attribute is valid markup. That is what the code does, and the harness
asserts it — `c=1234567&amp;h=hash…` in the rendered body.

---

## Verification performed

`node --check` on all six files, plus the stubbed harness: **129 assertions across four
suites, all passing** (10 user event, 32 Suitelet logic, 42 Phase 1 end-to-end, 45 Phase 2).
The Phase 1 suites were updated to the Phase 2 contract rather than left to rot, so they
still serve as regression cover.

The harness found one real bug, now fixed: the same-second file name collision described
under Step 4.

**It is not a substitute for Sandbox**, and less so than in Phase 1, because the two things
Phase 2 turns on — what `File.url` really returns, and whether the published file opens
with no session — are exactly the things a stub cannot tell you.

---

## Tests to run in Sandbox

| # | Scenario | Expected |
|---|---|---|
| 1 | One file, category chosen, label untouched | One button labelled with the category; link opens the file |
| 2 | Label edited to custom text | Button shows the custom text |
| 3 | Three files, three categories | Three buttons, in slot order |
| 4 | Label cleared before submit | Falls back to the category name |
| 5 | Label and category both empty | Refused, naming the slot |
| 6 | Attach-as-well **unticked** | Links only, no attachments, body copy says so |
| 7 | Attach-as-well **ticked** | Both, body copy says so |
| 8 | Ticked, total over 15 MB | Refused; message explains the limit applies because attaching was chosen |
| 9 | Unticked, total over 15 MB | Sends fine, no limit applies |
| 10 | Single file over 10 MB | Still refused, unchanged from Phase 1 |
| 11 | Label containing `&` and `<` | Renders correctly, no broken markup |
| 12 | Two sends from the same Opportunity | Distinct files; the first customer's links unchanged |
| 13 | **Link opened with no NetSuite login** | File opens |

Worth adding, given Step 1:

- **Read `File.url` in Sandbox and record whether it is relative or absolute** — the open
  question in (b). One line in the execution log answers it.
- **Re-run test 13 after any NetSuite version upgrade**, given the 2024.2 and 2025.1
  changes to external URL handling.
- **Five documents with five different categories**, exercising every slot.

---

## Open items

1. **(b) above is unresolved** and is the one thing that should be checked in Sandbox
   before this is relied on. The code is correct either way; the point is to know.
2. **Retention and orphan handling** remain open from Phase 0 — and Phase 2 raises the
   stakes, because a deleted file now breaks a link that is already in a customer's
   mailbox. Whatever retention policy is chosen, **published drawings should not be
   deleted while their links are still live.**
3. **`{{PROJECT_REF}}` is still assumed to be the Opportunity `tranid`** (Phase 1 open
   item), and the email subject is still this project's wording rather than template
   3334's own.


---
---

# Phase 2a — form layout and email presentation

Cosmetic and layout only. Sender resolution, publishing, naming, validation and the send
itself are untouched.

| File | Version | Change |
|---|---|---|
| `lib/dsn_lib_config.js` | 1.1.0 → **1.2.0** | Ten document slots |
| `dsn_email_template.js` | 1.1.0 → **1.2.0** | Fixed-width buttons; "Confirm your design" block removed |
| `dsn_sl_send_design.js` | 1.1.0 → **1.2.0** | Sectioned form, row layout, ten slots |
| `dsn_cs_send_design.js` | 1.1.0 → **1.2.0** | Slot count kept in step with the server |

`node --check` passes on all six files.

---

## The FILE field finding — read this before the rest

The brief asked whether a FILE field renders correctly in a horizontal row alongside other
fields, and said to propose the closest workable layout if it does not. **The real
constraint is stronger than "it may insist on its own line", and it changes the shape of
the answer.**

NetSuite documents, in the `serverWidget.FieldType` reference, that the `FILE` type

> *"is available only for Suitelets and will appear on the main tab of the Suitelet page.
> FILE fields cannot be added to tabs, subtabs, sublists, or field groups and are not
> allowed on existing pages."*

([serverWidget.FieldType](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4337960739.html);
the same restriction is repeated in community references to the
[serverWidget module](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4321345532.html).)

So **a FILE field cannot go in a field group at all.** Two consequences:

### 1. The document groups cannot exist as briefed

"Group *Document 1*: file, category, button label" is not buildable — the file input
cannot be inside the group. The alternatives were:

- Put the category and label in a group and leave the file outside it. This separates a
  document's file input from the two fields that describe it, which is **worse than no
  grouping at all** — the user would be matching "Document 3" in one place against
  "Category" in another.
- Drop field groups and draw the sections another way.

**Built: the second.** Every section — *Email*, *Documents*, *More documents*, *Options* —
is an `INLINEHTML` heading with a rule and a one-line explanation, and all fields sit on
the main tab in the order the brief specified. Each document's three fields stay adjacent
and in order.

Field groups would have worked for *Email* and *Options*, which contain no FILE field. They
are not used there either, deliberately: a form that grouped two sections natively and drew
the other two with headings would look like a mistake rather than a decision, and mixing
grouped and ungrouped fields makes the rendered order harder to predict.

### 2. Slots 4–10 cannot be collapsed

Collapsing requires a field group's own collapse setting; a field group cannot hold the
FILE field; and hiding fields with DOM manipulation was ruled out for this form in Phase 0
and the reasoning still holds. **There is no third option**, so slots 4–10 are visible,
under a *More documents* heading that says what they are for and that slots may be used in
any order.

The form is therefore long. That is the honest cost of ten slots given the constraint, and
it is better than a form that hides fields in a way the platform does not support.

### 3. Row layout is attempted and degrades safely

Within each section the fields are laid across with `STARTROW` / `MIDROW` / `ENDROW`
([serverWidget.FieldLayoutType](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4332671038.html)),
which is documented as positioning fields *outside* a field group on the same row —
exactly the situation here.

**Whether the FILE field honours it is not documented either way**, and given its other
restrictions it may not. So `setRowLayout` wraps the call in try/catch: a refusal is logged
at `debug` and the field simply stacks. If the FILE field refuses, the visible result is
the file on its own line with the category and label beside it — still correct, still in
order, just taller. The layout degrades rather than breaks, and the harness tests both
outcomes.

**This is worth one look in Sandbox** — not because anything fails if it is wrong, but
because the answer decides whether the form reads as three columns or as a file above two.

---

## Email changes

**Equal-width buttons.** Every CTA is a fixed 280px, set as *both* a `width` attribute and
a CSS `width` — Outlook honours the attribute, most other clients the style. The label is
centred and `word-wrap:break-word` lets a long label wrap to a second line; nothing sets
`white-space:nowrap`, so no label can stretch the button. Matching widths read as a set;
matching heights do not, which is why height is allowed to vary. The MSO conditional pair
is intact on both halves of every button.

**"Confirm your design" removed.** The whole grey block went — heading, image, body copy
and both CONFIRM DRAWINGS buttons with their MSO fallback. The removed range was verified
self-contained before deletion (equal counts of `<table>`/`</table>`, `<tr>`/`</tr>`,
`<td>`/`</td>` inside it), and the harness re-checks tag balance across the whole rendered
body afterwards.

**`{{PROJECT_REF_URL}}` is gone.** Those two mailto links were its only use, so the tag and
its `encodeURIComponent` helper were removed with them. `{{PROJECT_REF}}` remains, in the
body text. Nothing else referenced either.

---

## Why there is no "add another document" button

Recorded so it is not re-attempted. It cannot be built:

- A Suitelet form is **rendered server-side**. A client script cannot add a NetSuite field
  to a page that has already loaded.
- Re-submitting the form to re-render it with more slots **would discard every file already
  chosen**, because no browser can repopulate a file input.
- Building the inputs in raw HTML instead would mean hand-rolled DOM writes on this form,
  which Phase 0 rejected, and would bypass the multipart handling the Phase 0 spike
  confirmed works.

Ten fixed slots is the honest form of "as many as you need".

---

## Verification

**167 assertions across five suites, all passing** (10 user event, 32 Suitelet logic,
42 Phase 1 end-to-end, 45 Phase 2, 38 Phase 2a), plus `node --check` on all six files.
Earlier suites were updated where Phase 2a legitimately changed their expectations — the
slot count rose from five to ten — rather than left failing.

Phase 2a tests cover: identical button widths with wildly different label lengths; the
removed block leaving balanced markup and the rest of the email intact; section order and
row layout on the form; the FILE-field-refuses-layout degradation path; slot 7 alone;
slots 1 and 9 with a gap; all ten slots; and slot 10 still obeying the 10 MB check and the
label rules.

---

## Still open after 2a

Unchanged from Phase 2: the `File.url` question (b), retention now that links live in
customers' mailboxes, and `{{PROJECT_REF}}`/subject wording. Added by 2a: whether the FILE
field honours a row layout type, which is cosmetic either way.


---
---

# Phase 2b — the delivery booking line

| File | Version | Change |
|---|---|---|
| `lib/dsn_lib_config.js` | 1.2.0 → **1.3.0** | `CUSTOMER_SUPPORT_PHONE` constant |
| `dsn_email_template.js` | 1.2.0 → **1.3.0** | `{{DELIVERY_CONTACT}}` and its builder |

`node --check` passes on all six files.

## What changed

The delivery-booking sentence now addresses the customer from the sender:

- **Sender has an office phone:** *"If you haven't already booked your delivery, you can
  confirm your slot by calling me on 01404 222333."*
- **Sender's office phone is blank:** *"...by calling our Customer Support Team on
  01404 540748."*

The phone is the one **already resolved for the footer** — the chosen sender's employee
`officephone`, by the existing sales rep / project engineer rules. `buildBody` receives it
once and both the footer clause and this line are built from that single value; nothing is
looked up a second time.

Both numbers come from config. `CUSTOMER_SUPPORT_PHONE` joins `SHARED_DESIGN_EMAIL` in
`dsn_lib_config.js`, and neither now appears as a literal anywhere in the lifted markup —
the harness asserts that against the `TEMPLATE_LINES` array specifically, so a number
quoted in a comment cannot mask a number left in the HTML.

The clause carries a `tel:` link styled exactly as the template's own links are. The href
keeps only digits and a leading `+`, because a `tel:` URI cannot carry the spaces a
readable number is written with; the visible text keeps the number exactly as the employee
record holds it.

## Why the two fallback rules differ — and why that is not an inconsistency

This is recorded in the code beside **both** rules, because the next person to read them
will see a contradiction and be tempted to make them agree.

**The footer drops its phone.** *"...contact your Project Engineer, NAME, via
design@nu-heat.co.uk or ___."* That number is the sender's **personal contact**. Nobody
else can stand in for it, and substituting the switchboard would be a small lie — exactly
the lie Phase 0 rejected when it removed Send Quote's "Your Account Manager" on the main
number. So the clause is removed and the sentence still reads correctly.

**The delivery line substitutes.** It is about **booking a delivery**, which the Customer
Support Team genuinely does. The fallback is not a stand-in for the sender; it is the
correct destination for that task, and was this line's original wording. Dropping the
sentence would leave a customer unable to book a delivery because an employee record had
an empty field — a far worse outcome than a sentence that is slightly less personal.

The general rule, if a third case ever arises: **substitute when the fallback is a real
answer to the customer's question; drop when it would only be pretending.**

## Tests added

| # | Scenario | Expected |
|---|---|---|
| 23 | Sender with an officephone | "calling me on <their number>" |
| 24 | Sender with a blank officephone | Customer Support wording and number, sentence intact |
| 25 | Same email, both cases | Footer and delivery line agree; no gap, stray "or", or empty bracket |

Test 25 checks both variants of the whole rendered body for a stray `or .`, `on .`, empty
brackets, doubled full stops, leading spaces before commas, and the strings `undefined` and
`null` — the shapes a badly-handled blank value actually takes. It also confirms the
opposite behaviours coexist correctly: with a phone, the footer shows it *and* the delivery
line says "me"; with none, the footer drops its clause *while* the delivery line
substitutes support.

Verified end to end through the Suitelet as well as at the template, so the value really is
the one the sender rules produced.

**192 assertions across six suites, all passing.**


---

## Phase 2b remainder — stacked form sections, full-width buttons

Layout only. No logic, validation, publishing or send behaviour changed.

| File | Version | Change |
|---|---|---|
| `dsn_email_template.js` | 1.3.0 → **1.4.0** | Buttons are the email's content width, reusing the hero image's classes |
| `dsn_sl_send_design.js` | 1.3.0 → **1.4.0** | Section headings span the full form width; Email rows regrouped |

`node --check` passes on all six files.

### The form

**Section headings now use `OUTSIDEABOVE`.** This is the change that matters. Previously
they were ordinary in-grid fields, so NetSuite placed each one into whichever of its three
columns the flow had reached — which is exactly why headings appeared mid-column and
sections split across columns. `OUTSIDEABOVE` renders a field across the full form width,
outside the column grid, which both puts the heading where it belongs and breaks the column
flow at that point so the next section starts below rather than beside.

**Email rows regrouped** to the briefed shape: `Send As | Select Contact | To` on one row,
`CC | BCC` on the row below. Document rows are unchanged — `file | category | label`, one
row each, all ten.

**`STARTCOL` is not used anywhere**, nor is `updateBreakType`. The harness asserts their
absence, since reaching for them is the obvious wrong turn if the stacking still misbehaves.

`setRowLayout` now delegates to a shared `setLayoutType`, so the heading's `OUTSIDEABOVE`
gets the same try/catch as the row positions: layout is presentation only, and a field type
that refuses one must not take the form down. Refusals log at `debug`.

### What I am NOT confident will render as intended

Worth reading before looking at the Sandbox page, because these are the parts to check
rather than the parts to trust:

1. **Whether `OUTSIDEABOVE` alone is enough to stop the column flow.** It is documented as
   rendering the field across the full width, and it is the right lever — but whether
   NetSuite then *resumes* three-column flow for the fields after it, or treats the
   full-width field as a section break, is not something the documentation states. This is
   the single thing most likely to come back still wrong. If sections still split, the next
   thing to try is `OUTSIDEBELOW` on the heading instead, which may anchor the following
   fields differently.
2. **Whether explicit `STARTROW`/`ENDROW` on every field is enough to stop NetSuite
   inserting its own column breaks between rows.** Every field now has an explicit position
   and nothing is left to automatic flow, which should prevent it. "Should" is doing work in
   that sentence.
3. **Whether the FILE field honours `STARTROW` at all** — still open from Phase 2a, still
   handled by the try/catch, and still acceptable if it degrades to file-on-its-own-line
   with category and label beside it. Not fought.
4. **How a 10-row form of `OUTSIDEABOVE` headings actually looks.** Four full-width bars
   down a long page may read well or may read as clutter. That is a judgement call best made
   looking at it.

The harness can prove which layout type each field was given, and does. It cannot prove what
NetSuite's renderer does with them, and no stub can.

### The email buttons

Buttons are now the email's **full content width**, matching the hero image above them,
rather than a fixed 280px.

They reuse the template's own classes rather than inventing a size — `width600`
(600px desktop, 100% below 599px, the hero image's own class) and `fluid-on-mobile`
(100% on mobile). So the buttons track the image at both sizes, and if the template's
content width ever changes the buttons follow without being touched.

Kept as before: the width as **both** a `width` attribute and a CSS `width` so Outlook and
everything else agree, `max-width:100%` so the mobile rules can win, centred labels,
`word-wrap:break-word` so a long label wraps, and the MSO conditional pair on every button.

Two supporting changes the brief did not name but the result needs:

- **The anchor is `display:block`, not `display:inline-block`.** An inline-block anchor
  shrink-wraps its contents, so the button would not have filled the width regardless of
  what the table inside it said.
- **The button cell's horizontal padding is removed.** The hero image's cell has none, so
  20px of side padding would have left every button visibly narrower than the image it is
  supposed to match.

Equal width now comes for free: every button is the content width, so no label can make one
wider than another.

### Tests added

| # | Scenario | Expected |
|---|---|---|
| 20 | Form loads | Email, Documents, More documents and Options stack in order, each heading full width, no section split across columns |
| 21 | Three buttons, very different label lengths | All the same width as the hero image, long label wrapping within the button |
| 22 | Email at phone width | Buttons and image both full width, still matching |

Test 20 checks the layout type given to every field, the page order of all four headings and
their sections, that starts and ends balance across all twelve rows, and that `STARTCOL`
and `updateBreakType` appear nowhere. Test 22 checks the CSS rules the image relies on and
that the buttons carry the same classes, which is the closest a harness can get to a phone.

**221 assertions across seven suites, all passing.** Three Phase 2a assertions were updated
where this change deliberately superseded them — the 280px width, the Email row split, and a
renamed log message.


---

## Phase 2c — Send Design form layout

Layout only. `dsn_sl_send_design.js` **1.4.0 → 1.5.0**. Nothing else changed:
`dsn_cs_send_design.js` stays at 1.2.0 because no field ID moved, and
`dsn_email_template.js` stays at 1.4.0, untouched.

`node --check` passes on all six files.

### The approach, and why

The previous attempt set section headings to `OUTSIDEABOVE` and stopped there. That was
half a mechanism. A **layout type** says where a field sits; it does not say that a new row
begins. The other half is the **break type**: `FieldBreakType.STARTROW` "places a field
located outside of a field group on a new row", and is documented to work **only** on
fields whose layout type is `OUTSIDE`, `OUTSIDEABOVE` or `OUTSIDEBELOW`
([Field.updateBreakType](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4335187732.html),
[FieldBreakType](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4332670010.html)).
Setting either without the other achieves nothing, which is the likeliest reason Phase 2b
did not stack. Section headings now carry **both**.

The second change addresses the actual cause rather than its symptoms. NetSuite spreads
main-tab fields across three columns because of **automatic field balancing** — it is
balancing column heights, which is precisely how Email ended up narrow, documents split,
and Options beside Document 10. No per-field layout setting fixes that while the balancer
is still redistributing everything around it. `FieldBreakType.STARTCOL` is documented to
move its own field into a new column **and to disable automatic field balancing if set on
any field**. It is applied to the **hidden** Opportunity ID field, where starting a column
is invisible and harmless, purely for that side effect.

**This is where I disagree with the brief.** It listed `STARTCOL` as "probably what to
avoid rather than use". That is right about its primary effect and, I think, wrong about
its side effect: switching the balancer off is the one documented lever aimed at the cause.
It is easy to back out — drop one call — if Sandbox shows it misbehaving.

Also changed: the "More documents" section is gone and all ten slots sit under one
**Documents** heading; the Email section is two rows (`Send As | Select Contact`, then
`To | CC | BCC`); text inputs are widened with `updateDisplaySize` because NetSuite's
default is too narrow to read an email address or a button label in.

There is **no native header row**, so each row's field labels do that job: the file field is
labelled "Document 7", and every row's other two are labelled "Category" and "Button label".
NetSuite renders labels in their own column ahead of the controls, so the numbers form the
narrow left-hand column and the repeated labels line up down the page.

### Acceptance criteria

**Met in the code, pending Sandbox for rendering:**

| Criterion | Status |
|---|---|
| Email controls across the top in two rows | Layout types set; order guaranteed |
| All document controls below the email section | Guaranteed by field order |
| Ten document rows in numerical order | Verified — contiguous, 1 to 10 |
| Each desktop row has file, category and label side by side | `STARTROW`/`MIDROW`/`ENDROW` set on all thirty fields |
| Options below Document 10 | Guaranteed by field order |
| Send Design and Cancel still work | Unchanged |
| Contact selection still works | Unchanged — contact map and IDs intact |
| Files, categories and labels submit against the correct slots | Verified, including slot 7 alone |
| Blank and non-sequential slots still work | Verified — slots 1 and 9 with a gap |
| No field ID or business logic changed | Verified — all 38 IDs present, none renamed |

**Prevented by the platform:**

- **A true four-column table with a header row.** A Suitelet form has no header row, so
  "Document | File | Category | Button Label" cannot appear once at the top. Per-row labels
  are the closest native equivalent and are what is built.
- **Guaranteed pixel alignment of column edges.** Rows should align because every row has
  the same three fields with the same label text, but column widths are the renderer's to
  decide, not the script's.
- **Whether the FILE field accepts a row layout or a display width at all.** Still open from
  Phase 2a, still wrapped in try/catch, still an acceptable degradation to
  file-on-its-own-line with category and label beside it. Not fought.

This is the fallback acceptance the brief describes, and I would rather say so than present
the table as done.

### What the harness proved, and what it cannot

**Verified in the harness (38 new assertions):** the layout type and break type given to
every field; that the three headings are `OUTSIDE` + `STARTROW`; that `STARTCOL` appears on
the hidden field and on no visible one; page order of every section; that each document
row's three fields are contiguous and correctly positioned; display widths; that all
pre-existing field IDs survive; that submission still binds file, category and label to the
right slot, including non-sequential and blank slots; and that the whole form still renders
when the FILE field refuses both layout and width.

**Not verifiable here, and the things to look at in Sandbox:**

1. **Whether disabling field balancing actually produces a single stacked column.** This is
   the crux. If it does not, the form will still spread.
2. **Whether a HIDDEN field's break type is honoured at all.** If the balancer is still on,
   this is the first thing to test — move the `STARTCOL` to the first visible field.
3. **Whether `OUTSIDE` + `STARTROW` puts each heading on its own full-width row.**
4. **Whether the FILE field honours `STARTROW` and `updateDisplaySize`.**
5. **Column alignment across ten rows, and how it behaves at narrow widths.**

The harness can prove which layout instruction each field was given. It cannot prove what
NetSuite's renderer does with them, and no stub can.

### What was NOT done, deliberately

The brief warned against rendering the form as INLINEHTML with raw `<input type="file">`
elements, and I did not. It is the obvious route to a real table and it would trade the one
upload mechanism this project has verified by experiment — several native FILE fields
surviving one POST, including with gaps — for one there is evidence against. I did not reach
a point where hand-rolled markup looked necessary, so there is no spike to propose: the
native route produces stacked sections and adjacent controls, and only the header row and
guaranteed pixel alignment are out of reach.

**261 assertions across eight suites, all passing.** Assertions in two earlier suites were
updated where this brief deliberately superseded them — the removed "More documents"
section, the regrouped Email rows, and the heading layout type.


---

## Phase 2d — the last layout attempt, and the record of what was tried

`dsn_sl_send_design.js` **1.5.0 → 1.5.1**. `node --check` passes on all six files.

### One of the two requested changes was already in place

The brief asked for two one-liners. **Only one of them was outstanding.**

The headings were **already** `FieldLayoutType.OUTSIDE` with `FieldBreakType.STARTROW` —
changed from `OUTSIDEABOVE` in Phase 2c (1.5.0), before the page that was observed. The
brief describes the code as still holding `OUTSIDEABOVE`, which it has not since 1.5.0.

That matters, because it changes what the observation means. If the rendered page came from
1.5.0 — and it must have, since it also reports the `STARTCOL`-on-a-hidden-field behaviour
that only exists from 1.5.0 — then **the headings collecting at the top of the form is what
`OUTSIDE` does, not what `OUTSIDEABOVE` does.** The brief anticipated exactly this: *"If
OUTSIDE also floats them out of position, say so — that would mean serverWidget cannot place
a full-width heading inline, which is a finding worth having."*

So: **that is the finding.** `OUTSIDE` and `OUTSIDEABOVE` both lift a heading out of the
inline flow. `serverWidget` appears to offer no way to place a full-width field *between*
two groups of fields — "outside the column grid" and "in the flow at this point" look to be
mutually exclusive.

I have **left the headings on `OUTSIDE`**, because that is what the brief asked for and
because changing them again would be the third approach the brief rules out. The one
remaining one-liner, if the headings still float after this, is noted at the end.

### What did change

`STARTCOL` moved from the hidden Opportunity ID field to **Send As**, the first field the
column flow actually reaches. A hidden field's break type was evidently not honoured. Send
As has nothing before it in the flow, so starting a column there is a visual no-op while the
documented side effect — automatic field balancing off — still applies form-wide.

Section headings were not candidates: they sit `OUTSIDE` the column grid, so a column break
on one has nothing to act on.

### The record — what each attempt actually produced

Kept so nobody repeats any of it.

| Attempt | Version | What was tried | What it produced |
|---|---|---|---|
| 1 | 1.2.0 | `OUTSIDEABOVE` on headings, no break type | Sections still shared columns. A layout type says where a field sits, not that a row begins |
| 2 | 1.4.0 | `OUTSIDEABOVE` + row layout types on every field | No change to the column flow. Headings still placed by the balancer |
| 3 | 1.5.0 | `OUTSIDE` + `STARTROW` break on headings; `STARTCOL` on a **hidden** field | Headings render full width and stacked — but **all three collect at the top of the form**, detached from their sections. Fields still flow in three columns: balancing was **not** disabled from a hidden field |
| 4 | 1.5.1 | `STARTCOL` moved to **Send As**, the first visible field | Not enough. The form still did not stack |
| 5 | 1.6.0 | **The native form was abandoned.** The GET now writes a hand-written HTML page with raw `<input type="file">` controls | **Layout correct.** Sections stack, the ten documents render as a real four-column table with a header row |

Attempt 5 was made by the client directly in NetSuite and mirrored into the repo; it did
not come through this session.

Established along the way, and not to be re-derived:

- A `FILE` field cannot go in a tab, subtab, sublist or field group, and appears only on the
  main tab. There is therefore no native table and no native collapsing.
- `FieldBreakType.STARTROW` works only on fields whose layout type is `OUTSIDE`,
  `OUTSIDEABOVE` or `OUTSIDEBELOW`.
- `OUTSIDE` and `OUTSIDEABOVE` both remove a heading from the inline flow (attempt 3).
- A hidden field's `STARTCOL` does not disable field balancing (attempt 3).
- `STARTCOL` on the first visible field does not disable it either (attempt 4).
- A Suitelet form is server-rendered; a client script cannot inject fields; re-rendering
  would discard chosen files; DOM manipulation was rejected in Phase 0 and stays rejected.
- Hand-written markup with raw `<input type="file">` would trade the one upload mechanism
  verified by experiment for one there is evidence against.

### If this does not work

**Then we accept what the platform gives and stop.** The feature is correct: the right files
are uploaded, saved, published, linked and sent, against the right slots, with the right
validation. It would only look untidy — fields in three columns with the headings gathered
above them, rather than three stacked sections.

That is a cosmetic fault on an internal form used by a handful of people, and it has now
consumed four attempts. It is not worth a fifth, and it is certainly not worth trading a
proven upload path for a prettier one.

There is exactly **one** one-liner left, and it is the client's call whether to spend it:
drop the headings to `FieldLayoutType.NORMAL` with no break type, so they sit inline in the
flow as ordinary fields. If balancing is genuinely off by then, a single-column flow would
carry them into position between their sections; the cost is that they would no longer be
guaranteed full width. I have not done this, because it is a change of approach rather than
the fix requested, and because it is only worth trying if attempt 4 has already proved that
balancing is off.

**263 assertions across eight suites, all passing.** The harness proves the break type now
sits on Send As and on nothing else, and that Send As is genuinely the first field in the
column flow. It cannot prove what the renderer does with it.


---

## Attempt 5 — what actually fixed the layout, and what it costs

`dsn_sl_send_design.js` **1.5.1 → 1.6.0**, edited by the client in NetSuite and mirrored
into the repo. It is on `claude/phase-2-document-links`, not on `main`.

### What changed

**The GET no longer builds a serverWidget form.** `showForm` writes a complete
hand-written HTML document with `context.response.write`, containing:

- a real `<table>` with a `<thead>` of Document / File / Category / Button Label, and a
  `<colgroup>` fixing the column widths at 12% / 32% / 24% / 32%;
- ten rows of raw `<input type="file">`, `<select>` and `<input type="text">`, keeping the
  existing `name` attributes exactly (`custpage_dsn_file_7` and so on);
- `<section>` blocks for Email, Documents and Options, stacked by ordinary CSS;
- its own inline JavaScript for the two client-side behaviours — filling To from the chosen
  contact (via `data-email` attributes rather than the hidden LONGTEXT map) and pre-filling
  a button label from its category;
- a submit guard that **disables empty file inputs** before posting, so unused slots do not
  produce empty multipart parts;
- categories read at render time from `customlist_dsn_link_category` by script ID.

Supporting changes: the previous native builder is kept as `showNativeFormLegacy` with no
callers; `disableFieldBalancing` is now uncalled; `setRowLayout` was rewritten to apply
`OUTSIDE` + a `STARTROW`/`NONE` **break** type and to throw rather than degrade — but it is
only reachable from the legacy function, so that rewrite is inert. Field widths were
narrowed (email 60→32, label 45→35), which now only affects the legacy path. The rest of
the diff is comment and whitespace reflow.

**Unchanged:** every field name, the whole POST path, validation, size checks, file naming,
publishing, linking, the email template, and both result pages (which are still serverWidget
forms, so `dsn_cs_send_design.js` is still used for their Cancel button).

### Why it works

Because it stops asking serverWidget to lay the form out. Attempts 1 to 4 were all trying to
persuade NetSuite's column balancer to produce a single stacked flow; attempt 5 renders its
own markup, where stacking is just CSS. That is the whole explanation, and it is deducible
directly from the diff.

### What this does NOT establish — correcting the record carefully

The brief for this write-up asked whether attempt 5 disproves the earlier conclusion that
serverWidget cannot place a full-width heading inline between groups of fields.

**It does not.** Attempt 5 does not place a heading inline with serverWidget; it does not
use serverWidget for the form at all. The conclusion from attempt 3 therefore stands
untested rather than refuted — no evidence has been added on either side. Recording it as
"disproved" would be inventing a result the code does not contain.

### The cost, and the thing that must be checked before this ships

**Attempt 5 is the approach Phase 2c explicitly ruled out**, and the reason it was ruled out
has not gone away:

- The Sandbox spike proved that **several NATIVE FILE fields survive one POST**, including
  with gaps between filled slots. That evidence is about NetSuite-rendered fields.
- The only source found on **hand-rolled multipart POSTs in a Suitelet** claims NetSuite
  does not parse them. Nothing has disproved that.

**"The form lays out correctly" is a GET-side observation.** It says nothing about whether
an upload parses, because no file has been posted to prove it. The code itself carries the
author's own note: *"Sandbox verification required for multipart handling and deployment
security."*

So before this goes anywhere near Production, a **real send** must be confirmed in Sandbox:

1. One file in one slot — does `request.files` receive it?
2. Three files in slots 1, 2 and 3.
3. **Non-sequential slots** — 1 and 9, with the gap the submit guard is there to handle.
4. That the resulting email carries the right links against the right labels.

If uploads do not parse, the fallback is attempt 4's native form, which is why the legacy
builder was kept. If they do parse, that is a **new and valuable finding** that contradicts
the only source we had, and it belongs in this document as firmly as the original spike.

### Secondary points worth a decision

- **`showNativeFormLegacy` is ~160 lines of unreachable code.** Justified while the upload
  question is open; it should be deleted once a real send is confirmed, or restored if it is
  not. It should not be left indefinitely.
- **`setRowLayout` now throws instead of degrading.** Inert today because only the legacy
  path calls it, but if that path is ever revived, a field type refusing a layout will take
  the form down rather than stacking — the opposite of the guarded behaviour it had.
- **The page has no NetSuite chrome.** A raw HTML response loses the usual header and
  navigation. That may well be fine for a task-focused page reached from a button, but it is
  a change in feel worth noticing rather than discovering.

### Harness status against 1.6.0

The POST pipeline is fully green: slot 7 alone, non-sequential slots 1 and 9, label fallback
to category, the 10 MB refusal saving nothing, attach-too, `relatedRecords`, publishing and
linking — all still pass, and `node --check` passes on all six files.

**The GET-side suites now fail, and they are stale rather than wrong.** They assert on
serverWidget fields — layout types, break types, field ordering — for a form that no longer
exists on the GET path. Those assertions were testing attempt 4's mechanism, and attempt 5
removed it. They have deliberately **not** been rewritten to match: the tests should follow a
decision about whether 1.6.0 stays, not be quietly reshaped around it while its central
question is still open.
