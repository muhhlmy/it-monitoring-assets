<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

defineProps({
  isNavigationOpen: { type: Boolean, default: false },
})
defineEmits(['toggle-navigation'])

const route = useRoute()
const router = useRouter()
const { user, logout } = useAuth()
const searchQuery = ref('')
const isProfileOpen = ref(false)

const pageTitle = computed(() => {
  const titles = {
    '/': { title: 'Dashboard', subtitle: 'Overview & analytics' },
    '/assets': { title: 'Manajemen Aset IT', subtitle: 'Inventaris & status perangkat' },
    '/my-assets': { title: 'Aset Karyawan', subtitle: 'Daftar perangkat milik Anda' },
    '/submissions': { title: 'Pengajuan & Handover', subtitle: 'Formulir serah terima aset' },
    '/users': { title: 'Manajemen Pengguna', subtitle: 'Hak akses & akun pengguna' },
    '/logs': { title: 'Audit Log & Activity', subtitle: 'Catatan riwayat sistem' },
  }
  return titles[route.path] || { title: 'Modernize', subtitle: 'IT Asset System' }
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
  <header class="relative z-20 flex h-[72px] shrink-0 items-center justify-between border-b border-[#E5EAEF] bg-white/95 px-4 backdrop-blur-md sm:px-6 xl:px-8">
    
    <!-- Left Section: Toggle & Navigation / Search -->
    <div class="flex items-center gap-4 min-w-0">
      <button
        v-if="!isNavigationOpen"
        type="button"
        aria-label="Buka Sidepanel"
        title="Buka Sidepanel"
        aria-controls="app-navigation"
        :aria-expanded="isNavigationOpen"
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#2A3547] hover:bg-[#ECF2FF] hover:text-[#5D87FF] transition-all cursor-pointer"
        @click="$emit('toggle-navigation')"
      >
        <span aria-hidden="true" class="material-symbols-outlined text-[22px]">menu</span>
      </button>

      <!-- Page Title Header Info -->
      <div class="min-w-0 hidden sm:block">
        <h1 class="truncate text-[18px] font-extrabold tracking-tight text-[#2A3547]">{{ pageTitle.title }}</h1>
        <p class="truncate text-[11px] font-medium text-[#7C8BAC]">{{ pageTitle.subtitle }}</p>
      </div>

      <!-- Quick Search Bar -->
      <form class="relative hidden lg:flex items-center ml-4" role="search" @submit.prevent="submitSearch">
        <label for="global-asset-search" class="sr-only">Cari aset</label>
        <span aria-hidden="true" class="material-symbols-outlined absolute left-3.5 text-[18px] text-[#7C8BAC]">search</span>
        <input
          id="global-asset-search"
          v-model="searchQuery"
          type="search"
          autocomplete="off"
          placeholder="Search assets, serial..."
          class="h-10 w-64 rounded-full border border-[#DFE5EF] bg-[#F8FAFC] pl-10 pr-12 text-[12px] font-medium text-[#2A3547] placeholder-[#7C8BAC] outline-none transition-all focus:w-72 focus:bg-white focus:border-[#5D87FF]"
        />
        <button
          type="submit"
          :disabled="!searchQuery.trim()"
          class="absolute right-2 rounded-full bg-[#ECF2FF] px-2 py-0.5 text-[10px] font-bold text-[#5D87FF] hover:bg-[#5D87FF] hover:text-white disabled:opacity-30 transition-all"
        >
          Go
        </button>
      </form>
    </div>

    <!-- Right Section: Actions & Profile -->
    <div class="flex shrink-0 items-center gap-2 sm:gap-3">
      
      <!-- Language Pill Icon -->
      <button 
        type="button" 
        title="Bahasa (ID)"
        class="hidden sm:flex h-9 px-2.5 items-center gap-1.5 rounded-full border border-[#E5EAEF] bg-white text-[12px] font-bold text-[#2A3547] hover:bg-[#F8FAFC] transition-all"
      >
        <span class="text-[14px]">🇮🇩</span>
        <span class="text-[11px] text-[#7C8BAC]">ID</span>
      </button>

      <!-- Notification Bell -->
      <button 
        type="button" 
        title="Notifikasi"
        class="relative flex h-10 w-10 items-center justify-center rounded-full text-[#2A3547] hover:bg-[#ECF2FF] hover:text-[#5D87FF] transition-all"
      >
        <span aria-hidden="true" class="material-symbols-outlined text-[21px]">notifications</span>
        <span class="absolute top-2 right-2 flex h-2 w-2">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FA896B] opacity-75"></span>
          <span class="relative inline-flex rounded-full h-2 w-2 bg-[#FA896B]"></span>
        </span>
      </button>

      <!-- Cart / Quick Action Icon -->
      <button 
        type="button" 
        title="Aksi Cepat"
        class="relative flex h-10 w-10 items-center justify-center rounded-full text-[#2A3547] hover:bg-[#ECF2FF] hover:text-[#5D87FF] transition-all"
      >
        <span aria-hidden="true" class="material-symbols-outlined text-[21px]">widgets</span>
      </button>

      <div class="h-6 w-px bg-[#E5EAEF] mx-1"></div>

      <!-- User Profile Dropdown Trigger -->
      <div class="relative">
        <button
          type="button"
          @click="isProfileOpen = !isProfileOpen"
          class="flex items-center gap-2.5 rounded-full p-1 transition-all focus:outline-none ring-2 ring-transparent hover:ring-[#5D87FF]/30"
        >
          <div class="flex h-9 w-9 items-center justify-center rounded-full bg-[#5D87FF] text-[13px] font-extrabold text-white shadow-sm">
            {{ (user?.nama || 'P').charAt(0).toUpperCase() }}
          </div>
          <div class="hidden text-left lg:block">
            <p class="text-[12px] font-bold leading-tight text-[#2A3547]">{{ user?.nama || 'Pengguna' }}</p>
            <p class="text-[10px] font-medium leading-none text-[#7C8BAC] capitalize">{{ user?.role || 'Guest' }}</p>
          </div>
        </button>

        <!-- Dropdown Menu -->
        <Transition name="dropdown">
          <div
            v-if="isProfileOpen"
            class="absolute right-0 mt-2 w-56 rounded-2xl border border-[#E5EAEF] bg-white p-2 shadow-xl z-50"
            @click="isProfileOpen = false"
          >
            <div class="px-3 py-2 border-b border-[#F1F5F9] mb-1">
              <p class="text-[12px] font-bold text-[#2A3547]">{{ user?.nama || 'Pengguna' }}</p>
              <p class="text-[10px] text-[#7C8BAC] capitalize">{{ user?.role || 'Guest' }} • {{ user?.email || 'admin@esb.co.id' }}</p>
            </div>
            <button
              type="button"
              @click="logout"
              class="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-[12px] font-semibold text-[#FA896B] hover:bg-[#FDEDE8] transition-all text-left"
            >
              <span class="material-symbols-outlined text-[18px]">logout</span>
              Keluar Sistem
            </button>
          </div>
        </Transition>
      </div>

    </div>
  </header>
</template>

<style scoped>
.dropdown-enter-active,
.dropdown-leave-active { transition: all 0.15s ease; }
.dropdown-enter-from,
.dropdown-leave-to { opacity: 0; transform: translateY(6px); }
</style>

