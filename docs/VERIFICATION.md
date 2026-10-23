# Version 0.2 verification — 2026-10-23

## Performed

- Node regression suite: 13 passing tests covering snapshot parsing/BOM/legacy support, duplicates and invalid types, identity/time/scope mismatches, partial coverage, residual/reverted counts, tracked-file differences, explained matching and sibling-folder exclusion, report escaping, investigation package references, review limits, CLI output/overwrite refusal and loopback server allowlist/method/host restrictions.
- Real Windows read-only collection returned 245 application records, 39 startup records, 310 services and 194 scheduled tasks on this PC. Those counts describe this run, not a product guarantee.
- This run found and fixed a PowerShell ordered-dictionary sorting defect that had collapsed inventories to one record. A sorting control and independent service-count guard cover the regression.
- Controlled folder lifecycle: no tracked files at baseline; two inert fixture files after simulated installation; one retained file after simulated uninstall; the report contained one residual candidate. Node's production parser accepted all three actual collector outputs.
- Quoted existing paths, missing explicit paths, ambiguous unquoted paths, relative commands and network targets were checked. Reparse-point target paths remained unresolved.
- Junction boundary trial: a junction inside the tracked folder pointed at an out-of-scope fixture. The collector skipped it, retained only the in-scope file and reported partial file coverage.
- Windows capture desk initialized its native controls with three capture stages using `-ValidateOnly`. Collection runs asynchronously through a PowerShell runspace with structured arguments; no shell command is built from user notes or snapshot data.
- Browser exercise with fictional data: app investigation and map, single-capture operation after clearing the other slots, decision/reason entry, notes and capture context, package download/restore and enriched HTML download. The downloaded package retained three captures and one decision; the downloaded HTML contained the notes and reason.
- Desktop/mobile visual review of the extended interface. Snapshot imports/exports remain local; a browser file-chooser automation retry was needed during the exercise and then restore succeeded.

Private real-machine captures, inert fixtures and junctions are retained only in ignored `test-results/`. A preliminary capture in ignored `captures/` reflects the earlier defective sorting run and is not used as release evidence. Do not publish either directory. Synthetic example snapshots and screenshots are safe showcase material.

## Not established by these checks

- No third-party software was installed/uninstalled. The controlled lifecycle used inert files and real read-only Windows inventory. A disposable VM installer trial remains a separate exercise.
- The native capture desk's interactive button/resume workflow has source review and initialization coverage, not an independent click-through exercise.
- Other Windows accounts, different privilege levels, Windows editions and PowerShell 7 were not exercised.
- These checks do not establish complete forensic coverage, causal installer ownership, safe-removal decisions, signatures, absence of all vulnerabilities or race-free filesystem acquisition.

## Reproduce

```powershell
npm test
npm run test:windows
```

Windows checks deliberately leave evidence under a unique ignored `test-results/windows-*` directory. They only remove their own specifically checked fixture file; system startup, registry, service and scheduled-task settings are not modified.
