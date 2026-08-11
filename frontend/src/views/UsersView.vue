<script setup>
// ============================================================
// UsersView.vue — Manajemen Pengguna Sistem, bergaya Fynix
// Fitur: tampil, tambah, edit, hapus user dari tabel users
// ============================================================
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useApi } from '../composables/useApi.js'
import { useAuth } from '../composables/useAuth.js'
import { isSuperAdminRole as isRoleSuperAdmin } from '../utils/permissionAccess.js'
import AppModal from '../components/ui/AppModal.vue'
import AppBadge from '../components/ui/AppBadge.vue'

const { get, post, put, del } = useApi()
const { isSuperAdmin, hasWritePermission } = useAuth()
const { user: currentUser } = useAuth()
const canWriteUsers = computed(() => hasWritePermission('users'))

// ── State Utama ──────────────────────────────────────────────
const users        = ref([])
const queues       = ref([])      // Master ticket queues (HR, IT, GA, OPS)
const isLoading    = ref(true)
const pageError    = ref('')
const modalError   = ref('')
const notification = ref(null)

// ── Filter & Search ──────────────────────────────────────────
const searchQuery  = ref('')
const filterRole   = ref('')

// ── Modal State ──────────────────────────────────────────────
const showFormModal   = ref(false)
const showDeleteModal = ref(false)
const modalMode       = ref('add')  // 'add' | 'edit'
const isSubmitting    = ref(false)
const selectedUser    = ref(null)

const ALL_FEATURES = [
  { key: 'dashboard', label: 'Dashboard Overview', icon: 'grid_view', desc: 'Ringkasan sistem & statistik' },
  { key: 'assets', label: 'Manajemen Aset IT', icon: 'devices', desc: 'Inventaris & pengolahan data aset' },
  { key: 'my_assets', label: 'Aset Saya / Karyawan', icon: 'badge', desc: 'Daftar aset per karyawan' },
  { key: 'tickets', label: 'Tiket', icon: 'confirmation_number', desc: 'Pengajuan & riwayat tiket kendala' },
  { key: 'submissions', label: 'Pengajuan Serah Terima', icon: 'assignment', desc: 'Form serah terima unit' },
  { key: 'users', label: 'Manajemen Pengguna', icon: 'group', desc: 'Pengaturan akun & hak akses RBAC' },
  { key: 'logs', label: 'Audit Log Aktivitas', icon: 'receipt_long', desc: 'Riwayat audit login & aset' },
  { key: 'karyawan', label: 'Master Data Karyawan', icon: 'person_search', desc: 'Integrasi data karyawan' }
]

const defaultPermissions = () => ({
  dashboard: 'none',
  assets: 'none',
  my_assets: 'read_only',
  tickets: 'read_only',
  submissions: 'none',
  users: 'none',
  logs: 'none',
  karyawan: 'none'
})

const superadminPermissions = () => ({
  dashboard: 'full',
  assets: 'full',
  my_assets: 'full',
  tickets: 'full',
  submissions: 'full',
  users: 'full',
  logs: 'full',
  karyawan: 'full'
})

// Permission levels & labels
const PERMISSION_LEVELS = [
  { value: 'none', label: 'Tidak Ada', shortLabel: 'None', color: 'none' },
  { value: 'read_only', label: 'Lihat Saja', shortLabel: 'Read Only', color: 'blue' },
  { value: 'full', label: 'CRUD Penuh', shortLabel: 'Full', color: 'green' },
]

// ── Form Data ────────────────────────────────────────────────
const emptyForm = () => ({
  nama: '',
  email: '',
  password: '',
  role: 'user',
  permissions: defaultPermissions(),
  queue_ids: [],
  is_active: true,
})
const form = ref(emptyForm())

// ── Options ──────────────────────────────────────────────────
const roleOptions = ['superadmin', 'admin', 'user']
const availableRoleOptions = computed(() => {
  if (!isSuperAdmin.value) return ['user']
  return [...new Set([form.value.role, ...roleOptions].filter(Boolean))]
})

function canManageUser(target) {
  if (!canWriteUsers.value || !target) return false
  if (isSuperAdmin.value) return true
  return target.role === 'user' && target.id !== currentUser.value?.id
}

function setPermissionLevel(featureKey, level) {
  if (!isSuperAdmin.value && featureKey === 'users') {
    form.value.permissions.users = 'none'
    return
  }
  form.value.permissions[featureKey] = level
}

