export const STYLE_PROGRESS_STEPS = [
  '待对料',
  '待到料',
  '待外发',
  '待打板',
  '打版中',
  '审版中',
  '待排期',
  '已排期',
  '预热中',
  '打板中',
  '外发中',
  '选图',
  '定料',
  '买料',
  '通知',
  '外发',
  '预核价',
  '打版',
  '打板',
  '码价',
  '搭配',
  '上新',
  '完成',
]

const stepsByLink = {
  外采: ['待外采', '待排期', '已排期'],
  常规款: ['待对料', '待到料', '待打板', '打版中', '审版中', '待排期', '已排期'],
  常规优先款: ['待对料', '待到料', '待打板', '打版中', '审版中', '待排期', '已排期'],
  外发: ['待对料', '待外发', '待排期', '已排期'],
  AI款: ['待对料', '待排期', '已排期', '打板中', '审版中'],
  AI外发款: ['待对料', '待排期', '已排期', '外发中'],
  AI: ['待对料', '待排期', '已排期', '打板中', '审版中'],
  AI外发: ['待对料', '待排期', '已排期', '外发中'],
  常规优先: ['待对料', '待到料', '待打板', '打版中', '审版中', '待排期', '已排期'],
  转自研款: ['定料', '预核价', '打版', '码价', '搭配', '上新'],
  转自研板房: ['待对料', '待到料', '待打板', '打版中', '审版中', '待排期', '已排期'],
  转自研外发: ['待对料', '待外发', '待排期', '已排期'],
}

const linksWithMaterialRecords = new Set(['常规款', '常规优先款', '常规优先', '外发', 'AI款', 'AI外发款', 'AI', 'AI外发', '转自研款', '转自研板房', '转自研外发'])

