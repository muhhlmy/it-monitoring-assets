<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useApi } from '../composables/useApi.js'
import { useAuth } from '@/composables/useAuth'
import AppBadge from '../components/ui/AppBadge.vue'
import AppModal from '../components/ui/AppModal.vue'

const { get, post, put, del } = useApi()
const { user } = useAuth()

const nowTick = ref(Date.now())
let tickerInterval = null

onMounted(() => {
  tickerInterval = setInterval(() => {
    nowTick.value = Date.now()
  }, 30000)
})

onUnmounted(() => {
  if (tickerInterval) clearInterval(tickerInterval)
})

const tickets = ref([])
const employees = ref([])
const stats = ref({
  totalTickets: 0,
  pendingTickets: 0,
  openTickets: 0,
  closedTickets: 0,
})
const isLoading = ref(true)
const isSubmitting = ref(false)
const searchQuery = ref('')
const filterStatus = ref('')
const filterPrioritas = ref('')
const pageError = ref('')
const notification = ref(null)

const showFormModal = ref(false)
const showDeleteModal = ref(false)
const showDetailModal = ref(false)
const modalMode = ref('add') // 'add' | 'edit'
const selectedTicket = ref(null)
const modalError = ref('')

const activeDetailTab = ref('detail') // 'detail' | 'history' | 'comments'
const ticketHistory = ref([])
const isHistoryLoading = ref(false)

const ticketComments = ref([])
const isCommentsLoading = ref(false)
const newCommentText = ref('')
const commentAttachment = ref(null)
const isSubmittingComment = ref(false)

const emptyForm = () => ({
  judul: '',
  deskripsi: '',
  kategori: 'IT',
  prioritas: 'Medium (3d)',
  status_tiket: 'Open',
  assigned_to: null,
  pelapor: user.value?.nama || '',
  attachment: null,
})

const form = ref(emptyForm())

function handleFileChange(event) {
  const file = event.target.files?.[0]
  if (!file) return

  if (!file.type.startsWith('image/')) {
    modalError.value = 'File attachment harus berupa gambar (JPG, PNG, WebP, dll).'
    return
  }

  if (file.size > 5 * 1024 * 1024) {
    modalError.value = 'Ukuran gambar maksimal 5MB.'
    return
  }

  modalError.value = ''
  const reader = new FileReader()
  reader.onload = (e) => {
    form.value.attachment = e.target.result
  }
  reader.readAsDataURL(file)
}

function removeAttachment() {
  form.value.attachment = null
}

function handleCommentFileChange(event) {
  const file = event.target.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    modalError.value = 'Attachment komentar harus berupa gambar.'
    return
  }
  const reader = new FileReader()
  reader.onload = (e) => {
    commentAttachment.value = e.target.result
  }
  reader.readAsDataURL(file)
}

function removeCommentAttachment() {
  commentAttachment.value = null
}

const filteredTickets = computed(() => {
  return tickets.value.filter((t) => {
    const q = searchQuery.value.trim().toLowerCase()
    const matchQuery = !q || (
      (t.judul || '').toLowerCase().includes(q) ||
      (t.nomor_tiket || '').toLowerCase().includes(q) ||
      (t.pelapor || '').toLowerCase().includes(q) ||
      (t.assigned_to || '').toLowerCase().includes(q) ||
      (t.kategori || '').toLowerCase().includes(q)
    )
    const matchStatus = !filterStatus.value || t.status_tiket === filterStatus.value
    const matchPrioritas = !filterPrioritas.value || t.prioritas === filterPrioritas.value
    return matchQuery && matchStatus && matchPrioritas
  })
})

async function fetchTickets() {
  isLoading.value = true
  pageError.value = ''
  try {
    const [data, statsData, empData] = await Promise.all([
      get('/api/tickets'),
      get('/api/tickets/stats'),
      get('/api/karyawan'),
    ])
    tickets.value = Array.isArray(data) ? data : []
    stats.value = statsData || { totalTickets: 0, pendingTickets: 0, openTickets: 0, closedTickets: 0 }
    employees.value = Array.isArray(empData) ? empData : []
  } catch (err) {
    console.error('Gagal memuat tiket:', err)
    pageError.value = err.message || 'Gagal memuat data tiket.'
  } finally {
    isLoading.value = false
  }
}

async function fetchTicketHistory(ticketId) {
  isHistoryLoading.value = true
  try {
    const res = await get(`/api/tickets/${ticketId}/history`)
    ticketHistory.value = Array.isArray(res) ? res : []
  } catch (err) {
    console.error('Gagal memuat riwayat tiket:', err)
    ticketHistory.value = []
  } finally {
    isHistoryLoading.value = false
  }
}

async function fetchTicketComments(ticketId) {
  isCommentsLoading.value = true
  try {
    const res = await get(`/api/tickets/${ticketId}/comments`)
    ticketComments.value = Array.isArray(res) ? res : []
  } catch (err) {
    console.error('Gagal memuat komentar tiket:', err)
    ticketComments.value = []
  } finally {
    isCommentsLoading.value = false
  }
}

async function sendComment() {
  if (!newCommentText.value.trim() && !commentAttachment.value) return
  if (!selectedTicket.value) return

  isSubmittingComment.value = true
  try {
    await post(`/api/tickets/${selectedTicket.value.id}/comments`, {
      pesan: newCommentText.value.trim() || 'Melampirkan gambar',
      attachment: commentAttachment.value,
      nama_pengguna: user.value?.nama || 'User',
      role_pengguna: user.value?.role || 'user'
    })
    newCommentText.value = ''
    commentAttachment.value = null
    await fetchTicketComments(selectedTicket.value.id)
  } catch (err) {
    console.error('Gagal mengirim komentar:', err)
  } finally {
    isSubmittingComment.value = false
  }
}

