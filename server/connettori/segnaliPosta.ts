/** Mail provider metadata, kept consistently across Gmail and Outlook. */
export function postaAutomatica(headers: { name?: string; value?: string }[] = []): boolean {
  const h = new Map(headers.map(x => [(x.name ?? '').toLowerCase(), (x.value ?? '').trim().toLowerCase()]))
  return h.has('list-unsubscribe') || h.has('list-id') ||
    /^(bulk|list|junk)\b/.test(h.get('precedence') ?? '') ||
    (!!h.get('auto-submitted') && h.get('auto-submitted') !== 'no')
}
