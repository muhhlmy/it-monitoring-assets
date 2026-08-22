// ============================================================
// router/index.js - Konfigurasi Routing (Navigasi Halaman)
// ============================================================
// Router menentukan: URL apa → tampilkan komponen apa
// Misalnya: URL "/" → tampilkan DashboardView
// ============================================================

import { createRouter, createWebHistory } from 'vue-router'

import {
  TICKET_ROLES,
  canAccessFrontendFeature,
  findFirstAllowedRoute,
  getTicketEligibility,
} from '../utils/permissionAccess.js'
import { getAuthSnapshot } from '../utils/authStorage.js'

const allowedRouteMap = [
  { key: 'dashboard', name: 'dashboard' },
  { key: 'my_assets', name: 'my-assets' },
  { key: 'tickets', name: 'tickets' },
  { key: 'assets', name: 'assets' },
  { key: 'assets_ga', name: 'assets-ga' },
  { key: 'assets_ops', name: 'assets-ops' },
  { key: 'karyawan', name: 'karyawan' },
  { key: 'submissions', name: 'submissions' },
  { key: 'logs', name: 'logs' },
  { key: 'users', name: 'users' },
  { key: 'export', name: 'export' },
]

// Daftar semua route aplikasi
const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
    meta: { title: 'Masuk', subtitle: 'Masuk ke akun Anda' },
  },
  {
    path: '/',
    name: 'dashboard',
    component: () => import('../views/DashboardView.vue'),
    meta: { title: 'Dashboard', subtitle: 'Overview & analytics', permission: 'dashboard' },
  },
  {
    path: '/assets',
    name: 'assets',
    component: () => import('../views/AssetsView.vue'),
    meta: { title: 'Aset IT', subtitle: 'Inventaris & status perangkat', permission: 'assets' },
  },
  {
    path: '/assets-ga',
    alias: '/assets/ga',
    name: 'assets-ga',
    component: () => import('../views/AssetsGaView.vue'),
    meta: { title: 'Aset GA', subtitle: 'Kelola aset GA', permission: 'assets_ga' },
  },
  {
    path: '/assets-ops',
    alias: '/assets/ops',
    name: 'assets-ops',
    component: () => import('../views/AssetsOpsView.vue'),
    meta: { title: 'Aset Ops', subtitle: 'Kelola aset operasional', permission: 'assets_ops' },
  },
  {
    path: '/my-assets',
    alias: '/assets/karyawan',
    name: 'my-assets',
    component: () => import('../views/MyAssetsView.vue'),
    meta: { title: 'Aset Karyawan', subtitle: 'Kelola aset karyawan', permission: 'my_assets' },
  },
  {
    path: '/karyawan',
    name: 'karyawan',
    component: () => import('../views/EmployeesView.vue'),
    meta: { title: 'Karyawan', subtitle: 'Kelola data karyawan', permission: 'karyawan' },
  },
  {
    path: '/tickets',
    name: 'tickets',
    component: () => import('../views/TicketsView.vue'),
    meta: { title: 'Tiket', subtitle: 'Kelola tiket helpdesk', permission: 'tickets' },
  },
  {
    path: '/users',
    name: 'users',
    component: () => import('../views/UsersView.vue'),
    meta: { title: 'Pengguna', subtitle: 'Kelola data pengguna', permission: 'users' },
  },
  {
    path: '/submissions',
    alias: '/pengajuan',
    name: 'submissions',
    component: () => import('../views/SubmissionsView.vue'),
    meta: { title: 'Pengajuan', subtitle: 'Kelola pengajuan', permission: 'submissions' },
  },
  {
    path: '/logs',
    name: 'logs',
    component: () => import('../views/LogsView.vue'),
    meta: { title: 'Log Aktivitas', subtitle: 'Riwayat aktivitas sistem', permission: 'logs' },
  },
  {
    path: '/export',
    name: 'export',
    component: () => import('../views/ExportView.vue'),
    meta: {
      title: 'Ekspor Data',
      subtitle: 'Ekspor dan kelola data',
      permission: 'export',
      superadminOnly: true,
    },
  },
  {
    path: '/database',
    name: 'database',
    component: () => import('../views/DatabaseView.vue'),
    meta: {
      title: 'Database',
      subtitle: 'Backup & restore database',
      superadminOnly: true,
    },
  },
  {
    path: '/forbidden',
    name: 'forbidden',
    component: () => import('../views/AccessDeniedView.vue'),
    meta: { title: 'Akses Ditolak', subtitle: 'Anda tidak memiliki izin untuk halaman ini' },
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]

// Buat router dengan mode "history" (URL tanpa #)
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach((to) => {
  const { token, user } = getAuthSnapshot()

  // Jika halaman butuh login (semua kecuali /login) dan belum login
  if (to.name !== 'login' && !token) {
    return { name: 'login' }
  }

  const ticketEligibility = getTicketEligibility(user)
  const isSuper = ticketEligibility.role === TICKET_ROLES.SUPERADMIN
  const canAccess = (key) => canAccessFrontendFeature(user, key)
  const firstAllowed = findFirstAllowedRoute(user, allowedRouteMap)

  // Jika sudah login tapi akses ke /login, arahkan ke halaman utama yang punya izin
  if (to.name === 'login' && token) {
    return { name: firstAllowed?.name || 'forbidden' }
  }

  // Guard ini hanya untuk UX; otorisasi export tetap ditegakkan oleh backend.
  if (to.meta.superadminOnly && !isSuper) {
    return { name: firstAllowed?.name || 'forbidden' }
  }

  // Evaluasi Hak Akses Granular RBAC
  if (to.meta.permission && !canAccess(to.meta.permission)) {
    if (firstAllowed && firstAllowed.name !== to.name) {
      return { name: firstAllowed.name }
    }
    if (!firstAllowed) return { name: 'forbidden' }
  }
})

router.afterEach((to) => {
  document.title = to.meta.title
    ? `${to.meta.title} | IT Assets Monitoring`
    : 'IT Assets Monitoring'
})

router.onError((error) => {
  console.error('[Vue Router] Navigation error handled gracefully:', error)
})

export default router
