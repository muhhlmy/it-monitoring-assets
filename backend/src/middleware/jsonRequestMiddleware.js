const JSON_BODY_METHODS = new Set(['PATCH', 'POST', 'PUT'])

export function requireJsonRequest(req, res, next) {
  if (!JSON_BODY_METHODS.has(req.method)) {
    next()
    return
  }

  const contentType = req.headers['content-type']
  if (typeof contentType !== 'string') {
    res.status(415).json({ message: 'Request body wajib menggunakan application/json.' })
    return
  }

  // Allow multipart/form-data for file uploads (backup restore, etc.)
  if (contentType.startsWith('multipart/form-data')) {
    next()
    return
  }

  if (!/^application\/json(?:\s*;\s*charset\s*=\s*utf-8\s*)?$/i.test(contentType)) {
    res.status(415).json({ message: 'Request body wajib menggunakan application/json.' })
    return
  }

  next()
}
