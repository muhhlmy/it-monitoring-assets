<script setup>
import { ref, computed, watch } from 'vue'
import * as XLSX from 'xlsx'
import AppModal from './AppModal.vue'
import AppPagination from './AppPagination.vue'
import SkeletonTable from './skeleton/SkeletonTable.vue'
import { useApi } from '@/composables/useApi'
import { normalizeLocation } from '@/utils/locationNormalizer.js'

const props = defineProps({
  isOpen: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'imported'])
const { post } = useApi()

const fileInputRef = ref(null)
const selectedFile = ref(null)
const isParsing = ref(false)
const isSubmitting = ref(false)
const modalError = ref('')
const successResult = ref(null)

const activeTab = ref('karyawan') // 'karyawan' | 'assets'
const parsedKaryawanRows = ref([])
const parsedAssetRows = ref([])

const currentPageKaryawan = ref(1)
const currentPageAssets = ref(1)
const itemsPerPage = ref(10)

watch([parsedKaryawanRows, parsedAssetRows], () => {
  currentPageKaryawan.value = 1
  currentPageAssets.value = 1
})

const paginatedKaryawanRows = computed(() => {
  const start = (currentPageKaryawan.value - 1) * itemsPerPage.value
  return parsedKaryawanRows.value.slice(start, start + itemsPerPage.value)
})

const paginatedAssetRows = computed(() => {
  const start = (currentPageAssets.value - 1) * itemsPerPage.value
  return parsedAssetRows.value.slice(start, start + itemsPerPage.value)
})

function resetModalState() {
  selectedFile.value = null
  isParsing.value = false
  isSubmitting.value = false
  modalError.value = ''
  successResult.value = null
  parsedKaryawanRows.value = []
  parsedAssetRows.value = []
  activeTab.value = 'karyawan'
  if (fileInputRef.value) fileInputRef.value.value = ''
}

watch(
  () => props.isOpen,
  (val) => {
    if (!val) {
      resetModalState()
    }
  },
)

function handleClose() {
  resetModalState()
  emit('close')
}

// ── Download Template Excel (.xlsx) ──────────────────────────────────────────
function downloadTemplate() {
  const sampleKaryawan = [
    {
      NIK: '2026001',
      'Nama Karyawan': 'Budi Santoso',
      Status: 'Active',
      Title: 'Software Engineer',
      'Job Level': 'L3',
      Departemen: 'Technology',
      Directorate: 'Technology',
      'Tanggal Mulai Bekerja': '2024-01-15',
      'Employeement Status': 'Permanent',
      'NIK Atasan Langsung': '',
      'Email Kantor': 'budi.santoso@esb.co.id',
      'Lokasi Kerja': 'JKT',
    },
    {
      NIK: '2026002',
      'Nama Karyawan': 'Siti Rahma',
      Status: 'Active',
      Title: 'Account Management Analyst',
      'Job Level': 'L2',
      Departemen: 'Account Management',
      Directorate: 'Operations',
      'Tanggal Mulai Bekerja': '2024-03-01',
      'Employeement Status': 'Contract',
      'NIK Atasan Langsung': '2026001',
      'Email Kantor': 'siti.rahma@esb.co.id',
      'Lokasi Kerja': 'BDG',
    },
  ]

  const sampleAssets = [
    {
      Hostname: 'ESB-LAP-001',
      'Serial Number': 'PF3X90B',
      Spesifikasi: 'Intel Core i7 16GB RAM 512GB SSD',
      'NIK Pemegang': '2026001',
      'Nama Karyawan Pemegang': 'Budi Santoso',
      'Departemen Pemegang': 'Technology',
      'Lokasi Aset': 'JKT',
      'Tipe Perangkat': 'Laptop',
      'Brand/Merek': 'Lenovo',
      Model: 'ThinkPad T14',
      Status: 'In Use',
      Kondisi: 'Normal',
      'Note Asset': 'Laptop utama pengembang',
    },
    {
      Hostname: 'ESB-MON-002',
      'Serial Number': 'MON-88491',
      Spesifikasi: '27 inch 4K Display',
      'NIK Pemegang': '2026002',
      'Nama Karyawan Pemegang': 'Siti Rahma',
      'Departemen Pemegang': 'Account Management',
      'Lokasi Aset': 'BDG',
      'Tipe Perangkat': 'Monitor',
      'Brand/Merek': 'Dell',
      Model: 'UltraSharp U2720Q',
      Status: 'In Use',
      Kondisi: 'Normal',
      'Note Asset': 'Monitor kerja tambahan',
    },
  ]

  const wb = XLSX.utils.book_new()
  const wsKaryawan = XLSX.utils.json_to_sheet(sampleKaryawan)
  const wsAsset = XLSX.utils.json_to_sheet(sampleAssets)

  XLSX.utils.book_append_sheet(wb, wsKaryawan, 'Table Karyawan')
  XLSX.utils.book_append_sheet(wb, wsAsset, 'Table Asset')

  XLSX.writeFile(wb, 'Template_Import_Karyawan_dan_Aset.xlsx')
}

