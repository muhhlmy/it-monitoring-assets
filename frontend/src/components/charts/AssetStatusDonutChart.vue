<script setup>
import { computed } from 'vue'
import { Doughnut } from 'vue-chartjs'
import { Chart as ChartJS, Title, Tooltip, Legend, ArcElement } from 'chart.js'
import { useChartTheme } from '@/composables/useChartTheme'
import BaseChartCard from './BaseChartCard.vue'

ChartJS.register(Title, Tooltip, Legend, ArcElement)

const props = defineProps({
  data:    { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error:   { type: String, default: '' },
})

const { chartColors, commonOptions } = useChartTheme()

const isEmpty = computed(() => !props.data || props.data.length === 0)

const statusColorMap = {
  digunakan: '#13DEB9',
  tersedia: '#49BEFF',
  maintenance: '#FFAE1F',
  rusak: '#FA896B',
  disposal: '#64748B',
}

const chartData = computed(() => {
  const labels = props.data.map((d) => d.status || 'Belum ditentukan')
  const bgColors = props.data.map((d) => {
    const key = (d.status || '').toLowerCase()
    return statusColorMap[key] || chartColors.gray
  })

  return {
    labels,
    datasets: [
      {
        data: props.data.map((d) => Number(d.count) || 0),
        backgroundColor: bgColors,
        borderWidth: 3,
        borderColor: '#FFFFFF',
        hoverOffset: 6,
      },
    ],
  }
})

const chartOptions = computed(() => ({
  ...commonOptions,
  cutout: '70%',
  plugins: {
    ...commonOptions.plugins,
    tooltip: {
      callbacks: {
        label: (ctx) => ` ${ctx.label}: ${ctx.parsed} Unit`,
      },
    },
  },
}))

const totalUnits = computed(() =>
  props.data.reduce((acc, curr) => acc + (Number(curr.count) || 0), 0)
)
</script>

<template>
  <BaseChartCard
    title="Status Operasional Aset"
    subtitle="Proporsi aset berdasarkan status operasional (Digunakan, Tersedia, dll)"
    :loading="loading"
    :empty="isEmpty"
    :error="error"
  >
    <div class="relative h-full w-full flex items-center justify-center">
      <Doughnut :data="chartData" :options="chartOptions" />
      <div class="pointer-events-none absolute flex flex-col items-center justify-center text-center pb-6">
        <span class="text-[24px] font-black text-[#2A3547] font-num leading-none">{{ totalUnits }}</span>
        <span class="text-[10px] font-bold text-[#7C8BAC] uppercase tracking-wider mt-0.5">Total Unit</span>
      </div>
    </div>
  </BaseChartCard>
</template>
