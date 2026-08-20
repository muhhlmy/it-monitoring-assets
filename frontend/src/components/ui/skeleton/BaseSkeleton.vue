<script setup>
import { computed } from 'vue'

const props = defineProps({
  width: {
    type: String,
    default: '100%',
  },
  height: {
    type: String,
    default: '1rem',
  },
  radius: {
    type: String,
    default: 'md',
    validator: (v) => ['none', 'sm', 'md', 'lg', 'xl', '2xl', 'full'].includes(v),
  },
  animated: {
    type: Boolean,
    default: true,
  },
})

const radiusClass = computed(() => {
  const map = {
    none: 'rounded-none',
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    xl: 'rounded-xl',
    '2xl': 'rounded-2xl',
    full: 'rounded-full',
  }
  return map[props.radius] || 'rounded-md'
})
</script>

<template>
  <div
    class="skeleton-item bg-[#E2E8F0] relative overflow-hidden select-none"
    :class="[
      radiusClass,
      {
        'animate-pulse': animated,
      },
    ]"
    :style="{
      width: width,
      height: height,
    }"
    aria-hidden="true"
  ></div>
</template>

<style scoped>
@media (prefers-reduced-motion: reduce) {
  .skeleton-item {
    animation: none !important;
    opacity: 0.6;
  }
}
</style>
