import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import { AppError, ERROR_CODES } from '../errors/AppError.js'

export function requestIdMiddleware(req, res, next) {
  const reqId = req.headers['x-request-id'] || randomUUID()
  req.requestId = reqId
  res.setHeader('X-Request-ID', reqId)
  next()
}

function getErrorCodeForStatus(statusCode) {
  switch (statusCode) {
    case 400: return ERROR_CODES.BAD_REQUEST
    case 401: return ERROR_CODES.AUTHENTICATION_REQUIRED
    case 403: return ERROR_CODES.FORBIDDEN
    case 404: return ERROR_CODES.RESOURCE_NOT_FOUND
    case 409: return ERROR_CODES.CONFLICT
    case 413: return ERROR_CODES.PAYLOAD_TOO_LARGE
    case 415: return ERROR_CODES.UNSUPPORTED_MEDIA_TYPE
    case 429: return ERROR_CODES.RATE_LIMITED
    default: return ERROR_CODES.INTERNAL_SERVER_ERROR
  }
}

export function globalErrorHandler(err, req, res, next) {
  const requestId = req.requestId || res.getHeader('X-Request-ID') || randomUUID()

  let statusCode = 500
  let errorCode = ERROR_CODES.INTERNAL_SERVER_ERROR
  let message = 'Terjadi kesalahan pada server.'
  let details = undefined

  if (err instanceof AppError) {
    statusCode = err.statusCode
    errorCode = err.code || getErrorCodeForStatus(statusCode)
    message = err.message
    details = err.details || undefined
  } else if (
    (err instanceof SyntaxError || err?.name === 'SyntaxError') &&
    (err?.status === 400 || err?.statusCode === 400) &&
    ('body' in err || 'type' in err)
  ) {
    statusCode = 400
    errorCode = ERROR_CODES.BAD_REQUEST
    message = 'Format JSON tidak valid.'
  } else if (err && typeof err === 'object' && typeof err.statusCode === 'number') {
    statusCode = err.statusCode
    errorCode = err.code || getErrorCodeForStatus(statusCode)
    message = err.message || 'Permintaan gagal.'
    details = err.details || undefined
  } else if (err?.status === 413 || err?.statusCode === 413) {
    statusCode = 413
    errorCode = ERROR_CODES.PAYLOAD_TOO_LARGE
    message = 'Payload melebihi batas yang diizinkan.'
  } else if (err?.code === '23505') {
    statusCode = 409
    errorCode = ERROR_CODES.CONFLICT
    let field = 'Data'
    const constraint = String(err.constraint || '').toLowerCase()
    const detail = String(err.detail || '').toLowerCase()

    if (constraint.includes('email') || detail.includes('email')) {
      field = 'Email'
    } else if (constraint.includes('nik') || detail.includes('nik')) {
      field = 'NIK'
    } else if (constraint.includes('nomor_seri') || detail.includes('nomor_seri')) {
      field = 'Nomor seri'
    } else if (constraint.includes('label') || detail.includes('label')) {
      field = 'Label aset'
    } else if (constraint.includes('kode') || detail.includes('kode')) {
      field = 'Kode unit'
    }
    message = `${field} sudah digunakan.`
  } else if (err?.code === '23514') {
    statusCode = 400
    errorCode = ERROR_CODES.VALIDATION_ERROR
    message = 'Data tidak memenuhi validasi aturan sistem (check constraint).'
  } else if (err?.message && err.message.includes('Hard delete is prohibited')) {
    statusCode = 400
    errorCode = ERROR_CODES.BAD_REQUEST
    message = 'Penghapusan data secara permanen (hard delete) dilarang oleh sistem. Gunakan metode soft-delete.'
  } else {
    // Log unexpected errors securely server-side only
    const timestamp = new Date().toISOString()
    const errorLog =
      `[${timestamp}] SERVER ERROR [ReqID: ${requestId}] [${req.method} ${req.path}]:\n` +
      `Message: ${err?.message || 'Unknown'}\n` +
      `Stack: ${(err?.stack || 'No stack').substring(0, 1000)}\n`
    try {
      fs.appendFileSync('./error_log.log', errorLog)
    } catch {}
    console.error(errorLog)
  }

  const responseBody = {
    error: {
      code: errorCode,
      message,
      ...(details ? { details } : {}),
      requestId,
    },
    message,
  }

  res.status(statusCode).json(responseBody)
}

export function apiNotFoundHandler(req, res, next) {
  if (req.path.startsWith('/api')) {
    return next(new AppError(ERROR_CODES.RESOURCE_NOT_FOUND, 'Endpoint API tidak ditemukan.', 404))
  }
  next()
}