function selectAllPermissions(val) {
  ALL_FEATURES.forEach(f => {
    setPermissionLevel(f.key, val)
  })
}

function handleRoleChange() {
  const isSuper = isRoleSuperAdmin(form.value.role)
  if (isSuper) {
    form.value.permissions = superadminPermissions()
  } else {
    form.value.permissions = defaultPermissions()
  }
  if (!isSuperAdmin.value) form.value.permissions.users = 'none'
}

function getPermissionBadge(u) {
  const isSuper = isRoleSuperAdmin(u.role)
  if (isSuper) {
    return { text: '8/8 Akses Penuh', type: 'primary' }
  }
  const perms = u.permissions || {}
  const fullCount = Object.values(perms).filter(v => v === 'full').length
  const readCount = Object.values(perms).filter(v => v === 'read_only').length
  const totalGranted = fullCount + readCount
  if (totalGranted === 0) return { text: 'Tidak Ada Akses', type: 'default' }
  const parts = []
  if (fullCount > 0) parts.push(`${fullCount} Full`)
  if (readCount > 0) parts.push(`${readCount} Read`)
  return {
    text: parts.join(', '),
    type: fullCount > 0 ? 'success' : 'info'
  }
}

// ── Filter Logic ─────────────────────────────────────────────
const filteredUsers = computed(() => {
  return users.value.filter(u => {
    const q = searchQuery.value.trim().toLowerCase()
    const matchSearch = !q
      || (u.nama  || '').toLowerCase().includes(q)
      || (u.email || '').toLowerCase().includes(q)
    const matchRole = !filterRole.value
      || (u.role || '').toLowerCase() === filterRole.value.toLowerCase()
    return matchSearch && matchRole
  })
})

// ── CRUD Functions ───────────────────────────────────────────
async function fetchQueues() {
  try {
    const data = await get('/api/ticket-queues')
    if (Array.isArray(data)) queues.value = data
  } catch (err) {
    void err
  }
}

async function fetchUsers() {
  isLoading.value = true
  pageError.value = ''
  try {
    const data = await get('/api/users')
    if (!Array.isArray(data)) throw new Error('Format data pengguna dari server tidak valid.')
    users.value = data
  } catch (e) {
    pageError.value = e.message || 'Gagal memuat daftar pengguna.'
    console.error(e)
  } finally {
    isLoading.value = false
  }
}

function openAdd() {
  if (!canWriteUsers.value) return
  modalMode.value     = 'add'
  form.value          = emptyForm()
  modalError.value    = ''
  showFormModal.value = true
}

function openEdit(u) {
  if (!canWriteUsers.value) return
  if (!canManageUser(u)) return
  modalMode.value     = 'edit'
  selectedUser.value  = u
  const isSuper = isRoleSuperAdmin(u.role)
  const initialPerms = isSuper
    ? superadminPermissions()
    : (() => {
        const base = defaultPermissions()
        const saved = u.permissions || {}
        // Normalise legacy boolean values
        for (const k of Object.keys(base)) {
          const v = saved[k]
          if (v === 'none' || v === 'read_only' || v === 'full') {
            base[k] = v
          } else if (v === true) {
            base[k] = 'read_only'
          } else if (v === false) {
            base[k] = 'none'
          }
        }
        if (!isSuperAdmin.value) base.users = 'none'
        return base
      })()

  form.value = {
    nama: u.nama || '',
    email: u.email || '',
    password: '',
    role: u.role || 'user',
    permissions: initialPerms,
    queue_ids: Array.isArray(u.queue_ids)
      ? u.queue_ids.map((id) => Number(id)).filter(Number.isSafeInteger)
      : [],
    is_active: u.is_active !== false,
  }
  modalError.value = ''
  showFormModal.value = true
}

function openDelete(user) {
  if (!isSuperAdmin.value || isRoleSuperAdmin(user?.role)) return
  selectedUser.value   = user
  modalError.value      = ''
  showDeleteModal.value = true
}

function closeModal() {
  showFormModal.value   = false
  showDeleteModal.value = false
  selectedUser.value    = null
  isSubmitting.value    = false
  modalError.value      = ''
}

function requestCloseModal() {
  if (!isSubmitting.value) closeModal()
}

