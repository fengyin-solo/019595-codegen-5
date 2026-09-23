import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useCanvasStore } from './canvas'

const STORAGE_KEY = 'label-editor-templates'
const TEMPLATE_VERSION = 1

// 画布上当前支持的元件类型
const SUPPORTED_TYPES = ['text', 'rect', 'circle', 'line', 'image', 'barcode', 'qrcode', 'table']

const TYPE_LABELS = {
  text: '文本',
  rect: '矩形',
  circle: '圆形',
  line: '线条',
  image: '图片',
  barcode: '条码',
  qrcode: '二维码',
  table: '表格'
}

const typeLabel = (type, index) => {
  if (type && TYPE_LABELS[type]) return `${TYPE_LABELS[type]}元件${index}`
  return `第 ${index} 个元件`
}

// 从本机读取模板（刷新后仍在）。读取失败时当作没有模板，避免坏数据阻塞编辑。
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    console.error('读取模板失败:', err)
    return []
  }
}

export const useTemplateStore = defineStore('template', () => {
  const templates = ref(loadFromStorage())
  let idCounter = templates.value.reduce(
    (max, t) => Math.max(max, Number((t.id || '').replace('template_', '')) || 0),
    0
  )

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(templates.value))
      return { ok: true }
    } catch (err) {
      console.error('模板写入本机失败:', err)
      // 配额超限（例如图片 base64 过大）要把原因讲清楚
      const message = err && err.name === 'QuotaExceededError'
        ? '本机存储空间不足，模板未保存；可先移除不再使用的模板后重试'
        : '写入本机存储失败，模板未保存'
      return { ok: false, message }
    }
  }

  // 名字校验：为空 / 全空格 / 重名都拒绝；excludeId 用于改名时排除自身
  function validateName(rawName, excludeId = null) {
    const name = (rawName || '').trim()
    if (!name) {
      return { valid: false, message: '模板名称不能为空' }
    }
    const duplicated = templates.value.some(t => t.name === name && t.id !== excludeId)
    if (duplicated) {
      return { valid: false, message: `已存在名为“${name}”的模板，请换一个名字或使用“覆盖”更新它` }
    }
    return { valid: true, name }
  }

  function countElements(template) {
    return template && template.snapshot && Array.isArray(template.snapshot.elements)
      ? template.snapshot.elements.length
      : 0
  }

  // 用当前画布内容新建一个模板
  function saveAsNew(name) {
    const check = validateName(name)
    if (!check.valid) return { ok: false, message: check.message }

    const canvas = useCanvasStore()
    const template = {
      id: `template_${++idCounter}`,
      name: check.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: TEMPLATE_VERSION,
      snapshot: canvas.captureSnapshot()
    }
    templates.value.push(template)
    const written = persist()
    if (!written.ok) {
      templates.value.pop() // 写入失败回滚内存状态
      return { ok: false, message: written.message }
    }
    canvas.markSaved()
    return { ok: true, template }
  }

  // 用当前画布覆盖已有模板
  function overwrite(id) {
    const index = templates.value.findIndex(t => t.id === id)
    if (index === -1) return { ok: false, message: '要覆盖的模板不存在，可能已被移除' }

    const previous = templates.value[index]
    const canvas = useCanvasStore()
    const updated = {
      ...previous,
      updatedAt: new Date().toISOString(),
      version: TEMPLATE_VERSION,
      snapshot: canvas.captureSnapshot()
    }
    templates.value[index] = updated
    const written = persist()
    if (!written.ok) {
      templates.value[index] = previous
      return { ok: false, message: written.message }
    }
    canvas.markSaved()
    return { ok: true, template: updated }
  }

  function rename(id, newName) {
    const index = templates.value.findIndex(t => t.id === id)
    if (index === -1) return { ok: false, message: '要改名的模板不存在，可能已被移除' }

    const check = validateName(newName, id)
    if (!check.valid) return { ok: false, message: check.message }

    const previous = templates.value[index]
    const updated = { ...previous, name: check.name, updatedAt: new Date().toISOString() }
    templates.value[index] = updated
    const written = persist()
    if (!written.ok) {
      templates.value[index] = previous
      return { ok: false, message: written.message }
    }
    return { ok: true, template: updated }
  }

  function remove(id) {
    const index = templates.value.findIndex(t => t.id === id)
    if (index === -1) return { ok: false, message: '要移除的模板不存在' }

    const previous = templates.value[index]
    templates.value.splice(index, 1)
    const written = persist()
    if (!written.ok) {
      templates.value.splice(index, 0, previous)
      return { ok: false, message: written.message }
    }
    return { ok: true }
  }

  // 把模板快照恢复到画布。
  // 模板里缺失 / 损坏的内容不会中断整体恢复，而是逐项跳过并在报告中说明。
  function applyTemplate(id) {
    const template = templates.value.find(t => t.id === id)
    if (!template) return { ok: false, fatal: true, message: '模板不存在，可能已被移除' }

    const snapshot = template.snapshot
    if (!snapshot || typeof snapshot !== 'object') {
      return { ok: false, fatal: true, message: `模板“${template.name}”缺少画布内容，无法恢复` }
    }

    const warnings = []
    const skipped = []

    // —— 画布尺寸：缺失或非法时保留默认 80×60mm ——
    let width = Number(snapshot.canvasWidth)
    let height = Number(snapshot.canvasHeight)
    if (!Number.isFinite(width) || width <= 0) {
      warnings.push('缺少有效的画布宽度，已使用默认宽度 80mm')
      width = 80
    }
    if (!Number.isFinite(height) || height <= 0) {
      warnings.push('缺少有效的画布高度，已使用默认高度 60mm')
      height = 60
    }
    width = Math.round(width)
    height = Math.round(height)
    const canvasPixelWidth = width * 8
    const canvasPixelHeight = height * 8

    const rawElements = Array.isArray(snapshot.elements) ? snapshot.elements : null
    if (!rawElements) {
      warnings.push('模板中缺少元件列表，已按空白画布恢复')
    }

    const restored = []
    let typeCounter = 0
    ;(rawElements || []).forEach(raw => {
      const order = restored.length + skipped.length + 1
      if (!raw || typeof raw !== 'object') {
        skipped.push(`第 ${order} 项不是有效的元件数据，已跳过`)
        return
      }

      // —— 元件类型：缺失 / 不支持则无法渲染，整体跳过 ——
      const type = raw.type
      if (!type) {
        skipped.push(`第 ${order} 个元件缺少“类型”信息，无法确定元件种类，已跳过`)
        return
      }
      if (!SUPPORTED_TYPES.includes(type)) {
        skipped.push(`第 ${order} 个元件的类型“${type}”当前版本不支持，已跳过`)
        return
      }
      typeCounter++
      const label = typeLabel(type, typeCounter)

      // —— 位置与尺寸：缺失或非法时无法摆放，整体跳过 ——
      const num = v => (Number.isFinite(Number(v)) ? Number(v) : NaN)
      let x = num(raw.x)
      let y = num(raw.y)
      let w = num(raw.width)
      let h = num(raw.height)
      if ([x, y, w, h].some(v => !Number.isFinite(v))) {
        skipped.push(`${label}缺少有效的位置或尺寸数据，已跳过`)
        return
      }
      if (w <= 0 || h <= 0) {
        skipped.push(`${label}的宽高不是有效值（width=${raw.width}, height=${raw.height}），已跳过`)
        return
      }

      x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h)

      // 超出画布的元件收回到画布内，并说明
      let adjusted = false
      if (x < 0 || y < 0 || x + w > canvasPixelWidth || y + h > canvasPixelHeight) {
        adjusted = true
        const nx = Math.max(0, Math.min(x, canvasPixelWidth - w))
        const ny = Math.max(0, Math.min(y, canvasPixelHeight - h))
        const nw = Math.min(w, canvasPixelWidth)
        const nh = Math.min(h, canvasPixelHeight)
        if (nx !== x || ny !== y) {
          x = nx; y = ny
        }
        if (nw !== w || nh !== h) {
          w = nw; h = nh
        }
      }

      const el = {
        ...raw,
        x, y, width: w, height: h,
        rotation: Number.isFinite(num(raw.rotation)) ? num(raw.rotation) : 0,
        visible: raw.visible !== false,
        locked: raw.locked === true
      }
      delete el.id // 恢复后重新分配 id，避免与画布上已有元件冲突

      // —— 各类元件特有内容缺失：补默认值并说明 ——
      if (type === 'text' && (raw.content === undefined || raw.content === null)) {
        warnings.push(`${label}缺少文字内容，已恢复为空文本`)
        el.content = ''
      }
      if (type === 'image' && !raw.imageData) {
        warnings.push(`${label}缺少图片数据，已恢复为待添加图片的占位框`)
        delete el.imageData
      }
      if (type === 'barcode' && (raw.content === undefined || raw.content === null)) {
        warnings.push(`${label}缺少条码内容，已使用默认内容“123456789”`)
        el.content = '123456789'
      }
      if (type === 'qrcode' && (raw.content === undefined || raw.content === null)) {
        warnings.push(`${label}缺少二维码内容，已使用默认内容“https://example.com”`)
        el.content = 'https://example.com'
      }
      if (type === 'table') {
        const rows = num(raw.rows)
        const cols = num(raw.cols)
        if (!Number.isFinite(rows) || rows <= 0) {
          warnings.push(`${label}缺少有效的行数，已按 3 行恢复`)
          el.rows = 3
        }
        if (!Number.isFinite(cols) || cols <= 0) {
          warnings.push(`${label}缺少有效的列数，已按 3 列恢复`)
          el.cols = 3
        }
        if (!raw.cells || typeof raw.cells !== 'object') {
          warnings.push(`${label}缺少表格文字，单元格已按空白恢复`)
          el.cells = {}
        }
      }
      if (adjusted) {
        warnings.push(`${label}原位置/尺寸超出 ${width}mm × ${height}mm 画布，已自动收进画布内`)
      }

      restored.push(el)
    })

    // 没有任何内容可恢复时不动当前画布
    if (!restored.length && (rawElements || []).length > 0) {
      return {
        ok: false,
        fatal: true,
        message: `模板“${template.name}”中的元件全部无法恢复（共 ${skipped.length} 项），画布保持不变`,
        skipped
      }
    }

    const canvas = useCanvasStore()
    canvas.loadState({ canvasWidth: width, canvasHeight: height, elements: restored })

    return {
      ok: true,
      template,
      restoredCount: restored.length,
      skippedCount: skipped.length,
      warnings,
      skipped
    }
  }

  return {
    templates,
    saveAsNew,
    overwrite,
    rename,
    remove,
    applyTemplate,
    validateName,
    countElements
  }
})
