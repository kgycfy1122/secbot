<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import ProductManagement from './ProductManagement.vue'
import ProductDetail from './ProductDetail.vue'
import PatternManagement from './PatternManagement.vue'
import PatternDetail from './PatternDetail.vue'
import CategoryPlanning from './CategoryPlanning.vue'
import UserManagement from './UserManagement.vue'
import SystemLogManagement from './SystemLogManagement.vue'
import AnnouncementManagement from './AnnouncementManagement.vue'
import { STYLE_PROGRESS_STEPS } from '../styleProgress.js'
import { LIST_DISPLAY_DEFINITIONS, MAX_LIST_DISPLAY_FIELDS, readListDisplaySettings, saveListDisplaySettings } from '../listDisplaySettings.js'
import {
  ArrowDown,
  Bell,
  Close,
  DataAnalysis,
  Document,
  Expand,
  Fold,
  FolderOpened,
  Goods,
  HomeFilled,
  List,
  Money,
  Notebook,
  Refresh,
  Scissor,
  Setting,
  SwitchButton,
  TrendCharts,
  UserFilled,
} from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const currentUser = computed(() => {
  try {
    return JSON.parse(localStorage.getItem('appAuthUser') || sessionStorage.getItem('appAuthUser') || '{}')
  } catch {
    return {}
  }
})
const userName = computed(() => currentUser.value.account || '用户')
const userPosition = computed(() => currentUser.value.position || '')
const isSuperAdmin = computed(() => currentUser.value.role === 'super_admin')
const dateLabel = ref('')
const greetingLabel = ref('')
const workbenchProducts = ref([])
const workbenchLoading = ref(false)
const announcements = ref([])
const announcementLoading = ref(false)
const announcementPanelVisible = ref(false)
const announcementDetailVisible = ref(false)
const selectedAnnouncement = ref(null)
const readAnnouncementIds = ref(new Set())
const progressDateRange = ref([])
const styleProgressOptions = STYLE_PROGRESS_STEPS
const patternProgressOptions = ['分配中', '已分配', '纸样中', '车板中', '审核中', '已通过']
const workspaceTabs = ref([])
const workspaceTabsRef = ref(null)
const draggingWorkspaceTabId = ref('')
const workspaceDragOverTabId = ref('')
const suppressWorkspaceTabClick = ref(false)
let workspaceTabCloseTimer = null
let workspaceTabClickTimer = null
let workspacePointerDragState = null
const styleProgressExpanded = ref(true)
const patternManagementExpanded = ref(true)
const sidebarCollapsed = ref(localStorage.getItem('sidebar-collapsed') === 'true')
const listSettingsVisible = ref(false)
const listSettingsDraft = ref(readListDisplaySettings())
let dateTimer

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
  localStorage.setItem('sidebar-collapsed', String(sidebarCollapsed.value))
}

function openListSettings() {
  listSettingsDraft.value = readListDisplaySettings()
  listSettingsVisible.value = true
}

function saveListSettingsDraft() {
  saveListDisplaySettings(listSettingsDraft.value)
  listSettingsVisible.value = false
  ElMessage.success('列表显示字段已保存')
}

function resetListSettingsDraft() {
  listSettingsDraft.value = Object.fromEntries(Object.entries(LIST_DISPLAY_DEFINITIONS).map(([key, definition]) => [key, [...definition.defaults]]))
}
function listFieldDisabled(listKey, fieldKey) {
  const selected = listSettingsDraft.value[listKey] || []
  return fieldKey === 'style' || (selected.length >= MAX_LIST_DISPLAY_FIELDS && !selected.includes(fieldKey))
}

async function handleUserCommand(command) {
  if (command !== 'logout') return
  const token = localStorage.getItem('appAuthToken') || sessionStorage.getItem('appAuthToken')
  try {
    await fetch('/api/auth/logout', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} })
  } catch {
    // 本地会话即使后端暂时不可达也照常清除。
  }
  localStorage.removeItem('appAuthToken')
  localStorage.removeItem('appAuthUser')
  sessionStorage.removeItem('appAuthToken')
  sessionStorage.removeItem('appAuthUser')
  await router.replace('/login')
}

function workspaceTabLabel(path, query = {}) {
  if (path === '/back') return '工作台'
  if (path === '/back/products' && query.style_view === 'info') return '产品目录'
  if (path === '/back/products' && query.style_view === 'all') {
    return query.style_group ? `款式管理-${query.style_group}` : query.style_progress ? `款式管理-${query.style_progress}` : '款式管理'
  }
  if (path === '/back/products' && query.style_view === 'new') return '上新定价'
  if (path === '/back/products') return query.style_group ? `款式管理-${query.style_group}` : query.style_progress ? `款式管理-${query.style_progress}` : '产品进度'
  if (path.startsWith('/back/products/')) return '款式详情'
  if (path === '/back/patterns' && query.pattern_view === 'paper') return '纸样管理'
  if (path === '/back/patterns' && query.pattern_view === 'board') return '纸样管理-车板'
  if (path === '/back/patterns') return query.pattern_progress ? `纸样管理-${query.pattern_progress}` : '纸样面板'
  if (path.startsWith('/back/patterns/')) return '纸样详情'
  if (path === '/back/category-planning') return '品类规划'
  if (path === '/back/users') return '用户管理'
  if (path === '/back/system-logs') return '系统日志'
  if (path === '/back/announcements') return '公告管理'
  return '工作台'
}

