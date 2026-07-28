<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

const props = defineProps({
  isOpen: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])
const route = useRoute()
const sidebarRef = ref(null)
const closeButtonRef = ref(null)
let previouslyFocusedElement = null

const { user, isSuperAdmin, logout, hasPermission } = useAuth()

const menuGroups = computed(() => {
  const groups = [
    {
      title: 'HOME',
      items: [
        {
          to: '/',
          label: 'Dashboard',
          icon: 'grid_view',
          caption: 'Ringkasan sistem',
          permission: 'dashboard',
          badge: 'New',
        },
      ],
    },
    {
      title: 'INVENTARIS',
      items: [
        {
          to: '/assets',
          label: 'Aset IT',
          icon: 'devices',
          caption: 'Inventaris perangkat',
          permission: 'assets',
        },
        {
          to: '/my-assets',
          label: 'Aset Karyawan',
          icon: 'badge',
          caption: 'Aset per karyawan',
          permission: 'my_assets',
        },
      ],
    },
    {
      title: 'TRANSAKSI',
      items: [
        {
          to: '/tickets',
          label: 'Tiket IT',
          icon: 'confirmation_number',
          caption: 'Kendala & Laporan IT',
          permission: 'tickets',
          badge: 'New',
        },
        {
          to: '/submissions',
          label: 'Pengajuan',
          icon: 'assignment',
          caption: 'Serah terima aset',
          permission: 'submissions',
        },
      ],
    },
    {
      title: 'ADMINISTRASI',
      items: [
        {
          to: '/users',
          label: 'Pengguna',
          icon: 'group',
          caption: 'Akses pengguna',
          permission: 'users',
        },
        {
          to: '/logs',
          label: 'Log Aktivitas',
          icon: 'receipt_long',
          caption: 'Riwayat & audit log',
          permission: 'logs',
        },
      ],
    },
  ]

  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter((item) => hasPermission(item.permission)),
    }))
    .filter((g) => g.items.length > 0)
})

function getFocusableElements() {
  if (!sidebarRef.value) return []
  return Array.from(
    sidebarRef.value.querySelectorAll(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  )
}

function handleKeydown(event) {
  if (!props.isOpen) return
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
    return
  }
  if (event.key !== 'Tab') return

  const elements = getFocusableElements()
  const firstElement = elements[0]
  const lastElement = elements.at(-1)
  if (event.shiftKey && document.activeElement === firstElement) {
    event.preventDefault()
    lastElement?.focus()
  } else if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault()
    firstElement?.focus()
  }
}

watch(
  () => props.isOpen,
  async (isOpen) => {
    if (isOpen) {
      previouslyFocusedElement = document.activeElement
      await nextTick()
      closeButtonRef.value?.focus()
    } else if (previouslyFocusedElement) {
      previouslyFocusedElement.focus?.()
      previouslyFocusedElement = null
    }
  },
)

