<script setup>
// AppBadge.vue — Pill badge Modernize style
defineProps({
  // 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'cyan' | 'default'
  type: { type: String, default: 'default' },
  text: { type: String, required: true },
})

const classes = {
  success: 'bg-[#EDFBF7] text-[#13DEB9] border-[#13DEB9]/30 font-semibold',
  warning: 'bg-[#FEF5E5] text-[#FFAE1F] border-[#FFAE1F]/30 font-semibold',
  danger: 'bg-[#FDEDE8] text-[#FA896B] border-[#FA896B]/30 font-semibold',
  info: 'bg-[#ECF2FF] text-[#5D87FF] border-[#5D87FF]/30 font-semibold',
  cyan: 'bg-[#E8F7FF] text-[#49BEFF] border-[#49BEFF]/30 font-semibold',
  purple: 'bg-[#ECF2FF] text-[#5D87FF] border-[#5D87FF]/30 font-semibold',
  default: 'bg-[#F4F6F9] text-[#7C8BAC] border-[#E5EAEF] font-semibold',
}

const dotColors = {
  success: 'bg-[#13DEB9]',
  warning: 'bg-[#FFAE1F]',
  danger: 'bg-[#FA896B]',
  info: 'bg-[#5D87FF]',
  cyan: 'bg-[#49BEFF]',
  purple: 'bg-[#5D87FF]',
  default: 'bg-[#7C8BAC]',
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
