<script setup>
// AppModal.vue — Modal pop-up yang dipakai di seluruh aplikasi
import { nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'

const props = defineProps({
  isOpen:   { type: Boolean, default: false },
  title:    { type: String,  default: 'Modal' },
  subtitle: { type: String,  default: '' },
  icon:     { type: String,  default: 'confirmation_number' },
  // 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['sm', 'md', 'lg', 'xl', '2xl', 'full'].includes(value),
  },
})
const emit = defineEmits(['close'])

const panelRef = ref(null)
const titleId = `modal-title-${useId()}`
let previouslyFocusedElement = null
let previousBodyOverflow = ''

function close() {
  emit('close')
}

function getFocusableElements() {
  if (!panelRef.value) return []

  const focusableElements = Array.from(
    panelRef.value.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('hidden'))

  const autofocusElement = panelRef.value.querySelector('[autofocus]:not([disabled])')
  if (!autofocusElement) return focusableElements

  return [autofocusElement, ...focusableElements.filter((element) => element !== autofocusElement)]
}

function handleKeydown(event) {
  if (!props.isOpen) return

  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }

  if (event.key !== 'Tab') return

  const focusableElements = getFocusableElements()
  if (focusableElements.length === 0) {
    event.preventDefault()
    panelRef.value?.focus()
    return
  }

  const firstElement = focusableElements[0]
  const lastElement = focusableElements.at(-1)

  if (event.shiftKey && document.activeElement === firstElement) {
    event.preventDefault()
    lastElement.focus()
  } else if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault()
    firstElement.focus()
  }
}

watch(
  () => props.isOpen,
  async (isOpen) => {
    if (isOpen) {
      previouslyFocusedElement = document.activeElement
      previousBodyOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      await nextTick()
      const firstFocusableElement = getFocusableElements()[0]
      if (firstFocusableElement) firstFocusableElement.focus()
      else panelRef.value?.focus()
      return
    }

    document.body.style.overflow = ''
    previouslyFocusedElement?.focus?.()
    previouslyFocusedElement = null
  },
)

onMounted(() => document.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <!-- Teleport ke body agar tidak tertutup overflow parent -->
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="isOpen"
        class="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/40 backdrop-blur-xs"
        @mousedown.self="close"
      >
        <!-- Panel Modal Container (Fixed Outer Box with Overflow Hidden) -->
        <div
          ref="panelRef"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          tabindex="-1"
          class="modal-panel flex max-h-[85vh] w-full flex-col overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-2xl outline-none"
          :class="{
            'max-w-sm':   size === 'sm',
            'max-w-lg':   size === 'md',
            'max-w-2xl':  size === 'lg',
            'max-w-4xl':  size === 'xl',
            'max-w-6xl':  size === '2xl',
            'max-w-full': size === 'full',
          }"
        >
          <!-- Header Modal (Fixed Non-Scrollable Header) -->
          <div class="flex shrink-0 items-center justify-between gap-3 border-b border-[#F1F5F9] bg-white px-5 py-3.5">
            <div class="flex items-center gap-2.5 min-w-0">
              <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB]">
                <span aria-hidden="true" class="material-symbols-outlined text-[17px]">{{ icon || 'confirmation_number' }}</span>
              </span>
              <div class="min-w-0">
                <h2 :id="titleId" class="text-sm font-bold text-[#0F172A] leading-tight truncate">{{ title }}</h2>
                <p v-if="subtitle" class="text-[11px] font-normal text-[#64748B] mt-0.5 leading-none truncate">{{ subtitle }}</p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Tutup dialog"
              @click="close"
              class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#94A3B8] transition-colors hover:bg-[#F8FAFC] hover:text-[#0F172A] cursor-pointer"
            >
              <span aria-hidden="true" class="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>

          <!-- Body Konten Modal (Sole Scrollable Area) -->
          <div class="modal-body flex-1 min-h-0 overflow-y-auto p-3.5 sm:p-4">
            <slot />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active, .modal-leave-active { transition: all 0.22s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .modal-panel { transform: translateY(12px) scale(0.98); }
.modal-leave-to .modal-panel   { transform: translateY(8px) scale(0.98); }

/* Custom Sleek Scrollbar for Modal Body */
.modal-body::-webkit-scrollbar {
  width: 5px;
}
.modal-body::-webkit-scrollbar-track {
  background: transparent;
}
.modal-body::-webkit-scrollbar-thumb {
  background: #CBD5E1;
  border-radius: 9999px;
}
.modal-body::-webkit-scrollbar-thumb:hover {
  background: #94A3B8;
}
</style>
