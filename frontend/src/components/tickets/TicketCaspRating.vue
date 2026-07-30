<script setup>
import { onMounted, ref, watch } from 'vue'
import { useApi } from '@/composables/useApi'
import CsatStars from './CsatStars.vue'

const props = defineProps({
  ticketId: { type: Number, required: true },
})
const emit = defineEmits(['rated'])

const { get, post } = useApi()

const isEligible    = ref(false)
const reason        = ref('')
const existingRating = ref(null)
const isLoading     = ref(true)
const isSubmitting  = ref(false)
const submitError   = ref('')
const submitSuccess = ref(false)

const selectedRating = ref(5)
const hoverRating    = ref(0)
const feedback       = ref('')

const ratingLabels = {
  1: 'Sangat Tidak Puas',
  2: 'Tidak Puas',
  3: 'Cukup',
  4: 'Puas',
  5: 'Sangat Puas',
}

async function fetchCasp() {
  if (!props.ticketId) return
  isLoading.value = true
  submitError.value = ''
  try {
    const data = await get(`/api/tickets/${props.ticketId}/casp`)
    isEligible.value = Boolean(data.eligible)
    reason.value = data.reason || ''
    existingRating.value = data.rating || null
  } catch (err) {
    submitError.value = err.message || 'Gagal memuat status CASP.'
  } finally {
    isLoading.value = false
  }
}

async function submitCasp() {
  if (!selectedRating.value || isSubmitting.value) return
  isSubmitting.value = true
  submitError.value = ''
  try {
    await post(`/api/tickets/${props.ticketId}/casp`, {
      rating: selectedRating.value,
      feedback: feedback.value.trim(),
    })
    submitSuccess.value = true
    await fetchCasp()
    emit('rated')
  } catch (err) {
    submitError.value = err.message || 'Gagal mengirim penilaian CASP.'
  } finally {
    isSubmitting.value = false
  }
}

watch(() => props.ticketId, fetchCasp, { immediate: true })
</script>

<template>
  <div class="rounded-2xl border border-[#D2E3FF] bg-[#F4F8FF] p-5 shadow-xs transition-all">
    <div v-if="isLoading" class="flex items-center gap-3 py-4 text-[#7C8BAC]">
      <div class="h-5 w-5 animate-spin rounded-full border-2 border-[#D2E3FF] border-t-[#5D87FF]"></div>
      <span class="text-[12px] font-medium">Memeriksa status penilaian CASP...</span>
    </div>

    <!-- Rating Sudah Dikirim (Existing Rating) -->
    <div v-else-if="existingRating" class="flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <span class="text-[11px] font-extrabold uppercase tracking-wider text-[#5D87FF]">Penilaian CASP Pelapor</span>
        <span class="text-[10px] text-[#7C8BAC]">Terkirim</span>
      </div>
      <div class="flex items-center gap-1 my-1">
        <CsatStars :value="existingRating.value" size="24px" />
        <span class="ml-2 text-[13px] font-bold text-[#2A3547]">
          {{ existingRating.value }}/5 — {{ existingRating.label }}
        </span>
      </div>
      <p v-if="existingRating.feedback" class="text-[12px] italic text-[#475569] bg-white p-3 rounded-xl border border-[#E2E8F0]">
        "{{ existingRating.feedback }}"
      </p>
    </div>

    <!-- Form Input Rating (Jika Eligible) -->
    <div v-else-if="isEligible" class="flex flex-col gap-3">
      <div>
        <div class="flex items-center gap-2 text-[#5D87FF] mb-1">
          <span class="material-symbols-outlined text-[20px]">rate_review</span>
          <h4 class="text-[14px] font-extrabold text-[#2A3547]">Penilaian Penyelesaian Kendala (CASP)</h4>
        </div>
        <p class="text-[12px] text-[#7C8BAC]">
          Tiket ini telah diselesaikan. Berikan penilaian bintang 1–5 untuk mengukur kepuasan problem solving.
        </p>
      </div>

      <!-- Bintang Rating -->
      <div class="flex flex-col gap-1 items-start my-1">
        <div class="flex items-center gap-1">
          <button
            v-for="star in 5"
            :key="star"
            type="button"
            :aria-label="`Bintang ${star}: ${ratingLabels[star]}`"
            @mouseenter="hoverRating = star"
            @mouseleave="hoverRating = 0"
            @click="selectedRating = star"
            class="text-amber-400 focus:outline-none transition-transform hover:scale-110 cursor-pointer"
          >
            <span
              class="material-symbols-outlined text-[30px] fill-1"
              :class="(hoverRating || selectedRating) >= star ? 'text-[#FFAE1F]' : 'text-[#CBD5E1]'"
            >
              star
            </span>
          </button>
        </div>
        <span class="text-[12px] font-bold text-[#FC841B] mt-0.5">
          {{ ratingLabels[hoverRating || selectedRating] }}
        </span>
      </div>

      <!-- Feedback Textarea -->
      <div>
        <textarea
          v-model="feedback"
          rows="2"
          placeholder="Catatan atau masukan singkat terkait penyelesaian tiket (opsional)..."
          class="w-full rounded-xl border border-[#DFE5EF] bg-white p-3 text-[12px] font-medium text-[#2A3547] focus:border-[#5D87FF] focus:outline-none"
        ></textarea>
      </div>

      <div v-if="submitError" class="text-[12px] font-semibold text-[#FA896B]">
        {{ submitError }}
      </div>

      <div>
        <button
          type="button"
          @click="submitCasp"
          :disabled="isSubmitting || !selectedRating"
          class="flex items-center gap-2 rounded-xl bg-[#5D87FF] px-4 py-2 text-[12px] font-bold text-white shadow-md hover:bg-[#4570EA] transition-all cursor-pointer disabled:opacity-50"
        >
          <span v-if="isSubmitting" class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
          <span v-else class="material-symbols-outlined text-[16px]">send</span>
          {{ isSubmitting ? 'Sending...' : 'Kirim Penilaian CASP' }}
        </button>
      </div>
    </div>

    <!-- Belum Eligible -->
    <div v-else class="text-[12px] font-medium text-[#7C8BAC]">
      <span class="italic">{{ reason || 'Penilaian CASP tidak tersedia untuk tiket ini.' }}</span>
    </div>
  </div>
</template>
