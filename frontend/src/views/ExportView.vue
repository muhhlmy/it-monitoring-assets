<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useApi } from '@/composables/useApi'
import { useAuth } from '@/composables/useAuth'
import { exportToCsv, exportToJson, exportToExcel, exportToPdf } from '@/utils/exportEngine'
import SkeletonCard from '@/components/ui/skeleton/SkeletonCard.vue'
import AppModal from '@/components/ui/AppModal.vue'

const api = useApi()
const { isSuperAdmin } = useAuth()

// Reset Database State
const showResetModal = ref(false)
const confirmResetInput = ref('')
const isResetting = ref(false)

function openResetModal() {
  confirmResetInput.value = ''
  showResetModal.value = true
}

function closeResetModal() {
  showResetModal.value = false
  confirmResetInput.value = ''
}

async function handleConfirmResetDatabase() {
  if (confirmResetInput.value.trim().toUpperCase() !== 'RESET') {
    showToast('Ketik "RESET" untuk mengonfirmasi tindakan ini.', 'error')
    return
  }

  isResetting.value = true
  try {
    const res = await api.post('/api/export/reset-database')
    if (res.success) {
      showToast(res.message || 'Database berhasil di-reset dan dikosongkan!', 'success')
      showResetModal.value = false
      confirmResetInput.value = ''
      await fetchTablesMetadata()
    } else {
      showToast(res.message || 'Gagal me-reset database.', 'error')
    }
  } catch (err) {
    showToast(err.message || 'Terjadi kesalahan saat me-reset database.', 'error')
  } finally {
    isResetting.value = false
  }
}

// State
const isLoading = ref(true)
const isExporting = ref(false)
const isPreviewing = ref(false)
const activeTab = ref('quick') // 'quick' | 'custom' | 'presets'

// DB Tables Metadata
const tables = ref([])
const totalDbRecords = computed(() => {
  return tables.value.reduce((acc, t) => acc + (t.rowCount || 0), 0)
})

// State Custom Export
const selectedTableKey = ref('aset_ti')
const selectedColumns = ref([])
const startDate = ref('')
const endDate = ref('')
const searchQuery = ref('')
const statusFilter = ref('semua')
const rowLimit = ref(1000)
const exportFormat = ref('csv') // 'csv' | 'excel' | 'json' | 'pdf'

// Live Preview State
const previewData = ref([])
const previewColumns = ref([])
const showPreviewModal = ref(false)

// Toast Alert State
const toast = ref({ show: false, message: '', type: 'success' })

function showToast(message, type = 'success') {
  toast.value = { show: true, message, type }
  setTimeout(() => {
    toast.value.show = false
  }, 4000)
}

// Formatters (for future use in exports)
// function formatDate(dateStr) {
//   if (!dateStr) return '-'
//   return new Date(dateStr).toLocaleDateString('id-ID', {
//     day: '2-digit',
//     month: 'short',
//     year: 'numeric',
//   })
// }

// Selected Table Object
const currentTableSchema = computed(() => {
  return tables.value.find((t) => t.tableName === selectedTableKey.value) || null
})

// Columns for current selected table
const currentTableColumns = computed(() => {
  return currentTableSchema.value ? currentTableSchema.value.columns : []
})

// Watcher when selected table changes -> reset columns to defaultSelected
watch(selectedTableKey, (newVal) => {
  const schema = tables.value.find((t) => t.tableName === newVal)
  if (schema) {
    selectedColumns.value = schema.columns.filter((c) => c.defaultSelected).map((c) => c.name)
  } else {
    selectedColumns.value = []
  }
  previewData.value = []
})

function selectAllColumns() {
  if (currentTableSchema.value) {
    selectedColumns.value = currentTableSchema.value.columns.map((c) => c.name)
  }
}

function deselectAllColumns() {
  selectedColumns.value = []
}

// Fetch Metadata
async function fetchTablesMetadata() {
  isLoading.value = true
  try {
    const res = await api.get('/api/export/tables')
    if (res.success && Array.isArray(res.tables)) {
      tables.value = res.tables
      // Set default selected table
      if (tables.value.length > 0 && !selectedTableKey.value) {
        selectedTableKey.value = tables.value[0].tableName
      }
      // Initialize selected columns for initial table
      const initialSchema = tables.value.find((t) => t.tableName === selectedTableKey.value)
      if (initialSchema) {
        selectedColumns.value = initialSchema.columns
          .filter((c) => c.defaultSelected)
          .map((c) => c.name)
      }
    }
  } catch (error) {
    showToast(error.message || 'Gagal memuat metadata tabel database.', 'error')
  } finally {
    isLoading.value = false
  }
}

