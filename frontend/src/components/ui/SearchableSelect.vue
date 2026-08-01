<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  options: { type: Array, required: true },
  placeholder: { type: String, default: 'Pilih opsi' },
  searchPlaceholder: { type: String, default: 'Cari...' },
  valueKey: { type: String, required: true },
  labelKey: { type: String, required: true },
  secondaryLabelKey: { type: String, default: '' },
  clearable: { type: Boolean, default: false },
  ariaLabel: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue'])

const componentId = useId()
const listboxId = `${componentId}-listbox`
const isOpen = ref(false)
const searchQuery = ref('')
const activeIndex = ref(-1)
const containerRef = ref(null)
const triggerRef = ref(null)
const searchInputRef = ref(null)

const selectedOption = computed(() =>
  props.options.find((option) => option[props.valueKey] === props.modelValue),
)

const filteredOptions = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase('id-ID')
  if (!query) return props.options

  return props.options.filter((option) => {
    const primary = String(option[props.labelKey] || '').toLocaleLowerCase('id-ID')
    const secondary = props.secondaryLabelKey
      ? String(option[props.secondaryLabelKey] || '').toLocaleLowerCase('id-ID')
      : ''
    return primary.includes(query) || secondary.includes(query)
  })
})

const activeDescendant = computed(() =>
  activeIndex.value >= 0 ? optionId(activeIndex.value) : undefined,
)

function optionId(index) {
  return `${componentId}-option-${index}`
}

function setInitialActiveIndex(direction = 1) {
  if (filteredOptions.value.length === 0) {
    activeIndex.value = -1
    return
  }

  const selectedIndex = filteredOptions.value.findIndex(
    (option) => option[props.valueKey] === props.modelValue,
  )
  activeIndex.value = selectedIndex >= 0
    ? selectedIndex
    : direction < 0
      ? filteredOptions.value.length - 1
      : 0
}

function openDropdown(direction = 1) {
  if (isOpen.value) return
  isOpen.value = true
  setInitialActiveIndex(direction)
}

function closeDropdown({ restoreFocus = true } = {}) {
  if (!isOpen.value) return
  isOpen.value = false
  searchQuery.value = ''
  activeIndex.value = -1
  if (restoreFocus) nextTick(() => triggerRef.value?.focus())
}

function toggleDropdown() {
  if (isOpen.value) closeDropdown({ restoreFocus: false })
  else openDropdown()
}

function selectOption(option) {
  if (!option) return
  emit('update:modelValue', option[props.valueKey])
  closeDropdown()
}

function clearSelection() {
  emit('update:modelValue', '')
  nextTick(() => triggerRef.value?.focus())
}

function scrollActiveOptionIntoView() {
  if (activeIndex.value < 0 || typeof document === 'undefined') return
  nextTick(() => {
    document.getElementById(optionId(activeIndex.value))?.scrollIntoView({ block: 'nearest' })
  })
}

function moveActiveIndex(step) {
  const count = filteredOptions.value.length
  if (count === 0) {
    activeIndex.value = -1
    return
  }

  activeIndex.value = activeIndex.value < 0
    ? step < 0 ? count - 1 : 0
    : (activeIndex.value + step + count) % count
  scrollActiveOptionIntoView()
}

function handleTriggerKeydown(event) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    openDropdown(event.key === 'ArrowUp' ? -1 : 1)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    closeDropdown()
  }
}

function handleSearchKeydown(event) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    moveActiveIndex(1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    moveActiveIndex(-1)
  } else if (event.key === 'Home') {
    event.preventDefault()
    activeIndex.value = filteredOptions.value.length > 0 ? 0 : -1
    scrollActiveOptionIntoView()
  } else if (event.key === 'End') {
    event.preventDefault()
    activeIndex.value = filteredOptions.value.length - 1
    scrollActiveOptionIntoView()
  } else if (event.key === 'Enter') {
    event.preventDefault()
    selectOption(filteredOptions.value[activeIndex.value])
  } else if (event.key === 'Escape') {
    event.preventDefault()
    closeDropdown()
  } else if (event.key === 'Tab') {
    closeDropdown({ restoreFocus: false })
  }
}

function handleClickOutside(event) {
  if (containerRef.value && !containerRef.value.contains(event.target)) {
    closeDropdown({ restoreFocus: false })
  }
}

watch(isOpen, async (open) => {
  if (!open) return
  searchQuery.value = ''
  await nextTick()
  searchInputRef.value?.focus()
})

