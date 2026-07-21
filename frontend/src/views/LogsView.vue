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
  if (action === 'HAPUS') return 'error'
  return 'default'
}

function getActivityBadgeType(activity) {
  if (activity === 'LOGIN') return 'success'
  if (activity === 'LOGOUT') return 'default'
  if (activity === 'GAGAL_LOGIN') return 'error'
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
        <span aria-hidden="true" class="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-[#94A3B8]">
          search
        </span>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Cari kata kunci log..."
          class="form-control w-full pl-10"
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

    <!-- Table Container -->
    <div class="shadow-card overflow-hidden rounded-[20px] border border-[#E8EDF3] bg-white">
      <!-- Loading State -->
      <div v-if="isLoading" class="flex flex-col items-center justify-center py-24 gap-3">
        <span class="material-symbols-outlined text-[36px] text-brand animate-spin">progress_activity</span>
        <p class="text-[12px] font-semibold text-[#6B7280]">Memuat data log aktivitas...</p>
      </div>

      <!-- Data Table -->
      <div
        v-else
        class="overflow-x-auto"
        tabindex="0"
        aria-label="Tabel log aktivitas"
      >
        <!-- ── TAB 1: Asset History Log Table ──────────────────── -->
        <table v-if="activeTab === 'assets'" class="w-full min-w-[700px]">
          <caption class="sr-only">Tabel log riwayat perubahan aset IT</caption>
          <thead>
            <tr class="text-left border-b border-[#F3F4F6]">
              <th class="px-5 py-3 text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider w-48">Waktu Kejadian</th>
              <th class="px-5 py-3 text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider w-32">Aksi</th>
              <th class="px-5 py-3 text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider w-36">Label Aset</th>
              <th class="px-5 py-3 text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">Detail Perubahan</th>
              <th class="px-5 py-3 text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider w-40">Oleh</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#F9FAFB]">
            <tr
              v-for="log in filteredAssetLogs"
              :key="log.id"
              class="hover:bg-[#F9FAFB]/50 transition-colors"
            >
              <td class="px-5 py-3.5 text-[11px] font-semibold text-[#374151] font-mono">
                {{ formatDateTime(log.dibuat_pada) }}
              </td>
              <td class="px-5 py-3.5">
                <AppBadge :type="getActionBadgeType(log.aksi)" :text="log.aksi" />
              </td>
              <td class="px-5 py-3.5 text-[12px] font-bold text-[#111827]">
                {{ log.label_aset }}
              </td>
              <td class="px-5 py-3.5 align-top">
                <!-- UBAH: mini table old -> new -->
                <table v-if="log.aksi === 'UBAH' && parsePerubahan(log.perubahan, log.aksi).length && parsePerubahan(log.perubahan, log.aksi)[0].old !== undefined" class="w-full text-[10px] border-collapse">
                  <thead>
                    <tr class="border-b border-[#E5E7EB]">
                      <th class="py-0.5 pr-2 text-left font-bold text-[#9CA3AF] uppercase tracking-wider w-24">Field</th>
                      <th class="py-0.5 px-2 text-left font-bold text-[#9CA3AF] uppercase tracking-wider">Sebelum</th>
                      <th class="py-0.5 pl-2 text-left font-bold text-[#9CA3AF] uppercase tracking-wider">Sesudah</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, idx) in parsePerubahan(log.perubahan, log.aksi)" :key="idx" class="border-b border-[#F3F4F6] last:border-0">
                      <td class="py-1 pr-2 font-bold text-[#475569]">{{ row.field }}</td>
                      <td class="py-1 px-2 text-[#DC2626] line-through">{{ row.old }}</td>
                      <td class="py-1 pl-2 font-semibold text-[#059669]">{{ row.new }}</td>
                    </tr>
                  </tbody>
                </table>

                <!-- TAMBAH: key-value detail -->
                <table v-else-if="log.aksi === 'TAMBAH' && parsePerubahan(log.perubahan, log.aksi).length > 1" class="w-full text-[10px] border-collapse">
                  <tbody>
                    <tr v-for="(row, idx) in parsePerubahan(log.perubahan, log.aksi)" :key="idx" class="border-b border-[#F3F4F6] last:border-0">
                      <td class="py-1 pr-2 font-bold text-[#9CA3AF] uppercase tracking-wider w-24">{{ row.field }}</td>
                      <td class="py-1 font-semibold text-[#374151]">{{ row.value }}</td>
                    </tr>
                  </tbody>
                </table>

                <!-- Fallback -->
                <span v-else class="text-[11px] text-[#374151] font-medium">{{ log.perubahan }}</span>
              </td>
              <td class="px-5 py-3.5 text-[11px] font-bold text-[#64748B]">
                {{ log.oleh_pengguna }}
              </td>
            </tr>
            <tr v-if="filteredAssetLogs.length === 0">
              <td colspan="5" class="px-5 py-12 text-center text-[12px] text-[#9CA3AF]">
                Tidak ada riwayat perubahan aset ditemukan.
              </td>
            </tr>
          </tbody>
        </table>

        <!-- ── TAB 2: Login Audit Log Table ────────────────────── -->
        <table v-if="activeTab === 'audit'" class="w-full min-w-[700px]">
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
              <td colspan="6" class="px-5 py-12 text-center text-[12px] text-[#9CA3AF]">
                Tidak ada audit aktivitas login ditemukan.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
