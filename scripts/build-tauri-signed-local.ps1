param(
  [string]$PrivateKeyPath = "$HOME\.tauri\devtools-launcher.key",
  [string]$PrivateKeyPassword = ""
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Step {
  param([string]$Message)
  Write-Host ''
  Write-Host "==> $Message" -ForegroundColor Cyan
}

Write-Step 'Check updater signing config'

# Tauri updater requires both a public key in tauri.conf.json
# and a matching private key during build when
# createUpdaterArtifacts is enabled.
if (-not (Test-Path -LiteralPath $PrivateKeyPath)) {
  throw @"
Updater private key file was not found:
$PrivateKeyPath

Run the script again with an explicit path if needed:
powershell -ExecutionPolicy Bypass -File ./scripts/build-tauri-signed-local.ps1 -PrivateKeyPath 'D:\keys\devtools-launcher.key'
"@
}

if ([string]::IsNullOrWhiteSpace($PrivateKeyPassword)) {
  $PrivateKeyPassword = $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD
}

if ([string]::IsNullOrWhiteSpace($PrivateKeyPassword)) {
  Write-Host 'TAURI_SIGNING_PRIVATE_KEY_PASSWORD was not provided. You will be prompted to enter it.' -ForegroundColor Yellow

  $securePassword = Read-Host 'Enter updater private key password' -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

  try {
    $PrivateKeyPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

if ([string]::IsNullOrWhiteSpace($PrivateKeyPassword)) {
  throw 'Private key password cannot be empty. Pass -PrivateKeyPassword or set TAURI_SIGNING_PRIVATE_KEY_PASSWORD in the current terminal session.'
}

Write-Step 'Export signing environment variables'

# Tauri accepts either the key content or the key file path.
# Using the file path is safer for local builds because it avoids
# copying the full private key text into the terminal.
$env:TAURI_SIGNING_PRIVATE_KEY = $PrivateKeyPath
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $PrivateKeyPassword

Write-Host "TAURI_SIGNING_PRIVATE_KEY => $PrivateKeyPath" -ForegroundColor Green
Write-Host 'TAURI_SIGNING_PRIVATE_KEY_PASSWORD => [set in current session]' -ForegroundColor Green

Write-Step 'Run signed Tauri build'

npm run tauri build
if ($LASTEXITCODE -ne 0) {
  throw "npm run tauri build failed with exit code $LASTEXITCODE."
}

Write-Step 'Build finished'
Write-Host 'If the build succeeded, installer bundles and updater signature artifacts are available under src-tauri/target/release/bundle.' -ForegroundColor Green
