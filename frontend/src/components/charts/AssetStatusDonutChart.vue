<script setup>
import { computed } from 'vue'
import { Doughnut } from 'vue-chartjs'
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
  props.data.reduce((acc, curr) => acc + (Number(curr.count) || 0), 0),
)

const centerTextPlugin = {
  id: 'centerText',
  afterDraw(chart) {
    const meta = chart.getDatasetMeta(0)
    if (!meta || !meta.data || !meta.data[0]) return

    const { ctx } = chart
    const x = meta.data[0].x
    const y = meta.data[0].y

    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // Teks angka total unit (mis. 13)
    ctx.font = '800 26px "Plus Jakarta Sans", sans-serif'
    ctx.fillStyle = '#2A3547'
    ctx.fillText(String(totalUnits.value), x, y - 8)

    // Teks label "TOTAL UNIT"
    ctx.font = '700 10px "Plus Jakarta Sans", sans-serif'
    ctx.fillStyle = '#7C8BAC'
    ctx.fillText('TOTAL UNIT', x, y + 14)

    ctx.restore()
  },
}
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
      <Doughnut :data="chartData" :options="chartOptions" :plugins="[centerTextPlugin]" aria-label="Donut chart showing asset status distribution" />
    </div>
  </BaseChartCard>
</template>
