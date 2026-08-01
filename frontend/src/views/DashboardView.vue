<script setup>
// ============================================================
// DashboardView.vue — Dashboard monitoring bergaya Fynix
// Data real dari endpoint /api/assets/stats
// ============================================================
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useApi } from '../composables/useApi.js'
import { useAuth } from '../composables/useAuth.js'
import AppBadge from '../components/ui/AppBadge.vue'
import AssetTrendLineChart from '../components/charts/AssetTrendLineChart.vue'
import AssetTypeBarChart from '../components/charts/AssetTypeBarChart.vue'
import AssetConditionPieChart from '../components/charts/AssetConditionPieChart.vue'
import AssetStatusDonutChart from '../components/charts/AssetStatusDonutChart.vue'
import CsatDashboardSection from '../components/charts/CsatDashboardSection.vue'

const { get } = useApi()
const { hasPermission, hasWritePermission } = useAuth()
const router = useRouter()
const canReadAssets = computed(() => hasPermission('assets'))
const canWriteAssets = computed(() => hasWritePermission('assets'))
const canReadTickets = computed(() => hasPermission('tickets'))

// ── State ────────────────────────────────────────────────────
const stats     = ref(null)
const recentTickets = ref([])
const isLoading = ref(true)
const error     = ref('')

// ── Computed: status breakdown ───────────────────────────────
const knownStatusKeys = new Set(['digunakan', 'tersedia', 'maintenance', 'rusak', 'disposal'])

function toCount(value) {
  const count = Number(value)
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
}

