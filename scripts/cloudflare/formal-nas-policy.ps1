# Pure validation. Never reads credentials, changes ACLs, or accesses the NAS.
function Assert-JnQNasPrivacyEvidence {
  param([object]$Evidence, [string]$NasTarget, [string]$ExpectedShare, [DateTimeOffset]$Now = [DateTimeOffset]::UtcNow)
  if (!$Evidence -or $Evidence.schemaVersion -ne 1 -or $Evidence.source -ne 'NAS_UI_AND_ACCESS_TESTS' -or
      $Evidence.userApproved -ne $true) { throw 'NAS_PRIVATE_TARGET_NOT_APPROVED' }
  foreach ($field in @('userApproved','onlyNamedAccountHasAccess','publicAndGroupSpaceExcluded','sharingLinksDisabled')) {
    if ($Evidence.$field -isnot [bool] -or $Evidence.$field -ne $true) { throw 'NAS_PRIVACY_BOOLEAN_EVIDENCE_REQUIRED' }
  }
  $normalize = { param($value) if (!$value) { throw 'NAS_EVIDENCE_PATH_MISSING' }; [IO.Path]::GetFullPath([string]$value).TrimEnd('\') }
  if ((& $normalize $Evidence.target) -ine (& $normalize $NasTarget) -or
      ([string]$Evidence.share).TrimEnd('\') -ine $ExpectedShare.TrimEnd('\')) { throw 'NAS_EVIDENCE_TARGET_MISMATCH' }
  if ($Evidence.permissionModel -notin @('weline-personal-space','private-smb-share') -or
      $Evidence.account -isnot [string] -or [string]::IsNullOrWhiteSpace($Evidence.account) -or
      $Evidence.onlyNamedAccountHasAccess -ne $true -or
      $Evidence.publicAndGroupSpaceExcluded -ne $true -or $Evidence.sharingLinksDisabled -ne $true -or
      $Evidence.guestAccess -ne 'denied-tested' -or
      $Evidence.nonOwnerAccess -notin @('denied-tested','no-other-enabled-accounts-ui-verified') -or
      $Evidence.ownerReadWrite -ne 'tested') { throw 'NAS_EFFECTIVE_PRIVACY_NOT_PROVEN' }
  $confirmed = [DateTimeOffset]::MinValue
  if (![DateTimeOffset]::TryParse([string]$Evidence.confirmedAt,[ref]$confirmed) -or
      $confirmed -gt $Now -or ($Now - $confirmed).TotalHours -gt 24) { throw 'NAS_PRIVACY_EVIDENCE_STALE' }
  # This accepts independently checked share-level controls, not a Windows
  # projection of Samba ACLs. A merely visible/readable directory never suffices.
}

function Assert-JnQTemporaryArchivePath {
  param([string]$SourceRoot,[string]$Run,[string]$Archive)
  $root = [IO.Path]::GetFullPath($SourceRoot).TrimEnd('\')
  $runPath = [IO.Path]::GetFullPath($Run).TrimEnd('\')
  $archivePath = [IO.Path]::GetFullPath($Archive)
  if ([IO.Path]::GetDirectoryName($runPath) -ine $root -or
      [IO.Path]::GetFileName($runPath) -notmatch '^nas-encrypted-[0-9]{8}T[0-9]{6}Z$' -or
      $archivePath -ine (Join-Path $runPath 'production-recovery.tar')) { throw 'TEMPORARY_ARCHIVE_OUTSIDE_APPROVED_RUN' }
}
