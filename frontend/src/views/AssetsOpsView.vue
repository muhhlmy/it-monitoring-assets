<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useApi } from '../composables/useApi.js'
import { useAuth } from '../composables/useAuth.js'
import { animateStagger } from '../composables/useGsap.js'
import { normalizeLocation } from '../utils/locationNormalizer.js'
import AppModal from '../components/ui/AppModal.vue'
import AppBadge from '../components/ui/AppBadge.vue'
import SearchableSelect from '../components/ui/SearchableSelect.vue'
import AppRowActions from '../components/ui/AppRowActions.vue'
import AppPagination from '../components/ui/AppPagination.vue'
import BaseSkeleton from '../components/ui/skeleton/BaseSkeleton.vue'
import SkeletonAvatar from '../components/ui/skeleton/SkeletonAvatar.vue'

const { get, post, put, del } = useApi()
const { isAdmin, isSuperAdmin, hasWritePermission } = useAuth()
const canWriteAssets = computed(
  () => isAdmin.value || isSuperAdmin.value || hasWritePermission('assets_ops') || hasWritePermission('assets'),
)

const assets = ref([])
const currentPage = ref(1)
const itemsPerPage = ref(10)
const isLoading = ref(true)
const pageError = ref('')

// Filter State
const searchQuery = ref('')
const selectedLocation = ref('')
const selectedKategori = ref('')
const selectedStatus = ref('')

// Modal States
const showFormModal = ref(false)
const showDeleteModal = ref(false)
const showDetailsModal = ref(false)
const modalMode = ref('add') // 'add' | 'edit'
const selectedAsset = ref(null)
const isSubmitting = ref(false)
const modalError = ref('')

// Opsi Pilihan Dropdown
const kategoriOptions = [
  'Point of Sales (POS)',
  'Self Service (KIOSK)',
  'Payment Terminal (EDC)',
  'Digital Display / Signage',
  'Barcode Scanner',
  'Kitchen Display (KDS)',
  'Lainnya',
]

const kondisiOptions = ['Baik', 'Rusak Ringan', 'Rusak Sedang', 'Rusak Berat']
const statusOptions = ['Aktif', 'Tidak Aktif', 'Maintenance', 'Rusak', 'Disposed']

const defaultLocations = [
  'Solo',
  'Pluit',
  'Gading Serpong',
  'Surabaya',
  'Bandung',
  'Medan',
  'Semarang',
  'Malang',
]

function mergeOptions(defaults, values) {
  return [...new Set([...defaults, ...values.filter(Boolean)])]
}

const locationOptions = computed(() =>
  mergeOptions(
    defaultLocations.map(normalizeLocation),
    [...assets.value.map((a) => a.lokasi), form.value.lokasi].map(normalizeLocation),
  ).map((loc) => ({ value: loc, label: loc })),
)

const kategoriSelectOptions = computed(() =>
  mergeOptions(
    kategoriOptions,
    [...assets.value.map((a) => a.kategori), form.value.kategori],
  ).map((k) => ({ value: k, label: k })),
)

// Form State
const emptyForm = () => ({
  hostname: '',
  nama_asset: '',
  kategori: 'Point of Sales (POS)',
  lokasi: 'Pluit',
  pic: '',
  tanggal_beli: '',
  total_asset_amount: 0,
  kondisi: 'Baik',
  status: 'Aktif',
})

const form = ref(emptyForm())

// Filtered & Paginated Assets
const filteredAssets = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase('id-ID')
  return assets.value.filter((asset) => {
    const searchable = [
      asset.id,
      asset.hostname,
      asset.nama_asset,
      asset.kategori,
      asset.lokasi,
      asset.pic,
      asset.kondisi,
      asset.status,
    ]
      .join(' ')
      .toLocaleLowerCase('id-ID')

    return (
      (!query || searchable.includes(query)) &&
      (!selectedLocation.value || asset.lokasi === selectedLocation.value) &&
      (!selectedKategori.value || asset.kategori === selectedKategori.value) &&
      (!selectedStatus.value || asset.status === selectedStatus.value)
    )
  })
})

const paginatedAssets = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value
  return filteredAssets.value.slice(start, start + itemsPerPage.value)
})

