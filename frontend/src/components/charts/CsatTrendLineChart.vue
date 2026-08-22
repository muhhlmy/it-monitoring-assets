<script setup>
// ============================================================
// CsatTrendLineChart.vue — Line chart tren rata-rata CSAT per bulan.
// Mengikuti pola AssetTrendLineChart.vue (Line + Filler, BaseChartCard).
// ============================================================
import { computed } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Filler,
} from 'chart.js'
import { useChartTheme } from '@/composables/useChartTheme'
import BaseChartCard from './BaseChartCard.vue'

ChartJS.register(
  Title,
  Tooltip,
  Legend,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Filler,
)

const props = defineProps({
  data: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
})

const { chartColors } = useChartTheme()

const isEmpty = computed(() => !props.data || props.data.length === 0)

const chartData = computed(() => ({
  labels: props.data.map((d) => d.period),
  datasets: [
    {
      label: 'Rata-rata CSAT',
      data: props.data.map((d) => d.averageRating || 0),
      borderColor: chartColors.warning,
      backgroundColor: 'rgba(255, 174, 31, 0.10)',
      borderWidth: 3,
      pointRadius: 5,
      pointHoverRadius: 7,
      pointBackgroundColor: '#FFFFFF',
      pointBorderColor: chartColors.warning,
      pointBorderWidth: 2,
      fill: true,
      tension: 0.35,
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
        title: (items) => items[0]?.label || '',
        label: (context) => {
          const rating = context.parsed.y.toFixed(1)
          const idx = context.dataIndex
          const total = props.data[idx]?.totalRatings || 0
          return ` ⭐ ${rating} / 5.0  (${total} ulasan)`
        },
      },
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: {
        color: chartColors.mutedText,
        font: { family: "'Plus Jakarta Sans', sans-serif", size: 11 },
      },
    },
    y: {
      min: 0,
      max: 5,
      grid: { color: chartColors.gridLine },
      ticks: {
        color: chartColors.mutedText,
        font: { family: "'Plus Jakarta Sans', sans-serif", size: 11 },
        stepSize: 1,
        callback: (value) => `${value} ★`,
      },
    },
  },
}))
</script>

<template>
  <BaseChartCard
    title="Tren Kepuasan Bulanan"
    subtitle="Rata-rata CSAT per bulan (6 Bulan Terakhir)"
    :loading="loading"
    :empty="isEmpty"
    :error="error"
  >
    <div class="h-full w-full">
      <Line :data="chartData" :options="chartOptions" aria-label="Line chart showing CSAT trend over time" />
    </div>
  </BaseChartCard>
</template>
