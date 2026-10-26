import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { getPool, initDatabase } from './db.js'
import multer from 'multer'
import { calculateStyleProgress, getStyleProgressGroup, getStyleProgressSteps, hasStyleNumber, isStyleProgressStageComplete, normalizeStyleProgress, requiresStyleNumber } from '../src/styleProgress.js'

dotenv.config()

const app = express()
const port = Number(process.env.API_PORT || 3001)
const userPositions = ['设计师', '设计师助理', '管理员', '纸样师', '车板师']
const allowedFields = [
  'sku', 'season', 'category', 'designer', 'designer_assistant', 'pattern_maker', 'release_date', 'link',
  'season_type', 'color', 'composition', 'size', 'highlights', 'priority', 'style_progress', 'style_progress_times', 'pattern_progress', 'pattern_started_at', 'pattern_progress_times', 'material_notified', 'material_arrived', 'material_outsourced', 'first_pattern_progress', 'first_pattern_image_url', 'first_board_progress', 'first_board_maker', 'first_review_result', 'first_review_opinion_image_url', 'second_pattern_progress', 'second_pattern_image_url', 'second_board_progress', 'second_board_maker', 'second_review_result', 'second_review_opinion_image_url', 'third_pattern_progress', 'third_pattern_image_url', 'third_board_progress', 'third_board_maker', 'third_review_result', 'third_review_opinion_image_url', 'preproduction_sample', 'preproduction_board_progress', 'preproduction_board_maker', 'has_pattern', 'pattern_notes', 'pattern_reference_image_url', 'pattern_complete_style', 'pattern_complete_image_url', 'design_pattern_progress', 'design_pattern_notes',
  'price', 'pricing', 'processing_fee', 'reference_sales', 'stock', 'status', 'description', 'image_url', 'physical_image_url', 'design_image_url',
  'front_back_image_url', 'size_chart_url', 'processing_fee_image_url', 'price_image_url', 'composition_image_url', 'external_purchase_notes', 'is_resale_to_self_developed', 'external_purchase_progress', 'is_canceled', 'supplier', 'channel', 'address', 'contact', 'product_url', 'reference_link', 'official_matching_sku', 'final_pattern_image_url', 'final_pattern_filename',
  'matching_image_1', 'matching_sku_1', 'matching_progress_1',
  'matching_image_2', 'matching_sku_2', 'matching_progress_2',
  'matching_image_3', 'matching_sku_3', 'matching_progress_3',
]
const serverDir = path.dirname(fileURLToPath(import.meta.url))
const uploadDir = path.join(serverDir, 'uploads')
fs.mkdirSync(uploadDir, { recursive: true })
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase() || '.jpg'
      callback(null, `reference-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extension}`)
    },
  }),
  fileFilter: (_req, file, callback) => callback(null, /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype) || path.extname(file.originalname).toLowerCase() === '.prj'),
})

function normalizeUploadFilename(filename) {
  const raw = String(filename || '')
  if (!raw) return ''
  const decoded = Buffer.from(raw, 'latin1').toString('utf8')
  return decoded.includes('\uFFFD') ? raw : decoded
}

function normalizeDateOnly(value) {
  if (!value) return value
  if (value instanceof Date) {
    return value.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
  }
  const text = String(value)
  return text.length >= 10 ? text.slice(0, 10) : text
}

function firstImageValue(value) {
  if (Array.isArray(value)) return value.find(Boolean) || ''
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.find(Boolean) || ''
    if (typeof parsed === 'string') return parsed
  } catch {
    // Image values may be stored as a single URL.
  }
  return raw
}

function resolveUploadedImage(value) {
  const raw = firstImageValue(value)
  if (!raw) return ''
  let pathname = raw
  try { pathname = new URL(raw, 'http://localhost').pathname } catch { return '' }
  if (!pathname.startsWith('/uploads/')) return ''
  const filename = path.basename(decodeURIComponent(pathname.slice('/uploads/'.length)))
  if (!filename || filename !== path.basename(filename)) return ''
  const imagePath = path.join(uploadDir, filename)
  return fs.existsSync(imagePath) ? imagePath : ''
}

function generateStyleDocument(kind, product, preview = false) {
  return new Promise((resolve, reject) => {
    const generator = path.join(serverDir, 'document_export.py')
    const payload = JSON.stringify({ product, image_path: resolveUploadedImage(product.physical_image_url) })
    const child = spawn(process.env.PYTHON_EXECUTABLE || 'python', [generator, kind, ...(preview ? ['--preview'] : [])], { windowsHide: true })
    const output = []
    const errors = []
    let outputLength = 0
    child.stdout.on('data', (chunk) => {
      outputLength += chunk.length
      if (outputLength > 25 * 1024 * 1024) {
        child.kill()
        reject(new Error('生成文件超过大小限制'))
        return
      }
      output.push(chunk)
    })
    child.stderr.on('data', (chunk) => errors.push(chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(Buffer.concat(errors).toString('utf8').trim() || 'Excel生成失败，请确认已安装 openpyxl 和 Pillow'))
        return
      }
      resolve(Buffer.concat(output))
    })
    child.stdin.on('error', reject)
    child.stdin.end(payload)
  })
}

app.use(cors())
app.use(express.json({ limit: '1mb' }))
app.use('/uploads', express.static(uploadDir))

const hashSessionToken = (token) => createHash('sha256').update(token).digest('hex')
const hashPassword = (password, salt = randomBytes(16).toString('hex')) => `${salt}:${scryptSync(password, salt, 64).toString('hex')}`

