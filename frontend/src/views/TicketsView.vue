<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useApi } from '../composables/useApi.js'
import { useAuth } from '@/composables/useAuth'
import { onTicketEvent } from '../composables/useTicketRealtime.js'
import { validateAttachmentFile } from '../utils/attachmentPolicy.js'
import AppModal from '../components/ui/AppModal.vue'
import AppRowActions from '../components/ui/AppRowActions.vue'
import AppPagination from '../components/ui/AppPagination.vue'
import TicketCaspRating from '../components/tickets/TicketCaspRating.vue'
import { animateStagger } from '../composables/useGsap.js'
import BaseSkeleton from '../components/ui/skeleton/BaseSkeleton.vue'
import SkeletonList from '../components/ui/skeleton/SkeletonList.vue'

const route = useRoute()
const { get, post, put, del } = useApi()
const { user, isSuperAdmin, isAdmin, hasWritePermission } = useAuth()

const nowTick = ref(Date.now())
let tickerInterval = null

// ── Realtime SSE Handlers (optimistic patch, bukan full refetch) ──
const handleTicketCreated = (data) => {
  if (!data) return
  if (isAdmin.value || isSuperAdmin.value) {
    toast(
      `🔔 Tiket Baru! ${data.nomor_tiket || ''}: ${data.judul || 'Tanpa Judul'} — oleh ${data.pelapor || 'User'}`,
      'info',
    )
  }
  // Tiket baru mungkin di luar filter aktif; refetch untuk konsistensi.
  // Tapi hanya list, bukan stats (stats di-patch terpisah).
  fetchTickets(true)
  // Update stats secara optimistic (total +1, open +1 jika status Open)
  if (data.status_tiket === 'Open') {
    stats.value = {
      ...stats.value,
      totalTickets: (stats.value.totalTickets || 0) + 1,
      openTickets: (stats.value.openTickets || 0) + 1,
    }
  }
}

const handleTicketUpdated = (data) => {
  if (!data) return

  // Patch tiket di list secara optimistic dari payload event
  const idx = tickets.value.findIndex((t) => t.id === data.id)
  if (idx >= 0) {
    tickets.value[idx] = {
      ...tickets.value[idx],
      ...data,
      // Pertahankan field yang tidak ada di payload event
      deskripsi: tickets.value[idx].deskripsi,
      kategori: tickets.value[idx].kategori,
      pelapor: tickets.value[idx].pelapor,
      queue_id: tickets.value[idx].queue_id,
      pelapor_user_id: tickets.value[idx].pelapor_user_id,
      has_attachment: tickets.value[idx].has_attachment,
      queue_kode: tickets.value[idx].queue_kode,
      queue_nama: tickets.value[idx].queue_nama,
      pelapor_nama: tickets.value[idx].pelapor_nama,
      pelapor_nik: tickets.value[idx].pelapor_nik,
      pelapor_jabatan: tickets.value[idx].pelapor_jabatan,
      total_komentar: tickets.value[idx].total_komentar,
    }
  } else {
    // Tiket belum ada di list (mungkin di luar filter) → refetch
    fetchTickets(true)
  }

  // Update selectedTicket jika sedang dibuka di detail modal
  if (selectedTicket.value && data.id === selectedTicket.value.id) {
    selectedTicket.value = { ...selectedTicket.value, ...data }
    fetchTicketHistory(selectedTicket.value.id)
    fetchTicketComments(selectedTicket.value.id, true)
  }

  // Refetch stats untuk update counter (debounced via timeout)
  scheduleStatsRefresh()
}

const handleCommentCreated = (data) => {
  if (!data) return
  // Update total_komentar di list secara optimistic
  const ticketId = data.ticketId || data.id
  if (ticketId) {
    const idx = tickets.value.findIndex((t) => t.id === ticketId)
    if (idx >= 0) {
      tickets.value[idx] = {
        ...tickets.value[idx],
        total_komentar: (tickets.value[idx].total_komentar || 0) + 1,
      }
    }
  }
  // Refresh comments jika detail modal terbuka untuk tiket ini
  if (selectedTicket.value && ticketId === selectedTicket.value.id) {
    fetchTicketComments(selectedTicket.value.id, true)
  }
}

// Debounced stats refresh untuk menghindari burst request saat banyak event
let statsRefreshTimer = null
function scheduleStatsRefresh() {
  if (statsRefreshTimer) clearTimeout(statsRefreshTimer)
  statsRefreshTimer = setTimeout(async () => {
    statsRefreshTimer = null
    try {
      const statsData = await get('/api/tickets/stats')
      if (statsData) stats.value = statsData
    } catch {
      // Silent fail; stats akan update di fetchTickets berikutnya
    }
  }, 500)
}

onMounted(async () => {
  tickerInterval = setInterval(() => {
    nowTick.value = Date.now()
  }, 30000)

  if (!isAdmin.value) {
    activeTab.value = 'all'
  }

  await fetchQueues()
  await fetchTickets()

  // Subscribe ke SSE events (koneksi global dikelola di App.vue)
  unsubTicketCreated = onTicketEvent('TICKET_CREATED', handleTicketCreated)
  unsubTicketUpdated = onTicketEvent('TICKET_UPDATED', handleTicketUpdated)
  unsubCommentCreated = onTicketEvent('COMMENT_CREATED', handleCommentCreated)
})

let unsubTicketCreated = null
let unsubTicketUpdated = null
let unsubCommentCreated = null

onUnmounted(() => {
  if (tickerInterval) clearInterval(tickerInterval)
  if (statsRefreshTimer) clearTimeout(statsRefreshTimer)
  stopChatPoll()
  unsubTicketCreated?.()
  unsubTicketUpdated?.()
  unsubCommentCreated?.()
})

// ── Queue / Tab state ─────────────────────────────────────────
const queues = ref([]) // list queue (HR, IT, GA, OPS)
const activeTab = ref('all') // 'all' | 'unassigned' | 'mine'
const filterQueue = ref('') // queue_id filter

// ── Ticket state ──────────────────────────────────────────────
const tickets = ref([])
const stats = ref({
  totalTickets: 0,
  pendingTickets: 0,
  openTickets: 0,
  closedTickets: 0,
  unassignedTickets: 0,
})
const isLoading = ref(true)
const isSubmitting = ref(false)
const searchQuery = ref('')
const filterStatus = ref('')
const filterPrioritas = ref('')
const pageError = ref('')
const notification = ref(null)
const isClaiming = ref(null) // ticket id yang sedang di-claim

const showFormModal = ref(false)
const showDeleteModal = ref(false)
const showDetailModal = ref(false)
const modalMode = ref('add')
const selectedTicket = ref(null)
const modalError = ref('')

const activeDetailTab = ref('detail')
const ticketHistory = ref([])
const isHistoryLoading = ref(false)

const ticketComments = ref([])
const isCommentsLoading = ref(false)
const newCommentText = ref('')
const commentAttachment = ref(null)
const isSubmittingComment = ref(false)
const isTicketAttachmentLoading = ref(false)
const ticketAttachmentError = ref('')
const attachmentChanged = ref(false)
let ticketAttachmentRequestVersion = 0

const emptyForm = () => ({
  judul: '',
  deskripsi: '',
  kategori: 'Support',
  queue_id: queues.value[0]?.id || '',
  prioritas: 'Medium (3d)',
  status_tiket: 'Open',
  assigned_to_user_id: null,
  attachment: null,
})

const form = ref(emptyForm())

function handleFileChange(event) {
  const file = event.target.files?.[0]
  if (!file) return

  const validationError = validateAttachmentFile(file)
  if (validationError) {
    modalError.value = validationError
    return
  }

  modalError.value = ''
  const reader = new FileReader()
  reader.onload = (e) => {
    form.value.attachment = e.target.result
    attachmentChanged.value = true
  }
  reader.readAsDataURL(file)
}

function removeAttachment() {
  form.value.attachment = null
  attachmentChanged.value = true
}

function handleCommentFileChange(event) {
  const file = event.target.files?.[0]
  if (!file) return
  const validationError = validateAttachmentFile(file)
  if (validationError) {
    modalError.value = validationError
    return
  }
  modalError.value = ''
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
    const matchQuery =
      !q ||
      (t.judul || '').toLowerCase().includes(q) ||
      (t.nomor_tiket || '').toLowerCase().includes(q) ||
      (t.pelapor || '').toLowerCase().includes(q) ||
      (t.pelapor_nama || '').toLowerCase().includes(q) ||
      (t.assigned_to || '').toLowerCase().includes(q) ||
      (t.assigned_to_nama || '').toLowerCase().includes(q) ||
      (t.queue_kode || '').toLowerCase().includes(q)
    const matchStatus = !filterStatus.value || t.status_tiket === filterStatus.value
    const matchPrioritas = !filterPrioritas.value || t.prioritas === filterPrioritas.value
    return matchQuery && matchStatus && matchPrioritas
  })
})

