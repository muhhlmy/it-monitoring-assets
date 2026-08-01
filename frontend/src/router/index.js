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
    meta: { title: 'Masuk' },
  },
  {
    path: '/',
    name: 'dashboard',
    component: () => import('../views/DashboardView.vue'),
    meta: { title: 'Dashboard', permission: 'dashboard' },
  },
  {
    path: '/assets',
    name: 'assets',
    component: () => import('../views/AssetsView.vue'),
    meta: { title: 'Manajemen Aset', permission: 'assets' },
  },
  {
    path: '/my-assets',
    name: 'my-assets',
    component: () => import('../views/MyAssetsView.vue'),
    meta: { title: 'Aset Karyawan', permission: 'my_assets' },
  },
  {
    path: '/tickets',
    name: 'tickets',
    component: () => import('../views/TicketsView.vue'),
    meta: { title: 'Tiket Kendala IT', permission: 'tickets' },
  },
  {
    path: '/users',
    name: 'users',
    component: () => import('../views/UsersView.vue'),
    meta: { title: 'Manajemen Pengguna', permission: 'users' },
  },
  {
    path: '/submissions',
    name: 'submissions',
    component: () => import('../views/SubmissionsView.vue'),
    meta: { title: 'Pengajuan Serah Terima', permission: 'submissions' },
  },
  {
    path: '/logs',
    name: 'logs',
    component: () => import('../views/LogsView.vue'),
    meta: { title: 'Log Aktivitas', permission: 'logs' },
  },
  {
    path: '/export',
    name: 'export',
    component: () => import('../views/ExportView.vue'),
    meta: { title: 'Pusat Ekspor Data', permission: 'export', superadminOnly: true },
  },
  {
    path: '/forbidden',
    name: 'forbidden',
    component: () => import('../views/AccessDeniedView.vue'),
    meta: { title: 'Akses Ditolak' },
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

router.beforeEach((to, from, next) => {
  const { token, user } = getAuthSnapshot()

  // Jika halaman butuh login (semua kecuali /login) dan belum login
  if (to.name !== 'login' && !token) {
    return next({ name: 'login' })
  }

  const ticketEligibility = getTicketEligibility(user)
  const isSuper = ticketEligibility.role === TICKET_ROLES.SUPERADMIN
  const canAccess = (key) => canAccessFrontendFeature(user, key)
  const firstAllowed = findFirstAllowedRoute(user, allowedRouteMap)

  // Jika sudah login tapi akses ke /login, arahkan ke halaman utama yang punya izin
  if (to.name === 'login' && token) {
    return next({ name: firstAllowed?.name || 'forbidden' })
  }

  // Guard ini hanya untuk UX; otorisasi export tetap ditegakkan oleh backend.
  if (to.meta.superadminOnly && !isSuper) {
    return next({ name: firstAllowed?.name || 'forbidden' })
  }

  // Evaluasi Hak Akses Granular RBAC
  if (to.meta.permission && !canAccess(to.meta.permission)) {
    if (firstAllowed && firstAllowed.name !== to.name) {
      return next({ name: firstAllowed.name })
    }
    if (!firstAllowed) return next({ name: 'forbidden' })
  }

  next()
})

router.afterEach((to) => {
  document.title = to.meta.title
    ? `${to.meta.title} | IT Assets Monitoring`
    : 'IT Assets Monitoring'
})

export default router