// Execute Live Preview
async function loadPreview() {
  if (!selectedTableKey.value) return
  if (selectedColumns.value.length === 0) {
    showToast('Pilih setidaknya satu kolom untuk pratinjau.', 'warning')
    return
  }

  isPreviewing.value = true
  try {
    const payload = {
      tableName: selectedTableKey.value,
      columns: selectedColumns.value,
      startDate: startDate.value,
      endDate: endDate.value,
      search: searchQuery.value,
      status: statusFilter.value,
      limit: 10, // Preview top 10 rows
    }

    const res = await api.post('/api/export/data', payload)
    if (res.success) {
      previewData.value = res.data
      previewColumns.value = res.columns
      showPreviewModal.value = true
      if (res.data.length === 0) {
        showToast('Tidak ada data yang cocok dengan kriteria filter.', 'info')
      }
    }
  } catch (error) {
    showToast(error.message || 'Gagal mengambil pratinjau data.', 'error')
  } finally {
    isPreviewing.value = false
  }
}

// Execute Download Custom Export
async function handleExecuteCustomExport() {
  if (!selectedTableKey.value) return
  if (selectedColumns.value.length === 0) {
    showToast('Pilih setidaknya satu kolom untuk diekspor.', 'warning')
    return
  }

  isExporting.value = true
  try {
    const payload = {
      tableName: selectedTableKey.value,
      columns: selectedColumns.value,
      startDate: startDate.value,
      endDate: endDate.value,
      search: searchQuery.value,
      status: statusFilter.value,
      limit: rowLimit.value,
    }

    const res = await api.post('/api/export/data', payload)
    if (!res.success || !Array.isArray(res.data) || res.data.length === 0) {
      showToast('Tidak ada data yang dapat diekspor sesuai kriteria.', 'warning')
      return
    }

    const tableSchema = currentTableSchema.value
    const tableNameLabel = tableSchema ? tableSchema.label : selectedTableKey.value
    const filenamePrefix = `Ekspor_${selectedTableKey.value}`
    const columnsMeta = res.columns

    let exportSuccess = false
    if (exportFormat.value === 'csv') {
      exportSuccess = exportToCsv(res.data, columnsMeta, filenamePrefix)
    } else if (exportFormat.value === 'excel') {
      exportSuccess = exportToExcel(res.data, columnsMeta, tableNameLabel, filenamePrefix)
    } else if (exportFormat.value === 'json') {
      exportSuccess = exportToJson(res, filenamePrefix)
    } else if (exportFormat.value === 'pdf') {
      exportSuccess = exportToPdf(
        res.data,
        columnsMeta,
        tableNameLabel,
        'Laporan Kustom Database',
        {
          Tabel: tableNameLabel,
          'Rentang Tanggal':
            startDate.value && endDate.value ? `${startDate.value} s/d ${endDate.value}` : 'Semua',
          Pencarian: searchQuery.value || 'Semua',
        },
      )
    }

    if (exportSuccess) {
      if (res.isTruncated) {
        showToast(
          `Ekspor berhasil (${res.data.length} dari total ${res.totalDbRows} baris data). Hasil dipotong batas limit.`,
          'warning',
        )
      } else {
        showToast(
          `Berhasil mengekspor ${res.data.length} baris data ke format ${exportFormat.value.toUpperCase()}!`,
        )
      }
    }
  } catch (error) {
    showToast(error.message || 'Gagal mengekspor data.', 'error')
  } finally {
    isExporting.value = false
  }
}

function handleConfirmExportModal() {
  handleExecuteCustomExport()
  showPreviewModal.value = false
}

// Quick Export single table
async function handleQuickExport(tableName, format = 'csv') {
  isExporting.value = true
  try {
    const res = await api.post('/api/export/data', {
      tableName,
      limit: 1000,
    })
    if (!res.success || !res.data || res.data.length === 0) {
      showToast('Tabel ini tidak memiliki data untuk diekspor.', 'warning')
      return
    }

    const schema = tables.value.find((t) => t.tableName === tableName)
    const label = schema ? schema.label : tableName
    const filenamePrefix = `QuickExport_${tableName}`
    const columnsMeta = res.columns

    if (format === 'csv') {
      exportToCsv(res.data, columnsMeta, filenamePrefix)
    } else if (format === 'excel') {
      exportToExcel(res.data, columnsMeta, label, filenamePrefix)
    } else if (format === 'json') {
      exportToJson(res, filenamePrefix)
    } else if (format === 'pdf') {
      exportToPdf(res.data, columnsMeta, label, `Laporan Ekspor Instant - ${label}`)
    }

    showToast(`Ekspor cepat ${label} (${res.data.length} baris) berhasil!`)
  } catch (error) {
    showToast(error.message || 'Gagal melakukan ekspor cepat.', 'error')
  } finally {
    isExporting.value = false
  }
}

// Presets Export Launcher
async function applyPreset(presetKey) {
  activeTab.value = 'custom'
  if (presetKey === 'assets_active') {
    selectedTableKey.value = 'aset_ti'
    statusFilter.value = 'Digunakan'
    searchQuery.value = ''
    startDate.value = ''
    endDate.value = ''
  } else if (presetKey === 'employees_dept') {
    selectedTableKey.value = 'karyawan'
    statusFilter.value = 'semua'
    searchQuery.value = ''
  } else if (presetKey === 'tickets_resolved') {
    selectedTableKey.value = 'tickets'
    statusFilter.value = 'Resolved'
    searchQuery.value = ''
  } else if (presetKey === 'login_audit') {
    selectedTableKey.value = 'log_audit_login'
    searchQuery.value = ''
  }
  showToast('Preset templat diterapkan pada Ekspor Kustom!', 'info')
}

