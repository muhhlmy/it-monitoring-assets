<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useApi } from '@/composables/useApi'
import { exportToCsv, exportToJson, exportToExcel, exportToPdf } from '@/utils/exportEngine'

const api = useApi()

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
const rowLimit = ref('all')
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

// Formatters
function formatDate(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

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
    selectedColumns.value = schema.columns
      .filter((c) => c.defaultSelected)
      .map((c) => c.name)
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
      exportSuccess = exportToPdf(res.data, columnsMeta, tableNameLabel, 'Laporan Kustom Database', {
        Tabel: tableNameLabel,
        'Rentang Tanggal': startDate.value && endDate.value ? `${startDate.value} s/d ${endDate.value}` : 'Semua',
        Pencarian: searchQuery.value || 'Semua',
      })
    }

    if (exportSuccess) {
      showToast(`Berhasil mengekspor ${res.data.length} baris data ke format ${exportFormat.value.toUpperCase()}!`)
    }
  } catch (error) {
    showToast(error.message || 'Gagal mengekspor data.', 'error')
  } finally {
    isExporting.value = false
  }
}

// Quick Export single table
async function handleQuickExport(tableName, format = 'csv') {
  isExporting.value = true
  try {
    const res = await api.post('/api/export/data', {
      tableName,
      limit: 'all',
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

// Full DB Dump Backup
async function handleFullDatabaseBackup() {
  isExporting.value = true
  try {
    const res = await api.get('/api/export/full-db')
    if (res.success) {
      exportToJson(res, 'Backup_Full_Database_ITAM')
      showToast(`Backup Full Database berhasil diunduh (${res.metadata.totalRecords} total record)!`)
    }
  } catch (error) {
    showToast(error.message || 'Gagal mengunduh backup database.', 'error')
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
  <div class="space-y-6 pb-12">
    <!-- Notification Toast -->
    <Transition name="fade">
      <div
        v-if="toast.show"
        class="fixed top-5 right-5 z-50 flex items-center gap-3 rounded-2xl px-5 py-3.5 shadow-2xl text-white font-medium text-sm border"
        :class="[
          toast.type === 'error'
            ? 'bg-red-600 border-red-400'
            : toast.type === 'warning'
              ? 'bg-amber-600 border-amber-400'
              : toast.type === 'info'
                ? 'bg-blue-600 border-blue-400'
                : 'bg-emerald-600 border-emerald-400'
        ]"
      >
        <span class="material-symbols-outlined text-[20px]">
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

    <!-- Header Banner Hero -->
    <div
      class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1E293B] via-[#0F172A] to-[#1E1B4B] p-6 lg:p-8 text-white shadow-xl border border-slate-700/50"
    >
      <!-- Background Glow Ornaments -->
      <div
        class="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl"
      ></div>
      <div
        class="absolute -left-16 -bottom-16 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl"
      ></div>

      <div class="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div class="space-y-2 max-w-2xl">
          <div class="inline-flex items-center gap-2 rounded-full bg-blue-500/20 px-3.5 py-1 text-xs font-semibold text-blue-300 border border-blue-400/30">
            <span class="material-symbols-outlined text-[16px]">database</span>
            <span>Pusat Data & Backup System</span>
          </div>
          <h1 class="text-2xl lg:text-3xl font-extrabold tracking-tight text-white">
            Pusat Ekspor Data Database
          </h1>
          <p class="text-slate-300 text-sm leading-relaxed">
            Ekspor seluruh dataset inventaris aset IT, data karyawan, tiket kendala, dan log audit sistem ke format berkas CSV, Excel, JSON, maupun PDF Laporan secara fleksibel.
          </p>
        </div>

        <!-- Quick Summary Cards -->
        <div class="flex items-center gap-3 shrink-0">
          <div class="rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 p-4 text-center min-w-[110px]">
            <p class="text-[11px] font-medium text-slate-300 uppercase tracking-wider">Total Tabel</p>
            <p class="mt-1 text-2xl font-extrabold text-white">{{ tables.length }}</p>
          </div>
          <div class="rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 p-4 text-center min-w-[130px]">
            <p class="text-[11px] font-medium text-slate-300 uppercase tracking-wider">Total Record</p>
            <p class="mt-1 text-2xl font-extrabold text-blue-400">
              {{ isLoading ? '...' : totalDbRecords.toLocaleString('id-ID') }}
            </p>
          </div>
          <button
            type="button"
            @click="handleFullDatabaseBackup"
            :disabled="isExporting || isLoading"
            class="group flex flex-col items-center justify-center rounded-2xl bg-blue-600 hover:bg-blue-500 text-white p-4 transition-all shadow-lg shadow-blue-600/30 cursor-pointer disabled:opacity-50 min-w-[120px]"
          >
            <span class="material-symbols-outlined text-[24px] group-hover:scale-110 transition-transform">cloud_download</span>
            <span class="mt-1 text-[11px] font-bold">Backup Full DB</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <div class="flex items-center justify-between border-b border-slate-200">
      <div class="flex items-center gap-2 overflow-x-auto pb-px">
        <button
          type="button"
          @click="activeTab = 'quick'"
          class="flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition-all cursor-pointer whitespace-nowrap"
          :class="
            activeTab === 'quick'
              ? 'border-[#5D87FF] text-[#5D87FF]'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          "
        >
          <span class="material-symbols-outlined text-[20px]">bolt</span>
          <span>Ekspor Cepat per Tabel</span>
        </button>

        <button
          type="button"
          @click="activeTab = 'custom'"
          class="flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition-all cursor-pointer whitespace-nowrap"
          :class="
            activeTab === 'custom'
              ? 'border-[#5D87FF] text-[#5D87FF]'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          "
        >
          <span class="material-symbols-outlined text-[20px]">tune</span>
          <span>Ekspor Kustom (Custom Query)</span>
          <span class="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-600">Advanced</span>
        </button>

        <button
          type="button"
          @click="activeTab = 'presets'"
          class="flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition-all cursor-pointer whitespace-nowrap"
          :class="
            activeTab === 'presets'
              ? 'border-[#5D87FF] text-[#5D87FF]'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          "
        >
          <span class="material-symbols-outlined text-[20px]">bookmark</span>
          <span>Templat Laporan Populer</span>
        </button>
      </div>

      <button
        type="button"
        @click="fetchTablesMetadata"
        class="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#5D87FF] transition-colors cursor-pointer"
      >
        <span class="material-symbols-outlined text-[16px]">refresh</span>
        <span>Refresh Stats</span>
      </button>
    </div>

    <!-- TAB 1: EKSPOR CEPAT PER TABEL -->
    <div v-if="activeTab === 'quick'" class="space-y-4">
      <div v-if="isLoading" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div v-for="i in 8" :key="i" class="h-44 rounded-2xl bg-slate-100 animate-pulse"></div>
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          v-for="table in tables"
          :key="table.tableName"
          class="group relative flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:shadow-md hover:border-blue-300 transition-all"
        >
          <div>
            <div class="flex items-center justify-between gap-2 mb-3">
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#5D87FF] group-hover:bg-[#5D87FF] group-hover:text-white transition-colors">
                <span class="material-symbols-outlined text-[22px]">{{ table.icon }}</span>
              </div>
              <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                {{ table.rowCount.toLocaleString('id-ID') }} Record
              </span>
            </div>

            <h3 class="font-bold text-slate-800 text-base group-hover:text-[#5D87FF] transition-colors">
              {{ table.label }}
            </h3>
            <p class="mt-1 text-xs text-slate-500 line-clamp-2 leading-relaxed">
              {{ table.description }}
            </p>
          </div>

          <div class="mt-5 pt-3 border-t border-slate-100">
            <p class="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Unduh Format</p>
            <div class="grid grid-cols-4 gap-1.5">
              <button
                type="button"
                @click="handleQuickExport(table.tableName, 'csv')"
                title="Unduh berkas CSV"
                class="flex items-center justify-center rounded-lg bg-emerald-50 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-600 hover:text-white transition-colors cursor-pointer"
              >
                CSV
              </button>
              <button
                type="button"
                @click="handleQuickExport(table.tableName, 'excel')"
                title="Unduh berkas Excel (.xls)"
                class="flex items-center justify-center rounded-lg bg-green-50 py-2 text-xs font-bold text-green-700 hover:bg-green-600 hover:text-white transition-colors cursor-pointer"
              >
                XLS
              </button>
              <button
                type="button"
                @click="handleQuickExport(table.tableName, 'json')"
                title="Unduh berkas JSON"
                class="flex items-center justify-center rounded-lg bg-amber-50 py-2 text-xs font-bold text-amber-700 hover:bg-amber-600 hover:text-white transition-colors cursor-pointer"
              >
                JSON
              </button>
              <button
                type="button"
                @click="handleQuickExport(table.tableName, 'pdf')"
                title="Cetak Laporan PDF"
                class="flex items-center justify-center rounded-lg bg-red-50 py-2 text-xs font-bold text-red-700 hover:bg-red-600 hover:text-white transition-colors cursor-pointer"
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
        <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-base font-bold text-slate-800 flex items-center gap-2">
              <span class="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white text-xs">1</span>
              <span>Pilih Tabel Utama Database</span>
            </h2>
            <span class="text-xs text-slate-500 font-medium" v-if="currentTableSchema">
              {{ currentTableSchema.columns.length }} Kolom Tersedia
            </span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <button
              v-for="tbl in tables"
              :key="tbl.tableName"
              type="button"
              @click="selectedTableKey = tbl.tableName"
              class="flex flex-col p-3.5 rounded-xl border text-left transition-all cursor-pointer relative"
              :class="
                selectedTableKey === tbl.tableName
                  ? 'border-[#5D87FF] bg-blue-50/50 ring-2 ring-blue-500/20'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              "
            >
              <span class="material-symbols-outlined text-[20px] mb-1" :class="selectedTableKey === tbl.tableName ? 'text-[#5D87FF]' : 'text-slate-500'">
                {{ tbl.icon }}
              </span>
              <span class="text-xs font-bold text-slate-800 truncate">{{ tbl.label }}</span>
              <span class="text-[10px] text-slate-500 mt-0.5">{{ tbl.rowCount }} rows</span>
            </button>
          </div>
        </div>

        <!-- Step 2: Choose Columns / Fields -->
        <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-base font-bold text-slate-800 flex items-center gap-2">
              <span class="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white text-xs">2</span>
              <span>Pilih Kolom (Field Selector)</span>
            </h2>
            <div class="flex items-center gap-3">
              <button
                type="button"
                @click="selectAllColumns"
                class="text-xs font-bold text-[#5D87FF] hover:underline cursor-pointer"
              >
                Pilih Semua
              </button>
              <span class="text-slate-300">|</span>
              <button
                type="button"
                @click="deselectAllColumns"
                class="text-xs font-bold text-slate-500 hover:underline cursor-pointer"
              >
                Kosongkan
              </button>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto pr-1">
            <label
              v-for="col in currentTableColumns"
              :key="col.name"
              class="flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-all"
              :class="
                selectedColumns.includes(col.name)
                  ? 'border-blue-300 bg-blue-50/40 text-blue-900 font-semibold'
                  : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
              "
            >
              <input
                type="checkbox"
                :value="col.name"
                v-model="selectedColumns"
                class="h-4 w-4 rounded-md border-slate-300 text-[#5D87FF] focus:ring-[#5D87FF]"
              />
              <div class="min-w-0 flex-1">
                <p class="text-xs truncate leading-tight">{{ col.label }}</p>
                <p class="text-[10px] font-mono text-slate-400 truncate">{{ col.name }}</p>
              </div>
            </label>
          </div>
          <p class="text-[11px] text-slate-400">
            Terpilih: <strong class="text-slate-700">{{ selectedColumns.length }}</strong> dari {{ currentTableColumns.length }} kolom.
          </p>
        </div>

        <!-- Step 3: Date & Filter Settings -->
        <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <h2 class="text-base font-bold text-slate-800 flex items-center gap-2">
            <span class="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white text-xs">3</span>
            <span>Filter & Batas Baris Data</span>
          </h2>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Tanggal Mulai</label>
              <input
                type="date"
                v-model="startDate"
                class="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-800 focus:border-[#5D87FF] focus:outline-hidden"
              />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Tanggal Selesai</label>
              <input
                type="date"
                v-model="endDate"
                class="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-800 focus:border-[#5D87FF] focus:outline-hidden"
              />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Batas Maksimal Baris</label>
              <select
                v-model="rowLimit"
                class="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-800 focus:border-[#5D87FF] focus:outline-hidden"
              >
                <option value="all">Semua Baris Data</option>
                <option value="50">50 Baris Pertama</option>
                <option value="100">100 Baris Pertama</option>
                <option value="500">500 Baris Pertama</option>
                <option value="1000">1000 Baris Pertama</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Pencarian Kata Kunci</label>
              <div class="relative">
                <span class="material-symbols-outlined absolute left-3 top-2.5 text-[18px] text-slate-400">search</span>
                <input
                  type="text"
                  v-model="searchQuery"
                  placeholder="Cari kata kunci data..."
                  class="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2 text-xs text-slate-800 focus:border-[#5D87FF] focus:outline-hidden"
                />
              </div>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Filter Status (Jika Ada)</label>
              <input
                type="text"
                v-model="statusFilter"
                placeholder="misal: Digunakan, Rusak, Resolved..."
                class="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-800 focus:border-[#5D87FF] focus:outline-hidden"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Right Column: Export Output Controls & Preview Trigger -->
      <div class="lg:col-span-4 space-y-6">
        <div class="sticky top-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
          <h2 class="text-base font-bold text-slate-800 flex items-center gap-2">
            <span class="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white text-xs">4</span>
            <span>Format & Unduh File</span>
          </h2>

          <!-- Choose Format -->
          <div class="space-y-2">
            <label class="block text-xs font-semibold text-slate-700">Format File Ekspor</label>
            <div class="grid grid-cols-2 gap-2.5">
              <label
                class="flex cursor-pointer items-center justify-between rounded-xl border p-3 transition-all"
                :class="exportFormat === 'csv' ? 'border-[#5D87FF] bg-blue-50/50 text-[#5D87FF] font-bold' : 'border-slate-200 text-slate-700'"
              >
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-[20px]">csv</span>
                  <span class="text-xs">CSV (.csv)</span>
                </div>
                <input type="radio" v-model="exportFormat" value="csv" class="accent-[#5D87FF]" />
              </label>

              <label
                class="flex cursor-pointer items-center justify-between rounded-xl border p-3 transition-all"
                :class="exportFormat === 'excel' ? 'border-green-600 bg-green-50/50 text-green-700 font-bold' : 'border-slate-200 text-slate-700'"
              >
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-[20px]">table_chart</span>
                  <span class="text-xs">Excel (.xls)</span>
                </div>
                <input type="radio" v-model="exportFormat" value="excel" class="accent-green-600" />
              </label>

              <label
                class="flex cursor-pointer items-center justify-between rounded-xl border p-3 transition-all"
                :class="exportFormat === 'json' ? 'border-amber-600 bg-amber-50/50 text-amber-700 font-bold' : 'border-slate-200 text-slate-700'"
              >
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-[20px]">code</span>
                  <span class="text-xs">JSON (.json)</span>
                </div>
                <input type="radio" v-model="exportFormat" value="json" class="accent-amber-600" />
              </label>

              <label
                class="flex cursor-pointer items-center justify-between rounded-xl border p-3 transition-all"
                :class="exportFormat === 'pdf' ? 'border-red-600 bg-red-50/50 text-red-700 font-bold' : 'border-slate-200 text-slate-700'"
              >
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-[20px]">picture_as_pdf</span>
                  <span class="text-xs">PDF Report</span>
                </div>
                <input type="radio" v-model="exportFormat" value="pdf" class="accent-red-600" />
              </label>
            </div>
          </div>

          <!-- Summary Box -->
          <div class="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2 text-xs">
            <div class="flex justify-between text-slate-600">
              <span>Tabel Terpilih:</span>
              <strong class="text-slate-900 font-mono">{{ selectedTableKey }}</strong>
            </div>
            <div class="flex justify-between text-slate-600">
              <span>Jumlah Kolom:</span>
              <strong class="text-slate-900">{{ selectedColumns.length }} Kolom</strong>
            </div>
            <div class="flex justify-between text-slate-600">
              <span>Batas Baris:</span>
              <strong class="text-slate-900 capitalize">{{ rowLimit }}</strong>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="space-y-2 pt-2">
            <button
              type="button"
              @click="loadPreview"
              :disabled="isPreviewing || selectedColumns.length === 0"
              class="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white py-3 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-all cursor-pointer disabled:opacity-50"
            >
              <span class="material-symbols-outlined text-[18px]">visibility</span>
              <span>{{ isPreviewing ? 'Memuat Pratinjau...' : 'Pratinjau Data (10 Baris)' }}</span>
            </button>

            <button
              type="button"
              @click="handleExecuteCustomExport"
              :disabled="isExporting || selectedColumns.length === 0"
              class="w-full flex items-center justify-center gap-2 rounded-xl bg-[#5D87FF] hover:bg-blue-600 py-3.5 text-xs font-bold text-white shadow-lg shadow-blue-500/25 transition-all cursor-pointer disabled:opacity-50"
            >
              <span class="material-symbols-outlined text-[20px]">download</span>
              <span>{{ isExporting ? 'Proses Ekspor...' : 'Unduh Berkas Ekspor' }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 3: TEMPLAT LAPORAN POPULER -->
    <div v-if="activeTab === 'presets'" class="space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- Preset 1 -->
        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between">
          <div>
            <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-[#5D87FF] mb-3">
              <span class="material-symbols-outlined text-[22px]">devices_other</span>
            </div>
            <h3 class="font-bold text-slate-800 text-base">Laporan Aset IT Aktif</h3>
            <p class="mt-1 text-xs text-slate-500 leading-relaxed">
              Daftar seluruh aset IT dengan status 'Digunakan' lengkap dengan nama karyawan pemegang.
            </p>
          </div>
          <button
            type="button"
            @click="applyPreset('assets_active')"
            class="mt-5 w-full rounded-xl bg-blue-50 hover:bg-[#5D87FF] hover:text-white text-[#5D87FF] py-2.5 text-xs font-bold transition-colors cursor-pointer"
          >
            Gunakan Templat Ini
          </button>
        </div>

        <!-- Preset 2 -->
        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between">
          <div>
            <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 mb-3">
              <span class="material-symbols-outlined text-[22px]">badge</span>
            </div>
            <h3 class="font-bold text-slate-800 text-base">Master Data Karyawan</h3>
            <p class="mt-1 text-xs text-slate-500 leading-relaxed">
              Daftar profil karyawan, NIK, jabatan, departemen, dan lokasi kantor untuk audit HR & IT.
            </p>
          </div>
          <button
            type="button"
            @click="applyPreset('employees_dept')"
            class="mt-5 w-full rounded-xl bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-700 py-2.5 text-xs font-bold transition-colors cursor-pointer"
          >
            Gunakan Templat Ini
          </button>
        </div>

        <!-- Preset 3 -->
        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between">
          <div>
            <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-600 mb-3">
              <span class="material-symbols-outlined text-[22px]">task_alt</span>
            </div>
            <h3 class="font-bold text-slate-800 text-base">Rekapitulasi Tiket Resolved</h3>
            <p class="mt-1 text-xs text-slate-500 leading-relaxed">
              Daftar penanganan kendala IT yang telah berhasil diselesaikan teknisi beserta durasinya.
            </p>
          </div>
          <button
            type="button"
            @click="applyPreset('tickets_resolved')"
            class="mt-5 w-full rounded-xl bg-purple-50 hover:bg-purple-600 hover:text-white text-purple-700 py-2.5 text-xs font-bold transition-colors cursor-pointer"
          >
            Gunakan Templat Ini
          </button>
        </div>

        <!-- Preset 4 -->
        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between">
          <div>
            <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700 mb-3">
              <span class="material-symbols-outlined text-[22px]">security</span>
            </div>
            <h3 class="font-bold text-slate-800 text-base">Log Security & Audit Login</h3>
            <p class="mt-1 text-xs text-slate-500 leading-relaxed">
              Riwayat login pengguna sistem, alamat IP, dan waktu autentikasi untuk kepatuhan keamanan IT.
            </p>
          </div>
          <button
            type="button"
            @click="applyPreset('login_audit')"
            class="mt-5 w-full rounded-xl bg-amber-50 hover:bg-amber-600 hover:text-white text-amber-700 py-2.5 text-xs font-bold transition-colors cursor-pointer"
          >
            Gunakan Templat Ini
          </button>
        </div>
      </div>
    </div>

    <!-- LIVE PREVIEW MODAL -->
    <div
      v-if="showPreviewModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
    >
      <div class="relative w-full max-w-5xl rounded-3xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <!-- Modal Header -->
        <div class="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50">
          <div>
            <h3 class="text-base font-bold text-slate-800 flex items-center gap-2">
              <span class="material-symbols-outlined text-[20px] text-[#5D87FF]">preview</span>
              <span>Pratinjau Data Ekspor (Sampel {{ previewData.length }} Baris)</span>
            </h3>
            <p class="text-xs text-slate-500 font-mono">Tabel: {{ selectedTableKey }}</p>
          </div>
          <button
            type="button"
            @click="showPreviewModal = false"
            class="rounded-xl p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors cursor-pointer"
          >
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <!-- Modal Body Table -->
        <div class="flex-1 overflow-auto p-6">
          <div v-if="previewData.length === 0" class="py-12 text-center text-slate-400">
            Tidak ada data untuk ditampilkan.
          </div>
          <table v-else class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="bg-slate-100 text-slate-700 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                <th v-for="col in previewColumns" :key="col.name" class="p-3 whitespace-nowrap">
                  {{ col.label }}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="(row, idx) in previewData" :key="idx" class="hover:bg-slate-50">
                <td v-for="col in previewColumns" :key="col.name" class="p-3 text-slate-700 max-w-xs truncate">
                  {{ row[col.name] !== null && row[col.name] !== undefined ? row[col.name] : '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Modal Footer -->
        <div class="flex items-center justify-between border-t border-slate-200 px-6 py-4 bg-slate-50">
          <span class="text-xs text-slate-500">
            Menampilkan maksimal 10 baris pertama sebagai gambaran format.
          </span>
          <div class="flex items-center gap-3">
            <button
              type="button"
              @click="showPreviewModal = false"
              class="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Tutup
            </button>
            <button
              type="button"
              @click="handleExecuteCustomExport(); showPreviewModal = false;"
              class="rounded-xl bg-[#5D87FF] px-4 py-2 text-xs font-bold text-white hover:bg-blue-600 transition-colors cursor-pointer"
            >
              Unduh Sekarang
            </button>
          </div>
        </div>
      </div>
    </div>
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
