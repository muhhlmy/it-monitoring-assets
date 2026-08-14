<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useApi } from '../composables/useApi.js'
import { useAuth } from '../composables/useAuth.js'
import AppModal from '../components/ui/AppModal.vue'
import AppBadge from '../components/ui/AppBadge.vue'
import AppRowActions from '../components/ui/AppRowActions.vue'
import AppPagination from '../components/ui/AppPagination.vue'

const { get } = useApi()
const { isAdmin, isSuperAdmin, user } = useAuth()

// ── Tampilan: 'list' = daftar karyawan, 'detail' = aset karyawan terpilih
const view = ref(isAdmin.value ? 'list' : 'detail')

// ── State: Daftar Karyawan ─────────────────────────────────────────────────────
const employees = ref([])
const isLoadingEmployees = ref(false)
const employeeError = ref('')
const employeeSearch = ref('')
const filterDepartemen = ref('')
const filterLokasi = ref('')

// ── State: Aset Karyawan Terpilih ─────────────────────────────────────────────
// Jika role user, 'selectedEmployee' adalah diri mereka sendiri
const selectedEmployee = ref(!isAdmin.value ? { nama_karyawan: user.value?.nama || 'Saya', nik: user.value?.nik || '' } : null)
const myAssets = ref([])
const isLoadingAssets = ref(false)
const assetError = ref('')
const assetSearch = ref('')
const filterTipe = ref('')
const showDetailsModal = ref(false)
const showSpecificationModal = ref(false)
const selectedAsset = ref(null)
const detailTab = ref('assets') // 'assets' | 'cycle'

// ── State: Device Cycle ────────────────────────────────────────────────────────
const deviceCycle = ref([])
const isLoadingCycle = ref(false)
const cycleError = ref('')

// ── Computed: Daftar Karyawan ──────────────────────────────────────────────────
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

const paginatedEmployees = computed(() => {
  const start = (currentPageEmployees.value - 1) * itemsPerPage.value
  return filteredEmployees.value.slice(start, start + itemsPerPage.value)
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

const totalWithAssets = computed(() =>
  employees.value.filter(e => parseInt(e.jumlah_aset) > 0).length
)

// ── Computed: Aset Karyawan Terpilih ──────────────────────────────────────────
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

const assetStats = computed(() => ({
  digunakan: myAssets.value.filter(a => ['digunakan', 'in use'].includes((a.status_aset || '').toLowerCase())).length,
  maintenance: myAssets.value.filter(a => ['maintenance', 'need service', 'rusak', 'damaged'].includes((a.status_aset || '').toLowerCase())).length,
  types: availableTipeOptions.value.length,
}))

// ── Methods: Karyawan ──────────────────────────────────────────────────────────
async function fetchEmployees() {
  if (!isAdmin.value) return // Non-admin tidak boleh ambil data semua karyawan

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
    myAssets.value = Array.isArray(assetData) ? assetData : []
  } catch (err) {
    assetError.value = err.message || 'Gagal memuat data aset Anda.'
  } finally {
    isLoadingAssets.value = false
  }
}

async function selectEmployee(employee) {
  if (!isAdmin.value) return // Mencegah non-admin berpindah karyawan

  selectedEmployee.value = employee
  view.value = 'detail'
  detailTab.value = 'assets'
  assetSearch.value = ''
  filterTipe.value = ''
  myAssets.value = []
  deviceCycle.value = []
  assetError.value = ''
  cycleError.value = ''

  isLoadingAssets.value = true
  try {
    const assetData = await get(`/api/assets/my?nik=${encodeURIComponent(employee.nik)}`)
    myAssets.value = Array.isArray(assetData) ? assetData : []

    // Fetch cycle HANYA jika pengguna adalah Admin / Super Admin
    if ((isAdmin.value || isSuperAdmin.value) && employee?.nik) {
      isLoadingCycle.value = true
      try {
        const cycleData = await get(`/api/assets/cycle/${encodeURIComponent(employee.nik)}`)
        deviceCycle.value = Array.isArray(cycleData) ? cycleData : []
      } catch {
        deviceCycle.value = []
      } finally {
        isLoadingCycle.value = false
      }
    }
  } catch (err) {
    assetError.value = err.message || 'Gagal memuat data karyawan.'
  } finally {
    isLoadingAssets.value = false
  }
}

onMounted(() => {
  if (isAdmin.value) {
    fetchEmployees()
  } else {
    loadMyOwnAssets()
  }
})

function backToList() {
  if (!isAdmin.value) return // Non-admin tidak bisa kembali ke daftar karyawan
  
  view.value = 'list'
  selectedEmployee.value = null
  myAssets.value = []
  deviceCycle.value = []
  assetError.value = ''
  cycleError.value = ''
  detailTab.value = 'assets'
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

// ── Methods: Modal Aset ────────────────────────────────────────────────────────
function openDetails(asset) {
  selectedAsset.value = asset
  showDetailsModal.value = true
}

function openSpecification(asset) {
  selectedAsset.value = asset
  showSpecificationModal.value = true
}

function closeModal() {
  showDetailsModal.value = false
  showSpecificationModal.value = false
  selectedAsset.value = null
}

// ── Helpers ────────────────────────────────────────────────────────────────────
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
    'from-[#0188EA] to-[#0252B3]',
    'from-[#7C3AED] to-[#5B21B6]',
    'from-[#0B9B6C] to-[#065F46]',
    'from-[#D97706] to-[#92400E]',
    'from-[#DC2626] to-[#991B1B]',
    'from-[#0891B2] to-[#155E75]',
    'from-[#4F46E5] to-[#3730A3]',
    'from-[#059669] to-[#064E3B]',
  ]
  return palettes[index % palettes.length]
}

