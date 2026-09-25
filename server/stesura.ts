// La stesura di un lavoro affidato: le chiamate, i giri, la decisione. Niente scritture.
//
// Stava dentro `svolgiUno` in `compiti.ts`, mescolata con l'indice, i file, la
// posta e gli annunci. Qui c'è solo il giro: si scrive, si guarda se è una cosa
// fatta o una domanda, si decide se chiedere o presumere (`domanda-sola.ts`),
// se serve si riscrive con l'ipotesi o con un segnaposto, si rilegge, e se la
// rilettura non passa si riscrive una volta. Poi si torna con tutto in mano,
// e chi ha chiamato scrive quello che vuole dove vuole. P6 lo chiama con un
// `lavora` in un recinto che non scrive: qui non c'è niente da recintare.
//
// Il conto: al massimo tre stesure e due riletture per delega. L'ultima
// stesura è sempre riletta (se il modo lo prevede): quello che arriva sulla
// riga non è mai una cosa che nessuno ha guardato.
//
// `fermo()` si guarda dopo ogni attesa: un richiamo arrivato mentre il
// modello scriveva butta via il lavoro, e da qui torna null.

import { senzaTrattini } from './testo.ts'
import * as mani from './mani.ts'
import { corpoPerChiRiceve, haSegnaposto } from './cornice.ts'
import { bloccoDalTesto, decidi, duroDalTesto, ipotesiDaDomanda, type Genere, type Mossa } from './domanda-sola.ts'
import { feedbackPer, type Giudizio } from './revisione-lavoro.ts'
import type * as store from './store.ts'
import type { Progetto } from './progetti.ts'
import type { Fonte } from './claude.ts'

/** Quello che torna da una stesura: la forma di `claude.svolgi`, con le letture. */
export type Uscita = {
  testo: string
  fonti: Fonte[]
  lette?: string[]
  verificaDocumenti?: string[]
  eseguito?: boolean
  daChiedere?: boolean
  consegna?: { app: string; revisione?: { esito: string; problemi: string[] } } & Record<string, unknown>
  fatti?: mani.Fatto[]
}

export type Esito = { chiede: boolean; manca?: string[]; domanda: string; visto?: string; bloccato?: boolean }
export type Peso = { genere: Genere; costo: 'alto' | 'basso' } | null

export type Ferri = {
  chiedeAiuto: (compito: string, risposta: string, nota?: string | null) => Promise<Esito>
  pesaLaDomanda: (compito: string, domanda: string, visto: string) => Promise<Peso>
  giudica: (o: {
    compito: { testo: string; modo?: string }; nota?: string | null; risultato: string
    doc?: store.Documento | null; progetto?: Progetto | null; fonti?: { id: string }[]; fatti?: mani.Fatto[]
    lingua?: 'it' | 'en'; voce?: string
  }) => Promise<Giudizio>
}

export type Stesa = {
  testo: string
  fonti: Fonte[]
  lette: string[]
  fatti: mani.Fatto[]
  verdetto: Giudizio | null
  /** Quante stesure hanno preceduto il verdetto: quella di adesso e le riscritte. */
  giri: number
  /** Quante chiamate a `lavora`, in tutto. */
  chiamate: number
  mossa: Mossa
  genere: Genere | null
  domanda: string
  visto: string
  ipotesiProposta: string | null
  eseguito: boolean
  consegna: Uscita['consegna'] | undefined
  verificaDocumenti: string[] | undefined
}

/** I modi che passano dalla rilettura: quelli che portano la sua firma. */
const RILETTI = new Set(['bozza', 'tutto'])
export const STESURE_MAX = 3
export const RILETTURE_MAX = 2

/** La riga con cui si chiede di andare avanti con un'ipotesi: in nota, mai nel prompt di sistema. */
export function istruzionePresumi(domanda: string, ipotesi: string | null): string {
  return `Non fermarti a chiedere «${domanda}». ${ipotesi ? `Vale questa ipotesi: ${ipotesi}.` : 'Scegli tu la strada più ragionevole.'} ` +
    'Fai il lavoro intero e in fondo scrivi l\'ipotesi in una riga sola che comincia con «Ho supposto».'
}

/** La riga con cui si chiede di lasciare il posto vuoto, invece di inventare o chiedere. */
export function istruzioneSegnaposto(domanda: string): string {
  return `Manca un dato che nessuna fonte contiene: «${domanda}». Non inventarlo e non chiederlo. ` +
    'Fai il lavoro intero e dove andrebbe scrivi «[da completare: cosa]» («[to fill: what]» in inglese). ' +
    'In fondo una riga sola che comincia con «Manca» («Missing» in inglese) e dice cosa manca.'
}

/** La prima riga di un testo che chiede senza una domanda riscritta: quello che si pesa. */
function primaRiga(testo: string): string {
  return testo.split('\n').map(r => r.trim()).find(Boolean) ?? ''
}

