// ============================================================
// useApi.js - Helper untuk Komunikasi ke Backend API
// ============================================================
// "Composable" di Vue adalah fungsi yang bisa digunakan
// kembali di banyak komponen. File ini menyediakan
// fungsi-fungsi untuk mengirim request ke backend kita.
//
// Cara pakai di komponen Vue:
//   import { useApi } from '@/composables/useApi.js'
//   const { get, post, put, del } = useApi()
// ============================================================

// Kosong secara default agar deployment dapat memakai origin yang sama.
// Pada development, request /api diteruskan oleh proxy Vite ke backend.
import { clearAuthSession, getAuthToken } from '../utils/authStorage.js'

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')

function createUrl(endpoint) {
  if (!endpoint.startsWith('/')) {
    throw new Error('Endpoint API harus diawali dengan karakter "/".')
  }

  return `${BASE_URL}${endpoint}`
}

async function parseResponse(response) {
  if (response.status === 204) return null

  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return response.json().catch(() => null)
  }

  const text = await response.text()
  return text || null
}

export function useApi() {

  async function request(endpoint, options = {}) {
    let response
    const { withResponse = false, ...fetchOptions } = options

    const token = getAuthToken()
    const customHeaders = {
      Accept: 'application/json',
      ...fetchOptions.headers,
    }

    if (token) {
      customHeaders['Authorization'] = `Bearer ${token}`
    }

    try {
      response = await fetch(createUrl(endpoint), {
        ...fetchOptions,
        headers: customHeaders,
      })
    } catch (error) {
      throw new Error('Tidak dapat terhubung ke server. Periksa koneksi dan coba lagi.', {
        cause: error,
      })
    }

    const payload = await parseResponse(response)

    if (response.status === 401) {
      // Token kedaluwarsa, tidak valid, ATAU kredensial login salah
      clearAuthSession()
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
      
      const message = payload?.message || 'Sesi telah berakhir, silakan login kembali.'
      throw new Error(message)
    }

    if (!response.ok) {
      const message =
        payload && typeof payload === 'object' && 'message' in payload
          ? payload.message
          : `Permintaan gagal (HTTP ${response.status})`
      throw new Error(message)
    }

    return withResponse ? { data: payload, response } : payload
  }

  // ----------------------------------------------------------
  // GET — Mengambil data dari API
  // Contoh: get('/api/assets') → mengambil semua aset
  // ----------------------------------------------------------
  async function get(endpoint, options = {}) {
    return request(endpoint, { ...options, method: 'GET' })
  }

  // ----------------------------------------------------------
  // POST — Mengirim data baru ke API
  // Contoh: post('/api/assets', { label_aset: 'ESB-LAP-001' })
  // ----------------------------------------------------------
  async function post(endpoint, data) {
    return request(endpoint, {
      method: 'POST',
      headers: {
        // Beritahu server bahwa kita mengirim data dalam format JSON
        'Content-Type': 'application/json',
      },
      // JSON.stringify() mengubah object JavaScript → string JSON
      body: JSON.stringify(data),
    })
  }

  // ----------------------------------------------------------
  // PUT — Mengupdate data yang sudah ada
  // Contoh: put('/api/assets/1', { label_aset: 'ESB-LAP-001' })
  // ----------------------------------------------------------
  async function put(endpoint, data) {
    return request(endpoint, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })
  }

  // ----------------------------------------------------------
  // DEL — Menghapus data dari API
  // Fungsi ini dinamai "del" bukan "delete" karena
  // "delete" adalah kata kunci (reserved word) di JavaScript
  // Contoh: del('/api/assets/ASSET-001')
  // ----------------------------------------------------------
  async function del(endpoint) {
    return request(endpoint, {
      method: 'DELETE',
    })
  }

  // Kembalikan semua fungsi agar bisa digunakan di komponen
  return { get, post, put, del }
}
