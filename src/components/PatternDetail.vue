<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ArrowLeft, Close, Download, Upload } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { getAuthHeaders } from '../auth.js'
import { getStyleProgressSteps } from '../styleProgress.js'

const route = useRoute()
const router = useRouter()
const uploadHeaders = getAuthHeaders()
const loading = ref(true)
const saving = ref(false)
const startingPattern = ref(false)
const completingPattern = ref(false)
const sizeChartUploading = ref(false)
const finalPatternUploading = ref(false)
const patternMakerOptions = ref([])
const previewImageUrl = ref('')
const initialSnapshot = ref('')
const allowLeave = ref(false)
const product = reactive({
  id: '', sku: '', category: '', designer: '', link: '', pattern_maker: '', priority: '', size: '', is_canceled: false, pattern_progress: '分配中', pattern_started_at: '', first_pattern_progress: '纸样未完成', first_pattern_image_url: '', first_board_progress: '', first_board_maker: '', first_review_result: '', first_review_opinion_image_url: '', second_pattern_progress: '', second_pattern_image_url: '', second_board_progress: '', second_board_maker: '', second_review_result: '', second_review_opinion_image_url: '', third_pattern_progress: '', third_pattern_image_url: '', third_board_progress: '', third_board_maker: '', third_review_result: '', third_review_opinion_image_url: '', preproduction_sample: '', preproduction_board_progress: '', preproduction_board_maker: '', pattern_notes: '', image_url: '', design_image_url: '', size_chart_url: '', final_pattern_image_url: '', final_pattern_filename: '', price: 0, stock: 0, status: 'active',
})
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
const totalProgressSteps = [
  { label: '分配中', value: '分配中' },
  { label: '已分配', value: '已分配' },
  { label: '纸样中', value: '纸样中' },
  { label: '车板中', value: '车板中' },
  { label: '审核中', value: '审核中' },
  { label: '已通过', value: '已通过' },
]
const isProductCanceled = computed(() => product.is_canceled === true || product.is_canceled === 1 || product.is_canceled === '1' || product.is_canceled === 'true')
const hasPatternStage = computed(() => getStyleProgressSteps(product.link).some((step) => ['待打板', '打版中', '打版', '打板'].includes(step))
  || (['AI款', 'AI'].includes(String(product.link || '').trim()) && getStyleProgressSteps(product.link).includes('打板中')))
const hasReviewFollowup = (result) => Boolean(result && result !== '通过' && result !== '取消')
const isPaperRevision = (result) => result === '未通过-纸样修改'
const isBoardRevision = (result) => result === '未通过-车板修改' || result === '未通过-车样修改'
const isGarmentRedo = (result) => result === '未通过-整件重做'
function hasPatternWorkStarted(data) {
  return Boolean(
    data.pattern_started_at
    || ['纸样中', '车板中', '审核中', '已通过'].includes(data.pattern_progress)
    || data.first_pattern_image_url || data.second_pattern_image_url || data.third_pattern_image_url
    || data.first_pattern_progress === '纸样已完成' || data.second_pattern_progress === '纸样已完成' || data.third_pattern_progress === '纸样已完成'
    || data.first_board_progress === '车板已完成' || data.second_board_progress === '车板已完成' || data.third_board_progress === '车板已完成'
    || data.first_board_maker || data.second_board_maker || data.third_board_maker
    || data.first_review_result || data.second_review_result || data.third_review_result,
  )
}
function calculateTotalProgress(data) {
  if (!String(data.pattern_maker || '').trim()) return '分配中'
  if (!hasPatternWorkStarted(data)) {
    if (data.pattern_progress === '已分配') return '已分配'
    if (data.pattern_progress === '纸样中' || data.pattern_started_at) return '纸样中'
  }
  const stages = [
    ['first_pattern_progress', 'first_pattern_image_url', 'first_board_progress', 'first_board_maker', 'first_review_result'],
    ['second_pattern_progress', 'second_pattern_image_url', 'second_board_progress', 'second_board_maker', 'second_review_result'],
    ['third_pattern_progress', 'third_pattern_image_url', 'third_board_progress', 'third_board_maker', 'third_review_result'],
  ]
  for (let index = 0; index < stages.length; index += 1) {
    const [progressField, imageField, boardField, makerField, reviewField] = stages[index]
    const previousStage = index > 0 ? stages[index - 1] : null
    const previousReview = previousStage ? data[previousStage[4]] : ''
    let paperProgress = data[progressField] || '纸样未完成'
    let boardProgress = data[boardField]
    if (isPaperRevision(previousReview)) {
      boardProgress = '车板已完成'
    } else if (isBoardRevision(previousReview)) {
      paperProgress = '纸样已完成'
      boardProgress = String(data[makerField] || '').trim() ? '车板已完成' : '车板未完成'
    } else if (isGarmentRedo(previousReview)) {
      paperProgress ||= '纸样未完成'
    }
    const reviewResult = data[reviewField]
    if (reviewResult && reviewResult !== '取消') {
      if (reviewResult === '通过') return '已通过'
      continue
    }
    if (reviewResult === '取消') return '审核中'
    if (paperProgress !== '纸样已完成') return '纸样中'
    const boardDone = boardProgress === '车板已完成'
    if (!boardDone) return '车板中'
    return '审核中'
  }
  return '审核中'
}

