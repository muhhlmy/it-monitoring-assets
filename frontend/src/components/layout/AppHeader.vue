<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useApi } from '@/composables/useApi'

defineProps({
  isMobileOpen: { type: Boolean, default: false },
  isCollapsed:  { type: Boolean, default: false },
})
defineEmits(['toggle-mobile', 'toggle-collapse'])

const route  = useRoute()
const router = useRouter()
const { user, logout } = useAuth()
const { get } = useApi()

const searchQuery     = ref('')
const isProfileOpen   = ref(false)
const isNotifOpen     = ref(false)

// Notification / Ticket state
const allTickets      = ref([])
const seenTicketIds   = ref(new Set(JSON.parse(localStorage.getItem('seen_ticket_ids') || '[]')))
const isFetchingNotif = ref(false)

const latestTickets = computed(() =>
  [...allTickets.value]
    .sort((a, b) => new Date(b.dibuat_pada) - new Date(a.dibuat_pada))
    .slice(0, 6)
)

const unreadCount = computed(() =>
  latestTickets.value.filter(t => !seenTicketIds.value.has(t.id)).length
)

async function fetchTickets() {
  if (isFetchingNotif.value) return
  isFetchingNotif.value = true
  try {
    const data = await get('/api/tickets')
    if (Array.isArray(data)) allTickets.value = data
  } catch (_) {
    // silently fail
  } finally {
    isFetchingNotif.value = false
  }
}

function toggleNotif() {
  isNotifOpen.value = !isNotifOpen.value
  if (isNotifOpen.value) markAllSeen()
  isProfileOpen.value = false
}

function markAllSeen() {
  latestTickets.value.forEach(t => seenTicketIds.value.add(t.id))
  localStorage.setItem('seen_ticket_ids', JSON.stringify([...seenTicketIds.value]))
}

function goToTicket(id) {
  isNotifOpen.value = false
  router.push({ path: '/tickets', query: { id } })
}

function goToAllTickets() {
  isNotifOpen.value = false
  router.push('/tickets')
}

function statusColor(status) {
  const s = (status || '').toLowerCase()
  if (s === 'open')        return 'bg-[#FEF3C7] text-[#D97706]'
  if (s === 'in progress') return 'bg-[#DBEAFE] text-[#2563EB]'
  if (s === 'resolved')    return 'bg-[#DCFCE7] text-[#16A34A]'
  if (s === 'closed')      return 'bg-[#F3F4F6] text-[#6B7280]'
  return 'bg-[#EDE9FE] text-[#7C3AED]'
}

function priorityDot(prioritas) {
  const p = (prioritas || '').toLowerCase()
  if (p.includes('critical') || p.includes('high')) return 'bg-[#EF4444]'
  if (p.includes('medium'))  return 'bg-[#F59E0B]'
  return 'bg-[#6B7280]'
}

