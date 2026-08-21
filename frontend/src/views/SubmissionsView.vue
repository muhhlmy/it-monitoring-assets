<script setup>
import { nextTick, onMounted, ref, watch } from 'vue'
import { useApi } from '../composables/useApi.js'
import SearchableSelect from '../components/ui/SearchableSelect.vue'
import BaseSkeleton from '../components/ui/skeleton/BaseSkeleton.vue'
import { animateStagger } from '../composables/useGsap.js'
import { escapeHtml, printHtmlDocument } from '../utils/printDocument.js'

const { get } = useApi()

// ── State ────────────────────────────────────────────────────
const employees = ref([])
const assets = ref([])
const isLoading = ref(true)
const pageError = ref('')

// Form State
const form = ref({
  pemberiNik: '',
  pemberiNama: '',
  pemberiDirektorat: '',
  penerimaNik: '',
  penerimaNama: '',
  penerimaDirektorat: '',
  isPenerimaLainnya: false,
  tujuan: 'baru', // 'baru' | 'peminjaman' | 'perbaikan' | 'disposal' | 'lainnya'
  tujuanLainnya: '',
  tanggal: new Date().toISOString().substring(0, 10), // yyyy-mm-dd
})

// Dynamic list of assets (Up to 3 by default, matching template)
const asetBaruList = ref([{ id_aset: '', tipe: '', qty: 1, spesifikasi: '' }])
const asetLamaList = ref([{ id_aset: '', tipe: '', qty: 1, spesifikasi: '' }])

// ── Fetch Data ───────────────────────────────────────────────
async function fetchData() {
  isLoading.value = true
  pageError.value = ''
  try {
    const [employeeData, assetData] = await Promise.all([get('/api/karyawan'), get('/api/assets')])
    employees.value = Array.isArray(employeeData) ? employeeData : []
    assets.value = (Array.isArray(assetData) ? assetData : []).map((a) => {
      const hostname = a.hostname || a.label_aset || ''
      const serial_number = a.serial_number || a.nomor_seri || ''
      const brand = a.brand_merek || a.merek || ''
      const nik = a.nik_pemegang_asset || a.nik || ''
      const nama = a.nama_karyawan_pemegang_asset || a.nama_karyawan || ''
      const dept = a.departemen_pemegang_asset || a.departemen || ''
      const lokasi = a.lokasi_asset || a.lokasi_aset || a.lokasi_kerja || a.lokasi || ''
      const status = a.status || a.status_aset || 'In Use'
      const kondisi = a.kondisi || a.kondisi_aset || 'Normal'
      const note = a.note_asset || a.catatan_aset || ''

      return {
        ...a,
        id_aset: a.id_aset || a.id,
        id: a.id || a.id_aset,
        hostname,
        label_aset: hostname,
        serial_number,
        nomor_seri: serial_number,
        brand_merek: brand,
        merek: brand,
        nik_pemegang_asset: nik,
        nik,
        nama_karyawan_pemegang_asset: nama,
        nama_karyawan: nama,
        departemen_pemegang_asset: dept,
        departemen: dept,
        lokasi_asset: lokasi,
        lokasi_aset: lokasi,
        lokasi_kerja: lokasi,
        lokasi,
        status,
        status_aset: status,
        kondisi,
        kondisi_aset: kondisi,
        note_asset: note,
        catatan_aset: note,
      }
    })
  } catch (error) {
    pageError.value = error.message || 'Gagal memuat data referensi.'
  } finally {
    isLoading.value = false
    await nextTick()
    animateStagger('.submission-section')
  }
}

// ── Watchers for Autofill ────────────────────────────────────
// Autofill Pihak Pemberi when selected
watch(
  () => form.value.pemberiNik,
  (nik) => {
    const emp = employees.value.find((e) => e.nik === nik)
    if (emp) {
      form.value.pemberiNama = emp.nama_karyawan || ''
      form.value.pemberiDirektorat = emp.departemen || ''
    } else {
      form.value.pemberiNama = ''
      form.value.pemberiDirektorat = ''
    }
  },
)

// Autofill Pihak Penerima when selected
watch(
  () => form.value.penerimaNik,
  (nik) => {
    const emp = employees.value.find((e) => e.nik === nik)
    if (emp) {
      form.value.penerimaNama = emp.nama_karyawan || ''
      form.value.penerimaDirektorat = emp.departemen || ''
    } else {
      form.value.penerimaNama = ''
      form.value.penerimaDirektorat = ''
    }
  },
)

// Watch isPenerimaLainnya to reset fields
watch(
  () => form.value.isPenerimaLainnya,
  () => {
    form.value.penerimaNik = ''
    form.value.penerimaNama = ''
    form.value.penerimaDirektorat = ''
  },
)

// Helper to format full asset identity summary: Merek / Model / Spesifikasi / S/N / Hostname
function formatAssetSpecificationSummary(asset) {
  if (!asset) return ''
  const parts = [
    asset.merek || asset.brand_merek,
    asset.model,
    asset.spesifikasi,
    asset.nomor_seri || asset.serial_number,
    asset.hostname || asset.label_aset,
  ]
    .map((item) => (item && typeof item === 'string' ? item.trim() : item))
    .filter(Boolean)

  return parts.join(' / ')
}

