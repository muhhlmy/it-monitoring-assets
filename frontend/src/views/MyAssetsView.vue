<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useApi } from '../composables/useApi.js'
import { useAuth } from '../composables/useAuth.js'
import { formatStatusPill } from '../utils/assetStatus.js'
import AppModal from '../components/ui/AppModal.vue'
import AppBadge from '../components/ui/AppBadge.vue'
import AppPagination from '../components/ui/AppPagination.vue'

const { get } = useApi()
const { isAdmin, isSuperAdmin, user } = useAuth()

// ── State Level Navigasi (1 = Listing Karyawan, 2 = Detail Karyawan, 3 = Detail & Audit History Aset) ──
const currentLevel = ref(isAdmin.value ? 1 : 2)

// ── State: Data Karyawan & Aset ───────────────────────────────────────────────
const employees = ref([])
const isLoadingEmployees = ref(false)
const employeeError = ref('')
const employeeSearch = ref('')
const filterDepartemen = ref('')
const filterLokasi = ref('')

// State Karyawan & Aset Terpilih
const selectedEmployee = ref(
  !isAdmin.value ? { nama_karyawan: user.value?.nama || 'Saya', nik: user.value?.nik || '' } : null,
)
const selectedAsset = ref(null)

const myAssets = ref([])
const isLoadingAssets = ref(false)
const assetError = ref('')
const assetSearch = ref('')
const filterTipe = ref('')

const showSpecificationModal = ref(false)
const activeModalAsset = ref(null)

// State Device Cycle & Real Audit Logs
const deviceCycle = ref([])
const realAssetLogs = ref([])
const isLoadingCycle = ref(false)
const isLoadingLogs = ref(false)

// ── Level 1: Filtered Employees (Rule: STRICTLY ONLY employees with assets > 0) ──
const employeesWithAssets = computed(() => {
  return employees.value.filter((e) => parseInt(e.jumlah_aset || 0) > 0)
})

// ── Level 1 KPI Calculations ───────────────────────────────────────────────────
const totalEmployeesHoldingAssets = computed(() => employeesWithAssets.value.length)

const totalAssignedAssetsCount = computed(() => {
  return employeesWithAssets.value.reduce((acc, emp) => acc + parseInt(emp.jumlah_aset || 0), 0)
})

const recentlyAssignedCount = computed(() => {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  return employeesWithAssets.value.filter((e) => {
    if (!e.last_assignment_date) return false
    const assignDate = new Date(e.last_assignment_date)
    return !isNaN(assignDate.getTime()) && assignDate >= thirtyDaysAgo
  }).length
})

// ── Filter Options & Filtering for Level 1 ─────────────────────────────────────
const departemenOptions = computed(() => {
  const deps = [...new Set(employeesWithAssets.value.map((e) => e.departemen).filter(Boolean))]
  return deps.sort()
})

const lokasiOptions = computed(() => {
  const locs = [...new Set(employeesWithAssets.value.map((e) => e.lokasi_kerja).filter(Boolean))]
  return locs.sort()
})

const currentPageEmployees = ref(1)
const currentPageAssets = ref(1)
const itemsPerPage = ref(10)

watch([employeeSearch, filterDepartemen, filterLokasi], () => {
  currentPageEmployees.value = 1
})

watch([assetSearch, filterTipe, selectedEmployee], () => {
  currentPageAssets.value = 1
})

const filteredEmployees = computed(() => {
  const q = employeeSearch.value.trim().toLowerCase()
  return employeesWithAssets.value.filter((e) => {
    const text = [e.nik, e.nama_karyawan, e.email_kantor, e.departemen, e.jabatan, e.lokasi_kerja]
      .join(' ')
      .toLowerCase()
    return (
      (!q || text.includes(q)) &&
      (!filterDepartemen.value || e.departemen === filterDepartemen.value) &&
      (!filterLokasi.value || e.lokasi_kerja === filterLokasi.value)
    )
  })
})

const paginatedEmployees = computed(() => {
  const start = (currentPageEmployees.value - 1) * itemsPerPage.value
  return filteredEmployees.value.slice(start, start + itemsPerPage.value)
})

// ── Level 2: Filter & Pagination Aset Karyawan ─────────────────────────────────
const filteredAssets = computed(() => {
  const q = assetSearch.value.trim().toLowerCase()
  return myAssets.value.filter((asset) => {
    const text = [
      asset.id_aset,
      asset.nomor_seri,
      asset.label_aset,
      asset.spesifikasi,
      asset.lokasi_aset,
      asset.tipe_perangkat,
      asset.merek,
      asset.model,
      asset.status_aset,
      asset.kondisi_aset,
    ]
      .join(' ')
      .toLowerCase()
    return (
      (!q || text.includes(q)) && (!filterTipe.value || asset.tipe_perangkat === filterTipe.value)
    )
  })
})

const paginatedAssets = computed(() => {
  const start = (currentPageAssets.value - 1) * itemsPerPage.value
  return filteredAssets.value.slice(start, start + itemsPerPage.value)
})

const availableTipeOptions = computed(() => [
  ...new Set(myAssets.value.map((a) => a.tipe_perangkat).filter(Boolean)),
])

// ── Level 2 Summary Metrics ────────────────────────────────────────────────────
const employeeAssignedSince = computed(() => {
  if (myAssets.value.length === 0) return '—'
  const dates = myAssets.value
    .map((a) => a.created_at || a.dibuat_pada)
    .filter(Boolean)
    .map((d) => new Date(d).getTime())
    .filter((t) => !isNaN(t))
  if (dates.length === 0) return '—'
  const minTimestamp = Math.min(...dates)
  return formatDate(new Date(minTimestamp).toISOString())
})

const employeeLastActivity = computed(() => {
  if (myAssets.value.length === 0) return '—'
  const dates = myAssets.value
    .map((a) => a.updated_at || a.created_at || a.dibuat_pada)
    .filter(Boolean)
    .map((d) => new Date(d).getTime())
    .filter((t) => !isNaN(t))
  if (dates.length === 0) return '—'
  const maxTimestamp = Math.max(...dates)
  return formatDate(new Date(maxTimestamp).toISOString())
})

