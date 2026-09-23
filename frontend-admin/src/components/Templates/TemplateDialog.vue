<template>
  <el-dialog
    v-model="visible"
    :title="dialogTitle"
    width="520px"
    :close-on-click-modal="false"
    append-to-body
    @closed="handleClosed"
  >
    <!-- 保存模式：输入名字 / 选择覆盖目标 -->
    <div v-if="mode === 'save'">
      <el-radio-group v-model="saveMode" class="save-mode-group">
        <el-radio-button label="new" value="new">另存为新模板</el-radio-button>
        <el-radio-button label="overwrite" value="overwrite" :disabled="templateStore.templates.length === 0">覆盖已有模板</el-radio-button>
      </el-radio-group>

      <div v-if="saveMode === 'new'" class="save-new">
        <el-input
          ref="nameInputRef"
          v-model="newName"
          placeholder="请输入模板名称"
          maxlength="50"
          show-word-limit
          clearable
          @keydown.enter="handleSaveNew"
        />
        <div class="snapshot-info">
          将保存当前画布：{{ canvasStore.canvasWidth }}mm × {{ canvasStore.canvasHeight }}mm，
          共 {{ canvasStore.elements.length }} 个元件（含摆放位置、外观样式与表格文字）
        </div>
        <div v-if="saveError" class="save-error">{{ saveError }}</div>
      </div>

      <div v-else class="overwrite-list">
        <el-empty v-if="templateStore.templates.length === 0" description="还没有可覆盖的模板" :image-size="70" />
        <div
          v-for="t in templateStore.templates"
          :key="t.id"
          class="overwrite-item"
          :class="{ active: overwriteId === t.id }"
          @click="overwriteId = t.id"
        >
          <span class="radio-dot" :class="{ checked: overwriteId === t.id }" />
          <span class="overwrite-text">
            <span class="tpl-name">{{ t.name }}</span>
            <span class="tpl-meta">{{ metaText(t) }}</span>
          </span>
        </div>
      </div>
    </div>

    <!-- 载入模式：模板列表 -->
    <div v-else class="template-list">
      <el-empty v-if="templateStore.templates.length === 0" description="模板库为空，请先把当前标签保存为模板" :image-size="80" />
      <div
        v-for="t in templateStore.templates"
        :key="t.id"
        class="template-item"
      >
        <div class="template-info" @click="handleLoad(t)">
          <div class="template-name" :title="t.name">{{ t.name }}</div>
          <div class="template-meta">{{ metaText(t) }}</div>
          <div class="template-time">更新于 {{ formatTime(t.updatedAt || t.createdAt) }}</div>
        </div>
        <div class="template-actions">
          <el-button type="primary" size="small" @click="handleLoad(t)">载入</el-button>
          <el-button size="small" @click="handleRename(t)">改名</el-button>
          <el-button size="small" type="danger" plain @click="handleRemove(t)">移除</el-button>
        </div>
      </div>
    </div>

    <template #footer>
      <template v-if="mode === 'save'">
        <el-button @click="visible = false">取消</el-button>
        <el-button
          v-if="saveMode === 'new'"
          type="primary"
          @click="handleSaveNew"
        >保存</el-button>
        <el-button
          v-else
          type="warning"
          :disabled="!overwriteId"
          @click="handleOverwrite"
        >覆盖保存</el-button>
      </template>
      <template v-else>
        <el-button @click="visible = false">关闭</el-button>
      </template>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, h, nextTick } from 'vue'
import { useTemplateStore } from '@/stores/template'
import { useCanvasStore } from '@/stores/canvas'
import { ElMessage, ElMessageBox } from 'element-plus'

const templateStore = useTemplateStore()
const canvasStore = useCanvasStore()

const visible = ref(false)
const mode = ref('load') // 'load' | 'save'
const saveMode = ref('new')
const newName = ref('')
const overwriteId = ref(null)
const saveError = ref('')
const nameInputRef = ref(null)

const dialogTitle = computed(() => {
  if (mode.value === 'save') return '保存为模板'
  return '模板库（从模板新建）'
})

