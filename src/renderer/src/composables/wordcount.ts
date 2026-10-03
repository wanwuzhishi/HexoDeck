/**
 * 字数口径（与主进程 stats-service.countWords 保持一致）：
 * 汉字/假名/谚文按字计，拉丁文按单词计。
 * 文章列表、编辑器状态栏、侧栏统计、统计页须共用同一口径，
 * 否则同一应用内会出现两个不同的「字数」。
 */
export function countWords(text: string): number {
  const cjk = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) ?? []).length
  const latin = (text.replace(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, ' ').match(/[A-Za-z0-9_'-]+/g) ?? [])
    .length
  return cjk + latin
}
