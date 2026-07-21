<script setup>
// AppBadge.vue — Pill badge untuk status aset & role user
defineProps({
  // 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'default'
  type: { type: String, default: 'default' },
  text: { type: String, required: true },
})

// Map type → class CSS yang sesuai
const classes = {
  success: 'bg-[#ECFDF5] text-[#087A55] border-[#C7F0DF]',
  warning: 'bg-[#FFF8E6] text-[#A15C05] border-[#F8E3AF]',
  danger:  'bg-[#FFF0F0] text-[#C33737] border-[#F7CCCC]',
  info:    'bg-[#EDF5FF] text-[#1763BE] border-[#CFE3FA]',
  purple:  'bg-[#F4F0FF] text-[#7047B8] border-[#E2D7FA]',
  default: 'bg-[#F1F5F9] text-[#526175] border-[#DCE3EC]',
}

const dotColors = {
  success: 'bg-[#10B981]',
  warning: 'bg-[#F59E0B]',
  danger:  'bg-[#EF4444]',
  info:    'bg-[#3B82F6]',
  purple:  'bg-[#8B5CF6]',
  default: 'bg-[#9CA3AF]',
}
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-bold tracking-[0.02em]"
    :class="classes[type] || classes.default"
  >
    <span aria-hidden="true" class="h-1.5 w-1.5 rounded-full shadow-[0_0_0_2px_rgba(255,255,255,0.8)]" :class="dotColors[type] || dotColors.default"></span>
    {{ text }}
  </span>
</template>
