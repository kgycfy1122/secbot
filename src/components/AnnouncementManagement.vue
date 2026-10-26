<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Bell, Delete, Plus, Refresh, Search } from '@element-plus/icons-vue'

const announcements = ref([])
const loading = ref(false)
const saving = ref(false)
const searchText = ref('')
const statusFilter = ref('')
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const dialogVisible = ref(false)
const editingAnnouncement = ref(null)
const formRef = ref()
const form = reactive({ title: '', content: '', status: 'draft' })
const rules = {
  title: [{ required: true, message: '请输入公告标题', trigger: 'blur' }, { max: 200, message: '标题不能超过 200 个字符', trigger: 'blur' }],
  content: [{ required: true, message: '请输入公告内容', trigger: 'blur' }, { max: 10000, message: '内容不能超过 10000 个字符', trigger: 'blur' }],
}

async function readResponse(response) {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.message || '请求失败')
  return body
}

async function loadAnnouncements() {
  loading.value = true
  try {
    const params = new URLSearchParams({ page: String(page.value), pageSize: String(pageSize.value) })
    if (searchText.value.trim()) params.set('search', searchText.value.trim())
    if (statusFilter.value) params.set('status', statusFilter.value)
    const result = await readResponse(await fetch(`/api/announcements?${params}`))
    announcements.value = Array.isArray(result.data) ? result.data : []
    total.value = Number(result.total || 0)
  } catch (error) {
    ElMessage.error(error.message || '公告加载失败')
  } finally {
    loading.value = false
  }
}

function searchAnnouncements() {
  page.value = 1
  loadAnnouncements()
}

function formatTime(value) {
  return value ? String(value).replace('T', ' ').slice(0, 16) : '—'
}

function openCreateDialog() {
  editingAnnouncement.value = null
  Object.assign(form, { title: '', content: '', status: 'draft' })
  dialogVisible.value = true
  requestAnimationFrame(() => formRef.value?.clearValidate())
}

function openEditDialog(row) {
  editingAnnouncement.value = row
  Object.assign(form, { title: row.title || '', content: row.content || '', status: row.status || 'draft' })
  dialogVisible.value = true
  requestAnimationFrame(() => formRef.value?.clearValidate())
}

async function saveAnnouncement() {
  if (saving.value) return
  try { await formRef.value.validate() } catch { return }
  saving.value = true
  try {
    const id = editingAnnouncement.value?.id
    const result = await readResponse(await fetch(id ? `/api/announcements/${id}` : '/api/announcements', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    }))
    if (id) {
      const index = announcements.value.findIndex((item) => item.id === result.id)
      if (index >= 0) announcements.value.splice(index, 1, result)
    } else {
      announcements.value.unshift(result)
      total.value += 1
    }
    dialogVisible.value = false
    ElMessage.success(id ? '公告已保存' : '公告已创建')
  } catch (error) {
    ElMessage.error(error.message || '公告保存失败')
  } finally {
    saving.value = false
  }
}