watch([searchQuery, selectedLocation, selectedKategori, selectedStatus], () => {
  currentPage.value = 1
})

function resetFilters() {
  searchQuery.value = ''
  selectedLocation.value = ''
  selectedKategori.value = ''
  selectedStatus.value = ''
}

// Lifecycle
onMounted(() => {
  fetchData()
})

async function fetchData() {
  isLoading.value = true
  pageError.value = ''
  try {
    const data = await get('/api/ops-assets')
    assets.value = (Array.isArray(data) ? data : []).map((a) => ({
      ...a,
      lokasi: normalizeLocation(a.lokasi),
    }))
  } catch (error) {
    pageError.value = error.message || 'Gagal memuat data Aset OPS.'
  } finally {
    isLoading.value = false
    await nextTick()
    animateStagger('.ops-row-grid')
  }
}

function openAdd() {
  if (!canWriteAssets.value) return
  modalMode.value = 'add'
  selectedAsset.value = null
  form.value = emptyForm()
  modalError.value = ''
  showFormModal.value = true
}

function openEdit(asset) {
  if (!canWriteAssets.value) return
  modalMode.value = 'edit'
  selectedAsset.value = asset
  form.value = {
    hostname: asset.hostname || '',
    nama_asset: asset.nama_asset || '',
    kategori: asset.kategori || 'Point of Sales (POS)',
    lokasi: asset.lokasi || 'Pluit',
    pic: asset.pic || '',
    tanggal_beli: asset.tanggal_beli ? asset.tanggal_beli.slice(0, 10) : '',
    total_asset_amount: asset.total_asset_amount || 0,
    kondisi: asset.kondisi || 'Baik',
    status: asset.status || 'Aktif',
  }
  modalError.value = ''
  showFormModal.value = true
}

function openDelete(asset) {
  if (!canWriteAssets.value) return
  selectedAsset.value = asset
  modalError.value = ''
  showDeleteModal.value = true
}

function openDetails(asset) {
  selectedAsset.value = asset
  showDetailsModal.value = true
}

function closeModal() {
  if (isSubmitting.value) return
  showFormModal.value = false
  showDeleteModal.value = false
  showDetailsModal.value = false
  selectedAsset.value = null
  modalError.value = ''
}

async function submitForm() {
  modalError.value = ''
  if (!form.value.hostname) {
    modalError.value = 'Hostname wajib diisi.'
    return
  }
  if (!form.value.nama_asset) {
    modalError.value = 'Nama Asset wajib diisi.'
    return
  }
  if (!form.value.kategori) {
    modalError.value = 'Kategori wajib diisi.'
    return
  }
  if (!form.value.lokasi) {
    modalError.value = 'Lokasi wajib diisi.'
    return
  }

  isSubmitting.value = true
  try {
    const payload = {
      ...form.value,
      lokasi: normalizeLocation(form.value.lokasi),
      total_asset_amount: parseFloat(form.value.total_asset_amount) || 0,
      tanggal_beli: form.value.tanggal_beli || null,
    }

    if (modalMode.value === 'add') {
      await post('/api/ops-assets', payload)
    } else {
      await put(`/api/ops-assets/${selectedAsset.value.id}`, payload)
    }
    closeModal()
    await fetchData()
  } catch (err) {
    modalError.value = err.message || 'Gagal menyimpan data Aset OPS.'
  } finally {
    isSubmitting.value = false
  }
}

async function confirmDelete() {
  if (!selectedAsset.value) return
  isSubmitting.value = true
  modalError.value = ''
  try {
    await del(`/api/ops-assets/${selectedAsset.value.id}`)
    closeModal()
    await fetchData()
  } catch (err) {
    modalError.value = err.message || 'Gagal menghapus Aset OPS.'
  } finally {
    isSubmitting.value = false
  }
}

function getOpsActions(asset) {
  const actions = [
    {
      label: 'Lihat Detail',
      icon: 'visibility',
      onClick: () => openDetails(asset),
      handler: () => openDetails(asset),
    },
  ]
  if (canWriteAssets.value) {
    actions.push({
      label: 'Edit Aset',
      icon: 'edit',
      onClick: () => openEdit(asset),
      handler: () => openEdit(asset),
    })
    actions.push({
      label: 'Hapus Aset',
      icon: 'delete',
      danger: true,
      onClick: () => openDelete(asset),
      handler: () => openDelete(asset),
    })
  }
  return actions
}

