// I dati del feed che non stanno nella riga della carta: quando l'ha vista,
// se ha già risposto dalla sua posta, e dove è finito ogni documento che una
// lettura ha guardato.
//
// Sono tre domande sul database del conto, tenute qui e non in `store.ts`
// perché le fanno tre lavori diversi (la pagina, la lettura, la misura) e
// perché nessuna scrive una carta: `segnaViste` scrive un'ora, `segnaEsame`
// un registro, `risposteFuori` non scrive niente.

import db, { documento } from './store.ts'
import { indirizzoAttenzione, type ContestoAttenzione } from './rilevanza.ts'

const GIORNO = 86_400_000
const A_PEZZI = 200

/**
 * Quando le ha viste: una volta sola, e solo le aperte. Torna quante ha segnato.
 *
 * La pagina lo dice solo quando almeno metà della carta è stata sullo schermo
 * per un secondo con la finestra davanti (`src/feed-vista.ts`): questa è
 * l'unica scrittura, e non fa mai ricaricare il feed.
 */
export function segnaViste(ids: readonly string[], quando = new Date().toISOString()): number {
  let segnate = 0
  for (let i = 0; i < ids.length; i += A_PEZZI) {
    const pezzo = ids.slice(i, i + A_PEZZI)
    segnate += Number(db.prepare(`
      UPDATE feed SET vista = COALESCE(vista, ?)
      WHERE id IN (${pezzo.map(() => '?').join(',')}) AND stato = 'aperto' AND vista IS NULL
    `).run(quando, ...pezzo).changes)
  }
  return segnate
}

export type RispostaFuori = { quando: string; dopo: boolean; certezza: 'id' | 'filo' }

type Inviata = { risponde: string | null; filo: string | null; destinatari: string | null; quando: string | null }

/**
 * A quali carte ha già risposto dalla sua posta, e quando.
 *
 * Per ogni carta si prende la mail in arrivo dietro di lei: dal documento, o
 * dall'istantanea in `contesto` (che sopravvive a un documento sparito
 * dall'indice). Poi, fra le mail che ha mandato lui: prima chi cita quel
 * messaggio in `risponde` («id»), poi chi sta nello stesso filo, dopo la
 * mail in arrivo, e va a quell'indirizzo («filo»). Un filo che comincia con
 * «s:» è un oggetto, non una conversazione: non lega niente. `dopo` dice se
 * ha risposto dopo che la carta era nata, o prima.
 */
export function risposteFuori(voci: readonly { id: string; doc: string | null; contesto: string | null; quando: string }[]): Map<string, RispostaFuori> {
  const fuori = new Map<string, RispostaFuori>()
  const arrivo = voci.flatMap(v => {
    const d = v.doc ? documento(v.doc) : null
    let c: Partial<ContestoAttenzione> | null = d
    if (!c && v.contesto) { try { c = JSON.parse(v.contesto) as ContestoAttenzione } catch { c = null } }
    if (!c) return []
    return [{
      voce: v,
      messageId: c.messageId ?? null,
      filo: c.filo && !c.filo.startsWith('s:') ? c.filo : null,
      indirizzo: indirizzoAttenzione(c.autore),
      quando: c.quando ?? null
    }]
  })
  for (let i = 0; i < arrivo.length; i += A_PEZZI) {
    const pezzo = arrivo.slice(i, i + A_PEZZI)
    const messaggi = [...new Set(pezzo.map(a => a.messageId).filter((x): x is string => !!x))]
    const fili = [...new Set(pezzo.map(a => a.filo).filter((x): x is string => !!x))]
    if (!messaggi.length && !fili.length) continue
    const condizioni = [
      ...(messaggi.length ? [`risponde IN (${messaggi.map(() => '?').join(',')})`] : []),
      ...(fili.length ? [`filo IN (${fili.map(() => '?').join(',')})`] : [])
    ]
    const inviate = db.prepare(`
      SELECT risponde, filo, destinatari, quando FROM documenti
      WHERE inviato = 1 AND (${condizioni.join(' OR ')})
      ORDER BY quando ASC
    `).all(...messaggi, ...fili) as Inviata[]
    for (const a of pezzo) {
      const trovata = inviate.find(s => a.messageId && s.risponde === a.messageId)
        ?? inviate.find(s => a.filo && s.filo === a.filo
          && !!s.quando && !!a.quando && s.quando > a.quando
          && (s.destinatari === null || (!!a.indirizzo && `,${s.destinatari},`.includes(`,${a.indirizzo},`))))
      if (!trovata || !trovata.quando) continue
      fuori.set(a.voce.id, {
        quando: trovata.quando,
        dopo: trovata.quando >= a.voce.quando,
        certezza: a.messageId && trovata.risponde === a.messageId ? 'id' : 'filo'
      })
    }
  }
  return fuori
}