const totalProgressLabel = computed(() => calculateTotalProgress(product))
const isPatternCanceled = computed(() => !isProductCanceled.value && !hasPatternStage.value && Boolean(String(product.pattern_maker || '').trim()) && hasPatternWorkStarted(product))
const totalProgressIndex = computed(() => totalProgressSteps.findIndex((step) => step.value === totalProgressLabel.value))
function syncTotalProgress() { product.pattern_progress = totalProgressLabel.value }

function ensurePatternProgressDefaults() {
  for (const prefix of ['first', 'second', 'third']) {
    product[`${prefix}_pattern_progress`] ||= '纸样未完成'
  }
}

const activePatternPrefix = computed(() => {
  if (hasReviewFollowup(product.second_review_result)) return 'third'
  if (hasReviewFollowup(product.first_review_result)) return 'second'
  return 'first'
})
const activePatternProgress = computed(() => product[`${activePatternPrefix.value}_pattern_progress`] || '纸样未完成')
const isPatternVersionReviewed = (prefix) => Boolean(product[`${prefix}_review_result`])
const canEditBoardMaker = (prefix) => {
  if (isPatternVersionReviewed(prefix)) return false
  if (prefix === 'first') return true
  const previousReview = product[prefix === 'second' ? 'first_review_result' : 'second_review_result']
  return isBoardRevision(previousReview) || isGarmentRedo(previousReview)
}

function syncFollowupProgress(data, prefix, reviewResult) {
  if (isPaperRevision(reviewResult)) {
    data[`${prefix}_pattern_progress`] ||= '纸样未完成'
    data[`${prefix}_board_maker`] = ''
    data[`${prefix}_board_progress`] = '车板已完成'
  } else if (isBoardRevision(reviewResult)) {
    const previousPrefix = prefix === 'second' ? 'first' : 'second'
    data[`${prefix}_pattern_image_url`] ||= data[`${previousPrefix}_pattern_image_url`] || ''
    data[`${prefix}_pattern_progress`] ||= '纸样未完成'
    data[`${prefix}_board_progress`] = String(data[`${prefix}_board_maker`] || '').trim() ? '车板已完成' : '车板未完成'
  } else if (isGarmentRedo(reviewResult)) {
    data[`${prefix}_pattern_progress`] ||= '纸样未完成'
    data[`${prefix}_board_progress`] = String(data[`${prefix}_board_maker`] || '').trim() ? '车板已完成' : '车板未完成'
  }
}

function normalizeProgressData(data) {
  if (!data.first_review_result) {
    data.first_board_progress = String(data.first_board_maker || '').trim() ? '车板已完成' : '车板未完成'
  }
  if (!data.second_review_result) syncFollowupProgress(data, 'second', data.first_review_result)
  if (!data.third_review_result) syncFollowupProgress(data, 'third', data.second_review_result)
  for (const prefix of ['second', 'third']) {
    if (data[`${prefix}_review_result`]) continue
    const previousReview = data[prefix === 'second' ? 'first_review_result' : 'second_review_result']
    if (isPaperRevision(previousReview)) data[`${prefix}_board_progress`] = '车板已完成'
    else if (isBoardRevision(previousReview)) data[`${prefix}_board_progress`] = String(data[`${prefix}_board_maker`] || '').trim() ? '车板已完成' : '车板未完成'
    else if (isGarmentRedo(previousReview)) data[`${prefix}_board_progress`] = String(data[`${prefix}_board_maker`] || '').trim() ? '车板已完成' : '车板未完成'
  }
  data.preproduction_board_progress = String(data.preproduction_board_maker || '').trim() ? '车板已完成' : '车板未完成'
  data.pattern_progress = calculateTotalProgress(data)
  return data
}

const formSnapshot = () => JSON.stringify({ pattern_progress: product.pattern_progress || '分配中', pattern_started_at: product.pattern_started_at || '', first_pattern_progress: product.first_pattern_progress || '', first_pattern_image_url: product.first_pattern_image_url || '', first_board_progress: product.first_board_progress || '', first_board_maker: product.first_board_maker || '', first_review_result: product.first_review_result || '', first_review_opinion_image_url: product.first_review_opinion_image_url || '', second_pattern_progress: product.second_pattern_progress || '', second_pattern_image_url: product.second_pattern_image_url || '', second_board_progress: product.second_board_progress || '', second_board_maker: product.second_board_maker || '', second_review_result: product.second_review_result || '', second_review_opinion_image_url: product.second_review_opinion_image_url || '', third_pattern_progress: product.third_pattern_progress || '', third_pattern_image_url: product.third_pattern_image_url || '', third_board_progress: product.third_board_progress || '', third_board_maker: product.third_board_maker || '', third_review_result: product.third_review_result || '', third_review_opinion_image_url: product.third_review_opinion_image_url || '', preproduction_board_progress: product.preproduction_board_progress || '', preproduction_board_maker: product.preproduction_board_maker || '', pattern_maker: product.pattern_maker || '', size_chart_url: product.size_chart_url || '', final_pattern_image_url: product.final_pattern_image_url || '', final_pattern_filename: product.final_pattern_filename || '' })
const hasUnsavedChanges = () => Boolean(initialSnapshot.value) && formSnapshot() !== initialSnapshot.value

function priorityLabel(priority) {
  return { low: '低', normal: '普通', high: '高' }[priority] || priority || '—'
}

function sizeLabel(size) {
  return String(size || '').split(',').map((item) => item.trim()).filter(Boolean).join('、') || '—'
}

