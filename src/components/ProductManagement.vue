<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Box, Close, Delete, Plus, Refresh, Search, CircleCheckFilled, CircleCloseFilled, TrendCharts, DataAnalysis } from '@element-plus/icons-vue'
import { useRoute, useRouter } from 'vue-router'
import ImageUploader from './ImageUploader.vue'
import { getLinkDisplayLabel, getStyleProgressSteps, isMatchingProgressComplete, normalizeStyleProgress, requiresSeason, STYLE_PROGRESS_STEPS } from '../styleProgress.js'
import { LIST_DISPLAY_DEFINITIONS, hasListDisplayField, readListDisplaySettings } from '../listDisplaySettings.js'

const route = useRoute()
const router = useRouter()
const products = ref([])
const total = ref(0)
const loading = ref(false)
const progressProducts = ref([])
const progressLoading = ref(false)
const releaseDateOptions = ref([])
const releaseDateFilter = ref('')
const planningDateFilter = ref('')
const planningSummary = ref(null)
const planningSummaryLoading = ref(false)
const listDisplaySettings = ref(readListDisplaySettings())
let planningSummaryRequestId = 0
const savingReleaseDateIds = ref(new Set())
const editingReleaseDateId = ref('')
const releaseDateDraft = ref('')
const editingPricingId = ref('')
const pricingDraft = ref(null)
const savingPricingIds = ref(new Set())
let suppressNextInlineOutsideClick = false
const dialogVisible = ref(false)
const dialogTitle = ref('新增款式')
const managerDialogVisible = ref(false)
const managerType = ref('category')
const managerInput = ref('')
const editingId = ref(null)
const formRef = ref()
const expandedCreateSections = ref([])
const categoryLoading = ref(false)
const designerLoading = ref(false)
const imageUploading = ref(false)
const filterStorageKey = 'style-management-filters'
let productSearchTimer
const filters = reactive({ search: '', sku: '', category: '', designer: '', release_date_range: [], link: '', status: '', style_progress: '', style_progress_from: '', style_progress_to: '', page: 1, pageSize: 10 })
const form = reactive({ sku: '', season: '', category: '', designer: '', release_date: '', link: '', season_type: '', color: '', composition: '', size: [], highlights: '', priority: '', has_pattern: '', pattern_notes: '', external_purchase_notes: '', price: 0, reference_sales: null, stock: 0, status: 'active', description: '', image_url: '', physical_image_url: '', design_image_url: '', front_back_image_url: '', size_chart_url: '', price_image_url: '', composition_image_url: '', is_resale_to_self_developed: '', external_purchase_progress: '', is_canceled: '', supplier: '', channel: '', address: '', contact: '', product_url: '', reference_link: '', official_matching_sku: '', designer_assistant: '' })

const categories = ref([])
const designers = ref([])
const fallbackCategories = [
  { name: '针织衫' },
  { name: '衬衫' },
  { name: '裤装' },
  { name: '外套' },
  { name: '配饰' },
]
const linkOptions = ['常规款', '常规优先款', '外发', '外采', 'AI款', 'AI外发款', '转自研板房', '转自研外发']
const seasonOptions = ['春', '夏', '秋', '冬']
const sizeOptions = ['XS', 'S', 'M', 'L', 'XL', '宽松', '合体', '修身']
const patternOptions = [{ label: '有图案', value: true }, { label: '有工艺', value: false }]
const priorityByLink = { 常规款: '四级', 常规优先款: '三级', 转自研款: '二级', 转自研板房: '二级', 转自研外发: '二级', AI款: '一级' }
const regularLinks = ['常规款', '常规优先款', '外发', '转自研板房', '转自研外发', 'AI款', 'AI外发款']
const isRegularCreateLink = computed(() => regularLinks.includes(form.link))
const isAiCreateLink = computed(() => ['AI款', 'AI外发款'].includes(form.link))
const isTransferCreateLink = computed(() => ['转自研板房', '转自研外发'].includes(form.link))
const styleProgressOptions = STYLE_PROGRESS_STEPS
function styleProgressOptionLabel(value) { return value === '完成' ? '已完成' : value }
const dashboardStatus = (product) => {
  if (isCanceledProduct(product)) return '已取消'
  if (String(product.status || '').trim() === 'inactive') return '已下架'
  const progress = String(product.style_progress || '').trim()
  if (progress === '完成' || progress === '已完成') return '已完成'
  if (progress === '已排期') return '已排期'
  if (progress === '上新' || progress === '待排期') return '未排期'
  return '作业中'
}
const styleDashboardMetrics = computed(() => {
  const rows = progressProducts.value
  const countGroup = (group) => rows.filter((product) => dashboardStatus(product) === group).length
  return [
    { key: 'working', label: '作业中', group: '作业中', value: countGroup('作业中'), icon: TrendCharts, tone: 'blue' },
    { key: 'unscheduled', label: '未排期', group: '未排期', value: countGroup('未排期'), icon: DataAnalysis, tone: 'teal' },
    { key: 'scheduled', label: '已排期', group: '已排期', value: countGroup('已排期'), icon: CircleCloseFilled, tone: 'slate' },
    { key: 'completed', label: '已完成', group: '已完成', value: countGroup('已完成'), icon: CircleCheckFilled, tone: 'green' },
    { key: 'canceled', label: '已取消', group: '已取消', value: countGroup('已取消'), icon: CircleCloseFilled, tone: 'red' },
    { key: 'inactive', label: '已下架', group: '已下架', value: countGroup('已下架'), icon: CircleCloseFilled, tone: 'orange' },
  ]
})
const designerDashboardCards = computed(() => {
  const grouped = new Map()
  designers.value.forEach((designer) => {
    const name = String(designer.name || '').trim()
    if (name) grouped.set(name, { name, total: 0, working: 0, unscheduled: 0, scheduled: 0, canceled: 0, inactive: 0 })
  })
  progressProducts.value.forEach((product) => {
    const name = String(product.designer || '').trim()
    if (!name) return
    if (!grouped.has(name)) grouped.set(name, { name, total: 0, working: 0, unscheduled: 0, scheduled: 0, canceled: 0, inactive: 0 })
    const card = grouped.get(name)
    card.total += 1
    const status = dashboardStatus(product)
    if (status === '作业中') card.working += 1
    if (status === '未排期') card.unscheduled += 1
    if (status === '已排期') card.scheduled += 1
    if (status === '已取消') card.canceled += 1
    if (status === '已下架') card.inactive += 1
  })
  return [...grouped.values()].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
})
const progressDashboardCards = computed(() => {
  const steps = [...new Set(linkOptions.flatMap((link) => getStyleProgressSteps(link)))].filter((value) => !['待排期', '已排期', '完成', '已完成'].includes(value))
  const counts = new Map(steps.map((value) => [value, 0]))
  progressProducts.value.forEach((product) => {
    if (isCanceledProduct(product)) return
    const progress = normalizeStyleProgress(product)
    const normalizedProgress = progress === '已完成' || progress === '打板中' ? (progress === '打板中' ? '打版中' : '完成') : progress
    if (counts.has(normalizedProgress)) counts.set(normalizedProgress, counts.get(normalizedProgress) + 1)
  })
  return steps.map((value) => ({ value, label: styleProgressOptionLabel(value), count: counts.get(value) || 0 }))
})
const externalPurchaseFields = [
  { key: 'sku', label: '款号', type: 'text' },
  { key: 'release_date', label: '上新日期', type: 'date' },
  { key: 'season_type', label: '季节', type: 'season' },
  { key: 'has_pattern', label: '图案/工艺', type: 'pattern' },
  { key: 'color', label: '颜色', type: 'text' },
  { key: 'price', label: '外采价格', type: 'number' },
  { key: 'size', label: '尺码', type: 'size' },
  { key: 'composition', label: '成分', type: 'text' },
  { key: 'highlights', label: '产品亮点', type: 'textarea' },
  { key: 'external_purchase_notes', label: '备注', type: 'textarea' },
]
const externalPurchaseSupplierFields = [
  { key: 'supplier', label: '供应商', type: 'text' },
  { key: 'channel', label: '渠道', type: 'text' },
  { key: 'address', label: '地址', type: 'text' },
  { key: 'contact', label: '联系方式', type: 'text' },
  { key: 'product_url', label: '产品链接', type: 'url' },
]
const externalPurchaseImageFields = [
  { key: 'price_image_url', label: '价格图' },
  { key: 'front_back_image_url', label: '正反图' },
  { key: 'composition_image_url', label: '成分图片' },
  { key: 'size_chart_url', label: '尺码表' },
]
const regularImageFields = [
  { key: 'design_image_url', label: '设计图' },
  { key: 'physical_image_url', label: '实物图' },
  { key: 'front_back_image_url', label: '正反图' },
  { key: 'composition_image_url', label: '成分图片' },
  { key: 'size_chart_url', label: '尺码表' },
]
const regularCreateFields = [
  { key: 'sku', label: '款号', type: 'text' },
  { key: 'release_date', label: '上新日期', type: 'date' },
  { key: 'season_type', label: '季节', type: 'season' },
  { key: 'color', label: '颜色', type: 'text' },
  { key: 'size', label: '尺码', type: 'size' },
  { key: 'composition', label: '成分', type: 'text' },
  { key: 'official_matching_sku', label: '官搭款号', type: 'text' },
  { key: 'reference_link', label: '参考链接', type: 'url' },
  { key: 'reference_sales', label: '参考销量', type: 'number', precision: 0, aiOnly: true },
  { key: 'price', label: 'AI预核价', type: 'number', precision: 2, aiOnly: true },
  { key: 'price', label: '外采价格', type: 'number', precision: 2, transferOnly: true },
  { key: 'highlights', label: '产品亮点', type: 'textarea' },
  { key: 'pattern_notes', label: '打板注意事项', type: 'textarea' },
]
const isOverview = computed(() => route.path === '/back/products' && !route.query.style_view && !route.query.style_progress)
const isProductInfo = computed(() => route.path === '/back/products' && route.query.style_view === 'info' && !route.query.style_progress)
const isNewArrivals = computed(() => route.path === '/back/products' && route.query.style_view === 'new' && !route.query.style_progress)
const isDirectoryOrStyleList = computed(() => route.path === '/back/products' && !isOverview.value && !isNewArrivals.value)
const activeListDisplayKey = computed(() => isProductInfo.value ? 'product' : isNewArrivals.value ? 'new_arrivals' : 'style')
function showListField(field) { return hasListDisplayField(listDisplaySettings.value, activeListDisplayKey.value, field) }
function handleListDisplaySettingsUpdated(event) { listDisplaySettings.value = event.detail || readListDisplaySettings() }
const productBaseListFields = new Set(['style', 'release_date', 'category', 'designer', 'link', 'priority', 'color', 'size', 'progress', 'cost', 'pricing'])
const activeListExtraFields = computed(() => {
  const definition = LIST_DISPLAY_DEFINITIONS[activeListDisplayKey.value]
  return (definition?.fields || []).filter((field) => !productBaseListFields.has(field.key) && showListField(field.key))
})
function listFieldValue(product, field) {
  if (field === 'season_type') return product.season_type || '—'
  if (field === 'status') return [1, '1', true, 'true'].includes(product.is_canceled) ? '已取消' : (product.status === 'active' ? '正常' : (product.status || '—'))
  if (field === 'stock' || field === 'reference_sales') return product[field] ?? '—'
  if (field === 'price') return product.price === null || product.price === undefined || product.price === '' ? '—' : `¥${formatCost(product.price)}`
  return product[field] || '—'
}
const showStyleActions = computed(() => !isOverview.value)
const imageFields = [
  { key: 'image_url', label: '参考图', required: true },
  { key: 'physical_image_url', label: '实物图' },
  { key: 'design_image_url', label: '设计图' },
  { key: 'front_back_image_url', label: '正反图' },
  { key: 'size_chart_url', label: '尺码表' },
]
const productImageKeys = ['image_url', 'physical_image_url', 'design_image_url', 'front_back_image_url', 'size_chart_url', 'price_image_url', 'composition_image_url']
function imageList(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String)
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String)
  } catch {
    // Legacy image values are stored as a single URL.
  }
  return [value]
}
function hasImages(value) { return imageList(value).length > 0 }
function serializeImageValue(value) {
  const images = imageList(value)
  return images.length > 1 ? JSON.stringify(images) : (images[0] || '')
}
watch(() => form.link, (link, previousLink) => {
  form.priority = priorityByLink[link] || ''
  if (previousLink) {
    expandedCreateSections.value = []
    nextTick(() => formRef.value?.clearValidate(['season', 'image_url', 'physical_image_url']))
  }
})
const rules = {
  link: [{ required: true, message: '请选择链路', trigger: 'change' }],
  category: [{ required: true, message: '请选择品类', trigger: 'change' }],
  season: [{ validator: (_rule, value, callback) => !requiresSeason(form.link) || value ? callback() : callback(new Error('请选择期数')), trigger: 'change' }],
  image_url: [{ validator: (_rule, value, callback) => form.link === '外采' || hasImages(value) ? callback() : callback(new Error('请上传参考图')), trigger: 'change' }],
  physical_image_url: [{ validator: (_rule, value, callback) => form.link !== '外采' || hasImages(value) ? callback() : callback(new Error('请上传实物图')), trigger: 'change' }],
  designer: [{ required: true, message: '请输入设计师', trigger: 'blur' }],
}

function filterStorageKeyFor(progress = filters.style_progress, view = route.query.style_view) {
  const scope = progress
    ? `progress-${progress}`
    : (view === 'all' ? 'all-styles' : view === 'info' ? 'product-directory' : view === 'new' ? 'new-arrivals' : 'overview')
  return `${filterStorageKey}:${encodeURIComponent(scope)}`
}

