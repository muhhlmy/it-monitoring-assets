<script setup>
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
  labels: props.data.map((d) => d.label || d.period),
  datasets: [
    {
      label: 'Penambahan Aset IT',
      data: props.data.map((d) => d.added || 0),
      borderColor: chartColors.primary,
      backgroundColor: chartColors.primaryLight,
      borderWidth: 3,
      pointRadius: 4,
      pointHoverRadius: 6,
      pointBackgroundColor: '#FFFFFF',
      pointBorderColor: chartColors.primary,
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
        label: (context) => ` +${context.parsed.y} Unit Aset`,
      },
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: {
        color: chartColors.mutedText,
        font: { family: "'Plus Jakarta Sans', sans-serif", size: 10 },
      },
    },
    y: {
      beginAtZero: true,
      grid: { color: chartColors.gridLine },
      ticks: {
        color: chartColors.mutedText,
        font: { family: "'Plus Jakarta Sans', sans-serif", size: 10 },
        precision: 0,
      },
    },
  },
}))
</script>

<template>
  <BaseChartCard
    title="Tren Penambahan Aset IT"
    subtitle="Jumlah unit aset baru terdaftar per bulan (12 Bulan Terakhir)"
    :loading="loading"
    :empty="isEmpty"
    :error="error"
  >
    <div class="h-full w-full">
      <Line :data="chartData" :options="chartOptions" />
    </div>
  </BaseChartCard>
</template>
