<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApi } from '../composables/useApi.js'
import { useAuth } from '../composables/useAuth.js'
import { downloadAssetsCsv } from '../utils/exportAssetsCsv.js'
import { downloadAssetsPdf } from '../utils/exportAssetsPdf.js'
import AppModal from '../components/ui/AppModal.vue'
import AppBadge from '../components/ui/AppBadge.vue'
import SearchableSelect from '../components/ui/SearchableSelect.vue'
import AppRowActions from '../components/ui/AppRowActions.vue'
import AppImportModal from '../components/ui/AppImportModal.vue'
import AppPagination from '../components/ui/AppPagination.vue'

const { get, post, put, del } = useApi()
const { isAdmin, isSuperAdmin, hasWritePermission } = useAuth()
const route = useRoute()
const router = useRouter()
const canWriteAssets = computed(() => hasWritePermission('assets'))

const assets = ref([])
const employees = ref([])
const locations = ref([])
const showImportModal = ref(false)
const currentPage = ref(1)
const itemsPerPage = ref(10)

function onImported() {
  showImportModal.value = false
  fetchData()
  notification.value = { message: 'Data Excel berhasil diimpor ke database!', type: 'success' }
}
const isLoading = ref(true)
const isSubmitting = ref(false)
const isExporting = ref(false)
const pageError = ref('')
const modalError = ref('')
const notification = ref(null)
const searchQuery = ref('')
const filterStatus = ref('')
const filterTipe = ref('')
const showFormModal = ref(false)
const showDeleteModal = ref(false)
const showDetailsModal = ref(false)
const showSpecificationModal = ref(false)
const showExportModal = ref(false)
const exportFormat = ref('csv')
const exportStatus = ref('')
const exportTipe = ref('')
const modalMode = ref('add')
const selectedAsset = ref(null)
const detailsTab = ref('info')
const activeTab = ref('info')
const deviceLogs = ref([])
const isLoadingLogs = ref(false)

const emptyForm = () => ({
  hostname: '',
  serial_number: '',
  spesifikasi: '',
  nik_pemegang_asset: '',
  nama_karyawan_pemegang_asset: '',
  departemen_pemegang_asset: '',
  lokasi_asset: '',
  tipe_perangkat: '',
  brand_merek: '',
  model: '',
  status: 'In Use',
  kondisi: 'Normal',
  note_asset: '',
})

const form = ref(emptyForm())
const statusOptions = ['In Use', 'Stock', 'Damaged', 'In Service', 'Disposal']
const kondisiOptions = ['Baru', 'Normal', 'Rusak Ringan', 'Rusak Sedang', 'Rusak Berat']
const tipeOptions = [
  'Laptop',
  'Desktop',
  'Server',
  'Printer',
  'Network Device',
  'Monitor',
  'Smartphone',
  'Tablet',
  'Lainnya',
]
const brandOptions = [
  'Lenovo',
  'HP',
  'Dell',
  'Apple',
  'Asus',
  'Acer',
  'Samsung',
  'Cisco',
  'APC',
  'Logitech',
  'Epson',
  'MikroTik',
  'Ubiquiti',
  'Lainnya',
]
const defaultLocations = [
  'Solo',
  'Pluit',
  'Gading Serpong',
  'Surabaya',
  'Bandung',
  'Medan',
  'Semarang',
  'Malang',
  'Bali',
  'Yogyakarta',
  'Makassar',
  'Balikpapan',
  'Pontianak',
  'Palembang',
  'Batam',
  'Bekasi',
]

function mergeOptions(defaults, values) {
  return [...new Set([...defaults, ...values.filter(Boolean)])]
}

const availableStatusOptions = computed(() => mergeOptions(statusOptions, [form.value.status_aset]))
const availableKondisiOptions = computed(() =>
  mergeOptions(kondisiOptions, [form.value.kondisi_aset]),
)
const availableTipeOptions = computed(() => mergeOptions(tipeOptions, [form.value.tipe_perangkat]))
const brandSelectOptions = computed(() =>
  mergeOptions(brandOptions, [...assets.value.map((a) => a.merek), form.value.merek]).map((b) => ({
    value: b,
    label: b,
  })),
)
const locationOptions = computed(() =>
  mergeOptions(defaultLocations, [
    ...assets.value.map((a) => a.lokasi_aset),
    form.value.lokasi_aset,
  ]).map((loc) => ({ value: loc, label: loc })),
)

const filteredAssets = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase('id-ID')
  return assets.value.filter((asset) => {
    const searchable = [
      asset.id_aset,
      asset.nomor_seri,
      asset.label_aset,
      asset.spesifikasi,
      asset.nik,
      asset.nama_karyawan,
      asset.departemen,
      asset.lokasi_kerja,
      asset.lokasi_aset,
      asset.tipe_perangkat,
      asset.merek,
      asset.model,
      asset.status_aset,
      asset.kondisi_aset,
      asset.catatan_aset,
    ]
      .join(' ')
      .toLocaleLowerCase('id-ID')
    return (
      (!query || searchable.includes(query)) &&
      (!filterStatus.value || asset.status_aset === filterStatus.value) &&
      (!filterTipe.value || asset.tipe_perangkat === filterTipe.value)
    )
  })
})

watch([searchQuery, filterStatus, filterTipe], () => {
  currentPage.value = 1
})

watch(
  () => form.value.nik_pemegang_asset,
  (newNik) => {
    if (!newNik) {
      form.value.nama_karyawan_pemegang_asset = ''
      form.value.departemen_pemegang_asset = ''
      return
    }
    const emp = employees.value.find((e) => e.nik === newNik)
    if (emp) {
      form.value.nama_karyawan_pemegang_asset = emp.nama_karyawan || ''
      form.value.departemen_pemegang_asset = emp.departemen || ''
      if (!form.value.lokasi_asset && (emp.lokasi_kerja || emp.lokasi)) {
        form.value.lokasi_asset = emp.lokasi_kerja || emp.lokasi
      }
    }
  },
)

const paginatedAssets = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value
  return filteredAssets.value.slice(start, start + itemsPerPage.value)
})

const assignedAssetsCount = computed(
  () => assets.value.filter((asset) => Boolean(asset.nik || asset.nik_pemegang_asset)).length,
)

const availableAssetsCount = computed(
  () =>
    assets.value.filter((asset) =>
      ['stock', 'tersedia'].includes(((asset.status || asset.status_aset) || '').toLowerCase()),
    ).length,
)

async function fetchData() {
  isLoading.value = true
  pageError.value = ''
  try {
    const [assetData, employeeData, locationData] = await Promise.all([
      get('/api/assets'),
      get('/api/karyawan'),
      get('/api/karyawan/locations'),
    ])
    if (!Array.isArray(assetData) || !Array.isArray(employeeData)) {
      throw new Error('Format data dari server tidak valid.')
    }
    assets.value = assetData.map((a) => {
      const hostname = a.hostname || a.label_aset || ''
      const serial_number = a.serial_number || a.nomor_seri || ''
      const nik = a.nik_pemegang_asset || a.nik || ''
      const nama = a.nama_karyawan_pemegang_asset || a.nama_karyawan || ''
      const dept = a.departemen_pemegang_asset || a.departemen || ''
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
        brand_merek: brand,
        merek: brand,
        status,
        status_aset: status,
        kondisi,
        kondisi_aset: kondisi,
        note_asset: note,
        catatan_aset: note,
      }
    })
    employees.value = employeeData
    locations.value = Array.isArray(locationData) ? locationData : []
  } catch (error) {
    pageError.value = error.message || 'Gagal memuat data aset.'
  } finally {
    isLoading.value = false
  }
}

