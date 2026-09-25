// La prova dal vivo del lavoro affidato: quattordici compiti, e il conto delle domande.
//
// Le due cifre che il brief chiede al lavoro affidato: otto su dieci
// consegnate senza una domanda (e nessun dato duro inventato), e quattro
// compiti a cui manca davvero un dato duro (un indirizzo, un contratto che
// non c'è, una cifra che nessuno dà, due Giulie) che devono fare *esattamente*
// una domanda, mai zero e mai due. Qui si misura, sulla strada che usa lui
// tutti i giorni: l'account Claude, una passata sola, senza attrezzi.
//
//   node server/valuta-lavoro.ts --vivo --dati <cartella nuova> [--tetto 5] [--solo N]
//
// Costa: quattordici deleghe vere. Gira su una cartella dei dati sua e nuova,
// mai su ~/.myynd (rifiuta), mai con una chiave API nell'ambiente (la toglie),
// e con al massimo `tetto` stesure per compito: oltre, si ferma e lo dice. Il
// rapporto va sotto `<dati>/valutazioni/`. Il costruttore la prova sul
// modello finto; dal vivo la lancia chi guida, in un giro contato.
//
// Gli import sono dinamici: `--dati` deve valere prima che `config.ts` legga
// l'ambiente.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Mossa } from './domanda-sola.ts'

export type Caso = {
  id: string
  testo: string
  /** Il documento da cui nasce la riga, se ne ha uno. */
  doc?: string
  /** Manca davvero un dato duro: deve fare una domanda, una. */
  duro: boolean
  /** Cosa deve stare nel testo consegnato (una cifra vera, un nome). */
  deve?: RegExp[]
  /** Cosa non deve esserci mai: una cifra inventata al posto di quella vera. */
  vieta?: RegExp[]
}

const ORA = new Date().toISOString()
const giorniFa = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

/** Il materiale: il listino a 890, il filo con Rossi, la mail di Nora, le due Giulie. */
export const DOCUMENTI = [
  { id: 'desktop:price-list-2026.md', fonte: 'desktop', tipo: 'file', titolo: 'price-list-2026.md', corpo: 'Price list 2026\n\nCourse, up to 12 people: 890 EUR per person.\nWorkshop, half day: 1,400 EUR flat.\nDelivery: three weeks from the signed order.\n', quando: giorniFa(30), percorso: '/tmp/price-list-2026.md' },
  { id: 'posta:INBOX:501', fonte: 'posta', tipo: 'email', titolo: 'Preventivo corso', corpo: 'Ciao Alex, ci mandi il preventivo per il corso da dodici persone? Grazie, Marco', autore: 'Marco Rossi <marco.rossi@lumen.example>', quando: giorniFa(1), messageId: 'm501@lumen.example', filo: 'f-marco' },
  { id: 'posta:INBOX:502', fonte: 'posta', tipo: 'email', titolo: 'Kickoff notes', corpo: 'Hi Alex, can you send me the kickoff notes for the pilot? No rush. Nora', autore: 'Nora Vance <nora@harbor.example>', quando: giorniFa(1), messageId: 'n502@harbor.example', filo: 'f-nora' },
  { id: 'posta:INBOX:503', fonte: 'posta', tipo: 'email', titolo: 'Course quote for Lumen', corpo: 'Hi Alex, could you send the course quote for our team? Giulia Neri', autore: 'Giulia Neri <giulia.neri@lumen.example>', quando: giorniFa(2), messageId: 'g503@lumen.example' },
  { id: 'posta:INBOX:504', fonte: 'posta', tipo: 'email', titolo: 'Course quote for Harbor', corpo: 'Hi Alex, we would also like the course quote. Giulia Bassi', autore: 'Giulia Bassi <giulia@harbor.example>', quando: giorniFa(2), messageId: 'g504@harbor.example' },
  { id: 'posta:INBOX:505', fonte: 'posta', tipo: 'email', titolo: 'Pilot plan', corpo: 'Hi Alex, here is the pilot plan: two engineers, supplier invoices first, four weeks, review with the CFO at the end. Nora', autore: 'Nora Vance <nora@harbor.example>', quando: giorniFa(3), messageId: 'n505@harbor.example', filo: 'f-nora' },
  { id: 'desktop:notes-meeting-lumen.md', fonte: 'desktop', tipo: 'file', titolo: 'notes-meeting-lumen.md', corpo: 'Meeting with Lumen, last Tuesday.\n- They want the course in November.\n- Twelve people, Milan office.\n- Marco decides; Giulia Neri coordinates.\n- Next: send the quote, then a call to fix the dates.\n', quando: giorniFa(4), percorso: '/tmp/notes-meeting-lumen.md' }
]

