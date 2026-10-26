<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Search } from '@element-plus/icons-vue'

const logs = ref([])
const loading = ref(false)
const searchText = ref('')
const dateRange = ref([])
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)

async function loadLogs() {
  loading.value = true
  try {
    const params = new URLSearchParams({ page: String(page.value), pageSize: String(pageSize.value) })
    if (searchText.value.trim()) params.set('search', searchText.value.trim())
    if (dateRange.value?.[0]) params.set('from', dateRange.value[0])
    if (dateRange.value?.[1]) params.set('to', dateRange.value[1])
    const response = await fetch(`/api/system-logs?${params}`)
    const result = await response.json()
    if (!response.ok) throw new Error(result.message || '日志加载失败')
    logs.value = Array.isArray(result.data) ? result.data : []
    total.value = Number(result.total || 0)
  } catch (error) {
    ElMessage.error(error.message || '日志加载失败')
  } finally {
    loading.value = false
  }
}

function searchLogs() {
  page.value = 1
  loadLogs()
}

function formatTime(value) {
  return value ? String(value).replace('T', ' ').slice(0, 19) : '—'
}

onMounted(loadLogs)
</script>

<template>
  <section class="system-log-page">
    <section class="system-log-heading"><h1>系统日志</h1></section>
    <section class="system-log-panel" aria-label="系统操作日志">
      <div class="system-log-toolbar">
        <div class="system-log-filters">
          <el-input v-model="searchText" clearable class="system-log-search" placeholder="搜索操作者 / 操作内容 / 接口" @keyup.enter="searchLogs">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <el-date-picker v-model="dateRange" type="daterange" value-format="YYYY-MM-DD" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" clearable class="system-log-date" @change="searchLogs" />
          <el-button type="primary" plain :disabled="loading" @click="searchLogs"><el-icon><Search /></el-icon>查询</el-button>
          <el-button title="刷新日志" aria-label="刷新日志" :disabled="loading" @click="loadLogs"><el-icon><Refresh /></el-icon>刷新</el-button>
        </div>
        <span class="system-log-total">共 {{ total }} 条</span>
      </div>
      <div class="system-log-table-wrap">
        <el-table v-loading="loading" :data="logs" row-key="id" class="system-log-table">
          <el-table-column label="操作时间" min-width="180"><template #default="scope">{{ formatTime(scope.row.created_at) }}</template></el-table-column>
          <el-table-column label="操作人" min-width="150">
            <template #default="scope"><div class="system-log-actor"><strong>{{ scope.row.actor_account || '系统' }}</strong><span>{{ scope.row.actor_position || '—' }}</span></div></template>
          </el-table-column>
          <el-table-column label="操作内容" min-width="280">
            <template #default="scope">
              <div class="system-log-action"><strong>{{ scope.row.action }}</strong>
                <small v-if="scope.row.details">{{ scope.row.details }}</small>
                <el-popover v-if="scope.row.details" placement="bottom-start" trigger="click" width="460">
                  <template #reference><el-button link type="primary" class="system-log-detail-button">查看完整明细</el-button></template>
                  <div class="system-log-detail-content">{{ scope.row.details }}</div>
                </el-popover>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="请求" min-width="250" show-overflow-tooltip>
            <template #default="scope"><span class="system-log-method">{{ scope.row.method }}</span>{{ scope.row.request_path }}</template>
          </el-table-column>
          <el-table-column label="结果" width="100" align="center">
            <template #default="scope"><el-tag :type="scope.row.status_code < 400 ? 'success' : 'danger'" effect="plain">{{ scope.row.status_code < 400 ? '成功' : '失败' }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="ip_address" label="IP 地址" min-width="140" show-overflow-tooltip />
          <template #empty><el-empty description="暂无操作日志" :image-size="72" /></template>
        </el-table>
      </div>
      <div class="system-log-pagination">
        <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[20, 50, 100]" :total="total" layout="total, sizes, prev, pager, next" @size-change="searchLogs" @current-change="loadLogs" />
      </div>
    </section>
  </section>
</template>

<style scoped>
.system-log-page{min-width:0}.system-log-heading{margin-bottom:16px}.system-log-heading h1{color:#202a38;font-size:22px;font-weight:650}.system-log-panel{padding:20px 22px;border:1px solid #e5eaf0;border-radius:8px;background:#fff}.system-log-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px}.system-log-filters{display:flex;min-width:0;align-items:center;gap:10px}.system-log-search{width:300px}.system-log-date{width:290px}.system-log-total{flex:none;color:#8793a5;font-size:13px}.system-log-table-wrap{width:100%;overflow-x:auto}.system-log-table{width:100%;min-width:920px}.system-log-actor{display:flex;flex-direction:column;gap:3px}.system-log-actor strong{color:#27364b;font-weight:600}.system-log-actor span{color:#8a96a8;font-size:12px}.system-log-method{display:inline-block;min-width:50px;margin-right:6px;color:#7e8ba0;font-size:12px}.system-log-pagination{display:flex;justify-content:flex-end;margin-top:16px}@media(max-width:760px){.system-log-panel{padding:16px 12px}.system-log-toolbar{align-items:flex-start;flex-direction:column}.system-log-filters{width:100%;flex-wrap:wrap}.system-log-search,.system-log-date{width:100%}.system-log-pagination{justify-content:center;overflow-x:auto}}
.system-log-panel { border-color: var(--ui-border); border-radius: var(--ui-radius-lg); box-shadow: var(--ui-shadow-xs); }
.system-log-table :deep(.el-table__header-wrapper th) { background: var(--ui-surface-muted) !important; }
</style>