watch(filteredOptions, () => {
  if (!isOpen.value) return
  setInitialActiveIndex()
})

onMounted(() => document.addEventListener('click', handleClickOutside))
onBeforeUnmount(() => document.removeEventListener('click', handleClickOutside))
</script>

<template>
  <div ref="containerRef" class="relative w-full">
    <button
      ref="triggerRef"
      type="button"
      :aria-label="ariaLabel || placeholder"
      aria-haspopup="listbox"
      :aria-expanded="isOpen"
      :aria-controls="listboxId"
      class="flex h-10 w-full items-center justify-between rounded-xl border border-[#DCE3EC] bg-white px-3 text-left text-[12px] font-medium text-[#334155] focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20"
      :class="{ 'border-brand ring-1 ring-brand/20': isOpen, 'pr-16': clearable && selectedOption }"
      @click="toggleDropdown"
      @keydown="handleTriggerKeydown"
    >
      <span v-if="selectedOption" class="truncate text-[12px]">
        {{ selectedOption[labelKey] }}
        <span v-if="secondaryLabelKey" class="font-mono text-[10px] text-[#94A3B8]">
          ({{ selectedOption[secondaryLabelKey] }})
        </span>
      </span>
      <span v-else class="truncate text-[12px] text-[#9CA3AF]">{{ placeholder }}</span>
      <span
        aria-hidden="true"
        class="material-symbols-outlined shrink-0 text-[18px] text-[#94A3B8] transition-transform duration-200"
        :class="{ 'rotate-180': isOpen }"
      >keyboard_arrow_down</span>
    </button>

    <button
      v-if="clearable && selectedOption"
      type="button"
      :aria-label="`Hapus pilihan ${selectedOption[labelKey]}`"
      class="absolute right-9 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-[#94A3B8] transition-colors hover:bg-red-50 hover:text-[#EF4444]"
      @click.stop="clearSelection"
    >
      <span aria-hidden="true" class="material-symbols-outlined text-[16px]">close</span>
    </button>

    <div
      v-if="isOpen"
      class="absolute left-0 right-0 z-50 mt-1.5 flex flex-col rounded-xl border border-[#E8EDF3] bg-white shadow-2xl animate-fade-in"
    >
      <div class="relative border-b border-[#F1F5F9] p-2">
        <span aria-hidden="true" class="material-symbols-outlined pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[16px] text-[#94A3B8]">search</span>
        <input
          ref="searchInputRef"
          v-model="searchQuery"
          type="text"
          role="combobox"
          aria-autocomplete="list"
          :aria-label="`Cari ${ariaLabel || placeholder}`"
          :aria-expanded="true"
          :aria-controls="listboxId"
          :aria-activedescendant="activeDescendant"
          :placeholder="searchPlaceholder"
          class="h-8 w-full rounded-lg border border-[#EBEFF5] bg-[#F8FAFC] pl-9 pr-3 text-[11px] font-medium text-[#334155] placeholder-[#94A3B8] focus:border-brand focus:outline-none"
          @keydown.stop="handleSearchKeydown"
        />
      </div>

      <ul
        :id="listboxId"
        role="listbox"
        :aria-label="ariaLabel || placeholder"
        class="max-h-52 overflow-y-auto p-1"
      >
        <li
          v-for="(option, index) in filteredOptions"
          :id="optionId(index)"
          :key="option[valueKey]"
          role="option"
          :aria-selected="option[valueKey] === modelValue"
          class="flex cursor-pointer flex-col rounded-lg px-3 py-2 text-left transition-colors hover:bg-brand-light"
          :class="{
            'bg-brand-light font-bold text-brand': option[valueKey] === modelValue,
            'ring-1 ring-inset ring-brand/40': activeIndex === index,
          }"
          @mouseenter="activeIndex = index"
          @mousedown.prevent
          @click="selectOption(option)"
        >
          <span class="text-[12px] text-[#172033]" :class="{ 'font-bold text-brand': option[valueKey] === modelValue }">
            {{ option[labelKey] }}
          </span>
          <span v-if="secondaryLabelKey" class="mt-0.5 font-mono text-[9px] text-[#94A3B8]">
            {{ option[secondaryLabelKey] }}
          </span>
        </li>
        <li v-if="filteredOptions.length === 0" role="status" class="px-3 py-4 text-center text-[11px] text-[#9CA3AF]">
          Tidak ada hasil ditemukan.
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in {
  animation: fadeIn 0.12s ease-out forwards;
}
</style>
