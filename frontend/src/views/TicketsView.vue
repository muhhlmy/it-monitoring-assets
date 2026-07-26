<script setup>
import { computed, onMounted, ref } from 'vue'
import { useApi } from '../composables/useApi.js'
import AppBadge from '../components/ui/AppBadge.vue'
import AppModal from '../components/ui/AppModal.vue'

const { get, post, put, del } = useApi()

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

const emptyForm = () => ({
  judul: '',
  deskripsi: '',
  kategori: 'Hardware',
  prioritas: 'Medium',
  status_tiket: 'Open',
  assigned_to: 'Admin IT',
  pelapor: '',
})

const form = ref(emptyForm())

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
  form.value = { ...ticket }
  modalError.value = ''
  showFormModal.value = true
}

function openDetail(ticket) {
  selectedTicket.value = ticket
  showDetailModal.value = true
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
  if (p === 'urgent') return 'danger'
  if (p === 'high') return 'warning'
  if (p === 'medium') return 'info'
  return 'default'
}

function formatDate(iso) {
  if (!iso) return '-'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
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
          class="flex items-center gap-2 rounded-xl bg-[#5D87FF] px-5 py-3 text-[13px] font-bold text-white shadow-md shadow-blue-500/20 hover:bg-[#4570EA] transition-all"
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
          <option value="">Semua Prioritas</option>
          <option value="Urgent">Urgent</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
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
              <th>Prioritas</th>
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
                  <p class="text-[13px] font-bold text-[#2A3547] leading-tight">{{ ticket.judul }}</p>
                  <p class="text-[11px] text-[#7C8BAC] line-clamp-1">{{ ticket.deskripsi || 'Tidak ada deskripsi' }}</p>
                  <p class="text-[10px] font-medium text-[#7C8BAC] mt-0.5">Pelapor: <span class="font-bold text-[#2A3547]">{{ ticket.pelapor }}</span> • Kategori: {{ ticket.kategori }}</p>
                </div>
              </td>
              <td>
                <AppBadge :type="getPriorityBadgeType(ticket.prioritas)" :text="ticket.prioritas || 'Medium'" />
              </td>
              <td>
                <div class="flex items-center gap-2.5">
                  <div class="flex h-8 w-8 items-center justify-center rounded-full bg-[#ECF2FF] text-[11px] font-bold text-[#5D87FF]">
                    {{ (ticket.assigned_to || 'A').charAt(0).toUpperCase() }}
                  </div>
                  <span class="text-[12px] font-bold text-[#2A3547]">{{ ticket.assigned_to || 'Belum ditugaskan' }}</span>
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
              <td colspan="7" class="py-12 text-center text-[13px] text-[#7C8BAC]">Tidak ada tiket yang ditemukan.</td>
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
            <span class="text-[11px] font-bold uppercase text-[#2A3547]">Pelapor (Karyawan)</span>
            <input v-model="form.pelapor" placeholder="Nama Pelapor" class="form-control" />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-[11px] font-bold uppercase text-[#2A3547]">Assigned To (Petugas IT)</span>
            <input v-model="form.assigned_to" placeholder="Nama Petugas IT" class="form-control" />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-[11px] font-bold uppercase text-[#2A3547]">Kategori</span>
            <select v-model="form.kategori" class="form-control">
              <option value="Hardware">Hardware</option>
              <option value="Software">Software</option>
              <option value="Network">Network</option>
              <option value="Peripheral">Peripheral</option>
              <option value="Akses Sistem">Akses Sistem</option>
            </select>
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-[11px] font-bold uppercase text-[#2A3547]">Prioritas</span>
            <select v-model="form.prioritas" class="form-control">
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Urgent">Urgent</option>
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
    <AppModal :is-open="showDetailModal" title="Rincian Tiket Kendala" size="md" @close="closeModal">
      <div v-if="selectedTicket" class="space-y-4">
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
            <span class="font-bold text-[#2A3547]">{{ selectedTicket.assigned_to || '—' }}</span>
          </div>
          <div class="rounded-xl border border-[#E5EAEF] bg-[#F8FAFC] p-3">
            <span class="block text-[10px] font-bold uppercase text-[#7C8BAC]">Kategori</span>
            <span class="font-bold text-[#2A3547]">{{ selectedTicket.kategori || '—' }}</span>
          </div>
          <div class="rounded-xl border border-[#E5EAEF] bg-[#F8FAFC] p-3">
            <span class="block text-[10px] font-bold uppercase text-[#7C8BAC]">Prioritas</span>
            <AppBadge :type="getPriorityBadgeType(selectedTicket.prioritas)" :text="selectedTicket.prioritas" />
          </div>
        </div>

        <div>
          <span class="block text-[11px] font-bold uppercase text-[#7C8BAC] mb-1">Deskripsi Kendala</span>
          <div class="min-h-24 whitespace-pre-wrap rounded-2xl border border-[#E5EAEF] bg-white p-4 text-[12px] text-[#2A3547]">
            {{ selectedTicket.deskripsi || 'Tidak ada catatan deskripsi rincian.' }}
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
