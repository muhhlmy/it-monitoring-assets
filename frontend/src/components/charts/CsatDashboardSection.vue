<script setup>
// ============================================================
// CsatDashboardSection.vue — Section CSAT/CASP di dashboard.
// Kartu rata-rata kepuasan + Bar chart distribusi + Line chart CSAT per bulan.
// ============================================================
import { computed, onMounted, ref } from 'vue'
import { Bar } from 'vue-chartjs'
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale,
} from 'chart.js'
import { useApi } from '@/composables/useApi'
import { useChartTheme } from '@/composables/useChartTheme'
import CsatStars from '../tickets/CsatStars.vue'
import CsatTrendLineChart from './CsatTrendLineChart.vue'

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale)

const { get } = useApi()
const { chartColors } = useChartTheme()

const stats = ref({ averageRating: 0, totalRatings: 0, distribution: [] })
const trendData = ref([])
const isLoading = ref(true)
const isTrendLoading = ref(true)
const error = ref('')
const trendError = ref('')

const isEmpty = computed(() => stats.value.totalRatings === 0)

// Label deskriptif untuk rata-rata.
const ratingLabel = computed(() => {
  const avg = stats.value.averageRating
  if (avg >= 4.5) return 'Sangat Puas'
  if (avg >= 3.5) return 'Puas'
  if (avg >= 2.5) return 'Cukup'
  if (avg >= 1.5) return 'Tidak Puas'
  if (avg > 0) return 'Sangat Tidak Puas'
  return 'Belum ada penilaian'
})

// Warna tiap bar: gradasi dari merah (rating 1) ke hijau (rating 5).
const barColors = ['#EF4444', '#FA896B', '#FFAE1F', '#84CC16', '#13DEB9']
const ratingLabels = { 1: 'Sangat Tidak Puas', 2: 'Tidak Puas', 3: 'Cukup', 4: 'Puas', 5: 'Sangat Puas' }

const chartData = computed(() => ({
  labels: stats.value.distribution.map(d => `${d.rating}★`),
  datasets: [
    {
      label: 'Jumlah Penilaian',
      data: stats.value.distribution.map(d => d.count),
      backgroundColor: barColors,
      borderRadius: 8,
      borderSkipped: false,
      maxBarThickness: 60,
    },
  ],
}))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#1E293B',
      padding: 10,
      cornerRadius: 8,
      callbacks: {
        title: (items) => {
          const r = Number(String(items[0].label).replace('★', ''))
          return `${r} Bintang — ${ratingLabels[r] || ''}`
        },
        label: (ctx) => ` ${ctx.parsed.y} penilaian`,
      },
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: chartColors.mutedText, font: { family: "'Plus Jakarta Sans', sans-serif", size: 12, weight: '700' } },
    },
    y: {
      beginAtZero: true,
      grid: { color: chartColors.gridLine },
      ticks: { color: chartColors.mutedText, precision: 0 },
    },
  },
}))

async function fetchStats() {
  isLoading.value = true
  error.value = ''
  try {
    const data = await get('/api/tickets/casp/stats')
    stats.value = {
      averageRating: Number(data?.averageRating) || 0,
      totalRatings: Number(data?.totalRatings) || 0,
      distribution: Array.isArray(data?.distribution) ? data.distribution : [],
    }
  } catch (e) {
    error.value = 'Gagal memuat data CSAT.'
    console.error(e)
  } finally {
    isLoading.value = false
  }
}

async function fetchTrend() {
  isTrendLoading.value = true
  trendError.value = ''
  try {
    const data = await get('/api/tickets/casp/trend')
    trendData.value = Array.isArray(data) ? data : []
  } catch (e) {
    trendError.value = 'Gagal memuat tren CSAT bulanan.'
    console.error(e)
  } finally {
    isTrendLoading.value = false
  }
}

