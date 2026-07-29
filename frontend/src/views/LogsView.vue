<script setup>
// ============================================================
// LogsView.vue — Menampilkan Log Riwayat Aset & Audit Log Login
// Fitur: Dua tab navigasi, pencarian, filter aksi, gaya glassmorphism
// ============================================================
import { computed, onMounted, ref } from 'vue'
import { useApi } from '../composables/useApi.js'
import AppBadge from '../components/ui/AppBadge.vue'

const { get } = useApi()

// ── State Utama ──────────────────────────────────────────────
const assetLogs    = ref([])
const auditLogs    = ref([])
const isLoading    = ref(true)
const pageError    = ref('')
const activeTab    = ref('assets') // 'assets' | 'audit'

// ── Filter State ─────────────────────────────────────────────
const searchQuery  = ref('')
const filterAction = ref('') // Untuk log aset ('TAMBAH' | 'UBAH' | 'HAPUS')
const filterActivity = ref('') // Untuk log audit ('LOGIN' | 'LOGOUT' | 'GAGAL_LOGIN')

// ── Ambil Data ───────────────────────────────────────────────
async function fetchLogs() {
  isLoading.value = true
  pageError.value = ''
  try {
    const [assetsData, auditData] = await Promise.all([
      get('/api/logs/assets'),
      get('/api/logs/audit')
    ])
    assetLogs.value = Array.isArray(assetsData) ? assetsData : []
    auditLogs.value = Array.isArray(auditData) ? auditData : []
  } catch (error) {
    pageError.value = error.message || 'Gagal memuat data log dari server.'
    console.error(error)
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  fetchLogs()
})

// ── Log Riwayat Aset Terfilter ──────────────────────────────
const filteredAssetLogs = computed(() => {
  return assetLogs.value.filter((log) => {
    const query = searchQuery.value.trim().toLowerCase()
    const matchSearch =
      !query ||
      String(log.label_aset || '').toLowerCase().includes(query) ||
      String(log.perubahan || '').toLowerCase().includes(query) ||
      String(log.oleh_pengguna || '').toLowerCase().includes(query)

    const matchAction = !filterAction.value || log.aksi === filterAction.value
    return matchSearch && matchAction
  })
})

// ── Log Audit Login Terfilter ───────────────────────────────
const filteredAuditLogs = computed(() => {
  return auditLogs.value.filter((log) => {
    const query = searchQuery.value.trim().toLowerCase()
    const matchSearch =
      !query ||
      String(log.nama_pengguna || '').toLowerCase().includes(query) ||
      String(log.email || '').toLowerCase().includes(query) ||
      String(log.ip_address || '').toLowerCase().includes(query) ||
      String(log.browser || '').toLowerCase().includes(query)

    const matchActivity = !filterActivity.value || log.aktifitas === filterActivity.value
    return matchSearch && matchActivity
  })
})

// ── Helper Badge Aksi / Aktifitas ───────────────────────────
function getActionBadgeType(action) {
  if (action === 'TAMBAH') return 'success'
  if (action === 'UBAH') return 'warning'
  if (action === 'HAPUS') return 'danger'
  return 'default'
}

function getActionIcon(action) {
  if (action === 'TAMBAH') return 'add_circle'
  if (action === 'UBAH') return 'edit_note'
  if (action === 'HAPUS') return 'delete'
  return 'info'
}

function getActionColor(action) {
  if (action === 'TAMBAH') return 'text-[#059669] bg-[#ECFDF5]'
  if (action === 'UBAH') return 'text-[#D97706] bg-[#FFF8E6]'
  if (action === 'HAPUS') return 'text-[#DC2626] bg-[#FEF2F2]'
  return 'text-[#6B7280] bg-[#F3F4F6]'
}

function getActivityBadgeType(activity) {
  if (activity === 'LOGIN') return 'success'
  if (activity === 'LOGOUT') return 'default'
  if (activity === 'GAGAL_LOGIN') return 'danger'
  return 'default'
}

