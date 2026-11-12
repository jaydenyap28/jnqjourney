param(
    [Parameter(Mandatory)][string]$SupabaseCli,
    [Parameter(Mandatory)][string]$WranglerCli
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$node = (Get-Command node.exe).Source
$supabase = (Resolve-Path -LiteralPath $SupabaseCli).Path
$wrangler = (Resolve-Path -LiteralPath $WranglerCli).Path
if ($supabase -notlike '*.js' -or $wrangler -notlike '*.js') { throw 'Expected the existing CLI JavaScript entry points' }
$name = 'JnQ Journey Isolated Publisher'
$wrapper = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'start-admin-publisher.ps1')).Path
$existing = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
if ($existing -and ($existing.Actions.Count -ne 1 -or !$existing.Actions[0].Arguments.Contains($wrapper))) {
    throw 'The task name is already used by another program'
}
if ($existing -and $existing.State -eq 'Running') { throw 'Stop the existing isolated task before changing settings' }
$state = Join-Path $repo 'artifacts/cloudflare-admin-isolated/publisher'
New-Item -ItemType Directory -Path $state -Force | Out-Null
$data = @{
    projectRef = 'rnamstwwbzknwbjwdgrf'
    pagesProject = 'jnqjourney-publish-isolated'
    nodeExe = $node
    supabaseCli = $supabase
    wranglerCli = $wrangler
} | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $state 'settings.json'), $data, [Text.UTF8Encoding]::new($false))
$user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$engine = (Get-Command powershell.exe).Source
$action = New-ScheduledTaskAction -Execute $engine -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -File "' + $wrapper + '"') -WorkingDirectory $repo
$logon = New-ScheduledTaskTrigger -AtLogOn -User $user
$watchdog = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$options = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $name -Action $action -Trigger @($logon, $watchdog) -Principal $principal -Settings $options -Force | Out-Null
Get-ScheduledTask -TaskName $name | Select-Object TaskName, State
