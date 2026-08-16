<script setup>
defineProps({
  title: { type: String, required: true },
  value: { type: [Number, String], required: true },
  icon: { type: String, default: 'monitoring' },
  color: {
    type: String,
    default: 'primary',
    validator: (value) => ['primary', 'success', 'warning', 'danger', 'cyan', 'purple'].includes(value),
  },
  subtitle: { type: String, default: '' },
})
</script>

<template>
  <div 
    class="shadow-card shadow-card-hover group relative flex min-h-[76px] items-center gap-3 overflow-hidden rounded-xl border p-3.5 transition-all duration-200"
    :class="{
      'bg-[#ECF2FF] border-[#D2E3FF] text-[#5D87FF]': color === 'primary' || color === 'purple',
      'bg-[#EDFBF7] border-[#C3F3E8] text-[#13DEB9]': color === 'success',
      'bg-[#FEF5E5] border-[#FCE6BE] text-[#FFAE1F]': color === 'warning',
      'bg-[#FDEDE8] border-[#FAD9D0] text-[#FA896B]': color === 'danger',
      'bg-[#E8F7FF] border-[#C8EDFF] text-[#49BEFF]': color === 'cyan',
    }"
  >
    <div
      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/80 shadow-xs backdrop-blur-sm"
    >
      <span aria-hidden="true" class="material-symbols-outlined text-[18px]">{{ icon }}</span>
    </div>
    <div class="min-w-0 flex-1">
      <span class="font-num block text-[20px] font-extrabold leading-none tracking-tight text-[#2A3547]">{{ value }}</span>
      <span class="mt-0.5 block text-[10px] font-bold uppercase tracking-wider text-[#7C8BAC]">{{ title }}</span>
      <span v-if="subtitle" class="mt-0.5 block truncate text-[9px] font-medium text-[#7C8BAC]">{{ subtitle }}</span>
    </div>
  </div>
</template>

