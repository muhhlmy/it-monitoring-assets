const API_BASE_URL = process.env.E2E_API_URL || 'http://localhost:5000'

export async function cleanupE2ETestData(request, token) {
  if (!token) return

  try {
    const assetsRes = await request.get(`${API_BASE_URL}/api/assets`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (assetsRes.ok()) {
      const assets = await assetsRes.json()
      if (Array.isArray(assets)) {
        const e2eAssets = assets.filter(
          (a) =>
            (a.hostname && a.hostname.includes('E2E')) ||
            (a.serial_number && a.serial_number.includes('E2E')) ||
            (a.note_asset && a.note_asset.includes('E2E')),
        )

        for (const asset of e2eAssets) {
          await request.delete(`${API_BASE_URL}/api/assets/${asset.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
        }
      }
    }
  } catch (err) {
    console.warn('Cleanup non-fatal warning:', err.message)
  }
}
