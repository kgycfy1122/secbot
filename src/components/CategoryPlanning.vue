<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Plus } from '@element-plus/icons-vue'
import { getAuthHeaders } from '../auth.js'

const dates = ref([])
const metricColumns = [
  { key: 'self_developed', label: '自研', percent: true },
  { key: 'follow_up', label: '跟卖', percent: true },
  { key: 'outsource', label: '外采', percent: true },
  { key: 'style_count', label: '品类款数', percent: false },
]
const plans = ref([])
const loading = ref(false)
const savingCategories = ref(new Set())
const dateDialogVisible = ref(false)
const dateDialogMode = ref('add')
const dateDialogValue = ref('')
const editingDateId = ref('')
const categoryDialogVisible = ref(false)
const categoryDialogMode = ref('add')
const categoryDialogValue = ref('')
const editingCategory = ref(null)
const gridStyle = computed(() => ({ '--date-count': dates.value.length }))

function emptyPlan(category, groupName = '其他') {
  return { category, group_name: groupName, sort_order: 0, date_values: {}, self_developed: null, follow_up: null, outsource: null, style_count: null }
}

function isSaving(category) {
  return savingCategories.value.has(category)
}

async function loadPlans() {
  loading.value = true
  try {
    const response = await fetch('/api/category-planning', { headers: getAuthHeaders() })
    const result = await response.json()
    if (!response.ok || !Array.isArray(result.data)) throw new Error(result.message || '规划数据加载失败')
    plans.value = result.data.map((plan) => ({ ...emptyPlan(plan.category, plan.group_name), ...plan }))
  } catch (error) {
    ElMessage.error(error.message || '规划数据加载失败')
    plans.value = []
  } finally {
    loading.value = false
  }
}

function openAddCategory() {
  categoryDialogMode.value = 'add'
  categoryDialogValue.value = ''
  editingCategory.value = null
  categoryDialogVisible.value = true
}

function openEditCategory(plan) {
  categoryDialogMode.value = 'edit'
  categoryDialogValue.value = plan.category
  editingCategory.value = { ...plan, date_values: { ...plan.date_values } }
  categoryDialogVisible.value = true
}