function normalizeLabel(value) {
  return String(value ?? '').trim().toLocaleLowerCase('id-ID')
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

const countDipakai = computed(() => statusMap.value['digunakan'] || 0)
const countTersedia = computed(() => statusMap.value['tersedia'] || 0)
const countMaintenance = computed(() => statusMap.value['maintenance'] || 0)
const countRusak = computed(() => statusMap.value['rusak'] || 0)
const countDisposal = computed(() => statusMap.value['disposal'] || 0)
const countKnownStatuses = computed(() =>
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
  error.value     = ''
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
    error.value = e instanceof Error && e.message
      ? e.message
      : 'Gagal memuat statistik. Silakan coba lagi.'
    console.error(e)
  } finally {
    isLoading.value = false
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
  if (s === 'tersedia')  return 'info'
  if (s === 'maintenance') return 'warning'
  if (s === 'rusak') return 'danger'
  if (s === 'disposal')  return 'default'
  return 'default'
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

onMounted(fetchStats)
</script>

<template>
  <div class="flex flex-col gap-6">

    <!-- ═══════════════════════════════════════════
         LOADING
         ═══════════════════════════════════════════ -->
    <div
      v-if="isLoading"
      class="flex items-center justify-center py-20"
      role="status"
      aria-live="polite"
    >
      <div
        class="w-10 h-10 border-4 border-[#E5EAEF] border-t-[#5D87FF] rounded-full animate-spin"
        aria-hidden="true"
      ></div>
      <span class="sr-only">Memuat statistik dashboard…</span>
    </div>

    <!-- ═══════════════════════════════════════════
         ERROR
         ═══════════════════════════════════════════ -->
    <div
      v-else-if="error"
      class="bg-[#FDEDE8] border border-[#FA896B]/30 text-[#FA896B] rounded-2xl px-5 py-4 text-sm font-semibold flex items-center justify-between gap-3"
      role="alert"
    >
      <div class="flex items-center gap-3">
        <span class="material-symbols-outlined text-[22px]">error</span>
        <span>{{ error }}</span>
      </div>
      <button
        type="button"
        class="rounded-xl bg-white px-4 py-2 text-xs font-bold text-[#FA896B] border border-[#FA896B]/30 shadow-xs hover:bg-[#FA896B] hover:text-white transition-all"
        @click="fetchStats"
      >
        Coba lagi
      </button>
    </div>

    <!-- ═══════════════════════════════════════════
         DASHBOARD CONTENT
         ═══════════════════════════════════════════ -->
    <template v-else-if="stats">

      <!-- ─── ROW 1: Hero Banner + Pastel Stat Cards ────────── -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">

        <!-- Total Aset (ESB Primary Orange Hero Card) -->
        <div class="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#FC841B] to-[#E26F10] p-5 text-white shadow-md shadow-orange-500/20 border border-white/10 flex flex-col justify-between">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-bold uppercase tracking-wider text-white/90">Total Aset</span>
            <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 text-white backdrop-blur-md">
              <span class="material-symbols-outlined text-[18px]">inventory_2</span>
            </span>
          </div>
          <div class="mt-3">
            <p class="font-num text-[30px] font-black leading-none tracking-tight text-white">{{ totalAssets }}</p>
            <div class="mt-3 flex items-center justify-between gap-1">
              <span class="text-[11px] font-medium text-white/90">Unit terdaftar</span>
              <button
                v-if="canWriteAssets"
                type="button"
                class="rounded-lg bg-white px-2.5 py-1 text-[10px] font-extrabold text-[#E26F10] shadow-xs hover:bg-[#FFF2E7] transition-all cursor-pointer"
                @click="goToAddAsset"
              >
                + Tambah
              </button>
            </div>
          </div>
        </div>

        <!-- Card: Digunakan -->
        <div class="shadow-card shadow-card-hover flex flex-col justify-between rounded-2xl border border-[#C3F3E8] bg-[#EDFBF7] p-5">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-bold uppercase tracking-wider text-[#13DEB9]">Digunakan</span>
            <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#13DEB9] shadow-xs">
              <span class="material-symbols-outlined text-[18px]">check_circle</span>
            </div>
          </div>
          <div class="mt-3">
            <p class="font-num text-[30px] font-extrabold text-[#2A3547] leading-none">{{ countDipakai }}</p>
            <div class="flex items-center gap-2 mt-3">
              <div class="flex-1 h-2 bg-white rounded-full overflow-hidden">
                <div class="h-full bg-[#13DEB9] rounded-full transition-all duration-500" :style="{ width: pctDipakai + '%' }"></div>
              </div>
              <span class="text-[11px] font-bold text-[#13DEB9]">{{ pctDipakai }}%</span>
            </div>
          </div>
        </div>

        <!-- Card: Tersedia -->
        <div class="shadow-card shadow-card-hover flex flex-col justify-between rounded-2xl border border-[#C8EDFF] bg-[#E8F7FF] p-5">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-bold uppercase tracking-wider text-[#49BEFF]">Tersedia</span>
            <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#49BEFF] shadow-xs">
              <span class="material-symbols-outlined text-[18px]">inventory</span>
            </div>
          </div>
          <div class="mt-3">
            <p class="font-num text-[30px] font-extrabold text-[#2A3547] leading-none">{{ countTersedia }}</p>
            <div class="flex items-center gap-2 mt-3">
              <div class="flex-1 h-2 bg-white rounded-full overflow-hidden">
                <div class="h-full bg-[#49BEFF] rounded-full transition-all duration-500" :style="{ width: pctTersedia + '%' }"></div>
              </div>
              <span class="text-[11px] font-bold text-[#49BEFF]">{{ pctTersedia }}%</span>
            </div>
          </div>
        </div>

        <!-- Card: Maintenance -->
        <div class="shadow-card shadow-card-hover flex flex-col justify-between rounded-2xl border border-[#FCE6BE] bg-[#FEF5E5] p-5">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-bold uppercase tracking-wider text-[#FFAE1F]">Maintenance</span>
            <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#FFAE1F] shadow-xs">
              <span class="material-symbols-outlined text-[18px]">build</span>
            </div>
          </div>
          <div class="mt-3">
            <p class="font-num text-[30px] font-extrabold text-[#2A3547] leading-none">{{ countMaintenance }}</p>
            <div class="flex items-center gap-2 mt-3">
              <div class="flex-1 h-2 bg-white rounded-full overflow-hidden">
                <div class="h-full bg-[#FFAE1F] rounded-full transition-all duration-500" :style="{ width: pctMaintenance + '%' }"></div>
              </div>
              <span class="text-[11px] font-bold text-[#FFAE1F]">{{ pctMaintenance }}%</span>
            </div>
          </div>
        </div>

        <!-- Card: Kondisi Rusak -->
        <div class="shadow-card shadow-card-hover flex flex-col justify-between rounded-2xl border border-[#FAD9D0] bg-[#FDEDE8] p-5">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-bold uppercase tracking-wider text-[#FA896B]">Rusak</span>
            <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#FA896B] shadow-xs">
              <span class="material-symbols-outlined text-[18px]">report_problem</span>
            </div>
          </div>
          <div class="mt-3">
            <p class="font-num text-[30px] font-extrabold text-[#2A3547] leading-none">{{ countRusak }}</p>
            <div class="flex items-center gap-2 mt-3">
              <div class="flex-1 h-2 bg-white rounded-full overflow-hidden">
                <div class="h-full bg-[#FA896B] rounded-full transition-all duration-500" :style="{ width: pctRusak + '%' }"></div>
              </div>
              <span class="text-[11px] font-bold text-[#FA896B]">{{ pctRusak }}%</span>
            </div>
          </div>
        </div>

      </div>

      <!-- ─── ROW 2: Line Chart (8 col) + Donut Chart (4 col) ── -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <AssetTrendLineChart
          class="lg:col-span-8 min-h-[300px]"
          :data="stats.monthlyTrend || []"
          :loading="isLoading"
          :error="error"
        />
        <AssetStatusDonutChart
          class="lg:col-span-4 min-h-[300px]"
          :data="stats.byStatus || []"
          :loading="isLoading"
          :error="error"
        />
      </div>

      <!-- ─── ROW 3: Bar Chart (7 col) + Pie Chart (5 col) ── -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <AssetTypeBarChart
          class="lg:col-span-7 min-h-[300px]"
          :data="stats.byType || []"
          :loading="isLoading"
          :error="error"
        />
        <AssetConditionPieChart
          class="lg:col-span-5 min-h-[300px]"
          :data="stats.byCondition || []"
          :loading="isLoading"
          :error="error"
        />
      </div>

      <!-- ─── ROW 4: CSAT / Kepuasan Penanganan Tiket ────────── -->
      <CsatDashboardSection v-if="canReadTickets" />

      <!-- ─── ROW 5: Lokasi Aset ─────────────────────────────── -->
      <div class="shadow-card rounded-2xl border border-[#E5EAEF] bg-white p-6">
        <div class="flex items-center justify-between mb-4 pb-3 border-b border-[#F1F5F9]">
          <div>
            <h3 class="text-[16px] font-extrabold text-[#2A3547]">Sebaran Lokasi Aset</h3>
            <p class="text-[12px] text-[#7C8BAC]">Lokasi penempatan perangkat saat ini</p>
          </div>
          <span class="flex items-center gap-1.5 text-[12px] font-bold text-[#5D87FF] bg-[#ECF2FF] px-3 py-1 rounded-full">
            <span class="material-symbols-outlined text-[16px]">location_on</span>
            {{ locationBreakdown.length }} Lokasi
          </span>
        </div>

        <div v-if="locationBreakdown.length" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div
            v-for="location in locationBreakdown"
            :key="location.label"
            class="rounded-xl border border-[#E5EAEF] bg-[#F8FAFC] p-4 transition-all hover:bg-white hover:shadow-xs"
          >
            <div class="flex items-center justify-between gap-3 mb-2">
              <span class="truncate text-[13px] font-bold text-[#2A3547]" :title="location.label">
                {{ location.label }}
              </span>
              <span class="shrink-0 text-[12px] font-extrabold text-[#5D87FF] font-num">{{ location.count }} Unit</span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-[#E2E8F0]">
              <div class="h-full rounded-full bg-[#5D87FF]" :style="{ width: `${location.pct}%` }"></div>
            </div>
            <p class="mt-1.5 text-right text-[10px] font-semibold text-[#7C8BAC]">{{ location.pct }}% dari total</p>
          </div>
        </div>
        <div v-else class="py-8 text-center text-[13px] text-[#7C8BAC]">
          Belum ada data lokasi aset.
        </div>
      </div>

      <!-- ─── ROW 6: Tabel 5 Aset Terbaru ────────────────────── -->
      <div v-if="canReadAssets" class="shadow-card rounded-2xl border border-[#E5EAEF] bg-white overflow-hidden">
        <div class="flex items-center justify-between px-6 py-4.5 border-b border-[#E5EAEF]">
          <div>
            <h3 class="text-[16px] font-extrabold text-[#2A3547]">Aset Terbaru Ditambahkan</h3>
            <p class="text-[12px] text-[#7C8BAC]">5 Perangkat IT paling baru dalam sistem</p>
          </div>
          <RouterLink to="/assets" class="text-[12px] font-bold text-[#5D87FF] hover:text-[#4570EA] flex items-center gap-1 bg-[#ECF2FF] px-3.5 py-1.5 rounded-full transition-all">
            Lihat Semua Aset
            <span class="material-symbols-outlined text-[16px]">arrow_forward</span>
          </RouterLink>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr>
                <th>Perangkat / Label</th>
                <th>Merek & Tipe</th>
                <th>Serial Number</th>
                <th>Kondisi</th>
                <th>Status</th>
                <th class="text-right">Ditambahkan</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="asset in recentAssets" :key="asset.id_aset">
                <td>
                  <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-xl bg-[#ECF2FF] text-[#5D87FF] flex items-center justify-center shrink-0">
                      <span class="material-symbols-outlined text-[18px]">
                        {{ asset.tipe_perangkat?.toLowerCase().includes('laptop') ? 'laptop' :
                           asset.tipe_perangkat?.toLowerCase().includes('server') ? 'dns' :
                           asset.tipe_perangkat?.toLowerCase().includes('printer') ? 'print' :
                           'computer' }}
                      </span>
                    </div>
                    <div>
                      <p class="text-[13px] font-bold text-[#2A3547] leading-tight">{{ asset.label_aset }}</p>
                      <p class="text-[11px] text-[#7C8BAC]">ID #{{ asset.id_aset }}</p>
                    </div>
                  </div>
                </td>
                <td>
                  <p class="text-[13px] font-semibold text-[#2A3547]">{{ asset.merek }}</p>
                  <p class="text-[11px] text-[#7C8BAC]">{{ asset.tipe_perangkat }}</p>
                </td>
                <td class="font-mono text-[12px] text-[#7C8BAC] font-medium">{{ asset.nomor_seri }}</td>
                <td class="text-[13px] font-medium text-[#2A3547]">{{ asset.kondisi_aset }}</td>
                <td>
                  <AppBadge :type="getStatusBadgeType(asset.status_aset)" :text="asset.status_aset" />
                </td>
                <td class="text-right text-[12px] font-medium text-[#7C8BAC]">{{ formatDate(asset.dibuat_pada) }}</td>
              </tr>
              <tr v-if="recentAssets.length === 0">
                <td colspan="6" class="py-8 text-center text-[13px] text-[#7C8BAC]">Belum ada data aset.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ─── ROW 7: Tabel Tiket Permintaan Terbaru ──────────────── -->
      <div v-if="canReadTickets" class="shadow-card rounded-2xl border border-[#E5EAEF] bg-white overflow-hidden">
        <div class="flex items-center justify-between px-6 py-4.5 border-b border-[#E5EAEF]">
          <div>
            <h3 class="text-[16px] font-extrabold text-[#2A3547]">Tiket Permintaan Terbaru</h3>
            <p class="text-[12px] text-[#7C8BAC]">5 Laporan kendala & tiket permintaan IT paling baru</p>
          </div>
          <RouterLink to="/tickets" class="text-[12px] font-bold text-[#5D87FF] hover:text-[#4570EA] flex items-center gap-1 bg-[#ECF2FF] px-3.5 py-1.5 rounded-full transition-all">
            Lihat Semua Tiket
            <span class="material-symbols-outlined text-[16px]">arrow_forward</span>
          </RouterLink>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr>
                <th>No. Tiket</th>
                <th>Judul Kendala</th>
                <th>Assigned To</th>
                <th>Prioritas</th>
                <th>Status</th>
                <th class="text-right">Tanggal</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="ticket in recentTickets" :key="ticket.id" class="hover:bg-[#F8FAFC]">
                <td>
                  <span class="font-mono text-[12px] font-extrabold text-[#5D87FF]">{{ ticket.nomor_tiket || `TCK-#${ticket.id}` }}</span>
                </td>
                <td>
                  <p class="text-[13px] font-bold text-[#2A3547] leading-tight">{{ ticket.judul }}</p>
                  <p class="text-[11px] text-[#7C8BAC]">Pelapor: {{ ticket.pelapor || 'User' }}</p>
                </td>
                <td>
                  <div class="flex items-center gap-2">
                    <div class="flex h-7 w-7 items-center justify-center rounded-full bg-[#ECF2FF] text-[10px] font-bold text-[#5D87FF]">
                      {{ (ticket.assigned_to || 'A').charAt(0).toUpperCase() }}
                    </div>
                    <span class="text-[12px] font-bold text-[#2A3547]">{{ ticket.assigned_to || 'Belum ditugaskan' }}</span>
                  </div>
                </td>
                <td>
                  <AppBadge :type="getPriorityBadgeType(ticket.prioritas)" :text="ticket.prioritas" />
                </td>
                <td>
                  <AppBadge :type="getTicketStatusBadgeType(ticket.status_tiket)" :text="ticket.status_tiket" />
                </td>
                <td class="text-right text-[12px] font-medium text-[#7C8BAC]">{{ formatDate(ticket.dibuat_pada) }}</td>
              </tr>
              <tr v-if="recentTickets.length === 0">
                <td colspan="6" class="py-8 text-center text-[13px] text-[#7C8BAC]">Belum ada tiket permintaan.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </template>

  </div>
</template>
