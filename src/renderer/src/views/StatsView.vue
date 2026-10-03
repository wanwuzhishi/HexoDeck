<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NProgress, NSpace, NSpin, NTag } from 'naive-ui'
import { useSiteStore } from '../stores/site'
import { useWorkspaceStore } from '../stores/workspace'
import { message } from '../composables/message'
import type { SiteStats } from '@shared/ipc'

const site = useSiteStore()
const ws = useWorkspaceStore()
const router = useRouter()

const stats = ref<SiteStats | null>(null)
const loading = ref(false)

async function load(): Promise<void> {
  if (!site.site) return
  loading.value = true
  try {
    const r = await window.api.getStats()
    if (r.ok && r.data) stats.value = r.data
    else message.error(r.error ?? '统计读取失败')
  } finally {
    loading.value = false
  }
}

/** 概览大数字 */
const overview = computed(() => {
  const s = stats.value
  if (!s) return []
  return [
    { label: '文章', value: s.postCount, hint: '正式发布' },
    { label: '草稿', value: s.draftCount, hint: '未发布' },
    { label: '总字数', value: s.totalWords, hint: '汉字/单词计' },
    { label: '平均字数', value: s.avgWords, hint: '每篇' },
    { label: '标签', value: s.tagCount, hint: '去重' },
    { label: '分类', value: s.categoryCount, hint: '去重' }
  ]
})

/** 写作活跃度 */
const activity = computed(() => {
  const s = stats.value
  if (!s) return []
  return [
    { label: '本周新增', value: s.thisWeek },
    { label: '本月新增', value: s.thisMonth },
    { label: '写作天数', value: s.activeDays },
    { label: '总字符', value: s.totalChars, hint: '含标点与空格以外全部字符' }
  ]
})

/** 月度趋势条的最大值，用于计算相对高度 */
const monthMax = computed(() => Math.max(1, ...(stats.value?.byMonth.map((m) => m.count) ?? [1])))

const topTagMax = computed(() => Math.max(1, ...(stats.value?.topTags.map((t) => t.count) ?? [1])))
const topCatMax = computed(() => Math.max(1, ...(stats.value?.topCategories.map((t) => t.count) ?? [1])))

const healthItems = computed(() => {
  const s = stats.value
  if (!s) return []
  return [
    { label: '未分类文章', value: s.uncategorized, warn: s.uncategorized > 0 },
    { label: '无标签文章', value: s.untagged, warn: s.untagged > 0 }
  ]
})

function openPosts(): void {
  router.push('/posts')
}

onMounted(load)
// 站点切换后重新统计
watch(
  () => site.site?.path,
  (p) => {
    if (p) load()
  }
)
// 文章增删改后（文件监听）自动刷新统计
watch(
  () => ws.previewRefreshTick,
  () => load()
)
</script>

<template>
  <div class="page">
    <n-spin :show="loading" class="spin-wrap">
      <template v-if="stats">
        <section class="glass panel">
          <div class="panel-head-row">
            <div class="panel-title">数据概览</div>
            <n-button size="tiny" quaternary @click="load">刷新</n-button>
          </div>
          <div class="stat-grid">
            <div v-for="o in overview" :key="o.label" class="stat-card">
              <div class="stat-value">{{ o.value.toLocaleString() }}</div>
              <div class="stat-label">{{ o.label }}</div>
              <div class="muted small">{{ o.hint }}</div>
            </div>
          </div>
        </section>

        <section class="glass panel">
          <div class="panel-title">写作活跃度</div>
          <div class="stat-grid four">
            <div v-for="a in activity" :key="a.label" class="stat-card">
              <div class="stat-value small-value">{{ a.value.toLocaleString() }}</div>
              <div class="stat-label">{{ a.label }}</div>
            </div>
          </div>
          <div class="muted small meta-line">
            <span v-if="stats.firstPostDate">首篇 {{ stats.firstPostDate }}</span>
            <span v-if="stats.lastPostDate">最新 {{ stats.lastPostDate }}</span>
            <span v-if="stats.busiestDay">
              最高产一天 {{ stats.busiestDay.date }}（{{ stats.busiestDay.count }} 篇）
            </span>
          </div>
        </section>

        <section class="glass panel">
          <div class="panel-title">最近 12 个月发布趋势</div>
          <div v-if="stats.postCount" class="chart">
            <div v-for="m in stats.byMonth" :key="m.month" class="chart-col" :title="`${m.month}：${m.count} 篇 / ${m.words} 字`">
              <div class="chart-bar-wrap">
                <div class="chart-bar" :style="{ height: `${(m.count / monthMax) * 100}%` }">
                  <span v-if="m.count" class="chart-count">{{ m.count }}</span>
                </div>
              </div>
              <div class="chart-x">{{ m.month.slice(5) }}</div>
            </div>
          </div>
          <div v-else class="muted small">暂无已发布文章</div>
        </section>

        <div class="two-col">
          <section class="glass panel">
            <div class="panel-title">标签排行</div>
            <div v-if="stats.topTags.length" class="rank-list">
              <div v-for="t in stats.topTags" :key="t.name" class="rank-row">
                <span class="rank-name">{{ t.name }}</span>
                <div class="rank-bar">
                  <div class="rank-fill" :style="{ width: `${(t.count / topTagMax) * 100}%` }"></div>
                </div>
                <span class="rank-count">{{ t.count }}</span>
              </div>
            </div>
            <div v-else class="muted small">暂无标签</div>
          </section>

          <section class="glass panel">
            <div class="panel-title">分类排行</div>
            <div v-if="stats.topCategories.length" class="rank-list">
              <div v-for="c in stats.topCategories" :key="c.name" class="rank-row">
                <span class="rank-name">{{ c.name }}</span>
                <div class="rank-bar">
                  <div class="rank-fill violet" :style="{ width: `${(c.count / topCatMax) * 100}%` }"></div>
                </div>
                <span class="rank-count">{{ c.count }}</span>
              </div>
            </div>
            <div v-else class="muted small">暂无分类</div>
          </section>
        </div>

        <div class="two-col">
          <section class="glass panel">
            <div class="panel-title">年度产出</div>
            <div v-if="stats.byYear.length" class="year-list">
              <div v-for="y in stats.byYear" :key="y.year" class="year-row">
                <span class="year-name">{{ y.year }}</span>
                <n-progress
                  type="line"
                  :percentage="Math.round((y.count / Math.max(1, stats.postCount)) * 100)"
                  :show-indicator="false"
                  :height="8"
                  color="var(--accent)"
                />
                <span class="year-meta muted small">{{ y.count }} 篇 · {{ y.words.toLocaleString() }} 字</span>
              </div>
            </div>
            <div v-else class="muted small">暂无数据</div>
          </section>

          <section class="glass panel">
            <div class="panel-title">内容特征</div>
            <div class="feature-list">
              <div v-if="stats.longest" class="feature-row">
                <span class="muted small">最长文章</span>
                <span class="feature-value" :title="stats.longest.title">
                  {{ stats.longest.title }}（{{ stats.longest.words }} 字）
                </span>
              </div>
              <div v-if="stats.shortest" class="feature-row">
                <span class="muted small">最短文章</span>
                <span class="feature-value" :title="stats.shortest.title">
                  {{ stats.shortest.title }}（{{ stats.shortest.words }} 字）
                </span>
              </div>
              <div v-for="h in healthItems" :key="h.label" class="feature-row">
                <span class="muted small">{{ h.label }}</span>
                <n-tag size="small" round :bordered="false" :type="h.warn ? 'warning' : 'success'">
                  {{ h.value }} 篇
                </n-tag>
              </div>
            </div>
            <n-space v-if="stats.uncategorized || stats.untagged" style="margin-top: 10px">
              <n-button size="tiny" secondary @click="openPosts">去整理文章</n-button>
            </n-space>
          </section>
        </div>
      </template>
      <div v-else class="muted small">加载中…</div>
    </n-spin>
  </div>
