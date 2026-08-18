const API_BASE_URL = process.env.E2E_API_URL || 'http://localhost:5000'

export async function loginViaApi(request, email, password) {
  const response = await request.post(`${API_BASE_URL}/api/auth/login`, {
    data: { email, password },
  })
  if (!response.ok()) {
    throw new Error(`Login API failed for ${email}: ${response.status()} ${await response.text()}`)
  }
  return response.json()
}

export async function createAssetViaApi(request, token, assetData) {
  const response = await request.post(`${API_BASE_URL}/api/assets`, {
    headers: { Authorization: `Bearer ${token}` },
    data: assetData,
  })
  if (!response.ok()) {
    throw new Error(`Create Asset API failed: ${response.status()} ${await response.text()}`)
  }
  return response.json()
}

export async function createTicketViaApi(request, token, ticketData) {
  const response = await request.post(`${API_BASE_URL}/api/tickets`, {
    headers: { Authorization: `Bearer ${token}` },
    data: ticketData,
  })
  if (!response.ok()) {
    throw new Error(`Create Ticket API failed: ${response.status()} ${await response.text()}`)
  }
  return response.json()
}

export async function deleteAssetViaApi(request, token, id) {
  const response = await request.delete(`${API_BASE_URL}/api/assets/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return response.ok()
}
