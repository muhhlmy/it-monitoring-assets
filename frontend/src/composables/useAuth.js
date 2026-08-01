import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useApi } from './useApi'
import {
  TICKET_ROLES,
  canAccessFrontendFeature,
  canWritePermission,
  getTicketEligibility,
} from '../utils/permissionAccess.js'

// State global menggunakan ref (bisa juga pakai Pinia)
const user = ref(JSON.parse(localStorage.getItem('user')) || null)
const token = ref(localStorage.getItem('token') || null)

export function useAuth() {
  const api = useApi()
  const router = useRouter()

  const isAuthenticated = computed(() => !!token.value)
  const ticketEligibility = computed(() => getTicketEligibility(user.value))
  const isSuperAdmin = computed(
    () => ticketEligibility.value.role === TICKET_ROLES.SUPERADMIN,
  )
  const isAdmin = computed(
    () =>
      ticketEligibility.value.role === TICKET_ROLES.ADMIN ||
      ticketEligibility.value.role === TICKET_ROLES.SUPERADMIN,
  )
  const isUser = computed(
    () => ticketEligibility.value.role === TICKET_ROLES.REPORTER,
  )

  const login = async (email, password) => {
    const response = await api.post('/api/auth/login', { email, password })

    // Simpan ke state
    token.value = response.token
    user.value = response.user

    // Simpan ke localStorage
    localStorage.setItem('token', response.token)
    localStorage.setItem('user', JSON.stringify(response.user))

    return response
  }

  const logout = () => {
    token.value = null
    user.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    router.push('/login')
  }

  const getProfile = () => {
    return user.value
  }

  // Returns true if the user has AT LEAST 'read_only' access to the feature
  const hasPermission = (featureKey) => {
    if (!token.value || !user.value) return false
    return canAccessFrontendFeature(user.value, featureKey)
  }

  // Returns true only if the user has 'full' (CRUD) access to the feature
  const hasWritePermission = (featureKey) => {
    if (!token.value || !user.value) return false
    if (featureKey === 'tickets') return ticketEligibility.value.canWrite
    if (isSuperAdmin.value) return true
    if (featureKey === 'export') return false
    if (!featureKey) return true
    const perms = user.value.permissions
    if (perms && typeof perms === 'object') {
      return canWritePermission(perms[featureKey])
    }
    return false
  }

  return {
    user,
    token,
    isAuthenticated,
    isSuperAdmin,
    isAdmin,
    isUser,
    hasPermission,
    hasWritePermission,
    login,
    logout,
    getProfile
  }
}
