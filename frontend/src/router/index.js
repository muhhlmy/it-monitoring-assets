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

// Daftar semua route aplikasi
const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
    meta: { title: 'Masuk' },
  },
  {
    path: '/',               // URL yang diakses
    name: 'dashboard',       // nama route (opsional, untuk referensi)
    component: DashboardView, // komponen yang ditampilkan
    meta: { title: 'Dashboard' },
  },
  {
    path: '/assets',
    name: 'assets',
    component: AssetsView,
    meta: { title: 'Manajemen Aset' },
  },
  {
    path: '/my-assets',
    name: 'my-assets',
    component: MyAssetsView,
    meta: { title: 'Aset Karyawan' },
  },
  {
    path: '/tickets',
    name: 'tickets',
    component: TicketsView,
    meta: { title: 'Tiket Kendala IT' },
  },
  {
    path: '/users',
    name: 'users',
    component: UsersView,
    meta: { title: 'Manajemen Pengguna' },
  },
  {
    path: '/submissions',
    name: 'submissions',
    component: SubmissionsView,
    meta: { title: 'Pengajuan Serah Terima' },
  },
  {
    path: '/logs',
    name: 'logs',
    component: LogsView,
    meta: { title: 'Log Aktivitas' },
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

  // Jika sudah login tapi akses ke /login, arahkan ke halaman utama
  if (to.name === 'login' && token) {
    if (user?.role === 'user') return next({ name: 'my-assets' })
    return next({ name: 'dashboard' })
  }

  // Jika role adalah 'user', hanya boleh akses /my-assets
  if (token && user?.role === 'user') {
    if (to.name !== 'my-assets') {
      return next({ name: 'my-assets' })
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
