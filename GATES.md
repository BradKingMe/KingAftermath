# Gates: KingAftermath first release

OWNS: app/**, collectors/**, examples/**, scripts/**, docs/**, *.md, *.json, .gitignore, LICENSE

Scope: local Windows inventory collector, two/three snapshot comparison, evidence browser, portable report, and setup documentation.

- [x] G1: Collector implements read-only installed application, startup, service and scheduled-task collection with explicit coverage and stable identities.
  EVIDENCE: Source reviewed: explicit Registry32/64 views; Run/RunOnce and startup file hashes; Win32_Service configuration; Get-ScheduledTask selected fields; source warnings/caps; machine/user hashes and privilege-bound scope; exclusive output file creation. PowerShell parser reports no syntax errors. Collector not executed against this computer.
- [x] G2: Comparison preserves evidence, distinguishes incomplete collection and identifies three-capture residual candidates without causal claims.
  EVIDENCE: Source reviewed in app/core.js: normalized parser, unique identities, chronological and machine/scope matching, partial one-sided observations unconfirmed, three-complete-source requirement for residual/reverted, separate later-change group, escaped report. Fictional preview shows seven install-period changes, three residual candidates and four reverted records. No behavioral test suite run.
- [x] G3: Local interface provides imports, demo, filters, item details, comparison modes and downloadable reports with responsive layouts.
  EVIDENCE: Source review covers slot import/size/error handling and asynchronous race guards, filter/search/pagination, selected evidence, all three modes, snapshot saving and full HTML report download. Local preview at port 5190 visually reviewed at default desktop size and 390px mobile; no layout defects observed. docs/preview.png records the desktop view. JavaScript syntax checks pass. Imports, downloads and CLI runtime behavior have not been independently exercised.
- [x] G4: Documentation provides reproducible setup, collection commands, privacy boundaries and supported limitations.
  EVIDENCE: README contains Node/PowerShell prerequisites, all three capture commands and CLI usage; docs/SNAPSHOT-FORMAT.md defines limits and provenance; docs/COLLECTION-REFERENCES.md links Microsoft documentation; ROADMAP.md explicitly calls out pending tests and real-machine experiments. No GitHub publication or production readiness is claimed.

These gates use source and artifact review. Automated behavioral tests are not part of the authorized build request.
