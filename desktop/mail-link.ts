/** A Mail deep link names one RFC message-id; never a compose command or file. */
export function mailMessageLink(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 600 || !value.startsWith('message://')) return false
  try {
    const id = decodeURIComponent(value.slice('message://'.length))
    return /^<[A-Za-z0-9._+\-]+@[A-Za-z0-9.\-]+>$/.test(id)
  } catch { return false }
}
