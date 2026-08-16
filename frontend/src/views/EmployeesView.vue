<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useApi } from '../composables/useApi.js'
import { useAuth } from '../composables/useAuth.js'
import AppModal from '../components/ui/AppModal.vue'
import AppBadge from '../components/ui/AppBadge.vue'
import AppRowActions from '../components/ui/AppRowActions.vue'
import AppImportModal from '../components/ui/AppImportModal.vue'
import AppPagination from '../components/ui/AppPagination.vue'

const { get, post, put, del } = useApi()
const { isAdmin, isSuperAdmin, hasWritePermission } = useAuth()
const canWriteKaryawan = computed(() => isAdmin.value || isSuperAdmin.value || hasWritePermission('karyawan'))

// ── State Utama ──────────────────────────────────────────────
const employees = ref([])
const locations = ref([])
const isLoading = ref(true)
const isSubmitting = ref(false)
const showImportModal = ref(false)
const pageError = ref('')
const modalError = ref('')
const notification = ref(null)

const currentPage = ref(1)
const itemsPerPage = ref(10)

function onImported() {
  showImportModal.value = false
  fetchData()
  notification.value = { message: 'Data Excel berhasil diimpor ke database!', type: 'success' }
}

// ── Filter & Search ──────────────────────────────────────────
const searchQuery = ref('')
const filterDepartemen = ref('')
const filterLokasi = ref('')
const filterStatus = ref('')

// ── Modal State ──────────────────────────────────────────────
const showFormModal = ref(false)
const showDeleteModal = ref(false)
const modalMode = ref('add') // 'add' | 'edit'
const selectedEmployee = ref(null)

// ── Predefined Master Options from Skema Table.xlsx ───────────
const jobLevelOptions = [
  'C-Level', 'L1', 'L1a', 'L2', 'L2b', 'L3', 'L3b',
  'L4', 'L4c', 'L5', 'L6', 'LS1', 'LS2', 'LS3'
]

const departemenOptions = [
  'Account Management', 'Accounting & Tax', 'Asset Management', 'Business Consultant',
  'Business Operations', 'CEO', 'CEO Office', 'Corporate Development', 'Data Analytics',
  'Digital Marketing', 'Ecosystem and Strategic Partnership', 'Finance & Accounting',
  'Finance & Legal', 'Finance Business Partner', 'Finance, Accounting, & Tax',
  'Integration Solutions Delivery', 'Legal', 'Marketing', 'Marketing Communication',
  'Operation Excellence', 'Operations', 'Operations Support', 'People Experience',
  'People Shared Services', 'People Strategy & Development', 'Product Engineering',
  'Product Management', 'Research', 'Revenue', 'Technology'
]

const directorateOptions = [
  'CEO Office', 'Finance & Legal', 'Marketing',
  'Operations', 'People Experience', 'Research', 'Technology'
]

const statusKaryawanOptions = ['Active', 'Outsource', 'Resigned']
const statusKepegawaianOptions = ['Permanent', 'Contract']

const locationCodeOptions = [
  'BDG', 'BKS', 'BL', 'BTM', 'DPK', 'GS', 'JKT',
  'MDN', 'MLG', 'PL', 'PLM', 'SBY', 'SLO', 'SMG', 'SRG', 'YYK'
]

const titleOptions = [
  'Account Management', 'Account Management Admin Analyst', 'Account Management Manager',
  'Account Payable Staff', 'Account Receivable Staff', 'Area Manager', 'Asset Management Analyst',
  'Business Admin (Backoffice)', 'Business Consultant', 'Chief Executive Officer',
  'Chief Operating Officer', 'Chief Technology Officer', 'Data Analytics Engineer',
  'Graphic Designer', 'Internal Auditor', 'Legal Counsel', 'Marketing Manager',
  'Onboarding Admin', 'Operations Analyst Manager', 'People Operations Analyst',
  'Product Consultant', 'Product Implementor', 'Product Owner', 'Quality Assurance Engineer',
  'Software Engineer', 'Software Engineering Manager', 'Tax Staff', 'Team Leader', 'UI/UX Designer'
]