function passwordMatches(password, storedHash) {
  const [salt, expectedHex] = String(storedHash || '').split(':')
  if (!salt || !expectedHex) return false
  const actual = scryptSync(password, salt, 64)
  const expected = Buffer.from(expectedHex, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

async function createUserSession(userId) {
  const token = randomBytes(32).toString('base64url')
  await getPool().query(
    'INSERT INTO app_user_sessions (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 12 HOUR))',
    [userId, hashSessionToken(token)],
  )
  return token
}

function publicUser(user) {
  return { id: user.id, account: user.account, position: user.position, role: user.role }
}

async function recordOperationLog({ actor, action, details = '', method, requestPath, ipAddress, statusCode = 200 }) {
  await getPool().query(
    `INSERT INTO system_operation_logs
      (actor_id, actor_account, actor_position, action, details, method, request_path, ip_address, status_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [actor?.id || null, actor?.account || '系统', actor?.position || '', action, details || null, method, requestPath, ipAddress || null, statusCode],
  )
}

const productAuditLabels = {
  sku: '款号', season: '期数', category: '品类', designer: '设计师', designer_assistant: '设计师助理', pattern_maker: '纸样师',
  release_date: '上新日期', link: '链路', season_type: '季节', color: '颜色', composition: '成分', size: '尺码', highlights: '产品亮点',
  priority: '优先级', style_progress: '总进度', pattern_progress: '纸样进度', pattern_started_at: '开始纸样时间', material_notified: '是否通知', material_arrived: '是否到料',
  material_outsourced: '是否外发', first_pattern_progress: '一版纸样进度', first_board_progress: '一版车板进度', first_board_maker: '一版车板师',
  first_review_result: '一版审核结果', first_review_opinion_image_url: '头版审核意见', first_pattern_image_url: '一版纸样图', second_pattern_image_url: '二版纸样图', second_board_progress: '二版车板进度',
  second_board_maker: '二版车板师', second_review_result: '二版审核结果', second_review_opinion_image_url: '复版审核意见', third_pattern_progress: '三版纸样进度',
  third_pattern_image_url: '三版纸样图', third_board_progress: '三版车板进度', third_board_maker: '三版车板师', third_review_result: '三版审核结果', third_review_opinion_image_url: '三版审核意见',
  preproduction_sample: '产前样', preproduction_board_progress: '产前样车板进度', preproduction_board_maker: '产前样车板师', has_pattern: '图案/工艺',
  pattern_notes: '打板注意事项', pattern_reference_image_url: '图案参考图', pattern_complete_style: '图案完成样式', pattern_complete_image_url: '图案完成图片',
  design_pattern_progress: '图案进度', design_pattern_notes: '图案备注', price: '外采价格', pricing: '定价', processing_fee: '加工费',
  reference_sales: '参考销量', stock: '库存', status: '状态', description: '描述', image_url: '参考图', physical_image_url: '实物图',
  design_image_url: '设计图', front_back_image_url: '正反图', size_chart_url: '尺码表', processing_fee_image_url: '加工费明细', price_image_url: '价格图',
  composition_image_url: '成分图片', external_purchase_notes: '外采备注', is_resale_to_self_developed: '是否转自研', external_purchase_progress: '外采进度',
  is_canceled: '是否取消', supplier: '供应商', channel: '渠道', address: '地址', contact: '联系方式', product_url: '产品链接', reference_link: '参考链接',
  official_matching_sku: '官搭款号', final_pattern_image_url: '最终纸样图', final_pattern_filename: '最终纸样文件名', matching_image_1: '搭配图一', matching_sku_1: '搭配款号一',
  matching_progress_1: '搭配进度一', matching_image_2: '搭配图二', matching_sku_2: '搭配款号二', matching_progress_2: '搭配进度二', matching_image_3: '搭配图三',
  matching_sku_3: '搭配款号三', matching_progress_3: '搭配进度三',
}
const productImageAuditFields = new Set(Object.keys(productAuditLabels).filter((field) => field.endsWith('_url') || field.startsWith('matching_image_')))
productImageAuditFields.add('color_card_image_url')
productImageAuditFields.add('inspection_report_url')
const productBooleanAuditFields = new Set(['material_notified', 'material_arrived', 'material_outsourced', 'has_pattern', 'is_resale_to_self_developed', 'is_canceled'])
const materialAuditFields = {
  fabric_records: { label: '面料', identity: ['code', 'supplier'], fields: { supplier: '供应商', code: '编号', color_code: '色号', width: '幅宽', quote: '单价', weight_difference: '空差', unit: '单位', meterage: '出米数', usage_amount: '用量', cost: '成本', color_card_image_url: '色卡图片', inspection_report_url: '检测报告' } },
  accessory_records: { label: '辅料', identity: ['accessory', 'specification'], fields: { accessory: '辅料名称', specification: '规格', supplier: '供应商', color: '颜色', unit: '单位', unit_price: '单价', usage_amount: '用量', cost: '成本' } },
  craft_records: { label: '工艺', identity: ['type', 'process'], fields: { type: '类型', factory: '厂家', process: '工艺名称', price: '工艺价格' } },
}
const auditFieldLabels = {
  ...productAuditLabels,
  account: '账号', position: '职位', role: '权限', is_active: '账号状态', designer_user_id: '绑定设计师编号', designer_name: '绑定设计师',
  name: '名称', image_url: '图片', date: '上新日期', date_label: '上新日期', sort_order: '排序值',
  title: '公告标题', content: '公告内容', status: '发布状态', published_at: '发布时间', created_by_account: '发布人',
  date_values: '各日期计划款数', self_developed: '自研比例', follow_up: '跟买比例', outsource: '外采比例', style_count: '品类款数',
  file_name: '文件名', affected_plans: '受影响品类计划',
}
const auditSensitiveFields = new Set(['password', 'password_hash', 'token', 'authorization'])

function auditComparable(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return ''
    try { return auditComparable(JSON.parse(trimmed)) } catch { return trimmed }
  }
  if (Array.isArray(value)) return value.map(auditComparable)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, auditComparable(value[key])]))
  return value ?? ''
}

function auditValueLabel(value, field = '') {
  if (value === null || value === undefined || value === '') return '—'
  if (value instanceof Date) return value.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
  if (productImageAuditFields.has(field)) return '图片已设置'
  if (productBooleanAuditFields.has(field) || field === 'is_active') return value === true || value === 1 || value === '1' ? '是' : '否'
  if (field === 'role') return value === 'super_admin' ? '超级管理员' : '普通用户'
  if (field === 'date_values' && typeof value === 'object') return Object.entries(value).map(([date, count]) => `${date}：${count ?? '—'}`).join('，') || '—'
  if (field === 'affected_plans' && Array.isArray(value)) return value.map((plan) => `${plan.category}（${plan.planned_count ?? '—'}款）`).join('、') || '无'
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 1000)
  return String(value).replace(/\s+/g, ' ').slice(0, 1000)
}

function auditChangeDescription(label, before, after, field = '') {
  if (productImageAuditFields.has(field) && before && after) return `${label}：图片内容已更新`
  return `${label}：${auditValueLabel(before, field)} → ${auditValueLabel(after, field)}`
}

function diffMaterialRecords(field, beforeRows = [], afterRows = []) {
  const spec = materialAuditFields[field]
  const changes = []
  for (let index = 0; index < Math.max(beforeRows.length, afterRows.length); index += 1) {
    const before = beforeRows[index]
    const after = afterRows[index]
    const record = after || before
    const identity = spec.identity.map((key) => record?.[key]).filter(Boolean).join('/') || `第${index + 1}项`
    if (!before || !after) {
      const recordValues = Object.entries(spec.fields)
        .filter(([key]) => !auditSensitiveFields.has(key) && record?.[key] !== '' && record?.[key] !== null && record?.[key] !== undefined)
        .map(([key, label]) => `${label}：${auditValueLabel(record[key], key)}`)
      changes.push(`${spec.label}[${identity}]${before ? '删除' : '新增'}${recordValues.length ? `（${recordValues.join('，')}）` : ''}`)
      continue
    }
    const changed = Object.entries(spec.fields).flatMap(([key, label]) => (
      JSON.stringify(auditComparable(before[key])) === JSON.stringify(auditComparable(after[key]))
        ? []
        : [auditChangeDescription(label, before[key], after[key], key)]
    ))
    if (changed.length) changes.push(`${spec.label}[${identity}] ${changed.join('，')}`)
  }
  return changes
}

function productAuditDetails(before, after) {
  if (!before || !after || typeof after !== 'object') return ''
  const changes = Object.entries(productAuditLabels).flatMap(([field, label]) => (
    !Object.hasOwn(after, field) ? [] :
    JSON.stringify(auditComparable(before[field])) === JSON.stringify(auditComparable(after[field]))
      ? []
      : [auditChangeDescription(label, before[field], after[field], field)]
  ))
  for (const field of Object.keys(materialAuditFields)) {
    changes.push(...diffMaterialRecords(field, before[field] || [], after[field] || []))
  }
  return changes.length ? changes.join('；').slice(0, 10000) : '未检测到字段变化'
}

function auditRecordSummary(record, { omitEmpty = true } = {}) {
  if (!record || typeof record !== 'object') return ''
  return Object.entries(auditFieldLabels).flatMap(([field, label]) => {
    if (!Object.hasOwn(record, field) || auditSensitiveFields.has(field)) return []
    if (field === 'date' && record.date_label) return []
    const value = record[field]
    if (omitEmpty && (value === '' || value === null || value === undefined || (Array.isArray(value) && value.length === 0))) return []
    if (field === 'designer_user_id' && record.designer_name) return []
    return [`${label}：${auditValueLabel(value, field)}`]
  }).concat(
    ...Object.keys(materialAuditFields).map((field) => diffMaterialRecords(field, [], record[field] || [])),
  ).join('；').slice(0, 10000)
}

function auditObjectDiff(before, after) {
  if (!before || !after || typeof after !== 'object') return ''
  const changes = Object.entries(auditFieldLabels).flatMap(([field, label]) => {
    if (!Object.hasOwn(before, field) || !Object.hasOwn(after, field) || auditSensitiveFields.has(field)) return []
    if (field === 'designer_user_id' || field === 'designer_name') return []
    if (field === 'date_values' && before[field] && after[field] && typeof before[field] === 'object' && typeof after[field] === 'object') {
      const dates = new Set([...Object.keys(before[field]), ...Object.keys(after[field])])
      return [...dates].flatMap((date) => String(before[field][date] ?? '') === String(after[field][date] ?? '')
        ? []
        : [`${date}计划款数：${auditValueLabel(before[field][date])} → ${auditValueLabel(after[field][date])}`])
    }
    return JSON.stringify(auditComparable(before[field])) === JSON.stringify(auditComparable(after[field]))
      ? []
      : [auditChangeDescription(label, before[field], after[field], field)]
  })
  if (Object.hasOwn(before, 'designer_user_id') && Object.hasOwn(after, 'designer_user_id')) {
    const beforeDesigner = before.designer_name || before.designer_user_id || ''
    const afterDesigner = after.designer_name || after.designer_user_id || ''
    if (String(beforeDesigner) !== String(afterDesigner)) changes.push(auditChangeDescription('绑定设计师', beforeDesigner, afterDesigner))
  }
  return changes.join('；').slice(0, 10000) || '未检测到字段变化'
}

async function loadAuditSnapshot(pathSegments) {
  const [resource, id] = pathSegments
  if (!id) return null
  const pool = getPool()
  if (resource === 'products' && /^\d+$/.test(id)) {
    const [rows] = await pool.query('SELECT * FROM products WHERE id = ? LIMIT 1', [id])
    return rows[0] ? withMaterialData(rows[0]) : null
  }
  if (resource === 'users' && /^\d+$/.test(id)) {
    const [rows] = await pool.query('SELECT u.id, u.account, u.position, u.designer_user_id, d.account AS designer_name, u.role, u.is_active FROM app_users u LEFT JOIN app_users d ON d.id = u.designer_user_id WHERE u.id = ? LIMIT 1', [id])
    return rows[0] || null
  }
  if (resource === 'announcements' && /^\d+$/.test(id)) {
    const [rows] = await pool.query('SELECT id, title, content, status, published_at, created_by_account, created_at, updated_at FROM announcements WHERE id = ? LIMIT 1', [id])
    return rows[0] || null
  }
  if (resource === 'categories' && /^\d+$/.test(id)) {
    const [rows] = await pool.query('SELECT id, name, image_url FROM product_categories WHERE id = ? LIMIT 1', [id])
    return rows[0] || null
  }
  if (resource === 'designers' && /^\d+$/.test(id)) {
    const [rows] = await pool.query('SELECT id, name FROM product_designers WHERE id = ? LIMIT 1', [id])
    return rows[0] || null
  }
  if (resource === 'category-planning' && id === 'dates' && /^\d+$/.test(pathSegments[2] || '')) {
    const [rows] = await pool.query('SELECT id, date_label FROM category_plan_dates WHERE id = ? LIMIT 1', [pathSegments[2]])
    if (!rows[0]) return null
    const [plans] = await pool.query('SELECT category, date_values FROM category_plans')
    const affectedPlans = plans.flatMap((plan) => {
      const entry = categoryPlanDateEntries(plan.date_values).find((item) => item.date === rows[0].date_label)
      return entry ? [{ category: plan.category, planned_count: entry.value }] : []
    })
    return { ...rows[0], affected_plans: affectedPlans }
  }
  if (resource === 'category-planning' && id !== 'dates') {
    const category = decodeURIComponent(id)
    const [rows] = await pool.query('SELECT category, date_values, self_developed, follow_up, outsource, style_count FROM category_plans WHERE category = ? LIMIT 1', [category])
    if (!rows[0]) return null
    const row = rows[0]
    return { ...row, date_values: Object.fromEntries(categoryPlanDateEntries(row.date_values).map((entry) => [entry.date, entry.value])) }
  }
  return null
}

function operationAuditDetails({ req, pathSegments, before, responseBody, statusCode }) {
  if (statusCode >= 400) return responseBody?.message ? `失败原因：${responseBody.message}` : ''
  const [resource] = pathSegments
  if (resource === 'products') {
    if (pathSegments[1] === 'advance-progress' && before && responseBody) return productAuditDetails(before, { ...before, ...responseBody })
    if (req.method === 'PUT') return productAuditDetails(before, responseBody)
    if (req.method === 'POST') {
      const details = productAuditDetails({}, req.body || {})
      return details === '未检测到字段变化' ? '' : `创建款式：${details}`
    }
    if (req.method === 'DELETE') return `删除前资料：${auditRecordSummary(before)}`
  }
  if (resource === 'exports') {
    const product = req.body?.product || {}
    const documentName = pathSegments[1] === 'material' ? '物料单' : '版单'
    return `${documentName}${pathSegments[2] === 'preview' ? '预览' : '下载'}：款号：${product.sku || '—'}`
  }
  if (resource === 'uploads') {
    return responseBody ? `文件名：${responseBody.name || responseBody.file_name || '—'}；文件地址：${responseBody.url || '—'}` : ''
  }
  if (req.method === 'DELETE') return `删除前资料：${auditRecordSummary(before)}`
  if (req.method === 'POST') {
    const created = { ...(req.body || {}), ...(responseBody && typeof responseBody === 'object' ? responseBody : {}) }
    const details = auditRecordSummary(created)
    return details ? `新增内容：${details}` : '新增记录'
  }
  if (req.method === 'PUT' || req.method === 'PATCH') {
    if (resource === 'category-planning' && pathSegments[1] === 'dates' && before?.affected_plans?.length) {
      const change = auditObjectDiff(before, responseBody)
      return `${change}；同步调整品类计划：${auditValueLabel(before.affected_plans, 'affected_plans')}`
    }
    return auditObjectDiff(before, responseBody)
  }
  return ''
}

function operationAuditTarget(req, pathSegments, before, responseBody) {
  const entity = responseBody && typeof responseBody === 'object' ? responseBody : {}
  const body = req.body || {}
  return req.auditTarget || before?.sku || before?.account || before?.name || before?.category || before?.date_label
    || entity.sku || entity.account || entity.name || entity.category || entity.date_label
    || body.sku || body.account || body.name || body.category || body.date || ''
}

function operationAction(method, requestPath, auditTarget = '') {
  const segments = requestPath.split('?')[0].split('/').filter(Boolean).slice(1)
  const resourceKey = segments[0] || ''
  const resourceNames = {
    products: '款式', patterns: '纸样', users: '用户', announcements: '公告', categories: '品类', designers: '设计师',
    'category-planning': '品类规划', uploads: '文件', exports: '单据', matching: '搭配',
  }
  const verbs = { POST: '新增', PUT: '修改', PATCH: '修改', DELETE: '删除' }
  const verb = resourceKey === 'uploads' ? '上传' : resourceKey === 'exports' ? '生成' : (verbs[method] || '操作')
  const resource = resourceNames[resourceKey] || '系统数据'
  const targetValue = auditTarget || segments[1]
  const target = targetValue && !['preview', 'dates', 'summary', 'advance-progress', 'status'].includes(targetValue)
    ? `（${String(targetValue).slice(0, 100)}）`
    : ''
  if (resourceKey === 'exports') return `${verb}${requestPath.includes('/preview') ? '预览' : ''}${requestPath.includes('material') ? '物料单' : requestPath.includes('pattern') ? '版单' : resource}`
  if (resourceKey === 'category-planning' && segments[1] === 'dates') return `${verb}上新日期${target}`
  if (resourceKey === 'users' && segments[2] === 'status') return `修改用户状态${target}`
  return `${verb}${resource}${target}`
}

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const account = String(req.body?.account || '').trim()
    const password = String(req.body?.password || '')
    const [rows] = await getPool().query('SELECT id, account, password_hash, position, role, is_active FROM app_users WHERE account = ? LIMIT 1', [account])
    const user = rows[0]
    if (!user || !passwordMatches(password, user.password_hash)) {
      await recordOperationLog({ actor: { account: account || '未知账号' }, action: '登录失败', details: `尝试登录账号：${account || '未填写'}`, method: 'POST', requestPath: '/api/auth/login', ipAddress: req.ip, statusCode: 401 })
      return res.status(401).json({ message: '账号或密码错误' })
    }
    if (!user.is_active) {
      await recordOperationLog({ actor: user, action: '停用账号尝试登录', details: `账号：${user.account}；职位：${user.position || '—'}`, method: 'POST', requestPath: '/api/auth/login', ipAddress: req.ip, statusCode: 403 })
      return res.status(403).json({ message: '账号已停用，请联系超级管理员' })
    }
    const token = await createUserSession(user.id)
    await recordOperationLog({ actor: user, action: '登录系统', details: `账号：${user.account}；职位：${user.position || '—'}`, method: 'POST', requestPath: '/api/auth/login', ipAddress: req.ip })
    res.json({ token, user: publicUser(user) })
  } catch (error) { next(error) }
})

app.post('/api/auth/logout', async (req, res, next) => {
  try {
    const token = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '')
    if (token) {
      const [rows] = await getPool().query(
        `SELECT u.id, u.account, u.position FROM app_user_sessions s JOIN app_users u ON u.id = s.user_id WHERE s.token_hash = ? LIMIT 1`,
        [hashSessionToken(token)],
      )
      if (rows[0]) await recordOperationLog({ actor: rows[0], action: '退出登录', details: `账号：${rows[0].account}；职位：${rows[0].position || '—'}`, method: 'POST', requestPath: '/api/auth/logout', ipAddress: req.ip })
      await getPool().query('DELETE FROM app_user_sessions WHERE token_hash = ?', [hashSessionToken(token)])
    }
    res.status(204).end()
  } catch (error) { next(error) }
})

function productPayload(body) {
  const payload = {}
  for (const field of allowedFields) {
    if (body[field] === undefined) continue
    payload[field] = field === 'pricing' && (body[field] === '' || body[field] === null)
      ? 0
      : (field === 'release_date' || field === 'is_canceled') && body[field] === '' ? null : body[field]
  }
  return payload
}

function parseProgressTimes(value) {
  if (value && typeof value === 'object') return { ...value }
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function hasImageValue(value) {
  if (Array.isArray(value)) return value.some(Boolean)
  const imageValue = String(value ?? '').trim()
  if (!imageValue) return false
  try {
    const parsed = JSON.parse(imageValue)
    if (Array.isArray(parsed)) return parsed.some(Boolean)
    if (typeof parsed === 'string') return Boolean(parsed.trim())
  } catch {
    // Existing records may store one image URL directly.
  }
  return true
}

function isYes(value) {
  return value === true || value === 1 || value === '1' || value === 'true' || value === '是'
}

function isCanceled(value) {
  return isYes(value)
}

function withProgressTimes(product) {
  const fallbackTime = product.updated_at || product.created_at || new Date().toISOString()
  const styleSteps = getStyleProgressSteps(product.link)
  const storedStyleProgress = String(product.style_progress || '')
  const normalizedStyleProgress = normalizeStyleProgress(product)
  const isRegularStyle = ['常规款', '常规优先款', '常规优先', '转自研板房'].includes(String(product.link || '').trim())
  const isExternalPurchase = String(product.link || '').trim() === '外采'
  const isOutsource = ['外发', '转自研外发'].includes(String(product.link || '').trim())
  const isFollowUp = ['AI款', 'AI外发款', 'AI', 'AI外发'].includes(String(product.link || '').trim())
  const styleProgress = isCanceled(product.is_canceled)
    ? '款式取消'
    : isRegularStyle || isExternalPurchase || isOutsource || isFollowUp ? normalizedStyleProgress
      : storedStyleProgress === '完成' && !product.release_date ? '上新'
        : storedStyleProgress === '上新' && product.release_date ? '完成'
          : styleSteps.includes(storedStyleProgress) ? storedStyleProgress : calculateStyleProgress(product)
  const patternProgress = product.pattern_progress || '分配中'
  const styleTimes = parseProgressTimes(product.style_progress_times)
  const patternTimes = parseProgressTimes(product.pattern_progress_times)
  if (!styleTimes[styleProgress]) styleTimes[styleProgress] = fallbackTime
  if (!Object.keys(patternTimes).length) patternTimes[patternProgress] = fallbackTime
  return {
    ...product,
    ...(product.link === '外采' ? { total_cost: Number(product.price || 0) } : {}),
    release_date: normalizeDateOnly(product.release_date),
    season: normalizeDateOnly(product.season),
    style_progress: styleProgress,
    style_progress_times: styleTimes,
    pattern_progress_times: patternTimes,
  }
}

async function syncReleaseCompletionProgress() {
  const [rows] = await getPool().query("SELECT * FROM products WHERE (style_progress IN ('上新', '完成', '待排期', '已排期', '预热中', '打板中', '审版中', '外发中') OR link IN ('外采', '外发', '转自研板房', '转自研外发', 'AI款', 'AI外发款', 'AI', 'AI外发')) AND (is_canceled IS NULL OR is_canceled <> 1)")
  for (const row of rows) {
    const progressProduct = ['AI款', 'AI外发款', 'AI', 'AI外发'].includes(String(row.link || '').trim())
      ? await withMaterialData(row)
      : row
    const nextProgress = normalizeStyleProgress(progressProduct)
    if (row.style_progress === nextProgress) continue
    const styleTimes = parseProgressTimes(row.style_progress_times)
    styleTimes[nextProgress] ||= row.updated_at || new Date().toISOString()
    await getPool().query('UPDATE products SET style_progress = ?, style_progress_times = ? WHERE id = ?', [nextProgress, JSON.stringify(styleTimes), row.id])
  }
}

function isBoardRevisionResult(result) {
  return result === '未通过-车板修改' || result === '未通过-车样修改'
}

function hasPatternWorkStarted(product) {
  return Boolean(
    product.first_pattern_image_url || product.second_pattern_image_url || product.third_pattern_image_url
    || product.first_pattern_progress === '纸样已完成' || product.second_pattern_progress === '纸样已完成' || product.third_pattern_progress === '纸样已完成'
    || product.first_board_progress === '车板已完成' || product.second_board_progress === '车板已完成' || product.third_board_progress === '车板已完成'
    || product.first_board_maker || product.second_board_maker || product.third_board_maker
    || product.first_review_result || product.second_review_result || product.third_review_result,
  )
}

function syncPatternStageProgress(product, persistedPayload) {
  const stages = ['first', 'second', 'third']
  for (let index = 0; index < stages.length; index += 1) {
    const prefix = stages[index]
    const imageField = `${prefix}_pattern_image_url`
    const progressField = `${prefix}_pattern_progress`
    const previousPrefix = stages[index - 1]
    const previousReview = previousPrefix ? product[`${previousPrefix}_review_result`] : ''
    const boardRevision = isBoardRevisionResult(previousReview)
    if (boardRevision && !product[imageField] && previousPrefix && product[`${previousPrefix}_pattern_image_url`] && (!persistedPayload || !Object.hasOwn(persistedPayload, imageField))) {
      product[imageField] = product[`${previousPrefix}_pattern_image_url`]
      if (persistedPayload) persistedPayload[imageField] = product[imageField]
    }
    const requestedProgress = persistedPayload && Object.hasOwn(persistedPayload, progressField)
      ? persistedPayload[progressField]
      : product[progressField]
    const progress = requestedProgress === '纸样已完成' ? '纸样已完成' : '纸样未完成'
    product[progressField] = progress
    if (persistedPayload) persistedPayload[progressField] = progress
  }
}

function calculatePatternProgress(product) {
  if (!String(product.pattern_maker || '').trim()) return '分配中'
  if (!hasPatternWorkStarted(product)) {
    if (product.pattern_progress === '已分配') return '已分配'
    if (product.pattern_progress === '纸样中' || product.pattern_started_at) return '纸样中'
  }
  const stages = [
    ['first_pattern_progress', 'first_pattern_image_url', 'first_board_progress', 'first_board_maker', 'first_review_result'],
    ['second_pattern_progress', 'second_pattern_image_url', 'second_board_progress', 'second_board_maker', 'second_review_result'],
    ['third_pattern_progress', 'third_pattern_image_url', 'third_board_progress', 'third_board_maker', 'third_review_result'],
  ]
  for (let index = 0; index < stages.length; index += 1) {
    const [progressField, imageField, boardField, makerField, reviewField] = stages[index]
    const previousStage = index > 0 ? stages[index - 1] : null
    const previousReview = previousStage ? product[previousStage[4]] : ''
    let paperProgress = product[progressField] === '纸样已完成' ? '纸样已完成' : '纸样未完成'
    let boardProgress = product[boardField]
    let boardMaker = product[makerField]
    if (previousReview === '未通过-纸样修改') {
      boardProgress = '车板已完成'
      boardMaker = ''
    } else if (isBoardRevisionResult(previousReview)) {
      paperProgress = '纸样已完成'
      boardProgress = String(boardMaker || '').trim() ? '车板已完成' : '车板未完成'
    } else if (previousReview === '未通过-整件重做') {
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

function hasReachedPatternStage(product) {
  if (isCanceled(product.is_canceled)) return false
  const steps = getStyleProgressSteps(product.link)
  const patternIndex = steps.findIndex((step) => ['待打板', '打版中', '审版中', '打版', '打板', '打板中'].includes(step))
  return patternIndex >= 0 && steps.indexOf(product.style_progress) >= patternIndex
}

const dashboardStyleGroups = new Set(['作业中', '未排期', '已排期', '已取消', '已下架', '未入版房', '待分配', '打板中', '搭配中'])

function getDashboardStyleGroup(product) {
  if (product.style_progress === '款式取消' || isCanceled(product.is_canceled)) return '已取消'
  if (String(product.status || '').trim() === 'inactive') return '已下架'
  if (product.style_progress === '完成' || product.style_progress === '已排期') return '已排期'
  if (product.style_progress === '上新' || product.style_progress === '待排期') return '未排期'
  if (product.style_progress === '搭配' || product.style_progress === '搭配中') return '搭配中'
  if (hasReachedPatternStage(product)) return String(product.pattern_maker || '').trim() ? '打板中' : '待分配'
  return '未入版房'
}

const selectionSkuGatedLinks = new Set(['外采', '外发', '转自研板房', '转自研外发', 'AI外发款', 'AI外发'])

async function syncSelectionSkuProgress() {
  const [products] = await getPool().query("SELECT * FROM products WHERE link IN ('外采', '外发', '转自研板房', '转自研外发', 'AI款', 'AI外发款', 'AI', 'AI外发') AND (is_canceled IS NULL OR is_canceled <> 1)")
  let updatedCount = 0
  for (const product of products) {
    const progressData = product.style_progress === '通知' && isYes(product.material_notified)
      ? await withMaterialData(product) : product
    const calculatedProgress = calculateStyleProgress(progressData)
    if (calculatedProgress === product.style_progress) continue
    const steps = getStyleProgressSteps(product.link)
    const currentIndex = steps.indexOf(product.style_progress)
    const calculatedIndex = steps.indexOf(calculatedProgress)
    if (currentIndex >= 0 && calculatedIndex < currentIndex && hasStyleNumber(product.sku)) continue
    const progressTimes = parseProgressTimes(product.style_progress_times)
    progressTimes[calculatedProgress] ||= new Date().toISOString()
    const [result] = await getPool().query(
      'UPDATE products SET style_progress = ?, style_progress_times = ? WHERE id = ? AND style_progress = ?',
      [calculatedProgress, JSON.stringify(progressTimes), product.id, product.style_progress],
    )
    updatedCount += result.affectedRows
  }
  return updatedCount
}

async function syncApprovedPatternMaterialArrival() {
  const [products] = await getPool().query("SELECT * FROM products WHERE style_progress IN ('打版', '打板', '待打板', '打版中', '审版中') ORDER BY id ASC")
  let updatedCount = 0
  for (const row of products) {
    if (isCanceled(row.is_canceled) || calculatePatternProgress(row) !== '已通过') continue
    const product = await withMaterialData(row)
    const calculatedProgress = calculateStyleProgress({ ...product, pattern_progress: '已通过', material_arrived: 1 })
    const steps = getStyleProgressSteps(product.link)
    const currentIndex = steps.indexOf(product.style_progress)
    const calculatedIndex = steps.indexOf(calculatedProgress)
    const nextProgress = calculatedIndex > currentIndex ? calculatedProgress : product.style_progress
    const styleProgressTimes = parseProgressTimes(product.style_progress_times)
    if (nextProgress !== product.style_progress) {
      styleProgressTimes[nextProgress] ||= parseProgressTimes(product.pattern_progress_times)['已通过'] || new Date().toISOString()
    }
    const [result] = await getPool().query(
      'UPDATE products SET material_arrived = 1, style_progress = ?, style_progress_times = ? WHERE id = ? AND style_progress = ?',
      [nextProgress, JSON.stringify(styleProgressTimes), product.id, product.style_progress],
    )
    updatedCount += result.affectedRows
  }
  return updatedCount
}

async function syncCompletedMatchingProgress() {
  const [products] = await getPool().query("SELECT id, link, style_progress, style_progress_times, matching_image_1, matching_sku_1, matching_progress_1, matching_image_2, matching_sku_2, matching_progress_2, matching_image_3, matching_sku_3, matching_progress_3, release_date, is_canceled FROM products WHERE style_progress IN ('搭配', '搭配中')")
  let updatedCount = 0
  for (const product of products) {
    if (isCanceled(product.is_canceled)) continue
    const steps = getStyleProgressSteps(product.link)
    const currentIndex = steps.indexOf(product.style_progress)
    if (!isStyleProgressStageComplete(product, '搭配')) continue
    const isRegularStyle = ['常规款', '常规优先款', '常规优先', '转自研板房'].includes(String(product.link || '').trim())
    const calculatedProgress = product.release_date ? (isRegularStyle ? '已排期' : '完成') : steps[currentIndex + 1]
    if (!calculatedProgress || steps.indexOf(calculatedProgress) <= currentIndex) continue
    const progressTimes = parseProgressTimes(product.style_progress_times)
    progressTimes[calculatedProgress] ||= new Date().toISOString()
    const [result] = await getPool().query(
      'UPDATE products SET style_progress = ?, style_progress_times = ? WHERE id = ? AND style_progress = ?',
      [calculatedProgress, JSON.stringify(progressTimes), product.id, product.style_progress],
    )
    updatedCount += result.affectedRows
  }
  return updatedCount
}

async function assignPendingPatternTasks() {
  const connection = await getPool().getConnection()
  let lockAcquired = false
  try {
    const [lockRows] = await connection.query("SELECT GET_LOCK('pattern_task_auto_assignment', 10) AS acquired")
    lockAcquired = Number(lockRows[0]?.acquired) === 1
    if (!lockAcquired) throw new Error('纸样任务自动分配暂时繁忙，请稍后重试')

    await connection.beginTransaction()
    const [products] = await connection.query('SELECT * FROM products ORDER BY id FOR UPDATE')
    const [makerRows] = await connection.query("SELECT account FROM app_users WHERE position = '纸样师' AND is_active = 1 ORDER BY id ASC")
    const makers = makerRows.map((row) => String(row.account || '').trim()).filter(Boolean)
    const workload = new Map(makers.map((maker) => [maker, 0]))
    const pending = []

    for (const product of products) {
      if (!hasReachedPatternStage(product)) continue
      const maker = String(product.pattern_maker || '').trim()
      if (!maker) {
        pending.push(product)
      } else if (['已分配', '纸样中'].includes(calculatePatternProgress(product)) && workload.has(maker)) {
        workload.set(maker, workload.get(maker) + 1)
      }
    }

    const assigned = []
    for (const product of pending) {
      const maker = [...workload.entries()].sort((left, right) => left[1] - right[1] || makers.indexOf(left[0]) - makers.indexOf(right[0]))[0]
      if (!maker || maker[1] >= 8) break
      const patternProgress = '已分配'
      const progressTimes = parseProgressTimes(product.pattern_progress_times)
      progressTimes[patternProgress] = new Date().toISOString()
      const [result] = await connection.query(
        "UPDATE products SET pattern_maker = ?, pattern_progress = ?, pattern_started_at = NULL, pattern_progress_times = ? WHERE id = ? AND TRIM(COALESCE(pattern_maker, '')) = ''",
        [maker[0], patternProgress, JSON.stringify(progressTimes), product.id],
      )
      if (!result.affectedRows) continue
      workload.set(maker[0], maker[1] + 1)
      assigned.push({ id: String(product.id), pattern_maker: maker[0] })
    }

    await connection.commit()
    return { assigned, makerCount: makers.length }
  } catch (error) {
    try { await connection.rollback() } catch { /* Keep the original allocation error. */ }
    throw error
  } finally {
    if (lockAcquired) {
      try { await connection.query("SELECT RELEASE_LOCK('pattern_task_auto_assignment')") } catch { /* The connection release also clears the lock. */ }
    }
    connection.release()
  }
}

function validateProduct(payload, { requireIdentity = true } = {}) {
  if (requireIdentity && !payload.sku?.trim()) return '款号不能为空'
  if (payload.price === undefined || Number.isNaN(Number(payload.price)) || Number(payload.price) < 0) return '商品价格必须是非负数字'
  if (payload.stock === undefined || !Number.isInteger(Number(payload.stock)) || Number(payload.stock) < 0) return '库存必须是非负整数'
  if (payload.status && !['active', 'inactive'].includes(payload.status)) return '商品状态无效'
  return null
}

const reviewRequiredLinks = new Set(['常规款', '常规优先款', '常规优先', '转自研板房'])
function reviewApprovalMissingFields(product) {
  if (!reviewRequiredLinks.has(String(product.link || '').trim())) return []
  const hasValue = (value) => Array.isArray(value) ? value.some((item) => String(item || '').trim()) : Boolean(String(value || '').trim())
  const hasRequiredFitSize = (value) => {
    const sizes = Array.isArray(value) ? value : String(value || '').split(',')
    return sizes.some((size) => ['宽松', '合体', '修身'].includes(String(size || '').trim()))
  }
  const hasImage = (value) => Boolean(firstImageValue(value))
  return [
    ...(!hasImage(product.image_url) ? ['参考图'] : []),
    ...(!hasValue(product.category) ? ['品类'] : []),
    ...(!hasValue(product.designer) ? ['设计师'] : []),
    ...(!hasImage(product.physical_image_url) ? ['实物图'] : []),
    ...(!hasValue(product.link) ? ['链路'] : []),
    ...(!hasValue(product.season_type) ? ['季节'] : []),
    ...(!hasValue(product.color) ? ['颜色'] : []),
    ...(!hasValue(product.composition) ? ['成分'] : []),
    ...(!hasRequiredFitSize(product.size) ? ['尺码（需包含宽松、合体或修身）'] : []),
    ...(!hasValue(product.highlights) ? ['产品亮点'] : []),
  ]
}

const fabricFields = ['fabric_supplier', 'fabric_code', 'fabric_color_card_image_url', 'fabric_color_code', 'fabric_width', 'fabric_quote', 'fabric_weight_difference', 'fabric_unit', 'fabric_meterage', 'fabric_net_weight', 'fabric_usage_amount', 'fabric_cost', 'fabric_inspection_report_url']
const accessoryFields = ['accessory_records']
const materialFields = [...fabricFields, ...accessoryFields]
function numericFabricValue(value) {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}
function calculateFabricCost(record) {
  const quote = numericFabricValue(record.quote)
  const usage = numericFabricValue(record.usage_amount)
  const gap = numericFabricValue(record.weight_difference)
  const netWeight = numericFabricValue(record.net_weight)
  const meterage = numericFabricValue(record.meterage)
  if (quote === null || usage === null) return null

  let baseCost
  if (record.unit === '米数' || record.unit === '码数') {
    if (gap === null || gap === 0) return null
    baseCost = record.unit === '码数' ? quote / gap / 0.9144 : quote / gap
  } else if (record.unit === '足码') {
    baseCost = quote
  } else if (record.unit === '单价公斤') {
    baseCost = quote
  } else if (record.unit === '公斤') {
    if (netWeight === null || gap === null || meterage === null || netWeight <= 0 || netWeight - gap <= 0 || meterage <= 0) return null
    baseCost = quote * netWeight / (netWeight - gap) / meterage
  } else {
    return null
  }

  const cost = baseCost * usage * 1.12
  return Number.isFinite(cost) ? Number(cost.toFixed(2)) : null
}
function calculateAccessoryCost(record) {
  const unitPrice = numericFabricValue(record.unit_price)
  const usageAmount = numericFabricValue(record.usage_amount)
  if (unitPrice === null || usageAmount === null) return null
  const cost = unitPrice * usageAmount
  return Number.isFinite(cost) ? Number(cost.toFixed(2)) : null
}
function materialPayload(body) {
  const payload = Object.fromEntries(materialFields.filter((field) => body[field] !== undefined).map((field) => [field, body[field] || null]))
  if (Array.isArray(body.fabric_records)) payload.fabric_records = body.fabric_records.map((record) => ({
    ...record,
    color_card_image_url: persistImageValue(record.color_card_image_url),
    inspection_report_url: persistImageValue(record.inspection_report_url),
  }))
  if (Array.isArray(body.accessory_records)) payload.accessory_records = body.accessory_records
  if (Array.isArray(body.craft_records)) payload.craft_records = body.craft_records
  return payload
}
function persistImageValue(value) {
  if (Array.isArray(value)) return value.length > 1 ? JSON.stringify(value) : (value[0] || null)
  return value || null
}
async function withMaterialData(product) {
  const pool = getPool()
  const [[fabricRows], [accessoryRows], [craftRows]] = await Promise.all([
    pool.query('SELECT * FROM product_fabrics WHERE product_id = ? ORDER BY id ASC', [product.id]),
    pool.query('SELECT * FROM product_accessories WHERE product_id = ? ORDER BY id ASC', [product.id]),
    pool.query('SELECT * FROM product_crafts WHERE product_id = ? ORDER BY id ASC', [product.id]),
  ])
  return {
    ...product,
    fabric_records: fabricRows.map((row) => ({ id: row.id, supplier: row.supplier || '', code: row.code || '', color_code: row.color_code || '', width: row.width || '', quote: row.quote ?? '', weight_difference: row.weight_difference ?? '', unit: row.unit || '', meterage: row.meterage ?? '', net_weight: row.net_weight ?? '', usage_amount: row.usage_amount ?? '', cost: row.cost ?? '', color_card_image_url: row.color_card_image_url || '', inspection_report_url: row.inspection_report_url || '' })),
    accessory_records: accessoryRows.map((row) => ({ id: row.id, supplier: row.supplier || '', accessory: row.accessory || '', specification: row.specification || '', color: row.color || '', unit: row.unit || '', unit_price: row.unit_price ?? '', usage_amount: row.usage_amount ?? '', cost: row.cost ?? '' })),
    craft_records: craftRows.map((row) => ({ id: row.id, type: row.craft_type || '工艺', factory: row.factory || '', process: row.process || '', price: row.price ?? 0 })),
  }
}
async function saveMaterialData(productId, materials) {
  const pool = getPool()
  if (Array.isArray(materials.fabric_records)) {
    await pool.query('DELETE FROM product_fabrics WHERE product_id = ?', [productId])
    for (const record of materials.fabric_records) {
      const cost = calculateFabricCost(record)
      const values = [productId, record.supplier, record.code, record.color_card_image_url, record.color_code, record.width, record.quote, record.weight_difference, record.unit, record.meterage, record.net_weight, record.usage_amount, cost, record.inspection_report_url].map((value) => value === '' || value === undefined ? null : value)
      await pool.query('INSERT INTO product_fabrics (product_id, supplier, code, color_card_image_url, color_code, width, quote, weight_difference, unit, meterage, net_weight, usage_amount, cost, inspection_report_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', values)
    }
  }
  if (Array.isArray(materials.accessory_records)) {
    await pool.query('DELETE FROM product_accessories WHERE product_id = ?', [productId])
    for (const record of materials.accessory_records) {
      const cost = calculateAccessoryCost(record)
      const values = [productId, record.supplier, record.accessory, record.specification, record.color, record.unit, record.unit_price, record.usage_amount, cost].map((value) => value === '' || value === undefined ? null : value)
      await pool.query('INSERT INTO product_accessories (product_id, supplier, accessory, specification, color, unit, unit_price, usage_amount, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', values)
    }
  }
  if (Array.isArray(materials.craft_records)) {
    await pool.query('DELETE FROM product_crafts WHERE product_id = ?', [productId])
    for (const record of materials.craft_records) {
      const price = Number(record.price ?? 0)
      const values = [productId, record.type || '工艺', record.factory, record.process, Number.isFinite(price) && price >= 0 ? price : 0]
      await pool.query('INSERT INTO product_crafts (product_id, craft_type, factory, process, price) VALUES (?, ?, ?, ?, ?)', values)
    }
  }
}

app.get('/api/health', async (_req, res) => {
  try { await getPool().query('SELECT 1'); res.json({ ok: true }) }
  catch (error) { res.status(503).json({ ok: false, message: error.message }) }
})

app.use('/api', async (req, res, next) => {
  try {
    const token = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return res.status(401).json({ message: '请先登录' })
    const [rows] = await getPool().query(
      `SELECT u.id, u.account, u.position, u.role
       FROM app_user_sessions s JOIN app_users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP AND u.is_active = 1 LIMIT 1`,
      [hashSessionToken(token)],
    )
    if (!rows.length) return res.status(401).json({ message: '登录已过期，请重新登录' })
    req.authUser = rows[0]
    next()
  } catch (error) { next(error) }
})

app.use('/api', async (req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next()
  const pathSegments = req.originalUrl.split('?')[0].split('/').filter(Boolean).slice(1)
  try {
    req.auditBefore = await loadAuditSnapshot(pathSegments)
    req.auditTarget = operationAuditTarget(req, pathSegments, req.auditBefore, null)
  } catch (error) {
    console.error('获取操作日志快照失败:', error.message)
  }
  let auditPromise
  const saveAudit = (responseBody) => {
    if (!auditPromise) {
      const auditTarget = operationAuditTarget(req, pathSegments, req.auditBefore, responseBody)
      const details = operationAuditDetails({ req, pathSegments, before: req.auditBefore, responseBody, statusCode: res.statusCode })
      auditPromise = recordOperationLog({
        actor: req.authUser,
        action: operationAction(req.method, req.originalUrl, auditTarget),
        details,
        method: req.method,
        requestPath: req.originalUrl.slice(0, 1000),
        ipAddress: req.ip,
        statusCode: res.statusCode,
      }).catch((error) => console.error('操作日志写入失败:', error.message))
    }
    return auditPromise
  }
  const originalJson = res.json.bind(res)
  const originalEnd = res.end.bind(res)
  res.json = (body) => {
    return saveAudit(body).then(() => originalJson(body))
  }
  res.end = (...args) => {
    return saveAudit().then(() => originalEnd(...args))
  }
  next()
})

app.get('/api/auth/me', (req, res) => res.json({ user: publicUser(req.authUser) }))

app.get('/api/pattern-makers', async (_req, res, next) => {
  try {
    const [rows] = await getPool().query("SELECT account AS name FROM app_users WHERE position = '纸样师' AND is_active = 1 ORDER BY id ASC")
    res.json({ data: rows.map((row) => row.name) })
  } catch (error) { next(error) }
})

function requireSuperAdmin(req, res, next) {
  if (req.authUser?.role !== 'super_admin') return res.status(403).json({ message: '仅超级管理员可以管理用户' })
  next()
}

app.get('/api/users', requireSuperAdmin, async (_req, res, next) => {
  try {
    const [rows] = await getPool().query(`
      SELECT u.id, u.account, u.position, u.designer_user_id, d.account AS designer_name, u.role, u.is_active, u.created_at
      FROM app_users u LEFT JOIN app_users d ON d.id = u.designer_user_id ORDER BY u.id ASC
    `)
    res.json({ data: rows })
  } catch (error) { next(error) }
})

async function getDesignerAssistantBinding(position, value) {
  if (position !== '设计师助理' || value === null || value === undefined || value === '') return null
  const designerId = Number(value)
  if (!Number.isSafeInteger(designerId) || designerId < 1) throw new Error('请选择有效的关联设计师')
  const [rows] = await getPool().query("SELECT id FROM app_users WHERE id = ? AND position = '设计师' AND is_active = 1 LIMIT 1", [designerId])
  if (!rows.length) throw new Error('关联设计师不存在或已停用')
  return designerId
}

app.get('/api/system-logs', requireSuperAdmin, async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
    const pageSize = Math.min(100, Math.max(10, Number.parseInt(req.query.pageSize, 10) || 20))
    const search = String(req.query.search || '').trim().slice(0, 100)
    const conditions = []
    const values = []
    if (search) {
      conditions.push('(actor_account LIKE ? OR actor_position LIKE ? OR action LIKE ? OR details LIKE ? OR request_path LIKE ?)')
      values.push(...Array(5).fill(`%${search}%`))
    }
    if (req.query.from) {
      conditions.push('created_at >= ?')
      values.push(`${String(req.query.from).slice(0, 10)} 00:00:00`)
    }
    if (req.query.to) {
      conditions.push('created_at < DATE_ADD(?, INTERVAL 1 DAY)')
      values.push(String(req.query.to).slice(0, 10))
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const [[countRows], [rows]] = await Promise.all([
      getPool().query(`SELECT COUNT(*) AS total FROM system_operation_logs ${where}`, values),
      getPool().query(
        `SELECT id, actor_account, actor_position, action, details, method, request_path, ip_address, status_code,
                DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
         FROM system_operation_logs ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
        [...values, pageSize, (page - 1) * pageSize],
      ),
    ])
    res.json({ data: rows, total: Number(countRows[0].total), page, pageSize })
  } catch (error) { next(error) }
})

