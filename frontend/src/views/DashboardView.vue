<script setup>
// ============================================================
// DashboardView.vue — Dashboard monitoring bergaya Fynix
// Data real dari endpoint /api/assets/stats
// ============================================================
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useApi } from '../composables/useApi.js'
import { useAuth } from '../composables/useAuth.js'
import { onTicketEvent } from '../composables/useTicketRealtime.js'
import AppBadge from '../components/ui/AppBadge.vue'
import AssetTrendLineChart from '../components/charts/AssetTrendLineChart.vue'
import AssetTypeBarChart from '../components/charts/AssetTypeBarChart.vue'
import AssetConditionPieChart from '../components/charts/AssetConditionPieChart.vue'
import CsatDashboardSection from '../components/charts/CsatDashboardSection.vue'
import { getAssetStatusLabel } from '../utils/assetStatus.js'
import { animateStagger } from '../composables/useGsap.js'
import BaseSkeleton from '../components/ui/skeleton/BaseSkeleton.vue'
import SkeletonCard from '../components/ui/skeleton/SkeletonCard.vue'
import SkeletonChart from '../components/ui/skeleton/SkeletonChart.vue'

const { get } = useApi()
const { hasPermission, hasWritePermission } = useAuth()
const router = useRouter()
const canReadAssets = computed(() => hasPermission('assets'))
const canWriteAssets = computed(() => hasWritePermission('assets'))
const canReadTickets = computed(() => hasPermission('tickets'))

// ── State ────────────────────────────────────────────────────
const stats = ref(null)
const recentTickets = ref([])
const isLoading = ref(true)
const error = ref('')

// ── Computed: status breakdown ───────────────────────────────
const knownStatusKeys = new Set([
  'digunakan',
  'in use',
  'tersedia',
  'stock',
  'maintenance',
  'in service',
  'rusak',
  'damaged',
  'disposal',
])

function toCount(value) {
  const count = Number(value)
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
}

function normalizeLabel(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('id-ID')
}

const totalAssets = computed(() => toCount(stats.value?.totalAssets))

const statusMap = computed(() => {
  if (!Array.isArray(stats.value?.byStatus)) return {}

  const map = {}
  for (const row of stats.value.byStatus) {
    const status = normalizeLabel(row?.status)
    map[status] = (map[status] || 0) + toCount(row?.count)
  }
  return map
})

const countDipakai = computed(
  () => (statusMap.value['in use'] || 0) + (statusMap.value['digunakan'] || 0),
)
const countTersedia = computed(
  () => (statusMap.value['stock'] || 0) + (statusMap.value['tersedia'] || 0),
)
const countMaintenance = computed(
  () => (statusMap.value['in service'] || 0) + (statusMap.value['maintenance'] || 0),
)
const countRusak = computed(
  () => (statusMap.value['damaged'] || 0) + (statusMap.value['rusak'] || 0),
)
const countDisposal = computed(() => statusMap.value['disposal'] || 0)
const countKnownStatuses = computed(
  () =>
    countDipakai.value +
    countTersedia.value +
    countMaintenance.value +
    countRusak.value +
    countDisposal.value,
)
const countReportedStatuses = computed(() =>
  Object.values(statusMap.value).reduce((total, count) => total + count, 0),
)
const countUnknownStatuses = computed(() =>
  Object.entries(statusMap.value).reduce(
    (total, [status, count]) => total + (knownStatusKeys.has(status) ? 0 : count),
    0,
  ),
)
const countLainnya = computed(() => {
  const unreported = Math.max(totalAssets.value - countReportedStatuses.value, 0)
  return countUnknownStatuses.value + unreported
})
const statusChartTotal = computed(() => countKnownStatuses.value + countLainnya.value)

function percentage(count, total = totalAssets.value) {
  return total > 0 ? Math.min(Math.round((count / total) * 100), 100) : 0
}

// Persentase penggunaan untuk bar dan kartu ringkasan.
const pctDipakai = computed(() => percentage(countDipakai.value, statusChartTotal.value))
const pctTersedia = computed(() => percentage(countTersedia.value, statusChartTotal.value))
const pctMaintenance = computed(() => percentage(countMaintenance.value, statusChartTotal.value))
const pctRusak = computed(() => percentage(countRusak.value, statusChartTotal.value))

// Kondisi sehat dihitung dari aset berkondisi Baru + Baik, bukan dari status penggunaan.
// ── Computed: tipe breakdown ─────────────────────────────────
const locationBreakdown = computed(() => {
  if (!Array.isArray(stats.value?.byLocation)) return []

  return stats.value.byLocation.map((row) => ({
    label: row?.location || 'Belum ditentukan',
    count: toCount(row?.count),
    pct: percentage(toCount(row?.count)),
  }))
})

