<template>
  <div class="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-4">
    <div class="text-center">
      <div class="mb-4 text-[96px] font-extrabold leading-none text-[#E2E8F0] select-none">
        404
      </div>
      <h1 class="mb-2 text-[20px] font-bold text-[#0F172A]">
        Halaman Tidak Ditemukan
      </h1>
      <p class="mb-8 max-w-sm text-[14px] text-[#64748B]">
        Halaman yang Anda cari tidak tersedia atau telah dipindahkan.
        Periksa kembali URL atau kembali ke beranda.
      </p>
      <router-link
        to="/"
        class="inline-flex items-center gap-2 rounded-xl bg-[#2563EB] px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-[#1D4ED8] transition-all"
      >
        <span class="material-symbols-outlined text-[18px]">home</span>
        Kembali ke Beranda
      </router-link>
    </div>
  </div>
</template>

<script setup>
// Tidak ada logic khusus — halaman statis
</script>