export function getStyleProgressSteps(link) {
  const normalizedLink = String(link ?? '').trim()
  const steps = stepsByLink[normalizedLink] || stepsByLink['常规款']
  return [...steps, '完成']
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateKeyToUtc(value) {
  const dateKey = value instanceof Date
    ? value.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
    : String(value ?? '').slice(0, 10)
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : NaN
}

export function isCompletionWindowOpen(releaseDate) {
  const releaseDay = dateKeyToUtc(releaseDate)
  if (!Number.isFinite(releaseDay)) return false
  return dateKeyToUtc(localDateKey()) >= releaseDay - (7 * 24 * 60 * 60 * 1000)
}

export function normalizeStyleProgress(product = {}) {
  const link = String(product.link ?? '').trim()
  const progress = String(product.style_progress ?? '').trim()
  const isFollowUp = ['AI款', 'AI'].includes(link)
  const isFollowUpOutsource = ['AI外发款', 'AI外发'].includes(link)
  if (isFollowUp || isFollowUpOutsource) {
    const legacyProgress = { 选图: '待对料', 定料: '待排期', 通知: '待排期', 买料: '待排期', 打板: '打板中', 外发: '外发中', 码价: '预热中', 搭配: '预热中', 上新: '预热中' }
    let mappedProgress = legacyProgress[progress] || progress
    if (isFollowUp && ['预热中', '码价', '搭配', '上新'].includes(progress)) {
      const patternHasStarted = Boolean(product.pattern_started_at)
        || ['纸样中', '车板中', '审核中', '已通过'].includes(String(product.pattern_progress || '').trim())
      mappedProgress = patternHasStarted ? '打板中' : '已排期'
    }
    if (mappedProgress === '完成') return isCompletionReady(product) ? '完成' : (isFollowUpOutsource ? '外发中' : '打板中')
    if (mappedProgress === '已排期' && !product.release_date) return '待排期'
    return calculateFollowUpProgress({ ...product, style_progress: mappedProgress }, isFollowUpOutsource)
  }
  if (link === '外采') {
    const steps = getStyleProgressSteps(link)
    if (steps.includes(progress)) return calculateStyleProgress(product)
    return calculateStyleProgress(product)
  }
  if (['外发', '转自研外发'].includes(link)) {
    const steps = getStyleProgressSteps(link)
    if (isYes(product.material_outsourced) && !hasValue(product.release_date)
      && ['待对料', '待外发', '待排期'].includes(progress)) return '待排期'
    if (progress === '已排期' && !product.release_date) return '待排期'
    if (progress === '待排期' && product.release_date) return calculateStyleProgress(product)
    if (progress === '完成') {
      if (!product.release_date) return '待排期'
      return isCompletionReady(product) ? '完成' : '已排期'
    }
    if (steps.includes(progress)) return calculateStyleProgress(product)
    return calculateStyleProgress(product)
  }
  if (!['常规款', '常规优先款', '常规优先', '转自研板房'].includes(link)) return progress
  const steps = getStyleProgressSteps(link)
  if (progress === '已排期' && !product.release_date) return '待排期'
  if (progress === '待排期' && product.release_date) return calculateStyleProgress(product)
  if (progress === '完成') {
    if (!product.release_date) return '待排期'
    return isCompletionReady(product) ? '完成' : '已排期'
  }
  if (steps.includes(progress)) {
    const calculatedProgress = calculateStyleProgress(product)
    return calculatedProgress
  }
  if (progress === '选图') return calculateStyleProgress({ ...product, style_progress: '待对料' })
  if (progress === '定料' || progress === '买料') return calculateStyleProgress({ ...product, style_progress: isYes(product.material_arrived) ? '待打板' : '待到料' })
  if (progress === '打版' || progress === '打板') {
    const mappedProgress = product.pattern_progress === '已通过'
      ? '待排期'
      : String(product.pattern_maker || '').trim() ? '打版中' : '待打板'
    return calculateStyleProgress({ ...product, style_progress: mappedProgress })
  }
  if (['码价', '核价中', '搭配中', '搭配'].includes(progress)) {
    return calculateStyleProgress({ ...product, style_progress: product.release_date ? '已排期' : '待排期' })
  }
  if (progress === '上新' || progress === '完成') {
    if (progress === '完成' && !isCompletionReady(product)) return '上新'
    return calculateStyleProgress({ ...product, style_progress: product.release_date ? '待排期' : '待排期' })
  }
  return calculateStyleProgress({ ...product, style_progress: '' })
}

export function getLinkDisplayLabel(link) {
  const normalizedLink = String(link ?? '').trim()
  const displayLabels = {
    AI款: '跟卖',
    AI: '跟卖',
    AI外发款: '跟卖外发',
    AI外发: '跟卖外发',
  }
  return displayLabels[normalizedLink] || normalizedLink.replace(/款/g, '')
}

export function getStyleProgressGroup(product = {}) {
  const progress = String(product.style_progress || '').trim()
  if (['待对料', '待到料'].includes(progress)) return '开发中'
  if (progress === '待排期') return '未排期'
  if (progress === '已排期') return '已排期'
  if (progress === '款式取消') return '已淘汰'
  if (progress === '待打板') return '待分配'
  if (['打版中', '审版中'].includes(progress)) return '打板中'
  if (progress === '预热中') return '预热中'
  if (progress === '外发中') return '外发中'
  if (progress === '核价中') return '核价中'
  if (progress === '搭配中') return '搭配中'
  if (progress === '待排期') return '待排期'
  if (progress === '已排期') return '已排期'
  if (progress === '通知') return '等通知'
  if (progress === '待外发') return '外发中'
  if (progress === '外发') return '外发中'
  if (['打版', '打板', '打版中', '打板中'].includes(progress)) return '打板中'
  if (progress === '搭配') return '搭配中'
  if (progress === '上新') return '上新中'
  if (progress === '完成') return '完成'
  if (progress === '已完成') return '完成'
  if (progress === '预核价' && String(product.link || '').trim() === '转自研板房') return '打板中'
  return '开发中'
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0
  return String(value ?? '').trim().length > 0
}

export function hasRequiredFitSize(value) {
  const sizes = Array.isArray(value)
    ? value
    : String(value ?? '').split(',')
  return sizes.some((size) => ['宽松', '合体', '修身'].includes(String(size || '').trim()))
}

export function requiresStyleNumber(link) {
  return ['常规款', '常规优先款', '常规优先', '外发', '外采', '转自研板房', '转自研外发', 'AI款', 'AI外发款', 'AI', 'AI外发'].includes(String(link ?? '').trim())
}

export function requiresSeason(link) {
  return !['外采', 'AI款', 'AI外发款', 'AI', 'AI外发'].includes(String(link ?? '').trim())
}

export function hasStyleNumber(value) {
  const styleNumber = String(value ?? '').trim()
  return Boolean(styleNumber) && !/^STYLE-\d+$/i.test(styleNumber)
}

function hasImage(value) {
  if (Array.isArray(value)) return value.some(Boolean)
  if (typeof value !== 'string' || !value.trim()) return false
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed.some(Boolean)
  } catch {
    // Legacy image values are stored as a single URL.
  }
  return true
}

export function hasStyleMatchingImage(product = {}) {
  return [1, 2, 3].some((number) => hasImage(product[`matching_image_${number}`]))
}

function isYes(value) {
  return value === true || value === 1 || value === '1' || value === 'true' || value === '是'
}

function isSelectionComplete(product) {
  const isExternalPurchase = product.link === '外采'
  const styleNumberReady = !requiresStyleNumber(product.link) || hasStyleNumber(product.sku)
  const imageReady = isExternalPurchase
    ? hasImage(product.physical_image_url) || hasImage(product.image_url)
    : hasImage(product.image_url)
  return Boolean(
    product.category
    && product.designer
    && styleNumberReady
    && (!requiresSeason(product.link) || product.season)
    && imageReady,
  )
}