// ── Form Data ────────────────────────────────────────────────
const emptyForm = () => ({
  nik: '',
  nama_karyawan: '',
  email_kantor: '',
  lokasi_kerja: 'JKT',
  status_karyawan: 'Active',
  jabatan: '',
  tingkat_jabatan: 'L3',
  departemen: 'Technology',
  direktorat: 'Technology',
  tanggal_mulai_bekerja: '',
  status_kepegawaian: 'Permanent',
  nik_atasan_langsung: '',
})

const form = ref(emptyForm())

// ── Computed ──────────────────────────────────────────────────
const availableDepartemenOptions = computed(() => {
  const custom = employees.value.map(e => e.departemen).filter(Boolean)
  return [...new Set([...departemenOptions, ...custom])].sort()
})

const availableLokasiOptions = computed(() => {
  const custom = employees.value.map(e => e.lokasi_kerja).filter(Boolean)
  return [...new Set([...locationCodeOptions, ...custom])].sort()
})

const filteredEmployees = computed(() => {
  const q = searchQuery.value.trim().toLocaleLowerCase('id-ID')
  return employees.value.filter((emp) => {
    const searchable = [
      emp.nik, emp.nama_karyawan, emp.email_kantor, emp.jabatan, emp.title,
      emp.departemen, emp.direktorat, emp.directorate, emp.lokasi_kerja,
      emp.status_karyawan, emp.status, emp.nik_atasan_langsung
    ].join(' ').toLocaleLowerCase('id-ID')

    const statusVal = emp.status_karyawan || emp.status
    return (!q || searchable.includes(q))
      && (!filterDepartemen.value || emp.departemen === filterDepartemen.value)
      && (!filterLokasi.value || emp.lokasi_kerja === filterLokasi.value)
      && (!filterStatus.value || statusVal === filterStatus.value)
  })
})

watch([searchQuery, filterDepartemen, filterLokasi, filterStatus], () => {
  currentPage.value = 1
})

const paginatedEmployees = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value
  return filteredEmployees.value.slice(start, start + itemsPerPage.value)
})

function toast(msg, type = 'success') {
  notification.value = { message: msg, type }
  setTimeout(() => { notification.value = null }, 3500)
}

function getInitial(name) {
  return (name || '?').charAt(0).toUpperCase()
}

function getAvatarColor(name) {
  const colors = [
    'bg-blue-100 text-blue-700', 'bg-emerald-100 text-emerald-700',
    'bg-purple-100 text-purple-700', 'bg-amber-100 text-amber-700',
    'bg-rose-100 text-rose-700', 'bg-cyan-100 text-cyan-700'
  ]
  let hash = 0
  for (let i = 0; i < (name || '').length; i++) hash += name.charCodeAt(i)
  return colors[hash % colors.length]
}

// ── Methods ──────────────────────────────────────────────────
async function fetchData() {
  isLoading.value = true
  pageError.value = ''
  try {
    const data = await get('/api/karyawan/with-assets')
    const rawList = Array.isArray(data) ? data : []
    employees.value = rawList.map((e) => ({
      ...e,
      id_karyawan: e.id_karyawan || e.id,
      id: e.id || e.id_karyawan,
      status: e.status || e.status_karyawan || 'Active',
      status_karyawan: e.status_karyawan || e.status || 'Active',
      title: e.title || e.jabatan || '',
      jabatan: e.jabatan || e.title || '',
      job_level: e.job_level || e.tingkat_jabatan || 'L3',
      tingkat_jabatan: e.tingkat_jabatan || e.job_level || 'L3',
      directorate: e.directorate || e.direktorat || '',
      direktorat: e.direktorat || e.directorate || '',
      employeement_status: e.employeement_status || e.status_kepegawaian || 'Permanent',
      status_kepegawaian: e.status_kepegawaian || e.employeement_status || 'Permanent',
    }))
  } catch (err) {
    pageError.value = err.message || 'Gagal memuat data karyawan.'
  } finally {
    isLoading.value = false
  }
}

function openAdd() {
  if (!canWriteKaryawan.value) return
  modalMode.value = 'add'
  selectedEmployee.value = null
  form.value = emptyForm()
  modalError.value = ''
  showFormModal.value = true
}

