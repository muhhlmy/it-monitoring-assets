import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const routerSourceUrl = new URL('../src/router/index.js', import.meta.url)
const headerSourceUrl = new URL('../src/components/layout/AppHeader.vue', import.meta.url)

test('Router config defines meta.title and meta.subtitle for all named routes', async () => {
  const routerSource = await readFile(routerSourceUrl, 'utf8')
  
  const expectedRoutes = [
    { path: '/', title: 'Dashboard', subtitle: 'Overview & analytics' },
    { path: '/assets', title: 'Aset IT', subtitle: 'Inventaris & status perangkat' },
    { path: '/assets-ga', title: 'Aset GA', subtitle: 'Kelola aset GA' },
    { path: '/assets-ops', title: 'Aset Ops', subtitle: 'Kelola aset operasional' },
    { path: '/my-assets', title: 'Aset Karyawan', subtitle: 'Kelola aset karyawan' },
    { path: '/karyawan', title: 'Karyawan', subtitle: 'Kelola data karyawan' },
    { path: '/tickets', title: 'Tiket', subtitle: 'Kelola tiket helpdesk' },
    { path: '/users', title: 'Pengguna', subtitle: 'Kelola data pengguna' },
    { path: '/submissions', title: 'Pengajuan', subtitle: 'Kelola pengajuan' },
    { path: '/logs', title: 'Log Aktivitas', subtitle: 'Riwayat aktivitas sistem' },
    { path: '/export', title: 'Ekspor Data', subtitle: 'Ekspor dan kelola data' },
  ]

  for (const item of expectedRoutes) {
    assert.ok(routerSource.includes(`path: '${item.path}'`), `Route ${item.path} missing`)
    assert.ok(routerSource.includes(`title: '${item.title}'`), `Title '${item.title}' missing for route ${item.path}`)
    assert.ok(routerSource.includes(`subtitle: '${item.subtitle}'`), `Subtitle '${item.subtitle}' missing for route ${item.path}`)
  }
})

test('AppHeader reads pageTitle and pageSubtitle dynamically from route.meta', async () => {
  const headerSource = await readFile(headerSourceUrl, 'utf8')

  assert.match(headerSource, /const pageTitle = computed\(\(\) => route\.meta\?\.title \|\|/);
  assert.match(headerSource, /const pageSubtitle = computed\(\(\) => route\.meta\?\.subtitle \|\|/);
  assert.match(headerSource, /\{\{\s*pageTitle\s*\}\}/);
  assert.match(headerSource, /\{\{\s*pageSubtitle\s*\}\}/);
})
