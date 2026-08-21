/**
 * Utility Formatting Mata Uang Rupiah (Currency Formatter)
 */

/**
 * Format angka numerik menjadi string mata uang Rupiah (contoh: 15000000 => "Rp 15.000.000")
 * @param {number|string} amount
 * @param {object} options
 * @returns {string}
 */
export function formatCurrency(amount, { prefix = 'Rp ', fallback = 'Rp 0' } = {}) {
  if (amount === null || amount === undefined || amount === '') return fallback
  const num = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(/[^0-9.-]+/g, ''))
  if (isNaN(num)) return fallback

  const formatted = new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(num)

  return `${prefix}${formatted}`
}

/**
 * Parsing input string currency menjadi angka numerik murni (contoh: "Rp 15.000.000" => 15000000)
 * @param {string|number} input
 * @returns {number}
 */
export function parseCurrency(input) {
  if (input === null || input === undefined || input === '') return 0
  if (typeof input === 'number') return isNaN(input) ? 0 : input

  // Hapus semua karakter selain angka dan tanda minus/desimal
  const cleaned = String(input)
    .replace(/[^\d,-]/g, '')
    .replace(',', '.')

  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? 0 : parsed
}