function restoreFilters(progress = '', view = route.query.style_view) {
  Object.assign(filters, { search: '', sku: '', category: '', designer: '', release_date_range: [], link: '', status: '', style_progress: progress, style_progress_from: '', style_progress_to: '', page: 1, pageSize: 10 })
  try {
    const saved = JSON.parse(sessionStorage.getItem(filterStorageKeyFor(progress, view)) || '{}')
    if (saved && typeof saved === 'object') Object.assign(filters, {
      search: typeof saved.search === 'string' ? saved.search : '',
      sku: typeof saved.sku === 'string' ? saved.sku : '',
      category: typeof saved.category === 'string' ? saved.category : '',
      designer: typeof saved.designer === 'string' ? saved.designer : '',
      release_date_range: Array.isArray(saved.release_date_range) && saved.release_date_range.length === 2
        ? saved.release_date_range
        : typeof saved.release_date === 'string' && saved.release_date ? [saved.release_date, saved.release_date] : [],
      link: typeof saved.link === 'string' ? saved.link : '',
      status: typeof saved.status === 'string' ? saved.status : '',
      style_progress_from: typeof saved.style_progress_from === 'string' ? saved.style_progress_from : '',
      style_progress_to: typeof saved.style_progress_to === 'string' ? saved.style_progress_to : '',
      page: Number.isInteger(saved.page) && saved.page > 0 ? saved.page : 1,
      pageSize: [10, 20, 50].includes(saved.pageSize) ? saved.pageSize : 10,
    })
  } catch { sessionStorage.removeItem(filterStorageKeyFor(progress, view)) }
}

function persistFilters() {
  sessionStorage.setItem(filterStorageKeyFor(), JSON.stringify({ ...filters }))
}

const managerTitle = () => managerType.value === 'category' ? '品类管理' : '设计师管理'
const managerItems = () => managerType.value === 'category' ? categories.value : designers.value
const managerPlaceholder = () => managerType.value === 'category' ? '请输入品类名称' : '请输入设计师姓名'

function openManager(type) {
  managerType.value = type
  managerInput.value = ''
  managerDialogVisible.value = true
}

async function addManagedItem() {
  const name = managerInput.value.trim()
  if (!name) return ElMessage.warning(managerPlaceholder())
  if (managerItems().some((item) => item.name === name)) return ElMessage.warning(managerTitle() + '中已存在“' + name + '”')
  const endpoint = managerType.value === 'category' ? '/api/categories' : '/api/designers'
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    const result = await readResponse(response)
    if (!response.ok) throw new Error(result.message || managerTitle() + '新增失败')
    managerItems().push(result)
    managerInput.value = ''
    ElMessage.success(managerTitle() + '已新增')
  } catch (error) {
    ElMessage.error(error.message || managerTitle() + '新增失败')
  }
}

async function removeManagedItem(item) {
  if (!item.id) return ElMessage.warning('当前选项不可删除')
  try {
    await ElMessageBox.confirm('确定删除“' + item.name + '”吗？', '删除' + (managerType.value === 'category' ? '品类' : '设计师'), { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消', lockScroll: false })
    const endpoint = managerType.value === 'category' ? '/api/categories/' : '/api/designers/'
    const response = await fetch(endpoint + item.id, { method: 'DELETE' })
    const result = response.status === 204 ? null : await readResponse(response)
    if (!response.ok) throw new Error(result?.message || '删除失败')
    const items = managerItems()
    const index = items.findIndex((current) => current.id === item.id)
    if (index >= 0) items.splice(index, 1)
    ElMessage.success('已删除')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.message || '删除失败')
  }
}

async function readResponse(response) {
  const text = await response.text()
  if (!text) {
    return { message: response.ok ? '服务器返回为空' : `款式 API 请求失败（HTTP ${response.status}），请检查 API 服务是否启动` }
  }
  try {
    return JSON.parse(text)
  } catch {
    return { message: `款式 API 返回了无效数据（HTTP ${response.status}）` }
  }
}

async function loadProducts() {
  persistFilters()
  if (isNewArrivals.value) loadPlanningSummary()
  loading.value = true
  try {
    const params = new URLSearchParams({ page: filters.page, pageSize: filters.pageSize })
    if (filters.search.trim()) params.set('search', filters.search.trim())
    if (isDirectoryOrStyleList.value && filters.sku.trim()) params.set('sku', filters.sku.trim())
    if (filters.category) params.set('category', filters.category)
    if (isDirectoryOrStyleList.value) {
      if (filters.designer) params.set('designer', filters.designer)
      if (filters.release_date_range?.[0]) params.set('release_date_from', filters.release_date_range[0])
      if (filters.release_date_range?.[1]) params.set('release_date_to', filters.release_date_range[1])
      if (filters.link) params.set('link', filters.link)
    }
    if (!isNewArrivals.value) {
      if (filters.status) params.set('status', filters.status)
      if (filters.style_progress) params.set('style_progress', filters.style_progress)
      if (typeof route.query.style_group === 'string') params.set('style_group', route.query.style_group)
      if (filters.style_progress_from) params.set('style_progress_from', filters.style_progress_from)
      if (filters.style_progress_to) params.set('style_progress_to', filters.style_progress_to)
    }
    if (isNewArrivals.value) {
      params.set('new_arrivals', '1')
      if (releaseDateFilter.value) params.set('release_date_filter', releaseDateFilter.value)
    }
    if (!isDirectoryOrStyleList.value && typeof route.query.designer === 'string') params.set('designer', route.query.designer)
    if (route.query.is_canceled === '1') params.set('is_canceled', '1')
    const response = await fetch(`/api/products?${params}`)
    const result = await readResponse(response)
    if (!response.ok) throw new Error(result.message || '款式加载失败')
    if (!Array.isArray(result.data)) throw new Error('款式 API 返回格式异常，请检查后端服务')
    products.value = result.data
    total.value = result.total
    if (isNewArrivals.value) releaseDateOptions.value = Array.isArray(result.release_dates) ? result.release_dates : []
  } catch (error) {
    ElMessage.error(error.message || '款式加载失败，请确认 API 服务已启动')
  } finally {
    loading.value = false
  }
}

async function loadPlanningSummary() {
  const requestId = ++planningSummaryRequestId
  planningSummaryLoading.value = true
  const params = new URLSearchParams()
  const summaryDateFilter = planningDateFilter.value || releaseDateFilter.value
  if (summaryDateFilter) params.set('release_date_filter', summaryDateFilter)
  try {
    const response = await fetch(`/api/category-planning/summary${params.size ? `?${params}` : ''}`)
    const result = await readResponse(response)
    if (!response.ok || !Array.isArray(result.data)) throw new Error(result.message || '品类规划汇总加载失败')
    if (requestId === planningSummaryRequestId) planningSummary.value = result
  } catch {
    if (requestId === planningSummaryRequestId) planningSummary.value = null
  } finally {
    if (requestId === planningSummaryRequestId) planningSummaryLoading.value = false
  }
}

function planningCount(value) {
  return value === null || value === undefined ? '—' : Number(value).toLocaleString('zh-CN')
}

const planningSummaryFilterLabel = computed(() => {
  if (planningDateFilter.value) return releaseDateLabel(planningDateFilter.value)
  if (releaseDateFilter.value === 'unscheduled') return '未排期'
  return releaseDateFilter.value ? releaseDateLabel(releaseDateFilter.value) : '全部日期'
})

async function loadCategories() {
  categoryLoading.value = true
  try {
    const response = await fetch('/api/categories')
    const result = await readResponse(response)
    if (!response.ok || !Array.isArray(result.data)) throw new Error(result.message || '品类加载失败')
    categories.value = result.data
  } catch {
    categories.value = fallbackCategories
  } finally {
    categoryLoading.value = false
  }
}

async function loadDesigners() {
  designerLoading.value = true
  try {
    const response = await fetch('/api/designers')
    const result = await readResponse(response)
    if (!response.ok || !Array.isArray(result.data)) throw new Error(result.message || '设计师加载失败')
    designers.value = result.data
  } catch {
    designers.value = []
  } finally {
    designerLoading.value = false
  }
}

function applyDesignerAssistant(designerName) {
  form.designer_assistant = designers.value.find((designer) => designer.name === designerName)?.designer_assistant || ''
}

function searchProducts() {
  clearTimeout(productSearchTimer)
  filters.page = 1
  loadProducts()
}

function queueProductSearch() {
  clearTimeout(productSearchTimer)
  productSearchTimer = setTimeout(searchProducts, 250)
}

function selectReleaseDate(value) {
  releaseDateFilter.value = value
  planningDateFilter.value = ''
  filters.page = 1
  loadProducts()
}

function selectPlanningSummaryDate(value) {
  planningDateFilter.value = value
  loadPlanningSummary()
}

function normalizedReleaseDate(value) {
  return value ? String(value).slice(0, 10) : ''
}

function beginReleaseDateEdit(product) {
  editingReleaseDateId.value = String(product.id)
  releaseDateDraft.value = normalizedReleaseDate(product.release_date)
}

function cancelInlineEdits() {
  editingReleaseDateId.value = ''
  releaseDateDraft.value = ''
  editingPricingId.value = ''
  pricingDraft.value = null
}

function handleInlineEditOutsideClick(event) {
  if (!editingReleaseDateId.value && !editingPricingId.value) return
  const target = event.target
  if (!(target instanceof Element)) return
  if (target.closest('.release-date-inline, .pricing-inline-edit, .el-picker__popper')) return
  suppressNextInlineOutsideClick = true
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
  const editingProduct = products.value.find((product) => String(product.id) === editingPricingId.value)
  if (editingProduct) void savePricing(editingProduct)
  else cancelInlineEdits()
}

function suppressInlineOutsideClickAction(event) {
  if (!suppressNextInlineOutsideClick) return
  suppressNextInlineOutsideClick = false
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
}

function formatCost(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number.toFixed(2) : '0.00'
}

function preDiscountMultiplier(product) {
  const pricing = Number(product.pricing)
  const totalCost = Number(product.total_cost)
  if (!Number.isFinite(pricing) || !Number.isFinite(totalCost) || totalCost <= 0) return '—'
  return (pricing / totalCost).toFixed(2)
}

async function saveReleaseDate(product, value) {
  const releaseDate = normalizedReleaseDate(value) || null
  const id = String(product.id)
  if (savingReleaseDateIds.value.has(id)) return
  savingReleaseDateIds.value = new Set([...savingReleaseDateIds.value, id])
  try {
    const response = await fetch(`/api/products/${product.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ release_date: releaseDate }),
    })
    const result = await readResponse(response)
    if (!response.ok) throw new Error(result.message || '上新日期保存失败')
    ElMessage.success('上新日期已保存')
    editingReleaseDateId.value = ''
    releaseDateDraft.value = ''
    await loadProducts()
  } catch (error) {
    ElMessage.error(error.message || '上新日期保存失败')
    editingReleaseDateId.value = ''
    releaseDateDraft.value = ''
    await loadProducts()
  } finally {
    const nextIds = new Set(savingReleaseDateIds.value)
    nextIds.delete(id)
    savingReleaseDateIds.value = nextIds
  }
}

function beginPricingEdit(product) {
  editingPricingId.value = String(product.id)
  pricingDraft.value = Number(product.pricing || 0)
}

async function savePricing(product) {
  const id = String(product.id)
  if (savingPricingIds.value.has(id)) return
  const pricing = pricingDraft.value === '' || pricingDraft.value === null ? 0 : Number(pricingDraft.value)
  if (!Number.isFinite(pricing) || pricing < 0) {
    ElMessage.warning('定价必须是大于等于0的数字')
    return
  }
  if (pricing === Number(product.pricing || 0)) {
    editingPricingId.value = ''
    pricingDraft.value = null
    return
  }
  savingPricingIds.value = new Set([...savingPricingIds.value, id])
  try {
    const response = await fetch(`/api/products/${product.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pricing }),
    })
    const result = await readResponse(response)
    if (!response.ok) throw new Error(result.message || '定价保存失败')
    editingPricingId.value = ''
    pricingDraft.value = null
    ElMessage.success('定价已保存')
    await loadProducts()
  } catch (error) {
    editingPricingId.value = ''
    pricingDraft.value = null
    ElMessage.error(error.message || '定价保存失败')
    await loadProducts()
  } finally {
    const nextIds = new Set(savingPricingIds.value)
    nextIds.delete(id)
    savingPricingIds.value = nextIds
  }
}

async function resetFilters() {
  filters.search = ''
  filters.sku = ''
  filters.category = ''
  filters.designer = ''
  filters.release_date_range = []
  filters.link = ''
  filters.status = ''
  filters.style_progress = ''
  filters.style_progress_from = ''
  filters.style_progress_to = ''
  filters.page = 1
  persistFilters()
  const query = { ...route.query }
  delete query.style_progress
  delete query.style_group
  delete query.progress_from
  delete query.progress_to
  await router.replace({ path: route.path, query })
  loadProducts()
}

async function addCategory() {
  try {
    const { value } = await ElMessageBox.prompt('请输入新的品类名称', '新增品类', {
      confirmButtonText: '添加',
      cancelButtonText: '取消',
      inputPlaceholder: '例如：针织开衫',
      inputValidator: (value) => value.trim() ? true : '请输入品类名称',
      lockScroll: false,
    })
    const categoryName = value.trim()
    if (categories.value.some((category) => category.name === categoryName)) {
      throw new Error('品类名称已存在')
    }
    const response = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: categoryName }),
    })
    const result = await readResponse(response)
    if (!response.ok) throw new Error(result.message || '品类添加失败')
    categories.value.push(result)
    form.category = result.name
    ElMessage.success('品类已添加')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.message || '品类添加失败')
  }
}