function relativeTime(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'Baru saja'
  if (m < 60) return `${m} mnt lalu`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} jam lalu`
  const d = Math.floor(h / 24)
  return `${d} hari lalu`
}

const pageTitle = computed(() => {
  const titles = {
    '/':            { title: 'Dashboard',            subtitle: 'Overview & analytics' },
    '/assets':      { title: 'Manajemen Aset IT',    subtitle: 'Inventaris & status perangkat' },
    '/my-assets':   { title: 'Aset Karyawan',        subtitle: 'Daftar perangkat milik Anda' },
    '/tickets':     { title: 'Tiket Kendala IT',     subtitle: 'Pengajuan & riwayat tiket' },
    '/submissions': { title: 'Pengajuan & Handover', subtitle: 'Formulir serah terima aset' },
    '/users':       { title: 'Manajemen Pengguna',   subtitle: 'Hak akses & akun pengguna' },
    '/logs':        { title: 'Audit Log & Activity', subtitle: 'Catatan riwayat sistem' },
  }
  return titles[route.path] || { title: 'Modernize', subtitle: 'IT Asset System' }
})

function submitSearch() {
  const query = searchQuery.value.trim()
  if (!query) return
  router.push({ path: '/assets', query: { q: query } })
}

watch(
  () => [route.path, route.query.q],
  () => {
    searchQuery.value = route.path === '/assets' && typeof route.query.q === 'string'
      ? route.query.q
      : ''
    isNotifOpen.value   = false
    isProfileOpen.value = false
  },
  { immediate: true },
)

let pollTimer
onMounted(() => {
  fetchTickets()
  pollTimer = setInterval(fetchTickets, 30000)
})
onBeforeUnmount(() => clearInterval(pollTimer))
</script>

<template>
  <header class="relative z-20 flex h-[72px] shrink-0 items-center justify-between border-b border-[#E5EAEF] bg-white/95 px-4 backdrop-blur-md sm:px-6 xl:px-8">

    <div class="flex items-center gap-4 min-w-0">
      <!-- Toggle Mobile Drawer (lg:hidden) -->
      <button
        type="button"
        aria-label="Buka Navigasi Mobile"
        title="Buka Navigasi Mobile"
        class="flex lg:hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#2A3547] hover:bg-[#ECF2FF] hover:text-[#5D87FF] transition-all cursor-pointer"
        @click="$emit('toggle-mobile')"
      >
        <span aria-hidden="true" class="material-symbols-outlined text-[22px]">menu</span>
      </button>

      <!-- Toggle Desktop Collapse (hidden lg:flex) saat collapsed -->
      <button
        v-if="isCollapsed"
        type="button"
        aria-label="Perluas Sidepanel Desktop"
        title="Perluas Sidepanel Desktop"
        class="hidden lg:flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#2A3547] hover:bg-[#ECF2FF] hover:text-[#5D87FF] transition-all cursor-pointer"
        @click="$emit('toggle-collapse')"
      >
        <span aria-hidden="true" class="material-symbols-outlined text-[22px]">menu</span>
      </button>

      <div class="min-w-0 hidden sm:block">
        <h1 class="truncate text-[18px] font-extrabold tracking-tight text-[#2A3547]">{{ pageTitle.title }}</h1>
        <p class="truncate text-[11px] font-medium text-[#7C8BAC]">{{ pageTitle.subtitle }}</p>
      </div>

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

    <div class="flex shrink-0 items-center gap-2 sm:gap-3">

      <!-- Notification Bell -->
      <div class="relative">
        <button
          id="notif-bell-btn"
          type="button"
          :title="unreadCount > 0 ? `Tiket baru (${unreadCount})` : 'Notifikasi Tiket'"
          @click="toggleNotif"
          class="relative flex h-10 w-10 items-center justify-center rounded-full transition-all"
          :class="isNotifOpen ? 'bg-[#ECF2FF] text-[#5D87FF]' : 'text-[#2A3547] hover:bg-[#ECF2FF] hover:text-[#5D87FF]'"
        >
          <span aria-hidden="true" class="material-symbols-outlined text-[21px]">notifications</span>
          <Transition name="badge-pop">
            <span
              v-if="unreadCount > 0"
              class="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#FA896B] px-1 text-[9px] font-black text-white shadow"
            >{{ unreadCount > 9 ? '9+' : unreadCount }}</span>
          </Transition>
          <span v-if="unreadCount > 0 && !isNotifOpen" class="pointer-events-none absolute top-1.5 right-1.5 flex h-2 w-2">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FA896B] opacity-60"></span>
          </span>
        </button>

        <!-- Notification Dropdown Panel -->
        <Transition name="dropdown">
          <div
            v-if="isNotifOpen"
            class="absolute right-0 mt-2 w-80 rounded-2xl border border-[#E5EAEF] bg-white shadow-2xl z-50 overflow-hidden"
            @click.stop
          >
            <div class="flex items-center justify-between px-4 py-3 border-b border-[#F1F5F9]">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-[18px] text-[#5D87FF]">confirmation_number</span>
                <span class="text-[13px] font-extrabold text-[#2A3547]">Tiket Masuk</span>
                <span
                  v-if="unreadCount > 0"
                  class="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#FA896B] px-1.5 text-[9px] font-black text-white"
                >{{ unreadCount }}</span>
              </div>
              <button
                type="button"
                @click="isNotifOpen = false"
                class="flex h-6 w-6 items-center justify-center rounded-full hover:bg-[#F1F5F9] text-[#7C8BAC] transition-all"
              >
                <span class="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>

            <div class="max-h-[340px] overflow-y-auto divide-y divide-[#F8FAFC]">
              <div v-if="isFetchingNotif && latestTickets.length === 0" class="flex items-center justify-center gap-2 py-8 text-[12px] text-[#9CA3AF]">
                <div class="w-4 h-4 border-2 border-[#E5E7EB] border-t-[#5D87FF] rounded-full animate-spin"></div>
                Memuat tiket...
              </div>

              <div v-else-if="latestTickets.length === 0" class="flex flex-col items-center gap-2 py-10 text-center">
                <span class="material-symbols-outlined text-[40px] text-[#D1D5DB]">inbox</span>
                <p class="text-[12px] text-[#9CA3AF]">Belum ada tiket masuk</p>
              </div>

              <button
                v-for="ticket in latestTickets"
                :key="ticket.id"
                type="button"
                @click="goToTicket(ticket.id)"
                class="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[#F8FAFC] transition-all group"
                :class="!seenTicketIds.has(ticket.id) ? 'bg-[#F0F5FF]' : ''"
              >
                <span class="mt-1.5 h-2 w-2 shrink-0 rounded-full" :class="priorityDot(ticket.prioritas)"></span>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5 mb-0.5">
                    <span v-if="!seenTicketIds.has(ticket.id)" class="h-1.5 w-1.5 rounded-full bg-[#5D87FF] shrink-0"></span>
                    <p class="text-[12px] font-bold text-[#2A3547] truncate leading-tight group-hover:text-[#5D87FF] transition-colors">
                      {{ ticket.judul }}
                    </p>
                  </div>
                  <div class="flex items-center gap-1.5 flex-wrap mt-0.5">
                    <span class="text-[10px] text-[#9CA3AF]">{{ ticket.nomor_tiket || '#' + ticket.id }}</span>
                    <span class="text-[10px] text-[#CBD5E1]">·</span>
                    <span class="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide" :class="statusColor(ticket.status_tiket)">{{ ticket.status_tiket }}</span>
                    <span class="text-[10px] text-[#CBD5E1]">·</span>
                    <span class="text-[10px] text-[#9CA3AF]">{{ relativeTime(ticket.dibuat_pada) }}</span>
                  </div>
                  <p v-if="ticket.pelapor" class="text-[10px] text-[#B0BAC9] mt-0.5 truncate">Dari: {{ ticket.pelapor }}</p>
                </div>
                <span class="material-symbols-outlined text-[15px] text-[#CBD5E1] group-hover:text-[#5D87FF] shrink-0 mt-1 transition-colors">chevron_right</span>
              </button>
            </div>

            <div class="px-4 py-2.5 border-t border-[#F1F5F9] bg-[#F8FAFC]">
              <button
                type="button"
                @click="goToAllTickets"
                class="flex w-full items-center justify-center gap-1.5 rounded-xl py-1.5 text-[11px] font-bold text-[#5D87FF] hover:bg-[#ECF2FF] transition-all"
              >
                <span class="material-symbols-outlined text-[15px]">open_in_new</span>
                Lihat Semua Tiket
              </button>
            </div>
          </div>
        </Transition>

        <div v-if="isNotifOpen" class="fixed inset-0 z-40" @click="isNotifOpen = false"></div>
      </div>

      <div class="h-6 w-px bg-[#E5EAEF] mx-1"></div>

      <!-- User Profile -->
      <div class="relative">
        <button
          type="button"
          @click="isProfileOpen = !isProfileOpen; isNotifOpen = false"
          class="flex items-center gap-2.5 rounded-full p-1 transition-all focus:outline-none ring-2 ring-transparent hover:ring-[#5D87FF]/30"
        >
          <div class="flex h-9 w-9 items-center justify-center rounded-full bg-[#5D87FF] text-[13px] font-extrabold text-white shadow-sm">
            {{ (user && user.nama ? user.nama.charAt(0) : 'P').toUpperCase() }}
          </div>
          <div class="hidden text-left lg:block">
            <p class="text-[12px] font-bold leading-tight text-[#2A3547]">{{ user ? user.nama : 'Pengguna' }}</p>
            <p class="text-[10px] font-medium leading-none text-[#7C8BAC] capitalize">{{ user ? user.role : 'Guest' }}</p>
          </div>
        </button>

        <Transition name="dropdown">
          <div
            v-if="isProfileOpen"
            class="absolute right-0 mt-2 w-56 rounded-2xl border border-[#E5EAEF] bg-white p-2 shadow-xl z-50"
            @click="isProfileOpen = false"
          >
            <div class="px-3 py-2 border-b border-[#F1F5F9] mb-1">
              <p class="text-[12px] font-bold text-[#2A3547]">{{ user ? user.nama : 'Pengguna' }}</p>
              <p class="text-[10px] text-[#7C8BAC] capitalize">{{ user ? user.role : 'Guest' }} {{ user && user.email ? '• ' + user.email : '' }}</p>
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

.badge-pop-enter-active { transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1); }
.badge-pop-leave-active { transition: all 0.15s ease; }
.badge-pop-enter-from,
.badge-pop-leave-to { opacity: 0; transform: scale(0.5); }
</style>
