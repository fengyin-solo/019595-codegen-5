<template>
  <div class="header-toolbar">
    <div class="toolbar-left">
      <div class="logo">
        <el-icon :size="24"><Tickets /></el-icon>
        <span>标签编辑器</span>
      </div>
      <el-divider direction="vertical" />
      <div class="canvas-size">
        <el-input-number v-model="width" :min="10" :max="200" size="small" controls-position="right" />
        <span class="size-label">×</span>
        <el-input-number v-model="height" :min="10" :max="200" size="small" controls-position="right" />
        <span class="size-unit">mm</span>
        <span class="size-unit">（最大为200*200）</span>
        <el-button type="primary" size="small" @click="applySize">应用</el-button>
      </div>
    </div>
    
    <div class="toolbar-right">
      <el-dropdown @command="handleNew">
        <el-button type="primary" size="small">
          新建<el-icon class="el-icon--right"><ArrowDown /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="blank">空白标签</el-dropdown-item>
            <el-dropdown-item command="template">从模板新建</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-button size="small" @click="templateDialogVisible = true">模板库</el-button>
      <el-divider direction="vertical" />
      <el-select v-model="scaleValue" size="small" style="width: 90px" @change="changeScale">
        <el-option v-for="s in scales" :key="s" :label="`${s * 100}%`" :value="s" />
      </el-select>
      <el-divider direction="vertical" />
      <el-dropdown @command="handleExport">
        <el-button type="success" size="small">
          导出<el-icon class="el-icon--right"><ArrowDown /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="bmp">导出 BMP (1-bit)</el-dropdown-item>
            <el-dropdown-item command="png">导出 PNG</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-button type="danger" size="small" @click="clearCanvas">清空</el-button>
    </div>

    <TemplateLibrary v-model="templateDialogVisible" />
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useCanvasStore } from '@/stores/canvas'
import { ElMessage, ElMessageBox } from 'element-plus'
import TemplateLibrary from '@/components/Templates/TemplateLibrary.vue'

const emit = defineEmits(['export'])
const store = useCanvasStore()

const width = ref(store.canvasWidth)
const height = ref(store.canvasHeight)
const scaleValue = ref(store.scale)
const scales = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]
const templateDialogVisible = ref(false)

watch(() => store.scale, (val) => { scaleValue.value = val })
// 新建空白或载入模板后，尺寸输入框同步为当前画布尺寸
watch(() => [store.canvasWidth, store.canvasHeight], ([w, h]) => {
  width.value = w
  height.value = h
})

const applySize = () => {
  const oldWidth = store.canvasPixelWidth
  const oldHeight = store.canvasPixelHeight
  store.setCanvasSize(width.value, height.value)
  const newWidth = store.canvasPixelWidth
  const newHeight = store.canvasPixelHeight
  
  if (store.elements.length > 0) {
    const scaleX = newWidth / oldWidth
    const scaleY = newHeight / oldHeight
    store.elements.forEach(el => {
      store.updateElement(el.id, {
        x: Math.round(el.x * scaleX),
        y: Math.round(el.y * scaleY),
        width: Math.round(el.width * scaleX),
        height: Math.round(el.height * scaleY)
      })
    })
  }
  ElMessage.success('画布尺寸已更新')
}

const changeScale = (val) => store.setScale(val)
const handleExport = (type) => emit('export', type)

// 新建前若有未保存改动，先确认
const confirmUnsavedChanges = () => {
  if (!store.isDirty) return Promise.resolve(true)
  return ElMessageBox.confirm(
    '当前标签还有未保存的改动，新建后将丢失。是否继续？',
    '有未保存的改动',
    { confirmButtonText: '继续新建', cancelButtonText: '取消', type: 'warning' }
  ).then(() => true).catch(() => false)
}

const handleNew = async (command) => {
  if (command === 'template') {
    // 是否有未保存改动，统一在模板库中点击“载入”时再确认
    templateDialogVisible.value = true
    return
  }

  const proceed = await confirmUnsavedChanges()
  if (!proceed) return
  store.newBlankLabel()
  ElMessage.success('已新建空白标签')
}

const clearCanvas = () => {
  ElMessageBox.confirm('确定要清空画布吗？', '提示', { type: 'warning' })
    .then(() => { store.clearCanvas(); ElMessage.success('画布已清空') })
    .catch(() => {})
}
</script>

<style lang="scss" scoped>
.header-toolbar {
  height: 56px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.toolbar-left { display: flex; align-items: center; gap: 16px; }

.logo {
  display: flex; align-items: center; gap: 8px;
  font-size: 18px; font-weight: 600; color: #409eff;
}

.canvas-size {
  display: flex; align-items: center; gap: 8px;
  .size-label { color: #909399; }
  .size-unit { color: #606266; font-size: 13px; }
  :deep(.el-input-number) { width: 90px; }
}

.toolbar-right { display: flex; align-items: center; gap: 12px; }
</style>
