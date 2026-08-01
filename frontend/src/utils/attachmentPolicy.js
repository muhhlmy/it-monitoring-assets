export const ALLOWED_ATTACHMENT_MIME_TYPES = Object.freeze([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
])

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024

export function validateAttachmentFile(file) {
  if (!file || !ALLOWED_ATTACHMENT_MIME_TYPES.includes(file.type)) {
    return 'Lampiran harus berupa PNG, JPEG, GIF, atau WebP.'
  }

  if (!Number.isFinite(file.size) || file.size < 0 || file.size > MAX_ATTACHMENT_BYTES) {
    return 'Ukuran lampiran maksimal 5 MiB.'
  }

  return null
}
