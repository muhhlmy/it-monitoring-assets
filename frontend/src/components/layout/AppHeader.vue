<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useApi } from '@/composables/useApi'
import { useTicketEvents } from '@/composables/useTicketEvents'

defineProps({
  isMobileOpen: { type: Boolean, default: false },
  isCollapsed:  { type: Boolean, default: false },
})
defineEmits(['toggle-mobile', 'toggle-collapse'])

const route  = useRoute()
const router = useRouter()
const { user, logout, isAdmin, isUser, isSuperAdmin, hasPermission } = useAuth()
const { get } = useApi()
const { connect: connectSSE, disconnect: disconnectSSE, on: onSSE } = useTicketEvents()

const searchQuery     = ref('')
const isProfileOpen   = ref(false)
const isNotifOpen     = ref(false)

// Notification / Activity State
const allTickets         = ref([])
const notificationsList  = ref([])
const knownTicketStates  = ref({})
const isFetchingNotif    = ref(false)

function loadNotifications() {
  try {
    const stored = localStorage.getItem('app_notifications')
    if (stored) notificationsList.value = JSON.parse(stored)
    const storedStates = localStorage.getItem('known_ticket_states')
    if (storedStates) knownTicketStates.value = JSON.parse(storedStates)
  } catch (_) {
    notificationsList.value = []
    knownTicketStates.value = {}
  }
}

function persistNotifications() {
  try {
    localStorage.setItem('app_notifications', JSON.stringify(notificationsList.value))
    localStorage.setItem('known_ticket_states', JSON.stringify(knownTicketStates.value))
  } catch (_) {}
}

function addNotificationItem({ ticketId, type, title, message, nomor_tiket, judul_tiket, status_tiket, prioritas, pelapor, timestamp }) {
  const ts = timestamp || Date.now()
  const msg = message || (type === 'CREATED' ? 'Tiket baru telah dibuat' : 'Detail tiket diperbarui')

  // Deduplicate: avoid adding identical notification for the same ticket within 5 seconds
  const recentDuplicate = notificationsList.value.find(n =>
    n.ticketId === ticketId &&
    n.type === type &&
    n.message === msg &&
    Math.abs((n.timestamp || 0) - ts) < 5000
  )
  if (recentDuplicate) return

  const notif = {
    id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    ticketId,
    type,
    title: title || (type === 'CREATED' ? 'Tiket Baru Masuk' : type === 'COMMENT' ? 'Komentar Baru' : 'Perubahan Tiket'),
    message: msg,
    nomor_tiket: nomor_tiket || `#${ticketId}`,
    judul_tiket: judul_tiket || 'Tiket',
    status_tiket: status_tiket || 'Open',
    prioritas: prioritas || 'Medium (3d)',
    pelapor: pelapor || '',
    timestamp: ts,
    isRead: false,
  }

  notificationsList.value = [notif, ...notificationsList.value].slice(0, 50)
  persistNotifications()
}

function seedNotificationsFromTickets(ticketsList) {
  if (notificationsList.value.length > 0) return
  const items = ticketsList.slice(0, 10).map(t => ({
    id: `notif_seed_${t.id}`,
    ticketId: t.id,
    type: 'CREATED',
    title: 'Tiket Masuk',
    message: t.judul,
    nomor_tiket: t.nomor_tiket,
    judul_tiket: t.judul,
    status_tiket: t.status_tiket,
    prioritas: t.prioritas,
    pelapor: t.pelapor || t.pelapor_nama || '',
    timestamp: new Date(t.diperbarui_pada || t.dibuat_pada).getTime(),
    isRead: true,
  }))
  notificationsList.value = items
  persistNotifications()
}