export async function stendi(o: {
  c: Pick<store.Compito, 'id' | 'testo' | 'modo' | 'domandeFatte'>
  nota: string | null
  progetto: Progetto | null
  nativa: boolean
  /** Il documento da cui è nata la riga, per il revisore. */
  doc?: store.Documento | null
  lingua: 'it' | 'en'
  consegna?: 'it' | 'en'
  voce?: string
  lavora: (nota: string | null, extra?: { fissa?: string[]; giri?: number }) => Promise<Uscita>
  ferri: Ferri
  fermo: () => boolean
  controllaVoce?: (testo: string) => string[]
  /**
   * La fonte che il testo dice di non avere è collegata davvero? Se sì, quel
   * testo non è un blocco: è una domanda, e si tratta come le altre. Senza,
   * ogni «non ho accesso alla posta» diventerebbe «Collega la posta» anche
   * con la posta collegata, e la riga direbbe una cosa falsa.
   */
  collegata?: (genere: 'posta' | 'file' | 'fonte' | 'permesso') => boolean
}): Promise<Stesa | null> {
  const { c } = o
  const domandeFatte = c.domandeFatte ?? 0
  let chiamate = 0
  let riletture = 0
  let giri = 1
  let extraFatto = false
  let riscritto = false
  let notaGiro = o.nota
  /** L'istruzione del giro in più (presumi o segnaposto): resta in nota anche nella riscrittura dopo la rilettura. */
  let istruzioneExtra = ''
  let genere: Genere | null = null
  let ipotesiProposta: string | null = null
  let verdetto: Giudizio | null = null

  const chiama = async (nota: string | null, extra?: { fissa?: string[]; giri?: number }) => {
    chiamate++
    return o.lavora(nota, extra)
  }

  let uscita = await chiama(notaGiro)
  for (;;) {
    if (o.fermo()) return null
    const testo0 = senzaTrattini(uscita.testo)
    let testo = testo0
    const lette = uscita.lette ?? []
    const eseguito = !!uscita.eseguito
    const esito: Esito = eseguito
      ? { chiede: !!uscita.consegna?.revisione && uscita.consegna.revisione.esito !== 'pass', domanda: '' }
      : uscita.daChiedere ? { chiede: true, domanda: testo } : await o.ferri.chiedeAiuto(c.testo, testo, notaGiro)
    if (o.fermo()) return null

    const base = (mossa: Mossa): Stesa => ({
      testo, fonti: uscita.fonti, lette, fatti: uscita.fatti ?? [], verdetto, giri, chiamate, mossa, genere,
      domanda: esito.domanda, visto: esito.visto ?? '', ipotesiProposta, eseguito,
      consegna: uscita.consegna, verificaDocumenti: uscita.verificaDocumenti
    })

    if (esito.chiede && !eseguito) {
      const domanda = esito.domanda.trim() || primaRiga(testo)
      const genereBlocco = bloccoDalTesto(testo) ?? (esito.bloccato ? 'fonte' : null)
      const blocco = genereBlocco !== null && !(o.collegata?.(genereBlocco) ?? false)
      const duro = blocco ? null : duroDalTesto(domanda)
      const peso = !blocco && !duro ? await o.ferri.pesaLaDomanda(c.testo, domanda, esito.visto ?? '') : undefined
      if (o.fermo()) return null
      genere = duro ?? peso?.genere ?? null
      const mossa = decidi({ chiede: true, blocco, duro, peso }, { nativa: o.nativa, domandeFatte, secondoGiro: extraFatto })
      if ((mossa === 'presumi' || mossa === 'segnaposto') && !extraFatto && chiamate < STESURE_MAX) {
        extraFatto = true
        ipotesiProposta = ipotesiDaDomanda(testo)
        istruzioneExtra = mossa === 'presumi' ? istruzionePresumi(domanda, ipotesiProposta) : istruzioneSegnaposto(domanda)
        console.info(`myynd · lavoro · ${c.id} · ${mossa} · ${genere ?? '-'} · giro in più`)
        notaGiro = [o.nota, istruzioneExtra].filter(Boolean).join('\n\n')
        uscita = await chiama(notaGiro, { fissa: lette, giri: 2 })
        continue
      }
      const finale = (mossa === 'presumi' || mossa === 'segnaposto') ? (extraFatto ? 'guaio' : 'segnaposto') : mossa
      console.info(`myynd · lavoro · ${c.id} · ${finale} · ${genere ?? '-'} · chiamate=${chiamate}`)
      return { ...base(finale), domanda }
    }

    // una cosa fatta: la frase di chiusura in prima riga, non su un prompt
    if (!esito.chiede && c.modo !== 'prompt') testo = mani.conFraseDiChiusura(testo, uscita.fatti ?? [], o.lingua)
    const mossaConsegna = (): Mossa => haSegnaposto(testo) ? 'segnaposto' : extraFatto ? 'presumi' : 'produci'

    if (eseguito || !RILETTI.has(c.modo) || riletture >= RILETTURE_MAX) {
      const m = mossaConsegna()
      console.info(`myynd · lavoro · ${c.id} · ${m} · ${genere ?? '-'} · chiamate=${chiamate}`)
      return base(m)
    }

    riletture++
    verdetto = await o.ferri.giudica({
      compito: c, nota: notaGiro, risultato: testo, doc: o.doc ?? null, progetto: o.progetto,
      fonti: uscita.fonti, fatti: uscita.fatti ?? [], lingua: o.consegna, voce: o.voce
    })
    if (o.fermo()) return null
    const dellaVoce = o.controllaVoce ? o.controllaVoce(corpoPerChiRiceve(testo)) : []
    if (dellaVoce.length) {
      verdetto = { ...verdetto, esito: 'revise', problemi: [...verdetto.problemi, ...dellaVoce] }
    }
    if (verdetto.esito === 'revise' && !riscritto && chiamate < STESURE_MAX) {
      riscritto = true
      giri++
      console.info(`myynd · revisione · ${c.id} · revise · riscrivo (giro ${giri})`)
      notaGiro = [o.nota, istruzioneExtra, feedbackPer(verdetto.problemi)].filter(Boolean).join('\n\n')
      uscita = await chiama(notaGiro, extraFatto ? { fissa: lette, giri: 2 } : undefined)
      continue
    }
    const m = mossaConsegna()
    console.info(`myynd · lavoro · ${c.id} · ${m} · ${genere ?? '-'} · chiamate=${chiamate}`)
    return base(m)
  }
}
