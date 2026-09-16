# spike/ — throwaway, Sandbox only

**This is disposable code. It must never be deployed to Production.**

It exists to answer **one question**, and is to be deleted once that question is
answered:

> When a Suitelet form carries several `FILE` fields and the user submits, do **all** of
> them arrive in `context.request.files` — or only one?

Nothing else in this repository depends on it. It is not Phase 1 code, it is not a
prototype of Phase 1 code, and no part of it should be carried forward.

## Why it matters

A NetSuite `FILE` field holds exactly one file, and `FILE` fields are not supported on
sublists — so several drawings means several fields. Whether that actually works is
unresolved: the documentation does not say, and the one secondary source found on the
subject contradicts itself (see `docs/phase-0-recon.md`, Part 2, Q3).

- **If every field arrives**, Phase 1 renders a fixed number of `FILE` fields and reads
  them straight off the request. Straightforward.
- **If only one arrives**, that approach is dead and Phase 1 falls back to base64-encoding
  the files client-side into text fields — materially more code, more that can go wrong,
  and a payload roughly a third larger.

This is the last thing blocking the Phase 1 design.

## Files

- `nuheat_multipart_spike_sl.js` — the Suitelet. Three `FILE` fields and a submit button;
  on POST it reports the shape of `context.request.files`.

## Deploying it in Sandbox

1. **Upload the script.** Put `nuheat_multipart_spike_sl.js` in the File Cabinet —
   anywhere convenient and easy to find again for deletion. It has no module dependencies
   of its own, so it does **not** need to sit alongside the 2026 Quote scripts, and it is
   better kept away from them so it is not mistaken for part of that project.

2. **Create the script record.** Customization > Scripting > Scripts > New, select the
   uploaded file, type **Suitelet**.
   - Name: `Multipart Upload Spike`
   - ID: `_nuheat_multipart_spike_sl` — NetSuite prefixes this, giving
     `customscript_nuheat_multipart_spike_sl`, which is what the file header records.

   > Type the ID **without** the `customscript` prefix. NetSuite adds it. Typing the full
   > string produces `customscriptcustomscript_...` — the same doubled-prefix mistake that
   > left `custbodycustbody_pe_email` in this account permanently.

3. **Create the deployment.** On the script record's Deployments subtab:
   - ID: `_nuheat_multipart_spike_sl` (same prefix rule — NetSuite makes it
     `customdeploy_nuheat_multipart_spike_sl`)
   - Status: **Testing**
   - Audience: whoever is going to run it

   > **Testing status runs only for the deployment owner** — the employee in the
   > deployment's Owner field. If somebody else needs to run it, either set them as the
   > owner or switch the status to Released. Testing is the safer default here, and it is
   > a large part of why this spike is safe to deploy at all.

4. **Run it.** Open the deployment's URL. Attach a small file to each of the three fields
   — a few KB each is plenty — and submit.

5. **Run it a second time** with only fields **1 and 3** filled, leaving 2 empty. This
   distinguishes "NetSuite dropped the file" from "the user did not attach one", which the
   first run alone cannot.

6. **Send back the result page** from both runs. It states plainly how many fields arrived
   and names each one. The same detail is written to the execution log at audit level, so
   either source works.

7. **Delete the deployment, the script record, and the uploaded file.** Then delete
   `spike/` from this repository.

## Reading the result

The result page lists every expected field with a **Present: YES / NO**, plus the file
name, `size` and `fileType` of anything that arrived. Absent fields are listed explicitly
rather than omitted — *"field 2 present, field 3 absent"* is the finding, and silence is
not.

Two secondary things the report will also reveal, both useful for Phase 1:

- **Whether `size` is populated on an unsaved request file.** Phase 1's decision is to
  check each file against the 10 MB ceiling *before* saving; that depends on `size` being
  readable at this point. If the column shows `(empty)` or `(threw: ...)`, the size check
  has to happen some other way, and we need to know that now.
- **Whether any file turns up under a key we did not render**, which would say something
  about how NetSuite names multipart parts. Unlikely, but cheap to look for.

## What this spike does not tell us

Nothing about size limits, nothing about attaching files to an email, and nothing about
how large a file the field will accept. It answers one question. That is the point.
