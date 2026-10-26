<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowLeft, ArrowRight, Close, Plus } from '@element-plus/icons-vue'
import { getAuthHeaders } from '../auth.js'

const props = defineProps({
  modelValue: { type: [String, Array], default: '' },
  label: { type: String, default: 'Image' },
  size: { type: Number, default: 150 },
  viewOnly: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])
const uploadingCount = ref(0)
const currentIndex = ref(0)
const previewVisible = ref(false)
const previewIndex = ref(0)
const uploadPopoverOpen = ref(false)
const removingImage = ref(false)
const fileInput = ref(null)
const uploadControl = ref(null)
const referenceElement = ref(null)
const uploadPanel = ref(null)
const recentUploadUrls = ref([])
const uploading = computed(() => uploadingCount.value > 0)
const uploadHeaders = getAuthHeaders()
let removeImageTimer = null

function parseImages(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String)
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String)
  } catch {
    // Legacy values are stored as a single URL.
  }
  return [value]
}

const images = computed(() => parseImages(props.modelValue))
const previewSize = computed(() => `${props.size}px`)

watch(() => props.modelValue, () => { recentUploadUrls.value = [] })

function showPrevious() {
  if (images.value.length < 2) return
  currentIndex.value = (currentIndex.value - 1 + images.value.length) % images.value.length
}

function showNext() {
  if (images.value.length < 2) return
  currentIndex.value = (currentIndex.value + 1) % images.value.length
}

function openPreview() {
  previewIndex.value = currentIndex.value
  previewVisible.value = true
}

function showPreviewPrevious() {
  if (images.value.length < 2) return
  previewIndex.value = (previewIndex.value - 1 + images.value.length) % images.value.length
  currentIndex.value = previewIndex.value
}

function showPreviewNext() {
  if (images.value.length < 2) return
  previewIndex.value = (previewIndex.value + 1) % images.value.length
  currentIndex.value = previewIndex.value
}

function handlePreviewKeydown(event) {
  if (!previewVisible.value) return
  if (event.key === 'ArrowLeft') showPreviewPrevious()
  else if (event.key === 'ArrowRight') showPreviewNext()
  else if (event.key === 'Escape') previewVisible.value = false
}

function isSupportedImage(file) {
  return ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)
}

async function uploadImage(file) {
  if (!isSupportedImage(file)) {
    ElMessage.error('图片仅支持 JPG、PNG、WEBP 或 GIF 格式')
    return
  }

  uploadingCount.value += 1
  try {
    const body = new FormData()
    body.append('file', file)
    const response = await fetch('/api/uploads', { method: 'POST', headers: uploadHeaders, body })
    const result = await response.json().catch(() => null)
    if (!response.ok || !result?.url) throw new Error(result?.message || '图片上传失败')

    const next = [...images.value, ...recentUploadUrls.value, result.url]
    recentUploadUrls.value.push(result.url)
    emit('update:modelValue', next)
    currentIndex.value = next.length - 1
    ElMessage.success('图片上传成功')
  } catch (error) {
    ElMessage.error(error?.message || '图片上传失败')
  } finally {
    uploadingCount.value -= 1
    if (!uploadingCount.value) uploadPopoverOpen.value = false
  }
}

function handleUploadChange(file) {
  if (file.raw) void uploadImage(file.raw)
  setTimeout(() => uploadControl.value?.clearFiles(), 0)
}

function openFilePicker() {
  fileInput.value?.click()
}

function toggleUploadPopover() {
  uploadPopoverOpen.value = !uploadPopoverOpen.value
}

function handleOutsidePointer(event) {
  if (!uploadPopoverOpen.value) return
  if (referenceElement.value?.contains(event.target) || uploadPanel.value?.contains(event.target)) return
  uploadPopoverOpen.value = false
}

function handleFileSelection(event) {
  const files = [...(event.target.files || [])]
  event.target.value = ''
  files.forEach((file) => { void uploadImage(file) })
}

function handlePaste(event) {
  const target = event.target
  if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target.tagName))) return
  const files = [...(event.clipboardData?.items || [])]
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter(Boolean)
  if (!files.length) return
  event.preventDefault()
  event.stopPropagation()
  files.forEach((file) => { void uploadImage(file) })
}

watch(uploadPopoverOpen, (open) => {
  if (open && !props.viewOnly) window.addEventListener('paste', handlePaste, true)
  else window.removeEventListener('paste', handlePaste, true)
})