function openAdd() {
  if (!canWriteAssets.value) return
  modalMode.value = 'add'
  selectedAsset.value = null
  form.value = emptyForm()
  activeTab.value = 'info'
  modalError.value = ''
  showFormModal.value = true
}

function openEdit(asset) {
  if (!canWriteAssets.value) return
  modalMode.value = 'edit'
  selectedAsset.value = asset
  form.value = {
    hostname: asset.hostname || asset.label_aset || '',
    serial_number: asset.serial_number || asset.nomor_seri || '',
    spesifikasi: asset.spesifikasi || '',
    nik_pemegang_asset: asset.nik_pemegang_asset || asset.nik || '',
    nama_karyawan_pemegang_asset: asset.nama_karyawan_pemegang_asset || asset.nama_karyawan || '',
    departemen_pemegang_asset: asset.departemen_pemegang_asset || asset.departemen || '',
    lokasi_asset: asset.lokasi_asset || asset.lokasi_kerja || '',
    tipe_perangkat: asset.tipe_perangkat || '',
    brand_merek: asset.brand_merek || asset.merek || '',
    model: asset.model || '',
    status: asset.status || asset.status_aset || 'In Use',
    kondisi: asset.kondisi || asset.kondisi_aset || 'Normal',
    note_asset: asset.note_asset || asset.catatan_aset || '',
  }
  activeTab.value = 'info'
  modalError.value = ''
  showFormModal.value = true
}

function openDelete(asset) {
  if (!canWriteAssets.value) return
  selectedAsset.value = asset
  modalError.value = ''
  showDeleteModal.value = true
}

async function openDetails(asset) {
  selectedAsset.value = asset
  detailsTab.value = 'info'
  deviceLogs.value = []
  showDetailsModal.value = true
  // Fetch device-specific logs in background
  isLoadingLogs.value = true
  try {
    const data = await get(`/api/logs/assets/${asset.id_aset}`)
    deviceLogs.value = Array.isArray(data) ? data : []
  } catch (error) {
    console.error('Gagal memuat log perangkat:', error)
  } finally {
    isLoadingLogs.value = false
  }
}

function openSpecification(asset) {
  selectedAsset.value = asset
  showSpecificationModal.value = true
}

function closeModal() {
  if (isSubmitting.value || isExporting.value) return
  showFormModal.value = false
  showDeleteModal.value = false
  showDetailsModal.value = false
  showSpecificationModal.value = false
  showExportModal.value = false
  selectedAsset.value = null
  modalError.value = ''
}

function buildPayload() {
  return Object.fromEntries(
    Object.entries(form.value).map(([key, value]) => [
      key,
      typeof value === 'string' ? value.trim() : value,
    ]),
  )
}

async function nextStep() {
  // Validation sebelum pindah step
  if (activeTab.value === 'info') {
    if (!form.value.hostname) {
      modalError.value = 'Hostname wajib diisi.'
      return
    }
    if (!form.value.serial_number) {
      modalError.value = 'Serial Number wajib diisi.'
      return
    }
    if (!form.value.tipe_perangkat) {
      modalError.value = 'Tipe Perangkat harus dipilih.'
      return
    }
  }
  
  if (activeTab.value === 'placement') {
    if (!form.value.nik_pemegang_asset) {
      modalError.value = 'Pemegang Aset wajib dipilih.'
      return
    }
  }
  
  // Pindah ke step berikutnya
  if (activeTab.value === 'info') {
    activeTab.value = 'placement'
  } else if (activeTab.value === 'placement') {
    activeTab.value = 'specifications'
  }
  
  modalError.value = ''
}

async function saveAsset() {
  if (!canWriteAssets.value) {
    modalError.value = 'Anda hanya memiliki akses baca untuk aset.'
    return
  }
  const payload = buildPayload()
  if (!payload.hostname) {
    modalError.value = 'Hostname wajib diisi.'
    return
  }
  if (!payload.lokasi_aset) {
    modalError.value = 'Penempatan aset wajib dipilih.'
    return
  }
  isSubmitting.value = true
  modalError.value = ''
  try {
    if (modalMode.value === 'add') {
      await post('/api/assets', payload)
      toast('Aset IT berhasil ditambahkan.')
    } else {
      await put(`/api/assets/${selectedAsset.value.id_aset}`, payload)
      toast('Aset IT berhasil diperbarui.')
    }
    showFormModal.value = false
    selectedAsset.value = null
    await fetchData()
  } catch (error) {
    modalError.value = error.message || 'Gagal menyimpan aset.'
  } finally {
    isSubmitting.value = false
  }
}

async function deleteAsset() {
  if (!canWriteAssets.value || !selectedAsset.value) return
  isSubmitting.value = true
  modalError.value = ''
  try {
    await del(`/api/assets/${selectedAsset.value.id_aset}`)
    showDeleteModal.value = false
    selectedAsset.value = null
    toast('Aset IT berhasil dihapus.')
    await fetchData()
  } catch (error) {
    modalError.value = error.message || 'Gagal menghapus aset.'
  } finally {
    isSubmitting.value = false
  }
}

function openExport() {
  exportStatus.value = filterStatus.value
  exportTipe.value = filterTipe.value
  exportFormat.value = 'csv'
  showExportModal.value = true
}

async function executeExport() {
  if (isExporting.value) return
  isExporting.value = true
  try {
    const data = await get('/api/assets')
    const filteredData = data.filter((asset) => {
      return (
        (!exportStatus.value || asset.status_aset === exportStatus.value) &&
        (!exportTipe.value || asset.tipe_perangkat === exportTipe.value)
      )
    })

    if (filteredData.length === 0) {
      toast('Tidak ada data aset yang cocok dengan filter ekspor.', 'warning')
      isExporting.value = false
      return
    }

    if (exportFormat.value === 'csv') {
      downloadAssetsCsv(filteredData)
      toast('CSV aset berhasil dibuat.')
    } else {
      downloadAssetsPdf(filteredData, {
        status: exportStatus.value,
        tipe: exportTipe.value,
      })
      toast('PDF laporan berhasil dicetak.')
    }
    showExportModal.value = false
  } catch (error) {
    toast(error.message || 'Gagal mengekspor aset.', 'error')
  } finally {
    isExporting.value = false
  }
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
  const value = (type || '').toLowerCase()
  if (value.includes('laptop')) return 'laptop'
  if (value.includes('server')) return 'dns'
  if (value.includes('printer')) return 'print'
  if (value.includes('monitor')) return 'monitor'
  if (value.includes('network')) return 'router'
  return 'computer'
}

function formatLogDate(dateStr) {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
}

