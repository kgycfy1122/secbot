<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Close, Loading, Picture, Plus, Printer, Upload } from '@element-plus/icons-vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import ImageUploader from './ImageUploader.vue'
import { getAuthHeaders } from '../auth.js'
import { getFollowUpMaterialMissingFields, getLinkDisplayLabel, getStyleProgressSteps, hasRequiredFitSize, hasStyleNumber, isCompletionWindowOpen, isMatchingProgressComplete, isStyleProgressStageComplete, requiresSeason, requiresStyleNumber } from '../styleProgress.js'

const route = useRoute()
const router = useRouter()
const statusOnlyMode = computed(() => route.query.mode === 'status')
const formRef = ref()
const loading = ref(true)
const saving = ref(false)
const advancingProgress = ref(false)
const preparingPatternAssignment = ref(false)
const imageUploading = ref(false)
const previewVisible = ref(false)
const previewImageUrl = ref('')
const previewImageLabel = ref('')
const imageDetailsVisible = ref(false)
const matchingImageUploading = reactive({})
const matchingScrollProgress = reactive({})
const matchingScrollFrames = new Map()
const uploadHeaders = getAuthHeaders()
const documentPreviewVisible = ref(false)
const documentPreviewType = ref('')
const documentPreviewHtml = ref('')
const documentPreviewLoading = ref(false)
const documentPreviewReady = ref(false)
const documentDownloading = ref(false)
const documentPreviewFrame = ref(null)
const initialSnapshot = ref('')
const allowLeave = ref(false)
let skuAutoSaveTimer = null
const categories = ref([])
const designers = ref([])
const fabricDialogVisible = ref(false)
const fabricFormRef = ref()
const editingFabricIndex = ref(-1)
const accessoryDialogVisible = ref(false)
const accessoryFormRef = ref()
const editingAccessoryIndex = ref(-1)
const craftDialogVisible = ref(false)
const craftFormRef = ref()
const editingCraftIndex = ref(-1)
const form = reactive({
  id: '', sku: '', release_date: '', season: '', category: '', designer: '', designer_assistant: '', pattern_maker: '', link: '',
  season_type: '', color: '', composition: '', size: '', highlights: '', priority: '', style_progress: '选图', pattern_progress: '分配中', material_notified: '', material_arrived: '', material_outsourced: '', first_pattern_progress: '', first_board_progress: '', first_board_maker: '', first_review_result: '', first_review_opinion_image_url: '', second_pattern_progress: '', second_board_progress: '', second_board_maker: '', second_review_result: '', second_review_opinion_image_url: '', third_pattern_progress: '', third_board_progress: '', third_board_maker: '', third_review_result: '', third_review_opinion_image_url: '', preproduction_sample: '', preproduction_board_progress: '', preproduction_board_maker: '', has_pattern: '', pattern_notes: '',
  pattern_reference_image_url: '', pattern_complete_style: '', pattern_complete_image_url: '', design_pattern_progress: '', design_pattern_notes: '',
  image_url: '', physical_image_url: '', design_image_url: '', front_back_image_url: '', size_chart_url: '', processing_fee_image_url: '',
  fabric_records: [], accessory_records: [], craft_records: [],
  price: 0, pricing: 0, processing_fee: 0, reference_sales: null, stock: 0, status: 'active', description: '',
  price_image_url: '', composition_image_url: '', external_purchase_notes: '', external_purchase_progress: '', is_canceled: '', supplier: '', channel: '', address: '', contact: '', product_url: '', reference_link: '', official_matching_sku: '',
})
const savedProgressData = reactive({
  link: '', sku: '', style_progress: '选图', season: '', category: '', designer: '', image_url: '',
  material_notified: false, material_arrived: false, material_outsourced: false,
  season_type: '', color: '', composition: '', size: [], physical_image_url: '', price: 0, external_purchase_progress: '', pattern_progress: '',
  fabric_records: [], accessory_records: [],
  matching_image_1: '', matching_sku_1: '', matching_progress_1: '', matching_image_2: '', matching_sku_2: '', matching_progress_2: '', matching_image_3: '', matching_sku_3: '', matching_progress_3: '',
})
const linkOptions = ['常规款', '常规优先款', '外发', '外采', 'AI款', 'AI外发款', '转自研板房', '转自研外发']
const seasonOptions = ['春', '夏', '秋', '冬']
const sizeOptions = ['XS', 'S', 'M', 'L', 'XL', '宽松', '合体', '修身']
const preproductionSampleOptions = ['头版做产前样', '复版做产前样', '三版做产前样', '重做产前样']
const reviewResultOptions = ['通过', '未通过-纸样修改', '未通过-整件重做', '未通过-车板修改', '取消']
const savedStyleProgressSteps = computed(() => {
  if (savedProgressData.style_progress === '款式取消') return ['款式取消']
  return getStyleProgressSteps(form.link)
})
const currentStyleProgress = computed(() => {
  if (savedProgressData.style_progress === '款式取消') return '款式取消'
  return savedStyleProgressSteps.value.includes(savedProgressData.style_progress)
    ? savedProgressData.style_progress
    : savedStyleProgressSteps.value[0]
})
const isRegularStyleLink = computed(() => ['常规款', '常规优先款', '常规优先', '转自研板房'].includes(String(form.link || '').trim()))
const isConventionalStyleLink = computed(() => ['常规款', '常规优先款', '常规优先', '转自研板房'].includes(String(form.link || '').trim()))
const overallProgressBadges = computed(() => {
  const isOutsourceLink = ['外发', '转自研外发'].includes(String(form.link || '').trim())
  const isFollowUpLink = ['AI款', 'AI外发款', 'AI', 'AI外发'].includes(String(form.link || '').trim())
  if ((!isRegularStyleLink.value && form.link !== '外采' && !isOutsourceLink && !isFollowUpLink)
    || savedProgressData.style_progress === '款式取消') return []
  const product = { ...savedProgressData, ...form }
  const matchingComplete = [1, 2, 3].some((index) => isMatchingProgressComplete(product[`matching_progress_${index}`]))
  const badges = [{ label: matchingComplete ? '已搭配' : '未搭配', complete: matchingComplete }]
  if (isRegularStyleLink.value || isOutsourceLink || isFollowUpLink) {
    const pricingComplete = Number(product.processing_fee) > 0 || (isFollowUpLink && Number(product.price) > 0)
    badges.push({ label: pricingComplete ? '已核价' : '未核价', complete: pricingComplete })
  }
  return badges
})
const nextStyleProgress = computed(() => {
  if (!form.link || savedProgressData.style_progress === '款式取消') return ''
  const currentIndex = savedStyleProgressSteps.value.indexOf(currentStyleProgress.value)
  return savedStyleProgressSteps.value[currentIndex + 1] || ''
})
const externalOutsourceMissingFields = computed(() => [
  ...(!hasStyleNumber(form.sku) ? ['款号'] : []),
  ...(!hasImages(form.image_url) ? ['参考图'] : []),
  ...(!String(form.designer || '').trim() ? ['设计师'] : []),
  ...(!hasImages(form.physical_image_url) ? ['实物图'] : []),
  ...(!['外发', '转自研外发'].includes(String(form.link || '').trim()) ? ['链路'] : []),
  ...(!String(form.highlights || '').trim() ? ['产品亮点'] : []),
  ...(!String(form.color || '').trim() ? ['颜色'] : []),
  ...(!String(form.category || '').trim() ? ['品类'] : []),
  ...(!String(form.composition || '').trim() ? ['成分'] : []),
  ...(!String(form.season_type || '').trim() ? ['季节'] : []),
  ...(!Array.isArray(form.size) || !form.size.some((size) => ['宽松', '合体', '修身'].includes(size)) ? ['尺码'] : []),
  ...(!String(form.pattern_notes || '').trim() ? ['打板注意事项'] : []),
])
const showOutsourceCompletionButton = computed(() => ['外发', '转自研外发'].includes(String(form.link || '').trim())
  && currentStyleProgress.value === '待外发'
  && externalOutsourceMissingFields.value.length === 0)
const showFollowUpOutsourceCompletionButton = computed(() => ['AI外发款', 'AI外发'].includes(String(form.link || '').trim())
  && currentStyleProgress.value === '外发中'
  && nextStyleProgress.value === '完成')
const showFollowUpOutsourceStartButton = computed(() => ['AI外发款', 'AI外发'].includes(String(form.link || '').trim())
  && currentStyleProgress.value === '已排期'
  && nextStyleProgress.value === '外发中')
const showFollowUpPatternStartButton = computed(() => ['AI款', 'AI'].includes(String(form.link || '').trim())
  && currentStyleProgress.value === '已排期'
  && nextStyleProgress.value === '打板中')
const followUpPatternNotesReady = computed(() => Boolean(String(form.pattern_notes || '').trim()))
const showAdvanceProgressButton = computed(() => !showFollowUpPatternStartButton.value && !showFollowUpOutsourceStartButton.value && !showFollowUpOutsourceCompletionButton.value && (['预热中', '打板中', '外发中', '外发', '打版', '打板', '搭配中'].includes(nextStyleProgress.value)
  || (currentStyleProgress.value === '通知' && nextStyleProgress.value === '买料')
  || (currentStyleProgress.value === '码价' && nextStyleProgress.value === '搭配')
  || (currentStyleProgress.value === '外发' && nextStyleProgress.value === '搭配')))
const advanceProgressButtonLabel = computed(() => {
  if (showFollowUpPatternStartButton.value) return '确定打板'
  if (showFollowUpOutsourceStartButton.value) return '外发'
  if (showFollowUpOutsourceCompletionButton.value) return '外发完成'
  if (currentStyleProgress.value === '待外发' && nextStyleProgress.value === '待排期') return '外发完成'
  return nextStyleProgress.value === '完成' ? '已完成' : nextStyleProgress.value
})
const patternAssignmentMissingFields = computed(() => [
  ...(!hasStyleNumber(form.sku) ? ['款号'] : []),
  ...(!hasImages(form.image_url) ? ['参考图'] : []),
  ...(!String(form.designer || '').trim() ? ['设计师'] : []),
  ...(!['常规款', '常规优先款', '常规优先', '转自研板房'].includes(String(form.link || '').trim()) ? ['链路'] : []),
  ...(!String(form.pattern_notes || '').trim() ? ['打板注意事项'] : []),
])
const showPatternAssignmentButton = computed(() => currentStyleProgress.value === '待到料'
  && patternAssignmentMissingFields.value.length === 0)
const externalPurchaseMissingFields = computed(() => [
  ...(!hasStyleNumber(form.sku) ? ['款号'] : []),
  ...(!String(form.designer || '').trim() ? ['设计师'] : []),
  ...(!hasImages(form.physical_image_url) ? ['实物图'] : []),
  ...(form.link !== '外采' ? ['链路'] : []),
  ...(!String(form.highlights || '').trim() ? ['产品亮点'] : []),
  ...(!String(form.color || '').trim() ? ['颜色'] : []),
  ...(!String(form.category || '').trim() ? ['品类'] : []),
  ...(!String(form.composition || '').trim() ? ['成分'] : []),
  ...(!String(form.season_type || '').trim() ? ['季节'] : []),
  ...(!Array.isArray(form.size) || !form.size.some((size) => ['宽松', '合体', '修身'].includes(size)) ? ['尺码'] : []),
  ...(Number(form.price) <= 0 ? ['价格'] : []),
])
const showExternalPurchaseArrivalButton = computed(() => form.link === '外采'
  && currentStyleProgress.value === '待外采'
  && externalPurchaseMissingFields.value.length === 0)