function syncTicketStatusChanges(ticketsList) {
  if (!Array.isArray(ticketsList)) return
  const isFirstLoad = Object.keys(knownTicketStates.value).length === 0

  for (const t of ticketsList) {
    const prev = knownTicketStates.value[t.id]
    if (prev && !isFirstLoad) {
      if (prev.status && prev.status !== t.status_tiket) {
        addNotificationItem({
          ticketId: t.id,
          type: 'UPDATED',
          title: `Perubahan Tiket: ${t.judul}`,
          message: `Status: '${prev.status}' → '${t.status_tiket}'`,
          nomor_tiket: t.nomor_tiket,
          judul_tiket: t.judul,
          status_tiket: t.status_tiket,
          prioritas: t.prioritas,
          pelapor: t.pelapor || t.pelapor_nama || '',
          timestamp: new Date(t.diperbarui_pada || Date.now()).getTime(),
        })
      } else if (prev.assignedTo !== t.assigned_to && t.assigned_to) {
        addNotificationItem({
          ticketId: t.id,
          type: 'UPDATED',
          title: `Perubahan Tiket: ${t.judul}`,
          message: `Ditangani oleh ${t.assigned_to}`,
          nomor_tiket: t.nomor_tiket,
          judul_tiket: t.judul,
          status_tiket: t.status_tiket,
          prioritas: t.prioritas,
          pelapor: t.pelapor || t.pelapor_nama || '',
          timestamp: new Date(t.diperbarui_pada || Date.now()).getTime(),
        })
      }
    }

    knownTicketStates.value[t.id] = {
      status: t.status_tiket,
      assignedTo: t.assigned_to,
      updatedAt: t.diperbarui_pada,
    }
  }

  persistNotifications()
}

const latestNotifications = computed(() =>
  [...notificationsList.value].slice(0, 8)
)

const unreadCount = computed(() =>
  notificationsList.value.filter(n => !n.isRead).length
)

async function fetchTickets() {
  if (isFetchingNotif.value) return
  isFetchingNotif.value = true
  try {
    const data = await get('/api/tickets')
    if (Array.isArray(data)) {
      allTickets.value = data
      seedNotificationsFromTickets(data)
      syncTicketStatusChanges(data)
    }
  } catch (_) {
    // silently fail
  } finally {
    isFetchingNotif.value = false
  }
}

function toggleNotif() {
  isNotifOpen.value = !isNotifOpen.value
  if (isNotifOpen.value) markAllNotificationsRead()
  isProfileOpen.value = false
}

function markAllNotificationsRead() {
  notificationsList.value.forEach(n => { n.isRead = true })
  persistNotifications()
}

