// I segni dentro una riga, riconosciuti senza React.
//
// `Testo` li disegna; qui si decide soltanto cosa sono: un grassetto, un
// corsivo, un pezzo di codice, il numerino di una citazione, un link. Stare
// fuori dal componente serve a due cose: si prova sotto `node --test`, e la
// regola di sicurezza è scritta in un posto solo e si vede.
//
// La regola: niente HTML. Quello che il modello scrive resta testo, anche
// quando scrive «<script>»: React lo mette in pagina come lettere, e qui non
// esiste un pezzo che sia «HTML grezzo». Un link diventa link solo se
// l'indirizzo è http, https o mailto; un «javascript:» resta la sua parola.
// Il link si apre fuori, nel browser: lo fa il guscio (`desktop/finestra.ts`,
// `setWindowOpenHandler`), che lascia passare solo quei protocolli.
//
//   node --test src/segni-chat.test.ts

export type Pezzo =
  | { tipo: 'testo'; testo: string }
  | { tipo: 'grassetto'; dentro: Pezzo[] }
  | { tipo: 'corsivo'; dentro: Pezzo[] }
  | { tipo: 'codice'; testo: string }
  | { tipo: 'link'; testo: string; url: string }
  /** `prima`/`dopo`: un altro numerino attaccato da quel lato («[1][2]»). */
  | { tipo: 'segno'; n: number | 'M'; prima: boolean; dopo: boolean }

/** L'indirizzo, se si può aprire senza rischi; altrimenti null. */
export function urlSicuro(url: string): string | null {
  const u = url.trim()
  if (!/^(https?:\/\/|mailto:)/i.test(u)) return null
  try {
    const x = new URL(u)
    if (x.protocol !== 'http:' && x.protocol !== 'https:' && x.protocol !== 'mailto:') return null
    return x.href
  } catch {
    return null
  }
}

const GRASSETTO = String.raw`\*\*(.+?)\*\*`
const CORSIVO = String.raw`(?<!\*)\*(?!\s)(.+?)(?<!\s)\*(?!\*)`
const CODICE = '`(.+?)`'
// prima della citazione: «[il listino](https://…)» non è il numerino «[il listino]»
const LINK = String.raw`\[([^\]\n]+)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)`
const CITAZIONE = String.raw`\[(\d{1,3}|M)\]`
// un indirizzo scritto nudo: la punteggiatura in coda è della frase, non del link
const NUDO = String.raw`(https?:\/\/[^\s<>()\[\]]*[^\s<>()\[\].,;:!?'"’”])`

/**
 * I pezzi di una riga.
 *
 * `link` falso: le carte e la lista, che non hanno mai avuto link e restano
 * com'erano. Vero: la chat.
 */
export function pezzi(testo: string, link = false): Pezzo[] {
  const re = new RegExp(link
    ? `${GRASSETTO}|${CORSIVO}|${CODICE}|${LINK}|${CITAZIONE}|${NUDO}`
    : `${GRASSETTO}|${CORSIVO}|${CODICE}|${CITAZIONE}`, 'g')
  // i gruppi cambiano posto se il link non c'è
  const g = link
    ? { grassetto: 1, corsivo: 2, codice: 3, linkTesto: 4, linkUrl: 5, citazione: 6, nudo: 7 }
    : { grassetto: 1, corsivo: 2, codice: 3, linkTesto: 0, linkUrl: 0, citazione: 4, nudo: 0 }
  const fuori: Pezzo[] = []
  const spingiTesto = (t: string) => {
    if (!t) return
    const ultimo = fuori[fuori.length - 1]
    if (ultimo?.tipo === 'testo') ultimo.testo += t
    else fuori.push({ tipo: 'testo', testo: t })
  }
  let ultimo = 0
  let fineSegno = -1
  let m: RegExpExecArray | null
  while ((m = re.exec(testo))) {
    if (m.index > ultimo) spingiTesto(testo.slice(ultimo, m.index))
    const fine = m.index + m[0].length
    if (m[g.grassetto] !== undefined) fuori.push({ tipo: 'grassetto', dentro: pezzi(m[g.grassetto]!, link) })
    else if (m[g.corsivo] !== undefined) fuori.push({ tipo: 'corsivo', dentro: pezzi(m[g.corsivo]!, link) })
    else if (m[g.codice] !== undefined) fuori.push({ tipo: 'codice', testo: m[g.codice]! })
    else if (g.linkTesto && m[g.linkTesto] !== undefined) {
      const url = urlSicuro(m[g.linkUrl]!)
      const parola = m[g.linkTesto]!.trim()
      if (url) fuori.push({ tipo: 'link', testo: parola || url, url })
      else spingiTesto(parola)
    } else if (m[g.citazione] !== undefined) {
      const c = m[g.citazione]!
      fuori.push({
        tipo: 'segno', n: c === 'M' ? 'M' : Number(c),
        prima: m.index === fineSegno,
        dopo: /^\[(?:\d{1,3}|M)\]/.test(testo.slice(fine))
      })
      fineSegno = fine
    } else if (g.nudo && m[g.nudo] !== undefined) {
      const url = urlSicuro(m[g.nudo]!)
      if (url) fuori.push({ tipo: 'link', testo: m[g.nudo]!, url })
      else spingiTesto(m[g.nudo]!)
    }
    ultimo = fine
  }
  if (ultimo < testo.length) spingiTesto(testo.slice(ultimo))
  return fuori
}

/**
 * Quello che finisce negli appunti col bottone «Copia» sotto una risposta.
 *
 * Il testo com'è scritto, Markdown compreso (incollato in una mail o in un
 * documento si legge, e in un editor torna formattato), senza i numerini
 * delle citazioni: «[1]» fuori dall'app non porta da nessuna parte.
 */
export function testoDaCopiare(testo: string): string {
  return testo
    .replace(/[ \t]*\[(?:\d{1,3}|M)\](?!\()/g, '')
    .trim()
}
