<script setup>
// ============================================================
// DashboardView.vue — Dashboard monitoring bergaya Fynix
// Data real dari endpoint /api/assets/stats
// ============================================================
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useApi } from '../composables/useApi.js'
import AppBadge from '../components/ui/AppBadge.vue'
import { downloadAssetsCsv } from '../utils/exportAssetsCsv.js'

const { get } = useApi()
const router = useRouter()

// ── State ────────────────────────────────────────────────────
const stats     = ref(null)
const isLoading = ref(true)
const isExporting = ref(false)
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
const totalUsers = computed(() => toCount(stats.value?.totalUsers))
const totalEmployees = computed(() => toCount(stats.value?.totalEmployees))
const hasActiveUsers = computed(() => {
  const value = stats.value?.activeUsers
  return value !== null && value !== undefined && Number.isFinite(Number(value))
})
const activeUsers = computed(() =>
  hasActiveUsers.value ? toCount(stats.value?.activeUsers) : totalUsers.value,
)
const activeUsersCaption = computed(() =>
  hasActiveUsers.value ? `${totalUsers.value} akun terdaftar` : 'Total akun terdaftar',
)

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

const statusItems = computed(() => {
  const items = [
    { key: 'digunakan', label: 'Digunakan', count: countDipakai.value, color: '#10B981' },
    { key: 'tersedia', label: 'Tersedia', count: countTersedia.value, color: '#FC841B' },
    {
      key: 'maintenance',
      label: 'Maintenance',
      count: countMaintenance.value,
      color: '#F59E0B',
    },
    { key: 'rusak', label: 'Rusak', count: countRusak.value, color: '#EF4444' },
    { key: 'disposal', label: 'Disposal', count: countDisposal.value, color: '#6B7280' },
  ]

  if (countLainnya.value > 0) {
    items.push({ key: 'lainnya', label: 'Lainnya', count: countLainnya.value, color: '#8B5CF6' })
  }

  return items
})

const statusChartSegments = computed(() => {
  let offset = 0

  return statusItems.value
    .map((item) => {
      const pct = statusChartTotal.value > 0
        ? (item.count / statusChartTotal.value) * 100
        : 0
      const segment = { ...item, pct, offset }
      offset += pct
      return segment
    })
    .filter((item) => item.pct > 0)
})

const statusChartDescription = computed(() =>
  statusItems.value.map((item) => `${item.label} ${item.count}`).join(', '),
)

// Kondisi sehat dihitung dari aset berkondisi Baru + Baik, bukan dari status penggunaan.
const conditionRows = computed(() =>
  Array.isArray(stats.value?.byCondition) ? stats.value.byCondition : [],
)
const hasConditionStats = computed(() => conditionRows.value.length > 0)
const conditionMap = computed(() => {
  const map = {}
  for (const row of conditionRows.value) {
    const condition = normalizeLabel(row?.condition)
    map[condition] = (map[condition] || 0) + toCount(row?.count)
  }
  return map
})
const conditionTotal = computed(() =>
  Object.values(conditionMap.value).reduce((total, count) => total + count, 0),
)
const healthTotal = computed(() => totalAssets.value || conditionTotal.value)
const healthyAssets = computed(() =>
  (conditionMap.value['baru'] || 0) + (conditionMap.value['baik'] || 0),
)
const healthPct = computed(() =>
  hasConditionStats.value ? percentage(healthyAssets.value, healthTotal.value) : 0,
)
const healthLabel = computed(() => {
  if (healthTotal.value === 0) return 'Belum ada aset'
  if (!hasConditionStats.value) return 'Data belum tersedia'
  if (healthPct.value >= 70) return 'Baik'
  if (healthPct.value >= 40) return 'Sedang'
  return 'Perlu perhatian'
})
const healthDescription = computed(() => {
  if (healthTotal.value === 0) return 'Belum ada aset untuk dinilai.'
  if (!hasConditionStats.value) return 'Rincian kondisi belum tersedia dari server.'
  return `${healthyAssets.value} dari ${healthTotal.value} aset berkondisi Baru atau Baik.`
})

