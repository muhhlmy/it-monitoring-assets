export function isCorsOriginAllowed(origin, configuredOrigins) {
  if (!origin) {
    return true
  }

  return configuredOrigins.includes(origin)
}
