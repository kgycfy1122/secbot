<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Box, CircleCheck, Close, DocumentAdd, MagicStick, Refresh, Search, Upload, UserFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { getAuthHeaders } from '../auth.js'
import { getStyleProgressSteps } from '../styleProgress.js'
import { LIST_DISPLAY_DEFINITIONS, hasListDisplayField, readListDisplaySettings } from '../listDisplaySettings.js'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const allProducts = ref([])
const search = ref('')
const patternMaker = ref('')
const boardMaker = ref('')
const patternProgress = ref('')
const patternProgressFrom = ref('')
const patternProgressTo = ref('')
const patternProgressOptions = ['分配中', '已分配', '纸样中', '车板中', '审核中', '已通过', '取消']
const patternMakerOptions = ref([])
const uploadHeaders = getAuthHeaders()
const patternUploadStates = ref({})
const isOverview = computed(() => route.path === '/back/patterns' && !route.query.pattern_view && !route.query.pattern_progress)
const isBoardView = computed(() => route.query.pattern_view === 'board')
const products = computed(() => allProducts.value.filter(isBoardView.value ? hasReachedPatternStage : shouldShowPatternProduct))
const activeProgressOptions = computed(() => isBoardView.value ? ['车板未完成', '车板已完成', '款式取消'] : patternProgressOptions)
const listDisplaySettings = ref(readListDisplaySettings())
function showPatternField(field) { return hasListDisplayField(listDisplaySettings.value, 'pattern', field) }
function handleListDisplaySettingsUpdated(event) { listDisplaySettings.value = event.detail || readListDisplaySettings() }
const patternBaseListFields = new Set(['style', 'release_date', 'category', 'link', 'designer', 'priority', 'maker', 'color', 'progress', 'notes', 'review'])
const patternExtraFields = computed(() => (LIST_DISPLAY_DEFINITIONS.pattern.fields || []).filter((field) => !patternBaseListFields.has(field.key) && showPatternField(field.key)))
function patternFieldValue(product, field) {
  if (field === 'status') return [1, '1', true, 'true'].includes(product.is_canceled) ? '已取消' : (product.status === 'active' ? '正常' : (product.status || '—'))
  if (field === 'stock' || field === 'reference_sales') return product[field] ?? '—'
  if (field === 'price') return product.price === null || product.price === undefined || product.price === '' ? '—' : `¥${Number(product.price).toFixed(2)}`
  return product[field] || '—'
}

function hasReachedPatternStage(product) {
  const canceled = product.is_canceled === true || product.is_canceled === 1 || product.is_canceled === '1' || product.is_canceled === 'true'
  if (canceled) {
    const styleProgressTimes = product.style_progress_times && typeof product.style_progress_times === 'object' ? product.style_progress_times : {}
    const hasPatternHistory = Object.hasOwn(styleProgressTimes, '打版') || Object.hasOwn(styleProgressTimes, '打板')
    const hasPatternWork = product.pattern_maker
      || (product.pattern_progress && product.pattern_progress !== '分配中')
      || product.first_pattern_image_url || product.second_pattern_image_url || product.third_pattern_image_url
      || product.first_board_maker || product.second_board_maker || product.third_board_maker
      || product.first_board_progress || product.second_board_progress || product.third_board_progress
      || product.first_review_result || product.second_review_result || product.third_review_result
    return Boolean(hasPatternHistory || hasPatternWork)
  }
  const steps = getStyleProgressSteps(product.link)
  const patternIndex = steps.findIndex((step) => ['待打板', '打版中', '打版', '打板'].includes(step))
  const currentIndex = steps.indexOf(product.style_progress)
  return patternIndex >= 0 && currentIndex >= patternIndex
}

function isCanceledProduct(product) {
  return product?.style_progress === '款式取消' || product?.is_canceled === true || product?.is_canceled === 1 || product?.is_canceled === '1' || product?.is_canceled === 'true'
}

function isCombinedCancellationProgress(progress) {
  return progress === '纸样取消' || progress === '款式取消'
}

function matchesPatternProgress(product, progress) {
  const current = totalProgressLabel(product)
  return progress === '取消' ? isCombinedCancellationProgress(current) : current === progress
}

function shouldShowPatternProduct(product) {
  const hasPatternStage = getStyleProgressSteps(product.link).some((step) => ['待打板', '打版中', '打版', '打板'].includes(step))
    || (['AI款', 'AI'].includes(String(product.link || '').trim()) && getStyleProgressSteps(product.link).includes('打板中'))
  if (hasPatternStage) return hasReachedPatternStage(product)
  return Boolean(String(product.pattern_maker || '').trim()) && hasFirstPatternWorkStarted(product)
}

function firstImage(value) {
  if (Array.isArray(value)) return value[0] || ''
  if (typeof value !== 'string' || !value.trim()) return ''
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed[0] || ''
  } catch {
    // Legacy image values are stored as a single URL.
  }
  return value
}

function hasReviewFollowup(result) {
  return Boolean(result && result !== '通过' && result !== '取消')
}

