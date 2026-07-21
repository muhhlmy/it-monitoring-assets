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
import UsersView from '../views/UsersView.vue'
import SubmissionsView from '../views/SubmissionsView.vue'
import LogsView from '../views/LogsView.vue'

// Daftar semua route aplikasi
const routes = [
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

router.afterEach((to) => {
  document.title = to.meta.title
    ? `${to.meta.title} | IT Assets Monitoring`
    : 'IT Assets Monitoring'
})

export default router
