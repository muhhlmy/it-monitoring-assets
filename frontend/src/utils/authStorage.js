const AUTH_TOKEN_KEY = 'token'
const AUTH_USER_KEY = 'user'

function getStorage(name) {
  if (typeof window === 'undefined') return null

  try {
    return window[name] || null
  } catch {
    return null
  }
}

function safeGetItem(storage, key) {
  if (!storage) return null

  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

function safeRemoveItem(storage, key) {
  if (!storage) return

  try {
    storage.removeItem(key)
  } catch {
    // Storage dapat dinonaktifkan browser; sesi tetap gagal tertutup.
  }
}

function clearStorage(storage) {
  safeRemoveItem(storage, AUTH_TOKEN_KEY)
  safeRemoveItem(storage, AUTH_USER_KEY)
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readStorage(storage, persistent) {
  const token = safeGetItem(storage, AUTH_TOKEN_KEY)
  const rawUser = safeGetItem(storage, AUTH_USER_KEY)

  if (token === null && rawUser === null) return null
  if (typeof token !== 'string' || !token.trim() || typeof rawUser !== 'string') {
    clearStorage(storage)
    return null
  }

  try {
    const user = JSON.parse(rawUser)
    if (!isPlainObject(user)) {
      clearStorage(storage)
      return null
    }

    return { token, user, persistent }
  } catch {
    clearStorage(storage)
    return null
  }
}

export function getAuthSnapshot() {
  const session = readStorage(getStorage('sessionStorage'), false)
  if (session) return session

  const persistent = readStorage(getStorage('localStorage'), true)
  if (persistent) return persistent

  return { token: null, user: null, persistent: false }
}

export function getAuthToken() {
  return getAuthSnapshot().token
}

export function getStoredUser() {
  return getAuthSnapshot().user
}

export function clearAuthSession() {
  clearStorage(getStorage('sessionStorage'))
  clearStorage(getStorage('localStorage'))
}

export function storeAuthSession({ token, user, remember = false } = {}) {
  if (typeof token !== 'string' || !token.trim() || !isPlainObject(user)) {
    throw new TypeError('Data sesi autentikasi tidak valid.')
  }

  const storage = getStorage(remember ? 'localStorage' : 'sessionStorage')
  if (!storage) {
    throw new Error('Penyimpanan sesi tidak tersedia pada browser ini.')
  }

  const serializedUser = JSON.stringify(user)
  clearAuthSession()

  try {
    storage.setItem(AUTH_TOKEN_KEY, token)
    storage.setItem(AUTH_USER_KEY, serializedUser)
  } catch (error) {
    clearStorage(storage)
    throw new Error('Sesi tidak dapat disimpan pada browser ini.', { cause: error })
  }

  return true
}