function openImagePreview(url) {
  if (url) previewImageUrl.value = url
}

function closeImagePreview() {
  previewImageUrl.value = ''
}

function handlePreviewKeydown(event) {
  if (event.key === 'Escape') closeImagePreview()
}

function beforeSizeChartUpload(file) {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
    ElMessage.error('尺码表仅支持 JPG、PNG、WEBP 或 GIF 格式')
    return false
  }
  sizeChartUploading.value = true
  return true
}

function handleSizeChartUpload(result) {
  sizeChartUploading.value = false
  if (!result?.url) {
    ElMessage.error(result?.message || '尺码表上传失败')
    return
  }
  product.size_chart_url = result.url
  ElMessage.success('尺码表上传成功')
}

function handleSizeChartUploadError(error) {
  sizeChartUploading.value = false
  ElMessage.error(error?.message || '尺码表上传失败')
}

function removeSizeChart() {
  product.size_chart_url = ''
}

function isPrjFile(url) {
  return String(url || '').toLowerCase().split('?')[0].endsWith('.prj')
}

function beforeFinalPatternUpload(file) {
  const validImage = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)
  const validPrj = file.name?.toLowerCase().endsWith('.prj')
  if (!validImage && !validPrj) {
    ElMessage.error('最终纸样图仅支持 JPG、PNG、WEBP、GIF 或 PRJ 格式')
    return false
  }
  finalPatternUploading.value = true
  return true
}

function handleFinalPatternUpload(result) {
  finalPatternUploading.value = false
  if (!result?.url) {
    ElMessage.error(result?.message || '最终纸样图上传失败')
    return
  }
  product.final_pattern_image_url = result.url
  product.final_pattern_filename = result.name || fileNameFromUrl(result.url)
  ElMessage.success('最终纸样图上传成功')
}

function handleFinalPatternUploadError(error) {
  finalPatternUploading.value = false
  ElMessage.error(error?.message || '最终纸样图上传失败')
}

function removeFinalPattern() {
  product.final_pattern_image_url = ''
  product.final_pattern_filename = ''
}

function fileNameFromUrl(url) {
  return decodeURIComponent(String(url || '').split('/').pop().split('?')[0])
}

async function downloadFinalPattern() {
  try {
    const response = await fetch(product.final_pattern_image_url)
    if (!response.ok) throw new Error('文件下载失败')
    const blobUrl = URL.createObjectURL(await response.blob())
    const filename = decodeURIComponent(product.final_pattern_image_url.split('/').pop().split('?')[0]) || 'final-pattern.prj'
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = filename
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
  } catch (error) {
    ElMessage.error(error.message || '文件下载失败')
  }
}

async function loadPattern() {
  loading.value = true
  try {
    const response = await fetch('/api/products/' + encodeURIComponent(route.params.id))
    const result = await response.json()
    if (!response.ok) throw new Error(result.message || '纸样详情加载失败')
    Object.assign(product, result)
    product.pattern_progress = result.pattern_progress || '分配中'
    product.size = result.size || ''
    product.first_pattern_progress = result.first_pattern_progress || '纸样未完成'
    product.preproduction_board_maker = result.preproduction_board_maker || ''
    product.preproduction_board_progress = result.preproduction_board_progress || (product.preproduction_board_maker ? '车板已完成' : '车板未完成')
    ensurePatternProgressDefaults()
    ensurePatternProgressDefaults()
    Object.assign(product, normalizeProgressData({ ...product }))
    initialSnapshot.value = formSnapshot()
  } catch (error) {
    ElMessage.error(error.message || '纸样详情加载失败')
    router.push(patternReturnLocation())
  } finally {
    loading.value = false
  }
}

function patternReturnLocation() {
  const returnTo = typeof route.query.return_to === 'string' ? route.query.return_to : ''
  if (returnTo.startsWith('/back/')) {
    const resolved = router.resolve(returnTo)
    if (resolved.path === '/back/patterns') {
      const query = { ...resolved.query }
      const returnFields = {
        pattern_view: 'return_pattern_view',
        pattern_progress: 'return_pattern_progress',
        pattern_maker: 'return_pattern_maker',
        board_maker: 'return_board_maker',
        progress_from: 'return_progress_from',
        progress_to: 'return_progress_to',
        search: 'return_search',
      }
      for (const [key, source] of Object.entries(returnFields)) {
        const value = route.query[source]
        if (typeof value === 'string' && value) query[key] = value
        else delete query[key]
      }
      return { path: resolved.path, query }
    }
    return returnTo
  }
  return {
    path: '/back/patterns',
    query: {
      ...(route.query.return_pattern_view ? { pattern_view: route.query.return_pattern_view } : {}),
      ...(route.query.return_pattern_progress ? { pattern_progress: route.query.return_pattern_progress } : {}),
      ...(route.query.return_pattern_maker ? { pattern_maker: route.query.return_pattern_maker } : {}),
      ...(route.query.return_board_maker ? { board_maker: route.query.return_board_maker } : {}),
      ...(route.query.return_progress_from ? { progress_from: route.query.return_progress_from } : {}),
      ...(route.query.return_progress_to ? { progress_to: route.query.return_progress_to } : {}),
      ...(route.query.return_search ? { search: route.query.return_search } : {}),
    },
  }
}

