// Dare un lavoro a Claude Code, dentro una cartella vera.
//
// È il verbo che cambia natura a questa applicazione. Fino a qui Myynd
// *scriveva*: testo che una persona legge, corregge, manda. Da qui Myynd può
// far *succedere* del lavoro dentro un progetto — leggerlo, capirlo, cambiarlo.
//
// Perché passare dalla riga di comando invece di rifare l'agente qui dentro:
// perché Claude Code esiste già, sa lavorare in una cartella, sa cercare fra i
// file, sa scrivere una patch e sa quando fermarsi. Riscriverlo dentro Myynd
// vorrebbe dire un anno di lavoro per avere qualcosa di peggio.
//
// La regola di questa casa non cambia, e qui vale il doppio: **prima guarda,
// poi fa**. Due passi, e sono due apposta:
//
//   1. `--permission-mode plan` — legge il progetto e scrive cosa farebbe.
//      Non tocca un file. Quello che torna si legge come una bozza qualsiasi.
//   2. `--permission-mode acceptEdits` — lo fa davvero, e solo dopo che una
//      persona ha letto il piano e ha premuto.
//
// Un solo passo — «fai» e basta — sarebbe stato metà del lavoro e il doppio del
// rischio: modifiche dentro un progetto che nessuno ha visto arrivare.
//
// E il recinto è quello di sempre: solo dentro le cartelle collegate. Myynd non
// sceglie dove lavorare, lo scegli tu una volta e vale per tutto.

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { ConfigDesktop } from './config.ts'
import { OSPITATO } from './ospitato.ts'

/** Dove sta `claude`. Non si cerca nella PATH: un'app impacchettata non ce l'ha. */
const DOVE = [
  `${process.env.HOME}/.local/bin/claude`,
  '/opt/homebrew/bin/claude',
  '/usr/local/bin/claude'
]

/**
 * Su un server la risposta è «no» prima ancora di guardare.
 *
 * Dentro un contenitore l'eseguibile non c'è. Ma se ci fosse — chi ospita che
 * lo installa per sé — sarebbe *il suo* account a rispondere per tutte le
 * persone registrate, e a lavorare dentro cartelle del server, non loro. È la
 * stessa ragione per cui il desktop non si offre ospitato (`ospitato.ts`):
 * qui è più grave, perché non legge soltanto, agisce. Da questa riga
 * discendono `abbonamento.pronto()`, `/api/lavoro/pronto` e `fai()`: un
 * posto solo, e tutte e tre le strade si chiudono insieme.
 */
export function installato(): string | null {
  if (OSPITATO) return null
  return DOVE.find(p => existsSync(p)) ?? null
}

export type Passo = 'piano' | 'fai'

export type Esito = {
  passo: Passo
  testo: string
  /** Vero se è finito da solo, falso se l'abbiamo fermato noi. */
  finito: boolean
  cartella: string
}

/**
 * La cartella dev'essere una di quelle collegate — la stessa regola di
 * `scrivania.ts`, e per lo stesso motivo. Qui pesa di più: là si scriveva un
 * file, qui si lascia lavorare un agente dentro una cartella intera.
 */
async function dentroLeTue(cartella: string, c: ConfigDesktop | null | undefined): Promise<string> {
  const scelte = c?.cartelle ?? []
  if (!scelte.length) throw new Error('Collega una cartella del desktop e potrò lavorarci.')
  const vero = await realpath(resolve(cartella)).catch(() => resolve(cartella))
  for (const s of scelte) {
    const radice = await realpath(resolve(s)).catch(() => resolve(s))
    if (vero === radice || vero.startsWith(radice + '/')) return vero
  }
  throw new Error('Posso lavorare solo nelle cartelle che hai collegato.')
}

/** Il tetto: un lavoro che non finisce non deve tenere occupato il server. */
const TETTO_MINUTI = { piano: 5, fai: 20 }
const TETTO_TESTO = 200_000

/**
 * Fa girare Claude Code e riporta indietro quello che ha detto.
 *
 * `spawn` con gli argomenti in un elenco, mai una stringa di shell: la
 * richiesta è testo di una persona, e in una shell un testo con dentro un punto
 * e virgola smette di essere testo. Qui è un argomento, e un argomento è solo
 * quello.
 *
 * L'ambiente si passa quasi intero — Claude Code ha bisogno delle sue
 * credenziali — ma senza la chiave API di Myynd: sono due conti diversi, e
 * quello che spende l'uno non deve finire sull'altro.
 */
export async function fai(
  desktop: ConfigDesktop | null | undefined,
  o: { cartella: string; richiesta: string; passo: Passo }
): Promise<Esito> {
  // Prima quello che riguarda la richiesta, poi quello che riguarda la
  // macchina: se la cartella è fuori dal recinto va detto *quello*, anche su un
  // computer dove Claude Code manca. Sono due notizie diverse, e la prima è
  // quella che si può correggere.
  if (!o.richiesta.trim()) throw new Error('Non c’è niente da chiedergli.')
  const cartella = await dentroLeTue(o.cartella, desktop)
  const exe = installato()
  if (!exe) throw new Error('Claude Code non è installato su questo computer.')

  const args = [
    '-p', o.richiesta,
    '--permission-mode', o.passo === 'piano' ? 'plan' : 'acceptEdits',
    '--output-format', 'text'
  ]

  const { ANTHROPIC_API_KEY: _mia, ...ambiente } = process.env

  return await new Promise<Esito>((risolvi, rifiuta) => {
    const p = spawn(exe, args, { cwd: cartella, env: ambiente })
    let fuori = ''
    let male = ''
    let finito = true

    const tetto = setTimeout(() => {
      finito = false
      p.kill('SIGTERM')
    }, TETTO_MINUTI[o.passo] * 60_000)

    p.stdout.on('data', d => {
      if (fuori.length < TETTO_TESTO) fuori += String(d)
    })
    p.stderr.on('data', d => { if (male.length < 4000) male += String(d) })

    p.on('error', e => {
      clearTimeout(tetto)
      rifiuta(new Error(`Non sono riuscito ad avviare Claude Code: ${e.message}`))
    })

    p.on('close', codice => {
      clearTimeout(tetto)
      const testo = fuori.trim()
      if (!testo && codice !== 0) {
        // il messaggio di stderr è per chi sviluppa; qui serve la riga corta
        return rifiuta(new Error(
          /not logged in|authentication/i.test(male)
            ? 'Claude Code non è collegato: apri un terminale e fai «claude» una volta.'
            : 'Claude Code non ce l’ha fatta.'
        ))
      }
      risolvi({ passo: o.passo, testo, finito, cartella })
    })
  })
}
