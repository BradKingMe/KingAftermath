#Requires -Version 5.1
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$run = Join-Path $repo ('test-results\windows-' + [Guid]::NewGuid().ToString('N'))
$tracked = Join-Path $run 'TrackedApp'
[IO.Directory]::CreateDirectory($run) | Out-Null
$collector = Join-Path $repo 'collectors\Capture-KingAftermath.ps1'
$parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($collector,[ref]$null,[ref]$parseErrors)
if ($parseErrors.Count) { throw 'Collector syntax errors.' }
$targetFunction = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Get-TargetObservation' }, $true)
. ([ScriptBlock]::Create($targetFunction.Extent.Text))
$existingPath = Join-Path $run 'existing executable.exe'
[IO.File]::WriteAllText($existingPath, 'inert fixture; never executed')
if ((Get-TargetObservation ('"' + $existingPath + '" --argument')).status -ne 'exists') { throw 'Quoted target resolution failed.' }
if ((Get-TargetObservation (Join-Path $run 'missing.exe') -ExactPath).status -ne 'missing') { throw 'Missing target was not detected.' }
if ((Get-TargetObservation ($existingPath + ' --argument')).status -ne 'unresolved') { throw 'Ambiguous unquoted path was not left unresolved.' }
if ((Get-TargetObservation 'relative.exe --argument').status -ne 'unresolved') { throw 'Relative command was incorrectly resolved.' }
if ((Get-TargetObservation '\\server\share\program.exe' -ExactPath).status -ne 'unresolved') { throw 'Network target was not rejected.' }
& (Join-Path $repo 'collectors\Start-KingAftermath.ps1') -ValidateOnly
function Capture([string]$phase) {
    & $collector -Label "Controlled folder lifecycle - $phase" -OutFile (Join-Path $run "$phase.json") -TrackFolder $tracked -CheckTargets
    if (-not (Test-Path -LiteralPath (Join-Path $run "$phase.json"))) { throw 'Collector did not save a capture.' }
}
# Prove that the ordered-dictionary ID sorting regression cannot silently return.
$control = @([ordered]@{id='a'},[ordered]@{id='b'}) | Sort-Object { $_['id'] } -Unique
if (@($control).Count -ne 2) { throw 'Ordered-dictionary sorting control failed.' }
Capture 'before'
[IO.Directory]::CreateDirectory($tracked) | Out-Null
[IO.File]::WriteAllText((Join-Path $tracked 'program.txt'), 'fictional installed program')
[IO.File]::WriteAllText((Join-Path $tracked 'leftover.txt'), 'fictional leftover')
Capture 'installed'
$removePath = [IO.Path]::GetFullPath((Join-Path $tracked 'program.txt'))
if (-not $removePath.StartsWith($run + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Fixture removal escaped its named workspace.' }
Remove-Item -LiteralPath $removePath
Capture 'uninstalled'
$before = Get-Content -LiteralPath (Join-Path $run 'before.json') -Raw | ConvertFrom-Json
$installed = Get-Content -LiteralPath (Join-Path $run 'installed.json') -Raw | ConvertFrom-Json
$uninstalled = Get-Content -LiteralPath (Join-Path $run 'uninstalled.json') -Raw | ConvertFrom-Json
if (@($before.sections.files.items).Count -ne 0 -or @($installed.sections.files.items).Count -ne 2 -or @($uninstalled.sections.files.items).Count -ne 1) { throw 'Folder lifecycle counts did not match the controlled fixture.' }
if (@(Get-CimInstance Win32_Service).Count -gt 1 -and @($installed.sections.services.items).Count -le 1) { throw 'Service inventory was collapsed to one record.' }
foreach ($path in @('before','installed','uninstalled')) {
    $snapshotPath = Join-Path $run "$path.json"
    & node (Join-Path $repo 'scripts\inspect-snapshot.mjs') $snapshotPath
    if ($LASTEXITCODE -ne 0) { throw 'Node snapshot parser rejected the Windows collector output.' }
}
& node (Join-Path $repo 'scripts\compare.mjs') (Join-Path $run 'before.json') (Join-Path $run 'installed.json') (Join-Path $run 'uninstalled.json') --out (Join-Path $run 'report.html')
if ($LASTEXITCODE -ne 0) { throw 'CLI report generation failed.' }
$outside = Join-Path $run 'OutsideTrackedScope'
[IO.Directory]::CreateDirectory($outside) | Out-Null
[IO.File]::WriteAllText((Join-Path $outside 'must-not-collect.txt'), 'outside the selected root')
$junction = Join-Path $tracked 'junction'
New-Item -ItemType Junction -Path $junction -Target $outside | Out-Null
if ((Get-TargetObservation (Join-Path $junction 'must-not-collect.txt') -ExactPath).status -ne 'unresolved') { throw 'Target checker followed a junction.' }
Capture 'junction'
$junctionCapture = Get-Content -LiteralPath (Join-Path $run 'junction.json') -Raw | ConvertFrom-Json
if ($junctionCapture.sections.files.status -ne 'partial' -or @($junctionCapture.sections.files.items).Count -ne 1 -or @($junctionCapture.sections.files.items | Where-Object { $_.name -eq 'must-not-collect.txt' }).Count) { throw 'Folder collector followed a junction or failed to flag incomplete coverage.' }
Write-Output "WINDOWS LIFECYCLE PASSED: $run"
Write-Output 'Read-only system inventory plus a synthetic folder fixture; no third-party software installed or removed.'
