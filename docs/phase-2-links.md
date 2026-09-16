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
