<script setup>
import BaseSkeleton from './BaseSkeleton.vue'

defineProps({
  size: {
    type: String,
    default: '36px',
  },
  shape: {
    type: String,
    default: 'circle',
    validator: (v) => ['circle', 'square', 'rounded'].includes(v),
  },
})
</script>

<template>
  <BaseSkeleton
    :width="size"
    :height="size"
    :radius="shape === 'circle' ? 'full' : shape === 'rounded' ? 'xl' : 'sm'"
  />
</template>
