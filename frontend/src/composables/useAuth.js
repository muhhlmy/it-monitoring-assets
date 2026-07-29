import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useApi } from './useApi'

// State global menggunakan ref (bisa juga pakai Pinia)
const user = ref(JSON.parse(localStorage.getItem('user')) || null)
const token = ref(localStorage.getItem('token') || null)

export function useAuth() {
  const api = useApi()
  const router = useRouter()

  const isAuthenticated = computed(() => !!token.value)
  const userRole = computed(() => (user.value?.role || '').trim().toLowerCase())
  const isSuperAdmin = computed(() => userRole.value === 'super admin' || userRole.value === 'superadmin')
  const isAdmin = computed(() => userRole.value === 'admin' || isSuperAdmin.value)
  const isUser = computed(() => userRole.value === 'user')

  const login = async (email, password) => {
    try {
      const response = await api.post('/api/auth/login', { email, password })
      
      // Simpan ke state
      token.value = response.token
      user.value = response.user

      // Simpan ke localStorage
      localStorage.setItem('token', response.token)
      localStorage.setItem('user', JSON.stringify(response.user))

      return response
    } catch (error) {
      throw error
    }
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
    if (isSuperAdmin.value) return true
    if (!featureKey) return true
    const perms = user.value.permissions
    if (perms && typeof perms === 'object') {
      const level = perms[featureKey]
      // Support both new string levels and legacy boolean values
      if (level === 'full' || level === 'read_only') return true
      if (level === true) return true   // legacy boolean
      return false
    }
    return false
  }

  // Returns true only if the user has 'full' (CRUD) access to the feature
  const hasWritePermission = (featureKey) => {
    if (!token.value || !user.value) return false
    if (isSuperAdmin.value) return true
    if (!featureKey) return true
    const perms = user.value.permissions
    if (perms && typeof perms === 'object') {
      const level = perms[featureKey]
      if (level === 'full') return true
      if (level === true) return true   // legacy boolean mapped to full
      return false
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
