// Le misure del lavoro affidato: quante righe senza domande, quante bozze partite com'erano.
//
// Le sue due domande sul lavoro affidato, in numeri: in quante deleghe ha
// dovuto rispondere a una domanda (l'obiettivo è otto su dieci senza, e mai
// più di una), e quante bozze sono partite com'erano o con un ritocco (sei su
// dieci). Si legge da `misure_compiti`, sul conto di chi chiede, e non
// tocca niente. Il fondo (iniziative, automazioni) si conta a parte: non
// chiede mai, e il suo numero di domande dev'essere zero.
//
// Ogni tasso è null sotto le cinque righe: una percentuale su tre casi non
// dice niente, e dirla è peggio che tacere. Il tasso delle bozze è null anche
// quando nella finestra non c'è nessuna mail mandata da lei nell'indice: senza
// posta inviata l'osservatore non può vedere niente, e «zero mandate» sarebbe
// una bugia sull'app, non su di lei.
//
// Da riga di comando su una copia dei dati (mai su ~/.myynd, che rifiuta):
//   node server/misura-lavoro.ts --dati <copia> [--conto <id o email>] [--giorni 30]
// Gli import sono dinamici perché `--dati` deve valere prima che `config.ts`
// legga l'ambiente.

import { existsSync, realpathSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import type { Misura } from './lavoro-dati.ts'

export type MisuraLavoro = {
  giorni: number
  dal: string
  lavori: {
    arrivati: number
    senzaDomande: number
    conUna: number
    /** Il massimo di domande su una riga: dev'essere al più uno. */
    max: number
    presunte: number
    segnaposto: number
    correzioni: number
    tassoSenza: number | null
  }
  blocchi: number
  guai: number
  fondo: { arrivati: number; segnaposto: number; domande: number }
  bozze: {
    inviate: number
    identiche: number
    ritocchi: number
    modificate: number
    riscritte: number
    tassoBuone: number | null
    via: { smtp: number; casella: number; propria: number; copia: number }
  }
  copertura: { postaInviata: boolean }
}

/** Sotto questo numero di righe un tasso non si dice. */
export const MINIMO = 5

/** L'aritmetica, pura: si prova con righe a mano. */
export function calcola(righe: Misura[], o: { giorni: number; dal: string; postaInviata: boolean }): MisuraLavoro {
  // una figlia di revisione («Cambia», o una revisione dalla chat) non è una
  // delega in più: la correzione è già contata sulla madre. Il suo invio sì
  const affidate = righe.filter(r => r.affidato >= o.dal && !r.compito.startsWith('rev-'))
  const fondo = affidate.filter(r => r.origine === 'fondo')
  const proprie = affidate.filter(r => r.origine !== 'fondo')
  // una domanda fatta davvero conta sempre, anche se poi la riga si è fermata
  // su un dato che mancava (guaio): altrimenti il tasso senza domande salirebbe
  // proprio sulle righe che hanno chiesto. Un blocco, o un guaio senza domanda, resta fuori
  const lavori = proprie.filter(r => r.domande > 0 || (r.mossa !== 'blocco' && r.mossa !== 'guaio' && r.consegnato !== null))
  const senzaDomande = lavori.filter(r => r.domande === 0).length
  const tasso = (n: number, su: number) => su >= MINIMO ? Math.round((n / su) * 1000) / 1000 : null

  const inviate = righe.filter(r => r.inviato !== null && r.inviato >= o.dal)
  const contate = inviate.filter(r => r.via === 'smtp' || r.via === 'casella' || r.via === 'propria')
  const per = (c: string) => contate.filter(r => r.classe === c).length
  const riscritte = contate.filter(r => r.classe === 'riscritto' || r.via === 'propria').length
  const buone = per('identico') + per('ritocco')

  return {
    giorni: o.giorni, dal: o.dal,
    lavori: {
      arrivati: lavori.length,
      senzaDomande,
      conUna: lavori.filter(r => r.domande === 1).length,
      max: lavori.reduce((m, r) => Math.max(m, r.domande), 0),
      presunte: lavori.filter(r => r.mossa === 'presumi').length,
      segnaposto: lavori.filter(r => r.mossa === 'segnaposto').length,
      correzioni: lavori.reduce((s, r) => s + r.correzioni, 0),
      tassoSenza: tasso(senzaDomande, lavori.length)
    },
    blocchi: proprie.filter(r => r.mossa === 'blocco').length,
    guai: proprie.filter(r => r.mossa === 'guaio').length,
    fondo: {
      arrivati: fondo.length,
      segnaposto: fondo.filter(r => r.mossa === 'segnaposto').length,
      domande: fondo.reduce((s, r) => s + r.domande, 0)
    },
    bozze: {
      inviate: contate.length,
      identiche: per('identico'),
      ritocchi: per('ritocco'),
      modificate: per('modificato'),
      riscritte,
      tassoBuone: o.postaInviata ? tasso(buone, contate.length) : null,
      via: {
        smtp: inviate.filter(r => r.via === 'smtp').length,
        casella: inviate.filter(r => r.via === 'casella').length,
        propria: inviate.filter(r => r.via === 'propria').length,
        copia: inviate.filter(r => r.via === 'copia').length
      }
    },
    copertura: { postaInviata: o.postaInviata }
  }
}

/** Le misure di chi chiede, sugli ultimi `giorni`. */
export async function misuraLavoro(giorni = 30): Promise<MisuraLavoro> {
  const g = Number.isFinite(giorni) && giorni > 0 ? Math.min(365, Math.floor(giorni)) : 30
  const dal = new Date(Date.now() - g * 86_400_000).toISOString()
  const lavoroDati = await import('./lavoro-dati.ts')
  return calcola(lavoroDati.misureDal(dal), { giorni: g, dal, postaInviata: lavoroDati.postaInviataDal(dal) })
}

// — la riga di comando —

export type Argomenti = { dati: string | null; conto: string | null; giorni: number; aiuto: boolean; sbagliato: string | null }

export function leggiArgomenti(argv: string[]): Argomenti {
  const a: Argomenti = { dati: null, conto: null, giorni: 30, aiuto: false, sbagliato: null }
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i]
    const valore = () => { const v = argv[i + 1]; if (v === undefined || v.startsWith('--')) { a.sbagliato = x; return null } i++; return v }
    if (x === '--dati') a.dati = valore()
    else if (x === '--conto') a.conto = valore()
    else if (x === '--giorni') { const v = valore(); if (v !== null) a.giorni = Number(v) }
    else if (x === '--aiuto' || x === '--help' || x === '-h') a.aiuto = true
    else a.sbagliato = x
  }
  return a
}

