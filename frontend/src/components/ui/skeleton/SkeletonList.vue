<script setup>
import BaseSkeleton from './BaseSkeleton.vue'
import SkeletonAvatar from './SkeletonAvatar.vue'

defineProps({
  items: {
    type: Number,
    default: 4,
  },
  showAvatar: {
    type: Boolean,
    default: true,
  },
})
</script>

<template>
  <div class="divide-y divide-[#F1F5F9] w-full">
    <div v-for="i in items" :key="i" class="flex items-center gap-3 p-2.5">
      <SkeletonAvatar v-if="showAvatar" size="28px" shape="circle" class="shrink-0" />
      <div class="flex-1 space-y-1.5 min-w-0">
        <BaseSkeleton :width="i % 2 === 0 ? '70%' : '85%'" height="12px" radius="sm" />
        <BaseSkeleton :width="i % 2 === 0 ? '40%' : '50%'" height="10px" radius="sm" />
      </div>
    </div>
  </div>
</template>
