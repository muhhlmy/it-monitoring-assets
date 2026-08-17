<script setup>
import { computed, ref, watch } from 'vue'
import { useApi } from '@/composables/useApi'
import { useAuth } from '@/composables/useAuth'
import CsatStars from './CsatStars.vue'

const props = defineProps({
  ticketId: { type: Number, required: true },
  ticketStatus: { type: String, default: '' },
  ticket: { type: Object, default: null },
})
const emit = defineEmits(['rated'])

const { get, post } = useApi()
const { user, isAdmin, isSuperAdmin } = useAuth()

const reason = ref('')
const existingRating = ref(null)
const backendEligible = ref(null)
const isLoading = ref(true)
const isSubmitting = ref(false)
const submitError = ref('')

const selectedRating = ref(5)
const hoverRating = ref(0)
const feedback = ref('')

const ratingLabels = {
  1: 'Sangat Tidak Puas',
  2: 'Tidak Puas',
  3: 'Cukup',
  4: 'Puas',
  5: 'Sangat Puas',
}

// ── Normalize status: "Resolved" and "Closed" (case-insensitive) = finished ──
function isTicketFinished(status) {
  if (typeof status !== 'string') return false
  const norm = status.trim().toLowerCase()
  return norm === 'resolved' || norm === 'closed'
}

const currentStatus = computed(() => {
  return props.ticketStatus || props.ticket?.status_tiket || ''
})

const isFinished = computed(() => {
  return isTicketFinished(currentStatus.value)
})

// ── Check if logged-in user is the ticket reporter / owner ──
const isUserReporter = computed(() => {
  if (!user.value) return false
  const currentUserId = Number(user.value.id)
  const pelaporId = Number(
    props.ticket?.pelapor_user_id ||
    props.ticket?.pelapor_id ||
    (typeof props.ticket?.pelapor === 'number' ? props.ticket.pelapor : null)
  )
  if (currentUserId && pelaporId && currentUserId === pelaporId) return true
  // Fallback: If role is USER / REPORTER
  const role = (user.value.role || '').trim().toLowerCase()
  return role === 'user' || role === 'reporter'
})

// ── Eligibility calculation ──
const isEligible = computed(() => {
  if (existingRating.value !== null) return false
  if (!isFinished.value) return false
  if (backendEligible.value !== null && backendEligible.value) return true
  return isUserReporter.value
})

async function fetchCasp() {
  if (!props.ticketId) return
  isLoading.value = true
  submitError.value = ''
  try {
    const data = await get(`/api/tickets/${props.ticketId}/casp`)
    backendEligible.value = Boolean(data.eligible)
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
    await fetchCasp()
    emit('rated')
  } catch (err) {
    submitError.value = err.message || 'Gagal mengirim penilaian CASP.'
  } finally {
    isSubmitting.value = false
  }
}

watch(
  [() => props.ticketId, () => props.ticketStatus, () => props.ticket?.status_tiket],
  fetchCasp,
  { immediate: true },
)
</script>

<template>
  <div class="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 text-xs transition-all">
    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center gap-2 py-2 text-[#64748B]">
      <span class="material-symbols-outlined text-[16px] animate-spin text-[#2563EB]">progress_activity</span>
      <span>Memeriksa status penilaian CASP...</span>
    </div>

    <!-- Rating Sudah Dikirim (Submitted Result) -->
    <div v-else-if="existingRating" class="flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <h4 class="text-xs font-bold text-[#0F172A]">
          {{ isUserReporter && !isAdmin && !isSuperAdmin ? 'Penilaian Anda' : 'CASP Assessment' }}
        </h4>
        <span class="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
          {{ existingRating.value }} / 5
        </span>
      </div>

      <div class="flex items-center gap-2">
        <CsatStars :value="existingRating.value" size="18px" />
        <span class="text-xs font-bold text-[#0F172A]">
          {{ existingRating.label }}
        </span>
      </div>

      <p v-if="isUserReporter && !isAdmin && !isSuperAdmin" class="text-[11.5px] font-medium text-[#64748B]">
        Terima kasih atas feedback Anda.
      </p>

      <div v-if="existingRating.feedback" class="mt-1 rounded-lg border border-[#E2E8F0] bg-white p-3 text-[11.5px] text-[#334155] italic">
        "{{ existingRating.feedback }}"
      </div>

      <div v-if="(isAdmin || isSuperAdmin) && (existingRating.reporterName || existingRating.assigneeName)" class="text-[10.5px] text-[#94A3B8] flex items-center gap-2 mt-0.5">
        <span v-if="existingRating.reporterName">Pelapor: {{ existingRating.reporterName }}</span>
        <span v-if="existingRating.assigneeName">· Petugas: {{ existingRating.assigneeName }}</span>
      </div>
    </div>

    <!-- Form Input Rating (User & Eligible) -->
    <div v-else-if="isEligible" class="flex flex-col gap-3">
      <div>
        <h4 class="text-xs font-bold text-[#0F172A]">Penilaian Layanan</h4>
        <p class="text-[11.5px] font-normal text-[#64748B] mt-0.5">
          Bagaimana pengalaman Anda terhadap penanganan ticket ini?
        </p>
      </div>

      <!-- Bintang Rating Selector -->
      <div class="flex flex-col gap-1 items-start">
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
              class="material-symbols-outlined text-[26px] fill-1"
              :class="(hoverRating || selectedRating) >= star ? 'text-[#FFAE1F]' : 'text-[#CBD5E1]'"
            >
              star
            </span>
          </button>
        </div>
        <span class="text-xs font-bold text-[#2563EB]">
          {{ ratingLabels[hoverRating || selectedRating] }}
        </span>
      </div>

      <!-- Feedback Textarea -->
      <div>
        <textarea
          v-model="feedback"
          rows="2"
          placeholder="Tulis feedback atau masukan Anda... (opsional)"
          class="w-full rounded-xl border border-[#E2E8F0] bg-white p-3 text-xs font-medium text-[#0F172A] focus:border-[#2563EB] focus:outline-none transition-all placeholder-[#94A3B8]"
        ></textarea>
      </div>

      <div v-if="submitError" class="text-xs font-semibold text-rose-600">
        {{ submitError }}
      </div>

      <div class="flex items-center justify-end">
        <button
          type="button"
          @click="submitCasp"
          :disabled="isSubmitting || !selectedRating"
          class="inline-flex items-center gap-1.5 rounded-xl bg-[#2563EB] px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-[#1D4ED8] transition-all cursor-pointer disabled:opacity-50"
        >
          <span v-if="isSubmitting" class="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
          <span v-else class="material-symbols-outlined text-[16px]">send</span>
          <span>{{ isSubmitting ? 'Mengirim...' : 'Kirim Penilaian' }}</span>
        </button>
      </div>
    </div>

    <!-- Belum Eligible / Status Belum Selesai -->
    <div v-else class="text-xs font-medium text-[#64748B]">
      <span v-if="!isFinished" class="italic">Penilaian tersedia setelah ticket selesai.</span>
      <span v-else-if="isAdmin || isSuperAdmin" class="italic">Belum ada penilaian dari user.</span>
      <span v-else class="italic">{{ reason || 'Penilaian CASP tidak tersedia untuk tiket ini.' }}</span>
    </div>
  </div>
</template>
