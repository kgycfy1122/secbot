<script setup>
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowRight, Lock, User, View, Hide } from '@element-plus/icons-vue'
import { useRoute, useRouter } from 'vue-router'

const formRef = ref()
const route = useRoute()
const router = useRouter()
const revealPassword = ref(false)
const submitting = ref(false)
const heroImageUrl = '/uploads/reference-1791361787987-syres3.jpg'
const form = reactive({ account: localStorage.getItem('loginAccount') || '', password: '', remember: true })
const rules = {
  account: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

async function submitLogin() {
  if (submitting.value) return
  try {
    await formRef.value.validate()
  } catch {
    return
  }

  submitting.value = true
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account: form.account, password: form.password }),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.message || '登录失败')

    localStorage.removeItem('appAuthToken')
    localStorage.removeItem('appAuthUser')
    sessionStorage.removeItem('appAuthToken')
    sessionStorage.removeItem('appAuthUser')
    const storage = form.remember ? localStorage : sessionStorage
    storage.setItem('appAuthToken', result.token)
    storage.setItem('appAuthUser', JSON.stringify(result.user))
    if (form.remember) localStorage.setItem('loginAccount', form.account)
    else localStorage.removeItem('loginAccount')
    await router.replace(typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/back') ? route.query.redirect : '/back')
  } catch (error) {
    ElMessage.error(error.message || '登录失败，请检查服务连接')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="login-page">
    <section class="login-visual" aria-label="款式展示">
      <img :src="heroImageUrl" alt="秋冬服装款式展示" />
      <div class="visual-shade"></div>
      <div class="visual-brand">
        <div class="brand-mark">款</div>
        <div>
          <strong>款式管理</strong>
          <span>STYLE WORKSPACE</span>
        </div>
      </div>
      <div class="visual-caption">
        <span>COLLECTION · 2026</span>
        <h1>让每一款，<br />都有迹可循。</h1>
      </div>
      <span class="visual-credit">PRODUCT CATALOG</span>
    </section>

    <section class="login-panel">
      <div class="login-content">
        <div class="mobile-brand"><span class="brand-mark">款</span><strong>款式管理</strong></div>
        <div class="login-heading">
          <span class="heading-kicker">WORKSPACE ACCESS</span>
          <h2>欢迎回来</h2>
          <p>登录你的工作空间</p>
        </div>

        <el-form ref="formRef" :model="form" :rules="rules" class="login-form" @submit.prevent="submitLogin">
          <el-form-item prop="account">
            <label class="field-label" for="login-account">账号</label>
            <el-input id="login-account" v-model="form.account" size="large" placeholder="请输入账号" autocomplete="username">
              <template #prefix><el-icon><User /></el-icon></template>
            </el-input>
          </el-form-item>

          <el-form-item prop="password">
            <label class="field-label" for="login-password">密码</label>
            <el-input id="login-password" v-model="form.password" size="large" :type="revealPassword ? 'text' : 'password'" placeholder="请输入密码" autocomplete="current-password" @keyup.enter="submitLogin">
              <template #prefix><el-icon><Lock /></el-icon></template>
              <template #suffix>
                <button class="password-toggle" type="button" :aria-label="revealPassword ? '隐藏密码' : '显示密码'" @click="revealPassword = !revealPassword">
                  <el-icon><View v-if="!revealPassword" /><Hide v-else /></el-icon>
                </button>
              </template>
            </el-input>
          </el-form-item>

          <div class="login-options">
            <el-checkbox v-model="form.remember">记住账号</el-checkbox>
          </div>

          <el-button class="login-submit" type="primary" size="large" :loading="submitting" @click="submitLogin">
            <span>登录</span><el-icon><ArrowRight /></el-icon>
          </el-button>
        </el-form>
        <div class="login-footer"><span></span><small>款式管理工作空间</small><span></span></div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.login-page { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(420px, .9fr); background: #fff; }
.login-visual { position: relative; min-height: 100vh; overflow: hidden; color: #fff; background: #364139; }
.login-visual > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 38%; }
.visual-shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(17, 24, 22, .35), transparent 37%, rgba(17, 24, 22, .62)); }
.visual-brand { position: absolute; top: 42px; left: 48px; display: flex; align-items: center; gap: 12px; }
.brand-mark { width: 38px; height: 38px; display: grid; place-items: center; border-radius: 8px; color: #fff; background: #e4775c; font-size: 18px; font-weight: 700; }
.visual-brand > div:last-child { display: flex; flex-direction: column; gap: 3px; }
.visual-brand strong { font-size: 15px; font-weight: 600; }
.visual-brand span { color: rgba(255,255,255,.7); font-size: 9px; }
.visual-caption { position: absolute; right: 48px; bottom: 92px; left: 48px; }
.visual-caption > span, .heading-kicker { color: #d9b6a9; font-size: 10px; font-weight: 700; letter-spacing: 1.6px; }
.visual-caption h1 { margin-top: 13px; color: #fff; font-size: 38px; line-height: 1.45; font-weight: 500; }
.visual-credit { position: absolute; right: 48px; bottom: 34px; color: rgba(255,255,255,.7); font-size: 9px; letter-spacing: 1.4px; }
.login-panel { display: grid; min-height: 100vh; place-items: center; padding: 48px; }
.login-content { width: min(100%, 380px); }
.login-heading { margin-bottom: 35px; }
.heading-kicker { color: #d17b65; }
.login-heading h2 { margin: 12px 0 8px; color: #202a38; font-size: 28px; font-weight: 650; }
.login-heading p { color: #8b96a5; font-size: 13px; }
.login-form :deep(.el-form-item) { display: block; margin-bottom: 22px; }
.login-form :deep(.el-form-item__content) { display: block; line-height: normal; }
.field-label { display: block; margin-bottom: 9px; color: #394555; font-size: 13px; font-weight: 600; }
.login-form :deep(.el-input__wrapper) { min-height: 46px; padding: 0 13px; box-shadow: 0 0 0 1px #e2e7ed inset; }
.login-form :deep(.el-input__wrapper.is-focus) { box-shadow: 0 0 0 1px #e4775c inset; }
.login-form :deep(.el-input__prefix-inner) { color: #9aa5b3; }
.login-form :deep(.el-input__inner) { font-size: 13px; }
.login-form :deep(.el-input__inner::placeholder) { color: #a7b0bb; }
.password-toggle { display: grid; width: 28px; height: 28px; place-items: center; padding: 0; border: 0; color: #98a2af; background: transparent; }
.password-toggle:hover { color: #526071; }
.login-options { display: flex; align-items: center; justify-content: space-between; margin: 2px 0 26px; }
.login-options :deep(.el-checkbox__label) { color: #697586; font-size: 12px; }
.login-options :deep(.el-checkbox__input.is-checked .el-checkbox__inner) { border-color: #e4775c; background: #e4775c; }
.login-submit { width: 100%; height: 46px; justify-content: center; gap: 9px; border: 0; border-radius: 5px; background: #e4775c; font-size: 14px; font-weight: 600; }
.login-submit:hover { background: #cf654d; }
.login-footer { display: flex; align-items: center; gap: 12px; margin-top: 48px; color: #a3acb7; }
.login-footer span { height: 1px; flex: 1; background: #edf0f3; }
.login-footer small { font-size: 10px; }
.mobile-brand { display: none; }
@media (max-width: 760px) {
  .login-page { grid-template-columns: 1fr; }
  .login-visual { display: none; }
  .login-panel { min-height: 100vh; padding: 30px 24px; }
  .login-content { width: min(100%, 390px); }
  .mobile-brand { display: flex; align-items: center; gap: 10px; margin-bottom: 58px; color: #202a38; font-size: 14px; }
  .mobile-brand .brand-mark { width: 34px; height: 34px; font-size: 16px; }
  .login-heading h2 { font-size: 25px; }
}
</style>