function isMaterialsDefined(product) {
  if (linksWithMaterialRecords.has(String(product.link ?? '').trim())) {
    return [product.fabric_records, product.accessory_records]
      .some((records) => Array.isArray(records) && records.length > 0)
  }
  return ['season_type', 'color', 'composition', 'size'].every((field) => hasValue(product[field]))
}

export function getFollowUpMaterialMissingFields(product = {}) {
  const sizes = Array.isArray(product.size) ? product.size : String(product.size ?? '').split(',')
  return [
    ...(!hasImage(product.physical_image_url) ? ['实物图'] : []),
    ...(!hasValue(product.color) ? ['颜色'] : []),
    ...(!hasValue(product.highlights) ? ['产品亮点'] : []),
    ...(!hasValue(product.designer) ? ['设计师'] : []),
    ...(!hasValue(product.composition) ? ['成分'] : []),
    ...(!sizes.some((size) => ['宽松', '合体', '修身'].includes(String(size ?? '').trim())) ? ['尺码（宽松/合体/修身）'] : []),
    ...(!hasValue(product.season_type) ? ['季节'] : []),
    ...(!hasImage(product.image_url) ? ['参考图'] : []),
  ]
}

function isFollowUpMaterialInfoComplete(product) {
  return getFollowUpMaterialMissingFields(product).length === 0
}

const matchingCompletionProgresses = new Set(['已拍照', '已AI拍照', '已AI生图', '已完成'])

export function isMatchingProgressComplete(progress) {
  return matchingCompletionProgresses.has(String(progress ?? '').trim())
}

function isMatchingComplete(product) {
  return [1, 2, 3].some((number) => isMatchingProgressComplete(product[`matching_progress_${number}`]))
}

const reviewRequiredLinks = new Set(['常规款', '常规优先款', '常规优先', '转自研板房'])

function hasReviewRequiredFields(product) {
  const link = String(product.link ?? '').trim()
  if (!reviewRequiredLinks.has(link)) return true
  return Boolean(
    hasImage(product.image_url)
    && hasValue(product.category)
    && hasValue(product.designer)
    && hasImage(product.physical_image_url)
    && hasValue(product.link)
    && hasValue(product.season_type)
    && hasValue(product.color)
    && hasValue(product.composition)
    && hasRequiredFitSize(product.size)
    && hasValue(product.highlights),
  )
}

function isPricingComplete(product) {
  return Number(product.processing_fee) > 0
}

function isMatchingBadgeComplete(product) {
  return isMatchingComplete(product)
}

function isCompletionReady(product) {
  const link = String(product.link ?? '').trim()
  if (['AI款', 'AI'].includes(link)) return product.pattern_progress === '已通过'
  if (['AI外发款', 'AI外发'].includes(link)) return isYes(product.material_outsourced)
  if (!isCompletionWindowOpen(product.release_date)) return false
  const matchingRequired = ['常规款', '常规优先款', '常规优先', '外采', '外发', '转自研板房', '转自研外发'].includes(link)
  const pricingRequired = ['常规款', '常规优先款', '常规优先', '外发', '转自研板房', '转自研外发'].includes(link)
  return (!matchingRequired || isMatchingBadgeComplete(product)) && (!pricingRequired || isPricingComplete(product))
}

function calculateFollowUpProgress(product, isOutsource) {
  const steps = getStyleProgressSteps(product.link)
  const current = String(product.style_progress ?? '').trim()
  const isFollowUpPattern = ['AI款', 'AI'].includes(String(product.link || '').trim())
  const patternProgress = String(product.pattern_progress || '').trim()
  if (isFollowUpPattern) {
    if (patternProgress === '审核中') return '审版中'
    if (['纸样中', '车板中'].includes(patternProgress)) return '打板中'
    if (patternProgress === '已通过') return '完成'
  }
  const currentIndex = steps.indexOf(current)
  let progress = currentIndex >= 0 ? current : steps[0]
  const startIndex = currentIndex >= 0 ? currentIndex : 0
  for (let index = startIndex; index < steps.length - 1; index += 1) {
    const stage = steps[index]
    let complete = false
    if (stage === '待对料') {
      const isFollowUp = ['AI款', 'AI外发款', 'AI', 'AI外发'].includes(String(product.link || '').trim())
      complete = isMaterialsDefined(product) && (!isFollowUp || (hasStyleNumber(product.sku) && isFollowUpMaterialInfoComplete(product)))
    }
    else if (stage === '待排期') complete = hasValue(product.release_date)
    else if (stage === '已排期') complete = false
    else if (stage === '预热中') complete = isOutsource || Boolean(product.pattern_started_at) || ['纸样中', '车板中', '审核中', '已通过'].includes(product.pattern_progress)
    else if (stage === '打板中') complete = isFollowUpPattern
      ? ['审核中', '已通过'].includes(patternProgress)
      : product.pattern_progress === '已通过'
    else if (stage === '审版中') complete = patternProgress === '已通过' && hasReviewRequiredFields(product)
    else if (stage === '外发中') complete = false
    if (!complete) break
    progress = steps[index + 1]
  }
  return progress
}