function getOpsIcon(kategori) {
  const value = (kategori || '').toLowerCase()
  if (value.includes('self service') || value.includes('kiosk')) return 'devices'
  if (value.includes('point of sale') || value.includes('pos')) return 'point_of_sale'
  if (value.includes('payment') || value.includes('edc')) return 'credit_card'
  if (value.includes('display') || value.includes('signage')) return 'desktop_windows'
  if (value.includes('barcode') || value.includes('scanner')) return 'qr_code_scanner'
  if (value.includes('kitchen') || value.includes('dapur')) return 'soup_kitchen'
  return 'precision_manufacturing'
}

function formatStatusPillOps(status) {
  switch (status) {
    case 'Aktif':
      return { text: 'text-[#166534]', bg: 'bg-[#DCFCE7]', dot: 'bg-[#15803D]' }
    case 'Maintenance':
      return { text: 'text-[#854D0E]', bg: 'bg-[#FEF9C3]', dot: 'bg-[#CA8A04]' }
    case 'Tidak Aktif':
      return { text: 'text-[#475569]', bg: 'bg-[#F1F5F9]', dot: 'bg-[#64748B]' }
    case 'Rusak':
      return { text: 'text-[#C2410C]', bg: 'bg-[#FFEDD5]', dot: 'bg-[#EA580C]' }
    case 'Disposed':
      return { text: 'text-[#991B1B]', bg: 'bg-[#FEE2E2]', dot: 'bg-[#DC2626]' }
    default:
      return { text: 'text-[#475569]', bg: 'bg-[#F1F5F9]', dot: 'bg-[#64748B]' }
  }
}

function formatCurrency(amount) {
  if (amount === undefined || amount === null || amount === '') return 'Rp 0'
  const num = Number(amount)
  if (isNaN(num)) return 'Rp 0'
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(num)
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return dateStr
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}
</script>