function removeImage(index) {
  if (removingImage.value) return
  removingImage.value = true
  removeImageTimer = window.setTimeout(() => {
    const next = images.value.filter((_, imageIndex) => imageIndex !== index)
    emit('update:modelValue', next)
    if (currentIndex.value >= next.length) currentIndex.value = Math.max(0, next.length - 1)
    removingImage.value = false
    removeImageTimer = null
  }, 160)
}

window.addEventListener('keydown', handlePreviewKeydown)
onMounted(() => window.addEventListener('mousedown', handleOutsidePointer, true))
onBeforeUnmount(() => {
  if (removeImageTimer) window.clearTimeout(removeImageTimer)
  window.removeEventListener('keydown', handlePreviewKeydown)
  window.removeEventListener('paste', handlePaste, true)
  window.removeEventListener('mousedown', handleOutsidePointer, true)
})
</script>

<template>
  <div class="multi-image-uploader">
    <el-popover v-if="!viewOnly" v-model:visible="uploadPopoverOpen" trigger="manual" placement="bottom-start" popper-class="image-uploader-popover" :width="360">
      <div ref="uploadPanel" class="image-upload-panel" @click.stop>
        <el-upload ref="uploadControl" drag accept="image/jpeg,image/png,image/webp,image/gif" :multiple="true" :show-file-list="false" :auto-upload="false" :on-change="handleUploadChange" :disabled="uploading" class="image-upload-dragger">
          <p class="image-upload-panel-title">粘贴或拖拽至这里上传</p>
          <p class="image-upload-panel-hint">JPG、PNG、WEBP、GIF</p>
        </el-upload>
        <input ref="fileInput" class="image-upload-file-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple @change="handleFileSelection">
        <el-button text class="image-upload-local-button" :loading="uploading" :disabled="uploading" @click.stop="openFilePicker"><el-icon><Plus /></el-icon>添加本地文件</el-button>
        <div v-if="uploading" class="image-upload-progress" role="status">正在上传图片…</div>
      </div>
      <template #reference>
      <div ref="referenceElement" class="multi-image-popover-trigger" :aria-expanded="uploadPopoverOpen" @click.stop="toggleUploadPopover">
        <div v-if="images.length" class="multi-image-stage" :class="{ 'is-leaving': removingImage }" :style="{ width: previewSize, height: previewSize }">
          <button type="button" class="multi-image-preview-trigger" :aria-label="`放大查看${label}`" @click.stop="openPreview"><img :key="images[currentIndex]" :src="images[currentIndex]" class="multi-image-preview" :alt="label" /></button>
          <button v-if="images.length > 1" type="button" class="multi-image-arrow multi-image-arrow-left" :aria-label="`上一张${label}`" title="上一张" @click.stop="showPrevious"><el-icon><ArrowLeft /></el-icon></button>
          <button v-if="images.length > 1" type="button" class="multi-image-arrow multi-image-arrow-right" :aria-label="`下一张${label}`" title="下一张" @click.stop="showNext"><el-icon><ArrowRight /></el-icon></button>
          <button type="button" class="multi-image-remove" :aria-label="`移除${label}`" title="移除当前图片" @click.stop="removeImage(currentIndex)"><el-icon><Close /></el-icon></button>
          <button type="button" class="multi-image-upload-overlay" :disabled="uploading" :aria-label="`继续上传${label}`" @click.stop="uploadPopoverOpen = true"><el-icon><Plus /></el-icon><span>{{ uploading ? '正在上传' : '继续上传' }}</span></button>
          <span class="multi-image-count">{{ currentIndex + 1 }}/{{ images.length }}</span>
        </div>
        <button v-else type="button" class="multi-image-empty-trigger" :style="{ width: previewSize, height: previewSize }" :disabled="uploading" :aria-label="`上传${label}`">
          <el-icon><Plus /></el-icon>
          <span>{{ uploading ? '正在上传' : '添加图片' }}</span>
        </button>
      </div>
      </template>
    </el-popover>

    <div v-else-if="images.length" class="multi-image-stage" :style="{ width: previewSize, height: previewSize }">
      <button type="button" class="multi-image-preview-trigger" :aria-label="`放大查看${label}`" @click="openPreview"><img :src="images[currentIndex]" class="multi-image-preview" :alt="label" /></button>
      <button v-if="images.length > 1" type="button" class="multi-image-arrow multi-image-arrow-left" :aria-label="`上一张${label}`" title="上一张" @click="showPrevious"><el-icon><ArrowLeft /></el-icon></button>
      <button v-if="images.length > 1" type="button" class="multi-image-arrow multi-image-arrow-right" :aria-label="`下一张${label}`" title="下一张" @click="showNext"><el-icon><ArrowRight /></el-icon></button>
      <span class="multi-image-count">{{ currentIndex + 1 }}/{{ images.length }}</span>
    </div>

    <div v-if="!images.length && viewOnly" class="multi-image-empty-view" :style="{ width: previewSize, height: previewSize }"><span>—</span></div>

    <Teleport to="body">
      <div v-if="previewVisible" class="multi-image-viewer" role="dialog" aria-modal="true" :aria-label="`${label}预览`" @click.self="previewVisible = false">
      <button type="button" class="multi-image-viewer-close" aria-label="关闭预览" title="关闭" @click="previewVisible = false"><el-icon><Close /></el-icon></button>
      <button v-if="images.length > 1" type="button" class="multi-image-viewer-arrow multi-image-viewer-previous" aria-label="上一张图片" title="上一张" @click="showPreviewPrevious"><el-icon><ArrowLeft /></el-icon></button>
        <img :src="images[previewIndex]" :alt="label" class="multi-image-viewer-image" @click.stop>
      <button v-if="images.length > 1" type="button" class="multi-image-viewer-arrow multi-image-viewer-next" aria-label="下一张图片" title="下一张" @click="showPreviewNext"><el-icon><ArrowRight /></el-icon></button>
        <span v-if="images.length > 1" class="multi-image-viewer-count">{{ previewIndex + 1 }} / {{ images.length }}</span>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.multi-image-uploader { display: inline-flex; flex-direction: column; align-items: flex-start; gap: 8px; }
