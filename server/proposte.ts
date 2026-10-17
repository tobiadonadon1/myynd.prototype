// Le proposte scritte su una riga, eseguite con un dito (E).
//
// La rotta `/api/compiti/:id/esegui` sapeva fare tre cose: mettere nel
// cestino, archiviare, mettere in agenda. Qui le tre nuove: le risposte fra le
// bozze della casella, una nota in Note, un file nel posto in cui gli piace
// trovarli. Stessa regola delle altre: si agisce su quello che sta scritto
// nella riga, non su quello che rimanda il browser, e niente parte da solo.
// Una bozza nella casella resta una bozza: mandarla è un gesto suo, dalla posta.
//
// Le mani sono sostituibili solo nelle prove: in produzione la casella vera,
// Note vera, la Scrivania vera.

import * as store from './store.ts'
import { salvaBozzaCasella } from './mailbox-drafts.ts'
import * as mani from './mani.ts'
import * as tracce from './tracce.ts'

export type Ferri = {
  salvaBozzaCasella: typeof salvaBozzaCasella
  creaNota: typeof mani.creaNota
  salvaConsegna: typeof mani.salvaConsegna
  luogo: () => mani.Luogo
  /** La mano trattenuta dal mandato, eseguita col suo tocco. */
  esegui: typeof mani.esegui
}
const VERI: Ferri = {
  salvaBozzaCasella: (t, s, e) => salvaBozzaCasella(t, s, e),
  creaNota: (o, signal) => mani.creaNota(o, signal),
  salvaConsegna: o => mani.salvaConsegna(o),
  luogo: () => mani.luogoPreferito(),
  esegui: (n, i, c) => mani.esegui(n, i, c)
}
let ferri: Ferri = VERI
/** Solo per le prove: sostituisce le mani, o le rimette (con `null`). */
export function perProva(f: Partial<Ferri> | null) { ferri = f ? { ...VERI, ...f } : VERI }

export type Proposta = Extract<store.PropostaDiCompito, { azione: 'posta.bozza' | 'nota.crea' | 'file.crea' | 'mandato.mano' }>

/** Le quattro che si eseguono qui. Le altre restano dove sono sempre state, in index.ts. */
export function eQui(p: store.PropostaDiCompito): p is Proposta {
  return p.azione === 'posta.bozza' || p.azione === 'nota.crea' || p.azione === 'file.crea' || p.azione === 'mandato.mano'
}

/** Com'è andata: quante fatte, e dove, per l'avviso. */
export type Fatto = { spostati: number; dove: string }

/**
 * Esegue la proposta di una riga e la chiude.
 *
 * Una risposta che la casella non accetta non ferma le altre: si salvano
 * quelle che si possono, e se nessuna passa è un errore (la riga resta lì,
 * con la proposta, da riprovare). Il registro dice cosa è successo, uno per uno.
 */