// Format Tanggal
function formatDateTime(dateStr) {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatTime(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

function displayValue(val) {
  if (!val || val === '(kosong)') return '—'
  return val
}

function parsePerubahan(perubahan, aksi) {
  if (!perubahan) return []

  if (aksi === 'UBAH' && perubahan.startsWith('Perubahan data: ')) {
    const body = perubahan.replace('Perubahan data: ', '')
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

  return [{ field: null, value: perubahan }]
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- Header deskripsi halaman -->
    <div class="flex flex-col gap-1.5">
      <p class="text-[11px] font-medium text-[#9CA3AF]">
        Melihat rekam jejak perubahan sistem & audit login pengguna
      </p>
    </div>

    <!-- Error state -->
    <div
      v-if="pageError"
      role="alert"
      class="shadow-card flex items-center gap-2 rounded-[20px] border border-red-200 bg-red-50/60 px-5 py-4 text-[13px] text-red-700 backdrop-blur-xl"
    >
      <span class="material-symbols-outlined text-[18px]" aria-hidden="true">error</span>
      <span>{{ pageError }}</span>
      <button @click="fetchLogs" class="ml-auto text-[11px] font-extrabold uppercase tracking-wider text-red-800 hover:underline">
        Coba Lagi
      </button>
    </div>

    <!-- Tab Selection Navigation -->
    <div class="flex border-b border-[#E2E8F0]/80">
      <button
        type="button"
        @click="activeTab = 'assets'"
        class="flex items-center gap-2 px-5 py-3.5 text-[12px] font-bold transition-all duration-150 border-b-2 -mb-[2px]"
        :class="activeTab === 'assets'
          ? 'border-brand text-brand font-black'
          : 'border-transparent text-[#64748B] hover:text-[#172033]'"
      >
        <span class="material-symbols-outlined text-[18px]">history</span>
        Riwayat Perubahan Aset
      </button>
      <button
        type="button"
        @click="activeTab = 'audit'"
        class="flex items-center gap-2 px-5 py-3.5 text-[12px] font-bold transition-all duration-150 border-b-2 -mb-[2px]"
        :class="activeTab === 'audit'
          ? 'border-brand text-brand font-black'
          : 'border-transparent text-[#64748B] hover:text-[#172033]'"
      >
        <span class="material-symbols-outlined text-[18px]">security</span>
        Audit Aktivitas Login
      </button>
    </div>

    <!-- Filters Bar Card -->
    <div class="shadow-card grid min-w-0 grid-cols-1 items-center gap-3 rounded-2xl border border-[#E8EDF3] bg-white p-3 sm:flex sm:flex-wrap">
      <!-- Search -->
      <div class="relative flex-1 min-w-[200px]">
        <span aria-hidden="true" class="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-[#94A3B8] pointer-events-none">
          search
        </span>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Cari kata kunci log..."
          class="h-10 w-full rounded-xl border border-[#DCE3EC] bg-white pl-10 pr-3 text-[11px] font-semibold text-[#334155] outline-none transition-all focus:border-brand focus:ring-1 focus:ring-brand/10"
        />
      </div>

      <!-- Action Filter (Asset Tab only) -->
      <div v-if="activeTab === 'assets'" class="w-full sm:w-44">
        <select v-model="filterAction" class="form-control w-full">
          <option value="">Semua Aksi</option>
          <option value="TAMBAH">Tambah Aset</option>
          <option value="UBAH">Ubah Aset</option>
          <option value="HAPUS">Hapus Aset</option>
        </select>
      </div>

      <!-- Activity Filter (Audit Tab only) -->
      <div v-if="activeTab === 'audit'" class="w-full sm:w-44">
        <select v-model="filterActivity" class="form-control w-full">
          <option value="">Semua Aktifitas</option>
          <option value="LOGIN">Berhasil Login</option>
          <option value="GAGAL_LOGIN">Gagal Login</option>
        </select>
      </div>

      <!-- Refresh button -->
      <button
        type="button"
        @click="fetchLogs"
        :disabled="isLoading"
        class="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#DCE3EC] bg-white/50 px-4 text-[12px] font-bold text-[#334155] shadow-sm hover:bg-[#F8FAFC] disabled:opacity-50 sm:w-auto"
      >
        <span class="material-symbols-outlined text-[18px]" :class="{ 'animate-spin': isLoading }">refresh</span>
        Segarkan
      </button>
    </div>

    <!-- Content Container -->
    <div class="shadow-card overflow-hidden rounded-[20px] border border-[#E8EDF3] bg-white">
      <!-- Loading State -->
      <div v-if="isLoading" class="flex flex-col items-center justify-center py-24 gap-3">
        <span class="material-symbols-outlined text-[36px] text-brand animate-spin">progress_activity</span>
        <p class="text-[12px] font-semibold text-[#6B7280]">Memuat data log aktivitas...</p>
      </div>

      <!-- ── TAB 1: Asset History Log ──────────────────────────── -->
      <div v-else-if="activeTab === 'assets'">
        <!-- Empty State -->
        <div v-if="filteredAssetLogs.length === 0" class="flex flex-col items-center justify-center py-20 gap-3">
          <span class="material-symbols-outlined text-[40px] text-[#D1D5DB]">history_toggle_off</span>
          <p class="text-[13px] font-semibold text-[#9CA3AF]">Tidak ada riwayat perubahan aset ditemukan.</p>
        </div>

        <!-- Timeline Log Cards -->
        <div v-else class="divide-y divide-[#F3F4F6]">
          <div
            v-for="log in filteredAssetLogs"
            :key="log.id"
            class="group flex gap-4 px-5 py-4 hover:bg-[#FAFBFD] transition-colors"
          >
            <!-- Left: Icon + Timeline connector -->
            <div class="flex flex-col items-center pt-0.5">
              <div
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                :class="getActionColor(log.aksi)"
              >
                <span class="material-symbols-outlined text-[18px]">{{ getActionIcon(log.aksi) }}</span>
              </div>
            </div>

            <!-- Middle: Main content -->
            <div class="flex-1 min-w-0">
              <!-- Top row: Badge + Label + Time -->
              <div class="flex flex-wrap items-center gap-2 mb-2">
                <AppBadge :type="getActionBadgeType(log.aksi)" :text="log.aksi" />
                <span class="text-[13px] font-extrabold text-[#111827] font-mono tracking-tight">{{ log.label_aset }}</span>
                <span class="text-[10px] text-[#94A3B8] font-medium ml-auto shrink-0 hidden sm:inline">
                  <span class="material-symbols-outlined text-[12px] align-text-bottom mr-0.5">schedule</span>
                  {{ formatDateTime(log.dibuat_pada) }}
                </span>
              </div>

              <!-- UBAH: Changes detail with clean diff style -->
              <div v-if="log.aksi === 'UBAH' && parsePerubahan(log.perubahan, log.aksi).length && parsePerubahan(log.perubahan, log.aksi)[0].old !== undefined" class="space-y-1.5">
                <div
                  v-for="(row, idx) in parsePerubahan(log.perubahan, log.aksi)"
                  :key="idx"
                  class="flex items-baseline gap-2 text-[11px]"
                >
                  <span class="w-28 shrink-0 text-[10px] font-bold text-[#6B7280] uppercase tracking-wide">{{ row.field }}</span>
                  <span class="flex items-center gap-1.5 min-w-0 flex-wrap">
                    <span class="inline-flex items-center gap-1 rounded-md bg-[#FEF2F2] px-2 py-0.5 text-[10px] font-semibold text-[#991B1B] line-through decoration-[#FECACA]">{{ displayValue(row.old) }}</span>
                    <span class="material-symbols-outlined text-[12px] text-[#CBD5E1] shrink-0">arrow_forward</span>
                    <span class="inline-flex items-center gap-1 rounded-md bg-[#F0FDF4] px-2 py-0.5 text-[10px] font-bold text-[#166534]">{{ displayValue(row.new) }}</span>
                  </span>
                </div>
              </div>

              <!-- TAMBAH: Key-value pairs -->
              <div v-else-if="log.aksi === 'TAMBAH' && parsePerubahan(log.perubahan, log.aksi).length > 1" class="flex flex-wrap gap-x-4 gap-y-1">
                <span
                  v-for="(row, idx) in parsePerubahan(log.perubahan, log.aksi)"
                  :key="idx"
                  class="text-[10px] text-[#6B7280]"
                >
                  <span class="font-bold uppercase tracking-wide">{{ row.field }}:</span>
                  <span class="ml-1 font-semibold text-[#374151]">{{ displayValue(row.value) }}</span>
                </span>
              </div>

              <!-- Fallback text -->
              <p v-else class="text-[11px] font-medium text-[#64748B] leading-relaxed">{{ log.perubahan }}</p>

              <!-- Mobile timestamp + Author -->
              <div class="flex items-center gap-3 mt-2">
                <span class="text-[10px] text-[#94A3B8] font-medium sm:hidden">
                  {{ formatDateTime(log.dibuat_pada) }}
                </span>
                <span class="text-[10px] font-bold text-[#94A3B8]">
                  <span class="material-symbols-outlined text-[11px] align-text-bottom mr-0.5">person</span>
                  {{ log.oleh_pengguna }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div v-if="filteredAssetLogs.length > 0" class="border-t border-[#E8EDF3] bg-[#FAFCFE] px-5 py-3 text-[10px] text-[#94A3B8]">
          Menampilkan <strong class="text-[#374151]">{{ filteredAssetLogs.length }}</strong> dari <strong class="text-[#374151]">{{ assetLogs.length }}</strong> log perubahan aset
        </div>
      </div>

      <!-- ── TAB 2: Login Audit Log Table ────────────────────── -->
      <div v-else-if="activeTab === 'audit'">
        <div class="overflow-x-auto" tabindex="0" aria-label="Tabel log audit login">
          <table class="w-full min-w-[700px]">
            <caption class="sr-only">Tabel log audit login aktivitas pengguna</caption>
            <thead>
              <tr class="text-left border-b border-[#F3F4F6]">
                <th class="px-5 py-3 text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider w-48">Waktu Login</th>
                <th class="px-5 py-3 text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">Nama Pengguna</th>
                <th class="px-5 py-3 text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">Email</th>
                <th class="px-5 py-3 text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider w-36">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[#F9FAFB]">
              <tr
                v-for="log in filteredAuditLogs"
                :key="log.id"
                class="hover:bg-[#F9FAFB]/50 transition-colors"
              >
                <td class="px-5 py-3.5 text-[11px] font-semibold text-[#374151] font-mono">
                  {{ formatDateTime(log.dibuat_pada) }}
                </td>
                <td class="px-5 py-3.5 text-[12px] font-bold text-[#111827]">
                  {{ log.nama_pengguna }}
                </td>
                <td class="px-5 py-3.5 text-[11px] text-[#374151] font-mono">
                  {{ log.email }}
                </td>
                <td class="px-5 py-3.5">
                  <AppBadge :type="getActivityBadgeType(log.aktifitas)" :text="log.aktifitas" />
                </td>
              </tr>
              <tr v-if="filteredAuditLogs.length === 0">
                <td colspan="4" class="px-5 py-12 text-center">
                  <div class="flex flex-col items-center gap-3">
                    <span class="material-symbols-outlined text-[40px] text-[#D1D5DB]">shield_person</span>
                    <p class="text-[13px] font-semibold text-[#9CA3AF]">Tidak ada audit aktivitas login ditemukan.</p>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Footer -->
        <div v-if="filteredAuditLogs.length > 0" class="border-t border-[#E8EDF3] bg-[#FAFCFE] px-5 py-3 text-[10px] text-[#94A3B8]">
          Menampilkan <strong class="text-[#374151]">{{ filteredAuditLogs.length }}</strong> dari <strong class="text-[#374151]">{{ auditLogs.length }}</strong> log audit login
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.form-control {
  height: 2.5rem;
  border: 1px solid #dce3ec;
  border-radius: 0.75rem;
  background: #ffffff;
  padding: 0 0.75rem;
  font-size: 0.6875rem;
  font-weight: 600;
  color: #334155;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.form-control:focus {
  border-color: var(--color-brand);
  box-shadow: 0 0 0 3px rgb(9 124 222 / 10%);
}
</style>