async function loadPatternMakers() {
  try {
    const response = await fetch('/api/pattern-makers')
    const result = await response.json()
    if (response.ok) patternMakerOptions.value = result.data || []
  } catch {
    patternMakerOptions.value = []
  }
}

async function confirmStartPattern() {
  if (startingPattern.value || totalProgressLabel.value !== '已分配') return
  try {
    await ElMessageBox.confirm('是否进行纸样？', '开始纸样', {
      type: 'info',
      confirmButtonText: '确认进行',
      cancelButtonText: '暂不进行',
      distinguishCancelAndClose: true,
      lockScroll: false,
    })
  } catch {
    return
  }
  startingPattern.value = true
  try {
    const response = await fetch('/api/products/' + encodeURIComponent(product.id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ pattern_progress: '纸样中', pattern_started_at: new Date().toISOString() }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.message || '开始纸样失败')
    Object.assign(product, result)
    product.pattern_progress = result.pattern_progress || '纸样中'
    product.pattern_started_at = result.pattern_started_at || product.pattern_started_at
    initialSnapshot.value = formSnapshot()
    ElMessage.success('已进入纸样中')
  } catch (error) {
    ElMessage.error(error.message || '开始纸样失败')
  } finally {
    startingPattern.value = false
  }
}

async function completePattern() {
  if (completingPattern.value || totalProgressLabel.value !== '纸样中' || activePatternProgress.value === '纸样已完成' || isPatternVersionReviewed(activePatternPrefix.value)) return
  completingPattern.value = true
  const progressField = `${activePatternPrefix.value}_pattern_progress`
  product[progressField] = '纸样已完成'
  syncTotalProgress()
  try {
    const response = await fetch('/api/products/' + encodeURIComponent(product.id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ [progressField]: '纸样已完成', pattern_progress: totalProgressLabel.value }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.message || '纸样完成状态保存失败')
    Object.assign(product, result)
    syncTotalProgress()
    initialSnapshot.value = formSnapshot()
    ElMessage.success('纸样已完成')
  } catch (error) {
    product[progressField] = '纸样未完成'
    syncTotalProgress()
    ElMessage.error(error.message || '纸样完成状态保存失败')
  } finally {
    completingPattern.value = false
  }
}

async function savePattern() {
  const savedData = normalizeProgressData({ ...product })
  saving.value = true
  try {
    const response = await fetch('/api/products/' + encodeURIComponent(product.id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pattern_progress: savedData.pattern_progress, first_pattern_progress: savedData.first_pattern_progress || '', first_pattern_image_url: savedData.first_pattern_image_url || '', first_board_progress: savedData.first_board_progress || '', first_board_maker: savedData.first_board_maker || '', first_review_result: savedData.first_review_result || '', first_review_opinion_image_url: savedData.first_review_opinion_image_url || '', second_pattern_progress: savedData.second_pattern_progress || '', second_pattern_image_url: savedData.second_pattern_image_url || '', second_board_progress: savedData.second_board_progress || '', second_board_maker: savedData.second_board_maker || '', second_review_result: savedData.second_review_result || '', second_review_opinion_image_url: savedData.second_review_opinion_image_url || '', third_pattern_progress: savedData.third_pattern_progress || '', third_pattern_image_url: savedData.third_pattern_image_url || '', third_board_progress: savedData.third_board_progress || '', third_board_maker: savedData.third_board_maker || '', third_review_result: savedData.third_review_result || '', third_review_opinion_image_url: savedData.third_review_opinion_image_url || '', preproduction_board_progress: savedData.preproduction_board_progress || '', preproduction_board_maker: savedData.preproduction_board_maker || '', pattern_maker: savedData.pattern_maker || '', size_chart_url: savedData.size_chart_url || '', final_pattern_image_url: savedData.final_pattern_image_url || '', final_pattern_filename: savedData.final_pattern_filename || '', price: savedData.price ?? 0, stock: savedData.stock ?? 0, status: savedData.status || 'active' }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.message || '保存纸样失败')
    Object.assign(product, savedData)
    initialSnapshot.value = formSnapshot()
    ElMessage.success('纸样信息已保存')
    return true
  } catch (error) {
    ElMessage.error(error.message || '保存纸样失败')
    return false
  } finally {
    saving.value = false
  }
}

async function confirmLeave() {
  if (allowLeave.value || !hasUnsavedChanges()) return true
  try {
    await ElMessageBox.confirm('纸样信息已修改，是否保存后退出？', '未保存的修改', {
      type: 'warning',
      confirmButtonText: '保存并退出',
      cancelButtonText: '不保存退出',
      distinguishCancelAndClose: true,
      lockScroll: false,
    })
    const saved = await savePattern()
    if (!saved) return false
    allowLeave.value = true
    return true
  } catch (error) {
    if (error === 'cancel') {
      allowLeave.value = true
      return true
    }
    return false
  }
}

function handleBeforeUnload(event) {
  if (!hasUnsavedChanges() || allowLeave.value) return
  event.preventDefault()
  event.returnValue = ''
}

onBeforeRouteLeave(() => confirmLeave())
watch(() => route.params.id, (id, previousId) => {
  if (id && id !== previousId) loadPattern()
})
onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload)
  window.addEventListener('keydown', handlePreviewKeydown)
  loadPatternMakers()
  loadPattern()
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
  window.removeEventListener('keydown', handlePreviewKeydown)
})
</script>