// ── Parse Excel File ─────────────────────────────────────────────────────────
function onFileSelected(event) {
  const files = event.target.files
  if (files && files.length > 0) {
    processFile(files[0])
  }
}

function onDropFile(event) {
  event.preventDefault()
  const files = event.dataTransfer.files
  if (files && files.length > 0) {
    processFile(files[0])
  }
}

function processFile(file) {
  modalError.value = ''
  successResult.value = null

  if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
    modalError.value = 'Format file tidak didukung. Harap pilih file .xlsx, .xls, atau .csv'
    return
  }

  selectedFile.value = file
  isParsing.value = true

  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result)
      const workbook = XLSX.read(data, { type: 'array', cellDates: true })

      let karyawanData = []
      let assetData = []

      // Check sheet names & header keys
      const sheetNames = workbook.SheetNames

      sheetNames.forEach((sheetName) => {
        const lowerName = sheetName.toLowerCase()
        const sheetJson = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName])
        if (!Array.isArray(sheetJson) || sheetJson.length === 0) return

        const sampleKeys = Object.keys(sheetJson[0] || {}).map((k) => String(k).toLowerCase())

        const isEmpSheet = lowerName.includes('karyawan') || lowerName.includes('employee')
        const isAssetSheet = lowerName.includes('asset') || lowerName.includes('aset')

        const hasEmpKeys = sampleKeys.some(
          (k) =>
            k.includes('nik') ||
            k.includes('karyawan') ||
            k.includes('email') ||
            k.includes('jabatan') ||
            k.includes('title') ||
            k.includes('direktorat'),
        )
        const hasAssetKeys = sampleKeys.some(
          (k) =>
            k.includes('label') ||
            k.includes('serial') ||
            k.includes('perangkat') ||
            k.includes('merek') ||
            k.includes('brand') ||
            k.includes('model') ||
            k.includes('sn'),
        )

        if (isEmpSheet) {
          karyawanData = karyawanData.concat(sheetJson)
        } else if (isAssetSheet) {
          assetData = assetData.concat(sheetJson)
        } else if (hasAssetKeys && !hasEmpKeys) {
          assetData = assetData.concat(sheetJson)
        } else if (hasEmpKeys && !hasAssetKeys) {
          karyawanData = karyawanData.concat(sheetJson)
        } else {
          if (sheetNames.length === 1) {
            if (hasAssetKeys) assetData = sheetJson
            if (hasEmpKeys) karyawanData = sheetJson
            if (!hasAssetKeys && !hasEmpKeys) {
              karyawanData = sheetJson
              assetData = sheetJson
            }
          }
        }
      })

      parsedKaryawanRows.value = karyawanData
      parsedAssetRows.value = assetData

      if (karyawanData.length > 0) activeTab.value = 'karyawan'
      else if (assetData.length > 0) activeTab.value = 'assets'

      if (karyawanData.length === 0 && assetData.length === 0) {
        modalError.value = 'Tidak ada baris data yang berhasil terbaca di file Excel tersebut.'
      }
    } catch (err) {
      console.error('[Excel Parse Error]', err)
      modalError.value = 'Gagal membaca isi file Excel. Pastikan file tidak rusak.'
    } finally {
      isParsing.value = false
    }
  }

  reader.onerror = () => {
    modalError.value = 'Terjadi kesalahan saat membaca file.'
    isParsing.value = false
  }

  reader.readAsArrayBuffer(file)
}

