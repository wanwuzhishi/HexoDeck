<script setup lang="ts">
import { computed, ref } from 'vue'
import { NButton, NCheckbox, NInput, NModal, NSpace, NPopconfirm } from 'naive-ui'
import CodeEditor from './CodeEditor.vue'
import { useYamlTemplates, type YamlTemplate } from '../composables/yamlTemplates'
import {
  switchIsOn,
  switchOffOf,
  switchOnOf,
  type CustomField
} from '../composables/customFields'

/**
 * 单张自定义参数卡片（文章 / 文集编辑器共用）。
 * 按类型分流渲染：
 *   kv     文本输入
 *   switch 勾选框
 *   yaml   YAML 编辑框（支持嵌套对象与对象数组）+ 模板套用
 */
const props = defineProps<{
  field: CustomField
  /** 显示名（由父组件从站点登记表解析） */
  label: string
  dark: boolean
  /** 结构化字段的语法错误（无错时为空串） */
  yamlError?: string
}>()

const emit = defineEmits<{
  remove: []
  /** 值变更（子组件不改 props，统一向上抛） */
  'update:value': [value: string]
}>()

const { all: allTemplates, addFromYaml, remove: removeTemplate } = useYamlTemplates()

const showTemplates = ref(false)
const showSaveTemplate = ref(false)
const templateName = ref('')
const saveError = ref('')

const isSwitch = computed(() => props.field.type === 'switch')
const isYaml = computed(() => props.field.type === 'yaml')

/** 结构化内容非空时才允许存为模板 */
const canSaveAsTemplate = computed(() => props.field.value.trim().length > 0)

function openTemplates(): void {
  templateName.value = ''
  saveError.value = ''
  showSaveTemplate.value = false
  showTemplates.value = true
}

/** 套用模板：整体替换编辑区内容（模板本就是骨架，不做合并以免残留旧字段） */
function applyTemplate(t: YamlTemplate): void {
  emit('update:value', t.yaml)
  showTemplates.value = false
}

/** 值变更统一走这里（避免在模板内联 emit 的类型推导问题） */
function setValue(v: string): void {
  emit('update:value', v)
}

/** 开关切换：把勾选状态映射为写入值 */
function onToggle(checked: boolean): void {
  setValue(checked ? switchOnOf(props.field) : switchOffOf(props.field))
}

function startSaveTemplate(): void {
  templateName.value = ''
  saveError.value = ''
  showSaveTemplate.value = true
}

function confirmSaveTemplate(): void {
  const name = templateName.value.trim()
  if (!name) {
    saveError.value = '请填写模板名称'
    return
  }
  if (allTemplates().some((t) => t.name === name)) {
    saveError.value = '已有同名模板，请换个名字'
    return
  }
  addFromYaml(name, props.field.value)
  showSaveTemplate.value = false
  showTemplates.value = false
}
</script>

