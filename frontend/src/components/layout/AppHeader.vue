<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

defineProps({
  isNavigationOpen: { type: Boolean, default: false },
})
defineEmits(['toggle-navigation'])

const route = useRoute()
const router = useRouter()
const searchQuery = ref('')

const pageTitle = computed(() => {
  const titles = {
    '/': { title: 'Dashboard', subtitle: 'Pantau kondisi dan penggunaan seluruh aset IT.' },
    '/assets': { title: 'Manajemen Aset', subtitle: 'Kelola inventaris perangkat IT perusahaan.' },
    '/submissions': { title: 'Pengajuan', subtitle: 'Buat formulir serah terima aset IT perusahaan.' },
    '/users': { title: 'Manajemen Pengguna', subtitle: 'Atur data dan akses pengguna sistem.' },
  }
  return titles[route.path] || { title: 'AssetWise', subtitle: '' }
})

watch(
  () => [route.path, route.query.q],
  () => {
    searchQuery.value = route.path === '/assets' && typeof route.query.q === 'string'
      ? route.query.q
      : ''
  },
  { immediate: true },
)

function submitSearch() {
  const query = searchQuery.value.trim()
  if (!query) return
  router.push({ path: '/assets', query: { q: query } })
}
</script>

<template>
  <header class="relative z-20 flex h-[68px] shrink-0 items-center gap-3 border-b border-[#E2E8F0]/80 bg-white/90 px-4 backdrop-blur-xl sm:h-[76px] sm:gap-4 sm:px-6 xl:px-8">
    <button
      type="button"
      aria-label="Buka navigasi"
      aria-controls="app-navigation"
      :aria-expanded="isNavigationOpen"
      class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#DCE3EC] bg-white text-[#334155] shadow-sm hover:border-[#B8C6D8] hover:bg-[#F8FAFC] lg:hidden"
      @click="$emit('toggle-navigation')"
    >
      <span aria-hidden="true" class="material-symbols-outlined text-[20px]">menu</span>
    </button>

    <div class="min-w-0 flex-1">
      <div class="mb-1 hidden items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-[#94A3B8] sm:flex">
        <span>AssetWise</span>
        <span class="material-symbols-outlined text-[12px]">chevron_right</span>
        <span class="text-brand">{{ pageTitle.title }}</span>
      </div>
      <h1 class="truncate text-[16px] font-extrabold tracking-[-0.025em] text-[#172033] sm:text-[18px]">{{ pageTitle.title }}</h1>
      <p class="mt-0.5 hidden truncate text-[10px] font-medium text-[#64748B] xl:block">{{ pageTitle.subtitle }}</p>
    </div>

    <form class="relative hidden items-center md:flex" role="search" @submit.prevent="submitSearch">
      <label for="global-asset-search" class="sr-only">Cari aset</label>
      <span aria-hidden="true" class="material-symbols-outlined absolute left-3.5 text-[18px] text-[#94A3B8]">search</span>
      <input
        id="global-asset-search"
        v-model="searchQuery"
        type="search"
        autocomplete="off"
        placeholder="Cari label atau serial aset..."
        class="h-10 w-64 rounded-xl border border-[#DCE3EC] bg-[#F8FAFC] pl-10 pr-14 text-[11px] font-medium text-[#334155] placeholder-[#94A3B8] outline-none lg:w-72"
      />
      <button
        type="submit"
        :disabled="!searchQuery.trim()"
        class="button-text-xs absolute right-2 rounded-md border border-[#DCE3EC] bg-white px-1.5 py-0.5 font-bold text-[#64748B] shadow-sm hover:bg-[#F1F5F9] disabled:cursor-not-allowed disabled:opacity-40"
      >
        Enter
      </button>
    </form>

    <div class="h-8 w-px bg-[#E2E8F0]"></div>

    <div class="flex shrink-0 items-center gap-2" aria-label="Pengguna aktif: Admin IT">
      <div class="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#FAA425] to-[#FC841B] text-[12px] font-extrabold text-white shadow-md shadow-orange-200/70">
        A
        <span class="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500"></span>
      </div>
      <div class="hidden min-w-0 lg:block">
        <p class="text-[10px] font-bold leading-none text-[#172033]">Admin IT</p>
        <p class="mt-1 text-[8px] font-medium leading-none text-[#94A3B8]">Administrator</p>
      </div>
    </div>
  </header>
</template>