onMounted(() => {
  fetchStats()
  fetchTrend()
})
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- Header CSAT Section -->
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-[17px] font-extrabold text-[#2A3547] leading-tight">Kepuasan Pelanggan (CSAT Monitoring)</h3>
        <p class="text-[12px] font-medium text-[#7C8BAC] mt-0.5">Analisis skor CSAT perbulan dan sebaran ulasan penyelesaian tiket</p>
      </div>
      <span class="inline-flex items-center gap-1.5 rounded-full bg-[#FEF3C7] px-3.5 py-1 text-[11px] font-bold text-[#FFAE1F]">
        <span class="material-symbols-outlined text-[15px] fill-1">star</span>
        CSAT Analytics
      </span>
    </div>

    <!-- Row 1: Kartu Rata-rata CSAT + Bar Chart Distribusi -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <!-- Kartu Rata-rata CSAT -->
      <div class="shadow-card rounded-2xl border border-[#E5EAEF] bg-white p-6 lg:col-span-5 flex flex-col justify-between">
        <div class="flex items-center justify-between pb-3 border-b border-[#F1F5F9]">
          <div>
            <h3 class="text-[15px] font-extrabold text-[#2A3547] leading-tight">Rata-rata Kepuasan (CSAT)</h3>
            <p class="text-[11px] font-medium text-[#7C8BAC] mt-0.5">Penilaian pelapor terhadap penyelesaian tiket</p>
          </div>
          <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FEF3C7] text-[#FFAE1F]">
            <span class="material-symbols-outlined text-[20px] fill-1">star</span>
          </span>
        </div>

        <!-- Loading -->
        <div v-if="isLoading" class="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-[#7C8BAC]">
          <div class="h-8 w-8 animate-spin rounded-full border-3 border-[#E5EAEF] border-t-[#FFAE1F]"></div>
          <span class="text-[12px] font-medium">Memuat data CSAT...</span>
        </div>

        <!-- Error -->
        <div v-else-if="error" class="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-[#FA896B]">
          <span class="material-symbols-outlined text-[28px]">error</span>
          <p class="text-[12px] font-semibold">{{ error }}</p>
          <button type="button" class="mt-1 rounded-lg bg-[#FDEDE8] px-3 py-1.5 text-[11px] font-bold text-[#FA896B] hover:bg-[#FA896B] hover:text-white transition-all" @click="fetchStats">Coba lagi</button>
        </div>

        <!-- Empty -->
        <div v-else-if="isEmpty" class="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-[#94A3B8]">
          <span class="material-symbols-outlined text-[34px]">reviews</span>
          <p class="text-[12px] font-semibold text-center">Belum ada penilaian CSAT.<br />Penilaian muncul setelah tiket di-resolve.</p>
        </div>

        <!-- Content -->
        <div v-else class="flex flex-1 flex-col justify-center">
          <div class="flex items-end gap-2 mt-4">
            <p class="font-num text-[44px] font-black leading-none text-[#2A3547]">{{ stats.averageRating.toFixed(1) }}</p>
            <p class="mb-1 text-[14px] font-bold text-[#7C8BAC]">/ 5.0</p>
          </div>
          <div class="mt-2">
            <CsatStars :value="stats.averageRating" size="26px" />
          </div>
          <div class="mt-3 flex items-center gap-2">
            <span class="inline-flex items-center rounded-full bg-[#ECFDF5] px-2.5 py-1 text-[11px] font-bold text-[#13DEB9]">
              {{ ratingLabel }}
            </span>
            <span class="text-[11px] font-medium text-[#7C8BAC]">{{ stats.totalRatings }} total ulasan</span>
          </div>
        </div>
      </div>

      <!-- Bar Chart Distribusi Rating -->
      <div class="shadow-card flex flex-col rounded-2xl border border-[#E5EAEF] bg-white p-5 lg:col-span-7">
        <div class="flex items-center justify-between pb-3 border-b border-[#F1F5F9] mb-4">
          <div>
            <h3 class="text-[15px] font-extrabold text-[#2A3547] leading-tight">Distribusi Penilaian</h3>
            <p class="text-[11px] font-medium text-[#7C8BAC] mt-0.5">Sebaran jumlah ulasan per tingkat bintang</p>
          </div>
        </div>

        <div class="relative flex-1 min-h-[260px] flex items-center justify-center">
          <!-- Loading Skeleton -->
          <div v-if="isLoading" class="flex flex-col items-center gap-2 text-[#7C8BAC]">
            <div class="h-8 w-8 animate-spin rounded-full border-3 border-[#E5EAEF] border-t-[#5D87FF]"></div>
            <span class="text-[12px] font-medium">Memuat data grafik...</span>
          </div>

          <!-- Error State -->
          <div v-else-if="error" class="flex flex-col items-center gap-2 text-[#FA896B] p-4 text-center">
            <span class="material-symbols-outlined text-[32px]">error</span>
            <p class="text-[12px] font-semibold">{{ error }}</p>
          </div>

          <!-- Empty State -->
          <div v-else-if="isEmpty" class="flex flex-col items-center gap-2 text-[#94A3B8] p-4 text-center">
            <span class="material-symbols-outlined text-[36px]">bar_chart_off</span>
            <p class="text-[12px] font-semibold">Belum ada data visualisasi.</p>
          </div>

          <!-- Chart -->
          <div v-else class="h-full w-full">
            <Bar :data="chartData" :options="chartOptions" />
          </div>
        </div>
      </div>
    </div>

    <!-- Row 2: Line Chart CSAT Monitoring Perbulan -->
    <div class="min-h-[300px]">
      <CsatTrendLineChart
        :data="trendData"
        :loading="isTrendLoading"
        :error="trendError"
      />
    </div>
  </div>
</template>
