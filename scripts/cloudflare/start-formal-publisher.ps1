#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Workspace)
$ErrorActionPreference='Stop'
$repo=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$root=Join-Path (Resolve-Path -LiteralPath $Workspace).Path 'production-publisher'
$settings=Get-Content -LiteralPath (Join-Path $root 'settings.json') -Raw | ConvertFrom-Json
if ($settings.projectRef -ne 'vrufunuomioczocdsoer' -or $settings.enabled -ne $true -or $settings.formalPublishingEnabled -ne $true) { throw 'FORMAL_PUBLISHER_OFF' }
$mutex=[Threading.Mutex]::new($false,'Local\JNQ.Journey.Formal.Publisher')
$owned=$false
try {
  try { $owned=$mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $owned=$true }
  if (!$owned) { exit 0 }
  $env:JNQ_RECOVERY_WORKSPACE=$Workspace
  $process=Start-Process -FilePath $settings.nodeExe -ArgumentList ('"'+(Join-Path $PSScriptRoot 'run-formal-publication.mjs')+'" --watch vrufunuomioczocdsoer') -WorkingDirectory $repo -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput (Join-Path $root 'runner.log') -RedirectStandardError (Join-Path $root 'runner-error.log')
  exit $process.ExitCode
} finally { if ($owned) { $mutex.ReleaseMutex() }; $mutex.Dispose() }