function workspaceTabId(path, query = {}) {
  const queryString = Object.keys(query).sort().map((key) => `${key}=${String(query[key])}`).join('&')
  return `${path}?${queryString}`
}

function sameWorkspaceQuery(left = {}, right = {}) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  return [...keys].every((key) => String(left[key] ?? '') === String(right[key] ?? ''))
}

function workspaceTabWidth(label) {
  const text = String(label || '')
  const textWidth = Array.from(text).reduce((width, character) => width + (character.charCodeAt(0) > 255 ? 14 : 7), 0)
  return `${Math.max(94, textWidth + 44)}px`
}

async function ensureWorkspaceTab() {
  const path = route.path
  const query = { ...route.query }
  let label = workspaceTabLabel(path, query)
  if (path.startsWith('/back/products/')) {
    const querySku = String(route.query.sku || '')
    const routeId = decodeURIComponent(String(route.params.id || ''))
    const detailPrefix = query.detail_source === 'directory' ? '目录款式' : '款式'
    label = querySku ? `${detailPrefix}-${querySku}` : (routeId ? `${detailPrefix}-${routeId}` : '款式详情')
    if (!querySku && routeId) {
      try {
        const response = await fetch('/api/products/' + encodeURIComponent(routeId))
        const result = await response.json()
        if (response.ok && result.sku) label = `${detailPrefix}-${result.sku}`
      } catch {
        // 详情接口失败时保留路由参数作为临时标签。
      }
    }
  } else if (path.startsWith('/back/patterns/')) {
    const sku = String(route.query.sku || '')
    label = sku ? `纸样-${sku}` : label
    if (!sku) {
      try {
        const response = await fetch('/api/products/' + encodeURIComponent(String(route.params.id || '')))
        const result = await response.json()
        if (response.ok && result.sku) label = `纸样-${result.sku}`
      } catch {
        // 详情接口失败时保留通用标签。
      }
    }
  }
  if (route.path !== path) return
  const existing = workspaceTabs.value.find((tab) => {
    if (tab.path === path && sameWorkspaceQuery(tab.query, query)) return true
    const isSameProductDetail = path.startsWith('/back/products/') && tab.path.startsWith('/back/products/')
    return isSameProductDetail
      && query.sku
      && tab.query?.sku === query.sku
      && String(tab.query?.detail_source || '') === String(query.detail_source || '')
  })
  if (existing) {
    existing.path = path
    existing.query = query
    existing.label = label
    existing.id = workspaceTabId(path, query)
    return
  }
  workspaceTabs.value.push({ id: workspaceTabId(path, query), path, query, label })
}

function openWorkspaceTab(tab) {
  if (suppressWorkspaceTabClick.value) {
    suppressWorkspaceTabClick.value = false
    if (workspaceTabClickTimer) window.clearTimeout(workspaceTabClickTimer)
    workspaceTabClickTimer = null
    return
  }
  if (workspaceTabCloseTimer) {
    window.clearTimeout(workspaceTabCloseTimer)
    workspaceTabCloseTimer = null
  }
  router.push({ path: tab.path, query: tab.query })
}

function handleWorkspaceTabPointerDown(tab, event) {
  if (event.button !== 0 || event.target.closest('.workspace-tab-close')) return
  const tabsBar = workspaceTabsRef.value
  if (!tabsBar) return
  workspacePointerDragState = {
    tabId: tab.id,
    pointerId: event.pointerId,
    startX: event.clientX,
    moved: false,
    element: tabsBar,
  }
  tabsBar.setPointerCapture?.(event.pointerId)
}

function handleWorkspaceTabPointerMove(event) {
  const state = workspacePointerDragState
  if (!state || state.pointerId !== event.pointerId) return
  if (!state.moved && Math.abs(event.clientX - state.startX) < 6) return
  if (!state.moved) {
    state.moved = true
    draggingWorkspaceTabId.value = state.tabId
  }
  const tabsBar = workspaceTabsRef.value
  if (!tabsBar) return
  const bounds = tabsBar.getBoundingClientRect()
  const x = Math.max(bounds.left + 8, Math.min(bounds.right - 8, event.clientX))
  const tabElements = [...tabsBar.querySelectorAll('.workspace-tab')]
  const sourceIndex = workspaceTabs.value.findIndex((tab) => tab.id === state.tabId)
  if (sourceIndex < 0) return
  const insertionIndex = tabElements.findIndex((element) => {
    const rect = element.getBoundingClientRect()
    return element.dataset.tabId !== state.tabId && x < rect.left + rect.width / 2
  })
  const desiredIndex = insertionIndex < 0 ? workspaceTabs.value.length : insertionIndex
  const targetElement = tabElements[desiredIndex] || tabElements.at(-1)
  const targetId = targetElement?.dataset.tabId || ''
  workspaceDragOverTabId.value = targetId !== state.tabId ? targetId : ''
  if (desiredIndex === sourceIndex || desiredIndex === sourceIndex + 1) return
  const [movedTab] = workspaceTabs.value.splice(sourceIndex, 1)
  workspaceTabs.value.splice(sourceIndex < desiredIndex ? desiredIndex - 1 : desiredIndex, 0, movedTab)
}

