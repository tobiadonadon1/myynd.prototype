/** Decode the top-level answer while a structured tool response is arriving.
 * Never expose JSON syntax/tool arguments, or an incomplete escape/surrogate. */
export function testoParziale(json: string): string {
  let i = 0
  const spaces = () => { while (/\s/.test(json[i] ?? '') && i < json.length) i++ }
  const string = (): { value: string; complete: boolean } => {
    i++
    let value = ''
    while (i < json.length) {
      const c = json[i++]
      if (c === '"') return { value, complete: true }
      if (c === '\\') {
        if (i >= json.length) break
        const e = json[i++]
        const escapes: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' }
        if (e === 'u') {
          const digits = json.slice(i, i + 4)
          if (!/^[0-9a-f]{4}$/i.test(digits)) break
          value += String.fromCharCode(parseInt(digits, 16)); i += 4
        } else if (e in escapes) value += escapes[e]
        else break
      } else if (c.charCodeAt(0) < 32) break
      else value += c
    }
    if (/[\uD800-\uDBFF]$/.test(value)) value = value.slice(0, -1)
    return { value, complete: false }
  }
  spaces()
  if (json[i++] !== '{') return ''
  while (i < json.length) {
    spaces()
    if (json[i] !== '"') return ''
    const key = string()
    if (!key.complete) return ''
    spaces(); if (json[i++] !== ':') return ''; spaces()
    if (key.value === 'text') return json[i] === '"' ? string().value : ''
    // Skip other top-level fields, including nested objects and strings.
    let depth = 0
    while (i < json.length) {
      const c = json[i]
      if (c === '"') { if (!string().complete) return ''; continue }
      if (c === '[' || c === '{') depth++
      else if (c === ']' || c === '}') { if (depth === 0) return ''; depth-- }
      else if (c === ',' && depth === 0) { i++; break }
      i++
    }
  }
  return ''
}
