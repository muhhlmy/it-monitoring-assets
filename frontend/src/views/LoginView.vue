<script setup>
import { ref, onMounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

const router = useRouter()
const { login } = useAuth()

const isMounting = ref(true)
const email = ref('')
const password = ref('')
const rememberMe = ref(false)
const showPassword = ref(false)
const isLoading = ref(false)
const errorMessage = ref('')
const emailInput = ref(null)

onMounted(() => {
  // Preload logo image agar tampilan mulus tanpa kedipan
  const img = new Image()
  img.src = '/ESB Logo.svg'
  const finishMounting = () => {
    setTimeout(() => {
      isMounting.value = false
    }, 120)
  }
  img.onload = finishMounting
  img.onerror = finishMounting

  // Fallback timeout jika gambar gagal dimuat
  setTimeout(() => {
    if (isMounting.value) isMounting.value = false
  }, 800)
})

// Focus email input after mounting animation completes
watch(isMounting, async (mounting) => {
  if (!mounting) {
    await nextTick()
    emailInput.value?.focus()
  }
})

const handleLogin = async () => {
  if (!email.value || !password.value) {
    errorMessage.value = 'Email dan kata sandi wajib diisi.'
    return
  }

  isLoading.value = true
  errorMessage.value = ''

  try {
    const response = await login(email.value, password.value, rememberMe.value)

    // Redirect based on role
    if (response.user.role === 'user') {
      router.push('/my-assets')
    } else {
      router.push('/')
    }
  } catch (error) {
    errorMessage.value = error.message || 'Login gagal. Periksa kembali kredensial Anda.'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <!-- Outer Container - Exact 100dvh viewport without scrollbar -->
  <div
    class="h-screen h-dvh w-full overflow-hidden bg-[#FAFAFA] font-sans antialiased text-slate-900 flex flex-col md:flex-row select-none"
  >
    <!-- ── Skeleton Loading State ── -->
    <template v-if="isMounting">
      <!-- Left Branding Skeleton -->
      <div
        class="hidden md:flex md:w-[42%] lg:w-[40%] xl:w-[38%] bg-[#F4F6F9] border-r border-slate-200/60 p-8 lg:p-14 flex-col justify-between animate-pulse"
      >
        <div class="flex items-center justify-between">
          <div class="h-8 w-28 bg-slate-200/80 rounded-lg"></div>
          <div class="h-5 w-24 bg-slate-200/60 rounded-full"></div>
        </div>
        <div class="space-y-4 max-w-sm my-auto">
          <div class="h-10 w-44 bg-slate-200/80 rounded-xl"></div>
          <div class="h-4 w-full bg-slate-200/60 rounded-lg"></div>
          <div class="h-4 w-4/5 bg-slate-200/60 rounded-lg"></div>
        </div>
        <div class="h-4 w-36 bg-slate-200/60 rounded"></div>
      </div>

      <!-- Right Form Skeleton -->
      <div class="flex-1 flex items-center justify-center p-6 sm:p-8 bg-white">
        <div class="w-full max-w-[380px] space-y-6 animate-pulse">
          <div class="space-y-2">
            <div class="h-7 w-56 bg-slate-200 rounded-lg"></div>
            <div class="h-4 w-40 bg-slate-100 rounded"></div>
          </div>
          <div class="space-y-4 pt-2">
            <div class="h-11 w-full bg-slate-100 rounded-xl"></div>
            <div class="h-11 w-full bg-slate-100 rounded-xl"></div>
            <div class="h-4 w-28 bg-slate-100 rounded"></div>
            <div class="h-11 w-full bg-slate-200 rounded-xl"></div>
          </div>
        </div>
      </div>
    </template>

    <!-- ── Actual Content ── -->
    <template v-else>
      <!-- ── Left Column: Brand Presentation Panel (Desktop) ── -->
      <div
        class="hidden md:flex md:w-[42%] lg:w-[40%] xl:w-[38%] bg-[#F8FAFC] border-r border-slate-200/70 p-8 lg:p-12 xl:p-14 flex-col justify-between relative overflow-hidden shrink-0"
      >
        <!-- Subtle Ambient Radial Light (Non-intrusive) -->
        <div
          class="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-[#0892F5]/[0.035] blur-3xl pointer-events-none"
        ></div>
        <div
          class="absolute bottom-0 right-0 w-80 h-80 rounded-full bg-[#0A51B0]/[0.025] blur-3xl pointer-events-none"
        ></div>

        <!-- Ultra-subtle Enterprise Grid Pattern -->
        <svg
          class="absolute inset-0 w-full h-full stroke-slate-300/[0.25] pointer-events-none [mask-image:radial-gradient(ellipse_at_center,white_30%,transparent_85%)]"
          aria-hidden="true"
        >
          <defs>
            <pattern id="brand-grid-pattern" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M0 32V.5H32" fill="none" stroke-dasharray="2 2" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" stroke-width="0" fill="url(#brand-grid-pattern)" />
        </svg>

        <!-- Top Header: Brand Logo & Status Indicator -->
        <div class="relative z-10 flex items-center justify-between">
          <img src="/ESB Logo.svg" alt="ESB People Technology Logo" class="h-7 lg:h-8 w-auto object-contain" />
        </div>

        <!-- Middle Focal Point: Brand Statement & Typography -->
        <div class="relative z-10 max-w-sm space-y-6 my-auto py-8 transition-all duration-300">
          <div class="space-y-2">
            <div
              class="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1D4ED8] tracking-wide uppercase"
            >
              <span>IT Assets Monitoring</span>
            </div>
            <h1
              class="text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 leading-[1.1]"
            >
              TrackIT
            </h1>
          </div>

          <p class="text-sm lg:text-base text-slate-700 font-normal leading-relaxed">
            Platform terpadu untuk pengawasan aset IT, inventarisasi perangkat, dan manajemen tiket
            support secara real-time.
          </p>

          <!-- Minimal Feature Badges -->
          <div class="pt-2 flex flex-wrap gap-2 text-xs font-medium text-slate-700">
            <div
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/90 border border-slate-300/80 text-slate-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
            >
              <span aria-hidden="true" class="material-symbols-outlined text-[15px] text-[#1D4ED8]">inventory_2</span>
              <span>Asset Control</span>
            </div>
            <div
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/90 border border-slate-300/80 text-slate-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
            >
              <span aria-hidden="true" class="material-symbols-outlined text-[15px] text-[#1D4ED8]">devices</span>
              <span>Health Monitoring</span>
            </div>
            <div
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/90 border border-slate-300/80 text-slate-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
            >
              <span aria-hidden="true" class="material-symbols-outlined text-[15px] text-[#1D4ED8]"
                >confirmation_number</span
              >
              <span>Support Desk</span>
            </div>
          </div>
        </div>

        <!-- Bottom Footer -->
        <div
          class="relative z-10 flex items-center justify-between text-xs text-slate-600 font-medium"
        >
          <span>&copy; 2026 ESB People Technology</span>
          <span class="text-[11px] text-slate-600 font-medium">#AhlinyaBisnisKuliner</span>
        </div>
      </div>

      <!-- ── Right Column: Login Panel ── -->
      <div
        class="flex-1 flex flex-col justify-between p-6 sm:p-10 lg:p-14 bg-white relative z-10 overflow-y-auto sm:overflow-hidden h-full"
      >
        <!-- Mobile Header (Visible on small screens) -->
        <div
          class="flex md:hidden items-center justify-between pb-4 border-b border-slate-100 mb-4 shrink-0"
        >
          <img src="/ESB Logo.svg" alt="ESB People Technology Logo" class="h-7 w-auto object-contain" />
          <div
            class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200/80 text-[10px] font-semibold text-slate-700"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-600" aria-hidden="true"></span>
            <span>TrackIT Enterprise</span>
          </div>
        </div>

        <!-- Form Container (Centered with refined width) -->
        <div
          class="w-full max-w-[380px] sm:max-w-[400px] mx-auto my-auto py-4 sm:py-6 flex flex-col justify-center animate-fade-in"
        >
          <!-- Heading Section -->
          <div class="mb-6 sm:mb-8">
            <h2 class="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Selamat datang kembali
            </h2>
            <p class="mt-1.5 text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">
              Masuk dengan akun enterprise Anda untuk melanjutkan.
            </p>
          </div>

          <!-- Error Alert (Clean & Non-aggressive) -->
          <div
            v-if="errorMessage"
            class="mb-5 rounded-xl bg-red-50 p-3.5 border border-red-200 flex items-start gap-2.5 transition-all"
            role="alert"
          >
            <span aria-hidden="true" class="material-symbols-outlined text-red-700 text-[18px] mt-0.5 shrink-0"
              >error</span
            >
            <p class="text-xs font-semibold text-red-800 leading-relaxed">{{ errorMessage }}</p>
          </div>

          <!-- Authentication Form -->
          <form @submit.prevent="handleLogin" class="space-y-4">
            <!-- Email / Username Input -->
            <div class="space-y-1.5">
              <label for="email" class="block text-xs font-bold text-slate-800">
                Email atau nama pengguna
              </label>
              <div class="relative">
                <span
                  class="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none flex items-center"
                >
                  <span aria-hidden="true" class="material-symbols-outlined text-[18px]">mail</span>
                </span>
                <input
                  id="email"
                  ref="emailInput"
                  v-model="email"
                  type="text"
                  required
                  autocomplete="username"
                  placeholder="admin@esb.co.id"
                  class="h-11 w-full rounded-xl border border-slate-300 bg-slate-50/50 pl-10 pr-4 text-sm text-slate-900 transition-all duration-150 placeholder:text-slate-500 focus:border-[#2563EB] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#2563EB]/10"
                />
              </div>
            </div>

            <!-- Password Input -->
            <div class="space-y-1.5">
              <label for="password" class="block text-xs font-bold text-slate-800">
                Kata sandi
              </label>
              <div class="relative">
                <span
                  class="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none flex items-center"
                >
                  <span aria-hidden="true" class="material-symbols-outlined text-[18px]">lock</span>
                </span>
                <input
                  id="password"
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  required
                  autocomplete="current-password"
                  placeholder="••••••••"
                  class="h-11 w-full rounded-xl border border-slate-300 bg-slate-50/50 pl-10 pr-10 text-sm text-slate-900 transition-all duration-150 placeholder:text-slate-500 focus:border-[#2563EB] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#2563EB]/10"
                />
                <button
                  type="button"
                  @click="showPassword = !showPassword"
                  class="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-700 transition-colors focus:outline-none focus:text-slate-700"
                  :aria-label="showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'"
                  tabindex="-1"
                >
                  <span aria-hidden="true" class="material-symbols-outlined text-[18px] block">
                    {{ showPassword ? 'visibility_off' : 'visibility' }}
                  </span>
                </button>
              </div>
            </div>

            <!-- Remember Me Control -->
            <div class="flex items-center justify-between pt-1">
              <label class="flex items-center gap-2.5 cursor-pointer select-none group">
                <input
                  v-model="rememberMe"
                  type="checkbox"
                  class="w-4 h-4 rounded border-slate-300 text-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 accent-[#2563EB] cursor-pointer"
                />
                <span
                  class="text-xs sm:text-sm font-semibold text-slate-700 group-hover:text-slate-900 transition-colors"
                >
                  Ingat saya
                </span>
              </label>
            </div>

            <!-- Primary Submit Button -->
            <button
              type="submit"
              :disabled="isLoading"
              class="w-full h-11 mt-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold text-sm transition-all duration-150 shadow-xs active:scale-[0.99] disabled:opacity-60 disabled:pointer-events-none flex items-center justify-center gap-2 group cursor-pointer"
            >
              <span v-if="isLoading" class="flex items-center gap-2">
                <span aria-hidden="true" class="material-symbols-outlined animate-spin text-[18px]"
                  >progress_activity</span
                >
                <span>Masuk...</span>
              </span>
              <template v-else>
                <span>Masuk</span>
                <span
                  aria-hidden="true"
                  class="material-symbols-outlined text-[18px] transition-transform duration-150 group-hover:translate-x-0.5"
                  >arrow_forward</span
                >
              </template>
            </button>
          </form>

          <!-- Form Footer (Mobile & Subtle baseline) -->
          <div class="mt-8 text-center text-xs text-slate-400 font-normal md:hidden">
            &copy; 2026 ESB People Technology
          </div>
        </div>

        <!-- Whitespace Spacer for Desktop layout balancing -->
        <div class="hidden sm:block shrink-0 h-4"></div>
      </div>
    </template>
  </div>
</template>

<style scoped>
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in {
  animation: fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
</style>
