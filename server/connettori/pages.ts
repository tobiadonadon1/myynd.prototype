// Il testo di un documento Pages.
//
// «Myynd has the job of reading what I'm actually working on: the code work,
// the pages document, my Claude chats, everything.» Fino al 22 settembre
// 2026 i `.pages` restavano fuori di proposito: dentro non c'è XML, c'è un
// archivio binario di Apple, e il giudizio era che aprirlo volesse un
// pacchetto in più che sbaglia spesso. Ma il formato è meno chiuso di quanto
// sembri, e il testo sta in un posto solo.
//
// Com'è fatto un `.pages` di oggi: uno zip (le cartelle-pacchetto sono del
// 2013 e prima), con dentro `Index/Document.iwa`. Un `.iwa` è una fila di
// pezzi, ognuno con quattro byte davanti — un tipo, sempre zero, e la
// lunghezza su tre byte — e dentro un blocco Snappy senza cornice. Aperti e
// messi in fila, i pezzi sono una sequenza di messaggi protobuf, ognuno
// preceduto da un `ArchiveInfo` che dice di che tipo è e quanto è lungo. Il
// testo del documento sta nei messaggi di tipo 2001, `TSWP.StorageArchive`,
// nel campo 3: stringhe UTF-8, così come le ha scritte lui.
//
// Niente librerie: Snappy si legge in cinquanta righe e un protobuf, se non
// serve capirlo tutto, in trenta. Un file che non torna — un formato vecchio,
// un pezzo storto — dà una stringa vuota, mai un'eccezione: un documento che
// non si legge è un documento in meno, non una lettura ferma.

/** Il tipo del messaggio che tiene il testo: `TSWP.StorageArchive`. */
const TESTO = 2001

/** Un intero a lunghezza variabile, da `buf` a partire da `i`. */
function varint(buf: Uint8Array, i: number): [number, number] {
  let valore = 0
  let molt = 1
  for (let n = 0; n < 10 && i < buf.length; n++) {
    const b = buf[i++]
    valore += (b & 0x7f) * molt
    if (b < 0x80) return [valore, i]
    molt *= 128
  }
  throw new Error('varint storto')
}

/**
 * Snappy senza cornice: il blocco grezzo, come lo scrive `snappy::Compress`.
 *
 * In testa la lunghezza finale, poi letterali e copie. Le copie possono
 * sovrapporsi a quello che stanno scrivendo — è così che Snappy dice «ripeti
 * questa lettera cento volte» — quindi si copiano un byte alla volta.
 */
export function snappy(src: Uint8Array): Uint8Array {
  let [lunghezza, i] = varint(src, 0)
  const out = new Uint8Array(lunghezza)
  let o = 0
  while (i < src.length) {
    const tag = src[i++]
    const tipo = tag & 3
    if (tipo === 0) {
      let len = tag >> 2
      if (len >= 60) {
        const byte = len - 59
        len = 0
        for (let k = 0; k < byte; k++) len |= src[i + k] << (8 * k)
        i += byte
      }
      len += 1
      if (o + len > out.length || i + len > src.length) throw new Error('snappy: letterale fuori misura')
      out.set(src.subarray(i, i + len), o)
      i += len; o += len
      continue
    }
    let len: number, off: number
    if (tipo === 1) { len = 4 + ((tag >> 2) & 7); off = ((tag >> 5) << 8) | src[i++] }
    else if (tipo === 2) { len = (tag >> 2) + 1; off = src[i] | (src[i + 1] << 8); i += 2 }
    else { len = (tag >> 2) + 1; off = (src[i] | (src[i + 1] << 8) | (src[i + 2] << 16) | (src[i + 3] << 24)) >>> 0; i += 4 }
    if (!off || off > o || o + len > out.length) throw new Error('snappy: copia fuori misura')
    for (let k = 0; k < len; k++) out[o + k] = out[o - off + k]
    o += len
  }
  if (o !== lunghezza) throw new Error('snappy: lunghezza sbagliata')
  return out
}

/** Un `.iwa` aperto: i pezzi decompressi, uno dopo l'altro. */
export function apriIwa(buf: Uint8Array): Uint8Array {
  const pezzi: Uint8Array[] = []
  let i = 0
  while (i + 4 <= buf.length) {
    const tipo = buf[i]
    const len = buf[i + 1] | (buf[i + 2] << 8) | (buf[i + 3] << 16)
    i += 4
    if (tipo !== 0 || i + len > buf.length) throw new Error('iwa: pezzo storto')
    pezzi.push(snappy(buf.subarray(i, i + len)))
    i += len
  }
  const tot = pezzi.reduce((n, p) => n + p.length, 0)
  const tutto = new Uint8Array(tot)
  let o = 0
  for (const p of pezzi) { tutto.set(p, o); o += p.length }
  return tutto
}

