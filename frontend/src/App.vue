<script setup>
// App.vue — Layout utama: sidebar kiri + konten kanan
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useApi } from './composables/useApi.js'
import AppSidebar from './components/layout/AppSidebar.vue'
import AppHeader  from './components/layout/AppHeader.vue'

const route = useRoute()

// Evaluasi robust apakah halaman saat ini adalah Login / Unauthenticated
const isLoginPage = computed(() => {
  if (route.name === 'login') return true
  if (route.path === '/login') return true
  if (typeof window !== 'undefined' && window.location.pathname.endsWith('/login')) return true
  if (typeof window !== 'undefined' && !localStorage.getItem('token')) return true
  return false
})

// Dual state navigasi sesuai Plan.md (mobile drawer vs desktop collapse)
const isMobileNavigationOpen = ref(false)
const isDesktopSidebarCollapsed = ref(
  typeof window !== 'undefined'
    ? localStorage.getItem('app_sidebar_collapsed') === 'true'
    : false
)

watch(isDesktopSidebarCollapsed, (val) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('app_sidebar_collapsed', String(val))
  }
})

watch(
  () => route.fullPath,
  () => {
    isMobileNavigationOpen.value = false
  },
)

const { post } = useApi()

onMounted(async () => {
  try {
    // Rekam audit log sukses login setiap kali aplikasi dimuat di browser
    await post('/api/logs/audit', {
      nama_pengguna: 'Admin IT',
      email: 'admin@esb.co.id',
      aktifitas: 'LOGIN',
      ip_address: '127.0.0.1',
      browser: navigator.userAgent
    })
  } catch (error) {
    console.error('Gagal merekam audit login:', error)
  }
})
</script>

<template>
  <template v-if="isLoginPage">
    <RouterView />
  </template>

  <template v-else>
    <a
      href="#main-content"
      class="fixed left-4 top-3 z-[100] -translate-y-20 rounded-lg bg-[#111827] px-4 py-2 text-sm font-bold text-white transition-transform focus:translate-y-0"
    >
      Lewati ke konten utama
    </a>

    <div class="app-shell relative flex h-dvh min-h-0 overflow-hidden bg-[#F8FAFC]">

      <!-- ── Sidebar Navigasi ── -->
      <AppSidebar
        :is-mobile-open="isMobileNavigationOpen"
        :is-collapsed="isDesktopSidebarCollapsed"
        @close-mobile="isMobileNavigationOpen = false"
        @toggle-collapse="isDesktopSidebarCollapsed = !isDesktopSidebarCollapsed"
      />

      <!-- ── Area Konten Kanan ── -->
      <div class="relative flex min-w-0 flex-1 flex-col overflow-hidden">

        <!-- Header: search + actions -->
        <AppHeader
          :is-mobile-open="isMobileNavigationOpen"
          :is-collapsed="isDesktopSidebarCollapsed"
          @toggle-mobile="isMobileNavigationOpen = !isMobileNavigationOpen"
          @toggle-collapse="isDesktopSidebarCollapsed = !isDesktopSidebarCollapsed"
        />

        <!-- Konten halaman aktif, scrollable -->
        <main id="main-content" tabindex="-1" class="app-main flex-1 overflow-y-auto p-4 outline-none sm:p-6 xl:p-8">
          <div class="mx-auto w-full max-w-[1560px]">
            <RouterView />
          </div>
        </main>

      </div>
    </div>
  </template>
</template>