function openAdd() {
  modalMode.value = 'add'
  selectedTicket.value = null
  form.value = emptyForm()
  modalError.value = ''
  showFormModal.value = true
}

function openEdit(ticket) {
  modalMode.value = 'edit'
  selectedTicket.value = ticket
  form.value = { 
    ...ticket,
    assigned_to: ticket.assigned_to || null,
    pelapor: ticket.pelapor || user.value?.nama || ''
  }
  modalError.value = ''
  showFormModal.value = true
}

function openDetail(ticket) {
  selectedTicket.value = ticket
  activeDetailTab.value = 'detail'
  showDetailModal.value = true
  fetchTicketHistory(ticket.id)
  fetchTicketComments(ticket.id)
}

function openDelete(ticket) {
  selectedTicket.value = ticket
  modalError.value = ''
  showDeleteModal.value = true
}

function closeModal() {
  showFormModal.value = false
  showDeleteModal.value = false
  showDetailModal.value = false
  modalError.value = ''
}

async function saveTicket() {
  if (!form.value.judul.trim()) {
    modalError.value = 'Judul tiket wajib diisi.'
    return
  }

  isSubmitting.value = true
  modalError.value = ''

  try {
    if (modalMode.value === 'add') {
      await post('/api/tickets', form.value)
      toast('Tiket baru berhasil dibuat.')
    } else {
      await put(`/api/tickets/${selectedTicket.value.id}`, form.value)
      toast('Tiket berhasil diperbarui.')
    }
    closeModal()
    await fetchTickets()
  } catch (err) {
    modalError.value = err.message || 'Gagal menyimpan tiket.'
  } finally {
    isSubmitting.value = false
  }
}

async function confirmDeleteTicket() {
  if (!selectedTicket.value) return
  isSubmitting.value = true
  modalError.value = ''

  try {
    await del(`/api/tickets/${selectedTicket.value.id}`)
    toast('Tiket berhasil dihapus.')
    closeModal()
    await fetchTickets()
  } catch (err) {
    modalError.value = err.message || 'Gagal menghapus tiket.'
  } finally {
    isSubmitting.value = false
  }
}

function getStatusBadgeType(status) {
  const s = (status || '').toLowerCase()
  if (s === 'open') return 'success'
  if (s === 'pending') return 'warning'
  if (s === 'closed') return 'default'
  return 'info'
}

function getPriorityBadgeType(prio) {
  const p = (prio || '').toLowerCase()
  if (p.includes('urgent')) return 'danger'
  if (p.includes('high')) return 'warning'
  if (p.includes('medium')) return 'info'
  return 'default'
}

function getKategoriBadgeType(kategori) {
  const k = (kategori || '').toLowerCase()
  if (k === 'it') return 'primary'
  if (k === 'hr') return 'warning'
  if (k === 'ga') return 'success'
  return 'info'
}

function getSlaHours(prioritas) {
  const p = (prioritas || '').toLowerCase()
  if (p.includes('urgent') || p.includes('4h')) return 4
  if (p.includes('high') || p.includes('1day')) return 24
  if (p.includes('medium') || p.includes('3d')) return 72
  if (p.includes('low') || p.includes('7d')) return 168
  return 72
}