function normalizeAnnouncementStatus(value) {
  return value === 'published' ? 'published' : 'draft'
}

function announcementSelectSql(where = '') {
  return `SELECT id, title, content, status, DATE_FORMAT(published_at, '%Y-%m-%d %H:%i:%s') AS published_at,
                 created_by_account, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
                 DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
          FROM announcements ${where}`
}

app.get('/api/announcements', requireSuperAdmin, async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
    const pageSize = Math.min(100, Math.max(10, Number.parseInt(req.query.pageSize, 10) || 20))
    const search = String(req.query.search || '').trim().slice(0, 100)
    const status = String(req.query.status || '').trim()
    const conditions = []
    const values = []
    if (search) {
      conditions.push('(title LIKE ? OR content LIKE ? OR created_by_account LIKE ?)')
      values.push(`%${search}%`, `%${search}%`, `%${search}%`)
    }
    if (status === 'draft' || status === 'published') {
      conditions.push('status = ?')
      values.push(status)
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const [[countRows], [rows]] = await Promise.all([
      getPool().query(`SELECT COUNT(*) AS total FROM announcements ${where}`, values),
      getPool().query(`${announcementSelectSql(where)} ORDER BY id DESC LIMIT ? OFFSET ?`, [...values, pageSize, (page - 1) * pageSize]),
    ])
    res.json({ data: rows, total: Number(countRows[0].total), page, pageSize })
  } catch (error) { next(error) }
})

