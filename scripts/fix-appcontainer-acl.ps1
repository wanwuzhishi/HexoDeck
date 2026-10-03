# HexoDeck: 授予应用目录与用户数据目录 AppContainer 包权限
#
# 背景: Windows 11 25H2 (build 26200) 上，Electron/Chromium 沙箱子进程
# （渲染/GPU/网络服务）的受限令牌要求目标目录 ACL 显式包含
# ALL APPLICATION PACKAGES (S-1-15-2-1) 与 ALL RESTRICTED APPLICATION PACKAGES (S-1-15-2-2)，
# 否则所有沙箱子进程启动即崩（Obsidian 等应用在同一 build 上有相同问题与修复方案）。

$log = 'F:\HexoDeck\fix-acl.log'

'=== F:\HexoDeck 安装/开发目录（读权限） ===' | Out-File $log -Encoding utf8
icacls 'F:\HexoDeck' /grant '*S-1-15-2-2:(OI)(CI)(RX)' '*S-1-15-2-1:(OI)(CI)(RX)' /T 2>&1 |
  Select-Object -Last 3 | Out-File $log -Append -Encoding utf8

'=== C:\Users\...\Roaming\hexodeck 用户数据目录（完全控制） ===' | Out-File $log -Append -Encoding utf8
icacls 'C:\Users\wanwuzhishi\AppData\Roaming\hexodeck' /grant '*S-1-15-2-2:(OI)(CI)(F)' '*S-1-15-2-1:(OI)(CI)(F)' 2>&1 |
  Out-File $log -Append -Encoding utf8

'done' | Out-File $log -Append -Encoding utf8
