<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

const props = defineProps({
  isOpen: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])
const route = useRoute()
const sidebarRef = ref(null)
const closeButtonRef = ref(null)
let previouslyFocusedElement = null

const mainMenu = [
  { to: '/', label: 'Dashboard', icon: 'space_dashboard', caption: 'Ringkasan sistem' },
  { to: '/assets', label: 'Aset IT', icon: 'devices', caption: 'Inventaris perangkat' },
  { to: '/submissions', label: 'Pengajuan', icon: 'assignment_turned_in', caption: 'Serah terima aset' },
  { to: '/users', label: 'Pengguna', icon: 'group', caption: 'Akses pengguna' },
  { to: '/logs', label: 'Log Aktivitas', icon: 'receipt_long', caption: 'Riwayat & audit log' },
]

function getFocusableElements() {
  if (!sidebarRef.value) return []
  return Array.from(sidebarRef.value.querySelectorAll(
    'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ))
}

function handleKeydown(event) {
  if (!props.isOpen) return
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
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
  () => props.isOpen,
  async (isOpen) => {
    if (isOpen) {
      previouslyFocusedElement = document.activeElement
      await nextTick()
      closeButtonRef.value?.focus()
    } else if (previouslyFocusedElement) {
      previouslyFocusedElement.focus?.()
      previouslyFocusedElement = null
    }
  },
)

onMounted(() => document.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <Transition name="sidebar-backdrop">
    <button
      v-if="isOpen"
      type="button"
      aria-label="Tutup navigasi"
      tabindex="-1"
      class="fixed inset-0 z-30 bg-[#07101f]/60 backdrop-blur-sm lg:hidden"
      @click="emit('close')"
    ></button>
  </Transition>

  <aside
    id="app-navigation"
    ref="sidebarRef"
    :role="isOpen ? 'dialog' : undefined"
    :aria-modal="isOpen ? 'true' : undefined"
    aria-label="Navigasi aplikasi"
    class="fixed inset-y-0 left-0 z-40 flex h-dvh w-[268px] max-w-[86vw] shrink-0 flex-col overflow-hidden border-r border-white/5 bg-[#0b1425] text-white shadow-2xl transition-[transform,visibility] duration-200 lg:static lg:z-10 lg:w-[252px] lg:max-w-none lg:translate-x-0 lg:visible lg:shadow-none"
    :class="isOpen ? 'visible translate-x-0' : 'invisible -translate-x-full'"
  >
    <div aria-hidden="true" class="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-brand/15 blur-3xl"></div>

    <div class="relative flex h-[76px] shrink-0 items-center gap-3 border-b border-white/[0.07] px-5">
      <div class="flex h-10 w-10 items-center justify-center rounded-[14px] bg-gradient-to-br from-[#0188EA] to-[#0252B3] shadow-[0_8px_24px_rgba(2,82,179,0.3)]">
        <span aria-hidden="true" class="material-symbols-outlined text-[21px] text-white">inventory_2</span>
      </div>
      <div class="min-w-0">
        <h1 class="text-[14px] font-extrabold tracking-[-0.02em] text-white">AssetWise</h1>
        <p class="mt-0.5 text-[10px] font-medium tracking-wide text-white/40">IT ASSET MANAGEMENT</p>
      </div>
      <button
        ref="closeButtonRef"
        type="button"
        aria-label="Tutup navigasi"
        class="ml-auto flex h-9 w-9 items-center justify-center rounded-xl text-white/50 hover:bg-white/10 hover:text-white lg:hidden"
        @click="emit('close')"
      >
        <span aria-hidden="true" class="material-symbols-outlined text-[19px]">close</span>
      </button>
    </div>

    <div class="relative flex-1 overflow-y-auto px-3 py-6">
      <p class="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-white/30">Menu Utama</p>
      <nav aria-label="Navigasi utama" class="space-y-1.5">
        <RouterLink
          v-for="item in mainMenu"
          :key="item.to"
          :to="item.to"
          class="group flex min-h-[52px] items-center gap-3 rounded-[14px] px-3.5 transition-all duration-150"
          :class="route.path === item.to
            ? 'bg-[#0252B3] text-white shadow-[0_4px_12px_rgba(2,82,179,0.2)] border-l-4 border-[#FC841B] pl-2.5'
            : 'text-white/55 hover:bg-white/[0.06] hover:text-white'"
          @click="emit('close')"
        >
          <span
            aria-hidden="true"
            class="material-symbols-outlined text-[21px]"
            :class="route.path === item.to ? 'text-white' : 'text-white/45 group-hover:text-white/80'"
          >{{ item.icon }}</span>
          <span class="min-w-0 flex-1">
            <span class="block text-[12px] font-bold leading-none">{{ item.label }}</span>
            <span class="mt-1 block text-[9px] font-medium leading-none" :class="route.path === item.to ? 'text-white/65' : 'text-white/30'">{{ item.caption }}</span>
          </span>
          <span v-if="route.path === item.to" aria-hidden="true" class="material-symbols-outlined text-[16px] text-white/70">chevron_right</span>
        </RouterLink>
      </nav>
    </div>

    <div class="relative border-t border-white/[0.07] p-3">
   
      <div class="flex items-center gap-3 rounded-[14px] px-2 py-2">
        <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#FAA425] to-[#FC841B] text-[12px] font-extrabold text-white shadow-lg shadow-orange-950/10">A</div>
        <div class="min-w-0 flex-1">
          <p class="truncate text-[11px] font-bold text-white">Admin IT</p>
          <p class="mt-0.5 truncate text-[9px] text-white/35">Administrator</p>
        </div>
        <span aria-hidden="true" class="material-symbols-outlined text-[17px] text-white/30">more_vert</span>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar-backdrop-enter-active,
.sidebar-backdrop-leave-active { transition: opacity 0.2s ease; }
.sidebar-backdrop-enter-from,
.sidebar-backdrop-leave-to { opacity: 0; }
</style>