app.get('/api/announcements/active', async (_req, res, next) => {
  try {
    const [rows] = await getPool().query(`
      SELECT id, title, content,
             DATE_FORMAT(published_at, '%Y-%m-%d %H:%i:%s') AS published_at
      FROM announcements
      WHERE status = 'published'
      ORDER BY published_at DESC, id DESC
      LIMIT 20
    `)
    res.json({ data: rows })
  } catch (error) { next(error) }
})

app.post('/api/announcements', requireSuperAdmin, async (req, res, next) => {
  try {
    const title = String(req.body?.title || '').trim()
    const content = String(req.body?.content || '').trim()
    const status = normalizeAnnouncementStatus(req.body?.status)
    if (!title || title.length > 200) return res.status(400).json({ message: '公告标题不能为空且不能超过 200 个字符' })
    if (!content || content.length > 10000) return res.status(400).json({ message: '公告内容不能为空且不能超过 10000 个字符' })
    const [result] = await getPool().query(
      `INSERT INTO announcements (title, content, status, published_at, created_by, created_by_account)
       VALUES (?, ?, ?, IF(? = 'published', CURRENT_TIMESTAMP, NULL), ?, ?)`,
      [title, content, status, status, req.authUser?.id || null, req.authUser?.account || ''],
    )
    const [rows] = await getPool().query(announcementSelectSql('WHERE id = ?'), [result.insertId])
    res.status(201).json(rows[0])
  } catch (error) { next(error) }
})

app.put('/api/announcements/:id', requireSuperAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const title = String(req.body?.title || '').trim()
    const content = String(req.body?.content || '').trim()
    const status = normalizeAnnouncementStatus(req.body?.status)
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: '公告编号无效' })
    if (!title || title.length > 200) return res.status(400).json({ message: '公告标题不能为空且不能超过 200 个字符' })
    if (!content || content.length > 10000) return res.status(400).json({ message: '公告内容不能为空且不能超过 10000 个字符' })
    const [result] = await getPool().query(
      `UPDATE announcements
       SET title = ?, content = ?, status = ?, published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, CURRENT_TIMESTAMP) ELSE NULL END
       WHERE id = ?`,
      [title, content, status, status, id],
    )
    if (!result.affectedRows) return res.status(404).json({ message: '公告不存在' })
    const [rows] = await getPool().query(announcementSelectSql('WHERE id = ?'), [id])
    res.json(rows[0])
  } catch (error) { next(error) }
})

