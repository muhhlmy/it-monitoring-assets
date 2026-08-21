<script setup>
import BaseSkeleton from './BaseSkeleton.vue'
import SkeletonAvatar from './SkeletonAvatar.vue'
import SkeletonText from './SkeletonText.vue'

defineProps({
  variant: {
    type: String,
    default: 'modal',
    validator: (v) => ['modal', 'drawer', 'inline'].includes(v),
  },
})
</script>

<template>
  <div class="space-y-5 p-1">
    <!-- Header Section Skeleton -->
    <div class="flex items-start justify-between border-b border-[#E5EAEF] pb-4">
      <div class="flex items-center gap-3">
        <SkeletonAvatar size="44px" shape="rounded" />
        <div class="space-y-2">
          <BaseSkeleton width="180px" height="18px" radius="md" />
          <div class="flex items-center gap-2">
            <BaseSkeleton width="70px" height="18px" radius="full" />
            <BaseSkeleton width="100px" height="12px" radius="sm" />
          </div>
        </div>
      </div>
      <BaseSkeleton width="80px" height="28px" radius="md" />
    </div>

    <!-- Metadata Grid Skeleton -->
    <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
      <div
        v-for="i in 6"
        :key="i"
        class="p-3 bg-[#F8FAFC] rounded-lg border border-[#E5EAEF] space-y-1.5"
      >
        <BaseSkeleton width="60%" height="10px" radius="sm" />
        <BaseSkeleton width="85%" height="14px" radius="md" />
      </div>
    </div>

    <!-- Tabs / Navigation Bar Skeleton -->
    <div class="flex gap-2 border-b border-[#E5EAEF] pb-2">
      <BaseSkeleton width="90px" height="28px" radius="md" />
      <BaseSkeleton width="90px" height="28px" radius="md" />
      <BaseSkeleton width="90px" height="28px" radius="md" />
    </div>

    <!-- Main Content / Timeline / History Skeleton -->
    <div class="space-y-3 pt-1">
      <BaseSkeleton width="40%" height="14px" radius="md" />
      <SkeletonText :lines="3" height="12px" gap="8px" />
    </div>
  </div>
</template>