/** La cartella è quella vera, o ci sta dentro: non si apre nemmeno. */
/**
 * Il percorso vero: i collegamenti risolti (sull'antenato che esiste, se il
 * percorso non c'è ancora) e le maiuscole appiattite, perché il disco del Mac
 * non le distingue. Senza, `--dati /tmp/link` verso `~/.myynd`, o `~/.MYYND`,
 * passerebbero il controllo e aprirebbero i dati veri.
 */
function percorsoVero(p: string): string {
  let radice = resolve(p)
  const resto: string[] = []
  while (!existsSync(radice)) {
    const su = dirname(radice)
    if (su === radice) break
    resto.unshift(basename(radice))
    radice = su
  }
  let vero = radice
  try { vero = realpathSync(radice) } catch { /* resta com'è */ }
  return join(vero, ...resto).toLowerCase()
}

export function eLaCasaVera(dati: string, casa = homedir()): boolean {
  const d = percorsoVero(dati)
  const vera = percorsoVero(resolve(casa, '.myynd'))
  return d === vera || d.startsWith(vera + '/')
}

const USO = `Uso: node server/misura-lavoro.ts --dati <copia dei dati> [--conto <id o email>] [--giorni 30]
  --dati    una COPIA della cartella dei dati; ~/.myynd viene rifiutata
  --conto   un conto solo; senza, tutti
  --giorni  la finestra (30)`

async function main() {
  const a = leggiArgomenti(process.argv.slice(2))
  if (a.aiuto) { console.log(USO); return }
  if (a.sbagliato) { console.error(`Argomento che non conosco: ${a.sbagliato}\n\n${USO}`); process.exitCode = 2; return }
  if (!a.dati) { console.error(`Dimmi la copia dei dati: --dati <cartella>\n\n${USO}`); process.exitCode = 2; return }
  if (eLaCasaVera(a.dati)) { console.error('Questa è la cartella dei dati veri: le misure si fanno su una copia.'); process.exitCode = 2; return }
  if (!Number.isFinite(a.giorni) || a.giorni <= 0) { console.error('--giorni vuole un numero positivo.'); process.exitCode = 2; return }
  process.env.MYYND_DATI = resolve(a.dati)
  delete process.env.ANTHROPIC_API_KEY

  const [conti, chi, config, store] = await Promise.all([import('./conti.ts'), import('./chi.ts'), import('./config.ts'), import('./store.ts')])
  await conti.avvia()
  await config.avvia()
  const cerco = a.conto?.trim().toLowerCase() ?? null
  const ids = conti.tutti().filter(u => !cerco || u === cerco || conti.conto(u)?.email === cerco)
  if (!ids.length) { console.error(cerco ? `Non c'è nessun conto ${a.conto} in ${config.RADICE}.` : `Nessun conto in ${config.RADICE}.`); process.exitCode = 2; return }
  try {
    const fuori: Record<string, MisuraLavoro> = {}
    for (const id of ids) {
      const dentro = chi.dentro(id, () => config.cartella())
      if (!resolve(dentro).startsWith(resolve(a.dati))) throw new Error('La cartella del conto sta fuori da --dati: mi fermo, per non toccare i dati veri.')
      fuori[conti.conto(id)?.email ?? id] = await chi.dentro(id, () => misuraLavoro(a.giorni))
    }
    console.log(JSON.stringify(fuori, null, 2))
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e))
    process.exitCode = 1
  } finally {
    store.chiudiIndici()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