const currentPage = ref(1)
const itemsPerPage = ref(10)

watch([searchQuery, filterStatus, filterPrioritas, activeTab], () => {
  currentPage.value = 1
})

watch(
  () => [route.query.search, route.query.q],
  ([newSearch, newQ]) => {
    const term = newSearch || newQ
    if (typeof term === 'string') {
      searchQuery.value = term
    }
  },
  { immediate: true },
)

const paginatedTickets = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value
  return filteredTickets.value.slice(start, start + itemsPerPage.value)
})

const queueAdmins = ref({})

async function fetchQueueAdmins() {
  if (!isSuperAdmin.value) {
    queueAdmins.value = {}
    return
  }
  try {
    const adminMap = {}
    await Promise.all(
      queues.value.map(async (q) => {
        const data = await get(`/api/ticket-queues/${q.id}/admins`).catch(() => [])
        if (Array.isArray(data)) {
          adminMap[q.id] = data
        }
      }),
    )
    queueAdmins.value = adminMap
  } catch (err) {
    console.error('Gagal memuat admin queue:', err)
  }
}

// eslint-disable-next-line no-unused-vars
function getAdminsForQueue(queueId) {
  if (!queueId) return []
  return queueAdmins.value[queueId] || []
}

async function fetchQueues() {
  try {
    const data = await get('/api/ticket-queues')
    if (Array.isArray(data)) {
      queues.value = data
      await fetchQueueAdmins()
    }
  } catch (err) {
    void err
  }
}

async function fetchTickets(silent = false) {
  if (!silent) isLoading.value = true
  pageError.value = ''
  try {
    const params = new URLSearchParams()
    if (activeTab.value !== 'all') params.set('tab', activeTab.value)
    if (filterQueue.value) params.set('queue_id', filterQueue.value)
    if (filterStatus.value) params.set('status', filterStatus.value)
    if (filterPrioritas.value) params.set('prioritas', filterPrioritas.value)
    if (searchQuery.value.trim()) params.set('search', searchQuery.value.trim())

    const qs = params.toString()
    const [data, statsData] = await Promise.all([
      get(`/api/tickets${qs ? '?' + qs : ''}`),
      get('/api/tickets/stats'),
    ])
    tickets.value = Array.isArray(data) ? data : []
    stats.value = statsData || {
      totalTickets: 0,
      pendingTickets: 0,
      openTickets: 0,
      closedTickets: 0,
      unassignedTickets: 0,
    }
  } catch (err) {
    if (!silent) {
      console.error('Gagal memuat tiket:', err)
      pageError.value = err.message || 'Gagal memuat data tiket.'
    }
  } finally {
    isLoading.value = false
    await nextTick()
    animateStagger('.tck-list-item')
  }
}

async function switchTab(tab) {
  activeTab.value = tab
  await fetchTickets()
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

async function fetchTicketComments(ticketId, silent = false) {
  if (!silent) isCommentsLoading.value = true
  try {
    const res = await get(`/api/tickets/${ticketId}/comments`)
    const previousComments = new Map(ticketComments.value.map((comment) => [comment.id, comment]))
    const newComments = (Array.isArray(res) ? res : []).map((comment) => {
      const previousComment = previousComments.get(comment.id)
      return {
        ...comment,
        attachment: previousComment?.attachment || null,
        is_attachment_loading: previousComment?.is_attachment_loading === true,
        attachment_error: previousComment?.attachment_error || '',
      }
    })
    const hadNewMsg = newComments.length > ticketComments.value.length
    ticketComments.value = newComments
    if (hadNewMsg && silent) {
      await nextTick()
      scrollChatToBottom()
    }
  } catch (err) {
    if (!silent) {
      console.error('Gagal memuat komentar tiket:', err)
      ticketComments.value = []
    }
  } finally {
    isCommentsLoading.value = false
  }
}

async function loadCommentAttachment(comment) {
  const ticketId = selectedTicket.value?.id
  if (
    !ticketId ||
    !comment?.has_attachment ||
    comment.attachment ||
    comment.is_attachment_loading
  ) {
    return
  }

  comment.is_attachment_loading = true
  comment.attachment_error = ''
  try {
    const result = await get(`/api/tickets/${ticketId}/comments/${comment.id}/attachment`)
    if (selectedTicket.value?.id !== ticketId) return

    const currentComment = ticketComments.value.find((item) => item.id === comment.id)
    if (currentComment && typeof result?.attachment === 'string') {
      currentComment.attachment = result.attachment
    }
  } catch (err) {
    if (selectedTicket.value?.id !== ticketId) return
    const currentComment = ticketComments.value.find((item) => item.id === comment.id)
    if (currentComment) {
      currentComment.attachment_error = err.message || 'Gagal memuat lampiran.'
    }
  } finally {
    const currentComment = ticketComments.value.find((item) => item.id === comment.id)
    if (currentComment) currentComment.is_attachment_loading = false
  }
}

const chatContainer = ref(null)
function scrollChatToBottom() {
  const el = chatContainer.value
  if (el) el.scrollTop = el.scrollHeight
}

// ── Realtime Chat Polling ──────────────────────────────────────
let chatPollInterval = null
function startChatPoll(ticketId) {
  stopChatPoll()
  chatPollInterval = setInterval(() => {
    if (showDetailModal.value && activeDetailTab.value === 'comments' && ticketId) {
      fetchTicketComments(ticketId, true)
    }
  }, 3000)
}
function stopChatPoll() {
  if (chatPollInterval) {
    clearInterval(chatPollInterval)
    chatPollInterval = null
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
    })
    newCommentText.value = ''
    commentAttachment.value = null
    await fetchTicketComments(selectedTicket.value.id)
    await nextTick()
    scrollChatToBottom()
  } catch (err) {
    console.error('Gagal mengirim komentar:', err)
  } finally {
    isSubmittingComment.value = false
  }
}

// ── Claim & Assign Ticket (dengan optimistic update) ──────────
async function claimTicket(ticket) {
  isClaiming.value = ticket.id
  // Optimistic: update UI segera, jangan tunggu SSE/polling
  const idx = tickets.value.findIndex((t) => t.id === ticket.id)
  if (idx >= 0) {
    tickets.value[idx] = {
      ...tickets.value[idx],
      assigned_to_user_id: user.value?.id,
      assigned_to: user.value?.nama,
      assigned_to_nama: user.value?.nama,
      status_tiket: 'In Progress',
    }
  }
  try {
    await post(`/api/tickets/${ticket.id}/claim`, {})
    toast(`Tiket '${ticket.judul}' berhasil diambil!`)
    // Refetch stats untuk update counter (unassigned -1, dll)
    scheduleStatsRefresh()
  } catch (err) {
    // Rollback optimistic update
    if (idx >= 0) {
      tickets.value[idx] = {
        ...tickets.value[idx],
        assigned_to_user_id: ticket.assigned_to_user_id,
        assigned_to: ticket.assigned_to,
        assigned_to_nama: ticket.assigned_to_nama,
        status_tiket: ticket.status_tiket,
      }
    }
    toast(err.message || 'Gagal mengambil tiket.', 'error')
  } finally {
    isClaiming.value = null
  }
}

function openAdd() {
  modalMode.value = 'add'
  selectedTicket.value = null
  form.value = emptyForm()
  attachmentChanged.value = false
  ticketAttachmentError.value = ''
  modalError.value = ''
  showFormModal.value = true
}

function openEdit(ticket) {
  modalMode.value = 'edit'
  selectedTicket.value = { ...ticket, attachment: null }
  form.value = {
    judul: ticket.judul || '',
    deskripsi: ticket.deskripsi || '',
    kategori: ticket.kategori || 'Support',
    queue_id: ticket.queue_id || '',
    prioritas: ticket.prioritas || 'Medium (3d)',
    status_tiket: ticket.status_tiket || 'Open',
    assigned_to_user_id: ticket.assigned_to_user_id || null,
    attachment: null,
  }
  attachmentChanged.value = false
  ticketAttachmentError.value = ''
  modalError.value = ''
  showFormModal.value = true
  if (ticket.has_attachment) loadSelectedTicketAttachment(ticket.id, 'edit')
}

function openDetail(ticket) {
  selectedTicket.value = { ...ticket, attachment: null }
  activeDetailTab.value = 'detail'
  ticketAttachmentError.value = ''
  showDetailModal.value = true
  if (ticket.has_attachment) loadSelectedTicketAttachment(ticket.id, 'detail')
  fetchTicketHistory(ticket.id)
  fetchTicketComments(ticket.id)
  startChatPoll(ticket.id)
}

