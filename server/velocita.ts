// Quanto costa, in millisecondi, quello che succede prima del modello (P10).
//
// Un comando fuori linea, sul modello di `valuta-feed.ts`: niente server,
// niente giri di fondo, niente connettori, niente rete (fetch lancia). Due modi:
//
//   HOME=<temp>/casa npm run velocita -- --seme 8000 --dati <cartella vuota>
//     semina un conto finto con i moduli veri (dati inventati, in inglese) e lo misura
//   HOME=<temp>/casa npm run velocita -- --dati <copia spogliata> --conto <email>
//     misura una copia già fatta (la fa chi guida, senza credenziali)
//
// Rifiuta `~/.myynd` (e quello che c'è dentro), una cartella del conto fuori
// da `--dati`, e una HOME che non sta in una cartella temporanea.
//
// Gli import sono dinamici: `--dati` deve valere prima che `config.ts` legga
// MYYND_DATI.

import { existsSync, mkdirSync, readdirSync, realpathSync } from 'node:fs'
import { tmpdir, userInfo } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export type Argomenti = { seme: number | null; dati: string | null; conto: string | null; json: boolean; aiuto: boolean; sbagliato: string | null }

export function leggiArgomenti(argv: string[]): Argomenti {
  const a: Argomenti = { seme: null, dati: null, conto: null, json: false, aiuto: false, sbagliato: null }
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i]
    const valore = () => { const v = argv[i + 1]; if (v === undefined || v.startsWith('--')) { a.sbagliato = x; return null } i++; return v }
    if (x === '--seme') { const v = valore(); const n = Number(v); if (v !== null && (!Number.isInteger(n) || n < 1)) a.sbagliato = x; else if (v !== null) a.seme = n }
    else if (x === '--dati') a.dati = valore()
    else if (x === '--conto') a.conto = valore()
    else if (x === '--json') a.json = true
    else if (x === '--aiuto' || x === '--help' || x === '-h') a.aiuto = true
    else a.sbagliato = x
  }
  return a
}

const USO = `Uso: HOME=<cartella temporanea> npm run velocita -- (--seme N --dati <cartella vuota> | --dati <copia> --conto <email>) [--json]`

const vero = (p: string) => { try { return realpathSync(p) } catch { return resolve(p) } }
const dentro = (figlio: string, padre: string) => figlio === padre || figlio.startsWith(padre.endsWith(sep) ? padre : padre + sep)

/** Perché no, o null se si può partire. Si guarda prima di creare o aprire qualunque cosa. */
export function perche(a: Argomenti, home = process.env.HOME ?? '', casaVera = userInfo().homedir): string | null {
  if (!a.dati) return 'Dimmi la cartella: --dati <cartella>.'
  if (a.seme === null && !a.conto) return 'Dimmi il conto (--conto <email>) o quanto seminare (--seme N).'
  const dati = vero(a.dati)
  const mia = vero(join(casaVera, '.myynd'))
  if (dentro(dati, mia) || dentro(mia, dati)) return 'Questa è la cartella vera di Myynd: mi fermo.'
  const temp = [vero(tmpdir()), '/private/tmp', '/tmp', '/private/var/folders'].map(vero)
  const h = vero(home)
  if (!home || h === vero(casaVera) || !temp.some(t => dentro(h, t))) return 'HOME deve stare in una cartella temporanea: HOME=$(mktemp -d) npm run velocita -- …'
  if (a.seme !== null && existsSync(dati) && readdirSync(dati).length) return 'Per seminare serve una cartella vuota.'
  return null
}

type Misura = { cosa: string; ms: number; nota?: string }

/** La mediana di `n` giri. */
function mediana(f: () => unknown, n = 5): { ms: number; r: unknown } {
  const t: number[] = []
  let r: unknown
  for (let i = 0; i < n; i++) { const a = performance.now(); r = f(); t.push(performance.now() - a) }
  t.sort((x, y) => x - y)
  return { ms: Math.round(t[Math.floor(t.length / 2)] * 10) / 10, r }
}

export const DOMANDE = ['What is due this week?', 'When is the next call?', 'Who sent the last invoice?', 'What did we agree on the pilot?', 'Summarize the Northwind thread']