async function toggleStatus(row) {
  const nextStatus = row.status === 'published' ? 'draft' : 'published'
  try {
    const action = nextStatus === 'published' ? '发布' : '撤回'
    await ElMessageBox.confirm(`确定${action}“${row.title}”吗？`, `${action}公告`, { type: nextStatus === 'published' ? 'success' : 'warning' })
    const result = await readResponse(await fetch(`/api/announcements/${row.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    }))
    Object.assign(row, result)
    ElMessage.success(`公告已${action}`)
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.message || '公告状态更新失败')
  }
}

async function removeAnnouncement(row) {
  try {
    await ElMessageBox.confirm(`删除后无法恢复，确定删除“${row.title}”吗？`, '删除公告', { type: 'warning' })
    await readResponse(await fetch(`/api/announcements/${row.id}`, { method: 'DELETE' }))
    announcements.value = announcements.value.filter((item) => item.id !== row.id)
    total.value = Math.max(0, total.value - 1)
    ElMessage.success('公告已删除')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.message || '公告删除失败')
  }
}

onMounted(loadAnnouncements)
</script>

<template>
  <section class="announcement-page">
    <section class="page-heading announcement-heading">
      <div><h1>公告管理</h1></div>
      <el-button type="primary" @click="openCreateDialog"><el-icon><Plus /></el-icon>新建公告</el-button>
    </section>

    <section class="panel announcement-panel" aria-label="公告列表">
      <div class="announcement-toolbar">
        <div class="announcement-filters">
          <el-input v-model="searchText" clearable class="announcement-search" placeholder="搜索公告标题或内容" @keyup.enter="searchAnnouncements" @clear="searchAnnouncements">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <el-select v-model="statusFilter" clearable class="announcement-status" placeholder="全部状态" @change="searchAnnouncements">
            <el-option label="草稿" value="draft" /><el-option label="已发布" value="published" />
          </el-select>
          <el-button type="primary" plain :disabled="loading" @click="searchAnnouncements"><el-icon><Search /></el-icon>查询</el-button>
          <el-button title="刷新公告" aria-label="刷新公告" :disabled="loading" @click="loadAnnouncements"><el-icon><Refresh /></el-icon>刷新</el-button>
        </div>
        <span class="announcement-total">共 {{ total }} 条</span>
      </div>

      <div class="announcement-table-wrap">
        <el-table v-loading="loading" :data="announcements" row-key="id" class="announcement-table" @row-click="openEditDialog">
          <el-table-column label="公告" min-width="340">
            <template #default="scope"><div class="announcement-title-cell"><el-icon><Bell /></el-icon><div><strong>{{ scope.row.title }}</strong><span>{{ scope.row.content }}</span></div></div></template>
          </el-table-column>
          <el-table-column label="状态" width="110"><template #default="scope"><el-tag :type="scope.row.status === 'published' ? 'success' : 'info'" effect="plain">{{ scope.row.status === 'published' ? '已发布' : '草稿' }}</el-tag></template></el-table-column>
          <el-table-column prop="created_by_account" label="创建人" width="120" />
          <el-table-column label="发布时间" min-width="170"><template #default="scope">{{ formatTime(scope.row.published_at) }}</template></el-table-column>
          <el-table-column label="更新时间" min-width="170"><template #default="scope">{{ formatTime(scope.row.updated_at) }}</template></el-table-column>
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="scope">
              <div class="announcement-actions" @click.stop>
                <el-button text :type="scope.row.status === 'published' ? 'warning' : 'success'" @click="toggleStatus(scope.row)">{{ scope.row.status === 'published' ? '撤回' : '发布' }}</el-button>
                <el-button text type="danger" @click="removeAnnouncement(scope.row)"><el-icon><Delete /></el-icon>删除</el-button>
              </div>
            </template>
          </el-table-column>
          <template #empty><el-empty description="暂无公告" :image-size="72" /></template>
        </el-table>
      </div>
      <div class="announcement-pagination"><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[20, 50, 100]" :total="total" layout="total, sizes, prev, pager, next" @size-change="loadAnnouncements" @current-change="loadAnnouncements" /></div>
    </section>

    <el-dialog v-model="dialogVisible" :title="editingAnnouncement ? '编辑公告' : '新建公告'" width="620px" class="announcement-dialog" :close-on-click-modal="false">
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="announcement-form" @submit.prevent="saveAnnouncement">
        <el-form-item label="公告标题" prop="title"><el-input v-model="form.title" maxlength="200" show-word-limit placeholder="请输入公告标题" /></el-form-item>
        <el-form-item label="公告内容" prop="content"><el-input v-model="form.content" type="textarea" :rows="8" maxlength="10000" show-word-limit placeholder="请输入公告内容" /></el-form-item>
        <el-form-item label="发布状态" prop="status"><el-radio-group v-model="form.status"><el-radio value="draft">保存为草稿</el-radio><el-radio value="published">立即发布</el-radio></el-radio-group></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="saveAnnouncement">保存公告</el-button></template>
    </el-dialog>
  </section>
</template>

<style scoped>
.announcement-page{min-width:0}.announcement-heading{align-items:center;margin-bottom:18px}.announcement-heading h1{color:#111827;font-size:24px;font-weight:700}.announcement-panel{padding:20px 22px;border-color:var(--ui-border);border-radius:var(--ui-radius-lg);box-shadow:var(--ui-shadow-xs)}.announcement-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px}.announcement-filters{display:flex;min-width:0;align-items:center;gap:10px}.announcement-search{width:300px}.announcement-status{width:140px}.announcement-total{flex:none;color:#64748b;font-size:13px}.announcement-table-wrap{width:100%;overflow-x:auto}.announcement-table{width:100%;min-width:980px}.announcement-table :deep(.el-table__header-wrapper th){background:var(--ui-surface-muted)!important}.announcement-table :deep(td.el-table__cell){vertical-align:middle}.announcement-table :deep(.el-table__row){cursor:pointer}.announcement-title-cell{display:flex;align-items:flex-start;gap:10px;min-width:0}.announcement-title-cell>.el-icon{flex:none;margin-top:2px;color:#1677ff}.announcement-title-cell>div{display:flex;min-width:0;flex-direction:column;gap:4px}.announcement-title-cell strong{overflow:hidden;color:#27364b;font-weight:600;text-overflow:ellipsis;white-space:nowrap}.announcement-title-cell span{display:-webkit-box;overflow:hidden;color:#64748b;font-size:12px;line-height:1.45;-webkit-box-orient:vertical;-webkit-line-clamp:2}.announcement-actions{display:flex;align-items:center;justify-content:flex-start;gap:4px;flex-wrap:nowrap;white-space:nowrap}.announcement-actions :deep(.el-button){margin:0!important;padding:4px 5px}.announcement-pagination{display:flex;justify-content:flex-end;margin-top:16px}.announcement-form :deep(.el-form-item__label){padding-bottom:6px;color:#475569;font-weight:600}.announcement-form :deep(.el-input__wrapper),.announcement-form :deep(.el-textarea__inner){border-radius:var(--ui-radius-md)}.announcement-dialog :deep(.el-dialog){border-radius:var(--ui-radius-lg)}@media(max-width:760px){.announcement-toolbar{align-items:stretch;flex-direction:column}.announcement-filters{flex-wrap:wrap}.announcement-search{width:100%}.announcement-status{flex:1}.announcement-total{align-self:flex-end}.announcement-panel{padding:16px 12px}.announcement-pagination{justify-content:center;overflow-x:auto}}
</style>
