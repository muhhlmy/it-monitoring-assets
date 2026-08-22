<script setup>
import { computed } from 'vue'
import { Pie } from 'vue-chartjs'
import { Chart as ChartJS, Title, Tooltip, Legend, ArcElement } from 'chart.js'
import { useChartTheme } from '@/composables/useChartTheme'
import BaseChartCard from './BaseChartCard.vue'

ChartJS.register(Title, Tooltip, Legend, ArcElement)

const props = defineProps({
  data: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
})

const { chartColors, commonOptions } = useChartTheme()

const isEmpty = computed(() => !props.data || props.data.length === 0)

const conditionColorMap = {
  baru: '#13DEB9',
  normal: '#5D87FF',
  baik: '#5D87FF',
  'rusak ringan': '#FFAE1F',
  'rusak sedang': '#E855A2',
  'rusak berat': '#FA896B',
  rusak: '#FA896B',
}

const chartData = computed(() => {
  const labels = props.data.map((d) => d.condition || 'Tidak diketahui')
  const bgColors = props.data.map((d) => {
    const key = (d.condition || '').toLowerCase()
    return conditionColorMap[key] || chartColors.gray
  })

  return {
    labels,
    datasets: [
      {
        data: props.data.map((d) => Number(d.count) || 0),
        backgroundColor: bgColors,
        borderWidth: 2,
        borderColor: '#FFFFFF',
      },
    ],
  }
})

const chartOptions = computed(() => ({
  ...commonOptions,
  plugins: {
    ...commonOptions.plugins,
    tooltip: {
      callbacks: {
        label: (ctx) => ` ${ctx.label}: ${ctx.parsed} Unit`,
      },
    },
  },
}))
</script>

<template>
  <BaseChartCard
    title="Kondisi Fisik Aset"
    subtitle="Persentase kondisi kesehatan fisik seluruh perangkat"
    :loading="loading"
    :empty="isEmpty"
    :error="error"
  >
    <div class="h-full w-full">
      <Pie :data="chartData" :options="chartOptions" aria-label="Pie chart showing asset condition distribution" />
    </div>
  </BaseChartCard>
</template>
