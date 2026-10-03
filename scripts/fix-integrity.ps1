# HexoDeck: 将 F:\HexoDeck 目录树的强制完整性级别从 Low 重设为 Medium
#
# 背景: Windows 11 25H2 (build 26200) 上，带 Low 完整性标签的 exe 启动后，
# Chromium/Electron 沙箱子进程无法初始化（渲染进程崩溃、退出码 3），
# 同时 C 盘系统目录（%TEMP%、%APPDATA%）出现"拒绝访问"。
# 需要 exe 以 Medium 完整性运行（与正常安装的应用一致）。

$log = 'F:\HexoDeck\fix-integrity.log'

'=== F:\HexoDeck 目录本身 ===' | Out-File $log -Encoding utf8
icacls 'F:\HexoDeck' /setintegritylevel '(OI)(CI)Medium' 2>&1 | Out-File $log -Append -Encoding utf8

'=== 递归所有子项 /T ===' | Out-File $log -Append -Encoding utf8
icacls 'F:\HexoDeck' /setintegritylevel Medium /T 2>&1 | Out-File $log -Append -Encoding utf8

'done' | Out-File $log -Append -Encoding utf8