async function removeCategory() {
  const selected = categories.value.find((category) => category.name === form.category)
  if (!selected?.id) {
    ElMessage.warning('请先选择要删除的品类')
    return
  }
  try {
    await ElMessageBox.confirm(`确定删除品类“${selected.name}”吗？`, '删除品类', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
      lockScroll: false,
    })
    const response = await fetch(`/api/categories/${selected.id}`, { method: 'DELETE' })
    const result = response.status === 204 ? null : await readResponse(response)
    if (!response.ok) throw new Error(result?.message || '品类删除失败')
    categories.value = categories.value.filter((category) => category.id !== selected.id)
    form.category = ''
    ElMessage.success('品类已删除')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.message || '品类删除失败')
  }
}

async function addDesigner() {
  try {
    const { value } = await ElMessageBox.prompt('请输入新的设计师姓名', '新增设计师', {
      confirmButtonText: '添加',
      cancelButtonText: '取消',
      inputPlaceholder: '例如：林晓雯',
      inputValidator: (value) => value.trim() ? true : '请输入设计师姓名',
      lockScroll: false,
    })
    const response = await fetch('/api/designers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: value.trim() }),
    })
    const result = await readResponse(response)
    if (!response.ok) throw new Error(result.message || '设计师添加失败')
    designers.value.push(result)
    form.designer = result.name
    ElMessage.success('设计师已添加')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.message || '设计师添加失败')
  }
}

async function removeDesigner() {
  const selected = designers.value.find((designer) => designer.name === form.designer)
  if (!selected?.id) {
    ElMessage.warning('请先选择要删除的设计师')
    return
  }
  try {
    await ElMessageBox.confirm(`确定删除设计师“${selected.name}”吗？`, '删除设计师', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
      lockScroll: false,
    })
    const response = await fetch(`/api/designers/${selected.id}`, { method: 'DELETE' })
    const result = response.status === 204 ? null : await readResponse(response)
    if (!response.ok) throw new Error(result?.message || '设计师删除失败')
    designers.value = designers.value.filter((designer) => designer.id !== selected.id)
    form.designer = ''
    ElMessage.success('设计师已删除')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.message || '设计师删除失败')
  }
}

function beforeImageUpload(file) {
  const validType = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)
  if (!validType) {
    ElMessage.error('图片仅支持 JPG、PNG、WEBP 或 GIF 格式')
    return false
  }
  imageUploading.value = true
  return true
}

function handleImageUpload(result, field = 'image_url') {
  imageUploading.value = false
  if (!result?.url) {
    ElMessage.error(result?.message || '参考图上传失败')
    return
  }
  form[field] = result.url
  if (field === 'image_url' || field === 'physical_image_url') formRef.value?.validateField(field)
  ElMessage.success('图片上传成功')
}

function handleImageUploadError(error) {
  imageUploading.value = false
  ElMessage.error(error?.message || '参考图上传失败')
}

function validateImageField(field) {
  if (field === 'image_url' || field === 'physical_image_url') formRef.value?.validateField(field)
}

function removeImage(field = 'image_url') {
  form[field] = ''
  if (field === 'image_url' || field === 'physical_image_url') formRef.value?.validateField(field)
}

function openCreate() {
  editingId.value = null
  dialogTitle.value = '新增款式'
  expandedCreateSections.value = []
  Object.assign(form, { sku: '', season: '', category: '', designer: '', release_date: '', link: '', season_type: '', color: '', composition: '', size: [], highlights: '', priority: '', has_pattern: '', pattern_notes: '', external_purchase_notes: '', price: 0, reference_sales: null, stock: 0, status: 'active', description: '', image_url: '', physical_image_url: '', design_image_url: '', front_back_image_url: '', size_chart_url: '', price_image_url: '', composition_image_url: '', is_resale_to_self_developed: '', external_purchase_progress: '', is_canceled: '', supplier: '', channel: '', address: '', contact: '', product_url: '', reference_link: '', official_matching_sku: '', designer_assistant: '' })
  dialogVisible.value = true
}

function openEdit(product, mode = 'edit') {
  const query = { sku: product.sku, return_to: route.fullPath, detail_source: isProductInfo.value ? 'directory' : 'styles' }
  if (isNewArrivals.value && releaseDateFilter.value) query.return_release_date_filter = releaseDateFilter.value
  // 产品目录只用于查看，款式管理和上新定价仍保持可编辑。
  const detailMode = isProductInfo.value ? 'status' : mode
  if (detailMode) query.mode = detailMode
  for (const key of ['style_view', 'style_progress', 'style_group', 'progress_from', 'progress_to']) {
    if (route.query[key]) query[`return_${key}`] = route.query[key]
  }
  router.push({ path: '/back/products/' + encodeURIComponent(product.id), query })
}

function openProductRow(product, _column, event) {
  if (event?.target instanceof Element && event.target.closest('button, input, textarea, .el-image, .el-input, .el-input-number, .el-date-editor, .el-select')) return
  openEdit(product, 'edit')
}

async function submitForm() {
  if (!form.link) {
    ElMessage.warning('请优先选择链路')
    return
  }
  const missing = []
  if (!form.category) missing.push('品类')
  if (requiresSeason(form.link) && !form.season) missing.push('期数')
  if (form.link === '外采' ? !hasImages(form.physical_image_url) : !hasImages(form.image_url)) missing.push(form.link === '外采' ? '实物图' : '参考图')
  if (!form.designer.trim()) missing.push('设计师')
  if (missing.length) {
    ElMessage.warning(`请填写：${missing.join('、')}`)
    return
  }
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  const method = editingId.value ? 'PUT' : 'POST'
  const url = editingId.value ? `/api/products/${editingId.value}` : '/api/products'
  const payload = {
    ...form,
    sku: form.sku || `STYLE-${Date.now()}`,
  }
  for (const field of productImageKeys) payload[field] = serializeImageValue(payload[field])
  if (!payload.release_date) delete payload.release_date
  if (!payload.link) delete payload.link
  payload.size = Array.isArray(payload.size) ? payload.size.join(',') : (payload.size || '')
  if (payload.has_pattern === '') payload.has_pattern = null
  if (payload.is_resale_to_self_developed === '') payload.is_resale_to_self_developed = null
  if (payload.is_canceled === '') payload.is_canceled = null
  payload.priority = priorityByLink[payload.link] || ''
  try {
    const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const result = await readResponse(response)
    if (!response.ok) throw new Error(result.message || '保存失败')
    ElMessage.success(editingId.value ? '款式已更新' : '款式已创建')
    dialogVisible.value = false
    loadProducts()
  } catch (error) {
    ElMessage.error(error.message || '保存失败')
  }
}

async function removeProduct(product) {
  try {
    await ElMessageBox.confirm(`确定删除“${product.sku || '此款式'}”吗？删除后不可恢复。`, '删除款式', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消', lockScroll: false })
    const response = await fetch(`/api/products/${product.id}`, { method: 'DELETE' })
    const result = response.status === 204 ? null : await readResponse(response)
    if (!response.ok) throw new Error(result?.message || '删除失败')
    ElMessage.success('款式已删除')
    if (products.value.length === 1 && filters.page > 1) filters.page -= 1
    loadProducts()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.message || '删除失败')
  }
}

function statusLabel(status) { return status === 'active' ? '在售' : '下架' }
function statusType(status) { return status === 'active' ? 'success' : 'info' }
function stockType(stock) { return stock <= 10 ? 'danger' : stock <= 20 ? 'warning' : 'success' }
function productCoverImage(product) { return product.link === '外采' ? (imageList(product.physical_image_url)[0] || imageList(product.image_url)[0] || '') : (imageList(product.image_url)[0] || imageList(product.physical_image_url)[0] || '') }
function newArrivalCoverImage(product) { return imageList(product.physical_image_url)[0] || imageList(product.image_url)[0] || '' }
function isCanceledProduct(product) { return product?.style_progress === '款式取消' || product?.is_canceled === true || product?.is_canceled === 1 || product?.is_canceled === '1' || product?.is_canceled === 'true' }
function styleProgressRawLabel(product) { return isCanceledProduct(product) ? '款式取消' : (String(product?.style_progress || '').trim() || '选图') }
function styleProgressLabel(product) {
  const progress = styleProgressRawLabel(product)
  if (progress === '完成') return '已完成'
  if (progress === '搭配' || progress === '搭配中') return '搭配中'
  return progress
}
function isRegularStyleProduct(product) { return ['常规款', '常规优先款', '常规优先', '转自研板房'].includes(String(product?.link || '').trim()) }
function isFollowUpProduct(product) { return ['AI款', 'AI外发款', 'AI', 'AI外发'].includes(String(product?.link || '').trim()) }
function isScheduleBadgeProduct(product) { return isRegularStyleProduct(product) || isFollowUpProduct(product) || ['外采', '外发', '转自研外发'].includes(String(product?.link || '').trim()) }
function regularProgressBadges(product) {
  if (!isScheduleBadgeProduct(product)) return []
  const matchingComplete = [1, 2, 3].some((index) => isMatchingProgressComplete(product[`matching_progress_${index}`]))
  const link = String(product?.link || '').trim()
  if (link === '外采') return [{ label: matchingComplete ? '已搭配' : '未搭配', complete: matchingComplete }]
  if (!isRegularStyleProduct(product) && !isFollowUpProduct(product) && !['外发', '转自研外发'].includes(link)) return [{ label: matchingComplete ? '已搭配' : '未搭配', complete: matchingComplete }]
  const pricingComplete = Number(product.processing_fee) > 0 || (isFollowUpProduct(product) && Number(product.price) > 0)
  return [
    { label: matchingComplete ? '已搭配' : '未搭配', complete: matchingComplete },
    { label: pricingComplete ? '已核价' : '未核价', complete: pricingComplete },
  ]
}
function styleProgressTone(product) {
  const progress = styleProgressRawLabel(product)
  if (progress === '完成') return 'is-complete'
  if (progress === '款式取消') return 'is-cancelled'
  return 'is-active'
}
function releaseDateLabel(value) {
  const [, month, day] = String(value || '').slice(0, 10).split('-')
  return month && day ? `${Number(month)}.${Number(day)}` : '未排期'
}
function galleryImages(product) {
  return imageFields.flatMap((field) => imageList(product[field.key]).map((url) => ({ url, label: field.label })))
}

function progressCount(value) {
  return progressProducts.value.filter((product) => (product.style_progress || '选图') === value).length
}

function openProgressSummary(value) {
  const query = { style_view: 'all' }
  if (value === '打版中') query.style_group = '打板中'
  else query.style_progress = value
  router.push({ path: '/back/products', query })
}

function openDashboardMetric(metric) {
  const query = metric.key === 'completed'
    ? { style_view: 'all', style_progress: '完成' }
    : { style_view: 'all', ...(metric.group ? { style_group: metric.group } : {}) }
  router.push({ path: '/back/products', query })
}

function openDesignerDashboard(card) {
  router.push({ path: '/back/products', query: { style_view: 'all', designer: card.name } })
}

function openDesignerProgress(card, status) {
  router.push({ path: '/back/products', query: { style_view: 'all', designer: card.name, style_group: status } })
}

async function loadProgressStats() {
  progressLoading.value = true
  try {
    const all = []
    let page = 1
    let totalRows = 0
    do {
      const response = await fetch(`/api/products?page=${page}&pageSize=100`)
      const result = await readResponse(response)
      if (!response.ok || !Array.isArray(result.data)) throw new Error(result.message || '款式进度加载失败')
      all.push(...result.data)
      totalRows = Number(result.total) || 0
      page += 1
    } while (all.length < totalRows)
    progressProducts.value = all
  } catch {
    progressProducts.value = []
  } finally {
    progressLoading.value = false
  }
}

onMounted(() => {
  window.addEventListener('list-display-settings-updated', handleListDisplaySettingsUpdated)
  document.addEventListener('pointerdown', handleInlineEditOutsideClick, true)
  document.addEventListener('click', suppressInlineOutsideClickAction, true)
  releaseDateFilter.value = typeof route.query.release_date_filter === 'string' ? route.query.release_date_filter : ''
  const progress = typeof route.query.style_progress === 'string' && styleProgressOptions.includes(route.query.style_progress) ? route.query.style_progress : ''
  restoreFilters(progress)
  if (isDirectoryOrStyleList.value && typeof route.query.designer === 'string') filters.designer = route.query.designer
  if (isDirectoryOrStyleList.value && typeof route.query.link === 'string' && linkOptions.includes(route.query.link)) filters.link = route.query.link
  if (typeof route.query.progress_from === 'string') filters.style_progress_from = route.query.progress_from
  if (typeof route.query.progress_to === 'string') filters.style_progress_to = route.query.progress_to
  else if (typeof route.query.progress_from === 'string') filters.style_progress_to = route.query.progress_from
  loadProducts()
  if (isOverview.value) loadProgressStats()
  loadCategories()
  loadDesigners()
})
onBeforeUnmount(() => {
  window.removeEventListener('list-display-settings-updated', handleListDisplaySettingsUpdated)
  clearTimeout(productSearchTimer)
  document.removeEventListener('pointerdown', handleInlineEditOutsideClick, true)
  document.removeEventListener('click', suppressInlineOutsideClickAction, true)
})
watch(() => [route.query.style_view, route.query.style_progress, route.query.style_group, route.query.progress_from, route.query.progress_to, route.query.designer, route.query.link, route.query.is_canceled, route.query.release_date_filter], ([view, value, , from, to, , link, , releaseDate]) => {
  const progress = typeof value === 'string' && styleProgressOptions.includes(value) ? value : ''
  releaseDateFilter.value = typeof releaseDate === 'string' ? releaseDate : ''
  restoreFilters(progress)
  if (isDirectoryOrStyleList.value && typeof route.query.designer === 'string') filters.designer = route.query.designer
  if (isDirectoryOrStyleList.value && typeof link === 'string' && linkOptions.includes(link)) filters.link = link
  if (typeof from === 'string') filters.style_progress_from = from
  if (typeof to === 'string') filters.style_progress_to = to
  else if (typeof from === 'string') filters.style_progress_to = from
  filters.page = 1
  loadProducts()
  if (!view && !progress) loadProgressStats()
})
</script>

