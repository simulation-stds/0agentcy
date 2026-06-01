$ErrorActionPreference = "SilentlyContinue"

$graphify = Get-Command graphify -ErrorAction SilentlyContinue
if ($graphify) {
  & $graphify.Source hook-check
  exit 0
}

$userInstall = Join-Path $env:APPDATA "Python\Python310\Scripts\graphify.exe"
if (Test-Path $userInstall) {
  & $userInstall hook-check
  exit 0
}

exit 0