// ── Computed: 5 aset terbaru ─────────────────────────────────
const recentAssets = computed(() =>
  Array.isArray(stats.value?.recentAssets) ? stats.value.recentAssets : [],
)

// ── Fetch data ───────────────────────────────────────────────
async function fetchStats() {
  isLoading.value = true
  error.value = ''
  try {
    const ticketStatsRequest = canReadTickets.value
      ? get('/api/tickets/stats').catch(() => null)
      : Promise.resolve(null)
    const [statsRes, ticketStatsRes] = await Promise.all([
      get('/api/assets/stats'),
      ticketStatsRequest,
    ])
    stats.value = statsRes
    if (ticketStatsRes && Array.isArray(ticketStatsRes.recentTickets)) {
      recentTickets.value = ticketStatsRes.recentTickets
    }
  } catch (e) {
    error.value =
      e instanceof Error && e.message ? e.message : 'Gagal memuat statistik. Silakan coba lagi.'
    console.error(e)
  } finally {
    isLoading.value = false
    await nextTick()
    animateStagger('.dash-stat-card', { y: 12, duration: 0.3, stagger: 0.05 })
  }
}

// ── Dashboard Actions ────────────────────────────────────────
function goToAddAsset() {
  if (!canWriteAssets.value) return
  router.push({ path: '/assets', query: { action: 'add' } })
}

// ── Helpers ──────────────────────────────────────────────────
function getStatusBadgeType(status) {
  const s = (status || '').toLowerCase()
  if (s === 'digunakan') return 'success'
  if (s === 'tersedia') return 'info'
  if (s === 'maintenance') return 'warning'
  if (s === 'rusak') return 'danger'
  if (s === 'disposal') return 'default'
  return 'default'
}

// Helper untuk Status Asset card
function getSortedByStatus() {
  const combined = {
    'digunakan': { status: 'Digunakan', rawStatus: 'In Use', count: 0 },
    'stok': { status: 'Stok', rawStatus: 'Stock', count: 0 },
    'dalam perawatan': { status: 'Dalam Perawatan', rawStatus: 'In Service', count: 0 },
    'rusak': { status: 'Rusak', rawStatus: 'Damaged', count: 0 },
  }

  if (Array.isArray(stats.value?.byStatus)) {
    stats.value.byStatus.forEach((item) => {
      const rawStatus = (item?.status || '').trim()
      const label = getAssetStatusLabel(rawStatus)
      const key = label.toLowerCase()
      if (!combined[key]) {
        combined[key] = { status: label, rawStatus, count: 0 }
      }
      combined[key].count += Number(item?.count || 0)
    })
  }

  const statusOrder = [
    'digunakan',
    'in use',
    'stok',
    'stock',
    'dalam perawatan',
    'maintenance',
    'in service',
    'rusak',
    'damaged',
    'disposal',
  ]

  const sorted = Object.values(combined).sort((a, b) => {
    const aIdx = statusOrder.indexOf(a.rawStatus.toLowerCase())
    const bIdx = statusOrder.indexOf(b.rawStatus.toLowerCase())
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx
    if (aIdx !== -1) return -1
    if (bIdx !== -1) return 1
    return a.status.localeCompare(b.status)
  })

  return sorted
}

function getStatusColorClass(status) {
  const s = (status || '').toLowerCase()
  // Map to Tailwind color classes matching stat cards
  if (['digunakan', 'in use'].includes(s)) return 'bg-[#13DEB9]'
  if (['stok', 'tersedia', 'stock'].includes(s)) return 'bg-[#49BEFF]'
  if (['dalam perawatan', 'maintenance', 'in service'].includes(s)) return 'bg-[#FFAE1F]'
  if (['rusak', 'damaged'].includes(s)) return 'bg-[#FA896B]'
  if (['disposal'].includes(s)) return 'bg-[#8B5CF6]'
  return 'bg-[#94A3B8]'
}

function getStatusPercentage(status) {
  const sorted = getSortedByStatus()
  const total = sorted.reduce((acc, curr) => acc + curr.count, 0) || stats.value?.totalAssets || 0
  if (total === 0) return 0
  const item = sorted.find((i) => i.status.toLowerCase() === status.toLowerCase())
  if (!item) return 0
  return Math.min(Math.round((item.count / total) * 100), 100)
}