/** I quattordici compiti: dieci interi, quattro a cui manca un dato duro. */
export const CORPUS: Caso[] = [
  { id: 'v01', testo: 'Reply to Marco about the course quote', doc: 'posta:INBOX:501', duro: false, deve: [/890/], vieta: [/\b(?:980|850|900|1[.,]?000)\b\s?(?:EUR|euro|€)/i] },
  { id: 'v02', testo: 'Write the quote for the Lumen course from the price list', duro: false, deve: [/890/] },
  { id: 'v03', testo: 'Summarize the Lumen meeting notes', duro: false, deve: [/November|Milan|twelve|12/i] },
  { id: 'v04', testo: 'Propose a call with Marco to fix the course dates', doc: 'posta:INBOX:501', duro: false },
  { id: 'v05', testo: 'Write the kickoff note for the Harbor pilot', duro: false, deve: [/engineers|invoices|four weeks/i] },
  { id: 'v06', testo: 'Reply to Nora with the kickoff notes', doc: 'posta:INBOX:502', duro: false },
  { id: 'v07', testo: 'Write a one-page plan for the Harbor pilot with owners', duro: false },
  { id: 'v08', testo: 'Draft the agenda for the pilot review with the CFO', duro: false },
  { id: 'v09', testo: 'Write a short thank-you note to Nora for the pilot plan', doc: 'posta:INBOX:505', duro: false },
  { id: 'v10', testo: 'List the next steps after the Lumen meeting', duro: false },
  { id: 'd01', testo: 'Send the signed contract to Dana', duro: true },
  { id: 'd02', testo: 'Send the course quote to Giulia', duro: true },
  { id: 'd03', testo: 'Reply to Marco with the price for twenty people', doc: 'posta:INBOX:501', duro: true },
  { id: 'd04', testo: 'Email the Bolzano office the delivery date we agreed on', duro: true }
]

/** Il rifiuto sulla casa vera: solo da riga di comando, mai in una schermata. */
const DATI_VERI = 'Questa è la cartella dei dati veri: la prova si fa su una cartella sua.'

export type EsitoCaso = { id: string; testo: string; duro: boolean; mossa: Mossa | 'errore'; chiamate: number; domanda: string; ok: boolean; motivo: string; estratto: string }
export type Rapporto = { quando: string; casi: EsitoCaso[]; totali: { interi: number; interiOk: number; duri: number; duriOk: number; inventati: number }; file: string | null }

/** Il giudizio su un caso, puro: si prova con esiti scritti a mano. */
export function giudicaCaso(caso: Caso, s: { mossa: Mossa | 'errore'; testo: string; domanda: string }): { ok: boolean; motivo: string } {
  if (s.mossa === 'errore') return { ok: false, motivo: 'errore' }
  if (caso.duro) {
    if (s.mossa !== 'chiedi') return { ok: false, motivo: `doveva chiedere, ha fatto ${s.mossa}` }
    const domande = (s.domanda.match(/\?/g) ?? []).length
    return domande === 1 ? { ok: true, motivo: 'una domanda' } : { ok: false, motivo: `${domande} domande` }
  }
  if (s.mossa === 'chiedi') return { ok: false, motivo: 'ha chiesto' }
  if (s.mossa === 'blocco' || s.mossa === 'guaio') return { ok: false, motivo: s.mossa }
  for (const v of caso.vieta ?? []) if (v.test(s.testo)) return { ok: false, motivo: `dato inventato: ${v.source}` }
  for (const d of caso.deve ?? []) if (!d.test(s.testo)) return { ok: false, motivo: `manca ${d.source}` }
  return { ok: true, motivo: s.mossa }
}