// Hitung durasi pemakaian perangkat
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

function getMyAssetActions(asset) {
  return [
    {
      label: 'Lihat Detail Aset',
      icon: 'visibility',
      onClick: () => openDetails(asset),
    },
    {
      label: 'Lihat Spesifikasi',
      icon: 'description',
      onClick: () => openSpecification(asset),
    },
  ]
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-5">

    <!-- ═══════════════════════════════════════════════════════════════════════
         VIEW 1: DAFTAR KARYAWAN
    ════════════════════════════════════════════════════════════════════════ -->
    <template v-if="view === 'list'">

      <!-- Page Header -->
      <div class="flex items-center justify-between gap-4">
        <div>
          <h2 class="text-[18px] font-extrabold text-[#172033]">Aset Karyawan</h2>
          <p class="mt-0.5 text-[12px] text-[#94A3B8]">
            Pilih karyawan untuk melihat daftar aset yang di-assign kepada mereka.
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-2 rounded-2xl border border-[#E8EDF3] bg-white px-4 py-2 shadow-card">
          <span class="material-symbols-outlined text-[18px] text-brand">group</span>
          <div class="text-right">
            <p class="font-num text-[18px] font-extrabold leading-none text-[#172033]">{{ employees.length }}</p>
            <p class="text-[9px] font-bold uppercase tracking-widest text-[#94A3B8]">Total Karyawan</p>
          </div>
          <div class="mx-2 h-8 w-px bg-[#E8EDF3]"></div>
          <span class="material-symbols-outlined text-[18px] text-[#0B9B6C]">devices</span>
          <div class="text-right">
            <p class="font-num text-[18px] font-extrabold leading-none text-[#172033]">{{ totalWithAssets }}</p>
            <p class="text-[9px] font-bold uppercase tracking-widest text-[#94A3B8]">Punya Aset</p>
          </div>
        </div>
      </div>

      <!-- Filter Bar -->
      <div class="shadow-card grid min-w-0 grid-cols-2 items-center gap-3 rounded-2xl border border-[#E8EDF3] bg-white p-3 sm:flex sm:flex-wrap">
        <div class="relative col-span-2 min-w-0 sm:min-w-[240px] sm:flex-1">
          <label for="emp-search" class="sr-only">Cari karyawan</label>
          <span class="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-[#9CA3AF] pointer-events-none">search</span>
          <input id="emp-search" v-model="employeeSearch" type="search" autocomplete="off"
            placeholder="Cari nama, NIK, jabatan, email..."
            class="h-10 w-full rounded-xl border border-[#DCE3EC] bg-[#F8FAFC] pl-10 pr-4 text-[12px] font-medium text-[#334155] focus:outline-none focus:border-brand" />
        </div>
        <select v-model="filterDepartemen" aria-label="Filter departemen" class="h-10 min-w-0 rounded-xl border border-[#DCE3EC] bg-white px-3 text-[11px] font-semibold text-[#475569]">
          <option value="">Semua Departemen</option>
          <option v-for="dep in departemenOptions" :key="dep" :value="dep">{{ dep }}</option>
        </select>
        <select v-model="filterLokasi" aria-label="Filter lokasi" class="h-10 min-w-0 rounded-xl border border-[#DCE3EC] bg-white px-3 text-[11px] font-semibold text-[#475569]">
          <option value="">Semua Lokasi</option>
          <option v-for="loc in lokasiOptions" :key="loc" :value="loc">{{ loc }}</option>
        </select>
        <button v-if="employeeSearch || filterDepartemen || filterLokasi" type="button"
          @click="resetEmployeeFilters"
          class="h-10 rounded-xl border border-[#F1D0D0] bg-[#FFF7F7] px-4 text-[11px] font-bold text-[#D94B4B] hover:bg-[#FFEEEE]">
          Reset
        </button>
      </div>

      <!-- Loading -->
      <div v-if="isLoadingEmployees" class="flex items-center justify-center gap-3 py-20 text-[13px] text-[#6B7280]">
        <span class="h-8 w-8 animate-spin rounded-full border-4 border-[#E5E7EB] border-t-brand"></span>
        Memuat data karyawan...
      </div>

      <!-- Error -->
      <div v-else-if="employeeError" role="alert"
        class="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-[13px] text-red-700">
        <span class="material-symbols-outlined text-[20px]">error</span>
        <span class="flex-1">{{ employeeError }}</span>
        <button type="button" class="font-bold underline" @click="fetchEmployees">Coba lagi</button>
      </div>

      <!-- Grid Karyawan -->
      <div v-else class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        <button
          v-for="(employee, idx) in paginatedEmployees"
          :key="employee.id_karyawan"
          type="button"
          @click="selectEmployee(employee)"
          class="group shadow-card relative flex items-center gap-4 overflow-hidden rounded-2xl border border-[#E8EDF3] bg-white p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-[0_8px_24px_rgba(1,104,204,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          :aria-label="`Lihat aset milik ${employee.nama_karyawan}`"
        >
          <!-- Avatar -->
          <div
            class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-[14px] font-extrabold text-white shadow-lg"
            :class="getAvatarGradient(idx)"
          >
            {{ getInitials(employee.nama_karyawan) }}
          </div>

          <!-- Info -->
          <div class="min-w-0 flex-1">
            <p class="truncate text-[13px] font-black text-[#172033] group-hover:text-brand transition-colors">
              {{ employee.nama_karyawan }}
            </p>
            <p class="mt-0.5 truncate text-[10px] font-medium text-[#9CA3AF]">{{ employee.jabatan || '—' }}</p>
            <div class="mt-1.5 flex items-center gap-2 flex-wrap">
              <span class="inline-flex items-center gap-1 rounded-lg bg-[#F1F5F9] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#64748B]">
                <span class="material-symbols-outlined text-[11px]">apartment</span>
                {{ employee.departemen || '—' }}
              </span>
              <span class="inline-flex items-center gap-1 rounded-lg bg-[#F1F5F9] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#64748B]">
                <span class="material-symbols-outlined text-[11px]">location_on</span>
                {{ employee.lokasi_kerja || '—' }}
              </span>
            </div>
          </div>

          <!-- Jumlah Aset Badge -->
          <div class="flex shrink-0 flex-col items-center gap-0.5">
            <span
              class="flex h-9 w-9 items-center justify-center rounded-xl text-[14px] font-extrabold transition-colors"
              :class="parseInt(employee.jumlah_aset) > 0
                ? 'bg-brand-light text-brand group-hover:bg-brand group-hover:text-white'
                : 'bg-[#F1F5F9] text-[#CBD5E1]'"
            >
              {{ employee.jumlah_aset }}
            </span>
            <span class="text-[8px] font-bold uppercase tracking-widest text-[#CBD5E1]">Aset</span>
          </div>

          <!-- Arrow indicator -->
          <span class="material-symbols-outlined absolute right-3 top-3 text-[16px] text-[#CBD5E1] transition-all group-hover:translate-x-0.5 group-hover:text-brand">
            chevron_right
          </span>
        </button>

        <!-- Empty state filter -->
        <div v-if="filteredEmployees.length === 0" class="col-span-full flex flex-col items-center justify-center gap-4 py-16">
          <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F3F4F6] text-[#9CA3AF]">
            <span class="material-symbols-outlined text-[28px]">person_search</span>
          </div>
          <p class="text-[13px] font-semibold text-[#9CA3AF]">Tidak ada karyawan yang cocok dengan filter.</p>
        </div>
      </div>

      <!-- Footer Info -->
      <AppPagination
        v-if="!isLoadingEmployees && !employeeError && employees.length > 0"
        v-model:currentPage="currentPageEmployees"
        :total-items="filteredEmployees.length"
        :items-per-page="itemsPerPage"
      />

    </template>

    <!-- ═══════════════════════════════════════════════════════════════════════
         VIEW 2: ASET KARYAWAN TERPILIH
    ════════════════════════════════════════════════════════════════════════ -->
    <template v-else-if="view === 'detail' && selectedEmployee">

      <!-- Breadcrumb + Back Button -->
      <div class="flex items-center gap-2">
        <button
          type="button"
          @click="backToList"
          class="flex h-9 w-9 items-center justify-center rounded-xl border border-[#E8EDF3] bg-white text-[#64748B] shadow-card transition-all hover:border-brand/30 hover:bg-brand-light hover:text-brand"
          aria-label="Kembali ke daftar karyawan"
        >
          <span class="material-symbols-outlined text-[18px]">arrow_back</span>
        </button>
        <nav class="flex items-center gap-1.5 text-[11px]" aria-label="Breadcrumb">
          <button type="button" @click="backToList" class="font-semibold text-[#94A3B8] hover:text-brand transition-colors">
            Aset Karyawan
          </button>
          <span class="material-symbols-outlined text-[14px] text-[#CBD5E1]">chevron_right</span>
          <span class="font-bold text-[#172033]">{{ selectedEmployee.nama_karyawan }}</span>
        </nav>
      </div>

      <!-- Header Info Karyawan -->
      <div class="shadow-card flex items-center gap-4 rounded-2xl border border-[#E8EDF3] bg-white p-4 sm:p-5">
        <div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0188EA] to-[#0252B3] text-[16px] font-extrabold text-white shadow-lg shadow-blue-900/15">
          {{ getInitials(selectedEmployee.nama_karyawan) }}
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-[10px] font-bold uppercase tracking-widest text-[#94A3B8]">Aset Karyawan</p>
          <p class="text-[16px] font-black text-[#172033]">{{ selectedEmployee.nama_karyawan }}</p>
          <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span class="font-mono text-[11px] text-[#9CA3AF]">{{ selectedEmployee.nik }}</span>
            <span class="text-[#E2E8F0]">·</span>
            <span class="text-[11px] text-[#64748B]">{{ selectedEmployee.jabatan || '—' }}</span>
            <span class="text-[#E2E8F0]">·</span>
            <span class="text-[11px] text-[#64748B]">{{ selectedEmployee.departemen || '—' }}</span>
          </div>
        </div>
        <div class="shrink-0 text-right">
          <p class="font-num text-[30px] font-extrabold leading-none text-[#172033]">{{ myAssets.length }}</p>
          <p class="mt-0.5 text-[9px] font-bold uppercase tracking-widest text-[#94A3B8]">Total Aset</p>
        </div>
      </div>

      <!-- Stats Cards -->
      <div v-if="!isLoadingAssets && (myAssets.length > 0 || deviceCycle.length > 0)" class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div class="shadow-card flex items-center gap-3 rounded-2xl border border-[#E8EDF3] bg-white p-4">
          <span class="flex h-10 w-10 items-center justify-center rounded-[13px] bg-[#ECFDF5] text-[#0B9B6C]">
            <span class="material-symbols-outlined text-[20px]">check_circle</span>
          </span>
          <div>
            <p class="font-num text-[22px] font-extrabold leading-none text-[#172033]">{{ assetStats.digunakan }}</p>
            <p class="mt-1 text-[9px] font-bold uppercase tracking-[0.08em] text-[#94A3B8]">Sedang Digunakan</p>
          </div>
        </div>
        <div class="shadow-card flex items-center gap-3 rounded-2xl border border-[#E8EDF3] bg-white p-4">
          <span class="flex h-10 w-10 items-center justify-center rounded-[13px] bg-[#FFF8E6] text-[#D78A15]">
            <span class="material-symbols-outlined text-[20px]">build</span>
          </span>
          <div>
            <p class="font-num text-[22px] font-extrabold leading-none text-[#172033]">{{ assetStats.maintenance }}</p>
            <p class="mt-1 text-[9px] font-bold uppercase tracking-[0.08em] text-[#94A3B8]">Maintenance</p>
          </div>
        </div>
        <div v-if="isAdmin || isSuperAdmin" class="shadow-card flex items-center gap-3 rounded-2xl border border-[#E8EDF3] bg-white p-4">
          <span class="flex h-10 w-10 items-center justify-center rounded-[13px] bg-[#EDE9FE] text-[#7C3AED]">
            <span class="material-symbols-outlined text-[20px]">history</span>
          </span>
          <div>
            <p class="font-num text-[22px] font-extrabold leading-none text-[#172033]">{{ deviceCycle.length }}</p>
            <p class="mt-1 text-[9px] font-bold uppercase tracking-[0.08em] text-[#94A3B8]">Total Riwayat Perangkat</p>
          </div>
        </div>
      </div>

      <!-- ── Tab Navigation + Content ── -->
      <div class="shadow-card overflow-hidden rounded-[20px] border border-[#E8EDF3] bg-white">

        <!-- Tab Headers -->
        <div class="flex border-b border-[#E8EDF3] bg-[#F8FAFC]">
          <button
            type="button"
            @click="detailTab = 'assets'"
            class="flex items-center gap-2 px-5 py-3.5 text-[12px] font-bold transition-all duration-150 border-b-2 -mb-[1px]"
            :class="detailTab === 'assets'
              ? 'border-brand text-brand bg-white'
              : 'border-transparent text-[#64748B] hover:text-[#172033] hover:bg-white/60'"
          >
            <span class="material-symbols-outlined text-[16px]">devices</span>
            Aset Aktif
            <span class="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-extrabold"
              :class="detailTab === 'assets' ? 'bg-brand/10 text-brand' : 'bg-[#E5E7EB] text-[#6B7280]'">
              {{ myAssets.length }}
            </span>
          </button>
          <button
            v-if="isAdmin || isSuperAdmin"
            type="button"
            @click="detailTab = 'cycle'"
            class="flex items-center gap-2 px-5 py-3.5 text-[12px] font-bold transition-all duration-150 border-b-2 -mb-[1px]"
            :class="detailTab === 'cycle'
              ? 'border-[#7C3AED] text-[#7C3AED] bg-white'
              : 'border-transparent text-[#64748B] hover:text-[#172033] hover:bg-white/60'"
          >
            <span class="material-symbols-outlined text-[16px]">history</span>
            Riwayat Perangkat
            <span class="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-extrabold"
              :class="detailTab === 'cycle' ? 'bg-[#7C3AED]/10 text-[#7C3AED]' : 'bg-[#E5E7EB] text-[#6B7280]'">
              {{ deviceCycle.length }}
            </span>
          </button>
        </div>

        <!-- ══ TAB 1: ASET AKTIF ══ -->
        <template v-if="detailTab === 'assets'">
          <div class="grid min-w-0 grid-cols-2 items-center gap-3 border-b border-[#F3F4F6] p-3 sm:flex sm:flex-wrap">
            <div class="relative col-span-2 min-w-0 sm:min-w-[220px] sm:flex-1">
              <label for="asset-search" class="sr-only">Cari aset</label>
              <span class="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-[#9CA3AF] pointer-events-none">search</span>
              <input id="asset-search" v-model="assetSearch" type="search" autocomplete="off"
                placeholder="Cari label, serial, tipe, merek..."
                class="h-10 w-full rounded-xl border border-[#DCE3EC] bg-[#F8FAFC] pl-10 pr-4 text-[12px] font-medium text-[#334155] focus:outline-none focus:border-brand" />
            </div>
            <select v-model="filterTipe" aria-label="Filter tipe perangkat" class="h-10 min-w-0 rounded-xl border border-[#DCE3EC] bg-white px-3 text-[11px] font-semibold text-[#475569]">
              <option value="">Semua Tipe</option>
              <option v-for="tipe in availableTipeOptions" :key="tipe" :value="tipe">{{ tipe }}</option>
            </select>
            <button v-if="assetSearch || filterTipe" type="button" @click="resetAssetFilters"
              class="h-10 rounded-xl border border-[#F1D0D0] bg-[#FFF7F7] px-4 text-[11px] font-bold text-[#D94B4B] hover:bg-[#FFEEEE]">
              Reset
            </button>
          </div>
          <div v-if="isLoadingAssets" role="status" class="flex items-center justify-center gap-3 py-16 text-[13px] text-[#6B7280]">
            <span class="h-8 w-8 animate-spin rounded-full border-4 border-[#E5E7EB] border-t-brand"></span> Memuat aset...
          </div>
          <div v-else-if="assetError" role="alert" class="flex items-center gap-2 bg-red-50 px-5 py-4 text-[13px] text-red-700">
            <span class="material-symbols-outlined text-[18px]">error</span>
            <span class="flex-1">{{ assetError }}</span>
            <button type="button" class="font-bold underline" @click="selectEmployee(selectedEmployee)">Coba lagi</button>
          </div>
          <div v-else-if="myAssets.length === 0" class="flex flex-col items-center justify-center gap-4 py-16">
            <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F3F4F6] text-[#9CA3AF]">
              <span class="material-symbols-outlined text-[28px]">devices_off</span>
            </div>
            <div class="text-center">
              <p class="text-[13px] font-bold text-[#374151]">Belum ada aset aktif</p>
              <p class="mt-1 text-[11px] text-[#9CA3AF]">{{ selectedEmployee.nama_karyawan }} belum memiliki aset yang dialokasikan.</p>
            </div>
          </div>
          <div v-else class="overflow-x-auto" tabindex="0" :aria-label="`Tabel aset milik ${selectedEmployee.nama_karyawan}`">
            <table class="w-full min-w-[860px]">
              <caption class="sr-only">Daftar aset milik {{ selectedEmployee.nama_karyawan }}</caption>
              <thead class="sticky top-0 z-10"><tr class="border-b border-[#E8EDF3] bg-[#F8FAFC]">
                <th class="px-4 py-3 text-left text-[10px] font-bold uppercase text-[#9CA3AF]">Serial Number / Label</th>
                <th class="px-4 py-3 text-left text-[10px] font-bold uppercase text-[#9CA3AF]">Spesifikasi</th>
                <th class="px-4 py-3 text-left text-[10px] font-bold uppercase text-[#9CA3AF]">Tipe</th>
                <th class="px-4 py-3 text-left text-[10px] font-bold uppercase text-[#9CA3AF]">Lokasi</th>
                <th class="px-4 py-3 text-left text-[10px] font-bold uppercase text-[#9CA3AF]">Status</th>
                <th class="px-4 py-3 text-left text-[10px] font-bold uppercase text-[#9CA3AF]">Kondisi</th>
                <th class="px-4 py-3 text-right text-[10px] font-bold uppercase text-[#9CA3AF]">Aksi</th>
              </tr></thead>
              <tbody class="divide-y divide-[#F9FAFB]">
                <tr v-for="asset in paginatedAssets" :key="asset.id_aset" class="hover:bg-[#F7FAFD]">
                  <td class="px-4 py-3"><div class="flex items-center gap-3">
                    <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
                      <span class="material-symbols-outlined text-[18px]">{{ getDeviceIcon(asset.tipe_perangkat) }}</span>
                    </div>
                    <div>
                      <p class="font-mono text-[11px] font-bold text-[#172033]">{{ asset.nomor_seri || '—' }}</p>
                      <p class="mt-0.5 text-[9px] font-semibold text-[#94A3B8]">{{ asset.label_aset }}</p>
                    </div>
                  </div></td>
                  <td class="px-4 py-3"><div class="flex flex-col gap-1.5">
                    <div v-if="asset.merek || asset.model" class="text-[12px] font-bold text-[#172033]">{{ [asset.merek, asset.model].filter(Boolean).join(' ') }}</div>
                    <button type="button" class="inline-flex h-7 w-fit items-center gap-1 rounded-lg border border-[#CFE3FA] bg-brand-light px-2.5 text-[10px] font-bold text-brand hover:border-brand-dark" @click="openSpecification(asset)">
                      <span class="material-symbols-outlined text-[13px]">description</span> Lihat Spesifikasi
                    </button>
                  </div></td>
                  <td class="px-4 py-3 text-[12px] text-[#374151]">{{ asset.tipe_perangkat || '—' }}</td>
                  <td class="px-4 py-3 text-[12px] text-[#374151]">{{ asset.lokasi_aset || asset.lokasi_kerja || '—' }}</td>
                  <td class="px-4 py-3"><AppBadge :type="getStatusBadgeType(asset.status_aset)" :text="asset.status_aset || '—'" /></td>
                  <td class="px-4 py-3 text-[12px] font-semibold text-[#374151]">{{ asset.kondisi_aset || '—' }}</td>
                  <td class="px-4 py-3 text-right">
                    <AppRowActions :actions="getMyAssetActions(asset)" />
                  </td>
                </tr>
              <tr v-if="filteredAssets.length === 0 && myAssets.length > 0">
                <td colspan="7" class="px-5 py-12 text-center text-[13px] text-[#9CA3AF]">Tidak ada aset yang sesuai filter.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Footer Pagination -->
        <AppPagination
          v-if="!isLoadingAssets && !assetError && myAssets.length > 0"
          v-model:currentPage="currentPageAssets"
          :total-items="filteredAssets.length"
          :items-per-page="itemsPerPage"
        />
        </template>

        <!-- ══ TAB 2: RIWAYAT PERANGKAT ══ -->
        <template v-else-if="detailTab === 'cycle'">
          <div v-if="isLoadingCycle" role="status" class="flex items-center justify-center gap-3 py-16 text-[13px] text-[#6B7280]">
            <span class="h-8 w-8 animate-spin rounded-full border-4 border-[#E5E7EB] border-t-[#7C3AED]"></span> Memuat riwayat perangkat...
          </div>
          <div v-else-if="cycleError" role="alert" class="flex items-center gap-2 bg-red-50 px-5 py-4 text-[13px] text-red-700">
            <span class="material-symbols-outlined text-[18px]">error</span><span class="flex-1">{{ cycleError }}</span>
          </div>
          <div v-else-if="deviceCycle.length === 0" class="flex flex-col items-center justify-center gap-4 py-16">
            <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F3F4F6] text-[#9CA3AF]">
              <span class="material-symbols-outlined text-[28px]">history_toggle_off</span>
            </div>
            <div class="text-center">
              <p class="text-[13px] font-bold text-[#374151]">Belum ada riwayat</p>
              <p class="mt-1 text-[11px] text-[#9CA3AF]">Belum ada siklus perangkat yang tercatat untuk karyawan ini.</p>
            </div>
          </div>
          <div v-else class="overflow-x-auto" tabindex="0" :aria-label="`Riwayat siklus perangkat ${selectedEmployee.nama_karyawan}`">
            <table class="w-full min-w-[960px]">
              <caption class="sr-only">Riwayat siklus perangkat {{ selectedEmployee.nama_karyawan }}</caption>
              <thead class="sticky top-0 z-10"><tr class="border-b border-[#E8EDF3] bg-[#FAF7FF]">
                <th class="px-4 py-3 text-left text-[10px] font-bold uppercase text-[#9CA3AF]">Perangkat</th>
                <th class="px-4 py-3 text-left text-[10px] font-bold uppercase text-[#9CA3AF]">Tipe / Merek</th>
                <th class="px-4 py-3 text-left text-[10px] font-bold uppercase text-[#9CA3AF]">Mulai Digunakan</th>
                <th class="px-4 py-3 text-left text-[10px] font-bold uppercase text-[#9CA3AF]">Selesai Digunakan</th>
                <th class="px-4 py-3 text-left text-[10px] font-bold uppercase text-[#9CA3AF]">Durasi</th>
                <th class="px-4 py-3 text-left text-[10px] font-bold uppercase text-[#9CA3AF]">Status</th>
                <th class="px-4 py-3 text-left text-[10px] font-bold uppercase text-[#9CA3AF]">Keterangan</th>
              </tr></thead>
              <tbody class="divide-y divide-[#F9FAFB]">
                <tr v-for="record in deviceCycle" :key="record.id" class="transition-colors hover:bg-[#FAF7FF]">
                  <td class="px-4 py-3.5">
                    <div class="flex items-center gap-3">
                      <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                        :class="record.status_pemakaian === 'Aktif' ? 'bg-[#EDE9FE] text-[#7C3AED]' : 'bg-[#F1F5F9] text-[#94A3B8]'">
                        <span class="material-symbols-outlined text-[18px]">{{ getDeviceIcon(record.tipe_perangkat) }}</span>
                      </div>
                      <div>
                        <p class="font-mono text-[11px] font-bold text-[#172033]">{{ record.nomor_seri || '—' }}</p>
                        <p class="mt-0.5 text-[9px] font-semibold text-[#94A3B8]">{{ record.label_aset }}</p>
                      </div>
                    </div>
                  </td>
                  <td class="px-4 py-3.5">
                    <p class="text-[11px] font-bold text-[#172033]">{{ record.tipe_perangkat || '—' }}</p>
                    <p class="mt-0.5 text-[10px] text-[#9CA3AF]">{{ [record.merek, record.model].filter(Boolean).join(' · ') || '—' }}</p>
                  </td>
                  <td class="px-4 py-3.5 text-[12px] font-semibold text-[#374151]">{{ formatDate(record.tanggal_mulai) }}</td>
                  <td class="px-4 py-3.5">
                    <p v-if="record.tanggal_selesai" class="text-[12px] font-semibold text-[#374151]">{{ formatDate(record.tanggal_selesai) }}</p>
                    <span v-else class="inline-flex items-center gap-1 rounded-full bg-[#ECFDF5] px-2.5 py-0.5 text-[10px] font-bold text-[#059669]">
                      <span class="h-1.5 w-1.5 rounded-full bg-[#059669] animate-pulse"></span> Sekarang
                    </span>
                  </td>
                  <td class="px-4 py-3.5 text-[11px] font-semibold text-[#475569]">{{ formatDurasi(record.tanggal_mulai, record.tanggal_selesai) }}</td>
                  <td class="px-4 py-3.5">
                    <span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold"
                      :class="record.status_pemakaian === 'Aktif' ? 'bg-[#EDE9FE] text-[#6D28D9]' : 'bg-[#F1F5F9] text-[#64748B]'">
                      <span class="h-1.5 w-1.5 rounded-full" :class="record.status_pemakaian === 'Aktif' ? 'bg-[#7C3AED] animate-pulse' : 'bg-[#94A3B8]'"></span>
                      {{ record.status_pemakaian }}
                    </span>
                  </td>
                  <td class="px-4 py-3.5">
                    <p v-if="record.catatan" class="max-w-[180px] truncate text-[10px] italic text-[#94A3B8]" :title="record.catatan">{{ record.catatan }}</p>
                    <span v-else class="text-[10px] text-[#CBD5E1]">—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="!isLoadingCycle && deviceCycle.length > 0" class="border-t border-[#E8EDF3] bg-[#FAF7FF] px-5 py-3 text-[10px] text-[#94A3B8]">
            Total <strong class="text-[#374151]">{{ deviceCycle.length }}</strong> catatan —
            <strong class="text-[#7C3AED]">{{ deviceCycle.filter(r => r.status_pemakaian === 'Aktif').length }}</strong> aktif,
            <strong class="text-[#64748B]">{{ deviceCycle.filter(r => r.status_pemakaian === 'Selesai').length }}</strong> selesai
          </div>
        </template>

      </div>

    </template>

    <!-- ── Modal Detail Aset ── -->
    <AppModal :is-open="showDetailsModal" title="Detail Aset" size="lg" @close="closeModal">
      <div v-if="selectedAsset" class="flex flex-col gap-0">
        <div class="flex items-center gap-3 pb-4">
          <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-white">
            <span class="material-symbols-outlined">{{ getDeviceIcon(selectedAsset.tipe_perangkat) }}</span>
          </div>
          <div>
            <p class="text-[10px] font-bold uppercase text-brand">ID #{{ selectedAsset.id_aset }}</p>
            <h4 class="text-[17px] font-black text-[#111827]">{{ selectedAsset.label_aset }}</h4>
          </div>
        </div>
        <dl class="grid grid-cols-1 gap-4 rounded-2xl border border-[#F3F4F6] p-4 sm:grid-cols-2">
          <div v-for="item in [
            ['Nomor Seri', selectedAsset.nomor_seri],
            ['Tipe Perangkat', selectedAsset.tipe_perangkat],
            ['Merek', selectedAsset.merek],
            ['Model', selectedAsset.model],
            ['Status Aset', selectedAsset.status_aset],
            ['Kondisi Aset', selectedAsset.kondisi_aset],
            ['Lokasi Aset', selectedAsset.lokasi_aset || selectedAsset.lokasi_kerja],
          ]" :key="item[0]">
            <dt class="text-[10px] font-bold uppercase text-[#9CA3AF]">{{ item[0] }}</dt>
            <dd class="mt-1 text-[13px] font-semibold text-[#111827]">{{ item[1] || '—' }}</dd>
          </div>
        </dl>
        <div class="mt-4">
          <p class="mb-1 text-[10px] font-bold uppercase text-[#9CA3AF]">Spesifikasi</p>
          <p class="whitespace-pre-wrap rounded-xl bg-[#F9FAFB] p-3 text-[13px] text-[#374151]">{{ selectedAsset.spesifikasi || '—' }}</p>
        </div>
        <div class="mt-3">
          <p class="mb-1 text-[10px] font-bold uppercase text-[#9CA3AF]">Catatan Aset</p>
          <p class="whitespace-pre-wrap rounded-xl bg-[#FFFDF5] p-3 text-[13px] text-[#374151]">{{ selectedAsset.catatan_aset || '—' }}</p>
        </div>
        <div class="flex justify-end border-t border-[#F3F4F6] pt-3 mt-4">
          <button type="button" @click="closeModal" class="h-9 rounded-lg bg-[#111827] px-5 text-[13px] font-bold text-white">Tutup</button>
        </div>
      </div>
    </AppModal>

    <!-- ── Modal Spesifikasi ── -->
    <AppModal :is-open="showSpecificationModal" title="Detail Spesifikasi" size="md" @close="closeModal">
      <div v-if="selectedAsset" class="space-y-4">
        <div class="flex items-center gap-3 rounded-2xl border border-[#E8EDF3] bg-[#F8FAFC] p-4">
          <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
            <span class="material-symbols-outlined text-[21px]">{{ getDeviceIcon(selectedAsset.tipe_perangkat) }}</span>
          </div>
          <div class="min-w-0">
            <p class="truncate font-mono text-[11px] font-bold text-[#172033]">{{ selectedAsset.nomor_seri || '—' }}</p>
            <p class="mt-1 truncate text-[9px] font-semibold text-[#94A3B8]">{{ selectedAsset.label_aset }}</p>
          </div>
        </div>
        <div>
          <p class="mb-2 text-[9px] font-bold uppercase tracking-[0.1em] text-[#94A3B8]">Spesifikasi Perangkat</p>
          <div class="min-h-28 whitespace-pre-wrap rounded-2xl border border-[#DCE3EC] bg-white p-4 text-[11px] font-medium leading-6 text-[#334155]">
            {{ selectedAsset.spesifikasi || 'Belum ada informasi spesifikasi untuk aset ini.' }}
          </div>
        </div>
        <div class="flex justify-end border-t border-[#E8EDF3] pt-4">
          <button type="button" class="h-9 rounded-xl bg-brand px-5 font-bold text-white hover:bg-brand-dark" @click="closeModal">Tutup</button>
        </div>
      </div>
    </AppModal>

  </div>
</template>
