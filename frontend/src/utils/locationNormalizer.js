/**
 * Utility normalisasi lokasi terpusat (Frontend)
 */

export const LOCATION_MAP = Object.freeze({
  PL: 'Pluit',
  GS: 'Gading Serpong',
})

/**
 * Mengubah kode atau string lokasi ke nama display resmi.
 *
 * Contoh:
 * - "PL" => "Pluit"
 * - "GS" => "Gading Serpong"
 * - "GS / PL" => "Gading Serpong / Pluit"
 * - "PL / GS" => "Pluit / Gading Serpong"
 * - " PL " => "Pluit"
 * - "gs/pl" => "Gading Serpong / Pluit"
 *
 * @param {string} rawLocation
 * @returns {string}
 */
export function normalizeLocation(rawLocation) {
  if (rawLocation === null || rawLocation === undefined) {
    return ''
  }

  const str = String(rawLocation).trim()
  if (!str) {
    return ''
  }

  const segments = str.split('/')
  const normalizedSegments = segments
    .map((segment) => {
      const trimmed = segment.trim()
      if (!trimmed) return ''

      const upperKey = trimmed.toUpperCase()
      if (Object.prototype.hasOwnProperty.call(LOCATION_MAP, upperKey)) {
        return LOCATION_MAP[upperKey]
      }

      return trimmed
    })
    .filter(Boolean)

  return normalizedSegments.join(' / ')
}
