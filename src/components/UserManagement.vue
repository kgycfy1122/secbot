<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Edit, Plus, Refresh, Search } from '@element-plus/icons-vue'

const users = ref([])
const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const formRef = ref()
const searchText = ref('')
const roleFilter = ref('')
const statusFilter = ref('')
const editingUser = ref(null)
const positionOptions = ['设计师', '设计师助理', '管理员', '纸样师', '车板师']
const currentUserId = computed(() => {
  try { return Number(JSON.parse(localStorage.getItem('appAuthUser') || sessionStorage.getItem('appAuthUser') || '{}').id) }
  catch { return 0 }
})
const form = reactive({ account: '', password: '', position: '', designer_user_id: null })
const designerUsers = computed(() => users.value.filter((user) => user.position === '设计师' && user.is_active))
const filteredUsers = computed(() => users.value.filter((user) => {
  const search = searchText.value.trim().toLocaleLowerCase()
  const matchesSearch = !search || `${user.account} ${user.position}`.toLocaleLowerCase().includes(search)
  const matchesRole = !roleFilter.value || user.role === roleFilter.value
  const matchesStatus = !statusFilter.value || (statusFilter.value === 'active') === Boolean(user.is_active)
  return matchesSearch && matchesRole && matchesStatus
}))
const rules = {
  account: [
    { required: true, message: '请输入登录账号', trigger: 'blur' },
    { min: 2, max: 80, message: '账号长度为 2 至 80 个字符', trigger: 'blur' },
  ],
  password: [
    {
      validator: (_rule, value, callback) => {
        if (!editingUser.value && !value) return callback(new Error('请输入登录密码'))
        if (value && (value.length < 8 || value.length > 200)) return callback(new Error('密码长度为 8 至 200 个字符'))
        callback()
      },
      trigger: 'blur',
    },
  ],
  position: [
    { required: true, message: '请输入用户职位', trigger: 'blur' },
    { validator: (_rule, value, callback) => positionOptions.includes(value) || value === editingUser.value?.position ? callback() : callback(new Error('请选择用户职位')), trigger: 'change' },
  ],
}

async function readResponse(response) {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.message || '请求失败')
  return body
}

async function loadUsers() {
  loading.value = true
  try {
    const response = await fetch('/api/users')
    const result = await readResponse(response)
    users.value = Array.isArray(result.data) ? result.data : []
  } catch (error) {
    ElMessage.error(error.message || '用户列表加载失败')
  } finally {
    loading.value = false
  }
}

