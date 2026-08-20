<script setup>
import BaseSkeleton from './BaseSkeleton.vue'

defineProps({
  rows: {
    type: Number,
    default: 5,
  },
  cols: {
    type: Number,
    default: 5,
  },
  showActions: {
    type: Boolean,
    default: true,
  },
  showCheckboxes: {
    type: Boolean,
    default: false,
  },
})
</script>

<template>
  <div class="w-full overflow-x-auto rounded-lg border border-[#E5EAEF] bg-white shadow-xs">
    <table class="w-full text-left border-collapse">
      <thead>
        <tr class="bg-[#F8FAFC] border-b border-[#E5EAEF]">
          <th v-if="showCheckboxes" class="w-10 px-3 py-2.5">
            <BaseSkeleton width="16px" height="16px" radius="sm" />
          </th>
          <th v-for="c in cols" :key="'head-' + c" class="px-3 py-2.5">
            <BaseSkeleton
              :width="c === 1 ? '70%' : c === cols ? '40%' : '55%'"
              height="12px"
              radius="sm"
            />
          </th>
          <th v-if="showActions" class="w-20 px-3 py-2.5 text-right">
            <BaseSkeleton width="50px" height="12px" radius="sm" class="ml-auto" />
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-[#F1F5F9]">
        <tr v-for="r in rows" :key="'row-' + r" class="hover:bg-[#F8FAFC] transition-colors">
          <td v-if="showCheckboxes" class="w-10 px-3 py-3">
            <BaseSkeleton width="16px" height="16px" radius="sm" />
          </td>
          <td v-for="c in cols" :key="'cell-' + r + '-' + c" class="px-3 py-3">
            <div class="flex items-center gap-2">
              <BaseSkeleton
                v-if="c === 1"
                width="24px"
                height="24px"
                radius="full"
                class="shrink-0"
              />
              <BaseSkeleton
                :width="c === 1 ? '75%' : c === 2 ? '60%' : c === 3 ? '45%' : '80%'"
                height="14px"
                radius="md"
              />
            </div>
          </td>
          <td v-if="showActions" class="w-20 px-3 py-3 text-right">
            <div class="flex items-center justify-end gap-1">
              <BaseSkeleton width="24px" height="24px" radius="md" />
              <BaseSkeleton width="24px" height="24px" radius="md" />
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
