<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useApi } from '@/composables/useApi'
import AppModal from '../ui/AppModal.vue'

const props = defineProps({
  isMobileOpen: { type: Boolean, default: false },
  isCollapsed:  { type: Boolean, default: false },
})
const emit = defineEmits(['close-mobile', 'toggle-collapse'])
const route = useRoute()
const sidebarRef = ref(null)
const closeButtonRef = ref(null)

const { user, isSuperAdmin, logout, hasPermission } = useAuth()
const { post } = useApi()

const showPasswordModal = ref(false)
const isSubmittingPassword = ref(false)
const passwordModalError = ref('')
const passwordSuccessMessage = ref('')
const passwordForm = ref({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})

function openChangePassword() {
  passwordForm.value = { currentPassword: '', newPassword: '', confirmPassword: '' }
  passwordModalError.value = ''
  passwordSuccessMessage.value = ''
  showPasswordModal.value = true
}

function closePasswordModal() {
  showPasswordModal.value = false
  passwordModalError.value = ''
  passwordSuccessMessage.value = ''
}

async function submitChangePassword() {
  const { currentPassword, newPassword, confirmPassword } = passwordForm.value
  if (!currentPassword) {
    passwordModalError.value = 'Password saat ini wajib diisi.'
    return
  }
  if (!newPassword || newPassword.length < 8) {
    passwordModalError.value = 'Password baru minimal 8 karakter.'
    return
  }
  if (newPassword !== confirmPassword) {
    passwordModalError.value = 'Konfirmasi password baru tidak cocok.'
    return
  }

  isSubmittingPassword.value = true
  passwordModalError.value = ''
  passwordSuccessMessage.value = ''

  try {
    const res = await post('/api/auth/change-password', { currentPassword, newPassword })
    passwordSuccessMessage.value = res.message || 'Password berhasil diperbarui.'
    setTimeout(() => {
      closePasswordModal()
    }, 1500)
  } catch (err) {
    passwordModalError.value = err.message || 'Gagal mengganti password.'
  } finally {
    isSubmittingPassword.value = false
  }
}

// State untuk Expand / Collapse Parent Menu
const expandedParents = ref({
  asset_management: true,
  helpdesk: true,
  master_data: true,
  sistem: true,
})

function toggleParent(key) {
  expandedParents.value[key] = !expandedParents.value[key]
}

function isParentExpanded(key) {
  return !!expandedParents.value[key]
}

function autoExpandActiveParent() {
  const currentPath = route.path
  if (['/assets', '/my-assets'].includes(currentPath)) expandedParents.value.asset_management = true
  if (['/tickets', '/submissions'].includes(currentPath)) expandedParents.value.helpdesk = true
  if (['/users', '/karyawan'].includes(currentPath)) expandedParents.value.master_data = true
  if (['/logs', '/export'].includes(currentPath)) expandedParents.value.sistem = true
}

watch(
  () => route.path,
  () => {
    autoExpandActiveParent()
  },
  { immediate: true },
)