// ── Level 3: Audit & History Log Timeline ──────────────────────────────────────
const assetHistoryTimeline = computed(() => {
  if (!selectedAsset.value) return []

  const list = []
  const asset = selectedAsset.value
  const emp = selectedEmployee.value

  // 1. Real Audit Logs from log_riwayat_aset (/api/logs/assets/:id)
  if (realAssetLogs.value.length > 0) {
    realAssetLogs.value.forEach((log) => {
      let icon = 'edit'
      let type = 'status_change'
      let actionTitle =
        log.aksi === 'TAMBAH'
          ? 'Aset Didaftarkan ke Sistem'
          : log.aksi === 'UBAH'
            ? 'Pembaruan Informasi Aset'
            : 'Aset Dihapus'

      if (log.aksi === 'TAMBAH') {
        icon = 'add_circle'
        type = 'creation'
      } else if (log.aksi === 'HAPUS') {
        icon = 'delete'
        type = 'deletion'
      } else if (
        log.perubahan?.includes('NIK Pemegang') ||
        log.perubahan?.includes('nama_karyawan') ||
        log.perubahan?.includes('Pemegang')
      ) {
        icon = 'person_add'
        type = 'assignment'
        actionTitle = 'Penugasan Aset Diperbarui'
      } else if (log.perubahan?.includes('Lokasi')) {
        icon = 'pin_drop'
        type = 'relocation'
        actionTitle = 'Lokasi Aset Dipindahkan'
      }

      list.push({
        date: log.dibuat_pada || log.created_at,
        action: actionTitle,
        actor: log.oleh_pengguna || log.nama_user || log.username || 'Super Administrator',
        status: log.aksi,
        detail: log.perubahan || 'Perubahan data aset tercatat oleh sistem',
        icon,
        type,
      })
    })
  }

  // 2. Usage Cycles from riwayat_pemakaian_aset
  const cycles = deviceCycle.value.filter(
    (c) =>
      c.nomor_seri === asset.nomor_seri ||
      c.id_aset === asset.id_aset ||
      c.label_aset === asset.label_aset,
  )

  cycles.forEach((c) => {
    list.push({
      date: c.tanggal_mulai,
      action: `Aset ditugaskan kepada ${emp?.nama_karyawan || 'Karyawan'}`,
      actor: 'Admin IT System',
      status: c.status_pemakaian || 'Aktif',
      detail: `Catatan Penugasan: ${c.catatan || 'Aset aktif digunakan oleh pemegang'}`,
      icon: 'person_pin',
      type: 'assignment',
    })
    if (c.tanggal_selesai) {
      list.push({
        date: c.tanggal_selesai,
        action: 'Penugasan aset selesai / dikembalikan',
        actor: 'Admin IT System',
        status: 'Selesai',
        detail: 'Aset telah dikembalikan ke stok inventaris IT',
        icon: 'assignment_return',
        type: 'return',
      })
    }
  })

  // 3. Fallback entry if no logs or cycles exist
  if (list.length === 0) {
    list.push({
      date: asset.created_at || new Date().toISOString(),
      action: `Aset ditugaskan kepada ${emp?.nama_karyawan || 'Karyawan'}`,
      actor: 'Sistem Inventory IT',
      status: asset.status_aset || 'In Use',
      detail: `Pemegang Aktif: ${emp?.nama_karyawan || 'Karyawan'} (NIK: ${emp?.nik || '—'})`,
      icon: 'person_check',
      type: 'assignment',
    })
  }

  return list.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
})

// ── Navigasi Helper ────────────────────────────────────────────────────────────
function goToLevel1() {
  if (!isAdmin.value) return
  currentLevel.value = 1
  selectedEmployee.value = null
  selectedAsset.value = null
  myAssets.value = []
  deviceCycle.value = []
  realAssetLogs.value = []
}

function normalizeAsset(a) {
  if (!a || typeof a !== 'object') return a
  const hostname = a.hostname || a.label_aset || ''
  const serial_number = a.serial_number || a.nomor_seri || ''
  const nik = a.nik_pemegang_asset || a.nik || ''
  const nama = a.nama_karyawan_pemegang_asset || a.nama_karyawan || ''
  const dept = a.departemen_pemegang_asset || a.departemen || ''
  const lokasi = a.lokasi_asset || a.lokasi_aset || a.lokasi_kerja || a.lokasi || ''
  const status = a.status || a.status_aset || 'In Use'
  const kondisi = a.kondisi || a.kondisi_aset || 'Normal'
  const note = a.note_asset || a.catatan_aset || ''
  const brand = a.brand_merek || a.merek || ''

  return {
    ...a,
    id_aset: a.id_aset || a.id,
    id: a.id || a.id_aset,
    hostname,
    label_aset: hostname,
    serial_number,
    nomor_seri: serial_number,
    nik_pemegang_asset: nik,
    nik,
    nama_karyawan_pemegang_asset: nama,
    nama_karyawan: nama,
    departemen_pemegang_asset: dept,
    departemen: dept,
    lokasi_asset: lokasi,
    lokasi_aset: lokasi,
    lokasi_kerja: lokasi,
    lokasi,
    brand_merek: brand,
    merek: brand,
    status,
    status_aset: status,
    kondisi,
    kondisi_aset: kondisi,
    note_asset: note,
    catatan_aset: note,
  }
}

async function goToLevel2(employee) {
  selectedEmployee.value = employee
  selectedAsset.value = null
  currentLevel.value = 2
  assetSearch.value = ''
  filterTipe.value = ''
  myAssets.value = []
  deviceCycle.value = []
  realAssetLogs.value = []
  assetError.value = ''

  isLoadingAssets.value = true
  try {
    const nik = employee.nik || ''
    const assetData = await get(`/api/assets/my?nik=${encodeURIComponent(nik)}`)
    myAssets.value = Array.isArray(assetData) ? assetData.map(normalizeAsset) : []

    if ((isAdmin.value || isSuperAdmin.value) && nik) {
      isLoadingCycle.value = true
      try {
        const cycleData = await get(`/api/assets/cycle/${encodeURIComponent(nik)}`)
        deviceCycle.value = Array.isArray(cycleData) ? cycleData : []
      } catch {
        deviceCycle.value = []
      } finally {
        isLoadingCycle.value = false
      }
    }
  } catch (err) {
    assetError.value = err.message || 'Gagal memuat data aset karyawan.'
  } finally {
    isLoadingAssets.value = false
  }
}

