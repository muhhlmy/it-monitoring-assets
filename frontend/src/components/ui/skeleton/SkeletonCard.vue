<script setup>
import BaseSkeleton from './BaseSkeleton.vue'
import SkeletonAvatar from './SkeletonAvatar.vue'

defineProps({
  variant: {
    type: String,
    default: 'stat',
    validator: (v) => ['stat', 'simple', 'summary'].includes(v),
  },
})
</script>

<template>
  <!-- Stat Card Variant (Matches StatCard.vue layout) -->
  <div
    v-if="variant === 'stat'"
    class="flex min-h-[76px] items-center gap-3 rounded-xl border border-[#E5EAEF] bg-white p-3.5 shadow-card"
  >
    <SkeletonAvatar size="36px" shape="rounded" />
    <div class="flex-1 space-y-2">
      <BaseSkeleton width="50%" height="20px" radius="md" />
      <BaseSkeleton width="75%" height="10px" radius="sm" />
    </div>
  </div>

  <!-- Summary Card Variant (Matches Dashboard / Filter top cards) -->
  <div
    v-else-if="variant === 'summary'"
    class="flex flex-col justify-between rounded-xl border border-[#E5EAEF] bg-white p-3.5 shadow-xs"
  >
    <div class="flex items-center justify-between">
      <BaseSkeleton width="40%" height="12px" radius="sm" />
      <SkeletonAvatar size="18px" shape="circle" />
    </div>
    <div class="mt-3 space-y-2">
      <BaseSkeleton width="30%" height="22px" radius="md" />
      <div class="flex items-center gap-2">
        <BaseSkeleton width="100%" height="6px" radius="full" />
        <BaseSkeleton width="28px" height="10px" radius="sm" />
      </div>
    </div>
  </div>

  <!-- Simple Card Variant -->
  <div v-else class="rounded-xl border border-[#E5EAEF] bg-white p-4 shadow-card space-y-3">
    <div class="flex items-center justify-between">
      <BaseSkeleton width="40%" height="14px" radius="md" />
      <BaseSkeleton width="20%" height="12px" radius="sm" />
    </div>
    <BaseSkeleton width="100%" height="40px" radius="md" />
    <div class="flex justify-end">
      <BaseSkeleton width="25%" height="12px" radius="sm" />
    </div>
  </div>
</template>
