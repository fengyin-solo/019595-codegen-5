import { defineStore } from 'pinia'
import { ref } from 'vue'

const STORAGE_KEY = 'label-editor:templates:v1'

function cloneData(data) {
  return JSON.parse(JSON.stringify(data))
}

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `tpl_${crypto.randomUUID()}`
  }
  return `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

// 模板保存在本机浏览器中，刷新或重新打开后仍可载入
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(t => t && typeof t === 'object' && typeof t.id === 'string' && typeof t.name === 'string')
  } catch (err) {
    console.error('模板数据读取失败：', err)
    return []
  }
}

export const useTemplateStore = defineStore('templates', () => {
  const templates = ref(loadFromStorage())

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates.value))
  }

  // 统一的名称校验：为空或与其他模板重名时拒绝写入，并说明冲突位置
  function validateName(name, exceptId = null) {
    const trimmed = typeof name === 'string' ? name.trim() : ''
    if (!trimmed) {
      return { valid: false, error: '模板名称不能为空' }
    }
    const conflict = templates.value.find(t => t.id !== exceptId && t.name === trimmed)
    if (conflict) {
      return { valid: false, error: `模板名称「${trimmed}」已存在，请更换名称或选择该模板进行覆盖保存` }
    }
    return { valid: true, name: trimmed }
  }

  // 把当前画布快照存为新模板
  function saveAsNew(name, snapshot) {
    const check = validateName(name)
    if (!check.valid) return { ok: false, error: check.error }

    const now = Date.now()
    const template = {
      id: generateId(),
      name: check.name,
      createdAt: now,
      updatedAt: now,
      snapshot: cloneData(snapshot)
    }
    templates.value.unshift(template)
    persist()
    return { ok: true, template }
  }

  // 覆盖保存到已有模板
  function overwrite(id, snapshot) {
    const index = templates.value.findIndex(t => t.id === id)
    if (index === -1) return { ok: false, error: '要覆盖的模板不存在，可能已被移除' }

    templates.value[index] = {
      ...templates.value[index],
      updatedAt: Date.now(),
      snapshot: cloneData(snapshot)
    }
    persist()
    return { ok: true, template: templates.value[index] }
  }

  // 改名
  function rename(id, name) {
    const index = templates.value.findIndex(t => t.id === id)
    if (index === -1) return { ok: false, error: '要改名的模板不存在，可能已被移除' }

    const check = validateName(name, id)
    if (!check.valid) return { ok: false, error: check.error }

    templates.value[index] = {
      ...templates.value[index],
      name: check.name,
      updatedAt: Date.now()
    }
    persist()
    return { ok: true, template: templates.value[index] }
  }

  // 移除
  function remove(id) {
    const index = templates.value.findIndex(t => t.id === id)
    if (index === -1) return { ok: false, error: '要移除的模板不存在' }
    const [removed] = templates.value.splice(index, 1)
    persist()
    return { ok: true, name: removed.name }
  }

  function getById(id) {
    return templates.value.find(t => t.id === id) || null
  }

  return {
    templates,
    validateName,
    saveAsNew,
    overwrite,
    rename,
    remove,
    getById
  }
})
