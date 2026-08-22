<script setup>
// AppBadge.vue — Pill badge Modernize style
defineProps({
  // 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'cyan' | 'default'
  type: { type: String, default: 'default' },
  text: { type: String, required: true },
})

const classes = {
  success: 'bg-[#DCFCE7] text-[#15803D] border-[#86EFAC] font-bold',
  warning: 'bg-[#FEF9C3] text-[#854D0E] border-[#FDE047] font-bold',
  danger: 'bg-[#FEE2E2] text-[#B91C1C] border-[#FCA5A5] font-bold',
  info: 'bg-[#DBEAFE] text-[#1E40AF] border-[#93C5FD] font-bold',
  cyan: 'bg-[#E0F2FE] text-[#0369A1] border-[#7DD3FC] font-bold',
  purple: 'bg-[#DBEAFE] text-[#1E40AF] border-[#93C5FD] font-bold',
  default: 'bg-[#F1F5F9] text-[#334155] border-[#CBD5E1] font-bold',
}

const dotColors = {
  success: 'bg-[#15803D]',
  warning: 'bg-[#854D0E]',
  danger: 'bg-[#B91C1C]',
  info: 'bg-[#1E40AF]',
  cyan: 'bg-[#0369A1]',
  purple: 'bg-[#1E40AF]',
  default: 'bg-[#475569]',
}
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] tracking-[0.01em] transition-all"
    :class="classes[type] || classes.default"
  >
    <span
      aria-hidden="true"
      class="h-1.5 w-1.5 rounded-full"
      :class="dotColors[type] || dotColors.default"
    ></span>
    {{ text }}
  </span>
</template>
