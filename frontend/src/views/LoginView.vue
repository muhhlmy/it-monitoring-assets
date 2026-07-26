<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

const router = useRouter()
const { login } = useAuth()

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const isLoading = ref(false)
const errorMessage = ref('')

const handleLogin = async () => {
  if (!email.value || !password.value) {
    errorMessage.value = 'Email dan kata sandi wajib diisi.'
    return
  }

  isLoading.value = true
  errorMessage.value = ''

  try {
    const response = await login(email.value, password.value)
    
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
  <!-- Background with ESB Logo Gradients -->
  <div class="relative min-h-screen w-full bg-gradient-to-br from-[#9ACDFB] via-[#FFE3D4] to-[#FAD496] overflow-hidden flex font-sans">
    
    <!-- Background Mesh Gradients / Blobs -->
    <div class="absolute -top-[10%] -left-[5%] w-[60%] h-[70%] rounded-full bg-[#0892F5] opacity-100 blur-[100px] pointer-events-none z-0"></div>
    <div class="absolute top-[30%] left-[30%] w-[50%] h-[50%] rounded-full bg-[#FAA425] opacity-90 blur-[120px] pointer-events-none z-0"></div>
    <div class="absolute -bottom-[10%] -right-[5%] w-[70%] h-[70%] rounded-full bg-[#0A51B0] opacity-90 blur-[120px] pointer-events-none z-0"></div>

    <!-- Main Container -->
    <div class="relative z-10 mx-auto flex w-full max-w-[1280px] flex-col md:flex-row items-center justify-center gap-12 lg:gap-24 min-h-screen px-6 sm:px-12 lg:px-16">
      
      <!-- ── Left Column: Branding & Info ── -->
      <div class="flex w-full md:w-[55%] flex-col justify-center relative py-12">
        
        <div class="relative z-10 w-full">
          <!-- Logo inside a proportionally sized White Circle -->
          <div class="mb-8 flex w-40 h-40 md:w-56 md:h-56 lg:w-64 lg:h-64 items-center justify-center rounded-full bg-white shadow-[0_12px_32px_rgba(0,0,0,0.06)]">
            <img src="/ESB Logo.svg" alt="ESB Logo" class="w-28 md:w-40 lg:w-48 object-contain drop-shadow-md" />
          </div>

          <!-- Main Text -->
          <h1 class="text-[28px] md:text-[36px] lg:text-[42px] font-black leading-[1.2] tracking-tight bg-gradient-to-r from-[#0892F5] to-[#FF4F1B] bg-clip-text text-transparent">
            #AhlinyaBisnisKuliner
          </h1>

          <!-- Description -->
          <p class="mt-4 text-[13px] md:text-[14px] font-medium leading-relaxed text-[#475569] max-w-sm">
            Sistem Operasional Bisnis Kuliner No.1
          </p>
        </div>
      </div>

      <!-- ── Right Column: Login Form ── -->
      <div class="flex w-full md:w-[45%] items-center justify-center py-12">
        <div class="w-full max-w-[440px] rounded-[32px] bg-white/90 p-8 sm:p-10 lg:p-12 shadow-[0_24px_60px_-15px_rgba(10,81,176,0.12)] backdrop-blur-2xl border border-white/80 relative z-10">
          
          <div class="mb-10">
            <h2 class="text-[28px] sm:text-[32px] font-extrabold tracking-tight text-[#111827]">
              Selamat Datang Kembali
            </h2>
            <p class="mt-2 text-[14px] font-medium text-[#64748B]">
              Silakan masuk ke akun Anda untuk mengelola aset IT.
            </p>
          </div>

          <!-- Pesan Error -->
          <div v-if="errorMessage" class="mb-6 rounded-xl bg-red-50 p-4 border border-red-100 flex items-start gap-3">
            <span class="material-symbols-outlined text-red-500 text-[20px] mt-0.5">error</span>
            <p class="text-[13px] font-semibold text-red-700 leading-relaxed">{{ errorMessage }}</p>
          </div>

          <form @submit.prevent="handleLogin" class="space-y-6">
            
            <!-- Email Input -->
            <div class="space-y-2">
              <label for="email" class="block text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                Email atau Nama Pengguna
              </label>
              <div class="relative">
                <span class="absolute left-4 top-1/2 -translate-y-1/2 text-[#0A51B0]">
                  <span class="material-symbols-outlined text-[20px]">person</span>
                </span>
                <input
                  id="email"
                  v-model="email"
                  type="text"
                  required
                  placeholder="admin@esb.co.id"
                  class="h-14 w-full rounded-2xl border-2 border-[#E8EDF3] bg-[#F8FAFC] pl-12 pr-4 text-[14px] font-semibold text-[#111827] transition-all placeholder:text-[#94A3B8] focus:border-[#0A51B0] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#0A51B0]/10"
                />
              </div>
            </div>

            <!-- Password Input -->
            <div class="space-y-2">
              <label for="password" class="block text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                Kata Sandi
              </label>
              <div class="relative">
                <span class="absolute left-4 top-1/2 -translate-y-1/2 text-[#94A3B8]">
                  <span class="material-symbols-outlined text-[20px]">lock</span>
                </span>
                <input
                  id="password"
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  required
                  placeholder="••••••••"
                  class="h-14 w-full rounded-2xl border-2 border-[#E8EDF3] bg-[#F8FAFC] pl-12 pr-12 text-[14px] font-semibold text-[#111827] transition-all placeholder:text-[#94A3B8] focus:border-[#0A51B0] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#0A51B0]/10"
                />
                <button
                  type="button"
                  @click="showPassword = !showPassword"
                  class="absolute right-4 top-1/2 -translate-y-1/2 text-[#94A3B8] transition-colors hover:text-[#475569]"
                >
                  <span class="material-symbols-outlined text-[20px]">
                    {{ showPassword ? 'visibility_off' : 'visibility' }}
                  </span>
                </button>
              </div>
            </div>

            <!-- Options -->
            <div class="flex items-center justify-between mt-6">
              <label class="flex items-center gap-3 cursor-pointer group">
                <div class="relative flex h-5 w-5 items-center justify-center rounded-md border-2 border-[#CBD5E1] bg-white transition-colors group-hover:border-[#0A51B0] has-[:checked]:border-[#0A51B0] has-[:checked]:bg-[#0A51B0]">
                  <input type="checkbox" class="peer sr-only" />
                  <span class="material-symbols-outlined text-[14px] text-white opacity-0 transition-opacity peer-checked:opacity-100">check</span>
                </div>
                <span class="text-[13px] font-semibold text-[#64748B] group-hover:text-[#111827]">Ingat Saya</span>
              </label>
            </div>

            <!-- Submit Button -->
            <button
              type="submit"
              :disabled="isLoading"
              class="relative mt-8 flex h-14 w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-[#0A51B0] to-[#0892F5] px-8 text-[14px] font-black tracking-wide text-white shadow-[0_8px_20px_-6px_rgba(8,146,245,0.4)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_24px_-6px_rgba(8,146,245,0.5)] active:translate-y-0 disabled:pointer-events-none disabled:opacity-70"
            >
              <span v-if="isLoading" class="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
              <template v-else>
                MASUK
                <span class="material-symbols-outlined text-[20px]">arrow_forward</span>
              </template>
            </button>
          </form>

          <div class="mt-12 text-center text-[11px] font-semibold text-[#94A3B8]">
            &copy; 2026 ESB IT Management. Hak cipta dilindungi.
          </div>
        </div>
      </div>

    </div>
  </div>
</template>