async function loadSelectedTicketAttachment(ticketId, target) {
  const requestVersion = ++ticketAttachmentRequestVersion
  isTicketAttachmentLoading.value = true
  ticketAttachmentError.value = ''
  try {
    const result = await get(`/api/tickets/${ticketId}/attachment`)
    if (
      requestVersion !== ticketAttachmentRequestVersion ||
      selectedTicket.value?.id !== ticketId ||
      typeof result?.attachment !== 'string'
    ) {
      return
    }

    if (target === 'edit') {
      if (!attachmentChanged.value) form.value.attachment = result.attachment
    } else {
      selectedTicket.value = { ...selectedTicket.value, attachment: result.attachment }
    }
  } catch (err) {
    if (
      requestVersion === ticketAttachmentRequestVersion &&
      selectedTicket.value?.id === ticketId
    ) {
      ticketAttachmentError.value = err.message || 'Gagal memuat lampiran tiket.'
    }
  } finally {
    if (requestVersion === ticketAttachmentRequestVersion) {
      isTicketAttachmentLoading.value = false
    }
  }
}

function openDelete(ticket) {
  selectedTicket.value = ticket
  modalError.value = ''
  showDeleteModal.value = true
}

const isUpdatingStatus = ref(false)

function closeModal() {
  ticketAttachmentRequestVersion += 1
  isTicketAttachmentLoading.value = false
  ticketAttachmentError.value = ''
  showFormModal.value = false
  showDeleteModal.value = false
  showDetailModal.value = false
  selectedTicket.value = null
  modalError.value = ''
  stopChatPoll()
  document.body.style.overflow = ''
}

async function updateTicketStatus(ticket, newStatus) {
  if (!ticket || !newStatus || isUpdatingStatus.value) return
  const oldStatus = ticket.status_tiket
  if (oldStatus === newStatus) return

  isUpdatingStatus.value = true
  try {
    // 1. Optimistic Update local ticket in state
    const idx = tickets.value.findIndex((t) => t.id === ticket.id)
    if (idx >= 0) {
      tickets.value[idx] = { ...tickets.value[idx], status_tiket: newStatus }
    }
    if (selectedTicket.value?.id === ticket.id) {
      selectedTicket.value = { ...selectedTicket.value, status_tiket: newStatus }
    }

    // 2. Perform API Mutation
    await put(`/api/tickets/${ticket.id}`, { status_tiket: newStatus })

    toast(`Status tiket ${ticket.nomor_tiket || ''} berhasil diubah menjadi '${newStatus}'.`)

    // 3. Revalidate ticket list & stats counters without full page reload
    await fetchTickets(true)

    // 4. If status changed to Closed, close modal and cleanup state cleanly
    if (newStatus === 'Closed') {
      closeModal()
    } else {
      // Re-fetch detail history & comments
      if (selectedTicket.value?.id === ticket.id) {
        fetchTicketHistory(ticket.id)
        fetchTicketComments(ticket.id)
      }
    }
  } catch (err) {
    // Rollback on error
    const idx = tickets.value.findIndex((t) => t.id === ticket.id)
    if (idx >= 0) {
      tickets.value[idx] = { ...tickets.value[idx], status_tiket: oldStatus }
    }
    if (selectedTicket.value?.id === ticket.id) {
      selectedTicket.value = { ...selectedTicket.value, status_tiket: oldStatus }
    }
    toast(err.message || 'Gagal memperbarui status tiket.', 'error')
  } finally {
    isUpdatingStatus.value = false
  }
}

async function saveTicket() {
  if (!form.value.judul?.trim()) {
    modalError.value = 'Judul tiket wajib diisi.'
    return
  }
  if (!form.value.queue_id) {
    modalError.value = 'Unit tujuan wajib dipilih.'
    return
  }

  isSubmitting.value = true
  modalError.value = ''

  try {
    const payload = {
      judul: form.value.judul.trim(),
      deskripsi: form.value.deskripsi || '',
      kategori: form.value.kategori || 'Support',
      queue_id: Number(form.value.queue_id),
      prioritas: form.value.prioritas,
    }

    if (modalMode.value === 'add') {
      payload.attachment = form.value.attachment || null
      await post('/api/tickets', payload)
      toast('Tiket baru berhasil dibuat.')
      // Refetch untuk mendapatkan tiket baru dengan nomor_tiket final
      await fetchTickets()
    } else {
      if (attachmentChanged.value) payload.attachment = form.value.attachment || null
      // Optimistic update untuk edit mode
      const ticketId = selectedTicket.value.id
      const idx = tickets.value.findIndex((t) => t.id === ticketId)
      const oldTicket = idx >= 0 ? { ...tickets.value[idx] } : null
      if (idx >= 0) {
        tickets.value[idx] = {
          ...tickets.value[idx],
          judul: payload.judul,
          deskripsi: payload.deskripsi,
          prioritas: payload.prioritas,
          status_tiket: form.value.status_tiket,
        }
      }
      try {
        await put(`/api/tickets/${ticketId}`, {
          ...payload,
          status_tiket: form.value.status_tiket,
        })
        toast('Tiket berhasil diperbarui.')
        scheduleStatsRefresh()
      } catch (err) {
        // Rollback
        if (idx >= 0 && oldTicket) tickets.value[idx] = oldTicket
        throw err
      }
    }
    closeModal()
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

  let formatted
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
      isClosed: false,
    }
  }

  return {
    text: `⏱️ ${formatted} sisa`,
    isOverdue: false,
    isClosed: false,
  }
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