function openCreateDialog() {
  editingUser.value = null
  Object.assign(form, { account: '', password: '', position: '', designer_user_id: null })
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

function openEditDialog(user) {
  editingUser.value = user
  Object.assign(form, { account: user.account, password: '', position: user.position, designer_user_id: user.designer_user_id || null })
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

function handlePositionChange(position) {
  if (position !== '设计师助理') form.designer_user_id = null
}

async function saveUser() {
  if (saving.value) return
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  saving.value = true
  try {
    const editing = editingUser.value
    const response = await fetch(editing ? `/api/users/${editing.id}` : '/api/users', {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const saved = await readResponse(response)
    if (editing) {
      const index = users.value.findIndex((user) => user.id === saved.id)
      if (index >= 0) users.value.splice(index, 1, saved)
      const storedUser = JSON.parse(localStorage.getItem('appAuthUser') || sessionStorage.getItem('appAuthUser') || '{}')
      if (Number(storedUser.id) === Number(saved.id)) {
        storedUser.account = saved.account
        storedUser.position = saved.position
        const storage = localStorage.getItem('appAuthUser') ? localStorage : sessionStorage
        storage.setItem('appAuthUser', JSON.stringify(storedUser))
        window.location.reload()
        return
      }
    } else users.value.push(saved)
    dialogVisible.value = false
    ElMessage.success(editing ? '用户信息已保存' : '用户已创建')
  } catch (error) {
    ElMessage.error(error.message || '用户信息保存失败')
  } finally {
    saving.value = false
  }
}

async function toggleUserStatus(user, isActive) {
  try {
    const response = await fetch(`/api/users/${user.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: isActive }),
    })
    const updated = await readResponse(response)
    const index = users.value.findIndex((item) => item.id === updated.id)
    if (index >= 0) users.value.splice(index, 1, updated)
    ElMessage.success(isActive ? '账号已启用' : '账号已停用')
  } catch (error) {
    user.is_active = !isActive
    ElMessage.error(error.message || '账号状态更新失败')
  }
}

function formatCreatedAt(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

onMounted(loadUsers)
</script>

<template>
  <section class="user-management-page">
    <section class="user-management-heading"><h1>用户管理</h1></section>

    <section class="user-management-panel" aria-label="用户列表">
      <div class="user-management-toolbar">
        <div class="user-management-filters">
          <el-input v-model="searchText" clearable class="user-search" placeholder="搜索账号 / 职位">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <el-select v-model="roleFilter" clearable placeholder="全部权限" class="user-role-filter">
            <el-option label="超级管理员" value="super_admin" />
            <el-option label="普通用户" value="user" />
          </el-select>
          <el-select v-model="statusFilter" clearable placeholder="全部状态" class="user-status-filter">
            <el-option label="启用" value="active" />
            <el-option label="停用" value="inactive" />
          </el-select>
          <el-button title="刷新用户" aria-label="刷新用户" :disabled="loading" @click="loadUsers"><el-icon><Refresh /></el-icon>刷新</el-button>
        </div>
        <el-button type="primary" class="user-create-button" @click="openCreateDialog"><el-icon><Plus /></el-icon>新增账号</el-button>
      </div>

      <div class="user-management-table-wrap">
        <el-table v-loading="loading" :data="filteredUsers" row-key="id" class="user-management-table" @row-click="openEditDialog">
        <el-table-column prop="account" label="账号" min-width="220" />
        <el-table-column prop="position" label="职位" min-width="200" />
        <el-table-column label="绑定设计师" min-width="180"><template #default="scope">{{ scope.row.position === '设计师助理' ? (scope.row.designer_name || '—') : '—' }}</template></el-table-column>
        <el-table-column label="权限" width="160">
          <template #default="scope">
            <el-tag :type="scope.row.role === 'super_admin' ? 'danger' : 'info'" effect="plain">
              {{ scope.row.role === 'super_admin' ? '超级管理员' : '普通用户' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="220">
          <template #default="scope">{{ formatCreatedAt(scope.row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="scope">
            <el-switch
              :model-value="Boolean(scope.row.is_active)"
              :disabled="scope.row.role === 'super_admin' || Number(scope.row.id) === currentUserId"
              active-text="启用"
              inactive-text="停用"
              inline-prompt
              @click.stop
              @change="toggleUserStatus(scope.row, $event)"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="scope">
            <el-button text type="primary" @click.stop="openEditDialog(scope.row)"><el-icon><Edit /></el-icon>编辑</el-button>
          </template>
        </el-table-column>
          <template #empty><el-empty :description="users.length ? '没有符合条件的用户' : '暂无用户'" :image-size="72" /></template>
        </el-table>
      </div>
    </section>

    <el-dialog v-model="dialogVisible" :title="editingUser ? '编辑用户' : '新增账号'" width="560px" class="user-create-dialog" :close-on-click-modal="false">
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="user-create-form" @submit.prevent="saveUser">
        <el-form-item label="账号" prop="account">
          <el-input v-model="form.account" maxlength="80" autocomplete="off" placeholder="请输入登录账号" />
        </el-form-item>
        <el-form-item label="职位" prop="position">
          <el-select v-model="form.position" class="user-position-select" placeholder="请选择职位" @change="handlePositionChange">
            <el-option v-for="position in positionOptions" :key="position" :label="position" :value="position" />
            <el-option v-if="editingUser && !positionOptions.includes(editingUser.position)" :label="editingUser.position" :value="editingUser.position" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.position === '设计师助理'" label="绑定设计师" prop="designer_user_id">
          <el-select v-model="form.designer_user_id" clearable filterable class="user-position-select" placeholder="请选择关联设计师">
            <el-option v-for="designer in designerUsers" :key="designer.id" :label="designer.account" :value="designer.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="editingUser ? '重置密码（选填）' : '初始密码'" prop="password" class="user-password-field">
          <el-input v-model="form.password" type="password" maxlength="200" show-password autocomplete="new-password" :placeholder="editingUser ? '留空则不修改密码' : '至少 8 个字符'" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveUser">{{ editingUser ? '保存修改' : '创建' }}</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.user-management-page{min-width:0}.user-management-heading{margin-bottom:16px}.user-management-heading h1{color:#202a38;font-size:22px;font-weight:650}.user-management-panel{padding:20px 22px;border:1px solid #e5eaf0;border-radius:8px;background:#fff}.user-management-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px}.user-management-filters{display:flex;min-width:0;align-items:center;gap:10px}.user-search{width:240px}.user-role-filter,.user-status-filter{width:140px}.user-create-button{margin-left:auto}.user-management-table-wrap{width:100%;overflow-x:auto}.user-management-table{width:100%;min-width:800px}.user-management-table :deep(.el-table__row){cursor:pointer}.user-create-dialog :deep(.el-dialog__body){padding-top:8px}.user-create-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 16px}.user-create-form :deep(.el-form-item__label){padding-bottom:6px;color:#475569;font-weight:600}.user-create-form :deep(.el-select){width:100%}.user-password-field{grid-column:1/-1}@media(max-width:700px){.user-management-toolbar{align-items:stretch;flex-direction:column}.user-management-filters{flex-wrap:wrap}.user-search{width:100%}.user-role-filter,.user-status-filter{flex:1}.user-create-button{align-self:flex-end}.user-management-panel{padding:16px 12px}.user-create-form{grid-template-columns:1fr}.user-password-field{grid-column:auto}}
.user-management-panel { border-color: var(--ui-border); border-radius: var(--ui-radius-lg); box-shadow: var(--ui-shadow-xs); }
.user-management-table :deep(.el-table__header-wrapper th) { background: var(--ui-surface-muted) !important; }
</style>