/** Un conto finto, con i moduli veri: la ricetta del banco di P10 (dati inventati). */
export async function semina(n: number): Promise<string> {
  const [conti, chi, cfg, store, progetti] = await Promise.all([import('./conti.ts'), import('./chi.ts'), import('./config.ts'), import('./store.ts'), import('./progetti.ts')])
  await conti.avvia(); await cfg.avvia()
  const acc = await conti.registra('banco@example.com', 'banco-password-123')
  if (!acc.ok) throw new Error(acc.errore)
  chi.dentro(acc.id, () => {
    cfg.scrivi({ lingua: 'en', diSerie: false, nome: 'Alex', ruolo: 'founder', onboarding: true } as Parameters<typeof cfg.scrivi>[0])
    const nomi = ['Aurora', 'Harbor', 'Myynd', 'Evermute', 'Northwind', 'Atlas', 'Orbit', 'Lumen', 'Vega', 'Cobalt']
    const ps = nomi.map(x => progetti.crea({ nome: x, obiettivo: `Ship the ${x} pilot with two customers by October` }).progetto)
    const parole = 'launch pilot customer contract invoice proposal meeting deadline budget design review roadmap hiring partner quote scope delivery'.split(' ')
    const ora = Date.now()
    const docs = []
    for (let i = 0; i < n; i++) {
      const p = nomi[i % nomi.length]
      const email = i % 3 !== 0
      const lungo = i % 25 === 0
      // uno su venticinque da ventimila caratteri, gli altri corti
      const corpo = Array.from({ length: lungo ? 2600 : 120 }, (_, k) => parole[(i + k) % parole.length]).join(' ').slice(0, lungo ? 20_000 : 2000) + ` about ${p}. Can you confirm the scope by Friday?`
      docs.push({
        id: email ? `posta:INBOX:${i}` : `desktop:/Users/x/Documents/${p}/file-${i}.md`,
        fonte: email ? 'posta' : 'desktop', tipo: email ? 'email' : 'file',
        titolo: `${p} ${parole[i % parole.length]} ${i}`, corpo,
        autore: email ? `Person ${i % 40} <p${i % 40}@example${i % 7}.com>` : null,
        percorso: email ? 'INBOX' : `/Users/x/Documents/${p}/file-${i}.md`,
        quando: new Date(ora - (i % 400) * 3600_000).toISOString(),
        gruppo: email ? 'posta' : 'documenti', filo: email ? `filo-${i % 900}` : null
      })
    }
    store.salvaDocumenti(docs as Parameters<typeof store.salvaDocumenti>[0])
    for (let i = 0; i < 80; i++) {
      store.scriviCompito({ id: `c${i}`, testo: `Follow up ${nomi[i % 10]} ${parole[i % parole.length]}`, quando: ['oggi', 'settimana', 'poi'][i % 3], ordine: String(1000 + i), origine: 'mano', progetto: ps[i % 10].id } as Parameters<typeof store.scriviCompito>[0])
      if (i % 4 === 0) store.cambiaStatoCompito(`c${i}`, 'fatto', 'done')
    }
    store.salvaFeed(docs.filter(d => d.tipo === 'email').slice(0, 30).map(d => ({ tipo: 'Da decidere', titolo: `Reply to ${d.autore} on ${d.titolo}`, testo: 'They wait for the scope.', urgenza: 'this week', fonte: d.fonte, doc: d.id, perche: 'Moves the pilot.' })) as Parameters<typeof store.salvaFeed>[0])
    for (let c = 0; c < 20; c++) {
      store.creaChat(`ch${c}`, `Chat ${c}`)
      for (let m = 0; m < 30; m++) store.salvaMessaggio({ id: `ch${c}m${m}`, chat: `ch${c}`, ruolo: m % 2 ? 'a' : 'u', testo: `${m % 2 ? 'The answer' : 'A question'} about ${nomi[(c + m) % 10]} ${parole[m % parole.length]}` })
    }
  })
  return 'banco@example.com'
}

export type Rapporto = { conto: string; documenti: number; misure: Misura[]; motore: string | null; claudeCon: string | null; fornitoreSulMac: boolean | null; bordo: unknown }