function goToNotif(notif) {
  notif.isRead = true
  persistNotifications()
  isNotifOpen.value = false
  router.push({ path: '/tickets', query: { id: notif.ticketId } })
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

function relativeTime(dateStrOrMs) {
  if (!dateStrOrMs) return ''
  const timestamp = typeof dateStrOrMs === 'number' ? dateStrOrMs : new Date(dateStrOrMs).getTime()
  const diff = Date.now() - timestamp
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
  if (!hasPermission('tickets')) return
  loadNotifications()
  fetchTickets()
  // Polling 30 detik dipertahankan sebagai safety net bila SSE putus / gagal reconnect.
  pollTimer = setInterval(fetchTickets, 30000)

  // Realtime push via SSE: bell update instan saat ada tiket baru / perubahan.
  connectSSE()

  if (isSuperAdmin.value) {
    // ── SUPER ADMIN ──
    // Menerima SEMUA notif (tiket baru + perubahan apapun pada tiket)
    // KECUALI aksi yang dilakukan oleh superadmin sendiri (sudah difilter backend).
    onSSE('TICKET_CREATED', (data) => {
      if (data && typeof data === 'object') {
        addNotificationItem({
          ticketId: data.id,
          type: 'CREATED',
          title: 'Tiket Baru Masuk',
          message: data.judul,
          nomor_tiket: data.nomor_tiket,
          judul_tiket: data.judul,
          status_tiket: data.status_tiket,
          prioritas: data.prioritas,
          pelapor: data.pelapor,
        })
        if (!allTickets.value.some(t => t.id === data.id)) {
          allTickets.value = [data, ...allTickets.value]
        }
      }
      fetchTickets()
    })
    onSSE('TICKET_UPDATED', (data) => {
      if (data && data.id != null) {
        const changesText = Array.isArray(data.changes) && data.changes.length > 0
          ? data.changes.join('. ')
          : 'Detail tiket diperbarui'

        addNotificationItem({
          ticketId: data.id,
          type: 'UPDATED',
          title: data.judul ? `Perubahan Tiket: ${data.judul}` : 'Perubahan Tiket',
          message: changesText,
          nomor_tiket: data.nomor_tiket,
          judul_tiket: data.judul,
          status_tiket: data.status_tiket,
          prioritas: data.prioritas,
          pelapor: data.pelapor,
        })
      }
      fetchTickets()
    })
    onSSE('COMMENT_CREATED', (data) => {
      if (data && (data.ticketId != null || data.id != null)) {
        const ticketId = data.ticketId || data.id
        const targetTicket = allTickets.value.find(t => t.id === ticketId)

        addNotificationItem({
          ticketId,
          type: 'COMMENT',
          title: targetTicket ? `Komentar: ${targetTicket.judul}` : 'Komentar Baru',
          message: 'Komentar baru ditambahkan pada tiket',
          nomor_tiket: targetTicket?.nomor_tiket,
          judul_tiket: targetTicket?.judul,
          status_tiket: targetTicket?.status_tiket,
          prioritas: targetTicket?.prioritas,
          pelapor: targetTicket?.pelapor,
        })
      }
      fetchTickets()
    })
  } else if (isAdmin.value) {
    // ── ADMIN ──
    // Hanya menerima notif tiket baru masuk (TICKET_CREATED).
    // Backend sudah memfilter sehingga TICKET_UPDATED / COMMENT_CREATED tidak dikirim.
    onSSE('TICKET_CREATED', (data) => {
      if (data && typeof data === 'object') {
        addNotificationItem({
          ticketId: data.id,
          type: 'CREATED',
          title: 'Tiket Baru Masuk',
          message: data.judul,
          nomor_tiket: data.nomor_tiket,
          judul_tiket: data.judul,
          status_tiket: data.status_tiket,
          prioritas: data.prioritas,
          pelapor: data.pelapor,
        })
        if (!allTickets.value.some(t => t.id === data.id)) {
          allTickets.value = [data, ...allTickets.value]
        }
      }
      fetchTickets()
    })
  } else if (isUser.value) {
    // ── USER BIASA (pelapor) ──
    // Hanya menerima notif PERUBAHAN pada tiket miliknya sendiri.
    // Backend sudah memfilter: hanya TICKET_UPDATED dan COMMENT_CREATED pada tiket yg dia laporkan.
    onSSE('TICKET_UPDATED', (data) => {
      if (data && data.id != null) {
        const changesText = Array.isArray(data.changes) && data.changes.length > 0
          ? data.changes.join('. ')
          : 'Detail tiket diperbarui'

        addNotificationItem({
          ticketId: data.id,
          type: 'UPDATED',
          title: data.judul ? `Perubahan Tiket: ${data.judul}` : 'Perubahan Tiket',
          message: changesText,
          nomor_tiket: data.nomor_tiket,
          judul_tiket: data.judul,
          status_tiket: data.status_tiket,
          prioritas: data.prioritas,
          pelapor: data.pelapor,
        })
      }
      fetchTickets()
    })
    onSSE('COMMENT_CREATED', (data) => {
      if (data && (data.ticketId != null || data.id != null)) {
        const ticketId = data.ticketId || data.id
        const targetTicket = allTickets.value.find(t => t.id === ticketId)

        addNotificationItem({
          ticketId,
          type: 'COMMENT',
          title: targetTicket ? `Komentar: ${targetTicket.judul}` : 'Komentar Baru',
          message: 'Komentar baru ditambahkan pada tiket',
          nomor_tiket: targetTicket?.nomor_tiket,
          judul_tiket: targetTicket?.judul,
          status_tiket: targetTicket?.status_tiket,
          prioritas: targetTicket?.prioritas,
          pelapor: targetTicket?.pelapor,
        })
      }
      fetchTickets()
    })
  }
})
onBeforeUnmount(() => {
  clearInterval(pollTimer)
  disconnectSSE()
})
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
        <span aria-hidden="true" class="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-[#7C8BAC] pointer-events-none">search</span>
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
            class="absolute right-0 mt-2 w-84 sm:w-90 rounded-2xl border border-[#E5EAEF] bg-white shadow-2xl z-50 overflow-hidden"
            @click.stop
          >
            <div class="flex items-center justify-between px-4 py-3 border-b border-[#F1F5F9]">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-[18px] text-[#5D87FF]">notifications</span>
                <span class="text-[13px] font-extrabold text-[#2A3547]">Notifikasi Tiket</span>
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

            <div class="max-h-[360px] overflow-y-auto divide-y divide-[#F8FAFC]">
              <div v-if="isFetchingNotif && latestNotifications.length === 0" class="flex items-center justify-center gap-2 py-8 text-[12px] text-[#9CA3AF]">
                <div class="w-4 h-4 border-2 border-[#E5E7EB] border-t-[#5D87FF] rounded-full animate-spin"></div>
                Memuat notifikasi...
              </div>

              <div v-else-if="latestNotifications.length === 0" class="flex flex-col items-center gap-2 py-10 text-center">
                <span class="material-symbols-outlined text-[40px] text-[#D1D5DB]">inbox</span>
                <p class="text-[12px] text-[#9CA3AF]">Belum ada notifikasi</p>
              </div>

              <button
                v-for="notif in latestNotifications"
                :key="notif.id"
                type="button"
                @click="goToNotif(notif)"
                class="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[#F8FAFC] transition-all group"
                :class="!notif.isRead ? 'bg-[#F0F5FF]' : ''"
              >
                <span class="mt-1.5 h-2 w-2 shrink-0 rounded-full" :class="priorityDot(notif.prioritas)"></span>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5 mb-0.5">
                    <span v-if="!notif.isRead" class="h-1.5 w-1.5 rounded-full bg-[#5D87FF] shrink-0"></span>
                    <p class="text-[12px] font-bold text-[#2A3547] truncate leading-tight group-hover:text-[#5D87FF] transition-colors">
                      {{ notif.title }}
                    </p>
                  </div>

                  <p class="text-[11px] font-semibold text-[#5D87FF] mt-0.5 truncate flex items-center gap-1 bg-[#ECF2FF] px-2 py-0.5 rounded-md w-fit max-w-full">
                    <span class="material-symbols-outlined text-[12px] text-[#5D87FF] shrink-0">
                      {{ notif.type === 'CREATED' ? 'add_circle' : notif.type === 'COMMENT' ? 'chat' : 'update' }}
                    </span>
                    <span class="truncate">{{ notif.message }}</span>
                  </p>

                  <div class="flex items-center gap-1.5 flex-wrap mt-1">
                    <span class="text-[10px] text-[#9CA3AF]">{{ notif.nomor_tiket }}</span>
                    <span v-if="notif.status_tiket" class="text-[10px] text-[#CBD5E1]">·</span>
                    <span v-if="notif.status_tiket" class="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide" :class="statusColor(notif.status_tiket)">{{ notif.status_tiket }}</span>
                    <span class="text-[10px] text-[#CBD5E1]">·</span>
                    <span class="text-[10px] text-[#9CA3AF]">{{ relativeTime(notif.timestamp) }}</span>
                  </div>
                  <p v-if="notif.pelapor" class="text-[10px] text-[#B0BAC9] mt-0.5 truncate">Dari: {{ notif.pelapor }}</p>
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
            <p class="text-[10px] font-medium leading-tight text-[#7C8BAC] capitalize">
              {{ user?.jabatan || user?.role || 'Guest' }}
              <span v-if="user?.nik" class="font-mono text-[#94A3B8]">({{ user.nik }})</span>
            </p>
          </div>
        </button>

        <Transition name="dropdown">
          <div
            v-if="isProfileOpen"
            class="absolute right-0 mt-2 w-60 rounded-2xl border border-[#E5EAEF] bg-white p-2 shadow-xl z-50"
            @click="isProfileOpen = false"
          >
            <div class="px-3 py-2 border-b border-[#F1F5F9] mb-1">
              <p class="text-[12px] font-bold text-[#2A3547]">{{ user ? user.nama : 'Pengguna' }}</p>
              <p class="text-[10px] font-semibold text-[#5D87FF] capitalize mt-0.5">
                {{ user?.jabatan || user?.role || 'Guest' }}
              </p>
              <p v-if="user?.nik" class="text-[10px] font-mono text-[#7C8BAC]">
                NIK: {{ user.nik }}
              </p>
              <p v-if="user?.email" class="text-[10px] text-[#94A3B8]">{{ user.email }}</p>
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