// Autofill Asset Baru row details when selected
function onAssetBaruSelect(index, id_aset) {
  const asset = assets.value.find((a) => a.id_aset === id_aset)
  if (asset) {
    asetBaruList.value[index].tipe = asset.tipe_perangkat || ''
    asetBaruList.value[index].spesifikasi = formatAssetSpecificationSummary(asset)
  } else {
    asetBaruList.value[index].tipe = ''
    asetBaruList.value[index].spesifikasi = ''
  }
}

// Autofill Asset Lama row details when selected
function onAssetLamaSelect(index, id_aset) {
  const asset = assets.value.find((a) => a.id_aset === id_aset)
  if (asset) {
    asetLamaList.value[index].tipe = asset.tipe_perangkat || ''
    asetLamaList.value[index].spesifikasi = formatAssetSpecificationSummary(asset)
  } else {
    asetLamaList.value[index].tipe = ''
    asetLamaList.value[index].spesifikasi = ''
  }
}

// ── Action Handlers ──────────────────────────────────────────
function addAssetBaruRow() {
  asetBaruList.value.push({ id_aset: '', tipe: '', qty: 1, spesifikasi: '' })
}

function removeAssetBaruRow(index) {
  asetBaruList.value.splice(index, 1)
  if (asetBaruList.value.length === 0) {
    addAssetBaruRow()
  }
}

function addAssetLamaRow() {
  asetLamaList.value.push({ id_aset: '', tipe: '', qty: 1, spesifikasi: '' })
}

function removeAssetLamaRow(index) {
  asetLamaList.value.splice(index, 1)
  if (asetLamaList.value.length === 0) {
    addAssetLamaRow()
  }
}

