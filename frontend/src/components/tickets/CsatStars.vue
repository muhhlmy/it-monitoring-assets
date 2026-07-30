<script setup>
// ============================================================
// CsatStars.vue — Bintang kepuasan (CSAT/CASP) reusable.
// Pakai Material Symbols "star" dengan class fill-1 (solid) + warna amber,
// konsisten dengan TicketCaspRating.vue. Bisa read-only maupun dipakai untuk
// menampilkan rata-rata di dashboard.
// ============================================================
import { computed } from 'vue'

const props = defineProps({
  value: { type: Number, default: 0 },          // 0–5 (desimal boleh, mis. 4.6)
  size: { type: String, default: '24px' },      // ukuran font icon
  showValue: { type: Boolean, default: false }, // tampilkan angka "4.6/5"
})

// Bintang terisi: pembulatan ke bawah (mis. 4.6 → 4 bintang terisi).
const filledCount = computed(() => {
  const n = Number(props.value) || 0
  return Math.min(5, Math.max(0, Math.floor(n + 0.0001)))
})
</script>

<template>
  <div class="inline-flex items-center gap-1">
    <span
      v-for="star in 5"
      :key="star"
      class="material-symbols-outlined fill-1"
      :style="{ fontSize: size }"
      :class="star <= filledCount ? 'text-[#FFAE1F]' : 'text-[#CBD5E1]'"
      aria-hidden="true"
    >
      star
    </span>
    <span v-if="showValue" class="ml-1.5 text-[13px] font-bold text-[#2A3547]">
      {{ Number(value).toFixed(1) }}/5
    </span>
  </div>
</template>
