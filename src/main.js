import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import './style.css'
import App from './App.vue'
import router from './router/index.js'

const originalFetch = window.fetch.bind(window)
window.fetch = async (input, init = {}) => {
  const token = localStorage.getItem('appAuthToken') || sessionStorage.getItem('appAuthToken')
  const url = typeof input === 'string' ? input : input.url
  const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined))
  if (token && url.includes('/api/') && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)
  const response = await originalFetch(input, { ...init, headers })
  if (response.status === 401 && url.includes('/api/') && !url.includes('/api/auth/')) {
    localStorage.removeItem('appAuthToken')
    localStorage.removeItem('appAuthUser')
    sessionStorage.removeItem('appAuthToken')
    sessionStorage.removeItem('appAuthUser')
    if (router.currentRoute.value.path !== '/login') router.push({ path: '/login', query: { redirect: router.currentRoute.value.fullPath } })
  }
  return response
}

const app = createApp(App)
app.use(ElementPlus, { locale: zhCn }).use(router).mount('#app')
