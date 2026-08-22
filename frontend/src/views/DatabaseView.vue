<script setup>
import { ref, computed, onMounted } from 'vue'
import { useApi } from '@/composables/useApi'
import { useAuth } from '@/composables/useAuth'
import { getAuthToken } from '@/utils/authStorage.js'
import AppModal from '@/components/ui/AppModal.vue'
import SkeletonCard from '@/components/ui/skeleton/SkeletonCard.vue'

const api = useApi()
const { isSuperAdmin } = useAuth()

// ========== State ==========
const isLoading = ref(true)
const isBackingUp = ref(false)
const activeTab = ref('overview') // 'overview' | 'history' | 'restore' | 'audit'

// Database Status
const dbStatus = ref({
  connected: false,
  databaseName: '',
  schemaHealthy: false,
  pgDumpAvailable: false,
  pgRestoreAvailable: false,
  psqlAvailable: false,
  backupStorageAvailable: false,
  backupCount: 0,
  lastBackup: null,
  tables: [],
  views: [],
  missingTables: [],
  missingViews: [],
})

// Backup History
const backups = ref([])
const backupPagination = ref({ page: 1, pageSize: 20, total: 0, totalPages: 0 })
const isLoadingBackups = ref(false)

// Restore
const restoreFile = ref(null)
const isUploading = ref(false)
const isRestoring = ref(false)
const restoreValidation = ref(null)
const restoreStep = ref('upload') // 'upload' | 'validating' | 'review' | 'restoring' | 'done'
const restoreError = ref('')
const restoreResult = ref(null)

// Restore Confirmation
const showRestoreConfirm = ref(false)
const confirmRestoreInput = ref('')

// Delete Confirmation
const showDeleteConfirm = ref(false)
const deleteTargetId = ref(null)
const deleteTargetName = ref('')
const isDeleting = ref(false)

// Audit Logs
const auditLogs = ref([])
const auditPagination = ref({ page: 1, pageSize: 50, total: 0, totalPages: 0 })
const isLoadingAudit = ref(false)

// Toast
const toast = ref({ show: false, message: '', type: 'success' })

function showToast(message, type = 'success') {
  toast.value = { show: true, message, type }
  setTimeout(() => { toast.value.show = false }, 4000)
}

// ========== Formatters ==========
function formatBytes(bytes) {
  const num = Number(bytes)
  if (!num || num <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(num) / Math.log(1024)), units.length - 1)
  return `${(num / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return d.toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatTimeAgo(dateStr) {
  if (!dateStr) return '-'
  const now = new Date()
  const d = new Date(dateStr)
  const diff = now - d
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Baru saja'
  if (mins < 60) return `${mins} menit lalu`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} jam lalu`
  const days = Math.floor(hrs / 24)
  return `${days} hari lalu`
}

function statusLabel(status) {
  return status === 'success' ? 'Berhasil' : status === 'failed' ? 'Gagal' : 'Proses'
}

function statusClass(status) {
  return status === 'success'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : status === 'failed'
      ? 'bg-red-50 text-red-700 border-red-200'
      : 'bg-amber-50 text-amber-700 border-amber-200'
}

function operationLabel(op) {
  const map = {
    BACKUP_STARTED: 'Backup Dimulai',
    BACKUP_SUCCESS: 'Backup Berhasil',
    BACKUP_FAILED: 'Backup Gagal',
    RESTORE_STARTED: 'Restore Dimulai',
    RESTORE_VALIDATED: 'Restore Divalidasi',
    PRE_RESTORE_BACKUP_STARTED: 'Safety Backup Dimulai',
    PRE_RESTORE_BACKUP_SUCCESS: 'Safety Backup Berhasil',
    PRE_RESTORE_BACKUP_FAILED: 'Safety Backup Gagal',
    RESTORE_SUCCESS: 'Restore Berhasil',
    RESTORE_FAILED: 'Restore Gagal',
    BACKUP_DELETED: 'Backup Dihapus',
    BACKUP_DOWNLOADED: 'Backup Didownload',
  }
  return map[op] || op
}