function formatRelativeTime(iso) {
  if (!iso) return '-'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '-'
  const diffSec = Math.floor((nowTick.value - date.getTime()) / 1000)
  if (diffSec < 60) return 'Baru saja'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m lalu`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}j lalu`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}h lalu`
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
}

function getStatusDotInfo(status) {
  const s = (status || '').toLowerCase()
  if (s === 'open')
    return {
      dotClass: 'bg-emerald-500',
      textClass: 'text-emerald-700 font-semibold',
      label: 'Open',
    }
  if (s === 'in progress')
    return {
      dotClass: 'bg-blue-500',
      textClass: 'text-blue-700 font-semibold',
      label: 'In Progress',
    }
  if (s === 'pending')
    return { dotClass: 'bg-amber-500', textClass: 'text-amber-700 font-semibold', label: 'Pending' }
  if (s === 'resolved')
    return { dotClass: 'bg-teal-500', textClass: 'text-teal-700 font-semibold', label: 'Resolved' }
  if (s === 'closed')
    return { dotClass: 'bg-slate-400', textClass: 'text-slate-600 font-medium', label: 'Closed' }
  if (s === 'cancelled')
    return { dotClass: 'bg-rose-500', textClass: 'text-rose-600 font-medium', label: 'Cancelled' }
  return {
    dotClass: 'bg-slate-400',
    textClass: 'text-slate-600 font-medium',
    label: status || 'Open',
  }
}

function getPriorityInfo(prioritas) {
  const p = (prioritas || '').toLowerCase()
  if (p.includes('urgent') || p.includes('4h')) {
    return { label: 'Critical', class: 'text-rose-600 font-bold bg-rose-50 border-rose-200' }
  }
  if (p.includes('high') || p.includes('1day')) {
    return { label: 'High', class: 'text-amber-700 font-semibold bg-amber-50 border-amber-200' }
  }
  if (p.includes('medium') || p.includes('3d')) {
    return { label: 'Medium', class: 'text-slate-700 font-medium bg-slate-100 border-slate-200' }
  }
  return { label: 'Low', class: 'text-slate-500 font-medium bg-slate-50 border-slate-200' }
}

function getSlaInfo(ticket) {
  const sla = getSlaCountdownInfo(ticket)
  if (sla.isClosed) return { text: '✓ Selesai', class: 'text-slate-400 font-medium' }
  if (sla.isOverdue) return { text: sla.text, class: 'text-rose-600 font-semibold' }
  return { text: sla.text, class: 'text-slate-500 font-medium' }
}

function getTicketActions(ticket) {
  const actions = [
    {
      label: 'Lihat Detail Tiket',
      icon: 'visibility',
      onClick: () => openDetail(ticket),
    },
  ]

  if (isAdmin.value || isSuperAdmin.value) {
    if (
      !ticket.assigned_to_user_id &&
      !['Closed', 'Resolved', 'Cancelled'].includes(ticket.status_tiket)
    ) {
      actions.push({
        label: 'Ambil Tiket Ini',
        icon: 'person_add',
        onClick: () => claimTicket(ticket),
      })
    }

    if (hasWritePermission('tickets')) {
      actions.push({
        label: 'Edit & Status Tiket',
        icon: 'edit',
        onClick: () => openEdit(ticket),
      })
    }
  }

  if (isSuperAdmin.value) {
    actions.push({
      label: 'Hapus Tiket',
      icon: 'delete',
      danger: true,
      onClick: () => openDelete(ticket),
    })
  }
  return actions
}

function getAssigneeName(val, fallback = 'Unassigned') {
  if (!val) return fallback
  if (typeof val === 'string') return val
  if (typeof val === 'object' && val !== null) {
    return val.nama || val.name || val.username || fallback
  }
  return String(val)
}

let toastTimer
function toast(message, type = 'success') {
  window.clearTimeout(toastTimer)
  notification.value = { message, type }
  toastTimer = window.setTimeout(() => {
    notification.value = null
  }, 3500)
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-5">
    <!-- Toast Notification -->
    <Transition name="slide-right">
      <div
        v-if="notification"
        class="fixed left-4 right-4 top-4 z-[60] flex items-center gap-3 rounded-2xl px-4 py-3 text-white shadow-xl sm:left-auto sm:right-5 sm:max-w-md"
        :class="notification.type === 'error' ? 'bg-[#FA896B]' : 'bg-[#13DEB9]'"
      >
        <span class="material-symbols-outlined text-[20px]">{{
          notification.type === 'error' ? 'error' : 'check_circle'
        }}</span>
        <span class="text-[13px] font-bold">{{ notification.message }}</span>
      </div>
    </Transition>

    <!-- ── 1. Page Header ───────────────────────────────── -->
    <div
      class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-[#E2E8F0]/80 shadow-2xs"
    >
      <div>
        <h1 class="text-xl font-bold text-[#0F172A] tracking-tight">
          {{ isAdmin || isSuperAdmin ? 'Ticket Inbox' : 'Tiket' }}
        </h1>
        <p class="text-xs font-normal text-[#64748B] mt-0.5">
          {{
            isAdmin || isSuperAdmin ? 'Kelola pengajuan dan kendala IT' : 'Pengajuan dan layanan IT'
          }}
        </p>
      </div>

      <button
        type="button"
        @click="openAdd"
        class="h-9 shrink-0 whitespace-nowrap rounded-xl bg-[#2563EB] px-4 text-xs font-bold text-white shadow-2xs hover:bg-[#1D4ED8] transition-all flex items-center justify-center gap-1.5 cursor-pointer self-start sm:self-auto"
        :title="isAdmin || isSuperAdmin ? 'Buat tiket baru' : 'Request ticket baru'"
      >
        <span class="material-symbols-outlined text-[16px]">add</span>
        <span>{{ isAdmin || isSuperAdmin ? 'Buat Tiket' : 'Request Ticket' }}</span>
      </button>
    </div>

    <!-- ── 2. Integrated Control Bar & Workspace Navigation ─ -->
    <div class="flex flex-col gap-3 bg-white p-4 rounded-2xl border border-[#E2E8F0]/80 shadow-2xs">
      <!-- Top Row: Queue Tabs & Secondary Summary -->
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-[#F1F5F9] pb-3">
        <!-- Ticket Queue Navigation (Tabs) -->
        <div class="flex items-center gap-1.5 overflow-x-auto">
          <button
            v-for="tab in !isAdmin && !isSuperAdmin
              ? [
                  { key: 'all', label: 'Semua Request' },
                  { key: 'open', label: 'Sedang Diproses' },
                  { key: 'closed', label: 'Selesai' },
                ]
              : [
                  { key: 'all', label: 'Inbox', count: stats.totalTickets },
                  { key: 'unassigned', label: 'Belum Diambil', count: stats.unassignedTickets },
                  { key: 'assigned', label: 'Ditangani Saya', count: stats.openTickets },
                  { key: 'closed', label: 'Selesai', count: stats.closedTickets },
                ]"
            :key="tab.key"
            type="button"
            @click="switchTab(tab.key)"
            class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all whitespace-nowrap cursor-pointer"
            :class="
              activeTab === tab.key
                ? 'bg-[#2563EB] text-white shadow-2xs'
                : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A]'
            "
          >
            <span>{{ tab.label }}</span>
            <span
              v-if="tab.count !== undefined"
              class="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold"
              :class="
                activeTab === tab.key
                  ? 'bg-white/20 text-white'
                  : tab.key === 'unassigned' && tab.count > 0
                    ? 'bg-rose-500 text-white'
                    : 'bg-[#F1F5F9] text-[#64748B]'
              "
            >
              {{ tab.count }}
            </span>
          </button>
        </div>

        <!-- Secondary Summary (Quiet metadata) -->
        <div
          class="text-[12px] font-medium text-[#64748B] flex items-center gap-1.5 shrink-0 select-none"
        >
          <span
            ><strong class="text-[#0F172A] font-bold">{{ stats.totalTickets }}</strong> Inbox</span
          >
          <span>·</span>
          <span
            ><strong class="text-emerald-600 font-bold">{{ stats.openTickets }}</strong> Open</span
          >
          <span>·</span>
          <span
            ><strong class="text-amber-600 font-bold">{{ stats.pendingTickets }}</strong>
            Pending</span
          >
          <span>·</span>
          <span
            ><strong class="text-slate-600 font-bold">{{ stats.closedTickets }}</strong>
            Closed</span
          >
        </div>
      </div>

      <!-- Bottom Row: Toolbar (Search + Filters) -->
      <div class="flex flex-wrap items-center justify-between gap-3">
        <!-- Search Input -->
        <div class="relative flex-1 min-w-[220px]">
          <span
            class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-[#94A3B8] pointer-events-none"
            >search</span
          >
          <input
            v-model="searchQuery"
            type="search"
            placeholder="Cari ticket, judul, nomor, pelapor..."
            class="h-9 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] pl-9 pr-3 text-xs font-medium text-[#0F172A] placeholder-[#94A3B8] focus:border-[#2563EB] focus:bg-white focus:outline-none transition-all"
            @keyup.enter="fetchTickets"
          />
        </div>

        <!-- Filter Options -->
        <div class="flex items-center gap-2 flex-wrap">
          <select
            v-model="filterStatus"
            @change="fetchTickets"
            class="h-9 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-xs font-semibold text-[#334155] focus:border-[#2563EB] focus:outline-none cursor-pointer"
          >
            <option value="">Status: Semua</option>
            <option value="Open">Open</option>
            <option value="In Progress">In Progress</option>
            <option value="Pending">Pending</option>
            <option value="Resolved">Resolved</option>
            <option value="Closed">Closed</option>
          </select>

          <select
            v-model="filterPrioritas"
            @change="fetchTickets"
            class="h-9 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-xs font-semibold text-[#334155] focus:border-[#2563EB] focus:outline-none cursor-pointer"
          >
            <option value="">Priority: Semua</option>
            <option value="Urgent (4h)">Critical</option>
            <option value="High (1day)">High</option>
            <option value="Medium (3d)">Medium</option>
            <option value="Low (7d)">Low</option>
          </select>

          <select
            v-model="filterQueue"
            @change="fetchTickets"
            class="h-9 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-xs font-semibold text-[#334155] focus:border-[#2563EB] focus:outline-none cursor-pointer"
          >
            <option value="">Unit: Semua</option>
            <option v-for="q in queues" :key="q.id" :value="q.id">
              {{ q.kode }} — {{ q.nama }}
            </option>
          </select>
        </div>
      </div>
    </div>

    <!-- ── 3. Ticket Inbox / Issue List Surface ───────────── -->
    <div class="rounded-2xl border border-[#E2E8F0]/80 bg-white shadow-2xs overflow-hidden">
      <!-- Loading Skeleton (Matches real ticket row layout 100%) -->
      <div v-if="isLoading" aria-busy="true" class="divide-y divide-[#F1F5F9]">
        <div
          v-for="r in 5"
          :key="'tck-skel-' + r"
          class="flex items-center justify-between gap-4 px-6 py-4 min-h-[76px] select-none"
        >
          <!-- Left Zone: Ticket Identity & Metadata Stack -->
          <div class="flex flex-col gap-1.5 min-w-0 flex-1">
            <!-- Title -->
            <BaseSkeleton :width="r % 2 === 0 ? '60%' : '75%'" height="16px" radius="md" />

            <!-- Description Snippet -->
            <BaseSkeleton :width="r % 2 === 0 ? '80%' : '65%'" height="13.5px" radius="sm" />

            <!-- Sub-metadata Line -->
            <div class="flex items-center gap-2 mt-0.5 flex-wrap">
              <BaseSkeleton width="110px" height="12px" radius="sm" />
              <span class="text-[#CBD5E1]">·</span>
              <BaseSkeleton width="80px" height="12px" radius="sm" />
              <span class="text-[#CBD5E1]">·</span>
              <BaseSkeleton width="60px" height="12px" radius="sm" />
              <span class="text-[#CBD5E1]">·</span>
              <BaseSkeleton width="50px" height="12px" radius="sm" />
              <span class="text-[#CBD5E1]">·</span>
              <BaseSkeleton width="70px" height="12px" radius="sm" />
            </div>
          </div>

          <!-- Right Zone: Status Indicator & Chevron -->
          <div class="flex items-center gap-3 shrink-0">
            <div class="flex items-center gap-1.5 min-w-[95px] justify-end">
              <BaseSkeleton width="8px" height="8px" radius="full" />
              <BaseSkeleton width="55px" height="14px" radius="md" />
            </div>
            <BaseSkeleton width="18px" height="18px" radius="md" />
          </div>
        </div>
      </div>

      <!-- Error State -->
      <div v-else-if="pageError" class="bg-[#FDEDE8] p-5 text-[13px] font-semibold text-[#FA896B]">
        {{ pageError }}
      </div>

      <!-- Content Surface (Horizontal Flex Issue Items) -->
      <div v-else class="divide-y divide-[#F1F5F9]">
        <!-- ── USER ROLE ISSUE LIST ITEMS ── -->
        <template v-if="!isAdmin && !isSuperAdmin">
          <div
            v-for="ticket in paginatedTickets"
            :key="ticket.id"
            @click="openDetail(ticket)"
            class="tck-list-item group flex items-center justify-between gap-4 px-6 py-4 hover:bg-[#F8FAFC] transition-colors duration-150 cursor-pointer select-none min-h-[76px]"
          >
            <!-- Left Zone: Ticket Identity & Metadata Stack -->
            <div class="flex flex-col gap-1 min-w-0 flex-1">
              <!-- Title (16px semibold/bold focal point) -->
              <h3
                class="text-[16px] font-semibold text-[#0F172A] group-hover:text-[#2563EB] transition-colors line-clamp-1"
              >
                {{ ticket.judul }}
              </h3>

              <!-- Description Snippet (13.5px muted) -->
              <p
                v-if="ticket.deskripsi"
                class="text-[13.5px] font-normal text-[#64748B] line-clamp-1"
              >
                {{ ticket.deskripsi }}
              </p>

              <!-- Single Muted Sub-metadata Line -->
              <div class="flex items-center gap-2 text-[12px] text-[#94A3B8] flex-wrap mt-0.5">
                <span class="font-mono text-[#64748B]">{{
                  ticket.nomor_tiket || `TCK-${ticket.id}`
                }}</span>
                <span>·</span>
                <span>{{ ticket.queue_kode || 'IT' }}</span>
                <span>·</span>
                <span>{{ getPriorityInfo(ticket.prioritas).label }}</span>
                <span>·</span>
                <span>{{ formatRelativeTime(ticket.diperbarui_pada || ticket.dibuat_pada) }}</span>
                <span v-if="ticket.total_komentar > 0">· {{ ticket.total_komentar }} comments</span>
                <span v-if="ticket.has_attachment" class="flex items-center gap-0.5"
                  ><span class="material-symbols-outlined text-[13px]">attach_file</span></span
                >
              </div>
            </div>

            <!-- Right Zone: Status Indicator & Chevron -->
            <div class="flex items-center gap-3 shrink-0">
              <div class="flex items-center gap-1.5 min-w-[95px] justify-end">
                <span
                  class="h-2 w-2 rounded-full shrink-0"
                  :class="getStatusDotInfo(ticket.status_tiket).dotClass"
                ></span>
                <span
                  class="text-[13.5px] font-semibold"
                  :class="getStatusDotInfo(ticket.status_tiket).textClass"
                >
                  {{ getStatusDotInfo(ticket.status_tiket).label }}
                </span>
              </div>

              <span
                class="material-symbols-outlined text-[18px] text-[#CBD5E1] group-hover:text-[#2563EB] group-hover:translate-x-0.5 transition-all"
              >
                chevron_right
              </span>
            </div>
          </div>
        </template>

        <!-- ── ADMIN / SUPERADMIN ROLE ISSUE LIST ITEMS ── -->
        <template v-else>
          <div
            v-for="ticket in paginatedTickets"
            :key="ticket.id"
            @click="openDetail(ticket)"
            class="tck-list-item group flex items-center justify-between gap-4 px-6 py-4 hover:bg-[#F8FAFC] transition-colors duration-150 cursor-pointer select-none min-h-[76px]"
          >
            <!-- Left Zone: Ticket Identity & Metadata Stack -->
            <div class="flex flex-col gap-1 min-w-0 flex-1">
              <!-- Title (16px semibold/bold focal point) -->
              <h3
                class="text-[16px] font-semibold text-[#0F172A] group-hover:text-[#2563EB] transition-colors line-clamp-1"
              >
                {{ ticket.judul }}
              </h3>

              <!-- Description Snippet (13.5px muted) -->
              <p
                v-if="ticket.deskripsi"
                class="text-[13.5px] font-normal text-[#64748B] line-clamp-1"
              >
                {{ ticket.deskripsi }}
              </p>

              <!-- Single Muted Sub-metadata Line -->
              <div class="flex items-center gap-2 text-[12px] text-[#94A3B8] flex-wrap mt-0.5">
                <span class="font-mono text-[#64748B]">{{
                  ticket.nomor_tiket || `TCK-${ticket.id}`
                }}</span>
                <span>·</span>
                <span class="text-[#334155] font-medium">{{
                  ticket.pelapor_nama || ticket.pelapor || 'User'
                }}</span>
                <span>·</span>
                <span>{{ ticket.queue_kode || 'IT' }}</span>
                <span>·</span>
                <span>{{ getPriorityInfo(ticket.prioritas).label }}</span>
                <span>·</span>
                <span>SLA {{ getSlaInfo(ticket).text }}</span>
                <span>·</span>
                <span>{{ getAssigneeName(ticket.assigned_to_nama || ticket.assigned_to) }}</span>
                <span>·</span>
                <span>{{ formatRelativeTime(ticket.diperbarui_pada || ticket.dibuat_pada) }}</span>
                <span v-if="ticket.total_komentar > 0">· {{ ticket.total_komentar }} comments</span>
                <span v-if="ticket.has_attachment" class="flex items-center gap-0.5"
                  ><span class="material-symbols-outlined text-[13px]">attach_file</span></span
                >
              </div>
            </div>

            <!-- Right Zone: Status Indicator & Actions -->
            <div class="flex items-center gap-3 shrink-0">
              <div class="flex items-center gap-1.5 min-w-[100px] justify-end">
                <span
                  class="h-2 w-2 rounded-full shrink-0"
                  :class="getStatusDotInfo(ticket.status_tiket).dotClass"
                ></span>
                <span
                  class="text-[13.5px] font-semibold"
                  :class="getStatusDotInfo(ticket.status_tiket).textClass"
                >
                  {{ getStatusDotInfo(ticket.status_tiket).label }}
                </span>
              </div>

              <!-- Row Action Kebab Menu -->
              <div @click.stop class="shrink-0">
                <AppRowActions :actions="getTicketActions(ticket)" />
              </div>
            </div>
          </div>
        </template>

        <!-- ── EMPTY STATES ── -->
        <div v-if="filteredTickets.length === 0" class="py-16 text-center">
          <div class="mx-auto flex max-w-sm flex-col items-center justify-center text-center">
            <div
              class="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F1F5F9] text-[#94A3B8] mb-3"
            >
              <span class="material-symbols-outlined text-[24px]">inbox</span>
            </div>

            <!-- Empty state title -->
            <h3 class="text-sm font-bold text-[#0F172A]">
              {{
                searchQuery || filterStatus || filterPrioritas || filterQueue
                  ? 'Tidak ada ticket yang cocok'
                  : !isAdmin && !isSuperAdmin
                    ? 'Belum ada request'
                    : activeTab === 'all'
                      ? 'Inbox kosong'
                      : 'Tidak ada ticket'
              }}
            </h3>

            <!-- Empty state description -->
            <p class="mt-1 text-xs text-[#64748B] max-w-xs">
              {{
                searchQuery || filterStatus || filterPrioritas || filterQueue
                  ? 'Coba ubah pencarian atau filter.'
                  : !isAdmin && !isSuperAdmin
                    ? 'Pengajuan bantuan IT Anda akan muncul di sini.'
                    : activeTab === 'all'
                      ? 'Tidak ada ticket yang menunggu penanganan.'
                      : 'Belum ada ticket pada kategori ini.'
              }}
            </p>

            <button
              v-if="!searchQuery && !filterStatus && !filterPrioritas && !filterQueue"
              type="button"
              @click="openAdd"
              class="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#2563EB] px-3.5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-[#1D4ED8] transition-all cursor-pointer"
            >
              <span class="material-symbols-outlined text-[16px]">add</span>
              <span>{{
                !isAdmin && !isSuperAdmin ? 'Request Ticket Pertama' : 'Buat Tiket Baru'
              }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <AppPagination
        v-if="!isLoading && !pageError"
        v-model:currentPage="currentPage"
        :total-items="filteredTickets.length"
        :items-per-page="itemsPerPage"
      />
    </div>

    <!-- ── Create / Edit Ticket Modal ─────────────────────── -->
    <AppModal
      :is-open="showFormModal"
      :title="
        modalMode === 'add'
          ? isAdmin || isSuperAdmin
            ? 'Buat Tiket Baru'
            : 'Request Ticket Baru'
          : 'Edit Tiket Kendala'
      "
      :subtitle="
        modalMode === 'add'
          ? isAdmin || isSuperAdmin
            ? 'Buat dan kelola tiket penanganan masalah IT'
            : 'Ajukan permintaan bantuan IT kepada tim support'
          : 'Perbarui rincian kendala atau status tiket'
      "
      icon="confirmation_number"
      size="lg"
      @close="closeModal"
    >
      <form class="space-y-6 p-1" @submit.prevent="saveTicket">
        <!-- Error Banner -->
        <div
          v-if="modalError"
          class="flex items-center gap-2.5 rounded-xl bg-rose-50 p-3.5 text-xs font-semibold text-rose-600 border border-rose-100"
        >
          <span class="material-symbols-outlined text-[18px] shrink-0">error</span>
          <span>{{ modalError }}</span>
        </div>

        <!-- SECTION 1: KENDALA -->
        <div class="space-y-4">
          <div class="border-b border-[#F1F5F9] pb-1.5">
            <span class="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]"
              >1. Kendala</span
            >
          </div>

          <!-- Judul Kendala -->
          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-bold text-[#0F172A] flex items-center gap-1">
              <span>Judul Kendala</span>
              <span class="text-rose-500">*</span>
            </label>
            <input
              v-model="form.judul"
              type="text"
              required
              placeholder="Contoh: Laptop tidak dapat terhubung ke Wi-Fi"
              class="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-xs font-medium text-[#0F172A] placeholder-[#94A3B8] transition-all focus:bg-white focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
            />
          </div>

          <!-- Deskripsi -->
          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-bold text-[#0F172A]">Deskripsi</label>
            <textarea
              v-model="form.deskripsi"
              rows="3"
              placeholder="Jelaskan kendala secara singkat dan detail agar tim dapat membantu..."
              class="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-xs font-medium text-[#0F172A] placeholder-[#94A3B8] transition-all focus:bg-white focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 resize-y min-h-[96px] max-h-[160px]"
            ></textarea>
            <p class="text-[11px] font-normal text-[#94A3B8]">
              Sertakan pesan error, kondisi perangkat, atau langkah yang sudah dicoba.
            </p>
          </div>
        </div>

        <!-- SECTION 2: PENANGANAN -->
        <div class="space-y-4">
          <div class="border-b border-[#F1F5F9] pb-1.5">
            <span class="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]"
              >2. Kategori & Penanganan</span
            >
          </div>

          <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <!-- Kategori Tiket -->
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-bold text-[#0F172A] flex items-center gap-1">
                <span>Kategori Tiket</span>
                <span class="text-rose-500">*</span>
              </label>
              <select
                v-model="form.kategori"
                required
                class="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-xs font-medium text-[#0F172A] transition-all focus:bg-white focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 cursor-pointer"
              >
                <option value="Request">Request (Permintaan)</option>
                <option value="Support">Support (Kendala)</option>
              </select>
            </div>

            <!-- Unit Tujuan -->
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-bold text-[#0F172A] flex items-center gap-1">
                <span>Unit Tujuan</span>
                <span class="text-rose-500">*</span>
              </label>
              <select
                v-model="form.queue_id"
                required
                class="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-xs font-medium text-[#0F172A] transition-all focus:bg-white focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 cursor-pointer"
              >
                <option value="" disabled>-- Pilih Unit Tujuan --</option>
                <option v-for="q in queues" :key="q.id" :value="q.id">
                  {{ q.kode }} — {{ q.nama }}
                </option>
              </select>
            </div>

            <!-- Prioritas SLA -->
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-bold text-[#0F172A]">Prioritas SLA</label>
              <select
                v-model="form.prioritas"
                class="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-xs font-medium text-[#0F172A] transition-all focus:bg-white focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 cursor-pointer"
              >
                <option value="Low (7d)">Low · Target 7 hari</option>
                <option value="Medium (3d)">Medium · Target 3 hari</option>
                <option value="High (1day)">High · Target 1 hari</option>
                <option value="Urgent (4h)">Critical · Target 4 jam</option>
              </select>
            </div>

            <!-- Status Tiket (Edit Mode Only) -->
            <div v-if="modalMode === 'edit'" class="flex flex-col gap-1.5 sm:col-span-3">
              <label class="text-xs font-bold text-[#0F172A]">Status Tiket</label>
              <select
                v-model="form.status_tiket"
                class="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-xs font-medium text-[#0F172A] transition-all focus:bg-white focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 cursor-pointer"
              >
                <option value="Open">Open</option>
                <option value="In Progress">In Progress</option>
                <option value="Pending">Pending</option>
                <option value="Resolved">Resolved</option>
                <option value="Closed">Closed</option>
              </select>
            </div>
          </div>
        </div>

        <!-- SECTION 3: LAMPIRAN -->
        <div class="space-y-3">
          <div class="border-b border-[#F1F5F9] pb-1.5">
            <span class="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]"
              >3. Lampiran</span
            >
          </div>

          <div class="flex flex-col gap-2">
            <div class="flex items-center gap-3 flex-wrap">
              <label
                class="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 text-xs font-semibold text-[#334155] hover:bg-[#F1F5F9] hover:border-[#CBD5E1] transition-all cursor-pointer select-none"
              >
                <span class="material-symbols-outlined text-[18px] text-[#64748B]"
                  >attach_file</span
                >
                <span>+ Tambah File</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  class="hidden"
                  @change="handleFileChange"
                />
              </label>
              <span class="text-[11.5px] font-normal text-[#94A3B8]">PNG, JPG hingga 5 MB</span>
              <span
                v-if="isTicketAttachmentLoading"
                class="text-[11.5px] font-medium text-[#2563EB] flex items-center gap-1"
              >
                <span class="material-symbols-outlined text-[14px] animate-spin"
                  >progress_activity</span
                >
                Memuat...
              </span>
            </div>

            <p v-if="ticketAttachmentError" class="text-[11px] font-medium text-rose-600 mt-1">
              {{ ticketAttachmentError }}
            </p>

            <!-- Attachment Item Card / Preview -->
            <div
              v-if="form.attachment"
              class="relative mt-2 flex items-center justify-between gap-3 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-3 max-w-md"
            >
              <div class="flex items-center gap-3 min-w-0">
                <div
                  class="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-[#E2E8F0] bg-white"
                >
                  <img
                    :src="form.attachment"
                    alt="Preview Attachment"
                    class="h-full w-full object-cover"
                  />
                </div>
                <div class="min-w-0">
                  <p class="text-xs font-bold text-[#0F172A] truncate">Gambar kendala terlampir</p>
                  <p class="text-[10.5px] text-[#64748B] truncate mt-0.5">
                    Siap diunggah bersama tiket
                  </p>
                </div>
              </div>
              <button
                type="button"
                @click="removeAttachment"
                class="flex h-7 w-7 items-center justify-center rounded-xl text-[#94A3B8] hover:bg-rose-50 hover:text-rose-600 transition-colors shrink-0 cursor-pointer"
                title="Hapus Lampiran"
              >
                <span class="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
          </div>
        </div>

        <!-- FOOTER ACTIONS -->
        <div class="flex items-center justify-end gap-2.5 border-t border-[#F1F5F9] pt-4 mt-6">
          <button
            type="button"
            :disabled="isSubmitting"
            @click="closeModal"
            class="h-10 rounded-xl border border-[#E2E8F0] px-4 py-2 text-xs font-semibold text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A] transition-colors cursor-pointer"
          >
            Batal
          </button>
          <button
            type="submit"
            :disabled="isSubmitting"
            class="h-10 rounded-xl bg-[#2563EB] px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#1D4ED8] transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
          >
            <span v-if="isSubmitting" class="material-symbols-outlined text-[16px] animate-spin"
              >progress_activity</span
            >
            <span>{{
              isSubmitting
                ? 'Menyimpan...'
                : modalMode === 'add'
                  ? isAdmin || isSuperAdmin
                    ? 'Buat Tiket'
                    : 'Submit Request'
                  : 'Simpan Perubahan'
            }}</span>
          </button>
        </div>
      </form>
    </AppModal>

    <!-- ── Detail Ticket Modal (Modern SaaS Ticket Workspace) ─ -->
    <AppModal :is-open="showDetailModal" title="" size="xl" @close="closeModal">
      <div v-if="selectedTicket" class="flex flex-col text-[#0F172A]">
        <!-- HEADER AREA (Compact SaaS Title Block) -->
        <div class="flex items-center justify-between gap-4 border-b border-[#F1F5F9] pb-4 mb-4">
          <div class="flex flex-col gap-1 min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <span
                class="font-mono text-xs font-semibold text-[#64748B] bg-[#F1F5F9] px-2 py-0.5 rounded-md"
              >
                {{ selectedTicket.nomor_tiket }}
              </span>
              <span class="text-xs text-[#CBD5E1]">·</span>
              <div class="flex items-center gap-1.5">
                <span
                  class="h-2 w-2 rounded-full shrink-0"
                  :class="getStatusDotInfo(selectedTicket.status_tiket).dotClass"
                ></span>
                <span
                  class="text-xs font-semibold"
                  :class="getStatusDotInfo(selectedTicket.status_tiket).textClass"
                >
                  {{ getStatusDotInfo(selectedTicket.status_tiket).label }}
                </span>
              </div>
            </div>
            <h2 class="text-[17px] font-bold text-[#0F172A] leading-snug line-clamp-2">
              {{ selectedTicket.judul }}
            </h2>
          </div>
        </div>

        <!-- NAVIGATION TABS (Clean Segmented Bar) -->
        <div class="flex items-center gap-1 border-b border-[#F1F5F9] pb-3 mb-5">
          <button
            type="button"
            @click="activeDetailTab = 'detail'"
            class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer select-none"
            :class="
              activeDetailTab === 'detail'
                ? 'bg-[#F1F5F9] text-[#0F172A]'
                : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A]'
            "
          >
            <span class="material-symbols-outlined text-[16px] text-[#64748B]">info</span>
            <span>Overview</span>
          </button>

          <button
            type="button"
            @click="activeDetailTab = 'history'"
            class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer select-none"
            :class="
              activeDetailTab === 'history'
                ? 'bg-[#F1F5F9] text-[#0F172A]'
                : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A]'
            "
          >
            <span class="material-symbols-outlined text-[16px] text-[#64748B]">history</span>
            <span>Activity</span>
            <span
              class="ml-0.5 rounded-full bg-[#E2E8F0]/70 px-1.5 py-0.2 text-[10px] font-medium text-[#475569]"
            >
              {{ ticketHistory.length }}
            </span>
          </button>

          <button
            type="button"
            @click="activeDetailTab = 'comments'"
            class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer select-none"
            :class="
              activeDetailTab === 'comments'
                ? 'bg-[#F1F5F9] text-[#0F172A]'
                : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A]'
            "
          >
            <span class="material-symbols-outlined text-[16px] text-[#64748B]">forum</span>
            <span>Discussion</span>
            <span
              class="ml-0.5 rounded-full bg-[#E2E8F0]/70 px-1.5 py-0.2 text-[10px] font-medium text-[#475569]"
            >
              {{ ticketComments.length }}
            </span>
          </button>
        </div>

        <!-- MAIN SCROLL CONTENT AREA -->
        <div class="space-y-6">
          <!-- TAB 1: OVERVIEW -->
          <div v-if="activeDetailTab === 'detail'" class="space-y-6">
            <!-- Deskripsi Kendala -->
            <div class="space-y-1.5">
              <h3 class="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                Deskripsi
              </h3>
              <p class="text-xs text-[#334155] leading-relaxed whitespace-pre-wrap">
                {{ selectedTicket.deskripsi || 'Tidak ada catatan deskripsi rincian.' }}
              </p>
            </div>

            <!-- Detail Tiket Grid (2-Column Desktop, 1-Column Mobile) -->
            <div class="pt-4 border-t border-[#F1F5F9] space-y-3">
              <h3 class="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                Detail Tiket
              </h3>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-xs">
                <!-- Pelapor -->
                <div class="flex flex-col gap-0.5">
                  <span class="text-[11px] font-medium text-[#94A3B8]">Pelapor</span>
                  <span class="font-semibold text-[#0F172A]">{{
                    selectedTicket.pelapor_nama || selectedTicket.pelapor || '—'
                  }}</span>
                  <span
                    v-if="selectedTicket.pelapor_jabatan || selectedTicket.pelapor_nik"
                    class="text-[11px] text-[#64748B]"
                  >
                    {{ selectedTicket.pelapor_jabatan || 'User' }}
                    {{ selectedTicket.pelapor_nik ? '· NIK ' + selectedTicket.pelapor_nik : '' }}
                  </span>
                </div>

                <!-- Penanggung Jawab -->
                <div class="flex flex-col gap-0.5">
                  <span class="text-[11px] font-medium text-[#94A3B8]">Assignee</span>
                  <span
                    class="font-semibold"
                    :class="
                      selectedTicket.assigned_to_nama || selectedTicket.assigned_to
                        ? 'text-[#0F172A]'
                        : 'text-[#94A3B8] italic'
                    "
                  >
                    {{
                      getAssigneeName(
                        selectedTicket.assigned_to_nama || selectedTicket.assigned_to,
                        'Unassigned',
                      )
                    }}
                  </span>
                </div>

                <!-- Kategori -->
                <div class="flex flex-col gap-0.5">
                  <span class="text-[11px] font-medium text-[#94A3B8]">Kategori</span>
                  <span class="font-medium text-[#0F172A]">{{
                    selectedTicket.kategori || 'Support'
                  }}</span>
                </div>

                <!-- Priority & SLA -->
                <div class="flex flex-col gap-0.5">
                  <span class="text-[11px] font-medium text-[#94A3B8]">Priority & SLA</span>
                  <span class="font-medium text-[#0F172A]">
                    {{ getPriorityInfo(selectedTicket.prioritas).label }} ·
                    <span :class="getSlaInfo(selectedTicket).class">{{
                      getSlaInfo(selectedTicket).text
                    }}</span>
                  </span>
                </div>

                <!-- Unit Tujuan -->
                <div class="flex flex-col gap-0.5">
                  <span class="text-[11px] font-medium text-[#94A3B8]">Unit Tujuan</span>
                  <span class="font-medium text-[#0F172A]">{{
                    selectedTicket.queue_nama || selectedTicket.queue_kode || 'IT Support'
                  }}</span>
                </div>

                <!-- Created At -->
                <div class="flex flex-col gap-0.5">
                  <span class="text-[11px] font-medium text-[#94A3B8]">Dibuat Pada</span>
                  <span class="font-medium text-[#334155]">{{
                    formatDateTime(selectedTicket.dibuat_pada)
                  }}</span>
                </div>
              </div>
            </div>

            <!-- Attachment Display -->
            <div v-if="isTicketAttachmentLoading" class="text-xs text-[#94A3B8] py-2">
              Memuat lampiran tiket...
            </div>
            <div
              v-else-if="selectedTicket.attachment"
              class="pt-4 border-t border-[#F1F5F9] space-y-2"
            >
              <h3
                class="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8] flex items-center gap-1"
              >
                <span class="material-symbols-outlined text-[15px]">attach_file</span> Lampiran
                Gambar
              </h3>
              <div class="overflow-hidden rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-2">
                <img
                  :src="selectedTicket.attachment"
                  alt="Attachment Kendala"
                  class="max-h-64 w-full object-contain rounded-lg"
                />
              </div>
            </div>

            <!-- Dedicated CASP Section -->
            <div class="pt-4 border-t border-[#F1F5F9]">
              <TicketCaspRating
                :ticket="selectedTicket"
                :ticket-id="selectedTicket.id"
                :ticket-status="selectedTicket.status_tiket"
                @rated="fetchTickets"
              />
            </div>
          </div>

          <!-- TAB 2: ACTIVITY TIMELINE -->
          <div v-else-if="activeDetailTab === 'history'" class="space-y-4">
            <div v-if="isHistoryLoading" class="p-2" aria-busy="true">
              <SkeletonList :items="4" :show-avatar="true" />
            </div>

            <div
              v-else-if="ticketHistory.length === 0"
              class="py-8 text-center text-xs text-[#94A3B8]"
            >
              Belum ada riwayat aktivitas pada ticket ini.
            </div>

            <!-- Activity Timeline -->
            <div
              v-else
              class="relative pl-5 space-y-5 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-[#E2E8F0]"
            >
              <div
                v-for="log in ticketHistory"
                :key="log.id"
                class="relative flex flex-col gap-1 text-xs"
              >
                <!-- Dot on Timeline -->
                <div class="absolute -left-5 top-1 h-2 w-2 rounded-full bg-[#2563EB]"></div>

                <!-- Event Header & Actor -->
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-1.5">
                    <span class="font-semibold text-[#0F172A]">{{ log.aksi }}</span>
                    <span class="text-[11px] text-[#64748B]"
                      >oleh <strong>{{ log.oleh_pengguna || 'Sistem' }}</strong></span
                    >
                  </div>
                  <span class="text-[11px] text-[#94A3B8]">{{
                    formatDateTime(log.dibuat_pada)
                  }}</span>
                </div>

                <!-- Details / Diffs -->
                <div
                  v-if="log.perubahan"
                  class="text-[11.5px] text-[#475569] bg-[#F8FAFC] p-2.5 rounded-lg border border-[#F1F5F9] mt-0.5"
                >
                  {{ log.perubahan }}
                </div>
              </div>
            </div>
          </div>

          <!-- TAB 3: DISCUSSION THREAD -->
          <div v-else-if="activeDetailTab === 'comments'" class="flex flex-col gap-4">
            <!-- Messages Container (No nested scrollbar, natural main scroll) -->
            <div class="flex flex-col gap-3 min-h-[160px]">
              <div
                v-if="isCommentsLoading"
                class="flex flex-col items-center justify-center py-10 gap-2 text-[#94A3B8]"
              >
                <span class="material-symbols-outlined text-[24px] animate-spin text-[#2563EB]"
                  >progress_activity</span
                >
                <span class="text-xs font-medium">Memuat percakapan...</span>
              </div>

              <div
                v-else-if="ticketComments.length === 0"
                class="flex flex-col items-center justify-center py-10 gap-2 text-center text-[#94A3B8]"
              >
                <span class="material-symbols-outlined text-[28px]">chat_bubble_outline</span>
                <p class="text-xs font-semibold text-[#334155]">
                  Belum ada diskusi pada ticket ini.
                </p>
                <p class="text-[11px]">Tulis komentar melalui form di bawah.</p>
              </div>

              <!-- Conversation Bubbles -->
              <div
                v-for="c in ticketComments"
                :key="c.id"
                class="flex flex-col gap-1 max-w-[85%]"
                :class="
                  c.nama_pengguna === user?.nama ? 'self-end items-end' : 'self-start items-start'
                "
              >
                <div class="flex items-center gap-1.5 text-[10.5px] text-[#94A3B8]">
                  <span class="font-bold text-[#334155]">{{ c.nama_pengguna }}</span>
                  <span class="capitalize">({{ c.role_pengguna || 'user' }})</span>
                  <span>·</span>
                  <span>{{ formatDateTime(c.dibuat_pada) }}</span>
                </div>

                <div
                  class="rounded-2xl px-4 py-2.5 text-xs leading-relaxed"
                  :class="
                    c.nama_pengguna === user?.nama
                      ? 'bg-[#EFF6FF] border border-[#DBEAFE] text-[#1E3A8A] rounded-br-xs'
                      : 'bg-[#F8FAFC] text-[#0F172A] border border-[#E2E8F0] rounded-bl-xs'
                  "
                >
                  <p class="whitespace-pre-wrap">{{ c.pesan }}</p>

                  <button
                    v-if="c.has_attachment && !c.attachment"
                    type="button"
                    :disabled="c.is_attachment_loading"
                    class="mt-2 flex items-center gap-1 rounded-lg border border-current/20 px-2 py-1 text-[10px] font-bold disabled:opacity-60 cursor-pointer"
                    @click="loadCommentAttachment(c)"
                  >
                    <span class="material-symbols-outlined text-[14px]">image</span>
                    {{ c.is_attachment_loading ? 'Memuat...' : 'Tampilkan lampiran' }}
                  </button>

                  <div
                    v-if="c.attachment"
                    class="mt-2 overflow-hidden rounded-xl border border-white/20"
                  >
                    <img
                      :src="c.attachment"
                      alt="Attachment Komentar"
                      class="max-h-40 w-full object-cover"
                    />
                  </div>
                </div>
              </div>
            </div>

            <!-- Comment Composer or Locked Notice -->
            <div
              v-if="['Resolved', 'Closed', 'Cancelled'].includes(selectedTicket.status_tiket)"
              class="flex items-center gap-2 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-3 text-xs font-medium text-[#64748B]"
            >
              <span class="material-symbols-outlined text-[16px] text-[#94A3B8]">lock</span>
              <span
                >Discussion ditutup karena status ticket sudah
                {{ selectedTicket.status_tiket }}.</span
              >
            </div>

            <div v-else class="flex flex-col gap-2 rounded-xl border border-[#E2E8F0] bg-white p-3">
              <div
                v-if="commentAttachment"
                class="flex items-center justify-between gap-2 rounded-lg bg-[#F8FAFC] p-2 border border-[#E2E8F0]"
              >
                <div class="flex items-center gap-2 min-w-0">
                  <img
                    :src="commentAttachment"
                    alt="Preview Attachment"
                    class="h-9 w-9 rounded-lg object-cover"
                  />
                  <span class="text-xs font-bold text-[#0F172A] truncate"
                    >Gambar lampiran siap dikirim</span
                  >
                </div>
                <button
                  type="button"
                  @click="removeCommentAttachment"
                  class="text-rose-500 hover:text-rose-700 cursor-pointer"
                >
                  <span class="material-symbols-outlined text-[16px]">close</span>
                </button>
              </div>

              <form class="flex items-center gap-2" @submit.prevent="sendComment">
                <label
                  title="Tambah Lampiran Gambar"
                  class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#2563EB] transition-all cursor-pointer"
                >
                  <span class="material-symbols-outlined text-[18px]">add_a_photo</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    class="hidden"
                    @change="handleCommentFileChange"
                  />
                </label>

                <input
                  v-model="newCommentText"
                  type="text"
                  placeholder="Tulis komentar atau catatan perbaikan..."
                  class="h-9 flex-1 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-xs font-medium text-[#0F172A] outline-none transition-all focus:bg-white focus:border-[#2563EB]"
                />

                <button
                  type="submit"
                  :disabled="isSubmittingComment || (!newCommentText.trim() && !commentAttachment)"
                  class="flex h-9 px-4 items-center justify-center gap-1.5 rounded-xl bg-[#2563EB] text-xs font-bold text-white shadow-2xs hover:bg-[#1D4ED8] disabled:opacity-40 transition-all cursor-pointer"
                >
                  <span class="material-symbols-outlined text-[16px]">send</span>
                  <span>Kirim</span>
                </button>
              </form>
            </div>
          </div>
        </div>

        <!-- FOOTER ACTION BAR (Admin Status Selector & Claim Actions) -->
        <div
          v-if="isAdmin || isSuperAdmin"
          class="flex items-center justify-between gap-4 border-t border-[#F1F5F9] pt-4 mt-6"
        >
          <div class="flex items-center gap-2">
            <!-- Compact Status Selector -->
            <select
              v-if="!['Closed', 'Resolved', 'Cancelled'].includes(selectedTicket.status_tiket)"
              :value="selectedTicket.status_tiket"
              :disabled="isUpdatingStatus"
              @change="updateTicketStatus(selectedTicket, $event.target.value)"
              class="h-9 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-xs font-bold text-[#0F172A] focus:border-[#2563EB] focus:outline-none cursor-pointer disabled:opacity-50"
            >
              <option value="Open">● Open</option>
              <option value="In Progress">● In Progress</option>
              <option value="Pending">● Pending</option>
              <option value="Resolved">● Resolved</option>
              <option value="Closed">● Closed</option>
            </select>

            <!-- Claim Button -->
            <button
              v-if="
                !selectedTicket.assigned_to_user_id &&
                !['Closed', 'Resolved', 'Cancelled'].includes(selectedTicket.status_tiket)
              "
              type="button"
              @click="claimTicket(selectedTicket)"
              :disabled="isClaiming === selectedTicket.id"
              class="h-9 inline-flex items-center gap-1.5 rounded-xl bg-[#2563EB] px-3 text-xs font-bold text-white hover:bg-[#1D4ED8] disabled:opacity-50 transition-all cursor-pointer"
            >
              <span class="material-symbols-outlined text-[16px]">person_add</span>
              <span>{{
                isClaiming === selectedTicket.id ? 'Mengambil...' : 'Ambil Ticket Ini'
              }}</span>
            </button>
          </div>

          <!-- Default Close Button -->
          <div class="flex items-center justify-end gap-2 ml-auto">
            <button
              type="button"
              @click="closeModal"
              class="h-9 rounded-xl border border-[#E2E8F0] px-4 text-xs font-semibold text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A] transition-colors cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </AppModal>

    <!-- ── Delete Confirmation Modal ────────────────────── -->
    <AppModal :is-open="showDeleteModal" title="Hapus Tiket" size="sm" @close="closeModal">
      <div class="flex flex-col items-center gap-4 text-center">
        <div
          v-if="modalError"
          class="w-full rounded-xl bg-[#FDEDE8] p-3 text-left text-[12px] font-bold text-[#FA896B]"
        >
          {{ modalError }}
        </div>
        <div
          class="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FDEDE8] text-[#FA896B]"
        >
          <span class="material-symbols-outlined text-[28px]">warning</span>
        </div>
        <div>
          <h4 class="text-[16px] font-extrabold text-[#2A3547]">
            Hapus Tiket {{ selectedTicket?.nomor_tiket }}?
          </h4>
          <p class="mt-1 text-[12px] text-[#7C8BAC]">
            Data tiket akan dihapus permanen dari sistem.
          </p>
        </div>
        <div class="flex w-full gap-3 mt-2">
          <button
            type="button"
            :disabled="isSubmitting"
            @click="closeModal"
            class="h-10 flex-1 rounded-xl border border-[#DFE5EF] text-[12px] font-semibold text-[#2A3547]"
          >
            Batal
          </button>
          <button
            type="button"
            :disabled="isSubmitting"
            @click="confirmDeleteTicket"
            class="h-10 flex-1 rounded-xl bg-[#FA896B] text-[12px] font-bold text-white hover:bg-[#E06748]"
          >
            {{ isSubmitting ? 'Menghapus...' : 'Ya, Hapus' }}
          </button>
        </div>
      </div>
    </AppModal>
  </div>
</template>
