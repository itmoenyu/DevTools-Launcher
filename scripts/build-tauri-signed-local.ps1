param(
  # 这里默认指向你本机 Tauri updater 私钥文件。
  # 如果你的私钥不在这个位置，运行脚本时可以手动覆盖：
  # powershell -ExecutionPolicy Bypass -File ./scripts/build-tauri-signed-local.ps1 -PrivateKeyPath 'D:\keys\devtools-launcher.key'
  [string]$PrivateKeyPath = "$HOME\.tauri\devtools-launcher.key",

  # 这里允许你直接把密码作为参数传进来，适合本地自动化时使用。
  # 如果你不传这个参数，脚本会优先读取当前终端里的 TAURI_SIGNING_PRIVATE_KEY_PASSWORD。
  [string]$PrivateKeyPassword = ""
)

$ErrorActionPreference = 'Stop'

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

Write-Step "开始检查 Tauri updater 签名配置"

# Tauri updater 在 createUpdaterArtifacts=true 时，必须同时拿到公钥和私钥。
# 你的 tauri.conf.json 里已经配置了公钥，所以本地构建时还必须提供私钥；
# 否则就会出现 “A public key has been found, but no private key” 这个报错。
if (-not (Test-Path -LiteralPath $PrivateKeyPath)) {
  throw @"
没有找到 updater 私钥文件：
$PrivateKeyPath

你需要先确认自己的私钥文件位置，然后重新执行脚本。
如果私钥不在默认路径，可以这样运行：
powershell -ExecutionPolicy Bypass -File ./scripts/build-tauri-signed-local.ps1 -PrivateKeyPath '你的私钥绝对路径'
"@
}

if ([string]::IsNullOrWhiteSpace($PrivateKeyPassword)) {
  $PrivateKeyPassword = $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD
}

if ([string]::IsNullOrWhiteSpace($PrivateKeyPassword)) {
  Write-Host "没有从参数或环境变量中拿到私钥密码，下面会提示你手动输入。" -ForegroundColor Yellow

  # 用 SecureString 输入密码，避免密码直接明文显示在终端里。
  $securePassword = Read-Host '请输入 updater 私钥密码' -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

  try {
    $PrivateKeyPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

if ([string]::IsNullOrWhiteSpace($PrivateKeyPassword)) {
  throw "私钥密码不能为空。请重新运行脚本，并传入 -PrivateKeyPassword，或者先在当前终端设置 TAURI_SIGNING_PRIVATE_KEY_PASSWORD。"
}

Write-Step "写入当前终端会话所需的环境变量"

# 官方文档说明 TAURI_SIGNING_PRIVATE_KEY 可以直接传“私钥文件路径”。
# 这样做的好处是不用把整段私钥内容拷贝到命令里，风险更低，也更适合本地开发机。
$env:TAURI_SIGNING_PRIVATE_KEY = $PrivateKeyPath
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $PrivateKeyPassword

Write-Host "TAURI_SIGNING_PRIVATE_KEY 已指向：$PrivateKeyPath" -ForegroundColor Green
Write-Host "TAURI_SIGNING_PRIVATE_KEY_PASSWORD 已写入当前终端会话。" -ForegroundColor Green

Write-Step "开始执行带签名的 Tauri 构建"

# 这里直接调用 npm run tauri build。
# 因为前面已经把两个环境变量写进了当前 PowerShell 会话，所以 Tauri CLI 会在本次构建里读取到它们。
npm run tauri build

Write-Step "构建完成"
Write-Host "如果本次构建成功，target/release/bundle 目录下就会同时生成安装包和 updater 所需的签名产物。" -ForegroundColor Green