// ========== API Calls ==========
async function fetchDatabaseStatus() {
  try {
    const res = await api.get('/api/admin/database/status')
    dbStatus.value = res.data || res
  } catch (err) {
    showToast('Gagal memuat status database.', 'error')
  }
}

async function fetchBackupHistory(page = 1) {
  isLoadingBackups.value = true
  try {
    const res = await api.get(`/api/admin/database/backups?page=${page}&pageSize=20`)
    backups.value = res.data || []
    if (res.pagination) backupPagination.value = res.pagination
  } catch (err) {
    showToast('Gagal memuat riwayat backup.', 'error')
  } finally {
    isLoadingBackups.value = false
  }
}

async function fetchAuditLogs(page = 1) {
  isLoadingAudit.value = true
  try {
    const res = await api.get(`/api/admin/database/audit-logs?page=${page}&pageSize=50`)
    auditLogs.value = res.data || []
    if (res.pagination) auditPagination.value = res.pagination
  } catch (err) {
    showToast('Gagal memuat audit log.', 'error')
  } finally {
    isLoadingAudit.value = false
  }
}

async function handleBackupNow() {
  isBackingUp.value = true
  try {
    const res = await api.post('/api/admin/database/backups')
    showToast(res.message || 'Backup berhasil dibuat!', 'success')
    await fetchDatabaseStatus()
    await fetchBackupHistory()
  } catch (err) {
    showToast(err.message || 'Gagal membuat backup.', 'error')
  } finally {
    isBackingUp.value = false
  }
}

async function handleDownload(backup) {
  try {
    const token = getAuthToken()
    const baseUrl = import.meta.env.VITE_API_BASE_URL || ''
    const url = `${baseUrl}/api/admin/database/backups/${backup.id}/download`

    const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error?.message || 'Gagal mendownload backup.')
    }

    const blob = await response.blob()
    const downloadUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = backup.filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(downloadUrl)
  } catch (err) {
    showToast(err.message || 'Gagal mendownload backup.', 'error')
  }
}

function openDeleteConfirm(backup) {
  deleteTargetId.value = backup.id
  deleteTargetName.value = backup.filename
  showDeleteConfirm.value = true
}

async function handleDeleteConfirm() {
  isDeleting.value = true
  try {
    const res = await api.del(`/api/admin/database/backups/${deleteTargetId.value}`)
    showToast(res.message || 'Backup berhasil dihapus.', 'success')
    showDeleteConfirm.value = false
    await fetchBackupHistory()
    await fetchDatabaseStatus()
  } catch (err) {
    showToast(err.message || 'Gagal menghapus backup.', 'error')
  } finally {
    isDeleting.value = false
  }
}

function handleRestoreFromHistory(backup) {
  // Switch to restore tab with pre-selected
  activeTab.value = 'restore'
}

// ========== Restore Flow ==========
function handleFileSelect(event) {
  const file = event.target.files?.[0]
  if (file) {
    restoreFile.value = file
    restoreStep.value = 'upload'
    restoreValidation.value = null
    restoreError.value = ''
  }
}

