<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, computed, watch } from 'vue'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  options: { type: Array, required: true },
  placeholder: { type: String, default: 'Pilih opsi' },
  searchPlaceholder: { type: String, default: 'Cari...' },
  valueKey: { type: String, required: true },
  labelKey: { type: String, required: true },
  secondaryLabelKey: { type: String, default: '' },
  clearable: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const isOpen = ref(false)
const searchQuery = ref('')
const containerRef = ref(null)
const searchInputRef = ref(null)

const selectedOption = computed(() => {
  return props.options.find(opt => opt[props.valueKey] === props.modelValue)
})

const filteredOptions = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return props.options

  return props.options.filter(opt => {
    const val1 = String(opt[props.labelKey] || '').toLowerCase()
    const val2 = props.secondaryLabelKey ? String(opt[props.secondaryLabelKey] || '').toLowerCase() : ''
    return val1.includes(query) || val2.includes(query)
  })
})

function toggleDropdown() {
  isOpen.value = !isOpen.value
}

function selectOption(option) {
  emit('update:modelValue', option[props.valueKey])
  isOpen.value = false
}

function clearSelection(event) {
  event.stopPropagation()
  emit('update:modelValue', '')
}

function handleClickOutside(event) {
  if (containerRef.value && !containerRef.value.contains(event.target)) {
    isOpen.value = false
  }
}

watch(isOpen, async (open) => {
  if (open) {
    searchQuery.value = ''
    await nextTick()
    searchInputRef.value?.focus()
  }
})

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div ref="containerRef" class="relative w-full">
    <!-- Trigger Button -->
    <button
      type="button"
      @click="toggleDropdown"
      class="flex h-10 w-full items-center justify-between rounded-xl border border-[#DCE3EC] bg-white px-3 text-left text-[12px] font-medium text-[#334155] focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20"
      :class="{ 'border-brand ring-1 ring-brand/20': isOpen }"
    >
      <span v-if="selectedOption" class="truncate text-[12px]">
        {{ selectedOption[labelKey] }} <span v-if="secondaryLabelKey" class="text-[10px] text-[#94A3B8] font-mono">({{ selectedOption[secondaryLabelKey] }})</span>
      </span>
      <span v-else class="text-[#9CA3AF] text-[12px]">{{ placeholder }}</span>
      <span class="flex items-center gap-1">
        <span v-if="clearable && selectedOption" @click="clearSelection" class="material-symbols-outlined text-[16px] text-[#94A3B8] hover:text-[#EF4444] cursor-pointer transition-colors">close</span>
        <span class="material-symbols-outlined text-[18px] text-[#94A3B8] transition-transform duration-200" :class="{ 'rotate-180': isOpen }">
          keyboard_arrow_down
        </span>
      </span>
    </button>

    <!-- Dropdown Panel -->
    <div
      v-if="isOpen"
      class="absolute left-0 right-0 z-50 mt-1.5 flex flex-col rounded-xl border border-[#E8EDF3] bg-white shadow-2xl animate-fade-in"
    >
      <!-- Search Input -->
      <div class="relative border-b border-[#F1F5F9] p-2">
        <span class="material-symbols-outlined absolute left-4.5 top-1/2 -translate-y-1/2 text-[16px] text-[#94A3B8]">search</span>
        <input
          ref="searchInputRef"
          v-model="searchQuery"
          type="text"
          :placeholder="searchPlaceholder"
          class="h-8 w-full rounded-lg border border-[#EBEFF5] bg-[#F8FAFC] pl-8 pr-3 text-[11px] font-medium text-[#334155] placeholder-[#94A3B8] focus:border-brand focus:outline-none"
          @keydown.stop
        />
      </div>

      <!-- Options List -->
      <ul class="max-h-52 overflow-y-auto p-1 divide-y divide-[#FAFCFF]">
        <li v-for="option in filteredOptions" :key="option[valueKey]">
          <button
            type="button"
            @click="selectOption(option)"
            class="flex w-full flex-col px-3 py-2 text-left rounded-lg transition-colors hover:bg-brand-light"
            :class="{ 'bg-brand-light font-bold text-brand': option[valueKey] === modelValue }"
          >
            <span class="text-[12px] text-[#172033]" :class="{ 'text-brand font-bold': option[valueKey] === modelValue }">
              {{ option[labelKey] }}
            </span>
            <span v-if="secondaryLabelKey" class="mt-0.5 text-[9px] text-[#94A3B8] font-mono">
              {{ option[secondaryLabelKey] }}
            </span>
          </button>
        </li>
        <li v-if="filteredOptions.length === 0" class="px-3 py-4 text-center text-[11px] text-[#9CA3AF]">
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
