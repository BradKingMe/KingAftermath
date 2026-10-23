# Gates: KingAftermath 0.2 expansion

OWNS: app/**, collectors/**, scripts/**, tests/**, docs/**, examples/**, *.md, *.json, *.cmd, .gitignore

Scope: all six proposed improvements and regression coverage, retaining local/read-only operation.

- [x] E1: Single-capture app investigation and an evidence-linked footprint map work without a baseline.
  EVIDENCE: Browser exercise retained installed capture only, with seven explained fictional matches; nodes expose source/reasons/targets. Unit tests exclude sibling-folder false path matches. Desktop/mobile layouts reviewed.
- [x] E2: Windows launcher implements named investigation captures with fixed folder scope and visible status.
  EVIDENCE: Windows Forms initialization passed for three capture stages. Source review confirms named profiles, resume/new workflow, fixed roots/preferences, structured runspace parameters, timestamped exclusive captures, asynchronous status/errors. Collector itself exercised repeatedly. Native interactive click-through remains an explicitly documented validation limit.
- [x] E3: Missing-target observations preserve ambiguous/unavailable states and never execute a command.
  EVIDENCE: Windows checks passed quoted existing, explicit missing, ambiguous unquoted, relative, network and junction targets. Source uses filesystem inspection only; UI exposes all-record status filter and per-match observations. Capture-time observations are excluded from configuration change counts.
- [x] E4: Opt-in bounded folder manifests compare sizes/hashes and do not follow reparse points.
  EVIDENCE: Actual collector lifecycle retained 0/2/1 fixture files and produced one residual; junction trial retained only the in-scope file and reported partial coverage. Source review confirms root/ancestor checks and count/hash byte bounds. Node tests cover file addition/modification/residual.
- [x] E5: Notes, capture context and review decisions survive a portable investigation package and appear in reports.
  EVIDENCE: Browser download/restore preserved three fictional captures, title/notes/context and one decision/reason. Downloaded report contained notes/reason. Unit tests validate orphan references, text limits and escaping; package size capped on both export and import.
- [x] E6: Automated regression tests, real-machine read-only collection and a controlled folder lifecycle pass with documented limits.
  EVIDENCE: npm test passes 13 tests. Windows-Lifecycle.ps1 passes real inventory, sorting regression, target resolution, native UI initialization, folder lifecycle, parser/report integration and junction boundary checks. docs/VERIFICATION.md distinguishes inert file lifecycle from unperformed third-party installer trials.
