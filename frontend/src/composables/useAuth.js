import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useApi } from './useApi'
import {
  TICKET_ROLES,
  canAccessFrontendFeature,
  canWritePermission,
  getTicketEligibility,
} from '../utils/permissionAccess.js'
import { clearAuthSession, getAuthSnapshot, storeAuthSession } from '../utils/authStorage.js'

// State global menggunakan ref (bisa juga pakai Pinia)
const initialSession = getAuthSnapshot()
const user = ref(initialSession.user)
const token = ref(initialSession.token)

export function useAuth() {
  const api = useApi()
  const router = useRouter()

  const isAuthenticated = computed(() => !!token.value)
  const ticketEligibility = computed(() => getTicketEligibility(user.value))
  const isSuperAdmin = computed(() => ticketEligibility.value.role === TICKET_ROLES.SUPERADMIN)
  const isAdmin = computed(
    () =>
      ticketEligibility.value.role === TICKET_ROLES.ADMIN ||
      ticketEligibility.value.role === TICKET_ROLES.SUPERADMIN,
  )
  const isUser = computed(() => ticketEligibility.value.role === TICKET_ROLES.REPORTER)

  const login = async (email, password, remember = false) => {
    const response = await api.post('/api/auth/login', { email, password })

    storeAuthSession({
      token: response.token,
      user: response.user,
      remember,
    })

    token.value = response.token
    user.value = response.user

    return response
  }

  const logout = () => {
    token.value = null
    user.value = null
    clearAuthSession()
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
    if (!featureKey) return false
    if (featureKey === 'tickets') return ticketEligibility.value.canWrite
    if (isSuperAdmin.value) return true
    if (featureKey === 'export') return false
    const perms = user.value.permissions
    if (perms && typeof perms === 'object') {
      return canWritePermission(perms[featureKey])
    }
    return false
  }

  const refreshUser = async () => {
    if (!token.value) return null
    try {
      const freshUser = await api.get('/api/auth/me')
      user.value = freshUser
      storeAuthSession({
        token: token.value,
        user: freshUser,
        remember: initialSession.persistent,
      })
      return freshUser
    } catch (err) {
      console.error('Failed to refresh user profile:', err)
      return user.value
    }
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
    getProfile,
    refreshUser,
  }
}