function getAssetActions(asset) {
  const actions = [
    {
      label: 'Lihat Detail',
      icon: 'visibility',
      onClick: () => openDetails(asset),
    },
  ]
  if (canWriteAssets.value) {
    actions.push({
      label: 'Edit Aset',
      icon: 'edit',
      onClick: () => openEdit(asset),
    })
    actions.push({
      label: 'Hapus Aset',
      icon: 'delete',
      danger: true,
      onClick: () => openDelete(asset),
    })
  }
  return actions
}

function parsePerubahan(perubahan, aksi) {
  if (!perubahan) return []

  if (aksi === 'UBAH' && perubahan.startsWith('Perubahan data: ')) {
    // Format: "Perubahan data: Field1: old -> new, Field2: old -> new"
    const body = perubahan.replace('Perubahan data: ', '')
    // Split by ', ' but be careful with values that might contain commas
    // Use regex to split on ', ' followed by a known field label pattern
    const parts = body.split(/,\s*(?=[A-Z])/)
    return parts
      .map((part) => {
        const arrowIdx = part.indexOf(' -> ')
        if (arrowIdx === -1) return { field: part, old: '', new: '' }
        const colonIdx = part.indexOf(': ')
        if (colonIdx === -1) return { field: part, old: '', new: '' }
        const field = part.substring(0, colonIdx).trim()
        const oldVal = part.substring(colonIdx + 2, arrowIdx).trim()
        const newVal = part.substring(arrowIdx + 4).trim()
        return { field, old: oldVal, new: newVal }
      })
      .filter((r) => r.field)
  }

  if (aksi === 'TAMBAH' && perubahan.startsWith('Aset baru didaftarkan')) {
    // Format: "Aset baru didaftarkan dengan nomor seri X, tipe: Y, merek: Z, status: A, kondisi: B."
    const items = []
    const match = perubahan.match(/nomor seri (.+?),/)
    if (match) items.push({ field: 'Nomor Seri', value: match[1] })
    const pairs = perubahan.matchAll(/(?:tipe|merek|status|kondisi):\s*([^,.]+)/gi)
    for (const m of pairs) {
      const label = perubahan.substring(m.index, perubahan.indexOf(':', m.index)).trim()
      items.push({ field: label.charAt(0).toUpperCase() + label.slice(1), value: m[1].trim() })
    }
    return items
  }

  // Fallback: return as single text entry
  return [{ field: null, value: perubahan }]
}

function resetFilters() {
  searchQuery.value = ''
  filterStatus.value = ''
  filterTipe.value = ''
  if ('q' in route.query) {
    const query = { ...route.query }
    delete query.q
    router.replace({ query })
  }
}

let toastTimer
function toast(message, type = 'success') {
  window.clearTimeout(toastTimer)
  notification.value = { message, type }
  toastTimer = window.setTimeout(() => {
    notification.value = null
  }, 3500)
}

watch(
  () => route.query.q,
  (query) => {
    searchQuery.value = typeof query === 'string' ? query : ''
  },
  { immediate: true },
)

onMounted(async () => {
  await fetchData()
  if (route.query.action === 'add') {
    if (canWriteAssets.value) openAdd()
    const query = { ...route.query }
    delete query.action
    router.replace({ query })
  }
})
onBeforeUnmount(() => window.clearTimeout(toastTimer))
</script>