function activePatternStage(product) {
  const stageIndex = hasReviewFollowup(product.second_review_result)
    ? 2
    : hasReviewFollowup(product.first_review_result) ? 1 : 0
  const stages = [
    { prefix: 'first', label: '头版' },
    { prefix: 'second', label: '复版' },
    { prefix: 'third', label: '三版' },
  ]
  const stage = stages[stageIndex]
  const previous = stages[stageIndex - 1]
  const previousPrefix = previous?.prefix
  const reviewResult = ['third', 'second', 'first']
    .map((prefix) => product[`${prefix}_review_result`])
    .find(Boolean) || ''
  return {
    ...stage,
    imageField: `${stage.prefix}_pattern_image_url`,
    progressField: `${stage.prefix}_pattern_progress`,
    progress: product[`${stage.prefix}_pattern_progress`] || (product[`${stage.prefix}_pattern_image_url`] ? '纸样已完成' : '纸样未完成'),
    contextImage: previousPrefix ? product[`${previousPrefix}_review_opinion_image_url`] : '',
    contextText: previousPrefix ? '' : (product.pattern_notes || ''),
    reviewResult,
  }
}

function patternUploadKey(product, stage) {
  return `${product.id}:${stage.prefix}`
}

function isPatternUploading(product, stage) {
  return Boolean(patternUploadStates.value[patternUploadKey(product, stage)])
}

function beforePatternImageUpload(file, product, stage) {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
    ElMessage.error('纸样图仅支持 JPG、PNG、WEBP 或 GIF 格式')
    return false
  }
  patternUploadStates.value = { ...patternUploadStates.value, [patternUploadKey(product, stage)]: true }
  return true
}

async function handlePatternImageUpload(result, product, stage) {
  const key = patternUploadKey(product, stage)
  try {
    if (!result?.url) throw new Error(result?.message || '纸样图上传失败')
    const response = await fetch(`/api/products/${encodeURIComponent(product.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ [stage.imageField]: result.url }),
    })
    const saved = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(saved.message || '纸样图保存失败')
    Object.assign(product, saved)
    ElMessage.success(`${stage.label}纸样图已保存`)
  } catch (error) {
    ElMessage.error(error.message || '纸样图保存失败')
  } finally {
    const nextStates = { ...patternUploadStates.value }
    delete nextStates[key]
    patternUploadStates.value = nextStates
  }
}

async function removePatternImage(product, stage) {
  const key = patternUploadKey(product, stage)
  patternUploadStates.value = { ...patternUploadStates.value, [key]: true }
  try {
    const response = await fetch(`/api/products/${encodeURIComponent(product.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ [stage.imageField]: '' }),
    })
    const saved = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(saved.message || '纸样图删除失败')
    Object.assign(product, saved)
    ElMessage.success(`${stage.label}纸样图已移除`)
  } catch (error) {
    ElMessage.error(error.message || '纸样图删除失败')
  } finally {
    const nextStates = { ...patternUploadStates.value }
    delete nextStates[key]
    patternUploadStates.value = nextStates
  }
}

function handlePatternImageUploadError(_error, product, stage) {
  const nextStates = { ...patternUploadStates.value }
  delete nextStates[patternUploadKey(product, stage)]
  patternUploadStates.value = nextStates
  ElMessage.error('纸样图上传失败')
}

function priorityLabel(priority) {
  return { low: '低', normal: '普通', high: '高' }[priority] || priority || '—'
}

function hasPatternWorkStarted(product) {
  return Boolean(
    product.pattern_started_at
    || ['纸样中', '车板中', '审核中', '已通过'].includes(product.pattern_progress)
    || product.first_pattern_image_url || product.second_pattern_image_url || product.third_pattern_image_url
    || product.first_pattern_progress === '纸样已完成' || product.second_pattern_progress === '纸样已完成' || product.third_pattern_progress === '纸样已完成'
    || product.first_board_progress === '车板已完成' || product.second_board_progress === '车板已完成' || product.third_board_progress === '车板已完成'
    || product.first_board_maker || product.second_board_maker || product.third_board_maker
    || product.first_review_result || product.second_review_result || product.third_review_result,
  )
}

function hasFirstPatternWorkStarted(product) {
  return Boolean(
    product.pattern_started_at
    || product.first_pattern_image_url
    || product.first_pattern_progress === '纸样已完成'
    || product.first_board_progress === '车板已完成'
    || product.first_board_maker
    || product.first_review_result,
  )
}

