<script setup>
import { computed } from 'vue'

const props = defineProps({
  currentPage: { type: Number, required: true, default: 1 },
  totalItems: { type: Number, required: true, default: 0 },
  itemsPerPage: { type: Number, default: 10 },
})

const emit = defineEmits(['update:currentPage', 'pageChange'])

const totalPages = computed(() => {
  if (props.totalItems <= 0) return 1
  return Math.ceil(props.totalItems / props.itemsPerPage)
})

const startIndex = computed(() => {
  if (props.totalItems === 0) return 0
  return (props.currentPage - 1) * props.itemsPerPage + 1
})

const endIndex = computed(() => {
  return Math.min(props.currentPage * props.itemsPerPage, props.totalItems)
})

const visiblePageNumbers = computed(() => {
  const pages = []
  const total = totalPages.value
  const current = props.currentPage

  let start = Math.max(1, current - 2)
  let end = Math.min(total, start + 4)

  if (end - start < 4) {
    start = Math.max(1, end - 4)
  }

  for (let i = start; i <= end; i++) {
    pages.push(i)
  }
  return pages
})

function goToPage(page) {
  if (page < 1 || page > totalPages.value || page === props.currentPage) return
  emit('update:currentPage', page)
  emit('pageChange', page)
}
</script>

<template>
  <div
    class="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-1 px-1 text-[11.5px] text-[#64748B] select-none"
  >
    <div class="flex items-center gap-1 font-medium">
      <span>Menampilkan</span>
      <span class="font-bold text-[#0F172A]">{{ startIndex }}</span>
      <span>–</span>
      <span class="font-bold text-[#0F172A]">{{ endIndex }}</span>
      <span>dari</span>
      <span class="font-bold text-[#0F172A]">{{ totalItems }}</span>
      <span>data</span>
    </div>

    <div v-if="totalPages > 1" class="flex items-center gap-1">
      <button
        type="button"
        @click="goToPage(currentPage - 1)"
        :disabled="currentPage === 1"
        class="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#475569] shadow-2xs hover:bg-[#F8FAFC] hover:text-[#0F172A] hover:border-[#CBD5E1] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        title="Halaman Sebelumnya"
      >
        <span class="material-symbols-outlined text-[18px]">chevron_left</span>
      </button>

      <template v-for="page in visiblePageNumbers" :key="page">
        <button
          type="button"
          @click="goToPage(page)"
          class="flex h-8 min-w-[32px] px-2 items-center justify-center rounded-lg text-[12px] font-bold transition-all cursor-pointer"
          :class="
            page === currentPage
              ? 'bg-[#2563EB] text-white shadow-2xs'
              : 'border border-[#E2E8F0] bg-white text-[#475569] hover:bg-[#F8FAFC] hover:text-[#0F172A] hover:border-[#CBD5E1]'
          "
        >
          {{ page }}
        </button>
      </template>

      <button
        type="button"
        @click="goToPage(currentPage + 1)"
        :disabled="currentPage === totalPages"
        class="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#475569] shadow-2xs hover:bg-[#F8FAFC] hover:text-[#0F172A] hover:border-[#CBD5E1] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        title="Halaman Selanjutnya"
      >
        <span class="material-symbols-outlined text-[18px]">chevron_right</span>
      </button>
    </div>
  </div>
</template>