<template>
  <div class="flex min-w-0 flex-col gap-5">
    <Transition name="slide-right">
      <div
        v-if="notification"
        :role="notification.type === 'error' ? 'alert' : 'status'"
        class="fixed left-4 right-4 top-4 z-[60] flex items-center gap-3 rounded-xl px-4 py-3 text-white shadow-2xl sm:left-auto sm:right-5 sm:max-w-md"
        :class="
          notification.type === 'error'
            ? 'bg-[#B91C1C]'
            : notification.type === 'warning'
              ? 'bg-[#92400E]'
              : 'bg-[#111827]'
        "
      >
        <span class="material-symbols-outlined text-[18px]">{{
          notification.type === 'error' ? 'error' : 'check_circle'
        }}</span>
        <span class="text-[13px] font-semibold">{{ notification.message }}</span>
      </div>
    </Transition>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div
        class="shadow-card flex items-center gap-4 rounded-2xl border border-[#D2E3FF] bg-[#ECF2FF] p-5"
      >
        <span
          class="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-[#5D87FF] shadow-xs"
          ><span class="material-symbols-outlined text-[22px]">inventory_2</span></span
        >
        <div>
          <p class="font-num text-[26px] font-extrabold leading-none text-[#2A3547]">
            {{ assets.length }}
          </p>
          <p class="mt-1 text-[10px] font-bold uppercase tracking-wider text-[#7C8BAC]">
            Total Aset IT
          </p>
        </div>
      </div>
      <div
        class="shadow-card flex items-center gap-4 rounded-2xl border border-[#C3F3E8] bg-[#EDFBF7] p-5"
      >
        <span
          class="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-[#13DEB9] shadow-xs"
          ><span class="material-symbols-outlined text-[22px]">assignment_ind</span></span
        >
        <div>
          <p class="font-num text-[26px] font-extrabold leading-none text-[#2A3547]">
            {{ assignedAssetsCount }}
          </p>
          <p class="mt-1 text-[10px] font-bold uppercase tracking-wider text-[#7C8BAC]">
            Sudah Dialokasikan
          </p>
        </div>
      </div>
      <div
        class="shadow-card flex items-center gap-4 rounded-2xl border border-[#C8EDFF] bg-[#E8F7FF] p-5"
      >
        <span
          class="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-[#49BEFF] shadow-xs"
          ><span class="material-symbols-outlined text-[22px]">deployed_code</span></span
        >
        <div>
          <p class="font-num text-[26px] font-extrabold leading-none text-[#2A3547]">
            {{ availableAssetsCount }}
          </p>
          <p class="mt-1 text-[10px] font-bold uppercase tracking-wider text-[#7C8BAC]">
            Siap Digunakan
          </p>
        </div>
      </div>
    </div>

    <!-- ─── FILTER & ACTION BAR ────────────────────────────── -->
    <div
      class="shadow-sm rounded-xl border border-[#E2E8F0] bg-white p-3 hover:shadow-md transition-shadow duration-300 mb-5"
    >
      <div class="flex items-center gap-2 flex-wrap sm:flex-nowrap">
        <!-- Search Input (Flexible - Takes remaining space) -->
        <div class="relative min-w-0 flex-1">
          <label for="asset-search" class="sr-only">Cari aset</label>
          <span
            class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-[#94A3B8] pointer-events-none"
            >search</span
          >
          <input
            id="asset-search"
            v-model="searchQuery"
            type="search"
            autocomplete="off"
            placeholder="Cari label, serial, karyawan..."
            class="h-9 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] pl-9 pr-3.5 text-xs font-medium text-[#1E293B] focus:border-[#3B82F6] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/10 transition-all"
          />
        </div>

        <!-- Filter Status -->
        <select
          v-model="filterStatus"
          aria-label="Filter status aset"
          class="h-9 min-w-[150px] rounded-lg border border-[#E2E8F0] bg-white px-3 text-xs font-semibold text-[#1E293B] hover:border-[#CBD5E1] focus:border-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/10 transition-all whitespace-nowrap"
        >
          <option value="">Semua Status</option>
          <option v-for="status in availableStatusOptions" :key="status" :value="status">
            {{ status }}
          </option>
        </select>

        <!-- Filter Tipe -->
        <select
          v-model="filterTipe"
          aria-label="Filter tipe perangkat"
          class="h-9 min-w-[150px] rounded-lg border border-[#E2E8F0] bg-white px-3 text-xs font-semibold text-[#1E293B] hover:border-[#CBD5E1] focus:border-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/10 transition-all whitespace-nowrap"
        >
          <option value="">Semua Tipe</option>
          <option v-for="tipe in availableTipeOptions" :key="tipe" :value="tipe">{{ tipe }}</option>
        </select>

        <!-- Action Buttons Group -->
        <div class="flex items-center gap-2 flex-shrink-0">
          <!-- Export Data Button -->
          <button
            type="button"
            @click="openExport"
            class="h-9 rounded-lg border border-[#E2E8F0] bg-white px-3 text-xs font-semibold text-[#475569] hover:bg-[#F1F5F9] hover:text-[#1E293B] transition-all flex items-center gap-1.5 whitespace-nowrap"
            title="Ekspor data aset"
          >
            <span class="material-symbols-outlined text-[16px]">download</span>
            </button>

          <!-- Import Excel Button -->
          <button
            v-if="canWriteAssets"
            type="button"
            @click="showImportModal = true"
            class="h-9 rounded-lg border border-[#E2E8F0] bg-white px-3 text-xs font-semibold text-[#475569] hover:bg-[#F1F5F9] hover:text-[#1E293B] transition-all flex items-center gap-1.5 whitespace-nowrap"
            title="Import dari Excel"
          >
            <span class="material-symbols-outlined text-[16px]">file_upload</span>
            </button>

          <!-- Reset Filters Button (conditional) -->
          <button
            v-if="searchQuery || filterStatus || filterTipe"
            type="button"
            @click="resetFilters"
            class="h-9 rounded-lg border border-[#FDEACA] bg-[#FEF3F2] px-3 text-xs font-semibold text-[#DC2626] hover:bg-[#DC2626] hover:text-white transition-all whitespace-nowrap"
            title="Reset semua filter"
          >
            ↺
            </button>

          <!-- Add Asset Button (Primary) -->
          <button
            v-if="canWriteAssets"
            type="button"
            @click="openAdd"
            class="h-9 rounded-lg bg-[#3B82F6] px-3.5 text-xs font-bold text-white shadow-sm hover:bg-[#2563EB] transition-all flex items-center gap-1.5 whitespace-nowrap"
            title="Tambah aset baru"
          >
            <span class="material-symbols-outlined text-[16px]">add</span>
            <span class="hidden sm:inline">Tambah Aset</span>
            </button>
        </div>
      </div>
    </div>

    <div class="shadow-card overflow-hidden rounded-2xl border border-[#E5EAEF] bg-white">
      <div
        v-if="isLoading"
        role="status"
        class="flex items-center justify-center gap-3 py-16 text-[13px] text-[#7C8BAC]"
      >
        <span
          class="h-8 w-8 animate-spin rounded-full border-4 border-[#E5EAEF] border-t-[#5D87FF]"
        ></span>
        Memuat data aset...
      </div>
      <div
        v-else-if="pageError"
        role="alert"
        class="flex items-center gap-2 bg-[#FDEDE8] px-5 py-4 text-[13px] text-[#FA896B]"
      >
        <span class="material-symbols-outlined text-[18px]">error</span
        ><span class="flex-1">{{ pageError }}</span>
        <button type="button" class="font-bold underline" @click="fetchData">Coba lagi</button>
      </div>
      <div
        v-else
        class="overflow-x-auto"
        tabindex="0"
        aria-label="Tabel view daftar aset TI lengkap"
      >
        <table class="w-full text-left border-collapse">
          <caption class="sr-only">
            Isi view daftar_aset_ti_lengkap
          </caption>
          <thead class="sticky top-0 z-10">
            <tr class="border-b border-[#E5EAEF] bg-[#F8FAFC]">
              <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#7C8BAC]">
                Serial / Label
              </th>
              <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#7C8BAC]">
                Spesifikasi
              </th>
              <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#7C8BAC]">
                Pemegang / NIK
              </th>
              <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#7C8BAC]">
                Departemen / Lokasi
              </th>
              <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#7C8BAC]">
                Tipe
              </th>
              <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#7C8BAC]">
                Status
              </th>
              <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#7C8BAC]">
                Kondisi
              </th>
              <th
                class="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-[#7C8BAC]"
              >
                Aksi
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#F1F5F9]">
            <tr v-for="asset in paginatedAssets" :key="asset.id_aset" class="hover:bg-[#F8FAFC]">
              <td class="px-3 py-2.5">
                <div>
                  <p class="font-mono text-[11px] font-bold text-[#2A3547] truncate">
                    {{ asset.nomor_seri || '—' }}
                  </p>
                  <p class="text-[10px] font-semibold text-[#7C8BAC] truncate">
                    {{ asset.label_aset }}
                  </p>
                </div>
              </td>
              <td class="px-3 py-2.5">
                <div class="flex items-center gap-1 min-w-0">
                  <span class="text-[11px] font-bold text-[#2A3547] truncate">
                    {{
                      [asset.merek, asset.model].filter(Boolean).join(' ') ||
                      asset.tipe_perangkat ||
                      '—'
                    }}
                  </span>
                </div>
              </td>
              <td class="px-3 py-2.5">
                <p class="text-[11px] font-bold text-[#2A3547] truncate">
                  {{ asset.nama_karyawan || 'Belum ditetapkan' }}
                </p>
                <p class="font-mono text-[10px] text-[#7C8BAC]">{{ asset.nik || '—' }}</p>
              </td>
              <td class="px-3 py-2.5">
                <p class="text-[11px] font-bold text-[#2A3547] truncate">
                  {{ asset.departemen || '—' }}
                </p>
                <p class="text-[10px] font-medium text-[#7C8BAC] truncate">
                  {{ asset.lokasi_kerja || asset.lokasi_aset || '—' }}
                </p>
              </td>
              <td class="px-3 py-2.5 text-[11px] font-semibold text-[#2A3547] truncate">
                {{ asset.tipe_perangkat || '—' }}
              </td>
              <td class="px-3 py-2.5">
                <AppBadge
                  :type="getStatusBadgeType(asset.status_aset)"
                  :text="asset.status_aset || '—'"
                  small
                />
              </td>
              <td class="px-3 py-2.5 text-[11px] font-semibold text-[#2A3547] truncate">
                {{ asset.kondisi_aset || '—' }}
              </td>
              <td class="px-3 py-2.5 text-right">
                <AppRowActions :actions="getAssetActions(asset)" />
              </td>
            </tr>
            <tr v-if="filteredAssets.length === 0">
              <td colspan="8" class="px-5 py-12 text-center text-[12px] text-[#7C8BAC]">
                Tidak ada aset yang sesuai.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <AppPagination
        v-if="!isLoading && !pageError"
        v-model:currentPage="currentPage"
        :total-items="filteredAssets.length"
        :items-per-page="itemsPerPage"
      />
    </div>

    <AppModal
      :is-open="showFormModal"
      :title="modalMode === 'add' ? 'Tambah Aset IT' : 'Edit Aset IT'"
      size="lg"
      @close="closeModal"
    >
      <!-- Tab Navigation -->
      <div class="bg-white">
        <div class="flex items-center justify-center gap-8 py-4 border-b border-[#F1F5F9]">
          <!-- Tab 1: Informasi Asset -->
          <button
            type="button"
            @click="activeTab = 'info'"
            class="group flex items-center gap-2 px-3 py-1 transition-all duration-200 relative"
            :class="activeTab === 'info'
              ? 'text-[#3B82F6]'
              : 'text-[#94A3B8] hover:text-[#64748B]'"
          >
            <span class="material-symbols-outlined text-[16px]" :class="activeTab === 'info' ? 'text-[#3B82F6]' : 'text-[#CBD5E1] group-hover:text-[#94A3B8]'">inventory_2</span>
            <span class="text-[13px] font-medium whitespace-nowrap">Informasi Asset</span>
            <div v-if="activeTab === 'info'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-[#3B82F6] rounded-t-full"></div>
          </button>
          
          <!-- Tab 2: Penempatan -->
          <button
            type="button"
            @click="activeTab = 'placement'"
            class="group flex items-center gap-2 px-3 py-1 transition-all duration-200 relative"
            :class="activeTab === 'placement'
              ? 'text-[#3B82F6]'
              : 'text-[#94A3B8] hover:text-[#64748B]'"
          >
            <span class="material-symbols-outlined text-[16px]" :class="activeTab === 'placement' ? 'text-[#3B82F6]' : 'text-[#CBD5E1] group-hover:text-[#94A3B8]'">person</span>
            <span class="text-[13px] font-medium whitespace-nowrap">Penempatan</span>
            <div v-if="activeTab === 'placement'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-[#3B82F6] rounded-t-full"></div>
          </button>
          
          <!-- Tab 3: Spesifikasi -->
          <button
            type="button"
            @click="activeTab = 'specifications'"
            class="group flex items-center gap-2 px-3 py-1 transition-all duration-200 relative"
            :class="activeTab === 'specifications'
              ? 'text-[#3B82F6]'
              : 'text-[#94A3B8] hover:text-[#64748B]'"
          >
            <span class="material-symbols-outlined text-[16px]" :class="activeTab === 'specifications' ? 'text-[#3B82F6]' : 'text-[#CBD5E1] group-hover:text-[#94A3B8]'">settings</span>
            <span class="text-[13px] font-medium whitespace-nowrap">Spesifikasi</span>
            <div v-if="activeTab === 'specifications'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-[#3B82F6] rounded-t-full"></div>
          </button>
        </div>
      </div>

      <!-- Form Content -->
      <form class="flex flex-col" @submit.prevent="saveAsset">
        <div
          v-if="modalError"
          role="alert"
          class="m-4 mt-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] px-4 py-3 text-[13px] text-[#DC2626] shadow-sm"
        >
          {{ modalError }}
        </div>

        <!-- Tab 1: Informasi Asset -->
        <div v-show="activeTab === 'info'" class="p-6">
          <fieldset class="grid grid-cols-2 gap-x-4 gap-y-4">
            <label class="flex flex-col gap-2">
              <span class="text-[13px] font-semibold text-[#64748B]">Hostname *</span>
              <input 
                v-model="form.hostname" 
                required 
                autofocus 
                maxlength="100" 
                placeholder="Laptop-HR-01 atau SN-ABC123" 
                class="h-[40px] w-full rounded-xl border border-[#E2E8F0] bg-white px-3.5 text-[14px] font-normal text-[#1E293B] placeholder-[#94A3B8] focus:border-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/10 transition-all shadow-sm" 
              />
            </label>
            
            <label class="flex flex-col gap-2">
              <span class="text-[13px] font-semibold text-[#64748B]">Serial Number *</span>
              <input 
                v-model="form.serial_number" 
                required
                maxlength="100" 
                placeholder="Nomor seri perangkat" 
                class="h-[40px] w-full rounded-xl border border-[#E2E8F0] bg-white px-3.5 text-[14px] font-normal text-[#1E293B] placeholder-[#94A3B8] focus:border-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/10 transition-all shadow-sm" 
              />
            </label>
            
            <label class="flex flex-col gap-2 col-span-2">
              <span class="text-[13px] font-semibold text-[#64748B]">Tipe Perangkat *</span>
              <select v-model="form.tipe_perangkat" class="h-[40px] w-full rounded-xl border border-[#E2E8F0] bg-white px-3.5 text-[14px] font-normal text-[#1E293B] focus:border-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/10 transition-all appearance-none shadow-sm cursor-pointer">
                <option value="">Pilih tipe</option>
                <option v-for="type in availableTipeOptions" :key="type">{{ type }}</option>
              </select>
            </label>
          </fieldset>
        </div>

        <!-- Tab 2: Penempatan & Pemegang -->
        <div v-show="activeTab === 'placement'" class="p-6">
          <fieldset class="grid grid-cols-2 gap-x-4 gap-y-4">
            <label class="flex flex-col gap-2 col-span-2">
              <span class="text-[13px] font-semibold text-[#64748B]">Pemegang Aset *</span>
              <SearchableSelect
                v-model="form.nik_pemegang_asset"
                :options="employees"
                value-key="nik"
                label-key="nama_karyawan"
                secondary-label-key="nik"
                placeholder="Pilih pemegang aset (Karyawan)"
                search-placeholder="Cari nama atau NIK..."
                clearable
                class="w-full"
              />
            </label>
            
            <label class="flex flex-col gap-2">
              <span class="text-[13px] font-semibold text-[#64748B]">Nama Pemegang</span>
              <input 
                :value="form.nama_karyawan_pemegang_asset" 
                readonly 
                class="h-[40px] w-full cursor-not-allowed rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-[14px] font-normal text-[#475569] shadow-sm" 
              />
            </label>
            
            <label class="flex flex-col gap-2">
              <span class="text-[13px] font-semibold text-[#64748B]">Departemen</span>
              <input 
                :value="form.departemen_pemegang_asset" 
                readonly 
                class="h-[40px] w-full cursor-not-allowed rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-[14px] font-normal text-[#475569] shadow-sm" 
              />
            </label>
            
            <label class="flex flex-col gap-2 col-span-2">
              <span class="text-[13px] font-semibold text-[#64748B]">Lokasi Aset</span>
              <SearchableSelect
                v-model="form.lokasi_asset"
                :options="locationOptions"
                value-key="value"
                label-key="label"
                placeholder="Pilih atau ketik lokasi penempatan aset"
                search-placeholder="Cari atau ketik lokasi baru..."
                allow-custom
                custom-label-prefix="+ Gunakan lokasi baru"
                class="w-full"
              />
            </label>
          </fieldset>
        </div>

        <!-- Tab 3: Spesifikasi & Kondisi -->
        <div v-show="activeTab === 'specifications'" class="p-6">
          <fieldset class="grid grid-cols-2 gap-x-4 gap-y-4">
            
            <!-- Row 1: Brand/Model -->
            <label class="flex flex-col gap-2">
              <span class="text-[13px] font-semibold text-[#64748B]">Brand/Merek</span>
              <SearchableSelect
                v-model="form.brand_merek"
                :options="brandSelectOptions"
                value-key="value"
                label-key="label"
                placeholder="Pilih atau ketik merek perangkat"
                search-placeholder="Cari atau ketik merek baru..."
                allow-custom
                custom-label-prefix="+ Gunakan merek baru"
                clearable
                class="w-full"
              />
            </label>
            
            <label class="flex flex-col gap-2">
              <span class="text-[13px] font-semibold text-[#64748B]">Model</span>
              <input 
                v-model="form.model" 
                maxlength="100" 
                placeholder="Model perangkat" 
                class="h-[40px] w-full rounded-xl border border-[#E2E8F0] bg-white px-3.5 text-[14px] font-normal text-[#1E293B] placeholder-[#94A3B8] focus:border-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/10 transition-all shadow-sm" 
              />
            </label>
            
            <!-- Row 2: Status/Kondisi -->
            <label class="flex flex-col gap-2">
              <span class="text-[13px] font-semibold text-[#64748B]">Status Asset *</span>
              <select v-model="form.status" class="h-[40px] w-full rounded-xl border border-[#E2E8F0] bg-white px-3.5 text-[14px] font-normal text-[#1E293B] focus:border-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/10 transition-all appearance-none shadow-sm cursor-pointer">
                <option v-for="status in availableStatusOptions" :key="status">{{ status }}</option>
              </select>
            </label>
            
            <label class="flex flex-col gap-2">
              <span class="text-[13px] font-semibold text-[#64748B]">Kondisi Asset *</span>
              <select v-model="form.kondisi" class="h-[40px] w-full rounded-xl border border-[#E2E8F0] bg-white px-3.5 text-[14px] font-normal text-[#1E293B] focus:border-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/10 transition-all appearance-none shadow-sm cursor-pointer">
                <option v-for="condition in availableKondisiOptions" :key="condition">{{ condition }}</option>
              </select>
            </label>
            
            <!-- Row 3: Spesifikasi (Full Width) -->
            <label class="flex flex-col gap-2 col-span-2">
              <span class="text-[13px] font-semibold text-[#64748B]">Spesifikasi</span>
              <textarea 
                v-model="form.spesifikasi" 
                rows="2" 
                placeholder="CPU, RAM, Storage, OS, dll." 
                class="min-h-[48px] max-h-[64px] w-full rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-[14px] font-normal text-[#1E293B] placeholder-[#94A3B8] focus:border-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/10 transition-all resize-y shadow-sm"
              ></textarea>
            </label>
            
            <!-- Row 4: Catatan Asset (Full Width) -->
            <label class="flex flex-col gap-2 col-span-2">
              <span class="text-[13px] font-semibold text-[#64748B]">Catatan Asset</span>
              <textarea 
                v-model="form.note_asset" 
                rows="2" 
                placeholder="Catatan tambahan untuk aset ini" 
                class="min-h-[48px] max-h-[64px] w-full rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-[14px] font-normal text-[#1E293B] placeholder-[#94A3B8] focus:border-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/10 transition-all resize-y shadow-sm"
              ></textarea>
            </label>
            
          </fieldset>
        </div>

        <!-- Footer Wizard Navigation -->
        <div class="flex justify-between gap-3 border-t border-[#F1F5F9] p-6 bg-white">
          <button 
            v-if="activeTab !== 'info'"
            type="button" 
            @click="activeTab = activeTab === 'placement' ? 'info' : 'placement'" 
            class="h-[40px] rounded-xl border border-[#E2E8F0] px-4 text-[14px] font-semibold text-[#64748B] hover:bg-[#F8FAFC] transition-all flex items-center gap-2 shadow-sm"
          >
            <span class="material-symbols-outlined text-[16px]">arrow_back</span>
            Prev
          </button>
          
          <div v-else></div> <!-- Spacer for alignment -->
          
          <div class="flex items-center gap-3">
            <button 
              v-if="activeTab === 'specifications'"
              type="submit" 
              :disabled="isSubmitting || !canWriteAssets || hasValidationErrors" 
              class="h-[40px] rounded-xl bg-[#3B82F6] px-6 text-[14px] font-bold text-white shadow-sm hover:bg-[#2563EB] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              <span v-if="isSubmitting" class="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
              {{ isSubmitting ? 'Menyimpan...' : 'Simpan' }}
            </button>
            
            <button 
              v-else
              type="button" 
              @click="nextStep" 
              :disabled="isSubmitting || hasValidationErrors" 
              class="h-[40px] rounded-xl bg-[#3B82F6] px-6 text-[14px] font-bold text-white shadow-sm hover:bg-[#2563EB] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              Next
              <span class="material-symbols-outlined text-[16px]">arrow_forward</span>
            </button>
          </div>
        </div>
      </form>
    </AppModal>


    <AppModal :is-open="showDeleteModal" title="Hapus Aset IT" size="sm" @close="closeModal">
      <div class="flex flex-col items-center gap-4 text-center">
        <div
          v-if="modalError"
          role="alert"
          class="w-full rounded-lg bg-red-50 px-3 py-2 text-left text-[12px] text-red-700"
        >
          {{ modalError }}
        </div>
        <div class="flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
          <span class="material-symbols-outlined text-[28px] text-[#EF4444]">warning</span>
        </div>
        <div>
          <h4 class="text-[15px] font-black text-[#111827]">
            Hapus {{ selectedAsset?.label_aset }}?
          </h4>
          <p class="mt-1 text-[12px] text-[#9CA3AF]">Data aset akan dihapus permanen.</p>
        </div>
        <div class="flex w-full gap-3">
          <button
            type="button"
            :disabled="isSubmitting"
            @click="closeModal"
            class="h-10 flex-1 rounded-lg border"
          >
            Batal</button
          ><button
            type="button"
            :disabled="isSubmitting"
            @click="deleteAsset"
            class="h-10 flex-1 rounded-lg bg-[#EF4444] font-bold text-white"
          >
            {{ isSubmitting ? 'Menghapus...' : 'Ya, Hapus' }}
            </button>
        </div>
      </div>
    </AppModal>

    <AppModal
      :is-open="showSpecificationModal"
      title="Detail Spesifikasi"
      size="md"
      @close="closeModal"
    >
      <div v-if="selectedAsset" class="space-y-4">
        <div class="flex items-center gap-3 rounded-2xl border border-[#E8EDF3] bg-[#F8FAFC] p-4">
          <div
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand"
          >
            <span aria-hidden="true" class="material-symbols-outlined text-[21px]">{{
              getDeviceIcon(selectedAsset.tipe_perangkat)
            }}</span>
          </div>
          <div class="min-w-0">
            <p class="truncate font-mono text-[11px] font-bold text-[#172033]">
              {{ selectedAsset.nomor_seri || '—' }}
            </p>
            <p class="mt-1 truncate text-[9px] font-semibold text-[#94A3B8]">
              {{ selectedAsset.label_aset }}
            </p>
          </div>
        </div>

        <div>
          <p class="mb-2 text-[9px] font-bold uppercase tracking-[0.1em] text-[#94A3B8]">
            Spesifikasi Perangkat
          </p>
          <div
            class="min-h-28 whitespace-pre-wrap rounded-2xl border border-[#DCE3EC] bg-white p-4 text-[11px] font-medium leading-6 text-[#334155]"
          >
            {{ selectedAsset.spesifikasi || 'Belum ada informasi spesifikasi untuk aset ini.' }}
          </div>
        </div>

        <div class="flex justify-end border-t border-[#E8EDF3] pt-4">
          <button
            type="button"
            class="h-9 rounded-xl bg-brand px-5 font-bold text-white hover:bg-brand-dark"
            @click="closeModal"
          >
            Tutup
            </button>
        </div>
      </div>
    </AppModal>

    <AppModal :is-open="showDetailsModal" title="Detail Aset" size="lg" @close="closeModal">
      <div v-if="selectedAsset" class="flex flex-col gap-0">
        <!-- Header Aset -->
        <div class="flex items-center gap-3 pb-4">
          <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-white">
            <span class="material-symbols-outlined">{{
              getDeviceIcon(selectedAsset.tipe_perangkat)
            }}</span>
          </div>
          <div>
            <p class="text-[10px] font-bold uppercase text-brand">
              ID #{{ selectedAsset.id_aset }}
            </p>
            <h4 class="text-[17px] font-black text-[#111827]">{{ selectedAsset.label_aset }}</h4>
          </div>
        </div>

        <!-- Tab Navigation -->
        <div class="flex border-b border-[#E2E8F0]/80 mb-4">
          <button
            type="button"
            @click="detailsTab = 'info'"
            class="flex items-center gap-2 px-4 py-3 text-[12px] font-bold transition-all duration-150 border-b-2 -mb-[2px]"
            :class="
              detailsTab === 'info'
                ? 'border-brand text-brand font-black'
                : 'border-transparent text-[#64748B] hover:text-[#172033]'
            "
          >
            <span class="material-symbols-outlined text-[16px]">info</span>
            Informasi Detail
            </button>
          <button
            v-if="isAdmin || isSuperAdmin"
            type="button"
            @click="detailsTab = 'logs'"
            class="flex items-center gap-2 px-4 py-3 text-[12px] font-bold transition-all duration-150 border-b-2 -mb-[2px]"
            :class="
              detailsTab === 'logs'
                ? 'border-brand text-brand font-black'
                : 'border-transparent text-[#64748B] hover:text-[#172033]'
            "
          >
            <span class="material-symbols-outlined text-[16px]">history</span>
            Log Perubahan
            <span
              v-if="deviceLogs.length"
              class="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand/10 px-1.5 text-[10px] font-black text-brand"
            >
              {{ deviceLogs.length }}
            </span>
            </button>
        </div>

        <!-- Tab 1: Info Detail -->
        <div v-if="detailsTab === 'info'" class="space-y-4">
          <dl class="grid grid-cols-1 gap-4 rounded-2xl border border-[#F3F4F6] p-4 sm:grid-cols-2">
            <div
              v-for="item in [
                ['Nomor Seri', selectedAsset.nomor_seri],
                ['Tipe Perangkat', selectedAsset.tipe_perangkat],
                ['Merek', selectedAsset.merek],
                ['Model', selectedAsset.model],
                ['Status Aset', selectedAsset.status_aset],
                ['Kondisi Aset', selectedAsset.kondisi_aset],
                ['NIK', selectedAsset.nik],
                ['Nama Karyawan', selectedAsset.nama_karyawan],
                ['Departemen', selectedAsset.departemen],
                ['Lokasi Aset', selectedAsset.lokasi_kerja],
              ]"
              :key="item[0]"
            >
              <dt class="text-[10px] font-bold uppercase text-[#9CA3AF]">{{ item[0] }}</dt>
              <dd class="mt-1 text-[13px] font-semibold text-[#111827]">{{ item[1] || '—' }}</dd>
            </div>
          </dl>
          <div>
            <p class="mb-1 text-[10px] font-bold uppercase text-[#9CA3AF]">Spesifikasi</p>
            <p class="whitespace-pre-wrap rounded-xl bg-[#F9FAFB] p-3 text-[13px] text-[#374151]">
              {{ selectedAsset.spesifikasi || '—' }}
            </p>
          </div>
          <div>
            <p class="mb-1 text-[10px] font-bold uppercase text-[#9CA3AF]">Catatan Aset</p>
            <p class="whitespace-pre-wrap rounded-xl bg-[#FFFDF5] p-3 text-[13px] text-[#374151]">
              {{ selectedAsset.catatan_aset || '—' }}
            </p>
          </div>
        </div>

        <!-- Tab 2: Log Perubahan -->
        <div v-if="detailsTab === 'logs'" class="space-y-3">
          <!-- Loading -->
          <div v-if="isLoadingLogs" class="flex flex-col items-center justify-center py-12 gap-2">
            <span class="material-symbols-outlined text-[28px] text-brand animate-spin"
              >progress_activity</span
            >
            <p class="text-[11px] font-semibold text-[#6B7280]">Memuat log perubahan...</p>
          </div>

          <!-- Empty State -->
          <div
            v-else-if="deviceLogs.length === 0"
            class="flex flex-col items-center justify-center py-12 gap-3"
          >
            <span class="material-symbols-outlined text-[36px] text-[#D1D5DB]"
              >history_toggle_off</span
            >
            <p class="text-[12px] font-semibold text-[#9CA3AF]">
              Belum ada riwayat perubahan untuk perangkat ini.
            </p>
          </div>

          <!-- Timeline Log -->
          <div v-else class="relative">
            <!-- Timeline line -->
            <div
              class="absolute left-[15px] top-2 bottom-2 w-[2px] bg-[#E5E7EB] rounded-full"
            ></div>

            <div
              v-for="log in deviceLogs"
              :key="log.id"
              class="relative flex gap-4 pl-1 pb-4 last:pb-0"
            >
              <!-- Timeline dot -->
              <div
                class="relative z-10 mt-1 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border-2 border-white shadow-sm"
                :class="{
                  'bg-[#ECFDF5] text-[#059669]': log.aksi === 'TAMBAH',
                  'bg-[#FFF8E6] text-[#D97706]': log.aksi === 'UBAH',
                  'bg-[#FEF2F2] text-[#DC2626]': log.aksi === 'HAPUS',
                }"
              >
                <span class="material-symbols-outlined text-[14px]">
                  {{
                    log.aksi === 'TAMBAH' ? 'add_circle' : log.aksi === 'UBAH' ? 'edit' : 'delete'
                  }}
                </span>
              </div>

              <!-- Log Content -->
              <div class="flex-1 rounded-xl border border-[#F3F4F6] bg-[#FAFBFC] p-3">
                <div class="flex items-center justify-between gap-2 mb-2">
                  <AppBadge
                    :type="
                      getStatusBadgeType(
                        log.aksi === 'TAMBAH'
                          ? 'tersedia'
                          : log.aksi === 'UBAH'
                            ? 'maintenance'
                            : 'rusak',
                      )
                    "
                    :text="log.aksi"
                  />
                  <span class="text-[10px] font-mono text-[#9CA3AF]">{{
                    formatLogDate(log.dibuat_pada)
                  }}</span>
                </div>

                <!-- UBAH: Table with old -> new -->
                <table
                  v-if="
                    log.aksi === 'UBAH' &&
                    parsePerubahan(log.perubahan, log.aksi).length &&
                    parsePerubahan(log.perubahan, log.aksi)[0].old !== undefined
                  "
                  class="w-full text-[10px] border-collapse"
                >
                  <thead>
                    <tr class="border-b border-[#E5E7EB]">
                      <th
                        class="py-1 pr-2 text-left font-bold text-[#9CA3AF] uppercase tracking-wider w-28"
                      >
                        Field
                      </th>
                      <th
                        class="py-1 px-2 text-left font-bold text-[#9CA3AF] uppercase tracking-wider"
                      >
                        Sebelum
                      </th>
                      <th
                        class="py-1 pl-2 text-left font-bold text-[#9CA3AF] uppercase tracking-wider"
                      >
                        Sesudah
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="(row, idx) in parsePerubahan(log.perubahan, log.aksi)"
                      :key="idx"
                      class="border-b border-[#F3F4F6] last:border-0"
                    >
                      <td class="py-1.5 pr-2 font-bold text-[#475569]">{{ row.field }}</td>
                      <td class="py-1.5 px-2 text-[#DC2626] line-through">{{ row.old }}</td>
                      <td class="py-1.5 pl-2 font-semibold text-[#059669]">{{ row.new }}</td>
                    </tr>
                  </tbody>
                </table>

                <!-- TAMBAH: Key-value detail list -->
                <table
                  v-else-if="
                    log.aksi === 'TAMBAH' && parsePerubahan(log.perubahan, log.aksi).length > 1
                  "
                  class="w-full text-[10px] border-collapse"
                >
                  <tbody>
                    <tr
                      v-for="(row, idx) in parsePerubahan(log.perubahan, log.aksi)"
                      :key="idx"
                      class="border-b border-[#F3F4F6] last:border-0"
                    >
                      <td
                        class="py-1.5 pr-2 font-bold text-[#9CA3AF] uppercase tracking-wider w-28"
                      >
                        {{ row.field }}
                      </td>
                      <td class="py-1.5 font-semibold text-[#374151]">{{ row.value }}</td>
                    </tr>
                  </tbody>
                </table>

                <!-- Fallback: plain text -->
                <p v-else class="text-[11px] font-medium leading-relaxed text-[#374151]">
                  {{ log.perubahan }}
                </p>

                <p class="mt-2 text-[10px] font-bold text-[#94A3B8]">
                  <span class="material-symbols-outlined text-[12px] align-text-bottom mr-0.5"
                    >person</span
                  >
                  {{ log.oleh_pengguna }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="flex justify-end border-t border-[#F3F4F6] pt-3 mt-4">
          <button
            type="button"
            @click="closeModal"
            class="h-9 rounded-lg bg-[#111827] px-5 text-[13px] font-bold text-white"
          >
            Tutup
            </button>
        </div>
      </div>
    </AppModal>

    <AppModal :is-open="showExportModal" title="Ekspor Aset IT" size="md" @close="closeModal">
      <form class="flex flex-col gap-4" @submit.prevent="executeExport">
        <fieldset class="flex flex-col gap-2">
          <legend class="text-[11px] font-bold uppercase tracking-wider text-[#374151] mb-2">
            Pilih Format Ekspor
          </legend>
          <div class="grid grid-cols-2 gap-3">
            <label
              class="flex cursor-pointer items-center justify-between rounded-xl border p-3.5 transition-colors"
              :class="
                exportFormat === 'csv'
                  ? 'border-brand bg-brand-light'
                  : 'border-[#DCE3EC] bg-white hover:bg-[#F8FAFC]'
              "
            >
              <span class="flex items-center gap-2">
                <span class="material-symbols-outlined text-[20px] text-[#0B9B6C]">table_view</span>
                <span class="text-[12px] font-bold text-[#172033]">CSV (Excel)</span>
              </span>
              <input
                v-model="exportFormat"
                type="radio"
                name="exportFormat"
                value="csv"
                class="accent-brand"
              />
            </label>
            <label
              class="flex cursor-pointer items-center justify-between rounded-xl border p-3.5 transition-colors"
              :class="
                exportFormat === 'pdf'
                  ? 'border-brand bg-brand-light'
                  : 'border-[#DCE3EC] bg-white hover:bg-[#F8FAFC]'
              "
            >
              <span class="flex items-center gap-2">
                <span class="material-symbols-outlined text-[20px] text-[#DC4C4C]"
                  >picture_as_pdf</span
                >
                <span class="text-[12px] font-bold text-[#172033]">PDF Laporan</span>
              </span>
              <input
                v-model="exportFormat"
                type="radio"
                name="exportFormat"
                value="pdf"
                class="accent-brand"
              />
            </label>
          </div>
        </fieldset>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label class="flex flex-col gap-1.5">
            <span class="text-[11px] font-bold uppercase tracking-wider text-[#374151]"
              >Filter Status</span
            >
            <select v-model="exportStatus" class="form-control">
              <option value="">Semua Status</option>
              <option v-for="status in availableStatusOptions" :key="status" :value="status">
                {{ status }}
              </option>
            </select>
          </label>
          <label class="flex flex-col gap-1.5">
            <span class="text-[11px] font-bold uppercase tracking-wider text-[#374151]"
              >Filter Tipe Perangkat</span
            >
            <select v-model="exportTipe" class="form-control">
              <option value="">Semua Tipe</option>
              <option v-for="tipe in availableTipeOptions" :key="tipe" :value="tipe">
                {{ tipe }}
              </option>
            </select>
          </label>
        </div>

        <div class="flex justify-end gap-3 border-t border-[#F3F4F6] pt-4 mt-2">
          <button
            type="button"
            @click="closeModal"
            class="h-10 rounded-xl border border-[#DCE3EC] px-5 text-[12px] font-semibold text-[#475569] hover:bg-[#F8FAFC]"
          >
            Batal
            </button>
          <button
            type="submit"
            :disabled="isExporting"
            class="h-10 rounded-xl bg-brand px-5 text-[12px] font-bold text-white shadow-md shadow-brand/20 hover:bg-brand-dark disabled:opacity-50"
          >
            {{ isExporting ? 'Mengekspor...' : 'Unduh File' }}
            </button>
        </div>
      </form>
    </AppModal>

    <!-- Modal Import Excel -->
    <AppImportModal
      :is-open="showImportModal"
      @close="showImportModal = false"
      @imported="onImported"
    />
  </div>
</template>

<style scoped>
.form-control {
  height: 2.625rem;
  border: 1px solid #dce3ec;
  border-radius: 0.75rem;
  background: #ffffff;
  padding-left: 0.75rem;
  padding-right: 0.75rem;
  font-size: 0.6875rem;
  color: #334155;
  outline: none;
}
.form-control:focus {
  border-color: var(--color-brand);
  box-shadow: 0 0 0 3px rgb(9 124 222 / 10%);
}
</style>
