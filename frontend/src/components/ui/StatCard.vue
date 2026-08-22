<script setup>
defineProps({
  title: { type: String, required: true },
  value: { type: [Number, String], required: true },
  icon: { type: String, default: 'monitoring' },
  color: {
    type: String,
    default: 'primary',
    validator: (value) =>
      ['primary', 'success', 'warning', 'danger', 'cyan', 'purple'].includes(value),
  },
  subtitle: { type: String, default: '' },
})
</script>

<template>
  <div
    class="shadow-card shadow-card-hover group relative flex min-h-[76px] items-center gap-3 overflow-hidden rounded-xl border p-3.5 transition-all duration-200"
    :class="{
      'bg-[#EFF6FF] border-[#BFDBFE] text-[#1E40AF]': color === 'primary' || color === 'purple',
      'bg-[#ECFDF5] border-[#A7F3D0] text-[#047857]': color === 'success',
      'bg-[#FFFBEB] border-[#FDE68A] text-[#B45309]': color === 'warning',
      'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]': color === 'danger',
      'bg-[#F0F9FF] border-[#BAE6FD] text-[#0369A1]': color === 'cyan',
    }"
  >
    <div
      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/90 shadow-xs backdrop-blur-sm"
    >
      <span aria-hidden="true" class="material-symbols-outlined text-[18px]">{{ icon }}</span>
    </div>
    <div class="min-w-0 flex-1">
      <span
        class="font-num block text-[20px] font-extrabold leading-none tracking-tight text-[#0F172A]"
        >{{ value }}</span
      >
      <span class="mt-0.5 block text-[10px] font-bold uppercase tracking-wider text-[#475569]">{{
        title
      }}</span>
      <span v-if="subtitle" class="mt-0.5 block truncate text-[9px] font-medium text-[#475569]">{{
        subtitle
      }}</span>
    </div>
  </div>
</template>
