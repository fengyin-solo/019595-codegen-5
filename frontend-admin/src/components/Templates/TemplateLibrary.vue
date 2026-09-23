<template>
  <el-dialog
    :model-value="modelValue"
    title="模板库"
    width="640px"
    :close-on-click-modal="false"
    append-to-body
    @update:model-value="emit('update:modelValue', $event)"
    @open="handleOpen"
  >
    <div class="template-library">
      <div class="save-section">
        <el-input
          v-model="newName"
          placeholder="输入模板名称，把当前标签存为模板"
          clearable
          maxlength="50"
          @keydown.enter="handleSaveAsNew"
        >
          <template #prepend>存为新模板</template>
        </el-input>
        <el-button type="primary" :disabled="!newName.trim()" @click="handleSaveAsNew">保存</el-button>
      </div>

      <el-divider content-position="left">已有模板</el-divider>

      <el-table :data="templateStore.templates" height="320" empty-text="还没有模板，先在上方把当前标签存一个吧">
        <el-table-column label="模板名称" min-width="180">
          <template #default="{ row }">
            <span class="tpl-name">{{ row.name }}</span>
          </template>
        </el-table-column>
        <el-table-column label="画布尺寸" width="120">
          <template #default="{ row }">
            {{ row.snapshot?.canvasWidth ?? '?' }} × {{ row.snapshot?.canvasHeight ?? '?' }} mm
          </template>
        </el-table-column>
        <el-table-column label="元件" width="60" align="center">
          <template #default="{ row }">
            {{ Array.isArray(row.snapshot?.elements) ? row.snapshot.elements.length : '-' }}
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="150">
          <template #default="{ row }">{{ formatTime(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="220" align="center">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="handleLoad(row)">载入</el-button>
            <el-button link size="small" @click="handleRename(row)">改名</el-button>
            <el-button type="warning" link size="small" @click="handleOverwrite(row)">覆盖</el-button>
            <el-button type="danger" link size="small" @click="handleRemove(row)">移除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, h } from 'vue'
import { useCanvasStore } from '@/stores/canvas'
import { useTemplateStore } from '@/stores/templates'
import { ElMessage, ElMessageBox } from 'element-plus'

defineProps({
  modelValue: { type: Boolean, default: false }
})

const canvasStore = useCanvasStore()
const templateStore = useTemplateStore()
const newName = ref('')

const emit = defineEmits(['update:modelValue'])

const handleOpen = () => {
  newName.value = ''
}

const closeDialog = () => emit('update:modelValue', false)

const formatTime = (ts) => {
  if (!ts) return '-'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return '-'
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 载入模板前，若当前标签有未保存改动，需先确认
const confirmUnsavedChanges = () => {
  if (!canvasStore.isDirty) return Promise.resolve(true)
  return ElMessageBox.confirm(
    '当前标签还有未保存的改动，载入模板会将其覆盖替换。是否继续？',
    '有未保存的改动',
    { confirmButtonText: '继续载入', cancelButtonText: '取消', type: 'warning' }
  ).then(() => true).catch(() => false)
}

const handleSaveAsNew = () => {
  const result = templateStore.saveAsNew(newName.value, canvasStore.createSnapshot())
  if (!result.ok) {
    ElMessage.error(result.error)
    return
  }
  newName.value = ''
  canvasStore.markSaved()
  ElMessage.success('模板已保存到本机')
}

const handleRename = (template) => {
  ElMessageBox.prompt('请输入新的模板名称', `修改模板名称「${template.name}」`, {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    inputValue: template.name,
    inputValidator: (value) => {
      const check = templateStore.validateName(value, template.id)
      return check.valid || check.error
    }
  }).then(({ value }) => {
    const result = templateStore.rename(template.id, value)
    if (result.ok) ElMessage.success('模板已改名')
    else ElMessage.error(result.error)
  }).catch(() => {})
}

const handleOverwrite = async (template) => {
  try {
    await ElMessageBox.confirm(
      `将用当前正在编辑的标签覆盖模板「${template.name}」，覆盖后无法恢复。是否继续？`,
      '覆盖保存',
      { confirmButtonText: '覆盖', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return
  }
  const result = templateStore.overwrite(template.id, canvasStore.createSnapshot())
  if (!result.ok) {
    ElMessage.error(result.error)
    return
  }
  canvasStore.markSaved()
  ElMessage.success(`模板「${template.name}」已覆盖保存`)
}

const handleRemove = (template) => {
  ElMessageBox.confirm(`确定要移除模板「${template.name}」吗？移除后无法恢复。`, '移除模板', {
    confirmButtonText: '移除',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    const result = templateStore.remove(template.id)
    if (result.ok) ElMessage.success(`模板「${result.name}」已移除`)
    else ElMessage.error(result.error)
  }).catch(() => {})
}

const handleLoad = async (template) => {
  const proceed = await confirmUnsavedChanges()
  if (!proceed) return

  const result = canvasStore.restoreSnapshot(template.snapshot)
  if (!result.ok) {
    ElMessage({
      type: 'error',
      message: h('div', [
        h('div', `模板「${template.name}」无法载入：${result.fatal}`)
      ]),
      duration: 5000
    })
    return
  }

  closeDialog()

  if (result.warnings.length > 0) {
    ElMessageBox.alert(
      h('div', [
        h('div', { style: 'margin-bottom: 8px' }, `模板「${template.name}」已载入，但以下内容未能恢复：`),
        h('ul', { style: 'margin: 0; padding-left: 20px' },
          result.warnings.map(w => h('li', w))
        )
      ]),
      '部分内容未恢复',
      { confirmButtonText: '知道了', type: 'warning' }
    ).catch(() => {})
  } else {
    ElMessage.success(`模板「${template.name}」已载入`)
  }
}
</script>

<style lang="scss" scoped>
.save-section {
  display: flex;
  gap: 8px;
  align-items: center;
}

.tpl-name {
  font-weight: 500;
  color: #303133;
}
</style>