function openEdit(emp) {
  if (!canWriteKaryawan.value) return
  modalMode.value = 'edit'
  selectedEmployee.value = emp
  const rawDate = emp.tanggal_mulai_bekerja
  const formattedDate = rawDate ? new Date(rawDate).toISOString().split('T')[0] : ''

  form.value = {
    nik: emp.nik || '',
    nama_karyawan: emp.nama_karyawan || '',
    email_kantor: emp.email_kantor || '',
    lokasi_kerja: emp.lokasi_kerja || 'JKT',
    status_karyawan: emp.status_karyawan || emp.status || 'Active',
    jabatan: emp.jabatan || emp.title || '',
    tingkat_jabatan: emp.tingkat_jabatan || emp.job_level || 'L3',
    departemen: emp.departemen || '',
    direktorat: emp.direktorat || emp.directorate || '',
    tanggal_mulai_bekerja: formattedDate,
    status_kepegawaian: emp.status_kepegawaian || emp.employeement_status || 'Permanent',
    nik_atasan_langsung: emp.nik_atasan_langsung || '',
  }
  modalError.value = ''
  showFormModal.value = true
}

function openDelete(emp) {
  if (!canWriteKaryawan.value) return
  selectedEmployee.value = emp
  modalError.value = ''
  showDeleteModal.value = true
}

function closeModal() {
  showFormModal.value = false
  showDeleteModal.value = false
  selectedEmployee.value = null
  modalError.value = ''
}

async function saveEmployee() {
  if (!canWriteKaryawan.value) {
    modalError.value = 'Anda hanya memiliki akses baca untuk data karyawan.'
    return
  }

  const payload = {
    nik: form.value.nik.trim(),
    nama_karyawan: form.value.nama_karyawan.trim(),
    email_kantor: form.value.email_kantor ? form.value.email_kantor.trim() : null,
    lokasi_kerja: form.value.lokasi_kerja,
    status: form.value.status_karyawan,
    status_karyawan: form.value.status_karyawan,
    title: form.value.jabatan.trim(),
    jabatan: form.value.jabatan.trim(),
    job_level: form.value.tingkat_jabatan,
    tingkat_jabatan: form.value.tingkat_jabatan,
    departemen: form.value.departemen,
    directorate: form.value.direktorat,
    direktorat: form.value.direktorat,
    tanggal_mulai_bekerja: form.value.tanggal_mulai_bekerja || null,
    employeement_status: form.value.status_kepegawaian,
    status_kepegawaian: form.value.status_kepegawaian,
    nik_atasan_langsung: form.value.nik_atasan_langsung ? form.value.nik_atasan_langsung.trim() : null,
  }

  if (!payload.nik || !payload.nama_karyawan) {
    modalError.value = 'NIK dan Nama Karyawan wajib diisi.'
    return
  }
  if (!payload.departemen || !payload.direktorat) {
    modalError.value = 'Departemen dan Direktorat wajib diisi.'
    return
  }
  if (!payload.tanggal_mulai_bekerja) {
    modalError.value = 'Tanggal mulai bekerja wajib diisi.'
    return
  }

  isSubmitting.value = true
  modalError.value = ''

  try {
    const targetId = selectedEmployee.value?.id_karyawan || selectedEmployee.value?.id
    if (modalMode.value === 'add') {
      await post('/api/karyawan', payload)
      toast('Data karyawan berhasil ditambahkan.')
    } else {
      await put(`/api/karyawan/${targetId}`, payload)
      toast('Data karyawan berhasil diperbarui.')
    }
    closeModal()
    await fetchData()
  } catch (err) {
    modalError.value = err.message || 'Gagal menyimpan data karyawan.'
  } finally {
    isSubmitting.value = false
  }
}

async function deleteEmployee() {
  if (!canWriteKaryawan.value || !selectedEmployee.value) return
  isSubmitting.value = true
  modalError.value = ''

  try {
    const targetId = selectedEmployee.value?.id_karyawan || selectedEmployee.value?.id
    await del(`/api/karyawan/${targetId}`)
    toast('Data karyawan berhasil diubah statusnya menjadi Resigned.')
    closeModal()
    await fetchData()
  } catch (err) {
    modalError.value = err.message || 'Gagal menghapus karyawan.'
  } finally {
    isSubmitting.value = false
  }
}

function getEmployeeActions(emp) {
  return [
    {
      label: 'Edit Karyawan',
      icon: 'edit',
      onClick: () => openEdit(emp),
    },
    {
      label: 'Hapus Karyawan',
      icon: 'delete',
      danger: true,
      onClick: () => openDelete(emp),
    },
  ]
}