function getTicketStatusBadgeType(status) {
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

// ── Realtime SSE: update recent tickets tanpa full refresh ───
let unsubTicketCreated = null
let unsubTicketUpdated = null

// Debounced refetch ticket stats untuk dashboard
let ticketStatsRefreshTimer = null
function scheduleTicketStatsRefresh() {
  if (ticketStatsRefreshTimer) clearTimeout(ticketStatsRefreshTimer)
  ticketStatsRefreshTimer = setTimeout(async () => {
    ticketStatsRefreshTimer = null
    if (!canReadTickets.value) return
    try {
      const ticketStatsRes = await get('/api/tickets/stats')
      if (ticketStatsRes && Array.isArray(ticketStatsRes.recentTickets)) {
        recentTickets.value = ticketStatsRes.recentTickets
      }
    } catch {
      // Silent fail; akan di-refresh di fetchStats berikutnya
    }
  }, 800)
}

onMounted(() => {
  fetchStats()

  // Subscribe ke SSE events (koneksi global dikelola di App.vue)
  if (canReadTickets.value) {
    unsubTicketCreated = onTicketEvent('TICKET_CREATED', () => {
      // Tiket baru → refetch recent tickets list
      scheduleTicketStatsRefresh()
    })
    unsubTicketUpdated = onTicketEvent('TICKET_UPDATED', (data) => {
      if (!data) return
      // Patch tiket di recentTickets jika ada
      const idx = recentTickets.value.findIndex((t) => t.id === data.id)
      if (idx >= 0) {
        recentTickets.value[idx] = {
          ...recentTickets.value[idx],
          ...data,
          // Pertahankan field yang tidak ada di payload
          pelapor: recentTickets.value[idx].pelapor,
          assigned_to: recentTickets.value[idx].assigned_to,
        }
      }
      // Tetap refetch untuk konsistensi (debounced)
      scheduleTicketStatsRefresh()
    })
  }
})

onUnmounted(() => {
  if (ticketStatsRefreshTimer) clearTimeout(ticketStatsRefreshTimer)
  unsubTicketCreated?.()
  unsubTicketUpdated?.()
})
</script>

<template>
  <div class="flex flex-col gap-6 min-h-[calc(100vh-80px)]">
    <!-- ═══════════════════════════════════════════
         LOADING
         ═══════════════════════════════════════════ -->
    <div
      v-if="isLoading"
      class="space-y-4"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <!-- Row 1: 5 Stat Cards Skeleton -->
      <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <SkeletonCard v-for="i in 5" :key="i" variant="summary" />
      </div>

      <!-- Row 2: Monthly Trend (8 col) + Status Donut (4 col) Skeleton -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        <div class="lg:col-span-8">
          <SkeletonChart type="line" height="260px" />
        </div>
        <div class="lg:col-span-4">
          <SkeletonChart type="donut" height="260px" />
        </div>
      </div>

      <!-- Row 3: Asset Type (6 col) + Condition (6 col) Skeleton -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        <div class="lg:col-span-6">
          <SkeletonChart type="bar" height="240px" />
        </div>
        <div class="lg:col-span-6">
          <SkeletonChart type="pie" height="240px" />
        </div>
      </div>

      <!-- Row 4: Recent Tables Skeletons (Exact match to Dashboard tables) -->
      <div class="space-y-3.5">
        <!-- Aset Terbaru Skeleton Table -->
        <div class="shadow-sm rounded-xl border border-[#E2E8F0] bg-white overflow-hidden p-4">
          <div class="mb-3 flex items-center justify-between">
            <BaseSkeleton width="120px" height="16px" radius="md" />
            <BaseSkeleton width="80px" height="24px" radius="full" />
          </div>
          <table class="w-full text-left">
            <thead>
              <tr class="border-b border-[#F1F5F9]">
                <th class="py-3 px-4 text-xs font-semibold text-[#64748B] uppercase">Perangkat</th>
                <th class="py-3 px-4 text-xs font-semibold text-[#64748B] uppercase">Merek &amp; Tipe</th>
                <th class="py-3 px-4 text-xs font-semibold text-[#64748B] uppercase">Serial</th>
                <th class="py-3 px-4 text-xs font-semibold text-[#64748B] uppercase">Kondisi</th>
                <th class="py-3 px-4 text-xs font-semibold text-[#64748B] uppercase">Status</th>
                <th class="py-3 px-4 text-right text-xs font-semibold text-[#64748B] uppercase">Ditambahkan</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[#F8FAFC]">
              <tr v-for="r in 3" :key="'recent-asset-skel-' + r">
                <td class="py-3.5 px-4"><BaseSkeleton width="130px" height="14px" radius="md" /></td>
                <td class="py-3.5 px-4"><BaseSkeleton width="100px" height="14px" radius="sm" /></td>
                <td class="py-3.5 px-4"><BaseSkeleton width="90px" height="12px" radius="sm" /></td>
                <td class="py-3.5 px-4"><BaseSkeleton width="70px" height="14px" radius="sm" /></td>
                <td class="py-3.5 px-4"><BaseSkeleton width="65px" height="20px" radius="full" /></td>
                <td class="py-3.5 px-4 text-right"><BaseSkeleton width="80px" height="12px" radius="sm" class="ml-auto" /></td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Tiket Terbaru Skeleton Table -->
        <div class="shadow-sm rounded-xl border border-[#E2E8F0] bg-white overflow-hidden p-4">
          <div class="mb-3 flex items-center justify-between">
            <BaseSkeleton width="120px" height="16px" radius="md" />
            <BaseSkeleton width="80px" height="24px" radius="full" />
          </div>
          <table class="w-full text-left">
            <thead>
              <tr class="border-b border-[#F1F5F9]">
                <th class="py-3 px-4 text-xs font-semibold text-[#64748B] uppercase">No. Tiket</th>
                <th class="py-3 px-4 text-xs font-semibold text-[#64748B] uppercase">Judul</th>
                <th class="py-3 px-4 text-xs font-semibold text-[#64748B] uppercase">Assigned To</th>
                <th class="py-3 px-4 text-xs font-semibold text-[#64748B] uppercase">Prioritas</th>
                <th class="py-3 px-4 text-xs font-semibold text-[#64748B] uppercase">Status</th>
                <th class="py-3 px-4 text-right text-xs font-semibold text-[#64748B] uppercase">Tanggal</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[#F8FAFC]">
              <tr v-for="r in 3" :key="'recent-ticket-skel-' + r">
                <td class="py-3.5 px-4"><BaseSkeleton width="100px" height="14px" radius="md" /></td>
                <td class="py-3.5 px-4"><BaseSkeleton width="180px" height="14px" radius="md" /></td>
                <td class="py-3.5 px-4"><BaseSkeleton width="110px" height="14px" radius="sm" /></td>
                <td class="py-3.5 px-4"><BaseSkeleton width="65px" height="20px" radius="full" /></td>
                <td class="py-3.5 px-4"><BaseSkeleton width="65px" height="20px" radius="full" /></td>
                <td class="py-3.5 px-4 text-right"><BaseSkeleton width="80px" height="12px" radius="sm" class="ml-auto" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════
         ERROR
         ═══════════════════════════════════════════ -->
    <div
      v-else-if="error"
      class="bg-[#FEF3F2] border border-[#FECACA]/40 text-[#DC2626] rounded-xl px-4 py-3 text-sm font-medium flex items-center justify-between gap-3"
      role="alert"
    >
      <div class="flex items-center gap-2.5">
        <span class="material-symbols-outlined text-[18px]">error</span>
        <span>{{ error }}</span>
      </div>
      <button
        type="button"
        class="rounded-lg bg-white px-3.5 py-1.5 text-xs font-semibold text-[#DC2626] border border-[#FECACA]/40 hover:bg-[#DC2626] hover:text-white transition-all duration-200"
        @click="fetchStats"
      >
        Coba lagi
      </button>
    </div>

    <!-- ═══════════════════════════════════════════
         DASHBOARD CONTENT
         ═══════════════════════════════════════════ -->
    <template v-else-if="stats">
      <!-- ─── ROW 1: Hero Banner + 5 Stat Cards ────────── -->
      <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <!-- 1. Total Asset (ESB Primary Orange Hero Card) -->
        <div
          class="dash-stat-card relative overflow-hidden rounded-xl bg-gradient-to-br from-[#FC841B] to-[#E26F10] p-3.5 text-white shadow-md shadow-orange-500/10 border border-white/10 flex flex-col justify-between transition-transform hover:scale-[1.01]"
        >
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-bold uppercase tracking-wider text-white/90"
              >Total Aset</span
            >
            <span class="flex items-center -mr-1">
              <span class="material-symbols-outlined text-[18px] text-white/90">inventory_2</span>
            </span>
          </div>
          <div class="mt-2.5">
            <p class="font-num text-[24px] font-black leading-none tracking-tight text-white">
              {{ totalAssets }}
            </p>
            <div class="mt-2.5 flex items-center justify-between gap-1.5 flex-wrap">
              <span class="text-[10px] font-medium text-white/85">Unit Terdaftar</span>
              <button
                v-if="canWriteAssets"
                type="button"
                class="rounded-md bg-white/10 hover:bg-white/20 px-2 py-1 text-[10px] font-bold text-white border border-white/30 backdrop-blur-sm transition-all duration-200 cursor-pointer"
                @click="goToAddAsset"
              >
                + Tambah
              </button>
            </div>
          </div>
        </div>

        <!-- 2. In Use -->
        <div
          class="dash-stat-card shadow-2xs hover:shadow-xs transition-shadow duration-300 flex flex-col justify-between rounded-xl border border-[#B7E8DD] bg-gradient-to-br from-[#EDFBF7] to-white p-3.5"
        >
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-bold uppercase tracking-wide text-[#13DEB9]"
              >Digunakan</span
            >
            <span class="flex items-center -mr-1">
              <span
                class="material-symbols-outlined text-[18px] text-[#13DEB9]/70"
                style="opacity: 0.7"
                >check_circle</span
              >
            </span>
          </div>
          <div class="mt-2.5">
            <p class="font-num text-[22px] font-bold text-[#2A3547] leading-none">
              {{ countDipakai }}
            </p>
            <div class="flex items-center gap-1.5 mt-2">
              <div class="flex-1 h-1.5 bg-[#E6F4F1] rounded-full overflow-hidden">
                <div
                  class="h-full bg-gradient-to-r from-[#13DEB9] to-[#1ECAB5] rounded-full transition-all duration-500"
                  :style="{ width: pctDipakai + '%' }"
                ></div>
              </div>
              <span class="text-[10px] font-bold text-[#13DEB9]">{{ pctDipakai }}%</span>
            </div>
          </div>
        </div>

        <!-- 3. Stock -->
        <div
          class="dash-stat-card shadow-2xs hover:shadow-xs transition-shadow duration-300 flex flex-col justify-between rounded-xl border border-[#B2E2FF] bg-gradient-to-br from-[#E8F7FF] to-white p-3.5"
        >
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-bold uppercase tracking-wide text-[#49BEFF]">Stok</span>
            <span class="flex items-center -mr-1">
              <span
                class="material-symbols-outlined text-[18px] text-[#49BEFF]/70"
                style="opacity: 0.7"
                >inventory</span
              >
            </span>
          </div>
          <div class="mt-2.5">
            <p class="font-num text-[22px] font-bold text-[#2A3547] leading-none">
              {{ countTersedia }}
            </p>
            <div class="flex items-center gap-1.5 mt-2">
              <div class="flex-1 h-1.5 bg-[#E6F6FA] rounded-full overflow-hidden">
                <div
                  class="h-full bg-gradient-to-r from-[#49BEFF] to-[#3DA8E5] rounded-full transition-all duration-500"
                  :style="{ width: pctTersedia + '%' }"
                ></div>
              </div>
              <span class="text-[10px] font-bold text-[#49BEFF]">{{ pctTersedia }}%</span>
            </div>
          </div>
        </div>

        <!-- 4. Damaged -->
        <div
          class="dash-stat-card shadow-2xs hover:shadow-xs transition-shadow duration-300 flex flex-col justify-between rounded-xl border border-[#FCD5CE] bg-gradient-to-br from-[#FDEDE8] to-white p-3.5"
        >
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-bold uppercase tracking-wide text-[#FA896B]">Rusak</span>
            <span class="flex items-center -mr-1">
              <span
                class="material-symbols-outlined text-[18px] text-[#FA896B]/70"
                style="opacity: 0.7"
                >report_problem</span
              >
            </span>
          </div>
          <div class="mt-2.5">
            <p class="font-num text-[22px] font-bold text-[#2A3547] leading-none">
              {{ countRusak }}
            </p>
            <div class="flex items-center gap-1.5 mt-2">
              <div class="flex-1 h-1.5 bg-[#FDF2EF] rounded-full overflow-hidden">
                <div
                  class="h-full bg-gradient-to-r from-[#FA896B] to-[#E87558] rounded-full transition-all duration-500"
                  :style="{ width: pctRusak + '%' }"
                ></div>
              </div>
              <span class="text-[10px] font-bold text-[#FA896B]">{{ pctRusak }}%</span>
            </div>
          </div>
        </div>

        <!-- 5. In Service -->
        <div
          class="dash-stat-card shadow-2xs hover:shadow-xs transition-shadow duration-300 flex flex-col justify-between rounded-xl border border-[#FAD0AB] bg-gradient-to-br from-[#FEF5E5] to-white p-3.5"
        >
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-bold uppercase tracking-wide text-[#FFAE1F]"
              >Dalam Perawatan</span
            >
            <span class="flex items-center -mr-1">
              <span
                class="material-symbols-outlined text-[18px] text-[#FFAE1F]/70"
                style="opacity: 0.7"
                >build</span
              >
            </span>
          </div>
          <div class="mt-2.5">
            <p class="font-num text-[22px] font-bold text-[#2A3547] leading-none">
              {{ countMaintenance }}
            </p>
            <div class="flex items-center gap-1.5 mt-2">
              <div class="flex-1 h-1.5 bg-[#FEF8F1] rounded-full overflow-hidden">
                <div
                  class="h-full bg-gradient-to-r from-[#FFAE1F] to-[#E69A1A] rounded-full transition-all duration-500"
                  :style="{ width: pctMaintenance + '%' }"
                ></div>
              </div>
              <span class="text-[10px] font-bold text-[#FFAE1F]">{{ pctMaintenance }}%</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ─── ROW 2: Line Chart (8 col) + Donut Chart (4 col) ── -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-3.5 mt-3.5">
        <div
          class="lg:col-span-8 shadow-xs rounded-xl border border-[#E2E8F0] bg-white p-3.5 hover:shadow-xs transition-shadow duration-300"
        >
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-bold text-[#1E293B]">Tren Aset Bulanan</h3>
            <span class="text-[10px] font-medium text-[#64748B] bg-[#F1F5F9] px-2 py-0.5 rounded-md"
              >Per Bulan</span
            >
          </div>
          <AssetTrendLineChart
            class="w-full"
            :data="stats.monthlyTrend || []"
            :loading="isLoading"
            :error="error"
          />
        </div>
        <div
          class="lg:col-span-4 shadow-xs rounded-xl border border-[#E2E8F0] bg-white p-3.5 hover:shadow-xs transition-shadow duration-300"
        >
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-bold text-[#1E293B]">Status Aset</h3>
            <span class="text-[10px] font-medium text-[#64748B] bg-[#F1F5F9] px-2 py-0.5 rounded-md"
              >Distribusi</span
            >
          </div>

          <!-- Empty State -->
          <template v-if="!stats?.byStatus || stats.byStatus.length === 0">
            <div class="py-6 text-center">
              <p class="text-xs text-[#94A3B8]">Belum ada data status aset.</p>
            </div>
          </template>

          <!-- Status Content -->
          <template v-else>
            <!-- Horizontal Stacked Progress Bar -->
            <div class="mb-4">
              <div class="h-2 flex rounded-lg overflow-hidden bg-[#F1F5F9]">
                <div
                  v-for="item in getSortedByStatus()"
                  :key="item.status"
                  class="h-full transition-all duration-300"
                  :class="getStatusColorClass(item.status)"
                  :style="{ width: getStatusPercentage(item.status) + '%' }"
                  :title="`${item.status}: ${item.count} unit (${getStatusPercentage(item.status)}%)`"
                ></div>
              </div>
            </div>

            <!-- Status Rows -->
            <div class="space-y-2.5">
              <div
                v-for="item in getSortedByStatus()"
                :key="item.status"
                class="flex items-center gap-2.5"
              >
                <!-- Status Indicator -->
                <div
                  class="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  :class="getStatusColorClass(item.status)"
                ></div>

                <!-- Label & Count -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-xs font-semibold text-[#475569] truncate">{{
                      item.status
                    }}</span>
                    <span class="text-xs font-bold text-[#1E293B] font-num">{{ item.count }}</span>
                  </div>
                  <div class="flex items-center justify-between gap-2 mt-1">
                    <span class="text-[10px] text-[#94A3B8]"
                      >{{ getStatusPercentage(item.status) }}%</span
                    >
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>

      <!-- ─── ROW 3: Bar Chart (7 col) + Pie Chart (5 col) ── -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div
          class="lg:col-span-7 shadow-sm rounded-xl border border-[#E2E8F0] bg-white p-5 hover:shadow-md transition-shadow duration-300"
        >
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-base font-bold text-[#1E293B]">Aset Per Tipe</h3>
            <span class="text-xs font-medium text-[#64748B] bg-[#F1F5F9] px-2.5 py-1 rounded-lg"
              >Kategori</span
            >
          </div>
          <AssetTypeBarChart
            class="w-full"
            :data="stats.byType || []"
            :loading="isLoading"
            :error="error"
          />
        </div>
        <div
          class="lg:col-span-5 shadow-sm rounded-xl border border-[#E2E8F0] bg-white p-5 hover:shadow-md transition-shadow duration-300"
        >
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-base font-bold text-[#1E293B]">Kondisi Aset</h3>
            <span class="text-xs font-medium text-[#64748B] bg-[#F1F5F9] px-2.5 py-1 rounded-lg"
              >Persentase</span
            >
          </div>
          <AssetConditionPieChart
            class="w-full"
            :data="stats.byCondition || []"
            :loading="isLoading"
            :error="error"
          />
        </div>
      </div>

      <!-- ─── ROW 4: CSAT / Kepuasan Penanganan Tiket ────────── -->
      <CsatDashboardSection v-if="canReadTickets" />

      <!-- ─── ROW 5: Lokasi Aset ─────────────────────────────── -->
      <div
        class="shadow-sm rounded-xl border border-[#E2E8F0] bg-white p-6 hover:shadow-md transition-shadow duration-300"
      >
        <div class="flex items-center justify-between mb-5 pb-4 border-b border-[#F1F5F9]">
          <div>
            <h3 class="text-lg font-bold text-[#1E293B]">Sebaran Lokasi Aset</h3>
            <p class="text-xs text-[#64748B] mt-1">Lokasi penempatan perangkat saat ini</p>
          </div>
          <span
            class="inline-flex items-center gap-1.5 text-xs font-semibold text-[#3B82F6] bg-[#EFF6FF] px-3 py-1.5 rounded-full"
          >
            <span class="material-symbols-outlined text-[16px]" style="opacity: 0.7"
              >location_on</span
            >
            {{ locationBreakdown.length }} Lokasi
          </span>
        </div>

        <div
          v-if="locationBreakdown.length"
          class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          <div
            v-for="location in locationBreakdown"
            :key="location.label"
            class="rounded-lg border border-[#E2E8F0] bg-gradient-to-br from-[#F8FAFC] to-white p-4 transition-all duration-200 hover:border-[#CBD5E1] hover:shadow-sm hover:shadow-[#0F172A]/5"
          >
            <div class="flex items-center justify-between gap-3 mb-3">
              <span class="truncate text-sm font-semibold text-[#1E293B]" :title="location.label">
                {{ location.label }}
              </span>
              <span class="shrink-0 text-sm font-bold text-[#3B82F6] font-num">{{
                location.count
              }}</span>
            </div>
            <div class="h-1.5 overflow-hidden rounded-full bg-[#E2E8F0] mb-2">
              <div
                class="h-full rounded-full bg-gradient-to-r from-[#3B82F6] to-[#60A5FA]"
                :style="{ width: `${location.pct}%` }"
              ></div>
            </div>
            <p class="text-right text-xs font-medium text-[#64748B]">{{ location.pct }}%</p>
          </div>
        </div>
        <div v-else class="py-8 text-center">
          <p class="text-sm text-[#64748B]">Belum ada data lokasi aset.</p>
        </div>
      </div>

      <!-- ─── ROW 6: Tabel 5 Aset Terbaru ────────────────────── -->
      <div
        v-if="canReadAssets"
        class="shadow-sm rounded-xl border border-[#E2E8F0] bg-white overflow-hidden hover:shadow-md transition-shadow duration-300"
      >
        <div class="flex items-center justify-between px-6 py-5 border-b border-[#F1F5F9]">
          <div>
            <h3 class="text-lg font-bold text-[#1E293B]">Aset Terbaru</h3>
            <p class="text-xs text-[#64748B] mt-1">5 Perangkat IT paling baru dalam sistem</p>
          </div>
          <RouterLink
            to="/assets"
            class="inline-flex items-center gap-1.5 text-xs font-semibold text-[#3B82F6] bg-[#EFF6FF] px-3.5 py-1.5 rounded-full hover:bg-[#DBEAFE] hover:text-[#2563EB] transition-colors duration-200"
          >
            Lihat Semua
            <span class="material-symbols-outlined text-[14px]">arrow_forward</span>
          </RouterLink>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="border-b border-[#F1F5F9]">
                <th
                  class="text-left text-xs font-semibold text-[#64748B] uppercase tracking-wide py-3 px-4"
                >
                  Perangkat
                </th>
                <th
                  class="text-left text-xs font-semibold text-[#64748B] uppercase tracking-wide py-3 px-4"
                >
                  Merek & Tipe
                </th>
                <th
                  class="text-left text-xs font-semibold text-[#64748B] uppercase tracking-wide py-3 px-4"
                >
                  Serial
                </th>
                <th
                  class="text-left text-xs font-semibold text-[#64748B] uppercase tracking-wide py-3 px-4"
                >
                  Kondisi
                </th>
                <th
                  class="text-left text-xs font-semibold text-[#64748B] uppercase tracking-wide py-3 px-4"
                >
                  Status
                </th>
                <th
                  class="text-right text-xs font-semibold text-[#64748B] uppercase tracking-wide py-3 px-4"
                >
                  Ditambahkan
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="asset in recentAssets"
                :key="asset.id_aset"
                class="border-b border-[#F8FAFC] hover:bg-[#F8FAFC] transition-colors duration-150"
              >
                <td class="py-4 px-4">
                  <div class="flex items-center gap-3">
                    <span
                      class="material-symbols-outlined text-[19px] text-[#3B82F6]/70 flex-shrink-0"
                      style="opacity: 0.7"
                    >
                      {{
                        asset.tipe_perangkat?.toLowerCase().includes('laptop')
                          ? 'laptop'
                          : asset.tipe_perangkat?.toLowerCase().includes('server')
                            ? 'dns'
                            : asset.tipe_perangkat?.toLowerCase().includes('printer')
                              ? 'print'
                              : 'computer'
                      }}
                    </span>
                    <div>
                      <p class="text-sm font-semibold text-[#1E293B] leading-tight">
                        {{ asset.label_aset }}
                      </p>
                      <p class="text-xs text-[#64748B]">ID #{{ asset.id_aset }}</p>
                    </div>
                  </div>
                </td>
                <td class="py-4 px-4">
                  <p class="text-sm font-medium text-[#1E293B]">{{ asset.merek }}</p>
                  <p class="text-xs text-[#64748B]">{{ asset.tipe_perangkat }}</p>
                </td>
                <td class="py-4 px-4 font-mono text-xs text-[#64748B] font-medium">
                  {{ asset.nomor_seri }}
                </td>
                <td class="py-4 px-4 text-sm font-medium text-[#1E293B]">
                  {{ asset.kondisi_aset }}
                </td>
                <td class="py-4 px-4">
                  <AppBadge
                    :type="getStatusBadgeType(asset.status_aset)"
                    :text="asset.status_aset"
                  />
                </td>
                <td class="py-4 px-4 text-right text-xs font-medium text-[#64748B]">
                  {{ formatDate(asset.dibuat_pada) }}
                </td>
              </tr>
              <tr v-if="recentAssets.length === 0">
                <td colspan="6" class="py-8 text-center">
                  <p class="text-sm text-[#64748B]">Belum ada data aset.</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ─── ROW 7: Tabel Tiket Permintaan Terbaru ──────────────── -->
      <div
        v-if="canReadTickets"
        class="shadow-sm rounded-xl border border-[#E2E8F0] bg-white overflow-hidden hover:shadow-md transition-shadow duration-300"
      >
        <div class="flex items-center justify-between px-6 py-5 border-b border-[#F1F5F9]">
          <div>
            <h3 class="text-lg font-bold text-[#1E293B]">Tiket Terbaru</h3>
            <p class="text-xs text-[#64748B] mt-1">5 Laporan kendala & permintaan IT terbaru</p>
          </div>
          <RouterLink
            to="/tickets"
            class="inline-flex items-center gap-1.5 text-xs font-semibold text-[#3B82F6] bg-[#EFF6FF] px-3.5 py-1.5 rounded-full hover:bg-[#DBEAFE] hover:text-[#2563EB] transition-colors duration-200"
          >
            Lihat Semua
            <span class="material-symbols-outlined text-[14px]">arrow_forward</span>
          </RouterLink>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="border-b border-[#F1F5F9]">
                <th
                  class="text-left text-xs font-semibold text-[#64748B] uppercase tracking-wide py-3 px-4"
                >
                  No. Tiket
                </th>
                <th
                  class="text-left text-xs font-semibold text-[#64748B] uppercase tracking-wide py-3 px-4"
                >
                  Judul
                </th>
                <th
                  class="text-left text-xs font-semibold text-[#64748B] uppercase tracking-wide py-3 px-4"
                >
                  Assigned To
                </th>
                <th
                  class="text-left text-xs font-semibold text-[#64748B] uppercase tracking-wide py-3 px-4"
                >
                  Prioritas
                </th>
                <th
                  class="text-left text-xs font-semibold text-[#64748B] uppercase tracking-wide py-3 px-4"
                >
                  Status
                </th>
                <th
                  class="text-right text-xs font-semibold text-[#64748B] uppercase tracking-wide py-3 px-4"
                >
                  Tanggal
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="ticket in recentTickets"
                :key="ticket.id"
                class="border-b border-[#F8FAFC] hover:bg-[#F8FAFC] transition-colors duration-150"
              >
                <td class="py-4 px-4">
                  <span class="font-mono text-xs font-bold text-[#3B82F6]">{{
                    ticket.nomor_tiket || `TCK-#${ticket.id}`
                  }}</span>
                </td>
                <td class="py-4 px-4">
                  <p class="text-sm font-semibold text-[#1E293B] leading-tight">
                    {{ ticket.judul }}
                  </p>
                  <p class="text-xs text-[#64748B]">Pelapor: {{ ticket.pelapor || 'User' }}</p>
                </td>
                <td class="py-4 px-4">
                  <div class="flex items-center gap-2.5">
                    <span
                      class="material-symbols-outlined text-[18px] text-[#3B82F6]/70 flex-shrink-0"
                      style="opacity: 0.7"
                      >person</span
                    >
                    <span class="text-sm font-medium text-[#1E293B]">{{
                      ticket.assigned_to || 'Belum ditugaskan'
                    }}</span>
                  </div>
                </td>
                <td class="py-4 px-4">
                  <AppBadge
                    :type="getPriorityBadgeType(ticket.prioritas)"
                    :text="ticket.prioritas"
                  />
                </td>
                <td class="py-4 px-4">
                  <AppBadge
                    :type="getTicketStatusBadgeType(ticket.status_tiket)"
                    :text="ticket.status_tiket"
                  />
                </td>
                <td class="py-4 px-4 text-right text-xs font-medium text-[#64748B]">
                  {{ formatDate(ticket.dibuat_pada) }}
                </td>
              </tr>
              <tr v-if="recentTickets.length === 0">
                <td colspan="6" class="py-8 text-center">
                  <p class="text-sm text-[#64748B]">Belum ada tiket permintaan.</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
