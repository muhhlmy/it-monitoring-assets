<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useApi } from '../composables/useApi.js'
import { useAuth } from '../composables/useAuth.js'
import { formatStatusPill, getAssetStatusLabel } from '../utils/assetStatus.js'
import AppModal from '../components/ui/AppModal.vue'
import AppBadge from '../components/ui/AppBadge.vue'
import AppRowActions from '../components/ui/AppRowActions.vue'
import AppPagination from '../components/ui/AppPagination.vue'

const { get } = useApi()
const { isAdmin, isSuperAdmin, user } = useAuth()

// ── State Level Navigasi (1 = Daftar Karyawan, 2 = Detail Aset Karyawan, 3 = Detail & History Aset) ──
const currentLevel = ref(isAdmin.value ? 1 : 2)

// ── State: Data Karyawan & Aset ───────────────────────────────────────────────
const employees = ref([])
const isLoadingEmployees = ref(false)
const employeeError = ref('')
const employeeSearch = ref('')
const filterDepartemen = ref('')
const filterLokasi = ref('')

// State Karyawan & Aset Terpilih
const selectedEmployee = ref(!isAdmin.value ? { nama_karyawan: user.value?.nama || 'Saya', nik: user.value?.nik || '' } : null)
const selectedAsset = ref(null)

const myAssets = ref([])
const isLoadingAssets = ref(false)
const assetError = ref('')
const assetSearch = ref('')
const filterTipe = ref('')

const showDetailsModal = ref(false)
const showSpecificationModal = ref(false)
const activeModalAsset = ref(null)

// State Device Cycle & Real Audit Logs
const deviceCycle = ref([])
const realAssetLogs = ref([])
const isLoadingCycle = ref(false)
const isLoadingLogs = ref(false)

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

// ── Computed Level 1: Filter & Pagination Karyawan ────────────────────────────
const departemenOptions = computed(() => {
  const deps = [...new Set(employees.value.map(e => e.departemen).filter(Boolean))]
  return deps.sort()
})

const lokasiOptions = computed(() => {
  const locs = [...new Set(employees.value.map(e => e.lokasi_kerja).filter(Boolean))]
  return locs.sort()
})

const currentPageEmployees = ref(1)
const currentPageAssets    = ref(1)
const itemsPerPage         = ref(10)

watch([employeeSearch, filterDepartemen, filterLokasi], () => {
  currentPageEmployees.value = 1
})

watch([assetSearch, filterTipe, selectedEmployee], () => {
  currentPageAssets.value = 1
})

const filteredEmployees = computed(() => {
  const q = employeeSearch.value.trim().toLocaleLowerCase('id-ID')
  return employees.value.filter(e => {
    const text = [e.nik, e.nama_karyawan, e.email_kantor, e.departemen, e.jabatan, e.lokasi_kerja]
      .join(' ').toLocaleLowerCase('id-ID')
    return (!q || text.includes(q))
      && (!filterDepartemen.value || e.departemen === filterDepartemen.value)
      && (!filterLokasi.value || e.lokasi_kerja === filterLokasi.value)
  })
})

const paginatedEmployees = computed(() => {
  const start = (currentPageEmployees.value - 1) * itemsPerPage.value
  return filteredEmployees.value.slice(start, start + itemsPerPage.value)
})

const totalWithAssets = computed(() =>
  employees.value.filter(e => parseInt(e.jumlah_aset || 0) > 0).length
)

const totalAssignedAssetsCount = computed(() =>
  employees.value.reduce((acc, e) => acc + (parseInt(e.jumlah_aset || 0) || 0), 0)
)

// ── Computed Level 2: Filter & Pagination Aset ────────────────────────────────
const filteredAssets = computed(() => {
  const q = assetSearch.value.trim().toLocaleLowerCase('id-ID')
  return myAssets.value.filter(asset => {
    const text = [
      asset.id_aset, asset.nomor_seri, asset.label_aset, asset.spesifikasi,
      asset.lokasi_aset, asset.tipe_perangkat, asset.merek, asset.model,
      asset.status_aset, asset.kondisi_aset,
    ].join(' ').toLocaleLowerCase('id-ID')
    return (!q || text.includes(q))
      && (!filterTipe.value || asset.tipe_perangkat === filterTipe.value)
  })
})

const paginatedAssets = computed(() => {
  const start = (currentPageAssets.value - 1) * itemsPerPage.value
  return filteredAssets.value.slice(start, start + itemsPerPage.value)
})

const availableTipeOptions = computed(() =>
  [...new Set(myAssets.value.map(a => a.tipe_perangkat).filter(Boolean))]
)