function totalProgressLabel(product) {
  if (isCanceledProduct(product)) return '款式取消'
  const hasPatternStage = getStyleProgressSteps(product.link).some((step) => ['待打板', '打版中', '打版', '打板'].includes(step))
  if (!hasPatternStage && String(product.pattern_maker || '').trim() && hasPatternWorkStarted(product)) return '纸样取消'
  if (!String(product.pattern_maker || '').trim()) return '分配中'
  if (!hasPatternWorkStarted(product)) {
    if (product.pattern_progress === '已分配') return '已分配'
    if (product.pattern_progress === '纸样中' || product.pattern_started_at) return '纸样中'
  }
  const stages = [
    ['first_pattern_progress', 'first_board_progress', 'first_board_maker', 'first_review_result'],
    ['second_pattern_progress', 'second_board_progress', 'second_board_maker', 'second_review_result'],
    ['third_pattern_progress', 'third_board_progress', 'third_board_maker', 'third_review_result'],
  ]
  for (let index = 0; index < stages.length; index += 1) {
    const [progressField, boardField, makerField, reviewField] = stages[index]
    const previousStage = index > 0 ? stages[index - 1] : null
    const previousReview = previousStage ? product[previousStage[3]] : ''
    let paperProgress = product[progressField] === '纸样已完成' ? '纸样已完成' : '纸样未完成'
    let boardProgress = product[boardField]
    let boardMaker = product[makerField]
    if (previousReview === '未通过-纸样修改') {
      boardProgress = '车板已完成'
      boardMaker = ''
    } else if (previousReview === '未通过-车板修改' || previousReview === '未通过-车样修改') {
      paperProgress = '纸样已完成'
      boardProgress = String(boardMaker || '').trim() ? '车板已完成' : '车板未完成'
    } else if (previousReview === '未通过-整件重做') {
      paperProgress ||= '纸样未完成'
      boardProgress = String(boardMaker || '').trim() ? '车板已完成' : '车板未完成'
    }
    const reviewResult = product[reviewField]
    if (reviewResult && reviewResult !== '取消') {
      if (reviewResult === '通过') return '已通过'
      continue
    }
    if (reviewResult === '取消') return '审核中'
    if (paperProgress !== '纸样已完成') return '纸样中'
    if (boardProgress !== '车板已完成' && !String(boardMaker || '').trim()) return '车板中'
    return '审核中'
  }
  return '审核中'
}

function progressDateMatches(product) {
  if (!patternProgressFrom.value && !patternProgressTo.value) return true
  const progress = totalProgressLabel(product)
  const timestamp = progress === '款式取消'
    ? product.style_progress_times?.['款式取消'] || product.updated_at
    : progress === '纸样取消'
      ? product.pattern_progress_times?.['纸样取消'] || product.updated_at
      : progress === '取消'
        ? product.style_progress_times?.['款式取消'] || product.pattern_progress_times?.['纸样取消'] || product.updated_at
        : product.pattern_progress_times?.[progress]
  if (!timestamp) return false
  const date = String(timestamp).slice(0, 10)
  return (!patternProgressFrom.value || date >= patternProgressFrom.value) && (!patternProgressTo.value || date <= patternProgressTo.value)
}

const patternMakers = computed(() => [...new Set(allProducts.value.map((product) => product.pattern_maker).filter(Boolean))])
const boardMakers = computed(() => [...new Set(products.value.flatMap((product) => [product.first_board_maker, product.second_board_maker, product.third_board_maker]).filter(Boolean))])
const overviewMetrics = computed(() => [
  { progress: '总纸样', value: products.value.length, icon: DocumentAdd, tone: 'teal' },
  ...patternProgressOptions.map((progress, index) => ({
    progress,
    value: products.value.filter((product) => matchesPatternProgress(product, progress)).length,
    icon: [Box, DocumentAdd, MagicStick, Refresh, CircleCheck, Search, Close, Close][index],
    tone: ['orange', 'cyan', 'blue', 'slate', 'teal', 'teal', 'red', 'red'][index],
  })),
])
const patternMakerCards = computed(() => {
  const names = new Set([...patternMakerOptions.value, ...patternMakers.value])
  return [...names].filter(Boolean).map((name) => {
    const assignedProducts = products.value.filter((product) => product.pattern_maker === name)
    return {
      name,
      total: assignedProducts.length,
      counts: {
        ...Object.fromEntries(patternProgressOptions.map((progress) => [progress, assignedProducts.filter((product) => matchesPatternProgress(product, progress)).length])),
      },
    }
  }).sort((left, right) => right.total - left.total || left.name.localeCompare(right.name, 'zh-CN'))
})
const filteredProducts = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  return products.value.filter((product) => {
    const matchesKeyword = !keyword || [product.sku, product.category, product.designer, product.pattern_maker, product.first_board_maker, product.second_board_maker, product.third_board_maker].some((value) => String(value || '').toLowerCase().includes(keyword))
    const matchesMaker = isBoardView.value
      ? (!boardMaker.value || [product.first_board_maker, product.second_board_maker, product.third_board_maker].includes(boardMaker.value))
      : (!patternMaker.value || product.pattern_maker === patternMaker.value)
    const matchesProgress = !patternProgress.value || (isBoardView.value && !isCanceledProduct(product)
      ? boardProgressLabel(product) === patternProgress.value
      : matchesPatternProgress(product, patternProgress.value))
    const matchesView = !isBoardView.value || hasBoardTask(product)
    return matchesKeyword && matchesMaker && matchesProgress && matchesView && progressDateMatches(product)
  })
})

function resetFilters() {
  search.value = ''
  patternMaker.value = ''
  boardMaker.value = ''
  patternProgress.value = ''
  patternProgressFrom.value = ''
  patternProgressTo.value = ''
  const query = { ...route.query }
  delete query.pattern_maker
  delete query.board_maker
  delete query.pattern_progress
  delete query.progress_from
  delete query.progress_to
  router.replace({ path: route.path, query })
}

