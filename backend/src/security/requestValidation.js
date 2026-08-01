import { Buffer } from 'node:buffer'

export const USER_NAME_MAX_LENGTH = 150
export const USER_EMAIL_MAX_LENGTH = 150
export const NEW_PASSWORD_MIN_LENGTH = 12
export const NEW_PASSWORD_MAX_BYTES = 72
export const MAX_USER_QUEUE_IDS = 100

const SIMPLE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u

export function createHttpError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

export function assertPlainObject(value, message = 'Payload harus berupa object JSON.') {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  ) {
    throw createHttpError(400, message)
  }
}

export function assertAllowedFields(body, allowedFields, label = 'Payload') {
  const allowed = allowedFields instanceof Set ? allowedFields : new Set(allowedFields)
  const unknownField = Object.keys(body).find((field) => !allowed.has(field))
  if (unknownField) {
    throw createHttpError(400, `${label} memiliki field yang tidak diizinkan: ${unknownField}.`)
  }
}

export function parseRequiredName(value) {
  if (typeof value !== 'string') {
    throw createHttpError(400, 'Nama wajib berupa string.')
  }

  const normalized = value.trim()
  if (!normalized) throw createHttpError(400, 'Nama wajib diisi.')
  if (normalized.length > USER_NAME_MAX_LENGTH || CONTROL_CHARACTER_PATTERN.test(normalized)) {
    throw createHttpError(400, `Nama maksimal ${USER_NAME_MAX_LENGTH} karakter tanpa karakter kontrol.`)
  }
  return normalized
}

export function parseRequiredEmail(value) {
  if (typeof value !== 'string') {
    throw createHttpError(400, 'Email wajib berupa string.')
  }

  const normalized = value.trim().toLowerCase()
  if (
    !normalized ||
    normalized.length > USER_EMAIL_MAX_LENGTH ||
    CONTROL_CHARACTER_PATTERN.test(normalized) ||
    !SIMPLE_EMAIL_PATTERN.test(normalized)
  ) {
    throw createHttpError(400, 'Format email tidak valid.')
  }
  return normalized
}

export function parseNewPassword(value, { required = true } = {}) {
  if (value === undefined && !required) return undefined
  if (typeof value !== 'string') {
    throw createHttpError(400, 'Password wajib berupa string.')
  }

  const characterLength = Array.from(value).length
  const byteLength = Buffer.byteLength(value, 'utf8')
  if (
    characterLength < NEW_PASSWORD_MIN_LENGTH ||
    byteLength > NEW_PASSWORD_MAX_BYTES ||
    value.trim().length === 0 ||
    CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    throw createHttpError(
      400,
      `Password baru minimal ${NEW_PASSWORD_MIN_LENGTH} karakter dan maksimal ${NEW_PASSWORD_MAX_BYTES} byte tanpa karakter kontrol.`,
    )
  }
  return value
}

export function parseOptionalBoolean(value, fieldLabel) {
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') {
    throw createHttpError(400, `${fieldLabel} wajib berupa boolean.`)
  }
  return value
}

export function parsePositiveInteger(value, fieldLabel) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw createHttpError(400, `${fieldLabel} tidak valid.`)
  }
  return value
}

export function parsePositiveIntegerParam(value, fieldLabel) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw createHttpError(400, `${fieldLabel} tidak valid.`)
  }

  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) {
    throw createHttpError(400, `${fieldLabel} tidak valid.`)
  }
  return parsed
}

export function parseQueueIds(value, { required = false } = {}) {
  if (value === undefined && !required) return undefined
  if (!Array.isArray(value) || value.length > MAX_USER_QUEUE_IDS) {
    throw createHttpError(
      400,
      `queue_ids wajib berupa array dengan maksimal ${MAX_USER_QUEUE_IDS} item.`,
    )
  }

  const parsed = value.map((queueId) => parsePositiveInteger(queueId, 'Queue ID'))
  if (new Set(parsed).size !== parsed.length) {
    throw createHttpError(400, 'queue_ids tidak boleh berisi ID duplikat.')
  }
  return parsed
}