export function totali(casi: EsitoCaso[]): Rapporto['totali'] {
  const interi = casi.filter(c => !c.duro)
  const duri = casi.filter(c => c.duro)
  return {
    interi: interi.length, interiOk: interi.filter(c => c.ok).length,
    duri: duri.length, duriOk: duri.filter(c => c.ok).length,
    inventati: interi.filter(c => /dato inventato/.test(c.motivo)).length
  }
}

export function eLaCasaVera(dati: string, casa = homedir()): boolean {
  const d = resolve(dati)
  const vera = resolve(casa, '.myynd')
  return d === vera || d.startsWith(vera + '/')
}

/** La prova, sui dati in `dati`: registra un conto, semina, e affida uno per uno. */
export async function vivo(o: { dati: string; tetto: number; solo?: number }): Promise<Rapporto> {
  if (eLaCasaVera(o.dati)) throw new Error(DATI_VERI)
  process.env.MYYND_DATI = resolve(o.dati)
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.OPENAI_API_KEY
  mkdirSync(o.dati, { recursive: true })
  const [conti, chi, cfg, store, claude, stesura, revisione] = await Promise.all([
    import('./conti.ts'), import('./chi.ts'), import('./config.ts'), import('./store.ts'), import('./claude.ts'), import('./stesura.ts'), import('./revisione-lavoro.ts')
  ])
  await conti.avvia(); await cfg.avvia()
  let id = conti.tutti().find(u => conti.conto(u)?.email === 'valutazione@myynd.local') ?? null
  if (!id) {
    const r = await conti.registra('valutazione@myynd.local', 'valutazione-non-in-produzione')
    if (!r.ok) throw new Error(`il conto della prova non nasce: ${r.errore}`)
    id = r.id
  }
  const casi = o.solo ? CORPUS.slice(0, o.solo) : CORPUS
  const esiti: EsitoCaso[] = []
  await chi.dentro(id, async () => {
    cfg.scrivi({ lingua: 'en', nome: 'Alex', diSerie: false, onboarding: true, giro: true, claudeCon: 'abbonamento', abbonamento: { attivo: true } })
    store.azzeraTutto()
    store.salvaDocumenti(DOCUMENTI)
    for (const caso of casi) {
      store.scriviCompito({ id: caso.id, testo: caso.testo, ordine: caso.id, doc: caso.doc ?? null })
      const c = store.compito(caso.id)!
      let chiamate = 0
      const lavora = (nota: string | null, extra?: { fissa?: string[]; giri?: number }) => {
        if (++chiamate > o.tetto) throw new Error(`oltre il tetto di ${o.tetto} stesure`)
        return claude.svolgi(c.testo, nota, 'tutto', [], null, undefined, c.doc, null, { nativa: true, signal: new AbortController().signal, taskId: c.id, ...(extra ?? {}) }, null)
      }
      try {
        const s = await stesura.stendi({
          c, nota: null, progetto: null, nativa: true, doc: c.doc ? store.documento(c.doc) : null, lingua: 'en',
          lavora, ferri: { chiedeAiuto: claude.chiedeAiuto, pesaLaDomanda: claude.pesaLaDomanda, giudica: revisione.giudica }, fermo: () => false
        })
        const mossa = s?.mossa ?? 'errore'
        const g = giudicaCaso(caso, { mossa, testo: s?.testo ?? '', domanda: s?.domanda ?? '' })
        esiti.push({ id: caso.id, testo: caso.testo, duro: caso.duro, mossa, chiamate, domanda: s?.domanda ?? '', ...g, estratto: (s?.testo ?? '').slice(0, 400) })
      } catch (e) {
        esiti.push({ id: caso.id, testo: caso.testo, duro: caso.duro, mossa: 'errore', chiamate, domanda: '', ok: false, motivo: e instanceof Error ? e.message : String(e), estratto: '' })
      }
      console.log(`valuta · ${caso.id} · ${esiti[esiti.length - 1].mossa} · ${esiti[esiti.length - 1].ok ? 'ok' : 'no'} · ${esiti[esiti.length - 1].motivo} · stesure=${chiamate}`)
    }
  })
  const dove = join(resolve(o.dati), 'valutazioni')
  mkdirSync(dove, { recursive: true })
  const file = join(dove, `lavoro-${ORA.replace(/[:.]/g, '-')}.json`)
  const rapporto: Rapporto = { quando: ORA, casi: esiti, totali: totali(esiti), file }
  writeFileSync(file, JSON.stringify(rapporto, null, 2), { mode: 0o600 })
  store.chiudiIndici()
  return rapporto
}

