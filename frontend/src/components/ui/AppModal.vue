<script setup>
// AppModal.vue — Modal pop-up yang dipakai di seluruh aplikasi
import { nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'

const props = defineProps({
  isOpen:  { type: Boolean, default: false },
  title:   { type: String,  default: 'Modal' },
  // 'sm' | 'md' | 'lg'
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['sm', 'md', 'lg'].includes(value),
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

    document.body.style.overflow = previousBodyOverflow
    previouslyFocusedElement?.focus?.()
    previouslyFocusedElement = null
  },
)

onMounted(() => document.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown)
  if (props.isOpen) document.body.style.overflow = previousBodyOverflow
})
</script>

<template>
  <!-- Teleport ke body agar tidak tertutup overflow parent -->
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="isOpen"
        class="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5"
        @mousedown.self="close"
      >
        <!-- Panel Modal -->
        <div
          ref="panelRef"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          tabindex="-1"
          class="modal-panel max-h-[calc(100dvh-2rem)] w-full overflow-y-auto rounded-[22px] border border-white/80 bg-white shadow-[0_28px_80px_rgba(8,18,35,0.24)] outline-none"
          :class="{
            'max-w-sm':  size === 'sm',
            'max-w-lg':  size === 'md',
            'max-w-2xl': size === 'lg',
          }"
        >
          <!-- Header Modal -->
          <div class="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-[#E8EDF3] bg-white/95 px-4 py-4 backdrop-blur-xl sm:px-6 sm:py-5">
            <div class="flex items-center gap-3">
              <span class="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-light text-brand">
                <span aria-hidden="true" class="material-symbols-outlined text-[17px]">inventory_2</span>
              </span>
              <h2 :id="titleId" class="text-[14px] font-extrabold tracking-[-0.015em] text-[#172033]">{{ title }}</h2>
            </div>
            <button
              type="button"
              aria-label="Tutup dialog"
              @click="close"
              class="flex h-8 w-8 items-center justify-center rounded-xl bg-[#F8FAFC] text-[#94A3B8] hover:bg-[#EEF2F7] hover:text-[#334155]"
            >
              <span aria-hidden="true" class="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>

          <!-- Konten Modal (slot) -->
          <div class="p-4 sm:p-6">
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
</style>