async function handleValidateRestore() {
  if (!restoreFile.value) {
    showToast('Pilih file backup terlebih dahulu.', 'error')
    return
  }

  restoreStep.value = 'validating'
  restoreError.value = ''

  try {
    const formData = new FormData()
    formData.append('backupFile', restoreFile.value)

    const token = getAuthToken()
    const baseUrl = import.meta.env.VITE_API_BASE_URL || ''

    const response = await fetch(`${baseUrl}/api/admin/database/restore/validate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    })

    const res = await response.json()

    if (!response.ok || !res.success) {
      throw new Error(res.error?.message || 'Validasi gagal.')
    }

    restoreValidation.value = res.data
    restoreStep.value = 'review'
  } catch (err) {
    restoreStep.value = 'upload'
    restoreError.value = err.message || 'Validasi gagal.'
  }
}

function openRestoreConfirm() {
  confirmRestoreInput.value = ''
  showRestoreConfirm.value = true
}

async function handleConfirmRestore() {
  if (confirmRestoreInput.value.trim() !== 'RESTORE DATABASE') {
    showToast('Ketik "RESTORE DATABASE" untuk mengonfirmasi.', 'error')
    return
  }

  showRestoreConfirm.value = false
  restoreStep.value = 'restoring'
  restoreError.value = ''

  try {
    const formData = new FormData()
    formData.append('backupFile', restoreFile.value)

    const token = getAuthToken()
    const baseUrl = import.meta.env.VITE_API_BASE_URL || ''

    const response = await fetch(`${baseUrl}/api/admin/database/restore`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    })

    const res = await response.json()

    if (!response.ok || !res.success) {
      throw new Error(res.error?.message || 'Restore gagal.')
    }

    restoreResult.value = res.data
    restoreStep.value = 'done'
    showToast('Restore database berhasil! Silakan login kembali.', 'success')
    // Session invalid setelah restore — redirect ke login
    setTimeout(() => {
      window.location.href = '/login'
    }, 2000)
  } catch (err) {
    restoreStep.value = 'review'
    restoreError.value = err.message || 'Restore gagal.'
    showToast(restoreError.value, 'error')
  }
}

function resetRestore() {
  restoreFile.value = null
  restoreValidation.value = null
  restoreStep.value = 'upload'
  restoreError.value = ''
  restoreResult.value = null
}

// ========== Lifecycle ==========
onMounted(async () => {
  isLoading.value = true
  await Promise.all([fetchDatabaseStatus(), fetchBackupHistory()])
  isLoading.value = false
})

function switchTab(tab) {
  activeTab.value = tab
  if (tab === 'audit' && auditLogs.value.length === 0) {
    fetchAuditLogs()
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- Page Header -->
    <div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-[#1E293B]">Database</h1>
        <p class="text-sm text-[#64748B]">Backup & restore database PostgreSQL</p>
      </div>
      <div class="flex items-center gap-2">
        <button
          :disabled="isBackingUp || !dbStatus.pgDumpAvailable"
          class="inline-flex items-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-50"
          @click="handleBackupNow"
        >
          <span v-if="isBackingUp" class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
          <span v-else class="material-symbols-outlined text-lg">database</span>
          {{ isBackingUp ? 'Membuat Backup...' : 'Backup Now' }}
        </button>
      </div>
    </div>

    <!-- Tab Navigation -->
    <div class="flex gap-1 rounded-xl bg-[#F1F5F9] p-1 w-fit">
      <button
        v-for="tab in [
          { key: 'overview', label: 'Overview', icon: 'monitor_heart' },
          { key: 'history', label: 'Backup History', icon: 'history' },
          { key: 'restore', label: 'Restore', icon: 'restore_page' },
          { key: 'audit', label: 'Audit Log', icon: 'receipt_long' },
        ]"
        :key="tab.key"
        class="flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all"
        :class="activeTab === tab.key
          ? 'bg-white text-[#1E293B] shadow-sm'
          : 'text-[#64748B] hover:text-[#334155]'"
        @click="switchTab(tab.key)"
      >
        <span class="material-symbols-outlined text-base">{{ tab.icon }}</span>
        {{ tab.label }}
      </button>
    </div>

    <!-- Loading Skeleton -->
    <div v-if="isLoading" class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      <SkeletonCard v-for="i in 4" :key="i" />
    </div>

    <!-- ===== OVERVIEW TAB ===== -->
    <template v-if="!isLoading && activeTab === 'overview'">
      <!-- Status Cards -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-xl border border-[#E5EAEF] bg-white p-4 shadow-sm">
          <div class="flex items-center gap-2 text-sm text-[#64748B]">
            <span class="material-symbols-outlined text-base">database</span>
            PostgreSQL
          </div>
          <div class="mt-2 flex items-center gap-2">
            <span class="inline-block h-2.5 w-2.5 rounded-full" :class="dbStatus.connected ? 'bg-emerald-500' : 'bg-red-500'"></span>
            <span class="text-lg font-semibold text-[#1E293B]">{{ dbStatus.connected ? 'Connected' : 'Disconnected' }}</span>
          </div>
          <div class="mt-1 text-xs text-[#94A3B8]">{{ dbStatus.databaseName }}</div>
        </div>

        <div class="rounded-xl border border-[#E5EAEF] bg-white p-4 shadow-sm">
          <div class="flex items-center gap-2 text-sm text-[#64748B]">
            <span class="material-symbols-outlined text-base">checklist</span>
            Schema
          </div>
          <div class="mt-2 flex items-center gap-2">
            <span class="inline-block h-2.5 w-2.5 rounded-full" :class="dbStatus.schemaHealthy ? 'bg-emerald-500' : 'bg-amber-500'"></span>
            <span class="text-lg font-semibold text-[#1E293B]">{{ dbStatus.schemaHealthy ? 'Healthy' : 'Incomplete' }}</span>
          </div>
          <div class="mt-1 text-xs text-[#94A3B8]">{{ dbStatus.tables.length }} tables, {{ dbStatus.views.length }} views</div>
        </div>

        <div class="rounded-xl border border-[#E5EAEF] bg-white p-4 shadow-sm">
          <div class="flex items-center gap-2 text-sm text-[#64748B]">
            <span class="material-symbols-outlined text-base">terminal</span>
            Tools
          </div>
          <div class="mt-2 space-y-1">
            <div class="flex items-center gap-2 text-xs">
              <span class="inline-block h-1.5 w-1.5 rounded-full" :class="dbStatus.pgDumpAvailable ? 'bg-emerald-500' : 'bg-red-500'"></span>
              <span class="text-[#64748B]">pg_dump</span>
              <span class="text-[#94A3B8]">{{ dbStatus.pgDumpAvailable ? 'Ready' : 'Not Found' }}</span>
            </div>
            <div class="flex items-center gap-2 text-xs">
              <span class="inline-block h-1.5 w-1.5 rounded-full" :class="dbStatus.pgRestoreAvailable ? 'bg-emerald-500' : 'bg-red-500'"></span>
              <span class="text-[#64748B]">pg_restore</span>
              <span class="text-[#94A3B8]">{{ dbStatus.pgRestoreAvailable ? 'Ready' : 'Not Found' }}</span>
            </div>
            <div class="flex items-center gap-2 text-xs">
              <span class="inline-block h-1.5 w-1.5 rounded-full" :class="dbStatus.psqlAvailable ? 'bg-emerald-500' : 'bg-red-500'"></span>
              <span class="text-[#64748B]">psql</span>
              <span class="text-[#94A3B8]">{{ dbStatus.psqlAvailable ? 'Ready' : 'Not Found' }}</span>
            </div>
          </div>
        </div>

        <div class="rounded-xl border border-[#E5EAEF] bg-white p-4 shadow-sm">
          <div class="flex items-center gap-2 text-sm text-[#64748B]">
            <span class="material-symbols-outlined text-base">folder</span>
            Storage
          </div>
          <div class="mt-2 flex items-center gap-2">
            <span class="inline-block h-2.5 w-2.5 rounded-full" :class="dbStatus.backupStorageAvailable ? 'bg-emerald-500' : 'bg-red-500'"></span>
            <span class="text-lg font-semibold text-[#1E293B]">{{ dbStatus.backupStorageAvailable ? 'Available' : 'Unavailable' }}</span>
          </div>
          <div class="mt-1 text-xs text-[#94A3B8]">{{ dbStatus.backupCount }} backup files</div>
        </div>
      </div>

      <!-- Missing schema warning -->
      <div
        v-if="!dbStatus.schemaHealthy && dbStatus.connected"
        class="rounded-xl border border-amber-200 bg-amber-50 p-4"
      >
        <div class="flex items-start gap-2">
          <span class="material-symbols-outlined text-amber-600">warning</span>
          <div>
            <p class="font-semibold text-amber-800">Schema tidak lengkap</p>
            <p v-if="dbStatus.missingTables?.length" class="mt-1 text-sm text-amber-700">
              Tabel hilang: {{ dbStatus.missingTables.join(', ') }}
            </p>
            <p v-if="dbStatus.missingViews?.length" class="mt-1 text-sm text-amber-700">
              View hilang: {{ dbStatus.missingViews.join(', ') }}
            </p>
          </div>
        </div>
      </div>

      <!-- Tools unavailable warning -->
      <div
        v-if="dbStatus.connected && (!dbStatus.pgDumpAvailable || !dbStatus.pgRestoreAvailable)"
        class="rounded-xl border border-red-200 bg-red-50 p-4"
      >
        <div class="flex items-start gap-2">
          <span class="material-symbols-outlined text-red-600">error</span>
          <div>
            <p class="font-semibold text-red-800">PostgreSQL utility tidak tersedia</p>
            <p v-if="!dbStatus.pgDumpAvailable" class="mt-1 text-sm text-red-700">
              Backup unavailable: PostgreSQL utility "pg_dump" was not found.
            </p>
            <p v-if="!dbStatus.pgRestoreAvailable" class="mt-1 text-sm text-red-700">
              Restore unavailable: PostgreSQL utility "pg_restore" was not found.
            </p>
          </div>
        </div>
      </div>
    </template>

    <!-- ===== BACKUP HISTORY TAB ===== -->
    <template v-if="!isLoading && activeTab === 'history'">
      <div class="rounded-xl border border-[#E5EAEF] bg-white shadow-sm">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="border-b border-[#F1F5F9] bg-[#F8FAFC] text-xs font-semibold uppercase text-[#64748B]">
              <tr>
                <th class="px-4 py-3">Filename</th>
                <th class="px-4 py-3">Date</th>
                <th class="px-4 py-3">Size</th>
                <th class="px-4 py-3">Created By</th>
                <th class="px-4 py-3">Status</th>
                <th class="px-4 py-3">Checksum</th>
                <th class="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[#F1F5F9]">
              <tr v-if="backups.length === 0 && !isLoadingBackups">
                <td colspan="7" class="px-4 py-12 text-center text-[#94A3B8]">
                  <span class="material-symbols-outlined mb-2 block text-3xl">database_off</span>
                  Belum ada backup
                </td>
              </tr>
              <tr v-for="backup in backups" :key="backup.id" class="hover:bg-[#F8FAFC] transition-colors">
                <td class="px-4 py-3 font-medium text-[#1E293B] max-w-[220px] truncate" :title="backup.filename">
                  {{ backup.filename }}
                </td>
                <td class="px-4 py-3 text-[#64748B] whitespace-nowrap">
                  {{ formatDate(backup.created_at) }}
                </td>
                <td class="px-4 py-3 text-[#64748B] whitespace-nowrap">
                  {{ formatBytes(backup.file_size) }}
                </td>
                <td class="px-4 py-3 text-[#64748B]">{{ backup.created_by_name || '-' }}</td>
                <td class="px-4 py-3">
                  <span class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium" :class="statusClass(backup.status)">
                    {{ statusLabel(backup.status) }}
                  </span>
                </td>
                <td class="px-4 py-3 text-[#94A3B8] font-mono text-xs max-w-[100px] truncate" :title="backup.checksum">
                  {{ backup.checksum ? backup.checksum.slice(0, 12) + '...' : '-' }}
                </td>
                <td class="px-4 py-3">
                  <div class="flex items-center justify-end gap-1">
                    <button
                      v-if="backup.status === 'success'"
                      class="rounded-lg p-1.5 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#2563EB] transition-colors"
                      title="Download"
                      @click="handleDownload(backup)"
                    >
                      <span class="material-symbols-outlined text-lg">download</span>
                    </button>
                    <button
                      class="rounded-lg p-1.5 text-[#64748B] hover:bg-[#F1F5F9] hover:text-red-600 transition-colors"
                      title="Delete"
                      @click="openDeleteConfirm(backup)"
                    >
                      <span class="material-symbols-outlined text-lg">delete</span>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- ===== RESTORE TAB ===== -->
    <template v-if="!isLoading && activeTab === 'restore'">
      <div class="rounded-xl border border-[#E5EAEF] bg-white p-6 shadow-sm">
        <!-- Warning Banner -->
        <div class="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
          <div class="flex items-start gap-3">
            <span class="material-symbols-outlined text-red-600 text-2xl">warning</span>
            <div>
              <p class="font-semibold text-red-800">PERINGATAN</p>
              <p class="mt-1 text-sm text-red-700">
                Restore database akan mengganti data database aktif dengan isi backup yang dipilih.
                Data terbaru yang belum berada dalam backup dapat hilang.
              </p>
              <p class="mt-1 text-sm text-red-700">
                Sebelum restore, sistem akan membuat safety backup otomatis.
              </p>
            </div>
          </div>
        </div>

        <!-- Step 1: Upload -->
        <div v-if="restoreStep === 'upload' || restoreStep === 'validating'">
          <h3 class="mb-4 text-base font-semibold text-[#1E293B]">Upload File Backup</h3>
          <div class="rounded-lg border-2 border-dashed border-[#CBD5E1] p-8 text-center transition-colors hover:border-[#2563EB]">
            <input
              id="restoreFileInput"
              type="file"
              accept=".dump,.sql,.tar"
              class="hidden"
              @change="handleFileSelect"
            />
            <label for="restoreFileInput" class="cursor-pointer">
              <span class="material-symbols-outlined mb-2 block text-4xl text-[#94A3B8]">upload_file</span>
              <p class="text-sm text-[#64748B]">
                {{ restoreFile ? restoreFile.name : 'Klik untuk memilih file backup (.dump, .sql, .tar)' }}
              </p>
              <p v-if="restoreFile" class="mt-1 text-xs text-[#94A3B8]">
                {{ formatBytes(restoreFile.size) }}
              </p>
            </label>
          </div>

          <div v-if="restoreError" class="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {{ restoreError }}
          </div>

          <button
            :disabled="!restoreFile || restoreStep === 'validating'"
            class="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-50"
            @click="handleValidateRestore"
          >
            <span v-if="restoreStep === 'validating'" class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
            <span v-else class="material-symbols-outlined text-lg">fact_check</span>
            {{ restoreStep === 'validating' ? 'Memvalidasi...' : 'Validate Backup' }}
          </button>
        </div>

        <!-- Step 2: Review -->
        <div v-if="restoreStep === 'review' || restoreStep === 'restoring'">
          <h3 class="mb-4 text-base font-semibold text-[#1E293B]">Informasi Backup</h3>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div class="rounded-lg bg-[#F8FAFC] p-3">
              <div class="text-xs text-[#94A3B8]">Format</div>
              <div class="text-sm font-medium text-[#1E293B]">{{ restoreValidation?.format || '-' }}</div>
            </div>
            <div class="rounded-lg bg-[#F8FAFC] p-3">
              <div class="text-xs text-[#94A3B8]">Database</div>
              <div class="text-sm font-medium text-[#1E293B]">{{ restoreValidation?.databaseName || '-' }}</div>
            </div>
            <div class="rounded-lg bg-[#F8FAFC] p-3">
              <div class="text-xs text-[#94A3B8]">Size</div>
              <div class="text-sm font-medium text-[#1E293B]">{{ formatBytes(restoreValidation?.fileSize) }}</div>
            </div>
            <div class="rounded-lg bg-[#F8FAFC] p-3">
              <div class="text-xs text-[#94A3B8]">Checksum</div>
              <div class="text-sm font-mono font-medium text-[#1E293B] truncate">{{ restoreValidation?.checksum?.slice(0, 24) || '-' }}</div>
            </div>
            <div class="rounded-lg sm:col-span-2" :class="restoreValidation?.contentValid ? 'bg-emerald-50' : 'bg-red-50'">
              <div class="p-3">
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-sm" :class="restoreValidation?.contentValid ? 'text-emerald-600' : 'text-red-600'">
                    {{ restoreValidation?.contentValid ? 'check_circle' : 'cancel' }}
                  </span>
                  <span class="text-sm font-medium" :class="restoreValidation?.contentValid ? 'text-emerald-700' : 'text-red-700'">
                    {{ restoreValidation?.contentValid ? 'Valid' : 'Invalid' }}
                  </span>
                </div>
                <p v-if="restoreValidation?.contentError" class="mt-1 text-xs text-red-600">{{ restoreValidation.contentError }}</p>
              </div>
            </div>
          </div>

          <div v-if="restoreError" class="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {{ restoreError }}
          </div>

          <div class="mt-4 flex gap-2">
            <button
              class="rounded-lg border border-[#E5EAEF] px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC]"
              @click="resetRestore"
            >
              Batal
            </button>
            <button
              :disabled="restoreStep === 'restoring' || !restoreValidation?.contentValid"
              class="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              @click="openRestoreConfirm"
            >
              <span v-if="restoreStep === 'restoring'" class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
              <span v-else class="material-symbols-outlined text-lg">restore_page</span>
              {{ restoreStep === 'restoring' ? 'Restoring...' : 'Restore Database' }}
            </button>
          </div>
        </div>

        <!-- Step 3: Done -->
        <div v-if="restoreStep === 'done'" class="text-center">
          <span class="material-symbols-outlined mb-3 text-5xl text-emerald-500">check_circle</span>
          <h3 class="text-lg font-semibold text-[#1E293B]">Restore Berhasil</h3>
          <p class="mt-1 text-sm text-[#64748B]">Database telah diverifikasi dan berjalan normal.</p>
          <p v-if="restoreResult?.safetyBackupId" class="mt-1 text-xs text-[#94A3B8]">
            Safety backup ID: {{ restoreResult.safetyBackupId }}
          </p>
          <button
            class="mt-4 rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1D4ED8]"
            @click="resetRestore"
          >
            Restore Lagi
          </button>
        </div>
      </div>
    </template>

    <!-- ===== AUDIT LOG TAB ===== -->
    <template v-if="!isLoading && activeTab === 'audit'">
      <div class="rounded-xl border border-[#E5EAEF] bg-white shadow-sm">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="border-b border-[#F1F5F9] bg-[#F8FAFC] text-xs font-semibold uppercase text-[#64748B]">
              <tr>
                <th class="px-4 py-3">Operation</th>
                <th class="px-4 py-3">User</th>
                <th class="px-4 py-3">Database</th>
                <th class="px-4 py-3">Status</th>
                <th class="px-4 py-3">Error</th>
                <th class="px-4 py-3">Timestamp</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[#F1F5F9]">
              <tr v-if="auditLogs.length === 0 && !isLoadingAudit">
                <td colspan="6" class="px-4 py-12 text-center text-[#94A3B8]">
                  Belum ada audit log
                </td>
              </tr>
              <tr v-for="log in auditLogs" :key="log.id" class="hover:bg-[#F8FAFC] transition-colors">
                <td class="px-4 py-3">
                  <span class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium"
                    :class="statusClass(log.status)">
                    {{ operationLabel(log.operation) }}
                  </span>
                </td>
                <td class="px-4 py-3 text-[#64748B]">{{ log.user_name || '-' }}</td>
                <td class="px-4 py-3 text-[#64748B] font-mono text-xs">{{ log.target_database }}</td>
                <td class="px-4 py-3">
                  <span class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium" :class="statusClass(log.status)">
                    {{ statusLabel(log.status) }}
                  </span>
                </td>
                <td class="px-4 py-3 text-[#94A3B8] text-xs max-w-[200px] truncate" :title="log.error_summary">
                  {{ log.error_summary || '-' }}
                </td>
                <td class="px-4 py-3 text-[#94A3B8] whitespace-nowrap text-xs">
                  {{ formatDate(log.created_at) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- ===== RESTORE CONFIRMATION MODAL ===== -->
    <AppModal
      :is-open="showRestoreConfirm"
      title="Konfirmasi Restore Database"
      @close="showRestoreConfirm = false"
    >
      <div class="space-y-4">
        <div class="rounded-lg border border-red-200 bg-red-50 p-4">
          <div class="flex items-start gap-3">
            <span class="material-symbols-outlined text-red-600">dangerous</span>
            <div>
              <p class="font-semibold text-red-800">PERINGATAN: Operasi Destructive</p>
              <p class="mt-1 text-sm text-red-700">
                Restore database akan <strong>mengganti seluruh data</strong> database aktif dengan isi backup.
                Data yang belum di-backup akan hilang permanen.
              </p>
              <p class="mt-1 text-sm text-red-700">
                Sistem akan membuat <strong>safety backup otomatis</strong> sebelum restore dimulai.
              </p>
            </div>
          </div>
        </div>

        <div>
          <label class="mb-1.5 block text-sm font-medium text-[#1E293B]">
            Ketik <code class="rounded bg-[#F1F5F9] px-1.5 py-0.5 font-mono text-xs text-red-600">RESTORE DATABASE</code> untuk melanjutkan:
          </label>
          <input
            v-model="confirmRestoreInput"
            type="text"
            class="w-full rounded-lg border border-[#E5EAEF] px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200"
            placeholder="RESTORE DATABASE"
            @keyup.enter="handleConfirmRestore"
          />
        </div>

        <div class="flex justify-end gap-3 pt-2">
          <button
            class="rounded-lg border border-[#E5EAEF] px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC]"
            @click="showRestoreConfirm = false"
          >
            Cancel
          </button>
          <button
            :disabled="confirmRestoreInput.trim() !== 'RESTORE DATABASE'"
            class="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            @click="handleConfirmRestore"
          >
            Continue Restore
          </button>
        </div>
      </div>
    </AppModal>

    <!-- ===== DELETE CONFIRMATION MODAL ===== -->
    <AppModal
      :is-open="showDeleteConfirm"
      title="Hapus Backup"
      @close="showDeleteConfirm = false"
    >
      <div class="space-y-4">
        <p class="text-sm text-[#64748B]">
          Anda yakin ingin menghapus backup <strong>{{ deleteTargetName }}</strong>?
          Tindakan ini tidak dapat dibatalkan.
        </p>
        <div class="flex justify-end gap-3">
          <button
            class="rounded-lg border border-[#E5EAEF] px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC]"
            @click="showDeleteConfirm = false"
          >
            Cancel
          </button>
          <button
            :disabled="isDeleting"
            class="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            @click="handleDeleteConfirm"
          >
            {{ isDeleting ? 'Deleting...' : 'Delete' }}
          </button>
        </div>
      </div>
    </AppModal>

    <!-- Toast -->
    <Transition name="toast">
      <div
        v-if="toast.show"
        class="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl px-4 py-3 shadow-lg text-sm font-medium"
        :class="toast.type === 'success'
          ? 'bg-emerald-600 text-white'
          : 'bg-red-600 text-white'"
      >
        <span class="material-symbols-outlined text-lg">
          {{ toast.type === 'success' ? 'check_circle' : 'error' }}
        </span>
        {{ toast.message }}
        <button class="ml-2 opacity-70 hover:opacity-100" @click="toast.show = false">
          <span class="material-symbols-outlined text-base">close</span>
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.toast-enter-active { transition: all 0.3s ease-out; }
.toast-leave-active { transition: all 0.2s ease-in; }
.toast-enter-from { opacity: 0; transform: translateY(20px); }
.toast-leave-to { opacity: 0; transform: translateY(20px); }
</style>