async function goToLevel3(asset) {
  selectedAsset.value = normalizeAsset(asset)
  currentLevel.value = 3
  await fetchAssetLogs(selectedAsset.value.id_aset || selectedAsset.value.id)
}

async function fetchAssetLogs(idAset) {
  if (!idAset) {
    realAssetLogs.value = []
    return
  }
  isLoadingLogs.value = true
  try {
    const data = await get(`/api/logs/assets/${idAset}`)
    realAssetLogs.value = Array.isArray(data) ? data : []
  } catch (error) {
    console.error('Error fetching real asset logs:', error)
    realAssetLogs.value = []
  } finally {
    isLoadingLogs.value = false
  }
}

// ── Data Fetching ─────────────────────────────────────────────────────────────
async function fetchEmployees() {
  if (!isAdmin.value) return

  isLoadingEmployees.value = true
  employeeError.value = ''
  try {
    const data = await get('/api/karyawan/with-assets')
    employees.value = Array.isArray(data) ? data : []
  } catch (err) {
    employeeError.value = err.message || 'Gagal memuat daftar karyawan.'
  } finally {
    isLoadingEmployees.value = false
  }
}

async function loadMyOwnAssets() {
  isLoadingAssets.value = true
  assetError.value = ''
  try {
    const assetData = await get('/api/assets/my')
    myAssets.value = Array.isArray(assetData) ? assetData.map(normalizeAsset) : []
  } catch (err) {
    assetError.value = err.message || 'Gagal memuat data aset Anda.'
  } finally {
    isLoadingAssets.value = false
  }
}

function resetEmployeeFilters() {
  employeeSearch.value = ''
  filterDepartemen.value = ''
  filterLokasi.value = ''
}

function openSpecification(asset) {
  activeModalAsset.value = asset
  showSpecificationModal.value = true
}

function closeModal() {
  showSpecificationModal.value = false
  activeModalAsset.value = null
}

// ── UI Helper Utilities ───────────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return (
    d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }) +
    ' ' +
    d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  )
}

function getStatusBadgeType(status) {
  const s = (status || '').toLowerCase()
  if (['digunakan', 'in use'].includes(s)) return 'success'
  if (['tersedia', 'stok', 'stock'].includes(s)) return 'info'
  if (['maintenance', 'in service', 'dalam perawatan'].includes(s)) return 'warning'
  if (['rusak', 'damaged'].includes(s)) return 'danger'
  return 'default'
}

function getDeviceIcon(type) {
  const v = (type || '').toLowerCase()
  if (v.includes('laptop') || v.includes('macbook')) return 'laptop'
  if (v.includes('server')) return 'dns'
  if (v.includes('printer')) return 'print'
  if (v.includes('monitor') || v.includes('display')) return 'monitor'
  if (v.includes('handheld') || v.includes('phone') || v.includes('mobile')) return 'smartphone'
  if (v.includes('router') || v.includes('switch') || v.includes('network')) return 'router'
  return 'devices'
}