function open(targetMode = 'load') {
  mode.value = targetMode
  saveMode.value = 'new'
  newName.value = ''
  overwriteId.value = templateStore.templates[0]?.id || null
  saveError.value = ''
  visible.value = true
  if (targetMode === 'save') {
    nextTick(() => nameInputRef.value?.focus?.())
  }
}

function handleClosed() {
  saveError.value = ''
}

function metaText(t) {
  const s = t.snapshot || {}
  const count = templateStore.countElements(t)
  const w = s.canvasWidth || '?'
  const h = s.canvasHeight || '?'
  return `${w}mm × ${h}mm · ${count} 个元件`
}

function formatTime(iso) {
  if (!iso) return '未知时间'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '未知时间'
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ---------- 保存 ----------
function handleSaveNew() {
  saveError.value = ''
  const result = templateStore.saveAsNew(newName.value)
  if (!result.ok) {
    // 名字为空 / 重名等冲突直接在对话框内说明
    saveError.value = result.message
    nextTick(() => nameInputRef.value?.focus?.())
    return
  }
  visible.value = false
  ElMessage.success(`模板“${result.template.name}”已保存到本机`)
}

function handleOverwrite() {
  const target = templateStore.templates.find(t => t.id === overwriteId.value)
  if (!target) {
    ElMessage.warning('请先选择要覆盖的模板')
    return
  }
  ElMessageBox.confirm(
    `将用当前画布内容覆盖模板“${target.name}”，模板原先保存的内容无法恢复，是否继续？`,
    '覆盖确认',
    { type: 'warning', confirmButtonText: '覆盖', cancelButtonText: '取消' }
  ).then(() => {
    const result = templateStore.overwrite(target.id)
    if (!result.ok) {
      ElMessage.error(result.message)
      return
    }
    visible.value = false
    ElMessage.success(`模板“${target.name}”已更新`)
  }).catch(() => {})
}

// ---------- 载入 ----------
function handleLoad(template) {
  const doApply = () => {
    const result = templateStore.applyTemplate(template.id)
    if (!result.ok) {
      // 致命问题（模板内容全损等）：画布不变，弹窗说明
      ElMessageBox.alert(
        result.message + (result.skipped && result.skipped.length
          ? '\n' + result.skipped.map(s => `· ${s}`).join('\n')
          : ''),
        '模板无法恢复',
        { type: 'error', customClass: 'template-report-box' }
      )
      return
    }
    visible.value = false
    showRestoreReport(result)
  }

  // 画布上还有没保存的改动时先确认
  if (canvasStore.isDirty) {
    ElMessageBox.confirm(
      `当前画布有尚未保存到模板的改动，载入“${template.name}”会清空并替换这些内容，是否继续？`,
      '存在未保存的改动',
      { type: 'warning', confirmButtonText: '放弃改动并载入', cancelButtonText: '取消' }
    ).then(doApply).catch(() => {})
  } else {
    doApply()
  }
}

// 载入结果报告：恢复了什么、跳过/补默认了什么都列清楚
function showRestoreReport(result) {
  const { restoredCount, skipped, warnings } = result
  if (!warnings.length && !skipped.length) {
    ElMessage.success(`已从模板“${result.template.name}”恢复 ${restoredCount} 个元件`)
    return
  }

  const lines = []
  if (warnings.length) {
    lines.push(h('div', { class: 'report-section' }, [
      h('div', { class: 'report-title' }, `部分内容缺失，已按默认方式恢复（${warnings.length}）：`),
      h('ul', { class: 'report-list' }, warnings.map(w => h('li', w)))
    ]))
  }
  if (skipped.length) {
    lines.push(h('div', { class: 'report-section report-skip-section' }, [
      h('div', { class: 'report-title' }, `以下内容未能恢复，已跳过（${skipped.length}）：`),
      h('ul', { class: 'report-list' }, skipped.map(s => h('li', s)))
    ]))
  }
  ElMessageBox.alert(
    h('div', { class: 'template-report' }, [
      h('div', { class: 'report-summary' },
        `已恢复 ${restoredCount} 个元件` +
        (warnings.length ? `，${warnings.length} 项内容缺失已补默认` : '') +
        (skipped.length ? `，跳过 ${skipped.length} 项` : '')
      ),
      ...lines
    ]),
    `模板“${result.template.name}”载入完成`,
    { confirmButtonText: '我知道了', customClass: 'template-report-box' }
  )
}

// ---------- 改名 / 移除 ----------
function handleRename(template) {
  ElMessageBox.prompt('请输入新的模板名称', `改名：${template.name}`, {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    inputValue: template.name,
    inputValidator: () => true // 校验在 store 中做，便于给出具体冲突原因
  }).then(({ value }) => {
    const result = templateStore.rename(template.id, value)
    if (!result.ok) {
      ElMessage.error(result.message)
      return
    }
    ElMessage.success('模板已改名')
  }).catch(() => {})
}

function handleRemove(template) {
  ElMessageBox.confirm(
    `确定要从本机移除模板“${template.name}”吗？移除后无法恢复。`,
    '移除模板',
    { type: 'warning', confirmButtonText: '移除', cancelButtonText: '取消', confirmButtonClass: 'el-button--danger' }
  ).then(() => {
    const result = templateStore.remove(template.id)
    if (!result.ok) {
      ElMessage.error(result.message)
      return
    }
    if (overwriteId.value === template.id) {
      overwriteId.value = templateStore.templates[0]?.id || null
    }
    ElMessage.success(`模板“${template.name}”已移除`)
  }).catch(() => {})
}

defineExpose({ open })
</script>

<style lang="scss" scoped>
.save-mode-group {
  width: 100%;
  margin-bottom: 16px;
  :deep(.el-radio-button) { width: 50%; }
  :deep(.el-radio-button__inner) { width: 100%; }
}

.save-new {
  .snapshot-info {
    margin-top: 10px;
    font-size: 12px;
    color: #909399;
    line-height: 1.6;
  }
  .save-error {
    margin-top: 8px;
    font-size: 12px;
    color: #f56c6c;
    line-height: 1.5;
  }
}

.overwrite-list {
  max-height: 320px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.overwrite-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover { border-color: #409eff; }
  &.active { border-color: #409eff; background: #ecf5ff; }

  .radio-dot {
    width: 14px;
    height: 14px;
    border: 1px solid #dcdfe6;
    border-radius: 50%;
    flex-shrink: 0;
    position: relative;
    transition: all 0.2s;

    &.checked { border-color: #409eff; }
    &.checked::after {
      content: '';
      position: absolute;
      inset: 2px;
      border-radius: 50%;
      background: #409eff;
    }
  }
  .overwrite-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }
  .tpl-name { font-size: 14px; color: #303133; font-weight: 500; }
  .tpl-meta { font-size: 12px; color: #909399; }
}

.template-list {
  max-height: 420px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.template-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  transition: all 0.2s;

  &:hover { border-color: #409eff; box-shadow: 0 2px 8px rgba(64, 158, 255, 0.12); }
}

.template-info {
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.template-name {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.template-meta {
  font-size: 12px;
  color: #606266;
  margin-top: 2px;
}

.template-time {
  font-size: 11px;
  color: #c0c4cc;
  margin-top: 2px;
}

.template-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
</style>

<style lang="scss">
// 载入报告（ElMessageBox 渲染在 body 下，需用全局样式）
.template-report-box {
  .el-message-box__message { white-space: pre-line; }
  .report-summary {
    font-size: 14px;
    color: #303133;
    margin-bottom: 12px;
    white-space: normal;
  }
  .report-section { margin-bottom: 10px; }
  .report-title {
    font-size: 13px;
    font-weight: 600;
    color: #e6a23c;
    margin-bottom: 6px;
  }
  .report-list {
    margin: 0;
    padding-left: 20px;
    font-size: 12px;
    color: #606266;
    line-height: 1.8;
  }
  .report-skip-section .report-title { color: #f56c6c; }
  .report-skip-section .report-list { color: #f56c6c; }
}
</style>