const isPatternSummaryVisible = computed(() => {
  const canceled = savedProgressData.style_progress === '款式取消' || form.is_canceled === true || form.is_canceled === 1 || form.is_canceled === '1' || form.is_canceled === 'true'
  if (canceled) {
    return Boolean(form.pattern_maker || (form.pattern_progress && form.pattern_progress !== '分配中')
      || form.first_pattern_image_url || form.second_pattern_image_url || form.third_pattern_image_url
      || form.first_board_maker || form.second_board_maker || form.third_board_maker
      || form.first_board_progress || form.second_board_progress || form.third_board_progress
      || form.first_review_result || form.second_review_result || form.third_review_result)
  }
  const patternIndex = savedStyleProgressSteps.value.findIndex((step) => ['待打板', '打版中', '打版', '打板'].includes(step))
  const currentIndex = savedStyleProgressSteps.value.indexOf(currentStyleProgress.value)
  return (patternIndex >= 0 && currentIndex >= patternIndex)
    || (['AI款', 'AI'].includes(String(form.link || '').trim()) && ['打板中', '审版中', '完成'].includes(currentStyleProgress.value))
})
const showMaterialNotified = computed(() => false)
const showMaterialOutsourced = computed(() => false)
function missingProgressRequirements(step, product = savedProgressData) {
  const requirementLabels = {
    选图: [
      ['品类', Boolean(product.category)],
      ['设计师', Boolean(product.designer)],
      ...(requiresStyleNumber(form.link) ? [['款号', hasStyleNumber(product.sku)]] : []),
      ...(requiresSeason(form.link) ? [['期数', Boolean(product.season)]] : []),
      [form.link === '外采' ? '实物图' : '参考图', form.link === '外采' ? hasImages(product.physical_image_url) : hasImages(product.image_url)],
    ],
    定料: [['面辅料信息', isStyleProgressStageComplete(product, '定料')]],
    买料: [['是否到料选择“是”', Boolean(product.material_arrived)]],
    待对料: [['面辅料信息', isStyleProgressStageComplete(product, '待对料')]],
    待到料: [['面辅料到料', Boolean(product.material_arrived)]],
    待打板: [['纸样师已分配且开始纸样', product.pattern_progress === '纸样中' || Boolean(product.pattern_started_at)]],
    打版中: [['纸样流程审核通过', product.pattern_progress === '已通过']],
    待排期: [['上新日期', Boolean(product.release_date)]],
    已排期: [],
    待外采: [['外采价格', Number(product.price) > 0]],
    通知: [['是否通知选择“是”', Boolean(product.material_notified)]],
    外发: [['是否外发选择“是”', Boolean(product.material_outsourced)]],
    预核价: [['外采价格', Number(product.price) > 0]],
    打版: [['纸样流程审核通过', product.pattern_progress === '已通过']],
    打板: [['纸样流程审核通过', product.pattern_progress === '已通过']],
    搭配: [['至少一项搭配进度为“已拍照、已AI拍照或已AI生图”', isStyleProgressStageComplete(product, '搭配')]],
  }
  return (requirementLabels[step] || []).filter(([, isDone]) => !isDone).map(([label]) => label)
}
function completionMissingRequirements(product) {
  const link = String(product.link || '').trim()
  if (['AI款', 'AI'].includes(link)) return product.pattern_progress === '已通过' ? [] : ['纸样审核通过']
  if (['AI外发款', 'AI外发'].includes(link)) return [product.material_outsourced === true || product.material_outsourced === 1 || product.material_outsourced === '1' ? '' : '外发完成'].filter(Boolean)
  const missing = []
  const matchingRequired = ['常规款', '常规优先款', '常规优先', '外采', '外发', '转自研板房', '转自研外发'].includes(link)
  const pricingRequired = ['常规款', '常规优先款', '常规优先', '外发', '转自研板房', '转自研外发'].includes(link)
  const matchingComplete = [1, 2, 3].some((number) => isMatchingProgressComplete(product[`matching_progress_${number}`]))
  if (matchingRequired && !matchingComplete) missing.push('搭配（至少一项已拍照、已AI拍照或已AI生图）')
  if (pricingRequired && Number(product.processing_fee) <= 0) missing.push('核价（加工费）')
  if (!product.release_date) missing.push('上新日期')
  else if (!isCompletionWindowOpen(product.release_date)) missing.push('未到上新日期前7天')
  return missing
}
const progressPrompt = computed(() => {
  if (savedProgressData.style_progress === '款式取消' || [true, 1, '1', 'true'].includes(form.is_canceled)) return '此款已取消'
  if (!form.link) return '请优先选择链路。'
  const steps = savedStyleProgressSteps.value
  const currentIndex = steps.indexOf(currentStyleProgress.value)
  const nextStep = steps[currentIndex + 1]
  if (currentStyleProgress.value === '买料' && ['打版', '打板'].includes(nextStep)) {
    const draft = { ...savedProgressData, ...form }
    const dispatchMissing = [
      ...(!hasImages(draft.image_url) ? ['参考图'] : []),
      ...(!String(draft.pattern_notes || '').trim() ? ['打板注意事项'] : []),
    ]
    if (dispatchMissing.length) return `进入${nextStep}前还需填写：${dispatchMissing.join('、')}。`
    return `点击右上角“${nextStep}”按钮即可推进进度。`
  }
  if (currentStyleProgress.value === '待对料') {
    const product = { ...savedProgressData, ...form }
    const followUpSeller = ['AI款', 'AI外发款', 'AI', 'AI外发'].includes(String(form.link || '').trim())
    const hasFollowUpMaterials = [product.fabric_records, product.accessory_records].some((records) => Array.isArray(records) && records.length > 0)
    const missing = [
      ...(followUpSeller
        ? (!hasFollowUpMaterials ? ['面辅料信息'] : [])
        : (!isStyleProgressStageComplete(product, '待对料') ? ['面辅料信息'] : [])),
      ...(followUpSeller && !hasStyleNumber(form.sku) ? ['款号'] : []),
      ...(followUpSeller ? getFollowUpMaterialMissingFields(product) : []),
    ]
    if (missing.length) return `请填写：${missing.join('、')}。`
    if (hasUnsavedChanges()) return '请点击保存。'
    return `面辅料信息已保存，总进度已进入${nextStep || '下一阶段'}。`
  }
  if (showFollowUpPatternStartButton.value) return followUpPatternNotesReady.value
    ? '打板注意事项已填写，点击“确定打板”按钮后进入打板中。'
    : '请填写：打板注意事项。填写后即可点击“确定打板”。'
  if (showFollowUpOutsourceStartButton.value) return followUpPatternNotesReady.value
    ? '打板注意事项已填写，点击“外发”按钮后进入外发中。'
    : '请填写：打板注意事项。填写后即可点击“外发”。'
  if (currentStyleProgress.value === '待外采') {
    return externalPurchaseMissingFields.value.length
      ? `请填写：${externalPurchaseMissingFields.value.join('、')}`
      : '资料已填写完整，点击右上角“外采已到货”确认到货并进入待排期。'
  }
  if (currentStyleProgress.value === '待到料') {
    return patternAssignmentMissingFields.value.length
      ? `请填写：${patternAssignmentMissingFields.value.join('、')}。`
      : '点击右上角“分配纸样”按钮即可分配纸样师。'
  }
  if (currentStyleProgress.value === '待外发') {
    return externalOutsourceMissingFields.value.length
      ? `请填写：${externalOutsourceMissingFields.value.join('、')}`
      : '资料已填写完整，点击右上角“外发完成”按钮即可进入待排期。'
  }
  if (currentStyleProgress.value === '外发中' && ['AI外发款', 'AI外发'].includes(String(form.link || '').trim())) {
    return '外发完成后，点击总进度区域的“外发完成”按钮确认并进入已完成。'
  }
  if (currentStyleProgress.value === '预热中' && ['AI款', 'AI'].includes(String(form.link || '').trim())) {
    return '纸样流程开始后，总进度会自动进入打板中；纸样完成并提交审核后进入审版中。'
  }
  if (currentStyleProgress.value === '打板中' && ['AI款', 'AI'].includes(String(form.link || '').trim())) {
    return '请在下方打板模块完成纸样和车板流程；纸样流程进入审核中后，总进度将进入审版中。'
  }
  if (currentStyleProgress.value === '审版中' && ['AI款', 'AI'].includes(String(form.link || '').trim())) {
    return hasReviewApproval(form)
      ? '审版结果已通过，保存后总进度将进入已完成。'
      : '请在下方打板模块填写审版结果；选择“通过”并保存后，总进度将进入已完成。'
  }
  if (isConventionalStyleLink.value && currentStyleProgress.value === '待打板') {
    return `纸样进度：${form.pattern_progress || '分配中'}。`
  }
  if (isConventionalStyleLink.value && currentStyleProgress.value === '打版中') {
    if (form.pattern_progress === '审核中' && hasReviewApproval(form)) {
      const missing = reviewApprovalMissingFields({ ...savedProgressData, ...form })
      if (missing.length) return `审核通过前请填写：${missing.join('、')}。`
    }
    return `纸样进度：${form.pattern_progress || '纸样中'}。`
  }
  if (isConventionalStyleLink.value && currentStyleProgress.value === '审版中') {
    const missing = reviewApprovalMissingFields({ ...savedProgressData, ...form })
    return missing.length
      ? `审核通过前请填写：${missing.join('、')}。`
      : '审核结果选择“通过”并保存后，总进度将进入待排期。'
  }
  if (currentStyleProgress.value === '定料' && nextStep === '外发') {
    const draft = { ...savedProgressData, ...form }
    const materialMissing = missingProgressRequirements('定料', draft)
    return materialMissing.length
      ? `当前阶段还需填写：${materialMissing.join('、')}。`
      : '面辅料信息已填写，点击右上角“外发”按钮即可推进到下一阶段。'
  }
  if (currentStyleProgress.value === '通知' && nextStep === '外发') {
    return '点击右上角“外发”按钮即可完成通知并进入外发阶段。'
  }
  if (currentStyleProgress.value === '通知' && nextStep === '买料') {
    return '点击右上角“买料”按钮即可完成通知并进入买料阶段。'
  }
  if (currentStyleProgress.value === '外发' && nextStep === '搭配') {
    return '外发通过后，点击右上角“搭配”按钮即可进入下一阶段。'
  }
  if (currentStyleProgress.value === '预核价' && ['打版', '打板', '外发'].includes(nextStep)) {
    const draft = { ...savedProgressData, ...form }
    if (Number(draft.price) <= 0) return '当前阶段还需填写：外采价格。'
    return `预核价完成后，点击右上角“${nextStep}”按钮确认推进。`
  }
  if (['打版', '打板'].includes(currentStyleProgress.value) && nextStep) {
    return `纸样审核通过后，总进度会自动进入下一阶段：${nextStep}。`
  }
  if (currentStyleProgress.value === '码价' && nextStep === '搭配') {
    return '码价完成后，点击右上角“搭配”按钮即可推进到搭配阶段。'
  }
  if (currentStyleProgress.value === '搭配' && nextStep === '上新') {
    const draft = { ...savedProgressData, ...form }
    const matchingMissing = missingProgressRequirements('搭配', draft)
    return matchingMissing.length
      ? `当前阶段还需填写：${matchingMissing.join('、')}。`
      : '至少一项搭配进度为“已拍照、已AI拍照或已AI生图”后，总进度会自动进入下一阶段：上新。'
  }
  if (currentStyleProgress.value === '待排期') {
    return form.release_date ? '保存上新日期后，总进度将自动进入已排期。' : '填写并保存上新日期后，总进度将自动进入已排期。'
  }
  if (currentStyleProgress.value === '上新') {
    return form.release_date ? '保存上新日期后，总进度将自动进入完成。' : '填写并保存上新日期后，总进度将自动进入完成。'
  }
  if (currentStyleProgress.value === '已排期') {
    const completionMissing = completionMissingRequirements({ ...savedProgressData, ...form })
    return completionMissing.length
      ? `进入已完成前还需：${completionMissing.join('、')}。`
      : '已完成条件已满足，保存后总进度将进入已完成。'
  }
  if (currentStyleProgress.value === '完成' && ['AI款', 'AI'].includes(String(form.link || '').trim())) return '纸样审核已通过，跟卖款已完成。'
  if (currentStyleProgress.value === '完成' && ['AI外发款', 'AI外发'].includes(String(form.link || '').trim())) return '外发已完成，款式已完成。'
  if (currentStyleProgress.value === '完成') return '清除并保存上新日期后，总进度会回到待排期。'
  const draft = { ...savedProgressData, ...form }
  const currentMissing = missingProgressRequirements(currentStyleProgress.value, draft)
  if (currentMissing.length) return `当前阶段还需填写：${currentMissing.join('、')}。`
  if (!nextStep) return '当前进度已完成。请确认全部资料无误后保存。'
  return `当前阶段已完成，保存后即可进入下一阶段：${nextStep}。`
})
const priorityByLink = { 常规款: '四级', 常规优先款: '三级', 转自研款: '二级', 转自研板房: '二级', 转自研外发: '二级', AI款: '一级' }
const hasReviewFollowup = (result) => Boolean(result && result !== '通过' && result !== '取消')
function reviewApprovalMissingFields(product = form) {
  if (!['常规款', '常规优先款', '常规优先', '转自研板房'].includes(String(product.link || '').trim())) return []
  return [
    ...(!hasImages(product.image_url) ? ['参考图'] : []),
    ...(!String(product.category || '').trim() ? ['品类'] : []),
    ...(!String(product.designer || '').trim() ? ['设计师'] : []),
    ...(!hasImages(product.physical_image_url) ? ['实物图'] : []),
    ...(!String(product.link || '').trim() ? ['链路'] : []),
    ...(!String(product.season_type || '').trim() ? ['季节'] : []),
    ...(!String(product.color || '').trim() ? ['颜色'] : []),
    ...(!String(product.composition || '').trim() ? ['成分'] : []),
    ...(!hasRequiredFitSize(product.size) ? ['尺码（需包含宽松、合体或修身）'] : []),
    ...(!String(product.highlights || '').trim() ? ['产品亮点'] : []),
  ]
}
function hasReviewApproval(product = form) {
  return ['first_review_result', 'second_review_result', 'third_review_result'].some((field) => product[field] === '通过')
}
function syncSavedProgressData(product) {
  savedProgressData.link = product.link || ''
  savedProgressData.sku = product.sku || ''
  savedProgressData.style_progress = product.style_progress || '选图'
  savedProgressData.style_progress_times = product.style_progress_times || {}
  savedProgressData.season = product.season || ''
  savedProgressData.category = product.category || ''
  savedProgressData.designer = product.designer || ''
  savedProgressData.image_url = product.image_url || ''
  savedProgressData.material_notified = product.material_notified === true || product.material_notified === 1
  savedProgressData.material_arrived = product.material_arrived === true || product.material_arrived === 1
  savedProgressData.material_outsourced = product.material_outsourced === true || product.material_outsourced === 1
  savedProgressData.physical_image_url = product.physical_image_url || ''
  savedProgressData.price = product.price ?? 0
  savedProgressData.external_purchase_progress = product.external_purchase_progress || ''
  savedProgressData.pattern_progress = product.pattern_progress || ''
  for (const number of [1, 2, 3]) {
    savedProgressData[`matching_image_${number}`] = product[`matching_image_${number}`] || ''
    savedProgressData[`matching_sku_${number}`] = product[`matching_sku_${number}`] || ''
    savedProgressData[`matching_progress_${number}`] = product[`matching_progress_${number}`] || ''
  }
  savedProgressData.season_type = product.season_type || ''
  savedProgressData.color = product.color || ''
  savedProgressData.composition = product.composition || ''
  savedProgressData.size = Array.isArray(product.size) ? [...product.size] : String(product.size || '').split(',').map((item) => item.trim()).filter(Boolean)
  savedProgressData.fabric_records = Array.isArray(product.fabric_records) ? product.fabric_records : []
  savedProgressData.accessory_records = Array.isArray(product.accessory_records) ? product.accessory_records : []
}
function clearReviewStage(prefix) {
  form[`${prefix}_pattern_progress`] = ''
  form[`${prefix}_board_progress`] = ''
  form[`${prefix}_board_maker`] = ''
  form[`${prefix}_review_result`] = ''
  form[`${prefix}_review_opinion_image_url`] = ''
}
function normalizeReviewStages() {
  if (!hasReviewFollowup(form.first_review_result)) {
    clearReviewStage('second')
    clearReviewStage('third')
  } else if (!hasReviewFollowup(form.second_review_result)) {
    clearReviewStage('third')
  }
}
function handleReviewClear(stage) {
  if (stage === 'first') {
    form.first_review_result = ''
    form.first_review_opinion_image_url = ''
    clearReviewStage('second')
    clearReviewStage('third')
  } else if (stage === 'second') {
    form.second_review_result = ''
    form.second_review_opinion_image_url = ''
    clearReviewStage('third')
  }
}
watch(() => form.first_review_result, (result) => {
  if (!hasReviewFollowup(result)) {
    clearReviewStage('second')
    clearReviewStage('third')
  }
})
watch(() => form.second_review_result, (result) => {
  if (!hasReviewFollowup(result)) clearReviewStage('third')
})
const rules = {
  link: [{ required: true, message: '请选择链路', trigger: 'change' }],
  season: [{ validator: (_rule, value, callback) => !requiresSeason(form.link) || value ? callback() : callback(new Error('请选择期数')), trigger: 'change' }],
  category: [{ required: true, message: '请选择品类', trigger: 'change' }],
  image_url: [{ validator: (_rule, value, callback) => form.link === '外采' || hasImages(value) ? callback() : callback(new Error('请上传参考图')), trigger: 'change' }],
  physical_image_url: [{ validator: (_rule, value, callback) => form.link !== '外采' || hasImages(value) ? callback() : callback(new Error('请上传实物图')), trigger: 'change' }],
  designer: [{ required: true, message: '请选择设计师', trigger: 'change' }],
  size: [{ validator: (_rule, value, callback) => !isConventionalStyleLink.value || hasRequiredFitSize(value) ? callback() : callback(new Error('尺码至少包含宽松、合体或修身')), trigger: 'change' }],
}
const regularImageFields = [
  { key: 'image_url', label: '参考图' }, { key: 'physical_image_url', label: '实物图' },
  { key: 'design_image_url', label: '设计图' }, { key: 'front_back_image_url', label: '正反图' }, { key: 'composition_image_url', label: '成分图片' }, { key: 'size_chart_url', label: '尺码表' }, { key: 'processing_fee_image_url', label: '加工费明细' },
]
const externalPurchaseImageFields = [
  { key: 'physical_image_url', label: '实物图' }, { key: 'price_image_url', label: '价格图' },
  { key: 'front_back_image_url', label: '正反图' }, { key: 'composition_image_url', label: '成分图片' }, { key: 'size_chart_url', label: '尺码表' },
]
const imageFields = computed(() => form.link === '外采' ? externalPurchaseImageFields : regularImageFields)
const allImageFields = [...regularImageFields, ...externalPurchaseImageFields]
const matchingFields = Array.from({ length: 3 }, (_, index) => ({
  number: index + 1,
  image: `matching_image_${index + 1}`,
  sku: `matching_sku_${index + 1}`,
  progress: `matching_progress_${index + 1}`,
}))
const matchingProgressOptions = ['已搭配', '已拍照', '已AI拍照', '已AI生图']
const productImageKeys = [...new Set(['image_url', 'physical_image_url', 'design_image_url', 'front_back_image_url', 'size_chart_url', 'processing_fee_image_url', 'price_image_url', 'composition_image_url', 'pattern_reference_image_url', 'pattern_complete_image_url', 'first_review_opinion_image_url', 'second_review_opinion_image_url', 'third_review_opinion_image_url', ...matchingFields.map((item) => item.image), ...allImageFields.map((item) => item.key)])]
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
function beforeMatchingImageUpload(field, file) {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
    ElMessage.error('图片仅支持 JPG、PNG、WEBP 或 GIF 格式')
    return false
  }
  matchingImageUploading[field] = (matchingImageUploading[field] || 0) + 1
  return true
}
function finishMatchingImageUpload(field) {
  matchingImageUploading[field] = Math.max(0, (matchingImageUploading[field] || 1) - 1)
}
function handleMatchingImageUpload(result, field) {
  finishMatchingImageUpload(field)
  if (!result?.url) return ElMessage.error(result?.message || '搭配图上传失败')
  form[field] = [...imageList(form[field]), result.url]
}
function handleMatchingImageUploadError(field) {
  finishMatchingImageUpload(field)
  ElMessage.error('搭配图上传失败')
}
function removeMatchingImage(field, index) {
  form[field] = imageList(form[field]).filter((_, imageIndex) => imageIndex !== index)
}
function updateMatchingScroll(event, field) {
  const strip = event.currentTarget
  if (matchingScrollFrames.has(field)) return
  matchingScrollFrames.set(field, requestAnimationFrame(() => {
    const maxScroll = strip.scrollWidth - strip.clientWidth
    matchingScrollProgress[field] = maxScroll > 0 ? strip.scrollLeft / maxScroll : 0
    matchingScrollFrames.delete(field)
  }))
}
function matchingScrollbarThumbStyle(field, groupNumber) {
  const imageCount = imageList(form[field]).length
  const contentWidth = imageCount * 96 + Math.max(0, imageCount - 1) * 12
  const viewportWidth = groupNumber === 3 ? 636 : 312
  const thumbWidth = Math.max(24, Math.min(100, (viewportWidth / contentWidth) * 100))
  return { width: `${thumbWidth}%`, left: `${(100 - thumbWidth) * (matchingScrollProgress[field] || 0)}%` }
}
function startMatchingScrollbarDrag(event) {
  if (event.button !== 0) return
  const track = event.currentTarget
  const strip = track.closest('.matching-image-row')?.querySelector('.matching-image-strip')
  const thumb = track.querySelector('.matching-image-scroll-thumb')
  if (!strip || !thumb) return

  event.preventDefault()
  const trackBounds = track.getBoundingClientRect()
  const thumbBounds = thumb.getBoundingClientRect()
  const maxThumbLeft = trackBounds.width - thumbBounds.width
  const maxScroll = strip.scrollWidth - strip.clientWidth
  if (maxThumbLeft <= 0 || maxScroll <= 0) return

  const startedOnThumb = event.target === thumb
  const pointerOffset = startedOnThumb ? event.clientX - thumbBounds.left : thumbBounds.width / 2
  const moveThumb = (clientX) => {
    const thumbLeft = Math.max(0, Math.min(maxThumbLeft, clientX - trackBounds.left - pointerOffset))
    strip.scrollLeft = (thumbLeft / maxThumbLeft) * maxScroll
  }
  let dragFrame = 0
  let latestClientX = event.clientX
  const handlePointerMove = (pointerEvent) => {
    latestClientX = pointerEvent.clientX
    if (dragFrame) return
    dragFrame = requestAnimationFrame(() => {
      dragFrame = 0
      moveThumb(latestClientX)
    })
  }
  const stopDragging = () => {
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', stopDragging)
    window.removeEventListener('pointercancel', stopDragging)
    if (dragFrame) cancelAnimationFrame(dragFrame)
    moveThumb(latestClientX)
  }
  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', stopDragging, { once: true })
  window.addEventListener('pointercancel', stopDragging, { once: true })
  if (!startedOnThumb) moveThumb(event.clientX)
}
function createImageSection(key, title, value) {
  const urls = imageList(value).filter((url) => !/\.prj(?:[?#]|$)/i.test(url))
  if (!urls.length) return null
  return {
    key,
    title,
    entries: urls.map((url, index) => ({ key: `${key}-${index}-${url}`, label: urls.length > 1 ? `${title} ${index + 1}` : title, url })),
  }
}
const imageDetailsGroups = computed(() => {
  const baseFields = [...new Map(allImageFields.map((field) => [field.key, field])).values()]
  const groups = [
    { key: 'base', title: '', sections: baseFields.map(({ key, label }) => createImageSection(key, label, form[key])).filter(Boolean) },
    { key: 'pattern', title: '图案与纸样', sections: [
      ['pattern_reference_image_url', '图案参考图'], ['pattern_complete_image_url', '图案完成样式'],
      ['first_pattern_image_url', '头版纸样图'], ['second_pattern_image_url', '复版纸样图'],
      ['third_pattern_image_url', '三版纸样图'], ['final_pattern_image_url', '最终纸样图'],
    ].map(([key, title]) => createImageSection(key, title, form[key])).filter(Boolean) },
    { key: 'review', title: '审核意见', sections: [
      ['first_review_opinion_image_url', '头版审核意见'], ['second_review_opinion_image_url', '复版审核意见'],
      ['third_review_opinion_image_url', '三版审核意见'],
    ].map(([key, title]) => createImageSection(key, title, form[key])).filter(Boolean) },
    { key: 'matching', title: '', sections: matchingFields.map((field) => createImageSection(field.image, `已搭配图${field.number}`, form[field.image])).filter(Boolean) },
    { key: 'fabric', title: '面料资料', sections: form.fabric_records.flatMap((record, index) => {
      const recordName = [record.supplier, record.code, record.color_code].filter(Boolean).join(' / ') || `面料${index + 1}`
      return [
        createImageSection(`fabric-${index}-color`, `${recordName} 色卡`, record.color_card_image_url),
        createImageSection(`fabric-${index}-report`, `${recordName} 检测报告`, record.inspection_report_url),
      ].filter(Boolean)
    }) },
  ]
  return groups.filter((group) => group.sections.length)
})
const imageDetailsCount = computed(() => imageDetailsGroups.value.reduce((total, group) => total + group.sections.reduce((sectionTotal, section) => sectionTotal + section.entries.length, 0), 0))
const documentPreviewTitle = computed(() => documentPreviewType.value === 'material' ? '物料单预览' : '版单预览')
async function openDocumentPreview(type) {
  documentPreviewType.value = type
  documentPreviewHtml.value = ''
  documentPreviewReady.value = false
  documentPreviewVisible.value = true
  documentPreviewLoading.value = true
  try {
    const response = await fetch(`/api/exports/${type}/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product: { ...form } }),
    })
    if (!response.ok) {
      const result = await readResponse(response)
      throw new Error(result.message || 'Excel预览生成失败')
    }
    documentPreviewHtml.value = await response.text()
  } catch (error) {
    ElMessage.error(error.message || 'Excel预览生成失败')
    documentPreviewVisible.value = false
  } finally {
    documentPreviewLoading.value = false
  }
}
async function downloadStyleDocument() {
  if (documentDownloading.value) return
  documentDownloading.value = true
  try {
    const response = await fetch(`/api/exports/${documentPreviewType.value}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product: { ...form } }),
    })
    if (!response.ok) {
      const result = await readResponse(response)
      throw new Error(result.message || 'Excel生成失败')
    }
    const file = await response.blob()
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    const prefix = documentPreviewType.value === 'material' ? '物料单' : '版单'
    link.href = url
    const safeSku = String(form.sku || '未命名').replace(/[\\/:*?"<>|]/g, '_')
    link.download = `${prefix}_${safeSku}.xlsx`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    ElMessage.success('Excel已生成并开始下载')
  } catch (error) {
    ElMessage.error(error.message || 'Excel生成失败')
  } finally {
    documentDownloading.value = false
  }
}
function printStyleDocument() {
  if (documentPreviewLoading.value || !documentPreviewHtml.value || !documentPreviewReady.value) return
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    ElMessage.error('打印窗口被浏览器拦截，请允许当前页面打开弹窗后重试')
    return
  }
  let hasPrinted = false
  const print = () => {
    if (hasPrinted || printWindow.closed) return
    hasPrinted = true
    printWindow.focus()
    printWindow.print()
  }
  printWindow.document.open()
  printWindow.document.write(documentPreviewHtml.value)
  printWindow.document.close()
  printWindow.addEventListener('afterprint', () => printWindow.close(), { once: true })
  printWindow.addEventListener('load', print, { once: true })
  window.setTimeout(print, 300)
}
function serializeImageValue(value) {
  const images = imageList(value)
  return images.length > 1 ? JSON.stringify(images) : (images[0] || '')
}
async function confirmLinkChange(nextLink) {
  if (nextLink === form.link) return
  try {
    await ElMessageBox.confirm('是否确认更改款式链路？', '确认更改链路', {
      type: 'warning', confirmButtonText: '确认更改', cancelButtonText: '取消', lockScroll: false,
    })
    form.link = nextLink || ''
  } catch {
    // Cancel keeps the existing link unchanged.
  }
}
async function handleCancelSelection(value) {
  if (value !== true) {
    form.is_canceled = value === false ? false : null
    return
  }
  if (Boolean(form.is_canceled)) return
  try {
    await ElMessageBox.confirm('确认将此款式标记为取消？之后可随时改回“否”。', '确认取消款式', {
      type: 'warning', confirmButtonText: '确认取消', cancelButtonText: '暂不取消', lockScroll: false,
    })
    form.is_canceled = true
  } catch {
    // Keep the current value when cancellation is dismissed.
  }
}
watch(() => form.link, (link, previousLink) => {
  if (previousLink) nextTick(() => formRef.value?.clearValidate(['season', 'image_url', 'physical_image_url']))
})
const fabricFields = [
  { key: 'supplier', label: '供应商', type: 'text' }, { key: 'code', label: '编号', type: 'text' }, { key: 'unit', label: '单位', type: 'unit' },
  { key: 'color_code', label: '色号', type: 'text' }, { key: 'width', label: '幅宽', type: 'number', precision: 0 }, { key: 'quote', label: '单价', type: 'number', precision: 2 }, { key: 'weight_difference', label: '空差', type: 'number', precision: 2 },
  { key: 'meterage', label: '出米数', type: 'number', precision: 2 }, { key: 'usage_amount', label: '用量', type: 'number', precision: 2 }, { key: 'net_weight', label: '净重', type: 'number', precision: 2 },
  { key: 'color_card_image_url', label: '色卡', image: true },
  { key: 'inspection_report_url', label: '检测报告', image: true },
]
const fabricUnitOptions = ['米数', '码数', '足码', '单价公斤', '公斤']
const fabricBaseFieldKeys = new Set(['supplier', 'code', 'unit', 'color_code', 'width', 'color_card_image_url', 'inspection_report_url'])
const fabricUnitFieldKeys = computed(() => {
  const unit = fabricForm.unit
  const keys = new Set(fabricBaseFieldKeys)
  if (unit) keys.add('usage_amount')
  if (unit === '米数' || unit === '码数') {
    keys.add('quote')
    keys.add('weight_difference')
  } else if (unit === '足码') {
    keys.add('quote')
  } else if (unit === '单价公斤') {
    keys.add('quote')
  } else if (unit === '公斤') {
    keys.add('quote')
    keys.add('net_weight')
    keys.add('weight_difference')
    keys.add('meterage')
  }
  return keys
})
const visibleFabricFields = computed(() => fabricFields.filter((field) => !field.image && fabricUnitFieldKeys.value.has(field.key)))
const fabricTableUnits = computed(() => new Set(form.fabric_records.map((record) => record.unit).filter(Boolean)))
function showFabricTableField(field) {
  const units = fabricTableUnits.value
  if (field === 'quote') return [...units].some((unit) => ['米数', '码数', '足码', '单价公斤', '公斤'].includes(unit))
  if (field === 'weight_difference') return [...units].some((unit) => ['米数', '码数', '公斤'].includes(unit))
  if (field === 'net_weight' || field === 'meterage') return units.has('公斤')
  return false
}
const accessoryOptions = ['拉链', '纽扣', '织带', '里布', '衬布', '松紧带', '装饰']
const craftTypes = ['工艺', '附加工艺', '定制螺纹']
const craftType = ref('工艺')
const craftTypeOrder = new Map(craftTypes.map((type, index) => [type, index]))
const craftRecordsByType = computed(() => [...form.craft_records].sort((a, b) => (craftTypeOrder.get(a.type) ?? craftTypes.length) - (craftTypeOrder.get(b.type) ?? craftTypes.length)))
function costNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}
const fabricCostTotal = computed(() => form.fabric_records.reduce((total, record) => total + costNumber(record.cost), 0))
const accessoryCostTotal = computed(() => form.accessory_records.reduce((total, record) => total + costNumber(record.cost), 0))
const craftCostTotal = computed(() => form.craft_records.reduce((total, record) => total + costNumber(record.price), 0))
const processingCostTotal = computed(() => costNumber(form.processing_fee))
const isAiLink = computed(() => ['AI款', 'AI外发款', 'AI', 'AI外发'].includes(form.link))
const totalCost = computed(() => form.link === '外采'
  ? costNumber(form.price)
  : processingCostTotal.value + fabricCostTotal.value + accessoryCostTotal.value + craftCostTotal.value)