function openPatternDetail(row) {
  const query = {
    sku: row.sku,
    return_to: route.fullPath,
    return_search: search.value,
    return_pattern_view: route.query.pattern_view || '',
    return_pattern_progress: patternProgress.value,
    return_pattern_maker: patternMaker.value,
    return_board_maker: boardMaker.value,
    return_progress_from: patternProgressFrom.value,
    return_progress_to: patternProgressTo.value,
  }
  router.push({ path: `/back/patterns/${encodeURIComponent(row.id)}`, query })
}

function openProgressList(progress, maker = '') {
  const query = { pattern_view: 'paper' }
  if (progress !== '总纸样') query.pattern_progress = progress
  if (maker) query.pattern_maker = maker
  router.push({ path: '/back/patterns', query })
}

function openMakerProgress(maker, progress) {
  const query = { pattern_view: 'paper', pattern_maker: maker }
  if (progress !== '总纸样') query.pattern_progress = progress
  router.push({ path: '/back/patterns', query })
}

function hasBoardTask(product) {
  return Boolean(product.first_board_maker || product.second_board_maker || product.third_board_maker || totalProgressLabel(product) === '车板中')
}

function boardMakerName(product) {
  return product.first_board_maker || product.second_board_maker || product.third_board_maker || '待分配'
}

function boardProgressLabel(product) {
  const rounds = [
    ['first_board_progress', 'first_board_maker'],
    ['second_board_progress', 'second_board_maker'],
    ['third_board_progress', 'third_board_maker'],
  ]
  const current = rounds.find(([progress, maker]) => product[progress] !== '车板已完成' || product[maker])
  if (!current) return '车板已完成'
  return product[current[0]] || (product[current[1]] ? '车板已完成' : '车板未完成')
}

function patternProgressTone(label) {
  if (label === '已通过' || label === '车板已完成') return 'is-complete'
  if (label === '纸样取消' || label === '款式取消' || label === '取消') return 'is-cancelled'
  if (label === '纸样中' || label === '车板中' || label === '审核中') return 'is-active'
  return 'is-pending'
}

function patternProgressLabel(label) {
  if (label === '已通过' || label === '车板已完成') return '已完成'
  if (label === '纸样取消' || label === '款式取消' || label === '取消') return label
  return label || '—'
}