async function saveCategory() {
  const category = categoryDialogValue.value.trim()
  if (!category) return ElMessage.warning('请填写品类名称')
  const isEditing = categoryDialogMode.value === 'edit'
  const previousCategory = editingCategory.value?.category
  try {
    const response = await fetch(isEditing ? `/api/category-planning/${encodeURIComponent(previousCategory)}` : '/api/category-planning', {
      method: isEditing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(isEditing ? { ...editingCategory.value, category } : { category }),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.message || (isEditing ? '品类修改失败' : '品类行新增失败'))
    if (isEditing) {
      const index = plans.value.findIndex((plan) => plan.category === previousCategory)
      if (index >= 0) plans.value.splice(index, 1, { ...emptyPlan(result.category, result.group_name), ...result })
    } else {
      plans.value = [...plans.value, { ...emptyPlan(result.category, result.group_name), ...result }]
        .sort((left, right) => Number(left.sort_order) - Number(right.sort_order) || left.category.localeCompare(right.category, 'zh-CN'))
    }
    categoryDialogVisible.value = false
    ElMessage.success(isEditing ? '品类已更新' : '品类行已新增')
  } catch (error) {
    ElMessage.error(error.message || (isEditing ? '品类修改失败' : '品类行新增失败'))
  }
}

async function deleteCategory() {
  const plan = editingCategory.value
  if (!plan) return
  try {
    await ElMessageBox.confirm(`删除“${plan.category}”规划行？已填写的比例和日期计划会一并删除，款式记录不会删除。`, '删除品类行', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      lockScroll: false,
    })
    const response = await fetch(`/api/category-planning/${encodeURIComponent(plan.category)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })
    if (!response.ok) {
      const result = await response.json()
      throw new Error(result.message || '品类行删除失败')
    }
    plans.value = plans.value.filter((item) => item.category !== plan.category)
    categoryDialogVisible.value = false
    ElMessage.success('品类行已删除')
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(error.message || '品类行删除失败')
  }
}

async function loadDates() {
  try {
    const response = await fetch('/api/category-planning/dates', { headers: getAuthHeaders() })
    const result = await response.json()
    if (!response.ok || !Array.isArray(result.data)) throw new Error(result.message || '日期列加载失败')
    dates.value = result.data
  } catch (error) {
    ElMessage.error(error.message || '日期列加载失败')
    dates.value = []
  }
}

function openAddDate() {
  dateDialogMode.value = 'add'
  editingDateId.value = ''
  dateDialogValue.value = ''
  dateDialogVisible.value = true
}

function openEditDate(date) {
  dateDialogMode.value = 'edit'
  editingDateId.value = String(date.id)
  const [, month, day] = /^(\d{1,2})月(\d{1,2})日$/.exec(date.date_label) || []
  dateDialogValue.value = month && day ? `2000-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : ''
  dateDialogVisible.value = true
}

function dateSortKey(label) {
  const [, month, day] = /^(\d{1,2})月(\d{1,2})日$/.exec(label) || []
  return Number(month) * 100 + Number(day)
}

async function saveDateColumn() {
  if (!dateDialogValue.value) return ElMessage.warning('请选择日期')
  const isEditing = dateDialogMode.value === 'edit'
  try {
    const response = await fetch(isEditing ? `/api/category-planning/dates/${encodeURIComponent(editingDateId.value)}` : '/api/category-planning/dates', {
      method: isEditing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ date: dateDialogValue.value }),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.message || '日期保存失败')
    if (isEditing) {
      const index = dates.value.findIndex((date) => String(date.id) === String(result.id))
      if (index >= 0) dates.value[index] = result
      await loadPlans()
    } else {
      dates.value.push(result)
    }
    dates.value.sort((left, right) => dateSortKey(left.date_label) - dateSortKey(right.date_label) || Number(left.id) - Number(right.id))
    dateDialogVisible.value = false
    ElMessage.success(isEditing ? '日期已更新' : '日期列已添加')
  } catch (error) {
    ElMessage.error(error.message || '日期保存失败')
  }
}

async function deleteDateColumn() {
  const selectedDate = dates.value.find((date) => String(date.id) === String(editingDateId.value))
  if (!selectedDate) return
  try {
    await ElMessageBox.confirm(`删除后，“${selectedDate.date_label}”列中已填写的数量也会删除。确定继续吗？`, '删除日期列', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      lockScroll: false,
    })
    const response = await fetch(`/api/category-planning/dates/${encodeURIComponent(editingDateId.value)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })
    if (!response.ok) {
      const result = await response.json()
      throw new Error(result.message || '日期列删除失败')
    }
    dates.value = dates.value.filter((date) => String(date.id) !== String(editingDateId.value))
    await loadPlans()
    dateDialogVisible.value = false
    ElMessage.success('日期列已删除')
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(error.message || '日期列删除失败')
  }
}

async function savePlan(plan) {
  if (isSaving(plan.category)) return
  savingCategories.value = new Set(savingCategories.value).add(plan.category)
  try {
    const response = await fetch(`/api/category-planning/${encodeURIComponent(plan.category)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(plan),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.message || '规划数据保存失败')
    Object.assign(plan, result)
  } catch (error) {
    ElMessage.error(error.message || '规划数据保存失败')
  } finally {
    const next = new Set(savingCategories.value)
    next.delete(plan.category)
    savingCategories.value = next
  }
}

onMounted(async () => {
  await loadDates()
  await loadPlans()
})
</script>

<template>
  <main class="category-planning-page">
    <header class="planning-heading">
      <div>
        <h1>品类规划</h1>
      </div>
      <div class="planning-actions">
        <el-button @click="openAddCategory"><el-icon><Plus /></el-icon>新增品类行</el-button>
        <el-button type="primary" @click="openAddDate"><el-icon><Plus /></el-icon>新增日期列</el-button>
      </div>
    </header>

    <section v-loading="loading" class="planning-table-panel" aria-label="品类时间规划表">
      <div class="planning-scroll">
        <div class="planning-grid" :style="gridStyle">
          <div class="planning-corner">品类</div>
          <div v-for="metric in metricColumns" :key="metric.key" class="planning-metric-header">{{ metric.label }}</div>
          <div v-for="date in dates" :key="date.id" class="planning-date">
            <button type="button" class="planning-date-trigger" :title="`点击修改${date.date_label}`" @click="openEditDate(date)">{{ date.date_label }}</button>
          </div>
          <template v-for="plan in plans" :key="plan.category">
            <div class="planning-category">
              <button type="button" class="planning-category-trigger" :title="`点击编辑${plan.category}`" @click="openEditCategory(plan)">{{ plan.category }}</button>
            </div>
            <div v-for="metric in metricColumns" :key="`${plan.category}-${metric.key}`" class="planning-cell metric-cell">
              <el-input-number v-model="plan[metric.key]" :min="0" :max="metric.percent ? 100 : 100000" :precision="metric.percent ? 2 : 0" :step="metric.percent ? 1 : 1" :controls="false" :disabled="isSaving(plan.category)" class="planning-number metric-number" @change="savePlan(plan)">
                <template v-if="metric.percent" #suffix>%</template>
              </el-input-number>
            </div>
            <div v-for="date in dates" :key="`${plan.category}-${date.id}`" class="planning-cell" :aria-label="`${plan.category}，${date.date_label}`">
              <el-input-number v-model="plan.date_values[date.date_label]" :min="0" :max="100000" :precision="0" :step="1" :controls="false" :disabled="isSaving(plan.category)" class="planning-number date-number" @change="savePlan(plan)" />
            </div>
          </template>
        </div>
      </div>
    </section>

    <el-dialog v-model="categoryDialogVisible" :title="categoryDialogMode === 'edit' ? '编辑品类' : '新增品类行'" width="400px" append-to-body>
      <el-form label-position="top">
        <el-form-item label="品类" required>
          <el-input v-model="categoryDialogValue" maxlength="80" show-word-limit placeholder="输入品类名称" @keyup.enter="saveCategory" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="category-dialog-footer">
          <el-button v-if="categoryDialogMode === 'edit'" type="danger" plain @click="deleteCategory"><el-icon><Delete /></el-icon>删除品类行</el-button>
          <span v-else></span>
          <div>
            <el-button @click="categoryDialogVisible = false">取消</el-button>
            <el-button type="primary" @click="saveCategory">{{ categoryDialogMode === 'edit' ? '保存' : '新增' }}</el-button>
          </div>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="dateDialogVisible" :title="dateDialogMode === 'edit' ? '修改日期' : '新增日期列'" width="360px" append-to-body>
      <el-date-picker v-model="dateDialogValue" type="date" value-format="YYYY-MM-DD" format="MM月DD日" placeholder="选择日期" class="date-dialog-picker" />
      <template #footer>
        <div class="date-dialog-footer">
          <el-button v-if="dateDialogMode === 'edit'" type="danger" plain @click="deleteDateColumn"><el-icon><Delete /></el-icon>删除日期列</el-button>
          <span v-else></span>
          <div>
            <el-button @click="dateDialogVisible = false">取消</el-button>
            <el-button type="primary" @click="saveDateColumn">保存</el-button>
          </div>
        </div>
      </template>
    </el-dialog>
  </main>
</template>

<style scoped>
.category-planning-page { min-width: 0; color: #243447; }
.planning-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 0 0 18px; }
.planning-heading h1 { margin: 0; font-size: 22px; font-weight: 700; }
.planning-actions { display: flex; align-items: center; gap: 8px; }
.category-dialog-footer { display: flex; align-items: center; justify-content: space-between; }
.date-dialog-picker { width: 100%; }
.date-dialog-footer { display: flex; align-items: center; justify-content: space-between; }
.planning-table-panel { overflow: hidden; border: 1px solid #e4e9ef; border-radius: 8px; background: #fff; }
.planning-scroll { overflow: auto; max-height: calc(100vh - 180px); }
.planning-grid { display: grid; grid-template-columns: 124px 82px 82px 82px 96px repeat(var(--date-count), 56px); min-width: max-content; }
.planning-corner, .planning-date { position: sticky; top: 0; z-index: 3; display: flex; height: 42px; align-items: center; justify-content: center; border-bottom: 1px solid #e5eaf0; background: #f7f9fb; color: #536274; font-size: 11px; white-space: nowrap; }
.planning-corner { left: 0; z-index: 4; justify-content: flex-start; padding-left: 12px; font-weight: 700; }
.planning-date { border-left: 1px solid #edf0f4; font-size: 10px; }
.planning-date-trigger { width: 100%; height: 100%; padding: 0 1px; border: 0; color: inherit; background: transparent; font: inherit; white-space: nowrap; cursor: pointer; }
.planning-date-trigger:hover, .planning-date-trigger:focus-visible { color: #1265d6; background: #edf5ff; outline: none; }
.planning-metric-header { position: sticky; top: 0; z-index: 3; display: flex; height: 42px; align-items: center; justify-content: flex-start; padding-left: 7px; border-bottom: 1px solid #e5eaf0; border-left: 1px solid #edf0f4; background: #f7f9fb; color: #536274; font-size: 10px; white-space: nowrap; }
.planning-category { position: sticky; left: 0; z-index: 2; display: flex; min-height: 52px; align-items: stretch; border-right: 1px solid #e7ebf0; border-bottom: 1px solid #e7ebf0; background: #fff; }
.planning-category-trigger { width: 100%; min-width: 0; padding: 0 10px; border: 0; color: #334155; background: transparent; font: inherit; font-size: 12px; font-weight: 600; text-align: left; text-overflow: ellipsis; white-space: nowrap; overflow: hidden; cursor: pointer; }
.planning-category-trigger:hover, .planning-category-trigger:focus-visible { color: #1265d6; background: #edf5ff; outline: none; }
.planning-cell { display: flex; min-height: 52px; align-items: center; justify-content: center; border-right: 1px solid #edf0f4; border-bottom: 1px solid #e7ebf0; background: #fff; }
.metric-cell { display: flex; align-items: center; padding: 0 3px; }
.planning-number { width: 100%; }
.date-number { padding: 0 2px; }
.metric-number { width: 100%; }
.planning-number :deep(.el-input__wrapper) { min-height: 30px; padding: 0 4px; box-shadow: none; background: transparent; }
.planning-number :deep(.el-input__wrapper:hover), .planning-number :deep(.el-input__wrapper.is-focus) { box-shadow: inset 0 0 0 1px #b8d5fa; background: #fff; }
.planning-number :deep(.el-input__inner) { text-align: center; font-size: 10px; }
.metric-number :deep(.el-input__inner) { text-align: left; }
.planning-number :deep(.el-input__suffix-inner) { color: #8290a2; font-size: 9px; }
@media (max-width: 640px) {
  .planning-heading { align-items: flex-start; flex-direction: column; }
  .planning-actions { width: 100%; flex-wrap: wrap; }
  .planning-scroll { max-height: calc(100vh - 260px); }
}
.planning-table-panel { border-color: var(--ui-border); border-radius: var(--ui-radius-lg); box-shadow: var(--ui-shadow-xs); }
.planning-corner, .planning-date, .planning-metric-header { background: var(--ui-surface-muted); }
</style>