function getInitials(name) {
  return (name || '?')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

function getAvatarGradient(index) {
  const gradients = [
    'from-[#2563EB] to-[#1D4ED8]',
    'from-[#0D9488] to-[#0F766E]',
    'from-[#6366F1] to-[#4F46E5]',
    'from-[#D97706] to-[#B45309]',
    'from-[#0284C7] to-[#0369A1]',
    'from-[#059669] to-[#047857]',
  ]
  return gradients[index % gradients.length]
}

onMounted(() => {
  if (isAdmin.value) {
    fetchEmployees()
  } else {
    loadMyOwnAssets()
  }
})
</script>

<template>
  <div class="flex min-w-0 flex-col gap-5">
    <!-- ═══════════════════════════════════════════════════════════════════════
         LEVEL 1 — MAIN "ASET KARYAWAN" PAGE
    ════════════════════════════════════════════════════════════════════════ -->
    <template v-if="currentLevel === 1">
      <!-- Enterprise Header & Title -->
      <div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 class="text-xl font-bold tracking-tight text-[#0F172A]">Aset Karyawan</h1>
          <p class="mt-0.5 text-xs text-[#64748B]">
            Karyawan yang sedang memegang aset IT perusahaan
          </p>
        </div>
      </div>

      <!-- KPI Summary Cards Grid (Compact & Minimalist) -->
      <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <!-- KPI Card 1: Karyawan dengan Aset -->
        <div
          class="relative flex flex-col justify-between rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-2xs transition-all hover:border-[#CBD5E1]"
        >
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-semibold tracking-wide uppercase text-[#64748B]"
              >Karyawan dengan Aset</span
            >
            <div
              class="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB]"
            >
              <span class="material-symbols-outlined text-[16px]">badge</span>
            </div>
          </div>
          <div class="mt-3 flex items-baseline justify-between">
            <span class="text-2xl font-bold tracking-tight text-[#0F172A]">{{
              totalEmployeesHoldingAssets
            }}</span>
            <span
              class="inline-flex items-center rounded-full bg-[#EFF6FF] px-2 py-0.5 text-[10.5px] font-semibold text-[#2563EB]"
            >
              Pemegang Aktif
            </span>
          </div>
        </div>

        <!-- KPI Card 2: Total Aset Terassigned -->
        <div
          class="relative flex flex-col justify-between rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-2xs transition-all hover:border-[#CBD5E1]"
        >
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-semibold tracking-wide uppercase text-[#64748B]"
              >Total Aset Terassigned</span
            >
            <div
              class="flex h-7 w-7 items-center justify-center rounded-lg bg-[#ECFDF5] text-[#059669]"
            >
              <span class="material-symbols-outlined text-[16px]">devices</span>
            </div>
          </div>
          <div class="mt-3 flex items-baseline justify-between">
            <span class="text-2xl font-bold tracking-tight text-[#0F172A]">{{
              totalAssignedAssetsCount
            }}</span>
            <span
              class="inline-flex items-center rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[10.5px] font-semibold text-[#059669]"
            >
              Unit Dipakai
            </span>
          </div>
        </div>

        <!-- KPI Card 3: Baru Ditugaskan -->
        <div
          class="relative flex flex-col justify-between rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-2xs transition-all hover:border-[#CBD5E1]"
        >
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-semibold tracking-wide uppercase text-[#64748B]"
              >Baru Ditugaskan</span
            >
            <div
              class="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FAF5FF] text-[#7C3AED]"
            >
              <span class="material-symbols-outlined text-[16px]">assignment_turned_in</span>
            </div>
          </div>
          <div class="mt-3 flex items-baseline justify-between">
            <span class="text-2xl font-bold tracking-tight text-[#0F172A]">{{
              recentlyAssignedCount
            }}</span>
            <span
              class="inline-flex items-center rounded-full bg-[#FAF5FF] px-2 py-0.5 text-[10.5px] font-semibold text-[#7C3AED]"
            >
              30 Hari Terakhir
            </span>
          </div>
        </div>
      </div>

      <!-- Toolbar: Elegant Single Search & Compact Filters -->
      <div
        v-if="isAdmin"
        class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E2E8F0] bg-white p-3 shadow-2xs"
      >
        <div class="relative flex-1 min-w-[240px]">
          <label for="emp-search" class="sr-only">Cari karyawan dengan aset</label>
          <span
            class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-[#94A3B8] pointer-events-none"
            >search</span
          >
          <input
            id="emp-search"
            v-model="employeeSearch"
            type="search"
            autocomplete="off"
            placeholder="Cari nama karyawan, NIK, atau departemen..."
            class="h-9 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] pl-9 pr-3 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:border-[#2563EB] focus:bg-white focus:outline-none transition-all"
          />
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          <select
            v-model="filterDepartemen"
            aria-label="Filter departemen"
            class="h-9 w-[150px] rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 text-xs text-[#0F172A] focus:border-[#2563EB] focus:bg-white focus:outline-none transition-all cursor-pointer"
          >
            <option value="">Semua Departemen</option>
            <option v-for="dep in departemenOptions" :key="dep" :value="dep">{{ dep }}</option>
          </select>

          <select
            v-model="filterLokasi"
            aria-label="Filter lokasi"
            class="h-9 w-[140px] rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 text-xs text-[#0F172A] focus:border-[#2563EB] focus:bg-white focus:outline-none transition-all cursor-pointer"
          >
            <option value="">Semua Lokasi</option>
            <option v-for="loc in lokasiOptions" :key="loc" :value="loc">{{ loc }}</option>
          </select>

          <button
            v-if="employeeSearch || filterDepartemen || filterLokasi"
            type="button"
            @click="resetEmployeeFilters"
            class="h-9 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 text-xs font-semibold text-[#DC2626] hover:bg-[#FEE2E2] transition-all cursor-pointer"
          >
            Reset Filter
          </button>
        </div>
      </div>

      <!-- Main Hybrid Employee Table/List -->
      <div class="rounded-xl border border-[#E2E8F0] bg-white shadow-2xs overflow-hidden">
        <!-- Loading State -->
        <div v-if="isLoadingEmployees" class="p-6 space-y-3">
          <div
            v-for="n in 5"
            :key="n"
            class="h-12 w-full animate-pulse rounded-lg bg-[#F8FAFC]"
          ></div>
        </div>

        <!-- Error State -->
        <div v-else-if="employeeError" class="p-6 text-center text-rose-600 text-xs">
          <p class="font-semibold">{{ employeeError }}</p>
          <button
            type="button"
            @click="fetchEmployees"
            class="mt-2 font-bold underline cursor-pointer"
          >
            Coba muat ulang
          </button>
        </div>

        <!-- Empty State -->
        <div v-else-if="filteredEmployees.length === 0" class="p-12 text-center text-[#64748B]">
          <span class="material-symbols-outlined text-[36px] text-[#CBD5E1]">person_search</span>
          <h3 class="mt-2 font-semibold text-sm text-[#0F172A]">
            Tidak Ada Karyawan Memegang Aset
          </h3>
          <p class="text-xs text-[#64748B] mt-1 max-w-sm mx-auto">
            Tidak ditemukan karyawan yang sedang memegang aset IT sesuai kriteria pencarian.
          </p>
        </div>

        <!-- Data Table -->
        <div v-else class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[11px] font-semibold text-[#64748B] uppercase tracking-wider select-none">
                <th class="py-3 pl-5 pr-4">Karyawan</th>
                <th class="py-3 px-4">Departemen & Lokasi</th>
                <th class="py-3 px-4">Kategori Aset</th>
                <th class="py-3 px-4 text-center">Total Aset</th>
                <th class="py-3 px-4">Penugasan Terakhir</th>
                <th class="py-3 pr-5 pl-4 text-right">Detail</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[#F1F5F9] text-xs">
              <tr
                v-for="(employee, idx) in paginatedEmployees"
                :key="employee.id_karyawan || employee.nik"
                @click="goToLevel2(employee)"
                class="group hover:bg-[#F8FAFC] transition-colors duration-150 cursor-pointer select-none"
              >
                <!-- Avatar & Employee Info -->
                <td class="py-3.5 pl-5 pr-4 min-w-[200px]">
                  <div class="flex items-center gap-3">
                    <div
                      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-[11px] font-bold text-white shadow-2xs"
                      :class="getAvatarGradient(idx)"
                    >
                      {{ getInitials(employee.nama_karyawan) }}
                    </div>
                    <div class="flex flex-col min-w-0">
                      <span
                        class="text-xs font-semibold text-[#0F172A] group-hover:text-[#2563EB] transition-colors truncate"
                      >
                        {{ employee.nama_karyawan }}
                      </span>
                      <span class="font-mono text-[11px] text-[#64748B] truncate"
                        >NIK: {{ employee.nik }}</span
                      >
                    </div>
                  </div>
                </td>

                <!-- Departemen & Lokasi -->
                <td class="py-3.5 px-4 min-w-[160px]">
                  <div class="flex flex-col">
                    <span class="font-semibold text-[#1E293B] truncate">{{
                      employee.departemen || '—'
                    }}</span>
                    <span class="text-[11px] text-[#64748B] flex items-center gap-1 truncate mt-0.5">
                      <span class="material-symbols-outlined text-[13px] text-[#94A3B8]">location_on</span>
                      {{ employee.lokasi_kerja || '—' }}
                    </span>
                  </div>
                </td>

                <!-- Asset Type Chips -->
                <td class="py-3.5 px-4 min-w-[170px]">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <template v-if="employee.asset_types && employee.asset_types.length > 0">
                      <span
                        v-for="tipe in employee.asset_types.slice(0, 3)"
                        :key="tipe"
                        class="inline-flex items-center gap-1 rounded-md bg-[#F1F5F9] px-2 py-0.5 text-[10.5px] font-medium text-[#475569] border border-[#E2E8F0]"
                      >
                        <span class="material-symbols-outlined text-[12px] text-[#2563EB]">{{
                          getDeviceIcon(tipe)
                        }}</span>
                        {{ tipe }}
                      </span>
                      <span
                        v-if="employee.asset_types.length > 3"
                        class="text-[10px] font-semibold text-[#94A3B8]"
                      >
                        +{{ employee.asset_types.length - 3 }}
                      </span>
                    </template>
                    <span v-else class="text-[11px] text-[#94A3B8]">Aset IT</span>
                  </div>
                </td>

                <!-- Total Aset Badge -->
                <td class="py-3.5 px-4 text-center min-w-[110px]">
                  <span
                    class="inline-flex items-center justify-center rounded-full bg-[#EFF6FF] px-2.5 py-0.5 text-[11px] font-bold text-[#2563EB] border border-[#BFDBFE]/60"
                  >
                    {{ employee.jumlah_aset || 0 }} Aset
                  </span>
                </td>

                <!-- Last Assignment Date -->
                <td class="py-3.5 px-4 text-[#64748B] min-w-[140px]">
                  <span class="text-xs font-medium">{{
                    formatDate(employee.last_assignment_date)
                  }}</span>
                </td>

                <!-- Action Chevron -->
                <td class="py-3.5 pr-5 pl-4 text-right min-w-[50px]">
                  <span
                    class="material-symbols-outlined text-[18px] text-[#94A3B8] group-hover:text-[#2563EB] group-hover:translate-x-0.5 transition-all"
                    >chevron_right</span
                  >
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <AppPagination
          v-if="!isLoadingEmployees && !employeeError && employeesWithAssets.length > 0"
          v-model:currentPage="currentPageEmployees"
          :total-items="filteredEmployees.length"
          :items-per-page="itemsPerPage"
        />
      </div>
    </template>

    <!-- ═══════════════════════════════════════════════════════════════════════
         LEVEL 2 — EMPLOYEE ASSET DETAIL
    ════════════════════════════════════════════════════════════════════════ -->
    <template v-else-if="currentLevel === 2 && selectedEmployee">
      <!-- Interactive Breadcrumb & Back Navigation -->
      <div class="flex items-center justify-between gap-3">
        <nav class="flex items-center gap-2 text-xs" aria-label="Breadcrumb">
          <button
            v-if="isAdmin"
            type="button"
            @click="goToLevel1"
            class="font-medium text-[#64748B] hover:text-[#2563EB] transition-colors"
          >
            Aset Karyawan
          </button>
          <span v-else class="font-medium text-[#64748B]">Aset Saya</span>
          <span class="material-symbols-outlined text-[14px] text-[#CBD5E1]">chevron_right</span>
          <span class="font-bold text-[#0F172A]">{{ selectedEmployee.nama_karyawan }}</span>
        </nav>

        <button
          v-if="isAdmin"
          type="button"
          @click="goToLevel1"
          class="flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-semibold text-[#475569] hover:bg-[#F8FAFC] hover:text-[#0F172A] transition-all cursor-pointer shadow-2xs"
        >
          <span class="material-symbols-outlined text-[16px]">arrow_back</span>
          <span>Kembali ke Daftar</span>
        </button>
      </div>

      <!-- Employee Hero Profile Identity Header -->
      <div
        class="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-2xs flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div class="flex items-center gap-4 min-w-0">
          <div
            class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] text-sm font-bold text-white shadow-2xs"
          >
            {{ getInitials(selectedEmployee.nama_karyawan) }}
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2.5 flex-wrap">
              <h2 class="text-lg font-bold text-[#0F172A] tracking-tight truncate">
                {{ selectedEmployee.nama_karyawan }}
              </h2>
              <AppBadge
                v-if="selectedEmployee.status_karyawan || selectedEmployee.status"
                :type="
                  (selectedEmployee.status_karyawan || selectedEmployee.status) === 'Active'
                    ? 'success'
                    : 'warning'
                "
                :text="selectedEmployee.status_karyawan || selectedEmployee.status"
              />
            </div>
            <p class="text-xs font-medium text-[#475569] mt-0.5 truncate">
              {{ selectedEmployee.jabatan || selectedEmployee.title || 'Staff' }}
            </p>
            <div class="mt-1.5 flex flex-wrap items-center gap-x-3 text-xs text-[#64748B]">
              <span class="font-mono font-medium text-[#0F172A]"
                >NIK: {{ selectedEmployee.nik }}</span
              >
              <span>·</span>
              <span>{{ selectedEmployee.departemen || '—' }}</span>
              <span v-if="selectedEmployee.lokasi_kerja"
                >· {{ selectedEmployee.lokasi_kerja }}</span
              >
              <span v-if="selectedEmployee.email_kantor"
                >· {{ selectedEmployee.email_kantor }}</span
              >
            </div>
          </div>
        </div>

        <!-- Employee Summary Stat Badges -->
        <div class="flex items-center gap-3 shrink-0 border-t border-[#F1F5F9] pt-3 sm:border-t-0 sm:pt-0">
          <div class="rounded-lg bg-[#F8FAFC] px-3.5 py-2 border border-[#E2E8F0] text-right">
            <span class="block text-[10px] font-semibold uppercase text-[#64748B]">Total Aset</span>
            <span class="text-base font-bold text-[#2563EB] mt-0.5 block">{{ myAssets.length }} Unit</span>
          </div>
          <div class="rounded-lg bg-[#F8FAFC] px-3.5 py-2 border border-[#E2E8F0] text-right">
            <span class="block text-[10px] font-semibold uppercase text-[#64748B]">Penugasan Awal</span>
            <span class="text-xs font-semibold text-[#0F172A] mt-1 block">{{ employeeAssignedSince }}</span>
          </div>
        </div>
      </div>

      <!-- Section: Assigned Assets -->
      <div class="flex flex-col gap-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-[20px] text-[#2563EB]">inventory_2</span>
            <h3 class="text-sm font-bold text-[#0F172A]">Aset Terassigned</h3>
            <span class="rounded-full bg-[#EFF6FF] px-2.5 py-0.5 text-xs font-bold text-[#2563EB]">
              {{ myAssets.length }}
            </span>
          </div>

          <!-- Quick Search Assets inside Employee -->
          <div v-if="myAssets.length > 0" class="relative min-w-[200px]">
            <span
              class="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-[#94A3B8] pointer-events-none"
              >search</span
            >
            <input
              v-model="assetSearch"
              type="search"
              placeholder="Cari label / serial..."
              class="h-8 w-full rounded-lg border border-[#E2E8F0] bg-white pl-8 pr-2.5 text-xs text-[#0F172A] focus:border-[#2563EB] focus:outline-none shadow-2xs"
            />
          </div>
        </div>

        <!-- Loading Assets -->
        <div
          v-if="isLoadingAssets"
          class="flex flex-col items-center justify-center py-12 text-[#64748B] rounded-xl border border-[#E2E8F0] bg-white"
        >
          <div
            class="h-6 w-6 animate-spin rounded-full border-2 border-[#2563EB] border-t-transparent mb-2"
          ></div>
          <p class="text-xs font-semibold">Memuat aset terassigned...</p>
        </div>

        <!-- Error Assets -->
        <div v-else-if="assetError" class="p-6 text-center text-rose-600 text-xs rounded-xl border border-[#E2E8F0] bg-white">
          <p class="font-semibold">{{ assetError }}</p>
          <button
            type="button"
            @click="goToLevel2(selectedEmployee)"
            class="mt-1 font-bold underline cursor-pointer"
          >
            Coba lagi
          </button>
        </div>

        <!-- Empty State -->
        <div
          v-else-if="myAssets.length === 0"
          class="flex flex-col items-center justify-center gap-2 py-12 px-4 text-center rounded-xl border border-[#E2E8F0] bg-white"
        >
          <span class="material-symbols-outlined text-[32px] text-[#CBD5E1]">devices_off</span>
          <h4 class="text-sm font-semibold text-[#0F172A]">Belum Ada Aset Terassigned</h4>
          <p class="max-w-xs text-xs text-[#64748B]">
            Tidak ada aset IT yang terdaftar atas nama {{ selectedEmployee.nama_karyawan }}.
          </p>
        </div>

        <!-- Assigned Asset Cards Grid -->
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div
            v-for="asset in paginatedAssets"
            :key="asset.id_aset"
            @click="goToLevel3(asset)"
            class="group relative flex flex-col justify-between rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-2xs hover:border-[#2563EB] hover:shadow-md transition-all duration-200 cursor-pointer"
          >
            <div>
              <!-- Top Row: Device Icon & Status Pill -->
              <div class="flex items-center justify-between gap-2 mb-3">
                <div
                  class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB]"
                >
                  <span class="material-symbols-outlined text-[20px]">{{
                    getDeviceIcon(asset.tipe_perangkat)
                  }}</span>
                </div>
                <span
                  class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold border transition-all select-none"
                  :class="[
                    formatStatusPill(asset.status_aset).bg,
                    formatStatusPill(asset.status_aset).text,
                    formatStatusPill(asset.status_aset).border,
                  ]"
                >
                  <span
                    class="h-1.5 w-1.5 rounded-full shrink-0"
                    :class="formatStatusPill(asset.status_aset).dot"
                  ></span>
                  {{ formatStatusPill(asset.status_aset).label }}
                </span>
              </div>

              <!-- Asset Label & Serial Number -->
              <h4
                class="text-sm font-bold text-[#0F172A] leading-snug group-hover:text-[#2563EB] transition-colors truncate"
              >
                {{ asset.label_aset || [asset.merek, asset.model].filter(Boolean).join(' ') || 'Aset IT' }}
              </h4>
              <div class="mt-1 flex items-center justify-between text-xs text-[#64748B]">
                <span class="font-mono font-medium">SN: {{ asset.nomor_seri || '—' }}</span>
                <span class="font-mono text-[11px] text-[#94A3B8]">AST-IT-{{ String(asset.id_aset).padStart(5, '0') }}</span>
              </div>

              <!-- Specs Grid -->
              <div class="mt-3 pt-3 border-t border-[#F1F5F9] grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span class="block text-[10px] font-semibold uppercase text-[#94A3B8]">Tipe</span>
                  <span class="font-medium text-[#1E293B] truncate block mt-0.5">{{
                    asset.tipe_perangkat || '—'
                  }}</span>
                </div>
                <div>
                  <span class="block text-[10px] font-semibold uppercase text-[#94A3B8]">Merek / Model</span>
                  <span class="font-medium text-[#1E293B] truncate block mt-0.5">{{
                    [asset.merek, asset.model].filter(Boolean).join(' ') || '—'
                  }}</span>
                </div>
              </div>
            </div>

            <!-- Bottom Trigger link -->
            <div
              class="mt-4 pt-3 border-t border-[#F1F5F9] flex items-center justify-between text-xs font-semibold text-[#2563EB]"
            >
              <span>Lihat Audit History</span>
              <span
                class="material-symbols-outlined text-[16px] group-hover:translate-x-1 transition-transform"
                >arrow_forward</span
              >
            </div>
          </div>
        </div>

        <AppPagination
          v-if="!isLoadingAssets && !assetError && myAssets.length > 0"
          v-model:currentPage="currentPageAssets"
          :total-items="filteredAssets.length"
          :items-per-page="itemsPerPage"
        />
      </div>
    </template>

    <!-- ═══════════════════════════════════════════════════════════════════════
         LEVEL 3 — ASSET DETAIL + AUDIT HISTORY
    ════════════════════════════════════════════════════════════════════════ -->
    <template v-else-if="currentLevel === 3 && selectedAsset && selectedEmployee">
      <!-- Breadcrumb Navigation -->
      <div class="flex items-center justify-between gap-3">
        <nav class="flex items-center gap-2 text-xs" aria-label="Breadcrumb">
          <button
            v-if="isAdmin"
            type="button"
            @click="goToLevel1"
            class="font-medium text-[#64748B] hover:text-[#2563EB] transition-colors"
          >
            Aset Karyawan
          </button>
          <button
            type="button"
            @click="currentLevel = 2"
            class="font-medium text-[#64748B] hover:text-[#2563EB] transition-colors"
          >
            {{ selectedEmployee.nama_karyawan }}
          </button>
          <span class="material-symbols-outlined text-[14px] text-[#CBD5E1]">chevron_right</span>
          <span class="font-bold text-[#0F172A]">{{
            selectedAsset.label_aset || selectedAsset.nomor_seri
          }}</span>
          <span class="material-symbols-outlined text-[14px] text-[#CBD5E1]">chevron_right</span>
          <span class="font-semibold text-[#64748B]">Audit History</span>
        </nav>

        <button
          type="button"
          @click="currentLevel = 2"
          class="flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-semibold text-[#475569] hover:bg-[#F8FAFC] hover:text-[#0F172A] transition-all cursor-pointer shadow-2xs"
        >
          <span class="material-symbols-outlined text-[16px]">arrow_back</span>
          <span>Kembali ke Detail Karyawan</span>
        </button>
      </div>

      <!-- Asset Title Header Banner -->
      <div
        class="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div class="flex items-center gap-4 min-w-0">
          <div
            class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB]"
          >
            <span class="material-symbols-outlined text-[24px]">{{
              getDeviceIcon(selectedAsset.tipe_perangkat)
            }}</span>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2.5 flex-wrap">
              <h2 class="text-lg font-bold text-[#0F172A] tracking-tight truncate">
                {{
                  selectedAsset.label_aset ||
                  [selectedAsset.merek, selectedAsset.model].filter(Boolean).join(' ') ||
                  'Aset IT'
                }}
              </h2>
              <AppBadge
                :type="getStatusBadgeType(selectedAsset.status_aset)"
                :text="selectedAsset.status_aset || 'In Use'"
              />
            </div>
            <div class="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-[#64748B]">
              <span class="font-mono font-medium text-[#0F172A]"
                >Asset ID: AST-IT-{{ String(selectedAsset.id_aset).padStart(5, '0') }}</span
              >
              <span>·</span>
              <span class="font-mono">SN: {{ selectedAsset.nomor_seri || '—' }}</span>
              <span>·</span>
              <span>Pemegang: <strong class="text-[#0F172A]">{{ selectedEmployee.nama_karyawan }}</strong></span>
            </div>
          </div>
        </div>

        <button
          type="button"
          @click="openSpecification(selectedAsset)"
          class="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2 text-xs font-semibold text-[#2563EB] hover:bg-[#EFF6FF] cursor-pointer transition-colors"
        >
          <span class="material-symbols-outlined text-[16px]">description</span>
          <span>Lihat Spesifikasi</span>
        </button>
      </div>

      <!-- Main Two-Column View: Specs Grid (Left) & Audit Timeline (Right) -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <!-- LEFT COLUMN: Asset Metadata Grid (lg:col-span-6) -->
        <div class="lg:col-span-6 flex flex-col gap-4">
          <!-- Information Card -->
          <div class="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-2xs">
            <div class="flex items-center gap-2 pb-3 mb-3 border-b border-[#F1F5F9]">
              <span class="material-symbols-outlined text-[18px] text-[#2563EB]">info</span>
              <h3 class="text-xs font-bold uppercase tracking-wider text-[#0F172A]">Informasi Perangkat</h3>
            </div>

            <dl class="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
              <div>
                <dt class="text-[10px] font-semibold uppercase text-[#94A3B8]">Tipe Perangkat</dt>
                <dd class="mt-0.5 font-semibold text-[#0F172A]">
                  {{ selectedAsset.tipe_perangkat || '—' }}
                </dd>
              </div>

              <div>
                <dt class="text-[10px] font-semibold uppercase text-[#94A3B8]">Brand / Merek</dt>
                <dd class="mt-0.5 font-semibold text-[#0F172A]">
                  {{ selectedAsset.merek || '—' }}
                </dd>
              </div>

              <div>
                <dt class="text-[10px] font-semibold uppercase text-[#94A3B8]">Model</dt>
                <dd class="mt-0.5 font-semibold text-[#0F172A]">
                  {{ selectedAsset.model || '—' }}
                </dd>
              </div>

              <div>
                <dt class="text-[10px] font-semibold uppercase text-[#94A3B8]">Serial Number</dt>
                <dd class="mt-0.5 font-mono font-medium text-[#0F172A]">
                  {{ selectedAsset.nomor_seri || '—' }}
                </dd>
              </div>

              <div>
                <dt class="text-[10px] font-semibold uppercase text-[#94A3B8]">Kode / ID Aset</dt>
                <dd class="mt-0.5 font-mono font-medium text-[#0F172A]">
                  AST-IT-{{ String(selectedAsset.id_aset).padStart(5, '0') }}
                </dd>
              </div>

              <div>
                <dt class="text-[10px] font-semibold uppercase text-[#94A3B8]">Lokasi Aset</dt>
                <dd class="mt-0.5 font-semibold text-[#0F172A]">
                  {{ selectedAsset.lokasi_aset || selectedEmployee.lokasi_kerja || '—' }}
                </dd>
              </div>

              <div>
                <dt class="text-[10px] font-semibold uppercase text-[#94A3B8]">Status Pemakaian</dt>
                <dd class="mt-0.5">
                  <AppBadge
                    :type="getStatusBadgeType(selectedAsset.status_aset)"
                    :text="selectedAsset.status_aset || '—'"
                  />
                </dd>
              </div>

              <div>
                <dt class="text-[10px] font-semibold uppercase text-[#94A3B8]">Kondisi Perangkat</dt>
                <dd class="mt-0.5 font-semibold text-[#0F172A]">
                  {{ selectedAsset.kondisi_aset || 'Normal' }}
                </dd>
              </div>
            </dl>
          </div>

          <!-- Current Holder Identity Card -->
          <div class="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-2xs">
            <div class="flex items-center justify-between pb-3 mb-3 border-b border-[#F1F5F9]">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-[18px] text-[#059669]">person_pin</span>
                <h3 class="text-xs font-bold uppercase tracking-wider text-[#0F172A]">Pemegang Aktif saat ini</h3>
              </div>
              <span class="rounded-full bg-[#ECFDF5] px-2.5 py-0.5 text-[10px] font-semibold text-[#059669]"
                >Active Holder</span
              >
            </div>

            <div class="flex items-center gap-3">
              <div
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] text-xs font-bold text-white shadow-2xs"
              >
                {{ getInitials(selectedEmployee.nama_karyawan) }}
              </div>
              <div class="min-w-0 flex-1 text-xs">
                <h4 class="font-bold text-[#0F172A] truncate">
                  {{ selectedEmployee.nama_karyawan }}
                </h4>
                <p class="text-[#64748B] font-medium text-[11px] truncate">
                  {{ selectedEmployee.jabatan || 'Staff' }} · {{ selectedEmployee.departemen || '—' }}
                </p>
                <p class="font-mono text-[11px] text-[#94A3B8] mt-0.5">NIK: {{ selectedEmployee.nik }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- RIGHT COLUMN: Modern SaaS Audit Timeline (lg:col-span-6) -->
        <div class="lg:col-span-6 rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-2xs">
          <div class="flex items-center justify-between pb-3 mb-4 border-b border-[#F1F5F9]">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-[18px] text-[#7C3AED]">history</span>
              <h3 class="text-xs font-bold uppercase tracking-wider text-[#0F172A]">Audit Timeline & Log History</h3>
            </div>
            <span class="text-[11px] font-semibold text-[#64748B]"
              >{{ assetHistoryTimeline.length }} Peristiwa</span
            >
          </div>

          <!-- Loading logs indicator -->
          <div v-if="isLoadingLogs" class="py-8 text-center text-xs text-[#64748B]">
            <div class="h-5 w-5 animate-spin rounded-full border-2 border-[#7C3AED] border-t-transparent mx-auto mb-2"></div>
            Memuat riwayat log...
          </div>

          <!-- Audit Timeline Activity Stream -->
          <div v-else class="relative border-l border-[#E2E8F0] pl-4 ml-3 space-y-4">
            <div
              v-for="(log, idx) in assetHistoryTimeline"
              :key="idx"
              class="relative group"
            >
              <!-- Timeline Node Dot -->
              <div
                class="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white ring-2 ring-white"
                :class="[
                  log.type === 'assignment'
                    ? 'bg-[#2563EB]'
                    : log.type === 'relocation'
                      ? 'bg-[#D97706]'
                      : log.type === 'creation'
                        ? 'bg-[#059669]'
                        : 'bg-[#7C3AED]',
                ]"
              ></div>

              <!-- Log Item Card -->
              <div class="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-xs">
                <div class="flex items-center justify-between gap-2 text-[10.5px] text-[#64748B] mb-1">
                  <span class="font-medium">{{ formatDateTime(log.date) }}</span>
                  <span class="font-semibold text-[#475569]">Oleh: {{ log.actor }}</span>
                </div>

                <h4 class="font-bold text-[#0F172A] leading-snug">
                  {{ log.action }}
                </h4>

                <p class="text-[11px] text-[#475569] mt-1 leading-relaxed">
                  {{ log.detail }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ── Modal Spesifikasi Perangkat ── -->
    <AppModal
      :is-open="showSpecificationModal"
      title="Spesifikasi Perangkat"
      size="md"
      @close="closeModal"
    >
      <div v-if="activeModalAsset" class="space-y-4">
        <div class="flex items-center gap-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
          <div
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB]"
          >
            <span class="material-symbols-outlined text-[20px]">{{
              getDeviceIcon(activeModalAsset.tipe_perangkat)
            }}</span>
          </div>
          <div class="min-w-0">
            <h4 class="font-bold text-xs text-[#0F172A] truncate">
              {{ activeModalAsset.label_aset || activeModalAsset.merek || 'Aset IT' }}
            </h4>
            <p class="font-mono text-[11px] text-[#64748B] mt-0.5">
              SN: {{ activeModalAsset.nomor_seri || '—' }}
            </p>
          </div>
        </div>

        <div>
          <label class="block text-[11px] font-semibold uppercase text-[#64748B] mb-1.5">
            Spesifikasi Detail
          </label>
          <div
            class="min-h-24 whitespace-pre-wrap rounded-lg border border-[#E2E8F0] bg-white p-3 text-xs text-[#1E293B] leading-relaxed"
          >
            {{ activeModalAsset.spesifikasi || 'Belum ada catatan spesifikasi detail untuk perangkat ini.' }}
          </div>
        </div>

        <div class="flex justify-end border-t border-[#E2E8F0] pt-3">
          <button
            type="button"
            class="h-8 rounded-lg bg-[#2563EB] px-4 text-xs font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer transition-colors"
            @click="closeModal"
          >
            Tutup
          </button>
        </div>
      </div>
    </AppModal>
  </div>
</template>