// ── Computed Level 3: Audit & History Log Timeline (Synchronized with Real Logs) ──
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
      let actionTitle = log.aksi === 'TAMBAH' ? 'Aset Didaftarkan' : log.aksi === 'UBAH' ? 'Perubahan Data Aset' : 'Aset Dihapus'
      
      if (log.aksi === 'TAMBAH') {
        icon = 'add_circle'
        type = 'creation'
      } else if (log.aksi === 'HAPUS') {
        icon = 'delete'
        type = 'deletion'
      } else if (log.perubahan?.includes('NIK Pemegang') || log.perubahan?.includes('nama_karyawan')) {
        icon = 'person_add'
        type = 'assignment'
        actionTitle = 'Penugasan Aset Diperbarui'
      }

      list.push({
        date: log.dibuat_pada || log.created_at,
        action: actionTitle,
        actor: log.oleh_pengguna || log.nama_user || log.username || 'Sistem',
        status: log.aksi,
        detail: log.perubahan || 'Perubahan data aset',
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
      action: `Aset dialokasikan kepada ${emp?.nama_karyawan || 'Karyawan'}`,
      actor: 'Admin IT System',
      status: c.status_pemakaian || 'Aktif',
      detail: `Catatan Penugasan: ${c.catatan || 'Aset aktif digunakan'}`,
      icon: 'assignment_ind',
      type: 'assignment',
    })
    if (c.tanggal_selesai) {
      list.push({
        date: c.tanggal_selesai,
        action: 'Penugasan aset selesai / dikembalikan',
        actor: 'Admin IT System',
        status: 'Selesai',
        detail: 'Aset dikembalikan ke stok gudang',
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
      actor: 'Sistem',
      status: asset.status_aset || 'Digunakan',
      detail: `Pemegang: ${emp?.nama_karyawan || 'Karyawan'} (NIK: ${emp?.nik || '—'})`,
      icon: 'person_add',
      type: 'assignment',
    })
  }

  return list.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
})

// ── Navigasi Level ─────────────────────────────────────────────────────────────
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

// ── Methods Fetching ───────────────────────────────────────────────────────────
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
    const assetData = await get('/api/assets/my-assets')
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

function resetAssetFilters() {
  assetSearch.value = ''
  filterTipe.value = ''
}

// ── Modal Helpers ──────────────────────────────────────────────────────────────
async function openDetails(asset) {
  activeModalAsset.value = asset
  showDetailsModal.value = true
  await fetchAssetLogs(asset.id_aset || asset.id)
}

function openSpecification(asset) {
  activeModalAsset.value = asset
  showSpecificationModal.value = true
}

function closeModal() {
  showDetailsModal.value = false
  showSpecificationModal.value = false
  activeModalAsset.value = null
}

function getStatusBadgeType(status) {
  const s = (status || '').toLowerCase()
  if (['digunakan', 'in use'].includes(s)) return 'success'
  if (['tersedia', 'stock'].includes(s)) return 'info'
  if (['maintenance', 'need service'].includes(s)) return 'warning'
  if (['rusak', 'damaged'].includes(s)) return 'danger'
  if (['disposal'].includes(s)) return 'default'
  return 'default'
}

function getDeviceIcon(type) {
  const v = (type || '').toLowerCase()
  if (v.includes('laptop')) return 'laptop'
  if (v.includes('server')) return 'dns'
  if (v.includes('printer')) return 'print'
  if (v.includes('monitor')) return 'monitor'
  if (v.includes('network')) return 'router'
  return 'computer'
}

