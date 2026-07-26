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
          class="modal-panel max-h-[calc(100dvh-2rem)] w-full overflow-y-auto rounded-2xl border border-[#E5EAEF] bg-white shadow-2xl outline-none"
          :class="{
            'max-w-sm':  size === 'sm',
            'max-w-lg':  size === 'md',
            'max-w-2xl': size === 'lg',
          }"
        >
          <!-- Header Modal -->
          <div class="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-[#E5EAEF] bg-white px-5 py-4.5 sm:px-6">
            <div class="flex items-center gap-3">
              <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-[#ECF2FF] text-[#5D87FF]">
                <span aria-hidden="true" class="material-symbols-outlined text-[20px]">inventory_2</span>
              </span>
              <h2 :id="titleId" class="text-[16px] font-bold text-[#2A3547]">{{ title }}</h2>
            </div>
            <button
              type="button"
              aria-label="Tutup dialog"
              @click="close"
              class="flex h-8 w-8 items-center justify-center rounded-lg text-[#7C8BAC] transition-colors hover:bg-[#ECF2FF] hover:text-[#5D87FF]"
            >
              <span aria-hidden="true" class="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          <!-- Konten Modal (slot) -->
          <div class="p-5 sm:p-6">
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
