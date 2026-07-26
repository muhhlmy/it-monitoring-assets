<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApi } from '../composables/useApi.js'
import { downloadAssetsCsv } from '../utils/exportAssetsCsv.js'
import { downloadAssetsPdf } from '../utils/exportAssetsPdf.js'
import AppModal from '../components/ui/AppModal.vue'
import AppBadge from '../components/ui/AppBadge.vue'
import SearchableSelect from '../components/ui/SearchableSelect.vue'

const { get, post, put, del } = useApi()
const route = useRoute()
const router = useRouter()

const assets = ref([])
const employees = ref([])
const locations = ref([])
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
const deviceLogs = ref([])
const isLoadingLogs = ref(false)

const emptyForm = () => ({
  nomor_seri: '',
  label_aset: '',
  spesifikasi: '',
  nik: '',
  lokasi_aset: '',
  tipe_perangkat: '',
  merek: '',
  model: '',
  status_aset: 'Tersedia',
  kondisi_aset: 'Baik',
  catatan_aset: '',
})

const form = ref(emptyForm())
const statusOptions = ['Tersedia', 'Digunakan', 'Maintenance', 'Rusak', 'Disposal']
const kondisiOptions = ['Baru', 'Baik', 'Cukup', 'Rusak Ringan', 'Rusak Berat', 'Perlu Servis']
const tipeOptions = ['Laptop', 'Desktop', 'Server', 'Printer', 'Network Device', 'Monitor', 'Lainnya']
const brandOptions = ['Lenovo', 'HP', 'Dell', 'Apple', 'Asus', 'Acer', 'Samsung', 'Cisco', 'APC', 'Lainnya']

function mergeOptions(defaults, values) {
  return [...new Set([...defaults, ...values.filter(Boolean)])]
}

const availableStatusOptions = computed(() =>
  mergeOptions(statusOptions, [form.value.status_aset, ...assets.value.map((asset) => asset.status_aset)]),
)
const availableKondisiOptions = computed(() =>
  mergeOptions(kondisiOptions, [form.value.kondisi_aset, ...assets.value.map((asset) => asset.kondisi_aset)]),
)
const availableTipeOptions = computed(() =>
  mergeOptions(tipeOptions, [form.value.tipe_perangkat, ...assets.value.map((asset) => asset.tipe_perangkat)]),
)
const availableBrandOptions = computed(() =>
  mergeOptions(brandOptions, [form.value.merek, ...assets.value.map((asset) => asset.merek)]),
)
const locationOptions = computed(() =>
  locations.value.map((loc) => ({ value: loc, label: loc })),
)

const filteredAssets = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase('id-ID')
  return assets.value.filter((asset) => {
    const searchable = [
      asset.id_aset, asset.nomor_seri, asset.label_aset, asset.spesifikasi, asset.nik,
      asset.nama_karyawan, asset.departemen, asset.lokasi_kerja, asset.lokasi_aset, asset.tipe_perangkat,
      asset.merek, asset.model, asset.status_aset, asset.kondisi_aset, asset.catatan_aset,
    ].join(' ').toLocaleLowerCase('id-ID')
    return (!query || searchable.includes(query))
      && (!filterStatus.value || asset.status_aset === filterStatus.value)
      && (!filterTipe.value || asset.tipe_perangkat === filterTipe.value)
  })
})

const assignedAssetsCount = computed(() =>
  assets.value.filter((asset) => Boolean(asset.nik)).length,
)

const availableAssetsCount = computed(() =>
  assets.value.filter((asset) => (asset.status_aset || '').toLowerCase() === 'tersedia').length,
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
    assets.value = assetData
    employees.value = employeeData
    locations.value = Array.isArray(locationData) ? locationData : []
  } catch (error) {
    pageError.value = error.message || 'Gagal memuat data aset.'
  } finally {
    isLoading.value = false
  }
}

function openAdd() {
  modalMode.value = 'add'
  selectedAsset.value = null
  form.value = emptyForm()
  modalError.value = ''
  showFormModal.value = true
}

function openEdit(asset) {
  modalMode.value = 'edit'
  selectedAsset.value = asset
  const assetForm = Object.fromEntries(
    Object.keys(emptyForm()).map((key) => [key, asset[key] ?? '']),
  )
  form.value = {
    ...assetForm,
    lokasi_aset: asset.lokasi_aset ?? asset.lokasi_kerja ?? '',
  }
  modalError.value = ''
  showFormModal.value = true
}

