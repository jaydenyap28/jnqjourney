#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Workspace,[Parameter(Mandatory)][string]$SupabaseCli,[Parameter(Mandatory)][string]$WranglerCli)
$ErrorActionPreference='Stop'
$repo=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$workspacePath=(Resolve-Path -LiteralPath $Workspace).Path
$root=Join-Path $workspacePath 'production-publisher'
$settings=Get-Content -LiteralPath (Join-Path $root 'settings.json') -Raw | ConvertFrom-Json
if ($settings.projectRef -ne 'vrufunuomioczocdsoer' -or $settings.enabled -ne $false -or $settings.formalPublishingEnabled -ne $false -or $settings.formalWritesEnabled -ne $false -or $settings.formalUploadsEnabled -ne $false) { throw 'FORMAL_OFF_SETTINGS_REQUIRED' }
$name='JnQ Journey Production Publisher'
$existing=Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
if ($existing -and $existing.State -ne 'Disabled') { throw 'FORMAL_TASK_MUST_ALREADY_BE_DISABLED' }
if ($existing -and !$existing.Actions[0].Arguments.Contains('formal-publisher-disabled.mjs') -and !$existing.Actions[0].Arguments.Contains('start-formal-publisher.ps1')) { throw 'UNRELATED_TASK_ACTION_REFUSED' }
$node=(Get-Command node.exe).Source
$supabase=(Resolve-Path -LiteralPath $SupabaseCli).Path
$wrangler=(Resolve-Path -LiteralPath $WranglerCli).Path
if ($supabase -notlike '*.js' -or $wrangler -notlike '*.js') { throw 'EXISTING_CLI_ENTRYPOINTS_REQUIRED' }
$settingsFile=Join-Path $root 'settings.json'
Copy-Item -LiteralPath $settingsFile -Destination (Join-Path $root ('settings.before-prepared-runner-'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff')+'.json'))
$settings | Add-Member -NotePropertyName nodeExe -NotePropertyValue $node -Force
$settings | Add-Member -NotePropertyName supabaseCli -NotePropertyValue $supabase -Force
$settings | Add-Member -NotePropertyName wranglerCli -NotePropertyValue $wrangler -Force
$settings | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $settingsFile
$wrapper=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'start-formal-publisher.ps1')).Path
$action=New-ScheduledTaskAction -Execute (Get-Command pwsh.exe).Source -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -File "'+$wrapper+'" -Workspace "'+$workspacePath+'"') -WorkingDirectory $repo
$user=[Security.Principal.WindowsIdentity]::GetCurrent().Name
$triggers=@((New-ScheduledTaskTrigger -AtLogOn -User $user),(New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)))
$options=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
$options.Enabled=$false
$task=New-ScheduledTask -Action $action -Trigger $triggers -Settings $options -Principal (New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited)
Register-ScheduledTask -TaskName $name -InputObject $task -Force | Out-Null
if ((Get-ScheduledTask -TaskName $name).State -ne 'Disabled') { throw 'FORMAL_TASK_NOT_DISABLED' }
Write-Output 'FORMAL_TASK_PREPARED_DISABLED_NOT_STARTED'