async function hydrateMissingReviewOpinions(rows) {
  const rowsNeedingDetails = rows.filter((row) => (
    (hasReviewFollowup(row.first_review_result) && !Object.prototype.hasOwnProperty.call(row, 'first_review_opinion_image_url'))
    || (hasReviewFollowup(row.second_review_result) && !Object.prototype.hasOwnProperty.call(row, 'second_review_opinion_image_url'))
  ))
  await Promise.all(rowsNeedingDetails.map(async (row) => {
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(row.id)}`)
      if (response.ok) Object.assign(row, await response.json())
    } catch {
      // Keep the list usable if an optional review-image refresh fails.
    }
  }))
}

async function loadPatterns() {
  loading.value = true
  try {
    const firstResponse = await fetch('/api/products?page=1&pageSize=100')
    const firstResult = await firstResponse.json()
    if (!firstResponse.ok) throw new Error(firstResult.message || '纸样列表加载失败')
    const rows = [...(firstResult.data || [])]
    const pages = Math.ceil((Number(firstResult.total) || 0) / 100)
    for (let page = 2; page <= pages; page += 1) {
      const response = await fetch(`/api/products?page=${page}&pageSize=100`)
      const result = await response.json()
      if (!response.ok) throw new Error(result.message || '纸样列表加载失败')
      rows.push(...(result.data || []))
    }
    await hydrateMissingReviewOpinions(rows)
    allProducts.value = rows
    const makersResponse = await fetch('/api/pattern-makers')
    const makersResult = await makersResponse.json()
    if (!makersResponse.ok) throw new Error(makersResult.message || '纸样师名单加载失败')
    patternMakerOptions.value = makersResult.data || []
  } catch (error) {
    allProducts.value = []
    ElMessage.error(error.message || '纸样列表加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  window.addEventListener('list-display-settings-updated', handleListDisplaySettingsUpdated)
  search.value = typeof route.query.search === 'string' ? route.query.search : ''
  patternMaker.value = typeof route.query.pattern_maker === 'string' ? route.query.pattern_maker : ''
  boardMaker.value = typeof route.query.board_maker === 'string' ? route.query.board_maker : ''
  if (typeof route.query.pattern_progress === 'string' && activeProgressOptions.value.includes(route.query.pattern_progress)) patternProgress.value = route.query.pattern_progress
  patternProgressFrom.value = typeof route.query.progress_from === 'string' ? route.query.progress_from : ''
  patternProgressTo.value = typeof route.query.progress_to === 'string' ? route.query.progress_to : patternProgressFrom.value
  loadPatterns()
})
onBeforeUnmount(() => window.removeEventListener('list-display-settings-updated', handleListDisplaySettingsUpdated))
watch(() => route.query.pattern_maker, (value) => {
  patternMaker.value = typeof value === 'string' ? value : ''
})
watch(() => route.query.pattern_progress, (value) => {
  const nextValue = typeof value === 'string' && activeProgressOptions.value.includes(value) ? value : ''
  patternProgress.value = nextValue
})
watch(isBoardView, (boardView) => {
  if (patternProgress.value && !(boardView ? ['车板未完成', '车板已完成', '款式取消'] : patternProgressOptions).includes(patternProgress.value)) patternProgress.value = ''
})
watch(() => route.query.pattern_maker, (value) => {
  patternMaker.value = typeof value === 'string' ? value : ''
})
watch(() => route.query.board_maker, (value) => {
  boardMaker.value = typeof value === 'string' ? value : ''
})
watch(() => [route.query.progress_from, route.query.progress_to], ([from, to]) => {
  patternProgressFrom.value = typeof from === 'string' ? from : ''
  patternProgressTo.value = typeof to === 'string' ? to : patternProgressFrom.value
})
</script>

<template>
  <div class="pattern-management-page">
    <section v-if="isOverview" class="page-heading pattern-heading">
      <div>
        <h1>纸样面板</h1>
      </div>
      <el-button :loading="loading" @click="loadPatterns"><el-icon><Refresh /></el-icon>刷新</el-button>
    </section>

    <section v-if="isOverview" class="pattern-dashboard" aria-label="纸样面板进度总览">
      <div class="pattern-dashboard-metrics">
        <button v-for="metric in overviewMetrics" :key="metric.progress" type="button" class="pattern-dashboard-metric" :class="`tone-${metric.tone}`" @click="openProgressList(metric.progress)">
          <span class="pattern-dashboard-metric-label">{{ metric.progress }}</span>
          <span class="pattern-dashboard-metric-icon"><el-icon><component :is="metric.icon" /></el-icon></span>
          <strong>{{ loading ? '—' : metric.value }}</strong>
        </button>
      </div>
      <div v-if="loading" class="pattern-maker-dashboard pattern-maker-loading"><article v-for="index in 3" :key="index" class="pattern-maker-card"><el-skeleton animated /></article></div>
      <div v-else-if="patternMakerCards.length" class="pattern-maker-dashboard">
        <article v-for="card in patternMakerCards" :key="card.name" class="pattern-maker-card">
          <div class="pattern-maker-card-heading"><span class="pattern-maker-avatar"><el-icon><UserFilled /></el-icon></span><span class="pattern-maker-card-identity"><strong>{{ card.name }}</strong></span></div>
          <div class="pattern-maker-progress-list">
            <button v-for="progress in ['总纸样', ...patternProgressOptions.filter((item) => item !== '分配中')]" :key="progress" type="button" @click="openMakerProgress(card.name, progress)"><span>{{ progress }}</span><strong>{{ progress === '总纸样' ? card.total : card.counts[progress] }}</strong></button>
          </div>
        </article>
      </div>
      <el-empty v-else description="暂无纸样师数据" :image-size="72" />
    </section>

    <section v-if="!isOverview" class="page-heading pattern-heading">
      <div><h1>{{ isBoardView ? '车板' : '纸样' }}</h1></div>
      <el-button :loading="loading" @click="loadPatterns"><el-icon><Refresh /></el-icon>刷新</el-button>
    </section>

    <section v-if="!isOverview" class="panel pattern-toolbar">
      <el-input v-model="search" class="pattern-search" clearable :placeholder="isBoardView ? '搜索款号/品类/设计师/车板师' : '搜索款号/品类/设计师/纸样师'">
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
      <el-select v-if="isBoardView" v-model="boardMaker" clearable class="pattern-maker-filter" placeholder="全部车板师">
        <el-option v-for="maker in boardMakers" :key="maker" :label="maker" :value="maker" />
      </el-select>
      <el-select v-else v-model="patternMaker" clearable class="pattern-maker-filter" placeholder="全部纸样师">
        <el-option v-for="maker in patternMakers" :key="maker" :label="maker" :value="maker" />
      </el-select>
      <el-select v-model="patternProgress" clearable class="pattern-progress-filter" placeholder="全部进度">
        <el-option v-for="item in activeProgressOptions" :key="item" :label="item" :value="item" />
      </el-select>
      <el-button type="primary" plain><el-icon><Search /></el-icon>查询</el-button>
      <el-button @click="resetFilters"><el-icon><Refresh /></el-icon>重置</el-button>
    </section>

    <section v-if="!isOverview" class="panel pattern-table-panel">
      <div v-if="loading" class="pattern-table-skeleton" aria-label="正在加载纸样数据">
        <el-skeleton :rows="7" animated />
      </div>
      <el-table v-else :data="filteredProducts" class="pattern-table" :class="{ 'pattern-table-paper': !isBoardView }" row-key="id" :fit="false" @row-click="openPatternDetail">
        <el-table-column v-if="showPatternField('style')" label="款式" width="240">
          <template #default="scope">
            <div class="pattern-product-cell">
              <el-image v-if="firstImage(scope.row.image_url)" :src="firstImage(scope.row.image_url)" :preview-src-list="[firstImage(scope.row.image_url)]" preview-teleported class="pattern-product-image" fit="cover" @click.stop />
              <div v-else class="pattern-product-image pattern-product-placeholder"><el-icon><Box /></el-icon></div>
              <strong class="pattern-cell-ellipsis">{{ scope.row.sku || '—' }}</strong>
            </div>
          </template>
        </el-table-column>
        <el-table-column v-if="showPatternField('release_date')" label="上新日期" width="120"><template #default="scope"><span class="pattern-cell-ellipsis">{{ scope.row.release_date ? String(scope.row.release_date).slice(0, 10) : '—' }}</span></template></el-table-column>
        <el-table-column v-if="showPatternField('category')" label="品类" width="120"><template #default="scope"><span class="pattern-cell-ellipsis">{{ scope.row.category || '—' }}</span></template></el-table-column>
        <el-table-column v-if="showPatternField('link')" label="链路" width="120"><template #default="scope"><span class="pattern-cell-ellipsis">{{ scope.row.link || '—' }}</span></template></el-table-column>
        <el-table-column v-if="showPatternField('designer')" label="设计师" width="120"><template #default="scope"><span class="pattern-cell-ellipsis">{{ scope.row.designer || '—' }}</span></template></el-table-column>
        <el-table-column v-if="showPatternField('priority')" label="优先级" width="120"><template #default="scope"><span class="pattern-cell-ellipsis">{{ priorityLabel(scope.row.priority) }}</span></template></el-table-column>
        <el-table-column v-if="showPatternField('maker')" :label="isBoardView ? '车板师' : '纸样师'" width="120"><template #default="scope"><span class="pattern-cell-ellipsis">{{ isBoardView ? boardMakerName(scope.row) : (scope.row.pattern_maker || '—') }}</span></template></el-table-column>
        <el-table-column v-if="showPatternField('color')" label="颜色" width="120"><template #default="scope"><span class="pattern-cell-ellipsis">{{ scope.row.color || '—' }}</span></template></el-table-column>
        <el-table-column v-if="isBoardView && showPatternField('progress')" label="车板进度" width="120" class-name="progress-column"><template #default="scope"><span class="progress-display" :class="patternProgressTone(boardProgressLabel(scope.row))" :title="boardProgressLabel(scope.row)"><span class="progress-display-label">{{ patternProgressLabel(boardProgressLabel(scope.row)) }}</span></span></template></el-table-column>
        <el-table-column v-if="!isBoardView && showPatternField('progress')" label="当前进度" width="120" class-name="progress-column"><template #default="scope"><span class="progress-display" :class="patternProgressTone(totalProgressLabel(scope.row))" :title="totalProgressLabel(scope.row)"><span class="progress-display-label">{{ patternProgressLabel(totalProgressLabel(scope.row)) }}</span></span></template></el-table-column>
        <el-table-column v-if="!isBoardView && showPatternField('notes')" label="打板注意事项/审核意见" width="120">
          <template #default="scope">
            <div class="pattern-round-text-cell">
              <el-image v-if="firstImage(activePatternStage(scope.row).contextImage)" :src="firstImage(activePatternStage(scope.row).contextImage)" :preview-src-list="[firstImage(activePatternStage(scope.row).contextImage)]" preview-teleported class="pattern-round-image" fit="cover" />
              <span v-else class="pattern-context-full-text">{{ activePatternStage(scope.row).contextText || '—' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column v-if="!isBoardView && showPatternField('review')" label="审核结果" width="120"><template #default="scope"><div v-if="activePatternStage(scope.row).reviewResult" class="pattern-round-text-cell"><span>{{ activePatternStage(scope.row).reviewResult }}</span></div></template></el-table-column>
        <el-table-column v-if="isBoardView && showPatternField('notes')" label="打板注意事项" width="120"><template #default="scope"><span class="pattern-cell-ellipsis">{{ scope.row.pattern_notes || '—' }}</span></template></el-table-column>
        <el-table-column v-for="field in patternExtraFields" :key="`pattern-extra-${field.key}`" :label="field.label" width="120"><template #default="scope"><span class="pattern-cell-ellipsis">{{ patternFieldValue(scope.row, field.key) }}</span></template></el-table-column>
        <template #empty><el-empty description="暂无纸样数据" /></template>
      </el-table>
    </section>

  </div>
</template>

<style scoped>
.pattern-management-page { min-width: 0; }
.pattern-maker-card-heading { width: 100%; padding: 0; border: 0; color: inherit; background: transparent; text-align: left; cursor: pointer; }
.pattern-maker-card-identity { display: flex; min-width: 0; flex-direction: column; gap: 4px; }
.pattern-dashboard{display:flex;flex-direction:column;gap:9px;margin-bottom:16px}.pattern-dashboard-metrics{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:9px}.pattern-dashboard-metric{position:relative;min-width:0;min-height:78px;padding:14px 13px 11px;border:1px solid #edf0f5;border-radius:6px;background:#fff;box-shadow:0 3px 11px rgba(25,49,89,.035);text-align:left;cursor:pointer;transition:border-color .16s ease,box-shadow .16s ease,transform .16s ease}.pattern-dashboard-metric:hover,.pattern-dashboard-metric:focus-visible{border-color:#9fc5fb;box-shadow:0 8px 20px rgba(37,99,235,.1);outline:none;transform:translateY(-1px)}.pattern-dashboard-metric-label{display:block;color:#78859a;font-size:11px}.pattern-dashboard-metric strong{display:block;margin-top:6px;color:#1392a2;font-size:18px;line-height:1}.pattern-dashboard-metric:nth-child(2) strong{color:#1a9da9}.pattern-dashboard-metric:nth-child(3) strong{color:#35a8b4}.pattern-dashboard-metric:nth-child(4) strong{color:#437de2}.pattern-dashboard-metric:nth-child(5) strong{color:#6483ba}.pattern-dashboard-metric-icon{position:absolute;top:13px;right:13px;display:grid;width:29px;height:29px;place-items:center;border-radius:50%;font-size:15px}.pattern-dashboard-metric.tone-orange .pattern-dashboard-metric-icon{color:#f18b2f;background:#fff0dc}.pattern-dashboard-metric.tone-teal .pattern-dashboard-metric-icon{color:#31a9ad;background:#e4f6f5}.pattern-dashboard-metric.tone-cyan .pattern-dashboard-metric-icon{color:#35a8b4;background:#e4f7f7}.pattern-dashboard-metric.tone-blue .pattern-dashboard-metric-icon{color:#5186e6;background:#e9f0ff}.pattern-dashboard-metric.tone-slate .pattern-dashboard-metric-icon{color:#7090be;background:#edf2f9}.pattern-dashboard-metric.tone-red .pattern-dashboard-metric-icon{color:#e44c4c;background:#ffebeb}.pattern-maker-dashboard{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.pattern-maker-card{min-width:0;padding:16px;border:1px solid #edf0f5;border-radius:6px;background:#fff;box-shadow:0 3px 11px rgba(25,49,89,.035)}.pattern-maker-card-heading{display:flex;align-items:center;gap:11px;min-height:48px}.pattern-maker-avatar{display:grid;width:45px;height:45px;flex:0 0 45px;place-items:center;border-radius:50%;color:#fff;background:#e4f0ff;font-size:23px}.pattern-maker-card-heading>div{display:flex;min-width:0;flex-direction:column;gap:4px}.pattern-maker-card-heading strong{overflow:hidden;color:#1265d6;font-size:14px;font-weight:650;text-overflow:ellipsis;white-space:nowrap}.pattern-maker-card-heading small{color:#8b96a5;font-size:11px}.pattern-maker-progress-list{display:grid;gap:0;margin-top:14px;padding:3px 14px;border-radius:4px;background:#f4f7fb}.pattern-maker-progress-list button{display:flex;min-width:0;min-height:35px;align-items:center;justify-content:space-between;gap:8px;padding:0;border:0;border-bottom:1px solid #e8edf4;color:#8490a6;background:transparent;text-align:left;font-size:12px;cursor:pointer}.pattern-maker-progress-list button:last-child{border-bottom:0}.pattern-maker-progress-list button:hover{color:#1677ff}.pattern-maker-progress-list strong{color:#124189;font-size:15px}.pattern-maker-loading .pattern-maker-card{min-height:260px}
.pattern-heading { align-items: flex-end; margin-bottom: 27px; }
.pattern-heading h1 { color: #111827; font-size: 24px; font-weight: 700; letter-spacing: -.02em; }
.pattern-heading :deep(.el-button) { height: 36px; border-radius: 5px; }
.pattern-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; padding: 12px 16px; }
.pattern-search { width: 270px; }
.pattern-maker-filter { width: 130px; }.pattern-progress-filter { width: 110px; }
.pattern-toolbar :deep(.el-input__wrapper), .pattern-toolbar :deep(.el-select__wrapper) { box-shadow: 0 0 0 1px #e2e7ed inset; }
.pattern-table-panel { min-width: 0; padding-bottom: 12px; overflow: hidden; border: 1px solid rgba(226, 232, 240, .8); border-radius: 18px; box-shadow: 0 10px 28px rgba(15, 23, 42, .04); }
.pattern-table-heading { margin-bottom: 16px; }
.pattern-table-skeleton { min-height: 520px; padding: 14px 16px 20px; }
.pattern-table-skeleton :deep(.el-skeleton__item) { height: 18px; margin-bottom: 20px; }
.pattern-table { width: 100%; min-width: 0; --el-table-border-color: #edf0f3; --el-table-header-bg-color: #fafbfc; --el-table-row-hover-bg-color: #fffaf8; color: #596574; font-size: 12px; }
.pattern-table :deep(.el-table__inner-wrapper::before) { display: none; }
.pattern-table :deep(.el-table__header-wrapper th) { height: 42px; padding: 12px 14px; color: #475569; background: #f8fafc !important; font-weight: 700; }
.pattern-table :deep(.el-table__body-wrapper td) { height: 68px; padding: 14px; border-bottom-color: #f1f5f9; }
.pattern-table :deep(.el-table__body tr:hover > td) { background: #fbfdff !important; }
.pattern-table :deep(.el-table__body tr) { cursor: pointer; }
.pattern-table :deep(.cell) { overflow: hidden; line-height: 20px; white-space: normal; text-overflow: clip; overflow-wrap: anywhere; word-break: break-word; }
.pattern-table :deep(td.progress-column .cell) { overflow: visible; text-overflow: clip; }
.progress-display { box-sizing: border-box; display: inline-flex; width: 83px; min-width: 83px; height: 24px; min-height: 24px; flex: none; align-items: center; justify-content: center; padding: 3px 9px; border: 1px solid #cfe1fb; border-radius: 4px; color: #1769c2; background: #f5f9ff; font-size: 12px; line-height: 18px; text-align: center; white-space: normal; overflow-wrap: anywhere; }
.progress-display.is-complete { border-color: #b7e2c1; color: #198754; background: #f2fbf4; }
.progress-display.is-cancelled { border-color: #f2c1c1; color: #c84242; background: #fff5f5; }
.progress-display.is-active { border-color: #bcd7fb; color: #1769c2; background: #f7fbff; }
.progress-display.is-pending { border-color: #d8e0eb; color: #6b7a90; background: #fbfcfe; }
.progress-display-label { display: inline-block; }
.pattern-table :deep(.el-table__header-wrapper table), .pattern-table :deep(.el-table__body-wrapper table) { width: 100% !important; min-width: 1230px; table-layout: fixed; }
.pattern-table-paper :deep(.el-table__header-wrapper table), .pattern-table-paper :deep(.el-table__body-wrapper table) { min-width: 0; }
.pattern-table-paper :deep(.el-table__header-wrapper th), .pattern-table-paper :deep(.el-table__body-wrapper td) { padding-right: 6px; padding-left: 6px; }
.pattern-table-paper :deep(.cell) { white-space: normal; }
.pattern-table :deep(.pattern-operation-column .cell) { overflow: visible; }
.pattern-table :deep(.pattern-operation-column .el-button) { white-space: nowrap; }
.pattern-product-cell { display: flex; min-width: 0; align-items: center; gap: 10px; }
.pattern-product-image { display: block; width: 40px; height: 40px; flex: 0 0 40px; border-radius: 7px; object-fit: cover; }
.pattern-product-placeholder { display: grid; place-items: center; color: #94a3b8; background: #f1f5f9; }
.pattern-cell-ellipsis { min-width: 0; overflow: hidden; text-overflow: clip; white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
.pattern-round-image-cell, .pattern-round-text-cell { display: flex; min-width: 0; align-items: flex-start; flex-direction: column; gap: 3px; }
.pattern-context-full-text { min-width: 0; color: #334155; line-height: 1.5; white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
.pattern-round-image-cell { min-height: 40px; }
.pattern-round-image { display: block; width: 36px; height: 36px; flex: 0 0 36px; border-radius: 5px; cursor: zoom-in; }
.pattern-round-image-cell :deep(.el-upload) { flex: 0 0 auto; }
.pattern-list-image-preview { position: relative; width: 36px; height: 36px; flex: 0 0 36px; }
.pattern-list-image-remove { position: absolute; top: 2px; right: 2px; display: grid; width: 16px; height: 16px; place-items: center; padding: 0; border: 0; border-radius: 50%; color: #fff; background: rgba(15, 23, 42, .72); opacity: 0; cursor: pointer; transition: opacity .15s ease; }
.pattern-list-image-preview:hover .pattern-list-image-remove, .pattern-list-image-remove:focus-visible { opacity: 1; }
.pattern-list-image-remove :deep(svg) { width: 10px; height: 10px; }
.pattern-list-image-upload { display: grid; width: 36px; height: 36px; place-items: center; padding: 0; border: 1px dashed #cbd5e1; border-radius: 5px; color: #66758a; background: #f8fafc; cursor: pointer; }
.pattern-list-image-upload:hover { border-color: #409eff; color: #409eff; background: #f3f8ff; }
.pattern-list-image-upload:disabled, .pattern-list-image-remove:disabled { opacity: .55; cursor: not-allowed; }
.progress-dialog-select { width: 100%; }
@media (max-width: 900px) {
  .pattern-heading { align-items: flex-start; flex-direction: column; }
  .pattern-dashboard-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}.pattern-maker-dashboard{grid-template-columns:repeat(2,minmax(0,1fr))}
  .pattern-toolbar { flex-wrap: wrap; }
  .pattern-search { flex: 1 1 270px; }
  .pattern-table { width: 1230px; }
  .pattern-table-paper { width: 990px; }
  .pattern-table-panel { overflow-x: auto; }
}
@media (max-width: 700px) {
  .pattern-dashboard-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .pattern-maker-dashboard { grid-template-columns: 1fr; }
}
.pattern-table-panel { border-color: var(--ui-border); border-radius: var(--ui-radius-lg); box-shadow: var(--ui-shadow-xs); }
.pattern-dashboard-metric, .pattern-maker-card { box-shadow: none; }
.pattern-dashboard-metric:hover, .pattern-dashboard-metric:focus-visible { box-shadow: var(--ui-shadow-sm); transform: none; }
.pattern-toolbar :deep(.el-input__wrapper), .pattern-toolbar :deep(.el-select__wrapper) { border-radius: var(--ui-radius-md); box-shadow: 0 0 0 1px var(--ui-border-strong) inset; }
</style>