/** I messaggi a cui ha già risposto per `risponde`, fra questi. */
export function rispostiPerId(messageIds: readonly string[]): Set<string> {
  const fuori = new Set<string>()
  const ids = [...new Set(messageIds.filter(Boolean))]
  for (let i = 0; i < ids.length; i += A_PEZZI) {
    const pezzo = ids.slice(i, i + A_PEZZI)
    const righe = db.prepare(`SELECT DISTINCT risponde FROM documenti WHERE inviato = 1 AND risponde IN (${pezzo.map(() => '?').join(',')})`)
      .all(...pezzo) as { risponde: string }[]
    for (const r of righe) fuori.add(r.risponde)
  }
  return fuori
}

// — dove è finito ogni documento —

/**
 * Le fasi dell'esame di un documento, in ordine di strada:
 *   regole (con il motivo di `classificaAttenzione`), scartati (mittente
 *   automatico messo a tacere), gia (già sul feed, in lista, o risposto a
 *   suo tempo), risposto (una risposta più recente nel filo o per
 *   `risponde`), gia_risposto (la regola «già fatta» di feed-impara),
 *   non_suo (la regola «non è mia»), posti (tagliato dai trenta posti),
 *   modello (letto, nessuna carta), verifica (con il motivo), obiettivo,
 *   lingua, doppione, carta.
 */
export const FASI = ['regole', 'scartati', 'gia', 'risposto', 'gia_risposto', 'non_suo', 'posti', 'modello', 'verifica', 'obiettivo', 'lingua', 'doppione', 'carta'] as const
export type Fase = typeof FASI[number]

/** Quanto resta il registro dell'esame: oltre, un documento è fuori da ogni finestra. */
export const ESAME_GIORNI = 60

/**
 * Scrive dove è finito ogni documento, in una transazione. Una riga che dice
 * la stessa cosa di prima non si tocca: `quando` resta quello della prima
 * volta in cui il documento è arrivato lì.
 */
export function segnaEsame(righe: readonly { doc: string; fase: Fase | string; motivo?: string | null }[], quando = new Date().toISOString()): number {
  if (!righe.length) return 0
  /*
   * Si riscrive quando cambia qualcosa; e sempre per «modello» e «verifica»,
   * che dicono *quando* il modello l'ha letto l'ultima volta: è l'ora che il
   * salto delle ventiquattro ore confronta, e se restasse quella del primo
   * giorno il salto varrebbe un giorno solo. «gia» e «risposto» invece non
   * coprono una fase che dice dove il feed l'ha perso (carta, modello, posti,
   * verifica, regole): dicono solo che ormai è a posto, e a chi misura le
   * mancate serve la fase di prima. Lo stesso per «regole» e «scartati» sopra
   * una fase del modello: una mail che il modello ha detto di no il primo
   * giorno passa fra le regole dopo sette (o appena letta), e la mancata
   * sarebbe messa in conto alle regole invece che al modello. Le regole
   * riempiono una riga nuova, o ne riscrivono una che era già delle regole.
   */
  const ins = db.prepare(`
    INSERT INTO feed_esame (doc, fase, motivo, quando) VALUES (?, ?, ?, ?)
    ON CONFLICT(doc) DO UPDATE SET fase = excluded.fase, motivo = excluded.motivo, quando = excluded.quando
    WHERE (feed_esame.fase IS NOT excluded.fase OR feed_esame.motivo IS NOT excluded.motivo OR excluded.fase IN ('modello', 'verifica'))
      AND NOT (excluded.fase IN ('gia', 'risposto') AND feed_esame.fase NOT IN ('gia', 'risposto'))
      AND NOT (excluded.fase IN ('regole', 'scartati') AND feed_esame.fase NOT IN ('regole', 'scartati'))
  `)
  let scritte = 0
  db.exec('BEGIN')
  try {
    for (const r of righe) scritte += Number(ins.run(r.doc, r.fase, r.motivo ?? null, quando).changes)
    db.prepare('DELETE FROM feed_esame WHERE quando < ?').run(new Date(Date.parse(quando) - ESAME_GIORNI * GIORNO).toISOString())
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  return scritte
}

export type Esame = { fase: string; motivo: string | null; quando: string }

export function esameDi(ids: readonly string[]): Map<string, Esame> {
  const fuori = new Map<string, Esame>()
  for (let i = 0; i < ids.length; i += A_PEZZI) {
    const pezzo = ids.slice(i, i + A_PEZZI)
    const righe = db.prepare(`SELECT doc, fase, motivo, quando FROM feed_esame WHERE doc IN (${pezzo.map(() => '?').join(',')})`)
      .all(...pezzo) as (Esame & { doc: string })[]
    for (const r of righe) fuori.set(r.doc, { fase: r.fase, motivo: r.motivo, quando: r.quando })
  }
  return fuori
}