// ── Computed: tipe breakdown ─────────────────────────────────
const typeBreakdown = computed(() => {
  if (!stats.value?.byType?.length) return []
  return stats.value.byType.slice(0, 6).map(row => ({
    label: row?.device_type || 'Tanpa tipe',
    count: toCount(row?.count),
    pct: percentage(toCount(row?.count)),
  }))
})

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
    stats.value = await get('/api/assets/stats')
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
  router.push({ path: '/assets', query: { action: 'add' } })
}

async function exportAssets() {
  if (isExporting.value) return

  isExporting.value = true
  try {
    const data = await get('/api/assets')
    if (!downloadAssetsCsv(data)) {
      alert('Tidak ada data aset untuk diexport.')
    }
  } catch (e) {
    console.error('Gagal mengekspor data aset:', e)
    alert('Gagal mengekspor data aset.')
  } finally {
    isExporting.value = false
  }
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

function formatDate(iso) {
  if (!iso) return '-'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

onMounted(fetchStats)
</script>

<template>
  <div class="flex flex-col gap-5 sm:gap-6">

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
        class="w-8 h-8 border-4 border-[#E5E7EB] border-t-brand rounded-full animate-spin"
        aria-hidden="true"
      ></div>
      <span class="sr-only">Memuat statistik dashboard…</span>
    </div>

    <!-- ═══════════════════════════════════════════
         ERROR
         ═══════════════════════════════════════════ -->
    <div
      v-else-if="error"
      class="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-[13px] font-medium flex flex-wrap items-center gap-2"
      role="alert"
      aria-live="assertive"
    >
      <span class="material-symbols-outlined text-[18px]" aria-hidden="true">error</span>
      <span class="min-w-0 flex-1">{{ error }}</span>
      <button
        type="button"
        class="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-[11px] font-bold text-red-700 transition-colors hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
        @click="fetchStats"
      >
        Coba lagi
      </button>
    </div>

    <!-- ═══════════════════════════════════════════
         DASHBOARD CONTENT
         ═══════════════════════════════════════════ -->
    <template v-else-if="stats">

      <!-- ─── ROW 1: 4 Stat Cards ────────────────────────────── -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">

        <!-- Total Aset (ESB orange gradient card) -->
        <div class="relative min-h-[148px] overflow-hidden rounded-[20px] bg-gradient-to-br from-[#FAA425] to-[#FC841B] p-5 text-white lg:col-span-1 shadow-[0_8px_32px_0_rgba(252,132,27,0.22)] border border-white/10">
          <!-- Decorative circle -->
          <div class="absolute -right-5 -top-7 h-28 w-28 rounded-full border-[18px] border-white/[0.07]"></div>
          <div class="absolute -bottom-16 -left-8 h-36 w-36 rounded-full bg-white/[0.06] blur-sm"></div>
          <div class="relative">
            <p class="mb-2 text-[10px] font-bold uppercase tracking-[0.13em] text-white/65">Total Aset IT</p>
            <p class="font-num text-[38px] font-extrabold leading-none tracking-[-0.04em]">{{ totalAssets }}</p>
            <p class="mt-1.5 text-[10px] font-medium text-white/60">Unit terdaftar dalam sistem</p>
            <div class="flex gap-2 mt-4">
              <button
                type="button"
                class="rounded-lg bg-white px-3.5 py-2 text-[10px] font-bold text-brand-dark shadow-sm hover:-translate-y-0.5 hover:bg-[#F7FAFF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                @click="goToAddAsset"
              >
                + Tambah
              </button>
              <button
                type="button"
                class="rounded-lg border border-white/15 bg-white/10 px-3.5 py-2 text-[10px] font-bold text-white backdrop-blur-sm hover:-translate-y-0.5 hover:bg-white/20 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                :disabled="isExporting"
                :aria-busy="isExporting"
                @click="exportAssets"
              >
                {{ isExporting ? 'Menyiapkan…' : 'Export ↗' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Card: Digunakan -->
        <div class="shadow-card shadow-card-hover flex min-h-[148px] flex-col gap-1 rounded-[20px] border border-[#E8EDF3] bg-white p-5">
          <div class="flex items-center justify-between mb-1">
            <p class="text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wide">Digunakan</p>
            <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-[#ECFDF5]">
              <span class="material-symbols-outlined text-[#10B981] text-[16px]" aria-hidden="true">check_circle</span>
            </div>
          </div>
          <p class="font-num mt-2 text-[32px] font-extrabold leading-none text-[#172033]">{{ countDipakai }}</p>
          <div class="flex items-center gap-2 mt-1">
            <div
              class="flex-1 h-1.5 bg-[#F3F4F6] rounded-full overflow-hidden"
              role="progressbar"
              aria-label="Persentase aset digunakan"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-valuenow="pctDipakai"
            >
              <div class="h-full bg-[#10B981] rounded-full transition-all duration-700" :style="{ width: pctDipakai + '%' }"></div>
            </div>
            <span class="text-[10px] font-bold text-[#10B981]">{{ pctDipakai }}%</span>
          </div>
        </div>

        <!-- Card: Tersedia -->
        <div class="shadow-card shadow-card-hover flex min-h-[148px] flex-col gap-1 rounded-[20px] border border-[#E8EDF3] bg-white p-5">
          <div class="flex items-center justify-between mb-1">
            <p class="text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wide">Tersedia</p>
            <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-light">
              <span class="material-symbols-outlined text-brand text-[16px]" aria-hidden="true">inventory_2</span>
            </div>
          </div>
          <p class="font-num mt-2 text-[32px] font-extrabold leading-none text-[#172033]">{{ countTersedia }}</p>
          <div class="flex items-center gap-2 mt-1">
            <div
              class="flex-1 h-1.5 bg-[#F3F4F6] rounded-full overflow-hidden"
              role="progressbar"
              aria-label="Persentase aset tersedia"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-valuenow="pctTersedia"
            >
              <div class="h-full bg-brand rounded-full transition-all duration-700" :style="{ width: pctTersedia + '%' }"></div>
            </div>
            <span class="text-[10px] font-bold text-brand">{{ pctTersedia }}%</span>
          </div>
        </div>

        <!-- Card: Pengguna aktif -->
        <div class="shadow-card shadow-card-hover flex min-h-[148px] flex-col gap-1 rounded-[20px] border border-[#E8EDF3] bg-white p-5">
          <div class="flex items-center justify-between mb-1">
            <p class="text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wide">Pengguna Aktif</p>
            <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F4F0FF]">
              <span class="material-symbols-outlined text-[#8B5CF6] text-[16px]" aria-hidden="true">group</span>
            </div>
          </div>
          <p class="font-num mt-2 text-[32px] font-extrabold leading-none text-[#172033]">{{ activeUsers }}</p>
          <p class="text-[10px] text-[#9CA3AF] mt-1">{{ activeUsersCaption }}</p>
        </div>

      </div>

      <!-- ─── ROW 2: Grafik Tipe + Donut Status + Aset Terbaru ─ -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">

        <!-- Grafik Bar — Distribusi per Tipe (span 5) -->
        <div class="shadow-card flex flex-col gap-5 rounded-[20px] border border-[#E8EDF3] bg-white p-5 lg:col-span-5 sm:p-6">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-[14px] font-extrabold tracking-[-0.015em] text-[#172033]">Distribusi Tipe Perangkat</h3>
              <p class="text-[11px] text-[#9CA3AF] mt-0.5">Jumlah aset per kategori perangkat</p>
            </div>
            <div class="text-[11px] text-[#9CA3AF] font-medium">{{ totalAssets }} unit</div>
          </div>

          <!-- Bar Chart: horizontal bars -->
          <div class="flex flex-col gap-3 mt-1">
            <div v-if="typeBreakdown.length === 0" class="text-[12px] text-[#9CA3AF] text-center py-4">
              Tidak ada data tipe perangkat
            </div>
            <div
              v-for="(item, i) in typeBreakdown"
              :key="i"
              class="flex items-center gap-3"
            >
              <!-- Label -->
              <div class="w-28 shrink-0 text-[11px] font-semibold text-[#374151] truncate">{{ item.label }}</div>
              <!-- Bar -->
              <div class="flex-1 h-6 bg-[#F3F4F6] rounded-full overflow-hidden relative">
                <div
                  class="h-full rounded-full flex items-center pl-2 text-[10px] font-bold text-white transition-all duration-500"
                  :class="[
                    i === 0 ? 'bg-brand' :
                    i === 1 ? 'bg-[#111827]' :
                    i === 2 ? 'bg-brand-dark' :
                    i === 3 ? 'bg-[#F59E0B]' :
                    i === 4 ? 'bg-[#8B5CF6]' : 'bg-[#6B7280]'
                  ]"
                  :style="{ width: Math.max(item.pct, 8) + '%' }"
                >
                  {{ item.count }}
                </div>
              </div>
              <!-- Persen -->
              <div class="w-10 text-right text-[10px] font-bold text-[#6B7280]">{{ item.pct }}%</div>
            </div>
          </div>
        </div>

        <!-- Donut Chart — Status Aset (span 3) -->
        <div class="shadow-card flex flex-col gap-4 rounded-[20px] border border-[#E8EDF3] bg-white p-5 lg:col-span-3 sm:p-6">
          <div>
            <h3 class="text-[14px] font-extrabold tracking-[-0.015em] text-[#172033]">Status Aset</h3>
            <p class="text-[11px] text-[#9CA3AF] mt-0.5">Proporsi status seluruh aset</p>
          </div>

          <!-- SVG Donut -->
          <div class="flex items-center justify-center py-2">
            <div class="relative w-32 h-32">
              <svg
                viewBox="0 0 36 36"
                class="w-full h-full -rotate-90"
                role="img"
                aria-labelledby="dashboard-status-chart-title dashboard-status-chart-description"
              >
                <title id="dashboard-status-chart-title">Distribusi status aset</title>
                <desc id="dashboard-status-chart-description">
                  {{ statusChartDescription || 'Belum ada data status aset' }}
                </desc>
                <!-- Background track -->
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#F3F4F6" stroke-width="3" />
                <circle
                  v-for="segment in statusChartSegments"
                  :key="segment.key"
                  cx="18" cy="18" r="15.9" fill="none"
                  :stroke="segment.color" stroke-width="3"
                  :stroke-dasharray="`${segment.pct} ${100 - segment.pct}`"
                  :stroke-dashoffset="-segment.offset"
                  class="transition-all duration-700"
                />
              </svg>
              <!-- Center text -->
              <div class="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
                <span class="text-[22px] font-black text-[#111827] leading-none font-num">{{ totalAssets || statusChartTotal }}</span>
                <span class="text-[9px] text-[#9CA3AF] leading-none mt-0.5">Total</span>
              </div>
            </div>
          </div>

          <!-- Legend -->
          <div class="flex flex-col gap-1.5" aria-label="Legenda status aset">
            <div
              v-for="item in statusItems"
              :key="item.key"
              class="flex items-center justify-between text-[11px]"
            >
              <div class="flex items-center gap-1.5">
                <span
                  class="w-2.5 h-2.5 rounded-sm"
                  :style="{ backgroundColor: item.color }"
                  aria-hidden="true"
                ></span>
                <span class="text-[#374151]">{{ item.label }}</span>
              </div>
              <span class="font-bold text-[#111827]">{{ item.count }}</span>
            </div>
          </div>
        </div>

        <!-- Ringkasan Statistik (span 4) — seperti "Finance Score" + "AI Enhancements" di Fynix -->
        <div class="lg:col-span-4 flex flex-col gap-4">

          <!-- Skor Kondisi Aset -->
          <div class="shadow-card flex flex-col gap-3 rounded-[20px] border border-[#E8EDF3] bg-white p-5">
            <div class="flex items-start justify-between">
              <div>
                <p class="text-[11px] text-[#9CA3AF] font-medium">Kondisi Aset</p>
                <p class="text-[#111827] text-[13px] font-black mt-0.5">
                  {{ healthLabel }}
                </p>
              </div>
              <span class="material-symbols-outlined text-[18px] text-[#9CA3AF]" aria-hidden="true">monitor_heart</span>
            </div>
            <!-- Score Bar -->
            <div class="flex items-center gap-3">
              <div
                class="flex-1 h-2 bg-[#F3F4F6] rounded-full overflow-hidden"
                role="progressbar"
                aria-label="Persentase aset sehat"
                aria-valuemin="0"
                aria-valuemax="100"
                :aria-valuenow="hasConditionStats ? healthPct : undefined"
                :aria-valuetext="healthDescription"
              >
                <div
                  class="h-full rounded-full transition-all duration-700"
                  :class="!hasConditionStats || healthTotal === 0 ? 'bg-[#9CA3AF]' : healthPct >= 70 ? 'bg-[#10B981]' : healthPct >= 40 ? 'bg-[#F59E0B]' : 'bg-[#EF4444]'"
                  :style="{ width: (hasConditionStats ? healthPct : 0) + '%' }"
                ></div>
              </div>
              <span class="text-[20px] font-black text-[#111827] font-num">
                {{ hasConditionStats ? `${healthPct}%` : '—' }}
              </span>
            </div>
            <p class="text-[10px] leading-relaxed text-[#9CA3AF]">{{ healthDescription }}</p>
          </div>

          <!-- Quick Stats 4 Items -->
          <div class="shadow-card rounded-[20px] border border-[#E8EDF3] bg-white p-5">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-[13px] font-black text-[#111827]">Ringkasan Cepat</h3>
            </div>
            <div class="grid grid-cols-4 gap-2 text-center">
              <!-- Total Aset -->
              <div class="flex flex-col gap-1 border-r border-[#F3F4F6] pr-1">
                <span class="text-[20px] font-black text-[#111827] font-num">{{ totalAssets }}</span>
                <span class="text-[8px] text-[#9CA3AF] font-bold uppercase tracking-wider">Total Aset</span>
              </div>
              <!-- Karyawan -->
              <div class="flex flex-col gap-1 border-r border-[#F3F4F6] px-1">
                <span class="text-[20px] font-black text-[#111827] font-num">{{ totalEmployees }}</span>
                <span class="text-[8px] text-[#9CA3AF] font-bold uppercase tracking-wider">Karyawan</span>
              </div>
              <!-- Maintenance -->
              <div class="flex flex-col gap-1 border-r border-[#F3F4F6] px-1">
                <span class="text-[20px] font-black text-[#111827] font-num">{{ countMaintenance }}</span>
                <span class="text-[8px] text-[#9CA3AF] font-bold uppercase tracking-wider">Maintenance</span>
              </div>
              <!-- Rusak -->
              <div class="flex flex-col gap-1 pl-1">
                <span class="text-[20px] font-black text-[#111827] font-num">{{ countRusak }}</span>
                <span class="text-[8px] text-[#9CA3AF] font-bold uppercase tracking-wider">Total Rusak</span>
              </div>
            </div>
          </div>

        </div>

      </div>

      <!-- Distribusi lokasi aset -->
      <div class="shadow-card rounded-[20px] border border-[#E8EDF3] bg-white p-5 sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-2 mb-4">
          <div>
            <h3 class="text-[13px] font-black text-[#111827]">Lokasi Aset</h3>
            <p class="text-[11px] text-[#9CA3AF] mt-0.5">Sebaran tempat aset berada saat ini</p>
          </div>
          <div class="flex items-center gap-1.5 text-[11px] font-medium text-[#6B7280]">
            <span aria-hidden="true" class="material-symbols-outlined text-[16px] text-[#0188EA]">location_on</span>
            {{ locationBreakdown.length }} lokasi
          </div>
        </div>

        <div v-if="locationBreakdown.length" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          <div
            v-for="location in locationBreakdown"
            :key="location.label"
            class="rounded-xl border border-[#F3F4F6] bg-[#F9FAFB] p-3"
          >
            <div class="flex items-center justify-between gap-3 mb-2">
              <span class="min-w-0 truncate text-[12px] font-bold text-[#374151]" :title="location.label">
                {{ location.label }}
              </span>
              <span class="shrink-0 text-[12px] font-black text-[#111827]">{{ location.count }} aset</span>
            </div>
            <div
              class="h-1.5 overflow-hidden rounded-full bg-[#E5E7EB]"
              role="progressbar"
              :aria-label="`${location.label}: ${location.count} aset`"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-valuenow="location.pct"
            >
              <div class="h-full rounded-full bg-gradient-to-r from-[#0188EA] to-[#0252B3]" :style="{ width: `${location.pct}%` }"></div>
            </div>
            <p class="mt-1.5 text-right text-[10px] font-semibold text-[#9CA3AF]">{{ location.pct }}% dari total</p>
          </div>
        </div>
        <div v-else class="rounded-xl bg-[#F9FAFB] py-6 text-center text-[12px] text-[#9CA3AF]">
          Belum ada data lokasi aset.
        </div>
      </div>

      <!-- ─── ROW 3: Tabel Aset Terbaru ──────────────────────── -->
      <div class="shadow-card overflow-hidden rounded-[20px] border border-[#E8EDF3] bg-white">
        <!-- Header tabel -->
        <div class="flex items-center justify-between px-5 py-4 border-b border-[#F3F4F6]">
          <div>
            <h3 class="text-[13px] font-black text-[#111827]">Aset Terbaru Ditambahkan</h3>
            <p class="text-[11px] text-[#9CA3AF] mt-0.5">5 aset IT paling baru dalam sistem</p>
          </div>
          <RouterLink to="/assets" class="text-[11px] font-bold text-brand hover:text-brand-dark flex items-center gap-1">
            Lihat Semua
            <span class="material-symbols-outlined text-[14px]" aria-hidden="true">arrow_forward</span>
          </RouterLink>
        </div>

        <!-- Tabel -->
        <div
          class="overflow-x-auto"
          tabindex="0"
          aria-label="Tabel lima aset terbaru; geser secara horizontal untuk melihat seluruh kolom"
        >
          <table class="w-full min-w-[700px]">
            <caption class="sr-only">Lima aset IT yang paling baru ditambahkan</caption>
            <thead>
              <tr class="text-left border-b border-[#F3F4F6]">
                <th class="px-5 py-2.5 text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">Label Aset</th>
                <th class="px-5 py-2.5 text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">Merek / Tipe</th>
                <th class="px-5 py-2.5 text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">Serial Number</th>
                <th class="px-5 py-2.5 text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">Kondisi</th>
                <th class="px-5 py-2.5 text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">Status</th>
                <th class="px-5 py-2.5 text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider text-right">Ditambahkan</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[#F9FAFB]">
              <tr
                v-for="asset in recentAssets"
                :key="asset.id_aset"
                class="hover:bg-[#F9FAFB] transition-colors"
              >
                <td class="px-5 py-3">
                  <div class="flex items-center gap-3">
                    <!-- Icon perangkat -->
                    <div class="w-8 h-8 rounded-lg bg-[#F3F4F6] flex items-center justify-center shrink-0">
                      <span class="material-symbols-outlined text-[#6B7280] text-[16px]" aria-hidden="true">
                        {{ asset.tipe_perangkat?.toLowerCase().includes('laptop') ? 'laptop' :
                           asset.tipe_perangkat?.toLowerCase().includes('server') ? 'dns' :
                           asset.tipe_perangkat?.toLowerCase().includes('printer') ? 'print' :
                           'computer' }}
                      </span>
                    </div>
                    <div>
                      <p class="text-[12px] font-bold text-[#111827]">{{ asset.label_aset }}</p>
                      <p class="text-[10px] text-[#9CA3AF]">ID #{{ asset.id_aset }}</p>
                    </div>
                  </div>
                </td>
                <td class="px-5 py-3">
                  <p class="text-[12px] font-semibold text-[#374151]">{{ asset.merek }}</p>
                  <p class="text-[10px] text-[#9CA3AF]">{{ asset.tipe_perangkat }}</p>
                </td>
                <td class="px-5 py-3 font-mono text-[11px] text-[#6B7280]">{{ asset.nomor_seri }}</td>
                <td class="px-5 py-3 text-[12px] text-[#374151] font-medium">{{ asset.kondisi_aset }}</td>
                <td class="px-5 py-3">
                  <AppBadge :type="getStatusBadgeType(asset.status_aset)" :text="asset.status_aset" />
                </td>
                <td class="px-5 py-3 text-right text-[11px] text-[#9CA3AF]">{{ formatDate(asset.dibuat_pada) }}</td>
              </tr>
              <tr v-if="recentAssets.length === 0">
                <td colspan="6" class="px-5 py-8 text-center text-[12px] text-[#9CA3AF]">Belum ada data aset.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </template>

  </div>
</template>
