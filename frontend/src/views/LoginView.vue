<script setup>
import { ref, onMounted } from 'vue'
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

onMounted(() => {
  // Preload logo image agar tampilan mulus tanpa kedipan
  const img = new Image()
  img.src = '/ESB Logo.svg'
  const finishMounting = () => {
    setTimeout(() => {
      isMounting.value = false
    }, 150)
  }
  img.onload = finishMounting
  img.onerror = finishMounting

  // Fallback timeout jika gambar gagal dimuat dalam 1 detik
  setTimeout(() => {
    if (isMounting.value) isMounting.value = false
  }, 1000)
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
  <!-- Outer Container - Fits exactly 100dvh without vertical scrollbar -->
  <div
    class="h-screen h-dvh w-full overflow-hidden bg-[#F8FAFC] font-sans antialiased text-slate-900 flex flex-col md:flex-row"
  >
    <!-- ── Skeleton Loading State ── -->
    <template v-if="isMounting">
      <!-- Left Branding Skeleton -->
      <div
        class="hidden md:flex md:w-5/12 lg:w-1/2 bg-[#F1F5F9] border-r border-slate-200/80 p-8 lg:p-14 flex-col justify-between animate-pulse"
      >
        <div class="h-9 w-32 bg-slate-200 rounded-lg"></div>
        <div class="space-y-4 max-w-md">
          <div class="h-10 w-3/4 bg-slate-200 rounded-xl"></div>
          <div class="h-5 w-full bg-slate-200/70 rounded-lg"></div>
          <div class="h-5 w-2/3 bg-slate-200/70 rounded-lg"></div>
        </div>
        <div class="h-4 w-40 bg-slate-200/60 rounded"></div>
      </div>

      <!-- Right Form Skeleton -->
      <div class="flex-1 flex items-center justify-center p-6 sm:p-8 bg-white">
        <div class="w-full max-w-[400px] space-y-6 animate-pulse">
          <div class="space-y-2">
            <div class="h-8 w-2/3 bg-slate-200 rounded-lg"></div>
            <div class="h-4 w-5/6 bg-slate-100 rounded"></div>
          </div>
          <div class="space-y-4 pt-2">
            <div class="h-11 w-full bg-slate-100 rounded-xl"></div>
            <div class="h-11 w-full bg-slate-100 rounded-xl"></div>
            <div class="h-4 w-1/3 bg-slate-100 rounded"></div>
            <div class="h-11 w-full bg-slate-200 rounded-xl"></div>
          </div>
        </div>
      </div>
    </template>

    <!-- ── Actual Content ── -->
    <template v-else>
      <!-- ── Left Column: Branding (Desktop) ── -->
      <div
        class="hidden md:flex md:w-5/12 lg:w-1/2 bg-gradient-to-b from-[#F8FAFC] via-[#F1F5F9] to-[#E2E8F0]/50 border-r border-slate-200/70 p-8 lg:p-14 flex-col justify-between relative overflow-hidden"
      >
        <!-- Ambient Subtle Background Glow -->
        <div
          class="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-[#0892F5]/5 blur-3xl pointer-events-none"
        ></div>
        <div
          class="absolute bottom-10 right-0 w-80 h-80 rounded-full bg-[#0A51B0]/5 blur-3xl pointer-events-none"
        ></div>

        <!-- Top: ESB Logo -->
        <div class="relative z-10">
          <img src="/ESB Logo.svg" alt="ESB Logo" class="h-8 lg:h-9 w-auto object-contain" />
        </div>

        <!-- Middle: Brand Title & Description -->
        <div class="relative z-10 max-w-md space-y-3.5 my-auto py-6">
          <h1 class="text-3xl lg:text-6xl font-bold tracking-tight text-slate-900 leading-[1.15]">
            TrackIT
          </h1>
          <p class="text-sm lg:text-base text-slate-600 font-normal leading-relaxed">
            Kelola aset IT, monitoring perangkat, dan layanan support dalam satu platform.
          </p>

          <div class="pt-4 flex items-center gap-3 text-xs text-slate-400 font-medium">
            <span
              class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-200/60 text-slate-600 font-medium"
            >
              #AhlinyaBisnisKuliner
            </span>
          </div>
        </div>

        <!-- Bottom: Copyright / Subtitle -->
        <div class="relative z-10 text-xs text-slate-400 font-medium">
          &copy; 2026 ESB People Technology
        </div>
      </div>

      <!-- ── Right Column: Login Form ── -->
      <div
        class="flex-1 flex flex-col justify-between p-6 sm:p-8 lg:p-12 bg-white relative z-10 overflow-hidden h-full"
      >
        <!-- Mobile Header (Logo & Small Title on small viewports) -->
        <div
          class="flex md:hidden items-center justify-between pb-3 border-b border-slate-100 mb-2 shrink-0"
        >
          <img src="/ESB Logo.svg" alt="ESB Logo" class="h-7 w-auto object-contain" />
          <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider"
            >Aset IT</span
          >
        </div>

        <!-- Centered Form Container -->
        <div
          class="w-full max-w-[380px] sm:max-w-[420px] mx-auto my-auto py-2 sm:py-4 flex flex-col justify-center"
        >
          <!-- Header -->
          <div class="mb-5 sm:mb-7">
            <h2 class="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Selamat datang kembali
            </h2>
            <p class="mt-1.5 text-xs sm:text-sm text-slate-500 font-normal">
              Masuk untuk melanjutkan.
            </p>
          </div>

          <!-- Error Alert -->
          <div
            v-if="errorMessage"
            class="mb-4 rounded-xl bg-red-50 p-3 border border-red-100 flex items-start gap-2.5"
          >
            <span class="material-symbols-outlined text-red-500 text-[18px] mt-0.5 shrink-0"
              >error</span
            >
            <p class="text-xs font-medium text-red-700 leading-relaxed">{{ errorMessage }}</p>
          </div>

          <!-- Form Fields -->
          <form @submit.prevent="handleLogin" class="space-y-4 sm:space-y-4">
            <!-- Email / Username -->
            <div class="space-y-1.5">
              <label for="email" class="block text-xs font-semibold text-slate-700">
                Email atau nama pengguna
              </label>
              <div class="relative">
                <span
                  class="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none flex items-center"
                >
                  <span class="material-symbols-outlined text-[18px]">mail</span>
                </span>
                <input
                  id="email"
                  v-model="email"
                  type="text"
                  required
                  placeholder="admin@esb.co.id"
                  class="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 text-sm text-slate-900 transition-all placeholder:text-slate-400 focus:border-[#0892F5] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#0892F5]/10"
                />
              </div>
            </div>

            <!-- Password -->
            <div class="space-y-1.5">
              <label for="password" class="block text-xs font-semibold text-slate-700">
                Kata sandi
              </label>
              <div class="relative">
                <span
                  class="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none flex items-center"
                >
                  <span class="material-symbols-outlined text-[18px]">lock</span>
                </span>
                <input
                  id="password"
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  required
                  placeholder="••••••••"
                  class="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-10 text-sm text-slate-900 transition-all placeholder:text-slate-400 focus:border-[#0892F5] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#0892F5]/10"
                />
                <button
                  type="button"
                  @click="showPassword = !showPassword"
                  class="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors focus:outline-none"
                  tabindex="-1"
                >
                  <span class="material-symbols-outlined text-[18px] block">
                    {{ showPassword ? 'visibility_off' : 'visibility' }}
                  </span>
                </button>
              </div>
            </div>

            <!-- Remember Me -->
            <div class="flex items-center justify-between pt-0.5">
              <label class="flex items-center gap-2.5 cursor-pointer select-none group">
                <input
                  v-model="rememberMe"
                  type="checkbox"
                  class="w-4 h-4 rounded border-slate-300 text-[#0892F5] focus:ring-[#0892F5]/20 accent-[#0892F5] cursor-pointer"
                />
                <span
                  class="text-xs sm:text-sm font-medium text-slate-600 group-hover:text-slate-900 transition-colors"
                >
                  Ingat saya
                </span>
              </label>
            </div>

            <!-- Primary Submit Button -->
            <button
              type="submit"
              :disabled="isLoading"
              class="w-full h-11 mt-1 rounded-xl bg-[#0892F5] hover:bg-[#0780D8] text-white font-semibold text-sm transition-all duration-150 shadow-sm active:scale-[0.99] disabled:opacity-60 disabled:pointer-events-none flex items-center justify-center gap-2 group"
            >
              <span v-if="isLoading" class="flex items-center gap-2">
                <span class="material-symbols-outlined animate-spin text-[18px]"
                  >progress_activity</span
                >
                <span>Masuk...</span>
              </span>
              <template v-else>
                <span>Masuk</span>
                <span
                  class="material-symbols-outlined text-[18px] transition-transform group-hover:translate-x-0.5"
                  >arrow_forward</span
                >
              </template>
            </button>
          </form>

          <!-- Form Bottom Footer (Subtle) -->
          <div class="mt-6 sm:mt-8 text-center text-xs text-slate-400 font-normal">
            &copy; 2026 ESB People Technology
          </div>
        </div>

        <!-- Bottom whitespace balancer -->
        <div class="hidden sm:block shrink-0 h-2"></div>
      </div>
    </template>
  </div>
</template>
