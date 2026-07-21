<script setup>
defineProps({
  title: { type: String, required: true },
  value: { type: [Number, String], required: true },
  icon: { type: String, default: 'monitoring' },
  color: {
    type: String,
    default: 'primary',
    validator: (value) => ['primary', 'success', 'warning', 'danger', 'purple'].includes(value),
  },
  subtitle: { type: String, default: '' },
})
</script>

<template>
  <div class="shadow-card shadow-card-hover group relative flex min-h-[112px] items-center gap-4 overflow-hidden rounded-2xl border border-[#E8EDF3] bg-white p-4">
    <div class="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-brand/30 to-transparent opacity-0 transition-opacity group-hover:opacity-100"></div>
    <div
      class="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]"
      :class="{
        'bg-brand-light text-brand': color === 'primary',
        'bg-[#ECFDF5] text-[#0B9B6C]': color === 'success',
        'bg-[#FFF8E6] text-[#D78A15]': color === 'warning',
        'bg-[#FFF0F0] text-[#DC4C4C]': color === 'danger',
        'bg-[#F4F0FF] text-[#8155C7]': color === 'purple',
      }"
    >
      <span aria-hidden="true" class="material-symbols-outlined text-[21px]">{{ icon }}</span>
    </div>
    <div class="min-w-0">
      <span class="font-num block text-[24px] font-extrabold leading-none tracking-[-0.03em] text-[#172033]">{{ value }}</span>
      <span class="mt-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-[#64748B]">{{ title }}</span>
      <span v-if="subtitle" class="mt-1 block truncate text-[9px] text-[#94A3B8]">{{ subtitle }}</span>
    </div>
  </div>
</template>