app.patch('/api/announcements/:id/status', requireSuperAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const status = normalizeAnnouncementStatus(req.body?.status)
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: '公告编号无效' })
    const [result] = await getPool().query(
      `UPDATE announcements SET status = ?, published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, CURRENT_TIMESTAMP) ELSE NULL END WHERE id = ?`,
      [status, status, id],
    )
    if (!result.affectedRows) return res.status(404).json({ message: '公告不存在' })
    const [rows] = await getPool().query(announcementSelectSql('WHERE id = ?'), [id])
    res.json(rows[0])
  } catch (error) { next(error) }
})

app.delete('/api/announcements/:id', requireSuperAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: '公告编号无效' })
    const [result] = await getPool().query('DELETE FROM announcements WHERE id = ?', [id])
    if (!result.affectedRows) return res.status(404).json({ message: '公告不存在' })
    res.status(204).end()
  } catch (error) { next(error) }
})

app.post('/api/users', requireSuperAdmin, async (req, res, next) => {
  try {
    const account = String(req.body?.account || '').trim()
    const password = String(req.body?.password || '')
    const position = String(req.body?.position || '').trim()
    if (account.length < 2 || account.length > 80) return res.status(400).json({ message: '账号需为 2 至 80 个字符' })
    if (password.length < 8 || password.length > 200) return res.status(400).json({ message: '密码长度需为 8 至 200 个字符' })
    if (!userPositions.includes(position)) return res.status(400).json({ message: '请选择有效职位' })
    let designerUserId
    try { designerUserId = await getDesignerAssistantBinding(position, req.body?.designer_user_id) }
    catch (error) { return res.status(400).json({ message: error.message }) }
    const [result] = await getPool().query(
      'INSERT INTO app_users (account, password_hash, position, designer_user_id, role) VALUES (?, ?, ?, ?, ?)',
      [account, hashPassword(password), position, designerUserId, 'user'],
    )
    const [rows] = await getPool().query(`
      SELECT u.id, u.account, u.position, u.designer_user_id, d.account AS designer_name, u.role, u.is_active, u.created_at
      FROM app_users u LEFT JOIN app_users d ON d.id = u.designer_user_id WHERE u.id = ?
    `, [result.insertId])
    if (position === '纸样师') await assignPendingPatternTasks()
    res.status(201).json(rows[0])
  } catch (error) { next(error) }
})

app.put('/api/users/:id', requireSuperAdmin, async (req, res, next) => {
  try {
    const account = String(req.body?.account || '').trim()
    const position = String(req.body?.position || '').trim()
    const password = String(req.body?.password || '')
    const userId = Number(req.params.id)
    if (!Number.isSafeInteger(userId) || userId < 1) return res.status(400).json({ message: '用户编号无效' })
    if (account.length < 2 || account.length > 80) return res.status(400).json({ message: '账号需为 2 至 80 个字符' })
    if (!position || position.length > 80) return res.status(400).json({ message: '请选择有效职位' })
    if (password && (password.length < 8 || password.length > 200)) return res.status(400).json({ message: '密码长度需为 8 至 200 个字符' })
    let designerUserId
    try { designerUserId = await getDesignerAssistantBinding(position, req.body?.designer_user_id) }
    catch (error) { return res.status(400).json({ message: error.message }) }
    const [existing] = await getPool().query('SELECT id, position FROM app_users WHERE id = ? LIMIT 1', [userId])
    if (!existing.length) return res.status(404).json({ message: '用户不存在' })
    if (!userPositions.includes(position) && position !== existing[0].position) return res.status(400).json({ message: '请选择有效职位' })
    const passwordHash = password ? hashPassword(password) : null
    await getPool().query(
      'UPDATE app_users SET account = ?, position = ?, designer_user_id = ?, password_hash = COALESCE(?, password_hash) WHERE id = ?',
      [account, position, designerUserId, passwordHash, userId],
    )
    const [rows] = await getPool().query(`
      SELECT u.id, u.account, u.position, u.designer_user_id, d.account AS designer_name, u.role, u.is_active, u.created_at
      FROM app_users u LEFT JOIN app_users d ON d.id = u.designer_user_id WHERE u.id = ?
    `, [userId])
    if (existing[0].position === '纸样师' || position === '纸样师') await assignPendingPatternTasks()
    res.json(rows[0])
  } catch (error) { next(error) }
})

app.patch('/api/users/:id/status', requireSuperAdmin, async (req, res, next) => {
  try {
    const userId = Number(req.params.id)
    if (![true, false, 0, 1].includes(req.body?.is_active)) return res.status(400).json({ message: '账号状态无效' })
    const isActive = req.body?.is_active === true || req.body?.is_active === 1
    if (!Number.isSafeInteger(userId) || userId < 1) return res.status(400).json({ message: '用户编号无效' })
    const [users] = await getPool().query('SELECT id, role, position FROM app_users WHERE id = ? LIMIT 1', [userId])
    const target = users[0]
    if (!target) return res.status(404).json({ message: '用户不存在' })
    if (!isActive && Number(target.id) === Number(req.authUser.id)) return res.status(400).json({ message: '不能停用当前登录账号' })
    if (!isActive && target.role === 'super_admin') return res.status(400).json({ message: '不能停用超级管理员账号' })
    await getPool().query('UPDATE app_users SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, userId])
    if (!isActive) await getPool().query('DELETE FROM app_user_sessions WHERE user_id = ?', [userId])
    const [rows] = await getPool().query('SELECT id, account, position, role, is_active, created_at FROM app_users WHERE id = ?', [userId])
    if (target.position === '纸样师') await assignPendingPatternTasks()
    res.json(rows[0])
  } catch (error) { next(error) }
})

app.get('/api/categories', async (_req, res, next) => {
  try {
    const [rows] = await getPool().query('SELECT id, name, image_url, created_at FROM product_categories ORDER BY id ASC')
    res.json({ data: rows })
  } catch (error) { next(error) }
})

app.post('/api/categories', async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim()
    const imageUrl = String(req.body?.image_url || '').trim()
    if (!name) return res.status(400).json({ message: '请输入品类名称' })
    const [result] = await getPool().query('INSERT INTO product_categories (name, image_url) VALUES (?, ?)', [name, imageUrl || null])
    const [rows] = await getPool().query('SELECT id, name, image_url, created_at FROM product_categories WHERE id = ?', [result.insertId])
    res.status(201).json(rows[0])
  } catch (error) { next(error) }
})

app.delete('/api/categories/:id', async (req, res, next) => {
  try {
    const [result] = await getPool().query('DELETE FROM product_categories WHERE id = ?', [req.params.id])
    if (!result.affectedRows) return res.status(404).json({ message: '品类不存在' })
    res.status(204).end()
  } catch (error) { next(error) }
})

function categoryPlanDateEntries(value) {
  let parsed = value
  try {
    if (typeof parsed === 'string') parsed = JSON.parse(parsed || '[]')
  } catch {
    parsed = []
  }
  if (Array.isArray(parsed)) return parsed.filter((entry) => entry && typeof entry.date === 'string').map((entry) => ({ date: entry.date, value: entry.value ?? null }))
  if (parsed && typeof parsed === 'object') return Object.entries(parsed).map(([date, entryValue]) => ({ date, value: entryValue ?? null }))
  return []
}

function categoryPlanPayload(row) {
  const dateValues = Object.fromEntries(categoryPlanDateEntries(row.date_values).map((entry) => [entry.date, entry.value]))
  return { ...row, date_values: dateValues }
}

function normalizePlanningDate(value) {
  const input = String(value || '').trim()
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input)
  const labelMatch = /^(\d{1,2})月(\d{1,2})日$/.exec(input)
  const year = isoMatch ? Number(isoMatch[1]) : 2000
  const month = isoMatch ? Number(isoMatch[2]) : Number(labelMatch?.[1])
  const day = isoMatch ? Number(isoMatch[3]) : Number(labelMatch?.[2])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (!month || !day || date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    throw new Error('日期无效')
  }
  return { date_label: `${month}月${day}日`, sort_order: month * 100 + day }
}

function categoryPlanNumber(value, { field, max, integer = false }) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0 || number > max || (integer && !Number.isInteger(number))) {
    throw new Error(`${field}数值无效`)
  }
  return number
}

app.get('/api/category-planning/dates', async (_req, res, next) => {
  try {
    const [rows] = await getPool().query('SELECT id, date_label FROM category_plan_dates ORDER BY sort_order ASC, id ASC')
    res.json({ data: rows })
  } catch (error) { next(error) }
})

app.post('/api/category-planning/dates', async (req, res, next) => {
  try {
    const date = normalizePlanningDate(req.body?.date)
    const [result] = await getPool().query('INSERT INTO category_plan_dates (date_label, sort_order) VALUES (?, ?)', [date.date_label, date.sort_order])
    const [[row]] = await getPool().query('SELECT id, date_label FROM category_plan_dates WHERE id = ?', [result.insertId])
    res.status(201).json(row)
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: '这个日期已经存在' })
    if (error.message === '日期无效') return res.status(400).json({ message: error.message })
    next(error)
  }
})

app.put('/api/category-planning/dates/:id', async (req, res, next) => {
  let connection
  try {
    const dateId = Number(req.params.id)
    if (!Number.isSafeInteger(dateId) || dateId < 1) return res.status(400).json({ message: '日期编号无效' })
    const date = normalizePlanningDate(req.body?.date)
    connection = await getPool().getConnection()
    await connection.beginTransaction()
    const [[currentDate]] = await connection.query('SELECT id, date_label FROM category_plan_dates WHERE id = ? FOR UPDATE', [dateId])
    if (!currentDate) {
      await connection.rollback()
      return res.status(404).json({ message: '日期列不存在' })
    }
    const [duplicates] = await connection.query('SELECT id FROM category_plan_dates WHERE date_label = ? AND id <> ? LIMIT 1', [date.date_label, dateId])
    if (duplicates.length) {
      await connection.rollback()
      return res.status(409).json({ message: '这个日期已经存在' })
    }
    if (currentDate.date_label !== date.date_label) {
      const [plans] = await connection.query('SELECT category, date_values FROM category_plans FOR UPDATE')
      for (const plan of plans) {
        const values = Object.fromEntries(categoryPlanDateEntries(plan.date_values).map((entry) => [entry.date, entry.value]))
        if (Object.hasOwn(values, currentDate.date_label)) {
          if (!Object.hasOwn(values, date.date_label)) values[date.date_label] = values[currentDate.date_label]
          delete values[currentDate.date_label]
          const entries = Object.entries(values).map(([label, value]) => ({ date: label, value }))
          await connection.query('UPDATE category_plans SET date_values = ? WHERE category = ?', [JSON.stringify(entries), plan.category])
        }
      }
    }
    await connection.query('UPDATE category_plan_dates SET date_label = ?, sort_order = ? WHERE id = ?', [date.date_label, date.sort_order, dateId])
    await connection.commit()
    res.json({ id: dateId, ...date })
  } catch (error) {
    if (connection) await connection.rollback()
    if (error.message === '日期无效') return res.status(400).json({ message: error.message })
    next(error)
  } finally {
    connection?.release()
  }
})

app.delete('/api/category-planning/dates/:id', async (req, res, next) => {
  let connection
  try {
    const dateId = Number(req.params.id)
    if (!Number.isSafeInteger(dateId) || dateId < 1) return res.status(400).json({ message: '日期编号无效' })
    connection = await getPool().getConnection()
    await connection.beginTransaction()
    const [[date]] = await connection.query('SELECT id, date_label FROM category_plan_dates WHERE id = ? FOR UPDATE', [dateId])
    if (!date) {
      await connection.rollback()
      return res.status(404).json({ message: '日期列不存在' })
    }
    const [plans] = await connection.query('SELECT category, date_values FROM category_plans FOR UPDATE')
    for (const plan of plans) {
      const existingEntries = categoryPlanDateEntries(plan.date_values)
      const entries = existingEntries.filter((entry) => entry.date !== date.date_label)
      if (entries.length !== existingEntries.length) {
        await connection.query('UPDATE category_plans SET date_values = ? WHERE category = ?', [JSON.stringify(entries), plan.category])
      }
    }
    await connection.query('DELETE FROM category_plan_dates WHERE id = ?', [dateId])
    await connection.commit()
    res.status(204).end()
  } catch (error) {
    if (connection) await connection.rollback()
    next(error)
  } finally {
    connection?.release()
  }
})

app.get('/api/category-planning', async (_req, res, next) => {
  try {
    const [rows] = await getPool().query('SELECT category, group_name, sort_order, date_values, self_developed, follow_up, outsource, style_count FROM category_plans ORDER BY sort_order ASC, category ASC')
    res.json({ data: rows.map(categoryPlanPayload) })
  } catch (error) { next(error) }
})

app.post('/api/category-planning', async (req, res, next) => {
  try {
    const category = String(req.body?.category || '').trim()
    const groupName = String(req.body?.group_name || '').trim() || '其他'
    if (!category || category.length > 80 || groupName.length > 80) return res.status(400).json({ message: '大类和品类名称不能为空且不能超过80个字符' })
    const [[orderRow]] = await getPool().query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM category_plans')
    const [insertResult] = await getPool().query(
      'INSERT INTO category_plans (category, group_name, sort_order, date_values) VALUES (?, ?, ?, ?)',
      [category, groupName, Number(orderRow.next_order), JSON.stringify([])],
    )
    const [[row]] = await getPool().query('SELECT category, group_name, sort_order, date_values, self_developed, follow_up, outsource, style_count FROM category_plans WHERE category = ?', [category])
    res.status(201).json(categoryPlanPayload(row))
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: '这个品类已经存在' })
    next(error)
  }
})

