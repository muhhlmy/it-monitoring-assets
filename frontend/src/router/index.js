// ============================================================
// router/index.js - Konfigurasi Routing (Navigasi Halaman)
// ============================================================
// Router menentukan: URL apa → tampilkan komponen apa
// Misalnya: URL "/" → tampilkan DashboardView
// ============================================================

import { createRouter, createWebHistory } from 'vue-router'

// Import komponen halaman (views) yang akan ditampilkan
import DashboardView from '../views/DashboardView.vue'
import AssetsView from '../views/AssetsView.vue'
import MyAssetsView from '../views/MyAssetsView.vue'
import UsersView from '../views/UsersView.vue'
import SubmissionsView from '../views/SubmissionsView.vue'
import LogsView from '../views/LogsView.vue'
import TicketsView from '../views/TicketsView.vue'
import ExportView from '../views/ExportView.vue'

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
    component: DashboardView,
    meta: { title: 'Dashboard', permission: 'dashboard' },
  },
  {
    path: '/assets',
    name: 'assets',
    component: AssetsView,
    meta: { title: 'Manajemen Aset', permission: 'assets' },
  },
  {
    path: '/my-assets',
    name: 'my-assets',
    component: MyAssetsView,
    meta: { title: 'Aset Karyawan', permission: 'my_assets' },
  },
  {
    path: '/tickets',
    name: 'tickets',
    component: TicketsView,
    meta: { title: 'Tiket Kendala IT', permission: 'tickets' },
  },
  {
    path: '/users',
    name: 'users',
    component: UsersView,
    meta: { title: 'Manajemen Pengguna', permission: 'users' },
  },
  {
    path: '/submissions',
    name: 'submissions',
    component: SubmissionsView,
    meta: { title: 'Pengajuan Serah Terima', permission: 'submissions' },
  },
  {
    path: '/logs',
    name: 'logs',
    component: LogsView,
    meta: { title: 'Log Aktivitas', permission: 'logs' },
  },
  {
    path: '/export',
    name: 'export',
    component: ExportView,
    meta: { title: 'Pusat Ekspor Data', permission: 'export' },
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
  const token = localStorage.getItem('token')
  const user = JSON.parse(localStorage.getItem('user') || 'null')

  // Jika halaman butuh login (semua kecuali /login) dan belum login
  if (to.name !== 'login' && !token) {
    return next({ name: 'login' })
  }

  const userRole = (user?.role || '').trim().toLowerCase()
  const isSuper = userRole === 'superadmin' || userRole === 'super admin'
  const userPerms = user?.permissions || {}

  const canAccess = (key) => {
    if (!key) return true
    if (isSuper) return true
    return !!userPerms[key]
  }

  // Jika sudah login tapi akses ke /login, arahkan ke halaman utama yang punya izin
  if (to.name === 'login' && token) {
    if (canAccess('dashboard')) return next({ name: 'dashboard' })
    if (canAccess('my_assets')) return next({ name: 'my-assets' })
    return next({ name: 'tickets' })
  }

  // Evaluasi Hak Akses Granular RBAC
  if (to.meta.permission && !canAccess(to.meta.permission)) {
    const allowedRouteMap = [
      { key: 'my_assets', name: 'my-assets' },
      { key: 'tickets', name: 'tickets' },
      { key: 'dashboard', name: 'dashboard' },
      { key: 'assets', name: 'assets' },
      { key: 'submissions', name: 'submissions' },
      { key: 'logs', name: 'logs' },
      { key: 'users', name: 'users' },
      { key: 'export', name: 'export' },
    ]

    const firstAllowed = allowedRouteMap.find(r => canAccess(r.key))
    if (firstAllowed && firstAllowed.name !== to.name) {
      return next({ name: firstAllowed.name })
    }
  }

  next()
})

router.afterEach((to) => {
  document.title = to.meta.title
    ? `${to.meta.title} | IT Assets Monitoring`
    : 'IT Assets Monitoring'
})

export default router
