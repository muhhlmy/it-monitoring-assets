<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useApi } from '../composables/useApi.js'
import { useAuth } from '../composables/useAuth.js'
import { animateStagger } from '../composables/useGsap.js'
import { normalizeLocation } from '../utils/locationNormalizer.js'
import AppModal from '../components/ui/AppModal.vue'
import AppBadge from '../components/ui/AppBadge.vue'
import AppRowActions from '../components/ui/AppRowActions.vue'
import AppImportModal from '../components/ui/AppImportModal.vue'
import AppPagination from '../components/ui/AppPagination.vue'
import SkeletonTable from '../components/ui/skeleton/SkeletonTable.vue'

const { get, post, put, del } = useApi()
const { isAdmin, isSuperAdmin, hasWritePermission } = useAuth()
const canWriteKaryawan = computed(
  () => isAdmin.value || isSuperAdmin.value || hasWritePermission('karyawan'),
)

// ── State Utama ──────────────────────────────────────────────
const employees = ref([])
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
  'C-Level',
  'L1',
  'L1a',
  'L2',
  'L2b',
  'L3',
  'L3b',
  'L4',
  'L4c',
  'L5',
  'L6',
  'LS1',
  'LS2',
  'LS3',
  'Freelance',
  'Intern',
]

const departemenOptions = [
  'Account Management',
  'Accounting & Tax',
  'Asset Management',
  'Business Consultant',
  'Business Operations',
  'CEO',
  'CEO Office',
  'Corporate Development',
  'Data Analytics',
  'Digital Marketing',
  'Ecosystem and Strategic Partnership',
  'Finance & Accounting',
  'Finance & Legal',
  'Finance Business Partner',
  'Finance, Accounting, & Tax',
  'Integration Solutions Delivery',
  'Legal',
  'Marketing',
  'Marketing Communication',
  'Operation Excellence',
  'Operations',
  'Operations Support',
  'People Experience',
  'People Shared Services',
  'People Strategy & Development',
  'Product Engineering',
  'Product Management',
  'Research',
  'Revenue',
  'Technology',
]

const locationCodeOptions = [
  'BDG',
  'BKS',
  'BL',
  'BTM',
  'DPK',
  'GS',
  'JKT',
  'MDN',
  'MLG',
  'PL',
  'PLM',
  'SBY',
  'SLO',
  'SMG',
  'SRG',
  'YYK',
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
  const custom = employees.value.map((e) => e.departemen).filter(Boolean)
  return [...new Set([...departemenOptions, ...custom])].sort()
})

const availableLokasiOptions = computed(() => {
  const custom = employees.value.map((e) => normalizeLocation(e.lokasi_kerja)).filter(Boolean)
  const mappedDefaults = locationCodeOptions.map(normalizeLocation)
  return [...new Set([...mappedDefaults, ...custom])].sort()
})

