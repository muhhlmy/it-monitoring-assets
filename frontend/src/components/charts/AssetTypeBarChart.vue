<script setup>
import { computed } from 'vue'
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
import { useChartTheme } from '@/composables/useChartTheme'
import BaseChartCard from './BaseChartCard.vue'

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale)

const props = defineProps({
  data: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
})

const { chartColors, palette } = useChartTheme()

const isEmpty = computed(() => !props.data || props.data.length === 0)

const chartData = computed(() => ({
  labels: props.data.map((d) => d.device_type || d.tipe || d.type || 'Tanpa Tipe'),
  datasets: [
    {
      label: 'Jumlah Unit',
      data: props.data.map((d) => Number(d.count) || 0),
      backgroundColor: palette,
      borderRadius: 8,
      borderSkipped: false,
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
        label: (ctx) => ` ${ctx.parsed.y} Unit`,
      },
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: {
        color: chartColors.mutedText,
        font: { family: "'Plus Jakarta Sans', sans-serif", size: 11, weight: '600' },
      },
    },
    y: {
      beginAtZero: true,
      grid: { color: chartColors.gridLine },
      ticks: { color: chartColors.mutedText, precision: 0 },
    },
  },
}))
</script>

<template>
  <BaseChartCard
    title="Sebaran Aset Berdasarkan Tipe"
    subtitle="Distribusi perangkat berdasarkan jenis (Laptop, Server, Printer, dll)"
    :loading="loading"
    :empty="isEmpty"
    :error="error"
  >
    <div class="h-full w-full">
      <Bar :data="chartData" :options="chartOptions" />
    </div>
  </BaseChartCard>
</template>
