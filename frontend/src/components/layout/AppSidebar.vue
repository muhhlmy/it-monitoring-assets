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

// Password Modal State
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

// State Expanded Parent Menu
const expandedParents = ref({
  asset_management: true,
  helpdesk: true,
  master_data: true,
  sistem: true,
})

// State Teleport Floating Popover & Tooltip (Collapsed Rail Mode)
const activeFlyoutParent = ref(null)
const flyoutPos = ref({ top: 0, left: 0 })

const hoveredTooltipLabel = ref('')
const tooltipPos = ref({ top: 0, left: 0 })

const profilePopoverRef = ref(null)
const profileBtnRef = ref(null)
const showProfilePopover = ref(false)
const profilePopoverPos = ref({ top: 0, left: 0 })
const popoverPlacement = ref('up')

let closeFlyoutTimer = null

function handleParentClick(parent, event) {
  if (props.isCollapsed) {
    if (activeFlyoutParent.value?.key === parent.key) {
      activeFlyoutParent.value = null
    } else {
      openFlyout(parent, event)
    }
  } else {
    toggleParent(parent.key)
  }
}

function handleParentMouseEnter(parent, event) {
  if (!props.isCollapsed) return
  if (closeFlyoutTimer) clearTimeout(closeFlyoutTimer)
  openFlyout(parent, event)
}

function handleParentMouseLeave() {
  if (!props.isCollapsed) return
  closeFlyoutTimer = setTimeout(() => {
    activeFlyoutParent.value = null
  }, 200)
}

function cancelCloseFlyout() {
  if (closeFlyoutTimer) clearTimeout(closeFlyoutTimer)
}

function openFlyout(parent, event) {
  const btn = event.currentTarget
  if (!btn) return
  const rect = btn.getBoundingClientRect()
  flyoutPos.value = {
    top: Math.max(10, Math.min(rect.top, window.innerHeight - 180)),
    left: rect.right + 8,
  }
  activeFlyoutParent.value = parent
}

function handleDirectMouseEnter(item, event) {
  if (!props.isCollapsed) return
  const btn = event.currentTarget
  if (!btn) return
  const rect = btn.getBoundingClientRect()
  tooltipPos.value = {
    top: rect.top + rect.height / 2,
    left: rect.right + 10,
  }
  hoveredTooltipLabel.value = item.label
}

function handleDirectMouseLeave() {
  hoveredTooltipLabel.value = ''
}

function toggleProfilePopover(event) {
  if (showProfilePopover.value) {
    showProfilePopover.value = false
    return
  }
  const btn = event?.currentTarget || profileBtnRef.value
  if (!btn) return
  profileBtnRef.value = btn

  // Calculate position synchronously first frame
  calcPopoverPosition(btn)
  showProfilePopover.value = true

  // Refine using exact DOM measurements
  nextTick(() => {
    calcPopoverPosition(btn)
  })
}

