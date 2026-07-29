<script setup>
defineProps({
  title:    { type: String, required: true },
  subtitle: { type: String, default: '' },
  loading:  { type: Boolean, default: false },
  empty:    { type: Boolean, default: false },
  error:    { type: String, default: '' },
})
</script>

<template>
  <div class="shadow-card flex flex-col rounded-2xl border border-[#E5EAEF] bg-white p-5 transition-all">
    <div class="flex items-center justify-between pb-3 border-b border-[#F1F5F9] mb-4">
      <div>
        <h3 class="text-[15px] font-extrabold text-[#2A3547] leading-tight">{{ title }}</h3>
        <p v-if="subtitle" class="text-[11px] font-medium text-[#7C8BAC] mt-0.5">{{ subtitle }}</p>
      </div>
      <slot name="header-action" />
    </div>

    <div class="relative flex-1 min-h-[260px] flex items-center justify-center">
      <!-- Loading Skeleton -->
      <div v-if="loading" class="flex flex-col items-center gap-2 text-[#7C8BAC]">
        <div class="h-8 w-8 animate-spin rounded-full border-3 border-[#E5EAEF] border-t-[#5D87FF]"></div>
        <span class="text-[12px] font-medium">Memuat data grafik...</span>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="flex flex-col items-center gap-2 text-[#FA896B] p-4 text-center">
        <span class="material-symbols-outlined text-[32px]">error</span>
        <p class="text-[12px] font-semibold">{{ error }}</p>
      </div>

      <!-- Empty State -->
      <div v-else-if="empty" class="flex flex-col items-center gap-2 text-[#94A3B8] p-4 text-center">
        <span class="material-symbols-outlined text-[36px]">bar_chart_off</span>
        <p class="text-[12px] font-semibold">Belum ada data visualisasi.</p>
      </div>

      <!-- Chart Canvas Slot -->
      <div v-else class="h-full w-full">
        <slot />
      </div>
    </div>
  </div>
</template>