<template>
  <div v-loading="loading" class="pattern-detail-page">
    <section class="pattern-detail-heading"><div><div class="detail-title-row"><el-button text class="detail-back-button" aria-label="返回纸样管理" title="返回纸样管理" @click="router.push(patternReturnLocation())"><el-icon><ArrowLeft /></el-icon></el-button><h1>{{ product.sku || '纸样详情' }}</h1></div></div><div class="pattern-detail-actions"><el-button type="primary" :loading="saving" @click="savePattern">保存纸样</el-button></div></section>

    <section class="panel pattern-total-progress-card">
      <div class="panel-heading"><div><h2>纸样进度</h2></div><el-button v-if="!isProductCanceled && !isPatternCanceled && totalProgressLabel === '已分配'" type="primary" size="small" :loading="startingPattern" @click="confirmStartPattern">开始纸样</el-button><el-button v-else-if="!isProductCanceled && !isPatternCanceled && totalProgressLabel === '纸样中' && activePatternProgress !== '纸样已完成' && !isPatternVersionReviewed(activePatternPrefix)" type="primary" size="small" :loading="completingPattern" @click="completePattern">纸样完成</el-button></div>
      <div v-if="isProductCanceled || isPatternCanceled" class="pattern-total-progress-canceled-wrap"><span class="pattern-total-progress-canceled">{{ isPatternCanceled ? '纸样取消' : '款式取消' }}</span></div>
      <div v-else class="pattern-total-progress-stepper" role="list" aria-label="纸样进度" aria-readonly="true">
        <template v-for="(step, index) in totalProgressSteps" :key="step.value">
          <div class="pattern-total-progress-step" :class="{ active: index <= totalProgressIndex }" role="listitem" :aria-current="index === totalProgressIndex ? 'step' : undefined"><span class="pattern-total-progress-circle">{{ index + 1 }}</span><span class="pattern-total-progress-label">{{ step.label }}</span></div>
          <span v-if="index < totalProgressSteps.length - 1" class="pattern-total-progress-line" :class="{ active: index < totalProgressIndex }" aria-hidden="true"></span>
        </template>
      </div>
    </section>
    <section class="panel pattern-detail-card">
      <div class="panel-heading"><div><h2>纸样信息</h2></div><el-button text class="detail-link-button" @click="router.push({ path: '/back/products/' + encodeURIComponent(product.id), query: { sku: product.sku, return_to: route.fullPath } })">款式详情</el-button></div>
      <div class="pattern-detail-grid">
        <div class="pattern-detail-field"><span>款式</span><strong>{{ product.sku || '—' }}</strong></div>
        <div class="pattern-detail-field"><span>品类</span><strong>{{ product.category || '—' }}</strong></div>
        <div class="pattern-detail-field"><span>设计师</span><strong>{{ product.designer || '—' }}</strong></div>
        <div class="pattern-detail-field"><span>优先级</span><strong>{{ priorityLabel(product.priority) }}</strong></div>
        <div class="pattern-detail-field"><span>尺码</span><strong>{{ sizeLabel(product.size) }}</strong></div>
        <div class="pattern-detail-field pattern-maker-field"><span>纸样师</span><el-select v-model="product.pattern_maker" filterable allow-create default-first-option clearable placeholder="请选择或输入纸样师" class="pattern-maker-control"><el-option v-for="item in patternMakerOptions" :key="item" :label="item" :value="item" /></el-select></div>
        <div v-if="!['外采', '外发'].includes(String(product.link || '').trim())" class="pattern-detail-field"><span>是否产前样</span><strong>{{ product.preproduction_sample || '—' }}</strong></div>
        <div class="pattern-detail-field pattern-detail-notes"><span>打板注意事项</span><strong>{{ product.pattern_notes || '—' }}</strong></div>
        <div class="pattern-media-grid">
          <div class="pattern-media-item"><span>参考图</span><button v-if="firstImage(product.image_url)" type="button" class="pattern-image-trigger" aria-label="查看参考图" @click="openImagePreview(firstImage(product.image_url))"><el-image :src="firstImage(product.image_url)" fit="cover" class="pattern-reference-image" /></button><span v-else class="pattern-empty-reference">—</span></div>
          <div class="pattern-media-item"><span>设计图</span><button v-if="firstImage(product.design_image_url)" type="button" class="pattern-image-trigger" aria-label="查看设计图" @click="openImagePreview(firstImage(product.design_image_url))"><el-image :src="firstImage(product.design_image_url)" fit="cover" class="pattern-reference-image" /></button><span v-else class="pattern-empty-reference">—</span></div>
          <div class="pattern-media-item"><span>尺码表</span><div v-if="firstImage(product.size_chart_url)" class="pattern-media-preview-wrap"><button type="button" class="pattern-image-trigger" aria-label="查看尺码表" @click="openImagePreview(firstImage(product.size_chart_url))"><el-image :src="firstImage(product.size_chart_url)" fit="cover" class="pattern-reference-image" /></button><button type="button" class="pattern-media-remove" aria-label="移除尺码表" @click="removeSizeChart"><el-icon><Close /></el-icon></button></div><div v-else class="pattern-upload-box"><el-upload action="/api/uploads" name="file" :headers="uploadHeaders" accept="image/jpeg,image/png,image/webp,image/gif" :show-file-list="false" :before-upload="beforeSizeChartUpload" :on-success="handleSizeChartUpload" :on-error="handleSizeChartUploadError"><el-button size="small" :loading="sizeChartUploading"><el-icon><Upload /></el-icon>上传图片</el-button></el-upload></div></div>
          <div class="pattern-media-item"><span>最终纸样图</span><div v-if="product.final_pattern_image_url" class="pattern-media-preview-wrap"><button v-if="!isPrjFile(product.final_pattern_image_url)" type="button" class="pattern-image-trigger" aria-label="查看最终纸样图" @click="openImagePreview(product.final_pattern_image_url)"><el-image :src="product.final_pattern_image_url" fit="cover" class="pattern-reference-image" /></button><div v-else class="pattern-file-label">{{ product.final_pattern_filename || fileNameFromUrl(product.final_pattern_image_url) }}</div><button type="button" class="pattern-media-remove" aria-label="移除最终纸样图" @click="removeFinalPattern"><el-icon><Close /></el-icon></button><button v-if="isPrjFile(product.final_pattern_image_url)" type="button" class="pattern-media-download" aria-label="下载最终纸样文件" title="下载" @click="downloadFinalPattern"><el-icon><Download /></el-icon></button></div><div v-else class="pattern-upload-box"><el-upload action="/api/uploads" name="file" :headers="uploadHeaders" accept="image/jpeg,image/png,image/webp,image/gif,.prj" :show-file-list="false" :before-upload="beforeFinalPatternUpload" :on-success="handleFinalPatternUpload" :on-error="handleFinalPatternUploadError"><el-button size="small" :loading="finalPatternUploading"><el-icon><Upload /></el-icon>上传文件</el-button></el-upload></div></div>
        </div>
      </div>
    </section>
    <section class="panel pattern-progress-card">
      <div class="panel-heading"><div><h2>进度</h2></div></div>
      <div class="pattern-progress-grid">
        <div class="pattern-stage-row">
          <div class="pattern-detail-field"><span>头版-纸样进度</span><strong>{{ product.first_pattern_progress || '纸样未完成' }}</strong></div>
          <div class="pattern-detail-field"><span>头版-车板师</span><strong v-if="!canEditBoardMaker('first')">{{ product.first_board_maker || '—' }}</strong><el-input v-else v-model="product.first_board_maker" clearable placeholder="请输入车板师" class="progress-control" /></div>
          <div class="pattern-detail-field"><span>头版-车板进度</span><strong>{{ product.first_board_progress || '车板未完成' }}</strong></div>
          <div class="pattern-detail-field"><span>头版-审版结果</span><strong>{{ product.first_review_result || '—' }}</strong></div>
          <div class="pattern-detail-field"><span>头版-审核意见</span><button v-if="firstImage(product.first_review_opinion_image_url)" type="button" class="pattern-image-trigger" aria-label="查看头版-审核意见" @click="openImagePreview(firstImage(product.first_review_opinion_image_url))"><el-image :src="firstImage(product.first_review_opinion_image_url)" fit="cover" class="pattern-reference-image" /></button><span v-else class="pattern-empty-reference">—</span></div>
        </div>
        <template v-if="hasReviewFollowup(product.first_review_result)">
          <div class="pattern-stage-row">
          <div class="pattern-detail-field"><span>复版-纸样进度</span><strong>{{ product.second_pattern_progress || '纸样未完成' }}</strong></div>
          <div class="pattern-detail-field"><span>复版-车板师</span><strong v-if="!canEditBoardMaker('second')">{{ product.second_board_maker || '—' }}</strong><el-input v-else v-model="product.second_board_maker" clearable placeholder="请输入车板师" class="progress-control" /></div>
          <div class="pattern-detail-field"><span>复版-车板进度</span><strong>{{ product.second_board_progress || '车板未完成' }}</strong></div>
          <div class="pattern-detail-field"><span>复版-审版结果</span><strong>{{ product.second_review_result || '—' }}</strong></div>
          <div class="pattern-detail-field"><span>复版-审核意见</span><button v-if="firstImage(product.second_review_opinion_image_url)" type="button" class="pattern-image-trigger" aria-label="查看复版-审核意见" @click="openImagePreview(firstImage(product.second_review_opinion_image_url))"><el-image :src="firstImage(product.second_review_opinion_image_url)" fit="cover" class="pattern-reference-image" /></button><span v-else class="pattern-empty-reference">—</span></div>
          </div>
        </template>
        <template v-if="hasReviewFollowup(product.second_review_result)">
          <div class="pattern-stage-row">
          <div class="pattern-detail-field"><span>三版-纸样进度</span><strong>{{ product.third_pattern_progress || '纸样未完成' }}</strong></div>
          <div class="pattern-detail-field"><span>三版-车板师</span><strong v-if="!canEditBoardMaker('third')">{{ product.third_board_maker || '—' }}</strong><el-input v-else v-model="product.third_board_maker" clearable placeholder="请输入车板师" class="progress-control" /></div>
          <div class="pattern-detail-field"><span>三版-车板进度</span><strong>{{ product.third_board_progress || '车板未完成' }}</strong></div>
          <div class="pattern-detail-field"><span>三版-审版结果</span><strong>{{ product.third_review_result || '—' }}</strong></div>
          <div class="pattern-detail-field"><span>三版-审核意见</span><button v-if="firstImage(product.third_review_opinion_image_url)" type="button" class="pattern-image-trigger" aria-label="查看三版-审核意见" @click="openImagePreview(firstImage(product.third_review_opinion_image_url))"><el-image :src="firstImage(product.third_review_opinion_image_url)" fit="cover" class="pattern-reference-image" /></button><span v-else class="pattern-empty-reference">—</span></div>
          </div>
        </template>
        <template v-if="!['外采', '外发'].includes(String(product.link || '').trim()) && product.preproduction_sample === '重做产前样'">
          <div class="pattern-stage-row pattern-stage-row-preproduction">
          <div class="pattern-detail-field"><span>产前样-车板师</span><el-input v-model="product.preproduction_board_maker" clearable placeholder="请输入车板师" class="progress-control" /></div>
          <div class="pattern-detail-field"><span>产前样-车板进度</span><strong>{{ product.preproduction_board_progress || '车板未完成' }}</strong></div>
          </div>
        </template>
      </div>
    </section>
    <div v-if="previewImageUrl" class="pattern-image-viewer" role="dialog" aria-modal="true" aria-label="图片预览" @click.self="closeImagePreview"><button type="button" class="pattern-image-viewer-close" aria-label="关闭图片预览" @click="closeImagePreview"><el-icon><Close /></el-icon></button><img :src="previewImageUrl" alt="预览图片" class="pattern-image-viewer-image" /></div>
  </div>