const filteredEmployees = computed(() => {
  const q = searchQuery.value.trim().toLocaleLowerCase('id-ID')
  return employees.value.filter((emp) => {
    const searchable = [
      emp.nik,
      emp.nama_karyawan,
      emp.email_kantor,
      emp.jabatan,
      emp.title,
      emp.departemen,
      emp.direktorat,
      emp.directorate,
      emp.lokasi_kerja,
      emp.status_karyawan,
      emp.status,
      emp.nik_atasan_langsung,
    ]
      .join(' ')
      .toLocaleLowerCase('id-ID')

    const statusVal = emp.status_karyawan || emp.status
    return (
      (!q || searchable.includes(q)) &&
      (!filterDepartemen.value || emp.departemen === filterDepartemen.value) &&
      (!filterLokasi.value || emp.lokasi_kerja === filterLokasi.value) &&
      (!filterStatus.value || statusVal === filterStatus.value)
    )
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
  setTimeout(() => {
    notification.value = null
  }, 3500)
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
      lokasi_kerja: normalizeLocation(e.lokasi_kerja || e.work_location || ''),
      employeement_status: e.employeement_status || e.status_kepegawaian || 'Permanent',
      status_kepegawaian: e.status_kepegawaian || e.employeement_status || 'Permanent',
    }))
  } catch (err) {
    pageError.value = err.message || 'Gagal memuat data karyawan.'
  } finally {
    isLoading.value = false
    await nextTick()
    animateStagger('tbody tr')
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
    nik_atasan_langsung: form.value.nik_atasan_langsung
      ? form.value.nik_atasan_langsung.trim()
      : null,
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
    const res = await del(`/api/karyawan/${targetId}`)
    const count = res?.affectedAssetsCount || 0
    if (count > 0) {
      toast(
        `Data karyawan diubah ke Resigned. ${count} unit aset otomatis dialihkan menjadi Stock.`,
      )
    } else {
      toast('Data karyawan berhasil diubah statusnya menjadi Resigned.')
    }
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
  <div class="flex min-w-0 flex-col gap-5" :data-testid="!isLoading ? 'page-ready' : undefined">
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

    <!-- Simplified SaaS Header & Toolbar Container -->
    <div
      class="flex flex-col gap-3.5 bg-white p-4.5 rounded-2xl border border-[#E2E8F0]/80 shadow-2xs"
    >
      <!-- Row 1: Page Title & Primary CTA -->
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-bold text-[#0F172A] tracking-tight">Data Karyawan</h2>
          <p class="text-xs text-[#64748B] mt-0.5 leading-normal">
            Pengelolaan dan integrasi data karyawan perusahaan
          </p>
        </div>

        <div v-if="canWriteKaryawan" class="flex items-center gap-2">
          <button
            type="button"
            @click="showImportModal = true"
            class="h-9 shrink-0 whitespace-nowrap rounded-lg border border-[#E2E8F0] bg-white px-3 text-xs font-medium text-[#475569] hover:bg-[#F8FAFC] hover:text-[#0F172A] transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
            title="Import data karyawan dari Excel"
          >
            <span class="material-symbols-outlined text-[16px] text-[#64748B]">file_upload</span>
            <span>Import Excel</span>
          </button>

          <button
            type="button"
            @click="openAdd"
            class="h-9 shrink-0 whitespace-nowrap rounded-lg bg-[#2563EB] px-3.5 text-xs font-semibold text-white shadow-2xs hover:bg-[#1D4ED8] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            title="Tambah karyawan baru"
          >
            <span class="material-symbols-outlined text-[16px]">person_add</span>
            <span>Tambah Karyawan</span>
          </button>
        </div>
      </div>

      <!-- Row 2: Search Input & Filters -->
      <div class="flex flex-wrap items-center gap-2 w-full min-w-0 pt-2 border-t border-[#F1F5F9]">
        <div class="relative flex-1 min-w-[200px]">
          <span
            class="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[17px] text-[#94A3B8] pointer-events-none"
            >search</span
          >
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Cari NIK, nama, email, jabatan, atau departemen..."
            class="h-9 w-full rounded-lg border border-[#E2E8F0] bg-white pl-8 pr-2.5 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:border-[#2563EB] focus:outline-none transition-all shadow-2xs"
          />
        </div>

        <select
          v-model="filterDepartemen"
          class="h-9 w-[140px] shrink-0 rounded-lg border border-[#E2E8F0] bg-white px-2.5 text-xs text-[#0F172A] focus:border-[#2563EB] focus:outline-none transition-all cursor-pointer shadow-2xs"
        >
          <option value="">Semua Departemen</option>
          <option v-for="dep in availableDepartemenOptions" :key="dep" :value="dep">
            {{ dep }}
          </option>
        </select>

        <select
          v-model="filterLokasi"
          class="h-9 w-[130px] shrink-0 rounded-lg border border-[#E2E8F0] bg-white px-2.5 text-xs text-[#0F172A] focus:border-[#2563EB] focus:outline-none transition-all cursor-pointer shadow-2xs"
        >
          <option value="">Semua Lokasi</option>
          <option v-for="loc in availableLokasiOptions" :key="loc" :value="loc">{{ loc }}</option>
        </select>

        <select
          v-model="filterStatus"
          class="h-9 w-[125px] shrink-0 rounded-lg border border-[#E2E8F0] bg-white px-2.5 text-xs text-[#0F172A] focus:border-[#2563EB] focus:outline-none transition-all cursor-pointer shadow-2xs"
        >
          <option value="">Semua Status</option>
          <option value="Active">Active</option>
          <option value="Outsource">Outsource</option>
          <option value="Resigned">Resigned</option>
        </select>
      </div>
    </div>

    <!-- Table Section -->
    <div class="rounded-2xl border border-[#E2E8F0]/80 bg-white shadow-2xs overflow-hidden">
      <div v-if="isLoading" aria-busy="true">
        <SkeletonTable preset="employees" :rows="6" />
      </div>

      <div v-else-if="pageError" class="p-6 text-center text-rose-600">
        <p class="font-bold text-[14px]">{{ pageError }}</p>
        <button
          type="button"
          @click="fetchData"
          class="mt-2 text-[12px] font-bold underline cursor-pointer"
        >
          Coba Lagi
        </button>
      </div>

      <div v-else-if="filteredEmployees.length === 0" class="p-12 text-center text-[#64748B]">
        <span class="material-symbols-outlined text-[44px] text-[#CBD5E1]">person_off</span>
        <p class="mt-2 font-bold text-[13.5px] text-[#0F172A]">Tidak Ada Data Karyawan</p>
        <p class="text-[11.5px] text-[#64748B]">
          Cobalah untuk mengosongkan filter atau menambah karyawan baru.
        </p>
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead
            class="sticky top-0 z-10 border-b border-[#E2E8F0]/80 bg-[#F8FAFC]/80 backdrop-blur-xs select-none"
          >
            <tr>
              <th
                class="py-3 pl-5 pr-4 text-[10.5px] font-semibold uppercase tracking-wider text-[#64748B]"
              >
                Karyawan
              </th>
              <th
                class="py-3 px-4 text-[10.5px] font-semibold uppercase tracking-wider text-[#64748B]"
              >
                NIK
              </th>
              <th
                class="py-3 px-4 text-[10.5px] font-semibold uppercase tracking-wider text-[#64748B]"
              >
                Title / Jabatan
              </th>
              <th
                class="py-3 px-4 text-[10.5px] font-semibold uppercase tracking-wider text-[#64748B]"
              >
                Departemen / Direktorat
              </th>
              <th
                class="py-3 px-4 text-[10.5px] font-semibold uppercase tracking-wider text-[#64748B]"
              >
                Status
              </th>
              <th
                class="py-3 px-4 text-[10.5px] font-semibold uppercase tracking-wider text-[#64748B]"
              >
                Lokasi Kerja
              </th>
              <th
                v-if="canWriteKaryawan"
                class="py-3 pr-5 pl-4 text-right text-[10.5px] font-semibold uppercase tracking-wider text-[#64748B]"
              >
                Aksi
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#F1F5F9]">
            <tr
              v-for="emp in paginatedEmployees"
              :key="emp.id_karyawan || emp.nik"
              class="group hover:bg-[#F8FAFC] transition-colors duration-150"
            >
              <td class="py-4 pl-5 pr-4 min-w-[180px]">
                <div class="flex flex-col">
                  <span
                    class="text-[13.5px] font-bold text-[#0F172A] leading-snug truncate group-hover:text-[#2563EB] transition-colors"
                  >
                    {{ emp.nama_karyawan }}
                  </span>
                  <span class="text-[11.5px] font-normal text-[#64748B] mt-0.5 truncate">
                    {{ emp.email_kantor || '—' }}
                  </span>
                </div>
              </td>

              <td
                class="py-4 px-4 font-mono text-[11.5px] font-semibold text-[#0F172A] min-w-[110px]"
              >
                {{ emp.nik }}
              </td>

              <td class="py-4 px-4 min-w-[160px]">
                <span class="text-[12.5px] font-medium text-[#1E293B]">{{
                  emp.jabatan || emp.title || '—'
                }}</span>
              </td>

              <td class="py-4 px-4 min-w-[170px]">
                <div class="flex flex-col">
                  <span class="text-[12.5px] font-medium text-[#1E293B] leading-snug truncate">
                    {{ emp.departemen || '—' }}
                  </span>
                  <span class="text-[11.5px] font-normal text-[#64748B] mt-0.5 truncate">
                    {{ emp.direktorat || emp.directorate || '—' }}
                  </span>
                </div>
              </td>

              <td class="py-4 px-4 min-w-[110px]">
                <AppBadge
                  :type="
                    (emp.status_karyawan || emp.status) === 'Active'
                      ? 'success'
                      : (emp.status_karyawan || emp.status) === 'Outsource'
                        ? 'warning'
                        : 'danger'
                  "
                  :text="emp.status_karyawan || emp.status || 'Active'"
                />
              </td>
              <td class="py-4 px-4 text-[12.5px] font-normal text-[#1E293B] min-w-[130px]">
                {{ normalizeLocation(emp.lokasi_kerja || emp.work_location) || '—' }}
              </td>
              <td v-if="canWriteKaryawan" class="py-4 pr-5 pl-4 text-right" @click.stop>
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
        <div
          v-if="modalError"
          class="rounded-xl bg-rose-50 p-3 text-[12px] font-semibold text-rose-600"
        >
          {{ modalError }}
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-[11px] font-bold uppercase tracking-wider text-[#7C8BAC] mb-1"
              >NIK *</label
            >
            <input
              v-model="form.nik"
              type="text"
              required
              placeholder="Contoh: 2026001"
              class="w-full rounded-xl border border-[#E5EAEF] bg-[#F8FAFC] px-3 py-2 text-[13px] text-[#2A3547] focus:outline-none focus:border-[#5D87FF]"
            />
          </div>

          <div>
            <label class="block text-[11px] font-bold uppercase tracking-wider text-[#7C8BAC] mb-1"
              >Nama Karyawan *</label
            >
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
            <label class="block text-[11px] font-bold uppercase tracking-wider text-[#7C8BAC] mb-1"
              >Email Kantor *</label
            >
            <input
              v-model="form.email_kantor"
              type="email"
              required
              placeholder="nama@esb.co.id"
              class="w-full rounded-xl border border-[#E5EAEF] bg-[#F8FAFC] px-3 py-2 text-[13px] text-[#2A3547] focus:outline-none focus:border-[#5D87FF]"
            />
          </div>

          <div>
            <label class="block text-[11px] font-bold uppercase tracking-wider text-[#7C8BAC] mb-1"
              >Lokasi Kerja *</label
            >
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
            <label class="block text-[11px] font-bold uppercase tracking-wider text-[#7C8BAC] mb-1"
              >Title / Jabatan *</label
            >
            <input
              v-model="form.jabatan"
              type="text"
              required
              placeholder="Contoh: Software Engineer"
              class="w-full rounded-xl border border-[#E5EAEF] bg-[#F8FAFC] px-3 py-2 text-[13px] text-[#2A3547] focus:outline-none focus:border-[#5D87FF]"
            />
          </div>

          <div>
            <label class="block text-[11px] font-bold uppercase tracking-wider text-[#7C8BAC] mb-1"
              >Job Level *</label
            >
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
            <label class="block text-[11px] font-bold uppercase tracking-wider text-[#7C8BAC] mb-1"
              >Departemen *</label
            >
            <input
              v-model="form.departemen"
              type="text"
              required
              placeholder="Contoh: Technology"
              class="w-full rounded-xl border border-[#E5EAEF] bg-[#F8FAFC] px-3 py-2 text-[13px] text-[#2A3547] focus:outline-none focus:border-[#5D87FF]"
            />
          </div>

          <div>
            <label class="block text-[11px] font-bold uppercase tracking-wider text-[#7C8BAC] mb-1"
              >Directorate *</label
            >
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
            <label class="block text-[11px] font-bold uppercase tracking-wider text-[#7C8BAC] mb-1"
              >Status Karyawan *</label
            >
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
            <label class="block text-[11px] font-bold uppercase tracking-wider text-[#7C8BAC] mb-1"
              >Status Kepegawaian *</label
            >
            <select
              v-model="form.status_kepegawaian"
              required
              class="w-full rounded-xl border border-[#E5EAEF] bg-[#F8FAFC] px-3 py-2 text-[13px] text-[#2A3547] focus:outline-none"
            >
              <option value="Permanent">Permanent</option>
              <option value="Contract">Contract</option>
              <option value="Freelance">Freelance</option>
              <option value="Intern">Intern</option>
            </select>
          </div>

          <div>
            <label class="block text-[11px] font-bold uppercase tracking-wider text-[#7C8BAC] mb-1"
              >Tgl Mulai Bekerja *</label
            >
            <input
              v-model="form.tanggal_mulai_bekerja"
              type="date"
              required
              class="w-full rounded-xl border border-[#E5EAEF] bg-[#F8FAFC] px-3 py-2 text-[13px] text-[#2A3547] focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label class="block text-[11px] font-bold uppercase tracking-wider text-[#7C8BAC] mb-1"
            >NIK Atasan Langsung</label
          >
          <select
            v-model="form.nik_atasan_langsung"
            class="w-full rounded-xl border border-[#E5EAEF] bg-[#F8FAFC] px-3 py-2 text-[13px] text-[#2A3547] focus:outline-none"
          >
            <option value="">-- Tanpa Atasan / Tidak Ada --</option>
            <option
              v-for="e in employees.filter((emp) => emp.nik !== form.nik)"
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
    <AppModal :is-open="showDeleteModal" title="Hapus Data Karyawan" @close="closeModal">
      <div class="space-y-4">
        <div
          v-if="modalError"
          class="rounded-xl bg-rose-50 p-3 text-[12px] font-semibold text-rose-600"
        >
          {{ modalError }}
        </div>

        <p class="text-[13px] text-[#2A3547]">
          Apakah Anda yakin ingin menghapus data karyawan
          <strong>{{ selectedEmployee?.nama_karyawan }}</strong> (NIK: {{ selectedEmployee?.nik }})?
        </p>

        <div
          v-if="parseInt(selectedEmployee?.jumlah_aset || 0) > 0"
          class="rounded-xl bg-amber-50 p-3 text-[12px] font-semibold text-amber-700 flex items-start gap-2"
        >
          <span class="material-symbols-outlined text-[18px] mt-0.5">warning</span>
          <div>
            <p>
              Karyawan ini masih memiliki {{ selectedEmployee?.jumlah_aset }} unit aset ter-assign.
            </p>
            <p class="font-normal text-[11px] text-amber-800 mt-0.5">
              Aset milik karyawan ini akan <strong>otomatis dialihkan menjadi Stock</strong> saat
              karyawan di-delete / resigned.
            </p>
          </div>
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
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
