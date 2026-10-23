#Requires -Version 5.1
<# Local capture UI. No elevation, network listener or installer execution. #>
[CmdletBinding()]param([switch]$ValidateOnly)
$ErrorActionPreference = 'Stop'
if (-not [Environment]::Is64BitProcess) { throw 'Use 64-bit Windows PowerShell.' }
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$collectorPath = Join-Path $PSScriptRoot 'Capture-KingAftermath.ps1'
if (-not (Test-Path -LiteralPath $collectorPath)) { throw 'Keep this launcher next to Capture-KingAftermath.ps1.' }
$repository = Split-Path -Parent $PSScriptRoot
$script:investigationPath = $null; $script:profile = $null; $script:worker = $null; $script:operation = $null
$form = [Windows.Forms.Form]::new(); $form.Text = 'KingAftermath - Capture desk'; $form.Size = [Drawing.Size]::new(760,650); $form.MinimumSize = $form.Size; $form.StartPosition = 'CenterScreen'; $form.Font = [Drawing.Font]::new('Segoe UI',10)
function Label-At([string]$Text, [int]$X, [int]$Y, [int]$W, [int]$H) { $l = [Windows.Forms.Label]::new(); $l.Text = $Text; $l.SetBounds($X,$Y,$W,$H); $form.Controls.Add($l); return $l }
$null = Label-At 'Capture an investigation' 25 20 680 35
$null = Label-At 'Name' 25 65 100 25
$name = [Windows.Forms.TextBox]::new(); $name.SetBounds(125,62,580,28); $form.Controls.Add($name)
$null = Label-At 'Folders (optional, one absolute application folder per line)' 25 105 680 25
$folders = [Windows.Forms.TextBox]::new(); $folders.Multiline = $true; $folders.ScrollBars = 'Vertical'; $folders.SetBounds(25,135,680,85); $form.Controls.Add($folders)
$browse = [Windows.Forms.Button]::new(); $browse.Text = 'Add folder...'; $browse.SetBounds(25,230,130,35); $form.Controls.Add($browse)
$targets = [Windows.Forms.CheckBox]::new(); $targets.Text = 'Check local executable targets (read only)'; $targets.Checked = $true; $targets.SetBounds(180,232,480,30); $form.Controls.Add($targets)
$new = [Windows.Forms.Button]::new(); $new.Text = 'Create investigation'; $new.SetBounds(25,285,220,40); $form.Controls.Add($new)
$open = [Windows.Forms.Button]::new(); $open.Text = 'Resume investigation...'; $open.SetBounds(260,285,230,40); $form.Controls.Add($open)
$show = [Windows.Forms.Button]::new(); $show.Text = 'Open saved captures'; $show.Enabled = $false; $show.SetBounds(505,285,200,40); $form.Controls.Add($show)
$script:captureButtons = @()
foreach ($i in 0..2) {
    $b = [Windows.Forms.Button]::new(); $b.Text = @('1. Before install','2. After install','3. After uninstall')[$i]; $b.Tag = @('before','installed','uninstalled')[$i]; $b.SetBounds((25 + $i*230),350,220,48); $b.Enabled = $false; $form.Controls.Add($b); $script:captureButtons += $b
}
$status = [Windows.Forms.TextBox]::new(); $status.Multiline = $true; $status.ReadOnly = $true; $status.ScrollBars = 'Vertical'; $status.SetBounds(25,420,680,125); $status.Text = 'Create or resume an investigation. Folder scope and target-check preference are fixed when created. Capture JSON stays on this PC.'; $form.Controls.Add($status)
$null = Label-At 'Import the saved JSON files into the local viewer. No software is installed or removed.' 25 560 680 45
function Set-Ready {
    $name.Text = $script:profile.name; $folders.Text = $script:profile.folders -join [Environment]::NewLine; $targets.Checked = $script:profile.checkTargets
    $name.Enabled = $false; $folders.Enabled = $false; $targets.Enabled = $false; $browse.Enabled = $false
    foreach ($b in $script:captureButtons) { $b.Enabled = $true }; $show.Enabled = $true
    $new.Text = 'New investigation'
    $status.Text = "Investigation: $($script:profile.name)`r`nFolder scope locked. Saved to: $script:investigationPath`r`nChoose a capture stage. Existing captures are kept."
}
$browse.Add_Click({ $dialog = [Windows.Forms.FolderBrowserDialog]::new(); try { if ($dialog.ShowDialog() -eq 'OK') { $folders.AppendText($(if ($folders.Text) { [Environment]::NewLine } else { '' }) + $dialog.SelectedPath) } } finally { $dialog.Dispose() } })
$new.Add_Click({
    try {
        if ($script:profile) {
            $script:profile = $null; $script:investigationPath = $null
            $name.Enabled = $true; $folders.Enabled = $true; $targets.Enabled = $true; $browse.Enabled = $true
            $name.Text = ''; $folders.Text = ''; $targets.Checked = $true; $new.Text = 'Create investigation'; $show.Enabled = $false
            foreach ($b in $script:captureButtons) { $b.Enabled = $false }
            $status.Text = 'Previous captures remain saved. Enter a name and folder scope for a new investigation.'
            return
        }
        if ([string]::IsNullOrWhiteSpace($name.Text) -or $name.Text.Length -gt 150) { throw 'Enter an investigation name (1-150 characters).' }
        $roots = @($folders.Lines | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | ForEach-Object { [IO.Path]::GetFullPath($_.Trim()) } | Sort-Object -Unique)
        if ($roots.Count -gt 10) { throw 'Select at most ten folders.' }
        $slug = ($name.Text -replace '[^A-Za-z0-9_-]', '-').Trim('-'); if (-not $slug) { $slug = 'investigation' }
        $slug = $slug.Substring(0,[Math]::Min(50,$slug.Length))
        $script:investigationPath = Join-Path (Join-Path $repository 'captures\investigations') ("$slug-" + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,6))
        [IO.Directory]::CreateDirectory($script:investigationPath) | Out-Null
        $script:profile = [pscustomobject]@{ format = 'kingaftermath.capture-profile'; version = 1; name = $name.Text; folders = $roots; checkTargets = $targets.Checked }
        [IO.File]::WriteAllText((Join-Path $script:investigationPath 'profile.json'), ($script:profile | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
        Set-Ready
    } catch { [Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Cannot create investigation') | Out-Null }
})
$open.Add_Click({
    $dialog = [Windows.Forms.FolderBrowserDialog]::new()
    try {
        if ($dialog.ShowDialog() -ne 'OK') { return }
        $path = Join-Path $dialog.SelectedPath 'profile.json'
        if ((Get-Item -LiteralPath $path).Length -gt 65536) { throw 'Capture profile is too large.' }
        $p = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
        if ($p.format -ne 'kingaftermath.capture-profile' -or $p.version -ne 1 -or $p.name -isnot [string] -or $p.name.Length -gt 150 -or $p.checkTargets -isnot [bool] -or $p.folders -isnot [array] -or $p.folders.Count -gt 10) { throw 'Invalid capture profile.' }
        foreach ($root in $p.folders) { if ($root -isnot [string] -or $root -notmatch '^[A-Za-z]:\\') { throw 'Profile has an invalid local folder path.' } }
        $script:profile = $p; $script:investigationPath = $dialog.SelectedPath; Set-Ready
    } catch { [Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Cannot resume investigation') | Out-Null }
    finally { $dialog.Dispose() }
})
$show.Add_Click({ if ($script:investigationPath) { [Diagnostics.Process]::Start('explorer.exe', ('"' + $script:investigationPath + '"')) | Out-Null } })
$timer = [Windows.Forms.Timer]::new(); $timer.Interval = 300
$timer.Add_Tick({
    if ($script:operation -and $script:operation.IsCompleted) {
        $timer.Stop()
        try {
            $null = $script:worker.EndInvoke($script:operation)
            if ($script:worker.HadErrors) { throw (($script:worker.Streams.Error | ForEach-Object { $_.ToString() }) -join "`r`n") }
            $status.Text = "Capture saved:`r`n$script:activeOutput`r`nImport this JSON in the viewer. Review coverage there."
        } catch { $status.Text = "Capture failed: $($_.Exception.Message)" }
        finally { $script:worker.Dispose(); $script:worker = $null; $script:operation = $null; foreach ($b in $script:captureButtons) { $b.Enabled = $true }; $new.Enabled = $true; $open.Enabled = $true; $show.Enabled = $true }
    }
})
foreach ($button in $script:captureButtons) {
    $button.Add_Click({
        try {
            $phase = [string]$this.Tag
            $script:activeOutput = Join-Path $script:investigationPath ("$phase-" + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff') + '.json')
            $script:worker = [PowerShell]::Create()
            $null = $script:worker.AddCommand($collectorPath).AddParameter('Label', "$($script:profile.name) - $phase").AddParameter('OutFile', $script:activeOutput).AddParameter('TrackFolder', [string[]]$script:profile.folders).AddParameter('CheckTargets', [bool]$script:profile.checkTargets)
            foreach ($b in $script:captureButtons) { $b.Enabled = $false }; $new.Enabled = $false; $open.Enabled = $false; $show.Enabled = $false
            $status.Text = 'Collecting local configuration. This may take a minute. No system settings are changed.'
            $script:operation = $script:worker.BeginInvoke(); $timer.Start()
        } catch { $status.Text = $_.Exception.Message; if ($script:worker) { $script:worker.Dispose(); $script:worker = $null }; foreach ($b in $script:captureButtons) { $b.Enabled = $true }; $new.Enabled = $true; $open.Enabled = $true; $show.Enabled = $true }
    })
}
$form.Add_FormClosing({ if ($script:worker) { $script:worker.Stop(); $script:worker.Dispose() }; $timer.Stop(); $timer.Dispose() })
if ($ValidateOnly) { Write-Output "CAPTURE DESK INITIALIZED: $($script:captureButtons.Count) capture stages"; $timer.Dispose() }
else { [Windows.Forms.Application]::Run($form) }
$form.Dispose()