function getInitials(name) {
  return (name || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function getAvatarGradient(index) {
  const palettes = [
    'from-[#5D87FF] to-[#4570EA]',
    'from-[#00B5D8] to-[#00829B]',
    'from-[#13DEB9] to-[#0EAD90]',
    'from-[#FFAE1F] to-[#D98E0D]',
    'from-[#7C3AED] to-[#5B21B6]',
    'from-[#0891B2] to-[#155E75]',
    'from-[#4F46E5] to-[#3730A3]',
    'from-[#059669] to-[#064E3B]',
  ]
  return palettes[index % palettes.length]
}

function formatDurasi(mulai, selesai) {
  if (!mulai) return ''
  const start = new Date(mulai)
  const end = selesai ? new Date(selesai) : new Date()
  const diffMs = end - start
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (days < 1) return 'Kurang dari 1 hari'
  if (days < 30) return `${days} hari`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} bulan`
  const years = Math.floor(months / 12)
  const remMonths = months % 12
  return remMonths > 0 ? `${years} thn ${remMonths} bln` : `${years} tahun`
}

function formatDate(iso) {
  if (!iso) return '-'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function getMyAssetActions(asset) {
  return [
    {
      label: 'Lihat Detail & History',
      icon: 'timeline',
      onClick: () => goToLevel3(asset),
    },
    {
      label: 'Lihat Spesifikasi',
      icon: 'description',
      onClick: () => openSpecification(asset),
    },
  ]
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
  <div class="flex min-w-0 flex-col gap-3.5">

    <!-- ═══════════════════════════════════════════════════════════════════════
         LEVEL 1 — DAFTAR KARYAWAN (Listing Karyawan & Total Aset)
    ════════════════════════════════════════════════════════════════════════ -->
    <template v-if="currentLevel === 1">

      <!-- Header & Summary Metrics -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 class="text-[16px] font-extrabold text-[#2A3547] leading-tight">Aset Karyawan</h2>
          <p class="mt-0.5 text-[11px] font-medium text-[#7C8BAC]">
            Daftar karyawan dan aset IT yang sedang mereka pegang.
          </p>
        </div>

        <!-- Summary Metrics Cards -->
        <div v-if="isAdmin" class="flex items-center gap-2 shrink-0">
          <div class="flex items-center gap-2 rounded-xl border border-[#E5EAEF] bg-white px-3 py-1.5 shadow-xs">
            <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-[#ECF2FF] text-[#5D87FF]">
              <span class="material-symbols-outlined text-[16px]">group</span>
            </span>
            <div>
              <p class="font-num text-[15px] font-extrabold leading-none text-[#2A3547]">{{ employees.length }}</p>
              <p class="text-[9px] font-bold uppercase tracking-wider text-[#7C8BAC]">Total Karyawan</p>
            </div>
          </div>

          <div class="flex items-center gap-2 rounded-xl border border-[#E5EAEF] bg-white px-3 py-1.5 shadow-xs">
            <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EDFBF7] text-[#13DEB9]">
              <span class="material-symbols-outlined text-[16px]">badge</span>
            </span>
            <div>
              <p class="font-num text-[15px] font-extrabold leading-none text-[#2A3547]">{{ totalWithAssets }}</p>
              <p class="text-[9px] font-bold uppercase tracking-wider text-[#7C8BAC]">Punya Aset</p>
            </div>
          </div>

          <div class="flex items-center gap-2 rounded-xl border border-[#E5EAEF] bg-white px-3 py-1.5 shadow-xs">
            <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-[#E8F7FF] text-[#49BEFF]">
              <span class="material-symbols-outlined text-[16px]">devices</span>
            </span>
            <div>
              <p class="font-num text-[15px] font-extrabold leading-none text-[#2A3547]">{{ totalAssignedAssetsCount }}</p>
              <p class="text-[9px] font-bold uppercase tracking-wider text-[#7C8BAC]">Aset Ditugaskan</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Filter Bar Level 1 -->
      <div v-if="isAdmin" class="shadow-xs rounded-xl border border-[#E5EAEF] bg-white p-2.5">
        <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div class="relative flex-1 min-w-0">
            <label for="emp-search" class="sr-only">Cari karyawan</label>
            <span class="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-[#7C8BAC] pointer-events-none">search</span>
            <input
              id="emp-search"
              v-model="employeeSearch"
              type="search"
              autocomplete="off"
              placeholder="Cari nama, NIK, jabatan, email..."
              class="h-8 w-full rounded-lg border border-[#E5EAEF] bg-[#F8FAFC] pl-8 pr-3 text-[11px] font-medium text-[#2A3547] focus:outline-none focus:border-[#5D87FF]"
            />
          </div>

          <select
            v-model="filterDepartemen"
            aria-label="Filter departemen"
            class="h-8 rounded-lg border border-[#E5EAEF] bg-white px-2.5 text-[11px] font-semibold text-[#2A3547] focus:outline-none"
          >
            <option value="">Semua Departemen</option>
            <option v-for="dep in departemenOptions" :key="dep" :value="dep">{{ dep }}</option>
          </select>

          <select
            v-model="filterLokasi"
            aria-label="Filter lokasi"
            class="h-8 rounded-lg border border-[#E5EAEF] bg-white px-2.5 text-[11px] font-semibold text-[#2A3547] focus:outline-none"
          >
            <option value="">Semua Lokasi</option>
            <option v-for="loc in lokasiOptions" :key="loc" :value="loc">{{ loc }}</option>
          </select>

          <button
            v-if="employeeSearch || filterDepartemen || filterLokasi"
            type="button"
            @click="resetEmployeeFilters"
            class="h-8 rounded-lg border border-[#FDEDE8] bg-[#FDEDE8] px-3 text-[11px] font-bold text-[#FA896B] hover:bg-[#FA896B] hover:text-white transition-all cursor-pointer"
          >
            Reset
          </button>
        </div>
      </div>

      <!-- Tabel List Karyawan -->
      <div class="shadow-xs overflow-hidden rounded-xl border border-[#E5EAEF] bg-white">
        <!-- Loading -->
        <div v-if="isLoadingEmployees" class="flex flex-col items-center justify-center py-12 text-[#7C8BAC]">
          <div class="h-6 w-6 animate-spin rounded-full border-2 border-[#5D87FF] border-t-transparent mb-2"></div>
          <p class="text-[11px] font-semibold">Memuat daftar karyawan...</p>
        </div>

        <!-- Error -->
        <div v-else-if="employeeError" class="p-4 text-center text-rose-600 text-[11px]">
          <p class="font-bold">{{ employeeError }}</p>
          <button type="button" @click="fetchEmployees" class="mt-1 font-bold underline">Coba lagi</button>
        </div>

        <!-- Empty Filter -->
        <div v-else-if="filteredEmployees.length === 0" class="p-12 text-center text-[#7C8BAC]">
          <span class="material-symbols-outlined text-[36px] text-[#CBD5E1]">person_search</span>
          <p class="mt-1 font-bold text-[12px]">Tidak Ada Karyawan</p>
          <p class="text-[10px]">Coba sesuaikan kata kunci pencarian atau filter.</p>
        </div>

        <!-- Table -->
        <div v-else class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-[#E5EAEF] bg-[#F8FAFC] text-[10px] font-bold uppercase text-[#7C8BAC]">
                <th class="py-2.5 px-3.5">Karyawan</th>
                <th class="py-2.5 px-3.5">Jabatan</th>
                <th class="py-2.5 px-3.5">Departemen</th>
                <th class="py-2.5 px-3.5">Lokasi Kerja</th>
                <th class="py-2.5 px-3.5">Status</th>
                <th class="py-2.5 px-3.5 text-center">Total Aset</th>
                <th class="py-2.5 px-3.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[#F1F5F9] text-[11px]">
              <tr
                v-for="(employee, idx) in paginatedEmployees"
                :key="employee.id_karyawan || employee.nik"
                @click="goToLevel2(employee)"
                class="hover:bg-[#F8FAFC] transition-colors cursor-pointer group"
              >
                <!-- Avatar & Nama -->
                <td class="py-2.5 px-3.5">
                  <div class="flex items-center gap-2.5">
                    <div
                      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-[11px] font-extrabold text-white shadow-xs"
                      :class="getAvatarGradient(idx)"
                    >
                      {{ getInitials(employee.nama_karyawan) }}
                    </div>
                    <div>
                      <p class="font-bold text-[#2A3547] group-hover:text-[#5D87FF] transition-colors leading-tight">
                        {{ employee.nama_karyawan }}
                      </p>
                      <p class="font-mono text-[9.5px] text-[#94A3B8]">NIK: {{ employee.nik }}</p>
                    </div>
                  </div>
                </td>

                <td class="py-2.5 px-3.5 font-medium text-[#2A3547]">{{ employee.jabatan || '—' }}</td>
                <td class="py-2.5 px-3.5 font-medium text-[#2A3547]">{{ employee.departemen || '—' }}</td>
                <td class="py-2.5 px-3.5 font-medium text-[#2A3547]">{{ employee.lokasi_kerja || '—' }}</td>
                <td class="py-2.5 px-3.5">
                  <AppBadge
                    v-if="employee.status_karyawan || employee.status"
                    :type="(employee.status_karyawan || employee.status) === 'Active' ? 'success' : (employee.status_karyawan || employee.status) === 'Outsource' ? 'warning' : 'danger'"
                    :text="employee.status_karyawan || employee.status"
                  />
                  <span v-else class="text-[#94A3B8]">—</span>
                </td>

                <!-- Total Aset Badge Prominent -->
                <td class="py-2.5 px-3.5 text-center">
                  <span
                    class="inline-flex h-6 min-w-[32px] items-center justify-center rounded-full px-2 text-[10px] font-extrabold shadow-xs transition-transform group-hover:scale-105"
                    :class="
                      parseInt(employee.jumlah_aset || 0) > 0
                        ? 'bg-[#5D87FF] text-white'
                        : 'bg-gray-100 text-gray-400'
                    "
                  >
                    {{ employee.jumlah_aset || 0 }} ASET
                  </span>
                </td>

                <td class="py-2.5 px-3.5 text-right">
                  <button
                    type="button"
                    class="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[#7C8BAC] group-hover:bg-[#ECF2FF] group-hover:text-[#5D87FF] transition-all"
                  >
                    <span class="material-symbols-outlined text-[16px]">chevron_right</span>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <AppPagination
          v-if="!isLoadingEmployees && !employeeError && employees.length > 0"
          v-model:currentPage="currentPageEmployees"
          :total-items="filteredEmployees.length"
          :items-per-page="itemsPerPage"
        />
      </div>
    </template>

    <!-- ═══════════════════════════════════════════════════════════════════════
         LEVEL 2 — DETAIL ASET MILIK KARYAWAN
    ════════════════════════════════════════════════════════════════════════ -->
    <template v-else-if="currentLevel === 2 && selectedEmployee">

      <!-- Breadcrumb & Back Button -->
      <div class="flex items-center gap-2">
        <button
          v-if="isAdmin"
          type="button"
          @click="goToLevel1"
          class="flex h-7 items-center gap-1 rounded-lg border border-[#E5EAEF] bg-white px-2.5 text-[11px] font-bold text-[#7C8BAC] hover:border-[#5D87FF] hover:bg-[#ECF2FF] hover:text-[#5D87FF] transition-all cursor-pointer shadow-2xs"
        >
          <span class="material-symbols-outlined text-[15px]">arrow_back</span>
          <span>Kembali ke Daftar Karyawan</span>
        </button>

        <nav class="flex items-center gap-1.5 text-[11px]" aria-label="Breadcrumb">
          <button v-if="isAdmin" type="button" @click="goToLevel1" class="font-semibold text-[#7C8BAC] hover:text-[#5D87FF]">
            Aset Karyawan
          </button>
          <span v-else class="font-semibold text-[#7C8BAC]">Aset Saya</span>
          <span class="material-symbols-outlined text-[13px] text-[#94A3B8]">chevron_right</span>
          <span class="font-bold text-[#2A3547]">{{ selectedEmployee.nama_karyawan }}</span>
        </nav>
      </div>

      <!-- Employee Profile Banner -->
      <div class="shadow-xs flex items-center justify-between gap-3.5 rounded-xl border border-[#E5EAEF] bg-white p-3.5">
        <div class="flex items-center gap-3 min-w-0">
          <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#5D87FF] to-[#4570EA] text-[14px] font-extrabold text-white shadow-md shadow-blue-500/20">
            {{ getInitials(selectedEmployee.nama_karyawan) }}
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <h3 class="truncate text-[15px] font-extrabold text-[#2A3547] leading-tight">{{ selectedEmployee.nama_karyawan }}</h3>
              <AppBadge
                v-if="selectedEmployee.status_karyawan || selectedEmployee.status"
                :type="(selectedEmployee.status_karyawan || selectedEmployee.status) === 'Active' ? 'success' : (selectedEmployee.status_karyawan || selectedEmployee.status) === 'Outsource' ? 'warning' : 'danger'"
                :text="selectedEmployee.status_karyawan || selectedEmployee.status"
              />
            </div>
            <p class="mt-0.5 truncate text-[11px] font-medium text-[#7C8BAC]">{{ selectedEmployee.jabatan || selectedEmployee.title || '—' }}</p>
            <div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[#94A3B8]">
              <span class="font-mono font-bold text-[#2A3547]">NIK: {{ selectedEmployee.nik }}</span>
              <span>·</span>
              <span>{{ selectedEmployee.departemen || '—' }}</span>
              <span v-if="selectedEmployee.lokasi_kerja">· {{ selectedEmployee.lokasi_kerja }}</span>
              <span v-if="selectedEmployee.email_kantor">· {{ selectedEmployee.email_kantor }}</span>
            </div>
          </div>
        </div>

        <div class="shrink-0 text-right">
          <p class="font-num text-[24px] font-extrabold leading-none text-[#5D87FF]">{{ myAssets.length }}</p>
          <p class="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-[#7C8BAC]">Aset Ditugaskan</p>
        </div>
      </div>

      <!-- Section: Aset yang Dimiliki -->
      <div class="shadow-xs overflow-hidden rounded-xl border border-[#E5EAEF] bg-white">
        <!-- Section Header & Filter -->
        <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 border-b border-[#E5EAEF] bg-[#F8FAFC] p-2.5">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-[18px] text-[#5D87FF]">devices</span>
            <h4 class="text-[12px] font-bold text-[#2A3547]">Aset yang Dimiliki</h4>
            <span class="rounded-full bg-[#ECF2FF] px-2 py-0.2 text-[10px] font-extrabold text-[#5D87FF]">
              {{ myAssets.length }}
            </span>
          </div>

          <div class="flex items-center gap-2 flex-wrap">
            <div class="relative min-w-[160px]">
              <span class="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-[15px] text-[#94A3B8] pointer-events-none">search</span>
              <input
                v-model="assetSearch"
                type="search"
                placeholder="Cari label / serial..."
                class="h-7 w-full rounded-md border border-[#E5EAEF] bg-white pl-7 pr-2 text-[11px] font-medium text-[#2A3547] focus:outline-none focus:border-[#5D87FF]"
              />
            </div>
            <select
              v-model="filterTipe"
              class="h-7 rounded-md border border-[#E5EAEF] bg-white px-2 text-[11px] font-semibold text-[#2A3547] focus:outline-none"
            >
              <option value="">Semua Tipe</option>
              <option v-for="tipe in availableTipeOptions" :key="tipe" :value="tipe">{{ tipe }}</option>
            </select>
          </div>
        </div>

        <!-- Loading Assets -->
        <div v-if="isLoadingAssets" class="flex flex-col items-center justify-center py-12 text-[#7C8BAC]">
          <div class="h-6 w-6 animate-spin rounded-full border-2 border-[#5D87FF] border-t-transparent mb-2"></div>
          <p class="text-[11px] font-semibold">Memuat aset karyawan...</p>
        </div>

        <!-- Error Assets -->
        <div v-else-if="assetError" class="p-4 text-center text-rose-600 text-[11px]">
          <p class="font-bold">{{ assetError }}</p>
          <button type="button" @click="goToLevel2(selectedEmployee)" class="mt-1 font-bold underline">Coba lagi</button>
        </div>

        <!-- INTENTIONAL EMPTY STATE -->
        <div v-else-if="myAssets.length === 0" class="flex flex-col items-center justify-center gap-2.5 py-12 px-4 text-center">
          <div class="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F8FAFC] text-[#94A3B8] border border-[#E5EAEF]">
            <span class="material-symbols-outlined text-[24px]">devices_off</span>
          </div>
          <h4 class="text-[13px] font-bold text-[#2A3547]">Aset Belum Ditugaskan</h4>
          <p class="max-w-xs text-[10.5px] font-medium text-[#7C8BAC]">
            Belum ada aset IT yang ditugaskan kepada {{ selectedEmployee.nama_karyawan }}.
          </p>
        </div>

        <!-- Asset Table Level 2 -->
        <div v-else class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-[#E5EAEF] bg-[#F8FAFC] text-[10px] font-bold uppercase text-[#7C8BAC]">
                <th class="py-2.5 px-3.5">Asset & Label</th>
                <th class="py-2.5 px-3.5">Serial Number</th>
                <th class="py-2.5 px-3.5">Tipe Perangkat</th>
                <th class="py-2.5 px-3.5">Spesifikasi Singkat</th>
                <th class="py-2.5 px-3.5">Status</th>
                <th class="py-2.5 px-3.5">Kondisi</th>
                <th class="py-2.5 px-3.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[#F1F5F9] text-[11px]">
              <tr
                v-for="asset in paginatedAssets"
                :key="asset.id_aset"
                @click="goToLevel3(asset)"
                class="hover:bg-[#F8FAFC] transition-colors cursor-pointer group"
              >
                <td class="py-2.5 px-3.5">
                  <div class="flex items-center gap-2.5">
                    <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#ECF2FF] text-[#5D87FF]">
                      <span class="material-symbols-outlined text-[16px]">{{ getDeviceIcon(asset.tipe_perangkat) }}</span>
                    </span>
                    <div>
                      <p class="font-bold text-[#2A3547] group-hover:text-[#5D87FF] transition-colors leading-tight">
                        {{ asset.label_aset || asset.merek || 'Aset IT' }}
                      </p>
                      <p class="text-[9.5px] text-[#7C8BAC]">ID: #{{ asset.id_aset }}</p>
                    </div>
                  </div>
                </td>

                <td class="py-2.5 px-3.5 font-mono font-bold text-[#2A3547]">{{ asset.nomor_seri || '—' }}</td>
                <td class="py-2.5 px-3.5 font-medium text-[#2A3547]">{{ asset.tipe_perangkat || '—' }}</td>
                <td class="py-2.5 px-3.5 text-[#2A3547]">
                  <p class="font-bold">{{ [asset.merek, asset.model].filter(Boolean).join(' ') || '—' }}</p>
                </td>
                <td class="py-2.5 px-3.5">
                  <span
                    class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-all select-none"
                    :class="[formatStatusPill(asset.status_aset).bg, formatStatusPill(asset.status_aset).text, formatStatusPill(asset.status_aset).border]"
                  >
                    <span class="h-1.5 w-1.5 rounded-full shrink-0" :class="formatStatusPill(asset.status_aset).dot"></span>
                    {{ formatStatusPill(asset.status_aset).label }}
                  </span>
                </td>
                <td class="py-2.5 px-3.5 font-semibold text-[#2A3547]">{{ asset.kondisi_aset || '—' }}</td>

                <td class="py-2.5 px-3.5 text-right">
                  <button
                    type="button"
                    class="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[#7C8BAC] group-hover:bg-[#ECF2FF] group-hover:text-[#5D87FF] transition-all"
                  >
                    <span class="material-symbols-outlined text-[16px]">chevron_right</span>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
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
         LEVEL 3 — DETAIL ASET + AUDIT HISTORY LOG
    ════════════════════════════════════════════════════════════════════════ -->
    <template v-else-if="currentLevel === 3 && selectedAsset && selectedEmployee">

      <!-- Breadcrumb & Back Button -->
      <div class="flex items-center gap-2">
        <button
          type="button"
          @click="currentLevel = 2"
          class="flex h-7 items-center gap-1 rounded-lg border border-[#E5EAEF] bg-white px-2.5 text-[11px] font-bold text-[#7C8BAC] hover:border-[#5D87FF] hover:bg-[#ECF2FF] hover:text-[#5D87FF] transition-all cursor-pointer shadow-2xs"
        >
          <span class="material-symbols-outlined text-[15px]">arrow_back</span>
          <span>Kembali ke Detail Karyawan</span>
        </button>

        <nav class="flex items-center gap-1.5 text-[11px]" aria-label="Breadcrumb">
          <button v-if="isAdmin" type="button" @click="goToLevel1" class="font-semibold text-[#7C8BAC] hover:text-[#5D87FF]">
            Aset Karyawan
          </button>
          <button type="button" @click="currentLevel = 2" class="font-semibold text-[#7C8BAC] hover:text-[#5D87FF]">
            {{ selectedEmployee.nama_karyawan }}
          </button>
          <span class="material-symbols-outlined text-[13px] text-[#94A3B8]">chevron_right</span>
          <span class="font-bold text-[#2A3547]">{{ selectedAsset.label_aset || selectedAsset.nomor_seri }}</span>
        </nav>
      </div>

      <!-- Asset Title Card Header -->
      <div class="shadow-xs flex items-center justify-between gap-3.5 rounded-xl border border-[#E5EAEF] bg-white p-3.5">
        <div class="flex items-center gap-3 min-w-0">
          <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#5D87FF] text-white shadow-md shadow-blue-500/20">
            <span class="material-symbols-outlined text-[22px]">{{ getDeviceIcon(selectedAsset.tipe_perangkat) }}</span>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <h3 class="truncate text-[16px] font-extrabold text-[#2A3547] leading-tight">
                {{ selectedAsset.label_aset || [selectedAsset.merek, selectedAsset.model].filter(Boolean).join(' ') || 'Aset IT' }}
              </h3>
              <AppBadge :type="getStatusBadgeType(selectedAsset.status_aset)" :text="selectedAsset.status_aset || '—'" />
            </div>
            <div class="mt-1 flex flex-wrap items-center gap-x-2 text-[10.5px] text-[#94A3B8]">
              <span class="font-mono font-bold text-[#2A3547]">Serial: {{ selectedAsset.nomor_seri || '—' }}</span>
              <span>·</span>
              <span>ID: #{{ selectedAsset.id_aset }}</span>
              <span>·</span>
              <span>Tipe: {{ selectedAsset.tipe_perangkat || '—' }}</span>
            </div>
          </div>
        </div>

        <div class="shrink-0 flex items-center gap-1.5">
          <button
            type="button"
            @click="openSpecification(selectedAsset)"
            class="h-8 inline-flex items-center gap-1 rounded-lg border border-[#E5EAEF] bg-[#F8FAFC] px-3 text-[11px] font-bold text-[#5D87FF] hover:bg-[#ECF2FF] cursor-pointer"
          >
            <span class="material-symbols-outlined text-[16px]">description</span> Spesifikasi
          </button>
        </div>
      </div>

      <!-- Level 3 Grid Layout (Left: Asset & Assignment Info, Right: Audit History Log) -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">

        <!-- LEFT COLUMN (lg:col-span-7) -->
        <div class="lg:col-span-7 flex flex-col gap-3.5">
          
          <!-- Asset Information Section -->
          <div class="shadow-xs rounded-xl border border-[#E5EAEF] bg-white overflow-hidden">
            <div class="flex items-center gap-2 border-b border-[#E5EAEF] bg-[#F8FAFC] px-3.5 py-2.5 text-[11px] font-bold text-[#2A3547]">
              <span class="material-symbols-outlined text-[16px] text-[#5D87FF]">info</span>
              <span>Asset Information</span>
            </div>

            <dl class="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 text-[11px]">
              <div>
                <dt class="text-[9.5px] font-bold uppercase text-[#7C8BAC]">Label Aset</dt>
                <dd class="mt-0.5 font-bold text-[#2A3547]">{{ selectedAsset.label_aset || '—' }}</dd>
              </div>

              <div>
                <dt class="text-[9.5px] font-bold uppercase text-[#7C8BAC]">Serial Number</dt>
                <dd class="mt-0.5 font-mono font-bold text-[#2A3547]">{{ selectedAsset.nomor_seri || '—' }}</dd>
              </div>

              <div>
                <dt class="text-[9.5px] font-bold uppercase text-[#7C8BAC]">Tipe Perangkat</dt>
                <dd class="mt-0.5 font-semibold text-[#2A3547]">{{ selectedAsset.tipe_perangkat || '—' }}</dd>
              </div>

              <div>
                <dt class="text-[9.5px] font-bold uppercase text-[#7C8BAC]">Brand / Merek</dt>
                <dd class="mt-0.5 font-semibold text-[#2A3547]">{{ selectedAsset.merek || '—' }}</dd>
              </div>

              <div>
                <dt class="text-[9.5px] font-bold uppercase text-[#7C8BAC]">Model</dt>
                <dd class="mt-0.5 font-semibold text-[#2A3547]">{{ selectedAsset.model || '—' }}</dd>
              </div>

              <div>
                <dt class="text-[9.5px] font-bold uppercase text-[#7C8BAC]">Lokasi Aset</dt>
                <dd class="mt-0.5 font-semibold text-[#2A3547]">{{ selectedAsset.lokasi_aset || selectedAsset.lokasi_kerja || '—' }}</dd>
              </div>

              <div>
                <dt class="text-[9.5px] font-bold uppercase text-[#7C8BAC]">Status Aset</dt>
                <dd class="mt-0.5">
                  <AppBadge :type="getStatusBadgeType(selectedAsset.status_aset)" :text="selectedAsset.status_aset || '—'" />
                </dd>
              </div>

              <div>
                <dt class="text-[9.5px] font-bold uppercase text-[#7C8BAC]">Kondisi Aset</dt>
                <dd class="mt-0.5 font-semibold text-[#2A3547]">{{ selectedAsset.kondisi_aset || '—' }}</dd>
              </div>
            </dl>

            <div v-if="selectedAsset.spesifikasi" class="border-t border-[#F1F5F9] p-3.5">
              <p class="text-[9.5px] font-bold uppercase text-[#7C8BAC] mb-1">Spesifikasi Detail</p>
              <p class="whitespace-pre-wrap rounded-lg bg-[#F8FAFC] p-2.5 text-[11px] text-[#2A3547] border border-[#E5EAEF]">
                {{ selectedAsset.spesifikasi }}
              </p>
            </div>
          </div>

          <!-- Current Assignment Section -->
          <div class="shadow-xs rounded-xl border border-[#E5EAEF] bg-white overflow-hidden">
            <div class="flex items-center justify-between border-b border-[#E5EAEF] bg-[#F8FAFC] px-3.5 py-2.5 text-[11px] font-bold text-[#2A3547]">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-[16px] text-[#5D87FF]">person_pin</span>
                <span>Current Assignment</span>
              </div>
              <span class="inline-flex rounded-full bg-[#ECFDF5] px-2 py-0.2 text-[9.5px] font-bold text-[#059669]">Active Holder</span>
            </div>

            <div class="p-3.5 flex items-center gap-3">
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#5D87FF] to-[#4570EA] text-[13px] font-extrabold text-white shadow-xs">
                {{ getInitials(selectedEmployee.nama_karyawan) }}
              </div>
              <div class="min-w-0 flex-1 text-[11px]">
                <h4 class="font-bold text-[#2A3547] text-[13px] leading-tight">{{ selectedEmployee.nama_karyawan }}</h4>
                <p class="text-[#7C8BAC] font-medium mt-0.5">{{ selectedEmployee.jabatan || '—' }}</p>
                <div class="mt-1 flex flex-wrap items-center gap-x-2 text-[10px] text-[#94A3B8]">
                  <span class="font-mono font-bold text-[#2A3547]">NIK: {{ selectedEmployee.nik }}</span>
                  <span>·</span>
                  <span>{{ selectedEmployee.departemen || '—' }}</span>
                  <span v-if="selectedEmployee.lokasi_kerja">· {{ selectedEmployee.lokasi_kerja }}</span>
                </div>
              </div>
            </div>
          </div>

        </div>

        <!-- RIGHT COLUMN: AUDIT / HISTORY LOG (lg:col-span-5) -->
        <div class="lg:col-span-5 shadow-xs rounded-xl border border-[#E5EAEF] bg-white overflow-hidden">
          <div class="flex items-center justify-between border-b border-[#E5EAEF] bg-[#F8FAFC] px-3.5 py-2.5 text-[11px] font-bold text-[#2A3547]">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-[16px] text-[#7C3AED]">history</span>
              <span>Audit History Log</span>
            </div>
            <span class="text-[9.5px] font-semibold text-[#7C8BAC]">{{ assetHistoryTimeline.length }} Riwayat</span>
          </div>

          <div class="p-4">
            <!-- Timeline Container -->
            <div class="relative border-l-2 border-[#E5EAEF] pl-4 ml-2 space-y-4">
              <div
                v-for="(log, idx) in assetHistoryTimeline"
                :key="idx"
                class="relative group"
              >
                <!-- Timeline Dot Indicator -->
                <div
                  class="absolute -left-[23px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white ring-2 ring-white"
                  :class="[
                    log.type === 'assignment' ? 'text-[#5D87FF]' :
                    log.type === 'status_change' ? 'text-[#13DEB9]' : 'text-[#7C3AED]'
                  ]"
                >
                  <span class="h-2 w-2 rounded-full" :class="[
                    log.type === 'assignment' ? 'bg-[#5D87FF]' :
                    log.type === 'status_change' ? 'bg-[#13DEB9]' : 'bg-[#7C3AED]'
                  ]"></span>
                </div>

                <!-- Log Content Card -->
                <div class="rounded-lg border border-[#F1F5F9] bg-[#F8FAFC] p-2.5 transition-all hover:border-[#E5EAEF]">
                  <div class="flex items-center justify-between gap-2 text-[9.5px] text-[#94A3B8] font-semibold mb-1">
                    <span>{{ formatDate(log.date) }}</span>
                    <span class="text-[#7C8BAC]">Oleh: {{ log.actor }}</span>
                  </div>

                  <h5 class="text-[11px] font-bold text-[#2A3547] leading-tight">
                    {{ log.action }}
                  </h5>

                  <p class="text-[10px] font-medium text-[#7C8BAC] mt-1">
                    {{ log.detail }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

    </template>

    <!-- ── Modal Detail Aset RAW ── -->
    <AppModal :is-open="showDetailsModal" title="Detail Aset" size="lg" @close="closeModal">
      <div v-if="activeModalAsset" class="flex flex-col gap-3">
        <div class="flex items-center gap-2.5 pb-2 border-b border-[#E5EAEF]">
          <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-[#5D87FF] text-white">
            <span class="material-symbols-outlined text-[20px]">{{ getDeviceIcon(activeModalAsset.tipe_perangkat) }}</span>
          </div>
          <div>
            <p class="text-[9.5px] font-bold uppercase text-[#5D87FF]">ID #{{ activeModalAsset.id_aset }}</p>
            <h4 class="text-[15px] font-extrabold text-[#2A3547] leading-tight">{{ activeModalAsset.label_aset }}</h4>
          </div>
        </div>
        <dl class="grid grid-cols-1 gap-3 rounded-xl border border-[#E5EAEF] bg-[#F8FAFC] p-3 sm:grid-cols-2">
          <div v-for="item in [
            ['Nomor Seri', activeModalAsset.nomor_seri],
            ['Tipe Perangkat', activeModalAsset.tipe_perangkat],
            ['Merek', activeModalAsset.merek],
            ['Model', activeModalAsset.model],
            ['Status Aset', activeModalAsset.status_aset],
            ['Kondisi Aset', activeModalAsset.kondisi_aset],
            ['Lokasi Aset', activeModalAsset.lokasi_aset || activeModalAsset.lokasi_kerja],
          ]" :key="item[0]">
            <dt class="text-[9.5px] font-bold uppercase text-[#7C8BAC]">{{ item[0] }}</dt>
            <dd class="mt-0.5 text-[12px] font-semibold text-[#2A3547]">{{ item[1] || '—' }}</dd>
          </div>
        </dl>
        <div class="flex justify-end border-t border-[#E5EAEF] pt-3 mt-1">
          <button type="button" @click="closeModal" class="h-8 rounded-lg bg-[#2A3547] px-4 text-[11px] font-bold text-white cursor-pointer">Tutup</button>
        </div>
      </div>
    </AppModal>

    <!-- ── Modal Spesifikasi ── -->
    <AppModal :is-open="showSpecificationModal" title="Detail Spesifikasi" size="md" @close="closeModal">
      <div v-if="activeModalAsset" class="space-y-3">
        <div class="flex items-center gap-2.5 rounded-xl border border-[#E5EAEF] bg-[#F8FAFC] p-3">
          <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#ECF2FF] text-[#5D87FF]">
            <span class="material-symbols-outlined text-[18px]">{{ getDeviceIcon(activeModalAsset.tipe_perangkat) }}</span>
          </div>
          <div class="min-w-0">
            <p class="truncate font-mono text-[11px] font-bold text-[#2A3547]">{{ activeModalAsset.nomor_seri || '—' }}</p>
            <p class="mt-0.5 truncate text-[9.5px] font-semibold text-[#7C8BAC]">{{ activeModalAsset.label_aset }}</p>
          </div>
        </div>
        <div>
          <p class="mb-1.5 text-[9.5px] font-bold uppercase tracking-wider text-[#7C8BAC]">Spesifikasi Perangkat</p>
          <div class="min-h-24 whitespace-pre-wrap rounded-xl border border-[#E5EAEF] bg-white p-3 text-[11px] font-medium leading-5 text-[#2A3547]">
            {{ activeModalAsset.spesifikasi || 'Belum ada informasi spesifikasi untuk aset ini.' }}
          </div>
        </div>
        <div class="flex justify-end border-t border-[#E5EAEF] pt-3">
          <button type="button" class="h-8 rounded-lg bg-[#5D87FF] px-4 text-[11px] font-bold text-white hover:bg-[#4570EA] cursor-pointer" @click="closeModal">Tutup</button>
        </div>
      </div>
    </AppModal>

  </div>
</template>