function openDelete(asset) {
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
  return Object.fromEntries(Object.entries(form.value).map(([key, value]) => [
    key,
    typeof value === 'string' ? value.trim() : value,
  ]))
}

async function saveAsset() {
  const payload = buildPayload()
  if (!payload.label_aset) {
    modalError.value = 'Label aset wajib diisi.'
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
  if (!selectedAsset.value) return
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
  return {
    digunakan: 'success', tersedia: 'info', maintenance: 'warning',
    rusak: 'danger', disposal: 'default',
  }[(status || '').toLowerCase()] || 'default'
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

function parsePerubahan(perubahan, aksi) {
  if (!perubahan) return []

  if (aksi === 'UBAH' && perubahan.startsWith('Perubahan data: ')) {
    // Format: "Perubahan data: Field1: old -> new, Field2: old -> new"
    const body = perubahan.replace('Perubahan data: ', '')
    // Split by ', ' but be careful with values that might contain commas
    // Use regex to split on ', ' followed by a known field label pattern
    const parts = body.split(/,\s*(?=[A-Z])/)
    return parts.map((part) => {
      const arrowIdx = part.indexOf(' -> ')
      if (arrowIdx === -1) return { field: part, old: '', new: '' }
      const colonIdx = part.indexOf(': ')
      if (colonIdx === -1) return { field: part, old: '', new: '' }
      const field = part.substring(0, colonIdx).trim()
      const oldVal = part.substring(colonIdx + 2, arrowIdx).trim()
      const newVal = part.substring(arrowIdx + 4).trim()
      return { field, old: oldVal, new: newVal }
    }).filter((r) => r.field)
  }

  if (aksi === 'TAMBAH' && perubahan.startsWith('Aset baru didaftarkan')) {
    // Format: "Aset baru didaftarkan dengan nomor seri X, tipe: Y, merek: Z, status: A, kondisi: B."
    const items = []
    const match = perubahan.match(/nomor seri (.+?),/)
    if (match) items.push({ field: 'Nomor Seri', value: match[1] })
    const pairs = perubahan.matchAll(/(?:tipe|merek|status|kondisi):\s*([^,\.]+)/gi)
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
  toastTimer = window.setTimeout(() => { notification.value = null }, 3500)
}

watch(() => route.query.q, (query) => {
  searchQuery.value = typeof query === 'string' ? query : ''
}, { immediate: true })

onMounted(async () => {
  await fetchData()
  if (route.query.action === 'add') {
    openAdd()
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
      <div v-if="notification" :role="notification.type === 'error' ? 'alert' : 'status'"
        class="fixed left-4 right-4 top-4 z-[60] flex items-center gap-3 rounded-xl px-4 py-3 text-white shadow-2xl sm:left-auto sm:right-5 sm:max-w-md"
        :class="notification.type === 'error' ? 'bg-[#B91C1C]' : notification.type === 'warning' ? 'bg-[#92400E]' : 'bg-[#111827]'">
        <span class="material-symbols-outlined text-[18px]">{{ notification.type === 'error' ? 'error' : 'check_circle' }}</span>
        <span class="text-[13px] font-semibold">{{ notification.message }}</span>
      </div>
    </Transition>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div class="shadow-card flex items-center gap-4 rounded-2xl border border-[#D2E3FF] bg-[#ECF2FF] p-5">
        <span class="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-[#5D87FF] shadow-xs"><span class="material-symbols-outlined text-[22px]">inventory_2</span></span>
        <div><p class="font-num text-[26px] font-extrabold leading-none text-[#2A3547]">{{ assets.length }}</p><p class="mt-1 text-[10px] font-bold uppercase tracking-wider text-[#7C8BAC]">Total Aset IT</p></div>
      </div>
      <div class="shadow-card flex items-center gap-4 rounded-2xl border border-[#C3F3E8] bg-[#EDFBF7] p-5">
        <span class="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-[#13DEB9] shadow-xs"><span class="material-symbols-outlined text-[22px]">assignment_ind</span></span>
        <div><p class="font-num text-[26px] font-extrabold leading-none text-[#2A3547]">{{ assignedAssetsCount }}</p><p class="mt-1 text-[10px] font-bold uppercase tracking-wider text-[#7C8BAC]">Sudah Dialokasikan</p></div>
      </div>
      <div class="shadow-card flex items-center gap-4 rounded-2xl border border-[#C8EDFF] bg-[#E8F7FF] p-5">
        <span class="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-[#49BEFF] shadow-xs"><span class="material-symbols-outlined text-[22px]">deployed_code</span></span>
        <div><p class="font-num text-[26px] font-extrabold leading-none text-[#2A3547]">{{ availableAssetsCount }}</p><p class="mt-1 text-[10px] font-bold uppercase tracking-wider text-[#7C8BAC]">Siap Digunakan</p></div>
      </div>
    </div>

    <div class="shadow-card grid min-w-0 grid-cols-2 items-center gap-3 rounded-2xl border border-[#E5EAEF] bg-white p-4 sm:flex sm:flex-wrap">
      <div class="relative col-span-2 min-w-0 sm:min-w-[260px] sm:flex-1">
        <label for="asset-search" class="sr-only">Cari aset</label>
        <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-[#7C8BAC]">search</span>
        <input id="asset-search" v-model="searchQuery" type="search" autocomplete="off"
          placeholder="Cari label, serial, karyawan, tipe, merek..."
          class="h-10 w-full rounded-xl border border-[#DFE5EF] bg-[#F8FAFC] pl-9 pr-4 text-[12px] font-medium text-[#2A3547] focus:border-[#5D87FF] focus:bg-white focus:outline-none" />
      </div>
      <select v-model="filterStatus" aria-label="Filter status aset" class="h-10 min-w-0 rounded-xl border border-[#DFE5EF] bg-white px-3 text-[12px] font-semibold text-[#2A3547]">
        <option value="">Semua Status</option>
        <option v-for="status in availableStatusOptions" :key="status" :value="status">{{ status }}</option>
      </select>
      <select v-model="filterTipe" aria-label="Filter tipe perangkat" class="h-10 min-w-0 rounded-xl border border-[#DFE5EF] bg-white px-3 text-[12px] font-semibold text-[#2A3547]">
        <option value="">Semua Tipe</option>
        <option v-for="tipe in availableTipeOptions" :key="tipe" :value="tipe">{{ tipe }}</option>
      </select>
      <button v-if="searchQuery || filterStatus || filterTipe" type="button" @click="resetFilters" class="h-10 rounded-xl border border-[#FA896B]/30 bg-[#FDEDE8] px-4 text-[12px] font-bold text-[#FA896B] hover:bg-[#FA896B] hover:text-white transition-all">Reset</button>
      <button type="button" @click="openExport" class="h-10 rounded-xl border border-[#DFE5EF] bg-white px-4 text-[12px] font-bold text-[#2A3547] hover:bg-[#F8FAFC] transition-all">
        Ekspor Data
      </button>
      <button type="button" @click="openAdd" class="col-span-2 flex h-10 items-center justify-center gap-2 rounded-xl bg-[#5D87FF] px-5 text-[12px] font-bold text-white shadow-md shadow-blue-500/20 hover:bg-[#4570EA] transition-all">
        <span class="material-symbols-outlined text-[18px]">add</span> Tambah Aset
      </button>
    </div>

    <div class="shadow-card overflow-hidden rounded-2xl border border-[#E5EAEF] bg-white">
      <div v-if="isLoading" role="status" class="flex items-center justify-center gap-3 py-16 text-[13px] text-[#7C8BAC]">
        <span class="h-8 w-8 animate-spin rounded-full border-4 border-[#E5EAEF] border-t-[#5D87FF]"></span> Memuat data aset...
      </div>
      <div v-else-if="pageError" role="alert" class="flex items-center gap-2 bg-[#FDEDE8] px-5 py-4 text-[13px] text-[#FA896B]">
        <span class="material-symbols-outlined text-[18px]">error</span><span class="flex-1">{{ pageError }}</span>
        <button type="button" class="font-bold underline" @click="fetchData">Coba lagi</button>
      </div>
      <div v-else class="overflow-x-auto" tabindex="0" aria-label="Tabel view daftar aset TI lengkap">
        <table class="w-full min-w-[1450px]">
          <caption class="sr-only">Isi view daftar_aset_ti_lengkap</caption>
          <thead class="sticky top-0 z-10"><tr class="border-b border-[#E5EAEF] bg-[#F8FAFC]">
            <th class="px-4 py-3 text-left text-[11px] font-bold uppercase text-[#7C8BAC]">Serial Number / Label</th>
            <th class="px-4 py-3 text-left text-[11px] font-bold uppercase text-[#7C8BAC]">Spesifikasi</th>
            <th class="px-4 py-3 text-left text-[11px] font-bold uppercase text-[#7C8BAC]">NIK / Karyawan</th>
            <th class="px-4 py-3 text-left text-[11px] font-bold uppercase text-[#7C8BAC]">Departemen</th>
            <th class="px-4 py-3 text-left text-[11px] font-bold uppercase text-[#7C8BAC]">Lokasi Aset</th>
            <th class="px-4 py-3 text-left text-[11px] font-bold uppercase text-[#7C8BAC]">Tipe Perangkat</th>
            <th class="px-4 py-3 text-left text-[11px] font-bold uppercase text-[#7C8BAC]">Status</th>
            <th class="px-4 py-3 text-left text-[11px] font-bold uppercase text-[#7C8BAC]">Kondisi</th>
            <th class="px-4 py-3 text-right text-[11px] font-bold uppercase text-[#7C8BAC]">Aksi</th>
          </tr></thead>
          <tbody class="divide-y divide-[#F1F5F9]">
            <tr v-for="asset in filteredAssets" :key="asset.id_aset" class="hover:bg-[#F8FAFC]">
              <td class="px-4 py-3"><div class="flex items-center gap-3">
                <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#ECF2FF] text-[#5D87FF]"><span class="material-symbols-outlined text-[18px]">{{ getDeviceIcon(asset.tipe_perangkat) }}</span></div>
                <div><p class="font-mono text-[12px] font-bold text-[#2A3547]">{{ asset.nomor_seri || '—' }}</p><p class="mt-0.5 text-[10px] font-semibold text-[#7C8BAC]">{{ asset.label_aset }}</p></div>
              </div></td>
              <td class="px-4 py-3">
                <div class="flex flex-col gap-1.5">
                  <div v-if="asset.merek || asset.model" class="text-[12px] font-bold text-[#2A3547]">
                    {{ [asset.merek, asset.model].filter(Boolean).join(' ') }}
                  </div>
                  <button
                    type="button"
                    class="inline-flex h-7 w-fit items-center gap-1 rounded-lg border border-[#D2E3FF] bg-[#ECF2FF] px-2.5 text-[11px] font-bold text-[#5D87FF] hover:bg-[#5D87FF] hover:text-white transition-all"
                    @click="openSpecification(asset)"
                  >
                    <span aria-hidden="true" class="material-symbols-outlined text-[14px]">description</span>
                    Lihat Spesifikasi
                  </button>
                </div>
              </td>
              <td class="px-4 py-3"><p class="text-[12px] font-bold text-[#2A3547]">{{ asset.nama_karyawan || 'Belum ditetapkan' }}</p><p class="font-mono text-[11px] text-[#7C8BAC]">{{ asset.nik || '—' }}</p></td>
              <td class="px-4 py-3 text-[12px] text-[#2A3547]">{{ asset.departemen || '—' }}</td>
              <td class="px-4 py-3 text-[12px] text-[#2A3547]">{{ asset.lokasi_kerja || '—' }}</td>
              <td class="px-4 py-3 text-[12px] text-[#2A3547]">{{ asset.tipe_perangkat || '—' }}</td>
              <td class="px-4 py-3"><AppBadge :type="getStatusBadgeType(asset.status_aset)" :text="asset.status_aset || '—'" /></td>
              <td class="px-4 py-3 text-[12px] font-semibold text-[#2A3547]">{{ asset.kondisi_aset || '—' }}</td>
              <td class="px-4 py-3"><div class="flex justify-end gap-1.5">
                <button type="button" @click="openDetails(asset)" class="flex h-8 w-8 items-center justify-center rounded-lg bg-[#ECF2FF] text-[#5D87FF] hover:bg-[#5D87FF] hover:text-white transition-all" :aria-label="`Detail ${asset.label_aset}`"><span class="material-symbols-outlined text-[16px]">visibility</span></button>
                <button type="button" @click="openEdit(asset)" class="flex h-8 w-8 items-center justify-center rounded-lg bg-[#E8F7FF] text-[#49BEFF] hover:bg-[#49BEFF] hover:text-white transition-all" :aria-label="`Edit ${asset.label_aset}`"><span class="material-symbols-outlined text-[16px]">edit</span></button>
                <button type="button" @click="openDelete(asset)" class="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FDEDE8] text-[#FA896B] hover:bg-[#FA896B] hover:text-white transition-all" :aria-label="`Hapus ${asset.label_aset}`"><span class="material-symbols-outlined text-[16px]">delete</span></button>
              </div></td>
            </tr>
            <tr v-if="filteredAssets.length === 0"><td colspan="9" class="px-5 py-12 text-center text-[13px] text-[#7C8BAC]">Tidak ada aset yang sesuai.</td></tr>
          </tbody>
        </table>
      </div>
      <div v-if="!isLoading && !pageError" class="border-t border-[#E5EAEF] bg-[#F8FAFC] px-5 py-3 text-[11px] text-[#7C8BAC]">
        Menampilkan <strong class="text-[#2A3547]">{{ filteredAssets.length }}</strong> dari <strong class="text-[#2A3547]">{{ assets.length }}</strong> aset — sumber: <code>daftar_aset_ti_lengkap</code>
      </div>
    </div>

    <AppModal :is-open="showFormModal" :title="modalMode === 'add' ? 'Tambah Aset IT' : 'Edit Aset IT'" size="lg" @close="closeModal">
      <form class="flex flex-col gap-4" @submit.prevent="saveAsset">
        <div v-if="modalError" role="alert" class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{{ modalError }}</div>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label class="flex flex-col gap-1.5"><span class="text-[11px] font-bold uppercase text-[#374151]">Label Aset *</span><input v-model="form.label_aset" required autofocus maxlength="100" placeholder="ESB-LAP-013" class="form-control" /></label>
          <label class="flex flex-col gap-1.5"><span class="text-[11px] font-bold uppercase text-[#374151]">Nomor Seri</span><input v-model="form.nomor_seri" maxlength="100" placeholder="Nomor seri perangkat" class="form-control" /></label>
          <label class="flex flex-col gap-1.5 sm:col-span-2"><span class="text-[11px] font-bold uppercase text-[#374151]">Spesifikasi</span><textarea v-model="form.spesifikasi" rows="2" placeholder="Spesifikasi perangkat" class="form-control h-auto py-2"></textarea></label>
          <label class="flex flex-col gap-1.5 sm:col-span-2">
            <span class="text-[11px] font-bold uppercase text-[#374151]">Penempatan Aset *</span>
            <SearchableSelect
              v-model="form.lokasi_aset"
              :options="locationOptions"
              value-key="value"
              label-key="label"
              placeholder="Pilih lokasi penempatan aset"
              search-placeholder="Cari lokasi..."
            />
          </label>
          <label class="flex flex-col gap-1.5 sm:col-span-2">
            <span class="text-[11px] font-bold uppercase text-[#374151]">Pemegang Aset</span>
            <SearchableSelect
              v-model="form.nik"
              :options="employees"
              value-key="nik"
              label-key="nama_karyawan"
              secondary-label-key="nik"
              placeholder="Pilih pemegang aset"
              search-placeholder="Cari nama atau NIK..."
              clearable
            />
          </label>
          <label class="flex flex-col gap-1.5"><span class="text-[11px] font-bold uppercase text-[#374151]">Tipe Perangkat</span><select v-model="form.tipe_perangkat" class="form-control"><option value="">Pilih tipe</option><option v-for="type in availableTipeOptions" :key="type">{{ type }}</option></select></label>
          <label class="flex flex-col gap-1.5"><span class="text-[11px] font-bold uppercase text-[#374151]">Merek</span><select v-model="form.merek" class="form-control"><option value="">Pilih merek</option><option v-for="brand in availableBrandOptions" :key="brand">{{ brand }}</option></select></label>
          <label class="flex flex-col gap-1.5"><span class="text-[11px] font-bold uppercase text-[#374151]">Model</span><input v-model="form.model" maxlength="100" placeholder="Model perangkat" class="form-control" /></label>
          <label class="flex flex-col gap-1.5"><span class="text-[11px] font-bold uppercase text-[#374151]">Status Aset</span><select v-model="form.status_aset" class="form-control"><option v-for="status in availableStatusOptions" :key="status">{{ status }}</option></select></label>
          <label class="flex flex-col gap-1.5"><span class="text-[11px] font-bold uppercase text-[#374151]">Kondisi Aset</span><select v-model="form.kondisi_aset" class="form-control"><option v-for="condition in availableKondisiOptions" :key="condition">{{ condition }}</option></select></label>
          <label class="flex flex-col gap-1.5 sm:col-span-2"><span class="text-[11px] font-bold uppercase text-[#374151]">Catatan Aset</span><textarea v-model="form.catatan_aset" rows="2" placeholder="Catatan tambahan" class="form-control h-auto py-2"></textarea></label>
        </div>
        <div class="flex justify-end gap-3 border-t border-[#F3F4F6] pt-3">
          <button type="button" :disabled="isSubmitting" @click="closeModal" class="h-10 rounded-xl border border-[#DCE3EC] px-5 text-[12px] font-semibold text-[#475569] hover:bg-[#F8FAFC]">Batal</button>
          <button type="submit" :disabled="isSubmitting" class="h-10 rounded-xl bg-brand px-5 text-[12px] font-bold text-white shadow-md shadow-brand/20 hover:bg-brand-dark disabled:opacity-50">{{ isSubmitting ? 'Menyimpan...' : 'Simpan' }}</button>
        </div>
      </form>
    </AppModal>

    <AppModal :is-open="showDeleteModal" title="Hapus Aset IT" size="sm" @close="closeModal">
      <div class="flex flex-col items-center gap-4 text-center">
        <div v-if="modalError" role="alert" class="w-full rounded-lg bg-red-50 px-3 py-2 text-left text-[12px] text-red-700">{{ modalError }}</div>
        <div class="flex h-14 w-14 items-center justify-center rounded-full bg-red-50"><span class="material-symbols-outlined text-[28px] text-[#EF4444]">warning</span></div>
        <div><h4 class="text-[15px] font-black text-[#111827]">Hapus {{ selectedAsset?.label_aset }}?</h4><p class="mt-1 text-[12px] text-[#9CA3AF]">Data aset akan dihapus permanen.</p></div>
        <div class="flex w-full gap-3"><button type="button" :disabled="isSubmitting" @click="closeModal" class="h-10 flex-1 rounded-lg border">Batal</button><button type="button" :disabled="isSubmitting" @click="deleteAsset" class="h-10 flex-1 rounded-lg bg-[#EF4444] font-bold text-white">{{ isSubmitting ? 'Menghapus...' : 'Ya, Hapus' }}</button></div>
      </div>
    </AppModal>

    <AppModal :is-open="showSpecificationModal" title="Detail Spesifikasi" size="md" @close="closeModal">
      <div v-if="selectedAsset" class="space-y-4">
        <div class="flex items-center gap-3 rounded-2xl border border-[#E8EDF3] bg-[#F8FAFC] p-4">
          <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
            <span aria-hidden="true" class="material-symbols-outlined text-[21px]">{{ getDeviceIcon(selectedAsset.tipe_perangkat) }}</span>
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

    <AppModal :is-open="showDetailsModal" title="Detail Aset" size="lg" @close="closeModal">
      <div v-if="selectedAsset" class="flex flex-col gap-0">
        <!-- Header Aset -->
        <div class="flex items-center gap-3 pb-4">
          <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-white">
            <span class="material-symbols-outlined">{{ getDeviceIcon(selectedAsset.tipe_perangkat) }}</span>
          </div>
          <div>
            <p class="text-[10px] font-bold uppercase text-brand">ID #{{ selectedAsset.id_aset }}</p>
            <h4 class="text-[17px] font-black text-[#111827]">{{ selectedAsset.label_aset }}</h4>
          </div>
        </div>

        <!-- Tab Navigation -->
        <div class="flex border-b border-[#E2E8F0]/80 mb-4">
          <button
            type="button"
            @click="detailsTab = 'info'"
            class="flex items-center gap-2 px-4 py-3 text-[12px] font-bold transition-all duration-150 border-b-2 -mb-[2px]"
            :class="detailsTab === 'info'
              ? 'border-brand text-brand font-black'
              : 'border-transparent text-[#64748B] hover:text-[#172033]'"
          >
            <span class="material-symbols-outlined text-[16px]">info</span>
            Informasi Detail
          </button>
          <button
            type="button"
            @click="detailsTab = 'logs'"
            class="flex items-center gap-2 px-4 py-3 text-[12px] font-bold transition-all duration-150 border-b-2 -mb-[2px]"
            :class="detailsTab === 'logs'
              ? 'border-brand text-brand font-black'
              : 'border-transparent text-[#64748B] hover:text-[#172033]'"
          >
            <span class="material-symbols-outlined text-[16px]">history</span>
            Log Perubahan
            <span v-if="deviceLogs.length" class="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand/10 px-1.5 text-[10px] font-black text-brand">
              {{ deviceLogs.length }}
            </span>
          </button>
        </div>

        <!-- Tab 1: Info Detail -->
        <div v-if="detailsTab === 'info'" class="space-y-4">
          <dl class="grid grid-cols-1 gap-4 rounded-2xl border border-[#F3F4F6] p-4 sm:grid-cols-2">
            <div v-for="item in [
              ['Nomor Seri', selectedAsset.nomor_seri], ['Tipe Perangkat', selectedAsset.tipe_perangkat],
              ['Merek', selectedAsset.merek], ['Model', selectedAsset.model], ['Status Aset', selectedAsset.status_aset],
              ['Kondisi Aset', selectedAsset.kondisi_aset], ['NIK', selectedAsset.nik],
              ['Nama Karyawan', selectedAsset.nama_karyawan], ['Departemen', selectedAsset.departemen],
              ['Lokasi Aset', selectedAsset.lokasi_kerja]
            ]" :key="item[0]">
              <dt class="text-[10px] font-bold uppercase text-[#9CA3AF]">{{ item[0] }}</dt>
              <dd class="mt-1 text-[13px] font-semibold text-[#111827]">{{ item[1] || '—' }}</dd>
            </div>
          </dl>
          <div>
            <p class="mb-1 text-[10px] font-bold uppercase text-[#9CA3AF]">Spesifikasi</p>
            <p class="whitespace-pre-wrap rounded-xl bg-[#F9FAFB] p-3 text-[13px] text-[#374151]">{{ selectedAsset.spesifikasi || '—' }}</p>
          </div>
          <div>
            <p class="mb-1 text-[10px] font-bold uppercase text-[#9CA3AF]">Catatan Aset</p>
            <p class="whitespace-pre-wrap rounded-xl bg-[#FFFDF5] p-3 text-[13px] text-[#374151]">{{ selectedAsset.catatan_aset || '—' }}</p>
          </div>
        </div>

        <!-- Tab 2: Log Perubahan -->
        <div v-if="detailsTab === 'logs'" class="space-y-3">
          <!-- Loading -->
          <div v-if="isLoadingLogs" class="flex flex-col items-center justify-center py-12 gap-2">
            <span class="material-symbols-outlined text-[28px] text-brand animate-spin">progress_activity</span>
            <p class="text-[11px] font-semibold text-[#6B7280]">Memuat log perubahan...</p>
          </div>

          <!-- Empty State -->
          <div v-else-if="deviceLogs.length === 0" class="flex flex-col items-center justify-center py-12 gap-3">
            <span class="material-symbols-outlined text-[36px] text-[#D1D5DB]">history_toggle_off</span>
            <p class="text-[12px] font-semibold text-[#9CA3AF]">Belum ada riwayat perubahan untuk perangkat ini.</p>
          </div>

          <!-- Timeline Log -->
          <div v-else class="relative">
            <!-- Timeline line -->
            <div class="absolute left-[15px] top-2 bottom-2 w-[2px] bg-[#E5E7EB] rounded-full"></div>

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
                  {{ log.aksi === 'TAMBAH' ? 'add_circle' : log.aksi === 'UBAH' ? 'edit' : 'delete' }}
                </span>
              </div>

              <!-- Log Content -->
              <div class="flex-1 rounded-xl border border-[#F3F4F6] bg-[#FAFBFC] p-3">
                <div class="flex items-center justify-between gap-2 mb-2">
                  <AppBadge :type="getStatusBadgeType(log.aksi === 'TAMBAH' ? 'tersedia' : log.aksi === 'UBAH' ? 'maintenance' : 'rusak')" :text="log.aksi" />
                  <span class="text-[10px] font-mono text-[#9CA3AF]">{{ formatLogDate(log.dibuat_pada) }}</span>
                </div>

                <!-- UBAH: Table with old -> new -->
                <table v-if="log.aksi === 'UBAH' && parsePerubahan(log.perubahan, log.aksi).length && parsePerubahan(log.perubahan, log.aksi)[0].old !== undefined" class="w-full text-[10px] border-collapse">
                  <thead>
                    <tr class="border-b border-[#E5E7EB]">
                      <th class="py-1 pr-2 text-left font-bold text-[#9CA3AF] uppercase tracking-wider w-28">Field</th>
                      <th class="py-1 px-2 text-left font-bold text-[#9CA3AF] uppercase tracking-wider">Sebelum</th>
                      <th class="py-1 pl-2 text-left font-bold text-[#9CA3AF] uppercase tracking-wider">Sesudah</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, idx) in parsePerubahan(log.perubahan, log.aksi)" :key="idx" class="border-b border-[#F3F4F6] last:border-0">
                      <td class="py-1.5 pr-2 font-bold text-[#475569]">{{ row.field }}</td>
                      <td class="py-1.5 px-2 text-[#DC2626] line-through">{{ row.old }}</td>
                      <td class="py-1.5 pl-2 font-semibold text-[#059669]">{{ row.new }}</td>
                    </tr>
                  </tbody>
                </table>

                <!-- TAMBAH: Key-value detail list -->
                <table v-else-if="log.aksi === 'TAMBAH' && parsePerubahan(log.perubahan, log.aksi).length > 1" class="w-full text-[10px] border-collapse">
                  <tbody>
                    <tr v-for="(row, idx) in parsePerubahan(log.perubahan, log.aksi)" :key="idx" class="border-b border-[#F3F4F6] last:border-0">
                      <td class="py-1.5 pr-2 font-bold text-[#9CA3AF] uppercase tracking-wider w-28">{{ row.field }}</td>
                      <td class="py-1.5 font-semibold text-[#374151]">{{ row.value }}</td>
                    </tr>
                  </tbody>
                </table>

                <!-- Fallback: plain text -->
                <p v-else class="text-[11px] font-medium leading-relaxed text-[#374151]">{{ log.perubahan }}</p>

                <p class="mt-2 text-[10px] font-bold text-[#94A3B8]">
                  <span class="material-symbols-outlined text-[12px] align-text-bottom mr-0.5">person</span>
                  {{ log.oleh_pengguna }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="flex justify-end border-t border-[#F3F4F6] pt-3 mt-4">
          <button type="button" @click="closeModal" class="h-9 rounded-lg bg-[#111827] px-5 text-[13px] font-bold text-white">Tutup</button>
        </div>
      </div>
    </AppModal>

    <AppModal :is-open="showExportModal" title="Ekspor Aset IT" size="md" @close="closeModal">
      <form class="flex flex-col gap-4" @submit.prevent="executeExport">
        <fieldset class="flex flex-col gap-2">
          <legend class="text-[11px] font-bold uppercase tracking-wider text-[#374151] mb-2">Pilih Format Ekspor</legend>
          <div class="grid grid-cols-2 gap-3">
            <label class="flex cursor-pointer items-center justify-between rounded-xl border p-3.5 transition-colors" :class="exportFormat === 'csv' ? 'border-brand bg-brand-light' : 'border-[#DCE3EC] bg-white hover:bg-[#F8FAFC]'">
              <span class="flex items-center gap-2">
                <span class="material-symbols-outlined text-[20px] text-[#0B9B6C]">table_view</span>
                <span class="text-[12px] font-bold text-[#172033]">CSV (Excel)</span>
              </span>
              <input v-model="exportFormat" type="radio" name="exportFormat" value="csv" class="accent-brand" />
            </label>
            <label class="flex cursor-pointer items-center justify-between rounded-xl border p-3.5 transition-colors" :class="exportFormat === 'pdf' ? 'border-brand bg-brand-light' : 'border-[#DCE3EC] bg-white hover:bg-[#F8FAFC]'">
              <span class="flex items-center gap-2">
                <span class="material-symbols-outlined text-[20px] text-[#DC4C4C]">picture_as_pdf</span>
                <span class="text-[12px] font-bold text-[#172033]">PDF Laporan</span>
              </span>
              <input v-model="exportFormat" type="radio" name="exportFormat" value="pdf" class="accent-brand" />
            </label>
          </div>
        </fieldset>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label class="flex flex-col gap-1.5">
            <span class="text-[11px] font-bold uppercase tracking-wider text-[#374151]">Filter Status</span>
            <select v-model="exportStatus" class="form-control">
              <option value="">Semua Status</option>
              <option v-for="status in availableStatusOptions" :key="status" :value="status">{{ status }}</option>
            </select>
          </label>
          <label class="flex flex-col gap-1.5">
            <span class="text-[11px] font-bold uppercase tracking-wider text-[#374151]">Filter Tipe Perangkat</span>
            <select v-model="exportTipe" class="form-control">
              <option value="">Semua Tipe</option>
              <option v-for="tipe in availableTipeOptions" :key="tipe" :value="tipe">{{ tipe }}</option>
            </select>
          </label>
        </div>

        <div class="flex justify-end gap-3 border-t border-[#F3F4F6] pt-4 mt-2">
          <button type="button" @click="closeModal" class="h-10 rounded-xl border border-[#DCE3EC] px-5 text-[12px] font-semibold text-[#475569] hover:bg-[#F8FAFC]">Batal</button>
          <button type="submit" :disabled="isExporting" class="h-10 rounded-xl bg-brand px-5 text-[12px] font-bold text-white shadow-md shadow-brand/20 hover:bg-brand-dark disabled:opacity-50">
            {{ isExporting ? 'Mengekspor...' : 'Unduh File' }}
          </button>
        </div>
      </form>
    </AppModal>
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
.form-control:focus { border-color: var(--color-brand); box-shadow: 0 0 0 3px rgb(9 124 222 / 10%); }
</style>