<template>
  <div class="space-y-4" :data-testid="!isLoading ? 'page-ready' : undefined">
    <!-- Simplified SaaS Header & Toolbar Container -->
    <div
      class="flex flex-col gap-3.5 bg-white p-4.5 rounded-2xl border border-[#E2E8F0]/80 shadow-2xs"
    >
      <!-- Row 1: Page Title & Primary CTA -->
      <div class="flex items-center justify-between gap-3">
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-lg font-bold text-[#0F172A] tracking-tight">Aset OPS</h2>
            <AppBadge variant="neutral" class="text-[11px] font-bold">
              {{ filteredAssets.length }} Total Unit
            </AppBadge>
          </div>
          <p class="text-xs text-[#64748B] mt-0.5 leading-normal">
            Kelola perangkat & mesin operasional outlet / store (POS, KIOSK, Payment, Display).
          </p>
        </div>

        <!-- Primary Action CTA -->
        <button
          v-if="canWriteAssets"
          type="button"
          @click="openAdd"
          class="h-9 shrink-0 whitespace-nowrap rounded-lg bg-[#2563EB] px-3.5 text-xs font-semibold text-white shadow-2xs hover:bg-[#1D4ED8] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          title="Tambah Aset OPS baru"
        >
          <span class="material-symbols-outlined text-[16px]">add</span>
          <span>Tambah Aset OPS</span>
        </button>
      </div>

      <!-- Row 2: Search, Filters & Actions -->
      <div class="flex flex-wrap items-center gap-2 w-full min-w-0 pt-2 border-t border-[#F1F5F9]">
        <!-- Search Input -->
        <div class="relative flex-1 min-w-[200px]">
          <span
            class="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[17px] text-[#94A3B8] pointer-events-none"
            >search</span
          >
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Cari hostname, nama asset, PIC, lokasi..."
            class="h-9 w-full rounded-lg border border-[#E2E8F0] bg-white pl-8 pr-2.5 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:border-[#2563EB] focus:outline-none transition-all shadow-2xs"
          />
        </div>

        <!-- Filter Lokasi -->
        <select
          v-model="selectedLocation"
          class="h-9 w-[140px] shrink-0 rounded-lg border border-[#E2E8F0] bg-white px-2.5 text-xs text-[#0F172A] focus:border-[#2563EB] focus:outline-none transition-all cursor-pointer shadow-2xs"
        >
          <option value="">Semua Lokasi</option>
          <option v-for="loc in locationOptions" :key="loc.value" :value="loc.value">
            {{ loc.label }}
          </option>
        </select>

        <!-- Filter Kategori -->
        <select
          v-model="selectedKategori"
          class="h-9 w-[145px] shrink-0 rounded-lg border border-[#E2E8F0] bg-white px-2.5 text-xs text-[#0F172A] focus:border-[#2563EB] focus:outline-none transition-all cursor-pointer shadow-2xs"
        >
          <option value="">Semua Kategori</option>
          <option v-for="k in kategoriOptions" :key="k" :value="k">{{ k }}</option>
        </select>

        <!-- Filter Status -->
        <select
          v-model="selectedStatus"
          class="h-9 w-[135px] shrink-0 rounded-lg border border-[#E2E8F0] bg-white px-2.5 text-xs text-[#0F172A] focus:border-[#2563EB] focus:outline-none transition-all cursor-pointer shadow-2xs"
        >
          <option value="">Semua Status</option>
          <option v-for="s in statusOptions" :key="s" :value="s">{{ s }}</option>
        </select>

        <!-- Reset Filter Button -->
        <button
          v-if="searchQuery || selectedLocation || selectedKategori || selectedStatus"
          type="button"
          @click="resetFilters"
          class="h-9 shrink-0 whitespace-nowrap rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 text-xs font-medium text-[#64748B] hover:text-[#0F172A] transition-all flex items-center justify-center gap-1 cursor-pointer shadow-2xs"
          title="Reset filter"
        >
          <span class="material-symbols-outlined text-[15px]">restart_alt</span>
          <span>Reset</span>
        </button>
      </div>
    </div>

    <!-- ─── MODERN ENTERPRISE SAAS DATA MANAGEMENT CONTAINER ──────────────── -->
    <div>
      <!-- Error Alert -->
      <div
        v-if="pageError"
        role="alert"
        class="flex items-center gap-2 bg-rose-50 px-5 py-4 text-[12.5px] text-rose-600 rounded-2xl border border-rose-200"
      >
        <span class="material-symbols-outlined text-[18px]">error</span>
        <span class="flex-1 font-semibold">{{ pageError }}</span>
        <button type="button" class="font-bold underline cursor-pointer" @click="fetchData">
          Coba lagi
        </button>
      </div>

      <!-- Loading State Skeleton -->
      <div v-else-if="isLoading" aria-busy="true" class="space-y-2.5">
        <div
          v-for="r in 6"
          :key="'ops-skel-' + r"
          class="ops-row-grid gap-4 rounded-xl border border-[#E2E8F0]/80 bg-white p-4 shadow-2xs select-none"
        >
          <!-- 1. Identity -->
          <div class="flex items-center gap-3.5 min-w-0">
            <SkeletonAvatar size="40px" shape="rounded" class="shrink-0" />
            <div class="flex flex-col gap-1.5 min-w-0">
              <BaseSkeleton width="130px" height="15px" radius="md" />
              <BaseSkeleton width="90px" height="12px" radius="sm" />
            </div>
          </div>
          <!-- 2. Kategori & PIC -->
          <div class="flex flex-col gap-1 min-w-0">
            <BaseSkeleton width="60px" height="10px" radius="sm" />
            <BaseSkeleton width="90px" height="13px" radius="md" />
            <BaseSkeleton width="70px" height="11px" radius="sm" />
          </div>
          <!-- 3. Lokasi -->
          <div class="flex flex-col gap-1 min-w-0">
            <BaseSkeleton width="45px" height="10px" radius="sm" />
            <BaseSkeleton width="80px" height="13px" radius="md" />
            <BaseSkeleton width="70px" height="11px" radius="sm" />
          </div>
          <!-- 4. Amount -->
          <div class="flex flex-col gap-1 min-w-0">
            <BaseSkeleton width="55px" height="10px" radius="sm" />
            <BaseSkeleton width="95px" height="13px" radius="md" />
          </div>
          <!-- 5. Status -->
          <div class="flex items-center">
            <BaseSkeleton width="75px" height="22px" radius="full" />
          </div>
          <!-- 6. Action -->
          <div class="flex justify-end">
            <BaseSkeleton width="18px" height="18px" radius="md" />
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="filteredAssets.length === 0"
        class="py-12 px-4 text-center bg-white rounded-2xl border border-[#E2E8F0]/80"
      >
        <div class="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
          <span
            class="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F1F5F9] text-[#64748B]"
          >
            <span class="material-symbols-outlined text-[24px]">precision_manufacturing</span>
          </span>
          <h3 class="text-[14px] font-bold text-[#0F172A] mt-1">Belum Ada Aset OPS</h3>
          <p class="text-[11.5px] text-[#64748B] leading-relaxed">
            Belum ada perangkat operasional yang terdaftar dalam inventaris atau sesuai dengan kata kunci pencarian.
          </p>
          <button
            v-if="canWriteAssets"
            type="button"
            @click="openAdd"
            class="mt-2 h-9 rounded-lg bg-[#2563EB] px-4 text-[12px] font-semibold text-white shadow-2xs hover:bg-[#1D4ED8] transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span class="material-symbols-outlined text-[16px]">add</span>
            <span>Tambah Aset OPS</span>
          </button>
        </div>
      </div>

      <!-- PRIMARY VIEW: SaaS Row Cards -->
      <div v-else class="space-y-2.5">
        <div
          v-for="asset in paginatedAssets"
          :key="asset.id"
          @click="openDetails(asset)"
          class="ops-row-grid group relative gap-4 rounded-xl border border-[#E2E8F0]/80 bg-white p-4 shadow-2xs hover:border-[#2563EB]/40 hover:shadow-sm transition-all duration-200 cursor-pointer select-none"
        >
          <!-- 1. Asset Identity -->
          <div class="flex items-center gap-3.5 min-w-0 overflow-hidden">
            <div
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB] group-hover:scale-105 transition-transform"
            >
              <span class="material-symbols-outlined text-[20px]">{{
                getOpsIcon(asset.kategori)
              }}</span>
            </div>
            <div class="flex flex-col min-w-0 overflow-hidden">
              <span
                class="text-[14px] font-bold text-[#0F172A] leading-snug group-hover:text-[#2563EB] transition-colors truncate block w-full"
                :title="asset.nama_asset || '—'"
              >
                {{ asset.nama_asset || '—' }}
              </span>
              <span
                class="font-mono text-[11px] font-normal text-[#64748B] mt-0.5 tracking-tight truncate block w-full"
                :title="asset.hostname || '—'"
              >
                {{ asset.hostname || '—' }}
              </span>
            </div>
          </div>

          <!-- 2. Kategori & PIC -->
          <div class="flex flex-col min-w-0 overflow-hidden">
            <span class="text-[10px] font-semibold uppercase text-[#94A3B8] tracking-wider"
              >Kategori & PIC</span
            >
            <span
              class="text-[12.5px] font-semibold text-[#1E293B] mt-0.5 truncate block w-full"
              :title="asset.kategori || '—'"
            >
              {{ asset.kategori || '—' }}
            </span>
            <span
              class="text-[11.5px] mt-0.5 truncate block w-full"
              :class="asset.pic ? 'font-medium text-[#64748B]' : 'text-[#94A3B8] italic font-normal'"
              :title="asset.pic || 'Belum ada PIC'"
            >
              {{ asset.pic ? 'PIC: ' + asset.pic : 'Belum ada PIC' }}
            </span>
          </div>

          <!-- 3. Lokasi & Tanggal Beli -->
          <div class="flex flex-col min-w-0 overflow-hidden">
            <span class="text-[10px] font-semibold uppercase text-[#94A3B8] tracking-wider"
              >Lokasi</span
            >
            <span
              class="text-[12.5px] font-normal text-[#1E293B] mt-0.5 truncate block w-full"
              :title="asset.lokasi || '—'"
            >
              {{ asset.lokasi || '—' }}
            </span>
            <span
              v-if="asset.tanggal_beli"
              class="text-[11.5px] font-normal text-[#64748B] mt-0.5 truncate block w-full"
              :title="formatDate(asset.tanggal_beli)"
            >
              Beli: {{ formatDate(asset.tanggal_beli) }}
            </span>
          </div>

          <!-- 4. Total Asset Amount -->
          <div class="flex flex-col min-w-0 overflow-hidden">
            <span class="text-[10px] font-semibold uppercase text-[#94A3B8] tracking-wider"
              >Total Amount</span
            >
            <span
              class="text-[12.5px] font-bold text-[#0F172A] mt-0.5 truncate block w-full"
              :title="formatCurrency(asset.total_asset_amount)"
            >
              {{ formatCurrency(asset.total_asset_amount) }}
            </span>
          </div>

          <!-- 5. Status & Kondisi Component Block -->
          <div class="flex flex-col items-start min-w-0 overflow-hidden select-none">
            <!-- Primary Status Line -->
            <div
              class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold"
              :class="[formatStatusPillOps(asset.status).bg, formatStatusPillOps(asset.status).text]"
            >
              <span
                class="h-1.5 w-1.5 rounded-full shrink-0"
                :class="formatStatusPillOps(asset.status).dot"
              ></span>
              <span class="truncate">{{ asset.status }}</span>
            </div>
            <!-- Secondary Condition Line -->
            <div
              v-if="asset.kondisi"
              class="flex items-center gap-1 text-[11px] mt-1 text-[#64748B] truncate max-w-full"
            >
              <span class="h-1 w-1 rounded-full shrink-0 bg-[#94A3B8]"></span>
              <span class="truncate">Kondisi {{ asset.kondisi }}</span>
            </div>
          </div>

          <!-- 6. Action Menu -->
          <div @click.stop class="flex items-center justify-end w-8 shrink-0 justify-self-end">
            <AppRowActions :actions="getOpsActions(asset)" />
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <AppPagination
        v-if="!isLoading && !pageError"
        v-model:currentPage="currentPage"
        :total-items="filteredAssets.length"
        :items-per-page="itemsPerPage"
      />
    </div>

    <!-- Modal Form (Tambah / Edit) -->
    <AppModal
      :is-open="showFormModal"
      :title="modalMode === 'add' ? 'Tambah Aset OPS Baru' : 'Edit Aset OPS'"
      size="md"
      @close="closeModal"
    >
      <form @submit.prevent="submitForm" class="space-y-4">
        <div v-if="modalError" class="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-xl text-[#991B1B] text-[12px]">
          {{ modalError }}
        </div>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <!-- Hostname -->
          <div>
            <label class="block text-[12px] font-bold text-[#1E293B] mb-1">
              Hostname / Kode Aset <span class="text-rose-500">*</span>
            </label>
            <input
              v-model="form.hostname"
              type="text"
              required
              placeholder="Contoh: OPS-PL-001"
              class="w-full h-10 px-3 text-[12.5px] rounded-xl border border-[#E2E8F0] bg-white focus:border-[#2563EB] focus:outline-none"
            />
          </div>

          <!-- Nama Asset -->
          <div>
            <label class="block text-[12px] font-bold text-[#1E293B] mb-1">
              Nama Asset <span class="text-rose-500">*</span>
            </label>
            <input
              v-model="form.nama_asset"
              type="text"
              required
              placeholder="Contoh: KIOSK Self Service Station"
              class="w-full h-10 px-3 text-[12.5px] rounded-xl border border-[#E2E8F0] bg-white focus:border-[#2563EB] focus:outline-none"
            />
          </div>
        </div>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <!-- Kategori -->
          <div>
            <label class="block text-[12px] font-bold text-[#1E293B] mb-1">
              Kategori <span class="text-rose-500">*</span>
            </label>
            <SearchableSelect
              v-model="form.kategori"
              :options="kategoriSelectOptions"
              placeholder="Pilih Kategori"
            />
          </div>

          <!-- Lokasi Utama -->
          <div>
            <label class="block text-[12px] font-bold text-[#1E293B] mb-1">
              Lokasi Utama <span class="text-rose-500">*</span>
            </label>
            <SearchableSelect
              v-model="form.lokasi"
              :options="locationOptions"
              placeholder="Pilih Lokasi"
            />
          </div>
        </div>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <!-- PIC Penanggung Jawab -->
          <div>
            <label class="block text-[12px] font-bold text-[#1E293B] mb-1">PIC (Penanggung Jawab)</label>
            <input
              v-model="form.pic"
              type="text"
              placeholder="Contoh: Store Manager / Spv Kasir"
              class="w-full h-10 px-3 text-[12.5px] rounded-xl border border-[#E2E8F0] bg-white focus:border-[#2563EB] focus:outline-none"
            />
          </div>

          <!-- Tanggal Beli -->
          <div>
            <label class="block text-[12px] font-bold text-[#1E293B] mb-1">Tanggal Pembelian</label>
            <input
              v-model="form.tanggal_beli"
              type="date"
              class="w-full h-10 px-3 text-[12.5px] rounded-xl border border-[#E2E8F0] bg-white focus:border-[#2563EB] focus:outline-none"
            />
          </div>
        </div>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <!-- Total Asset Amount -->
          <div>
            <label class="block text-[12px] font-bold text-[#1E293B] mb-1">Total Amount (Rp)</label>
            <input
              v-model.number="form.total_asset_amount"
              type="number"
              min="0"
              step="1000"
              placeholder="0"
              class="w-full h-10 px-3 text-[12.5px] rounded-xl border border-[#E2E8F0] bg-white focus:border-[#2563EB] focus:outline-none"
            />
          </div>

          <!-- Kondisi -->
          <div>
            <label class="block text-[12px] font-bold text-[#1E293B] mb-1">Kondisi</label>
            <select
              v-model="form.kondisi"
              class="w-full h-10 px-3 text-[12.5px] rounded-xl border border-[#E2E8F0] bg-white focus:border-[#2563EB] focus:outline-none cursor-pointer"
            >
              <option v-for="k in kondisiOptions" :key="k" :value="k">{{ k }}</option>
            </select>
          </div>

          <!-- Status -->
          <div>
            <label class="block text-[12px] font-bold text-[#1E293B] mb-1">Status Operasional</label>
            <select
              v-model="form.status"
              class="w-full h-10 px-3 text-[12.5px] rounded-xl border border-[#E2E8F0] bg-white focus:border-[#2563EB] focus:outline-none cursor-pointer"
            >
              <option v-for="s in statusOptions" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
        </div>

        <!-- Submit Footer -->
        <div class="flex items-center justify-end gap-3 pt-3 border-t border-[#E2E8F0]">
          <button
            type="button"
            @click="closeModal"
            class="h-10 px-4 rounded-xl border border-[#E2E8F0] text-[12.5px] font-semibold text-[#64748B] hover:bg-[#F8FAFC]"
          >
            Batal
          </button>
          <button
            type="submit"
            :disabled="isSubmitting"
            class="h-10 px-5 rounded-xl bg-[#2563EB] text-[12.5px] font-bold text-white shadow-2xs hover:bg-[#1D4ED8] disabled:opacity-50 flex items-center gap-2"
          >
            <span v-if="isSubmitting" class="animate-spin text-[16px]">hourglass_empty</span>
            <span>{{ isSubmitting ? 'Menyimpan...' : 'Simpan Aset OPS' }}</span>
          </button>
        </div>
      </form>
    </AppModal>

    <!-- Modal Confirm Delete -->
    <AppModal
      :is-open="showDeleteModal"
      title="Hapus Aset OPS"
      size="sm"
      @close="closeModal"
    >
      <div class="space-y-4">
        <p class="text-[13px] text-[#475569]">
          Apakah Anda yakin ingin menghapus Aset OPS <strong class="text-[#0F172A]">{{ selectedAsset?.nama_asset }}</strong> ({{ selectedAsset?.hostname }})?
        </p>

        <div class="flex items-center justify-end gap-3 pt-3 border-t border-[#E2E8F0]">
          <button
            type="button"
            @click="closeModal"
            class="h-10 px-4 rounded-xl border border-[#E2E8F0] text-[12.5px] font-semibold text-[#64748B] hover:bg-[#F8FAFC]"
          >
            Batal
          </button>
          <button
            type="button"
            :disabled="isSubmitting"
            @click="confirmDelete"
            class="h-10 px-5 rounded-xl bg-rose-600 text-[12.5px] font-bold text-white shadow-2xs hover:bg-rose-700 disabled:opacity-50"
          >
            {{ isSubmitting ? 'Menghapus...' : 'Ya, Hapus' }}
          </button>
        </div>
      </div>
    </AppModal>

    <!-- Modal Details View -->
    <AppModal
      :is-open="showDetailsModal"
      title="Detail Aset OPS"
      size="md"
      @close="closeModal"
    >
      <div v-if="selectedAsset" class="space-y-4">
        <div class="flex items-center gap-3 p-3 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0]">
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB]">
            <span class="material-symbols-outlined text-[22px]">{{ getOpsIcon(selectedAsset.kategori) }}</span>
          </div>
          <div>
            <h3 class="font-bold text-[#0F172A] text-[14px]">{{ selectedAsset.nama_asset }}</h3>
            <p class="font-mono text-[11px] text-[#64748B]">{{ selectedAsset.hostname }}</p>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4 text-[12.5px]">
          <div>
            <span class="text-[#64748B] block text-[11px] font-medium">Kategori</span>
            <span class="font-semibold text-[#1E293B]">{{ selectedAsset.kategori }}</span>
          </div>

          <div>
            <span class="text-[#64748B] block text-[11px] font-medium">Lokasi</span>
            <span class="font-semibold text-[#1E293B]">{{ selectedAsset.lokasi }}</span>
          </div>

          <div>
            <span class="text-[#64748B] block text-[11px] font-medium">PIC / Penanggung Jawab</span>
            <span class="text-[#1E293B] font-medium">{{ selectedAsset.pic || 'Belum ditetapkan' }}</span>
          </div>

          <div>
            <span class="text-[#64748B] block text-[11px] font-medium">Tanggal Pembelian</span>
            <span class="text-[#1E293B]">{{ formatDate(selectedAsset.tanggal_beli) }}</span>
          </div>

          <div>
            <span class="text-[#64748B] block text-[11px] font-medium">Total Asset Amount</span>
            <span class="font-bold text-[#0F172A] text-[13.5px]">{{ formatCurrency(selectedAsset.total_asset_amount) }}</span>
          </div>

          <div>
            <span class="text-[#64748B] block text-[11px] font-medium">Status Operasional</span>
            <span
              class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold mt-0.5"
              :class="[formatStatusPillOps(selectedAsset.status).bg, formatStatusPillOps(selectedAsset.status).text]"
            >
              <span class="h-1.5 w-1.5 rounded-full" :class="formatStatusPillOps(selectedAsset.status).dot"></span>
              {{ selectedAsset.status }}
            </span>
          </div>
        </div>

        <div class="pt-2 border-t border-[#E2E8F0]">
          <span class="text-[#64748B] block text-[11px] font-medium">Kondisi Perangkat</span>
          <p class="text-[12.5px] text-[#1E293B] font-semibold mt-0.5">
            {{ selectedAsset.kondisi || 'Baik' }}
          </p>
        </div>

        <div class="flex justify-end pt-3 border-t border-[#E2E8F0]">
          <button
            type="button"
            @click="closeModal"
            class="h-10 px-5 rounded-xl bg-[#2563EB] text-[12.5px] font-bold text-white shadow-2xs hover:bg-[#1D4ED8]"
          >
            Tutup
          </button>
        </div>
      </div>
    </AppModal>
  </div>
</template>

<style scoped>
.ops-row-grid {
  display: flex;
  flex-direction: column;
}

@media (min-width: 768px) {
  .ops-row-grid {
    display: grid;
    grid-template-columns: minmax(220px, 2fr) minmax(140px, 1.1fr) minmax(140px, 1.1fr) minmax(
        130px,
        1fr
      ) minmax(130px, 1fr) 32px;
    align-items: center;
  }
}
</style>
