$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '..\scripts\cloudflare\formal-nas-policy.ps1')
$now=[DateTimeOffset]::Parse('2026-11-12T08:00:00Z')
$target='Z:\synthetic\private-backup'
$share='\\synthetic-nas\private'
$evidence=@{schemaVersion=1;source='NAS_UI_AND_ACCESS_TESTS';userApproved=$true;target=$target;share=$share;
  permissionModel='weline-personal-space';account='synthetic-owner';onlyNamedAccountHasAccess=$true;
  publicAndGroupSpaceExcluded=$true;sharingLinksDisabled=$true;guestAccess='denied-tested';
  nonOwnerAccess='denied-tested';ownerReadWrite='tested';confirmedAt='2026-11-12T07:00:00Z'}
$count=0
function MustReject([scriptblock]$Action) { $failed=$false; try { & $Action } catch { $failed=$true }; if (!$failed) { throw 'SECURITY_ASSERTION_ACCEPTED_UNPROVEN_TARGET' } }
Assert-JnQNasPrivacyEvidence $evidence $target $share $now; $count++
$copy=$evidence.Clone(); $copy.userApproved='true'
MustReject { Assert-JnQNasPrivacyEvidence $copy $target $share $now }; $count++
foreach ($field in @('userApproved','onlyNamedAccountHasAccess','publicAndGroupSpaceExcluded','sharingLinksDisabled')) {
  $copy=$evidence.Clone(); $copy[$field]=$false
  MustReject { Assert-JnQNasPrivacyEvidence $copy $target $share $now }; $count++
}
foreach ($field in @('guestAccess','nonOwnerAccess','ownerReadWrite')) {
  $copy=$evidence.Clone(); $copy[$field]='UNKNOWN'
  MustReject { Assert-JnQNasPrivacyEvidence $copy $target $share $now }; $count++
}
MustReject { Assert-JnQNasPrivacyEvidence $null $target $share $now }; $count++
MustReject { Assert-JnQNasPrivacyEvidence $evidence 'Z:\other' $share $now }; $count++
MustReject { Assert-JnQNasPrivacyEvidence $evidence $target '\\other\public' $now }; $count++
MustReject { Assert-JnQNasPrivacyEvidence $evidence $target $share ($now.AddDays(2)) }; $count++
$copy=$evidence.Clone(); $copy.permissionModel='private-smb-share'; $copy.nonOwnerAccess='no-other-enabled-accounts-ui-verified'
Assert-JnQNasPrivacyEvidence $copy $target $share $now; $count++
# No SID lookup is needed, but unknown permissions can never substitute for it.
Assert-JnQTemporaryArchivePath 'E:\synthetic-private' 'E:\synthetic-private\nas-encrypted-20261112T080000Z' 'E:\synthetic-private\nas-encrypted-20261112T080000Z\production-recovery.tar'; $count++
MustReject { Assert-JnQTemporaryArchivePath 'E:\synthetic-private' 'E:\other\nas-encrypted-20261112T080000Z' 'E:\other\nas-encrypted-20261112T080000Z\production-recovery.tar' }; $count++
MustReject { Assert-JnQTemporaryArchivePath 'E:\synthetic-private' 'E:\synthetic-private\nas-encrypted-20261112T080000Z' 'E:\synthetic-private\production-static.tar' }; $count++
Write-Output "PASS $count local synthetic NAS privacy/cleanup assertions; no NAS I/O"