onMounted(() => document.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <Transition name="sidebar-backdrop">
    <button
      v-if="isOpen"
      type="button"
      aria-label="Tutup navigasi"
      tabindex="-1"
      class="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-xs lg:hidden"
      @click="emit('close')"
    ></button>
  </Transition>

  <aside
    id="app-navigation"
    ref="sidebarRef"
    :role="isOpen ? 'dialog' : undefined"
    :aria-modal="isOpen ? 'true' : undefined"
    aria-label="Navigasi aplikasi"
    class="fixed inset-y-0 left-0 z-40 flex h-dvh shrink-0 flex-col overflow-hidden border-r border-[#E5EAEF] bg-white text-[#2A3547] shadow-xl transition-all duration-300 ease-in-out lg:static lg:z-10 lg:shadow-none"
    :class="isOpen 
      ? 'w-[270px] translate-x-0 visible opacity-100 lg:w-[260px]' 
      : 'w-0 -translate-x-full invisible opacity-0 border-r-0 pointer-events-none'"
  >
    <!-- Brand Logo Top Header -->
    <div
      class="relative flex h-[72px] shrink-0 items-center justify-between gap-3 px-6 border-b border-transparent min-w-[260px]"
    >
      <div class="flex items-center gap-2.5">
        <img src="/ESB Logo.svg" width="110" alt="ESB Logo" />
      </div>
      <button
        ref="closeButtonRef"
        type="button"
        aria-label="Tutup navigasi"
        title="Sembunyikan Sidepanel"
        class="flex h-8 w-8 items-center justify-center rounded-lg text-[#7C8BAC] hover:bg-[#ECF2FF] hover:text-[#5D87FF] transition-all cursor-pointer"
        @click="emit('close')"
      >
        <span aria-hidden="true" class="material-symbols-outlined text-[20px]">menu_open</span>
      </button>
    </div>

    <!-- Sidebar Scrollable Menu -->
    <div class="relative flex-1 overflow-y-auto px-4 py-4 space-y-6 min-w-[260px]">
      <div v-for="group in menuGroups" :key="group.title">
        <p class="mb-2.5 px-3 text-[11px] font-bold uppercase tracking-wider text-[#7C8BAC]">
          {{ group.title }}
        </p>
        <nav class="space-y-1">
          <RouterLink
            v-for="item in group.items"
            :key="item.to"
            :to="item.to"
            class="group flex items-center gap-3.5 rounded-xl px-3.5 py-3 transition-all duration-150"
            :class="
              route.path === item.to
                ? 'bg-[#5D87FF] text-white shadow-md shadow-blue-500/25 font-semibold'
                : 'text-[#2A3547] hover:bg-[#ECF2FF] hover:text-[#5D87FF] font-medium'
            "
            @click="emit('close')"
          >
            <span
              aria-hidden="true"
              class="material-symbols-outlined text-[20px] transition-colors"
              :class="
                route.path === item.to ? 'text-white' : 'text-[#7C8BAC] group-hover:text-[#5D87FF]'
              "
              >{{ item.icon }}</span
            >
            <span class="min-w-0 flex-1 text-[13px] tracking-wide leading-none">{{
              item.label
            }}</span>
            <span
              v-if="item.badge"
              class="rounded-full px-2 py-0.5 text-[10px] font-bold"
              :class="
                route.path === item.to ? 'bg-white/20 text-white' : 'bg-[#ECF2FF] text-[#5D87FF]'
              "
            >
              {{ item.badge }}
            </span>
          </RouterLink>
        </nav>
      </div>
    </div>

    <!-- Bottom User Profile Card -->
    <div class="relative p-4 min-w-[260px]">
      <div
        class="flex items-center justify-between rounded-2xl bg-[#ECF2FF] border border-[#D2E3FF] p-3 transition-all"
      >
        <div class="flex items-center gap-3 min-w-0">
          <div
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#5D87FF] text-[13px] font-extrabold text-white shadow-md shadow-blue-500/20"
          >
            {{ user?.nama ? user.nama.charAt(0).toUpperCase() : 'U' }}
          </div>
          <div class="min-w-0">
            <p class="truncate text-[12px] font-bold text-[#2A3547] leading-tight">
              {{ user?.nama || 'Pengguna' }}
            </p>
            <p class="mt-0.5 truncate text-[10px] font-medium text-[#7C8BAC] capitalize">
              {{ user?.role || 'Guest' }}
            </p>
          </div>
        </div>
        <button
          type="button"
          @click="logout"
          title="Keluar / Logout"
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#5D87FF] hover:bg-white hover:text-red-500 transition-all shadow-xs"
        >
          <span aria-hidden="true" class="material-symbols-outlined text-[18px]"
            >power_settings_new</span
          >
        </button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar-backdrop-enter-active,
.sidebar-backdrop-leave-active {
  transition: opacity 0.2s ease;
}
.sidebar-backdrop-enter-from,
.sidebar-backdrop-leave-to {
  opacity: 0;
}
</style>
