export const LIST_DISPLAY_SETTINGS_KEY = 'list-display-settings'
export const MAX_LIST_DISPLAY_FIELDS = 10

function getStoredCurrentUser() {
  try {
    const raw = localStorage.getItem('appAuthUser') || sessionStorage.getItem('appAuthUser')
    return raw ? JSON.parse(raw) || {} : {}
  } catch {
    return {}
  }
}

function getSettingsScope() {
  const user = getStoredCurrentUser()
  const identity = user.id ?? user.account ?? user.username ?? user.email
  return identity === undefined || identity === null || identity === '' ? 'anonymous' : String(identity)
}

export function getListDisplaySettingsStorageKey() {
  return `${LIST_DISPLAY_SETTINGS_KEY}:${encodeURIComponent(getSettingsScope())}`
}

const commonFields = [
  { key: 'season', label: '期数' },
  { key: 'season_type', label: '季节' },
  { key: 'composition', label: '成分' },
  { key: 'highlights', label: '产品亮点' },
  { key: 'status', label: '状态' },
  { key: 'stock', label: '库存' },
  { key: 'price', label: '外采价格' },
  { key: 'reference_sales', label: '参考销量' },
  { key: 'supplier', label: '供应商' },
  { key: 'channel', label: '渠道' },
  { key: 'designer_assistant', label: '设计师助理' },
  { key: 'official_matching_sku', label: '官搭款号' },
  { key: 'reference_link', label: '参考链接' },
  { key: 'product_url', label: '产品链接' },
  { key: 'external_purchase_progress', label: '外采进度' },
  { key: 'has_pattern', label: '图案/工艺' },
  { key: 'description', label: '描述' },
]

export const LIST_DISPLAY_DEFINITIONS = {
  product: {
    label: '产品列表',
    fields: [
      { key: 'style', label: '款式' },
      { key: 'release_date', label: '上新日期' },
      { key: 'category', label: '品类' },
      { key: 'designer', label: '设计师' },
      { key: 'link', label: '链路' },
      { key: 'color', label: '颜色' },
      { key: 'size', label: '尺码' },
      { key: 'priority', label: '优先级' },
      { key: 'progress', label: '总进度' },
      { key: 'cost', label: '成本价' },
      { key: 'pricing', label: '定价' },
      ...commonFields,
    ],
    defaults: ['style', 'release_date', 'category', 'designer', 'color', 'size'],
  },
  style: {
    label: '款式列表',
    fields: [
      { key: 'style', label: '款式' },
      { key: 'release_date', label: '上新日期' },
      { key: 'category', label: '品类' },
      { key: 'designer', label: '设计师' },
      { key: 'priority', label: '优先级' },
      { key: 'color', label: '颜色' },
      { key: 'size', label: '尺码' },
      { key: 'link', label: '链路' },
      { key: 'progress', label: '总进度' },
      { key: 'cost', label: '成本价' },
      { key: 'pricing', label: '定价' },
      ...commonFields,
    ],
    defaults: ['style', 'release_date', 'category', 'designer', 'priority', 'color', 'progress'],
  },
  new_arrivals: {
    label: '上新列表',
    fields: [
      { key: 'style', label: '款式' },
      { key: 'release_date', label: '上新日期' },
      { key: 'category', label: '品类' },
      { key: 'link', label: '链路' },
      { key: 'cost', label: '成本价' },
      { key: 'pricing', label: '定价' },
      { key: 'designer', label: '设计师' },
      { key: 'priority', label: '优先级' },
      { key: 'color', label: '颜色' },
      { key: 'size', label: '尺码' },
      { key: 'progress', label: '总进度' },
      ...commonFields,
    ],
    defaults: ['style', 'release_date', 'category', 'link', 'cost', 'pricing'],
  },
  pattern: {
    label: '纸样列表',
    fields: [
      { key: 'style', label: '款式' },
      { key: 'release_date', label: '上新日期' },
      { key: 'category', label: '品类' },
      { key: 'link', label: '链路' },
      { key: 'designer', label: '设计师' },
      { key: 'priority', label: '优先级' },
      { key: 'maker', label: '纸样师/车板师' },
      { key: 'color', label: '颜色' },
      { key: 'progress', label: '当前进度/车板进度' },
      { key: 'notes', label: '打板注意事项' },
      { key: 'review', label: '审核结果' },
      ...commonFields,
    ],
    defaults: ['style', 'category', 'designer', 'priority', 'maker', 'progress', 'notes', 'review'],
  },
}

function readStoredSettings() {
  const scopedKey = getListDisplaySettingsStorageKey()
  let scopedRaw = null
  try { scopedRaw = localStorage.getItem(scopedKey) } catch { scopedRaw = null }

  // Keep the existing user's choices when upgrading from the former shared key,
  // then remove that shared value so it cannot leak into another account.
  if (scopedRaw === null) {
    let legacyRaw = null
    try { legacyRaw = localStorage.getItem(LIST_DISPLAY_SETTINGS_KEY) } catch { legacyRaw = null }
    if (legacyRaw !== null) {
      try {
        localStorage.setItem(scopedKey, legacyRaw)
        localStorage.removeItem(LIST_DISPLAY_SETTINGS_KEY)
      } catch {}
      scopedRaw = legacyRaw
    }
  }

  try { return JSON.parse(scopedRaw || '{}') || {} } catch { return {} }
}

export function readListDisplaySettings() {
  const stored = readStoredSettings()
  return Object.fromEntries(Object.entries(LIST_DISPLAY_DEFINITIONS).map(([key, definition]) => {
    const selected = Array.isArray(stored[key]) ? stored[key] : definition.defaults
    const valid = definition.fields.map((field) => field.key)
    const fields = [...new Set(selected.filter((field) => valid.includes(field)))]
    if (valid.includes('style') && !fields.includes('style')) fields.unshift('style')
    return [key, (fields.length ? fields : definition.defaults).slice(0, MAX_LIST_DISPLAY_FIELDS)]
  }))
}

export function saveListDisplaySettings(settings) {
  const normalized = Object.fromEntries(Object.entries(LIST_DISPLAY_DEFINITIONS).map(([key, definition]) => {
    const selected = Array.isArray(settings?.[key]) ? settings[key] : definition.defaults
    const valid = definition.fields.map((field) => field.key)
    const fields = [...new Set(selected.filter((field) => valid.includes(field)))]
    if (valid.includes('style') && !fields.includes('style')) fields.unshift('style')
    return [key, (fields.length ? fields : definition.defaults).slice(0, MAX_LIST_DISPLAY_FIELDS)]
  }))
  localStorage.setItem(getListDisplaySettingsStorageKey(), JSON.stringify(normalized))
  window.dispatchEvent(new CustomEvent('list-display-settings-updated', { detail: normalized }))
}

export function hasListDisplayField(settings, listKey, field) {
  return settings?.[listKey]?.includes(field)
}