app.delete('/api/category-planning/:category', async (req, res, next) => {
  try {
    const category = String(req.params.category || '').trim()
    const [result] = await getPool().query('DELETE FROM category_plans WHERE category = ?', [category])
    if (!result.affectedRows) return res.status(404).json({ message: '品类行不存在' })
    res.status(204).end()
  } catch (error) { next(error) }
})

app.get('/api/category-planning/summary', async (req, res, next) => {
  try {
    const dateFilter = String(req.query.release_date_filter || '').trim()
    const isUnscheduled = dateFilter === 'unscheduled'
    const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(dateFilter) ? normalizePlanningDate(dateFilter).date_label : ''
    const [plans] = await getPool().query('SELECT category, group_name, sort_order, date_values, self_developed, follow_up, outsource FROM category_plans ORDER BY sort_order ASC, category ASC')
    const selectedConditions = ["style_progress IN ('搭配', '搭配中', '上新', '待排期', '完成', '已排期')"]
    const selectedParams = []
    if (isUnscheduled) selectedConditions.push('release_date IS NULL')
    else if (selectedDate) {
      selectedConditions.push('release_date = ?')
      selectedParams.push(dateFilter)
    }
    const [selectedRows] = await getPool().query(
      `SELECT category,
        CASE WHEN link = '外采' THEN 'outsource'
          WHEN link IN ('AI款', 'AI外发款', 'AI', 'AI外发') THEN 'follow_up'
          ELSE 'self_developed' END AS source_type,
        COUNT(*) AS selected_count
       FROM products WHERE ${selectedConditions.join(' AND ')} GROUP BY category, source_type`,
      selectedParams,
    )
    const selectedByCategory = new Map()
    const selectedByCategorySource = new Map()
    selectedRows.forEach((row) => {
      const count = Number(row.selected_count)
      selectedByCategory.set(row.category, (selectedByCategory.get(row.category) || 0) + count)
      selectedByCategorySource.set(`${row.category}::${row.source_type}`, count)
    })
    const strategyDefinitions = [
      { key: 'self_developed', label: '自研' },
      { key: 'follow_up', label: '跟卖' },
      { key: 'outsource', label: '外采' },
    ]
    let totalPlan = 0
    const items = plans.map((plan) => {
      const values = categoryPlanDateEntries(plan.date_values)
      const matchingValue = selectedDate ? values.find((entry) => entry.date === selectedDate) : null
      const plannedCount = isUnscheduled ? null : selectedDate
        ? (matchingValue?.value === null || matchingValue?.value === undefined ? null : Number(matchingValue.value))
        : values.reduce((sum, entry) => sum + (Number(entry.value) || 0), 0)
      if (plannedCount !== null) totalPlan += plannedCount
      const strategies = strategyDefinitions.map(({ key, label }) => ({
        key,
        label,
        planned_count: plannedCount === null ? null : Math.round(plannedCount * (Number(plan[key]) || 0) / 100),
        selected_count: selectedByCategorySource.get(`${plan.category}::${key}`) || 0,
      }))
      return {
        category: plan.category,
        group_name: plan.group_name,
        planned_count: plannedCount,
        selected_count: selectedByCategory.get(plan.category) || 0,
        strategies,
      }
    })
    res.json({ data: items, total_plan: isUnscheduled ? null : totalPlan, total_selected: items.reduce((sum, item) => sum + item.selected_count, 0) })
  } catch (error) { next(error) }
})

app.put('/api/category-planning/:category', async (req, res, next) => {
  let connection
  try {
    const previousCategory = String(req.params.category || '').trim()
    const category = String(req.body?.category || previousCategory).trim()
    const dateValues = req.body?.date_values
    if (!previousCategory || !category || category.length > 80 || !dateValues || typeof dateValues !== 'object' || Array.isArray(dateValues)) {
      return res.status(400).json({ message: '规划数据无效' })
    }
    const normalizedDateValues = {}
    const [dateRows] = await getPool().query('SELECT date_label FROM category_plan_dates')
    const validDates = new Set(dateRows.map((row) => row.date_label))
    for (const [date, value] of Object.entries(dateValues)) {
      if (!validDates.has(date)) return res.status(400).json({ message: '日期列无效' })
      normalizedDateValues[date] = categoryPlanNumber(value, { field: `${date}款数`, max: 100000, integer: true })
    }
    const selfDeveloped = categoryPlanNumber(req.body.self_developed, { field: '自研比例', max: 100 })
    const followUp = categoryPlanNumber(req.body.follow_up, { field: '跟卖比例', max: 100 })
    const outsource = categoryPlanNumber(req.body.outsource, { field: '外采比例', max: 100 })
    const styleCount = categoryPlanNumber(req.body.style_count, { field: '品类款数', max: 100000, integer: true })
    const groupName = String(req.body.group_name || '').trim()
    if (groupName.length > 80) return res.status(400).json({ message: '大类名称不能超过80个字符' })
    connection = await getPool().getConnection()
    await connection.beginTransaction()
    const [[existing]] = await connection.query('SELECT category FROM category_plans WHERE category = ? FOR UPDATE', [previousCategory])
    if (!existing) {
      await connection.rollback()
      return res.status(404).json({ message: '品类行不存在' })
    }
    if (category !== previousCategory) {
      const [duplicates] = await connection.query('SELECT category FROM category_plans WHERE category = ? LIMIT 1', [category])
      if (duplicates.length) {
        await connection.rollback()
        return res.status(409).json({ message: '这个品类已经存在' })
      }
      await connection.query('UPDATE products SET category = ? WHERE category = ?', [category, previousCategory])
    }
    await connection.query(
      `UPDATE category_plans
       SET category = ?, group_name = ?, date_values = ?, self_developed = ?, follow_up = ?, outsource = ?, style_count = ?
       WHERE category = ?`,
      [category, groupName || '其他', JSON.stringify(Object.entries(normalizedDateValues).map(([date, value]) => ({ date, value }))), selfDeveloped, followUp, outsource, styleCount, previousCategory],
    )
    await connection.commit()
    const [[row]] = await getPool().query('SELECT category, group_name, sort_order, date_values, self_developed, follow_up, outsource, style_count FROM category_plans WHERE category = ?', [category])
    res.json(categoryPlanPayload(row))
  } catch (error) {
    if (connection) await connection.rollback()
    if (/数值无效/.test(error.message)) return res.status(400).json({ message: error.message })
    next(error)
  } finally {
    connection?.release()
  }
})

app.get('/api/designers', async (_req, res, next) => {
  try {
    const [rows] = await getPool().query(`
      SELECT d.id, d.account AS name, d.position, d.created_at,
        GROUP_CONCAT(a.account ORDER BY a.id SEPARATOR '、') AS designer_assistant
      FROM app_users d
      LEFT JOIN app_users a ON a.designer_user_id = d.id AND a.position = '设计师助理' AND a.is_active = 1
      WHERE d.position = '设计师' AND d.is_active = 1
      GROUP BY d.id, d.account, d.position, d.created_at
      ORDER BY d.id ASC
    `)
    res.json({ data: rows })
  } catch (error) { next(error) }
})

app.post('/api/designers', async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim()
    if (!name) return res.status(400).json({ message: '请输入设计师姓名' })
    const [result] = await getPool().query('INSERT INTO product_designers (name) VALUES (?)', [name])
    const [rows] = await getPool().query('SELECT id, name, created_at FROM product_designers WHERE id = ?', [result.insertId])
    res.status(201).json(rows[0])
  } catch (error) { next(error) }
})

app.delete('/api/designers/:id', async (req, res, next) => {
  try {
    const [result] = await getPool().query('DELETE FROM product_designers WHERE id = ?', [req.params.id])
    if (!result.affectedRows) return res.status(404).json({ message: '设计师不存在' })
    res.status(204).end()
  } catch (error) { next(error) }
})

app.post('/api/uploads', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: '请选择图片文件（支持 JPG、PNG、WEBP、GIF）' })
  res.status(201).json({ url: `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`, name: normalizeUploadFilename(req.file.originalname) })
})

