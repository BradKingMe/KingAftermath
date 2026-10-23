# Roadmap

## 0.1 — Local foundation

- Four-source read-only Windows collector.
- Two- and three-capture comparisons with source coverage.
- Browser explorer, fictional walkthrough and standalone HTML reports.
- CLI using the same domain logic as the browser.

## Implemented in 0.2

- Single-capture app investigation with explicit matching reasons and footprint map.
- Native capture desk with named profiles and fixed capture scope.
- Executable target checks and all-record target-health filter.
- Bounded opt-in folder manifests with hashes and reparse-point exclusion.
- Notes, capture context, per-record decisions and portable investigation packages.
- Automated parser/comparison/report/CLI/server tests and Windows folder/target lifecycle checks.

## Next: confidence before wider distribution

- Independent interactive exercise of the capture desk.
- Third-party installer trials in a disposable VM, across accounts/elevation levels and PowerShell editions.
- Signed release artifacts and documented packaging.
- Accessible keyboard and assistive-technology review with real users.

## Potential extensions

- Browser extension inventory without collecting browsing data.
- Exact task XML evidence alongside readable selected fields.
- Local capture history with deliberate storage controls and encryption options.

No automatic cleanup or installer ownership claims are planned without a stronger evidence model and separate, explicit user approval.
