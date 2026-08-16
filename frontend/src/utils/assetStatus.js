/**
 * Centralized Asset Status Configuration & Helper Utilities
 * Internal DB Values: 'In Use', 'Stock', 'Damaged', 'In Service', 'Disposal'
 * Indonesian Display Labels: 'Digunakan', 'Stok', 'Rusak', 'Dalam Perawatan', 'Disposal'
 */

export const ASSET_STATUSES = [
  { value: 'In Use', label: 'Digunakan' },
  { value: 'Stock', label: 'Stok' },
  { value: 'In Service', label: 'Dalam Perawatan' },
  { value: 'Damaged', label: 'Rusak' },
  { value: 'Disposal', label: 'Disposal' },
]

export const ASSET_STATUS_MAP = {
  'In Use': {
    label: 'Digunakan',
    bg: 'bg-[#EFF6FF]',
    text: 'text-[#2563EB]',
    dot: 'bg-[#2563EB]',
    border: 'border-[#BFDBFE]/60',
  },
  'Stock': {
    label: 'Stok',
    bg: 'bg-[#ECFDF5]',
    text: 'text-[#059669]',
    dot: 'bg-[#059669]',
    border: 'border-[#A7F3D0]/60',
  },
  'In Service': {
    label: 'Dalam Perawatan',
    bg: 'bg-[#FFFBEB]',
    text: 'text-[#D97706]',
    dot: 'bg-[#D97706]',
    border: 'border-[#FDE68A]/60',
  },
  'Damaged': {
    label: 'Rusak',
    bg: 'bg-[#FEF2F2]',
    text: 'text-[#DC2626]',
    dot: 'bg-[#DC2626]',
    border: 'border-[#FECACA]/60',
  },
  'Disposal': {
    label: 'Disposal',
    bg: 'bg-[#F8FAFC]',
    text: 'text-[#64748B]',
    dot: 'bg-[#64748B]',
    border: 'border-[#CBD5E1]/60',
  },
}

/**
 * Get Indonesian display label for a raw status string
 * @param {string} status - Raw DB status ('In Use', 'Stock', 'In Service', 'Damaged', 'Disposal')
 * @returns {string} Indonesian display label ('Digunakan', 'Stok', 'Dalam Perawatan', etc.)
 */
export function getAssetStatusLabel(status) {
  if (!status) return '—'
  const s = String(status).trim().toLowerCase()
  const foundKey = Object.keys(ASSET_STATUS_MAP).find(
    (k) => k.toLowerCase() === s || (s === 'stok' && k === 'Stock') || (s === 'maintenance' && k === 'In Service')
  )
  if (foundKey) return ASSET_STATUS_MAP[foundKey].label
  return status
}

/**
 * Get full pill formatting styling object for UI status badge
 * @param {string} status - Raw DB status
 * @returns {object} { label, bg, text, dot, border }
 */
export function formatStatusPill(status) {
  if (!status) {
    return {
      label: '—',
      bg: 'bg-[#F8FAFC]',
      text: 'text-[#64748B]',
      dot: 'bg-[#64748B]',
      border: 'border-[#CBD5E1]/60',
    }
  }
  const s = String(status).trim().toLowerCase()
  const foundKey = Object.keys(ASSET_STATUS_MAP).find(
    (k) => k.toLowerCase() === s || (s === 'stok' && k === 'Stock') || (s === 'maintenance' && k === 'In Service')
  )
  if (foundKey) return ASSET_STATUS_MAP[foundKey]
  return {
    label: status,
    bg: 'bg-[#F8FAFC]',
    text: 'text-[#64748B]',
    dot: 'bg-[#64748B]',
    border: 'border-[#CBD5E1]/60',
  }
}