function handleWorkspaceTabPointerUp(event) {
  const state = workspacePointerDragState
  if (!state || state.pointerId !== event.pointerId) return
  state.element?.releasePointerCapture?.(event.pointerId)
  if (event.type === 'pointerup') {
    if (!state.moved) {
      const tab = workspaceTabs.value.find((item) => item.id === state.tabId)
      if (tab) router.push({ path: tab.path, query: tab.query })
    }
    suppressWorkspaceTabClick.value = true
    if (workspaceTabClickTimer) window.clearTimeout(workspaceTabClickTimer)
    workspaceTabClickTimer = window.setTimeout(() => {
      suppressWorkspaceTabClick.value = false
      workspaceTabClickTimer = null
    }, 300)
  }
  workspacePointerDragState = null
  draggingWorkspaceTabId.value = ''
  workspaceDragOverTabId.value = ''
}

function handleWorkspaceTabsWheel(event) {
  const container = workspaceTabsRef.value
  if (!container) return
  const distance = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
  if (!distance) return
  container.scrollLeft += distance
}

function scrollActiveWorkspaceTabIntoView() {
  nextTick(() => workspaceTabsRef.value?.querySelector('.workspace-tab.active')?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' }))
}

function closeWorkspaceTab(tab) {
  const index = workspaceTabs.value.findIndex((item) => item.id === tab.id)
  if (index < 0) return
  if (tab.path === '/back/products') {
    const progress = typeof tab.query?.style_progress === 'string' ? tab.query.style_progress : ''
    const scope = progress
      ? `progress-${progress}`
      : (tab.query?.style_view === 'all' ? 'all-styles' : tab.query?.style_view === 'info' ? 'product-info' : 'overview')
    sessionStorage.removeItem(`style-management-filters:${encodeURIComponent(scope)}`)
    sessionStorage.removeItem('style-management-filters')
  }
  const wasActive = isWorkspaceTabActive(tab)
  workspaceTabs.value.splice(index, 1)
  if (!wasActive) return
  const nextTab = workspaceTabs.value[index] || workspaceTabs.value[index - 1]
  if (workspaceTabCloseTimer) window.clearTimeout(workspaceTabCloseTimer)
  workspaceTabCloseTimer = window.setTimeout(() => {
    workspaceTabCloseTimer = null
    router.push(nextTab ? { path: nextTab.path, query: nextTab.query } : '/back')
  }, 220)
}

function handleWorkspaceTabUpdated(event) {
  const detail = event.detail || {}
  const currentPath = detail.oldPath || route.path
  const tab = workspaceTabs.value.find((item) => item.path === currentPath && sameWorkspaceQuery(item.query, route.query))
    || workspaceTabs.value.find((item) => item.path === currentPath)
  if (!tab) return
  tab.path = detail.path || tab.path
  tab.query = detail.query ? { ...detail.query } : tab.query
  tab.label = detail.label || tab.label
  tab.id = workspaceTabId(tab.path, tab.query)
}

function formatDateLabel(date) {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}年${pad(date.getMonth() + 1)}月${pad(date.getDate())}日 ${weekdays[date.getDay()]} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function refreshDateLabel() {
  const now = new Date()
  dateLabel.value = formatDateLabel(now)
  greetingLabel.value = now.getHours() < 11 ? '早上好' : now.getHours() < 18 ? '下午好' : '晚上好'
}

function formatAnnouncementTime(value) {
  if (!value) return '未记录发布时间'
  const date = new Date(String(value).replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function announcementReadStorageKey() {
  return `announcement-read:${currentUser.value.id || currentUser.value.account || 'anonymous'}`
}

function loadReadAnnouncementIds() {
  try {
    const stored = localStorage.getItem(announcementReadStorageKey())
    const saved = JSON.parse(stored || '[]')
    readAnnouncementIds.value = new Set(Array.isArray(saved) ? saved.map(Number).filter(Number.isSafeInteger) : [])
  } catch {
    readAnnouncementIds.value = new Set()
  }
}

function persistReadAnnouncementIds() {
  localStorage.setItem(announcementReadStorageKey(), JSON.stringify([...readAnnouncementIds.value]))
}

const unreadAnnouncementCount = computed(() => announcements.value.filter((announcement) => !readAnnouncementIds.value.has(Number(announcement.id))).length)

function markAnnouncementsAsRead(items = announcements.value) {
  const next = new Set(readAnnouncementIds.value)
  items.forEach((announcement) => next.add(Number(announcement.id)))
  if (next.size === readAnnouncementIds.value.size) return
  readAnnouncementIds.value = next
  persistReadAnnouncementIds()
}

async function loadPublishedAnnouncements() {
  announcementLoading.value = true
  try {
    const response = await fetch('/api/announcements/active')
    const result = await response.json()
    if (!response.ok) throw new Error(result.message || '公告加载失败')
    announcements.value = Array.isArray(result.data) ? result.data : []
  } catch {
    announcements.value = []
  } finally {
    announcementLoading.value = false
  }
}

async function handleAnnouncementPopoverShow() {
  await loadPublishedAnnouncements()
}

function openAnnouncementDetail(announcement) {
  markAnnouncementsAsRead([announcement])
  selectedAnnouncement.value = announcement
  announcementPanelVisible.value = false
  announcementDetailVisible.value = true
}

onMounted(() => {
  refreshDateLabel()
  loadReadAnnouncementIds()
  dateTimer = window.setInterval(refreshDateLabel, 60 * 1000)
  window.addEventListener('workspace-tab-updated', handleWorkspaceTabUpdated)
  loadWorkbenchProgress()
  loadPublishedAnnouncements()
})
onBeforeUnmount(() => {
  window.clearInterval(dateTimer)
  if (workspaceTabCloseTimer) window.clearTimeout(workspaceTabCloseTimer)
  if (workspaceTabClickTimer) window.clearTimeout(workspaceTabClickTimer)
  window.removeEventListener('workspace-tab-updated', handleWorkspaceTabUpdated)
})
watch(() => route.fullPath, async () => {
  await ensureWorkspaceTab()
  scrollActiveWorkspaceTabIntoView()
}, { immediate: true })

async function loadWorkbenchProgress() {
  workbenchLoading.value = true
  try {
    const response = await fetch('/api/products?page=1&pageSize=100')
    const result = await response.json()
    if (!response.ok) throw new Error(result.message || '进度统计加载失败')
    workbenchProducts.value = Array.isArray(result.data) ? result.data : []
  } catch {
    workbenchProducts.value = []
  } finally {
    workbenchLoading.value = false
  }
}

function progressCount(field, value) {
  const fallback = field === 'style_progress' ? '选图' : '分配中'
  return workbenchProducts.value.filter((product) => {
    const canceled = product.is_canceled === true || Number(product.is_canceled) === 1 || product.style_progress === '款式取消'
    if (field === 'pattern_progress' && canceled && value !== '款式取消') return false
    if (field === 'pattern_progress' && !canceled && value === '款式取消') return false
    if (field === 'pattern_progress' && !canceled && !hasPatternData(product)) return false
    if (field === 'pattern_progress' && value === '已分配' && (!String(product.pattern_maker || '').trim() || product.pattern_progress !== '已分配')) return false
    const currentProgress = field === 'pattern_progress' && canceled ? '款式取消' : (product[field] || fallback)
    if (currentProgress !== value) return false
    const range = progressDateRange.value
    if (!range?.length) return true
    const timesField = field === 'style_progress' || (field === 'pattern_progress' && canceled) ? 'style_progress_times' : 'pattern_progress_times'
    const timestamp = product[timesField]?.[field === 'pattern_progress' && canceled ? '款式取消' : value]
    if (!timestamp) return false
    const date = String(timestamp).slice(0, 10)
    return (!range[0] || date >= range[0]) && (!range[1] || date <= range[1])
  }).length
}

const workbenchSummary = computed(() => {
  const products = workbenchProducts.value
  const completed = products.filter((product) => ['完成', '已排期'].includes(String(product.style_progress || '').trim())).length
  const canceled = products.filter((product) => String(product.style_progress || '').trim() === '款式取消').length
  const newArrivals = products.filter((product) => String(product.release_date || '').trim()).length
  return {
    total: products.length,
    inProgress: Math.max(products.length - completed - canceled, 0),
    newArrivals,
    patternPending: patternProgressOptions.reduce((total, item) => total + progressCount('pattern_progress', item), 0),
  }
})

const workbenchRecentProducts = computed(() => [...workbenchProducts.value]
  .sort((left, right) => String(right.updated_at || right.created_at || right.release_date || '').localeCompare(String(left.updated_at || left.created_at || left.release_date || '')))
  .slice(0, 5))

function workbenchProgressPercent(field, value) {
  const options = field === 'style_progress' ? styleProgressOptions : patternProgressOptions
  const max = Math.max(...options.map((item) => progressCount(field, item)), 1)
  const count = progressCount(field, value)
  return count ? `${Math.max(8, Math.round((count / max) * 100))}%` : '0%'
}

function workbenchProgressLabel(product) {
  const progress = String(product?.style_progress || '').trim() || '选图'
  if (progress === '搭配' || progress === '搭配中') return '搭配中'
  if (progress === '完成' || progress === '已排期') return '已排期'
  if (progress === '款式取消') return '已淘汰'
  return progress
}

function workbenchProgressType(product) {
  const progress = String(product?.style_progress || '').trim()
  if (progress === '完成') return 'success'
  if (progress === '款式取消') return 'danger'
  if (['打版', '打板', '打版中', '审版中', '核价中', '搭配', '搭配中'].includes(progress)) return 'warning'
  return 'primary'
}

function openWorkbenchProduct(product) {
  if (!product?.id) return
  router.push({ path: `/back/products/${encodeURIComponent(product.id)}`, query: { sku: product.sku, return_to: route.fullPath } })
}

function hasPatternData(product) {
  return Boolean(product.category && product.designer && product.priority && product.pattern_notes && product.image_url)
}

function openProgressList(type, value) {
  const query = type === 'style' ? { style_progress: value } : { pattern_progress: value }
  if (progressDateRange.value?.[0]) {
    query.progress_from = progressDateRange.value[0]
    query.progress_to = progressDateRange.value[1] || progressDateRange.value[0]
  }
  router.push(type === 'style' ? { path: '/back/products', query } : { path: '/back/patterns', query })
}

function activeBusinessMenu(path, query = {}) {
  if (path.startsWith('/back/products/')) return query.detail_source === 'directory' ? '产品目录' : '款式管理'
  if (path === '/back/products') return query.style_view === 'info' ? '产品目录' : query.style_view === 'all' ? '款式管理' : query.style_view === 'new' ? '上新定价' : '产品进度'
  if (path.startsWith('/back/patterns/')) return '纸样管理'
  if (path === '/back/patterns') return query.pattern_view === 'paper' ? '纸样管理' : '纸样面板'
  if (path === '/back/category-planning') return '品类规划'
  if (path === '/back/users') return '用户管理'
  if (path === '/back/system-logs') return '系统日志'
  if (path === '/back/announcements') return '公告管理'
  return '工作台'
}
const activeMenu = ref(activeBusinessMenu(route.path, route.query))
const isProductPage = computed(() => route.path === '/back/products')
const isProductDetail = computed(() => route.path.startsWith('/back/products/'))
const isPatternPage = computed(() => route.path === '/back/patterns')
const isPatternDetail = computed(() => route.path.startsWith('/back/patterns/'))
const isCategoryPlanningPage = computed(() => route.path === '/back/category-planning')
const isUserManagementPage = computed(() => route.path === '/back/users')
const isSystemLogPage = computed(() => route.path === '/back/system-logs')
const isAnnouncementPage = computed(() => route.path === '/back/announcements')

watch(() => route.path, (path) => {
  if (path === '/back') loadWorkbenchProgress()
})
watch(() => [route.path, route.query.style_view, route.query.pattern_view, route.query.detail_source], ([path]) => {
  activeMenu.value = activeBusinessMenu(path, route.query)
})

const menuGroups = computed(() => [
  {
    label: '产品开发',
    items: [
      { label: '产品目录', icon: FolderOpened },
      { label: '款式管理', icon: Goods },
      { label: '上新定价', icon: Money },
      { label: '纸样管理', icon: Scissor },
      { label: '产品进度', icon: TrendCharts },
      { label: '纸样面板', icon: Notebook },
      { label: '品类规划', icon: DataAnalysis },
    ],
  },
  { label: '业务总览', items: [{ label: '工作台', icon: HomeFilled }] },
  ...(isSuperAdmin.value ? [{ label: '系统管理', items: [{ label: '用户管理', icon: UserFilled }, { label: '系统日志', icon: Document }, { label: '公告管理', icon: Bell }] }] : []),
])

function selectMenu(label) {
  activeMenu.value = label
  if (label === '产品目录') {
    router.push({ path: '/back/products', query: { style_view: 'info' } })
    return
  }
  if (label === '款式管理') {
    router.push({ path: '/back/products', query: { style_view: 'all' } })
    return
  }
  if (label === '上新定价') {
    router.push({ path: '/back/products', query: { style_view: 'new' } })
    return
  }
  if (label === '产品进度') {
    router.push('/back/products')
    return
  }
  if (label === '纸样管理') {
    router.push({ path: '/back/patterns', query: { pattern_view: 'paper' } })
    return
  }
  if (label === '纸样面板') {
    router.push('/back/patterns')
    return
  }
  if (label === '品类规划') {
    router.push('/back/category-planning')
    return
  }
  if (label === '用户管理' && isSuperAdmin.value) {
    router.push('/back/users')
    return
  }
  if (label === '系统日志' && isSuperAdmin.value) {
    router.push('/back/system-logs')
    return
  }
  if (label === '公告管理' && isSuperAdmin.value) {
    router.push('/back/announcements')
    return
  }
  if (route.path !== '/back') router.push('/back')
  if (label !== '工作台') ElMessage.info(`${label}模块正在准备中`)
}

function selectAllStyles() {
  activeMenu.value = '款式管理'
  router.push({ path: '/back/products', query: { style_view: 'all' } })
}

function selectProductInfo() {
  activeMenu.value = '款式管理'
  router.push({ path: '/back/products', query: { style_view: 'info' } })
}

function selectNewArrivals() {
  activeMenu.value = '款式管理'
  router.push({ path: '/back/products', query: { style_view: 'new' } })
}

function toggleStyleProgress() {
  styleProgressExpanded.value = !styleProgressExpanded.value
}

function togglePatternManagement() {
  patternManagementExpanded.value = !patternManagementExpanded.value
}

function selectPatternView(view) {
  activeMenu.value = '纸样管理'
  router.push({ path: '/back/patterns', query: { pattern_view: view } })
}

function openCollapsedSubmenu(itemLabel, key) {
  if (itemLabel === '款式管理') {
    if (key === 'product') selectProductInfo()
    else if (key === 'styles') selectAllStyles()
    else if (key === 'new') selectNewArrivals()
    return
  }
  if (itemLabel === '纸样管理' && key === 'paper') selectPatternView('paper')
}

function isAllStylesActive() {
  return route.path === '/back/products' && route.query.style_view === 'all' && !route.query.style_progress
}

function isProductInfoActive() {
  return route.path === '/back/products' && route.query.style_view === 'info' && !route.query.style_progress
}

function isNewArrivalsActive() {
  return route.path === '/back/products' && route.query.style_view === 'new' && !route.query.style_progress
}

function isWorkspaceTabActive(tab) {
  return tab.path === route.path && sameWorkspaceQuery(tab.query, route.query)
}

</script>

<template>
  <div class="admin-shell" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
    <aside class="sidebar">
      <div class="brand-lockup">
        <div class="brand-mark">W</div>
        <div class="brand-lockup-copy">
          <div class="brand-name">威思服饰</div>
          <div class="brand-subtitle">WISE FASHION</div>
        </div>
      </div>

      <nav class="sidebar-nav" aria-label="主导航">
        <div v-for="group in menuGroups" :key="group.label" class="nav-group">
          <div class="nav-group-label">{{ group.label }}</div>
          <template v-for="item in group.items" :key="item.label">
            <div class="nav-item-row">
              <button
                type="button"
                class="nav-item"
                :class="{ active: activeMenu === item.label }"
                :title="sidebarCollapsed ? item.label : undefined"
                @click="selectMenu(item.label)"
              >
                <el-icon><component :is="item.icon" /></el-icon>
                <span>{{ item.label }}</span>
              </button>
            </div>
          </template>
        </div>
      </nav>

      <button type="button" class="sidebar-settings-button" :title="sidebarCollapsed ? '列表显示设置' : undefined" @click="openListSettings">
        <el-icon><Setting /></el-icon>
        <span>列表显示设置</span>
      </button>

      <button type="button" class="sidebar-toggle" :aria-label="sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'" :title="sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'" @click="toggleSidebar">
        <el-icon><Expand v-if="sidebarCollapsed" /><Fold v-else /></el-icon>
        <span class="sidebar-toggle-label">{{ sidebarCollapsed ? '展开菜单' : '收起菜单' }}</span>
      </button>

    </aside>

    <el-drawer v-model="listSettingsVisible" title="列表显示设置" size="420px" append-to-body class="list-settings-drawer">
      <div class="list-settings-content">
        <p class="list-settings-intro">款式列固定为 240px，其它字段固定为 120px，内容过长会自动换行。按常用桌面宽度估算，单个列表通常可放下约 7–8 个字段（含款式），超出后可横向滚动。</p>
        <section v-for="(definition, listKey) in LIST_DISPLAY_DEFINITIONS" :key="listKey" class="list-settings-section">
          <div class="list-settings-section-heading"><strong>{{ definition.label }}</strong><span>{{ listSettingsDraft[listKey]?.length || 0 }}/{{ MAX_LIST_DISPLAY_FIELDS }} 项</span></div>
          <el-checkbox-group v-model="listSettingsDraft[listKey]" class="list-settings-fields">
              <el-checkbox v-for="field in definition.fields" :key="field.key" :label="field.key" :disabled="listFieldDisabled(listKey, field.key)" border>{{ field.label }}<span v-if="field.key === 'style'" class="list-settings-required">必选</span></el-checkbox>
          </el-checkbox-group>
        </section>
      </div>
      <template #footer>
        <div class="list-settings-footer"><el-button @click="resetListSettingsDraft">恢复默认</el-button><el-button type="primary" @click="saveListSettingsDraft">保存设置</el-button></div>
      </template>
    </el-drawer>

    <main class="main-area">
      <header class="topbar">
        <div class="breadcrumb"><span>威思服饰</span><span class="breadcrumb-slash">/</span><strong>{{ activeMenu }}</strong><template v-if="isProductDetail"><span class="breadcrumb-slash">/</span><strong>款式详情</strong></template></div>
        <div class="topbar-actions">
          <el-popover v-model:visible="announcementPanelVisible" placement="bottom-end" trigger="click" :width="360" popper-class="announcement-popover" @show="handleAnnouncementPopoverShow">
            <template #reference>
              <button
                type="button"
                class="icon-button notification-button"
                :class="{ 'has-notice': unreadAnnouncementCount }"
                :aria-label="unreadAnnouncementCount ? `通知，${unreadAnnouncementCount}条未读公告` : '通知'"
                title="通知"
              >
                <el-icon><Bell /></el-icon>
                <span v-if="unreadAnnouncementCount" class="notification-badge">{{ unreadAnnouncementCount > 99 ? '99+' : unreadAnnouncementCount }}</span>
              </button>
            </template>
            <div class="announcement-popover-content">
              <div class="announcement-popover-heading">
                <strong>公告通知</strong>
                <span>{{ announcements.length }} 条已发布</span>
              </div>
              <el-skeleton v-if="announcementLoading" :rows="4" animated />
              <el-empty v-else-if="!announcements.length" description="暂无公告" :image-size="56" />
              <div v-else class="announcement-popover-list">
                <button v-for="announcement in announcements" :key="announcement.id" type="button" class="announcement-popover-item" @click="openAnnouncementDetail(announcement)">
                  <div class="announcement-popover-item-heading">
                    <strong>{{ announcement.title }}</strong>
                    <time>{{ formatAnnouncementTime(announcement.published_at) }}</time>
                  </div>
                  <p>{{ announcement.content }}</p>
                </button>
              </div>
            </div>
          </el-popover>
          <el-dialog v-model="announcementDetailVisible" title="公告详情" width="560px" class="announcement-detail-dialog">
            <div v-if="selectedAnnouncement" class="announcement-detail-content">
              <div class="announcement-detail-heading">
                <h2>{{ selectedAnnouncement.title }}</h2>
                <time>{{ formatAnnouncementTime(selectedAnnouncement.published_at) }}</time>
              </div>
              <p>{{ selectedAnnouncement.content }}</p>
            </div>
          </el-dialog>
          <div class="topbar-divider"></div>
          <el-dropdown trigger="click" @command="handleUserCommand">
            <button type="button" class="topbar-user" aria-label="用户菜单">
              <el-avatar :size="32" class="topbar-avatar">{{ userName.slice(0, 1) }}</el-avatar>
              <span class="topbar-user-copy"><strong>{{ userName }}</strong><small>{{ userPosition }}</small></span>
              <el-icon class="topbar-user-chevron"><ArrowDown /></el-icon>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="logout"><el-icon><SwitchButton /></el-icon>退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <nav ref="workspaceTabsRef" class="workspace-tabs" aria-label="已打开页面" @wheel.prevent="handleWorkspaceTabsWheel" @pointermove="handleWorkspaceTabPointerMove" @pointerup="handleWorkspaceTabPointerUp" @pointercancel="handleWorkspaceTabPointerUp">
        <TransitionGroup name="workspace-tab-motion" tag="div" class="workspace-tab-list">
          <div v-for="tab in workspaceTabs" :key="tab.id" :data-tab-id="tab.id" class="workspace-tab" :style="{ width: workspaceTabWidth(tab.label) }" :class="{ active: isWorkspaceTabActive(tab), dragging: draggingWorkspaceTabId === tab.id, 'drag-over': workspaceDragOverTabId === tab.id }" @pointerdown="handleWorkspaceTabPointerDown(tab, $event)">
            <button type="button" class="workspace-tab-main" :title="tab.label" @click="openWorkspaceTab(tab)">{{ tab.label }}</button>
            <button type="button" class="workspace-tab-close" :aria-label="`关闭${tab.label}`" title="关闭" @click.stop="closeWorkspaceTab(tab)"><el-icon><Close /></el-icon></button>
          </div>
        </TransitionGroup>
      </nav>

      <div class="content-wrap" :class="{ 'detail-content-wrap': isProductDetail }">
        <Transition name="content-swap" mode="out-in">
          <div :key="route.path" class="content-motion-surface">
        <ProductManagement v-if="isProductPage" />
        <ProductDetail v-else-if="isProductDetail" />
        <PatternManagement v-else-if="isPatternPage" />
        <PatternDetail v-else-if="isPatternDetail" />
        <CategoryPlanning v-else-if="isCategoryPlanningPage" />
        <UserManagement v-else-if="isUserManagementPage && isSuperAdmin" />
        <SystemLogManagement v-else-if="isSystemLogPage && isSuperAdmin" />
        <AnnouncementManagement v-else-if="isAnnouncementPage && isSuperAdmin" />
        <template v-else>
          <section class="page-heading workbench-page-heading">
            <div class="workbench-greeting"><p class="workbench-greeting-line">{{ greetingLabel }}，{{ userName }}</p><p class="workbench-date-label">{{ dateLabel }}</p></div>
            <div class="heading-actions"><el-date-picker v-model="progressDateRange" type="daterange" value-format="YYYY-MM-DD" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" clearable class="workbench-date-filter" /><el-button class="export-button" @click="loadWorkbenchProgress"><el-icon><Refresh /></el-icon>刷新</el-button></div>
          </section>

          <section class="workbench-metric-grid" aria-label="工作台指标">
            <article class="workbench-metric-card"><div><span>款式总数</span><strong>{{ workbenchSummary.total }}</strong><small>款</small></div><el-icon class="workbench-metric-icon"><Goods /></el-icon></article>
            <article class="workbench-metric-card"><div><span>开发中</span><strong>{{ workbenchSummary.inProgress }}</strong><small>款</small></div><el-icon class="workbench-metric-icon blue"><Document /></el-icon></article>
            <article class="workbench-metric-card"><div><span>待处理纸样</span><strong>{{ workbenchSummary.patternPending }}</strong><small>款</small></div><el-icon class="workbench-metric-icon amber"><List /></el-icon></article>
            <article class="workbench-metric-card"><div><span>未读公告</span><strong>{{ unreadAnnouncementCount }}</strong><small>条</small></div><el-icon class="workbench-metric-icon coral"><Bell /></el-icon></article>
          </section>

          <section class="workbench-dashboard-grid">
            <article class="panel workbench-progress-panel">
              <div class="panel-heading"><div><h2>款式流程</h2><p>点击阶段进入对应列表</p></div><span class="workbench-panel-note">{{ workbenchSummary.total }} 款</span></div>
              <div v-if="workbenchLoading" class="workbench-progress-list workbench-progress-skeleton-list" aria-label="正在加载款式进度">
                <div v-for="item in styleProgressOptions" :key="item" class="workbench-progress-item workbench-progress-skeleton-item"><el-skeleton animated><template #template><el-skeleton-item variant="text" class="workbench-skeleton-label" /><el-skeleton-item variant="text" class="workbench-skeleton-track" /><el-skeleton-item variant="text" class="workbench-skeleton-number" /></template></el-skeleton></div>
              </div>
              <div v-else class="workbench-progress-list">
                <button v-for="item in styleProgressOptions" :key="item" type="button" class="workbench-progress-item" :class="{ 'is-complete': ['完成', '已排期'].includes(item) }" @click="openProgressList('style', item)"><span>{{ item === '搭配' ? '搭配中' : item === '完成' ? '已完成' : item }}</span><i class="workbench-progress-track"><i :style="{ width: workbenchProgressPercent('style_progress', item) }" /></i><strong>{{ progressCount('style_progress', item) }}</strong></button>
              </div>
            </article>
            <article class="panel workbench-progress-panel">
              <div class="panel-heading"><div><h2>纸样流程</h2><p>点击阶段进入对应列表</p></div><span class="workbench-panel-note">{{ workbenchSummary.patternPending }} 款</span></div>
              <div v-if="workbenchLoading" class="workbench-progress-list workbench-progress-skeleton-list" aria-label="正在加载纸样进度">
                <div v-for="item in patternProgressOptions" :key="item" class="workbench-progress-item workbench-progress-skeleton-item"><el-skeleton animated><template #template><el-skeleton-item variant="text" class="workbench-skeleton-label" /><el-skeleton-item variant="text" class="workbench-skeleton-track" /><el-skeleton-item variant="text" class="workbench-skeleton-number" /></template></el-skeleton></div>
              </div>
              <div v-else class="workbench-progress-list">
                <button v-for="item in patternProgressOptions" :key="item" type="button" class="workbench-progress-item" :class="{ 'is-complete': item === '已通过' }" @click="openProgressList('pattern', item)"><span>{{ item }}</span><i class="workbench-progress-track"><i :style="{ width: workbenchProgressPercent('pattern_progress', item) }" /></i><strong>{{ progressCount('pattern_progress', item) }}</strong></button>
              </div>
            </article>
          </section>

          <section class="panel workbench-recent-panel">
            <div class="panel-heading"><div><h2>最近动态</h2><p>最近更新的款式和当前进度</p></div><span class="workbench-panel-note">更新时间：{{ dateLabel }}</span></div>
            <div v-if="workbenchLoading" class="workbench-recent-loading"><el-skeleton :rows="4" animated /></div>
            <el-empty v-else-if="!workbenchRecentProducts.length" description="暂无最近动态" :image-size="64" />
            <div v-else class="workbench-recent-table-wrap">
              <table class="workbench-recent-table"><thead><tr><th>款式</th><th>当前进度</th><th>设计师</th><th>上新日期</th><th>查看</th></tr></thead><tbody><tr v-for="product in workbenchRecentProducts" :key="product.id" @click="openWorkbenchProduct(product)"><td><strong>{{ product.sku || '未填写款号' }}</strong><span>{{ product.link || '—' }}</span></td><td><el-tag size="small" effect="plain" :type="workbenchProgressType(product)">{{ workbenchProgressLabel(product) }}</el-tag></td><td>{{ product.designer || '—' }}</td><td>{{ product.release_date ? String(product.release_date).slice(0, 10) : '—' }}</td><td><button type="button" class="workbench-row-link" @click.stop="openWorkbenchProduct(product)">查看详情</button></td></tr></tbody></table>
            </div>
          </section>
        </template>
          </div>
        </Transition>
      </div>
    </main>
  </div>
</template>