function isFollowUpOutsourceLink(link) {
  return ['AI外发款', 'AI外发'].includes(String(link ?? '').trim())
}

export function isStyleProgressStageComplete(product, stage) {
  switch (stage) {
    case '待外采': return String(product.external_purchase_progress || '').trim() === '外采到货'
    case '待排期': return hasValue(product.release_date)
    case '已排期': return ['AI款', 'AI外发款', 'AI', 'AI外发'].includes(String(product.link || '').trim()) ? false : isCompletionReady(product)
    case '待对料': {
      const isFollowUp = ['AI款', 'AI外发款', 'AI', 'AI外发'].includes(String(product.link || '').trim())
      return isMaterialsDefined(product) && (!isFollowUp || (hasStyleNumber(product.sku) && isFollowUpMaterialInfoComplete(product)))
    }
    case '待到料': return isYes(product.material_arrived)
    case '待打板': return ['纸样中', '车板中', '审核中', '已通过'].includes(product.pattern_progress) || Boolean(product.pattern_started_at)
    case '打版中': return ['纸样中', '车板中'].includes(String(product.pattern_progress || '').trim())
    case '打板中': return ['AI款', 'AI'].includes(String(product.link || '').trim())
      && ['审核中', '已通过'].includes(String(product.pattern_progress || '').trim())
    case '审版中': return product.pattern_progress === '已通过' && hasReviewRequiredFields(product)
    case '待外发': return isYes(product.material_outsourced)
    case '选图': return isSelectionComplete(product)
    case '定料': return isMaterialsDefined(product)
    case '买料': return isYes(product.material_arrived)
    case '通知': return isYes(product.material_notified)
    case '外发': return isYes(product.material_outsourced)
    case '预核价': return Number(product.price) > 0
    case '打版':
    case '打板': return product.pattern_progress === '已通过'
    case '搭配': return isMatchingComplete(product)
    case '上新': return isCompletionReady(product)
    case '完成': return false
    case '预热中': return false
    case '外发中': return isYes(product.material_outsourced)
    default: return false
  }
}

export function calculateStyleProgress(product, { stopAtPrePricing = false } = {}) {
  const steps = getStyleProgressSteps(product.link)
  if (['AI款', 'AI'].includes(String(product.link ?? '').trim())) return calculateFollowUpProgress(product, false)
  if (['AI外发款', 'AI外发'].includes(String(product.link ?? '').trim())) return calculateFollowUpProgress(product, true)
  if (['常规款', '常规优先款', '常规优先', '转自研板房'].includes(String(product.link ?? '').trim())) {
    const existingIndex = steps.indexOf(String(product.style_progress ?? '').trim())
    if (existingIndex === steps.length - 1) return isCompletionReady(product) ? '完成' : steps[steps.length - 2]
    const patternProgress = String(product.pattern_progress || '').trim()
    const reviewIndex = steps.indexOf('审版中')
    const patternStarted = ['纸样中', '车板中'].includes(patternProgress)
    const patternReviewing = patternProgress === '审核中'
    const patternApproved = patternProgress === '已通过'
    let effectiveIndex = existingIndex
    if (reviewIndex >= 0 && (patternReviewing || patternApproved) && existingIndex < reviewIndex) {
      product = { ...product, style_progress: '审版中' }
      effectiveIndex = reviewIndex
    }
    let progress = steps.includes(String(product.style_progress ?? '').trim()) ? product.style_progress : steps[0]
    const startIndex = effectiveIndex >= 0 ? effectiveIndex : 0
    if (reviewIndex >= 0 && patternReviewing) return '审版中'
    if (reviewIndex >= 0 && patternStarted) return '打版中'
    if (reviewIndex >= 0 && patternApproved && startIndex < reviewIndex) progress = '审版中'
    for (let index = startIndex; index < steps.length - 1; index += 1) {
      if (!isStyleProgressStageComplete(product, steps[index])) break
      progress = steps[index + 1]
    }
    return progress
  }
  let progress = steps[0]
  for (let index = 0; index < steps.length - 1; index += 1) {
    if (stopAtPrePricing && steps[index] === '预核价') break
    if (!isStyleProgressStageComplete(product, steps[index])) break
    progress = steps[index + 1]
  }
  return progress
}