const menuGroups = computed(() => {
  const groups = [
    {
      title: 'HOME',
      items: [
        {
          to: '/',
          label: 'Dashboard',
          icon: 'grid_view',
          permission: 'dashboard',
          badge: 'New',
        },
      ],
    },
    {
      title: 'INVENTARIS',
      parents: [
        {
          key: 'asset_management',
          label: 'Asset Management',
          icon: 'inventory_2',
          items: [
            {
              to: '/assets',
              label: 'Aset IT',
              icon: 'devices',
              permission: 'assets',
            },
            {
              to: '/my-assets',
              label: 'Aset Karyawan',
              icon: 'badge',
              permission: 'my_assets',
            },
          ],
        },
      ],
    },
    {
      title: 'TRANSAKSI',
      parents: [
        {
          key: 'helpdesk',
          label: 'Helpdesk',
          icon: 'support_agent',
          items: [
            {
              to: '/tickets',
              label: 'Tiket',
              icon: 'confirmation_number',
              permission: 'tickets',
              badge: 'New',
            },
            {
              to: '/submissions',
              label: 'Pengajuan',
              icon: 'assignment',
              permission: 'submissions',
            },
          ],
        },
      ],
    },
    {
      title: 'ADMINISTRASI',
      parents: [
        {
          key: 'master_data',
          label: 'Master Data',
          icon: 'folder_shared',
          items: [
            {
              to: '/users',
              label: 'Pengguna',
              icon: 'group',
              permission: 'users',
            },
            {
              to: '/karyawan',
              label: 'Master Karyawan',
              icon: 'person_search',
              permission: 'karyawan',
            },
          ],
        },
        {
          key: 'sistem',
          label: 'Sistem',
          icon: 'settings_suggest',
          items: [
            {
              to: '/logs',
              label: 'Log Aktivitas',
              icon: 'receipt_long',
              permission: 'logs',
            },
            {
              to: '/export',
              label: 'Ekspor Data',
              icon: 'output',
              permission: 'export',
              superadminOnly: true,
            },
          ],
        },
      ],
    },
  ]

  return groups
    .map((g) => {
      const validItems = (g.items || []).filter(
        (item) => (!item.superadminOnly || isSuperAdmin.value) && hasPermission(item.permission),
      )

      const validParents = (g.parents || [])
        .map((p) => ({
          ...p,
          items: (p.items || []).filter(
            (item) => (!item.superadminOnly || isSuperAdmin.value) && hasPermission(item.permission),
          ),
        }))
        .filter((p) => p.items.length > 0)

      return {
        ...g,
        items: validItems,
        parents: validParents,
      }
    })
    .filter((g) => (g.items && g.items.length > 0) || (g.parents && g.parents.length > 0))
})

function getFocusableElements() {
  if (!sidebarRef.value) return []
  return Array.from(
    sidebarRef.value.querySelectorAll(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  )
}

function handleKeydown(event) {
  if (!props.isMobileOpen) return
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close-mobile')
    return
  }
  if (event.key !== 'Tab') return

  const elements = getFocusableElements()
  const firstElement = elements[0]
  const lastElement = elements.at(-1)
  if (event.shiftKey && document.activeElement === firstElement) {
    event.preventDefault()
    lastElement?.focus()
  } else if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault()
    firstElement?.focus()
  }
}

watch(
  () => props.isMobileOpen,
  (isOpen) => {
    if (isOpen) {
      nextTick(() => {
        closeButtonRef.value?.focus()
      })
    }
  },
)

