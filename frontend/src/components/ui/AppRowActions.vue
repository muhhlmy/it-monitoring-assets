<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'

const props = defineProps({
  actions: {
    type: Array,
    required: true,
    // Array of: { label: String, icon?: String, danger?: Boolean, disabled?: Boolean, hidden?: Boolean, onClick: Function }
  },
})

const isOpen = ref(false)
const buttonRef = ref(null)
const dropdownRef = ref(null)
const dropdownStyle = ref({})

function updateDropdownPosition() {
  if (!buttonRef.value) return
  const rect = buttonRef.value.getBoundingClientRect()
  const dropdownWidth = 160

  // Align right edge of dropdown with right edge of button
  let left = rect.right - dropdownWidth
  if (left < 10) left = 10

  const visibleActions = props.actions.filter(a => !a.hidden)
  const estimatedHeight = (visibleActions.length * 36) + 16
  const spaceBelow = window.innerHeight - rect.bottom

  if (spaceBelow < estimatedHeight && rect.top > estimatedHeight) {
    // Open upwards
    dropdownStyle.value = {
      position: 'fixed',
      top: `${Math.max(10, rect.top - estimatedHeight - 4)}px`,
      left: `${left}px`,
      width: `${dropdownWidth}px`,
      zIndex: 9999,
    }
  } else {
    // Open downwards
    dropdownStyle.value = {
      position: 'fixed',
      top: `${rect.bottom + 4}px`,
      left: `${left}px`,
      width: `${dropdownWidth}px`,
      zIndex: 9999,
    }
  }
}

let isJustClosed = false

async function toggleDropdown() {
  if (isJustClosed) return
  if (!isOpen.value) {
    updateDropdownPosition()
    isOpen.value = true
    await nextTick()
    updateDropdownPosition()
  } else {
    isOpen.value = false
  }
}

function closeDropdown() {
  isOpen.value = false
}

function handleAction(actionItem) {
  if (actionItem.disabled) return
  isJustClosed = true
  closeDropdown()
  setTimeout(() => {
    isJustClosed = false
  }, 200)
  if (typeof actionItem.onClick === 'function') {
    actionItem.onClick()
  }
}

function handleClickOutside(event) {
  if (isOpen.value) {
    const isClickOnButton = buttonRef.value && buttonRef.value.contains(event.target)
    const isClickOnDropdown = dropdownRef.value && dropdownRef.value.contains(event.target)
    if (!isClickOnButton && !isClickOnDropdown) {
      closeDropdown()
    }
  }
}

function handleScrollOrResize() {
  if (isOpen.value) {
    updateDropdownPosition()
  }
}

function handleKeydown(event) {
  if (event.key === 'Escape') {
    closeDropdown()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside, true)
  document.addEventListener('keydown', handleKeydown)
  window.addEventListener('scroll', handleScrollOrResize, true)
  window.addEventListener('resize', handleScrollOrResize)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside, true)
  document.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('scroll', handleScrollOrResize, true)
  window.removeEventListener('resize', handleScrollOrResize)
})
</script>

<template>
  <div class="relative inline-block text-left">
    <button
      ref="buttonRef"
      type="button"
      @click.stop="toggleDropdown"
      title="Opsi Aksi"
      class="flex h-7 w-7 items-center justify-center rounded-lg text-[#64748B] opacity-50 group-hover:opacity-100 hover:bg-[#F1F5F9] hover:text-[#0F172A] transition-all cursor-pointer"
      :class="isOpen ? 'bg-[#F1F5F9] text-[#0F172A] opacity-100' : ''"
    >
      <span aria-hidden="true" class="material-symbols-outlined text-[18px]">more_horiz</span>
    </button>

    <Teleport to="body">
      <Transition name="fade-scale">
        <div
          v-if="isOpen"
          ref="dropdownRef"
          :style="dropdownStyle"
          class="rounded-xl border border-[#E5EAEF] bg-white p-1.5 shadow-2xl outline-none"
        >
          <template v-for="(act, idx) in actions" :key="idx">
            <button
              v-if="!act.hidden"
              type="button"
              :disabled="act.disabled"
              @click.stop="handleAction(act)"
              class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] font-bold transition-all cursor-pointer select-none text-left"
              :class="[
                act.disabled ? 'opacity-40 cursor-not-allowed text-gray-400' :
                act.danger ? 'text-rose-600 hover:bg-rose-50' : 'text-[#2A3547] hover:bg-[#ECF2FF] hover:text-[#5D87FF]'
              ]"
            >
              <span v-if="act.icon" class="material-symbols-outlined text-[16px] shrink-0">
                {{ act.icon }}
              </span>
              <span class="truncate">{{ act.label }}</span>
            </button>
          </template>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.fade-scale-enter-active, .fade-scale-leave-active { transition: all 0.15s ease-out; }
.fade-scale-enter-from, .fade-scale-leave-to { opacity: 0; transform: scale(0.95) translateY(-4px); }
</style>
