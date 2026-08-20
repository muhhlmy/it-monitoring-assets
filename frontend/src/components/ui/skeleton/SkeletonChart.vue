<script setup>
import BaseSkeleton from './BaseSkeleton.vue'

defineProps({
  type: {
    type: String,
    default: 'bar',
    validator: (v) => ['bar', 'line', 'donut', 'pie'].includes(v),
  },
  height: {
    type: String,
    default: '240px',
  },
})
</script>

<template>
  <div
    class="flex flex-col justify-between w-full p-4 rounded-xl bg-[#F8FAFC] border border-[#E5EAEF]"
    :style="{ height: height }"
  >
    <!-- Top info -->
    <div class="flex items-center justify-between">
      <BaseSkeleton width="30%" height="14px" radius="md" />
      <BaseSkeleton width="15%" height="12px" radius="sm" />
    </div>

    <!-- Chart visualization mockup -->
    <div v-if="type === 'donut' || type === 'pie'" class="flex items-center justify-center py-4">
      <BaseSkeleton width="130px" height="130px" radius="full" />
    </div>

    <div v-else class="flex items-end justify-between gap-3 h-36 pt-4 pb-2 px-2">
      <BaseSkeleton width="12%" height="45%" radius="sm" />
      <BaseSkeleton width="12%" height="70%" radius="sm" />
      <BaseSkeleton width="12%" height="30%" radius="sm" />
      <BaseSkeleton width="12%" height="90%" radius="sm" />
      <BaseSkeleton width="12%" height="60%" radius="sm" />
      <BaseSkeleton width="12%" height="80%" radius="sm" />
      <BaseSkeleton width="12%" height="50%" radius="sm" />
    </div>

    <!-- Bottom legend -->
    <div class="flex items-center justify-center gap-4 pt-2">
      <div class="flex items-center gap-1.5">
        <BaseSkeleton width="10px" height="10px" radius="full" />
        <BaseSkeleton width="45px" height="10px" radius="sm" />
      </div>
      <div class="flex items-center gap-1.5">
        <BaseSkeleton width="10px" height="10px" radius="full" />
        <BaseSkeleton width="45px" height="10px" radius="sm" />
      </div>
    </div>
  </div>
</template>
