import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const lineChartUrl = new URL('../src/components/charts/AssetTrendLineChart.vue', import.meta.url)
const pieChartUrl = new URL('../src/components/charts/AssetConditionPieChart.vue', import.meta.url)
const dashboardUrl = new URL('../src/views/DashboardView.vue', import.meta.url)

test('AssetTrendLineChart maps labels and count/added flexibly', async () => {
  const source = await readFile(lineChartUrl, 'utf8')
  assert.match(source, /labels:\s*props\.data\.map\(\(d\)\s*=>\s*d\.label\s*\|\|\s*d\.month\s*\|\|\s*d\.period/)
  assert.match(source, /data:\s*props\.data\.map\(\(d\)\s*=>\s*\(d\.added\s*!==\s*undefined\s*\?\s*d\.added\s*:\s*d\.count/)
})

test('AssetConditionPieChart defines distinct colors for all 5 asset conditions', async () => {
  const source = await readFile(pieChartUrl, 'utf8')
  assert.match(source, /baru:\s*'#13DEB9'/)
  assert.match(source, /normal:\s*'#5D87FF'/)
  assert.match(source, /'rusak ringan':\s*'#FFAE1F'/)
  assert.match(source, /'rusak sedang':\s*'#E855A2'/)
  assert.match(source, /'rusak berat':\s*'#FA896B'/)
})

test('DashboardView status helpers include Dalam Perawatan and proper colors', async () => {
  const source = await readFile(dashboardUrl, 'utf8')
  assert.match(source, /'dalam perawatan':\s*\{\s*status:\s*'Dalam Perawatan'/)
  assert.match(source, /\['dalam perawatan',\s*'maintenance',\s*'in service'\]\.includes\(s\)/)
})