<template>
  <div class="product-page">
    <section v-if="isOverview" class="page-heading product-heading product-progress-heading">
      <div>
        <h1>产品进度</h1>
      </div>
    </section>
    <section v-if="isOverview" class="style-dashboard" aria-label="产品进度数据总览">
      <div class="style-dashboard-metrics">
        <article v-for="metric in styleDashboardMetrics" :key="metric.label" class="style-dashboard-metric" role="button" tabindex="0" @click="openDashboardMetric(metric)" @keydown.enter="openDashboardMetric(metric)" @keydown.space.prevent="openDashboardMetric(metric)">
          <div class="style-dashboard-metric-head"><span class="style-dashboard-metric-label">{{ metric.label }}</span><span class="style-dashboard-metric-icon" :class="`tone-${metric.tone}`" aria-hidden="true"><el-icon><component :is="metric.icon" /></el-icon></span></div>
          <strong class="style-dashboard-metric-value">{{ progressLoading ? '—' : metric.value }}</strong>
        </article>
      </div>
      <div v-if="progressLoading" class="style-dashboard-subprogress style-dashboard-loading" aria-label="产品子进度统计">
        <article v-for="index in 8" :key="index" class="style-dashboard-subprogress-card"><el-skeleton animated /></article>
      </div>
      <div v-else class="style-dashboard-subprogress" aria-label="产品子进度统计">
        <button v-for="step in progressDashboardCards" :key="step.value" type="button" class="style-dashboard-subprogress-card" :disabled="!step.count" :title="step.label" @click="openProgressSummary(step.value)">
          <span>{{ step.label }}</span><strong>{{ step.count }}</strong>
        </button>
      </div>
      <div v-if="progressLoading" class="style-dashboard-designers style-dashboard-loading">
        <article v-for="index in 3" :key="index" class="style-dashboard-designer"><el-skeleton animated /></article>
      </div>
      <div v-else-if="designerDashboardCards.length" class="style-dashboard-designers" aria-label="按设计师查看产品进度">
        <article v-for="card in designerDashboardCards" :key="card.name" class="style-dashboard-designer" role="button" tabindex="0" @click="openDesignerDashboard(card)" @keydown.enter="openDesignerDashboard(card)" @keydown.space.prevent="openDesignerDashboard(card)">
          <div class="style-dashboard-designer-head">
            <span class="style-dashboard-designer-avatar">{{ card.name.slice(0, 1) }}</span>
            <div class="style-dashboard-designer-name"><strong>{{ card.name }}</strong></div>
            <span class="style-dashboard-designer-total">款式总数 {{ card.total }}</span>
          </div>
          <div class="style-dashboard-designer-stats">
            <button type="button" @click.stop="openDesignerProgress(card, '作业中')"><span>作业中</span><strong>{{ card.working }}</strong></button>
            <button type="button" @click.stop="openDesignerProgress(card, '未排期')"><span>未排期</span><strong>{{ card.unscheduled }}</strong></button>
            <button type="button" @click.stop="openDesignerProgress(card, '已排期')"><span>已排期</span><strong>{{ card.scheduled }}</strong></button>
            <button type="button" @click.stop="openDesignerProgress(card, '已取消')"><span>已取消</span><strong>{{ card.canceled }}</strong></button>
            <button type="button" @click.stop="openDesignerProgress(card, '已下架')"><span>已下架</span><strong>{{ card.inactive }}</strong></button>
          </div>
        </article>
      </div>
      <el-empty v-else description="暂无设计师数据" :image-size="72" />
    </section>
    <section v-if="!isOverview" class="page-heading product-heading">
      <div>
        <h1>{{ isProductInfo ? '产品目录' : isNewArrivals ? '上新定价' : '款式管理' }}</h1>
      </div>
    </section>

    <section v-if="!isOverview" class="product-toolbar panel" :class="{ 'product-toolbar-filtered': isDirectoryOrStyleList, 'product-directory-width': isProductInfo }">
      <div v-if="isNewArrivals" class="release-date-quick-filters" role="group" aria-label="按上新日期筛选">
        <button type="button" :class="{ active: releaseDateFilter === '' }" :aria-pressed="releaseDateFilter === ''" @click="selectReleaseDate('')">全部</button>
        <button v-for="date in releaseDateOptions.filter(Boolean)" :key="date" type="button" :class="{ active: releaseDateFilter === date }" :aria-pressed="releaseDateFilter === date" @click="selectReleaseDate(date)">{{ releaseDateLabel(date) }}</button>
        <button type="button" :class="{ active: releaseDateFilter === 'unscheduled' }" :aria-pressed="releaseDateFilter === 'unscheduled'" @click="selectReleaseDate('unscheduled')">未排期</button>
      </div>
      <div v-if="isNewArrivals" class="arrival-list-filters">
        <el-input v-model="filters.search" class="arrival-list-search" clearable placeholder="搜索款号" @keyup.enter="searchProducts">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-select v-model="filters.category" clearable placeholder="全部品类" class="arrival-list-category" @change="searchProducts">
          <el-option v-for="category in categories" :key="category.id || category.name" :label="category.name" :value="category.name" />
        </el-select>
        <el-button type="primary" plain @click="searchProducts"><el-icon><Search /></el-icon>查询</el-button>
        <el-button @click="resetFilters"><el-icon><Refresh /></el-icon>重置</el-button>
      </div>
      <template v-else>
        <el-input v-if="isDirectoryOrStyleList" v-model="filters.sku" class="product-search" clearable placeholder="按款号筛选" @input="queueProductSearch">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-input v-else v-model="filters.search" class="product-search" clearable placeholder="搜索款号/品类/设计师" @input="queueProductSearch">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-date-picker v-if="isDirectoryOrStyleList" v-model="filters.release_date_range" clearable type="daterange" value-format="YYYY-MM-DD" format="MM-DD" range-separator="-" start-placeholder="开始" end-placeholder="结束" class="product-filter product-filter-date" style="width:200px;min-width:200px;max-width:200px;flex:0 0 200px;height:32px" @change="searchProducts" />
        <el-select v-model="filters.category" clearable placeholder="全部品类" class="product-filter" @change="searchProducts">
          <el-option v-for="category in categories" :key="category.id || category.name" :label="category.name" :value="category.name" />
        </el-select>
        <el-select v-if="isDirectoryOrStyleList" v-model="filters.designer" clearable placeholder="全部设计师" class="product-filter" @change="searchProducts">
          <el-option v-for="designer in designers" :key="designer.id || designer.name" :label="designer.name" :value="designer.name" />
        </el-select>
        <el-select v-if="isDirectoryOrStyleList" v-model="filters.link" clearable placeholder="全部链路" class="product-filter" @change="searchProducts">
          <el-option v-for="item in linkOptions" :key="item" :label="getLinkDisplayLabel(item)" :value="item" />
        </el-select>
        <el-select v-model="filters.style_progress" clearable placeholder="全部进度" class="product-progress-filter" @change="searchProducts">
          <el-option v-for="item in styleProgressOptions" :key="item" :label="styleProgressOptionLabel(item)" :value="item" />
        </el-select>
        <el-button v-if="!isDirectoryOrStyleList" type="primary" plain @click="searchProducts"><el-icon><Search /></el-icon>查询</el-button>
        <el-button v-if="!route.query.style_progress" @click="resetFilters"><el-icon><Refresh /></el-icon>重置</el-button>
      </template>
      <div v-if="showStyleActions && !isProductInfo && !isNewArrivals" class="style-page-actions">
        <el-button @click="openManager('category')">品类管理</el-button>
        <el-button type="primary" class="create-button" @click="openCreate"><el-icon><Plus /></el-icon>新增款式</el-button>
      </div>
    </section>

    <section v-if="isNewArrivals" v-loading="planningSummaryLoading" class="arrival-planning-summary panel" aria-label="品类规划对照">
      <div class="arrival-planning-heading">
        <div class="arrival-planning-title"><h2>品类规划</h2><div v-if="releaseDateFilter === 'unscheduled' && releaseDateOptions.some(Boolean)" class="release-date-quick-filters arrival-planning-date-filters" role="group" aria-label="切换品类规划汇总日期"><button v-for="date in releaseDateOptions.filter(Boolean)" :key="date" type="button" :class="{ active: planningDateFilter === date }" :aria-pressed="planningDateFilter === date" @click="selectPlanningSummaryDate(date)">{{ releaseDateLabel(date) }}</button></div><span v-else>{{ planningSummaryFilterLabel }}</span></div>
        <div v-if="planningSummary" class="arrival-planning-totals">
          <span>计划款数 <strong>{{ planningCount(planningSummary.total_plan) }}</strong></span>
          <span>已选款数 <strong>{{ planningCount(planningSummary.total_selected) }}</strong></span>
        </div>
      </div>
      <div v-if="planningSummary?.data?.length" class="arrival-planning-grid">
        <el-popover v-for="item in planningSummary.data" :key="item.category" trigger="click" placement="bottom-start" :width="250" popper-class="arrival-planning-popover">
          <template #reference>
            <button type="button" class="arrival-planning-item" :title="`${item.category}：点击查看各链路计划和已选明细`" :aria-label="`${item.category}，计划 ${planningCount(item.planned_count)}，已选 ${planningCount(item.selected_count)}，点击查看各链路明细`">
              <strong>{{ item.category }}</strong>
              <span>计划 <b>{{ planningCount(item.planned_count) }}</b></span>
              <span>已选 <b>{{ planningCount(item.selected_count) }}</b></span>
            </button>
          </template>
          <div class="arrival-planning-strategies">
            <div v-for="strategy in item.strategies || []" :key="strategy.key" class="arrival-planning-strategy-row">
              <span class="arrival-planning-strategy-label">{{ strategy.label }}</span>
              <span>计划 <b>{{ planningCount(strategy.planned_count) }}</b></span>
              <span>已选 <b>{{ planningCount(strategy.selected_count) }}</b></span>
            </div>
          </div>
        </el-popover>
      </div>
      <el-empty v-else-if="!planningSummaryLoading && planningSummary" description="暂无品类规划数据" :image-size="48" />
    </section>

    <section v-if="!isOverview" class="panel product-table-panel" :class="{ 'product-directory-width': isProductInfo }">
      <el-table v-if="!isProductInfo && !isNewArrivals" v-loading="loading" :data="products" class="product-table style-list-table" row-key="id" @row-click="openProductRow">
        <el-table-column v-if="showListField('style')" label="款式" width="240">
          <template #default="scope">
            <div class="product-cell">
              <el-image v-if="productCoverImage(scope.row)" :src="productCoverImage(scope.row)" :preview-src-list="[productCoverImage(scope.row)]" preview-teleported class="product-image product-image-clickable" fit="cover" />
              <div v-else class="product-image product-image-placeholder"><el-icon><Box /></el-icon></div>
              <div class="product-cell-name"><strong>{{ scope.row.sku || '—' }}</strong><span class="product-cell-link">{{ getLinkDisplayLabel(scope.row.link) || '—' }}</span></div>
            </div>
          </template>
        </el-table-column>
        <el-table-column v-if="showListField('release_date')" label="上新日期" width="120"><template #default="scope"><span>{{ scope.row.release_date ? String(scope.row.release_date).slice(0, 10) : '—' }}</span></template></el-table-column>
        <el-table-column v-if="showListField('category')" prop="category" label="品类" width="120"><template #default="scope"><span>{{ scope.row.category || '—' }}</span></template></el-table-column>
        <el-table-column v-if="showListField('designer')" prop="designer" label="设计师" width="120"><template #default="scope"><span>{{ scope.row.designer || '—' }}</span></template></el-table-column>
        <el-table-column v-if="showListField('link')" label="链路" width="120"><template #default="scope"><span>{{ getLinkDisplayLabel(scope.row.link) || '—' }}</span></template></el-table-column>
        <el-table-column v-if="showListField('priority')" prop="priority" label="优先级" width="120"><template #default="scope"><span>{{ scope.row.priority || '—' }}</span></template></el-table-column>
        <el-table-column v-if="showListField('color')" prop="color" label="颜色" width="120"><template #default="scope"><span>{{ scope.row.color || '—' }}</span></template></el-table-column>
        <el-table-column v-if="showListField('size')" prop="size" label="尺码" width="120"><template #default="scope"><span>{{ scope.row.size || '—' }}</span></template></el-table-column>
        <el-table-column v-if="showListField('progress')" label="总进度" width="120" class-name="progress-column"><template #default="scope"><div class="progress-display-stack"><span class="progress-display" :class="styleProgressTone(scope.row)" :title="styleProgressRawLabel(scope.row)"><span class="progress-display-label">{{ styleProgressLabel(scope.row) }}</span></span><span v-if="regularProgressBadges(scope.row).length" class="regular-progress-badges"><span v-for="badge in regularProgressBadges(scope.row)" :key="badge.label" class="regular-progress-badge" :class="badge.complete ? 'complete' : 'incomplete'">{{ badge.label }}</span></span></div></template></el-table-column>
        <el-table-column v-if="showListField('cost')" label="成本价" width="120"><template #default="scope"><span>¥{{ formatCost(scope.row.total_cost) }}</span></template></el-table-column>
        <el-table-column v-if="showListField('pricing')" label="定价" width="120"><template #default="scope"><span>¥{{ formatCost(scope.row.pricing) }}</span></template></el-table-column>
        <el-table-column v-for="field in activeListExtraFields" :key="`style-extra-${field.key}`" :label="field.label" width="120"><template #default="scope"><span class="table-cell-ellipsis">{{ listFieldValue(scope.row, field.key) }}</span></template></el-table-column>
        <el-table-column label="操作" width="80" align="center"><template #default="scope"><el-button text type="danger" aria-label="删除款式" title="删除" @click.stop="removeProduct(scope.row)"><el-icon><Close /></el-icon></el-button></template></el-table-column>
        <template #empty><el-empty description="暂无款式数据" /></template>
      </el-table>
      <el-table v-if="isNewArrivals" v-loading="loading" :data="products" class="product-table new-arrivals-table" row-key="id" @row-click="openProductRow">
        <el-table-column v-if="showListField('style')" label="款式" width="240">
          <template #default="scope">
            <div class="product-cell">
              <el-image v-if="newArrivalCoverImage(scope.row)" :src="newArrivalCoverImage(scope.row)" :preview-src-list="[newArrivalCoverImage(scope.row)]" preview-teleported class="product-image product-image-clickable" fit="cover" />
              <div v-else class="product-image product-image-placeholder"><el-icon><Box /></el-icon></div>
              <div class="product-cell-name"><strong>{{ scope.row.sku || '—' }}</strong></div>
            </div>
          </template>
        </el-table-column>
        <el-table-column v-if="showListField('release_date')" label="上新日期" width="120">
          <template #default="scope">
            <el-date-picker
              v-if="editingReleaseDateId === String(scope.row.id)"
              v-model="releaseDateDraft"
              :disabled="savingReleaseDateIds.has(String(scope.row.id))"
              clearable
              editable
              teleported
              type="date"
              value-format="YYYY-MM-DD"
              format="YYYY-MM-DD"
              placeholder="选择日期"
              class="release-date-inline"
              @change="saveReleaseDate(scope.row, $event)"
            />
            <button v-else type="button" class="inline-edit-value" :disabled="savingReleaseDateIds.has(String(scope.row.id))" aria-label="点击修改上新日期" @click="beginReleaseDateEdit(scope.row)">{{ normalizedReleaseDate(scope.row.release_date) || '未排期' }}</button>
          </template>
        </el-table-column>
        <el-table-column v-if="showListField('category')" prop="category" label="品类" width="120"><template #default="scope"><span class="table-cell-ellipsis">{{ scope.row.category || '—' }}</span></template></el-table-column>
        <el-table-column v-if="showListField('link')" label="链路" width="120"><template #default="scope"><span class="table-cell-ellipsis">{{ getLinkDisplayLabel(scope.row.link) || '—' }}</span></template></el-table-column>
        <el-table-column v-if="showListField('cost')" label="成本价" width="120" align="left"><template #default="scope"><span class="table-cell-ellipsis cost-list-value">¥{{ formatCost(scope.row.total_cost) }}</span></template></el-table-column>
        <el-table-column v-if="showListField('pricing')" label="定价" width="120" align="left"><template #default="scope">
          <div class="arrival-pricing-cell">
            <el-input-number v-if="editingPricingId === String(scope.row.id)" v-model="pricingDraft" :min="0" :precision="2" :step="0.01" :controls="false" :disabled="savingPricingIds.has(String(scope.row.id))" class="pricing-inline-input pricing-inline-edit" @keydown.enter.prevent="savePricing(scope.row)" />
            <button v-else type="button" class="inline-edit-value cost-list-value" :disabled="savingPricingIds.has(String(scope.row.id))" aria-label="点击修改定价" @click="beginPricingEdit(scope.row)">¥{{ formatCost(scope.row.pricing) }}</button>
            <small>折前倍率 {{ preDiscountMultiplier(scope.row) }}</small>
          </div>
        </template></el-table-column>
        <el-table-column v-if="showListField('designer')" label="设计师" width="120"><template #default="scope"><span class="table-cell-ellipsis">{{ scope.row.designer || '—' }}</span></template></el-table-column>
        <el-table-column v-if="showListField('priority')" label="优先级" width="120"><template #default="scope"><span class="table-cell-ellipsis">{{ scope.row.priority || '—' }}</span></template></el-table-column>
        <el-table-column v-if="showListField('color')" label="颜色" width="120"><template #default="scope"><span class="table-cell-ellipsis">{{ scope.row.color || '—' }}</span></template></el-table-column>
        <el-table-column v-if="showListField('size')" label="尺码" width="120"><template #default="scope"><span class="table-cell-ellipsis">{{ scope.row.size || '—' }}</span></template></el-table-column>
        <el-table-column v-if="showListField('progress')" label="总进度" width="120" class-name="progress-column"><template #default="scope"><div class="progress-display-stack"><span class="progress-display" :class="styleProgressTone(scope.row)" :title="styleProgressRawLabel(scope.row)"><span class="progress-display-label">{{ styleProgressLabel(scope.row) }}</span></span><span v-if="regularProgressBadges(scope.row).length" class="regular-progress-badges"><span v-for="badge in regularProgressBadges(scope.row)" :key="badge.label" class="regular-progress-badge" :class="badge.complete ? 'complete' : 'incomplete'">{{ badge.label }}</span></span></div></template></el-table-column>
        <el-table-column v-for="field in activeListExtraFields" :key="`arrival-extra-${field.key}`" :label="field.label" width="120"><template #default="scope"><span class="table-cell-ellipsis">{{ listFieldValue(scope.row, field.key) }}</span></template></el-table-column>
        <template #empty><el-empty description="暂无上新款式" /></template>
      </el-table>
      <el-table v-if="isProductInfo" v-loading="loading" :data="products" class="product-table" row-key="id" :fit="false" @row-click="openProductRow">
        <el-table-column v-if="showListField('style')" label="款式" width="240">
          <template #default="scope">
            <div class="product-cell">
              <el-image v-if="productCoverImage(scope.row)" :src="productCoverImage(scope.row)" :preview-src-list="[productCoverImage(scope.row)]" preview-teleported class="product-image product-image-clickable" fit="cover" />
              <div v-else class="product-image product-image-placeholder"><el-icon><Box /></el-icon></div>
              <div class="product-cell-name"><strong>{{ scope.row.sku || '—' }}</strong><span class="product-cell-link">{{ getLinkDisplayLabel(scope.row.link) || '—' }}</span></div>
            </div>
          </template>
        </el-table-column>
        <el-table-column v-if="showListField('release_date')" label="上新日期" width="120"><template #default="scope"><span class="table-cell-ellipsis">{{ scope.row.release_date ? String(scope.row.release_date).slice(0, 10) : '—' }}</span></template></el-table-column>
        <el-table-column v-if="showListField('category')" label="品类" width="120"><template #default="scope"><span class="table-cell-ellipsis">{{ scope.row.category || '—' }}</span></template></el-table-column>
        <el-table-column v-if="showListField('designer')" label="设计师" width="120"><template #default="scope"><span class="table-cell-ellipsis">{{ scope.row.designer || '—' }}</span></template></el-table-column>
        <el-table-column v-if="showListField('link')" label="链路" width="120"><template #default="scope"><span class="table-cell-ellipsis">{{ getLinkDisplayLabel(scope.row.link) || '—' }}</span></template></el-table-column>
        <el-table-column v-if="showListField('color')" label="颜色" width="120"><template #default="scope"><span class="table-cell-ellipsis">{{ scope.row.color || '—' }}</span></template></el-table-column>
        <el-table-column v-if="showListField('size')" label="尺码" width="120"><template #default="scope"><span class="table-cell-ellipsis">{{ scope.row.size || '—' }}</span></template></el-table-column>
        <el-table-column v-if="showListField('priority')" label="优先级" width="120"><template #default="scope"><span class="table-cell-ellipsis">{{ scope.row.priority || '—' }}</span></template></el-table-column>
        <el-table-column v-if="showListField('progress')" label="总进度" width="120" class-name="progress-column"><template #default="scope"><div class="progress-display-stack"><span class="progress-display" :class="styleProgressTone(scope.row)" :title="styleProgressRawLabel(scope.row)"><span class="progress-display-label">{{ styleProgressLabel(scope.row) }}</span></span><span v-if="regularProgressBadges(scope.row).length" class="regular-progress-badges"><span v-for="badge in regularProgressBadges(scope.row)" :key="badge.label" class="regular-progress-badge" :class="badge.complete ? 'complete' : 'incomplete'">{{ badge.label }}</span></span></div></template></el-table-column>
        <el-table-column v-if="showListField('cost')" label="成本价" width="120"><template #default="scope"><span class="table-cell-ellipsis">¥{{ formatCost(scope.row.total_cost) }}</span></template></el-table-column>
        <el-table-column v-if="showListField('pricing')" label="定价" width="120"><template #default="scope"><span class="table-cell-ellipsis">¥{{ formatCost(scope.row.pricing) }}</span></template></el-table-column>
        <el-table-column v-for="field in activeListExtraFields" :key="`product-extra-${field.key}`" :label="field.label" width="120"><template #default="scope"><span class="table-cell-ellipsis">{{ listFieldValue(scope.row, field.key) }}</span></template></el-table-column>
        <template #empty><el-empty description="暂无款式数据" /></template>
      </el-table>
      <div class="product-pagination"><el-pagination v-model:current-page="filters.page" v-model:page-size="filters.pageSize" layout="total, sizes, prev, pager, next" :total="total" :page-sizes="[10, 20, 50]" @current-change="loadProducts" @size-change="searchProducts" /></div>
    </section>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="1200px" class="style-dialog" align-center :lock-scroll="false" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="style-create-form">
        <template v-if="form.link === '外采'">
          <el-form-item label="链路" prop="link"><el-select v-model="form.link" clearable placeholder="请选择链路" class="full-create-control"><el-option v-for="item in linkOptions" :key="item" :label="getLinkDisplayLabel(item)" :value="item" /></el-select></el-form-item>
          <el-form-item label="品类" prop="category"><el-select v-model="form.category" clearable placeholder="请选择品类" :loading="categoryLoading" class="full-create-control"><el-option v-for="category in categories" :key="category.id || category.name" :label="category.name" :value="category.name" /></el-select></el-form-item>
          <el-form-item label="设计师" prop="designer"><el-select v-model="form.designer" clearable placeholder="请选择设计师" :loading="designerLoading" class="full-create-control" @change="applyDesignerAssistant"><el-option v-for="designer in designers" :key="designer.id || designer.name" :label="designer.name" :value="designer.name" /></el-select></el-form-item>
          <el-form-item label="设计师助理"><el-input v-model="form.designer_assistant" readonly placeholder="根据设计师绑定自动生成" /></el-form-item>
          <el-form-item label="实物图" prop="physical_image_url" required><ImageUploader v-model="form.physical_image_url" label="实物图" @update:model-value="validateImageField('physical_image_url')" /></el-form-item>
        </template>
         <template v-else-if="isRegularCreateLink">
          <el-form-item label="链路" prop="link"><el-select v-model="form.link" clearable placeholder="请选择链路" class="full-create-control"><el-option v-for="item in linkOptions" :key="item" :label="getLinkDisplayLabel(item)" :value="item" /></el-select></el-form-item>
          <el-form-item v-if="form.link && requiresSeason(form.link)" label="期数" prop="season" :required="isRegularCreateLink"><div class="season-input-row"><el-date-picker v-if="form.season !== '无排期'" v-model="form.season" clearable type="date" value-format="YYYY-MM-DD" placeholder="请选择期数" format="YYYY年MM月DD日" class="season-date-control" /><el-input v-else model-value="无排期" readonly class="season-value-control" /><el-button v-if="form.season !== '无排期'" class="season-toggle-button" @click="form.season = '无排期'">无排期</el-button><el-button v-else class="season-toggle-button" @click="form.season = ''">选择日期</el-button></div></el-form-item>
          <el-form-item label="品类" prop="category"><el-select v-model="form.category" clearable placeholder="请选择品类" :loading="categoryLoading" class="full-create-control"><el-option v-for="category in categories" :key="category.id || category.name" :label="category.name" :value="category.name" /></el-select></el-form-item>
          <el-form-item label="设计师" prop="designer"><el-select v-model="form.designer" clearable placeholder="请选择设计师" :loading="designerLoading" class="full-create-control" @change="applyDesignerAssistant"><el-option v-for="designer in designers" :key="designer.id || designer.name" :label="designer.name" :value="designer.name" /></el-select></el-form-item>
          <el-form-item label="设计师助理"><el-input v-model="form.designer_assistant" readonly placeholder="根据设计师绑定自动生成" /></el-form-item>
           <el-form-item label="参考图" prop="image_url" required><ImageUploader v-model="form.image_url" label="参考图" @update:model-value="validateImageField('image_url')" /></el-form-item>
        </template>
         <template v-else>
           <el-form-item label="链路" prop="link"><el-select v-model="form.link" clearable placeholder="请选择链路" class="full-create-control"><el-option v-for="item in linkOptions" :key="item" :label="getLinkDisplayLabel(item)" :value="item" /></el-select></el-form-item>
           <el-form-item v-if="form.link && requiresSeason(form.link)" label="期数" prop="season"><div class="season-input-row"><el-date-picker v-if="form.season !== '无排期'" v-model="form.season" clearable type="date" value-format="YYYY-MM-DD" placeholder="请选择期数" format="YYYY年MM月DD日" class="season-date-control" /><el-input v-else model-value="无排期" readonly class="season-value-control" /><el-button v-if="form.season !== '无排期'" class="season-toggle-button" @click="form.season = '无排期'">无排期</el-button><el-button v-else class="season-toggle-button" @click="form.season = ''">选择日期</el-button></div></el-form-item>
           <el-form-item label="品类" prop="category"><el-select v-model="form.category" clearable placeholder="请选择品类" :loading="categoryLoading" class="full-create-control"><el-option v-for="category in categories" :key="category.id || category.name" :label="category.name" :value="category.name" /></el-select></el-form-item>
           <el-form-item label="设计师" prop="designer"><el-select v-model="form.designer" clearable placeholder="请选择设计师" :loading="designerLoading" class="full-create-control" @change="applyDesignerAssistant"><el-option v-for="designer in designers" :key="designer.id || designer.name" :label="designer.name" :value="designer.name" /></el-select></el-form-item>
           <el-form-item label="设计师助理"><el-input v-model="form.designer_assistant" readonly placeholder="根据设计师绑定自动生成" /></el-form-item>
         </template>
        <el-collapse v-model="expandedCreateSections" class="create-advanced-collapse">
          <el-collapse-item v-if="form.link === '外采'" title="其他资料" name="other">
            <div class="create-advanced-grid external-purchase-grid">
              <el-form-item v-for="field in externalPurchaseFields" :key="field.key" :label="field.label">
                <el-date-picker v-if="field.type === 'date'" v-model="form[field.key]" clearable type="date" value-format="YYYY-MM-DD" placeholder="请选择上新日期" format="YYYY年MM月DD日" class="full-create-control" />
                <el-select v-else-if="field.type === 'season'" v-model="form[field.key]" clearable placeholder="请选择季节" class="full-create-control"><el-option v-for="item in seasonOptions" :key="item" :label="item" :value="item" /></el-select>
                <el-select v-else-if="field.type === 'size'" v-model="form[field.key]" clearable multiple placeholder="请选择尺码" class="full-create-control"><el-option v-for="item in sizeOptions" :key="item" :label="item" :value="item" /></el-select>
                <el-input-number v-else-if="field.type === 'number'" :model-value="form[field.key] || null" :min="0" :precision="2" :step="0.01" :controls="false" placeholder="请输入价格" class="full-create-control external-price-input" @update:model-value="value => form[field.key] = value || 0" />
                <el-input v-else v-model="form[field.key]" clearable :type="field.type === 'textarea' ? 'textarea' : field.type === 'url' ? 'url' : 'text'" :rows="field.type === 'textarea' ? 2 : undefined" :placeholder="field.type === 'url' ? '请输入产品链接' : `请输入${field.label}`" />
              </el-form-item>
              <div class="external-purchase-suppliers">
                <el-form-item v-for="field in externalPurchaseSupplierFields" :key="field.key" :label="field.label">
                  <el-input v-model="form[field.key]" clearable :type="field.type === 'url' ? 'url' : 'text'" :placeholder="field.type === 'url' ? '请输入产品链接' : `请输入${field.label}`" />
                </el-form-item>
              </div>
              <div class="external-purchase-images">
                <el-form-item v-for="field in externalPurchaseImageFields" :key="field.key" :label="field.label">
                  <ImageUploader v-model="form[field.key]" :label="field.label" />
                </el-form-item>
              </div>
            </div>
          </el-collapse-item>
          <el-collapse-item v-else-if="isRegularCreateLink" title="其他资料" name="other">
            <div class="create-advanced-grid">
              <template v-for="field in regularCreateFields" :key="`${field.key}-${field.transferOnly ? 'transfer' : field.aiOnly ? 'ai' : 'base'}`">
              <el-form-item v-if="(!field.aiOnly || isAiCreateLink) && (!field.transferOnly || isTransferCreateLink)" :label="field.label">
                <el-date-picker v-if="field.type === 'date'" v-model="form[field.key]" clearable type="date" value-format="YYYY-MM-DD" placeholder="请选择上新日期" format="YYYY年MM月DD日" class="full-create-control" />
                <el-select v-else-if="field.type === 'season'" v-model="form[field.key]" clearable placeholder="请选择季节" class="full-create-control"><el-option v-for="item in seasonOptions" :key="item" :label="item" :value="item" /></el-select>
                <el-select v-else-if="field.type === 'pattern'" v-model="form[field.key]" clearable placeholder="请选择" class="full-create-control"><el-option v-for="item in patternOptions" :key="String(item.value)" :label="item.label" :value="item.value" /></el-select>
                <el-select v-else-if="field.type === 'size'" v-model="form[field.key]" clearable multiple placeholder="请选择尺码" class="full-create-control"><el-option v-for="item in sizeOptions" :key="item" :label="item" :value="item" /></el-select>
                <el-select v-else-if="field.type === 'cancel'" v-model="form[field.key]" clearable placeholder="请选择是否取消" class="full-create-control"><el-option label="是" :value="true" /><el-option label="否" :value="false" /></el-select>
                <el-input-number v-else-if="field.type === 'number'" :model-value="form[field.key] || null" :min="0" :precision="field.precision" :step="field.precision === 0 ? 1 : 0.01" :controls="false" :placeholder="`请输入${field.label}`" class="full-create-control" @update:model-value="value => form[field.key] = value ?? null" />
                <el-input v-else v-model="form[field.key]" clearable :type="field.type === 'textarea' ? 'textarea' : field.type === 'url' ? 'url' : 'text'" :rows="field.type === 'textarea' ? 2 : undefined" :placeholder="field.type === 'url' ? '请输入参考链接' : `请输入${field.label}`" />
              </el-form-item>
              </template>
              <div class="create-image-grid">
                <el-form-item v-for="imageField in regularImageFields" :key="imageField.key" :label="imageField.label" class="create-image-item">
                  <ImageUploader v-model="form[imageField.key]" :label="imageField.label" />
                </el-form-item>
              </div>
            </div>
          </el-collapse-item>
          <el-collapse-item v-else title="其他资料" name="other">
            <div class="create-advanced-grid">
              <el-form-item label="上新日期"><el-date-picker v-model="form.release_date" clearable type="date" value-format="YYYY-MM-DD" placeholder="请选择上新日期" format="YYYY年MM月DD日" class="full-create-control compact-create-control" /></el-form-item>
              <el-form-item label="季节"><el-select v-model="form.season_type" clearable placeholder="请选择季节" class="full-create-control compact-create-control"><el-option v-for="item in seasonOptions" :key="item" :label="item" :value="item" /></el-select></el-form-item>
              <el-form-item label="颜色"><el-input v-model="form.color" clearable placeholder="请输入颜色" /></el-form-item>
              <el-form-item label="成分"><el-input v-model="form.composition" clearable placeholder="请输入面料成分" /></el-form-item>
              <el-form-item label="图案/工艺"><el-select v-model="form.has_pattern" clearable placeholder="请选择" class="full-create-control"><el-option v-for="item in patternOptions" :key="String(item.value)" :label="item.label" :value="item.value" /></el-select></el-form-item>
              <el-form-item label="优先级"><el-input :model-value="form.priority" placeholder="根据链路自动生成" disabled /></el-form-item>
              <el-form-item label="尺码"><el-select v-model="form.size" clearable multiple placeholder="请选择尺码" class="full-create-control"><el-option v-for="item in sizeOptions" :key="item" :label="item" :value="item" /></el-select></el-form-item>
              <el-form-item label="产品亮点"><el-input v-model="form.highlights" clearable type="textarea" :rows="2" placeholder="请输入产品亮点" /></el-form-item>
              <el-form-item label="打板注意事项"><el-input v-model="form.pattern_notes" clearable type="textarea" :rows="2" placeholder="请输入打板注意事项" /></el-form-item>
              <div class="create-image-grid">
                <el-form-item v-for="imageField in imageFields" :key="imageField.key" :label="imageField.label" :prop="imageField.required ? imageField.key : undefined" class="create-image-item">
                  <ImageUploader v-model="form[imageField.key]" :label="imageField.label" />
                </el-form-item>
              </div>
            </div>
          </el-collapse-item>
        </el-collapse>
      </el-form>
      <template #footer><el-button @click="dialogVisible = false">取消</el-button><el-button type="primary" @click="submitForm">保存款式</el-button></template>
    </el-dialog>

    <el-dialog v-model="managerDialogVisible" :title="managerTitle()" width="460px" class="option-manager-dialog" align-center :lock-scroll="false">
      <div class="option-manager-add">
        <el-input v-model="managerInput" :placeholder="managerPlaceholder()" @keyup.enter="addManagedItem" />
        <el-button type="primary" @click="addManagedItem"><el-icon><Plus /></el-icon>新增</el-button>
      </div>
      <div class="option-manager-list">
        <div v-for="item in managerItems()" :key="item.id || item.name" class="option-manager-row">
          <span>{{ item.name }}</span>
          <el-button text type="danger" title="删除" @click="removeManagedItem(item)"><el-icon><Delete /></el-icon>删除</el-button>
        </div>
        <el-empty v-if="!managerItems().length" description="暂无选项" :image-size="72" />
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.product-page { min-width: 0; color: #111827; }
.product-progress-heading { justify-content: center; text-align: center; }
.product-progress-heading h1 { width: 100%; }
.style-dashboard { display: flex; flex-direction: column; gap: 9px; margin-bottom: 16px; }
.style-dashboard-metrics { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 9px; min-width: 0; padding-bottom: 2px; }
.style-dashboard-metric { min-width: 0; min-height: 78px; padding: 14px 13px 11px; border: 1px solid #edf0f5; border-radius: 6px; background: #fff; box-shadow: 0 3px 11px rgba(25, 49, 89, .035); cursor: pointer; transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease; }
.style-dashboard-metric:hover, .style-dashboard-metric:focus-visible { border-color: #9fc5fb; box-shadow: 0 8px 20px rgba(37, 99, 235, .1); outline: none; transform: translateY(-1px); }
.style-dashboard-metric-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: #78859a; font-size: 15px; line-height: 1; text-align: left; }
.style-dashboard-metric-label { font-size: 15px; font-weight: 700; }
.style-dashboard-metric > strong { display: block; margin-top: 9px; color: #1392a2; font-size: 18px; font-weight: 400; line-height: 1; text-align: left; }
.style-dashboard-metric:nth-child(3) > strong { color: #6483ba; }
.style-dashboard-metric:nth-child(4) > strong { color: #3b9b6a; }
.style-dashboard-metric:nth-child(5) > strong { color: #ef5b67; }
.style-dashboard-metric:nth-child(6) > strong { color: #f18b2f; }
.style-dashboard-metric-icon { display: grid; width: 29px; height: 29px; flex: 0 0 29px; place-items: center; border-radius: 50%; font-size: 15px; }
.tone-teal { color: #31a9ad; background: #e4f6f5; }.tone-orange { color: #f18b2f; background: #fff0dc; }.tone-red { color: #ef6672; background: #ffeaed; }.tone-cyan { color: #35a8b4; background: #e4f7f7; }.tone-blue { color: #5186e6; background: #e9f0ff; }.tone-slate { color: #7090be; background: #edf2f9; }.tone-green { color: #3b9b6a; background: #e6f6ed; }
.style-dashboard-subprogress { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 9px; }
.style-dashboard-subprogress-card { display: flex; min-width: 0; min-height: 72px; flex-direction: column; align-items: flex-start; justify-content: center; gap: 9px; padding: 13px 14px 11px; border: 1px solid #edf0f5; border-radius: 6px; color: #78859a; background: #fff; box-shadow: 0 3px 11px rgba(25, 49, 89, .035); font-size: 13px; text-align: left; }
button.style-dashboard-subprogress-card:not(:disabled) { cursor: pointer; transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease; }
button.style-dashboard-subprogress-card:not(:disabled):hover, button.style-dashboard-subprogress-card:not(:disabled):focus-visible { border-color: #9fc5fb; box-shadow: 0 8px 20px rgba(37, 99, 235, .1); outline: none; transform: translateY(-1px); }
.style-dashboard-subprogress-card:disabled { cursor: default; opacity: .6; }
.style-dashboard-subprogress-card span { overflow: hidden; width: 100%; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.style-dashboard-subprogress-card strong { color: #124189; font-size: 20px; font-weight: 400; line-height: 1; }
.style-dashboard-designers { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px; }
.style-dashboard-designer { min-width: 0; padding: 16px; border: 1px solid #edf0f5; border-radius: 6px; background: #fff; box-shadow: 0 3px 11px rgba(25, 49, 89, .035); cursor: pointer; transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease; }
.style-dashboard-designer:hover, .style-dashboard-designer:focus-visible { border-color: #9fc5fb; box-shadow: 0 8px 20px rgba(37, 99, 235, .1); outline: none; transform: translateY(-1px); }
.style-dashboard-designer-head { display: flex; align-items: center; gap: 11px; min-height: 50px; }
.style-dashboard-designer-avatar { display: grid; width: 45px; height: 45px; flex: 0 0 45px; place-items: center; border-radius: 50%; color: #fff; background: #e4f0ff; font-size: 23px; }
.style-dashboard-designer-name { display: flex; min-width: 0; align-items: center; }
.style-dashboard-designer-head strong { overflow: hidden; color: #1265d6; font-size: 17px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.style-dashboard-designer-total { margin-left: auto; color: #94a3b8; font-size: 11px; font-weight: 400; white-space: nowrap; }
.style-dashboard-designer-stats { display: grid; gap: 0; margin-top: 14px; padding: 3px 14px; border-radius: 4px; background: #f4f7fb; }
.style-dashboard-designer-stats div { display: flex; align-items: center; justify-content: space-between; min-height: 35px; border-bottom: 1px solid #e8edf4; }
.style-dashboard-designer-stats div:last-child { border-bottom: 0; }.style-dashboard-designer-stats span { color: #8490a6; font-size: 12px; }.style-dashboard-designer-stats strong { color: #124189; font-size: 15px; }
.style-dashboard-designer-stats button { display: flex; width: 100%; min-width: 0; min-height: 35px; align-items: center; justify-content: space-between; gap: 8px; padding: 0; border: 0; border-bottom: 1px solid #e8edf4; background: transparent; text-align: left; cursor: pointer; }
.style-dashboard-designer-stats button:last-child { border-bottom: 0; }
.style-dashboard-designer-stats button:hover span { color: #1677ff; }
.style-dashboard-designer-stats button:focus-visible { border-radius: 3px; outline: 2px solid #75aaff; outline-offset: 2px; }
.style-dashboard-loading .style-dashboard-designer { min-height: 220px; }.style-dashboard-loading .style-dashboard-subprogress-card { min-height: 72px; }.style-dashboard-loading :deep(.el-skeleton) { height: 100%; }
.style-progress-summary { margin-bottom: 16px; padding: 20px 22px; }
.style-progress-summary-list { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
.style-progress-summary-item { display: flex; min-width: 0; min-height: 104px; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 14px 16px; border: 1px solid #e5eaf0; border-radius: 8px; color: #475569; background: #fff; text-align: center; cursor: pointer; transition: border-color .16s ease, background .16s ease, transform .16s ease; }
.style-progress-summary-item:hover { border-color: #8bbcf4; background: #f7fbff; transform: translateY(-1px); }
.style-progress-summary-item strong { color: #172033; font-size: 28px; line-height: 1; }
.style-progress-summary-item span { overflow: hidden; width: 100%; font-size: 13px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.style-progress-summary-skeleton { cursor: default; }
.style-progress-summary-skeleton:hover { border-color: #e5eaf0; background: #fff; transform: none; }
.style-progress-summary-skeleton :deep(.el-skeleton) { display: flex; flex-direction: column; align-items: center; gap: 8px; width: 100%; }
.style-progress-skeleton-number { width: 34px; height: 28px; }
.style-progress-skeleton-label { width: 54px; height: 14px; }
.product-heading { align-items: center; min-height: unset; box-sizing: border-box; margin-bottom: 0; padding: 18px 0; }
.product-heading h1 { color: #111827; font-size: 24px; font-weight: 700; letter-spacing: -.02em; }
.product-heading .create-button { border-color: #1677ff; background: #1677ff; box-shadow: 0 8px 20px rgba(22, 119, 255, .16); }
.product-heading .create-button:hover { border-color: #0958d9; background: #0958d9; }
.style-page-actions { display: flex; align-items: center; gap: 10px; }
.product-toolbar .style-page-actions { margin-left: auto; flex: 0 0 auto; }
.product-toolbar { box-sizing: border-box; display: flex; height: 56px; min-height: 56px; align-items: center; gap: 10px; margin-bottom: 14px; padding: 10px 16px; background: #fafafa; border: 1px solid #f0f0f0; border-radius: 8px; box-shadow: none; }
.product-toolbar-filtered { height: auto; min-height: 56px; flex-wrap: wrap; }
.product-toolbar > :deep(.el-input),.product-toolbar > :deep(.el-select),.product-toolbar > :deep(.el-button){box-sizing:border-box;height:32px}
.product-toolbar > :deep(.el-input .el-input__wrapper),.product-toolbar > :deep(.el-select .el-select__wrapper){box-sizing:border-box;min-height:32px;height:32px}
.product-toolbar > :deep(.el-button){min-height:32px;padding-top:0;padding-bottom:0}
.product-toolbar .style-page-actions :deep(.el-button){box-sizing:border-box;height:32px;min-height:32px;padding-top:0;padding-bottom:0}
.product-toolbar .release-date-quick-filters button{box-sizing:border-box;height:34px;min-height:34px}
.release-date-quick-filters { display: flex; min-width: 0; flex: 1; align-items: center; flex-wrap: wrap; gap: 7px; }
.arrival-list-filters { display: flex; flex: 0 0 auto; align-items: center; gap: 10px; }
.arrival-list-search { width: 210px; }
.arrival-list-category { width: 120px; }
.release-date-quick-filters button { min-width: 54px; min-height: 34px; padding: 0 12px; border: 1px solid #d9e2ef; border-radius: 4px; color: #475569; background: #fff; font: inherit; cursor: pointer; transition: color .15s ease, border-color .15s ease, background .15s ease; }
.release-date-quick-filters button:hover { border-color: #83b4f4; color: #1265d6; }
.release-date-quick-filters button.active { border-color: #1677ff; color: #fff; background: #1677ff; }
.arrival-planning-summary { margin: -2px 0 14px; padding: 12px 16px; border: 1px solid #e7edf5; border-radius: 8px; background: #fff; }
.arrival-planning-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 10px; }
.arrival-planning-heading > div:first-child { display: flex; align-items: baseline; gap: 9px; }
.arrival-planning-date-filters { flex: 0 1 auto; gap: 6px; }
.arrival-planning-date-filters button { min-width: 48px; min-height: 28px; padding: 0 9px; font-size: 12px; }
.arrival-planning-heading h2 { margin: 0; color: #27364a; font-size: 14px; font-weight: 650; }
.arrival-planning-heading span { color: #8793a3; font-size: 12px; }
.arrival-planning-totals { display: flex; align-items: center; gap: 18px; color: #718096; font-size: 12px; }
.arrival-planning-totals strong { margin-left: 4px; color: #1558ae; font-size: 14px; font-variant-numeric: tabular-nums; }
.arrival-planning-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 140px), 1fr)); gap: 6px; }
.arrival-planning-item { box-sizing: border-box; display: flex; width: 100%; min-width: 0; min-height: 34px; align-items: center; gap: 6px; padding: 6px 8px; border: 1px solid transparent; border-radius: 4px; color: #718096; background: #f7f9fc; font: inherit; font-size: 11px; text-align: left; cursor: pointer; transition: border-color .15s ease, background-color .15s ease; }
.arrival-planning-item:hover,.arrival-planning-item:focus-visible { border-color: #91caff; background: #f0f7ff; outline: none; }
.arrival-planning-item > strong { overflow: hidden; min-width: 0; flex: 1; color: #3b4b61; font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.arrival-planning-item > span { flex: 0 0 auto; white-space: nowrap; }
.arrival-planning-strategies { display: grid; gap: 4px; padding-top: 5px; }
.arrival-planning-strategy-row { display: grid; grid-template-columns: 45px minmax(0, 1fr) minmax(0, 1fr); align-items: center; gap: 4px; white-space: nowrap; }
.arrival-planning-strategy-label { color: #45566d; }
.arrival-planning-item b,.arrival-planning-strategy-row b { color: #1558ae; font-size: 12px; font-variant-numeric: tabular-nums; font-weight: 600; }
.arrival-planning-summary :deep(.el-empty) { padding: 4px 0; }
.arrival-planning-summary :deep(.el-empty__description) { margin-top: 4px; }
.product-search { width: min(270px, 100%); }.product-search :deep(.el-input__wrapper), .product-filter :deep(.el-select__wrapper) { border-radius: 8px; box-shadow: 0 0 0 1px #d9e2ef inset; }
.product-toolbar-filtered .product-search,.product-toolbar-filtered .product-filter,.product-toolbar-filtered .product-filter-date,.product-toolbar-filtered .product-progress-filter{width:130px;flex:0 0 130px}.product-filter { width: 110px; }.product-filter-date { width: 140px; }.product-progress-filter { width: 110px; }
.product-toolbar-filtered .product-search,.product-toolbar-filtered .product-filter-date{box-sizing:border-box;width:200px!important;min-width:200px!important;max-width:200px!important;flex:0 0 200px!important}
.product-toolbar-filtered .product-filter-date{height:32px!important;min-height:32px!important;padding:0 6px}.product-toolbar-filtered .product-filter-date :deep(.el-range-input){width:64px;min-width:0;padding:0;font-size:11px}.product-toolbar-filtered .product-filter-date :deep(.el-range-separator){width:10px;padding:0;font-size:11px}.product-toolbar-filtered .product-filter-date :deep(.el-range__icon),.product-toolbar-filtered .product-filter-date :deep(.el-range__close-icon){width:12px;margin:0;font-size:12px}.product-toolbar-filtered .product-filter-date :deep(.el-input__wrapper){box-sizing:border-box;min-height:32px;height:32px;padding:0 4px}
.product-toolbar-filtered :deep(.product-filter-date.el-date-editor--daterange.el-input__wrapper){box-sizing:border-box!important;height:32px!important;min-height:32px!important;line-height:30px!important}
/* 1440px columns plus the vertical scrollbar gutter and panel borders. */
.product-directory-width { width: 1480px; max-width: 100%; }
.product-gallery-panel { min-width: 0; padding-bottom: 18px; border: 1px solid rgba(226, 232, 240, .8); border-radius: 18px; box-shadow: 0 10px 28px rgba(15, 23, 42, .04); }
.product-gallery-heading { margin-bottom: 16px; }
.product-gallery-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 16px; min-height: 220px; }
.product-gallery-card { position: relative; min-width: 0; overflow: hidden; border: 1px solid #e5eaf0; border-radius: 12px; background: #fff; cursor: pointer; transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease; }
.product-gallery-card:hover { border-color: #bfdbfe; box-shadow: 0 12px 28px rgba(30, 64, 175, .1); transform: translateY(-2px); }
.product-gallery-card:focus-visible { outline: 2px solid #1677ff; outline-offset: 3px; }
.product-gallery-skeleton-card { min-height: 365px; cursor: default; }
.product-gallery-skeleton-card:hover { border-color: #e5eaf0; box-shadow: none; transform: none; }
.product-gallery-skeleton-card :deep(.el-skeleton) { height: 100%; }
.product-gallery-skeleton-image { display: block; width: 100%; height: auto !important; aspect-ratio: 4 / 5; border-radius: 0; }
.product-gallery-skeleton-body { display: flex; flex-direction: column; gap: 10px; padding: 13px 14px 11px; }
.product-gallery-skeleton-title { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.product-gallery-skeleton-title :deep(.el-skeleton__item:first-child) { width: 46%; }
.product-gallery-skeleton-title :deep(.el-skeleton__item:last-child) { width: 48px; height: 22px; }
.product-gallery-skeleton-body > :deep(.el-skeleton__item) { width: 78%; height: 14px; }
.product-gallery-skeleton-thumb { width: 38px !important; height: 38px !important; margin-top: 2px; border-radius: 5px; }
.product-gallery-delete { position: absolute; top: 9px; right: 9px; z-index: 3; display: grid; width: 28px; height: 28px; place-items: center; padding: 0; border: 0; border-radius: 50%; color: #fff; background: rgba(15, 23, 42, .68); opacity: 0; pointer-events: none; transition: opacity .16s ease, background .16s ease; }
.product-gallery-card:hover .product-gallery-delete, .product-gallery-delete:focus-visible { opacity: 1; pointer-events: auto; }
.product-gallery-delete:hover { background: #ef4444; }
.product-gallery-cover { overflow: hidden; aspect-ratio: 4 / 5; background: #f8fafc; }
.product-gallery-image { display: block; width: 100%; height: 100%; object-fit: cover; }
.product-gallery-body { padding: 13px 14px 11px; }
.product-gallery-title-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.product-gallery-sku { min-width: 0; overflow: hidden; padding: 0; border: 0; color: #1f2937; background: transparent; font-size: 14px; font-weight: 700; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
.product-gallery-sku { display: block; }
.product-gallery-title-row .el-tag { flex: 0 0 auto; max-width: 72px; overflow: hidden; border-color: #dbeafe; color: #2563eb; background: #eff6ff; text-overflow: ellipsis; white-space: nowrap; }
.product-cell-name { min-width: 0; display: flex; align-items: flex-start; flex-direction: column; gap: 2px; }
.product-cell-name strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.product-cell-name .product-cell-link { margin-top: 0; color: #7b8798; font-size: 11px; line-height: 16px; }
.canceled-style-tag { flex: 0 0 auto; height: 22px; padding: 0 8px !important; border-color: #dc2626 !important; border-radius: 4px !important; color: #fff !important; background: #ef4444 !important; font-size: 12px; line-height: 20px; white-space: nowrap; }
.product-gallery-meta { display: flex; justify-content: space-between; gap: 8px; margin-top: 8px; color: #64748b; font-size: 11px; }
.product-gallery-meta span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.product-gallery-thumbs { display: flex; gap: 6px; margin-top: 12px; overflow: hidden; }
.product-gallery-thumb { width: 38px; height: 38px; flex: 0 0 38px; border: 1px solid #e2e8f0; border-radius: 5px; object-fit: cover; }
.product-gallery-no-images { height: 38px; margin-top: 12px; color: #a0a9b6; font-size: 11px; line-height: 38px; }
.product-gallery-actions { display: flex; gap: 4px; margin-top: 10px; padding-top: 8px; border-top: 1px solid #f1f5f9; }
.product-gallery-actions .el-button { margin: 0; padding: 3px 5px; font-size: 12px; }
.product-table-panel { min-width: 0; padding-bottom: 12px; overflow: hidden; border: 1px solid rgba(226, 232, 240, .8); border-radius: 18px; box-shadow: 0 10px 28px rgba(15, 23, 42, .04); }
.product-table-heading { margin-bottom: 14px; }
.product-table { --el-table-border-color: #edf0f3; --el-table-header-bg-color: #fafbfc; --el-table-row-hover-bg-color: #fffaf8; color: #596574; font-size: 12px; }
.product-table :deep(.el-table__header-wrapper th) { background: #f8fafc !important; color: #475569; font-weight: 700; padding: 12px 14px; }
.product-table :deep(.el-table__body-wrapper td) { padding: 14px; border-bottom-color: #f1f5f9; }
.product-table :deep(.el-table__body tr:hover > td) { background: #fbfdff !important; }
.product-table :deep(.el-table__body tr) { cursor: pointer; }
.product-table .el-table__inner-wrapper::before { display: none; }
.product-table :deep(td .cell), .product-table :deep(th .cell) { overflow: hidden; line-height: 20px; text-overflow: clip; white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
.product-table :deep(td.progress-column .cell) { overflow: visible; text-overflow: clip; }
.product-table :deep(td) { height: 68px; }
.progress-display { box-sizing: border-box; display: inline-flex; width: 83px; min-width: 83px; height: 24px; min-height: 24px; flex: none; align-items: center; justify-content: center; padding: 0 9px; border: 1px solid #cfe1fb; border-radius: 4px; color: #1769c2; background: #f5f9ff; font-size: 12px; line-height: 22px; white-space: nowrap; }
.progress-display.is-complete { border-color: #b7e2c1; color: #198754; background: #f2fbf4; }
.progress-display.is-cancelled { border-color: #f2c1c1; color: #c84242; background: #fff5f5; }
.progress-display.is-active { border-color: #bcd7fb; color: #1769c2; background: #f7fbff; }
.progress-display-label { display: inline-block; }
.progress-display-stack { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
.regular-progress-badges { display: flex; flex-wrap: wrap; gap: 3px; }
.regular-progress-badge { display: inline-flex; align-items: center; padding: 1px 4px; border: 1px solid #e5e7eb; border-radius: 3px; color: #7b8492; background: #fff; font-size: 10px; line-height: 14px; white-space: nowrap; }
.regular-progress-badge.complete { border-color: #b7e2c1; color: #198754; background: #f2fbf4; }
.regular-progress-badge.incomplete { border-color: #f1a3a3; color: #b42318; background: #fee4e2; }
.product-table :deep(.product-cell) { overflow: hidden; }
.product-table :deep(.product-actions) { overflow: visible; }
.product-table :deep(.operation-column-header .cell) { padding-left: 15px; }
.product-table :deep(.el-table__header-wrapper table), .product-table :deep(.el-table__body-wrapper table) { width: 100% !important; min-width: 1230px; table-layout: fixed; }
.new-arrivals-table :deep(.el-table__header-wrapper table), .new-arrivals-table :deep(.el-table__body-wrapper table) { min-width: 0 !important; table-layout: fixed; }
.new-arrivals-table :deep(.el-table__body-wrapper td) { padding: 9px 10px; }
.new-arrivals-table :deep(td .cell) { overflow: visible; white-space: normal; overflow-wrap: anywhere; }
.new-arrivals-table :deep(.table-cell-ellipsis) { overflow: visible; text-overflow: clip; white-space: normal; overflow-wrap: anywhere; }
.new-arrivals-table :deep(.product-cell strong) { white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
.new-arrivals-table :deep(.cost-list-value) { white-space: nowrap; font-variant-numeric: tabular-nums; }
.arrival-pricing-cell { display: flex; min-height: 38px; flex-direction: column; align-items: flex-start; justify-content: center; gap: 1px; }
.arrival-pricing-cell small { padding-left: 5px; color: #94a3b8; font-size: 10px; line-height: 14px; white-space: nowrap; }
.release-date-inline { display: inline-flex; width: 160px; max-width: 100%; box-sizing: border-box; }
.new-arrivals-table :deep(.el-date-editor.release-date-inline) { width: 100px !important; max-width: 100%; }
.new-arrivals-table :deep(.release-date-inline .el-input__wrapper) { min-width: 0; padding-right: 8px; padding-left: 8px; }
.inline-edit-value { display: inline-block; max-width: 100%; padding: 3px 5px; border: 1px solid transparent; border-radius: 4px; color: #64748b; background: transparent; font: inherit; text-align: inherit; cursor: pointer; }
.inline-edit-value:hover, .inline-edit-value:focus-visible { border-color: #bfdbfe; color: #1265d6; background: #f8fbff; outline: none; }
.inline-edit-value:disabled { cursor: wait; }
.pricing-inline-input { width: 100px; }
.pricing-inline-input :deep(.el-input__wrapper) { min-height: 30px; box-shadow: 0 0 0 1px #bfdbfe inset; }
.table-cell-ellipsis, .table-link-cell { display: block; max-width: 100%; overflow: hidden; color: #64748b; text-overflow: clip; white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
.product-cell .table-cell-ellipsis { min-width: 0; flex: 1; }
.product-actions { display: flex; align-items: center; gap: 8px; white-space: nowrap; }
.product-actions .el-button { flex: 0 0 auto; margin: 0; }
.product-cell { display: flex; align-items: center; gap: 11px; min-width: 0; }
.product-cell strong, .product-cell span { display: block; overflow: hidden; text-overflow: clip; white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
.product-cell strong { color: #364251; font-size: 12px; font-weight: 600; }
.product-cell span { margin-top: 4px; color: #9ba5b0; font-size: 10px; }
.product-image { width: 40px; height: 40px; flex: 0 0 40px; border-radius: 6px; }
.product-image-clickable { cursor: zoom-in; }
.product-image-placeholder { display: grid; place-items: center; color: #d47761; background: #fff0ec; font-size: 18px; }
.product-pagination { display: flex; justify-content: flex-end; padding-top: 16px; }
.form-row { display: flex; gap: 16px; }
.form-row .el-form-item { flex: 1; }
.form-row .el-select, .form-row .el-input-number { width: 100%; }
.full-width-control { width: 100%; }
.category-picker { display: flex; align-items: center; gap: 10px; width: 100%; }
.category-select { flex: 1; }
.category-option { display: flex; align-items: center; height: 38px; }
.reference-upload { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; width: 100%; }
.reference-upload :deep(.el-upload) { display: inline-flex; }
.reference-upload-box { display: grid; width: 112px; height: 112px; place-items: center; border: 1px dashed #cbd5e1; border-radius: 12px; background: #f8fafc; }
.reference-upload-box :deep(.el-button) { min-height: 30px; padding: 0 9px; border-radius: 7px; font-size: 12px; }
.reference-preview { position: relative; display: block; width: 112px; height: 112px; }
.reference-preview-image { display: block; width: 112px; height: 112px; border-radius: 12px; border: 1px solid #e2e8f0; }
.reference-remove-button { position: absolute; top: 4px; right: 4px; z-index: 2; display: grid; width: 26px; height: 26px; padding: 0; place-items: center; border: 0; border-radius: 50%; color: #fff; background: rgba(15, 23, 42, .68); opacity: 0; pointer-events: none; transition: opacity .16s ease; cursor: pointer; }
.reference-preview:hover .reference-remove-button, .reference-remove-button:focus-visible { opacity: 1; pointer-events: auto; }
.option-manager-dialog :deep(.el-dialog) { overflow: hidden; border-radius: 16px; }
.option-manager-dialog :deep(.el-dialog__body) { padding: 20px 24px 24px; }
.option-manager-add { display: flex; gap: 10px; }
.option-manager-add .el-button { min-width: 86px; }
.option-manager-list { max-height: 330px; margin-top: 18px; overflow-y: auto; border-top: 1px solid #eef2f6; }
.option-manager-row { display: flex; align-items: center; justify-content: space-between; min-height: 50px; border-bottom: 1px solid #eef2f6; color: #334155; }
.option-manager-row .el-button { margin: 0; }
.style-create-form { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); column-gap: 18px; row-gap: 18px; align-items: start; }
.create-advanced-collapse { grid-column: 1 / -1; width: 100%; }
.create-advanced-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); column-gap: 18px; row-gap: 8px; align-items: start; }
.create-advanced-grid :deep(.el-form-item) { width: 100%; }
.external-purchase-images { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); column-gap: 18px; align-items: start; }
.external-purchase-images :deep(.el-form-item) { width: 100%; }
.external-purchase-suppliers { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); column-gap: 18px; align-items: start; }
.external-purchase-suppliers :deep(.el-form-item) { width: 100%; }
.style-create-form :deep(.el-form-item) { width: 100%; margin-bottom: 18px; }
.style-create-form > :deep(.el-form-item) { width: 180px; justify-self: start; }
.style-create-form :deep(.el-form-item__label) { height: 22px; padding-bottom: 6px; color: #475569; font-weight: 600; line-height: 16px; }
.style-create-form :deep(.el-form-item__content) { display: block; }
.external-price-input :deep(.el-input__inner) { text-align: left; }
.style-create-form .full-create-control, .style-create-form .el-input, .style-create-form .el-select, .style-create-form .el-date-editor { width: 100%; max-width: 100%; }
.style-create-form .compact-create-control { width: 180px; max-width: 100%; }
.style-create-form .category-picker, .style-create-form .reference-upload { width: 100%; }
.create-image-grid { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 18px; }
.create-image-grid :deep(.el-form-item) { width: 100%; }
.style-create-form > :deep(.el-form-item) { width: 100%; }
.style-create-form .compact-create-control { width: 100%; }
.style-create-form :deep(.el-form-item__error) { white-space: nowrap; }
.style-dialog :deep(.el-dialog) { max-width: calc(100vw - 32px); margin: 0 auto; border-radius: 20px; overflow: hidden; }.style-dialog :deep(.el-dialog__header) { padding: 24px 28px 16px; margin-right: 0; border-bottom: 1px solid #f1f5f9; }.style-dialog :deep(.el-dialog__title) { color: #111827; font-size: 20px; font-weight: 700; }.style-dialog :deep(.el-dialog__body) { max-height: 70vh; padding: 24px 28px 8px; overflow-y: auto; }.style-dialog :deep(.el-dialog__footer) { padding: 16px 28px 24px; }.style-dialog :deep(.el-input__wrapper), .style-dialog :deep(.el-select__wrapper) { min-height: 42px; border-radius: 10px; box-shadow: 0 0 0 1px #dbe3ef inset; }.style-dialog :deep(.el-textarea__inner) { border-radius: 10px; }.style-dialog :deep(.el-button) { min-height: 38px; border-radius: 10px; }.style-dialog :deep(.el-button--primary) { background: #1677ff; border-color: #1677ff; }
@media (max-width: 1200px) { .product-gallery-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
@media (max-width: 1200px) { .style-dashboard-subprogress { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
@media (max-width: 1100px) { .style-dashboard-subprogress { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
@media (max-width: 900px) { .style-dashboard-subprogress { grid-template-columns: repeat(3, minmax(0, 1fr)); }.style-dashboard-designers { grid-template-columns: repeat(2, minmax(0, 1fr)); }.style-progress-summary-list { grid-template-columns: repeat(3, minmax(0, 1fr)); }.product-gallery-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 700px) { .style-dashboard-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }.style-dashboard-subprogress { grid-template-columns: repeat(2, minmax(0, 1fr)); }.style-dashboard-designers { grid-template-columns: 1fr; }.product-toolbar { height: auto; min-height: 56px; flex-wrap: wrap; }.product-search { width: 100%; }.product-filter { flex: 1; min-width: 120px; }.product-heading { align-items: flex-start; }.product-progress-heading { align-items: center; }.style-page-actions { width: 100%; flex-wrap: wrap; }.style-page-actions .el-button { flex: 1; }.product-gallery-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }.product-gallery-body { padding: 11px 10px 9px; }.product-gallery-meta { font-size: 10px; }.arrival-planning-heading { align-items: flex-start; flex-direction: column; gap: 7px; }.arrival-planning-totals { flex-wrap: wrap; gap: 8px 16px; }.arrival-planning-group-heading { align-items: flex-start; flex-direction: column; justify-content: center; gap: 4px; padding: 7px 10px; }.form-row { display: block; }.style-create-form, .create-advanced-grid, .create-image-grid { display: block; }.style-create-form :deep(.el-form-item), .style-create-form > :deep(.el-form-item), .create-advanced-grid :deep(.el-form-item), .create-image-grid :deep(.el-form-item), .external-purchase-suppliers :deep(.el-form-item) { width: 100%; max-width: 100%; }.external-purchase-suppliers { display: block; }.external-purchase-images { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 700px) { .arrival-list-filters { flex: 1 1 100%; flex-wrap: wrap; }.arrival-list-search { flex: 1 1 180px; width: auto; }.arrival-list-category { flex: 1 1 120px; width: auto; } }
@media (max-width: 420px) { .product-gallery-grid { grid-template-columns: 1fr; } }
.season-input-row { display: flex; width: 218px; max-width: 100%; min-width: 0; align-items: stretch; gap: 6px; }
.season-input-row :deep(.season-date-control), .season-input-row :deep(.season-value-control) { box-sizing: border-box; width: 138px; height: 42px; flex: 0 0 138px; }
.season-input-row :deep(.season-date-control .el-input__wrapper), .season-input-row :deep(.season-value-control .el-input__wrapper) { min-height: 42px; }
.season-input-row :deep(.season-toggle-button) { box-sizing: border-box; width: 74px; height: 42px; min-height: 42px; flex: 0 0 74px; align-self: stretch; margin-left: 0; padding: 0 6px; }
.product-gallery-panel, .product-table-panel { border-color: var(--ui-border); border-radius: var(--ui-radius-lg); box-shadow: var(--ui-shadow-xs); }
.product-gallery-card { border-radius: var(--ui-radius-md); box-shadow: none; }
.product-gallery-card:hover { border-color: #93c5fd; box-shadow: var(--ui-shadow-sm); transform: none; }
.product-table :deep(.el-table__header-wrapper th) { background: var(--ui-surface-muted) !important; }
.product-search :deep(.el-input__wrapper), .product-filter :deep(.el-select__wrapper), .product-progress-filter :deep(.el-select__wrapper) { border-radius: var(--ui-radius-md); box-shadow: 0 0 0 1px var(--ui-border-strong) inset; }
.style-dialog :deep(.el-dialog), .option-manager-dialog :deep(.el-dialog) { border-radius: var(--ui-radius-lg); }
.style-dialog :deep(.el-input__wrapper), .style-dialog :deep(.el-select__wrapper), .style-dialog :deep(.el-textarea__inner) { border-radius: var(--ui-radius-md); }
</style>