async function saveUser() {
  if (!canWriteUsers.value) {
    modalError.value = 'Anda hanya memiliki akses baca untuk pengguna.'
    return
  }
  if (modalMode.value === 'edit' && !canManageUser(selectedUser.value)) {
    modalError.value = 'Anda tidak dapat mengubah pengguna ini.'
    return
  }
  isSubmitting.value = true
  modalError.value   = ''

  const nama = form.value.nama.trim()
  const email = form.value.email.trim()
  const role = isSuperAdmin.value ? form.value.role.trim() : 'user'

  if (!nama || !email || !role) {
    modalError.value = 'Nama, email, dan role wajib diisi.'
    isSubmitting.value = false
    return
  }
  if (modalMode.value === 'add' && !form.value.password) {
    modalError.value = 'Password wajib diisi untuk pengguna baru.'
    isSubmitting.value = false
    return
  }
  if (form.value.password && Array.from(form.value.password).length < 8) {
    modalError.value = 'Password minimal harus terdiri dari 8 karakter.'
    isSubmitting.value = false
    return
  }

  try {
    const permissions = { ...form.value.permissions }
    if (!isSuperAdmin.value) permissions.users = 'none'

    const payload = {
      nama,
      email,
      role,
      permissions,
      is_active: form.value.is_active,
    }
    if (isSuperAdmin.value) {
      payload.queue_ids = (form.value.queue_ids || [])
        .map((id) => Number(id))
        .filter(Number.isSafeInteger)
    }
    if (form.value.password) payload.password = form.value.password

    if (modalMode.value === 'add') {
      await post('/api/users', payload)
      toast('Pengguna baru berhasil ditambahkan.')
    } else {
      await put(`/api/users/${selectedUser.value.id}`, payload)
      toast('Data pengguna & hak akses berhasil diperbarui.')
    }
    closeModal()
    await fetchUsers()
  } catch (e) {
    modalError.value = e.message || 'Gagal menyimpan data pengguna.'
    console.error(e)
  } finally {
    isSubmitting.value = false
  }
}

async function deleteUser() {
  if (!isSuperAdmin.value || !selectedUser.value || isRoleSuperAdmin(selectedUser.value.role)) return
  isSubmitting.value = true
  modalError.value = ''
  try {
    await del(`/api/users/${selectedUser.value.id}`)
    toast('Pengguna berhasil dihapus!')
    closeModal()
    await fetchUsers()
  } catch (e) {
    modalError.value = e.message || 'Gagal menghapus pengguna.'
  } finally {
    isSubmitting.value = false
  }
}

// ── Toast ────────────────────────────────────────────────────
let toastTimer

function toast(message, type = 'success') {
  window.clearTimeout(toastTimer)
  notification.value = { message, type }
  toastTimer = window.setTimeout(() => { notification.value = null }, 3500)
}

// ── Helpers ──────────────────────────────────────────────────
function getRoleBadgeType(role) {
  const r = (role || '').toLowerCase()
  if (r === 'admin' || r === 'superadmin') return 'purple'
  if (r === 'teknisi') return 'info'
  return 'default'
}

function getInitial(nama) {
  return (nama || '?').charAt(0).toUpperCase()
}

function getAvatarColor(nama) {
  const colors = [
    'bg-[#D1FAE5] text-[#065F46]',
    'bg-[#DBEAFE] text-[#1E40AF]',
    'bg-[#EDE9FE] text-[#5B21B6]',
    'bg-[#FEF3C7] text-[#92400E]',
    'bg-[#FEE2E2] text-[#991B1B]',
    'bg-[#F3F4F6] text-[#374151]',
  ]
  const idx = (nama?.charCodeAt(0) || 0) % colors.length
  return colors[idx]
}

function resetFilters() {
  searchQuery.value = ''
  filterRole.value  = ''
}

onMounted(async () => {
  await fetchQueues()
  await fetchUsers()
})
onBeforeUnmount(() => window.clearTimeout(toastTimer))
</script>

