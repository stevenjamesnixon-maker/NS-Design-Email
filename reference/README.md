# reference/ — read-only copies, do not edit

## What these are

Five JavaScript files copied out of the NetSuite File Cabinet from a **different
project in the same account** — the 2026 Quote project. They are here so the
NS-Design-Email work can be planned against what the account actually does, rather
than against a description of it.

- `nuheat_opportunity_ue.js` — user event script on the Opportunity
- `nuheat_opportunity_cs.js` — its paired client script
- `nuheat_send_quote_sl.js` — the Send Quote Suitelet
- `nuheat_send_quote_cs.js` — the Suitelet's client script
- `nuheat_master_proposal.js` — shared data/rendering module

## Why they are committed

Reconnaissance only. The Send Design feature copies patterns from these scripts —
how a button reaches a Suitelet, how an employee's contact details are resolved, how
`email.send` lands a message on the Communication tab — and those patterns are much
easier to describe accurately, and to re-check later, when the source is in the
repository next to the notes about it.

They are **evidence, not code this repository owns.** Nothing here is deployed from
this repository, and nothing here is on this project's maintenance path.

## They must never be edited from this repository

The live versions live in the NetSuite File Cabinet at:

```
SuiteScripts/NuHeat/2026 Quote/
```

That is where the 2026 Quote project is maintained and where any real change has to
be made. Editing a copy in this repository **changes nothing in NetSuite** — the
account never sees it — while quietly creating a second, divergent source of truth
for someone to be misled by later.

So: no reformatting, no linting, no tidying, and no fixing defects, including ones
that are plainly defects. If something in here looks wrong, the right response is to
note it in `docs/phase-0-recon.md` and raise it with the 2026 Quote project. If a
newer version is needed, replace the file wholesale from the File Cabinet and say so
in the commit message.

## A note on the folder path

The File Cabinet folder is `2026 Quote`, a **subfolder of** `NuHeat` — not `NuHeat`
itself. This matters when reading the code: the modules load each other with relative
`./` paths, so every module named in a `define` array sits in that same `2026 Quote`
folder alongside the file referencing it. A relative path in these scripts resolves
within `2026 Quote`, never up into `NuHeat`.