export async function esegui(c: store.Compito, p: Proposta): Promise<Fatto> {
  /*
   * Una mano trattenuta dal mandato (`mandato.ts`): la fa adesso il suo
   * tocco, con lei presente. Il mandato si rilegge lo stesso: se nel
   * frattempo quella classe è diventata «mai», non parte.
   */
  if (p.azione === 'mandato.mano') {
    const m = p.mani?.[0]
    if (!m) throw new Error('Non c\'è niente da eseguire.')
    const e = await ferri.esegui(m.nome, m.input, {
      cartella: m.cartella ?? null, ...(m.luogo && (mani.LUOGHI as readonly string[]).includes(m.luogo) ? { luogo: m.luogo as mani.Luogo } : {}),
      ...(m.chiaveNotion ? { chiaveNotion: m.chiaveNotion } : {}),
      mandato: { progetto: m.progetto, compito: c.id, presente: true }
    })
    store.registraAzione({ tipo: m.nome, cosa: m.titolo, compito: c.id, esito: e.male ? 'fallita' : 'fatta', ...(e.male ? { dettaglio: e.testo.slice(0, 300) } : {}) })
    if (e.male) throw new Error(e.testo || 'Non è riuscito.')
    // la traccia della carta da cui è nata: il passo trattenuto approvato è lavoro preso
    tracce.decidi(m.da, 'accettato', { distanza: 0 })
    chiudi(c.id, e.fatto.dettaglio ? `${e.fatto.dettaglio.slice(0, 200)}.` : 'Fatto.')
    return { spostati: 1, dove: e.fatto.dettaglio || m.titolo }
  }
  if (p.azione === 'posta.bozza') {
    if (!p.bozze?.length) throw new Error('Non c\'è niente da eseguire.')
    let salvate = 0
    let ultimo = ''
    const rimaste: typeof p.bozze = []
    for (const b of p.bozze) {
      const d = store.documento(b.doc)
      const email: store.EmailPronta = {
        a: b.a, oggetto: b.oggetto, corpo: b.corpo, conosciuto: store.indirizzoConosciuto(b.a),
        ...(d?.messageId ? { rispondeA: { messageId: d.messageId } } : {})
      }
      const r = await ferri.salvaBozzaCasella(`${c.id}:${b.doc}`, b.doc, email)
      if (r.stato === 'salvata') salvate++
      else { ultimo = r.errore ?? 'La casella non ha salvato la bozza.'; rimaste.push(b) }
      store.registraAzione({
        tipo: 'posta.bozza', verso: b.a, cosa: b.oggetto, compito: c.id,
        esito: r.stato === 'salvata' ? 'fatta' : 'fallita', ...(r.stato === 'salvata' ? {} : { dettaglio: ultimo })
      })
    }
    if (!salvate) throw new Error(ultimo || 'La casella non ha salvato le bozze.')
    /*
     * Salvate alcune sì e altre no: la riga resta, con la proposta ridotta a
     * quelle che mancano. Prima si chiudeva lo stesso, e le risposte che la
     * casella non aveva preso sparivano senza che nessuno lo sapesse.
     */
    if (rimaste.length) {
      store.proponi(c.id, { ...p, bozze: rimaste }, c.risultato ?? '')
      return { spostati: salvate, dove: 'Bozze' }
    }
    chiudi(c.id, `${salvate} ${salvate === 1 ? 'bozza' : 'bozze'} nella casella.`)
    return { spostati: salvate, dove: 'Bozze' }
  }
  if (p.azione === 'nota.crea') {
    const n = p.note?.[0]
    if (!n) throw new Error('Non c\'è niente da eseguire.')
    const fatta = await ferri.creaNota({ titolo: n.titolo, testo: n.testo })
    store.registraAzione({ tipo: 'nota', verso: fatta.cartella || 'Note', cosa: fatta.nome, compito: c.id, esito: 'fatta' })
    chiudi(c.id, `In Note: ${fatta.nome}.`)
    return { spostati: 1, dove: 'Note' }
  }
  const f = p.file?.[0]
  if (!f) throw new Error('Non c\'è niente da eseguire.')
  const scritto = ferri.salvaConsegna({ titolo: f.titolo, testo: f.testo, luogo: ferri.luogo() })
  store.registraAzione({ tipo: 'documento', verso: scritto.percorso, cosa: scritto.nome, compito: c.id, esito: 'fatta' })
  // col luogo, come i file della notte: la ricevuta dice «sulla Scrivania», non solo il nome
  store.scriviConsegnaCompito(c.id, { app: 'File', titolo: scritto.nome, percorso: scritto.percorso, dove: scritto.luogo })
  chiudi(c.id, `${scritto.nome}.`)
  return { spostati: 1, dove: scritto.nome }
}

function chiudi(id: string, detto: string) {
  store.scordaProposta(id)
  store.cambiaStatoCompito(id, 'fatto', detto)
}
