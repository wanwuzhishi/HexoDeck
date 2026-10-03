# HexoDeck 启动修复脚本 1/2：将目标目录树的强制完整性级别从 Low 重设为 Medium
#
# 背景: Windows 11 25H2 上，若目录被标记为 Low 完整性（Mandatory Label\Low），
# 其中的 exe 启动后低完整性运行，Chromium/Electron 沙箱子进程无法初始化
# （渲染进程崩溃、退出码 3），同时写入 C 盘用户目录会被拒。
# 修复后 exe 以 Medium 完整性运行，与正常安装的应用一致。
#
# 用法（需要管理员权限的 PowerShell）: .\fix-integrity.ps1 -Target <目录>
param(
  [Parameter(Mandatory = $true)]
  [string]$Target
)

if (!(Test-Path $Target)) {
  Write-Error "目标目录不存在: $Target"
  exit 1
}

$log = Join-Path $env:TEMP 'hexodeck-fix-integrity.log'

"=== $Target 目录本身 ===" | Out-File $log -Encoding utf8
icacls $Target /setintegritylevel '(OI)(CI)Medium' 2>&1 | Out-File $log -Append -Encoding utf8

'=== 递归所有子项 /T ===' | Out-File $log -Append -Encoding utf8
icacls $Target /setintegritylevel Medium /T 2>&1 | Out-File $log -Append -Encoding utf8

'done' | Out-File $log -Append -Encoding utf8
Write-Output "完成，日志: $log"
