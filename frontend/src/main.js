// ============================================================
// main.js - Titik Awal Aplikasi Vue
// ============================================================
// File ini adalah yang pertama dijalankan saat aplikasi Vue dimuat.
// Di sini kita:
// 1. Import Vue
// 2. Import router (untuk navigasi antar halaman)
// 3. Import CSS global
// 4. Mount (pasang) aplikasi ke HTML
// ============================================================

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

// Import CSS global kita (design system)
import './assets/main.css'

// Buat instance aplikasi Vue dari komponen App.vue
const app = createApp(App)

// Pasang router agar bisa navigasi antar halaman
app.use(router)

// Pasang aplikasi ke elemen <div id="app"> di index.html setelah router siap
router.isReady().then(() => {
  app.mount('#app')
})
