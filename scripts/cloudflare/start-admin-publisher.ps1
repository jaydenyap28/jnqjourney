$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
Set-Location -LiteralPath $repo
$state = Join-Path $repo 'artifacts/cloudflare-admin-isolated/publisher'
$settings = Get-Content -LiteralPath (Join-Path $state 'settings.json') -Raw | ConvertFrom-Json
if ($settings.projectRef -ne 'rnamstwwbzknwbjwdgrf' -or $settings.pagesProject -ne 'jnqjourney-publish-isolated') {
    throw 'Isolated publisher scope mismatch'
}
$mutex = [System.Threading.Mutex]::new($false, 'Local\JNQ.Journey.Isolated.Publisher')
$owned = $false
try {
    try { $owned = $mutex.WaitOne(0) }
    catch [System.Threading.AbandonedMutexException] { $owned = $true }
    if (!$owned) { exit 0 }
    $runner = Join-Path $PSScriptRoot 'run-admin-publication.mjs'
    $child = Start-Process -FilePath $settings.nodeExe -ArgumentList ('"' + $runner + '" --watch rnamstwwbzknwbjwdgrf') `
        -WorkingDirectory $repo -WindowStyle Hidden -Wait -PassThru `
        -RedirectStandardOutput (Join-Path $state 'runner.log') -RedirectStandardError (Join-Path $state 'runner-error.log')
    exit $child.ExitCode
}
finally {
    if ($owned) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