onMounted(() => {
  fetchData()
})
</script>

<template>
  <div class="flex min-w-0 flex-col gap-5">
    <!-- Notification Toast -->
    <Transition name="fade">
      <div
        v-if="notification"
        class="fixed top-5 right-5 z-50 flex items-center gap-3 rounded-2xl px-5 py-3.5 shadow-2xl text-white font-semibold text-[13px]"
        :class="notification.type === 'error' ? 'bg-rose-600' : 'bg-emerald-600'"
      >
        <span class="material-symbols-outlined text-[20px]">
          {{ notification.type === 'error' ? 'error' : 'check_circle' }}
        </span>
        <span>{{ notification.message }}</span>
      </div>
    </Transition>

    <!-- Header & Action Bar -->
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#E5EAEF] pb-5">
      <div>
        <div class="flex items-center gap-3">
          <div class="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#5D87FF]/10 text-[#5D87FF]">
            <span class="material-symbols-outlined text-[24px]">person_search</span>
          </div>
          <div>
            <h1 class="text-xl font-extrabold text-[#2A3547]">Master Data Karyawan</h1>
            <p class="text-[12px] font-medium text-[#7C8BAC]">
              Pengelolaan &amp; integrasi data karyawan perusahaan sesuai spesifikasi
            </p>
          </div>
        </div>
      </div>

      <div v-if="canWriteKaryawan" class="flex items-center gap-2">
        <button
          type="button"
          @click="showImportModal = true"
          class="flex items-center justify-center gap-2 rounded-xl border border-[#DFE5EF] bg-white px-4 py-2 text-[12px] font-bold text-[#2A3547] hover:bg-[#F8FAFC] transition-all cursor-pointer"
        >
          <span class="material-symbols-outlined text-[18px]">file_upload</span>
          <span>Import Excel</span>
        </button>

        <button
          type="button"
          @click="openAdd"
          class="flex items-center justify-center gap-2 rounded-xl bg-[#5D87FF] px-4 py-2 text-[12px] font-bold text-white shadow-md shadow-blue-500/20 hover:bg-[#4570EA] transition-all cursor-pointer"
        >
          <span class="material-symbols-outlined text-[18px]">person_add</span>
          <span>Tambah Karyawan</span>
        </button>
      </div>
    </div>

    <!-- Search & Filters -->
    <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 bg-white p-2.5 rounded-xl border border-[#E5EAEF] shadow-xs">
      <div class="relative flex-1">
        <span class="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[17px] text-[#7C8BAC]">search</span>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Cari NIK, Nama, Email, Jabatan, Departemen..."
          class="h-8 w-full rounded-lg border border-[#E5EAEF] bg-[#F8FAFC] pl-8 pr-3 text-[11px] text-[#2A3547] focus:border-[#5D87FF] focus:bg-white focus:outline-none transition-all"
        />
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <select
          v-model="filterDepartemen"
          class="h-8 rounded-lg border border-[#E5EAEF] bg-[#F8FAFC] px-2.5 text-[11px] font-semibold text-[#2A3547] focus:outline-none"
        >
          <option value="">Semua Departemen</option>
          <option v-for="dep in availableDepartemenOptions" :key="dep" :value="dep">{{ dep }}</option>
        </select>

        <select
          v-model="filterLokasi"
          class="h-8 rounded-lg border border-[#E5EAEF] bg-[#F8FAFC] px-2.5 text-[11px] font-semibold text-[#2A3547] focus:outline-none"
        >
          <option value="">Semua Lokasi</option>
          <option v-for="loc in availableLokasiOptions" :key="loc" :value="loc">{{ loc }}</option>
        </select>

        <select
          v-model="filterStatus"
          class="h-8 rounded-lg border border-[#E5EAEF] bg-[#F8FAFC] px-2.5 text-[11px] font-semibold text-[#2A3547] focus:outline-none"
        >
          <option value="">Semua Status</option>
          <option value="Active">Active</option>
          <option value="Outsource">Outsource</option>
          <option value="Resigned">Resigned</option>
        </select>
      </div>
    </div>

    <!-- Table Section -->
    <div class="rounded-2xl border border-[#E5EAEF] bg-white shadow-xs overflow-hidden">
      <div v-if="isLoading" class="flex flex-col items-center justify-center py-16 text-[#7C8BAC]">
        <div class="h-8 w-8 animate-spin rounded-full border-4 border-[#5D87FF] border-t-transparent mb-3"></div>
        <p class="text-[13px] font-semibold">Memuat data karyawan...</p>
      </div>

      <div v-else-if="pageError" class="p-6 text-center text-rose-600">
        <p class="font-bold text-[14px]">{{ pageError }}</p>
        <button type="button" @click="fetchData" class="mt-2 text-[12px] font-bold underline">Coba Lagi</button>
      </div>

      <div v-else-if="filteredEmployees.length === 0" class="p-12 text-center text-[#7C8BAC]">
        <span class="material-symbols-outlined text-[48px] text-[#CBD5E1]">person_off</span>
        <p class="mt-2 font-bold text-[14px]">Tidak Ada Data Karyawan</p>
        <p class="text-[12px]">Cobalah untuk mengosongkan filter atau menambah karyawan baru.</p>
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-[#E5EAEF] bg-[#F8FAFC] text-[11px] font-extrabold uppercase tracking-wider text-[#7C8BAC]">
              <th class="py-3.5 px-4">Karyawan</th>
              <th class="py-3.5 px-4">NIK</th>
              <th class="py-3.5 px-4">Title / Jabatan</th>
              <th class="py-3.5 px-4">Job Level</th>
              <th class="py-3.5 px-4">Departemen / Direktorat</th>
              <th class="py-3.5 px-4">Status</th>
              <th class="py-3.5 px-4">Lokasi Kerja</th>
              <th v-if="canWriteKaryawan" class="py-3.5 px-4 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#F1F5F9] text-[12px]">
            <tr v-for="emp in paginatedEmployees" :key="emp.id_karyawan || emp.nik" class="hover:bg-[#F8FAFC] transition-colors">
              <td class="py-3.5 px-4">
                <div class="flex items-center gap-3">
                  <div>
                    <p class="font-bold text-[#2A3547]">{{ emp.nama_karyawan }}</p>
                    <p class="text-[11px] text-[#7C8BAC]">{{ emp.email_kantor || '-' }}</p>
                  </div>
                </div>
              </td>
              <td class="py-3.5 px-4 font-mono font-bold text-[#2A3547]">{{ emp.nik }}</td>
              <td class="py-3.5 px-4 font-medium text-[#2A3547]">{{ emp.jabatan || emp.title || '-' }}</td>
              <td class="py-3.5 px-4">
                <span class="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                  {{ emp.tingkat_jabatan || emp.job_level || '-' }}
                </span>
              </td>
              <td class="py-3.5 px-4">
                <p class="font-semibold text-[#2A3547]">{{ emp.departemen || '-' }}</p>
                <p class="text-[10px] text-[#7C8BAC]">{{ emp.direktorat || emp.directorate || '-' }}</p>
              </td>
              <td class="py-3.5 px-4">
                <AppBadge
                  :type="(emp.status_karyawan || emp.status) === 'Active' ? 'success' : (emp.status_karyawan || emp.status) === 'Outsource' ? 'warning' : 'danger'"
                  :text="emp.status_karyawan || emp.status || 'Active'"
                />
              </td>
              <td class="py-3.5 px-4 font-bold text-[#2A3547]">{{ emp.lokasi_kerja || '-' }}</td>
              <td v-if="canWriteKaryawan" class="py-3.5 px-4 text-right">
                <AppRowActions :actions="getEmployeeActions(emp)" />
              </td>
            </tr>
          </tbody>
        </table>

        <AppPagination
          v-model:currentPage="currentPage"
          :total-items="filteredEmployees.length"
          :items-per-page="itemsPerPage"
        />
      </div>
    </div>

    <!-- Modal Form Tambah/Edit Karyawan -->
    <AppModal
      :is-open="showFormModal"
      :title="modalMode === 'add' ? 'Tambah Data Karyawan' : 'Edit Data Karyawan'"
      size="lg"
      @close="closeModal"
    >
      <form @submit.prevent="saveEmployee" class="space-y-4">
        <div v-if="modalError" class="rounded-xl bg-rose-50 p-3 text-[12px] font-semibold text-rose-600">
          {{ modalError }}
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-[11px] font-bold uppercase tracking-wider text-[#7C8BAC] mb-1">NIK *</label>
            <input
              v-model="form.nik"
              type="text"
              required
              placeholder="Contoh: 2026001"
              class="w-full rounded-xl border border-[#E5EAEF] bg-[#F8FAFC] px-3 py-2 text-[13px] text-[#2A3547] focus:outline-none focus:border-[#5D87FF]"
            />
          </div>

          <div>
            <label class="block text-[11px] font-bold uppercase tracking-wider text-[#7C8BAC] mb-1">Nama Karyawan *</label>
            <input
              v-model="form.nama_karyawan"
              type="text"
              required
              placeholder="Nama lengkap"
              class="w-full rounded-xl border border-[#E5EAEF] bg-[#F8FAFC] px-3 py-2 text-[13px] text-[#2A3547] focus:outline-none focus:border-[#5D87FF]"
            />
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-[11px] font-bold uppercase tracking-wider text-[#7C8BAC] mb-1">Email Kantor *</label>
            <input
              v-model="form.email_kantor"
              type="email"
              required
              placeholder="nama@esb.co.id"
              class="w-full rounded-xl border border-[#E5EAEF] bg-[#F8FAFC] px-3 py-2 text-[13px] text-[#2A3547] focus:outline-none focus:border-[#5D87FF]"
            />
          </div>

          <div>
            <label class="block text-[11px] font-bold uppercase tracking-wider text-[#7C8BAC] mb-1">Lokasi Kerja *</label>
            <input
              v-model="form.lokasi_kerja"
              type="text"
              required
              placeholder="Contoh: JKT, Solo, BSD"
              class="w-full rounded-xl border border-[#E5EAEF] bg-[#F8FAFC] px-3 py-2 text-[13px] text-[#2A3547] focus:outline-none focus:border-[#5D87FF]"
            />
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-[11px] font-bold uppercase tracking-wider text-[#7C8BAC] mb-1">Title / Jabatan *</label>
            <input
              v-model="form.jabatan"
              type="text"
              required
              placeholder="Contoh: Software Engineer"
              class="w-full rounded-xl border border-[#E5EAEF] bg-[#F8FAFC] px-3 py-2 text-[13px] text-[#2A3547] focus:outline-none focus:border-[#5D87FF]"
            />
          </div>

          <div>
            <label class="block text-[11px] font-bold uppercase tracking-wider text-[#7C8BAC] mb-1">Job Level *</label>
            <select
              v-model="form.tingkat_jabatan"
              required
              class="w-full rounded-xl border border-[#E5EAEF] bg-[#F8FAFC] px-3 py-2 text-[13px] text-[#2A3547] focus:outline-none"
            >
              <option v-for="lvl in jobLevelOptions" :key="lvl" :value="lvl">{{ lvl }}</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-[11px] font-bold uppercase tracking-wider text-[#7C8BAC] mb-1">Departemen *</label>
            <input
              v-model="form.departemen"
              type="text"
              required
              placeholder="Contoh: Technology"
              class="w-full rounded-xl border border-[#E5EAEF] bg-[#F8FAFC] px-3 py-2 text-[13px] text-[#2A3547] focus:outline-none focus:border-[#5D87FF]"
            />
          </div>

          <div>
            <label class="block text-[11px] font-bold uppercase tracking-wider text-[#7C8BAC] mb-1">Directorate *</label>
            <input
              v-model="form.direktorat"
              type="text"
              required
              placeholder="Contoh: Technology"
              class="w-full rounded-xl border border-[#E5EAEF] bg-[#F8FAFC] px-3 py-2 text-[13px] text-[#2A3547] focus:outline-none focus:border-[#5D87FF]"
            />
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label class="block text-[11px] font-bold uppercase tracking-wider text-[#7C8BAC] mb-1">Status Karyawan *</label>
            <select
              v-model="form.status_karyawan"
              required
              class="w-full rounded-xl border border-[#E5EAEF] bg-[#F8FAFC] px-3 py-2 text-[13px] text-[#2A3547] focus:outline-none"
            >
              <option value="Active">Active</option>
              <option value="Outsource">Outsource</option>
              <option value="Resigned">Resigned</option>
            </select>
          </div>

          <div>
            <label class="block text-[11px] font-bold uppercase tracking-wider text-[#7C8BAC] mb-1">Status Kepegawaian *</label>
            <select
              v-model="form.status_kepegawaian"
              required
              class="w-full rounded-xl border border-[#E5EAEF] bg-[#F8FAFC] px-3 py-2 text-[13px] text-[#2A3547] focus:outline-none"
            >
              <option value="Permanent">Permanent</option>
              <option value="Contract">Contract</option>
            </select>
          </div>

          <div>
            <label class="block text-[11px] font-bold uppercase tracking-wider text-[#7C8BAC] mb-1">Tgl Mulai Bekerja *</label>
            <input
              v-model="form.tanggal_mulai_bekerja"
              type="date"
              required
              class="w-full rounded-xl border border-[#E5EAEF] bg-[#F8FAFC] px-3 py-2 text-[13px] text-[#2A3547] focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label class="block text-[11px] font-bold uppercase tracking-wider text-[#7C8BAC] mb-1">NIK Atasan Langsung</label>
          <select
            v-model="form.nik_atasan_langsung"
            class="w-full rounded-xl border border-[#E5EAEF] bg-[#F8FAFC] px-3 py-2 text-[13px] text-[#2A3547] focus:outline-none"
          >
            <option value="">-- Tanpa Atasan / Tidak Ada --</option>
            <option
              v-for="e in employees.filter(emp => emp.nik !== form.nik)"
              :key="e.nik"
              :value="e.nik"
            >
              {{ e.nik }} - {{ e.nama_karyawan }} ({{ e.jabatan || e.title || 'Staff' }})
            </option>
          </select>
        </div>

        <div class="flex items-center justify-end gap-2 pt-4 border-t border-[#E5EAEF]">
          <button
            type="button"
            @click="closeModal"
            class="rounded-xl border border-[#E5EAEF] px-4 py-2 text-[12px] font-bold text-[#7C8BAC] hover:bg-gray-50 transition-all cursor-pointer"
          >
            Batal
          </button>
          <button
            type="submit"
            :disabled="isSubmitting"
            class="rounded-xl bg-[#5D87FF] px-4 py-2 text-[12px] font-bold text-white shadow-md hover:bg-[#4570EA] transition-all cursor-pointer disabled:opacity-60"
          >
            {{ isSubmitting ? 'Menyimpan...' : 'Simpan Data' }}
          </button>
        </div>
      </form>
    </AppModal>

    <!-- Modal Hapus Karyawan -->
    <AppModal
      :is-open="showDeleteModal"
      title="Hapus Data Karyawan"
      @close="closeModal"
    >
      <div class="space-y-4">
        <div v-if="modalError" class="rounded-xl bg-rose-50 p-3 text-[12px] font-semibold text-rose-600">
          {{ modalError }}
        </div>

        <p class="text-[13px] text-[#2A3547]">
          Apakah Anda yakin ingin menghapus data karyawan <strong>{{ selectedEmployee?.nama_karyawan }}</strong> (NIK: {{ selectedEmployee?.nik }})?
        </p>

        <div v-if="parseInt(selectedEmployee?.jumlah_aset || 0) > 0" class="rounded-xl bg-amber-50 p-3 text-[12px] font-semibold text-amber-700 flex items-center gap-2">
          <span class="material-symbols-outlined text-[18px]">warning</span>
          <span>Karyawan ini masih memiliki {{ selectedEmployee?.jumlah_aset }} unit aset ter-assign!</span>
        </div>

        <div class="flex items-center justify-end gap-2 pt-4 border-t border-[#E5EAEF]">
          <button
            type="button"
            @click="closeModal"
            class="rounded-xl border border-[#E5EAEF] px-4 py-2 text-[12px] font-bold text-[#7C8BAC] hover:bg-gray-50 transition-all cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            @click="deleteEmployee"
            :disabled="isSubmitting"
            class="rounded-xl bg-rose-600 px-4 py-2 text-[12px] font-bold text-white shadow-md hover:bg-rose-700 transition-all cursor-pointer disabled:opacity-60"
          >
            {{ isSubmitting ? 'Menghapus...' : 'Ya, Hapus Karyawan' }}
          </button>
        </div>
      </div>
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
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
