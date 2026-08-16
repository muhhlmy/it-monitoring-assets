<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const moduleTitle = computed(() => {
  if (route.path.includes('assets-ga')) return 'Aset General Affair (GA)'
  if (route.path.includes('assets-ops')) return 'Aset Operasional (Ops)'
  return 'Modul Aset'
})

const moduleCategory = computed(() => {
  if (route.path.includes('assets-ga')) return 'General Affair & Facility Inventory'
  if (route.path.includes('assets-ops')) return 'Store & Operational Equipment Inventory'
  return 'Asset Management Module'
})

const moduleIcon = computed(() => {
  if (route.path.includes('assets-ga')) return 'domain'
  if (route.path.includes('assets-ops')) return 'precision_manufacturing'
  return 'inventory_2'
})
</script>

<template>
  <div class="flex flex-col items-center justify-center min-h-[calc(100vh-140px)] py-12 px-4">
    <div class="w-full max-w-lg rounded-2xl border border-[#E2E8F0] bg-white p-8 shadow-sm text-center relative overflow-hidden">
      <!-- Top Decorative Accent -->
      <div class="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#2563EB] via-[#6366F1] to-[#3B82F6]"></div>

      <!-- Icon Badge -->
      <div class="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#EFF6FF] text-[#2563EB] shadow-2xs">
        <span class="material-symbols-outlined text-[32px]">{{ moduleIcon }}</span>
      </div>

      <!-- Status Pill -->
      <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-[#EEF2FF] text-[#4F46E5] border border-[#C7D2FE] mb-3">
        <span class="h-1.5 w-1.5 rounded-full bg-[#4F46E5] animate-ping"></span>
        <span>Dalam Pengembangan (Coming Soon)</span>
      </span>

      <!-- Title & Subtitle -->
      <h2 class="text-xl font-bold text-[#0F172A] tracking-tight">{{ moduleTitle }}</h2>
      <p class="text-xs font-medium text-[#64748B] mt-1">{{ moduleCategory }}</p>

      <p class="text-xs text-[#475569] leading-relaxed mt-4 max-w-md mx-auto">
        Modul pencatatan dan tata kelola <strong>{{ moduleTitle }}</strong> sedang disiapkan. Fitur lacak siklus, alokasi inventaris, dan audit laporan akan segera tersedia pada versi mendatang.
      </p>

      <!-- Action Buttons -->
      <div class="mt-7 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          @click="router.push('/assets')"
          class="h-9 px-4 rounded-lg bg-[#2563EB] text-xs font-semibold text-white hover:bg-[#1D4ED8] transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
        >
          <span class="material-symbols-outlined text-[16px]">devices</span>
          <span>Buka Aset IT</span>
        </button>

        <button
          type="button"
          @click="router.push('/')"
          class="h-9 px-4 rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-[#475569] hover:bg-[#F8FAFC] hover:text-[#0F172A] transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
        >
          <span class="material-symbols-outlined text-[16px]">dashboard</span>
          <span>Dashboard</span>
        </button>
      </div>
    </div>
  </div>
</template>