<template>
  <div class="custom-item">
    <div class="custom-head">
      <span class="custom-name" :title="field.key">{{ label }}</span>
      <n-space :size="2" align="center">
        <n-button
          v-if="isYaml"
          size="tiny"
          quaternary
          title="套用模板或把当前内容存为模板"
          @click="openTemplates"
        >
          模板
        </n-button>
        <n-button size="tiny" quaternary type="error" title="移除该参数" @click="emit('remove')">
          移除
        </n-button>
      </n-space>
    </div>

    <!-- 开关式：可点击勾选的方框，写入选中/取消值 -->
    <n-checkbox
      v-if="isSwitch"
      :checked="switchIsOn(field)"
      @update:checked="onToggle"
    >
      {{ switchIsOn(field) ? switchOnOf(field) : switchOffOf(field) }}
    </n-checkbox>

    <!-- 结构化：YAML 编辑框，支持嵌套对象与对象数组 -->
    <template v-else-if="isYaml">
      <div class="code-editor-wrap yaml-field" :class="{ invalid: !!yamlError }">
        <CodeEditor :model-value="field.value" :dark="dark" placeholder="键: 值" @update:model-value="setValue" />
      </div>
      <div v-if="yamlError" class="yaml-error">{{ yamlError }}</div>
      <div v-else-if="!field.value.trim()" class="muted small">
        可点「模板」套用资源卡骨架，或直接写 YAML（支持嵌套与列表）
      </div>
    </template>

    <!-- 键值式：文本输入 -->
    <n-input
      v-else
      :value="field.value"
      @update:value="setValue"
      size="small"
      type="textarea"
      :autosize="{ minRows: 1, maxRows: 4 }"
      :placeholder="`${label} 的值`"
    />
  </div>

  <!-- 模板管理 -->
  <n-modal v-model:show="showTemplates" preset="card" title="YAML 模板" style="width: 560px">
    <div class="muted small template-tip">
      套用模板会<strong>整体替换</strong>当前编辑区内容；改完值保存即可。
    </div>

    <div class="template-section">
      <div class="template-section-title">内置模板</div>
      <div class="template-list">
        <button
          v-for="t in allTemplates()"
          :key="t.id"
          type="button"
          class="template-item"
          @click="applyTemplate(t)"
        >
          <div class="template-item-main">
            <span class="template-name">{{ t.name }}</span>
            <span class="muted small">{{ t.desc }}</span>
          </div>
          <n-popconfirm
            v-if="!t.builtin"
            @positive-click="removeTemplate(t.id)"
          >
            <template #trigger>
              <n-button size="tiny" quaternary type="error" @click.stop>删除</n-button>
            </template>
            删除该模板？（不影响已填入参数的内容）
          </n-popconfirm>
        </button>
      </div>
    </div>

    <div class="template-save">
      <template v-if="!showSaveTemplate">
        <n-button size="small" secondary :disabled="!canSaveAsTemplate" @click="startSaveTemplate">
          把当前内容存为模板
        </n-button>
        <span v-if="!canSaveAsTemplate" class="muted small">（编辑区为空，无法存为模板）</span>
      </template>
      <template v-else>
        <n-space vertical :size="6" style="width: 100%">
          <n-input
            v-model:value="templateName"
            maxlength="12"
            show-count
            placeholder="模板名称（最多 12 字，如：我的 MOD 卡）"
            @keyup.enter="confirmSaveTemplate"
          />
          <div v-if="saveError" class="yaml-error">{{ saveError }}</div>
          <n-space :size="8">
            <n-button size="small" type="primary" @click="confirmSaveTemplate">保存模板</n-button>
            <n-button size="small" @click="showSaveTemplate = false">取消</n-button>
          </n-space>
        </n-space>
      </template>
    </div>

    <template #footer>
      <n-space justify="end">
        <n-button @click="showTemplates = false">关闭</n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<style scoped>
/* 与参数卡片其余部分保持同一视觉规格 */
.custom-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 8px 10px;
  border: 1px solid var(--glass-border);
  border-radius: 10px;
  background: var(--accent-soft);
}

.custom-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.custom-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.code-editor-wrap {
  border: 1px solid var(--glass-border);
  border-radius: var(--radius);
  background: var(--glass-strong);
  overflow: hidden;
}

/* 结构化参数编辑区：够高才方便看嵌套层级 */
.yaml-field {
  height: 220px;
}

.yaml-field.invalid {
  border-color: var(--danger);
}

.yaml-error {
  font-size: 12px;
  color: var(--danger);
  line-height: 1.5;
  word-break: break-all;
}

/* 模板弹窗 */
.template-tip {
  margin-bottom: 12px;
  line-height: 1.7;
}

.template-section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
  margin-bottom: 6px;
}

.template-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 280px;
  overflow: auto;
}

.template-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 11px;
  border: 1px solid var(--glass-border);
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}

.template-item:hover {
  border-color: var(--accent);
  background: var(--accent-soft);
  box-shadow: var(--accent-glow);
}

.template-item-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.template-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-1);
}

.template-save {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--glass-border);
}
</style>