/** Le misure, dentro il conto. Mediana di cinque giri (uno per quelle lente). */
export async function misura(email: string): Promise<Rapporto> {
  const [conti, chi, cfg, store, progetti, att, claude, lingua, tempi, secca, mod, scalda] = await Promise.all([
    import('./conti.ts'), import('./chi.ts'), import('./config.ts'), import('./store.ts'), import('./progetti.ts'),
    import('./attenzione.ts'), import('./claude.ts'), import('./lingua.ts'), import('./tempi.ts'), import('./domanda-secca.ts'),
    import('./modello.ts'), import('./scalda.ts')
  ])
  const id = conti.tutti().find(u => conti.conto(u)?.email === email.trim().toLowerCase()) ?? null
  if (!id) throw new Error(`Non c'è nessun conto ${email} qui.`)
  return chi.dentro(id, () => {
    const m: Misura[] = []
    const metti = (cosa: string, f: () => unknown, n = 5, nota?: (r: unknown) => string) => {
      const x = mediana(f, n)
      m.push({ cosa, ms: x.ms, ...(nota ? { nota: nota(x.r) } : {}) })
    }
    const conteggi = store.conteggi()
    metti('feedAttuale', () => att.feedAttuale(), 5, r => `${(r as unknown[]).length} carte`)
    metti('compitiAttuali', () => att.compitiAttuali(), 5, r => `${(r as unknown[]).length} righe`)
    metti('iniziativeProgetti', () => att.iniziativeProgetti())
    metti('progetti.perContesto', () => progetti.perContesto(true))
    metti('store.conteggi', () => store.conteggi())
    DOMANDE.forEach((q, i) => {
      const docs = claude.materialeChat(q, [])
      metti(`materialeChat ${i + 1}`, () => claude.materialeChat(q, []), 3, r => `${(r as unknown[]).length} documenti`)
      metti(`sistema ${i + 1}`, () => claude.sistema(q, true), 3, r => `${String(r).length} caratteri`)
      metti(`corpoRichiesta ${i + 1}`, () => claude.corpoRichiesta(q, [], docs, true), 3, r => `~${Math.round(JSON.stringify(r).length / 4)} token`)
      metti(`store.cerca ${i + 1}`, () => store.cerca(q, 12, undefined, true))
      metti(`perIlModello ${i + 1}`, () => progetti.perIlModello(q, 8, true), 3)
    })
    const lunghi = store.recenti(5000).sort((a, b) => (b.corpo?.length ?? 0) - (a.corpo?.length ?? 0)).slice(0, 5)
    metti('radici dei 5 più lunghi', () => lunghi.forEach(d => lingua.radici(d.corpo ?? '')), 1)
    metti('verificaLIndice', () => store.verificaLIndice(), 1)
    const vuoto = { progettoInChat: false, compito: false, revisione: false, progettiNominati: 0, chiusura: false }
    metti('domandaSecca ×5', () => DOMANDE.map(q => secca.domandaSecca(q, vuoto)), 5, r => (r as boolean[]).map(b => b ? 'sì' : 'no').join(' '))
    const c = cfg.leggi()
    const f = mod.fornitore()
    const dal = new Date(Date.now() - 14 * 24 * 3_600_000).toISOString()
    return {
      conto: email, documenti: conteggi.totale, misure: m,
      motore: c.motore ?? null, claudeCon: c.claudeCon ?? null,
      fornitoreSulMac: f ? scalda.sulQuestoMac(f.url) : null,
      bordo: tempi.bordo(store.ritardiCarte(dal), store.ritardiLavori(dal))
    }
  })
}

export function tabella(r: Rapporto): string {
  const righe = [`Conto ${r.conto} · ${r.documenti} documenti`, '']
  for (const x of r.misure) righe.push(`  ${x.cosa.padEnd(28)} ${String(x.ms).padStart(8)} ms${x.nota ? `   ${x.nota}` : ''}`)
  righe.push('', `motore ${r.motore ?? 'nessuno'} · claudeCon ${r.claudeCon ?? 'nessuno'} · fornitore su questo Mac ${r.fornitoreSulMac === null ? 'nessuno' : r.fornitoreSulMac ? 'sì' : 'no'}`)
  righe.push(`bordo ${JSON.stringify(r.bordo)}`)
  return righe.join('\n')
}

async function main() {
  const a = leggiArgomenti(process.argv.slice(2))
  if (a.aiuto) { console.log(USO); return }
  if (a.sbagliato) { console.error(`Argomento che non conosco: ${a.sbagliato}\n\n${USO}`); process.exitCode = 2; return }
  const no = perche(a)
  if (no) { console.error(`${no}\n\n${USO}`); process.exitCode = 2; return }
  // niente rete: una chiamata che parte è un errore, non una misura
  globalThis.fetch = (() => { throw new Error('velocita: niente rete') }) as typeof fetch
  const dati = resolve(a.dati!)
  if (a.seme !== null) mkdirSync(dati, { recursive: true })
  process.env.MYYND_DATI = dati
  const [conti, chi, config, store] = await Promise.all([import('./conti.ts'), import('./chi.ts'), import('./config.ts'), import('./store.ts')])
  try {
    let email = a.conto
    if (a.seme !== null) email = await semina(a.seme)
    else { await conti.avvia(); await config.avvia() }
    const id = conti.tutti().find(u => conti.conto(u)?.email === email!.trim().toLowerCase())
    if (id) {
      // la cartella del conto deve stare dentro --dati: una copia di conti.db punta ancora ai dati veri
      const sua = vero(chi.dentro(id, () => config.cartella()))
      if (!dentro(sua, vero(dati))) throw new Error('La cartella del conto sta fuori da --dati: mi fermo, per non toccare i dati veri.')
    }
    const r = await misura(email!)
    console.log(a.json ? JSON.stringify(r, null, 2) : tabella(r))
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e))
    process.exitCode = 1
  } finally {
    store.chiudiIndici()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