</template>

<style scoped>
.pattern-detail-page { min-width: 0; color: #111827; }
.detail-title-row { display: flex; align-items: center; gap: 4px; }
.detail-back-button { width: 30px; height: 34px; padding: 0; color: #64748b; }
.detail-back-button:hover { color: #1677ff; background: #eff6ff; }
.pattern-detail-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 18px; }
.pattern-detail-actions { display: flex; justify-content: flex-end; padding-top: 23px; }
.pattern-detail-heading h1 { color: #111827; font-size: 24px; font-weight: 700; letter-spacing: -.02em; }
.pattern-total-progress-card { min-width: 0; margin-bottom: 18px; padding: 24px 26px; border: 1px solid rgba(226, 232, 240, .8); border-radius: 18px; box-shadow: 0 10px 28px rgba(15, 23, 42, .04); }
.pattern-total-progress-card .panel-heading { margin-bottom: 22px; }
.pattern-total-progress-card h2 { color: #172033; font-size: 16px; }
.pattern-total-progress-card p { margin-top: 5px; color: #94a3b8; font-size: 12px; }
.pattern-total-progress-stepper { display: flex; align-items: center; width: 100%; min-height: 48px; pointer-events: none; user-select: none; }
.pattern-total-progress-step { display: inline-flex; min-width: 108px; align-items: center; gap: 9px; padding: 0; border: 0; color: #64748b; background: transparent; text-align: left; }
.pattern-total-progress-circle { display: grid; width: 34px; height: 34px; flex: 0 0 34px; place-items: center; border-radius: 50%; color: #94a3b8; background: #f1f3f6; font-size: 13px; }
.pattern-total-progress-step.active .pattern-total-progress-circle { color: #fff; background: #075dcc; }
.pattern-total-progress-step.active .pattern-total-progress-label { color: #334155; }
.pattern-total-progress-canceled-wrap { display: flex; min-height: 48px; align-items: center; justify-content: center; }
.pattern-total-progress-canceled { display: inline-flex; min-width: 128px; min-height: 36px; align-items: center; justify-content: center; padding: 0 24px; border-radius: 6px; color: #fff; background: #ef4444; font-size: 14px; font-weight: 700; }
.pattern-total-progress-label { color: #64748b; font-size: 13px; white-space: nowrap; }
.pattern-total-progress-line { height: 1px; flex: 1; min-width: 28px; margin: 0 10px; background: #e5e7eb; }
.pattern-total-progress-line.active { background: #075dcc; }
.pattern-detail-card { min-width: 0; padding: 24px 26px; border: 1px solid rgba(226, 232, 240, .8); border-radius: 18px; box-shadow: 0 10px 28px rgba(15, 23, 42, .04); }
.pattern-detail-card .panel-heading { margin-bottom: 22px; }
.detail-link-button { box-sizing: border-box; height: 32px; padding: 0 14px !important; border: 0 !important; border-radius: 4px; color: #3b82f6 !important; background: #f5f7fa !important; font-size: 13px; }
.detail-link-button:hover { color: #1677ff !important; background: #edf4ff !important; }
.pattern-detail-card h2 { color: #172033; font-size: 16px; }
.pattern-detail-card p { margin-top: 5px; color: #94a3b8; font-size: 12px; }
.pattern-progress-card { min-width: 0; margin-top: 18px; padding: 24px 26px; border: 1px solid rgba(226, 232, 240, .8); border-radius: 18px; box-shadow: 0 10px 28px rgba(15, 23, 42, .04); }
.pattern-progress-card .panel-heading { margin-bottom: 22px; }
.pattern-progress-card h2 { color: #172033; font-size: 16px; }
.pattern-progress-card p { margin-top: 5px; color: #94a3b8; font-size: 12px; }
.pattern-progress-grid { display: flex; flex-direction: column; gap: 22px; align-items: stretch; overflow-x: auto; }
.pattern-stage-row { display: grid; min-width: 1050px; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 22px 18px; align-items: start; }
.pattern-stage-row .progress-control { width: 50%; }
.pattern-detail-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 22px 18px; align-items: start; }
.pattern-detail-field { min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.pattern-detail-field span, .pattern-reference > span { color: #94a3b8; font-size: 12px; }
.pattern-detail-field strong { overflow: hidden; color: #334155; font-size: 14px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.pattern-maker-control { width: 170px; }
.pattern-detail-notes { grid-column: span 3; }
.pattern-detail-notes strong { white-space: normal; line-height: 1.6; }
.progress-control { width: 170px; }
.pattern-reference { display: flex; flex-direction: column; gap: 8px; }
.pattern-reference-image { width: 112px; height: 112px; border: 1px solid #e2e8f0; border-radius: 12px; }
.pattern-media-grid { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 22px 18px; }
.pattern-media-grid .pattern-media-item:nth-child(1) { grid-column: 1; }
.pattern-media-grid .pattern-media-item:nth-child(2) { grid-column: 2; }
.pattern-media-grid .pattern-media-item:nth-child(3) { grid-column: 3; }
.pattern-media-grid .pattern-media-item:nth-child(4) { grid-column: 4; }
.pattern-media-item { min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.pattern-media-item > span { color: #94a3b8; font-size: 12px; }
.pattern-media-preview-wrap { position: relative; width: 112px; height: 112px; }
.pattern-image-trigger { display: block; width: 112px; height: 112px; padding: 0; border: 0; border-radius: 12px; background: transparent; cursor: zoom-in; }
.pattern-image-trigger:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }
.pattern-media-preview-wrap .pattern-reference-image { display: block; }
.pattern-media-remove { position: absolute; top: 4px; right: 4px; z-index: 2; display: grid; width: 26px; height: 26px; padding: 0; place-items: center; border: 0; border-radius: 50%; color: #fff; background: rgba(15, 23, 42, .68); opacity: 0; pointer-events: none; transition: opacity .16s ease; cursor: pointer; }
.pattern-media-preview-wrap:hover .pattern-media-remove, .pattern-media-remove:focus-visible { opacity: 1; pointer-events: auto; }
.pattern-media-download { position: absolute; bottom: 4px; left: 50%; z-index: 2; display: grid; width: 58px; height: 24px; padding: 0; place-items: center; border: 1px solid #dbe3ef; border-radius: 5px; color: #3b82f6; background: rgba(255, 255, 255, .94); opacity: 0; pointer-events: none; transform: translateX(-50%); transition: opacity .16s ease; cursor: pointer; }
.pattern-media-preview-wrap:hover .pattern-media-download, .pattern-media-download:focus-visible { opacity: 1; pointer-events: auto; }
.pattern-file-label { display: flex; width: 112px; height: 112px; align-items: center; justify-content: center; padding: 12px; border: 1px solid #dbe3ef; border-radius: 12px; color: #64748b; background: #f8fafc; font-size: 12px; text-align: center; overflow-wrap: anywhere; }
.pattern-upload-box { display: grid; width: 112px; height: 112px; place-items: center; border: 1px dashed #cbd5e1; border-radius: 12px; background: #f8fafc; }
.pattern-upload-box :deep(.el-upload) { display: block; }
.pattern-upload-box :deep(.el-button) { min-height: 30px; padding: 0 9px; border-radius: 7px; font-size: 12px; }
.pattern-empty-reference { color: #94a3b8; }
.pattern-image-viewer { position: fixed; inset: 0; z-index: 3000; display: grid; place-items: center; padding: 40px; background: rgba(15, 23, 42, .78); }
.pattern-image-viewer-image { display: block; max-width: min(92vw, 1200px); max-height: 88vh; object-fit: contain; border-radius: 10px; box-shadow: 0 20px 60px rgba(0, 0, 0, .3); }
.pattern-image-viewer-close { position: fixed; top: 22px; right: 26px; display: grid; width: 40px; height: 40px; padding: 0; place-items: center; border: 1px solid rgba(255, 255, 255, .5); border-radius: 50%; color: #fff; background: rgba(15, 23, 42, .35); font-size: 22px; cursor: pointer; }
@media (max-width: 900px) { .pattern-detail-grid, .pattern-progress-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }.pattern-detail-notes { grid-column: span 2; }.pattern-media-grid { grid-column: 1 / -1; grid-template-columns: repeat(2, minmax(0, 1fr)); }.pattern-media-grid .pattern-media-item:nth-child(n) { grid-column: auto; } }
@media (max-width: 560px) { .pattern-detail-heading { align-items: flex-start; flex-direction: column; }.pattern-detail-actions { width: 100%; padding-top: 0; justify-content: stretch; }.pattern-detail-actions .el-button { width: 100%; }.pattern-detail-grid, .pattern-progress-grid { grid-template-columns: 1fr; }.pattern-detail-notes, .pattern-media-grid { grid-column: auto; }.pattern-total-progress-card, .pattern-progress-card { padding: 20px 18px; }.pattern-total-progress-step { min-width: 0; }.pattern-total-progress-label { font-size: 12px; }.pattern-total-progress-line { min-width: 10px; margin: 0 6px; } }
.pattern-total-progress-card, .pattern-detail-card, .pattern-progress-card { border-color: var(--ui-border); border-radius: var(--ui-radius-lg); box-shadow: var(--ui-shadow-xs); }
.pattern-detail-card :deep(.el-input__wrapper), .pattern-detail-card :deep(.el-select__wrapper), .pattern-progress-card :deep(.el-input__wrapper), .pattern-progress-card :deep(.el-select__wrapper) { border-radius: var(--ui-radius-md); }
</style>