function costLabel(value) { return costNumber(value).toFixed(2) }
function emptyFabricRecord() { return Object.fromEntries(fabricFields.filter((field) => !field.spacer).map((field) => [field.key, ''])) }
const accessoryFields = [
  { key: 'supplier', label: '供应商', type: 'text' },
  { key: 'accessory', label: '辅料', type: 'accessory' },
  { key: 'specification', label: '规格', type: 'text' },
  { key: 'color', label: '颜色', type: 'text' },
  { key: 'unit', label: '单位', type: 'unit' },
  { key: 'unit_price', label: '单价', type: 'number', precision: 2 },
  { key: 'usage_amount', label: '用量', type: 'number', precision: 2 },
]
function emptyAccessoryRecord() { return Object.fromEntries(accessoryFields.map((field) => [field.key, ''])) }
function numericFabricValue(value) {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}
function calculateFabricCost(record) {
  const quote = numericFabricValue(record.quote)
  const usage = numericFabricValue(record.usage_amount)
  const gap = numericFabricValue(record.weight_difference)
  if (quote === null) return ''

  if (record.unit === '公斤') {
    const netWeight = numericFabricValue(record.net_weight)
    const meterage = numericFabricValue(record.meterage)
    if (usage === null || netWeight === null || gap === null || meterage === null) return ''
    const adjustedWeight = netWeight - gap
    if (netWeight <= 0 || adjustedWeight <= 0 || meterage <= 0) return ''
    const cost = quote * netWeight / adjustedWeight / meterage * usage * 1.12
    return Number.isFinite(cost) ? Number(cost.toFixed(2)) : ''
  }

  if (usage === null) return ''

  let baseCost
  if (record.unit === '米数' || record.unit === '码数') {
    if (gap === null || gap === 0) return ''
    baseCost = record.unit === '码数' ? quote / gap / 0.9144 : quote / gap
  } else if (record.unit === '足码') {
    baseCost = quote
  } else if (record.unit === '单价公斤') {
    baseCost = quote
  } else {
    return ''
  }

  const cost = baseCost * usage * 1.12
  return Number.isFinite(cost) ? Number(cost.toFixed(2)) : ''
}
const fabricForm = reactive(emptyFabricRecord())
function openFabricDialog(index = -1) {
  editingFabricIndex.value = index
  Object.assign(fabricForm, emptyFabricRecord(), index >= 0 ? form.fabric_records[index] : {})
  fabricDialogVisible.value = true
}
async function saveFabricRecord() {
  const valid = await fabricFormRef.value?.validate().catch(() => true)
  if (valid === false) return
  const record = editingFabricIndex.value >= 0 ? { ...form.fabric_records[editingFabricIndex.value] } : { cost: '' }
  for (const field of fabricFields) if (!field.spacer) record[field.key] = fabricForm[field.key] ?? ''
  record.cost = calculateFabricCost(record)
  if (editingFabricIndex.value >= 0) {
    form.fabric_records.splice(editingFabricIndex.value, 1, record)
  } else {
    form.fabric_records.push(record)
  }
  fabricDialogVisible.value = false
  ElMessage.success(editingFabricIndex.value >= 0 ? '面料信息已更新' : '面料信息已添加')
  editingFabricIndex.value = -1
}
async function removeFabricRecord(index) {
  try {
    await ElMessageBox.confirm('删除后该面料信息将无法恢复，确定要删除吗？', '删除面料', {
      type: 'warning',
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      lockScroll: false,
    })
    form.fabric_records.splice(index, 1)
    ElMessage.success('面料信息已删除')
  } catch {
    // 用户取消删除时保持当前列表不变。
  }
}
function calculateAccessoryCost(record) {
  const unitPrice = numericFabricValue(record.unit_price)
  const usageAmount = numericFabricValue(record.usage_amount)
  if (unitPrice === null || usageAmount === null) return ''
  const cost = unitPrice * usageAmount
  return Number.isFinite(cost) ? Number(cost.toFixed(2)) : ''
}
function openAccessoryDialog(index = -1) {
  editingAccessoryIndex.value = index
  Object.assign(accessoryForm, emptyAccessoryRecord(), index >= 0 ? form.accessory_records[index] : {})
  accessoryDialogVisible.value = true
}
const accessoryForm = reactive(emptyAccessoryRecord())
async function saveAccessoryRecord() {
  const valid = await accessoryFormRef.value?.validate().catch(() => true)
  if (valid === false) return
  const record = editingAccessoryIndex.value >= 0 ? { ...form.accessory_records[editingAccessoryIndex.value] } : {}
  for (const field of accessoryFields) record[field.key] = accessoryForm[field.key] ?? ''
  record.cost = calculateAccessoryCost(record)
  if (editingAccessoryIndex.value >= 0) form.accessory_records.splice(editingAccessoryIndex.value, 1, record)
  else form.accessory_records.push(record)
  accessoryDialogVisible.value = false
  ElMessage.success(editingAccessoryIndex.value >= 0 ? '辅料信息已更新' : '辅料信息已添加')
  editingAccessoryIndex.value = -1
}
async function removeAccessoryRecord(index) {
  try {
    await ElMessageBox.confirm('删除后该辅料信息将无法恢复，确定要删除吗？', '删除辅料', {
      type: 'warning',
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      lockScroll: false,
    })
    form.accessory_records.splice(index, 1)
    ElMessage.success('辅料信息已删除')
  } catch {
    // 用户取消删除时保持当前列表不变。
  }
}
const craftForm = reactive({ type: '工艺', factory: '', process: '', price: 0 })
const craftRules = {
  factory: [{ required: true, message: '请输入工厂', trigger: 'blur' }],
  process: [{ required: true, message: '请输入工艺', trigger: 'blur' }],
}
function emptyCraftRecord() { return { type: craftType.value, factory: '', process: '', price: 0 } }
function openCraftDialog(index = -1) {
  editingCraftIndex.value = index
  Object.assign(craftForm, emptyCraftRecord(), index >= 0 ? craftRecordsByType.value[index] : {})
  craftDialogVisible.value = true
}
async function saveCraftRecord() {
  const valid = await craftFormRef.value?.validate().catch(() => false)
  if (valid === false) return
  const record = { type: craftForm.type, factory: craftForm.factory.trim(), process: craftForm.process.trim(), price: Number(craftForm.price || 0) }
  if (editingCraftIndex.value >= 0) {
    const original = craftRecordsByType.value[editingCraftIndex.value]
    const index = form.craft_records.indexOf(original)
    if (index >= 0) form.craft_records.splice(index, 1, { ...original, ...record })
  } else {
    form.craft_records.push(record)
  }
  craftDialogVisible.value = false
  ElMessage.success(editingCraftIndex.value >= 0 ? '工艺信息已更新' : '工艺信息已添加')
  editingCraftIndex.value = -1
}
async function removeCraftRecord(record) {
  try {
    await ElMessageBox.confirm('删除后该工艺信息将无法恢复，确定要删除吗？', '删除工艺', {
      type: 'warning', confirmButtonText: '确定删除', cancelButtonText: '取消', lockScroll: false,
    })
    const index = form.craft_records.indexOf(record)
    if (index >= 0) form.craft_records.splice(index, 1)
    ElMessage.success('工艺信息已删除')
  } catch {
    // 用户取消删除时保持当前列表不变。
  }
}
function priorityLabel(priority) { return priority || '—' }
function boardProgressLabel(progress, maker) {
  return String(maker || '').trim() ? '车板已完成' : (progress || '车板未完成')
}
function isReviewRejected(prefix) {
  return String(form[`${prefix}_review_result`] || '').startsWith('未通过')
}
function canReviewStage(prefix) {
  if (prefix === 'first' && (
    form.second_pattern_progress === '纸样已完成'
    || boardProgressLabel(form.second_board_progress, form.second_board_maker) === '车板已完成'
  )) return false
  return form[`${prefix}_pattern_progress`] === '纸样已完成'
    && boardProgressLabel(form[`${prefix}_board_progress`], form[`${prefix}_board_maker`]) === '车板已完成'
}
const patternOptions = [{ label: '有图案', value: true }, { label: '有工艺', value: false }]
const designPatternProgressOptions = ['未开始', '设计中', '待确认', '已完成']
const trackedFields = [
  'id', 'sku', 'release_date', 'season', 'category', 'designer', 'designer_assistant', 'pattern_maker', 'link', 'season_type', 'color', 'composition', 'size',
  'highlights', 'priority', 'style_progress', 'pattern_progress', 'material_notified', 'material_arrived', 'material_outsourced', 'first_pattern_progress', 'first_board_progress', 'first_board_maker', 'first_review_result', 'first_review_opinion_image_url', 'second_pattern_progress', 'second_board_progress', 'second_board_maker', 'second_review_result', 'second_review_opinion_image_url', 'third_pattern_progress', 'third_board_progress', 'third_board_maker', 'third_review_result', 'third_review_opinion_image_url', 'preproduction_sample', 'preproduction_board_progress', 'preproduction_board_maker', 'has_pattern', 'pattern_notes', 'pattern_reference_image_url', 'pattern_complete_style', 'pattern_complete_image_url', 'design_pattern_progress', 'design_pattern_notes', 'image_url', 'physical_image_url', 'design_image_url', 'front_back_image_url',
  'size_chart_url', 'processing_fee_image_url', 'processing_fee', 'pricing', 'price', 'reference_sales', 'stock', 'status', 'description', 'price_image_url', 'composition_image_url', 'external_purchase_notes', 'external_purchase_progress', 'is_canceled', 'supplier', 'channel', 'address', 'contact', 'product_url', 'reference_link', 'official_matching_sku',
  ...matchingFields.flatMap(({ image, sku, progress }) => [image, sku, progress]),
  'fabric_records', 'accessory_records', 'craft_records',
]
const trackedFieldLabels = {
  sku: '款号', release_date: '上新日期', season: '期数', category: '品类', designer: '设计师', designer_assistant: '设计师助理', pattern_maker: '纸样师', link: '链路', season_type: '季节', color: '颜色', composition: '成分', size: '尺码', highlights: '产品亮点', priority: '优先级', style_progress: '总进度', pattern_progress: '图案进度', material_notified: '是否通知', material_arrived: '是否到料', material_outsourced: '是否外发',
  first_pattern_progress: '一版纸样进度', first_board_progress: '一版车板进度', first_board_maker: '一版车板师', first_review_result: '一版审核结果', first_review_opinion_image_url: '头版-审核意见', second_pattern_progress: '二版纸样进度', second_board_progress: '二版车板进度', second_board_maker: '二版车板师', second_review_result: '二版审核结果', second_review_opinion_image_url: '复版-审核意见', third_pattern_progress: '三版纸样进度', third_board_progress: '三版车板进度', third_board_maker: '三版车板师', third_review_result: '三版审核结果', third_review_opinion_image_url: '三版-审核意见', preproduction_sample: '产前样', preproduction_board_progress: '产前样车板进度', preproduction_board_maker: '产前样车板师', has_pattern: '图案/工艺', pattern_notes: '打板注意事项', pattern_reference_image_url: '图案参考图', pattern_complete_style: '图案完成样式', pattern_complete_image_url: '图案完成图片', design_pattern_progress: '图案进度', design_pattern_notes: '图案备注',
  image_url: '参考图', physical_image_url: '实物图', design_image_url: '设计图', front_back_image_url: '正反图', size_chart_url: '尺码表', processing_fee_image_url: '加工费明细', processing_fee: '加工费', pricing: '定价', price: '价格', reference_sales: '参考销量', stock: '库存', status: '状态', description: '描述', price_image_url: '价格图', composition_image_url: '成分图片', external_purchase_notes: '备注', external_purchase_progress: '外采进度', is_canceled: '是否取消', supplier: '供应商', channel: '渠道', address: '地址', contact: '联系方式', product_url: '产品链接', reference_link: '参考链接', official_matching_sku: '官搭款号', matching_image_1: '搭配图一', matching_sku_1: '搭配款号一', matching_progress_1: '搭配进度一', matching_image_2: '搭配图二', matching_sku_2: '搭配款号二', matching_progress_2: '搭配进度二', matching_image_3: '搭配图三', matching_sku_3: '搭配款号三', matching_progress_3: '搭配进度三', fabric_records: '面料信息', accessory_records: '辅料信息', craft_records: '工艺信息',
}
const formSnapshot = () => JSON.stringify(Object.fromEntries(trackedFields.map((field) => [field, form[field] ?? ''])))
const hasUnsavedChanges = () => Boolean(initialSnapshot.value) && formSnapshot() !== initialSnapshot.value
function reviewApprovalChangedToPass() {
  if (!isConventionalStyleLink.value) return false
  let initial = {}
  try { initial = JSON.parse(initialSnapshot.value || '{}') } catch { initial = {} }
  return ['first_review_result', 'second_review_result', 'third_review_result']
    .some((field) => form[field] === '通过' && initial[field] !== '通过')
}
function changedFieldLabels() {
  let initialValues = {}
  try { initialValues = JSON.parse(initialSnapshot.value || '{}') } catch { return [] }
  return trackedFields
    .filter((field) => field !== 'id' && JSON.stringify(form[field] ?? '') !== JSON.stringify(initialValues[field] ?? ''))
    .map((field) => trackedFieldLabels[field] || field)
}
function markFieldsSaved(fields) {
  let initialValues = {}
  try { initialValues = JSON.parse(initialSnapshot.value || '{}') } catch { return }
  for (const field of fields) initialValues[field] = form[field] ?? ''
  initialSnapshot.value = JSON.stringify(initialValues)
}
function missingRequiredFields() {
  const missing = []
  if (!form.link) missing.push('链路')
  if (requiresSeason(form.link) && !form.season) missing.push('期数')
  if (!form.category) missing.push('品类')
  if (!form.designer) missing.push('设计师')
  if (form.link === '外采' ? !hasImages(form.physical_image_url) : !hasImages(form.image_url)) missing.push(form.link === '外采' ? '实物图' : '参考图')
  return missing
}
async function readResponse(response) {
  const text = await response.text()
  if (!text) return {}
  try { return JSON.parse(text) } catch { return { message: '服务器返回了无效数据' } }
}
async function loadOptions() {
  const [categoryResponse, designerResponse] = await Promise.all([fetch('/api/categories'), fetch('/api/designers')])
  const categoryResult = await readResponse(categoryResponse)
  const designerResult = await readResponse(designerResponse)
  if (!categoryResponse.ok) throw new Error(categoryResult.message || '品类加载失败')
  if (!designerResponse.ok) throw new Error(designerResult.message || '设计师加载失败')
  categories.value = categoryResult.data || []
  designers.value = designerResult.data || []
}
function applyDesignerAssistant(designerName) {
  form.designer_assistant = designers.value.find((designer) => designer.name === designerName)?.designer_assistant || ''
}
async function loadProduct() {
  loading.value = true
  try {
    const response = await fetch('/api/products/' + encodeURIComponent(route.params.id))
    const result = await readResponse(response)
    if (!response.ok) throw new Error(result.message || '款式详情加载失败')
    Object.assign(form, result)
    form.release_date = result.release_date ? String(result.release_date).slice(0, 10) : ''
    form.season = result.season ? String(result.season).slice(0, 10) : ''
    form.price = Number(result.price || 0)
    form.pricing = Number(result.pricing || 0)
    form.processing_fee = Number(result.processing_fee || 0)
    form.stock = Number(result.stock || 0)
    form.has_pattern = result.has_pattern === null || result.has_pattern === undefined ? '' : Boolean(result.has_pattern)
    form.size = result.size ? String(result.size).split(',').map((item) => item.trim()).filter(Boolean) : []
    form.fabric_records = Array.isArray(result.fabric_records) ? result.fabric_records : []
    form.accessory_records = Array.isArray(result.accessory_records) ? result.accessory_records : []
    form.craft_records = Array.isArray(result.craft_records) ? result.craft_records : []
    for (const field of ['sku', 'category', 'designer', 'designer_assistant', 'pattern_maker', 'link', 'season_type', 'color', 'composition', 'highlights', 'priority', 'style_progress', 'pattern_progress', 'material_notified', 'material_arrived', 'material_outsourced', 'first_pattern_progress', 'first_board_progress', 'first_board_maker', 'first_review_result', 'first_review_opinion_image_url', 'second_pattern_progress', 'second_board_progress', 'second_board_maker', 'second_review_result', 'second_review_opinion_image_url', 'third_pattern_progress', 'third_board_progress', 'third_board_maker', 'third_review_result', 'third_review_opinion_image_url', 'preproduction_sample', 'preproduction_board_progress', 'preproduction_board_maker', 'pattern_notes', 'pattern_reference_image_url', 'pattern_complete_style', 'pattern_complete_image_url', 'design_pattern_progress', 'design_pattern_notes', 'external_purchase_notes', 'external_purchase_progress', 'is_canceled', 'supplier', 'channel', 'address', 'contact', 'product_url', 'reference_link', 'official_matching_sku', ...matchingFields.flatMap(({ image, sku, progress }) => [image, sku, progress]), ...allImageFields.map((item) => item.key)]) form[field] = result[field] ?? ''
    form.is_canceled = result.is_canceled === null || result.is_canceled === undefined ? '' : Boolean(result.is_canceled)
    for (const field of ['material_notified', 'material_arrived', 'material_outsourced']) form[field] = result[field] === null || result[field] === undefined ? '' : Boolean(result[field])
    form.style_progress = result.style_progress || '选图'
    form.style_progress_times = result.style_progress_times || {}
    form.priority = result.priority || ''
    syncSavedProgressData(result)
    await loadOptions()
    initialSnapshot.value = formSnapshot()
  } catch (error) {
    ElMessage.error(error.message || '款式详情加载失败')
    router.push(productListReturnLocation())
  } finally { loading.value = false }
}
function beforeImageUpload(file) {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) { ElMessage.error('图片仅支持 JPG、PNG、WEBP 或 GIF 格式'); return false }
  imageUploading.value = true
  return true
}
function handleImageUpload(result, field, target = form) {
  imageUploading.value = false
  if (!result?.url) return ElMessage.error(result?.message || '图片上传失败')
  target[field] = result.url
  if (field === 'image_url' || field === 'physical_image_url') formRef.value?.validateField(field)
}
function handleImageUploadError(error) { imageUploading.value = false; ElMessage.error(error?.message || '图片上传失败') }
function removeImage(field, target = form) { target[field] = ''; if (field === 'image_url' || field === 'physical_image_url') formRef.value?.validateField(field) }
function openImagePreview(url, label) { previewImageUrl.value = url; previewImageLabel.value = label; previewVisible.value = true }
function closeImagePreview() { previewVisible.value = false; previewImageUrl.value = ''; previewImageLabel.value = '' }
function handlePreviewKeydown(event) { if (event.key === 'Escape') closeImagePreview() }
function productListReturnLocation() {
  const returnTo = typeof route.query.return_to === 'string' ? route.query.return_to : ''
  if (returnTo.startsWith('/back/')) {
    const resolved = router.resolve(returnTo)
    if (resolved.path === '/back/products' && route.query.return_release_date_filter) {
      return { path: resolved.path, query: { ...resolved.query, release_date_filter: route.query.return_release_date_filter } }
    }
    return returnTo
  }
  const query = {}
  for (const key of ['style_view', 'style_progress', 'style_group', 'progress_from', 'progress_to']) {
    const value = route.query[`return_${key}`]
    if (value) query[key] = value
  }
  return { path: '/back/products', query }
}
function handleSkuBlur() {
  clearTimeout(skuAutoSaveTimer)
  if (!['外采', 'AI款', 'AI外发款', 'AI', 'AI外发'].includes(form.link)
    || savedProgressData.style_progress !== '选图' || !hasStyleNumber(form.sku) || hasStyleNumber(savedProgressData.sku)) return
  skuAutoSaveTimer = window.setTimeout(() => {
    if (!saving.value && hasUnsavedChanges()) saveProduct(false)
  }, 250)
}
async function advanceStyleProgress() {
  if (advancingProgress.value) return
  // 进度按钮也承担保存当前修改的职责。先落库，再根据最新链路和资料重新计算下一阶段。
  const hasDraftChanges = hasUnsavedChanges() || form.link !== savedProgressData.link || form.sku !== savedProgressData.sku
  if (hasDraftChanges) {
    advancingProgress.value = true
    try {
      const saved = await saveProduct(false, false, { skipValidation: true, silent: true })
      if (!saved) return
    } finally {
      advancingProgress.value = false
    }
  }
  if (!nextStyleProgress.value) return
  const targetProgress = nextStyleProgress.value
  const confirmingExternalArrival = currentStyleProgress.value === '待外采' && targetProgress === '待排期' && form.link === '外采'
  const completingOutsource = currentStyleProgress.value === '待外发' && targetProgress === '待排期' && ['外发', '转自研外发'].includes(String(form.link || '').trim())
  const completingFollowUpOutsource = currentStyleProgress.value === '外发中' && targetProgress === '完成' && ['AI外发款', 'AI外发'].includes(String(form.link || '').trim())
  const startingFollowUpOutsource = showFollowUpOutsourceStartButton.value
  if (showFollowUpPatternStartButton.value && !followUpPatternNotesReady.value) {
    ElMessage.warning('请先填写：打板注意事项')
    return
  }
  if (startingFollowUpOutsource && !followUpPatternNotesReady.value) {
    ElMessage.warning('请先填写：打板注意事项')
    return
  }
  if (confirmingExternalArrival && externalPurchaseMissingFields.value.length) {
    ElMessage.warning(`请先填写：${externalPurchaseMissingFields.value.join('、')}`)
    return
  }
  if (completingOutsource && externalOutsourceMissingFields.value.length) {
    ElMessage.warning(`请先填写：${externalOutsourceMissingFields.value.join('、')}`)
    return
  }
  if (currentStyleProgress.value === '预核价' && Number(form.price) <= 0) {
    ElMessage.warning('请先填写外采价格')
    return
  }
  if (['打版', '打板'].includes(nextStyleProgress.value)) {
    const missingDispatchFields = [
      ...(!hasImages(form.image_url) ? ['参考图'] : []),
      ...(!String(form.pattern_notes || '').trim() ? ['打板注意事项'] : []),
    ]
    if (missingDispatchFields.length) {
      ElMessage.warning(`请先填写：${missingDispatchFields.join('、')}`)
      return
    }
  }
  const isPatternAssignment = currentStyleProgress.value === '待到料' && targetProgress === '待打板'
  try {
    const isExternalToMatching = currentStyleProgress.value === '外发' && targetProgress === '搭配'
    const advanceMessage = confirmingExternalArrival
      ? '确认外采已到货并进入待排期吗？'
      : isPatternAssignment
      ? '确认面辅料已到料并进入待打板吗？确认后将按纸样师分配规则自动分配。'
      : completingOutsource
      ? '确认外发完成并进入待排期吗？'
      : completingFollowUpOutsource
      ? '确认外发完成并进入已完成吗？'
      : startingFollowUpOutsource
      ? '确认开始外发并进入外发中吗？'
      : ['外发', '买料'].includes(targetProgress)
      ? `确认将总进度推进到“${targetProgress}”吗？`
      : isExternalToMatching
        ? '确认外发已通过，并将总进度推进到“搭配”吗？'
      : `确认将总进度推进到“${targetProgress}”吗？`
    await ElMessageBox.confirm(
      advanceMessage,
      confirmingExternalArrival ? '确认外采到货' : completingFollowUpOutsource ? '确认外发完成' : startingFollowUpOutsource ? '确认开始外发' : isPatternAssignment ? '分配纸样师' : '确认推进进度',
      { type: 'warning', confirmButtonText: confirmingExternalArrival ? '确认到货' : startingFollowUpOutsource ? '确认外发' : isPatternAssignment ? '确认并分配' : '确认推进', cancelButtonText: '取消', lockScroll: false },
    )
  } catch {
    return
  }
  advancingProgress.value = true
  try {
    const response = await fetch(`/api/products/${encodeURIComponent(form.id)}/advance-progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        style_progress: targetProgress,
        image_url: serializeImageValue(form.image_url),
        pattern_notes: form.pattern_notes,
      }),
    })
    const result = await readResponse(response)
    if (!response.ok) throw new Error(result.message || '进度更新失败')
    savedProgressData.style_progress = result.style_progress
    savedProgressData.style_progress_times = result.style_progress_times
    form.style_progress = result.style_progress
    if (result.external_purchase_progress) {
      form.external_purchase_progress = result.external_purchase_progress
      savedProgressData.external_purchase_progress = result.external_purchase_progress
      markFieldsSaved(['external_purchase_progress'])
    }
    if (result.material_arrived === true) {
      form.material_arrived = true
      savedProgressData.material_arrived = true
      markFieldsSaved(['material_arrived'])
    }
    if (result.material_outsourced === true) {
      form.material_outsourced = true
      savedProgressData.material_outsourced = true
      markFieldsSaved(['material_outsourced'])
    }
    if (result.material_notified === true) {
      form.material_notified = true
      savedProgressData.material_notified = true
      markFieldsSaved(['material_notified'])
    }
    if (result.pattern_maker) {
      form.pattern_maker = result.pattern_maker
      savedProgressData.pattern_maker = result.pattern_maker
      form.pattern_progress = result.pattern_progress || '已分配'
      savedProgressData.pattern_progress = form.pattern_progress
      markFieldsSaved(['pattern_maker', 'pattern_progress'])
    }
    savedProgressData.image_url = form.image_url
    savedProgressData.pattern_notes = form.pattern_notes
    markFieldsSaved(['style_progress', 'image_url', 'pattern_notes'])
    if (result.pattern_waiting) {
      const waitingMessage = result.pattern_wait_reason === 'no_makers'
        ? '暂无启用的纸样师，当前款式暂留在分配中'
        : '纸样师在办任务均已达到 8 个，当前款式暂留在分配中'
      ElMessage.success(`总进度已更新到${result.style_progress}，${waitingMessage}`)
    } else {
      ElMessage.success(`总进度已更新到${result.style_progress}${result.pattern_maker ? `，已分配给${result.pattern_maker}` : ''}`)
    }
  } catch (error) {
    ElMessage.error(error.message || '进度更新失败')
  } finally {
    advancingProgress.value = false
  }
}
async function advanceToPatternAssignment() {
  if (preparingPatternAssignment.value || !showPatternAssignmentButton.value) return
  preparingPatternAssignment.value = true
  try {
    await advanceStyleProgress()
  } finally {
    preparingPatternAssignment.value = false
  }
}
async function saveProduct(redirect = false, syncRoute = true, options = {}) {
  const skipValidation = options.skipValidation === true
  const silent = options.silent === true
  if (saving.value) return false
  if (!form.link) {
    ElMessage.warning('请优先选择链路')
    return false
  }
  if (!skipValidation) {
    if (reviewApprovalChangedToPass()) {
      const missingReviewFields = reviewApprovalMissingFields(form)
      if (missingReviewFields.length) {
        ElMessage.warning('选择“通过”前请先填写：' + missingReviewFields.join('、'))
        return false
      }
    }
    const missing = missingRequiredFields()
    if (missing.length) {
      ElMessage.warning('请填写：' + missing.join('、'))
      return false
    }
  }
  saving.value = true
  try {
    const valid = skipValidation ? true : await formRef.value?.validate().catch(() => false)
    if (!valid) return false
    normalizeReviewStages()
    const payload = Object.fromEntries(Object.entries({ ...form }).map(([field, value]) => [field, value === undefined ? null : value]))
    if (!payload.release_date) payload.release_date = null
    if (payload.price === null || payload.price === '') payload.price = 0
    if (payload.has_pattern === '') payload.has_pattern = null
    if (payload.material_notified === '') payload.material_notified = null
    if (payload.material_arrived === '') payload.material_arrived = null
    if (payload.material_outsourced === '') payload.material_outsourced = null
    if (payload.is_canceled === '' || payload.is_canceled === undefined) payload.is_canceled = null
    payload.size = Array.isArray(payload.size) ? payload.size.join(',') : (payload.size || '')
    for (const field of productImageKeys) payload[field] = serializeImageValue(payload[field])
    payload.priority = priorityByLink[payload.link] || ''
    const response = await fetch('/api/products/' + form.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const result = await readResponse(response)
    if (!response.ok) throw new Error(result.message || '保存失败')
    form.style_progress = result.style_progress || '选图'
    if (['AI款', 'AI'].includes(String(form.link || '').trim())) form.pattern_progress = result.pattern_progress || '分配中'
    form.priority = result.priority || ''
    syncSavedProgressData(result)
    initialSnapshot.value = formSnapshot()
    if (!redirect && form.sku) {
      const nextPath = '/back/products/' + encodeURIComponent(form.id)
      const nextQuery = { ...route.query, sku: form.sku }
      window.dispatchEvent(new CustomEvent('workspace-tab-updated', { detail: { oldPath: route.path, path: nextPath, query: nextQuery, label: `款式-${form.sku}` } }))
      if (syncRoute) await router.replace({ path: nextPath, query: nextQuery })
    }
    if (!silent) ElMessage.success('款式详情已保存')
    if (redirect) {
      allowLeave.value = true
      await router.push(productListReturnLocation())
    }
    return true
  } catch (error) { ElMessage.error(error.message || '保存失败'); return false } finally { saving.value = false }
}
async function confirmLeave() {
  if (allowLeave.value) return true
  if (!hasUnsavedChanges()) return true
  try {
    const changedLabels = changedFieldLabels()
    const message = changedLabels.length
      ? `款式信息：<strong style="color:#ef4444">${changedLabels.join('、')}</strong>已修改，是否保存后退出？`
      : '款式信息已修改，是否保存后退出？'
    await ElMessageBox.confirm(message, '未保存的修改', { type: 'warning', confirmButtonText: '保存并退出', cancelButtonText: '不保存退出', distinguishCancelAndClose: true, dangerouslyUseHTMLString: true, lockScroll: false })
    const saved = await saveProduct(false, false)
    if (!saved) return false
    allowLeave.value = true
    return true
  } catch (error) { if (error === 'cancel') { allowLeave.value = true; return true } return false }
}
function handleBeforeUnload(event) { if (!hasUnsavedChanges() || allowLeave.value) return; event.preventDefault(); event.returnValue = '' }
onBeforeRouteLeave(() => confirmLeave())
watch(() => route.params.id, (id, previousId) => {
  if (id && id !== previousId) loadProduct()
})
onMounted(() => { window.addEventListener('beforeunload', handleBeforeUnload); window.addEventListener('keydown', handlePreviewKeydown); loadProduct() })
onBeforeUnmount(() => { clearTimeout(skuAutoSaveTimer); matchingScrollFrames.forEach(cancelAnimationFrame); matchingScrollFrames.clear(); window.removeEventListener('beforeunload', handleBeforeUnload); window.removeEventListener('keydown', handlePreviewKeydown) })
</script>

<template>
  <div v-loading="loading" class="product-detail-page" :class="{ 'status-only-page': statusOnlyMode }">
    <section class="detail-heading">
      <div class="detail-title-block">
        <div class="detail-title-row"><h1 v-if="statusOnlyMode" class="status-only-title">{{ form.sku || '款式详情' }}</h1><el-input v-else v-model="form.sku" clearable class="detail-name-input" placeholder="请输入款号" @blur="handleSkuBlur" /></div>
      </div>
      <div class="detail-section-actions"><el-button class="detail-return-button" @click="router.push(productListReturnLocation())">返回列表</el-button><el-button v-if="!statusOnlyMode && showAdvanceProgressButton" type="primary" class="progress-advance-button" :loading="advancingProgress" @click="advanceStyleProgress">{{ advanceProgressButtonLabel }}</el-button><el-button v-if="!statusOnlyMode" type="primary" class="detail-save-button" :loading="saving" @click="saveProduct(false)">保存修改</el-button></div>
    </section>
    <el-form ref="formRef" :model="form" :rules="rules" :disabled="statusOnlyMode" :hide-required-asterisk="true" label-position="top" class="detail-form">
    <section class="detail-card style-progress-card">
      <div class="card-title style-progress-card-title"><div class="style-progress-card-heading"><h2>总进度</h2><div v-if="overallProgressBadges.length" class="regular-progress-badges"><span v-for="badge in overallProgressBadges" :key="badge.label" class="regular-progress-badge" :class="badge.complete ? 'complete' : 'incomplete'">{{ badge.label }}</span></div></div><el-button v-if="!statusOnlyMode && showExternalPurchaseArrivalButton" type="primary" size="small" :loading="advancingProgress" @click="advanceStyleProgress">外采已到货</el-button><el-button v-else-if="!statusOnlyMode && showOutsourceCompletionButton" type="primary" size="small" :loading="advancingProgress" @click="advanceStyleProgress">外发完成</el-button><el-button v-else-if="!statusOnlyMode && showPatternAssignmentButton" type="primary" size="small" :loading="preparingPatternAssignment || advancingProgress" @click="advanceToPatternAssignment">分配纸样</el-button><el-button v-else-if="!statusOnlyMode && showFollowUpPatternStartButton" type="primary" size="small" :disabled="!followUpPatternNotesReady" :loading="advancingProgress" @click="advanceStyleProgress">确定打板</el-button><el-button v-else-if="!statusOnlyMode && showFollowUpOutsourceStartButton" type="primary" size="small" :disabled="!followUpPatternNotesReady" :loading="advancingProgress" @click="advanceStyleProgress">外发</el-button><el-button v-else-if="!statusOnlyMode && showFollowUpOutsourceCompletionButton" type="primary" size="small" :loading="advancingProgress" @click="advanceStyleProgress">外发完成</el-button></div>
      <div v-if="savedProgressData.style_progress === '款式取消'" class="style-progress-canceled-wrap"><span class="style-progress-canceled">款式取消</span></div>
      <div v-else class="style-progress-stepper" role="list" aria-label="款式总进度">
        <template v-for="(step, index) in savedStyleProgressSteps" :key="step">
          <div class="style-progress-step" :class="{ active: index <= savedStyleProgressSteps.indexOf(currentStyleProgress) }" role="listitem" :aria-current="step === currentStyleProgress ? 'step' : undefined"><span class="style-progress-circle">{{ index + 1 }}</span><span class="style-progress-label">{{ step === '完成' ? '已完成' : step }}</span></div>
          <span v-if="index < savedStyleProgressSteps.length - 1" class="style-progress-line" :class="{ active: index < savedStyleProgressSteps.indexOf(currentStyleProgress) }" aria-hidden="true"></span>
        </template>
      </div>
      <div v-if="!statusOnlyMode" class="progress-prompt-inline">
        <div class="card-title"><h2>操作提示</h2></div>
        <p class="progress-prompt-text">{{ progressPrompt }}</p>
      </div>
    </section>
      <div class="detail-section-layout">
        <div class="detail-main-column">
      <section class="detail-card"><div class="card-title"><h2>款式信息</h2><span>基础资料</span></div><div v-if="form.link !== '外采'" class="detail-grid">
        <el-form-item label="链路"><strong v-if="statusOnlyMode" class="status-only-value">{{ getLinkDisplayLabel(form.link) || '—' }}</strong><el-select v-else :model-value="form.link" clearable placeholder="请选择链路" class="full-width-control" @change="confirmLinkChange"><el-option v-for="item in linkOptions" :key="item" :label="getLinkDisplayLabel(item)" :value="item" /></el-select></el-form-item>
        <el-form-item label="上新日期"><el-date-picker v-model="form.release_date" clearable type="date" value-format="YYYY-MM-DD" format="YYYY年MM月DD日" placeholder="请选择上新日期" class="full-width-control" /></el-form-item>
        <el-form-item label="设计师" prop="designer"><strong v-if="statusOnlyMode" class="status-only-value">{{ form.designer || '—' }}</strong><el-select v-else v-model="form.designer" clearable placeholder="请选择设计师" class="full-width-control" @change="applyDesignerAssistant"><el-option v-for="item in designers" :key="item.id || item.name" :label="item.name" :value="item.name" /></el-select></el-form-item>
        <el-form-item label="设计师助理"><el-input v-model="form.designer_assistant" readonly placeholder="根据设计师绑定自动生成" /></el-form-item>
        <el-form-item label="品类" prop="category"><strong v-if="statusOnlyMode" class="status-only-value">{{ form.category || '—' }}</strong><el-select v-else v-model="form.category" clearable placeholder="请选择品类" class="full-width-control"><el-option v-for="item in categories" :key="item.id || item.name" :label="item.name" :value="item.name" /></el-select></el-form-item>
        <el-form-item v-if="requiresSeason(form.link)" label="期数" prop="season"><div class="season-input-row"><el-date-picker v-if="form.season !== '无排期'" v-model="form.season" clearable type="date" value-format="YYYY-MM-DD" format="YYYY年MM月DD日" placeholder="请选择期数" class="season-date-control" /><el-input v-else model-value="无排期" readonly class="season-value-control" /><el-button v-if="!statusOnlyMode && form.season !== '无排期'" class="season-toggle-button" @click="form.season = '无排期'">无排期</el-button><el-button v-else-if="!statusOnlyMode" class="season-toggle-button" @click="form.season = ''">选择日期</el-button></div></el-form-item>
        <el-form-item label="季节"><el-select v-model="form.season_type" clearable placeholder="请选择季节" class="full-width-control"><el-option v-for="item in seasonOptions" :key="item" :label="item" :value="item" /></el-select></el-form-item>
        <el-form-item label="颜色"><el-input v-model="form.color" clearable placeholder="请输入颜色" /></el-form-item>
        <el-form-item label="尺码" prop="size"><el-select v-model="form.size" clearable multiple placeholder="请选择尺码" class="full-width-control"><el-option v-for="item in sizeOptions" :key="item" :label="item" :value="item" /></el-select></el-form-item>
        <el-form-item label="成分"><el-input v-model="form.composition" clearable type="textarea" :rows="2" placeholder="请输入面料成分" /></el-form-item>
        <el-form-item label="官搭款号"><el-input v-model="form.official_matching_sku" clearable placeholder="请输入官搭款号" /></el-form-item>
        <el-form-item label="图案/工艺"><el-select v-model="form.has_pattern" clearable placeholder="请选择" class="full-width-control"><el-option v-for="item in patternOptions" :key="String(item.value)" :label="item.label" :value="item.value" /></el-select></el-form-item>
        <el-form-item label="参考链接"><el-input v-model="form.reference_link" clearable type="url" placeholder="请输入参考链接" /></el-form-item>
        <el-form-item label="产品亮点"><el-input v-model="form.highlights" clearable type="textarea" :rows="2" placeholder="请输入产品亮点" /></el-form-item>
        <el-form-item label="打板注意事项"><el-input v-model="form.pattern_notes" clearable type="textarea" :rows="2" placeholder="请输入打板注意事项" /></el-form-item>
        <el-form-item v-if="['转自研款', '转自研板房', '转自研外发'].includes(form.link)" label="外采价格"><el-input-number v-model="form.price" :min="0" :precision="2" :step="0.01" :controls="false" placeholder="请输入价格" class="full-width-control external-price-input" /></el-form-item>
        <el-form-item label="是否取消"><el-select :model-value="form.is_canceled" clearable placeholder="请选择是否取消" class="full-width-control" @change="handleCancelSelection"><el-option label="是" :value="true" /><el-option label="否" :value="false" /></el-select></el-form-item>
        <el-form-item v-if="showMaterialNotified" label="是否通知"><el-select v-model="form.material_notified" clearable placeholder="请选择是否通知" class="full-width-control"><el-option label="是" :value="true" /><el-option label="否" :value="false" /></el-select></el-form-item>
        <el-form-item v-if="showMaterialOutsourced" label="是否外发"><el-select v-model="form.material_outsourced" clearable placeholder="请选择是否外发" class="full-width-control"><el-option label="是" :value="true" /><el-option label="否" :value="false" /></el-select></el-form-item>
        <el-form-item v-if="!['外采', '外发', '转自研外发', 'AI外发款', 'AI外发'].includes(String(form.link || '').trim())" label="是否产前样"><strong v-if="statusOnlyMode" class="status-only-value">{{ form.preproduction_sample || '—' }}</strong><el-select v-else v-model="form.preproduction_sample" clearable placeholder="请选择是否产前样" class="full-width-control"><el-option v-for="item in preproductionSampleOptions" :key="item" :label="item" :value="item" /></el-select></el-form-item>
      </div><div v-else class="detail-grid">
        <el-form-item label="链路" prop="link"><strong v-if="statusOnlyMode" class="status-only-value">{{ getLinkDisplayLabel(form.link) || '—' }}</strong><el-select v-else :model-value="form.link" clearable placeholder="请选择链路" class="full-width-control" @change="confirmLinkChange"><el-option v-for="item in linkOptions" :key="item" :label="getLinkDisplayLabel(item)" :value="item" /></el-select></el-form-item>
        <el-form-item label="上新日期"><el-date-picker v-model="form.release_date" clearable type="date" value-format="YYYY-MM-DD" format="YYYY年MM月DD日" placeholder="请选择上新日期" class="full-width-control" /></el-form-item>
        <el-form-item label="设计师" prop="designer"><strong v-if="statusOnlyMode" class="status-only-value">{{ form.designer || '—' }}</strong><el-select v-else v-model="form.designer" clearable placeholder="请选择设计师" class="full-width-control" @change="applyDesignerAssistant"><el-option v-for="item in designers" :key="item.id || item.name" :label="item.name" :value="item.name" /></el-select></el-form-item>
        <el-form-item label="设计师助理"><el-input v-model="form.designer_assistant" readonly placeholder="根据设计师绑定自动生成" /></el-form-item>
        <el-form-item label="品类" prop="category"><strong v-if="statusOnlyMode" class="status-only-value">{{ form.category || '—' }}</strong><el-select v-else v-model="form.category" clearable placeholder="请选择品类" class="full-width-control"><el-option v-for="item in categories" :key="item.id || item.name" :label="item.name" :value="item.name" /></el-select></el-form-item>
        <el-form-item label="季节"><el-select v-model="form.season_type" clearable placeholder="请选择季节" class="full-width-control"><el-option v-for="item in seasonOptions" :key="item" :label="item" :value="item" /></el-select></el-form-item>
        <el-form-item label="颜色"><el-input v-model="form.color" clearable placeholder="请输入颜色" /></el-form-item>
        <el-form-item label="外采价格"><el-input-number v-model="form.price" :min="0" :precision="2" :step="0.01" :controls="false" placeholder="请输入价格" class="full-width-control external-price-input" /></el-form-item>
        <el-form-item label="尺码"><el-select v-model="form.size" clearable multiple placeholder="请选择尺码" class="full-width-control"><el-option v-for="item in sizeOptions" :key="item" :label="item" :value="item" /></el-select></el-form-item>
        <el-form-item label="成分"><el-input v-model="form.composition" clearable type="textarea" :rows="2" placeholder="请输入面料成分" /></el-form-item>
        <el-form-item label="产品亮点"><el-input v-model="form.highlights" clearable type="textarea" :rows="2" placeholder="请输入产品亮点" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="form.external_purchase_notes" clearable type="textarea" :rows="2" placeholder="请输入备注" /></el-form-item>
        <el-form-item label="是否取消"><el-select :model-value="form.is_canceled" clearable placeholder="请选择是否取消" class="full-width-control" @change="handleCancelSelection"><el-option label="是" :value="true" /><el-option label="否" :value="false" /></el-select></el-form-item>
      </div></section>
      <section v-if="form.link !== '外采'" class="detail-card cost-summary-card">
        <div class="card-title"><h2>成本</h2><span>面料、辅料和工艺费用按明细自动汇总</span></div>
        <div class="cost-summary-grid" :class="{ 'cost-summary-ai-grid': isAiLink }">
          <div class="cost-summary-item cost-summary-input"><span>加工费</span><div class="cost-input-value"><b>¥</b><el-input-number v-model="form.processing_fee" :min="0" :precision="2" :step="0.01" :controls="false" class="cost-input-control" /></div></div>
          <div class="cost-summary-item"><span>面料费</span><strong>¥{{ costLabel(fabricCostTotal) }}</strong></div>
          <div class="cost-summary-item"><span>辅料费</span><strong>¥{{ costLabel(accessoryCostTotal) }}</strong></div>
          <div class="cost-summary-item"><span>工艺费</span><strong>¥{{ costLabel(craftCostTotal) }}</strong></div>
          <div class="cost-summary-item cost-summary-input"><span>定价</span><div class="cost-input-value"><b>¥</b><el-input-number v-model="form.pricing" :min="0" :precision="2" :step="0.01" :controls="false" class="cost-input-control" /></div></div>
          <div v-if="isAiLink" class="cost-summary-item cost-summary-input"><span>AI预核价</span><div class="cost-input-value"><b>¥</b><el-input-number v-model="form.price" :min="0" :precision="2" :step="0.01" :controls="false" class="cost-input-control" @change="value => form.price = value ?? 0" /></div></div>
          <div class="cost-summary-item cost-summary-total"><span>总成本</span><strong>¥{{ costLabel(totalCost) }}</strong></div>
        </div>
      </section>
      <section v-if="form.link === '外采'" class="detail-card supplier-info-card">
        <div class="card-title"><h2>供应商信息</h2></div>
        <div class="detail-grid">
          <el-form-item label="供应商"><el-input v-model="form.supplier" clearable placeholder="请输入供应商" /></el-form-item>
          <el-form-item label="渠道"><el-input v-model="form.channel" clearable placeholder="请输入渠道" /></el-form-item>
          <el-form-item label="地址"><el-input v-model="form.address" clearable placeholder="请输入地址" /></el-form-item>
          <el-form-item label="联系方式"><el-input v-model="form.contact" clearable placeholder="请输入联系方式" /></el-form-item>
          <el-form-item label="产品链接"><el-input v-model="form.product_url" clearable type="url" placeholder="请输入产品链接" /></el-form-item>
        </div>
      </section>
      <section class="detail-card"><div class="card-title"><h2>图片资料</h2><div class="image-section-actions"><button v-if="statusOnlyMode" type="button" class="image-details-button" @click="imageDetailsVisible = true"><el-icon><Picture /></el-icon>图片详情</button><el-button v-else plain size="small" @click="imageDetailsVisible = true"><el-icon><Picture /></el-icon>图片详情</el-button></div></div><div class="image-grid">
        <div v-for="imageField in imageFields" :key="imageField.key" class="image-field"><div class="image-field-label">{{ imageField.label }}</div><div class="image-field-content">
          <ImageUploader v-model="form[imageField.key]" :label="imageField.label" :size="112" :view-only="statusOnlyMode" />
        </div></div>
      </div></section>
      <section v-if="!statusOnlyMode && isPatternSummaryVisible" class="detail-card pattern-summary-card">
        <div class="card-title"><div class="pattern-summary-title"><h2>纸样</h2><span v-if="form.pattern_maker" class="pattern-summary-maker">纸样师：{{ form.pattern_maker }}</span></div><el-button v-if="!statusOnlyMode" text class="detail-link-button" @click="router.push({ path: '/back/patterns/' + encodeURIComponent(form.id), query: { sku: form.sku, return_to: route.fullPath } })">纸样详情</el-button></div>
        <div class="pattern-summary-grid">
          <div class="pattern-summary-version-row">
            <div class="pattern-summary-field"><span>头版-纸样进度</span><strong>{{ form.first_pattern_progress || '纸样未完成' }}</strong></div>
            <div class="pattern-summary-field"><span>头版-车板进度</span><strong>{{ boardProgressLabel(form.first_board_progress, form.first_board_maker) }}</strong></div>
              <div class="pattern-summary-field" :class="{ 'pattern-summary-editable': !statusOnlyMode && canReviewStage('first') }"><span>头版-审版结果</span><strong v-if="statusOnlyMode || !canReviewStage('first')">{{ form.first_review_result || '—' }}</strong><el-select v-else v-model="form.first_review_result" clearable placeholder="请选择审版结果" class="full-width-control" @clear="handleReviewClear('first')"><el-option v-for="item in reviewResultOptions" :key="item" :label="item" :value="item" /></el-select></div>
              <div v-if="isReviewRejected('first')" class="pattern-summary-field"><span>头版-审核意见</span><ImageUploader v-model="form.first_review_opinion_image_url" label="头版-审核意见" :size="110" :view-only="statusOnlyMode" /></div>
          </div>
          <template v-if="hasReviewFollowup(form.first_review_result)">
            <div class="pattern-summary-version-row">
              <div class="pattern-summary-field"><span>复版-纸样进度</span><strong>{{ form.second_pattern_progress || '纸样未完成' }}</strong></div>
              <div class="pattern-summary-field"><span>复版-车板进度</span><strong>{{ boardProgressLabel(form.second_board_progress, form.second_board_maker) }}</strong></div>
              <div class="pattern-summary-field" :class="{ 'pattern-summary-editable': !statusOnlyMode && canReviewStage('second') }"><span>复版-审版结果</span><strong v-if="statusOnlyMode || !canReviewStage('second')">{{ form.second_review_result || '—' }}</strong><el-select v-else v-model="form.second_review_result" clearable placeholder="请选择审版结果" class="full-width-control" @clear="handleReviewClear('second')"><el-option v-for="item in reviewResultOptions" :key="item" :label="item" :value="item" /></el-select></div>
              <div v-if="isReviewRejected('second')" class="pattern-summary-field"><span>复版-审核意见</span><ImageUploader v-model="form.second_review_opinion_image_url" label="复版-审核意见" :size="110" :view-only="statusOnlyMode" /></div>
            </div>
          </template>
          <template v-if="hasReviewFollowup(form.second_review_result)">
            <div class="pattern-summary-version-row">
              <div class="pattern-summary-field"><span>三版-纸样进度</span><strong>{{ form.third_pattern_progress || '纸样未完成' }}</strong></div>
              <div class="pattern-summary-field"><span>三版-车板进度</span><strong>{{ boardProgressLabel(form.third_board_progress, form.third_board_maker) }}</strong></div>
              <div class="pattern-summary-field" :class="{ 'pattern-summary-editable': !statusOnlyMode && canReviewStage('third') }"><span>三版-审版结果</span><strong v-if="statusOnlyMode || !canReviewStage('third')">{{ form.third_review_result || '—' }}</strong><el-select v-else v-model="form.third_review_result" clearable placeholder="请选择审版结果" class="full-width-control"><el-option v-for="item in reviewResultOptions" :key="item" :label="item" :value="item" /></el-select></div>
              <div v-if="isReviewRejected('third')" class="pattern-summary-field"><span>三版-审核意见</span><ImageUploader v-model="form.third_review_opinion_image_url" label="三版-审核意见" :size="110" :view-only="statusOnlyMode" /></div>
            </div>
          </template>
          <div v-if="!['外采', '外发', '转自研外发', 'AI外发款', 'AI外发'].includes(String(form.link || '').trim()) && form.preproduction_sample === '重做产前样'" class="pattern-summary-version-row pattern-summary-preproduction-row">
            <div class="pattern-summary-field pattern-summary-preproduction-progress"><span>产前样-车板进度</span><strong>{{ boardProgressLabel(form.preproduction_board_progress, form.preproduction_board_maker) }}</strong></div>
          </div>
        </div>
      </section>
      <section v-if="!statusOnlyMode && form.link !== '外采'" class="detail-card fabric-card"><div class="card-title"><h2>面料</h2><div class="fabric-document-actions"><el-button plain size="small" @click="openDocumentPreview('material')">物料单</el-button><el-button plain size="small" @click="openDocumentPreview('pattern')">版单</el-button><el-button type="primary" plain size="small" @click="openFabricDialog">新增面料</el-button></div></div>
        <el-empty v-if="!form.fabric_records.length" description="暂无面料信息" :image-size="56" />
        <div v-else class="fabric-table-wrap"><el-table :data="form.fabric_records" class="fabric-table" border>
          <el-table-column prop="supplier" label="供应商" width="130" />
          <el-table-column prop="code" label="编号" width="130" />
          <el-table-column prop="unit" label="单位" width="90" />
          <el-table-column prop="color_code" label="色号" width="100" />
          <el-table-column prop="width" label="幅宽" width="100" />
          <el-table-column v-if="showFabricTableField('quote')" prop="quote" label="单价" width="100" />
          <el-table-column v-if="showFabricTableField('weight_difference')" prop="weight_difference" label="空差" width="90" />
          <el-table-column v-if="showFabricTableField('meterage')" prop="meterage" label="出米数" width="100" />
          <el-table-column v-if="showFabricTableField('net_weight')" prop="net_weight" label="净重" width="100" />
          <el-table-column prop="cost" label="成本" width="100" />
          <el-table-column label="色卡" width="96"><template #default="{ row }"><el-image v-if="imageList(row.color_card_image_url)[0]" :src="imageList(row.color_card_image_url)[0]" fit="cover" class="fabric-table-thumb" :preview-src-list="imageList(row.color_card_image_url)" preview-teleported /><span v-else class="empty-cell">—</span></template></el-table-column>
          <el-table-column label="检测报告" width="96"><template #default="{ row }"><el-image v-if="imageList(row.inspection_report_url)[0]" :src="imageList(row.inspection_report_url)[0]" fit="cover" class="fabric-table-thumb" :preview-src-list="imageList(row.inspection_report_url)" preview-teleported /><span v-else class="empty-cell">—</span></template></el-table-column>
          <el-table-column min-width="1" class-name="accessory-spacer-column" label="" />
          <el-table-column v-if="!statusOnlyMode" label="操作" width="126" :fixed="'right'" class-name="fabric-operation-column" label-class-name="fabric-operation-column"><template #default="{ $index }"><div class="fabric-actions"><el-button text type="primary" @click="openFabricDialog($index)">编辑</el-button><el-button text type="danger" @click="removeFabricRecord($index)">删除</el-button></div></template></el-table-column>
        </el-table></div>
      </section>
      <section v-if="!statusOnlyMode && form.link !== '外采'" class="detail-card accessory-card"><div class="card-title"><h2>辅料</h2><el-button type="primary" plain size="small" @click="openAccessoryDialog">新增辅料</el-button></div>
        <el-empty v-if="!form.accessory_records.length" description="暂无辅料信息" :image-size="56" />
        <div v-else class="fabric-table-wrap"><el-table :data="form.accessory_records" class="fabric-table accessory-table" border>
          <el-table-column prop="supplier" label="供应商" width="130" />
          <el-table-column prop="accessory" label="辅料" width="120" />
          <el-table-column prop="specification" label="规格" width="150" />
          <el-table-column prop="color" label="颜色" width="120" />
          <el-table-column prop="unit" label="单位" width="100" />
          <el-table-column prop="unit_price" label="单价" width="100" />
          <el-table-column prop="usage_amount" label="用量" width="100" />
          <el-table-column prop="cost" label="成本" width="100" />
          <el-table-column min-width="1" class-name="accessory-spacer-column" label="" />
          <el-table-column v-if="!statusOnlyMode" label="操作" width="126" class-name="accessory-operation-column" label-class-name="accessory-operation-column"><template #default="{ $index }"><div class="fabric-actions"><el-button text type="primary" @click="openAccessoryDialog($index)">编辑</el-button><el-button text type="danger" @click="removeAccessoryRecord($index)">删除</el-button></div></template></el-table-column>
        </el-table></div>
      </section>
      <section v-if="form.link !== '外采' && (form.has_pattern === false || form.has_pattern === true)" class="detail-card craft-card"><div class="card-title"><h2>工艺</h2><div class="craft-actions"><el-select v-model="craftType" class="craft-type-select" aria-label="工艺类别"><el-option v-for="type in craftTypes" :key="type" :label="type" :value="type" /></el-select><el-button v-if="!statusOnlyMode" type="primary" plain size="small" @click="openCraftDialog"><el-icon><Plus /></el-icon>新增工艺</el-button></div></div>
        <el-empty v-if="!craftRecordsByType.length" description="暂无工艺信息" :image-size="56" />
        <div v-else class="fabric-table-wrap"><el-table :data="craftRecordsByType" class="fabric-table craft-table" border>
          <el-table-column prop="type" label="类型" width="140" />
          <el-table-column prop="process" label="名称" width="180" />
          <el-table-column prop="price" label="价格" width="150"><template #default="{ row }">{{ Number(row.price || 0).toFixed(2) }}</template></el-table-column>
          <el-table-column prop="factory" label="工厂" width="180"><template #default="{ row }">{{ row.type === '工艺' ? row.factory : '' }}</template></el-table-column>
          <el-table-column min-width="1" class-name="accessory-spacer-column" label="" />
          <el-table-column v-if="!statusOnlyMode" label="操作" width="126" fixed="right" class-name="fabric-operation-column" label-class-name="fabric-operation-column"><template #default="{ $index }"><div class="fabric-actions"><el-button text type="primary" @click="openCraftDialog($index)">编辑</el-button><el-button text type="danger" @click="removeCraftRecord(craftRecordsByType[$index])">删除</el-button></div></template></el-table-column>
        </el-table></div>
      </section>
      <section v-if="form.link !== '外采' && form.has_pattern === true" class="detail-card pattern-card"><div class="card-title"><h2>图案</h2></div>
        <div class="pattern-module-grid">
          <div class="pattern-module-image"><div class="image-field-label">图案参考图</div><div class="image-field-content">
            <ImageUploader v-model="form.pattern_reference_image_url" label="图案参考图" :view-only="statusOnlyMode" />
          </div></div>
          <div class="pattern-module-image"><div class="image-field-label">图案完成样式</div><div class="image-field-content">
            <ImageUploader v-model="form.pattern_complete_image_url" label="图案完成样式" :view-only="statusOnlyMode" />
          </div></div>
          <el-form-item label="图案进度"><el-select v-model="form.design_pattern_progress" clearable placeholder="请选择图案进度" class="full-width-control pattern-progress-select"><el-option v-for="progress in designPatternProgressOptions" :key="progress" :label="progress" :value="progress" /></el-select></el-form-item>
          <el-form-item label="备注"><el-input v-model="form.design_pattern_notes" type="textarea" :rows="3" placeholder="请输入备注" /></el-form-item>
        </div>
      </section>
      <section class="detail-card matching-card"><div class="card-title"><h2>搭配</h2></div>
        <div class="matching-module-grid">
          <section v-for="group in matchingFields" :key="group.number" class="matching-module-group" :class="`matching-module-group--${group.number}`">
            <div class="matching-module-group-heading"><h3>搭配 {{ group.number }}</h3><el-upload v-if="!statusOnlyMode" action="/api/uploads" name="file" :headers="uploadHeaders" accept="image/jpeg,image/png,image/webp,image/gif" :multiple="true" :show-file-list="false" :before-upload="file => beforeMatchingImageUpload(group.image, file)" :on-success="result => handleMatchingImageUpload(result, group.image)" :on-error="() => handleMatchingImageUploadError(group.image)" class="matching-image-upload"><el-button plain size="small" :loading="Boolean(matchingImageUploading[group.image])"><el-icon><Plus /></el-icon>添加图片</el-button></el-upload></div>
            <div class="matching-module-fields">
              <div class="matching-module-image">
                <div class="matching-module-image-heading"><span class="image-field-label">搭配图</span></div>
                <div class="matching-image-row">
                  <div class="matching-image-viewport" :class="{ 'matching-image-viewport--wide': group.number === 3 }">
                    <div class="matching-image-strip" :class="{ 'matching-image-strip--scrollable': imageList(form[group.image]).length > (group.number === 3 ? 6 : 3) }" tabindex="0" role="region" :aria-label="`搭配图${group.number}，可横向滚动`" @scroll="updateMatchingScroll($event, group.image)">
                    <div v-for="(url, imageIndex) in imageList(form[group.image])" :key="`${url}-${imageIndex}`" class="matching-image-item">
                      <button type="button" class="matching-image-preview" :aria-label="`放大查看搭配图${group.number}`" @click="openImagePreview(url, `搭配图${group.number}`)"><img :src="url" :alt="`搭配图${group.number}`"></button>
                      <button v-if="!statusOnlyMode" type="button" class="matching-image-remove" :aria-label="`移除搭配图${imageIndex + 1}`" title="移除图片" @click="removeMatchingImage(group.image, imageIndex)"><el-icon><Close /></el-icon></button>
                    </div>
                    <div v-if="!imageList(form[group.image]).length" class="matching-image-empty">暂无图片</div>
                  </div>
                    <div v-if="imageList(form[group.image]).length > (group.number === 3 ? 6 : 3)" class="matching-image-scrollbar" aria-hidden="true" @pointerdown="startMatchingScrollbarDrag">
                      <div class="matching-image-scroll-thumb" :style="matchingScrollbarThumbStyle(group.image, group.number)"></div>
                    </div>
                  </div>
                </div>
              </div>
              <el-form-item label="搭配款号"><span v-if="statusOnlyMode" class="matching-readonly-value">{{ form[group.sku] || '—' }}</span><el-input v-else v-model="form[group.sku]" clearable placeholder="请输入搭配款号" /></el-form-item>
              <el-form-item label="搭配进度"><span v-if="statusOnlyMode" class="matching-readonly-value">{{ form[group.progress] || '—' }}</span><el-select v-else v-model="form[group.progress]" clearable placeholder="请选择搭配进度" class="full-width-control"><el-option v-for="progress in matchingProgressOptions" :key="progress" :label="progress" :value="progress" /></el-select></el-form-item>
            </div>
          </section>
        </div>
      </section>
        </div>
      </div>
    </el-form>
    <el-dialog v-if="!statusOnlyMode" v-model="fabricDialogVisible" :title="editingFabricIndex >= 0 ? '编辑面料' : '新增面料'" width="760px" align-center :lock-scroll="false" destroy-on-close class="fabric-dialog">
      <el-form ref="fabricFormRef" :model="fabricForm" label-position="top" class="fabric-modal-form">
        <el-form-item v-for="field in visibleFabricFields" :key="field.key" :label="field.label">
          <el-select v-if="field.type === 'unit'" v-model="fabricForm[field.key]" :placeholder="`请选择${field.label}`" class="fabric-modal-control"><el-option v-for="unit in fabricUnitOptions" :key="unit" :label="unit" :value="unit" /></el-select>
          <el-input-number v-else-if="field.type === 'number'" v-model="fabricForm[field.key]" :min="0" :precision="field.precision" :step="field.precision === 0 ? 1 : 0.01" :controls="false" class="fabric-modal-control" />
          <el-input v-else v-model="fabricForm[field.key]" :placeholder="`请输入${field.label}`" class="fabric-modal-control" />
        </el-form-item>
        <div class="fabric-modal-images">
          <div class="fabric-modal-image-item"><span>色卡</span><ImageUploader v-model="fabricForm.color_card_image_url" label="色卡" :size="112" /></div>
          <div class="fabric-modal-image-item"><span>检测报告</span><ImageUploader v-model="fabricForm.inspection_report_url" label="检测报告" :size="112" /></div>
        </div>
      </el-form>
      <template #footer><el-button @click="fabricDialogVisible = false">取消</el-button><el-button type="primary" @click="saveFabricRecord">{{ editingFabricIndex >= 0 ? '保存修改' : '添加面料' }}</el-button></template>
    </el-dialog>
    <el-dialog v-model="documentPreviewVisible" :title="documentPreviewTitle" width="min(1200px, 96vw)" align-center :lock-scroll="false" class="document-preview-dialog">
      <div v-if="documentPreviewLoading" class="document-preview-loading"><el-icon class="is-loading"><Loading /></el-icon>正在生成预览…</div>
      <iframe v-else-if="documentPreviewHtml" ref="documentPreviewFrame" class="document-preview-frame" :srcdoc="documentPreviewHtml" title="Excel模板预览" sandbox="allow-modals" @load="documentPreviewReady = true"></iframe>
      <template #footer><el-button @click="documentPreviewVisible = false">关闭</el-button><el-button :disabled="documentPreviewLoading || !documentPreviewReady" @click="printStyleDocument"><el-icon><Printer /></el-icon>直接打印</el-button><el-button type="primary" :loading="documentDownloading" @click="downloadStyleDocument">下载Excel</el-button></template>
    </el-dialog>
    <el-dialog v-if="!statusOnlyMode" v-model="accessoryDialogVisible" :title="editingAccessoryIndex >= 0 ? '编辑辅料' : '新增辅料'" width="760px" align-center :lock-scroll="false" destroy-on-close class="fabric-dialog">
      <el-form ref="accessoryFormRef" :model="accessoryForm" label-position="top" class="fabric-modal-form">
        <el-form-item v-for="field in accessoryFields" :key="field.key" :label="field.label">
          <el-select v-if="field.type === 'accessory'" v-model="accessoryForm[field.key]" placeholder="请选择辅料" class="fabric-modal-control"><el-option v-for="item in accessoryOptions" :key="item" :label="item" :value="item" /></el-select>
          <el-select v-else-if="field.type === 'unit'" v-model="accessoryForm[field.key]" placeholder="请选择单位" class="fabric-modal-control"><el-option v-for="item in fabricUnitOptions" :key="item" :label="item" :value="item" /></el-select>
          <el-input-number v-else-if="field.type === 'number'" v-model="accessoryForm[field.key]" :min="0" :precision="field.precision" :step="0.01" :controls="false" class="fabric-modal-control" />
          <el-input v-else v-model="accessoryForm[field.key]" :placeholder="`请输入${field.label}`" class="fabric-modal-control" />
        </el-form-item>
      </el-form>
      <template #footer><el-button @click="accessoryDialogVisible = false">取消</el-button><el-button type="primary" @click="saveAccessoryRecord">{{ editingAccessoryIndex >= 0 ? '保存修改' : '添加辅料' }}</el-button></template>
    </el-dialog>
    <el-dialog v-if="!statusOnlyMode" v-model="craftDialogVisible" :title="`${editingCraftIndex >= 0 ? '编辑' : '新增'}${craftForm.type}`" width="620px" align-center :lock-scroll="false" destroy-on-close class="craft-dialog">
      <el-form ref="craftFormRef" :model="craftForm" :rules="craftRules" label-position="top" class="craft-modal-form" :class="{ 'craft-modal-form-compact': craftForm.type !== '工艺' }">
        <el-form-item v-if="craftForm.type === '工艺'" label="工厂" prop="factory"><el-input v-model="craftForm.factory" clearable placeholder="请输入工厂" /></el-form-item>
        <el-form-item :label="craftForm.type" prop="process"><el-input v-model="craftForm.process" clearable :placeholder="`请输入${craftForm.type}`" /></el-form-item>
        <el-form-item :label="craftForm.type === '工艺' ? '工艺价格' : '价格'"><el-input-number v-model="craftForm.price" :min="0" :precision="2" :step="0.01" :controls="false" class="fabric-modal-control" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="craftDialogVisible = false">取消</el-button><el-button type="primary" @click="saveCraftRecord">{{ editingCraftIndex >= 0 ? '保存修改' : `添加${craftForm.type}` }}</el-button></template>
    </el-dialog>
    <el-dialog v-model="imageDetailsVisible" :title="`图片详情（${imageDetailsCount}）`" width="min(1080px, 94vw)" align-center :lock-scroll="false" append-to-body class="image-details-dialog">
      <div v-if="imageDetailsGroups.length" class="image-details-content">
        <section v-for="group in imageDetailsGroups" :key="group.key" class="image-details-group">
          <h3 v-if="group.title">{{ group.title }}</h3>
          <div class="image-details-sections">
            <section v-for="section in group.sections" :key="section.key" class="image-details-section">
              <h4>{{ section.title }}</h4>
              <div class="image-details-grid">
                <button v-for="entry in section.entries" :key="entry.key" type="button" class="image-details-entry" :aria-label="`查看${entry.label}`" @click="openImagePreview(entry.url, entry.label)">
                  <img :src="entry.url" :alt="entry.label" loading="lazy">
                </button>
              </div>
            </section>
          </div>
        </section>
      </div>
      <el-empty v-else description="暂无图片" :image-size="64" />
    </el-dialog>
    <div v-if="previewVisible" class="image-preview-overlay" role="dialog" :aria-label="`${previewImageLabel}预览`" @click.self="closeImagePreview"><button type="button" class="image-preview-close" aria-label="关闭预览" @click="closeImagePreview">×</button><img :src="previewImageUrl" :alt="`${previewImageLabel}原图`" class="image-preview-original" /></div>
  </div>
</template>

<style scoped>
.fabric-document-actions{display:flex;align-items:center;gap:8px}
.image-details-button{display:inline-flex;min-height:24px;align-items:center;gap:5px;padding:4px 9px;border:1px solid #dcdfe6;border-radius:5px;color:#606266;background:#fff;font:inherit;font-size:12px;line-height:1.2;cursor:pointer}.image-details-button:hover{border-color:#c6e2ff;color:#409eff;background:#f5faff}.image-details-button:focus-visible{outline:2px solid #79bbff;outline-offset:2px}
.image-section-actions{display:flex;align-items:center;gap:10px}.image-details-content{display:grid;gap:22px;max-height:min(68vh,680px);overflow:auto;padding:2px 4px 8px}.image-details-group h3{margin:0 0 14px;color:#334155;font-size:14px;font-weight:600}.image-details-sections{display:grid;gap:16px}.image-details-section h4{margin:0 0 8px;color:#64748b;font-size:12px;font-weight:600}.image-details-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:14px}.image-details-entry{display:block;width:100%;min-width:0;padding:0;border:0;background:transparent;cursor:zoom-in}.image-details-entry img{display:block;box-sizing:border-box;width:100%;height:136px;border:1px solid #e2e8f0;border-radius:5px;background:#f8fafc;object-fit:contain}.image-details-entry:focus-visible{outline:2px solid #1677ff;outline-offset:3px;border-radius:4px}.image-details-dialog :deep(.el-dialog__body){padding-top:10px}@media(max-width:600px){.image-details-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
.document-preview-frame{display:block;width:100%;height:min(72vh,850px);border:0;background:#fff}
.document-preview-loading{display:flex;height:min(72vh,850px);align-items:center;justify-content:center;gap:8px;color:#64748b}
@media(max-width:700px){.fabric-document-actions{gap:4px}.fabric-document-actions :deep(.el-button){padding:0 8px}.document-preview-frame,.document-preview-loading{height:70vh}}
.product-detail-page{min-width:0;color:#111827}.detail-save-button{min-width:112px;border-radius:9px}.detail-heading{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px}.detail-section-actions{display:flex;justify-content:flex-end;margin-bottom:18px}.detail-title-block{min-width:0}.detail-title-row{display:flex;align-items:center;gap:4px;margin-bottom:8px}.detail-back-button{width:30px;height:34px;padding:0;color:#64748b}.detail-back-button:hover{color:#1677ff;background:#eff6ff}.detail-name-input{width:min(720px,70vw);margin:0}.detail-name-input:deep(.el-input__wrapper){padding:0;background:transparent;box-shadow:none}.detail-name-input:deep(.el-input__inner){height:34px;padding:0;color:#111827;font-size:26px;font-weight:700;line-height:34px}.detail-name-input:deep(.el-input__inner:focus){text-decoration:underline;text-decoration-color:#1677ff;text-underline-offset:5px}.detail-card{margin-bottom:18px;padding:24px 26px;background:#fff;border:1px solid #e5eaf0;border-radius:16px;box-shadow:0 8px 24px rgba(15,23,42,.04)}.card-title{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:20px}.card-title h2{margin:0;font-size:16px;color:#172033}.card-title span{color:#94a3b8;font-size:12px}.detail-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:2px 16px}.detail-form:deep(.el-form-item__label){color:#475569;font-weight:600}.detail-form:deep(.el-input__wrapper),.detail-form:deep(.el-select__wrapper){min-height:42px;border-radius:10px;box-shadow:0 0 0 1px #dbe3ef inset}.detail-form:deep(.el-textarea__inner){border-radius:10px;box-shadow:0 0 0 1px #dbe3ef inset}.full-width-control{width:100%}.detail-grid:not(.compact-grid) .full-width-control,.detail-grid:not(.compact-grid) :deep(.el-input),.detail-grid:not(.compact-grid) :deep(.el-select),.detail-grid:not(.compact-grid) :deep(.el-date-editor){width:220px;max-width:100%}.image-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:20px 16px}.image-field{min-width:0}.image-field-label{margin-bottom:10px;color:#475569;font-size:14px;font-weight:600}.required-mark{margin-left:3px;color:#ef4444}.image-field-content{display:flex;min-height:156px;flex-direction:column;align-items:flex-start;gap:10px}.image-preview-wrap{display:flex;align-items:flex-start;gap:8px}.detail-image-trigger{display:block;padding:0;border:0;border-radius:12px;background:transparent;cursor:zoom-in}.detail-image-preview{display:block;width:112px;height:112px;border:1px solid #e2e8f0;border-radius:12px;object-fit:cover}.image-remove-button{padding:0 4px;color:#ef4444}.image-empty{color:#94a3b8;font-size:12px}.image-field-content{display:flex;min-height:156px;flex-direction:column;align-items:flex-start;gap:10px}.image-preview-wrap{display:flex;align-items:flex-start;gap:8px}.detail-image-trigger{display:block;padding:0;border:0;border-radius:12px;background:transparent;cursor:zoom-in}.detail-image-preview{display:block;width:112px;height:112px;border:1px solid #e2e8f0;border-radius:12px;object-fit:cover}.image-remove-button{padding:0 4px;color:#ef4444}.image-empty{color:#94a3b8;font-size:12px}.image-preview-overlay{position:fixed;inset:0;z-index:3000;display:grid;place-items:center;padding:40px;background:rgba(15,23,42,.78)}.image-preview-original{display:block;max-width:min(92vw,1200px);max-height:88vh;object-fit:contain;border-radius:10px;box-shadow:0 20px 60px rgba(0,0,0,.3)}.image-preview-close{position:fixed;top:22px;right:26px;width:40px;height:40px;border:1px solid rgba(255,255,255,.5);border-radius:50%;color:#fff;background:rgba(15,23,42,.35);font-size:28px;line-height:1;cursor:pointer}.compact-card{max-width:720px}.compact-grid{grid-template-columns:repeat(2,minmax(0,1fr))}@media(max-width:700px){.detail-heading{align-items:flex-start;gap:16px;flex-direction:column}.detail-title-row{width:100%}.detail-name-input{width:100%}.detail-section-actions{justify-content:stretch}.detail-save-button{width:100%}.detail-grid,.image-grid,.compact-grid{grid-template-columns:1fr}.detail-card{padding:20px 18px}}
.detail-grid:not(.compact-grid) :deep(.el-textarea){width:220px;max-width:100%}
.external-price-input :deep(.el-input__inner){text-align:left}
.detail-image-trigger{outline:none}
.detail-image-trigger:focus-visible{outline:2px solid #1677ff;outline-offset:3px}
.image-preview-wrap{position:relative;display:block;width:112px;height:112px}
.image-remove-button{position:absolute;top:4px;right:4px;z-index:2;display:grid;width:26px;height:26px;padding:0;place-items:center;border:0;border-radius:50%;color:#fff;background:rgba(15,23,42,.68);opacity:0;pointer-events:none;transition:opacity .16s ease;cursor:pointer}
.image-preview-wrap:hover .image-remove-button,.image-remove-button:focus-visible{opacity:1;pointer-events:auto}
.image-upload-box{display:grid;width:112px;height:112px;place-items:center;border:1px dashed #cbd5e1;border-radius:12px;background:#f8fafc}
.image-upload-box :deep(.el-upload){display:block}
.image-upload-box :deep(.el-button){min-height:30px;padding:0 9px;border-radius:7px;font-size:12px}
.material-content{display:flex;align-items:flex-start;gap:24px}.material-content>.el-textarea{width:420px;max-width:100%}.material-content :deep(.el-textarea__inner){min-height:112px}.material-image{flex:0 0 112px}
.fabric-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:18px 16px}.fabric-field{min-width:0}.material-field-label{margin-bottom:8px;color:#475569;font-size:14px;font-weight:600}.fabric-field>.el-input{width:220px;max-width:100%}.fabric-field .image-upload-box,.fabric-field .image-preview-wrap{width:112px;height:112px}
.fabric-record{padding:18px 0;border-top:1px solid #eef2f6}.fabric-record:first-of-type{border-top:0;padding-top:0}.fabric-record-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;color:#334155;font-size:14px;font-weight:700}
.detail-heading{margin-bottom:18px}.detail-section-actions{padding-top:23px;margin-bottom:0}
@media(max-width:700px){.detail-section-actions{padding-top:0}}
.fabric-table-wrap{width:100%;overflow-x:auto}.fabric-table{width:100%;min-width:0}.fabric-table :deep(.cell){white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fabric-table :deep(th),.fabric-table :deep(td){padding:9px 10px}.fabric-table :deep(td.fabric-operation-column),.fabric-table :deep(th.fabric-operation-column){position:sticky;right:0;z-index:3;background:#fff;box-shadow:-6px 0 12px rgba(15,23,42,.06)}.fabric-table :deep(th.fabric-operation-column){background:#f8fafc}.fabric-table :deep(.fabric-operation-column .cell){padding-right:12px;padding-left:12px}.fabric-table-thumb{display:block;width:38px;height:38px;border-radius:6px;object-fit:cover}.empty-cell{color:#94a3b8}.fabric-actions{display:flex;align-items:center;justify-content:flex-end;gap:2px;white-space:nowrap}.fabric-actions :deep(.el-button){margin-left:0;padding-right:4px;padding-left:4px}.fabric-modal-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));column-gap:18px}.fabric-modal-form :deep(.el-form-item){margin-bottom:16px}.fabric-modal-form :deep(.el-form-item__label){padding-bottom:6px;color:#475569;font-weight:600}.fabric-modal-control{width:100%}.fabric-modal-images{grid-column:span 2;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.fabric-modal-image-item{min-width:0}.fabric-modal-image-item>span{display:block;margin-bottom:6px;color:#475569;font-size:14px;font-weight:600}.fabric-dialog :deep(.el-dialog__body){padding-top:8px}.fabric-dialog :deep(.el-dialog__footer){padding-top:4px}@media(max-width:760px){.fabric-modal-form{grid-template-columns:1fr}.fabric-modal-images{grid-column:span 1;gap:12px}.fabric-dialog{width:calc(100vw - 32px)!important}}
.pattern-detail-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:18px 16px;align-items:start}.pattern-detail-field{min-width:0;display:flex;flex-direction:column;gap:8px}.pattern-detail-field span{color:#94a3b8;font-size:12px}.pattern-detail-field strong{overflow:hidden;color:#334155;font-size:14px;font-weight:600;text-overflow:ellipsis;white-space:nowrap}.pattern-detail-notes{grid-column:span 3}.pattern-detail-notes strong{white-space:normal;line-height:1.6}.pattern-detail-image{width:112px;height:112px;padding:0;border:0;border-radius:12px;background:transparent;cursor:zoom-in}.pattern-detail-image img{display:block;width:112px;height:112px;border:1px solid #e2e8f0;border-radius:12px;object-fit:cover}@media(max-width:900px){.pattern-detail-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.pattern-detail-notes{grid-column:span 2}}@media(max-width:560px){.pattern-detail-grid{grid-template-columns:1fr}.pattern-detail-notes{grid-column:auto}}
.detail-link-button{box-sizing:border-box;height:32px;padding:0 14px!important;border:0!important;border-radius:4px;color:#3b82f6!important;background:#f5f7fa!important;font-size:13px}.detail-link-button:hover{color:#1677ff!important;background:#edf4ff!important}.pattern-summary-card .card-title{align-items:center}.pattern-summary-card .card-title .el-button{margin-left:auto}.pattern-summary-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:22px 18px;align-items:start}.pattern-summary-version-row{grid-column:1/-1;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:22px 18px;align-items:start}.pattern-summary-preproduction-row{grid-template-columns:repeat(3,minmax(0,1fr))}.pattern-summary-preproduction-progress{grid-column:2;grid-row:1}.pattern-summary-preproduction-sample{grid-column:3;grid-row:1}.pattern-summary-field{min-width:0;display:flex;flex-direction:column;gap:8px}.pattern-summary-field>span,.pattern-summary-reference>span{color:#94a3b8;font-size:12px}.pattern-summary-field>strong{overflow:hidden;color:#334155;font-size:14px;font-weight:600;text-overflow:ellipsis;white-space:nowrap}.pattern-summary-editable .el-select{width:220px;max-width:100%}.pattern-summary-notes{grid-column:span 3}.pattern-summary-notes>strong{white-space:normal;line-height:1.6}.pattern-summary-reference{display:flex;flex-direction:column;gap:8px}.pattern-summary-reference img{display:block;width:112px;height:112px;border:1px solid #e2e8f0;border-radius:12px;object-fit:cover}@media(max-width:900px){.pattern-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.pattern-summary-version-row{grid-template-columns:repeat(4,minmax(0,1fr))}.pattern-summary-notes{grid-column:span 2}}@media(max-width:560px){.pattern-summary-grid{grid-template-columns:1fr}.pattern-summary-version-row{grid-template-columns:1fr}.pattern-summary-preproduction-progress,.pattern-summary-preproduction-sample{grid-column:auto;grid-row:auto}.pattern-summary-notes{grid-column:auto}}
.pattern-summary-title{display:flex;align-items:baseline;gap:12px;min-width:0}.pattern-summary-title .pattern-summary-maker{color:#64748b;font-size:13px;font-weight:400}
.status-only-title{margin:0;color:#111827;font-size:24px;font-weight:700;line-height:34px}.status-only-page .detail-heading{position:static;background:transparent}.status-only-page .detail-form .el-form-item__content{min-height:42px;align-items:center}.status-only-value{display:flex;box-sizing:border-box;width:100%;min-height:42px;align-items:center;padding:0;border:0;color:#334155;background:transparent;font-size:14px;font-weight:600;line-height:20px}.status-only-page .detail-form :deep(.is-disabled .el-input__inner),.status-only-page .detail-form :deep(.is-disabled .el-textarea__inner),.status-only-page .detail-form :deep(.is-disabled .el-select__placeholder),.status-only-page .detail-form :deep(.is-disabled .el-select__selected-item){color:#334155}.status-only-page .detail-form :deep(.el-input.is-disabled .el-input__wrapper),.status-only-page .detail-form :deep(.el-select__wrapper.is-disabled),.status-only-page .detail-form :deep(.el-textarea.is-disabled .el-textarea__inner),.status-only-page .detail-form :deep(.el-input-number.is-disabled .el-input__wrapper){min-height:42px;padding:0;border:0;background:transparent;box-shadow:none}.status-only-page .detail-form :deep(.el-input.is-disabled .el-input__inner){height:42px;padding:0;line-height:42px}.status-only-page .detail-form :deep(.el-select__wrapper.is-disabled){padding-right:0}.status-only-page .detail-form :deep(.el-select__caret),.status-only-page .detail-form :deep(.el-input__suffix),.status-only-page .detail-form :deep(.el-input-number__decrease),.status-only-page .detail-form :deep(.el-input-number__increase){display:none}.status-only-page .detail-form :deep(.el-textarea__inner){padding:0;line-height:24px;resize:none}.status-only-page .style-progress-step{cursor:default}
.style-progress-card{padding-bottom:20px}.style-progress-stepper{display:flex;align-items:flex-start;width:100%;min-height:48px}.style-progress-canceled-wrap{display:flex;min-height:48px;align-items:center;justify-content:center}.style-progress-canceled{display:inline-flex;min-width:128px;min-height:36px;align-items:center;justify-content:center;padding:0 24px;border-radius:6px;color:#fff;background:#ef4444;font-size:14px;font-weight:700}.style-progress-step{display:grid;min-width:92px;grid-template-columns:34px auto;align-items:center;column-gap:9px;row-gap:4px;padding:0;border:0;color:#64748b;background:transparent;text-align:left;cursor:pointer}.style-progress-step:focus-visible{outline:2px solid #1677ff;outline-offset:4px;border-radius:4px}.style-progress-circle{display:grid;width:34px;height:34px;grid-row:1;place-items:center;border-radius:50%;color:#94a3b8;background:#f1f3f6;font-size:13px}.style-progress-step.active .style-progress-circle{color:#fff;background:#075dcc}.style-progress-step.active .style-progress-label{color:#334155}.style-progress-label{color:#64748b;font-size:13px;white-space:nowrap}.style-progress-step .regular-progress-badges{grid-column:1/-1}.regular-progress-badges{display:flex;flex-wrap:wrap;gap:3px}.regular-progress-badge{display:inline-flex;align-items:center;padding:1px 4px;border:1px solid #e5e7eb;border-radius:3px;color:#7b8492;background:#fff;font-size:10px;line-height:14px;white-space:nowrap}.regular-progress-badge.complete{border-color:#b7e2c1;color:#198754;background:#f2fbf4}.style-progress-line{height:1px;flex:1;min-width:28px;align-self:flex-start;margin:16px 10px 0;background:#e5e7eb}.style-progress-line.active{background:#075dcc}.detail-name-input{width:min(360px,35vw)}
.progress-advance-button{box-sizing:border-box;min-width:88px;height:34px;justify-content:center;gap:4px;padding:0 13px!important;border:1px solid #075dcc!important;border-radius:6px!important;color:#fff!important;background:#075dcc!important;box-shadow:0 2px 5px rgba(7,93,204,.18);font-size:13px;font-weight:600;transition:background-color .16s ease,border-color .16s ease,box-shadow .16s ease,transform .16s ease}.progress-advance-button:hover{border-color:#064da9!important;color:#fff!important;background:#064da9!important;box-shadow:0 3px 8px rgba(7,77,169,.24);transform:translateY(-1px)}.progress-advance-button:active{transform:translateY(0)}.progress-advance-button:focus-visible{outline:2px solid #93c5fd;outline-offset:2px}.progress-advance-button.is-disabled,.progress-advance-button.is-disabled:hover{border-color:#cbd5e1!important;color:#fff!important;background:#94a3b8!important;box-shadow:none;transform:none}
@media(max-width:700px){.detail-name-input{width:100%}}
.progress-prompt-inline{display:flex;align-items:center;gap:16px;margin-top:18px;padding-top:16px;border-top:1px solid #e5eaf0}.progress-prompt-inline .card-title{flex:0 0 auto;margin:0}.progress-prompt-inline .card-title h2{font-size:14px}.progress-prompt-text{min-width:0;flex:1;margin:0;color:#475569;font-size:12px;line-height:1.6}@media(max-width:560px){.progress-prompt-inline{align-items:flex-start;flex-direction:column;gap:6px}}
.craft-actions{display:flex;align-items:center;gap:10px}.craft-type-select{width:150px}.craft-type-select:deep(.el-select__wrapper){min-height:32px}.craft-modal-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.craft-modal-form-compact{grid-template-columns:repeat(2,minmax(0,1fr))}.craft-modal-form :deep(.el-form-item){margin-bottom:0}.craft-dialog :deep(.el-dialog__body){padding-top:8px}@media(max-width:700px){.craft-actions{align-items:stretch;flex-direction:column}.craft-type-select{width:100%}.craft-modal-form,.craft-modal-form-compact{grid-template-columns:1fr}}
.pattern-module-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:18px 16px;align-items:start}.pattern-module-grid :deep(.el-form-item){margin-bottom:0}.pattern-module-grid :deep(.el-input__wrapper),.pattern-module-grid :deep(.el-select__wrapper){min-height:42px;border-radius:10px;box-shadow:0 0 0 1px #dbe3ef inset}.pattern-module-grid :deep(.el-textarea__inner){border-radius:10px;box-shadow:0 0 0 1px #dbe3ef inset}.pattern-module-grid :deep(.pattern-progress-select){width:220px;max-width:100%}.pattern-module-image{min-width:0}.pattern-module-image .image-field-content{min-height:112px}@media(max-width:700px){.pattern-module-grid{grid-template-columns:1fr}}
.matching-module-grid{display:grid;grid-template-columns:minmax(360px,3fr) minmax(360px,3fr) minmax(672px,6fr);gap:16px}.matching-module-group{min-width:0;padding:14px;border:1px solid #e5eaf0;border-radius:6px}.matching-module-group h3{margin:0;color:#475569;font-size:13px;font-weight:600}.matching-module-fields{display:grid;grid-template-columns:1fr;gap:14px;min-width:0}.matching-module-fields :deep(.el-form-item){margin:0}.matching-module-fields :deep(.el-input__wrapper),.matching-module-fields :deep(.el-select__wrapper){min-height:40px}.matching-module-image{display:flex;width:100%;min-width:0;flex-direction:column;gap:8px;align-items:flex-start}.matching-module-image .image-field-label{color:#64748b;font-size:12px}@media(max-width:1550px) and (min-width:601px){.matching-module-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.matching-module-grid .matching-module-group--3{grid-column:1/-1}}@media(max-width:600px){.matching-module-grid{grid-template-columns:minmax(0,1fr)}.matching-module-grid .matching-module-group--3{grid-column:auto}}
.matching-module-heading{display:flex;width:100%;align-items:center;justify-content:space-between;gap:8px}.matching-module-heading .image-field-label{margin:0}.matching-image-row{display:flex;width:100%;min-width:0;justify-content:center}.matching-image-viewport{position:relative;width:min(100%,312px);max-width:100%;min-width:0;flex:0 1 312px}.matching-image-viewport--wide{width:min(100%,636px);flex-basis:636px}.matching-image-strip{box-sizing:border-box;display:flex;width:100%;min-width:0;gap:12px;justify-content:center;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;scroll-behavior:auto;touch-action:pan-x}.matching-image-strip::-webkit-scrollbar{display:none}.matching-image-strip--scrollable{justify-content:flex-start}.matching-image-item{position:relative;flex:0 0 96px}.matching-image-preview{display:block;width:96px;height:112px;overflow:hidden;padding:0;border:1px solid #dbe3ef;border-radius:5px;background:#f8fafc;cursor:zoom-in}.matching-image-preview img{display:block;width:100%;height:100%;object-fit:cover}.matching-image-remove{position:absolute;top:5px;right:5px;display:grid;width:22px;height:22px;place-items:center;padding:0;border:0;border-radius:50%;color:#fff;background:rgba(15,23,42,.76);opacity:0;visibility:hidden;cursor:pointer}.matching-image-item:hover .matching-image-remove,.matching-image-remove:focus-visible{opacity:1;visibility:visible}.matching-image-empty{display:grid;width:96px;height:112px;flex:0 0 96px;place-items:center;border:1px dashed #cbd5e1;border-radius:5px;color:#94a3b8;background:#f8fafc;font-size:12px}.matching-image-scrollbar{position:absolute;right:0;bottom:-10px;left:0;height:6px;overflow:hidden;border-radius:4px;background:#e2e8f0;cursor:pointer;touch-action:none}.matching-image-scroll-thumb{position:absolute;top:0;height:100%;min-width:24%;border-radius:4px;background:#94a3b8;cursor:grab}.matching-image-scroll-thumb:active{background:#64748b;cursor:grabbing}.matching-image-preview:focus-visible,.matching-image-strip:focus-visible{outline:2px solid #1677ff;outline-offset:2px}
.matching-readonly-value{display:flex;min-height:40px;align-items:center;color:#334155;font-size:14px;line-height:1.4}
.matching-module-group-heading{display:flex;min-width:0;align-items:center;justify-content:space-between;gap:8px;margin-bottom:14px}.matching-module-group-heading h3{margin:0}.matching-module-group-heading :deep(.el-button){min-height:28px}.matching-module-image-heading{display:flex;min-height:26px;align-items:center}
.image-grid{grid-template-columns:repeat(7,minmax(0,1fr));gap:14px 12px}.image-grid .image-field-content{min-height:118px}
@media(max-width:1100px){.image-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media(max-width:700px){.image-grid{grid-template-columns:1fr}}
.detail-heading{position:static;z-index:auto;align-items:center;padding:10px 0 12px;background:transparent}
.detail-title-row{margin-bottom:0}
.detail-section-actions{align-items:center;padding-top:0;margin-bottom:0}
.pattern-summary-preproduction-row{grid-template-columns:repeat(4,minmax(0,1fr))}
.pattern-summary-preproduction-progress{grid-column:3;grid-row:1}
.pattern-summary-preproduction-sample{grid-column:4;grid-row:1}
.cost-summary-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:14px;align-items:stretch}.cost-summary-grid .el-form-item{margin-bottom:0}.cost-summary-item{min-height:72px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:flex-start;gap:7px;padding:12px 14px;border:1px solid #e5eaf0;border-radius:10px;background:#f8fafc}.cost-summary-item>span{display:flex;height:18px;align-items:center;color:#64748b;font-size:13px;line-height:18px}.cost-summary-item strong{display:flex;height:24px;align-items:center;color:#172033;font-size:18px;font-weight:700;line-height:24px}.cost-summary-total{border-color:#bfdbfe;background:#eff6ff}.cost-summary-total strong{color:#1265d6}
.detail-card{border-color:#dbe3ef;border-radius:7px;box-shadow:0 1px 3px rgba(15,23,42,.04)}
.cost-summary-grid.cost-summary-ai-grid{grid-template-columns:repeat(7,minmax(0,1fr))}
.cost-summary-input .cost-input-value{display:flex;height:24px;align-items:center;gap:0;color:#172033;font-size:18px;font-weight:700;line-height:24px}.cost-summary-input .cost-input-value b{flex:0 0 auto;font-weight:700;line-height:24px}.cost-summary-input .cost-input-control{width:auto;height:24px;min-width:0;flex:0 1 auto;display:inline-flex;align-items:center}.cost-summary-input :deep(.el-input-number__decrease),.cost-summary-input :deep(.el-input-number__increase){display:none}.cost-summary-input :deep(.el-input__wrapper){box-sizing:border-box;height:24px;min-height:24px;padding:0;border:0;border-radius:0;background:transparent;box-shadow:none}.cost-summary-input :deep(.el-input__inner){width:92px;height:24px;padding:0;color:#172033;font-size:18px;font-weight:700;line-height:24px;text-align:left}
.season-input-row{display:flex;width:218px;max-width:100%;min-width:0;align-items:stretch;gap:6px}.season-input-row :deep(.season-date-control),.season-input-row :deep(.season-value-control){box-sizing:border-box;width:138px;height:42px;flex:0 0 138px}.season-input-row :deep(.season-date-control .el-input__wrapper),.season-input-row :deep(.season-value-control .el-input__wrapper){min-height:42px}.season-input-row :deep(.season-toggle-button){box-sizing:border-box;width:74px;height:42px;min-height:42px;flex:0 0 74px;align-self:stretch;margin-left:0;padding:0 6px}
@media(max-width:1000px){.cost-summary-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.cost-summary-grid.cost-summary-ai-grid{grid-template-columns:repeat(7,minmax(130px,1fr));overflow-x:auto}}
@media(max-width:700px){.cost-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.cost-summary-total{grid-column:1/-1}.cost-summary-ai-grid .cost-summary-total{grid-column:auto}}
@media(max-width:560px){.pattern-summary-preproduction-progress,.pattern-summary-preproduction-sample{grid-column:auto;grid-row:auto}}
.status-only-page .detail-form :deep(.el-input__wrapper),.status-only-page .detail-form :deep(.el-select__wrapper){min-height:42px!important;padding:0 11px!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important}.status-only-page .detail-form :deep(.el-textarea__inner){border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;color:#334155!important;-webkit-text-fill-color:#334155!important;line-height:1.6}.status-only-page .detail-form :deep(.el-input__inner){color:#334155!important;-webkit-text-fill-color:#334155!important}.status-only-page .detail-form :deep(.el-textarea__inner){resize:none}.status-only-page .detail-form :deep(.el-input__suffix),.status-only-page .detail-form :deep(.el-input__prefix),.status-only-page .detail-form :deep(.el-select__caret),.status-only-page .detail-form :deep(.el-tag__close){visibility:hidden!important}.status-only-page .detail-form :deep(.el-select__selected-item),.status-only-page .detail-form :deep(.el-select__placeholder){color:#334155!important}.status-only-page .detail-form :deep(.el-input-number){width:100%}
.status-only-page .detail-grid{gap:18px 18px;align-items:start}
.status-only-page .detail-grid :deep(.el-form-item){min-width:0;margin-bottom:0;align-items:flex-start}
.status-only-page .detail-grid :deep(.el-form-item__label){height:auto;padding:0;color:#94a3b8;font-size:12px;font-weight:400;line-height:1.4}
.status-only-page .detail-grid :deep(.el-form-item__content){min-height:22px;line-height:22px}
.status-only-page .detail-grid :deep(.el-input__wrapper),.status-only-page .detail-grid :deep(.el-select__wrapper){box-sizing:border-box;min-height:22px!important;padding:0!important}
.status-only-page .detail-grid :deep(.el-input__inner),.status-only-page .detail-grid :deep(.el-select__selected-item),.status-only-page .detail-grid :deep(.el-select__placeholder){height:22px;color:#334155!important;font-size:14px;font-weight:600;line-height:22px;-webkit-text-fill-color:#334155!important}
.status-only-page .detail-grid :deep(.el-select__tags-text){color:#334155;font-size:14px;font-weight:600}
.status-only-page .detail-grid :deep(.el-tag){border:0;background:transparent}
.status-only-page .detail-grid :deep(.el-textarea__inner){min-height:22px!important;padding:0;color:#334155;font-size:14px;font-weight:600;-webkit-text-fill-color:#334155!important}
.status-only-page .detail-grid .season-input-row{height:22px;align-items:center}
.status-only-page .detail-grid .season-input-row :deep(.season-date-control),.status-only-page .detail-grid .season-input-row :deep(.season-value-control){height:22px;flex-basis:138px}
.status-only-page .detail-grid :deep(.el-form-item__content:has(.el-input__inner:placeholder-shown)),.status-only-page .detail-grid :deep(.el-form-item__content:has(.el-textarea__inner:placeholder-shown)),.status-only-page .detail-grid :deep(.el-form-item__content:has(.el-select__placeholder)){position:relative}
.status-only-page .detail-grid :deep(.el-input__inner:placeholder-shown),.status-only-page .detail-grid :deep(.el-textarea__inner:placeholder-shown){color:transparent!important;-webkit-text-fill-color:transparent!important}
.status-only-page .detail-grid :deep(.el-select__placeholder){visibility:hidden}
.status-only-page .detail-grid :deep(.el-form-item__content:has(.el-input__inner:placeholder-shown))::after,.status-only-page .detail-grid :deep(.el-form-item__content:has(.el-textarea__inner:placeholder-shown))::after,.status-only-page .detail-grid :deep(.el-form-item__content:has(.el-select__placeholder))::after{position:absolute;top:0;left:0;color:#334155;content:'—';font-size:14px;font-weight:600;line-height:22px;pointer-events:none}
.status-only-page .detail-grid:not(.compact-grid) .full-width-control,.status-only-page .detail-grid:not(.compact-grid) :deep(.el-input),.status-only-page .detail-grid:not(.compact-grid) :deep(.el-select),.status-only-page .detail-grid:not(.compact-grid) :deep(.el-date-editor),.status-only-page .detail-grid:not(.compact-grid) :deep(.el-textarea){width:100%;max-width:100%}
.status-only-page .detail-grid :deep(.el-input__inner),.status-only-page .detail-grid :deep(.el-textarea__inner){text-align:left!important}
.status-only-page .detail-grid :deep(.el-date-editor .el-input__inner){text-align:left!important}
.status-only-page .detail-grid :deep(.el-date-editor .el-input__prefix){display:none!important}
.detail-card { border-color: var(--ui-border); border-radius: var(--ui-radius-lg); box-shadow: var(--ui-shadow-xs); }
.detail-form :deep(.el-input__wrapper), .detail-form :deep(.el-select__wrapper), .detail-form :deep(.el-textarea__inner) { border-radius: var(--ui-radius-md); box-shadow: 0 0 0 1px var(--ui-border-strong) inset; }
.detail-form :deep(.el-input__wrapper:focus-within), .detail-form :deep(.el-select__wrapper:focus-within), .detail-form :deep(.el-textarea__inner:focus) { box-shadow: var(--ui-focus-ring); }
.detail-content-wrap .detail-heading { position: static; flex: 0 0 auto; align-items: flex-end; gap: 24px; margin: 0; padding: 14px 0 16px; border-bottom: 1px solid var(--ui-border); background: var(--ui-page); }
.detail-section-layout { display: grid; grid-template-columns: minmax(0, 1fr); align-items: start; }
.detail-main-column { min-width: 0; }
.detail-main-column > .detail-card { margin-bottom: 14px; }
.detail-summary-card .card-title { margin-bottom: 10px; }
.detail-breadcrumb { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; color: #64748b; font-size: 12px; line-height: 18px; }
.detail-breadcrumb strong { color: #334155; font-weight: 600; }
.detail-title-row { margin-bottom: 0; }
.detail-title-row .status-only-title { color: #111827; font-size: 26px; line-height: 34px; }
.detail-subtitle { margin-top: 3px; color: #64748b; font-size: 12px; line-height: 18px; }
.detail-content-wrap .detail-name-input { width: 200px; max-width: 200px; }
.detail-content-wrap .detail-name-input:deep(.el-input__inner) { font-size: 26px; }
.detail-content-wrap .detail-section-actions { display: flex; align-items: center; gap: 8px; padding-top: 0; margin: 0; }
.detail-return-button { min-width: 84px; color: #334155; border-color: #dbe3ef; background: #fff; }
.detail-return-button:hover { color: #1677ff; border-color: #91caff; background: #f0f7ff; }
.detail-content-wrap .detail-save-button { min-width: 78px; border-radius: 6px; }
.style-progress-card-title { position: relative; align-items: center; min-width: 0; }
.style-progress-card-title :deep(.el-button) { position: absolute; top: 0; right: 0; margin: 0; }
.style-progress-card-heading { display: flex; min-width: 0; align-items: center; gap: 12px; padding-right: 120px; }
.style-progress-card-heading .regular-progress-badges { align-items: center; }
.style-progress-card-heading .regular-progress-badge { padding: 3px 8px; color: #7b8492; font-size: 12px; line-height: 16px; }
.style-progress-card-heading .regular-progress-badge.complete { color: #198754; }
.style-progress-card-heading .regular-progress-badge.incomplete { border-color: #f1a3a3; color: #b42318; background: #fee4e2; }
@media(max-width:560px){.style-progress-card-heading{flex-wrap:wrap;gap:8px;padding-right:100px}}
@media(max-width:700px){.detail-content-wrap .detail-heading{align-items:flex-start;flex-direction:column;gap:12px}.detail-content-wrap .detail-title-block{width:100%}.detail-content-wrap .detail-name-input{width:200px;max-width:200px}.detail-content-wrap .detail-section-actions{width:100%;justify-content:flex-end}.detail-content-wrap .detail-save-button,.detail-content-wrap .detail-return-button{min-height:36px}}
</style>
