import { createRouter, createWebHistory } from 'vue-router'
import Backend from '@/components/BackendLayout.vue'
import LoginView from '@/components/LoginView.vue'

const routes = [
  {
    path: '/login',
    component: LoginView,
  },
  {
    path: '/back',
    component: Backend,
  },
  {
    path: '/back/products',
    component: Backend,
  },
  {
    path: '/back/products/:id',
    component: Backend,
  },
  {
    path: '/back/patterns',
    component: Backend,
  },
  {
    path: '/back/matching',
    redirect: '/back/products?style_view=all',
  },
  {
    path: '/back/category-planning',
    component: Backend,
  },
  {
    path: '/back/users',
    component: Backend,
  },
  {
    path: '/back/system-logs',
    component: Backend,
  },
  {
    path: '/back/announcements',
    component: Backend,
  },
  {
    path: '/back/patterns/:id',
    component: Backend,
  },
  {
    path: '/',
    redirect: '/back',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  const token = localStorage.getItem('appAuthToken') || sessionStorage.getItem('appAuthToken')
  let user = {}
  try { user = JSON.parse(localStorage.getItem('appAuthUser') || sessionStorage.getItem('appAuthUser') || '{}') } catch {}
  if (to.path.startsWith('/back') && !token) return { path: '/login', query: { redirect: to.fullPath } }
  if (to.path === '/back/users' && user.role !== 'super_admin') return '/back'
  if (to.path === '/back/system-logs' && user.role !== 'super_admin') return '/back'
  if (to.path === '/back/announcements' && user.role !== 'super_admin') return '/back'
  if (to.path === '/login' && token) return '/back'
  return true
})

export default router