.multi-image-popover-trigger { display: inline-flex; }
.multi-image-stage { position: relative; overflow: hidden; border: 1px solid #dbe3ef; border-radius: 6px; background: #f8fafc; transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease; }
.multi-image-stage:hover { border-color: #91caff; box-shadow: 0 5px 14px rgba(15,23,42,.12); transform: translateY(-2px); }
.multi-image-stage.is-leaving { pointer-events: none; animation: ui-item-leave .16s ease-in both !important; }
.multi-image-preview-trigger { display: block; width: 100%; height: 100%; padding: 0; border: 0; background: transparent; cursor: zoom-in; }
.multi-image-preview { display: block; width: 100%; height: 100%; border-radius: 5px; object-fit: cover; animation: multi-image-enter .22s ease both; }
@keyframes multi-image-enter { from { opacity: .55; transform: scale(1.025); } to { opacity: 1; transform: scale(1); } }
.multi-image-empty-trigger, .multi-image-empty-view { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; border: 1px dashed #cbd5e1; border-radius: 6px; color: #65758b; background: #f8fafc; font-size: 12px; }
.multi-image-empty-trigger { cursor: pointer; transition: border-color .16s ease, color .16s ease, background .16s ease; }
.multi-image-empty-trigger > :deep(.el-icon) { color: #8b98aa; font-size: 19px; }
.multi-image-empty-trigger:hover { border-color: #1677ff; color: #0958d9; background: #f5f9ff; }
.multi-image-empty-trigger:hover > :deep(.el-icon) { color: #1677ff; }
.multi-image-arrow, .multi-image-remove { position: absolute; z-index: 2; display: grid; width: 20px; height: 20px; min-width: 20px; min-height: 20px; place-items: center; padding: 0; border: 0; border-radius: 50%; color: #fff; background: rgba(15, 23, 42, .78); opacity: 0; visibility: hidden; cursor: pointer; transition: none; }
.multi-image-arrow { top: 50%; transform: translateY(-50%); }
.multi-image-arrow:active { transform: translateY(-50%) scale(.9); }
.multi-image-remove:active { transform: scale(.9); }
.multi-image-arrow-left { left: 7px; }
.multi-image-arrow-right { right: 7px; }
.multi-image-remove { top: 7px; right: 7px; }
.multi-image-arrow, .multi-image-remove { font-size: 8px; }
.multi-image-arrow :deep(.el-icon), .multi-image-remove :deep(.el-icon) { font-size: 8px; }
.multi-image-count { position: absolute; top: 7px; left: 7px; z-index: 2; display: grid; min-width: 34px; height: 22px; place-items: center; padding: 0 6px; border: 1px solid rgba(255,255,255,.7); border-radius: 11px; color: #fff; background: rgba(15,23,42,.68); font-size: 11px; line-height: 1; font-variant-numeric: tabular-nums; }
.multi-image-stage:hover .multi-image-arrow, .multi-image-stage:hover .multi-image-remove, .multi-image-arrow:focus-visible, .multi-image-remove:focus-visible { opacity: 1; visibility: visible; }
.multi-image-upload-overlay { position: absolute; z-index: 3; bottom: 8px; left: 50%; display: inline-flex; min-height: 20px; align-items: center; gap: 3px; padding: 0 7px; border: 1px solid rgba(255,255,255,.7); border-radius: 3px; color: #fff; background: rgba(15,23,42,.78); font: inherit; font-size: 8px; opacity: 0; visibility: hidden; cursor: pointer; transform: translate(-50%, 4px); transition: none; white-space: nowrap; }
.multi-image-stage:hover .multi-image-upload-overlay, .multi-image-upload-overlay:focus-visible { opacity: 1; visibility: visible; transform: translate(-50%, 0); }
.multi-image-upload-overlay:hover { background: rgba(15,23,42,.94); }
.multi-image-upload-overlay > :deep(.el-icon) { font-size: 6px; }
.multi-image-upload-overlay:focus-visible, .multi-image-empty-trigger:focus-visible, .multi-image-arrow:focus-visible, .multi-image-remove:focus-visible { outline: 2px solid #69b1ff; outline-offset: 2px; }
.multi-image-upload-overlay:disabled, .multi-image-empty-trigger:disabled { opacity: .55; cursor: not-allowed; }
.multi-image-viewer { position: fixed; inset: 0; z-index: 4000; display: flex; align-items: center; justify-content: center; padding: 48px 80px; background: rgba(15,23,42,.88); }
.multi-image-viewer-image { display: block; max-width: min(92vw, 1400px); max-height: 88vh; object-fit: contain; }
.multi-image-viewer-close, .multi-image-viewer-arrow { position: fixed; z-index: 1; display: grid; width: 42px; height: 42px; place-items: center; padding: 0; border: 1px solid rgba(255,255,255,.28); border-radius: 50%; color: #fff; background: rgba(15,23,42,.48); cursor: pointer; }
.multi-image-viewer-close { top: 22px; right: 24px; font-size: 20px; }
.multi-image-viewer-arrow { top: 50%; font-size: 22px; transform: translateY(-50%); }
.multi-image-viewer-previous { left: 24px; }
.multi-image-viewer-next { right: 24px; }
.multi-image-viewer-close:hover, .multi-image-viewer-arrow:hover { background: rgba(15,23,42,.8); }
.multi-image-viewer-count { position: fixed; bottom: 22px; left: 50%; color: #fff; font-size: 13px; transform: translateX(-50%); }
@media(hover:none){.multi-image-arrow,.multi-image-remove,.multi-image-upload-overlay{opacity:1;visibility:visible}.multi-image-upload-overlay{transform:translate(-50%,0)}}
@media(max-width:600px){.multi-image-viewer{padding:48px 52px}.multi-image-viewer-previous{left:8px}.multi-image-viewer-next{right:8px}}
</style>

<style>
.image-uploader-popover { padding: 8px !important; }
.image-upload-panel { width: min(344px, calc(100vw - 48px)); }
.image-upload-panel .el-upload-dragger { display: flex; min-height: 82px; flex-direction: column; align-items: center; justify-content: center; padding: 15px 10px; border-color: #d9dfe8; border-radius: 4px; background: #f5f6f7; }
.image-upload-panel .el-upload-dragger:hover { border-color: #1677ff; background: #f5f9ff; }
.image-upload-panel-title { margin: 0; color: #596579; font-size: 12px; }
.image-upload-panel-hint { margin: 5px 0 0; color: #8a94a3; font-size: 11px; }
.image-upload-file-input { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; clip-path: inset(50%); }
.image-upload-local-button { display: flex; min-height: 40px; align-items: center; justify-content: center; gap: 6px; margin: 2px auto 0; padding: 0 12px; color: #334155; font-size: 12px; }
.image-upload-progress { color: #65758b; font-size: 12px; text-align: center; }
</style>