onMounted(() => {
  fetchTablesMetadata()
})
</script>

<template>
  <div class="space-y-6 pb-12 text-[#0F172A]" :data-testid="!isLoadingMetadata ? 'page-ready' : undefined">
    <!-- Notification Toast -->
    <Transition name="fade">
      <div
        v-if="toast.show"
        class="fixed top-5 right-5 z-50 flex items-center gap-2.5 rounded-xl px-4 py-3 shadow-lg text-white font-semibold text-xs border"
        :class="[
          toast.type === 'error'
            ? 'bg-rose-600 border-rose-500'
            : toast.type === 'warning'
              ? 'bg-amber-600 border-amber-500'
              : toast.type === 'info'
                ? 'bg-blue-600 border-blue-500'
                : 'bg-emerald-600 border-emerald-500',
        ]"
      >
        <span class="material-symbols-outlined text-[18px]">
          {{
            toast.type === 'error'
              ? 'error'
              : toast.type === 'warning'
                ? 'warning'
                : toast.type === 'info'
                  ? 'info'
                  : 'check_circle'
          }}
        </span>
        <span>{{ toast.message }}</span>
      </div>
    </Transition>

    <!-- Header SaaS Section -->
    <div
      class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-2xs"
    >
      <div class="space-y-1">
        <div class="flex items-center gap-1.5 text-xs text-[#94A3B8] font-medium">
          <span>Database</span>
          <span>/</span>
          <span class="text-[#64748B]">Ekspor Data</span>
        </div>
        <h1 class="text-xl font-bold text-[#0F172A] tracking-tight">Pusat Ekspor Data</h1>
        <p class="text-xs text-[#64748B]">
          Ekspor dan kelola data sistem dengan cepat ke format CSV, Excel, JSON, atau PDF.
        </p>
      </div>

      <!-- Compact Metrics -->
      <div
        class="flex items-center gap-6 pt-2 sm:pt-0 sm:border-l border-[#F1F5F9] sm:pl-6 shrink-0"
      >
        <div class="flex flex-col">
          <span class="text-[11px] font-medium text-[#94A3B8] uppercase tracking-wider">Tabel</span>
          <span class="text-xl font-bold text-[#0F172A] font-mono">{{ tables.length }}</span>
        </div>
        <div class="flex flex-col">
          <span class="text-[11px] font-medium text-[#94A3B8] uppercase tracking-wider"
            >Total Record</span
          >
          <span class="text-xl font-bold text-[#2563EB] font-mono">
            {{ isLoading ? '...' : totalDbRecords.toLocaleString('id-ID') }}
          </span>
        </div>
      </div>
    </div>

    <!-- Danger Zone: Reset Database Card (Superadmin only) -->
    <div
      v-if="isSuperAdmin"
      class="bg-rose-50/70 border border-rose-200/80 rounded-2xl p-4 sm:p-5 shadow-2xs transition-all"
    >
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div class="space-y-1">
          <div class="flex items-center gap-1.5 text-xs text-rose-700 font-bold tracking-wide uppercase">
            <span class="material-symbols-outlined text-[16px]">warning</span>
            <span>Danger Zone — Pemeliharaan Database</span>
          </div>
          <h3 class="text-sm font-bold text-rose-900">Reset &amp; Kosongkan Database</h3>
          <p class="text-xs text-rose-700/90 leading-relaxed max-w-2xl">
            Menghapus secara permanen seluruh data aset TI, aset GA, aset OPS, tiket helpdesk, karyawan, dan log aktivitas.
            Akun Superadmin default (<code class="font-mono bg-white/80 px-1 py-0.5 rounded text-rose-900 border border-rose-200">superadmin@admin.com</code>) akan diprovisi kembali secara otomatis.
          </p>
        </div>
        <button
          type="button"
          @click="openResetModal"
          class="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-4 py-2.5 transition-all shadow-xs shrink-0 cursor-pointer active:scale-95"
        >
          <span class="material-symbols-outlined text-[18px]">restart_alt</span>
          <span>Reset Database</span>
        </button>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <div class="flex items-center justify-between border-b border-[#E2E8F0] pb-px">
      <div class="flex items-center gap-1 overflow-x-auto">
        <button
          type="button"
          @click="activeTab = 'quick'"
          class="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap select-none"
          :class="
            activeTab === 'quick'
              ? 'bg-[#F1F5F9] text-[#0F172A]'
              : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A]'
          "
        >
          <span class="material-symbols-outlined text-[18px] text-[#64748B]">bolt</span>
          <span>Ekspor Cepat per Tabel</span>
        </button>

        <button
          type="button"
          @click="activeTab = 'custom'"
          class="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap select-none"
          :class="
            activeTab === 'custom'
              ? 'bg-[#F1F5F9] text-[#0F172A]'
              : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A]'
          "
        >
          <span class="material-symbols-outlined text-[18px] text-[#64748B]">tune</span>
          <span>Ekspor Kustom</span>
          <span class="rounded-md bg-[#EFF6FF] px-1.5 py-0.2 text-[10px] font-medium text-[#2563EB]"
            >Advanced</span
          >
        </button>

        <button
          type="button"
          @click="activeTab = 'presets'"
          class="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap select-none"
          :class="
            activeTab === 'presets'
              ? 'bg-[#F1F5F9] text-[#0F172A]'
              : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A]'
          "
        >
          <span class="material-symbols-outlined text-[18px] text-[#64748B]">bookmark</span>
          <span>Template Laporan</span>
        </button>
      </div>

      <button
        type="button"
        @click="fetchTablesMetadata"
        class="hidden sm:flex items-center gap-1.5 text-xs font-medium text-[#64748B] hover:text-[#2563EB] transition-colors cursor-pointer"
      >
        <span class="material-symbols-outlined text-[16px]">refresh</span>
        <span>Refresh Stats</span>
      </button>
    </div>

    <!-- TAB 1: EKSPOR CEPAT PER TABEL -->
    <div v-if="activeTab === 'quick'" class="space-y-4">
      <div
        v-if="isLoading"
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        aria-busy="true"
      >
        <SkeletonCard v-for="i in 8" :key="i" variant="simple" />
      </div>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          v-for="table in tables"
          :key="table.tableName"
          class="group flex flex-col justify-between rounded-2xl border border-[#E2E8F0] bg-white p-4 transition-all duration-150 hover:border-[#CBD5E1] hover:shadow-2xs"
        >
          <div class="space-y-3">
            <div class="flex items-center justify-between gap-2">
              <div
                class="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-[#475569] group-hover:text-[#2563EB] group-hover:border-[#BFDBFE] transition-colors"
              >
                <span class="material-symbols-outlined text-[18px]">{{ table.icon }}</span>
              </div>
              <span
                class="rounded-full bg-[#F1F5F9] px-2 py-0.5 font-mono text-[10.5px] font-semibold text-[#64748B]"
              >
                {{ table.rowCount.toLocaleString('id-ID') }} records
              </span>
            </div>

            <div>
              <h3
                class="font-bold text-[#0F172A] text-sm group-hover:text-[#2563EB] transition-colors"
              >
                {{ table.label }}
              </h3>
              <p class="mt-1 text-xs text-[#64748B] line-clamp-2 leading-relaxed">
                {{ table.description }}
              </p>
            </div>
          </div>

          <div class="mt-4 pt-3 border-t border-[#F1F5F9] space-y-2">
            <span class="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]"
              >Supported Formats</span
            >
            <div class="grid grid-cols-4 gap-1.5">
              <button
                type="button"
                @click="handleQuickExport(table.tableName, 'csv')"
                title="Unduh berkas CSV"
                class="flex items-center justify-center rounded-lg bg-[#F0FDF4] border border-[#DCFCE7] py-1.5 text-[11px] font-bold text-[#166534] hover:bg-[#166534] hover:text-white hover:border-[#166534] transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                CSV
              </button>
              <button
                type="button"
                @click="handleQuickExport(table.tableName, 'excel')"
                title="Unduh berkas Excel (.xls)"
                class="flex items-center justify-center rounded-lg bg-[#ECFDF5] border border-[#D1FAE5] py-1.5 text-[11px] font-bold text-[#047857] hover:bg-[#047857] hover:text-white hover:border-[#047857] transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                XLS
              </button>
              <button
                type="button"
                @click="handleQuickExport(table.tableName, 'json')"
                title="Unduh berkas JSON"
                class="flex items-center justify-center rounded-lg bg-[#FFFBEB] border border-[#FEF3C7] py-1.5 text-[11px] font-bold text-[#B45309] hover:bg-[#B45309] hover:text-white hover:border-[#B45309] transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              >
                JSON
              </button>
              <button
                type="button"
                @click="handleQuickExport(table.tableName, 'pdf')"
                title="Cetak Laporan PDF"
                class="flex items-center justify-center rounded-lg bg-[#FEF2F2] border border-[#FEE2E2] py-1.5 text-[11px] font-bold text-[#B91C1C] hover:bg-[#B91C1C] hover:text-white hover:border-[#B91C1C] transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-rose-500/20"
              >
                PDF
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 2: EKSPOR KUSTOM (CUSTOM QUERY & FIELD PICKER) -->
    <div v-if="activeTab === 'custom'" class="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <!-- Left Column: Table & Field Selector -->
      <div class="lg:col-span-8 space-y-6">
        <!-- Step 1: Select Table -->
        <div class="rounded-2xl border border-[#E2E8F0] bg-white p-5 space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-bold text-[#0F172A] flex items-center gap-2">
              <span
                class="flex h-5 w-5 items-center justify-center rounded-full bg-[#2563EB] text-white text-[10px]"
                >1</span
              >
              <span>Pilih Tabel Utama Database</span>
            </h2>
            <span class="text-xs text-[#64748B] font-medium" v-if="currentTableSchema">
              {{ currentTableSchema.columns.length }} Kolom Tersedia
            </span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
            <button
              v-for="tbl in tables"
              :key="tbl.tableName"
              type="button"
              @click="selectedTableKey = tbl.tableName"
              class="flex flex-col p-3 rounded-xl border text-left transition-all cursor-pointer"
              :class="
                selectedTableKey === tbl.tableName
                  ? 'border-[#2563EB] bg-[#EFF6FF] text-[#1E3A8A]'
                  : 'border-[#E2E8F0] hover:border-[#CBD5E1] hover:bg-[#F8FAFC] text-[#0F172A]'
              "
            >
              <span
                class="material-symbols-outlined text-[18px] mb-1"
                :class="selectedTableKey === tbl.tableName ? 'text-[#2563EB]' : 'text-[#64748B]'"
              >
                {{ tbl.icon }}
              </span>
              <span class="text-xs font-bold truncate">{{ tbl.label }}</span>
              <span class="text-[10px] text-[#64748B] mt-0.5">{{ tbl.rowCount }} rows</span>
            </button>
          </div>
        </div>

        <!-- Step 2: Choose Columns / Fields -->
        <div class="rounded-2xl border border-[#E2E8F0] bg-white p-5 space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-bold text-[#0F172A] flex items-center gap-2">
              <span
                class="flex h-5 w-5 items-center justify-center rounded-full bg-[#2563EB] text-white text-[10px]"
                >2</span
              >
              <span>Pilih Kolom (Field Selector)</span>
            </h2>
            <div class="flex items-center gap-2.5">
              <button
                type="button"
                @click="selectAllColumns"
                class="text-xs font-semibold text-[#2563EB] hover:underline cursor-pointer"
              >
                Pilih Semua
              </button>
              <span class="text-[#E2E8F0]">|</span>
              <button
                type="button"
                @click="deselectAllColumns"
                class="text-xs font-semibold text-[#64748B] hover:underline cursor-pointer"
              >
                Kosongkan
              </button>
            </div>
          </div>

          <div
            class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-60 overflow-y-auto pr-1"
          >
            <label
              v-for="col in currentTableColumns"
              :key="col.name"
              class="flex cursor-pointer items-center gap-2.5 rounded-xl border p-2.5 transition-all"
              :class="
                selectedColumns.includes(col.name)
                  ? 'border-[#BFDBFE] bg-[#EFF6FF] text-[#1E3A8A] font-semibold'
                  : 'border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] text-[#334155]'
              "
            >
              <input
                type="checkbox"
                :value="col.name"
                v-model="selectedColumns"
                class="h-4 w-4 rounded-md border-[#CBD5E1] text-[#2563EB] focus:ring-[#2563EB]"
              />
              <div class="min-w-0 flex-1">
                <p class="text-xs truncate leading-tight">{{ col.label }}</p>
                <p class="text-[10px] font-mono text-[#94A3B8] truncate">{{ col.name }}</p>
              </div>
            </label>
          </div>
          <p class="text-[11px] text-[#94A3B8]">
            Terpilih: <strong class="text-[#0F172A]">{{ selectedColumns.length }}</strong> dari
            {{ currentTableColumns.length }} kolom.
          </p>
        </div>

        <!-- Step 3: Date & Filter Settings -->
        <div class="rounded-2xl border border-[#E2E8F0] bg-white p-5 space-y-4">
          <h2 class="text-sm font-bold text-[#0F172A] flex items-center gap-2">
            <span
              class="flex h-5 w-5 items-center justify-center rounded-full bg-[#2563EB] text-white text-[10px]"
              >3</span
            >
            <span>Filter & Batas Baris Data</span>
          </h2>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label class="block text-xs font-medium text-[#64748B] mb-1">Tanggal Mulai</label>
              <input
                type="date"
                v-model="startDate"
                class="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-xs font-medium text-[#0F172A] focus:border-[#2563EB] focus:bg-white focus:outline-none"
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-[#64748B] mb-1">Tanggal Selesai</label>
              <input
                type="date"
                v-model="endDate"
                class="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-xs font-medium text-[#0F172A] focus:border-[#2563EB] focus:bg-white focus:outline-none"
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-[#64748B] mb-1"
                >Batas Maksimal Baris</label
              >
              <select
                v-model="rowLimit"
                class="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-xs font-semibold text-[#0F172A] focus:border-[#2563EB] focus:bg-white focus:outline-none cursor-pointer"
              >
                <option :value="50">50 Baris Pertama</option>
                <option :value="100">100 Baris Pertama</option>
                <option :value="500">500 Baris Pertama</option>
                <option :value="1000">1000 Baris Pertama</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label class="block text-xs font-medium text-[#64748B] mb-1"
                >Pencarian Kata Kunci</label
              >
              <div class="relative">
                <span
                  class="material-symbols-outlined absolute left-3 top-2 text-[18px] text-[#94A3B8]"
                  >search</span
                >
                <input
                  type="text"
                  v-model="searchQuery"
                  maxlength="200"
                  placeholder="Cari kata kunci data..."
                  class="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] pl-9 pr-3 py-2 text-xs font-medium text-[#0F172A] focus:border-[#2563EB] focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label class="block text-xs font-medium text-[#64748B] mb-1"
                >Filter Status (Jika Ada)</label
              >
              <input
                type="text"
                v-model="statusFilter"
                maxlength="100"
                placeholder="misal: Digunakan, Rusak, Resolved..."
                class="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-xs font-medium text-[#0F172A] focus:border-[#2563EB] focus:bg-white focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Right Column: Export Output Controls & Preview Trigger -->
      <div class="lg:col-span-4 space-y-6">
        <div class="sticky top-6 rounded-2xl border border-[#E2E8F0] bg-white p-5 space-y-4">
          <h2 class="text-sm font-bold text-[#0F172A] flex items-center gap-2">
            <span
              class="flex h-5 w-5 items-center justify-center rounded-full bg-[#2563EB] text-white text-[10px]"
              >4</span
            >
            <span>Format & Unduh File</span>
          </h2>

          <!-- Choose Format -->
          <div class="space-y-2">
            <label class="block text-xs font-medium text-[#64748B]">Format File Ekspor</label>
            <div class="grid grid-cols-2 gap-2">
              <label
                class="flex cursor-pointer items-center justify-between rounded-xl border p-2.5 transition-all"
                :class="
                  exportFormat === 'csv'
                    ? 'border-[#2563EB] bg-[#EFF6FF] text-[#2563EB] font-bold'
                    : 'border-[#E2E8F0] text-[#334155]'
                "
              >
                <div class="flex items-center gap-1.5">
                  <span class="material-symbols-outlined text-[18px]">csv</span>
                  <span class="text-xs">CSV</span>
                </div>
                <input type="radio" v-model="exportFormat" value="csv" class="accent-[#2563EB]" />
              </label>

              <label
                class="flex cursor-pointer items-center justify-between rounded-xl border p-2.5 transition-all"
                :class="
                  exportFormat === 'excel'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-700 font-bold'
                    : 'border-[#E2E8F0] text-[#334155]'
                "
              >
                <div class="flex items-center gap-1.5">
                  <span class="material-symbols-outlined text-[18px]">table_chart</span>
                  <span class="text-xs">Excel</span>
                </div>
                <input
                  type="radio"
                  v-model="exportFormat"
                  value="excel"
                  class="accent-emerald-600"
                />
              </label>

              <label
                class="flex cursor-pointer items-center justify-between rounded-xl border p-2.5 transition-all"
                :class="
                  exportFormat === 'json'
                    ? 'border-amber-600 bg-amber-50 text-amber-700 font-bold'
                    : 'border-[#E2E8F0] text-[#334155]'
                "
              >
                <div class="flex items-center gap-1.5">
                  <span class="material-symbols-outlined text-[18px]">code</span>
                  <span class="text-xs">JSON</span>
                </div>
                <input type="radio" v-model="exportFormat" value="json" class="accent-amber-600" />
              </label>

              <label
                class="flex cursor-pointer items-center justify-between rounded-xl border p-2.5 transition-all"
                :class="
                  exportFormat === 'pdf'
                    ? 'border-rose-600 bg-rose-50 text-rose-700 font-bold'
                    : 'border-[#E2E8F0] text-[#334155]'
                "
              >
                <div class="flex items-center gap-1.5">
                  <span class="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                  <span class="text-xs">PDF</span>
                </div>
                <input type="radio" v-model="exportFormat" value="pdf" class="accent-rose-600" />
              </label>
            </div>
          </div>

          <!-- Summary Box -->
          <div class="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-3.5 space-y-1.5 text-xs">
            <div class="flex justify-between text-[#64748B]">
              <span>Tabel Terpilih:</span>
              <strong class="text-[#0F172A] font-mono">{{ selectedTableKey }}</strong>
            </div>
            <div class="flex justify-between text-[#64748B]">
              <span>Jumlah Kolom:</span>
              <strong class="text-[#0F172A]">{{ selectedColumns.length }} Kolom</strong>
            </div>
            <div class="flex justify-between text-[#64748B]">
              <span>Batas Baris:</span>
              <strong class="text-[#0F172A] capitalize">{{ rowLimit }}</strong>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="space-y-2 pt-1">
            <button
              type="button"
              @click="loadPreview"
              :disabled="isPreviewing || selectedColumns.length === 0"
              class="w-full flex items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] bg-white py-2.5 text-xs font-semibold text-[#334155] hover:bg-[#F8FAFC] hover:text-[#0F172A] transition-all cursor-pointer disabled:opacity-50"
            >
              <span class="material-symbols-outlined text-[16px]">visibility</span>
              <span>{{ isPreviewing ? 'Memuat Pratinjau...' : 'Pratinjau Data (10 Baris)' }}</span>
            </button>

            <button
              type="button"
              @click="handleExecuteCustomExport"
              :disabled="isExporting || selectedColumns.length === 0"
              class="w-full flex items-center justify-center gap-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] py-3 text-xs font-bold text-white shadow-2xs transition-all cursor-pointer disabled:opacity-50"
            >
              <span class="material-symbols-outlined text-[18px]">download</span>
              <span>{{ isExporting ? 'Proses Ekspor...' : 'Unduh Berkas Ekspor' }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 3: TEMPLAT LAPORAN POPULER -->
    <div v-if="activeTab === 'presets'" class="space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- Preset 1 -->
        <div
          class="rounded-2xl border border-[#E2E8F0] bg-white p-4 transition-all flex flex-col justify-between hover:border-[#CBD5E1]"
        >
          <div class="space-y-2">
            <div
              class="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB]"
            >
              <span class="material-symbols-outlined text-[18px]">devices_other</span>
            </div>
            <h3 class="font-bold text-[#0F172A] text-sm">Laporan Aset IT Aktif</h3>
            <p class="text-xs text-[#64748B] leading-relaxed">
              Daftar aset IT status 'Digunakan' lengkap dengan nama karyawan pemegang.
            </p>
          </div>
          <button
            type="button"
            @click="applyPreset('assets_active')"
            class="mt-4 w-full rounded-xl border border-[#DBEAFE] bg-[#EFF6FF] hover:bg-[#2563EB] hover:text-white text-[#2563EB] py-2 text-xs font-bold transition-all cursor-pointer"
          >
            Gunakan Templat Ini
          </button>
        </div>

        <!-- Preset 2 -->
        <div
          class="rounded-2xl border border-[#E2E8F0] bg-white p-4 transition-all flex flex-col justify-between hover:border-[#CBD5E1]"
        >
          <div class="space-y-2">
            <div
              class="flex h-8 w-8 items-center justify-center rounded-lg bg-[#ECFDF5] text-[#047857]"
            >
              <span class="material-symbols-outlined text-[18px]">badge</span>
            </div>
            <h3 class="font-bold text-[#0F172A] text-sm">Master Data Karyawan</h3>
            <p class="text-xs text-[#64748B] leading-relaxed">
              Profil karyawan, NIK, jabatan, departemen, dan lokasi kantor untuk audit.
            </p>
          </div>
          <button
            type="button"
            @click="applyPreset('employees_dept')"
            class="mt-4 w-full rounded-xl border border-[#D1FAE5] bg-[#ECFDF5] hover:bg-[#047857] hover:text-white text-[#047857] py-2 text-xs font-bold transition-all cursor-pointer"
          >
            Gunakan Templat Ini
          </button>
        </div>

        <!-- Preset 3 -->
        <div
          class="rounded-2xl border border-[#E2E8F0] bg-white p-4 transition-all flex flex-col justify-between hover:border-[#CBD5E1]"
        >
          <div class="space-y-2">
            <div
              class="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F3E8FF] text-[#7E22CE]"
            >
              <span class="material-symbols-outlined text-[18px]">task_alt</span>
            </div>
            <h3 class="font-bold text-[#0F172A] text-sm">Rekapitulasi Tiket Resolved</h3>
            <p class="text-xs text-[#64748B] leading-relaxed">
              Daftar tiket IT yang telah diselesaikan teknisi beserta durasinya.
            </p>
          </div>
          <button
            type="button"
            @click="applyPreset('tickets_resolved')"
            class="mt-4 w-full rounded-xl border border-[#E9D5FF] bg-[#F3E8FF] hover:bg-[#7E22CE] hover:text-white text-[#7E22CE] py-2 text-xs font-bold transition-all cursor-pointer"
          >
            Gunakan Templat Ini
          </button>
        </div>

        <!-- Preset 4 -->
        <div
          class="rounded-2xl border border-[#E2E8F0] bg-white p-4 transition-all flex flex-col justify-between hover:border-[#CBD5E1]"
        >
          <div class="space-y-2">
            <div
              class="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FEF3C7] text-[#B45309]"
            >
              <span class="material-symbols-outlined text-[18px]">security</span>
            </div>
            <h3 class="font-bold text-[#0F172A] text-sm">Log Security & Audit Login</h3>
            <p class="text-xs text-[#64748B] leading-relaxed">
              Riwayat login pengguna sistem, alamat IP, dan waktu autentikasi.
            </p>
          </div>
          <button
            type="button"
            @click="applyPreset('login_audit')"
            class="mt-4 w-full rounded-xl border border-[#FDE68A] bg-[#FEF3C7] hover:bg-[#B45309] hover:text-white text-[#B45309] py-2 text-xs font-bold transition-all cursor-pointer"
          >
            Gunakan Templat Ini
          </button>
        </div>
      </div>
    </div>

    <!-- LIVE PREVIEW MODAL -->
    <div
      v-if="showPreviewModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/40 backdrop-blur-xs p-4"
    >
      <div
        class="relative w-full max-w-4xl rounded-2xl bg-white shadow-xl overflow-hidden flex flex-col max-h-[85vh] text-[#0F172A]"
      >
        <!-- Modal Header -->
        <div class="flex items-center justify-between border-b border-[#F1F5F9] px-6 py-4">
          <div>
            <h3 class="text-base font-bold text-[#0F172A] flex items-center gap-2">
              <span class="material-symbols-outlined text-[18px] text-[#2563EB]">preview</span>
              <span>Pratinjau Data Ekspor (Sampel {{ previewData.length }} Baris)</span>
            </h3>
            <p class="text-xs text-[#64748B] font-mono">Tabel: {{ selectedTableKey }}</p>
          </div>
          <button
            type="button"
            @click="showPreviewModal = false"
            class="rounded-xl p-1.5 text-[#94A3B8] hover:bg-[#F8FAFC] hover:text-[#0F172A] transition-colors cursor-pointer"
          >
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <!-- Modal Body Table -->
        <div class="flex-1 overflow-auto p-6">
          <div v-if="previewData.length === 0" class="py-12 text-center text-xs text-[#94A3B8]">
            Tidak ada data untuk ditampilkan.
          </div>
          <table v-else class="w-full text-left text-xs border-collapse">
            <thead>
              <tr
                class="bg-[#F8FAFC] text-[#64748B] uppercase font-bold text-[10px] tracking-wider border-b border-[#E2E8F0]"
              >
                <th v-for="col in previewColumns" :key="col.name" class="p-3 whitespace-nowrap">
                  {{ col.label }}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[#F1F5F9]">
              <tr v-for="(row, idx) in previewData" :key="idx" class="hover:bg-[#F8FAFC]">
                <td
                  v-for="col in previewColumns"
                  :key="col.name"
                  class="p-3 text-[#334155] max-w-xs truncate"
                >
                  {{ row[col.name] !== null && row[col.name] !== undefined ? row[col.name] : '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Modal Footer -->
        <div
          class="flex items-center justify-between border-t border-[#F1F5F9] px-6 py-3.5 bg-white"
        >
          <span class="text-xs text-[#64748B]">
            Menampilkan maksimal 10 baris pertama sebagai gambaran format.
          </span>
          <div class="flex items-center gap-2.5">
            <button
              type="button"
              @click="showPreviewModal = false"
              class="rounded-xl border border-[#E2E8F0] bg-white px-4 py-2 text-xs font-semibold text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A] transition-colors cursor-pointer"
            >
              Tutup
            </button>
            <button
              type="button"
              @click="handleConfirmExportModal"
              class="rounded-xl bg-[#2563EB] px-4 py-2 text-xs font-bold text-white hover:bg-[#1D4ED8] transition-colors cursor-pointer"
            >
              Unduh Sekarang
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Reset Database Confirmation Modal -->
    <AppModal
      :is-open="showResetModal"
      title="Reset & Kosongkan Database"
      subtitle="Tindakan berbahaya ini akan membersihkan seluruh tabel data."
      icon="warning"
      size="md"
      @close="closeResetModal"
    >
      <div class="space-y-4 text-[#0F172A]">
        <div class="rounded-xl bg-rose-50 p-4 border border-rose-200 flex items-start gap-3">
          <span class="material-symbols-outlined text-rose-600 text-[22px] shrink-0 mt-0.5">error</span>
          <div class="text-xs text-rose-900 space-y-1">
            <p class="font-bold text-sm">Peringatan Keamanan Database</p>
            <p class="leading-relaxed text-rose-800">
              Tindakan ini <strong>TIDAK DAPAT DIBATALKAN</strong>. Seluruh data aset TI/GA/OPS, tiket bantuan, riwayat log audit, karyawan, dan sesi pengguna akan dihapus secara permanen.
            </p>
            <p class="text-[11px] text-rose-700">
              Setelah reset, akun Superadmin (<code class="font-mono font-semibold">superadmin@admin.com</code> / <code class="font-mono font-semibold">admin123</code>) dan unit helpdesk default akan disiapkan kembali secara otomatis.
            </p>
          </div>
        </div>

        <div class="space-y-2 pt-1">
          <label for="confirm-reset-input" class="block text-xs font-bold text-slate-800">
            Ketik <span class="font-mono text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded font-bold">RESET</span> di bawah ini untuk mengonfirmasi:
          </label>
          <input
            id="confirm-reset-input"
            v-model="confirmResetInput"
            type="text"
            placeholder="RESET"
            class="h-10 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-xs text-slate-900 font-mono tracking-wider focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
            @keydown.enter="confirmResetInput.trim().toUpperCase() === 'RESET' && handleConfirmResetDatabase()"
          />
        </div>

        <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-[#F1F5F9]">
          <button
            type="button"
            @click="closeResetModal"
            class="rounded-xl border border-[#E2E8F0] bg-white px-4 py-2 text-xs font-semibold text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A] transition-colors cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            :disabled="confirmResetInput.trim().toUpperCase() !== 'RESET' || isResetting"
            @click="handleConfirmResetDatabase"
            class="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 text-xs font-bold transition-all shadow-xs disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
          >
            <span v-if="isResetting" class="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
            <span v-else class="material-symbols-outlined text-[16px]">restart_alt</span>
            <span>{{ isResetting ? 'Me-reset...' : 'Reset Database Sekarang' }}</span>
          </button>
        </div>
      </div>
    </AppModal>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
