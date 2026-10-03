/** 主进程运行时开关（由 IPC 层写入、窗口生命周期读取，避免 close 事件里做异步读取） */
export const runtimeFlags = {
  closeToTray: false
}