// ── Submit Import ────────────────────────────────────────────────────────────
async function submitImport() {
  if (parsedKaryawanRows.value.length === 0 && parsedAssetRows.value.length === 0) {
    modalError.value = 'Tidak ada data untuk diimpor.'
    return
  }

  isSubmitting.value = true
  modalError.value = ''
  successResult.value = null

  try {
    const res = await post('/api/import/excel', {
      karyawanRows: parsedKaryawanRows.value,
      assetRows: parsedAssetRows.value,
    })

    successResult.value = res.message || 'Import data Excel sukses!'
    emit('imported')
  } catch (err) {
    modalError.value = err.message || 'Gagal memproses import data Excel.'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <AppModal
    :is-open="isOpen"
    title="Import Data Karyawan & Aset IT (Excel)"
    size="xl"
    @close="handleClose"
  >
    <div class="space-y-4">
      <!-- Alert Notifikasi -->
      <div
        v-if="modalError"
        class="rounded-xl bg-rose-50 p-3 text-[12px] font-bold text-rose-600 border border-rose-200"
      >
        {{ modalError }}
      </div>

      <div
        v-if="successResult"
        class="rounded-xl bg-emerald-50 p-4 text-[12px] font-bold text-emerald-700 border border-emerald-200 flex flex-col gap-2"
      >
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-[20px]">check_circle</span>
          <span>{{ successResult }}</span>
        </div>
        <p class="text-[11px] font-normal text-emerald-800">
          Setiap karyawan baru otomatis dibuatkan akun pengguna default (role: User) dengan password
          acak yang aman. Pengguna wajib mengganti password saat login pertama.
        </p>
      </div>

      <!-- Action Banner: Download Template -->
      <div
        class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl bg-[#ECF2FF] border border-[#D2E3FF] p-4"
      >
        <div>
          <h4 class="text-[13px] font-bold text-[#2A3547]">Format / Template Import Excel</h4>
          <p class="text-[11px] text-[#7C8BAC] mt-0.5">
            Gunakan template Excel resmi yang berisi Sheet <code>Table Karyawan</code> &amp;
            <code>Table Asset</code>.
          </p>
        </div>
        <button
          type="button"
          @click="downloadTemplate"
          class="flex items-center gap-2 rounded-xl bg-[#5D87FF] px-4 py-2 text-[12px] font-bold text-white shadow-md hover:bg-[#4570EA] transition-all cursor-pointer shrink-0"
        >
          <span class="material-symbols-outlined text-[16px]">download</span>
          <span>Unduh Template (.xlsx)</span>
        </button>
      </div>

      <!-- File Upload Dropzone -->
      <div
        @dragover.prevent
        @drop="onDropFile"
        class="relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#DFE5EF] bg-[#F8FAFC] p-6 text-center hover:border-[#5D87FF] hover:bg-[#ECF2FF]/40 transition-all cursor-pointer"
        @click="fileInputRef?.click()"
      >
        <input
          ref="fileInputRef"
          type="file"
          accept=".xlsx, .xls, .csv"
          class="hidden"
          @change="onFileSelected"
        />

        <div
          class="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#5D87FF] shadow-sm mb-2"
        >
          <span class="material-symbols-outlined text-[28px]">upload_file</span>
        </div>

        <p v-if="!selectedFile" class="text-[13px] font-bold text-[#2A3547]">
          Tarik &amp; lepas file Excel di sini, atau
          <span class="text-[#5D87FF] underline">pilih file</span>
        </p>
        <p v-else class="text-[13px] font-bold text-[#5D87FF] truncate max-w-md">
          📄 {{ selectedFile.name }} ({{ (selectedFile.size / 1024).toFixed(1) }} KB)
        </p>

        <p class="text-[11px] text-[#7C8BAC] mt-1">
          Mendukung file berformat .xlsx, .xls, atau .csv
        </p>
      </div>

      <!-- Parsed Data Preview -->
      <div v-if="isParsing" class="py-4 space-y-2" aria-busy="true">
        <p class="text-[11px] font-semibold text-[#5D87FF] flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-[#5D87FF] animate-ping"></span>
          Membaca dan memproses isi file Excel...
        </p>
        <SkeletonTable :rows="4" :cols="5" :show-actions="false" />
      </div>

      <div
        v-else-if="parsedKaryawanRows.length > 0 || parsedAssetRows.length > 0"
        class="space-y-3 pt-2"
      >
        <!-- Tab Switcher -->
        <div class="flex items-center gap-2 border-b border-[#E5EAEF] pb-2">
          <button
            type="button"
            @click="activeTab = 'karyawan'"
            class="flex items-center gap-2 rounded-xl px-4 py-2 text-[12px] font-bold transition-all cursor-pointer"
            :class="
              activeTab === 'karyawan'
                ? 'bg-[#5D87FF] text-white shadow-sm'
                : 'text-[#7C8BAC] hover:bg-[#F8FAFC]'
            "
          >
            <span class="material-symbols-outlined text-[16px]">badge</span>
            <span>Table Karyawan ({{ parsedKaryawanRows.length }})</span>
          </button>

          <button
            type="button"
            @click="activeTab = 'assets'"
            class="flex items-center gap-2 rounded-xl px-4 py-2 text-[12px] font-bold transition-all cursor-pointer"
            :class="
              activeTab === 'assets'
                ? 'bg-[#5D87FF] text-white shadow-sm'
                : 'text-[#7C8BAC] hover:bg-[#F8FAFC]'
            "
          >
            <span class="material-symbols-outlined text-[16px]">devices</span>
            <span>Table Asset ({{ parsedAssetRows.length }})</span>
          </button>
        </div>

        <!-- Preview Table Karyawan -->
        <div
          v-if="activeTab === 'karyawan'"
          class="rounded-xl border border-[#E5EAEF] overflow-hidden"
        >
          <div class="max-h-[220px] overflow-auto">
            <table v-if="parsedKaryawanRows.length > 0" class="w-full text-left text-[11px]">
              <thead class="bg-[#F8FAFC] sticky top-0 border-b border-[#E5EAEF]">
                <tr>
                  <th class="p-2 font-bold text-[#7C8BAC]">NIK</th>
                  <th class="p-2 font-bold text-[#7C8BAC]">Nama Karyawan</th>
                  <th class="p-2 font-bold text-[#7C8BAC]">Email</th>
                  <th class="p-2 font-bold text-[#7C8BAC]">Jabatan</th>
                  <th class="p-2 font-bold text-[#7C8BAC]">Job Level</th>
                  <th class="p-2 font-bold text-[#7C8BAC]">Departemen</th>
                  <th class="p-2 font-bold text-[#7C8BAC]">Status Kepegawaian</th>
                  <th class="p-2 font-bold text-[#7C8BAC]">Lokasi</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[#F1F5F9]">
                <tr
                  v-for="(row, idx) in paginatedKaryawanRows"
                  :key="idx"
                  class="hover:bg-[#F8FAFC]"
                >
                  <td class="p-2 font-mono font-bold text-[#2A3547]">
                    {{ row.NIK || row.nik || '—' }}
                  </td>
                  <td class="p-2 font-bold text-[#2A3547]">
                    {{ row['Nama Karyawan'] || row.nama_karyawan || '—' }}
                  </td>
                  <td class="p-2 text-[#7C8BAC]">
                    {{ row['Email Kantor'] || row.email_kantor || '—' }}
                  </td>
                  <td class="p-2 text-[#2A3547]">
                    {{ row.Title || row.title || row.jabatan || '—' }}
                  </td>
                  <td class="p-2 text-[#2A3547]">{{ row['Job Level'] || row.job_level || '—' }}</td>
                  <td class="p-2 text-[#2A3547]">{{ row.Departemen || row.departemen || '—' }}</td>
                  <td class="p-2 text-[#2A3547]">
                    {{
                      row['Employeement Status'] ||
                      row.employeement_status ||
                      row['Status Kepegawaian'] ||
                      '—'
                    }}
                  </td>
                  <td class="p-2 text-[#2A3547]">{{ normalizeLocation(row['Lokasi Kerja'] || row.lokasi || row.lokasi_kerja) || '—' }}</td>
                </tr>
              </tbody>
            </table>
            <p v-else class="p-4 text-center text-[12px] text-[#7C8BAC]">
              Tidak ada baris data Karyawan.
            </p>
          </div>
          <AppPagination
            v-if="parsedKaryawanRows.length > 0"
            v-model:currentPage="currentPageKaryawan"
            :total-items="parsedKaryawanRows.length"
            :items-per-page="itemsPerPage"
          />
        </div>

        <!-- Preview Table Asset -->
        <div
          v-if="activeTab === 'assets'"
          class="rounded-xl border border-[#E5EAEF] overflow-hidden"
        >
          <div class="max-h-[220px] overflow-auto">
            <table v-if="parsedAssetRows.length > 0" class="w-full text-left text-[11px]">
              <thead class="bg-[#F8FAFC] sticky top-0 border-b border-[#E5EAEF]">
                <tr>
                  <th class="p-2 font-bold text-[#7C8BAC]">Hostname / Label</th>
                  <th class="p-2 font-bold text-[#7C8BAC]">Serial Number</th>
                  <th class="p-2 font-bold text-[#7C8BAC]">Perangkat</th>
                  <th class="p-2 font-bold text-[#7C8BAC]">NIK Pemegang</th>
                  <th class="p-2 font-bold text-[#7C8BAC]">Lokasi</th>
                  <th class="p-2 font-bold text-[#7C8BAC]">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[#F1F5F9]">
                <tr v-for="(row, idx) in paginatedAssetRows" :key="idx" class="hover:bg-[#F8FAFC]">
                  <td class="p-2 font-bold text-[#2A3547]">
                    {{
                      row.Hostname ||
                      row.hostname ||
                      row['Label Aset'] ||
                      row.label_aset ||
                      row['Label Asset'] ||
                      row.ID ||
                      row.id ||
                      row['Kode Aset'] ||
                      row['Asset Tag'] ||
                      '—'
                    }}
                  </td>
                  <td class="p-2 font-mono font-bold text-[#2A3547]">
                    {{
                      row['Serial Number'] ||
                      row.nomor_seri ||
                      row['Nomor Seri'] ||
                      row.SN ||
                      row.sn ||
                      row['S/N'] ||
                      '—'
                    }}
                  </td>
                  <td class="p-2 text-[#2A3547]">
                    {{
                      [
                        row['Brand/Merek'] || row.merek || row.Brand || row.brand || row.Merk,
                        row.Model || row.model,
                      ]
                        .filter(Boolean)
                        .join(' ') ||
                      row['Tipe Perangkat'] ||
                      row.tipe_perangkat ||
                      row.Tipe ||
                      '—'
                    }}
                  </td>
                  <td class="p-2 font-mono text-[#7C8BAC]">
                    {{
                      row['NIK Pemegang Asset'] ||
                      row.NIK ||
                      row.nik ||
                      row['NIK Pemegang'] ||
                      'Stock'
                    }}
                  </td>
                  <td class="p-2 text-[#2A3547]">
                    {{
                      normalizeLocation(
                        row['Lokasi Asset'] ||
                        row.Lokasi ||
                        row.lokasi_aset ||
                        row['Lokasi Aset'] ||
                        row['Lokasi Kerja']
                      ) || '—'
                    }}
                  </td>
                  <td class="p-2 font-semibold text-[#5D87FF]">
                    {{ row.Status || row.status || row.status_aset || '—' }}
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-else class="p-4 text-center text-[12px] text-[#7C8BAC]">
              Tidak ada baris data Aset IT.
            </p>
          </div>
          <AppPagination
            v-if="parsedAssetRows.length > 0"
            v-model:currentPage="currentPageAssets"
            :total-items="parsedAssetRows.length"
            :items-per-page="itemsPerPage"
          />
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center justify-end gap-3 pt-4 border-t border-[#E5EAEF]">
        <button
          type="button"
          @click="handleClose"
          class="rounded-xl border border-[#E5EAEF] px-4 py-2 text-[12px] font-bold text-[#7C8BAC] hover:bg-gray-50 transition-all cursor-pointer"
        >
          Batal
        </button>
        <button
          type="button"
          :disabled="
            isSubmitting || (parsedKaryawanRows.length === 0 && parsedAssetRows.length === 0)
          "
          @click="submitImport"
          class="flex items-center gap-2 rounded-xl bg-[#5D87FF] px-5 py-2 text-[12px] font-bold text-white shadow-md hover:bg-[#4570EA] transition-all cursor-pointer disabled:opacity-50"
        >
          <span
            v-if="isSubmitting"
            class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
          ></span>
          <span v-else class="material-symbols-outlined text-[16px]">file_upload</span>
          <span>{{
            isSubmitting
              ? 'Memproses Import...'
              : `Proses Import Data (${parsedKaryawanRows.length} Karyawan, ${parsedAssetRows.length} Aset)`
          }}</span>
        </button>
      </div>
    </div>
  </AppModal>
</template>