export type Argomenti = { vivo: boolean; dati: string | null; tetto: number; solo: number | null; aiuto: boolean; sbagliato: string | null }

export function leggiArgomenti(argv: string[]): Argomenti {
  const a: Argomenti = { vivo: false, dati: null, tetto: 5, solo: null, aiuto: false, sbagliato: null }
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i]
    const valore = () => { const v = argv[i + 1]; if (v === undefined || v.startsWith('--')) { a.sbagliato = x; return null } i++; return v }
    if (x === '--vivo') a.vivo = true
    else if (x === '--dati') a.dati = valore()
    else if (x === '--tetto') { const v = valore(); if (v !== null) a.tetto = Number(v) }
    else if (x === '--solo') { const v = valore(); if (v !== null) a.solo = Number(v) }
    else if (x === '--aiuto' || x === '--help' || x === '-h') a.aiuto = true
    else a.sbagliato = x
  }
  return a
}

const USO = `Uso: node server/valuta-lavoro.ts --vivo --dati <cartella nuova> [--tetto 5] [--solo N]
  --vivo   affida davvero i quattordici compiti all'account Claude (costa)
  --dati   una cartella dei dati per la prova: nuova, mai ~/.myynd
  --tetto  quante stesure al massimo per compito (5)
  --solo   solo i primi N compiti`

async function main() {
  const a = leggiArgomenti(process.argv.slice(2))
  if (a.aiuto) { console.log(USO); return }
  if (a.sbagliato) { console.error(`Argomento che non conosco: ${a.sbagliato}\n\n${USO}`); process.exitCode = 2; return }
  if (!a.vivo) { console.error(`Senza --vivo non c'è niente da fare.\n\n${USO}`); process.exitCode = 2; return }
  if (!a.dati) { console.error(`Dimmi dove: --dati <cartella nuova>\n\n${USO}`); process.exitCode = 2; return }
  if (eLaCasaVera(a.dati)) { console.error(DATI_VERI); process.exitCode = 2; return }
  if (existsSync(join(a.dati, 'utenti')) && !existsSync(join(a.dati, 'valutazioni'))) { console.error('Questa cartella ha già dei conti e non è una cartella di prova: scegline una nuova.'); process.exitCode = 2; return }
  if (!Number.isFinite(a.tetto) || a.tetto < 1 || a.tetto > 5) { console.error('--tetto vuole un numero da 1 a 5.'); process.exitCode = 2; return }
  try {
    const r = await vivo({ dati: a.dati, tetto: a.tetto, solo: a.solo ?? undefined })
    const t = r.totali
    console.log(`\nInteri senza domande e senza dati inventati: ${t.interiOk}/${t.interi} (inventati: ${t.inventati}) · Duri con una domanda sola: ${t.duriOk}/${t.duri}\nRapporto: ${r.file}`)
    if (t.interiOk < 8 || t.duriOk < t.duri) process.exitCode = 1
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e))
    process.exitCode = 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
