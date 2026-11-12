#requires -Version 7.0
# Run interactively as the existing Windows user. No password arguments/files.
# Only uses existing verified backups; never connects to a database.
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$SourceRoot,
  [Parameter(Mandatory)][string]$NasTarget,
  [Parameter(Mandatory)][string]$ExpectedShare,
  [Parameter(Mandatory)][string]$NasPermissionEvidence
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'formal-nas-policy.ps1')
$gpgPath = 'C:\Program Files\Git\usr\bin\gpg.exe'
if (!(Test-Path -LiteralPath $gpgPath -PathType Leaf)) { throw 'EXISTING_GPG_REQUIRED_NO_AUTO_INSTALL' }
if (![IO.Path]::IsPathFullyQualified($sourceRoot) -or ![IO.Path]::IsPathFullyQualified($nasTarget) -or !$ExpectedShare.StartsWith('\\')) { throw 'ABSOLUTE_APPROVED_PATHS_REQUIRED' }
$nasDrive = [IO.Path]::GetPathRoot($nasTarget).TrimEnd('\').TrimEnd(':')
$sourceDrive = [IO.Path]::GetPathRoot($sourceRoot).TrimEnd('\').TrimEnd(':')
if ((Get-PSDrive $nasDrive).DisplayRoot -ne $ExpectedShare) { throw 'NAS_MAPPING_CHANGED' }
if (!(Test-Path -LiteralPath $nasTarget -PathType Container)) { throw 'NAS_TARGET_MISSING' }
$localAcl = Get-Acl -LiteralPath $sourceRoot
$localUser = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
if (!$localAcl.AreAccessRulesProtected) { throw 'LOCAL_PRIVATE_ACL_REQUIRED' }
foreach ($rule in $localAcl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
  if ($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin @($localUser,'S-1-5-18')) { throw 'LOCAL_PRIVATE_ACL_REQUIRED' }
}
$sourceAbsolute = [IO.Path]::GetFullPath($sourceRoot).TrimEnd('\')
$evidenceAbsolute = [IO.Path]::GetFullPath($NasPermissionEvidence)
if (!$evidenceAbsolute.StartsWith($sourceAbsolute + '\',[StringComparison]::OrdinalIgnoreCase)) { throw 'PRIVACY_EVIDENCE_MUST_BE_IN_PRIVATE_LOCAL_ROOT' }
$evidenceAcl = Get-Acl -LiteralPath $evidenceAbsolute
foreach ($rule in $evidenceAcl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
  if ($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin @($localUser,'S-1-5-18')) { throw 'PRIVACY_EVIDENCE_FILE_NOT_PRIVATE' }
}
$privacy = Get-Content -LiteralPath $evidenceAbsolute -Raw | ConvertFrom-Json
Assert-JnQNasPrivacyEvidence $privacy $nasTarget $ExpectedShare
if ((Get-Item -LiteralPath $nasTarget).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'NAS_TARGET_REPARSE_POINT_REFUSED' }
# Approval and effective-access evidence are required before ANY NAS writes.
$database = 'postgres-logical-2026-11-12T03-20-25-865Z'
$dbManifest = Get-Content -LiteralPath (Join-Path $sourceRoot "$database\manifest.json") -Raw | ConvertFrom-Json
if ($dbManifest.projectRef -ne 'vrufunuomioczocdsoer') { throw 'BACKUP_PROJECT_MISMATCH' }
foreach ($item in $dbManifest.files.PSObject.Properties) {
  $file = Join-Path $sourceRoot "$database\$($item.Name)"
  if ((Get-Item -LiteralPath $file).Length -ne $item.Value.bytes -or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $item.Value.sha256) { throw 'DATABASE_BACKUP_HASH_MISMATCH' }
}
$static = Get-Content -LiteralPath (Join-Path $sourceRoot 'static-backup-result.json') -Raw | ConvertFrom-Json
if ((Get-FileHash -LiteralPath (Join-Path $sourceRoot 'production-static.tar') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $static.archiveSha256) { throw 'STATIC_ARCHIVE_HASH_MISMATCH' }
if ((Get-FileHash -LiteralPath (Join-Path $sourceRoot 'media-map.json') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $static.mediaMapSha256) { throw 'MEDIA_MAP_HASH_MISMATCH' }
$sources = @($database,'authority-backup','media-exceptions-backup','production-static.tar','media-map.json','static-backup-result.json',
  'postgres-restore-2026-11-12T03-33-28-425Z\restore-result.json',
  'production-publisher\formal-platform-config-20261112.json','production-publisher\formal-platform-config-20261112.sha256',
  'production-publisher\settings.json','production-publisher\verified-operator-allowlists.json',
  'production-publisher\read-only-edge-deployment.json','production-publisher\read-only-pages-deployment.json')
# Explicit inclusion prevents runner credentials, DB passwords and build caches
# from being swept into an offsite archive.
$bytes = 0L
foreach ($name in $sources) {
  $entry = Get-Item -LiteralPath (Join-Path $sourceRoot $name)
  if ($entry.PSIsContainer) { $bytes += (Get-ChildItem -LiteralPath $entry.FullName -Recurse -File | Measure-Object Length -Sum).Sum }
  else { $bytes += $entry.Length }
}
if ((Get-PSDrive $sourceDrive).Free -lt ($bytes * 2 + 1GB) -or (Get-PSDrive $nasDrive).Free -lt ($bytes + 1GB)) { throw 'BACKUP_CAPACITY_INSUFFICIENT' }
$run = Join-Path $sourceRoot ('nas-encrypted-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ'))
New-Item -ItemType Directory -Path $run -ErrorAction Stop | Out-Null
$archive = Join-Path $run 'production-recovery.tar'
& tar.exe -cf $archive -C $sourceRoot @sources
if ($LASTEXITCODE -ne 0) { throw 'ARCHIVE_CREATION_FAILED' }
$cipher = $archive + '.gpg'
$archiveDigest = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Host 'Set a new backup passphrase here. Do not paste it into chat. Keep it separately from the NAS archive.'
$first = Read-Host 'Backup passphrase' -AsSecureString
$second = Read-Host 'Confirm passphrase' -AsSecureString
$firstPtr = [IntPtr]::Zero; $secondPtr = [IntPtr]::Zero
$firstChars = $null; $secondChars = $null
try {
  $firstPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($first)
  $secondPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($second)
  $firstChars = New-Object char[] $first.Length
  $secondChars = New-Object char[] $second.Length
  for ($i=0; $i -lt $first.Length; $i++) { $firstChars[$i] = [char][Runtime.InteropServices.Marshal]::ReadInt16($firstPtr,2*$i) }
  for ($i=0; $i -lt $second.Length; $i++) { $secondChars[$i] = [char][Runtime.InteropServices.Marshal]::ReadInt16($secondPtr,2*$i) }
  if ($first.Length -lt 16 -or $first.Length -ne $second.Length) { throw 'PASSPHRASE_TOO_SHORT_OR_MISMATCH' }
  for ($i=0; $i -lt $first.Length; $i++) { if ($firstChars[$i] -ne $secondChars[$i] -or $firstChars[$i] -in @([char]10,[char]13,[char]0)) { throw 'PASSPHRASE_MISMATCH' } }
  $info = New-Object Diagnostics.ProcessStartInfo
  $info.FileName = $gpgPath; $info.UseShellExecute = $false; $info.CreateNoWindow = $true
  $info.RedirectStandardInput = $true; $info.RedirectStandardError = $true; $info.RedirectStandardOutput = $true
  foreach ($argument in @('--batch','--no-tty','--no-symkey-cache','--pinentry-mode','loopback','--passphrase-fd','0','--cipher-algo','AES256','--compress-algo','none','--symmetric','--output',$cipher,$archive)) { $info.ArgumentList.Add($argument) }
  $process = [Diagnostics.Process]::Start($info)
  $stderr = $process.StandardError.ReadToEndAsync(); $stdout = $process.StandardOutput.ReadToEndAsync()
  $process.StandardInput.Write($firstChars,0,$firstChars.Length); $process.StandardInput.WriteLine(); $process.StandardInput.Close()
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) { throw 'GPG_ENCRYPTION_FAILED_NO_TRANSFER' }
} finally {
  if ($firstChars) { [Array]::Clear($firstChars,0,$firstChars.Length) }
  if ($secondChars) { [Array]::Clear($secondChars,0,$secondChars.Length) }
  if ($firstPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($firstPtr) }
  if ($secondPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secondPtr) }
  $first.Dispose(); $second.Dispose()
}
$digest = (Get-FileHash -LiteralPath $cipher -Algorithm SHA256).Hash.ToLowerInvariant()
$filename = (Split-Path -Leaf $run) + '.tar.gpg'
$partial = Join-Path $nasTarget ($filename + '.partial')
$destination = Join-Path $nasTarget $filename
if ((Test-Path -LiteralPath $partial) -or (Test-Path -LiteralPath $destination)) { throw 'NAS_FILE_ALREADY_EXISTS_RECONCILE' }
# Recheck the same approval and mapping immediately before transferring bytes.
if ((Get-PSDrive $nasDrive).DisplayRoot -ne $ExpectedShare) { throw 'NAS_MAPPING_CHANGED' }
Assert-JnQNasPrivacyEvidence $privacy $nasTarget $ExpectedShare
$sourceStream = [IO.File]::OpenRead($cipher)
$nasStream = $null
try {
  $nasStream = [IO.File]::Open($partial,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  $sourceStream.CopyTo($nasStream,131072)
  $nasStream.Flush()
} finally {
  if ($nasStream) { $nasStream.Dispose() }
  $sourceStream.Dispose()
}
if ((Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash.ToLowerInvariant() -ne $digest) { throw 'NAS_READBACK_HASH_MISMATCH' }
Move-Item -LiteralPath $partial -Destination $destination
[IO.File]::WriteAllText(($destination + '.sha256'), "$digest  $filename`n", [Text.UTF8Encoding]::new($false))
$receipt = @{encrypted=$true;cipher='AES256';archiveBytes=(Get-Item -LiteralPath $archive).Length;archiveSha256=$archiveDigest;encryptedBytes=(Get-Item -LiteralPath $cipher).Length;sha256=$digest;nasReadbackVerified=$true;independentDeviceRestore='PENDING';databaseDumpRepeated=$false;temporaryPlaintextRemoved=$false}
$receipt | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $run 'receipt.json')
# Only this invocation's temporary archive. Original backups are retained.
Assert-JnQTemporaryArchivePath $sourceRoot $run $archive
if ((Get-Item -LiteralPath $run).Attributes -band [IO.FileAttributes]::ReparsePoint -or
    (Get-Item -LiteralPath $archive).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'TEMPORARY_ARCHIVE_REPARSE_POINT_REFUSED' }
Remove-Item -LiteralPath $archive
$receipt.temporaryPlaintextRemoved = !(Test-Path -LiteralPath $archive)
$receipt | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $run 'receipt.json')
Write-Host 'Encrypted NAS copy and SHA-256 read-back verified. Independent-device recovery is still pending.'
