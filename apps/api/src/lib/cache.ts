/** Redis TTL with ±10% jitter (architecture rule). */
export function jitteredTtl(baseSeconds: number): number {
  const deviation = baseSeconds * 0.1
  const jitter = (Math.random() * 2 - 1) * deviation
  return Math.floor(baseSeconds + jitter)
}