// ── PDF Print Engine ─────────────────────────────────────────
function generatePdf() {
  // Format Date to Indonsian Date (e.g. 21 Juli 2026)
  const months = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
  ]
  const d = new Date(form.value.tanggal)
  const formattedDate = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`

  // Check Tujuan marks
  const isTujuanBaru = form.value.tujuan === 'baru' ? '✓' : ''
  const isTujuanPeminjaman =
    form.value.tujuan === 'peminjaman' || form.value.tujuan === 'pengembalian' ? '✓' : ''
  const isTujuanPerbaikan =
    form.value.tujuan === 'perbaikan' || form.value.tujuan === 'penggantian' ? '✓' : ''
  const isTujuanDisposal = form.value.tujuan === 'disposal' ? '✓' : ''
  const isTujuanLainnya = form.value.tujuan === 'lainnya' ? '✓' : ''
  const tujuanLainnyaText =
    form.value.tujuan === 'lainnya' ? escapeHtml(form.value.tujuanLainnya) : ''

  // Strikethrough logic for Peminjaman/Pengembalian
  let labelPeminjamanHtml = 'Peminjaman/Pengembalian'
  if (form.value.tujuan === 'peminjaman') {
    labelPeminjamanHtml = 'Peminjaman/<s>Pengembalian</s>'
  } else if (form.value.tujuan === 'pengembalian') {
    labelPeminjamanHtml = '<s>Peminjaman</s>/Pengembalian'
  }

  // Strikethrough logic for Perbaikan/Penggantian
  let labelPerbaikanHtml = 'Perbaikan/Penggantian'
  if (form.value.tujuan === 'perbaikan') {
    labelPerbaikanHtml = 'Perbaikan/<s>Penggantian</s>'
  } else if (form.value.tujuan === 'penggantian') {
    labelPerbaikanHtml = '<s>Perbaikan</s>/Penggantian'
  }

  // Check if Aset Baru or Aset Lama lists have valid selections
  const hasAsetBaru = asetBaruList.value.some((a) => a.id_aset)
  const hasAsetLama = asetLamaList.value.some((a) => a.id_aset)

  let section3Html = ''
  if (hasAsetBaru || hasAsetLama) {
    section3Html += '<h3 class="section-title">III. Daftar Data Serah Terima Aset</h3>'

    if (hasAsetBaru) {
      const maxRows = 3
      let rowsBaruHtml = ''
      const validAssetsBaru = asetBaruList.value.filter((a) => a.id_aset)
      for (let i = 0; i < maxRows; i++) {
        const asset = validAssetsBaru[i] || {}
        rowsBaruHtml += `
          <tr>
            <td style="text-align: center;">${i + 1}</td>
            <td>${escapeHtml(asset.tipe)}</td>
            <td style="text-align: center;">${asset.id_aset ? escapeHtml(asset.qty || 1) : ''}</td>
            <td>${escapeHtml(asset.spesifikasi)}</td>
          </tr>
        `
      }

      section3Html += `
        <div style="font-size: 8.5px; font-weight: bold; margin-bottom: 4px;">
          A. &nbsp; Pihak Pemberi telah memastikan bahwa seluruh aset yang diserahkan sudah melalui proses pengecekan saat diserahkan.
        </div>
        <table class="border-table">
          <thead>
            <tr>
              <th style="width: 5%; text-align: center;">No</th>
              <th style="width: 25%;">Deskripsi/Jenis Aset</th>
              <th style="width: 8%; text-align: center;">Qty</th>
              <th style="width: 62%;">Spesifikasi Merk/Tipe/Model & Nomor Serial (S/N)/Hostname</th>
            </tr>
          </thead>
          <tbody>
            ${rowsBaruHtml}
          </tbody>
        </table>
      `
    }

    if (hasAsetLama) {
      const maxRows = 3
      let rowsLamaHtml = ''
      const validAssetsLama = asetLamaList.value.filter((a) => a.id_aset)
      for (let i = 0; i < maxRows; i++) {
        const asset = validAssetsLama[i] || {}
        rowsLamaHtml += `
          <tr>
            <td style="text-align: center;">${i + 1}</td>
            <td>${escapeHtml(asset.tipe)}</td>
            <td style="text-align: center;">${asset.id_aset ? escapeHtml(asset.qty || 1) : ''}</td>
            <td>${escapeHtml(asset.spesifikasi)}</td>
          </tr>
        `
      }

      section3Html += `
        <div style="font-size: 8.5px; font-weight: bold; margin-top: 6px; margin-bottom: 4px;">
          B. &nbsp; Tabel di bawah ini diisi dengan data aset lama, apabila aktivitas serah terima disertai dengan penggantian aset.
        </div>
        <table class="border-table">
          <thead>
            <tr>
              <th style="width: 5%; text-align: center;">No</th>
              <th style="width: 25%;">Deskripsi/Jenis Aset</th>
              <th style="width: 8%; text-align: center;">Qty</th>
              <th style="width: 62%;">Spesifikasi Merk/Tipe/Model & Nomor Serial (S/N)/Hostname</th>
            </tr>
          </thead>
          <tbody>
            ${rowsLamaHtml}
          </tbody>
        </table>
      `
    }
  }

  const safeForm = Object.fromEntries(
    Object.entries(form.value).map(([key, value]) => [key, escapeHtml(value)]),
  )

  const html = ((form) => `
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <title>Formulir Serah Terima Aset Perusahaan</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 10mm 15mm;
        }
        body {
          font-family: Arial, sans-serif;
          color: #000000;
          background: #ffffff;
          margin: 0;
          padding: 0;
          font-size: 10px;
          line-height: 1.4;
        }
        .header {
          display: flex;
          align-items: center;
          position: relative;
          margin-bottom: 12px;
          padding-bottom: 8px;
        }
        .header img {
          height: 42px;
          object-fit: contain;
        }
        .header-title {
          flex: 1;
          text-align: center;
        }
        .header-title h1 {
          margin: 0;
          font-size: 16px;
          font-weight: bold;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .header-title h2 {
          margin: 4px 0 0 0;
          font-size: 14px;
          font-weight: bold;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .intro-text {
          font-size: 9px;
          margin-bottom: 10px;
        }
        h3.section-title {
          font-size: 10px;
          font-weight: bold;
          margin: 10px 0 4px 0;
          text-transform: uppercase;
        }
        table.border-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 10px;
        }
        table.border-table th, table.border-table td {
          border: 1px solid #000000;
          padding: 5px 8px;
          text-align: left;
          font-size: 9px;
        }
        table.border-table th {
          background: #ffffff;
          font-weight: bold;
        }
        .tujuan-grid {
          display: flex;
          border: 1px solid #000000;
          padding: 6px;
          margin-bottom: 10px;
          font-size: 9px;
          justify-content: space-between;
        }
        .tujuan-item {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .tujuan-box {
          display: inline-block;
          width: 11px;
          height: 11px;
          border: 1px solid #000000;
          text-align: center;
          line-height: 11px;
          font-size: 9px;
          font-weight: bold;
        }
        .ketentuan-list {
          margin: 0 0 10px 0;
          padding-left: 14px;
          font-size: 8.5px;
          text-align: justify;
        }
        .ketentuan-list li {
          margin-bottom: 5px;
        }
        .pernyataan-box {
          font-size: 8.5px;
          margin-bottom: 15px;
          text-align: justify;
        }
        .sign-date {
          font-size: 9px;
          margin-bottom: 8px;
          font-weight: bold;
        }
        table.signature-table {
          width: 100%;
          border-collapse: collapse;
        }
        table.signature-table td {
          border: 1px solid #000000;
          width: 33.33%;
          height: 80px;
          vertical-align: top;
          padding: 6px;
          font-size: 9px;
        }
        .sig-title {
          font-weight: bold;
          text-transform: uppercase;
          text-align: center;
          margin-bottom: 40px;
        }
        .sig-name {
          text-align: center;
          border-bottom: 1px solid #000000;
          margin: 0 auto;
          width: 80%;
          padding-bottom: 2px;
          font-weight: bold;
        }
        .sig-sub {
          text-align: center;
          font-size: 8px;
          color: #000000;
          margin-top: 2px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <img src="/ESB Logo.svg" alt="ESB Logo" />
        <div class="header-title">
          <h1>Formulir Serah Terima</h1>
          <h2>Aset Perusahaan</h2>
        </div>
        <div style="width: 120px;"></div> <!-- Spacer matching logo width for centering title -->
      </div>

      <div class="intro-text">
        Telah dilakukan serah terima aset milik PT Esensi Solusi Buana kepada karyawan atau pihak yang bersangkutan dengan detail sebagai berikut:
      </div>

      <h3 class="section-title">I. Profil Pihak Terkait</h3>
      <table class="border-table">
        <thead>
          <tr>
            <th style="width: 25%;">Detail</th>
            <th style="width: 37.5%;">Pihak Pemberi</th>
            <th style="width: 37.5%;">Pihak Penerima</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="font-bold">Nama Lengkap</td>
            <td>${form.value.pemberiNama}</td>
            <td>${form.value.penerimaNama || '—'}</td>
          </tr>
          <tr>
            <td class="font-bold">Direktorat</td>
            <td>${form.value.pemberiDirektorat}</td>
            <td>${form.value.penerimaDirektorat || '—'}</td>
          </tr>
        </tbody>
      </table>

      <h3 class="section-title">II. Tujuan Serah Terima Aset</h3>
      <div style="font-size: 8px; margin-bottom: 3px; font-style: italic; color: #000000;">Beri tanda centang [✓] pada kolom dan coret yang tidak sesuai.</div>
      <div class="tujuan-grid">
        <div class="tujuan-item">
          <span class="tujuan-box">${isTujuanBaru}</span>
          <span>Serah Terima Baru</span>
        </div>
        <div class="tujuan-item">
          <span class="tujuan-box">${isTujuanPeminjaman}</span>
          <span>${labelPeminjamanHtml}</span>
        </div>
        <div class="tujuan-item">
          <span class="tujuan-box">${isTujuanPerbaikan}</span>
          <span>${labelPerbaikanHtml}</span>
        </div>
        <div class="tujuan-item">
          <span class="tujuan-box">${isTujuanDisposal}</span>
          <span>Disposal</span>
        </div>
        <div class="tujuan-item">
          <span class="tujuan-box">${isTujuanLainnya}</span>
          <span>Lainnya: ${tujuanLainnyaText || '___________'}</span>
        </div>
      </div>

      ${section3Html}

      <h3 class="section-title">IV. Ketentuan Penggunaan Aset</h3>
      <div style="font-size: 8px; margin-bottom: 3px; color: #000000;">Dengan menandatangani dokumen ini, Pihak Penerima menyatakan tunduk pada kebijakan dari penggunaan aset perusahaan sebagai berikut:</div>
      <ol class="ketentuan-list">
        <li><strong>Tanggung Jawab & Pemeliharaan:</strong> Pihak Penerima bertanggung jawab penuh atas keamanan dan pemeliharaan aset, termasuk menjaga kebersihan serta kelayakan fungsinya. Segala kerusakan akibat tumpahan cairan, benturan, jatuh, kehilangan, atau kelalaian penyimpanan menjadi tanggung jawab Pihak Penerima sepenuhnya.</li>
        <li><strong>Batasan Penggunaan:</strong> Aset hanya digunakan untuk kepentingan operasional <strong>PT Esensi Solusi Buana</strong>. Pihak Penerima dilarang melakukan modifikasi terhadap perangkat fisik (hardware) maupun perangkat lunak (software) tanpa izin dari <strong>People Business Partner</strong>. Penggunaan untuk kepentingan pribadi atau pihak ketiga tanpa persetujuan merupakan pelanggaran kode etik perusahaan.</li>
        <li><strong>Pelaporan Kerusakan & Kehilangan:</strong> Jika terjadi kerusakan akibat kelalaian atau pelanggaran, maupun kehilangan, Pihak Penerima wajib melaporkan kepada Perusahaan paling lambat dalam waktu <strong>1x24 jam</strong> melalui <strong>People Business Partner</strong> terkait.. Atas kejadian tersebut, Pihak Penerima dapat dikenakan sanksi berupa biaya perbaikan, penggantian unit baru, atau penggantian senilai harga pasar aset sesuai ketentuan yang berlaku.</li>
        <li><strong>Audit & Verifikasi:</strong> Perusahaan berhak melakukan verifikasi fisik (audit) terhadap aset sewaktu-waktu untuk memastikan kondisi dan status aset tetap terjaga. Pihak Penerima dengan ini memberikan persetujuan penuh kepada Perusahaan untuk melakukan verifikasi aset sebagai bagian dari kewajiban audit.</li>
        <li><strong>Pengembalian Aset:</strong> Seluruh aset wajib dikembalikan dalam kondisi utuh dan berfungsi baik, kecuali apabila pengembalian dilakukan karena kerusakan yang mengharuskan penggantian unit. Dalam hal terjadi kerusakan, aset tetap wajib dikembalikan untuk proses verifikasi dan penggantian sesuai ketentuan. Semua aset yang masih dimiliki Pihak Penerima wajib diserahkan selambat-lambatnya pada saat berakhirnya hubungan kerja.</li>
        <li><strong>Dukungan & Hak Tarik:</strong> Pihak Pemberi memberikan dukungan teknis atas kerusakan fungsional atau alami (bukan akibat kelalaian). Selain itu, Pihak Pemberi berhak menarik kembali aset sewaktu-waktu apabila ditemukan penyalahgunaan atau terdapat kebutuhan operasional mendesak.</li>
      </ol>

      <h3 class="section-title">V. Pernyataan Dan Persetujuan</h3>
      <div class="pernyataan-box">
        Dengan menandatangani dokumen ini, Pihak Pemberi dan Pihak Penerima menyatakan bahwa seluruh informasi yang tercantum dalam formulir ini adalah benar, lengkap, serta dibuat secara sadar tanpa paksaan dari pihak manapun, dan bahwa keduanya telah membaca, memahami, menyetujui, serta bersedia mematuhi seluruh ketentuan penggunaan aset perusahaan sebagaimana tercantum pada Bagian IV.
      </div>

      <div class="sign-date">Jakarta, ${escapeHtml(formattedDate)}</div>

      <table class="signature-table">
        <tbody>
          <tr>
            <td>
              <div class="sig-title">Diserahkan Oleh</div>
              <div style="height: 50px;"></div>
              <div class="sig-name">${escapeHtml(form.value.pemberiNama)}</div>
              <div class="sig-sub">${escapeHtml(form.value.pemberiDirektorat)}</div>
            </td>
            <td>
              <div class="sig-title">Diterima Oleh</div>
              <div style="height: 50px;"></div>
              <div class="sig-name">${form.value.penerimaNama || '__________________'}</div>
              <div class="sig-sub">${form.value.penerimaDirektorat || '__________________'}</div>
            </td>
            <td>
              <div class="sig-title">Diketahui Oleh</div>
              <div style="height: 50px;"></div>
              <div class="sig-name">&nbsp;</div>
              <div class="sig-sub">People Business Partner atau Asset Management</div>
            </td>
          </tr>
        </tbody>
      </table>

    </body>
    </html>
  `)({ value: safeForm })

  return printHtmlDocument(html, 'Pop-up terblokir. Harap izinkan pop-up untuk mencetak PDF.')
}

onMounted(fetchData)
</script>

<template>
  <div class="flex min-w-0 flex-col gap-5">
    <!-- Loading Form Skeleton (Matches Serah Terima Form layout 100%) -->
    <div v-if="isLoading" role="status" aria-busy="true" class="flex flex-col gap-6 select-none">
      <!-- Section 1 Skeleton: Profil Pihak Terkait -->
      <div class="shadow-card rounded-[20px] border border-[#E8EDF3] bg-white p-5 sm:p-6">
        <div class="mb-4 flex items-center gap-2">
          <BaseSkeleton width="18px" height="18px" radius="sm" />
          <BaseSkeleton width="180px" height="16px" radius="md" />
        </div>
        <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
          <!-- Pihak Pemberi Box -->
          <div class="flex flex-col gap-4 rounded-2xl border border-[#F1F5F9] bg-[#FAFCFF] p-4">
            <BaseSkeleton width="150px" height="14px" radius="md" />
            <div class="flex flex-col gap-1.5">
              <BaseSkeleton width="100px" height="12px" radius="sm" />
              <BaseSkeleton width="100%" height="42px" radius="xl" />
            </div>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div class="flex flex-col gap-1.5">
                <BaseSkeleton width="110px" height="12px" radius="sm" />
                <BaseSkeleton width="100%" height="42px" radius="xl" />
              </div>
              <div class="flex flex-col gap-1.5">
                <BaseSkeleton width="90px" height="12px" radius="sm" />
                <BaseSkeleton width="100%" height="42px" radius="xl" />
              </div>
            </div>
          </div>

          <!-- Pihak Penerima Box -->
          <div class="flex flex-col gap-4 rounded-2xl border border-[#F1F5F9] bg-[#FAFCFF] p-4">
            <BaseSkeleton width="150px" height="14px" radius="md" />
            <div class="flex flex-col gap-1.5">
              <BaseSkeleton width="100px" height="12px" radius="sm" />
              <BaseSkeleton width="100%" height="42px" radius="xl" />
            </div>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div class="flex flex-col gap-1.5">
                <BaseSkeleton width="110px" height="12px" radius="sm" />
                <BaseSkeleton width="100%" height="42px" radius="xl" />
              </div>
              <div class="flex flex-col gap-1.5">
                <BaseSkeleton width="90px" height="12px" radius="sm" />
                <BaseSkeleton width="100%" height="42px" radius="xl" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Section 2 Skeleton: Tujuan Serah Terima Aset -->
      <div class="shadow-card rounded-[20px] border border-[#E8EDF3] bg-white p-5 sm:p-6">
        <div class="mb-4 flex items-center gap-2">
          <BaseSkeleton width="18px" height="18px" radius="sm" />
          <BaseSkeleton width="210px" height="16px" radius="md" />
        </div>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          <div
            v-for="i in 5"
            :key="'tujuan-skel-' + i"
            class="flex items-center gap-2.5 rounded-xl border border-[#F1F5F9] bg-[#FAFCFF] p-3"
          >
            <BaseSkeleton width="18px" height="18px" radius="sm" />
            <BaseSkeleton width="80px" height="13px" radius="sm" />
          </div>
        </div>
      </div>

      <!-- Section 3 Skeleton: Daftar Data Serah Terima Aset -->
      <div class="shadow-card rounded-[20px] border border-[#E8EDF3] bg-white p-5 sm:p-6">
        <div class="mb-4 flex items-center gap-2">
          <BaseSkeleton width="18px" height="18px" radius="sm" />
          <BaseSkeleton width="240px" height="16px" radius="md" />
        </div>
        <div class="flex flex-col gap-3">
          <BaseSkeleton width="100%" height="48px" radius="xl" />
          <BaseSkeleton width="100%" height="48px" radius="xl" />
        </div>
      </div>
    </div>

    <div
      v-else-if="pageError"
      role="alert"
      class="shadow-card flex items-center gap-2 rounded-[20px] border border-red-200 bg-red-50 px-5 py-4 text-[13px] text-red-700"
    >
      <span class="material-symbols-outlined text-[18px]">error</span>
      <span class="flex-1">{{ pageError }}</span>
      <button type="button" class="font-bold underline hover:text-red-900" @click="fetchData">
        Coba lagi
      </button>
    </div>

    <form v-else class="flex flex-col gap-6" @submit.prevent="generatePdf">
      <!-- Section 1: Profil Pihak Terkait -->
      <div
        class="submission-section shadow-card rounded-[20px] border border-[#E8EDF3] bg-white p-5 sm:p-6"
      >
        <h3 class="mb-4 text-[14px] font-extrabold text-[#172033] flex items-center gap-2">
          <span class="material-symbols-outlined text-brand">assignment_ind</span>
          I. Profil Pihak Terkait
        </h3>

        <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
          <!-- Pihak Pemberi -->
          <div class="flex flex-col gap-4 rounded-2xl border border-[#F1F5F9] bg-[#FAFCFF] p-4">
            <h4 class="text-[11px] font-bold uppercase tracking-wider text-brand">
              Pihak Pemberi (Karyawan)
            </h4>
            <label class="flex flex-col gap-1.5">
              <span class="text-[10px] font-bold uppercase text-[#475569]">Pilih Karyawan *</span>
              <SearchableSelect
                v-model="form.pemberiNik"
                :options="employees"
                value-key="nik"
                label-key="nama_karyawan"
                secondary-label-key="nik"
                placeholder="Pilih karyawan pemberi"
                search-placeholder="Cari nama atau NIK..."
              />
            </label>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label class="flex flex-col gap-1.5">
                <span class="text-[10px] font-bold uppercase text-[#475569]"
                  >Nama Lengkap (Auto)</span
                >
                <input
                  v-model="form.pemberiNama"
                  required
                  type="text"
                  class="form-control bg-slate-50 text-[#64748B]"
                  readonly
                />
              </label>
              <label class="flex flex-col gap-1.5">
                <span class="text-[10px] font-bold uppercase text-[#475569]"
                  >Direktorat (Auto)</span
                >
                <input
                  v-model="form.pemberiDirektorat"
                  required
                  type="text"
                  class="form-control bg-slate-50 text-[#64748B]"
                  readonly
                />
              </label>
            </div>
          </div>

          <!-- Pihak Penerima -->
          <div class="flex flex-col gap-4 rounded-2xl border border-[#F1F5F9] bg-[#FAFCFF] p-4">
            <div class="flex items-center justify-between">
              <h4 class="text-[11px] font-bold uppercase tracking-wider text-brand-orange">
                Pihak Penerima
              </h4>
              <label class="flex items-center gap-1.5 cursor-pointer">
                <input
                  v-model="form.isPenerimaLainnya"
                  type="checkbox"
                  class="rounded border-[#DCE3EC] accent-brand-orange h-3.5 w-3.5"
                />
                <span class="text-[10px] font-bold text-[#475569]"
                  >Non-Karyawan (Vendor/Lainnya)</span
                >
              </label>
            </div>

            <label v-if="!form.isPenerimaLainnya" class="flex flex-col gap-1.5">
              <span class="text-[10px] font-bold uppercase text-[#475569]">Pilih Karyawan *</span>
              <SearchableSelect
                v-model="form.penerimaNik"
                :options="employees"
                value-key="nik"
                label-key="nama_karyawan"
                secondary-label-key="nik"
                placeholder="Pilih karyawan penerima"
                search-placeholder="Cari nama atau NIK..."
              />
            </label>
            <div v-else class="flex flex-col gap-1.5">
              <span class="text-[10px] font-bold uppercase text-[#475569]"
                >Nama Lengkap / Vendor *</span
              >
              <input
                v-model="form.penerimaNama"
                required
                type="text"
                class="form-control"
                placeholder="Tulis nama lengkap penerima/vendor"
              />
            </div>

            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label v-if="!form.isPenerimaLainnya" class="flex flex-col gap-1.5">
                <span class="text-[10px] font-bold uppercase text-[#475569]"
                  >Nama Lengkap (Auto)</span
                >
                <input
                  v-model="form.penerimaNama"
                  required
                  type="text"
                  class="form-control bg-slate-50 text-[#64748B]"
                  readonly
                />
              </label>
              <label
                class="flex flex-col gap-1.5"
                :class="form.isPenerimaLainnya ? 'col-span-2' : ''"
              >
                <span class="text-[10px] font-bold uppercase text-[#475569]">{{
                  form.isPenerimaLainnya ? 'Direktorat / Perusahaan *' : 'Direktorat (Auto)'
                }}</span>
                <input
                  v-model="form.penerimaDirektorat"
                  required
                  type="text"
                  class="form-control"
                  :class="!form.isPenerimaLainnya ? 'bg-slate-50 text-[#64748B]' : ''"
                  :readonly="!form.isPenerimaLainnya"
                  placeholder="Tulis direktorat/departemen/perusahaan"
                />
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- Section 2: Tujuan Serah Terima -->
      <div
        class="submission-section shadow-card rounded-[20px] border border-[#E8EDF3] bg-white p-5 sm:p-6"
      >
        <h3 class="mb-4 text-[14px] font-extrabold text-[#172033] flex items-center gap-2">
          <span class="material-symbols-outlined text-brand">checklist</span>
          II. Tujuan Serah Terima Aset
        </h3>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label
            v-for="t in [
              { key: 'baru', label: 'Serah Terima Baru' },
              { key: 'peminjaman', label: 'Peminjaman' },
              { key: 'pengembalian', label: 'Pengembalian' },
              { key: 'perbaikan', label: 'Perbaikan' },
              { key: 'penggantian', label: 'Penggantian' },
              { key: 'disposal', label: 'Disposal Aset' },
              { key: 'lainnya', label: 'Lainnya' },
            ]"
            :key="t.key"
            class="flex cursor-pointer items-center justify-between rounded-xl border p-3 transition-colors"
            :class="
              form.tujuan === t.key
                ? 'border-brand bg-brand-light'
                : 'border-[#DCE3EC] bg-white hover:bg-[#F8FAFC]'
            "
          >
            <span class="text-[11px] font-bold text-[#334155]">{{ t.label }}</span>
            <input
              v-model="form.tujuan"
              type="radio"
              name="tujuan"
              :value="t.key"
              class="accent-brand"
            />
          </label>
        </div>

        <div v-if="form.tujuan === 'lainnya'" class="mt-4 flex flex-col gap-1.5">
          <label class="flex flex-col gap-1.5">
            <span class="text-[10px] font-bold uppercase text-[#475569]">Keterangan Lainnya *</span>
            <input
              v-model="form.tujuanLainnya"
              required
              type="text"
              class="form-control"
              placeholder="Tuliskan tujuan serah terima aset lainnya"
            />
          </label>
        </div>
      </div>

      <!-- Section 3: Daftar Data Serah Terima Aset (Baru & Lama) -->
      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <!-- Aset Baru -->
        <div class="shadow-card rounded-[20px] border border-[#E8EDF3] bg-white p-5 sm:p-6">
          <div class="mb-4 flex items-center justify-between">
            <h3 class="text-[14px] font-extrabold text-[#172033] flex items-center gap-2">
              <span class="material-symbols-outlined text-brand">add_box</span>
              III. Aset Baru (Diserahkan)
            </h3>
            <button
              type="button"
              @click="addAssetBaruRow"
              class="flex h-7 items-center justify-center gap-1 rounded-lg bg-brand px-3 text-[10px] font-bold text-white hover:bg-brand-dark"
            >
              + Tambah
            </button>
          </div>

          <div class="flex flex-col gap-4">
            <div
              v-for="(row, index) in asetBaruList"
              :key="index"
              class="flex flex-col gap-3 rounded-2xl border border-[#F1F5F9] bg-[#FAFCFF] p-4 relative"
            >
              <button
                v-if="asetBaruList.length > 1"
                type="button"
                @click="removeAssetBaruRow(index)"
                class="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
                title="Hapus baris"
              >
                <span class="material-symbols-outlined text-[16px]">close</span>
              </button>

              <label class="flex flex-col gap-1.5">
                <span
                  class="text-[10px] font-bold uppercase text-[#475569]"
                  :class="{ 'pr-8': asetBaruList.length > 1 }"
                  >Aset IT *</span
                >
                <SearchableSelect
                  v-model="row.id_aset"
                  :options="assets"
                  value-key="id_aset"
                  label-key="label_aset"
                  secondary-label-key="nomor_seri"
                  placeholder="Pilih Aset IT"
                  search-placeholder="Cari label atau serial..."
                  @update:model-value="onAssetBaruSelect(index, $event)"
                />
              </label>

              <div class="grid grid-cols-3 gap-2">
                <label class="flex flex-col gap-1.5 col-span-2">
                  <span class="text-[9px] font-bold uppercase text-[#64748B]"
                    >Deskripsi (Auto)</span
                  >
                  <input
                    v-model="row.tipe"
                    type="text"
                    class="form-control h-8 bg-slate-50 text-[#64748B] text-[11px]"
                    readonly
                  />
                </label>
                <label class="flex flex-col gap-1.5">
                  <span class="text-[9px] font-bold uppercase text-[#64748B]">Qty</span>
                  <input
                    v-model="row.qty"
                    required
                    type="number"
                    min="1"
                    class="form-control h-8 text-[11px]"
                  />
                </label>
              </div>

              <label class="flex flex-col gap-1.5">
                <span class="text-[9px] font-bold uppercase text-[#64748B]"
                  >Spesifikasi (Auto)</span
                >
                <input
                  v-model="row.spesifikasi"
                  type="text"
                  class="form-control h-8 bg-slate-50 text-[#64748B] text-[11px]"
                  readonly
                />
              </label>
            </div>
          </div>
        </div>

        <!-- Aset Lama -->
        <div class="shadow-card rounded-[20px] border border-[#E8EDF3] bg-white p-5 sm:p-6">
          <div class="mb-4 flex items-center justify-between">
            <h3 class="text-[14px] font-extrabold text-[#172033] flex items-center gap-2">
              <span class="material-symbols-outlined text-brand">history</span>
              IV. Aset Lama (Dikembalikan)
            </h3>
            <button
              type="button"
              @click="addAssetLamaRow"
              class="flex h-7 items-center justify-center gap-1 rounded-lg bg-brand-dark px-3 text-[10px] font-bold text-white hover:bg-black"
            >
              + Tambah
            </button>
          </div>

          <div class="flex flex-col gap-4">
            <div
              v-for="(row, index) in asetLamaList"
              :key="index"
              class="flex flex-col gap-3 rounded-2xl border border-[#F1F5F9] bg-[#FAFCFF] p-4 relative"
            >
              <button
                v-if="asetLamaList.length > 1"
                type="button"
                @click="removeAssetLamaRow(index)"
                class="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
                title="Hapus baris"
              >
                <span class="material-symbols-outlined text-[16px]">close</span>
              </button>

              <label class="flex flex-col gap-1.5">
                <span
                  class="text-[10px] font-bold uppercase text-[#475569]"
                  :class="{ 'pr-8': asetLamaList.length > 1 }"
                  >Aset Lama (Opsional)</span
                >
                <SearchableSelect
                  v-model="row.id_aset"
                  :options="assets"
                  value-key="id_aset"
                  label-key="label_aset"
                  secondary-label-key="nomor_seri"
                  placeholder="Pilih Aset IT Lama"
                  search-placeholder="Cari label atau serial..."
                  @update:model-value="onAssetLamaSelect(index, $event)"
                />
              </label>

              <div class="grid grid-cols-3 gap-2">
                <label class="flex flex-col gap-1.5 col-span-2">
                  <span class="text-[9px] font-bold uppercase text-[#64748B]"
                    >Deskripsi (Auto)</span
                  >
                  <input
                    v-model="row.tipe"
                    type="text"
                    class="form-control h-8 bg-slate-50 text-[#64748B] text-[11px]"
                    readonly
                  />
                </label>
                <label class="flex flex-col gap-1.5">
                  <span class="text-[9px] font-bold uppercase text-[#64748B]">Qty</span>
                  <input
                    v-model="row.qty"
                    required
                    type="number"
                    min="1"
                    class="form-control h-8 text-[11px]"
                  />
                </label>
              </div>

              <label class="flex flex-col gap-1.5">
                <span class="text-[9px] font-bold uppercase text-[#64748B]"
                  >Spesifikasi (Auto)</span
                >
                <input
                  v-model="row.spesifikasi"
                  type="text"
                  class="form-control h-8 bg-slate-50 text-[#64748B] text-[11px]"
                  readonly
                />
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- Action Footer -->
      <div
        class="shadow-card flex flex-wrap items-center justify-between gap-4 rounded-[20px] border border-[#E8EDF3] bg-white p-4"
      >
        <label class="flex items-center gap-3">
          <span class="text-[11px] font-bold uppercase tracking-wider text-[#374151]"
            >Tanggal Formulir:</span
          >
          <input v-model="form.tanggal" required type="date" class="form-control w-44" />
        </label>
        <button
          type="submit"
          class="flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-6 text-[12px] font-bold text-white shadow-md shadow-brand/20 hover:bg-brand-dark"
        >
          <span class="material-symbols-outlined text-[20px]">picture_as_pdf</span>
          Cetak Formulir Serah Terima (PDF)
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.form-control {
  height: 2.625rem;
  border: 1px solid #dce3ec;
  border-radius: 0.75rem;
  background: #ffffff;
  padding-left: 0.75rem;
  padding-right: 0.75rem;
  font-size: 0.6875rem;
  color: #334155;
  outline: none;
}
.form-control:focus {
  border-color: var(--color-brand);
  box-shadow: 0 0 0 3px rgb(9 124 222 / 10%);
}
</style>