app.post('/api/exports/:kind', async (req, res, next) => {
  try {
    const kind = String(req.params.kind || '')
    if (!['material', 'pattern'].includes(kind)) return res.status(404).json({ message: '单据类型不存在' })
    const product = req.body?.product
    if (!product || typeof product !== 'object' || Array.isArray(product)) return res.status(400).json({ message: '款式信息不能为空' })
    const file = await generateStyleDocument(kind, product)
    const prefix = kind === 'material' ? '物料单' : '版单'
    const sku = String(product.sku || '未命名').replace(/[\\/:*?"<>|]/g, '_')
    const filename = `${prefix}_${sku}.xlsx`
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`)
    res.send(file)
  } catch (error) {
    console.error('生成款式Excel失败:', error)
    res.status(500).json({ message: 'Excel生成失败，请检查服务器端Python、openpyxl和Pillow依赖' })
  }
})

app.post('/api/exports/:kind/preview', async (req, res, next) => {
  try {
    const kind = String(req.params.kind || '')
    if (!['material', 'pattern'].includes(kind)) return res.status(404).json({ message: '单据类型不存在' })
    const product = req.body?.product
    if (!product || typeof product !== 'object' || Array.isArray(product)) return res.status(400).json({ message: '款式信息不能为空' })
    const html = await generateStyleDocument(kind, product, true)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'")
    res.send(html)
  } catch (error) {
    console.error('生成款式Excel预览失败:', error)
    res.status(500).json({ message: 'Excel预览生成失败，请检查服务器端Python、openpyxl和Pillow依赖' })
  }
})

app.get('/api/products', async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 10))
    const search = String(req.query.search || '').trim()
    const sku = String(req.query.sku || '').trim()
    const category = String(req.query.category || '').trim()
    const status = String(req.query.status || '').trim()
    const designer = String(req.query.designer || '').trim()
    const canceledOnly = req.query.is_canceled === '1'
    const newArrivals = req.query.new_arrivals === '1'
    const releaseDateFilter = String(req.query.release_date_filter || '').trim()
    const releaseDate = String(req.query.release_date || '').trim()
    const releaseDateFrom = String(req.query.release_date_from || '').trim()
    const releaseDateTo = String(req.query.release_date_to || '').trim()
    const link = String(req.query.link || '').trim()
    const styleProgress = String(req.query.style_progress || '').trim()
    const styleGroup = String(req.query.style_group || '').trim()
    const styleProgressFrom = String(req.query.style_progress_from || '').trim()
    const styleProgressTo = String(req.query.style_progress_to || '').trim()
    const conditions = []
    const params = []
    if (search) { conditions.push('(sku LIKE ? OR category LIKE ? OR designer LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`) }
    if (sku) { conditions.push('sku LIKE ?'); params.push(`%${sku}%`) }
    if (category) { conditions.push('category = ?'); params.push(category) }
    if (releaseDate && /^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) { conditions.push('release_date = ?'); params.push(releaseDate) }
    if (releaseDateFrom && /^\d{4}-\d{2}-\d{2}$/.test(releaseDateFrom)) { conditions.push('release_date >= ?'); params.push(releaseDateFrom) }
    if (releaseDateTo && /^\d{4}-\d{2}-\d{2}$/.test(releaseDateTo)) { conditions.push('release_date <= ?'); params.push(releaseDateTo) }
    if (link) { conditions.push('link = ?'); params.push(link) }
    if (status) { conditions.push('status = ?'); params.push(status) }
    if (designer === '未分配') conditions.push("(designer IS NULL OR designer = '')")
    else if (designer) { conditions.push('designer = ?'); params.push(designer) }
    if (canceledOnly) conditions.push('is_canceled = 1')
    const releaseDateConditions = [...conditions]
    const releaseDateParams = [...params]
    if (newArrivals && releaseDateFilter === 'unscheduled') conditions.push('release_date IS NULL')
    else if (newArrivals && /^\d{4}-\d{2}-\d{2}$/.test(releaseDateFilter)) {
      conditions.push('release_date = ?')
      params.push(releaseDateFilter)
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const releaseDateWhere = releaseDateConditions.length ? `WHERE ${releaseDateConditions.join(' AND ')}` : ''
    const pool = getPool()
    const sortOrder = newArrivals ? 'release_date DESC, id DESC' : 'id DESC'
    const calculatedCost = `COALESCE(processing_fee, 0)
      + COALESCE((SELECT SUM(cost) FROM product_fabrics WHERE product_id = products.id), 0)
      + COALESCE((SELECT SUM(cost) FROM product_accessories WHERE product_id = products.id), 0)
      + COALESCE((SELECT SUM(price) FROM product_crafts WHERE product_id = products.id), 0)`
    const arrivalCostSelect = newArrivals ? `,
      CASE WHEN link = '外采' THEN COALESCE(price, 0)
        WHEN link IN ('AI款', 'AI外发款', 'AI', 'AI外发') AND (${calculatedCost}) = 0 THEN COALESCE(price, 0)
        ELSE ${calculatedCost}
      END AS total_cost` : ''
    const select = `SELECT id, sku, season, category, designer, designer_assistant, pattern_maker, release_date, link, season_type, color, composition, size, highlights, priority, style_progress, style_progress_times, pattern_progress, pattern_started_at, pattern_progress_times, material_notified, material_arrived, material_outsourced, first_pattern_progress, first_pattern_image_url, first_board_progress, first_board_maker, first_review_result, first_review_opinion_image_url, second_pattern_progress, second_pattern_image_url, second_board_progress, second_board_maker, second_review_result, second_review_opinion_image_url, third_pattern_progress, third_pattern_image_url, third_board_progress, third_board_maker, third_review_result, third_review_opinion_image_url, preproduction_sample, preproduction_board_progress, preproduction_board_maker, has_pattern, pattern_notes, price, pricing, processing_fee${arrivalCostSelect}, reference_sales, stock, status, description, image_url, physical_image_url, design_image_url, front_back_image_url, size_chart_url, external_purchase_progress, is_canceled, canceled_at, reference_link, official_matching_sku, final_pattern_image_url, final_pattern_filename, matching_image_1, matching_sku_1, matching_progress_1, matching_image_2, matching_sku_2, matching_progress_2, matching_image_3, matching_sku_3, matching_progress_3, created_at, updated_at FROM products ${where} ORDER BY ${sortOrder}`
    let releaseDates = []
    if (styleProgress || styleGroup || newArrivals) {
      const [rows] = await pool.query(select, params)
      const filtered = rows
        .map((row) => withProgressTimes({ ...row, pattern_progress: calculatePatternProgress(row), final_pattern_filename: normalizeUploadFilename(row.final_pattern_filename) }))
        .filter((row) => {
          if (newArrivals) {
            const steps = getStyleProgressSteps(row.link)
            const scheduledIndex = steps.indexOf('待排期')
            const startIndex = scheduledIndex >= 0 ? scheduledIndex : steps.indexOf('搭配')
            const currentIndex = steps.indexOf(row.style_progress)
            if (startIndex < 0 || currentIndex < startIndex) return false
          }
          if (styleProgress && row.style_progress !== styleProgress) return false
          if (styleGroup === '作业中') {
            const group = getDashboardStyleGroup(row)
            if (['未排期', '已排期', '已取消', '已下架'].includes(group)) return false
          } else if (styleGroup && (dashboardStyleGroups.has(styleGroup)
            ? getDashboardStyleGroup(row) !== styleGroup
            : getStyleProgressGroup(row) !== styleGroup)) return false
          if (!styleProgressFrom && !styleProgressTo) return true
          const progressDate = String(row.style_progress_times?.[styleProgress] || row.updated_at || row.created_at || '').slice(0, 10)
          return (!styleProgressFrom || progressDate >= styleProgressFrom) && (!styleProgressTo || progressDate <= styleProgressTo)
        })
      const start = (page - 1) * pageSize
      if (newArrivals) {
        const [dateRows] = await pool.query(select.replace(where, releaseDateWhere), releaseDateParams)
        releaseDates = [...new Set(dateRows
          .map((row) => withProgressTimes({ ...row, pattern_progress: calculatePatternProgress(row) }))
          .filter((row) => {
            const steps = getStyleProgressSteps(row.link)
            const scheduledIndex = steps.indexOf('待排期')
            const startIndex = scheduledIndex >= 0 ? scheduledIndex : steps.indexOf('搭配')
            return startIndex >= 0 && steps.indexOf(row.style_progress) >= startIndex
          })
          .map((row) => row.release_date ? String(row.release_date).slice(0, 10) : null))]
          .sort((left, right) => !left ? 1 : !right ? -1 : left.localeCompare(right))
      }
      return res.json({ data: filtered.slice(start, start + pageSize), total: filtered.length, page, pageSize, ...(newArrivals ? { release_dates: releaseDates } : {}) })
    }
    const [[countRow]] = await pool.query(`SELECT COUNT(*) AS total FROM products ${where}`, params)
    const [rows] = await pool.query(`${select} LIMIT ? OFFSET ?`, [...params, pageSize, (page - 1) * pageSize])
    res.json({ data: rows.map((row) => withProgressTimes({ ...row, pattern_progress: calculatePatternProgress(row), final_pattern_filename: normalizeUploadFilename(row.final_pattern_filename) })), total: Number(countRow.total), page, pageSize, ...(newArrivals ? { release_dates: releaseDates } : {}) })
  } catch (error) { next(error) }
})

app.get('/api/products/:key', async (req, res, next) => {
  try {
    const key = decodeURIComponent(String(req.params.key || ''))
    const [rows] = await getPool().query('SELECT * FROM products WHERE id = ? OR sku = ? LIMIT 1', [key, key])
    if (!rows.length) return res.status(404).json({ message: '商品不存在' })
    const product = await withMaterialData(rows[0])
    product.pattern_progress = calculatePatternProgress(product)
    const normalizedProduct = withProgressTimes(product)
    normalizedProduct.final_pattern_filename = normalizeUploadFilename(normalizedProduct.final_pattern_filename)
    res.json(normalizedProduct)
  } catch (error) { next(error) }
})

app.post('/api/products', async (req, res, next) => {
  try {
    const payload = { status: 'active', ...productPayload(req.body) }
    payload.pricing ??= 0
    payload.sku ||= `STYLE-${Date.now()}`
    syncPatternStageProgress(payload, payload)
    const now = new Date().toISOString()
    payload.canceled_at = payload.is_canceled === true || Number(payload.is_canceled) === 1 ? new Date() : null
    const initialStyleSteps = getStyleProgressSteps(payload.link)
    const initialProgress = initialStyleSteps[0]
    payload.style_progress = isCanceled(payload.is_canceled)
      ? '款式取消'
      : calculateStyleProgress(payload, { stopAtPrePricing: initialStyleSteps.includes('预核价') && ['定料', '预核价'].includes(initialProgress) })
    payload.pattern_progress = calculatePatternProgress(payload)
    payload.style_progress_times = JSON.stringify({ ...parseProgressTimes(payload.style_progress_times), [payload.style_progress]: now })
    payload.pattern_progress_times = JSON.stringify({ ...parseProgressTimes(payload.pattern_progress_times), [payload.pattern_progress]: now })
    const validationError = validateProduct(payload)
    if (validationError) return res.status(400).json({ message: validationError })
    const fields = Object.keys(payload)
    const [result] = await getPool().query(`INSERT INTO products (${fields.map((field) => `\`${field}\``).join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`, fields.map((field) => payload[field]))
    const [rows] = await getPool().query('SELECT * FROM products WHERE id = ?', [result.insertId])
    await assignPendingPatternTasks()
    const [updatedRows] = await getPool().query('SELECT * FROM products WHERE id = ?', [result.insertId])
    res.status(201).json(withProgressTimes(updatedRows[0] || rows[0]))
  } catch (error) { next(error) }
})

app.post('/api/products/:id/advance-progress', async (req, res, next) => {
  try {
    const [rows] = await getPool().query('SELECT * FROM products WHERE id = ? LIMIT 1', [req.params.id])
    if (!rows.length) return res.status(404).json({ message: '商品不存在' })
    // 页面展示进度会基于面辅料明细计算，推进接口必须使用同一份完整产品数据。
    const product = await withMaterialData(rows[0])
    if (isCanceled(product.is_canceled)) return res.status(409).json({ message: '已取消的款式不能推进进度' })
    if (requiresStyleNumber(product.link) && !hasStyleNumber(product.sku)) {
      return res.status(409).json({ message: '请先填写款号，再推进总进度' })
    }

    const steps = getStyleProgressSteps(product.link)
    const normalizedProgress = normalizeStyleProgress(product)
    // 详情页展示的是规范化进度，而旧数据可能仍保存着更靠前的阶段。
    // 取两者中更靠后的有效阶段，既不会回退已保存进度，也能让推进按钮和页面保持一致。
    const storedProgress = String(product.style_progress || '').trim()
    const storedIndex = steps.indexOf(storedProgress)
    const normalizedIndex = steps.indexOf(normalizedProgress)
    const currentProgress = storedIndex >= 0 && normalizedIndex >= 0
      ? (normalizedIndex > storedIndex ? normalizedProgress : storedProgress)
      : (storedIndex >= 0 ? storedProgress : (normalizedIndex >= 0 ? normalizedProgress : calculateStyleProgress(product)))
    const currentIndex = steps.indexOf(currentProgress)
    const nextProgress = steps[currentIndex + 1]
    const requestedProgress = String(req.body?.style_progress || '').trim()
    if (!nextProgress || requestedProgress !== nextProgress) {
      return res.status(409).json({
        message: '进度已变化，请刷新后重试',
        current_progress: currentProgress,
        next_progress: nextProgress || '',
        requested_progress: requestedProgress,
        stored_progress: storedProgress,
        normalized_progress: normalizedProgress,
      })
    }
    const confirmingMaterialArrival = currentProgress === '待到料' && nextProgress === '待打板'
    const confirmingExternalArrival = currentProgress === '待外采' && nextProgress === '待排期' && product.link === '外采'
    const confirmingOutsourceCompletion = currentProgress === '待外发' && nextProgress === '待排期' && ['外发', '转自研外发'].includes(String(product.link || '').trim())
    const confirmingFollowUpOutsourceStart = currentProgress === '已排期' && nextProgress === '外发中' && ['AI外发款', 'AI外发'].includes(String(product.link || '').trim())
    const confirmingFollowUpOutsourceCompletion = currentProgress === '外发中' && nextProgress === '完成' && ['AI外发款', 'AI外发'].includes(String(product.link || '').trim())
    const confirmingFollowUpPatternStart = currentProgress === '已排期' && nextProgress === '打板中' && ['AI款', 'AI'].includes(String(product.link || '').trim())
    if (confirmingFollowUpPatternStart && !String(product.pattern_notes || '').trim()) {
      return res.status(400).json({ message: '请先填写：打板注意事项' })
    }
    if (confirmingFollowUpOutsourceStart && !String(req.body?.pattern_notes ?? product.pattern_notes ?? '').trim()) {
      return res.status(400).json({ message: '请先填写：打板注意事项' })
    }
    if (currentProgress === '审版中' && nextProgress === '完成' && ['AI款', 'AI'].includes(String(product.link || '').trim())
      && calculatePatternProgress(product) !== '已通过') {
      return res.status(400).json({ message: '纸样审核通过后才能进入已完成' })
    }
    if (confirmingMaterialArrival) {
      const missingFields = [
        ...(!hasStyleNumber(product.sku) ? ['款号'] : []),
        ...(!hasImageValue(product.image_url) ? ['参考图'] : []),
        ...(!String(product.designer || '').trim() ? ['设计师'] : []),
        ...(!['常规款', '常规优先款', '常规优先', '转自研板房'].includes(String(product.link || '').trim()) ? ['链路'] : []),
        ...(!String(product.pattern_notes || '').trim() ? ['打板注意事项'] : []),
      ]
      if (missingFields.length) return res.status(400).json({ message: `请先填写：${missingFields.join('、')}` })
    }
    if (confirmingExternalArrival) {
      const sizes = Array.isArray(product.size) ? product.size : String(product.size || '').split(',').map((size) => size.trim())
      const missingFields = [
        ...(!hasStyleNumber(product.sku) ? ['款号'] : []),
        ...(!String(product.designer || '').trim() ? ['设计师'] : []),
        ...(!hasImageValue(product.physical_image_url) ? ['实物图'] : []),
        ...(product.link !== '外采' ? ['链路'] : []),
        ...(!String(product.highlights || '').trim() ? ['产品亮点'] : []),
        ...(!String(product.color || '').trim() ? ['颜色'] : []),
        ...(!String(product.category || '').trim() ? ['品类'] : []),
        ...(!String(product.composition || '').trim() ? ['成分'] : []),
        ...(!String(product.season_type || '').trim() ? ['季节'] : []),
        ...(!sizes.some((size) => ['宽松', '合体', '修身'].includes(size)) ? ['尺码'] : []),
        ...(Number(product.price) <= 0 ? ['价格'] : []),
      ]
      if (missingFields.length) return res.status(400).json({ message: `请先填写：${missingFields.join('、')}` })
    }
    if (confirmingOutsourceCompletion) {
      const sizes = Array.isArray(product.size) ? product.size : String(product.size || '').split(',').map((size) => size.trim())
      const missingFields = [
        ...(!hasStyleNumber(product.sku) ? ['款号'] : []),
        ...(!hasImageValue(product.image_url) ? ['参考图'] : []),
        ...(!String(product.designer || '').trim() ? ['设计师'] : []),
        ...(!hasImageValue(product.physical_image_url) ? ['实物图'] : []),
        ...(!['外发', '转自研外发'].includes(String(product.link || '').trim()) ? ['链路'] : []),
        ...(!String(product.highlights || '').trim() ? ['产品亮点'] : []),
        ...(!String(product.color || '').trim() ? ['颜色'] : []),
        ...(!String(product.category || '').trim() ? ['品类'] : []),
        ...(!String(product.composition || '').trim() ? ['成分'] : []),
        ...(!String(product.season_type || '').trim() ? ['季节'] : []),
        ...(!sizes.some((size) => ['宽松', '合体', '修身'].includes(size)) ? ['尺码'] : []),
        ...(!String(product.pattern_notes || '').trim() ? ['打板注意事项'] : []),
      ]
      if (missingFields.length) return res.status(400).json({ message: `请先填写：${missingFields.join('、')}` })
    }
    if ((nextProgress === '完成' || nextProgress === '已排期') && !product.release_date) {
      return res.status(400).json({ message: '请先填写上新日期' })
    }
    if (currentProgress === '预核价' && Number(product.price) <= 0) {
      return res.status(400).json({ message: '请先填写外采价格' })
    }
    if (nextProgress === '外发') {
      const productWithMaterials = await withMaterialData(product)
      if (!isStyleProgressStageComplete(productWithMaterials, '定料')) {
        return res.status(400).json({ message: '进入外发前请先填写面料或辅料信息' })
      }
    }
    let referenceImage = product.image_url
    let patternNotes = product.pattern_notes
    if (confirmingFollowUpOutsourceStart && req.body?.pattern_notes !== undefined) patternNotes = req.body.pattern_notes
    if (['打版', '打板'].includes(nextProgress)) {
      if (req.body?.image_url !== undefined) referenceImage = req.body.image_url
      if (req.body?.pattern_notes !== undefined) patternNotes = req.body.pattern_notes
      const missingFields = [
        ...(!hasImageValue(referenceImage) ? ['参考图'] : []),
        ...(!String(patternNotes || '').trim() ? ['打板注意事项'] : []),
      ]
      if (missingFields.length) return res.status(400).json({ message: `进入${nextProgress}前请先填写：${missingFields.join('、')}` })
    }

    const now = new Date().toISOString()
    const styleProgressTimes = parseProgressTimes(product.style_progress_times)
    styleProgressTimes[nextProgress] = now
    const enteringPatternStage = ['打版', '打板'].includes(nextProgress)
    const completingOutsource = (currentProgress === '外发' && nextProgress === '搭配') || confirmingOutsourceCompletion || confirmingFollowUpOutsourceCompletion
    const completingNotification = currentProgress === '通知' && ['外发', '买料'].includes(nextProgress)
    if (enteringPatternStage || confirmingMaterialArrival) {
      await getPool().query(
        'UPDATE products SET style_progress = ?, style_progress_times = ?, image_url = ?, pattern_notes = ?, material_arrived = 1 WHERE id = ?',
        [nextProgress, JSON.stringify(styleProgressTimes), persistImageValue(referenceImage), patternNotes, req.params.id],
      )
    } else if (confirmingExternalArrival) {
      await getPool().query(
        'UPDATE products SET style_progress = ?, style_progress_times = ?, external_purchase_progress = ? WHERE id = ?',
        [nextProgress, JSON.stringify(styleProgressTimes), '外采到货', req.params.id],
      )
    } else if (completingOutsource) {
      await getPool().query(
        'UPDATE products SET style_progress = ?, style_progress_times = ?, material_outsourced = 1 WHERE id = ?',
        [nextProgress, JSON.stringify(styleProgressTimes), req.params.id],
      )
    } else if (confirmingFollowUpOutsourceStart) {
      await getPool().query(
        'UPDATE products SET style_progress = ?, style_progress_times = ?, pattern_notes = ? WHERE id = ?',
        [nextProgress, JSON.stringify(styleProgressTimes), patternNotes, req.params.id],
      )
    } else if (completingNotification) {
      await getPool().query(
        'UPDATE products SET style_progress = ?, style_progress_times = ?, material_notified = 1 WHERE id = ?',
        [nextProgress, JSON.stringify(styleProgressTimes), req.params.id],
      )
    } else {
      await getPool().query(
        'UPDATE products SET style_progress = ?, style_progress_times = ? WHERE id = ?',
        [nextProgress, JSON.stringify(styleProgressTimes), req.params.id],
      )
    }
    const allocation = confirmingExternalArrival
      ? { assigned: [], makerCount: 0 }
      : await assignPendingPatternTasks()
    const [updatedRows] = await getPool().query('SELECT pattern_maker, pattern_progress FROM products WHERE id = ?', [req.params.id])
    const reachedPatternStage = hasReachedPatternStage({ ...product, style_progress: nextProgress })
    res.json({ style_progress: nextProgress, style_progress_times: styleProgressTimes, external_purchase_progress: confirmingExternalArrival ? '外采到货' : product.external_purchase_progress, pattern_maker: updatedRows[0]?.pattern_maker || '', pattern_progress: updatedRows[0]?.pattern_progress || '分配中', material_arrived: enteringPatternStage || confirmingMaterialArrival ? true : product.material_arrived, material_notified: completingNotification ? true : product.material_notified, material_outsourced: completingOutsource ? true : product.material_outsourced, pattern_waiting: reachedPatternStage && !updatedRows[0]?.pattern_maker, pattern_wait_reason: allocation.makerCount ? 'capacity' : 'no_makers', ...(enteringPatternStage ? { image_url: referenceImage, pattern_notes: patternNotes } : {}), assigned_count: allocation.assigned.length })
  } catch (error) { next(error) }
})

app.put('/api/products/:id', async (req, res, next) => {
  try {
    const materials = materialPayload(req.body)
    const payload = productPayload(req.body)
    if (Object.hasOwn(payload, 'pattern_started_at')) {
      if (!payload.pattern_started_at) payload.pattern_started_at = null
      else {
        const startedAt = new Date(payload.pattern_started_at)
        if (Number.isNaN(startedAt.getTime())) return res.status(400).json({ message: '开始纸样时间格式无效' })
        payload.pattern_started_at = startedAt
      }
    }
    const [existingRows] = await getPool().query('SELECT * FROM products WHERE id = ?', [req.params.id])
    if (!existingRows.length) return res.status(404).json({ message: '商品不存在' })
    const existing = existingRows[0]
    const followupPatternCompleted = existing.second_pattern_progress === '纸样已完成'
      || existing.second_board_progress === '车板已完成'
      || String(existing.second_board_maker || '').trim()
    if (
      followupPatternCompleted
      && Object.hasOwn(payload, 'first_review_result')
      && String(payload.first_review_result || '') !== String(existing.first_review_result || '')
    ) {
      return res.status(409).json({ message: '复版纸样或车板已完成，头版审版结果不可修改' })
    }
    const merged = { ...existing, ...payload }
    if (!Array.isArray(materials.fabric_records) || !Array.isArray(materials.accessory_records)) {
      const existingMaterials = await withMaterialData(existing)
      merged.fabric_records = materials.fabric_records ?? existingMaterials.fabric_records
      merged.accessory_records = materials.accessory_records ?? existingMaterials.accessory_records
    } else {
      merged.fabric_records = materials.fabric_records
      merged.accessory_records = materials.accessory_records
    }
    syncPatternStageProgress(merged, payload)
    const newlyApprovedReview = ['first_review_result', 'second_review_result', 'third_review_result']
      .some((field) => merged[field] === '通过' && existing[field] !== '通过')
    if (newlyApprovedReview) {
      const missingReviewFields = reviewApprovalMissingFields(merged)
      if (missingReviewFields.length) return res.status(400).json({ message: `选择“通过”前请先填写：${missingReviewFields.join('、')}` })
    }
    const patternProgress = calculatePatternProgress(merged)
    merged.pattern_progress = patternProgress
    const now = new Date().toISOString()
    const canceled = merged.is_canceled === true || Number(merged.is_canceled) === 1
    const wasCanceled = existing.is_canceled === true || Number(existing.is_canceled) === 1
    payload.canceled_at = canceled ? (wasCanceled && existing.canceled_at ? existing.canceled_at : new Date()) : null
    const linkChanged = String(existing.link || '') !== String(merged.link || '')
    const currentSteps = getStyleProgressSteps(merged.link)
    const previousSteps = getStyleProgressSteps(existing.link)
    const normalizedPreviousStyleProgress = normalizeStyleProgress(existing)
    const previousStoredProgress = String(existing.style_progress || '').trim()
    const previousStyleProgress = previousSteps.includes(previousStoredProgress)
      ? previousStoredProgress
      : normalizedPreviousStyleProgress
    const existingStyleProgressTimes = parseProgressTimes(existing.style_progress_times)
    const cancelProgressKey = '__cancelled_from_progress'
    const cancelLinkKey = '__cancelled_from_link'
    let restoredCanceledProgress = ''
    if (!linkChanged && wasCanceled && !canceled) {
      const savedProgress = existingStyleProgressTimes[cancelProgressKey]
      const savedLink = existingStyleProgressTimes[cancelLinkKey]
      if (savedLink === merged.link && currentSteps.includes(savedProgress)) restoredCanceledProgress = savedProgress
      if (!restoredCanceledProgress) {
        restoredCanceledProgress = currentSteps
          .filter((step) => existingStyleProgressTimes[step])
          .sort((left, right) => Date.parse(existingStyleProgressTimes[left]) - Date.parse(existingStyleProgressTimes[right]))
          .at(-1) || ''
      }
    }
    const previousProgressIndex = previousSteps.indexOf(previousStyleProgress)
    const stopAtPrePricing = currentSteps.includes('预核价') && ['定料', '预核价'].includes(previousStyleProgress)
    const isFollowUpPatternLink = ['AI款', 'AI'].includes(String(merged.link || '').trim())
    const recalculationInput = linkChanged ? { ...merged, style_progress: currentSteps[0] }
      : isFollowUpPatternLink && previousStyleProgress === '完成' ? { ...merged, style_progress: '打板中' } : merged
    const calculatedStyleProgress = calculateStyleProgress(recalculationInput, { stopAtPrePricing: linkChanged ? false : stopAtPrePricing })
    const calculatedProgressIndex = currentSteps.indexOf(calculatedStyleProgress)
    const outsourcingProgressIndex = currentSteps.indexOf('外发')
    const holdExternalMatchingStage = existing.style_progress === '外发'
      && outsourcingProgressIndex >= 0
      && calculatedProgressIndex > outsourcingProgressIndex
    const holdExternalMaterialStage = merged.link === '外发'
      && existing.link === '外发'
      && previousStyleProgress === '定料'
      && calculatedStyleProgress === '外发'
    const keepAdvancedProgress = !linkChanged
      && !isCanceled(merged.is_canceled)
      && currentSteps.includes(previousStyleProgress)
      && previousProgressIndex >= calculatedProgressIndex
    const styleProgress = isCanceled(merged.is_canceled)
      ? '款式取消'
      : restoredCanceledProgress
        ? restoredCanceledProgress
        : selectionSkuGatedLinks.has(merged.link) && !hasStyleNumber(merged.sku) ? '选图'
      : ['常规款', '常规优先款', '常规优先', '转自研板房'].includes(String(merged.link || '').trim()) && previousStyleProgress === '已排期' && !merged.release_date ? '待排期'
      : ['常规款', '常规优先款', '常规优先', '转自研板房'].includes(String(merged.link || '').trim()) && previousStyleProgress === '待排期' && merged.release_date ? (calculatedStyleProgress === '完成' ? '完成' : '已排期')
      : isFollowUpPatternLink && previousStyleProgress === '完成'
        ? (patternProgress === '已通过' ? '完成' : patternProgress === '审核中' ? '审版中' : '打板中')
      : existing.style_progress === '完成' && !merged.release_date ? (currentSteps.includes('待排期') ? '待排期' : '上新')
      : existing.style_progress === '上新' && merged.release_date ? '完成'
      : holdExternalMaterialStage || holdExternalMatchingStage ? previousStyleProgress
      : keepAdvancedProgress ? previousStyleProgress : calculatedStyleProgress
    const styleProgressTimes = linkChanged
      ? {}
      : wasCanceled !== canceled ? { ...existingStyleProgressTimes } : parseProgressTimes(merged.style_progress_times)
    if (linkChanged) {
      delete styleProgressTimes[cancelProgressKey]
      delete styleProgressTimes[cancelLinkKey]
    } else if (canceled && !wasCanceled) {
      const progressToRestore = previousSteps.includes(existing.style_progress) && existing.style_progress !== '款式取消'
        ? existing.style_progress
        : previousStyleProgress
      if (previousSteps.includes(progressToRestore)) {
        styleProgressTimes[cancelProgressKey] = progressToRestore
        styleProgressTimes[cancelLinkKey] = existing.link
      }
    } else if (wasCanceled && !canceled) {
      delete styleProgressTimes[cancelProgressKey]
      delete styleProgressTimes[cancelLinkKey]
    }
    if (styleProgress !== existing.style_progress || !styleProgressTimes[styleProgress]) styleProgressTimes[styleProgress] = now
    payload.style_progress = styleProgress
    payload.style_progress_times = JSON.stringify(styleProgressTimes)
    const patternProgressTimes = parseProgressTimes(merged.pattern_progress_times)
    if (patternProgress !== existing.pattern_progress || !patternProgressTimes[patternProgress]) patternProgressTimes[patternProgress] = now
    payload.pattern_progress = patternProgress
    payload.pattern_progress_times = JSON.stringify(patternProgressTimes)
    const approvedPatternStages = [
      ['third_review_result', 'third_pattern_image_url'],
      ['second_review_result', 'second_pattern_image_url'],
      ['first_review_result', 'first_pattern_image_url'],
    ]
    const newlyApprovedStage = approvedPatternStages.find(([reviewField, imageField]) => (
      merged[reviewField] === '通过'
      && (existing[reviewField] !== '通过' || String(merged[imageField] || '') !== String(existing[imageField] || ''))
      && (merged[imageField] || existing[imageField])
    ))
    if (newlyApprovedStage) {
      const [, imageField] = newlyApprovedStage
      payload.final_pattern_image_url = merged[imageField] || existing[imageField]
      payload.final_pattern_filename = ''
    }
    const validationError = validateProduct(merged, { requireIdentity: false })
    if (validationError) return res.status(400).json({ message: validationError })
    const fields = Object.keys(payload)
    if (!fields.length && !Object.keys(materials).length) return res.status(400).json({ message: '没有可更新的字段' })
    if (fields.length) {
      const [result] = await getPool().query(`UPDATE products SET ${fields.map((field) => `\`${field}\` = ?`).join(', ')} WHERE id = ?`, [...fields.map((field) => payload[field]), req.params.id])
      if (!result.affectedRows) return res.status(404).json({ message: '商品不存在' })
    } else {
      const [rows] = await getPool().query('SELECT id FROM products WHERE id = ?', [req.params.id])
      if (!rows.length) return res.status(404).json({ message: '商品不存在' })
    }
    await saveMaterialData(req.params.id, materials)
    await assignPendingPatternTasks()
    const [rows] = await getPool().query('SELECT * FROM products WHERE id = ?', [req.params.id])
    res.json(withProgressTimes(await withMaterialData(rows[0])))
  } catch (error) { next(error) }
})

app.delete('/api/products/:id', async (req, res, next) => {
  try {
    const [result] = await getPool().query('DELETE FROM products WHERE id = ?', [req.params.id])
    if (!result.affectedRows) return res.status(404).json({ message: '商品不存在' })
    await assignPendingPatternTasks()
    res.status(204).end()
  } catch (error) { next(error) }
})

app.use((error, _req, res, _next) => {
  console.error(error)
  if (error.code === 'ER_DUP_ENTRY') {
    if (error.sqlMessage?.includes('app_users')) return res.status(409).json({ message: '账号已存在' })
    return res.status(409).json({ message: error.sqlMessage?.includes('product_categories') ? '品类名称已存在' : error.sqlMessage?.includes('product_designers') ? '设计师已存在' : '商品编码已存在' })
  }
  if (error.message === '数据库尚未初始化') return res.status(503).json({ message: '数据库尚未连接，请检查 .env 中的 DB_PASSWORD' })
  res.status(500).json({ message: '服务器处理失败，请检查数据库连接' })
})

async function startServer() {
  try {
    await initDatabase()
    console.log('数据库初始化成功')
    await syncReleaseCompletionProgress()
    const selectionSyncedCount = await syncSelectionSkuProgress()
    if (selectionSyncedCount) console.log(`已按有效款号校准 ${selectionSyncedCount} 个外采或 AI 款式进度`)
    const matchingSyncedCount = await syncCompletedMatchingProgress()
    if (matchingSyncedCount) console.log(`已将 ${matchingSyncedCount} 个搭配已完成的款式同步到下一阶段`)
    const syncedCount = await syncApprovedPatternMaterialArrival()
    if (syncedCount) console.log(`已为 ${syncedCount} 个纸样已通过的款式补齐到料状态并同步进度`)
  } catch (error) {
    console.error('数据库初始化失败:', error.message)
  }
  app.listen(port, () => console.log(`商品管理 API 已启动: http://localhost:${port}`))
}

startServer()