onMounted(() => document.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <!-- Mobile Backdrop Overlay -->
  <Transition name="sidebar-backdrop">
    <button
      v-if="isMobileOpen"
      type="button"
      aria-label="Tutup navigasi mobile"
      tabindex="-1"
      class="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-xs lg:hidden"
      @click="emit('close-mobile')"
    ></button>
  </Transition>

  <!-- Sidebar Component -->
  <aside
    id="app-navigation"
    ref="sidebarRef"
    :role="isMobileOpen ? 'dialog' : undefined"
    :aria-modal="isMobileOpen ? 'true' : undefined"
    aria-label="Navigasi aplikasi"
    class="fixed inset-y-0 left-0 z-40 flex h-dvh shrink-0 flex-col overflow-hidden border-r border-[#E5EAEF] bg-white text-[#2A3547] shadow-xl transition-all duration-300 ease-in-out lg:static lg:z-10 lg:shadow-none"
    :class="[
      isMobileOpen ? 'w-[250px] translate-x-0 visible opacity-100' : '-translate-x-full lg:translate-x-0',
      isCollapsed ? 'lg:w-[72px]' : 'lg:w-[245px]'
    ]"
  >
    <!-- Brand Logo Top Header -->
    <div
      class="relative flex h-[52px] shrink-0 items-center border-b border-[#F1F5F9] transition-all"
      :class="isCollapsed ? 'justify-center px-0' : 'justify-between gap-2 px-3.5'"
    >
      <!-- Logo Penuh saat Expanded -->
      <RouterLink
        v-if="!isCollapsed"
        to="/dashboard"
        title="Kembali ke Dashboard"
        class="flex items-center justify-center shrink-0 hover:opacity-80 transition-opacity cursor-pointer"
      >
        <img
          src="/ESB Logo.svg"
          alt="ESB Logo"
          class="h-7 w-auto shrink-0 transition-all duration-200"
        />
      </RouterLink>

      <!-- Logo saat Collapsed -->
      <RouterLink
        v-else
        to="/dashboard"
        title="Kembali ke Dashboard"
        class="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[#ECF2FF] transition-all cursor-pointer group shrink-0"
      >
        <img
          src="/ESB Logo.svg"
          alt="ESB Logo"
          class="h-7 w-7 object-left object-cover transition-transform group-hover:scale-105 shrink-0 block"
        />
      </RouterLink>

      <!-- Toggle Button Desktop (Saat Expanded) -->
      <button
        v-if="!isCollapsed"
        ref="closeButtonRef"
        type="button"
        aria-label="Sembunyikan Sidepanel"
        title="Ciutkan Sidebar"
        class="hidden lg:flex h-7 w-7 items-center justify-center rounded-lg text-[#7C8BAC] hover:bg-[#ECF2FF] hover:text-[#5D87FF] transition-all cursor-pointer shrink-0"
        @click="emit('toggle-collapse')"
      >
        <span aria-hidden="true" class="material-symbols-outlined text-[18px]">
          menu_open
        </span>
      </button>

      <!-- Close Button Mobile -->
      <button
        type="button"
        aria-label="Tutup navigasi mobile"
        title="Tutup Navigasi"
        class="flex lg:hidden h-7 w-7 items-center justify-center rounded-lg text-[#7C8BAC] hover:bg-[#ECF2FF] hover:text-[#5D87FF] transition-all cursor-pointer shrink-0"
        @click="emit('close-mobile')"
      >
        <span aria-hidden="true" class="material-symbols-outlined text-[18px]">close</span>
      </button>
    </div>

    <!-- Sidebar Scrollable Menu -->
    <div class="relative flex-1 overflow-y-auto py-3 space-y-4 px-2.5">
      <div v-for="group in menuGroups" :key="group.title" class="space-y-1">
        <!-- Category Title -->
        <p
          v-if="!isCollapsed"
          class="px-2 text-[10.5px] font-extrabold uppercase tracking-wider text-[#7C8BAC] transition-all"
        >
          {{ group.title }}
        </p>
        <div v-else class="my-1.5 border-t border-[#F1F5F9] mx-1.5"></div>

        <nav class="space-y-0.5">
          <!-- Direct Items (e.g. Dashboard) -->
          <template v-if="group.items && group.items.length">
            <RouterLink
              v-for="item in group.items"
              :key="item.to"
              :to="item.to"
              :title="isCollapsed ? item.label : undefined"
              class="group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] transition-all duration-150 relative"
              :class="[
                route.path === item.to
                  ? 'bg-[#5D87FF] text-white shadow-xs font-semibold'
                  : 'text-[#2A3547] hover:bg-[#ECF2FF] hover:text-[#5D87FF] font-medium',
                isCollapsed ? 'justify-center px-0 py-2' : ''
              ]"
              @click="emit('close-mobile')"
            >
              <span
                aria-hidden="true"
                class="material-symbols-outlined text-[18px] transition-colors shrink-0"
                :class="
                  route.path === item.to ? 'text-white' : 'text-[#7C8BAC] group-hover:text-[#5D87FF]'
                "
              >
                {{ item.icon }}
              </span>

              <span
                v-if="!isCollapsed"
                class="min-w-0 flex-1 leading-none whitespace-nowrap"
              >
                {{ item.label }}
              </span>

              <span
                v-if="item.badge && !isCollapsed"
                class="rounded-full px-1.5 py-0.2 text-[9px] font-bold shrink-0"
                :class="
                  route.path === item.to ? 'bg-white/20 text-white' : 'bg-[#ECF2FF] text-[#5D87FF]'
                "
              >
                {{ item.badge }}
              </span>
            </RouterLink>
          </template>

          <!-- Parent Menus (Expandable) -->
          <template v-if="group.parents && group.parents.length">
            <div v-for="parent in group.parents" :key="parent.key" class="space-y-0.5">
              
              <!-- Parent Menu Header -->
              <button
                type="button"
                :title="isCollapsed ? parent.label : undefined"
                class="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] font-semibold transition-all duration-150 cursor-pointer select-none"
                :class="[
                  parent.items.some(child => route.path === child.to)
                    ? 'text-[#2A3547] bg-[#F8FAFC]'
                    : 'text-[#2A3547] hover:bg-[#F8FAFC] hover:text-[#5D87FF]',
                  isCollapsed ? 'justify-center px-0 py-2' : 'justify-between'
                ]"
                @click="toggleParent(parent.key)"
              >
                <div class="flex items-center gap-2.5 min-w-0">
                  <span
                    aria-hidden="true"
                    class="material-symbols-outlined text-[18px] transition-colors shrink-0"
                    :class="
                      parent.items.some(child => route.path === child.to)
                        ? 'text-[#5D87FF]'
                        : 'text-[#7C8BAC] group-hover:text-[#5D87FF]'
                    "
                  >
                    {{ parent.icon }}
                  </span>

                  <span v-if="!isCollapsed" class="min-w-0 flex-1 leading-none whitespace-nowrap text-left">
                    {{ parent.label }}
                  </span>
                </div>

                <span
                  v-if="!isCollapsed"
                  aria-hidden="true"
                  class="material-symbols-outlined text-[16px] text-[#7C8BAC] transition-transform duration-200 shrink-0"
                  :class="{ 'rotate-180': isParentExpanded(parent.key) }"
                >
                  keyboard_arrow_down
                </span>
              </button>

              <!-- Submenu Items (Indented without vertical line) -->
              <div
                v-show="isParentExpanded(parent.key) || isCollapsed"
                class="pl-5 space-y-0.5 mt-0.5 transition-all"
                :class="isCollapsed ? 'pl-0 space-y-1' : ''"
              >
                <RouterLink
                  v-for="sub in parent.items"
                  :key="sub.to"
                  :to="sub.to"
                  :title="isCollapsed ? sub.label : undefined"
                  class="group flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] transition-all duration-150 relative"
                  :class="[
                    route.path === sub.to
                      ? 'bg-[#ECF2FF] text-[#5D87FF] font-bold shadow-2xs border-l-2 border-[#5D87FF] rounded-r-lg'
                      : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#5D87FF] font-medium',
                    isCollapsed ? 'justify-center px-0 py-1.5' : ''
                  ]"
                  @click="emit('close-mobile')"
                >
                  <span
                    aria-hidden="true"
                    class="material-symbols-outlined text-[16px] transition-colors shrink-0"
                    :class="
                      route.path === sub.to ? 'text-[#5D87FF]' : 'text-[#94A3B8] group-hover:text-[#5D87FF]'
                    "
                  >
                    {{ sub.icon }}
                  </span>

                  <span
                    v-if="!isCollapsed"
                    class="min-w-0 flex-1 leading-none whitespace-nowrap"
                  >
                    {{ sub.label }}
                  </span>

                  <span
                    v-if="sub.badge && !isCollapsed"
                    class="rounded-full px-1.5 py-0.2 text-[9px] font-bold shrink-0"
                    :class="
                      route.path === sub.to ? 'bg-[#5D87FF] text-white' : 'bg-[#ECF2FF] text-[#5D87FF]'
                    "
                  >
                    {{ sub.badge }}
                  </span>
                </RouterLink>
              </div>

            </div>
          </template>
        </nav>
      </div>
    </div>

    <!-- Bottom User Profile Card -->
    <div class="relative p-2.5 border-t border-[#F1F5F9]">
      <div
        class="flex items-center justify-between rounded-xl bg-[#ECF2FF] border border-[#D2E3FF] p-2 transition-all"
        :class="isCollapsed ? 'justify-center p-2 flex-col gap-2' : ''"
      >
        <div class="flex items-center gap-2 min-w-0">
          <div
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#5D87FF] text-[12px] font-extrabold text-white shadow-md shadow-blue-500/20"
          >
            {{ user?.nama ? user.nama.charAt(0).toUpperCase() : 'U' }}
          </div>
          <div v-if="!isCollapsed" class="min-w-0">
            <p class="truncate text-[11.5px] font-bold text-[#2A3547] leading-tight">
              {{ user?.nama || 'Pengguna' }}
            </p>
            <p class="mt-0.5 truncate text-[9.5px] font-medium text-[#7C8BAC] capitalize">
              {{ user?.jabatan || user?.role || 'Guest' }}
            </p>
            <p v-if="user?.nik" class="truncate font-mono text-[9px] text-[#9CA3AF]">
              NIK: {{ user.nik }}
            </p>
          </div>
        </div>

        <div class="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            @click="openChangePassword"
            title="Ganti Password Akun"
            class="flex h-7 w-7 items-center justify-center rounded-lg text-[#5D87FF] hover:bg-white hover:text-[#5D87FF] transition-all shadow-2xs cursor-pointer"
          >
            <span aria-hidden="true" class="material-symbols-outlined text-[16px]">key</span>
          </button>

          <button
            type="button"
            @click="logout"
            title="Keluar / Logout"
            class="flex h-7 w-7 items-center justify-center rounded-lg text-[#5D87FF] hover:bg-white hover:text-red-500 transition-all shadow-2xs cursor-pointer"
          >
            <span aria-hidden="true" class="material-symbols-outlined text-[16px]">power_settings_new</span>
          </button>
        </div>
      </div>
    </div>
  </aside>

  <!-- Modal Ganti Password Akun -->
  <AppModal
    :is-open="showPasswordModal"
    title="Ganti Password Akun"
    @close="closePasswordModal"
  >
    <form @submit.prevent="submitChangePassword" class="space-y-4">
      <div v-if="passwordModalError" class="rounded-xl bg-rose-50 p-3 text-[12px] font-semibold text-rose-600">
        {{ passwordModalError }}
      </div>

      <div v-if="passwordSuccessMessage" class="rounded-xl bg-emerald-50 p-3 text-[12px] font-semibold text-emerald-600">
        {{ passwordSuccessMessage }}
      </div>

      <div>
        <label class="block text-[11px] font-bold uppercase tracking-wider text-[#7C8BAC] mb-1">Password Saat Ini *</label>
        <input
          v-model="passwordForm.currentPassword"
          type="password"
          required
          placeholder="Masukkan password Anda saat ini"
          class="w-full rounded-xl border border-[#E5EAEF] bg-[#F8FAFC] px-3 py-2 text-[13px] text-[#2A3547] focus:outline-none focus:border-[#5D87FF]"
        />
      </div>

      <div>
        <label class="block text-[11px] font-bold uppercase tracking-wider text-[#7C8BAC] mb-1">Password Baru (min 8 karakter) *</label>
        <input
          v-model="passwordForm.newPassword"
          type="password"
          required
          minlength="8"
          placeholder="Masukkan password baru"
          class="w-full rounded-xl border border-[#E5EAEF] bg-[#F8FAFC] px-3 py-2 text-[13px] text-[#2A3547] focus:outline-none focus:border-[#5D87FF]"
        />
      </div>

      <div>
        <label class="block text-[11px] font-bold uppercase tracking-wider text-[#7C8BAC] mb-1">Konfirmasi Password Baru *</label>
        <input
          v-model="passwordForm.confirmPassword"
          type="password"
          required
          minlength="8"
          placeholder="Ketik ulang password baru"
          class="w-full rounded-xl border border-[#E5EAEF] bg-[#F8FAFC] px-3 py-2 text-[13px] text-[#2A3547] focus:outline-none focus:border-[#5D87FF]"
        />
      </div>

      <div class="flex items-center justify-end gap-2 pt-4 border-t border-[#E5EAEF]">
        <button
          type="button"
          @click="closePasswordModal"
          class="rounded-xl border border-[#E5EAEF] px-4 py-2 text-[12px] font-bold text-[#7C8BAC] hover:bg-gray-50 transition-all cursor-pointer"
        >
          Batal
        </button>
        <button
          type="submit"
          :disabled="isSubmittingPassword"
          class="rounded-xl bg-[#5D87FF] px-4 py-2 text-[12px] font-bold text-white shadow-md hover:bg-[#4570EA] transition-all cursor-pointer disabled:opacity-60"
        >
          {{ isSubmittingPassword ? 'Menyimpan...' : 'Simpan Password Baru' }}
        </button>
      </div>
    </form>
  </AppModal>
</template>

<style scoped>
.sidebar-backdrop-enter-active,
.sidebar-backdrop-leave-active {
  transition: opacity 0.2s ease;
}
.sidebar-backdrop-enter-from,
.sidebar-backdrop-leave-to {
  opacity: 0;
}
</style>