<template>
  <div class="flex min-w-0 flex-col gap-5">

    <!-- ── Toast Notifikasi ──────────────────────────────── -->
    <Transition name="slide-right">
      <div
        v-if="notification"
        role="status"
        aria-live="polite"
        class="fixed left-4 right-4 top-4 z-[60] flex items-center gap-3 rounded-xl bg-[#111827] px-4 py-3 text-white shadow-2xl toast-anim sm:left-auto sm:right-5 sm:max-w-md"
      >
        <div class="w-6 h-6 rounded-full bg-brand flex items-center justify-center">
          <span aria-hidden="true" class="material-symbols-outlined text-[14px]">check</span>
        </div>
        <span class="text-[13px] font-semibold">{{ notification.message }}</span>
      </div>
    </Transition>

    <!-- ── Toolbar ───────────────────────────────────────── -->
    <div class="shadow-card grid min-w-0 grid-cols-2 items-center gap-3 rounded-2xl border border-[#E8EDF3] bg-white p-3 sm:flex sm:flex-wrap">

      <!-- Search -->
      <div class="relative col-span-2 min-w-0 sm:flex-1 sm:min-w-[220px]">
        <label for="user-search" class="sr-only">Cari pengguna</label>
        <span aria-hidden="true" class="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF] text-[18px] pointer-events-none">search</span>
        <input
          id="user-search"
          v-model="searchQuery"
          type="search"
          autocomplete="off"
          placeholder="Cari nama atau email pengguna..."
          class="h-10 w-full rounded-xl border border-[#DCE3EC] bg-[#F8FAFC] pl-10 pr-4 text-[12px] font-medium text-[#334155] placeholder-[#94A3B8] focus:outline-none"
        />
      </div>

      <!-- Filter Role -->
      <label for="user-role-filter" class="sr-only">Filter role pengguna</label>
      <select
        id="user-role-filter"
        v-model="filterRole"
        class="h-10 min-w-0 w-full rounded-xl border border-[#DCE3EC] bg-white px-3 text-[11px] font-semibold text-[#475569] focus:outline-none sm:w-auto"
      >
        <option value="">Semua Role</option>
        <option v-for="r in availableRoleOptions" :key="r" :value="r">{{ r.toUpperCase() }}</option>
      </select>

      <!-- Reset -->
      <button
        v-if="searchQuery || filterRole"
        @click="resetFilters"
        class="h-10 w-full rounded-xl border border-[#F1D0D0] bg-[#FFF7F7] px-4 text-[11px] font-bold text-[#D94B4B] hover:bg-[#FFEEEE] sm:w-auto"
      >
        Reset
      </button>

      <div class="hidden flex-1 sm:block"></div>

      <!-- Tambah Pengguna -->
      <button
        v-if="canWriteUsers"
        @click="openAdd"
        class="col-span-2 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 text-[11px] font-bold text-white shadow-md shadow-blue-200/70 hover:-translate-y-0.5 hover:bg-brand-dark sm:w-auto"
      >
        <span aria-hidden="true" class="material-symbols-outlined text-[17px]">person_add</span>
        Tambah Pengguna
      </button>
    </div>

    <!-- ── Tabel Pengguna ─────────────────────────────────── -->
    <div class="shadow-card overflow-hidden rounded-[20px] border border-[#E8EDF3] bg-white">

      <!-- Loading -->
      <div v-if="isLoading" role="status" class="flex items-center justify-center gap-3 py-16 text-[13px] text-[#6B7280]">
        <div aria-hidden="true" class="w-8 h-8 border-4 border-[#E5E7EB] border-t-brand rounded-full animate-spin"></div>
        <span>Memuat data pengguna...</span>
      </div>

      <!-- Error -->
      <div v-else-if="pageError" role="alert" class="flex flex-wrap items-center gap-2 px-5 py-4 text-[13px] text-red-700 bg-red-50">
        <span aria-hidden="true" class="material-symbols-outlined text-[18px]">error</span>
        <span class="flex-1">{{ pageError }}</span>
        <button type="button" class="font-bold underline underline-offset-2" @click="fetchUsers">Coba lagi</button>
      </div>

      <!-- Tabel -->
      <div v-else class="overflow-x-auto" tabindex="0" aria-label="Tabel pengguna; geser secara horizontal untuk melihat seluruh kolom">
        <table class="w-full min-w-[720px]">
          <caption class="sr-only">Daftar pengguna sistem</caption>
          <thead>
            <tr class="border-b border-[#E8EDF3] bg-[#F8FAFC]">
              <th class="px-5 py-3 text-left text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">Pengguna</th>
              <th class="px-5 py-3 text-left text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">Email</th>
              <th class="px-5 py-3 text-left text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">Role Akses</th>
              <th class="px-5 py-3 text-left text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">Unit Tiket (Queue)</th>
              <th class="px-5 py-3 text-left text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">Hak Akses Fitur</th>
              <th class="px-5 py-3 text-left text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">Status</th>
              <th class="px-5 py-3 text-right text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#F9FAFB]">
            <tr
              v-for="user in filteredUsers"
              :key="user.id"
              class="group hover:bg-[#F7FAFD]"
            >
              <!-- Kolom Pengguna (avatar + nama) -->
              <td class="px-5 py-3">
                <div class="flex items-center gap-3">
                  <!-- Avatar Inisial -->
                  <div
                    class="w-9 h-9 rounded-full flex items-center justify-center text-[14px] font-black shrink-0"
                    :class="getAvatarColor(user.nama)"
                  >
                    {{ getInitial(user.nama) }}
                  </div>
                  <div>
                    <p class="text-[13px] font-bold text-[#111827]">{{ user.nama }}</p>
                    <p class="text-[10px] text-[#9CA3AF]">ID #{{ user.id }}</p>
                  </div>
                </div>
              </td>

              <!-- Email -->
              <td class="px-5 py-3 text-[12px] text-[#6B7280]">{{ user.email }}</td>

              <!-- Role Badge -->
              <td class="px-5 py-3">
                <AppBadge :type="getRoleBadgeType(user.role)" :text="(user.role || 'user').toUpperCase()" />
              </td>

              <!-- Unit Tiket (Queue) Badge -->
              <td class="px-5 py-3">
                <div v-if="isRoleSuperAdmin(user.role)" class="text-[11px] font-bold text-[#5D87FF]">
                  Semua Unit (Superadmin)
                </div>
                <div v-else-if="user.queues && user.queues.length > 0" class="flex flex-wrap gap-1">
                  <span
                    v-for="q in user.queues"
                    :key="q.id"
                    class="inline-flex items-center rounded-md bg-[#ECF2FF] px-2 py-0.5 text-[10px] font-bold text-[#5D87FF]"
                  >{{ q.kode }}</span>
                </div>
                <span v-else class="text-[11px] text-[#9CA3AF] italic">Tidak ada unit</span>
              </td>

              <!-- Hak Akses Fitur Count Badge -->
              <td class="px-5 py-3">
                <AppBadge :type="getPermissionBadge(user).type" :text="getPermissionBadge(user).text" />
              </td>

              <!-- Status Akun -->
              <td class="px-5 py-3">
                <AppBadge
                  :type="user.is_active === false ? 'danger' : 'success'"
                  :text="user.is_active === false ? 'NONAKTIF' : 'AKTIF'"
                />
              </td>

              <!-- Aksi -->
              <td class="px-5 py-3">
                <div class="flex items-center justify-end gap-1.5">
                  <button
                    v-if="canWriteUsers && (isSuperAdmin || !isRoleSuperAdmin(user.role))"
                    @click="openEdit(user)"
                    :aria-label="`Edit ${user.nama || 'pengguna'}`"
                    class="flex h-8 w-8 items-center justify-center rounded-xl bg-[#E8F7FF] text-[#49BEFF] hover:bg-[#49BEFF] hover:text-white transition-all"
                    title="Edit Hak Akses"
                  >
                    <span aria-hidden="true" class="material-symbols-outlined text-[16px]">edit</span>
                  </button>
                  <button
                    v-if="isSuperAdmin && !isRoleSuperAdmin(user.role)"
                    @click="openDelete(user)"
                    :aria-label="`Hapus ${user.nama || 'pengguna'}`"
                    class="flex h-8 w-8 items-center justify-center rounded-xl bg-[#FDEDE8] text-[#FA896B] hover:bg-[#FA896B] hover:text-white transition-all"
                    title="Hapus"
                  >
                    <span aria-hidden="true" class="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </div>
              </td>
            </tr>

            <!-- Empty state -->
            <tr v-if="filteredUsers.length === 0">
              <td colspan="6" class="px-5 py-12 text-center">
                <div class="flex flex-col items-center gap-2">
                  <span aria-hidden="true" class="material-symbols-outlined text-[40px] text-[#D1D5DB]">group</span>
                  <p class="text-[13px] text-[#9CA3AF]">Tidak ada pengguna yang sesuai pencarian.</p>
                  <button v-if="searchQuery || filterRole" @click="resetFilters" class="text-[12px] text-brand font-bold hover:text-brand-dark">Reset Filter</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Footer -->
      <div v-if="!isLoading && !pageError" class="px-5 py-3 border-t border-[#F3F4F6] bg-[#F9FAFB]">
        <span class="text-[11px] text-[#9CA3AF]">
          Menampilkan <span class="font-bold text-[#374151]">{{ filteredUsers.length }}</span> dari <span class="font-bold text-[#374151]">{{ users.length }}</span> pengguna
        </span>
      </div>
    </div>


    <!-- ═══════════════════════════════════════════════════════
         MODAL FORM — TAMBAH / EDIT USER & RBAC PERMISSIONS
         ═══════════════════════════════════════════════════════ -->
    <AppModal
      :is-open="showFormModal"
      :title="modalMode === 'add' ? 'Tambah Pengguna Baru' : 'Edit Pengguna & Hak Akses'"
      size="lg"
      @close="requestCloseModal"
    >
      <form @submit.prevent="saveUser" class="flex flex-col gap-4">

        <!-- Error dalam modal -->
        <div v-if="modalError" role="alert" class="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded-lg text-[12px]">
          <span aria-hidden="true" class="material-symbols-outlined text-[16px]">error</span>
          {{ modalError }}
        </div>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <!-- Nama -->
          <div class="flex flex-col gap-1.5">
            <label for="user-name" class="text-[11px] font-bold text-[#374151] uppercase tracking-wide">Nama Lengkap *</label>
            <input id="user-name" v-model="form.nama" required autofocus type="text" autocomplete="name"
              :disabled="modalMode === 'edit' && !isSuperAdmin"
              class="h-9 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg px-3 text-[13px] text-[#374151] focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              placeholder="Nama lengkap pengguna" />
          </div>

          <!-- Email -->
          <div class="flex flex-col gap-1.5">
            <label for="user-email" class="text-[11px] font-bold text-[#374151] uppercase tracking-wide">Email *</label>
            <input id="user-email" v-model="form.email" required type="email" autocomplete="email"
              :disabled="modalMode === 'edit' && !isSuperAdmin"
              class="h-9 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg px-3 text-[13px] text-[#374151] focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              placeholder="email@perusahaan.com" />
          </div>

          <!-- Password -->
          <div class="flex flex-col gap-1.5">
            <label for="user-password" class="text-[11px] font-bold text-[#374151] uppercase tracking-wide">{{ modalMode === 'add' ? 'Password *' : 'Password Baru' }}</label>
            <input id="user-password" v-model="form.password" :required="modalMode === 'add'" minlength="8" type="password" autocomplete="new-password"
              class="h-9 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg px-3 text-[13px] text-[#374151] focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand/20 transition-all"
              :placeholder="modalMode === 'add' ? 'Password login' : 'Kosongkan jika tidak ingin mengubah'" />
          </div>

          <!-- Role -->
          <div class="flex flex-col gap-1.5">
            <label for="user-role" class="text-[11px] font-bold text-[#374151] uppercase tracking-wide">Role Akses *</label>
            <select id="user-role" v-model="form.role" @change="handleRoleChange" required
              :disabled="modalMode === 'edit' && !isSuperAdmin"
              class="h-9 bg-[#F9FAFC] border border-[#E5E7EB] rounded-lg px-3 text-[13px] text-[#374151] focus:outline-none focus:border-brand transition-all disabled:opacity-60 disabled:cursor-not-allowed">
              <option v-for="r in availableRoleOptions" :key="r" :value="r">{{ r.toUpperCase() }}</option>
            </select>
          </div>
        </div>

        <!-- Unit Tiket yang Ditangani (Queue Selection - Hanya untuk Admin/Teknisi, hidden untuk role user biasa) -->
        <div v-if="form.role !== 'user'" class="flex flex-col gap-2 rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-4">
          <div>
            <span class="block text-[11px] font-bold uppercase tracking-wide text-[#374151]">Unit Tiket yang Ditangani (Queue)</span>
            <span class="block text-[10px] text-[#6B7280]">Pilih unit mana saja tiketnya yang dapat diakses &amp; ditangani pengguna ini:</span>
          </div>

          <div v-if="form.role === 'superadmin'" class="text-[11px] font-semibold text-[#5D87FF]">
            ⚡ Superadmin memiliki akses otomatis ke seluruh unit (HR, IT, GA, OPS).
          </div>
          <div v-else class="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label
              v-for="q in queues"
              :key="q.id"
              class="flex items-center gap-2 rounded-xl border bg-white p-3 cursor-pointer transition-all"
              :class="form.queue_ids.includes(Number(q.id)) ? 'border-[#5D87FF] bg-[#ECF2FF]/40 text-[#5D87FF]' : 'border-[#E5E7EB] text-[#374151]'"
            >
              <input
                type="checkbox"
                :value="Number(q.id)"
                v-model="form.queue_ids"
                class="h-4 w-4 rounded border-gray-300 text-[#5D87FF] focus:ring-[#5D87FF]"
              />
              <div>
                <p class="text-[12px] font-extrabold leading-tight">{{ q.kode }}</p>
                <p class="text-[10px] text-[#7C8BAC] leading-tight truncate">{{ q.nama }}</p>
              </div>
            </label>
          </div>
        </div>

        <!-- Granular RBAC Permissions Section -->
        <div class="flex flex-col gap-2 rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-4">
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <span class="block text-[11px] font-bold uppercase tracking-wide text-[#374151]">Hak Akses Fitur (Granular)</span>
              <span class="block text-[10px] text-[#6B7280]">Atur level akses per fitur: None · Read Only · Full CRUD</span>
            </div>
            
            <div v-if="form.role !== 'superadmin'" class="flex items-center gap-1.5">
              <button type="button" @click="selectAllPermissions('full')" class="text-[10px] font-bold text-[#22C55E] hover:underline cursor-pointer">Semua Full</button>
              <span class="text-[10px] text-[#CBD5E1]">|</span>
              <button type="button" @click="selectAllPermissions('read_only')" class="text-[10px] font-bold text-[#5D87FF] hover:underline cursor-pointer">Semua Read</button>
              <span class="text-[10px] text-[#CBD5E1]">|</span>
              <button type="button" @click="selectAllPermissions('none')" class="text-[10px] font-bold text-[#FA896B] hover:underline cursor-pointer">Kosongkan</button>
            </div>
          </div>

          <!-- Legend -->
          <div v-if="form.role !== 'superadmin'" class="flex items-center gap-3 flex-wrap">
            <div class="flex items-center gap-1">
              <span class="inline-block w-2 h-2 rounded-full bg-[#374151]"></span>
              <span class="text-[9px] font-semibold text-[#6B7280] uppercase tracking-wide">None — Tidak bisa akses</span>
            </div>
            <div class="flex items-center gap-1">
              <span class="inline-block w-2 h-2 rounded-full bg-[#5D87FF]"></span>
              <span class="text-[9px] font-semibold text-[#6B7280] uppercase tracking-wide">Read Only — Hanya lihat data</span>
            </div>
            <div class="flex items-center gap-1">
              <span class="inline-block w-2 h-2 rounded-full bg-[#22C55E]"></span>
              <span class="text-[9px] font-semibold text-[#6B7280] uppercase tracking-wide">Full — Create, Read, Update, Delete</span>
            </div>
          </div>

          <!-- Superadmin Notice -->
          <div v-if="form.role === 'superadmin'" class="rounded-xl bg-[#ECF2FF] p-3 text-[11px] font-semibold text-[#5D87FF] flex items-center gap-2">
            <span class="material-symbols-outlined text-[18px]">verified_user</span>
            <span>Superadmin memiliki akses penuh ke seluruh 8 fitur sistem secara otomatis.</span>
          </div>

          <!-- 8 Feature Granular Access Level Grid -->
          <div v-else class="flex flex-col gap-2.5 mt-1">
            <div
              v-for="f in ALL_FEATURES"
              :key="f.key"
              class="flex items-center justify-between gap-3 rounded-xl border bg-white p-3 transition-all"
              :class="
                form.permissions[f.key] === 'full' ? 'border-[#22C55E] shadow-[0_0_0_1px_#22C55E20]' :
                form.permissions[f.key] === 'read_only' ? 'border-[#5D87FF] shadow-[0_0_0_1px_#5D87FF20]' :
                'border-[#E5E7EB] opacity-60 hover:opacity-80'
              "
            >
              <!-- Feature info -->
              <div class="flex items-center gap-2.5 min-w-0 flex-1">
                <div
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors"
                  :class="
                    form.permissions[f.key] === 'full' ? 'bg-[#DCFCE7] text-[#16A34A]' :
                    form.permissions[f.key] === 'read_only' ? 'bg-[#ECF2FF] text-[#5D87FF]' :
                    'bg-[#F1F5F9] text-[#94A3B8]'
                  "
                >
                  <span class="material-symbols-outlined text-[18px]">{{ f.icon }}</span>
                </div>
                <div class="min-w-0">
                  <p class="text-[12px] font-bold text-[#2A3547] truncate">{{ f.label }}</p>
                  <p class="text-[10px] text-[#7C8BAC] truncate">{{ f.desc }}</p>
                </div>
              </div>

              <!-- Level selector pills -->
              <div class="flex items-center shrink-0 rounded-lg overflow-hidden border border-[#E5E7EB] bg-[#F8FAFC]">
                <button
                  v-for="lvl in PERMISSION_LEVELS"
                  :key="lvl.value"
                  type="button"
                  @click="form.permissions[f.key] = lvl.value"
                  :title="lvl.label"
                  class="relative px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wide transition-all leading-none select-none"
                  :class="
                    form.permissions[f.key] === lvl.value
                      ? (
                          lvl.value === 'full' ? 'bg-[#22C55E] text-white shadow-inner' :
                          lvl.value === 'read_only' ? 'bg-[#5D87FF] text-white shadow-inner' :
                          'bg-[#374151] text-white shadow-inner'
                        )
                      : 'text-[#9CA3AF] hover:text-[#374151] hover:bg-[#F1F5F9]'
                  "
                >{{ lvl.shortLabel }}</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Status akun saat edit -->
        <label v-if="modalMode === 'edit' && isSuperAdmin && !isRoleSuperAdmin(selectedUser?.role)" class="flex items-center justify-between gap-4 rounded-lg border border-[#E5E7EB] bg-[#F9FAFC] px-3 py-2.5">
          <span>
            <span class="block text-[11px] font-bold uppercase tracking-wide text-[#374151]">Status Akun</span>
            <span class="block text-[10px] text-[#6B7280]">Pengguna nonaktif tidak dihitung sebagai akun aktif.</span>
          </span>
          <input v-model="form.is_active" type="checkbox" class="h-4 w-4 shrink-0 accent-brand" />
        </label>

        <!-- Footer -->
        <div class="flex items-center justify-end gap-3 pt-2 border-t border-[#F3F4F6]">
          <button type="button" :disabled="isSubmitting" @click="requestCloseModal"
            class="h-9 px-5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg text-[13px] font-semibold text-[#374151] hover:bg-[#F3F4F6] transition-colors">
            Batal
          </button>
          <button type="submit" :disabled="isSubmitting || !canWriteUsers"
            class="h-9 px-5 bg-[#111827] hover:bg-[#1F2937] text-white text-[13px] font-bold rounded-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            <span v-if="isSubmitting" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            {{ isSubmitting ? 'Menyimpan...' : (modalMode === 'add' ? 'Tambah Pengguna' : 'Simpan Perubahan') }}
          </button>
        </div>

      </form>
    </AppModal>


    <!-- ═══════════════════════════════════════════════════════
         MODAL KONFIRMASI HAPUS USER
         ═══════════════════════════════════════════════════════ -->
    <AppModal
      :is-open="showDeleteModal"
      title="Hapus Pengguna"
      size="sm"
      @close="requestCloseModal"
    >
      <div class="flex flex-col items-center gap-4 text-center">
        <div v-if="modalError" role="alert" class="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-left text-[12px] text-red-700">
          {{ modalError }}
        </div>
        <div class="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
          <span class="material-symbols-outlined text-[28px] text-[#EF4444]">warning</span>
        </div>

        <div>
          <h4 class="text-[15px] font-black text-[#111827]">Yakin ingin menghapus?</h4>
          <p class="text-[12px] text-[#9CA3AF] mt-1">Tindakan ini tidak dapat dibatalkan.</p>
        </div>

        <!-- Info user yang akan dihapus -->
        <div class="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-4 text-left space-y-1.5">
          <div class="flex justify-between text-[12px]">
            <span class="text-[#9CA3AF]">Nama</span>
            <span class="font-bold text-[#111827]">{{ selectedUser?.nama }}</span>
          </div>
          <div class="flex justify-between text-[12px]">
            <span class="text-[#9CA3AF]">Email</span>
            <span class="break-all text-right text-[#374151]">{{ selectedUser?.email }}</span>
          </div>
          <div class="flex justify-between text-[12px]">
            <span class="text-[#9CA3AF]">Role</span>
            <AppBadge :type="getRoleBadgeType(selectedUser?.role)" :text="(selectedUser?.role || '').toUpperCase()" />
          </div>
        </div>

        <div class="flex gap-3 w-full">
          <button type="button" :disabled="isSubmitting" @click="requestCloseModal"
            class="flex-1 h-10 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg text-[13px] font-semibold text-[#374151] hover:bg-[#F3F4F6] transition-colors">
            Batal
          </button>
          <button type="button" @click="deleteUser" :disabled="isSubmitting"
            class="flex-1 h-10 bg-[#EF4444] hover:bg-[#DC2626] text-white text-[13px] font-bold rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 transition-colors">
            <span v-if="isSubmitting" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            {{ isSubmitting ? 'Menghapus...' : 'Ya, Hapus' }}
          </button>
        </div>
      </div>
    </AppModal>

  </div>
</template>
