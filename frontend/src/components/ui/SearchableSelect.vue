<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import SkeletonList from './skeleton/SkeletonList.vue'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  options: { type: Array, required: true },
  placeholder: { type: String, default: 'Pilih opsi' },
  searchPlaceholder: { type: String, default: 'Cari...' },
  valueKey: { type: String, required: true },
  labelKey: { type: String, required: true },
  secondaryLabelKey: { type: String, default: '' },
  clearable: { type: Boolean, default: false },
  allowCustom: { type: Boolean, default: false },
  customLabelPrefix: { type: String, default: '+ Gunakan' },
  ariaLabel: { type: String, default: '' },
  loading: { type: Boolean, default: false },
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

const selectedOption = computed(() => {
  const found = props.options.find((option) => option[props.valueKey] === props.modelValue)
  if (found) return found
  if (props.allowCustom && props.modelValue) {
    return {
      [props.valueKey]: props.modelValue,
      [props.labelKey]: String(props.modelValue),
    }
  }
  return null
})

const filteredOptions = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase('id-ID')
  let list = props.options

  if (query) {
    list = props.options.filter((option) => {
      const primary = String(option[props.labelKey] || '').toLocaleLowerCase('id-ID')
      const secondary = props.secondaryLabelKey
        ? String(option[props.secondaryLabelKey] || '').toLocaleLowerCase('id-ID')
        : ''
      return primary.includes(query) || secondary.includes(query)
    })
  }

  if (props.allowCustom && searchQuery.value.trim()) {
    const rawQuery = searchQuery.value.trim()
    const exactMatch = list.some(
      (opt) =>
        String(opt[props.labelKey] || '').toLowerCase() === rawQuery.toLowerCase() ||
        String(opt[props.valueKey] || '').toLowerCase() === rawQuery.toLowerCase(),
    )
    if (!exactMatch) {
      const customOpt = {
        [props.valueKey]: rawQuery,
        [props.labelKey]: `${props.customLabelPrefix} "${rawQuery}"`,
        isCustomNew: true,
        actualValue: rawQuery,
      }
      return [customOpt, ...list]
    }
  }

  return list
})

const activeDescendant = computed(() =>
  activeIndex.value >= 0 ? optionId(activeIndex.value) : undefined,
)

let isJustClosed = false

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
  activeIndex.value =
    selectedIndex >= 0 ? selectedIndex : direction < 0 ? filteredOptions.value.length - 1 : 0
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
  if (isJustClosed) return
  if (isOpen.value) closeDropdown({ restoreFocus: false })
  else openDropdown()
}

function selectOption(option) {
  if (!option) return
  isJustClosed = true
  const val = option.isCustomNew ? option.actualValue : option[props.valueKey]
  emit('update:modelValue', val)
  closeDropdown({ restoreFocus: false })
  setTimeout(() => {
    isJustClosed = false
  }, 200)
}

function clearSelection() {
  isJustClosed = true
  emit('update:modelValue', '')
  closeDropdown({ restoreFocus: false })
  setTimeout(() => {
    isJustClosed = false
  }, 200)
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

  activeIndex.value =
    activeIndex.value < 0 ? (step < 0 ? count - 1 : 0) : (activeIndex.value + step + count) % count
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
      class="flex h-8 w-full items-center justify-between rounded-lg border border-[#DCE3EC] bg-white px-2.5 text-left text-[11px] font-medium text-[#334155] focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20"
      :class="{ 'border-brand ring-1 ring-brand/20': isOpen, 'pr-14': clearable && selectedOption }"
      @click="toggleDropdown"
      @keydown="handleTriggerKeydown"
    >
      <span v-if="selectedOption" class="truncate text-[11px]">
        {{ selectedOption[labelKey] }}
        <span v-if="secondaryLabelKey" class="font-mono text-[9px] text-[#94A3B8]">
          ({{ selectedOption[secondaryLabelKey] }})
        </span>
      </span>
      <span v-else class="truncate text-[11px] text-[#9CA3AF]">{{ placeholder }}</span>
      <span
        aria-hidden="true"
        class="material-symbols-outlined shrink-0 text-[16px] text-[#94A3B8] transition-transform duration-200"
        :class="{ 'rotate-180': isOpen }"
        >keyboard_arrow_down</span
      >
    </button>

    <button
      v-if="clearable && selectedOption"
      type="button"
      :aria-label="`Hapus pilihan ${selectedOption[labelKey]}`"
      class="absolute right-7 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-[#94A3B8] transition-colors hover:bg-red-50 hover:text-[#EF4444]"
      @click.stop="clearSelection"
    >
      <span aria-hidden="true" class="material-symbols-outlined text-[14px]">close</span>
    </button>

    <div
      v-if="isOpen"
      class="absolute left-0 right-0 z-50 mt-1 flex flex-col rounded-lg border border-[#E8EDF3] bg-white shadow-xl animate-fade-in"
    >
      <div class="relative border-b border-[#F1F5F9] p-1.5">
        <span
          aria-hidden="true"
          class="material-symbols-outlined pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] text-[#94A3B8]"
          >search</span
        >
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
          class="h-7 w-full rounded-md border border-[#EBEFF5] bg-[#F8FAFC] pl-8 pr-2.5 text-[11px] font-medium text-[#334155] placeholder-[#94A3B8] focus:border-brand focus:outline-none"
          @keydown.stop="handleSearchKeydown"
        />
      </div>

      <ul
        :id="listboxId"
        role="listbox"
        :aria-label="ariaLabel || placeholder"
        class="max-h-48 overflow-y-auto p-1"
        :aria-busy="loading"
      >
        <template v-if="loading">
          <SkeletonList :items="3" :show-avatar="false" />
        </template>
        <template v-else>
          <li
            v-for="(option, index) in filteredOptions"
            :id="optionId(index)"
            :key="option[valueKey]"
            role="option"
            :aria-selected="option[valueKey] === modelValue"
            class="flex cursor-pointer flex-col rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-brand-light"
            :class="{
              'bg-brand-light font-bold text-brand': option[valueKey] === modelValue,
              'ring-1 ring-inset ring-brand/40': activeIndex === index,
            }"
            @mouseenter="activeIndex = index"
            @mousedown.prevent
            @click.stop.prevent="selectOption(option)"
          >
            <span
              class="text-[11px] text-[#172033]"
              :class="{ 'font-bold text-brand': option[valueKey] === modelValue }"
            >
              {{ option[labelKey] }}
            </span>
            <span v-if="secondaryLabelKey" class="mt-0.5 font-mono text-[9px] text-[#94A3B8]">
              {{ option[secondaryLabelKey] }}
            </span>
          </li>
          <li
            v-if="filteredOptions.length === 0"
            role="status"
            class="px-3 py-4 text-center text-[11px] text-[#9CA3AF]"
          >
            Tidak ada hasil ditemukan.
          </li>
        </template>
      </ul>
    </div>
  </div>
</template>

<style scoped>
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.animate-fade-in {
  animation: fadeIn 0.12s ease-out forwards;
}
</style>