</template>

<style scoped>
/* n-spin 会渲染成 n-spin-container > n-spin-content > 插槽内容，
   卡片（section.glass）的直接父级是 n-spin-content，间距必须加在它上面，
   加在外层 .page 或中间层都不会生效 */
.spin-wrap :deep(.n-spin-content) {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.page {
  padding: 4px 6px;
}

.panel-head-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* 双列区：列间距与行间距一致 */
.two-col {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 14px;
  align-items: stretch;
}

.two-col > .glass {
  display: flex;
  flex-direction: column;
  min-height: 0;
  margin: 0;
}

.stat-grid {
  /* 固定 3 列：概览 6 项正好排成 3×2，避免 auto-fit 出现 5+1 的孤行 */
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.stat-grid.four {
  /* 活跃度 4 项排成 2×2，窄窗口下更稳 */
  grid-template-columns: repeat(2, 1fr);
}

/* 宽屏时改为一行铺满，避免卡片过宽留白 */
@media (min-width: 1100px) {
  .stat-grid {
    grid-template-columns: repeat(6, 1fr);
  }

  .stat-grid.four {
    grid-template-columns: repeat(4, 1fr);
  }
}

.stat-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 86px;
  padding: 14px 16px;
  border-radius: var(--radius);
  border: 1px solid var(--glass-border);
  background: var(--accent-soft);
  text-align: center;
}

.stat-value {
  font-size: 26px;
  font-weight: 700;
  font-family: var(--mono);
  color: var(--accent);
  line-height: 1.2;
}

.stat-value.small-value {
  font-size: 20px;
  color: var(--text-1);
}

.stat-label {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-1);
}

.meta-line {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 12px;
}

/* 月度趋势图 */
.chart {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 170px;
  padding-top: 8px;
}

.chart-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
}

.chart-bar-wrap {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.chart-bar {
  width: 65%;
  max-width: 34px;
  min-height: 2px;
  border-radius: 6px 6px 2px 2px;
  background: linear-gradient(180deg, var(--accent), var(--accent-2));
  box-shadow: var(--accent-glow);
  position: relative;
  transition: height 0.25s ease;
}

.chart-count {
  position: absolute;
  top: -18px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  font-family: var(--mono);
  color: var(--text-2);
}

.chart-x {
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-3);
}

/* 排行榜 */
.rank-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rank-row {
  display: grid;
  grid-template-columns: 96px 1fr 34px;
  align-items: center;
  gap: 10px;
}

.rank-name {
  font-size: 13px;
  color: var(--text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rank-bar {
  height: 8px;
  border-radius: 4px;
  background: var(--accent-soft);
  overflow: hidden;
}

.rank-fill {
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(90deg, var(--accent), var(--accent-2));
}

.rank-fill.violet {
  background: linear-gradient(90deg, var(--accent-2), var(--accent));
}

.rank-count {
  text-align: right;
  font-family: var(--mono);
  font-size: 12px;
  color: var(--text-2);
}

/* 年度产出 */
.year-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.year-row {
  display: grid;
  grid-template-columns: 52px 1fr auto;
  align-items: center;
  gap: 10px;
}

.year-name {
  font-family: var(--mono);
  font-size: 13px;
  color: var(--text-1);
}

.year-meta {
  white-space: nowrap;
}

/* 内容特征 */
.feature-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.feature-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--glass-border);
}

.feature-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.feature-value {
  font-size: 13px;
  color: var(--text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 60%;
}
</style>