function calcPopoverPosition(btn) {
  if (!btn) return
  const rect = btn.getBoundingClientRect()
  const viewportHeight = window.innerHeight
  const viewportWidth = window.innerWidth
  const gap = 8

  const popoverEl = profilePopoverRef.value
  const popoverHeight = popoverEl ? popoverEl.offsetHeight : 138
  const popoverWidth = popoverEl ? popoverEl.offsetWidth : 208

  let left = props.isCollapsed ? rect.right + gap : rect.left

  if (left + popoverWidth > viewportWidth - 12) {
    left = viewportWidth - popoverWidth - 12
  }
  if (left < 12) left = 12

  const spaceBelow = viewportHeight - rect.bottom
  let top
  let placement = 'down'

  if (spaceBelow < popoverHeight + gap && rect.top > popoverHeight + gap) {
    placement = 'up'
    top = rect.top - popoverHeight - gap
  } else {
    placement = 'down'
    top = rect.bottom + gap
  }

  if (top + popoverHeight > viewportHeight - 12) {
    top = viewportHeight - popoverHeight - 12
  }
  if (top < 12) {
    top = 12
  }

  popoverPlacement.value = placement
  profilePopoverPos.value = {
    top: Math.round(top),
    left: Math.round(left),
  }
}

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
    activeFlyoutParent.value = null
    hoveredTooltipLabel.value = ''
    showProfilePopover.value = false
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
              to: '/assets-ga',
              label: 'Aset GA',
              icon: 'domain',
              permission: 'assets',
              badge: 'Soon',
            },
            {
              to: '/assets-ops',
              label: 'Aset Ops',
              icon: 'precision_manufacturing',
              permission: 'assets',
              badge: 'Soon',
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
              label: 'Karyawan',
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

function handleClickOutside(event) {
  if (!showProfilePopover.value) return
  const popoverEl = profilePopoverRef.value
  const btnEl = profileBtnRef.value
  if (
    popoverEl &&
    !popoverEl.contains(event.target) &&
    btnEl &&
    !btnEl.contains(event.target)
  ) {
    showProfilePopover.value = false
  }
}

function handleWindowResize() {
  if (showProfilePopover.value && profileBtnRef.value) {
    calcPopoverPosition(profileBtnRef.value)
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  document.addEventListener('click', handleClickOutside, true)
  window.addEventListener('resize', handleWindowResize)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('click', handleClickOutside, true)
  window.removeEventListener('resize', handleWindowResize)
})
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

  <!-- Sidebar Component (Expanded: 245px, Collapsed Rail: 74px) -->
  <aside
    id="app-navigation"
    ref="sidebarRef"
    :role="isMobileOpen ? 'dialog' : undefined"
    :aria-modal="isMobileOpen ? 'true' : undefined"
    aria-label="Navigasi aplikasi"
    class="fixed inset-y-0 left-0 z-40 flex h-dvh shrink-0 flex-col border-r border-[#E5EAEF] bg-white text-[#2A3547] shadow-xl transition-all duration-300 ease-in-out lg:static lg:z-10 lg:shadow-none select-none"
    :class="[
      isMobileOpen ? 'w-[250px] translate-x-0 visible opacity-100' : '-translate-x-full lg:translate-x-0',
      isCollapsed ? 'lg:w-[74px]' : 'lg:w-[245px]'
    ]"
  >
    <!-- ── Brand Logo Top Header Area ── -->
    <div
      class="relative flex h-[56px] shrink-0 items-center border-b border-[#F1F5F9] transition-all"
      :class="isCollapsed ? 'justify-center flex-col gap-1 px-0 py-1' : 'justify-between gap-2 px-3.5'"
    >
      <!-- Logo saat Expanded -->
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

      <!-- Logo Mark + Control Button saat Collapsed Navigation Rail -->
      <template v-else>
        <div class="flex items-center justify-center gap-1.5 w-full px-1">
          <RouterLink
            to="/dashboard"
            title="Kembali ke Dashboard"
            class="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-[#ECF2FF] transition-all cursor-pointer shrink-0"
          >
            <img
              src="/ESB Logo.svg"
              alt="ESB Logo"
              class="h-6 w-6 object-left object-cover shrink-0 block"
            />
          </RouterLink>

          <button
            type="button"
            aria-label="Perluas Sidepanel"
            title="Perluas Sidebar"
            class="flex h-6 w-6 items-center justify-center rounded-md text-[#7C8BAC] hover:bg-[#ECF2FF] hover:text-[#5D87FF] transition-all cursor-pointer shrink-0"
            @click="emit('toggle-collapse')"
          >
            <span aria-hidden="true" class="material-symbols-outlined text-[16px]">chevron_right</span>
          </button>
        </div>
      </template>

      <!-- Toggle Button Desktop (Saat Expanded) -->
      <button
        v-if="!isCollapsed"
        ref="closeButtonRef"
        type="button"
        aria-label="Ciutkan Sidepanel"
        title="Ciutkan Sidebar"
        class="hidden lg:flex h-7 w-7 items-center justify-center rounded-lg text-[#7C8BAC] hover:bg-[#ECF2FF] hover:text-[#5D87FF] transition-all cursor-pointer shrink-0"
        @click="emit('toggle-collapse')"
      >
        <span aria-hidden="true" class="material-symbols-outlined text-[18px]">menu_open</span>
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

    <!-- ── Sidebar Scrollable Menu / Navigation Rail Container ── -->
    <div
      class="relative flex-1 overflow-y-auto py-3 transition-all"
      :class="isCollapsed ? 'px-0 space-y-3' : 'px-2.5 space-y-4'"
    >
      <div v-for="group in menuGroups" :key="group.title" :class="isCollapsed ? 'space-y-2' : 'space-y-1'">
        <!-- Category Title (Hanya di Expanded Mode) -->
        <p
          v-if="!isCollapsed"
          class="px-2 text-[10.5px] font-extrabold uppercase tracking-wider text-[#7C8BAC] transition-all"
        >
          {{ group.title }}
        </p>

        <nav :class="isCollapsed ? 'flex flex-col items-center gap-1.5' : 'space-y-0.5'">
          
          <!-- 1. Direct Items (e.g. Dashboard) -->
          <template v-if="group.items && group.items.length">
            <div
              v-for="item in group.items"
              :key="item.to"
              class="relative"
              :class="isCollapsed ? 'flex justify-center w-full' : ''"
              @mouseenter="handleDirectMouseEnter(item, $event)"
              @mouseleave="handleDirectMouseLeave"
            >
              <RouterLink
                :to="item.to"
                class="group flex items-center transition-all duration-150 relative cursor-pointer"
                :class="[
                  isCollapsed
                    ? 'h-10 w-10 justify-center rounded-xl'
                    : 'w-full gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px]',
                  route.path === item.to
                    ? 'bg-[#5D87FF] text-white shadow-xs font-semibold'
                    : 'text-[#2A3547] hover:bg-[#ECF2FF] hover:text-[#5D87FF] font-medium'
                ]"
                @click="emit('close-mobile')"
              >
                <span
                  aria-hidden="true"
                  class="material-symbols-outlined transition-colors shrink-0"
                  :class="[
                    isCollapsed ? 'text-[20px]' : 'text-[18px]',
                    route.path === item.to ? 'text-white' : 'text-[#7C8BAC] group-hover:text-[#5D87FF]'
                  ]"
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
            </div>
          </template>

          <!-- 2. Parent Menus (Expandable di Expanded Mode, Floating Popover di Collapsed Mode) -->
          <template v-if="group.parents && group.parents.length">
            <div
              v-for="parent in group.parents"
              :key="parent.key"
              class="relative"
              :class="isCollapsed ? 'flex justify-center w-full' : 'space-y-0.5'"
              @mouseenter="handleParentMouseEnter(parent, $event)"
              @mouseleave="handleParentMouseLeave"
            >
              <!-- Parent Menu Trigger Button -->
              <button
                type="button"
                class="group flex items-center transition-all duration-150 cursor-pointer select-none"
                :class="[
                  isCollapsed
                    ? 'h-10 w-10 justify-center rounded-xl'
                    : 'w-full gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] font-semibold justify-between',
                  parent.items.some(child => route.path === child.to)
                    ? (isCollapsed ? 'bg-[#ECF2FF] text-[#5D87FF]' : 'text-[#2A3547] bg-[#F8FAFC]')
                    : 'text-[#2A3547] hover:bg-[#F8FAFC] hover:text-[#5D87FF]'
                ]"
                @click="handleParentClick(parent, $event)"
              >
                <div class="flex items-center gap-2.5 min-w-0" :class="isCollapsed ? 'justify-center' : ''">
                  <span
                    aria-hidden="true"
                    class="material-symbols-outlined transition-colors shrink-0"
                    :class="[
                      isCollapsed ? 'text-[20px]' : 'text-[18px]',
                      parent.items.some(child => route.path === child.to)
                        ? 'text-[#5D87FF]'
                        : 'text-[#7C8BAC] group-hover:text-[#5D87FF]'
                    ]"
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

              <!-- Expanded Mode Submenu Items -->
              <div
                v-if="!isCollapsed"
                v-show="isParentExpanded(parent.key)"
                class="pl-5 space-y-0.5 mt-0.5 transition-all"
              >
                <RouterLink
                  v-for="sub in parent.items"
                  :key="sub.to"
                  :to="sub.to"
                  class="group flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] transition-all duration-150 relative"
                  :class="
                    route.path === sub.to
                      ? 'bg-[#ECF2FF] text-[#5D87FF] font-bold shadow-2xs border-l-2 border-[#5D87FF] rounded-r-lg'
                      : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#5D87FF] font-medium'
                  "
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

                  <span class="min-w-0 flex-1 leading-none whitespace-nowrap">
                    {{ sub.label }}
                  </span>
                </RouterLink>
              </div>

            </div>
          </template>
        </nav>
      </div>
    </div>

    <!-- ── Bottom User Profile Section ── -->
    <div class="relative p-2 border-t border-[#F1F5F9]">
      <!-- Expanded Mode User Profile Compact Control -->
      <div v-if="!isCollapsed">
        <button
          ref="profileBtnRef"
          type="button"
          @click="toggleProfilePopover($event)"
          class="flex w-full items-center justify-between gap-2 rounded-xl p-2 text-left hover:bg-[#F8FAFC] transition-colors cursor-pointer select-none group"
        >
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#2563EB] text-xs font-bold text-white shadow-2xs">
              {{ (user && user.nama ? user.nama.charAt(0) : 'U').toUpperCase() }}
            </div>
            <div class="min-w-0">
              <p class="text-xs font-bold text-[#0F172A] truncate leading-tight">{{ user?.nama || 'Pengguna' }}</p>
              <p class="text-[10.5px] font-normal text-[#64748B] truncate leading-tight capitalize">{{ user?.role || 'User' }}</p>
            </div>
          </div>
          <span class="material-symbols-outlined text-[16px] text-[#94A3B8] group-hover:text-[#0F172A] shrink-0">unfold_more</span>
        </button>
      </div>

      <!-- Collapsed Mode Navigation Rail User Avatar Button -->
      <div v-else class="relative flex flex-col items-center">
        <button
          ref="profileBtnRef"
          type="button"
          @click="toggleProfilePopover($event)"
          title="Profil & Pengaturan"
          class="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2563EB] text-xs font-bold text-white shadow-2xs hover:scale-105 transition-all cursor-pointer"
        >
          {{ (user && user.nama ? user.nama.charAt(0) : 'U').toUpperCase() }}
        </button>
      </div>
    </div>
  </aside>

  <!-- ── Teleport Flyout Popovers & Tooltips for Collapsed Navigation Rail ── -->
  <Teleport to="body">
    <!-- Parent Menu Flyout Popover -->
    <div
      v-if="isCollapsed && activeFlyoutParent"
      class="fixed z-[9999] w-[195px] rounded-xl border border-[#E2E8F0] bg-white p-2 shadow-2xl transition-all select-none animate-in fade-in zoom-in-95 duration-150"
      :style="{ top: `${flyoutPos.top}px`, left: `${flyoutPos.left}px` }"
      @mouseenter="cancelCloseFlyout"
      @mouseleave="handleParentMouseLeave"
    >
      <div class="px-2 py-1.5 border-b border-[#F1F5F9] mb-1">
        <p class="text-[10.5px] font-extrabold uppercase tracking-wider text-[#7C8BAC]">{{ activeFlyoutParent.label }}</p>
      </div>
      <div class="space-y-0.5">
        <RouterLink
          v-for="sub in activeFlyoutParent.items"
          :key="sub.to"
          :to="sub.to"
          class="group flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11.5px] transition-all cursor-pointer"
          :class="
            route.path === sub.to
              ? 'bg-[#EFF6FF] text-[#2563EB] font-bold'
              : 'text-[#2A3547] hover:bg-[#F8FAFC] hover:text-[#2563EB] font-medium'
          "
          @click="activeFlyoutParent = null; emit('close-mobile')"
        >
          <span aria-hidden="true" class="material-symbols-outlined text-[16px] shrink-0" :class="route.path === sub.to ? 'text-[#2563EB]' : 'text-[#7C8BAC] group-hover:text-[#2563EB]'">
            {{ sub.icon }}
          </span>
          <span class="truncate">{{ sub.label }}</span>
        </RouterLink>
      </div>
    </div>

    <!-- Direct Item Tooltip -->
    <div
      v-if="isCollapsed && hoveredTooltipLabel"
      class="fixed z-[9999] -translate-y-1/2 whitespace-nowrap rounded-md bg-[#1E293B] px-2.5 py-1 text-[11px] font-bold text-white shadow-md pointer-events-none"
      :style="{ top: `${tooltipPos.top}px`, left: `${tooltipPos.left}px` }"
    >
      {{ hoveredTooltipLabel }}
    </div>

    <!-- User Profile Popover -->
    <Transition :name="popoverPlacement === 'up' ? 'popover-up' : 'popover-down'">
      <div
        v-if="showProfilePopover"
        ref="profilePopoverRef"
        class="fixed z-[9999] w-52 rounded-2xl border border-[#E2E8F0] bg-white p-1.5 shadow-xl select-none outline-none"
        :style="{ top: `${profilePopoverPos.top}px`, left: `${profilePopoverPos.left}px` }"
      >
        <div class="px-3 py-2 border-b border-[#F1F5F9] mb-1">
          <p class="truncate text-xs font-bold text-[#0F172A]">{{ user?.nama || 'Pengguna' }}</p>
          <p class="truncate text-[11px] text-[#64748B] capitalize mt-0.5">{{ user?.role || 'Guest' }} {{ user?.nik ? '· ' + user.nik : '' }}</p>
        </div>
        <div class="space-y-0.5">
          <button
            type="button"
            @click="showProfilePopover = false; openChangePassword()"
            class="w-full flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs font-medium text-[#334155] hover:bg-[#F8FAFC] transition-colors cursor-pointer"
          >
            <span class="material-symbols-outlined text-[16px] text-[#64748B]">key</span>
            <span>Ganti Password</span>
          </button>
          <div class="my-1 border-t border-[#F1F5F9]"></div>
          <button
            type="button"
            @click="showProfilePopover = false; logout()"
            class="w-full flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
          >
            <span class="material-symbols-outlined text-[16px]">logout</span>
            <span>Keluar</span>
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>

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

/* User Profile Popover Directional Animations */
.popover-up-enter-active,
.popover-up-leave-active {
  transition: opacity 150ms cubic-bezier(0.2, 0.8, 0.2, 1), transform 150ms cubic-bezier(0.2, 0.8, 0.2, 1);
  transform-origin: bottom left;
}
.popover-up-enter-from,
.popover-up-leave-to {
  opacity: 0;
  transform: translateY(4px) scale(0.96);
}

.popover-down-enter-active,
.popover-down-leave-active {
  transition: opacity 150ms cubic-bezier(0.2, 0.8, 0.2, 1), transform 150ms cubic-bezier(0.2, 0.8, 0.2, 1);
  transform-origin: top left;
}
.popover-down-enter-from,
.popover-down-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.96);
}
</style>