function getSlaCountdownInfo(ticket) {
  if (!ticket || !ticket.dibuat_pada) {
    return { text: ticket?.prioritas || 'Medium (3d)', isOverdue: false, isClosed: false }
  }

  if (ticket.status_tiket === 'Closed') {
    return { text: '✓ Selesai', isOverdue: false, isClosed: true }
  }

  const createdAt = new Date(ticket.dibuat_pada).getTime()
  const hours = getSlaHours(ticket.prioritas)
  const deadline = createdAt + hours * 60 * 60 * 1000
  const diffMs = deadline - nowTick.value

  const isOverdue = diffMs < 0
  const absDiff = Math.abs(diffMs)

  const diffSec = Math.floor(absDiff / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHours = Math.floor(diffMin / 60)
  const diffDays = Math.floor(diffHours / 24)

  const remHours = diffHours % 24
  const remMin = diffMin % 60

  let formatted = ''
  if (diffDays > 0) {
    formatted = `${diffDays}h ${remHours}j`
  } else if (diffHours > 0) {
    formatted = `${diffHours}j ${remMin}m`
  } else {
    formatted = `${remMin}m`
  }

  if (isOverdue) {
    return {
      text: `⚠️ Terlewat ${formatted}`,
      isOverdue: true,
      isClosed: false
    }
  }

  return {
    text: `⏱️ ${formatted} sisa`,
    isOverdue: false,
    isClosed: false
  }
}

function getActionBadgeType(action) {
  if (action === 'PEMBUATAN' || action === 'TAMBAH') return 'success'
  if (action === 'PERUBAHAN_STATUS' || action === 'UBAH' || action === 'UPDATE_DETAIL') return 'warning'
  if (action === 'PENUGASAN') return 'info'
  if (action === 'LAMPIRAN') return 'primary'
  if (action === 'HAPUS') return 'danger'
  return 'default'
}

function getActionIcon(action) {
  if (action === 'PEMBUATAN' || action === 'TAMBAH') return 'add_circle'
  if (action === 'PERUBAHAN_STATUS' || action === 'UBAH' || action === 'UPDATE_DETAIL' || action === 'PENUGASAN') return 'edit_note'
  if (action === 'LAMPIRAN') return 'attach_file'
  if (action === 'HAPUS') return 'delete'
  return 'info'
}

function getActionColor(action) {
  if (action === 'PEMBUATAN' || action === 'TAMBAH') return 'text-[#059669] bg-[#ECFDF5]'
  if (action === 'PERUBAHAN_STATUS' || action === 'UBAH' || action === 'UPDATE_DETAIL' || action === 'PENUGASAN') return 'text-[#D97706] bg-[#FFF8E6]'
  if (action === 'LAMPIRAN') return 'text-[#0284C7] bg-[#E0F2FE]'
  if (action === 'HAPUS') return 'text-[#DC2626] bg-[#FEF2F2]'
  return 'text-[#6B7280] bg-[#F3F4F6]'
}

function parseTicketPerubahan(perubahan) {
  if (!perubahan) return []
  const parts = perubahan.split('. ')
  const result = []

  for (const part of parts) {
    if (!part.trim()) continue
    const match = part.match(/^(.+?)\s+diubah dari\s+'(.*?)'\s+menjadi\s+'(.*?)'$/i)
    if (match) {
      result.push({
        field: match[1].trim(),
        old: match[2] || '—',
        new: match[3] || '—',
      })
    } else {
      result.push({ field: null, text: part.trim() })
    }
  }

  return result
}

function formatDate(iso) {
  if (!iso) return '-'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTime(iso) {
  if (!iso) return '-'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

let toastTimer
function toast(message, type = 'success') {
  window.clearTimeout(toastTimer)
  notification.value = { message, type }
  toastTimer = window.setTimeout(() => { notification.value = null }, 3500)
}

onMounted(fetchTickets)
</script>

<template>
  <div class="flex flex-col gap-6">

    <!-- Toast Notification -->
    <Transition name="slide-right">
      <div
        v-if="notification"
        class="fixed left-4 right-4 top-4 z-[60] flex items-center gap-3 rounded-2xl px-4 py-3 text-white shadow-xl sm:left-auto sm:right-5 sm:max-w-md"
        :class="notification.type === 'error' ? 'bg-[#FA896B]' : 'bg-[#13DEB9]'"
      >
        <span class="material-symbols-outlined text-[20px]">{{ notification.type === 'error' ? 'error' : 'check_circle' }}</span>
        <span class="text-[13px] font-bold">{{ notification.message }}</span>
      </div>
    </Transition>

    <!-- ── Header Banner Card ──────────────────────────────── -->
    <div class="relative overflow-hidden rounded-2xl bg-[#ECF2FF] p-6 border border-[#D2E3FF] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-2 text-[11px] font-bold text-[#5D87FF] uppercase tracking-wider mb-1">
          <span>Home</span>
          <span>•</span>
          <span>Tickets App</span>
        </div>
        <h2 class="text-[22px] font-extrabold text-[#2A3547]">Tiket Kendala IT</h2>
        <p class="text-[12px] font-medium text-[#7C8BAC] mt-0.5">Kelola laporan kendala perangkat & perbaikan IT</p>
      </div>

      <div class="flex items-center gap-3">
        <button
          type="button"
          @click="openAdd"
          class="flex items-center gap-2 rounded-xl bg-[#5D87FF] px-5 py-3 text-[13px] font-bold text-white shadow-md shadow-blue-500/20 hover:bg-[#4570EA] transition-all cursor-pointer"
        >
          <span class="material-symbols-outlined text-[18px]">add</span>
          + Buat Tiket Baru
        </button>
      </div>
    </div>

    <!-- ── 4 Pastel Stat Cards (Modernize Overview) ────────── -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      
      <!-- Total Tickets -->
      <div class="shadow-card shadow-card-hover flex items-center gap-4 rounded-2xl border border-[#D2E3FF] bg-[#ECF2FF] p-5">
        <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#5D87FF] shadow-xs">
          <span class="material-symbols-outlined text-[24px]">confirmation_number</span>
        </div>
        <div>
          <span class="font-num block text-[28px] font-extrabold leading-none text-[#2A3547]">{{ stats.totalTickets }}</span>
          <span class="mt-1 block text-[11px] font-bold uppercase tracking-wider text-[#5D87FF]">Total Tickets</span>
        </div>
      </div>

      <!-- Pending Tickets -->
      <div class="shadow-card shadow-card-hover flex items-center gap-4 rounded-2xl border border-[#FCE6BE] bg-[#FEF5E5] p-5">
        <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#FFAE1F] shadow-xs">
          <span class="material-symbols-outlined text-[24px]">pending_actions</span>
        </div>
        <div>
          <span class="font-num block text-[28px] font-extrabold leading-none text-[#2A3547]">{{ stats.pendingTickets }}</span>
          <span class="mt-1 block text-[11px] font-bold uppercase tracking-wider text-[#FFAE1F]">Pending Tickets</span>
        </div>
      </div>

      <!-- Open Tickets -->
      <div class="shadow-card shadow-card-hover flex items-center gap-4 rounded-2xl border border-[#C3F3E8] bg-[#EDFBF7] p-5">
        <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#13DEB9] shadow-xs">
          <span class="material-symbols-outlined text-[24px]">adjust</span>
        </div>
        <div>
          <span class="font-num block text-[28px] font-extrabold leading-none text-[#2A3547]">{{ stats.openTickets }}</span>
          <span class="mt-1 block text-[11px] font-bold uppercase tracking-wider text-[#13DEB9]">Open Tickets</span>
        </div>
      </div>

      <!-- Closed Tickets -->
      <div class="shadow-card shadow-card-hover flex items-center gap-4 rounded-2xl border border-[#FAD9D0] bg-[#FDEDE8] p-5">
        <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#FA896B] shadow-xs">
          <span class="material-symbols-outlined text-[24px]">task_alt</span>
        </div>
        <div>
          <span class="font-num block text-[28px] font-extrabold leading-none text-[#2A3547]">{{ stats.closedTickets }}</span>
          <span class="mt-1 block text-[11px] font-bold uppercase tracking-wider text-[#FA896B]">Closed Tickets</span>
        </div>
      </div>

    </div>

    <!-- ── Filter & Search Control Bar ─────────────────────── -->
    <div class="shadow-card flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E5EAEF] bg-white p-4">
      <div class="relative flex-1 min-w-[240px]">
        <span class="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-[#7C8BAC]">search</span>
        <input
          v-model="searchQuery"
          type="search"
          placeholder="Cari judul tiket, nomor, pelapor, assignee..."
          class="h-10 w-full rounded-xl border border-[#DFE5EF] bg-[#F8FAFC] pl-10 pr-4 text-[12px] font-medium text-[#2A3547] focus:border-[#5D87FF] focus:bg-white focus:outline-none"
        />
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <select v-model="filterStatus" class="h-10 rounded-xl border border-[#DFE5EF] bg-white px-3 text-[12px] font-semibold text-[#2A3547]">
          <option value="">Semua Status</option>
          <option value="Open">Open</option>
          <option value="Pending">Pending</option>
          <option value="Closed">Closed</option>
        </select>

        <select v-model="filterPrioritas" class="h-10 rounded-xl border border-[#DFE5EF] bg-white px-3 text-[12px] font-semibold text-[#2A3547]">
          <option value="">Semua Prioritas (SLA)</option>
          <option value="Urgent (4h)">Urgent (4h)</option>
          <option value="High (1day)">High (1day)</option>
          <option value="Medium (3d)">Medium (3d)</option>
          <option value="Low (7d)">Low (7d)</option>
        </select>
      </div>
    </div>

    <!-- ── Tickets Table Card ──────────────────────────────── -->
    <div class="shadow-card rounded-2xl border border-[#E5EAEF] bg-white overflow-hidden">
      <div v-if="isLoading" class="flex items-center justify-center gap-3 py-16 text-[#7C8BAC]">
        <span class="h-8 w-8 animate-spin rounded-full border-4 border-[#E5EAEF] border-t-[#5D87FF]"></span>
        <span class="text-[13px] font-medium">Memuat data tiket...</span>
      </div>

      <div v-else-if="pageError" class="bg-[#FDEDE8] p-5 text-[13px] font-semibold text-[#FA896B]">
        {{ pageError }}
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr>
              <th>Id / No. Tiket</th>
              <th>Detail Tiket</th>
              <th>Kategori</th>
              <th>SLA & Countdown</th>
              <th>Assigned To</th>
              <th>Status</th>
              <th>Tanggal</th>
              <th class="text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="ticket in filteredTickets" :key="ticket.id" class="hover:bg-[#F8FAFC]">
              <td>
                <span class="font-mono text-[12px] font-extrabold text-[#5D87FF]">{{ ticket.nomor_tiket || `TCK-#${ticket.id}` }}</span>
              </td>
              <td>
                <div class="flex flex-col gap-0.5 max-w-md">
                  <div class="flex items-center gap-2">
                    <p class="text-[13px] font-bold text-[#2A3547] leading-tight">{{ ticket.judul }}</p>
                    <span v-if="ticket.attachment" class="material-symbols-outlined text-[16px] text-[#5D87FF]" title="Ada Lampiran Gambar">attach_file</span>
                  </div>
                  <p class="text-[11px] text-[#7C8BAC] line-clamp-1">{{ ticket.deskripsi || 'Tidak ada deskripsi' }}</p>
                  <p class="text-[10px] font-medium text-[#7C8BAC] mt-0.5">Pelapor: <span class="font-bold text-[#2A3547]">{{ ticket.pelapor || '—' }}</span></p>
                </div>
              </td>
              <td>
                <AppBadge :type="getKategoriBadgeType(ticket.kategori)" :text="ticket.kategori || 'IT'" />
              </td>
              <td>
                <div class="flex flex-col gap-1 items-start">
                  <AppBadge :type="getPriorityBadgeType(ticket.prioritas)" :text="ticket.prioritas || 'Medium (3d)'" />
                  <span
                    class="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold tracking-tight"
                    :class="getSlaCountdownInfo(ticket).isClosed
                      ? 'bg-[#E8F7FF] text-[#0284C7]'
                      : getSlaCountdownInfo(ticket).isOverdue
                        ? 'bg-[#FEF2F2] text-[#DC2626] animate-pulse border border-red-200'
                        : 'bg-[#F0FDF4] text-[#166534] border border-green-200'"
                  >
                    {{ getSlaCountdownInfo(ticket).text }}
                  </span>
                </div>
              </td>
              <td>
                <div class="flex items-center gap-2.5">
                  <div class="flex h-8 w-8 items-center justify-center rounded-full bg-[#ECF2FF] text-[11px] font-bold text-[#5D87FF]">
                    {{ (ticket.assigned_to || 'U').charAt(0).toUpperCase() }}
                  </div>
                  <span class="text-[12px] font-bold" :class="ticket.assigned_to ? 'text-[#2A3547]' : 'text-[#7C8BAC] italic'">
                    {{ ticket.assigned_to || 'Belum ditugaskan' }}
                  </span>
                </div>
              </td>
              <td>
                <AppBadge :type="getStatusBadgeType(ticket.status_tiket)" :text="ticket.status_tiket" />
              </td>
              <td class="text-[12px] font-medium text-[#7C8BAC]">{{ formatDate(ticket.dibuat_pada) }}</td>
              <td>
                <div class="flex justify-end gap-1.5">
                  <button
                    type="button"
                    @click="openDetail(ticket)"
                    title="Detail Tiket"
                    class="flex h-8 w-8 items-center justify-center rounded-lg bg-[#ECF2FF] text-[#5D87FF] hover:bg-[#5D87FF] hover:text-white transition-all"
                  >
                    <span class="material-symbols-outlined text-[16px]">visibility</span>
                  </button>
                  <button
                    type="button"
                    @click="openEdit(ticket)"
                    title="Edit Tiket"
                    class="flex h-8 w-8 items-center justify-center rounded-lg bg-[#E8F7FF] text-[#49BEFF] hover:bg-[#49BEFF] hover:text-white transition-all"
                  >
                    <span class="material-symbols-outlined text-[16px]">edit</span>
                  </button>
                  <button
                    type="button"
                    @click="openDelete(ticket)"
                    title="Hapus Tiket"
                    class="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FDEDE8] text-[#FA896B] hover:bg-[#FA896B] hover:text-white transition-all"
                  >
                    <span class="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="filteredTickets.length === 0">
              <td colspan="8" class="py-12 text-center text-[13px] text-[#7C8BAC]">Tidak ada tiket yang ditemukan.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ── Create / Edit Ticket Modal ─────────────────────── -->
    <AppModal
      :is-open="showFormModal"
      :title="modalMode === 'add' ? 'Buat Tiket Baru' : 'Edit Tiket Kendala'"
      size="lg"
      @close="closeModal"
    >
      <form class="flex flex-col gap-4" @submit.prevent="saveTicket">
        <div v-if="modalError" class="rounded-xl bg-[#FDEDE8] p-3 text-[12px] font-bold text-[#FA896B]">
          {{ modalError }}
        </div>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label class="flex flex-col gap-1.5 sm:col-span-2">
            <span class="text-[11px] font-bold uppercase text-[#2A3547]">Judul Kendala *</span>
            <input v-model="form.judul" required placeholder="Contoh: Layar Laptop Berkedip Saat Buka CAD" class="form-control" />
          </label>

          <label class="flex flex-col gap-1.5 sm:col-span-2">
            <span class="text-[11px] font-bold uppercase text-[#2A3547]">Deskripsi Rinci</span>
            <textarea v-model="form.deskripsi" rows="3" placeholder="Jelaskan rincian kendala perangkat..." class="form-control h-auto py-2"></textarea>
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-[11px] font-bold uppercase text-[#2A3547]">Pelapor (User Login)</span>
            <input v-model="form.pelapor" placeholder="Nama Pelapor" class="form-control bg-[#F8FAFC]" readonly />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-[11px] font-bold uppercase text-[#2A3547]">Assigned To (Petugas)</span>
            <input v-model="form.assigned_to" placeholder="Opsional (Kosongkan jika belum ditugaskan)" class="form-control" />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-[11px] font-bold uppercase text-[#2A3547]">Kategori</span>
            <select v-model="form.kategori" class="form-control">
              <option value="IT">IT</option>
              <option value="HR">HR</option>
              <option value="GA">GA</option>
            </select>
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-[11px] font-bold uppercase text-[#2A3547]">Prioritas SLA</span>
            <select v-model="form.prioritas" class="form-control">
              <option value="Low (7d)">Low (7d)</option>
              <option value="Medium (3d)">Medium (3d)</option>
              <option value="High (1day)">High (1day)</option>
              <option value="Urgent (4h)">Urgent (4h)</option>
            </select>
          </label>

          <label class="flex flex-col gap-1.5 sm:col-span-2">
            <span class="text-[11px] font-bold uppercase text-[#2A3547]">Status Tiket</span>
            <select v-model="form.status_tiket" class="form-control">
              <option value="Open">Open</option>
              <option value="Pending">Pending</option>
              <option value="Closed">Closed</option>
            </select>
          </label>

          <!-- Image Attachment Upload Field -->
          <div class="flex flex-col gap-1.5 sm:col-span-2">
            <span class="text-[11px] font-bold uppercase text-[#2A3547]">Attachment (Gambar Kendala)</span>
            <div class="flex items-center gap-3">
              <label class="flex h-10 items-center gap-2 rounded-xl border border-[#DFE5EF] bg-[#F8FAFC] px-4 text-[12px] font-semibold text-[#2A3547] hover:bg-[#ECF2FF] hover:text-[#5D87FF] transition-all cursor-pointer">
                <span class="material-symbols-outlined text-[18px]">add_a_photo</span>
                <span>Pilih Gambar...</span>
                <input type="file" accept="image/*" class="hidden" @change="handleFileChange" />
              </label>
              <span v-if="form.attachment" class="text-[11px] font-bold text-[#13DEB9] flex items-center gap-1">
                <span class="material-symbols-outlined text-[16px]">check_circle</span> Gambar dipilih
              </span>
            </div>

            <!-- Preview Image if selected -->
            <div v-if="form.attachment" class="relative mt-2 inline-block max-w-xs overflow-hidden rounded-2xl border border-[#E5EAEF] shadow-sm">
              <img :src="form.attachment" alt="Preview Attachment" class="max-h-48 w-full object-cover" />
              <button
                type="button"
                @click="removeAttachment"
                class="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-white shadow-md hover:bg-red-600 transition-all"
                title="Hapus Gambar"
              >
                <span class="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-3 border-t border-[#F1F5F9] pt-4 mt-2">
          <button type="button" :disabled="isSubmitting" @click="closeModal" class="h-10 rounded-xl border border-[#DFE5EF] px-5 text-[12px] font-semibold text-[#2A3547] hover:bg-[#F8FAFC]">
            Batal
          </button>
          <button type="submit" :disabled="isSubmitting" class="h-10 rounded-xl bg-[#5D87FF] px-5 text-[12px] font-bold text-white shadow-md shadow-blue-500/20 hover:bg-[#4570EA] disabled:opacity-50">
            {{ isSubmitting ? 'Menyimpan...' : 'Simpan Tiket' }}
          </button>
        </div>
      </form>
    </AppModal>

    <!-- ── Detail Ticket Modal ───────────────────────────── -->
    <AppModal :is-open="showDetailModal" title="Detail & Riwayat Tiket" size="lg" @close="closeModal">
      <div v-if="selectedTicket" class="space-y-4">
        
        <!-- Tab Navigation Header -->
        <div class="flex items-center gap-2 border-b border-[#E5EAEF] pb-3 flex-wrap">
          <button
            type="button"
            @click="activeDetailTab = 'detail'"
            class="flex items-center gap-2 rounded-xl px-4 py-2 text-[12px] font-bold transition-all cursor-pointer"
            :class="activeDetailTab === 'detail' ? 'bg-[#5D87FF] text-white shadow-md shadow-blue-500/20' : 'bg-[#F8FAFC] text-[#7C8BAC] hover:bg-[#ECF2FF] hover:text-[#5D87FF]'"
          >
            <span class="material-symbols-outlined text-[18px]">info</span>
            Rincian Tiket
          </button>
          <button
            type="button"
            @click="activeDetailTab = 'history'"
            class="flex items-center gap-2 rounded-xl px-4 py-2 text-[12px] font-bold transition-all cursor-pointer"
            :class="activeDetailTab === 'history' ? 'bg-[#5D87FF] text-white shadow-md shadow-blue-500/20' : 'bg-[#F8FAFC] text-[#7C8BAC] hover:bg-[#ECF2FF] hover:text-[#5D87FF]'"
          >
            <span class="material-symbols-outlined text-[18px]">history</span>
            Riwayat Perubahan ({{ ticketHistory.length }})
          </button>
          <button
            type="button"
            @click="activeDetailTab = 'comments'"
            class="flex items-center gap-2 rounded-xl px-4 py-2 text-[12px] font-bold transition-all cursor-pointer"
            :class="activeDetailTab === 'comments' ? 'bg-[#5D87FF] text-white shadow-md shadow-blue-500/20' : 'bg-[#F8FAFC] text-[#7C8BAC] hover:bg-[#ECF2FF] hover:text-[#5D87FF]'"
          >
            <span class="material-symbols-outlined text-[18px]">forum</span>
            Diskusi & Komentar ({{ ticketComments.length }})
          </button>
        </div>

        <!-- TAB 1: Rincian Tiket -->
        <div v-if="activeDetailTab === 'detail'" class="space-y-4">
          <div class="flex items-center justify-between rounded-2xl bg-[#ECF2FF] p-4 border border-[#D2E3FF]">
            <div>
              <span class="font-mono text-[12px] font-extrabold text-[#5D87FF]">{{ selectedTicket.nomor_tiket }}</span>
              <h4 class="text-[16px] font-extrabold text-[#2A3547] mt-0.5">{{ selectedTicket.judul }}</h4>
            </div>
            <AppBadge :type="getStatusBadgeType(selectedTicket.status_tiket)" :text="selectedTicket.status_tiket" />
          </div>

          <div class="grid grid-cols-2 gap-3 text-[12px]">
            <div class="rounded-xl border border-[#E5EAEF] bg-[#F8FAFC] p-3">
              <span class="block text-[10px] font-bold uppercase text-[#7C8BAC]">Pelapor</span>
              <span class="font-bold text-[#2A3547]">{{ selectedTicket.pelapor || '—' }}</span>
            </div>
            <div class="rounded-xl border border-[#E5EAEF] bg-[#F8FAFC] p-3">
              <span class="block text-[10px] font-bold uppercase text-[#7C8BAC]">Petugas IT (Assigned)</span>
              <span class="font-bold" :class="selectedTicket.assigned_to ? 'text-[#2A3547]' : 'text-[#7C8BAC] italic'">
                {{ selectedTicket.assigned_to || 'Belum ditugaskan' }}
              </span>
            </div>
            <div class="rounded-xl border border-[#E5EAEF] bg-[#F8FAFC] p-3">
              <span class="block text-[10px] font-bold uppercase text-[#7C8BAC]">Kategori</span>
              <span class="font-bold text-[#5D87FF]">{{ selectedTicket.kategori || '—' }}</span>
            </div>
            <div class="rounded-xl border border-[#E5EAEF] bg-[#F8FAFC] p-3">
              <span class="block text-[10px] font-bold uppercase text-[#7C8BAC]">Prioritas (SLA)</span>
              <AppBadge :type="getPriorityBadgeType(selectedTicket.prioritas)" :text="selectedTicket.prioritas" />
            </div>
          </div>

          <div>
            <span class="block text-[11px] font-bold uppercase text-[#7C8BAC] mb-1">Deskripsi Kendala</span>
            <div class="min-h-20 whitespace-pre-wrap rounded-2xl border border-[#E5EAEF] bg-white p-4 text-[12px] text-[#2A3547]">
              {{ selectedTicket.deskripsi || 'Tidak ada catatan deskripsi rincian.' }}
            </div>
          </div>

          <!-- Attachment Image Display in Detail Modal -->
          <div v-if="selectedTicket.attachment">
            <span class="block text-[11px] font-bold uppercase text-[#7C8BAC] mb-1.5 flex items-center gap-1">
              <span class="material-symbols-outlined text-[16px] text-[#5D87FF]">attach_file</span> Lampiran Gambar
            </span>
            <div class="overflow-hidden rounded-2xl border border-[#E5EAEF] bg-[#F8FAFC] p-2">
              <img :src="selectedTicket.attachment" alt="Attachment Kendala" class="max-h-64 w-full object-contain rounded-xl" />
            </div>
          </div>
        </div>

        <!-- TAB 2: Riwayat Perubahan (Audit Log Style) -->
        <div v-else-if="activeDetailTab === 'history'" class="space-y-3">
          <div v-if="isHistoryLoading" class="flex flex-col items-center justify-center py-12 gap-2 text-[#7C8BAC]">
            <span class="material-symbols-outlined text-[28px] animate-spin text-[#5D87FF]">progress_activity</span>
            <span class="text-[12px] font-medium">Memuat riwayat perubahan...</span>
          </div>

          <div v-else-if="ticketHistory.length === 0" class="rounded-2xl border border-[#E5EAEF] bg-[#F8FAFC] p-8 text-center text-[12px] text-[#7C8BAC]">
            Belum ada catatan riwayat perubahan pada tiket ini.
          </div>

          <!-- Audit Log Cards Container -->
          <div v-else class="divide-y divide-[#F3F4F6] rounded-2xl border border-[#E8EDF3] bg-white overflow-hidden max-h-96 overflow-y-auto">
            <div
              v-for="log in ticketHistory"
              :key="log.id"
              class="group flex gap-3.5 px-4 py-3.5 hover:bg-[#FAFBFD] transition-colors"
            >
              <!-- Left: Icon Block -->
              <div class="flex flex-col items-center pt-0.5">
                <div
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                  :class="getActionColor(log.aksi)"
                >
                  <span class="material-symbols-outlined text-[16px]">{{ getActionIcon(log.aksi) }}</span>
                </div>
              </div>

              <!-- Middle & Right: Main content -->
              <div class="flex-1 min-w-0">
                <!-- Top row: Badge + Ticket No + Clock Timestamp -->
                <div class="flex items-center justify-between gap-2 mb-2">
                  <div class="flex items-center gap-2 min-w-0">
                    <AppBadge :type="getActionBadgeType(log.aksi)" :text="log.aksi" />
                    <span class="text-[12px] font-extrabold text-[#111827] font-mono tracking-tight">{{ log.nomor_tiket }}</span>
                  </div>
                  <span class="text-[10px] text-[#94A3B8] font-medium shrink-0 flex items-center gap-1">
                    <span class="material-symbols-outlined text-[13px]">schedule</span>
                    {{ formatDateTime(log.dibuat_pada) }}
                  </span>
                </div>

                <!-- Structured Change Diffs -->
                <div v-if="parseTicketPerubahan(log.perubahan).length > 0" class="space-y-1.5 my-1">
                  <div
                    v-for="(row, idx) in parseTicketPerubahan(log.perubahan)"
                    :key="idx"
                    class="text-[11px]"
                  >
                    <!-- Row with old -> new comparison -->
                    <div v-if="row.field && row.old !== undefined" class="flex items-center gap-2 flex-wrap">
                      <span class="w-32 shrink-0 text-[10px] font-bold text-[#6B7280] uppercase tracking-wide">{{ row.field }}</span>
                      <span class="inline-flex items-center gap-1.5 min-w-0 flex-wrap">
                        <span class="inline-flex items-center gap-1 rounded-md bg-[#FEF2F2] px-2 py-0.5 text-[10px] font-semibold text-[#991B1B] line-through decoration-[#FECACA]">{{ row.old }}</span>
                        <span class="material-symbols-outlined text-[12px] text-[#CBD5E1] shrink-0">arrow_forward</span>
                        <span class="inline-flex items-center gap-1 rounded-md bg-[#F0FDF4] px-2 py-0.5 text-[10px] font-bold text-[#166534]">{{ row.new }}</span>
                      </span>
                    </div>

                    <!-- Single text line -->
                    <p v-else class="text-[11px] font-medium text-[#475569] leading-relaxed">{{ row.text }}</p>
                  </div>
                </div>

                <!-- Fallback text -->
                <p v-else class="text-[11px] font-medium text-[#475569] leading-relaxed">{{ log.perubahan }}</p>

                <!-- Bottom User Author -->
                <div class="flex items-center gap-1 mt-2">
                  <span class="material-symbols-outlined text-[12px] text-[#94A3B8]">person</span>
                  <span class="text-[10px] font-bold text-[#94A3B8]">{{ log.oleh_pengguna || 'Sistem' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- TAB 3: Diskusi & Komentar (Chat Feed) -->
        <div v-else-if="activeDetailTab === 'comments'" class="flex flex-col gap-3">
          <!-- Scrollable Chat Bubble Area -->
          <div class="rounded-2xl border border-[#E5EAEF] bg-[#F8FAFC] p-4 flex flex-col gap-3.5 min-h-[260px] max-h-96 overflow-y-auto">
            <div v-if="isCommentsLoading" class="flex flex-col items-center justify-center py-10 gap-2 text-[#7C8BAC]">
              <span class="material-symbols-outlined text-[26px] animate-spin text-[#5D87FF]">progress_activity</span>
              <span class="text-[12px] font-medium">Memuat percakapan...</span>
            </div>

            <div v-else-if="ticketComments.length === 0" class="flex flex-col items-center justify-center py-12 gap-2 text-center text-[#7C8BAC]">
              <span class="material-symbols-outlined text-[36px] text-[#CBD5E1]">chat_bubble_outline</span>
              <p class="text-[12px] font-bold text-[#475569]">Belum ada komentar pada tiket ini.</p>
              <p class="text-[11px]">Mulai diskusi atau berikan catatan perbaikan melalui form di bawah.</p>
            </div>

            <!-- Chat Bubble Item -->
            <div
              v-for="c in ticketComments"
              :key="c.id"
              class="flex items-start gap-2.5 max-w-[85%]"
              :class="c.nama_pengguna === user?.nama ? 'self-end flex-row-reverse' : 'self-start'"
            >
              <!-- User Avatar Circle -->
              <div
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold text-white shadow-xs"
                :class="c.nama_pengguna === user?.nama ? 'bg-[#5D87FF]' : 'bg-[#FA896B]'"
              >
                {{ (c.nama_pengguna || 'U').charAt(0).toUpperCase() }}
              </div>

              <!-- Message Bubble Box -->
              <div class="flex flex-col gap-1 min-w-0" :class="c.nama_pengguna === user?.nama ? 'items-end' : 'items-start'">
                <div class="flex items-center gap-2 text-[10px]">
                  <span class="font-bold text-[#2A3547]">{{ c.nama_pengguna }}</span>
                  <span class="rounded-full bg-[#ECF2FF] px-1.5 py-0.5 font-bold text-[#5D87FF] capitalize">{{ c.role_pengguna || 'user' }}</span>
                  <span class="text-[#94A3B8]">{{ formatDateTime(c.dibuat_pada) }}</span>
                </div>

                <div
                  class="rounded-2xl p-3 text-[12px] leading-relaxed shadow-xs"
                  :class="c.nama_pengguna === user?.nama ? 'bg-[#5D87FF] text-white rounded-tr-xs' : 'bg-white text-[#2A3547] border border-[#E5EAEF] rounded-tl-xs'"
                >
                  <p class="whitespace-pre-wrap">{{ c.pesan }}</p>
                  
                  <!-- Attachment in Chat Bubble -->
                  <div v-if="c.attachment" class="mt-2 overflow-hidden rounded-xl border border-white/20">
                    <img :src="c.attachment" alt="Attachment Komentar" class="max-h-40 w-full object-cover" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Chat Bottom Input Bar -->
          <div class="flex flex-col gap-2 rounded-2xl border border-[#DFE5EF] bg-white p-3 shadow-xs">
            <!-- Attachment Preview Bar if selected -->
            <div v-if="commentAttachment" class="flex items-center justify-between gap-2 rounded-xl bg-[#F8FAFC] p-2 border border-[#E5EAEF]">
              <div class="flex items-center gap-2 min-w-0">
                <img :src="commentAttachment" alt="Preview Attachment" class="h-10 w-10 rounded-lg object-cover" />
                <span class="text-[11px] font-bold text-[#2A3547] truncate">Lampiran gambar siap dikirim</span>
              </div>
              <button type="button" @click="removeCommentAttachment" class="text-red-500 hover:text-red-700 cursor-pointer">
                <span class="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <form class="flex items-center gap-2" @submit.prevent="sendComment">
              <!-- Attachment Icon Button -->
              <label title="Tambah Lampiran Gambar" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#7C8BAC] hover:bg-[#ECF2FF] hover:text-[#5D87FF] transition-all cursor-pointer">
                <span class="material-symbols-outlined text-[20px]">add_a_photo</span>
                <input type="file" accept="image/*" class="hidden" @change="handleCommentFileChange" />
              </label>

              <!-- Input Message Field -->
              <input
                v-model="newCommentText"
                type="text"
                placeholder="Tulis komentar atau catatan perbaikan..."
                class="h-10 flex-1 rounded-xl border border-[#DFE5EF] bg-[#F8FAFC] px-4 text-[12px] font-medium text-[#2A3547] outline-none transition-all focus:bg-white focus:border-[#5D87FF]"
              />

              <!-- Send Button -->
              <button
                type="submit"
                :disabled="isSubmittingComment || (!newCommentText.trim() && !commentAttachment)"
                class="flex h-10 px-5 items-center justify-center gap-1.5 rounded-xl bg-[#5D87FF] text-[12px] font-bold text-white shadow-md shadow-blue-500/20 hover:bg-[#4570EA] disabled:opacity-40 transition-all cursor-pointer"
              >
                <span class="material-symbols-outlined text-[18px]">send</span>
                <span>Kirim</span>
              </button>
            </form>
          </div>
        </div>

        <div class="flex justify-end border-t border-[#F1F5F9] pt-4">
          <button type="button" @click="closeModal" class="h-10 rounded-xl bg-[#5D87FF] px-6 text-[12px] font-bold text-white hover:bg-[#4570EA]">
            Tutup
          </button>
        </div>
      </div>
    </AppModal>

    <!-- ── Delete Confirmation Modal ────────────────────── -->
    <AppModal :is-open="showDeleteModal" title="Hapus Tiket" size="sm" @close="closeModal">
      <div class="flex flex-col items-center gap-4 text-center">
        <div v-if="modalError" class="w-full rounded-xl bg-[#FDEDE8] p-3 text-left text-[12px] font-bold text-[#FA896B]">
          {{ modalError }}
        </div>
        <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FDEDE8] text-[#FA896B]">
          <span class="material-symbols-outlined text-[28px]">warning</span>
        </div>
        <div>
          <h4 class="text-[16px] font-extrabold text-[#2A3547]">Hapus Tiket {{ selectedTicket?.nomor_tiket }}?</h4>
          <p class="mt-1 text-[12px] text-[#7C8BAC]">Data tiket akan dihapus permanen dari sistem.</p>
        </div>
        <div class="flex w-full gap-3 mt-2">
          <button type="button" :disabled="isSubmitting" @click="closeModal" class="h-10 flex-1 rounded-xl border border-[#DFE5EF] text-[12px] font-semibold text-[#2A3547]">
            Batal
          </button>
          <button type="button" :disabled="isSubmitting" @click="confirmDeleteTicket" class="h-10 flex-1 rounded-xl bg-[#FA896B] text-[12px] font-bold text-white hover:bg-[#E06748]">
            {{ isSubmitting ? 'Menghapus...' : 'Ya, Hapus' }}
          </button>
        </div>
      </div>
    </AppModal>

  </div>
</template>

