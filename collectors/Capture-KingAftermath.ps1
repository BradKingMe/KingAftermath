#Requires -Version 5.1
<#
.SYNOPSIS
Reads Windows configuration into a KingAftermath snapshot. No configuration is changed.
.EXAMPLE
.\collectors\Capture-KingAftermath.ps1 -Label "Before install" -OutFile .\captures\before.json
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidateLength(1,200)][string]$Label,
    [Parameter(Mandatory = $true)][string]$OutFile,
    [string[]]$TrackFolder = @(),
    [switch]$CheckTargets
)
$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne 'Win32NT') { throw 'This collector requires Windows.' }
if (-not [Environment]::Is64BitProcess) { throw 'Run this collector in 64-bit Windows PowerShell or PowerShell 7.' }
$captureStarted = [DateTime]::UtcNow.ToString('o')
$trackedRoots = @($TrackFolder | ForEach-Object {
    if ([string]::IsNullOrWhiteSpace($_) -or $_ -notmatch '^[A-Za-z]:\\') { throw 'Tracked folders must be explicit local absolute paths.' }
    $p = [IO.Path]::GetFullPath($_).TrimEnd('\')
    if ($p -notmatch '^[A-Za-z]:\\.+' -or $p -eq [IO.Path]::GetPathRoot($p).TrimEnd('\')) { throw 'Select specific local folders, not drive roots or network paths.' }
    if ($p.Length -gt 4000) { throw 'Tracked folder path is too long.' }
    foreach ($blocked in @($env:WINDIR, $env:USERPROFILE, $env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:ProgramData)) {
        if ($blocked -and $p -ieq $blocked.TrimEnd('\')) { throw 'Choose an application subfolder, not a Windows, profile, Program Files or ProgramData root.' }
    }
    $p.ToLowerInvariant()
} | Sort-Object -Unique)
if ($trackedRoots.Count -gt 10) { throw 'Select at most ten folders.' }
$script:sections = [ordered]@{}
foreach ($kind in @('apps', 'startup', 'services', 'tasks', 'files')) {
    $script:sections[$kind] = [ordered]@{ status = 'complete'; warnings = [Collections.Generic.List[string]]::new(); items = [Collections.Generic.List[object]]::new() }
}
if ($trackedRoots.Count -eq 0) { $script:sections.files.status = 'not-collected' }
function Get-TargetObservation([string]$Command, [switch]$ExactPath) {
    $observation = [ordered]@{ input = $Command; path = ''; status = 'unresolved'; reason = '' }
    $expanded = [Environment]::ExpandEnvironmentVariables($Command).Trim()
    $target = ''
    if ($expanded -match '^"([^"]+)"(?:\s|$)') { $target = $Matches[1] }
    elseif ($ExactPath -and $expanded -notmatch '"') { $target = $expanded }
    elseif ($expanded -match '^([^\s"]+\.(?:exe|com|cmd|bat|ps1))(?:\s|$)') { $target = $Matches[1] }
    else { $observation.reason = 'Ambiguous or unsupported command syntax; no path was checked.'; return $observation }
    if ($target -notmatch '^[a-zA-Z]:\\' -or $target -match '[%*?]' -or $target -match '^\\\\') { $observation.reason = 'Only explicit local absolute paths are checked. Relative paths, environment leftovers and network paths are unresolved.'; return $observation }
    try {
        $target = [IO.Path]::GetFullPath($target)
        $observation.path = $target
        # Do not traverse junctions or symlinks, including ancestor directories.
        $cursor = $target
        while ($cursor -and $cursor -ne [IO.Path]::GetPathRoot($cursor)) {
            if (Test-Path -LiteralPath $cursor -ErrorAction Stop) {
                if ((Get-Item -LiteralPath $cursor -Force -ErrorAction Stop).Attributes -band [IO.FileAttributes]::ReparsePoint) { $observation.reason = 'Reparse point in target path; not followed.'; return $observation }
            }
            $cursor = [IO.Path]::GetDirectoryName($cursor)
        }
        if (Test-Path -LiteralPath $target -PathType Leaf -ErrorAction Stop) { $observation.status = 'exists'; $observation.reason = 'Local file existed at capture time. Arguments, scripts and payloads were not inspected.' }
        elseif (Test-Path -LiteralPath $target -ErrorAction Stop) { $observation.reason = 'Path is not a regular file.' }
        else { $observation.status = 'missing'; $observation.reason = 'Local target was not found at capture time. This is not proof that removal is safe.' }
    } catch { $observation.status = 'inaccessible'; $observation.reason = 'Target could not be inspected with this account.' }
    $observation
}
function Warn-Section([string]$Kind, [string]$Message) {
    $script:sections[$Kind].status = 'partial'
    if ($script:sections[$Kind].warnings.Count -lt 100) { $script:sections[$Kind].warnings.Add($Message.Substring(0, [Math]::Min(2000, $Message.Length))) }
}
function Add-Record([string]$Kind, [string]$Id, [string]$Name, [string]$Source, $Fields) {
    if ($script:sections[$Kind].items.Count -ge 20000) {
        if (-not ($script:sections[$Kind].warnings -contains 'The 20,000-record limit was reached. Additional records were not retained.')) { Warn-Section $Kind 'The 20,000-record limit was reached. Additional records were not retained.' }
        return
    }
    $normalized = [ordered]@{}
    foreach ($key in $Fields.Keys) {
        $value = [string]$Fields[$key]
        if ($value.Length -gt 32768) { Warn-Section $Kind 'A field exceeded 32,768 characters and its record was skipped.'; return }
        $normalized[$key] = $value
    }
    if ($Id.Length -gt 4096 -or $Name.Length -gt 2000 -or $Source.Length -gt 4096) { Warn-Section $Kind 'An oversized record was skipped.'; return }
    $targets = @()
    if ($CheckTargets) {
        if ($Kind -eq 'startup' -and $normalized.Contains('Command')) { $targets += Get-TargetObservation $normalized.Command }
        if ($Kind -eq 'services') { $targets += Get-TargetObservation $normalized.Executable }
        if ($Kind -eq 'tasks') {
            foreach ($action in (ConvertFrom-Json -InputObject $normalized.Actions)) {
                if ($action.Execute) { $targets += Get-TargetObservation ([string]$action.Execute) -ExactPath }
            }
        }
    }
    $script:sections[$Kind].items.Add([ordered]@{ id = $Id.ToLowerInvariant(); name = $Name; source = $Source; fields = $normalized; targets = $targets })
}
function Hash-Text([string]$Text) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Text)))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
}
$machineGuid = [string](Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Cryptography' -Name MachineGuid).MachineGuid
if (-not $machineGuid) { throw 'Cannot establish a stable machine identity.' }
$userSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
$privilege = if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { 'elevated' } else { 'standard' }
$machine = [ordered]@{
    id = Hash-Text $machineGuid
    userId = Hash-Text $userSid
    name = [Environment]::MachineName
    os = [Environment]::OSVersion.VersionString
    scope = "windows64-current-user-and-machine-v2-$privilege-targets$([bool]$CheckTargets)-$(Hash-Text ($trackedRoots -join '|'))"
}
# Registry views are explicit, so 32-bit and 64-bit application records stay distinct.
foreach ($hiveName in @('LocalMachine', 'CurrentUser')) {
    foreach ($viewName in @('Registry64', 'Registry32')) {
        $base = $null
        try {
            $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::$hiveName, [Microsoft.Win32.RegistryView]::$viewName)
            $location = 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall'
            $root = $base.OpenSubKey($location, $false)
            if ($null -ne $root) {
                try {
                    foreach ($subName in $root.GetSubKeyNames()) {
                        $item = $null
                        try {
                            $item = $root.OpenSubKey($subName, $false)
                            if ($null -eq $item) { throw 'Registry entry disappeared during capture.' }
                            $name = [string]$item.GetValue('DisplayName')
                            if ($name) {
                                $source = "$hiveName/$viewName/$location/$subName"
                                Add-Record 'apps' $source $name $source ([ordered]@{
                                    Version = $item.GetValue('DisplayVersion'); Publisher = $item.GetValue('Publisher')
                                    InstallLocation = $item.GetValue('InstallLocation'); UninstallCommand = $item.GetValue('UninstallString')
                                    SystemComponent = $item.GetValue('SystemComponent')
                                })
                            }
                        } catch { Warn-Section 'apps' "Could not read $hiveName/$viewName application entry: $($_.Exception.Message)" }
                        finally { if ($null -ne $item) { $item.Dispose() } }
                    }
                } finally { $root.Dispose() }
            }
        } catch { Warn-Section 'apps' "Could not enumerate $hiveName/$viewName uninstall registry: $($_.Exception.Message)" }
        finally { if ($null -ne $base) { $base.Dispose() } }
        foreach ($runKey in @('Run', 'RunOnce')) {
            $base = $null; $root = $null
            try {
                $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::$hiveName, [Microsoft.Win32.RegistryView]::$viewName)
                $location = "SOFTWARE\Microsoft\Windows\CurrentVersion\$runKey"
                $root = $base.OpenSubKey($location, $false)
                if ($null -eq $root) { continue }
                foreach ($valueName in $root.GetValueNames()) {
                    try {
                        $value = $root.GetValue($valueName, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
                        $source = "$hiveName/$viewName/$location"
                        Add-Record 'startup' "$source/$valueName" $valueName $source ([ordered]@{
                            Command = if ($value -is [array]) { ConvertTo-Json -InputObject $value -Compress } else { [string]$value }
                            RegistryType = [string]$root.GetValueKind($valueName)
                        })
                    } catch { Warn-Section 'startup' "Could not read $hiveName/$viewName startup value: $($_.Exception.Message)" }
                }
            } catch { Warn-Section 'startup' "Could not enumerate $hiveName/$viewName/$runKey`: $($_.Exception.Message)" }
            finally { if ($null -ne $root) { $root.Dispose() }; if ($null -ne $base) { $base.Dispose() } }
        }
    }
}
# Enumerate startup folder files without opening shortcuts or executing their targets.
foreach ($folderName in @('Startup', 'CommonStartup')) {
    try {
        $folder = [Environment]::GetFolderPath([Environment+SpecialFolder]::$folderName)
        if (-not $folder) { throw 'Windows did not return a startup folder path.' }
        if (-not (Test-Path -LiteralPath $folder)) { continue }
        foreach ($file in Get-ChildItem -LiteralPath $folder -File -Force) {
            try {
                Add-Record 'startup' "file:$($file.FullName)" $file.Name $folder ([ordered]@{
                    FilePath = $file.FullName; SHA256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
                })
            } catch { Warn-Section 'startup' "Could not read a $folderName file: $($_.Exception.Message)" }
        }
    } catch { Warn-Section 'startup' "Could not enumerate $folderName`: $($_.Exception.Message)" }
}
try {
    foreach ($service in Get-CimInstance -ClassName Win32_Service) {
        Add-Record 'services' $service.Name $service.DisplayName 'CIM:Win32_Service' ([ordered]@{
            ServiceName = $service.Name; Executable = $service.PathName; StartMode = $service.StartMode
            Account = $service.StartName; Description = $service.Description; ServiceType = $service.ServiceType
        })
    }
} catch { Warn-Section 'services' "Service collection was incomplete: $($_.Exception.Message)" }
try {
    foreach ($task in Get-ScheduledTask) {
        try {
            $actions = @($task.Actions | ForEach-Object { [ordered]@{
                Type = $_.CimClass.CimClassName; Execute = [string]$_.Execute; Arguments = [string]$_.Arguments
                WorkingDirectory = [string]$_.WorkingDirectory; ClassId = [string]$_.ClassId; Data = [string]$_.Data
            } })
            $triggers = @($task.Triggers | ForEach-Object {
                $trigger = [ordered]@{ Type = $_.CimClass.CimClassName }
                foreach ($p in @('Enabled','StartBoundary','EndBoundary','Delay','RandomDelay','DaysInterval','WeeksInterval','DaysOfWeek','DaysOfMonth','MonthsOfYear','UserId','Subscription','StateChange','ExecutionTimeLimit','RunOnLastDayOfMonth','RunOnLastWeekOfMonth','WeeksOfMonth')) {
                    $trigger[$p] = [string]$_.$p
                }
                $trigger['RepetitionInterval'] = [string]$_.Repetition.Interval
                $trigger['RepetitionDuration'] = [string]$_.Repetition.Duration
                $trigger['RepetitionStopAtDurationEnd'] = [string]$_.Repetition.StopAtDurationEnd
                $trigger
            })
            Add-Record 'tasks' "$($task.TaskPath)$($task.TaskName)" $task.TaskName $task.TaskPath ([ordered]@{
                Actions = ConvertTo-Json -InputObject $actions -Depth 8 -Compress
                Triggers = ConvertTo-Json -InputObject $triggers -Depth 8 -Compress
                Account = $task.Principal.UserId; Group = $task.Principal.GroupId; RunLevel = $task.Principal.RunLevel
                LogonType = $task.Principal.LogonType; Enabled = $task.Settings.Enabled; Hidden = $task.Settings.Hidden
                Description = $task.Description; Author = $task.Author
            })
        } catch { Warn-Section 'tasks' "Could not read task $($task.TaskPath)$($task.TaskName): $($_.Exception.Message)" }
    }
} catch { Warn-Section 'tasks' "Scheduled-task collection was incomplete: $($_.Exception.Message)" }
# Explicitly bounded file manifests. No directory or file reparse points are followed.
$fileCount = 0; $visitedCount = 0; $hashBytes = 0L
foreach ($trackedRoot in $trackedRoots) {
    try {
        $ancestor = $trackedRoot
        while ($ancestor -and $ancestor -ne [IO.Path]::GetPathRoot($ancestor)) {
            if ((Test-Path -LiteralPath $ancestor) -and ((Get-Item -LiteralPath $ancestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Tracked folder has a reparse point ancestor.' }
            $ancestor = [IO.Path]::GetDirectoryName($ancestor)
        }
        if (-not (Test-Path -LiteralPath $trackedRoot)) { continue }
        if (-not (Test-Path -LiteralPath $trackedRoot -PathType Container)) { throw 'Tracked root is not a directory.' }
        $stack = [Collections.Generic.Stack[string]]::new(); $stack.Push($trackedRoot)
        while ($stack.Count -gt 0) {
            if ($visitedCount -ge 20000 -or $fileCount -ge 5000) { Warn-Section 'files' 'Folder traversal cap reached (20,000 entries / 5,000 files).'; break }
            $directory = $stack.Pop()
            try {
                foreach ($entry in Get-ChildItem -LiteralPath $directory -Force) {
                    $visitedCount++
                    if ($visitedCount -gt 20000 -or $fileCount -ge 5000) { Warn-Section 'files' 'Folder traversal cap reached (20,000 entries / 5,000 files).'; break }
                    if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { Warn-Section 'files' 'A reparse point was skipped.'; continue }
                    if ($entry.PSIsContainer) { $stack.Push($entry.FullName); continue }
                    $fileCount++
                    $hash = ''; $hashStatus = 'hashed'
                    if ($entry.Length -gt 64MB -or ($hashBytes + $entry.Length) -gt 512MB) { $hashStatus = 'size-limit'; Warn-Section 'files' 'Hash limit reached (64 MB per file / 512 MB per capture). Size-only records retained.' }
                    else {
                        try { $hash = (Get-FileHash -LiteralPath $entry.FullName -Algorithm SHA256).Hash.ToLowerInvariant(); $hashBytes += $entry.Length }
                        catch { $hashStatus = 'unreadable'; Warn-Section 'files' 'A file could not be hashed.' }
                    }
                    Add-Record 'files' $entry.FullName $entry.Name $trackedRoot ([ordered]@{ FilePath = $entry.FullName; Size = [string]$entry.Length; SHA256 = $hash; HashStatus = $hashStatus })
                }
            } catch { Warn-Section 'files' 'A tracked directory could not be enumerated.' }
        }
    } catch { Warn-Section 'files' "Tracked folder was not fully collected: $($_.Exception.Message)" }
}
foreach ($kind in @('apps','startup','services','tasks','files')) {
    if ($script:sections[$kind].status -eq 'partial' -and $script:sections[$kind].items.Count -eq 0) { $script:sections[$kind].status = 'failed' }
    # Sort stable identities; observations in different registry views keep distinct IDs.
    $script:sections[$kind].items = @($script:sections[$kind].items | Sort-Object { $_['id'] } -Unique)
    $script:sections[$kind].warnings = @($script:sections[$kind].warnings)
}
$snapshot = [ordered]@{
    format = 'kingaftermath.snapshot'; version = 2; collector = 'windows-0.2.0'
    id = [Guid]::NewGuid().ToString(); label = $Label; capturedAt = $captureStarted
    machine = $machine; tracking = $trackedRoots; sections = $script:sections
}
$json = ConvertTo-Json -InputObject $snapshot -Depth 20
$bytes = [Text.UTF8Encoding]::new($false).GetBytes($json)
if ($bytes.Length -gt 25MB) { throw 'Snapshot exceeds the viewer limit of 25 MB. No file was written.' }
$outputPath = [IO.Path]::GetFullPath($OutFile)
$parent = [IO.Path]::GetDirectoryName($outputPath)
[IO.Directory]::CreateDirectory($parent) | Out-Null
$stream = [IO.File]::Open($outputPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
Write-Host "Saved snapshot: $outputPath"
foreach ($kind in @('apps','startup','services','tasks','files')) { Write-Host "$kind`: $($script:sections[$kind].items.Count) records, $($script:sections[$kind].status)" }
Write-Host 'Contains local paths and command arguments. Review before sharing. No system settings changed.'
