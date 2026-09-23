import { defineStore } from 'pinia'
import { ref, computed, watch, nextTick } from 'vue'

const MM_TO_DOT = 8

const SUPPORTED_TYPES = ['text', 'rect', 'circle', 'line', 'image', 'barcode', 'qrcode', 'table']
const TYPE_LABELS = {
  text: '文本', rect: '矩形', circle: '圆形', line: '线条',
  image: '图片', barcode: '条码', qrcode: '二维码', table: '表格'
}
const GEOMETRY_LABELS = { x: 'X 坐标', y: 'Y 坐标', width: '宽度', height: '高度' }

function cloneData(data) {
  return JSON.parse(JSON.stringify(data))
}

export const useCanvasStore = defineStore('canvas', () => {
  const canvasWidth = ref(80)
  const canvasHeight = ref(60)
  const scale = ref(1)
  const elements = ref([])
  const selectedElementId = ref(null)
  const selectedElementIds = ref([])
  let elementIdCounter = 0

  // 当前画布相对最近一次保存/载入是否存在未保存的改动
  const isDirty = ref(false)
  let suppressDirtyWatch = false

  watch([canvasWidth, canvasHeight, elements], () => {
    if (!suppressDirtyWatch) isDirty.value = true
  }, { deep: true })

  const canvasPixelWidth = computed(() => canvasWidth.value * MM_TO_DOT)
  const canvasPixelHeight = computed(() => canvasHeight.value * MM_TO_DOT)

  const selectedElement = computed(() => {
    if (!selectedElementId.value) return null
    return elements.value.find(el => el.id === selectedElementId.value)
  })

  const selectedElements = computed(() => {
    return elements.value.filter(el => selectedElementIds.value.includes(el.id))
  })

  function setCanvasSize(width, height) {
    canvasWidth.value = width
    canvasHeight.value = height
  }

  function setScale(newScale) {
    scale.value = Math.max(0.25, Math.min(4, newScale))
  }

  function addElement(element) {
    const id = `element_${++elementIdCounter}`
    const newElement = {
      id,
      ...element,
      x: element.x || 10,
      y: element.y || 10,
      width: element.width || 100,
      height: element.height || 30,
      rotation: element.rotation || 0,
      locked: false,
      visible: true
    }
    elements.value.push(newElement)
    selectElement(id)
    return id
  }

  function updateElement(id, updates) {
    const index = elements.value.findIndex(el => el.id === id)
    if (index !== -1) {
      elements.value[index] = { ...elements.value[index], ...updates }
    }
  }

  function deleteElement(id) {
    const index = elements.value.findIndex(el => el.id === id)
    if (index !== -1) {
      elements.value.splice(index, 1)
      selectedElementIds.value = selectedElementIds.value.filter(eid => eid !== id)
      
      // 删除后选中第一个元件
      if (elements.value.length > 0) {
        const firstElement = elements.value[elements.value.length - 1]
        selectedElementId.value = firstElement.id
        selectedElementIds.value = [firstElement.id]
      } else {
        selectedElementId.value = null
        selectedElementIds.value = []
      }
    }
  }

  function selectElement(id, multiSelect = false) {
    if (multiSelect) {
      if (selectedElementIds.value.includes(id)) {
        selectedElementIds.value = selectedElementIds.value.filter(eid => eid !== id)
        if (selectedElementIds.value.length > 0) {
          selectedElementId.value = selectedElementIds.value[selectedElementIds.value.length - 1]
        } else {
          selectedElementId.value = null
        }
      } else {
        selectedElementIds.value.push(id)
        selectedElementId.value = id
      }
    } else {
      selectedElementId.value = id
      selectedElementIds.value = id ? [id] : []
    }
  }

  function clearSelection() {
    selectedElementId.value = null
    selectedElementIds.value = []
  }

  // 多选元件之间对齐
  function alignElements(alignment) {
    const selected = selectedElements.value
    if (selected.length < 2) return

    switch (alignment) {
      case 'left': {
        const minX = Math.min(...selected.map(el => el.x))
        selected.forEach(el => updateElement(el.id, { x: minX }))
        break
      }
      case 'right': {
        const maxRight = Math.max(...selected.map(el => el.x + el.width))
        selected.forEach(el => updateElement(el.id, { x: maxRight - el.width }))
        break
      }
      case 'center-h': {
        const minX = Math.min(...selected.map(el => el.x))
        const maxRight = Math.max(...selected.map(el => el.x + el.width))
        const centerX = (minX + maxRight) / 2
        selected.forEach(el => updateElement(el.id, { x: Math.round(centerX - el.width / 2) }))
        break
      }
      case 'top': {
        const minY = Math.min(...selected.map(el => el.y))
        selected.forEach(el => updateElement(el.id, { y: minY }))
        break
      }
      case 'bottom': {
        const maxBottom = Math.max(...selected.map(el => el.y + el.height))
        selected.forEach(el => updateElement(el.id, { y: maxBottom - el.height }))
        break
      }
      case 'center-v': {
        const minY = Math.min(...selected.map(el => el.y))
        const maxBottom = Math.max(...selected.map(el => el.y + el.height))
        const centerY = (minY + maxBottom) / 2
        selected.forEach(el => updateElement(el.id, { y: Math.round(centerY - el.height / 2) }))
        break
      }
    }
  }

  function duplicateElement(id) {
    const element = elements.value.find(el => el.id === id)
    if (!element) return

    const newElement = {
      ...element,
      x: Math.min(element.x + 20, canvasPixelWidth.value - element.width),
      y: Math.min(element.y + 20, canvasPixelHeight.value - element.height)
    }
    delete newElement.id
    return addElement(newElement)
  }

  function clearCanvas() {
    elements.value = []
    selectedElementId.value = null
    selectedElementIds.value = []
  }

  // 把当前画布全部内容（画布尺寸、元件摆放与样式、表格文字）导出为可持久化的快照
  function createSnapshot() {
    return {
      canvasWidth: canvasWidth.value,
      canvasHeight: canvasHeight.value,
      elements: cloneData(elements.value)
    }
  }

  // 标记当前画布为已保存状态（另存为模板但不改变画布内容时使用）
  function markSaved() {
    isDirty.value = false
  }

  // 从快照恢复画布。结构整体损坏时返回 fatal；个别元件缺内容时跳过并在 warnings 中说明
  function restoreSnapshot(snapshot) {
    const warnings = []

    if (snapshot === null || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      return { ok: false, fatal: '模板内容不是有效的标签数据', warnings }
    }
    if (!Array.isArray(snapshot.elements)) {
      return { ok: false, fatal: '模板缺少元件列表（elements），无法恢复', warnings }
    }

    // 先把所有元件校验好，再整体写入，避免恢复一半的画布
    const restoredElements = []
    const usedIds = new Set()
    let maxCounter = 0

    snapshot.elements.forEach((raw, index) => {
      const describe = (raw && TYPE_LABELS[raw.type]) ? `${TYPE_LABELS[raw.type]}元件` : `第 ${index + 1} 个元件`

      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        warnings.push(`${describe}：内容缺失或格式错误，已跳过`)
        return
      }
      if (typeof raw.type !== 'string' || raw.type.trim() === '') {
        warnings.push(`${describe}：缺少元件类型，已跳过`)
        return
      }
      if (!SUPPORTED_TYPES.includes(raw.type)) {
        warnings.push(`${describe}：未知元件类型「${raw.type}」，已跳过`)
        return
      }

      const el = cloneData(raw)
      const geometryDefaults = { x: 10, y: 10, width: 100, height: 30 }
      for (const key of ['x', 'y', 'width', 'height']) {
        if (typeof el[key] !== 'number' || !Number.isFinite(el[key])) {
          if (el[key] !== undefined && el[key] !== null) {
            warnings.push(`${describe}：${GEOMETRY_LABELS[key]}无效（${String(el[key])}），已按默认值恢复`)
          }
          el[key] = geometryDefaults[key]
        }
      }
      if (typeof el.rotation !== 'number' || !Number.isFinite(el.rotation)) el.rotation = 0
      el.locked = !!el.locked
      el.visible = el.visible !== false

      // 修正元件 id，并保证后续新建元件不会与恢复出来的 id 冲突
      const idMatch = typeof el.id === 'string' && el.id.match(/^element_(\d+)$/)
      if (idMatch && !usedIds.has(el.id)) {
        usedIds.add(el.id)
        maxCounter = Math.max(maxCounter, Number(idMatch[1]))
      } else {
        if (idMatch) warnings.push(`${describe}：元件 id 与其他元件重复，已重新分配`)
        let newId
        do {
          newId = `element_${++maxCounter}`
        } while (usedIds.has(newId))
        usedIds.add(newId)
        el.id = newId
      }

      if (el.type === 'table') {
        if (!el.cells || typeof el.cells !== 'object') {
          warnings.push(`${describe}：表格文字内容缺失，已按空表格恢复`)
          el.cells = {}
        }
      }
      if (el.type === 'image' && !el.imageData) {
        warnings.push(`${describe}：图片数据缺失，已恢复为空白图片占位`)
      }

      restoredElements.push(el)
    })

    suppressDirtyWatch = true
    try {
      if (typeof snapshot.canvasWidth === 'number' && Number.isFinite(snapshot.canvasWidth)) {
        canvasWidth.value = snapshot.canvasWidth
      } else {
        warnings.push('模板缺少画布宽度信息，已按默认尺寸 80mm 恢复')
        canvasWidth.value = 80
      }
      if (typeof snapshot.canvasHeight === 'number' && Number.isFinite(snapshot.canvasHeight)) {
        canvasHeight.value = snapshot.canvasHeight
      } else {
        warnings.push('模板缺少画布高度信息，已按默认尺寸 60mm 恢复')
        canvasHeight.value = 60
      }
      elements.value = restoredElements
      elementIdCounter = Math.max(elementIdCounter, maxCounter)
      selectedElementId.value = null
      selectedElementIds.value = []
    } finally {
      suppressDirtyWatch = false
    }

    // 等 watch 随本次写入触发完毕后再清除未保存标记，避免被误判为新改动
    nextTick(() => { isDirty.value = false })

    return { ok: true, fatal: null, warnings }
  }

  // 新建空白标签
  function newBlankLabel() {
    suppressDirtyWatch = true
    try {
      canvasWidth.value = 80
      canvasHeight.value = 60
      elements.value = []
      selectedElementId.value = null
      selectedElementIds.value = []
    } finally {
      suppressDirtyWatch = false
    }
    nextTick(() => { isDirty.value = false })
  }

  return {
    canvasWidth,
    canvasHeight,
    scale,
    elements,
    selectedElementId,
    selectedElementIds,
    isDirty,
    canvasPixelWidth,
    canvasPixelHeight,
    selectedElement,
    selectedElements,
    setCanvasSize,
    setScale,
    addElement,
    updateElement,
    deleteElement,
    selectElement,
    clearSelection,
    alignElements,
    duplicateElement,
    clearCanvas,
    createSnapshot,
    restoreSnapshot,
    markSaved,
    newBlankLabel,
    MM_TO_DOT
  }
})
