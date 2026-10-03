# HexoDeck 启动修复脚本 2/2：授予目录 AppContainer 包权限
#
# 背景: Windows 11 25H2 上，Electron/Chromium 沙箱子进程（渲染/GPU/网络服务）
# 的受限令牌要求目标目录 ACL 显式包含 ALL APPLICATION PACKAGES (S-1-15-2-1)
# 与 ALL RESTRICTED APPLICATION PACKAGES (S-1-15-2-2)，否则沙箱子进程启动即崩
# （Obsidian 等 Electron 应用在同一系统版本上有相同问题与修复方案）。
#
# 用法（需要管理员权限的 PowerShell）:
#   .\fix-appcontainer-acl.ps1 -AppDir <应用目录> [-UserDataDir <用户数据目录>]
param(
  [Parameter(Mandatory = $true)]
  [string]$AppDir,
  [string]$UserDataDir = (Join-Path $env:APPDATA 'hexodeck')
)

if (!(Test-Path $AppDir)) {
  Write-Error "应用目录不存在: $AppDir"
  exit 1
}

$log = Join-Path $env:TEMP 'hexodeck-fix-acl.log'

"=== $AppDir（读权限） ===" | Out-File $log -Encoding utf8
icacls $AppDir /grant '*S-1-15-2-2:(OI)(CI)(RX)' '*S-1-15-2-1:(OI)(CI)(RX)' /T 2>&1 |
  Select-Object -Last 3 | Out-File $log -Append -Encoding utf8

"=== $UserDataDir 用户数据目录（完全控制） ===" | Out-File $log -Append -Encoding utf8
icacls $UserDataDir /grant '*S-1-15-2-2:(OI)(CI)(F)' '*S-1-15-2-1:(OI)(CI)(F)' 2>&1 |
  Out-File $log -Append -Encoding utf8

'done' | Out-File $log -Append -Encoding utf8
Write-Output "完成，日志: $log"