type Campo = { n: number; tipo: number; valore: number; byte?: Uint8Array }

/** I campi di un messaggio protobuf, senza sapere cosa vogliono dire. */
function campi(buf: Uint8Array): Campo[] {
  const fuori: Campo[] = []
  let i = 0
  while (i < buf.length) {
    let chiave: number
    ;[chiave, i] = varint(buf, i)
    const n = Math.floor(chiave / 8)
    const tipo = chiave & 7
    if (tipo === 0) { let v: number; [v, i] = varint(buf, i); fuori.push({ n, tipo, valore: v }) }
    else if (tipo === 1) { i += 8; fuori.push({ n, tipo, valore: 0 }) }
    else if (tipo === 5) { i += 4; fuori.push({ n, tipo, valore: 0 }) }
    else if (tipo === 2) {
      let len: number
      ;[len, i] = varint(buf, i)
      if (i + len > buf.length) throw new Error('protobuf: campo fuori misura')
      fuori.push({ n, tipo, valore: len, byte: buf.subarray(i, i + len) })
      i += len
    } else throw new Error(`protobuf: tipo ${tipo} non previsto`)
  }
  return fuori
}

/**
 * I messaggi di un `.iwa` aperto, con il loro tipo.
 *
 * Ogni oggetto è un `ArchiveInfo` preceduto dalla sua lunghezza, e poi tanti
 * messaggi quanti ne elenca (campo 2, `MessageInfo`: tipo nel campo 1,
 * lunghezza nel campo 3), uno dietro l'altro.
 */
export function messaggi(dati: Uint8Array): { tipo: number; corpo: Uint8Array }[] {
  const fuori: { tipo: number; corpo: Uint8Array }[] = []
  let i = 0
  while (i < dati.length) {
    let len: number
    ;[len, i] = varint(dati, i)
    const info = campi(dati.subarray(i, i + len))
    i += len
    for (const m of info.filter(c => c.n === 2 && c.byte)) {
      const dentro = campi(m.byte!)
      const tipo = dentro.find(c => c.n === 1)?.valore ?? 0
      const lunghezza = dentro.find(c => c.n === 3)?.valore ?? 0
      fuori.push({ tipo, corpo: dati.subarray(i, i + lunghezza) })
      i += lunghezza
    }
  }
  return fuori
}

const decodifica = new TextDecoder('utf-8', { fatal: false })

/**
 * Il testo, ripulito dei segni che Pages ci mette dentro.
 *
 * U+FFFC è il posto di un oggetto (un'immagine, una tabella), U+2028 un a capo
 * dentro il paragrafo, U+2029 e U+0004/U+0005 le fini di pagina e di sezione.
 */
function pulito(s: string): string {
  return s
    .replace(/\uFFFC/g, '')
    .replace(/[\u2028\u2029\u0004\u0005\u000b\u000c]/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Il testo di un `Document.iwa`: tutte le storie di testo, la più lunga prima (è il corpo). */
export function testoDaIwa(buf: Uint8Array): string {
  const storie: string[] = []
  for (const m of messaggi(apriIwa(buf))) {
    if (m.tipo !== TESTO) continue
    const testo = campi(m.corpo).filter(c => c.n === 3 && c.byte).map(c => decodifica.decode(c.byte)).join('')
    const t = pulito(testo)
    if (t) storie.push(t)
  }
  return storie.sort((a, b) => b.length - a.length).join('\n\n')
}

/**
 * Il testo di un file `.pages`, dal suo contenuto.
 *
 * Una cartella-pacchetto (Pages del 2013 e prima) qui arriva come niente: chi
 * cammina le cartelle non la apre come un file. Uno zip senza `Document.iwa`,
 * o con un pezzo storto, torna vuoto.
 */
export async function testoDaPages(buf: Buffer): Promise<string> {
  try {
    const { default: JSZip } = await import('jszip')
    const zip = await JSZip.loadAsync(buf)
    const doc = zip.file('Index/Document.iwa')
    if (!doc) return ''
    return testoDaIwa(await doc.async('uint8array'))
  } catch {
    return ''
  }
}
