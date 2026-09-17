import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { frasi, lingua, t } from '../lingua'
import { Hov, daTastiera, useAttiva } from '../ui'
import { IconAvanti, IconFrecciaDx, IconGiu, IconSpunta } from '../icons'
import { Glifo, Stato } from '../components/Stato'
import { Marchio } from '../components/Marchio'
import { Rassegna } from '../components/Rassegna'
import { Punto } from '../components/Punto'
import { MenuGiu, VOCE_MENU } from '../components/MenuGiu'
import { generePrimoDocumento, nomeDelFile, nomePorta, portaInChat, primoParagrafo, siPuoParlarne, taglia, type Vals } from '../vals'
import type { Lista } from '../oggi/useCompiti'
import { secchioVivo } from '../oggi/secchi'
import { giornoLocale } from '../oggi/giorni'
import type { Compito } from '../api'
import { AuroraCompito, PassoAttivo } from '../components/AuroraCompito'
import { compitoInEsecuzione } from '../compito-attivo'
import { consegnaPronta, messaggioConsegna, presentazioneRevisione, statoRevisione } from '../consegna-ui'
import { velato } from '../colori-progetto'

// Sulla riga aperta la freccia lascia il posto al pallino di prima: mentre
// leggi, «vai qui» non è più il consiglio giusto — ci sei già.
const PUNTINO: CSSProperties = {
  width: 7, height: 7, borderRadius: '50%', margin: '3px 0',
  background: '#FFFDF9', boxShadow: '0 0 0 1px rgba(34,39,31,.16)'
}

/**
 * I due pesi dei bottoni sulla card scura: uno pieno, gli altri di contorno.
 * Il bordo c'è in tutti e due — bianco su bianco nel pieno — così passare
 * dall'uno all'altro non sposta di un pixel quello che sta accanto.
 */
const PIENO_SCURO: CSSProperties = {
  padding: '12px 26px', borderRadius: 99, border: '1px solid #FFF7F0', background: '#FFF7F0', color: '#22271F',
  fontSize: 14, fontWeight: 500, boxShadow: '0 10px 24px rgba(30,20,14,.3)', cursor: 'pointer', fontFamily: 'inherit'
}
const CONTORNO_SCURO: CSSProperties = {
  ...PIENO_SCURO, border: '1px solid rgba(255,247,240,.5)', background: 'none', color: '#FFF7F0', boxShadow: 'none'
}
/** Un solo bottone pieno per card: quando si apre un rigo per scrivere, il pieno passa a «Manda». */
const primario = (pieno: boolean) => (pieno ? PIENO_SCURO : CONTORNO_SCURO)

/**
 * Una riga del resto.
 *
 * La riga intera porta la voce in cima; il chevron in fondo alla frase apre il
 * testo e basta, e per questo si ferma il click prima che risalga. Sono due
 * gesti che stanno nello stesso rettangolo, quindi devono essere due bersagli
 * distinti e non due interpretazioni dello stesso.
 */
function Riga({ riga }: { riga: Vals['resto'][number] }) {
  const { attiva, props } = useAttiva()
  return (
    <div role="button" tabIndex={0} onClick={riga.onPromote} onKeyDown={daTastiera(riga.onPromote)}
      style={{ ...riga.row, borderTop: 'none' }} {...props}>
      <span style={riga.freccia}>
        {riga.aperto ? <span style={PUNTINO} /> : <IconFrecciaDx size={13} />}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={riga.tipoStyle}>{t(riga.tipo)}</span>
          <span style={{ fontSize: 12, color: 'rgba(34,39,31,.6)', minWidth: 0 }}>{[riga.fonte, riga.ora].filter(Boolean).join(' · ')}</span>
          {/*
            Lo stesso gesto della carta grande, nello stesso angolo. Qui però si
            fa vedere quando la riga è sotto il dito — come «in lista» qui
            accanto: sempre acceso su otto righe sarebbe una colonna di
            «non mi interessa», cioè il contrario di humble. `useAttiva` lo
            accende anche col tocco e con la tastiera, quindi non è un gesto
            che esiste solo per chi ha un mouse.
          */}
          <div style={{ flex: 1 }} />
          <Hov as="button" type="button"
            onClick={(e: MouseEvent) => { e.stopPropagation(); riga.onScarta() }}
            title={t('Toglila dal feed')} aria-label={t('Non mi interessa')}
            style={{
              flex: 'none', padding: '2px 2px', border: 'none', background: 'none',
              color: 'rgba(34,39,31,.45)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
              whiteSpace: 'nowrap',
              opacity: attiva ? 1 : 0, pointerEvents: attiva ? 'auto' : 'none', transition: 'opacity .15s'
            }}
            hover={{ color: '#8E3F1F' }}>{t('Non mi interessa')}</Hov>
        </div>
        {/* titoli e testi li scrive il modello da oggetti di email e nomi di
            file: una parola senza spazi non deve poter uscire dalla riga */}
        <div style={{ fontSize: '14.5px', fontWeight: 500, marginTop: 6, overflowWrap: 'anywhere' }}>{riga.titolo}</div>
        <div style={{ fontSize: '14px', lineHeight: 1.5, color: 'rgba(34,39,31,.7)', marginTop: 3, textWrap: 'pretty', overflowWrap: 'anywhere' }}>
          {riga.testo}
          {riga.espandibile && (
            <Hov as="button" onClick={(e: MouseEvent) => { e.stopPropagation(); riga.onToggle() }}
              title={riga.aperto ? t('Richiudi') : t('Vedi tutto')}
              style={riga.chevron} hover={{ color: '#22271F' }}>
              <IconGiu size={13} stroke="currentColor" />
            </Hov>
          )}
        </div>
        {/* perché sta qui, e per quale obiettivo: una riga sotto, piana, senza colore */}
        {riga.perche && (
          <div style={{ fontSize: '12.5px', lineHeight: 1.45, color: 'rgba(34,39,31,.5)', marginTop: 4, textWrap: 'pretty', overflowWrap: 'anywhere' }}>{riga.perche}</div>
        )}
      </div>
      {/* prendere in carico una cosa che lui ha notato: è il gesto che unisce le
          due schermate, e va fatto da qui — dove la cosa la stai leggendo */}
      <Hov as="button"
        onClick={(e: MouseEvent) => { e.stopPropagation(); riga.onInLista() }}
        title={t('Mettila in lista')} aria-label={t('Mettila in lista')}
        style={{
          flex: 'none', padding: '4px 11px', borderRadius: 99, border: '1px solid rgba(34,39,31,.2)',
          background: 'rgba(255,255,255,.7)', color: 'rgba(34,39,31,.72)', fontSize: 12,
          fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
          opacity: attiva ? 1 : 0, pointerEvents: attiva ? 'auto' : 'none', transition: 'opacity .15s'
        }}
        hover={{ borderColor: '#C4623B', color: '#8E3F1F' }}>{t('in lista')}</Hov>

      {riga.urgenza && <span style={riga.pill}>{riga.urgenza}</span>}
    </div>
  )
}

/** Il feed: la cosa più urgente in grande, il resto sotto, le fatte in fondo. */

/** La pastiglia a destra della riga: la stessa che porta l'urgenza delle sue. */
const PASTIGLIA: CSSProperties = {
  flex: 'none', fontSize: '12px', fontWeight: 700, letterSpacing: '.02em', color: '#8E3F1F',
  background: 'rgba(196,98,59,.16)', border: '1px solid rgba(196,98,59,.32)', borderRadius: 99, padding: '5px 11px'
}

/**
 * Da dove viene una riga, detto in una cosa sola e apribile.
 *
 * «I compiti non mi riportano alla fonte vera. Deve dirmi esattamente da dove
 * viene, così posso agirci.» Due righe scritte dal punto quella mattina — «di'
 * quale unità di H-Farm guarda l'audit», «decidi il passo dopo» — non avevano
 * né documento né progetto: nascevano dalle domande di un'altra riga, e sulla
 * carta non c'era niente da premere. Adesso il filo si scrive sempre, e questa
 * funzione lo legge nell'ordine in cui è utile: il documento, che è la cosa
 * più vicina al lavoro; il progetto, che dice almeno dove sta; e in ultimo il
 * posto in cui la riga è nata.
 *
 * «mano» non torna niente: l'ha scritta lui, e dirgli da dove viene sarebbe
 * una presa in giro.
 */
function provenienza(c: Compito, v: Vals, l?: Lista): { testo: string; apri?: () => void } | null {
  if (c.doc) {
    const doc = c.doc
    // «il file contratto-nextas.pdf»: il nome, mai la strada per arrivarci —
    // di una mail o di una pagina non si dice niente, perché quello che
    // resterebbe dell'id sarebbe un numero
    const nome = nomeDelFile(doc)
    const cosa = generePrimoDocumento(null, doc)
    return { testo: nome ? `${cosa} ${nome}` : cosa, apri: () => v.apriFonte(doc) }
  }
  if (c.progetto) {
    const id = c.progetto
    const nome = v.progetti.find(p => p.id === id)?.nome ?? ''
    return { testo: nome ? `${t('il progetto')} ${nome}` : t('il progetto'), apri: () => v.apriProgetto(id) }
  }
  /*
   * La riga da cui è nata, che non si leggeva da nessuna parte.
   *
   * `madre` c'è sul disco da giorni e qui non veniva nemmeno guardata: una
   * riga nata dalle domande di un'altra non diceva niente, e lui chiedeva
   * «chi me l'ha chiesto? da dove viene?». La riga madre è la risposta, ed è
   * anche un posto dove andare.
   */
  if (c.madre) {
    const id = c.madre
    // stessa strada di «Portami lì» quando il posto è una riga: la lista
    // apre il dettaglio appena la vede
    return { testo: t('la riga che l’ha fatta nascere'), apri: () => { l?.chiediDiAprire(id); v.goOggi() } }
  }
  // «chat» e le automazioni: i due rami di prima cercavano parole che nessuno
  // scrive più — `origine` vale 'chat', e un'automazione scrive 'auto:<id>' —
  // quindi quelle righe non dicevano da dove venivano
  if (c.origine === 'chat' || c.origine === 'conversazione') return { testo: t('la chat'), apri: () => v.goChat() }
  if (c.origine === 'iniziativa') return { testo: t('Prepara in anticipo') }
  if (c.origine === 'punto') return { testo: t('il punto del giorno') }
  if (c.origine === 'avvio' || c.origine === 'onboarding') return { testo: t('il primo progetto') }
  if (c.origine?.startsWith('auto:') || c.origine === 'automazione') return { testo: t('un’automazione') }
  if (c.origine === 'feed') return { testo: t('il feed') }
  return null
}

/**
 * Da dove viene una riga: un rigo solo, e apribile.
 *
 * È la risposta a «quando affido una cosa, non la trovo utile come dovrebbe».
 * Una riga affidata tornava con un testo e basta: da dove venisse — la mail a
 * cui rispondere — restava scritto nel database e invisibile sullo schermo.
 *
 * Sotto ci stava anche «Fonti usate», con i nomi dei documenti che aveva
 * aperto per lavorarci. Via: «mi dice le fonti che ha usato, e io non voglio
 * saperlo». Chi legge una riga vuole farla, non controllare come è stata
 * fatta — e tre titoli di file in coda a ogni riga sono rumore che nessuno ha
 * chiesto. Quello che resta è la cosa da cui è nata, che serve per agire.
 *
 * È un link, non una pastiglia: la riga resta quello che conta. Il click non
 * risale — dentro una riga della lista aprirebbe anche la riga — e il nome si
 * ferma con i tre puntini invece di spingere fuori la card.
 */
function Prove({ c, v, l, scuro }: { c: Compito; v: Vals; l?: Lista; scuro?: boolean }) {
  const da = provenienza(c, v, l)
  if (!da) return null
  const quieto = scuro ? 'rgba(255,247,240,.68)' : 'rgba(34,39,31,.55)'
  const acceso = scuro ? '#FFF7F0' : '#8E3F1F'
  const link: CSSProperties = {
    maxWidth: 260, minWidth: 0, padding: 0, border: 'none', background: 'none',
    fontFamily: 'inherit', fontSize: '12.5px', color: quieto, cursor: 'pointer', textAlign: 'left',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    // la sottolineatura c'è solo sotto il dito: sul titolo della carta grande
    // era un invito a cliccare prima ancora di aver letto, qui è la conferma
    // che quella parola porta da qualche parte
    textDecoration: 'underline', textDecorationColor: 'transparent', textUnderlineOffset: 3
  }
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '2px 7px', marginTop: 12, maxWidth: '100%', minWidth: 0 }}>
      <span style={{ flex: 'none', fontSize: '12.5px', color: quieto }}>{t('Da')}</span>
      {da.apri
        ? (
          <Hov as="button" type="button" title={da.testo}
            onClick={(e: MouseEvent) => { e.stopPropagation(); da.apri?.() }}
            style={{ ...link, flex: 'none', color: acceso }}
            hover={{ textDecorationColor: 'currentColor' }}>{da.testo}</Hov>
        )
        : (
          // il punto del giorno, il primo progetto, un'automazione: posti
          // che non si aprono, e un link che non porta da nessuna parte è
          // peggio di una parola scritta
          <span style={{ ...link, flex: 'none', cursor: 'default', textDecoration: 'none' }}>{da.testo}</span>
        )}
    </div>
  )
}

/**
 * «Portami lì».
 *
 * «Perché non c'è un bottone che dice *portami lì così la vedo adesso*? Mi
 * serve un bottone, soprattutto se è una mail o un documento: invece di
 * aprirlo dentro Myynd, "portami lì", e l'agente me lo apre.»
 *
 * Il link «Da …» qui accanto fa l'altra cosa — mostra il documento *dentro*
 * Myynd — e le due restano separate apposta: una copia della mail non è la
 * mail, e alla mail si risponde dal programma di posta. Questo bottone apre il
 * posto vero: Mail sul messaggio giusto, il Finder sul file, il browser sulla
 * pagina.
 *
 * E *solo* quello. Compariva su ogni riga che avesse un documento, una riga
 * madre o un progetto, e le ultime due non sono posti: premendolo si apriva la
 * scheda della riga da cui era nata, o la Memoria. «Mi apre un compito, non mi
 * porta alla mail, non mi porta al documento, non mi porta da nessuna parte.»
 * Aveva ragione — era lo stesso bottone con due promesse diverse. Adesso ne fa
 * una: il server dice in `porta` se là fuori c'è davvero qualcosa, e senza
 * quello il bottone non c'è. Il progetto e la riga madre restano dove erano
 * già: nel link «Da …», che dice dove va prima che lo si prema.
 *
 * Il nome dice cosa apre — «Apri la mail», non «Portami lì» — perché la
 * differenza fra le tre cose è tutta lì: da una mail si risponde, un file si
 * legge, una pagina si guarda.
 *
 * Di contorno, mai pieno: su ogni carta il pieno è uno solo, ed è quello che
 * chiude la riga. E non sta sotto il «⋯»: quello che serve adesso non si
 * nasconde dietro tre puntini.
 */
function Portami({ c, l, v, scuro, anteprima = false }: { c: Compito; l: Lista; v: Vals; scuro?: boolean; anteprima?: boolean }) {
  if ((!c.porta && !c.consegna) || (anteprima && !c.consegna?.anteprima)) return null

  const vai = async () => {
    const r = await l.portami(c.id, anteprima ? { anteprima: true } : undefined)
    // il perché l'ha già detto la lista, con un avviso: qui non si aggiunge niente
    if (!r || !r.ok) return
    // i due posti che stanno dentro l'app: li apre chi ha lo schermo
    if (r.dove === 'compito') { l.chiediDiAprire(r.id); v.goOggi() }
    else if (r.dove === 'progetto') v.apriProgetto(r.id)
  }

  const etichetta = anteprima ? (lingua() === 'en' ? 'Preview PDF' : 'Anteprima PDF') : c.consegna ? `${lingua() === 'en' ? 'Open in' : 'Apri in'} ${c.consegna.app}` : nomePorta(c.porta!)
  const vestito: CSSProperties = scuro
    ? {
        padding: '12px 20px', borderRadius: 99, border: '1px solid rgba(255,247,240,.32)',
        background: 'none', color: 'rgba(255,247,240,.9)', fontSize: 14
      }
    : {
        padding: '4px 11px', borderRadius: 99, border: '1px solid rgba(34,39,31,.2)',
        background: 'rgba(255,255,255,.7)', color: 'rgba(34,39,31,.72)', fontSize: 12
      }

  return (
    <Hov as="button" type="button"
      onClick={(e: MouseEvent) => { e.stopPropagation(); void vai() }}
      title={c.consegna?.titolo ?? etichetta}
      style={{ ...vestito, flex: 'none', whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: 'inherit' }}
      hover={scuro ? { background: 'rgba(255,247,240,.16)', borderColor: 'rgba(255,247,240,.5)' } : { borderColor: '#C4623B', color: '#8E3F1F' }}>
      {etichetta}
    </Hov>
  )
}

function BozzaInPosta({ c }: { c: Compito }) {
  const b = c.email?.casella
  if (!b) return null
  return <div style={{ marginTop: 10, fontSize: 13 }} onClick={e => e.stopPropagation()}>
    {b.stato === 'salvata' ? <><span>{t('Salvata nelle bozze della tua posta. Nessun messaggio inviato.')}</span>{' '}<a href={b.url} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>{t('Apri la bozza nella posta')}</a></>
      : <span role="status">{t('La bozza è qui, ma non è stata salvata nella posta.')} {b.errore}</span>}
  </div>
}

function Consegna({ c, l, v, scuro = false }: { c: Compito; l: Lista; v: Vals; scuro?: boolean }) {
  const d = c.consegna
  if (!d) return null
  const en = lingua() === 'en'
  const revisione = statoRevisione(d.revisione, en)
  return <section className={`task-delivery${scuro ? ' task-delivery-dark' : ''}`} aria-label={en ? 'Document' : 'Documento'}>
    <div className="task-delivery-title">{d.titolo}</div>
    <div className="task-delivery-meta">{[d.app, d.pagine ? `${d.pagine} ${en ? (d.pagine === 1 ? 'page' : 'pages') : (d.pagine === 1 ? 'pagina' : 'pagine')}` : null, d.stile].filter(Boolean).join(' · ')}</div>
    <div className="task-delivery-review" data-review={d.revisione?.esito ?? 'unavailable'}>{revisione}</div>
    {d.revisione?.esito !== 'pass' && !!d.revisione?.problemi.length && <ul className="task-delivery-issues">{d.revisione.problemi.map((p, i) => <li key={i}>{p}</li>)}</ul>}
    <div className="task-delivery-actions"><Portami c={c} l={l} v={v} scuro={scuro} /><Portami c={c} l={l} v={v} scuro={scuro} anteprima /></div>
  </section>
}

/** Completed artifacts are a short hand-off, with technical details available on demand. */
function ConsegnaPronta({ c, l, v, richiudi }: { c: Compito; l: Lista; v: Vals; richiudi?: () => void }) {
  const d = c.consegna!
  const en = lingua() === 'en'
  return <section className={`task-completed${richiudi ? ' task-completed-hero' : ''}`} aria-label={t('È pronto.')}>
    <div className="task-completed-heading">
      <span className="task-completed-check"><IconSpunta size={14} /></span>
      <strong>{t('È pronto.')}</strong>
      <span className="task-completed-name" title={d.titolo}>{d.titolo}</span>
      {richiudi && <button type="button" className="task-completed-collapse" onClick={richiudi} aria-label={t('Richiudi')}><IconGiu size={14} /></button>}
    </div>
    <p className="task-completed-message">{messaggioConsegna(d, en)}</p>
    <div className="task-completed-actions">
      <Portami c={c} l={l} v={v} />
      <button type="button" className="task-completed-discuss" onClick={() => v.discutiCompito(c)}>{t('Parlane in chat')}</button>
      <button type="button" className="task-completed-dismiss" onClick={() => l.chiudi(c.id, t('Va bene così.'), c.risultato ?? '')}>{t('Va bene')}</button>
      <details className="task-completed-details">
        <summary>{t('Dettagli')}</summary>
        <div className="task-completed-review">{statoRevisione(d.revisione, en)}{d.pagine ? ` · ${d.pagine} ${en ? 'pages' : 'pagine'}` : ''}</div>
        <Portami c={c} l={l} v={v} anteprima />
      </details>
    </div>
  </section>
}

/** Cosa c'è scritto accanto a «DA FARE»: cosa sta succedendo, o dove sta. */
function didascalia(c: Compito, attivo = false): string {
  if (c.stato === 'delegato') return attivo ? t('ci sta lavorando') : t('In coda')
  // lo scaffale che si vede è quello di oggi, non quello scritto: una cosa pianificata
  // per un giorno passato è di oggi anche qui, come nella lista
  const secchio = secchioVivo(c, giornoLocale())
  return t(secchio === 'oggi' ? 'Oggi' : secchio === 'settimana' ? 'Questa settimana' : 'Prima o poi').toLowerCase()
}

/**
 * Il corpo: il guaio se c'è, l'essenza di quello che ha scritto lui se è
 * arrivato, la nota se l'hai messa.
 *
 * Quello che ha scritto lui adesso porta due cose in una — l'essenza in cima,
 * poi una riga vuota, poi il lavoro intero — e qui, sotto il titolo del
 * compito, ci sta solo la prima: il resto lo vede chi apre la carta.
 */
function corpo(c: Compito): string {
  if (c.guaio) return t(c.guaio)
  if (c.consegna) return ''
  if (c.stato === 'pronto' || c.stato === 'chiede') return primoParagrafo(c.risultato ?? '')
  return presentazioneRevisione(c, lingua() === 'en')?.descrizione ?? c.nota ?? ''
}

/** Quello che aspetta te, detto in una parola. */
function attesaDi(c: Compito): string {
  return c.stato === 'pronto' ? t('pronta') : c.stato === 'chiede' ? t('ti chiede') : ''
}

function RigaCompito({ c, l, v, apri }: { c: Compito; l: Lista; v: Vals; apri: () => void }) {
  const { attiva, props } = useAttiva()
  const attesa = attesaDi(c)
  const testo = corpo(c)
  const attivo = compitoInEsecuzione(c, l.passi[c.id])

  if (consegnaPronta(c)) return <ConsegnaPronta c={c} l={l} v={v} />

  return (
    <div className="task-aurora-host task-aurora-row" data-working={attivo || undefined} role="button" tabIndex={0} onClick={apri} onKeyDown={daTastiera(apri)}
      style={{ display: 'flex', gap: 13, alignItems: 'flex-start', padding: '17px 21px', cursor: 'pointer' }}
      {...props}>
      {attivo && <AuroraCompito />}
      <span style={{ flex: 'none', width: 14, marginTop: 4, display: 'flex', justifyContent: 'center', color: 'rgba(62,81,64,.6)' }}>
        {attivo
          ? <Glifo tipo="penso" dim={13} colore="#C4623B" />
          : <IconFrecciaDx size={13} />}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ fontSize: '11.5px', fontWeight: 600, letterSpacing: '.09em', textTransform: 'uppercase', color: '#3E5140' }}>{t('Da fare')}</span>
          <span style={{ fontSize: 12, color: 'rgba(34,39,31,.6)' }}>{didascalia(c, attivo)}</span>
        </div>
        <div style={{ fontSize: '14.5px', fontWeight: 500, marginTop: 6, overflowWrap: 'anywhere' }}>{presentazioneRevisione(c, lingua() === 'en')?.titolo ?? c.testo}</div>
        {testo && (
          <div style={{ fontSize: '14px', lineHeight: 1.5, color: 'rgba(34,39,31,.7)', marginTop: 3, textWrap: 'pretty', overflowWrap: 'anywhere' }}>
            {taglia(testo, 140)}
          </div>
        )}
        {/* da dove viene e cosa ha letto: la riga si apre in cima, il documento
            si apre solo da qui — e da nessun altro punto della riga */}
        {attivo && <PassoAttivo passo={l.passi[c.id]} />}
        <Consegna c={c} l={l} v={v} /><BozzaInPosta c={c} />
        <Prove c={c} v={v} l={l} />
      </div>

      {/* il posto vero da cui viene, aperto sul Mac. Sempre visibile — al
          contrario di «fatta», che compare col mouse: è la cosa che mancava, e
          una cosa che si scopre solo passandoci sopra continua a mancare */}
      {!c.consegna && <Portami c={c} l={l} v={v} />}

      {/* chiuderla senza nemmeno aprirla: è il gesto che si fa più spesso, e sta
          nello stesso punto in cui le voci di Myynd offrono «in lista» */}
      <Hov as="button"
        onClick={(e: MouseEvent) => { e.stopPropagation(); l.chiudi(c.id) }}
        title={t('Fatto')} aria-label={`${t('Fatto')}: ${presentazioneRevisione(c, lingua() === 'en')?.titolo ?? c.testo}`}
        style={{
          flex: 'none', padding: '4px 11px', borderRadius: 99, border: '1px solid rgba(34,39,31,.2)',
          background: 'rgba(255,255,255,.7)', color: 'rgba(34,39,31,.72)', fontSize: 12,
          fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
          opacity: attiva ? 1 : 0, pointerEvents: attiva ? 'auto' : 'none', transition: 'opacity .15s'
        }}
        hover={{ borderColor: '#C4623B', color: '#8E3F1F' }}>{t('fatta')}</Hov>

      {attesa && <span style={PASTIGLIA}>{attesa}</span>}
    </div>
  )
}

/**
 * Una cosa della tua lista, in cima.
 *
 * Stessa card di quelle che nota lui — stesso vetro caldo, stesso titolo
 * grande, stessa fascia di bottoni in fondo — perché in cima ci va quello che
 * conta adesso, e quello che conta adesso può benissimo essere una cosa che ti
 * sei segnato tu.
 *
 * Quello che cambia sono i verbi. Una voce si risolve; un compito si chiude, si
 * affida, si rimanda o si toglie. Tutto da qui: la ragione per cui questa card
 * esiste è che il feed non deve mai mandarti da un'altra parte per finire una
 * cosa che sta guardando.
 */
function HeroCompito({ c, l, v, richiudi }: { c: Compito; l: Lista; v: Vals; richiudi: () => void }) {
  const [menu, setMenu] = useState(false)
  const bottone = useRef<HTMLButtonElement | null>(null)
  const chiudiMenu = useCallback(() => setMenu(false), [])
  const [lungo, setLungo] = useState(false)
  const [risposta, setRisposta] = useState('')
  const pronto = c.stato === 'pronto'
  const chiede = c.stato === 'chiede'
  const delegato = c.stato === 'delegato'
  const attivo = compitoInEsecuzione(c, l.passi[c.id])
  // `testo` è l'essenza — quello che sta sotto al titolo, un paragrafo solo.
  // `completo` è quello che ha scritto per intero: quello che «di più» apre, e
  // quello che si tiene quando accetti la bozza, perché è da lì che impara
  // come scrivi — non dalle due righe di riassunto.
  const testo = corpo(c)
  const completo = pronto || chiede ? (c.risultato ?? '') : testo
  const tagliato = completo.length > 180

  /** Il «⋯»: quello che non si fa quasi mai, e che quindi non deve stare in vista. */
  const altro = [
    ...(delegato || pronto ? [] : [{ id: 'bozza', label: t('Fanne una bozza'), fai: () => l.delega(c.id, 'bozza') }]),
    ...(c.quando !== 'oggi' ? [{ id: 'oggi', label: t('Riportala a oggi'), fai: () => l.cambia(c.id, { quando: 'oggi' }) }] : []),
    ...(c.quando !== 'settimana' ? [{ id: 'sett', label: t('Rimandala a questa settimana'), fai: () => l.cambia(c.id, { quando: 'settimana' }) }] : []),
    ...(c.quando !== 'poi' ? [{ id: 'poi', label: t('Rimandala a prima o poi'), fai: () => l.cambia(c.id, { quando: 'poi' }) }] : [])
  ]

  const rispondi = () => { if (risposta.trim()) l.rispondi(c.id, risposta.trim()) }

  if (consegnaPronta(c)) return <ConsegnaPronta c={c} l={l} v={v} richiudi={richiudi} />

  return (
    <div className="task-aurora-host task-aurora-hero" data-working={attivo || undefined} style={{ ...v.heroStyle, position: 'relative', zIndex: menu ? 30 : undefined }}>
      {attivo && <AuroraCompito />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {attivo ? <Glifo tipo="penso" dim={15} colore="#FFF7F0" /> : <IconFrecciaDx size={15} />}
        <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: '.02em' }}>{t('Da fare')}</span>
        <span style={{ fontSize: '12.5px', color: 'rgba(255,247,240,.85)' }}>{didascalia(c, attivo)}</span>
        <Hov as="button" type="button" onClick={richiudi} aria-label={t('Richiudi')} title={t('Richiudi')} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: '#FFF7F0', cursor: 'pointer', fontFamily: 'inherit', padding: '4px 6px', fontSize: 12 }}>{t('Richiudi')} <IconGiu size={12} /></Hov>
        {attesaDi(c) && (
          <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '.02em', color: '#FFF7F0', background: 'rgba(255,247,240,.2)', border: '1px solid rgba(255,247,240,.4)', borderRadius: 99, padding: '3px 10px' }}>
            {attesaDi(c)}
          </span>
        )}
      </div>

      <div style={{ fontSize: 22, lineHeight: 1.35, marginTop: 20, maxWidth: 600, textWrap: 'pretty', fontWeight: 500, overflowWrap: 'anywhere' }}>{presentazioneRevisione(c, lingua() === 'en')?.titolo ?? c.testo}</div>

      {testo && (
        <div style={{ fontSize: '15.5px', lineHeight: 1.6, marginTop: 10, maxWidth: 600, color: 'rgba(255,247,240,.82)', textWrap: 'pretty', whiteSpace: 'pre-line' }}>
          {lungo ? completo : taglia(testo, 180)}
          {tagliato && (
            <Hov as="button" onClick={() => setLungo(x => !x)}
              style={{ border: 'none', background: 'none', padding: '0 0 0 6px', fontFamily: 'inherit', fontSize: '13.5px', color: 'rgba(255,247,240,.6)', cursor: 'pointer' }}
              hover={{ color: '#FFF7F0' }}>{lungo ? t('meno') : t('di più')}</Hov>
          )}
        </div>
      )}

      {attivo && <PassoAttivo passo={l.passi[c.id]} />}
      <Consegna c={c} l={l} v={v} scuro /><BozzaInPosta c={c} />
      <Prove c={c} v={v} l={l} scuro />

      {/* a capo invece che fuori: con un bottone in più questa fascia, in una
          finestra stretta, usciva dalla carta — e il testo che sfora non è un
          dettaglio, è l'app che sembra rotta */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 20 }}>
        {/* quello che si fa quasi sempre. Su una bozza pronta «Fatto» sarebbe
            una bugia: quello che chiudi lì è il testo che hai davanti, e va
            tenuto — è da lì che impara come scrivi */}
        {/* uno solo pieno per card: quando lui ti chiede una cosa, il pieno è «Manda» qui sotto */}
        <Hov as="button"
          onClick={() => (pronto ? l.chiudi(c.id, t('Va bene così.'), completo) : l.chiudi(c.id))}
          style={primario(!chiede)}
          hover={chiede ? { background: 'rgba(255,247,240,.16)' } : { background: '#FFFFFF' }}>{pronto ? t('Va bene') : t('Fatto')}</Hov>

        <Hov as="button"
          onClick={() => (pronto ? l.delega(c.id, c.modo) : delegato ? l.richiama(c.id) : l.delega(c.id, 'tutto'))}
          style={{ padding: '12px 20px', borderRadius: 99, border: '1px solid rgba(255,247,240,.5)', background: 'none', color: '#FFF7F0', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}
          hover={{ background: 'rgba(255,247,240,.16)' }}>
          {pronto ? t('Rifallo') : delegato ? t('Richiamala') : t('Se ne occupa Myynd')}
        </Hov>

        {!c.consegna && <Portami c={c} l={l} v={v} scuro />}

        {altro.length > 0 && (
          <>
            <Hov as="button" ref={bottone} onClick={() => setMenu(m => !m)} title={t('Altro')} aria-label={t('Altro')} aria-haspopup="menu" aria-expanded={menu}
              style={{ padding: '12px 15px', borderRadius: 99, border: '1px solid rgba(255,247,240,.28)', background: menu ? 'rgba(255,247,240,.16)' : 'none', color: 'rgba(255,247,240,.85)', fontSize: 15, lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit' }}
              hover={{ background: 'rgba(255,247,240,.16)', borderColor: 'rgba(255,247,240,.5)' }}>⋯</Hov>

            {/* fuori dalla carta: qui dentro l'avrebbe tagliato il suo `overflow: hidden` — vedi `MenuGiu` */}
            {menu && (
              <MenuGiu ancora={bottone.current} chiudi={chiudiMenu} minLarghezza={210}>
                {altro.map(a => (
                  <Hov key={a.id} as="button" type="button" role="menuitem" onClick={() => { setMenu(false); a.fai() }}
                    style={{ ...VOCE_MENU, whiteSpace: 'nowrap' }}
                    hover={{ background: 'rgba(196,98,59,.09)' }}>{a.label}</Hov>
                ))}
              </MenuGiu>
            )}
          </>
        )}

        <div style={{ flex: 1 }} />
        {/* niente «Sicuro?»: toglierla è la decisione, non l'inizio di una domanda */}
        <Hov as="button" type="button" title={t('Toglila')}
          onClick={(e: React.MouseEvent) => { e.stopPropagation(); void l.elimina(c.id) }}
          style={{ border: 'none', background: 'none', padding: '12px 4px', fontSize: 13, color: 'rgba(255,247,240,.6)', cursor: 'pointer', fontFamily: 'inherit', transition: 'color .15s' }}
          hover={{ color: '#FFFFFF' }}>{t('Toglila')}</Hov>
      </div>

      {/* una domanda senza il rigo per rispondere è un vicolo cieco: qui sotto
          si risponde, e il lavoro riparte da solo */}
      {chiede && (
        <div style={{ display: 'flex', gap: 9, marginTop: 14 }}>
          <input
            className="scuro"
            value={risposta}
            onChange={e => setRisposta(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') rispondi() }}
            aria-label={t('Rispondigli')}
            placeholder={t('Rispondigli e ci riprova')}
            style={{
              flex: 1, minWidth: 0, padding: '11px 15px', borderRadius: 13,
              border: '1px solid rgba(255,247,240,.34)', background: 'rgba(20,14,10,.24)',
              color: '#FFF7F0', fontSize: '13.5px', fontFamily: 'inherit', outline: 'none'
            }} />
          <button onClick={rispondi} disabled={!risposta.trim()} style={{
            flex: 'none', padding: '11px 20px', borderRadius: 99, border: 'none',
            background: risposta.trim() ? '#FFF7F0' : 'rgba(255,247,240,.22)',
            color: risposta.trim() ? '#22271F' : 'rgba(255,247,240,.7)',
            fontSize: '13.5px', fontWeight: 500, fontFamily: 'inherit',
            cursor: risposta.trim() ? 'pointer' : 'default'
          }}>{t('Manda')}</button>
        </div>
      )}

      {/* l'altra strada: certe righe non si sbloccano con un dato, perché non
          sono compiti — vedi il bottone gemello in `Oggi` */}
      {chiede && siPuoParlarne() && (
        <Hov as="button" type="button"
          onClick={() => portaInChat(frasi.scomponi(c.testo))}
          title={t('Non è un compito? Parlane in chat e scomponilo insieme a Myynd.')}
          style={{
            marginTop: 12, padding: 0, border: 'none', background: 'none', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: '12.5px', color: 'rgba(255,247,240,.68)',
            textDecoration: 'underline', textDecorationColor: 'transparent', textUnderlineOffset: 3
          }}
          hover={{ color: '#FFF7F0', textDecorationColor: 'currentColor' }}>
          {t('Scomponila in chat')}
        </Hov>
      )}
    </div>
  )
}

export function Myynd({ v, lista }: { v: Vals; lista?: Lista }) {
  /**
   * Quale cosa della tua lista sta in cima.
   *
   * Vuoto vuol dire «decidi tu»: se lui ha qualcosa da dire ci va la sua voce,
   * altrimenti ci va la prima della lista — perché una pagina che si apre su
   * niente mentre hai sei cose da fare è una pagina che non ti guarda. Si
   * riempie cliccando una riga, e si svuota cliccando una delle sue.
   */
  const [inCima, setInCima] = useState<string | null | false>(null)
  /** Mentre la riga nasce e parte: il bottone non si preme due volte. */
  const [affidando, setAffidando] = useState(false)
  /** Il «⋯» della carta grande: il menù si misura su di lui — vedi `MenuGiu`. */
  const altroHero = useRef<HTMLButtonElement | null>(null)
  const compiti = lista?.compiti ?? []
  const inTesta = inCima === false ? null : compiti.find(c => c.id === inCima) ?? (v.hasHero ? null : compiti[0] ?? null)
  // quando in cima ci va una cosa tua, la voce che stava lì scende fra le righe
  // invece di sparire: è ancora aperta, e deve restare raggiungibile
  const voci = inTesta && v.rigaHero ? [v.rigaHero, ...v.resto] : v.resto
  const righe = [
    /*
     * La riga porta la riga in cima. Sempre.
     *
     * Prima una riga nata da una mail apriva quella mail, e le altre salivano
     * in cima: lo stesso gesto faceva due cose diverse a seconda di una cosa
     * che non si vede: se il modello le avesse segnato un documento dietro.
     * Ci si trovava davanti un foglio che non si era chiesto — «mi apre
     * documenti a caso, il mio CV» — invece della riga da chiudere. Adesso
     * la riga si apre in cima, dove c'è spazio per farci qualcosa, e la fonte
     * si apre dalla riga «Da» sotto il testo: scritta, e voluta.
     */
    ...compiti.filter(c => c.id !== inTesta?.id).slice(0, 6).map(c => ({
      chiave: c.id,
      nodo: <RigaCompito c={c} l={lista!} v={v} apri={() => setInCima(c.id)} />
    })),
    ...voci.map(r => ({
      chiave: r.id,
      // cliccare una sua voce le ridà il posto in cima: un solo gesto, e vale
      // per tutte e due le specie di riga
      nodo: <Riga riga={{ ...r, onPromote: () => { setInCima(null); r.onPromote() } }} />
    }))
  ]

  /**
   * «Affidalo a Myynd»: la voce diventa una riga tua, e parte.
   *
   * Prima lì c'era «Chiedi a Myynd», che apriva la chat con scritto dentro
   * «dimmi di più su…»: una domanda, non un lavoro. Adesso il bottone fa
   * quello che dice — nasce la riga con dentro il documento da cui viene, la
   * prende lui, e te la ritrovi in cima con sopra scritto che ci sta
   * lavorando. Parlarne è rimasto, dietro il «⋯», dov'è giusto che stia
   * quello che si fa di rado.
   */
  const affidaHero = async () => {
    if (!lista || affidando) return
    const voce = v.heroId
    setAffidando(true)
    // l'offerta di una priorità è il compito: «preparo la risposta ad Apple con…»
    const id = await lista.affidaNuovo(v.heroTitolo, { doc: v.heroDoc, voce, nota: v.heroOfferta || null })
    setAffidando(false)
    if (!id) return
    // il server ha già chiuso la voce: qui si toglie da quello che si ha davanti
    v.viaDalFeed(voce)
    setInCima(id)
    v.mostraToast(t('Affidata a Myynd: la trovi nella lista.'))
  }

  return (
    <div style={{ width: 760, maxWidth: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Titolo sopra, data sotto — identico alla finestra dell'app. Sono due
          facce della stessa cosa e devono aprirsi con la stessa immagine. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, padding: '52px 4px 26px' }}>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <h1 style={{
            fontSize: 40, lineHeight: 1.15, letterSpacing: '-.032em', maxWidth: 600,
            margin: 0, padding: '0 0 0 3px', fontWeight: 400, textWrap: 'pretty'
          }}>{v.vociAperte === 0 && (lista?.compiti.length ?? 0) > 0 && !v.domanda
            ? frasi.daFare(lista!.compiti.length)
            : v.feedCaricato && !v.guastoFeed && (v.vociAperte > 0 || v.domanda)
            /* quello che c'è in pagina, contato con le regole di `righe` qui sopra:
               «due cose» sopra nove righe era il titolo di un'altra pagina. Le
               domande sui progetti non si contano: «due cose sul tavolo» sopra
               due domande e nessuna cosa arrivata era una bugia che preoccupa */
            ? v.sulTavolo(compiti.length, !!inTesta)
            : v.headline}</h1>
          <div style={{
            marginTop: 9, paddingLeft: 3, fontSize: '12.5px', fontWeight: 500, letterSpacing: '.02em',
            color: 'rgba(34,39,31,.5)', textTransform: 'capitalize'
          }}>{v.oggi}</div>
        </div>
        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 7, flexWrap: 'wrap' }}>
          <Rassegna />
          <Hov as="a" href="#" onClick={v.goConn}
            style={{ flex: 'none', marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'rgba(34,39,31,.78)', background: 'rgba(255,255,255,.7)', border: '1px solid rgba(255,255,255,.9)', borderRadius: 99, padding: '5px 11px' }}
            hover={{ background: '#FFFFFF' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: v.connCount ? '#5C7660' : '#B0705A' }} />
            {frasi.fontiEDocumenti(v.connCount, v.totaleDocumenti.toLocaleString(lingua() === 'en' ? 'en-GB' : 'it-IT'), v.totaleDocumenti === 1)}
          </Hov>
        </div>
      </div>

      <Avviso v={v} />

      {/* Myynd ha scritto: le domande per conoscerti aspettano in chat. Sta in
          cima a tutto, perché rispondergli viene prima del resto. */}
      {v.chatDaLeggere && (
        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', borderRadius: 20, background: 'linear-gradient(130deg,#8e3f1f,#a66b4c 60%,#4a3a31)', color: '#FFF7F0', padding: '18px 22px', marginBottom: 14, boxShadow: '0 22px 52px rgba(84,64,44,.18)' }}>
          <span style={{ width: 8, height: 8, flex: 'none', borderRadius: '50%', background: '#FFF7F0' }} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 15, fontWeight: 500 }}>{t('Myynd ti ha scritto.')}</div>
            <div style={{ fontSize: '13px', lineHeight: 1.5, color: 'rgba(255,247,240,.78)', marginTop: 3, textWrap: 'pretty' }}>{t('Ha qualche domanda per conoscerti: due minuti.')}</div>
          </div>
          <button onClick={v.goChat} style={{ ...PIENO_SCURO, display: 'inline-flex', alignItems: 'center', gap: 8 }}>{t('Rispondi')} <IconAvanti /></button>
        </div>
      )}

      {/* Il primo progetto, dalla prima pagina e non da una carta in fondo alle
          preferenze: finché non c'è, è la cosa che manca, e si dice qui. */}
      {v.senzaProgetto && (
        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', borderRadius: 20, background: 'rgba(255,253,249,.66)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,.75)', padding: '18px 22px', marginBottom: 14 }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 15, fontWeight: 500 }}>{t('Nessun progetto ancora.')}</div>
            <div style={{ fontSize: '13px', lineHeight: 1.5, color: 'rgba(34,39,31,.65)', marginTop: 3, textWrap: 'pretty' }}>{t('Un progetto e un obiettivo: da lì scelgo cosa conta.')}</div>
          </div>
          <button onClick={v.avviaOnboarding} style={{ ...BOTTONE, display: 'inline-flex', alignItems: 'center', gap: 8 }}>{t('Configura il progetto')} <IconAvanti /></button>
        </div>
      )}

      {/* Cosa è cambiato mentre non c'era, se c'è qualcosa da dire: sta sopra
          alla card scura perché è la risposta alla domanda con cui si torna.
          È una carta come le due qui sopra — titolo, una riga, un bottone — e
          non più un rigo scritto piccolo: aprendola si apre il foglio da
          leggere. Il vestito ce l'ha dentro, in `components/Punto.tsx`. */}
      {/* Una riga del punto apre il documento da cui viene, e niente altro: le
          cose da fare non stanno lì dentro, stanno qui sotto. */}
      <Punto v={v} />

      {inTesta && <HeroCompito c={inTesta} l={lista!} v={v} richiudi={() => setInCima(false)} />}

      {!inTesta && v.hasHero && (
        <div style={v.heroStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Glifo tipo="penso" dim={15} colore="#FFF7F0" />
            <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: '.02em' }}>{t(v.heroTipo)}</span>
            {/* una parola e l'ora: il percorso del file non compare da nessuna
                parte, e il puntino c'è solo se ha due cose da separare */}
            <span style={{ fontSize: '12.5px', color: 'rgba(255,247,240,.85)', minWidth: 0 }}>{[v.heroFonte, v.heroOra].filter(Boolean).join(' · ')}</span>
            {/*
              «Non mi interessa», in alto a destra e scritto piccolo.
              Stava dentro il «⋯» in fondo, e lì non lo trovava nessuno: è il
              gesto che tiene pulito il feed, e un feed che non si può pulire in
              un attimo si riempie di roba che non riguarda più niente. Qui è in
              chiaro e fuori strada — lontano dai bottoni che *fanno* qualcosa,
              nell'angolo dove si guarda solo quando si è deciso di lasciar
              perdere. L'avviso che segue porta «Annulla»: è l'unico gesto del
              feed che non lascia traccia da nessun'altra parte.
            */}
            <div style={{ flex: 1 }} />
            <Hov as="button" type="button" onClick={v.scartaHero}
              title={t('Toglila dal feed')} aria-label={t('Non mi interessa')}
              style={{
                flex: 'none', padding: '3px 2px', border: 'none', background: 'none',
                color: 'rgba(255,247,240,.55)', fontSize: '12.5px', fontFamily: 'inherit',
                cursor: 'pointer', whiteSpace: 'nowrap'
              }}
              hover={{ color: '#FFF7F0' }}>{t('Non mi interessa')}</Hov>
          </div>

          {/*
            Il titolo è una frase, non un link.

            Era cliccabile, sottolineato, e si portava dietro «Apri la pagina →»
            in fondo: tre segni per un gesto solo, sulla riga che serve a capire
            di cosa si tratta. «Perché è sottolineato?» — perché un titolo che
            si comporta da link chiede di decidere prima ancora di aver letto.
            Adesso si legge e basta.
          */}
          <div style={{ fontSize: 22, lineHeight: 1.35, marginTop: 20, maxWidth: 600, textWrap: 'pretty', fontWeight: 500, overflowWrap: 'anywhere' }}>{v.heroTitolo}</div>
          {/*
            Aprire la cosa è un gesto solo, e sta sotto il titolo: una riga
            piccola che dice cosa apre — la mail, il file, la pagina — e niente
            freccia. Non è un bottone da fascia: quelli in fondo alla carta
            sono le decisioni, questo è solo «fammela vedere».
          */}
          {v.heroHaDoc && (
            <Hov as="button" type="button" onClick={v.apriDoc}
              aria-label={`${t('Vedi la fonte')}: ${v.heroFonteDettaglio || v.heroTitolo}`}
              style={{
                alignSelf: 'flex-start', maxWidth: '100%', marginTop: 9, padding: 0, border: 'none',
                background: 'none', fontFamily: 'inherit', fontSize: '13px', fontWeight: 500,
                color: 'rgba(255,247,240,.74)', textAlign: 'left', textDecoration: 'none', cursor: 'pointer'
              }}
              hover={{ color: '#FFF7F0' }}>{v.heroFonteDettaglio || t('Vedi la fonte')}</Hov>
          )}
          {!v.heroHaDoc && <div style={{ marginTop: 9, fontSize: 13, color: 'rgba(255,247,240,.74)' }}>{t('Nessun collegamento alla fonte disponibile.')}</div>}
          <div style={{ fontSize: '15.5px', lineHeight: 1.6, marginTop: 10, maxWidth: 600, color: 'rgba(255,247,240,.82)', textWrap: 'pretty', whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
            {v.heroTesto}
            {v.heroTagliato && (
              <Hov as="button" onClick={v.heroToggle}
                style={{ border: 'none', background: 'none', padding: '0 0 0 6px', fontFamily: 'inherit', fontSize: '13.5px', color: 'rgba(255,247,240,.6)', cursor: 'pointer' }}
                hover={{ color: '#FFF7F0' }}>{v.heroLong ? t('meno') : t('di più')}</Hov>
            )}
          </div>
          {/* il perché: per quale progetto o obiettivo conta, in una riga quieta */}
          {v.heroPerche && (
            <div style={{ fontSize: '13px', lineHeight: 1.5, marginTop: 8, maxWidth: 600, color: 'rgba(255,247,240,.62)', textWrap: 'pretty', overflowWrap: 'anywhere' }}>{v.heroPerche}</div>
          )}
          {/* l'offerta: cosa farebbe Myynd da solo, se glielo affidi — è la
              riga che rende «Affidalo a Myynd» una promessa precisa */}
          {v.heroOfferta && (
            <div style={{ fontSize: '13.5px', lineHeight: 1.5, marginTop: 10, maxWidth: 600, color: 'rgba(255,247,240,.86)', textWrap: 'pretty', overflowWrap: 'anywhere' }}>
              <span style={{ fontWeight: 600, marginRight: 6 }}>{t('Posso farlo io:')}</span>{v.heroOfferta}
            </div>
          )}

          {/*
            Una fascia sola di azioni, non tre.

            Prima c'erano il bottone Fatto, una riga di quattro pastiglie e un
            campo di testo, tutti visibili insieme — e «Già fatto» faceva la
            stessa cosa del bottone Fatto due centimetri più in su. Adesso c'è
            quello che si fa quasi sempre, e un «⋯» per il resto.
          */}
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 20, position: 'relative' }}>
            {/* uno solo pieno: con il rigo aperto il pieno è «Manda», e «Fatto» si fa di contorno */}
            <Hov as="button" onClick={v.heroPrimary}
              style={primario(!v.scriviAperto)}
              hover={v.scriviAperto ? { background: 'rgba(255,247,240,.16)' } : { background: '#FFFFFF' }}>{t('Fatto')}</Hov>
            {v.heroHaDoc && (
              <Hov as="button" type="button" onClick={v.portamiHero} disabled={v.heroAprendoFonte}
                title={v.heroFonteDettaglio || v.heroApreCosa}
                style={{ padding: '12px 20px', borderRadius: 99, border: '1px solid rgba(255,247,240,.6)', background: 'none', color: '#FFF7F0', fontSize: 14, cursor: v.heroAprendoFonte ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: v.heroAprendoFonte ? .65 : 1 }}
                hover={{ background: 'rgba(255,247,240,.16)' }}>{v.heroAprendoFonte ? t('Un momento…') : t('Portami lì')}</Hov>
            )}
            {lista && (
              <Hov as="button" onClick={affidaHero} disabled={affidando}
                style={{ padding: '12px 20px', borderRadius: 99, border: '1px solid rgba(255,247,240,.5)', background: 'none', color: '#FFF7F0', fontSize: 14, cursor: affidando ? 'default' : 'pointer', fontFamily: 'inherit', opacity: affidando ? 0.62 : 1 }}
                hover={{ background: 'rgba(255,247,240,.16)' }}>{t('Affidalo a Myynd')}</Hov>
            )}

            {/* Il menù si appende al «⋯», non a un numero di pixel.
                Stava a `left: 178` dal bordo della fascia, cioè alla larghezza
                che avevano quei due bottoni con quelle due parole dentro: la
                prima traduzione un po' più lunga lo spostava sotto il nulla. */}
            <>
              <Hov as="button" ref={altroHero} onClick={v.apriMenu} title={t('Altro')} aria-label={t('Altro')} aria-haspopup="menu" aria-expanded={v.menuAperto}
                style={{ padding: '12px 15px', borderRadius: 99, border: '1px solid rgba(255,247,240,.28)', background: v.menuAperto ? 'rgba(255,247,240,.16)' : 'none', color: 'rgba(255,247,240,.85)', fontSize: 15, lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit' }}
                hover={{ background: 'rgba(255,247,240,.16)', borderColor: 'rgba(255,247,240,.5)' }}>⋯</Hov>

              {/* fuori dalla carta, per la stessa ragione dell'altro: `MenuGiu` */}
              {v.menuAperto && (
                <MenuGiu ancora={altroHero.current} chiudi={v.chiudiMenu} minLarghezza={190}>
                  {v.correzioni.map(c => (
                    <Hov key={c.id} as="button" type="button" role="menuitem" onClick={c.onClick}
                      style={{ ...VOCE_MENU, whiteSpace: 'nowrap' }}
                      hover={{ background: 'rgba(196,98,59,.09)' }}>{c.label}</Hov>
                  ))}
                </MenuGiu>
              )}
            </>

            <div style={{ flex: 1 }} />
            <Hov as="button" onClick={v.heroSkip} title={t('Rimandala in fondo')}
              style={{ padding: '12px 4px', border: 'none', background: 'none', color: 'rgba(255,247,240,.6)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
              hover={{ color: '#FFFFFF' }}>{t('Più tardi')}</Hov>
          </div>

          {v.scriviAperto && (
            <div style={{ display: 'flex', gap: 9, marginTop: 14 }}>
              <input
                autoFocus
                className="scuro"
                value={v.risposta}
                onChange={e => v.setRisposta(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); v.rispondiAlHero() }
                  if (e.key === 'Escape') { e.stopPropagation(); v.chiudiScrivi() }
                }}
                placeholder={t("L'ho mandato lunedì col listino nuovo")}
                style={{
                  flex: 1, minWidth: 0, padding: '11px 15px', borderRadius: 13,
                  border: '1px solid rgba(255,247,240,.34)', background: 'rgba(20,14,10,.24)',
                  color: '#FFF7F0', fontSize: '13.5px', fontFamily: 'inherit', outline: 'none'
                }} />
              <button onClick={v.rispondiAlHero} disabled={v.rispondendo || !v.risposta.trim()} style={{
                flex: 'none', padding: '11px 20px', borderRadius: 99, border: 'none',
                background: v.risposta.trim() && !v.rispondendo ? '#FFF7F0' : 'rgba(255,247,240,.22)',
                color: v.risposta.trim() && !v.rispondendo ? '#22271F' : 'rgba(255,247,240,.7)',
                fontSize: '13.5px', fontWeight: 500, fontFamily: 'inherit',
                cursor: v.risposta.trim() && !v.rispondendo ? 'pointer' : 'default'
              }}>{v.rispondendo ? t('Segno…') : t('Manda')}</button>
              <Hov as="button" onClick={v.chiudiScrivi} title={t('Annulla (Esc)')} aria-label={t('Annulla')}
                style={{ flex: 'none', padding: '11px 6px', border: 'none', background: 'none', color: 'rgba(255,247,240,.55)', fontSize: 18, cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1 }}
                hover={{ color: '#FFF7F0' }}>×</Hov>
            </div>
          )}
        </div>
      )}

      {!!v.iniziative.length && <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <button onClick={v.genera} disabled={v.generando} style={BOTTONE}>{v.generando ? t('Leggo…') : t('Fai una lettura')}</button>
      </div>}

      {/*
        I progetti che aspettano un passo: carte una accanto all'altra.

        Erano una carta a testa, piena, una sotto l'altra; poi righe in una
        scheda sola. «Le pensavo una accanto all'altra, piccole carte, per
        spezzare un po' il disegno» — e con un colore per progetto, che sceglie
        lui in Memoria. Il colore è la prima cosa che si vede: fondo velato,
        bordo, nome. La domanda è il titolo, il perché sta sotto piccolo, e
        c'è un bottone solo. La carta intera apre la chat.
      */}
      {!!v.iniziative.length && <Progetti v={v} lista={lista} />}

      <Domanda v={v} />


      {righe.length > 0 && (
        /*
          Questa scheda non è inclinata, e le altre sì. Non è una dimenticanza.

          Un quinto di grado su una card che si vede tutta insieme è la mano
          che l'ha posata storta: si legge come carattere. Ma questa è la lista
          intera — duemila pixel, spesso tremila — e di una cosa così alta non
          si vede mai la forma, si vede solo il bordo che passa. Inclinato, quel
          bordo non è più verticale: scende di dieci pixel verso sinistra dal
          primo rigo all'ultimo, e mentre si scorre lo spazio fra la colonna e
          la lista si stringe piano piano, senza motivo apparente. Sembra che
          si muova la finestra.

          `position: relative` prende il posto che aveva la trasformazione:
          serviva anche da riferimento a quello che qui dentro si posiziona da
          sé, e toglierla e basta avrebbe spostato i menù delle righe.
        */
        <div style={{ flex: 'none', position: 'relative', zIndex: v.menuAperto ? 30 : undefined, marginTop: 16, borderRadius: 20, background: 'rgba(255,253,249,.66)', backdropFilter: 'blur(24px) saturate(1.4)', WebkitBackdropFilter: 'blur(24px) saturate(1.4)', border: '1px solid rgba(255,255,255,.7)', boxShadow: '0 22px 52px rgba(84,64,44,.11)' }}>
          {/* le tue righe stanno DENTRO la stessa lista delle sue, vestite
              uguali. Il filo va per posizione, non per specie: la prima non ha
              bordo sopra e tutte le altre sì — chiunque sia la prima. */}
          {righe.map((r, i) => (
            <div key={r.chiave} style={{ borderTop: i === 0 ? 'none' : '1px solid rgba(34,39,31,.09)' }}>
              {r.nodo}
            </div>
          ))}
        </div>
      )}

      {v.feedVuoto && !(lista?.compiti.length) && <Vuoto v={v} />}

      {/* niente elenco delle fatte qui: quello che hai chiuso è chiuso.
          Il conto restava lì a crescere — «Done · 14» — come un cassetto che
          non si svuota mai. La storia resta nel database, non sullo schermo. */}
    </div>
  )
}

/**
 * Quando è lui a chiedere.
 *
 * Deliberatamente diversa da una voce del feed: chiara, ma non urgente. Una
 * voce è lavoro che ti aspetta; questa è un collega che alza la testa dalla
 * scrivania. Se avesse l'aria di un compito, in tre giorni la salteresti come
 * si saltano i compiti — e allora tanto varrebbe non chiedere.
 *
 * Sta sotto la card in cima, mai sopra: non deve mettersi in mezzo al lavoro
 * vero. Ma quando non c'è lavoro resta l'unica cosa sullo schermo, ed è il
 * momento migliore per chiedere qualcosa a qualcuno.
 */
/**
 * La riga fissa di quello che non va, sopra a tutto.
 *
 * Stava in una carta fra la voce in cima e i progetti, con «Riprova» — e
 * diceva «desktop: The source read did not complete. note: The source is
 * currently unavailable.» mentre nelle Fonti «Il mio Mac» era collegato e
 * andava benissimo. Un guaio delle fonti non è una voce del feed: è una cosa
 * da sistemare altrove, e qui va solo detta, in una riga che resta finché
 * non è sistemata, con la strada per andarci. Niente «Riprova»: riprovare
 * senza aver cambiato niente ridà la stessa riga.
 *
 * Porta anche il motivo per cui l'ultima lettura a mano non è partita — la
 * chiave che manca, una lettura già in corso — perché è lo stesso genere di
 * cosa, e si sistema nello stesso posto.
 */
function Avviso({ v }: { v: Vals }) {
  const frase = v.guastoLettura ?? (v.fontiIncomplete.length ? frasi.fontiNonLette(v.fontiIncomplete) : null)
  if (!frase) return null
  return (
    <div role="status" style={{
      flex: 'none', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14,
      padding: '10px 16px', borderRadius: 14, background: 'rgba(196,98,59,.10)', border: '1px solid rgba(196,98,59,.28)',
      color: '#8E3F1F', fontSize: 13, lineHeight: 1.5
    }}>
      <span style={{ width: 6, height: 6, flex: 'none', borderRadius: '50%', background: '#C4623B' }} />
      <span style={{ flex: '1 1 220px', minWidth: 0, textWrap: 'pretty', overflowWrap: 'anywhere' }}>{frase}</span>
      <Hov as="a" href="#" onClick={v.goConn}
        style={{ flex: 'none', color: '#8E3F1F', fontWeight: 500, textDecoration: 'underline', textUnderlineOffset: 3, whiteSpace: 'nowrap' }}
        hover={{ color: '#22271F' }}>{t('Vai alle Fonti')}</Hov>
    </div>
  )
}

/**
 * Le carte dei progetti, una accanto all'altra.
 *
 * Quando «Leggi adesso» non trova niente di nuovo ma i progetti aspettano, la
 * pagina le porta sotto gli occhi e le accende per un attimo: l'avviso dice
 * «qui sotto», e questo è il «qui».
 */
function Progetti({ v, lista }: { v: Vals; lista?: Lista }) {
  const griglia = useRef<HTMLDivElement | null>(null)
  const [accese, setAccese] = useState(false)
  useEffect(() => {
    if (!v.evidenziaProgetti) return
    griglia.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setAccese(true)
    const via = setTimeout(() => setAccese(false), 1600)
    return () => clearTimeout(via)
  }, [v.evidenziaProgetti])
  return (
    <div ref={griglia} aria-label={t('Un passo per il tuo progetto')} style={{
      display: 'grid', gap: 12, marginTop: 14,
      // due o più stanno di fianco; una sola prende la riga, come le altre carte
      gridTemplateColumns: v.iniziative.length > 1 ? 'repeat(auto-fit, minmax(280px, 1fr))' : '1fr'
    }}>
      {v.iniziative.map(item => <CartaProgetto key={item.id} item={item} v={v} lista={lista} accesa={accese} />)}
    </div>
  )
}

/**
 * Un progetto che aspetta un passo, come carta col suo colore: la carta
 * intera apre la chat con la domanda già scritta, e il bottone dice che lo
 * farà. Con un compito dietro, il bottone porta al compito e la chat resta
 * sul clic della carta.
 */
function CartaProgetto({ item, v, lista, accesa }: { item: Vals['iniziative'][number]; v: Vals; lista?: Lista; accesa: boolean }) {
  const { attiva, props } = useAttiva()
  const colore = v.coloreProgetto(item.projectId)
  const parla = () => v.discutiIniziativa(item)
  const BOTTONE_CARTA: CSSProperties = {
    flex: 'none', padding: '6px 13px', borderRadius: 99, border: `1px solid ${velato(colore, .45)}`,
    background: 'rgba(255,255,255,.55)', color: colore, fontSize: '12.5px', fontWeight: 500,
    fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap'
  }
  return (
    <div role="button" tabIndex={0} onClick={parla} onKeyDown={daTastiera(parla)} {...props}
      style={{
        display: 'flex', flexDirection: 'column', gap: 0, padding: '16px 18px 15px', borderRadius: 18, cursor: 'pointer',
        // il colore del progetto, velato sull'avorio: è quello che distingue una carta dall'altra
        background: `linear-gradient(0deg, ${velato(colore, attiva ? .16 : .11)}, ${velato(colore, attiva ? .16 : .11)}), rgba(255,253,249,.88)`,
        border: `1px solid ${velato(colore, .38)}`, transition: 'background .2s, outline-color .3s',
        outline: accesa ? `2px solid ${colore}` : '2px solid transparent', outlineOffset: 3
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ width: 8, height: 8, flex: 'none', borderRadius: '50%', background: colore }} />
        <span style={{ fontSize: '11.5px', fontWeight: 600, letterSpacing: '.09em', textTransform: 'uppercase', color: colore, minWidth: 0, overflowWrap: 'anywhere' }}>{item.projectName}</span>
        <div style={{ flex: 1 }} />
        <Hov as="button" type="button"
          onClick={(e: MouseEvent) => { e.stopPropagation(); void v.scartaIniziativa(item.id) }}
          title={t('Toglila dal feed')} aria-label={t('Non mi interessa')}
          style={{
            flex: 'none', padding: '2px 2px', border: 'none', background: 'none',
            color: 'rgba(34,39,31,.45)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
            opacity: attiva ? 1 : 0, pointerEvents: attiva ? 'auto' : 'none', transition: 'opacity .15s'
          }}
          hover={{ color: '#8E3F1F' }}>{t('Non mi interessa')}</Hov>
      </div>
      {/* la domanda è il titolo: è la cosa a cui si risponde. Il perché sta sotto, piccolo */}
      <div style={{ fontSize: '15px', fontWeight: 500, lineHeight: 1.4, marginTop: 10, textWrap: 'pretty', overflowWrap: 'anywhere' }}>{item.question ?? item.title}</div>
      {item.description && (
        <div style={{ fontSize: '12.5px', lineHeight: 1.45, color: 'rgba(34,39,31,.55)', marginTop: 5, textWrap: 'pretty', overflowWrap: 'anywhere' }}>{item.description}</div>
      )}
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', marginTop: 14 }}>
        {item.taskId && lista
          ? <Hov as="button" type="button" onClick={(e: MouseEvent) => { e.stopPropagation(); lista.chiediDiAprire(item.taskId!); v.goOggi() }}
              title={t('Apri il compito')} style={BOTTONE_CARTA} hover={{ background: '#FFFFFF' }}>{t('Apri il compito')}</Hov>
          : <Hov as="button" type="button" onClick={(e: MouseEvent) => { e.stopPropagation(); parla() }}
              title={t('Parliamone in chat')} style={BOTTONE_CARTA} hover={{ background: '#FFFFFF' }}>{t('Parliamone')}</Hov>}
      </div>
    </div>
  )
}

function Domanda({ v }: { v: Vals }) {
  // Dopo la risposta, l'esito prende il posto della domanda e resta lì. Non è
  // un avviso che sfarfalla: è la prova che rispondere è servito a qualcosa.
  if (v.esitoDom) {
    return (
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 13, marginTop: 16, padding: '18px 20px',
        borderRadius: 20, border: '1px solid rgba(126,156,130,.4)',
        background: 'rgba(126,156,130,.12)', animation: 'fadein .3s ease'
      }}>
        <IconSpunta style={{ flex: 'none', marginTop: 1 }} />
        <div style={{ flex: 1, minWidth: 0, fontSize: '15px', lineHeight: 1.55, color: '#22271F', textWrap: 'pretty' }}>
          {t(v.esitoDom)}
        </div>
        <Hov as="button" onClick={v.chiudiEsito} title={t('Chiudi')} aria-label={t('Chiudi')}
          style={{ flex: 'none', border: 'none', background: 'none', color: 'rgba(34,39,31,.4)', fontSize: 17, lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit', padding: 2 }}
          hover={{ color: '#22271F' }}>×</Hov>
      </div>
    )
  }

  if (!v.domanda) return null

  return (
    <div style={{
      /*
        Sottile, e di vetro.

        La versione con la card occupava l'altezza di un blocco per contenere
        una riga di testo. Questa è una fascia: la domanda, il rigo su cui
        rispondere e la freccia stanno tutti sulla stessa linea, e in verticale
        costa un terzo.

        Il gradiente va al contrario di quello della card sopra — quella parte
        opaca in alto a sinistra e si spegne in basso a destra, questa fa
        l'inverso: quasi trasparente dove comincia, densa dove finisce. Le due
        superfici si passano la luce invece di ripeterla.
      */
      /*
        Lo z-index del pannello «perché» non bastava: questa fascia ha un
        backdrop-filter, e un filtro crea un contesto di impilamento — quindi
        il 25 del pannello valeva solo *dentro* la fascia, e la card che viene
        dopo, essendo un fratello successivo, gli finiva sopra. Si alza la
        fascia intera, non il figlio.
      */
      position: 'relative', zIndex: 12, display: 'flex', alignItems: 'center', gap: 13,
      margin: '14px 0 4px', padding: '10px 14px 10px 15px',
      borderRadius: 16,
      background: 'linear-gradient(258deg, rgba(255,253,249,.82) 0%, rgba(255,253,249,.46) 55%, rgba(255,253,249,.16) 100%)',
      backdropFilter: 'blur(22px) saturate(1.7)', WebkitBackdropFilter: 'blur(22px) saturate(1.7)',
      border: '1px solid rgba(255,255,255,.55)',
      borderLeft: '2px solid rgba(196,98,59,.55)',
      boxShadow: '0 10px 30px -14px rgba(84,64,44,.3), inset 0 1px 0 rgba(255,255,255,.5)',
      animation: 'fadein .3s ease'
    }}>
      <Marchio dim={14} animato={false} />

      <span style={{ fontSize: '15px', color: '#22271F', flex: 'none', maxWidth: 300, textWrap: 'pretty', lineHeight: 1.3 }}>
        {v.domanda.testo}
      </span>

      {/* il rigo su cui si risponde, non una casella */}
      <input
        value={v.rispostaDom}
        onChange={e => v.setRispostaDom(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') v.rispondiADomanda()
          if (e.key === 'Escape') { e.stopPropagation(); v.lasciaCadere() }
        }}
        placeholder={t('Bastano cinque parole')}
        style={{
          flex: 1, minWidth: 90, padding: '5px 2px', border: 'none',
          borderBottom: '1px solid rgba(34,39,31,.2)', background: 'none',
          color: '#22271F', fontSize: '14px', fontFamily: 'inherit', outline: 'none'
        }} />

      <Hov as="button" onClick={v.rispondiADomanda} disabled={!v.rispostaDom.trim()} title={t('Rispondi')} aria-label={t('Rispondi')}
        style={{
          flex: 'none', border: 'none', background: 'none', padding: '4px 2px',
          fontFamily: 'inherit', fontSize: 16, lineHeight: 1,
          color: v.rispostaDom.trim() ? '#8E3F1F' : 'rgba(34,39,31,.25)',
          cursor: v.rispostaDom.trim() ? 'pointer' : 'default'
        }}
        hover={v.rispostaDom.trim() ? { color: '#C4623B' } : {}}><IconAvanti size={14} /></Hov>

      <Hov as="button" onClick={v.apriSpunto} title={t('Perché me lo chiedi?')} aria-label={t('Perché me lo chiedi?')} aria-expanded={v.spuntoAperto}
        style={{ flex: 'none', border: 'none', background: 'none', padding: '4px 3px', fontFamily: 'inherit', fontSize: '13px', color: 'rgba(34,39,31,.34)', cursor: 'pointer' }}
        hover={{ color: '#8E3F1F' }}>?</Hov>

      <Hov as="button" onClick={v.lasciaCadere} title={t('Lascia perdere: non te lo richiedo')} aria-label={t('Lascia perdere: non te lo richiedo')}
        style={{ flex: 'none', border: 'none', background: 'none', padding: '4px 3px', color: 'rgba(34,39,31,.28)', fontSize: 15, lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit' }}
        hover={{ color: '#22271F' }}>×</Hov>

      {v.spuntoAperto && (
        <div style={{
          position: 'absolute', zIndex: 25, marginTop: 4, top: '100%', left: 15, maxWidth: 420,
          padding: '11px 14px', borderRadius: 13, background: '#FFFDF9',
          border: '1px solid rgba(255,255,255,.9)', boxShadow: '0 18px 44px rgba(30,20,14,.24)',
          animation: 'fadein .16s ease'
        }}>
          <div style={{ fontSize: '12px', color: 'rgba(34,39,31,.5)', lineHeight: 1.5, marginBottom: 5 }}>
            {t('Hai tolto di mezzo queste senza dirmi perché:')}
          </div>
          {v.domanda.spunto.slice(0, 4).map((x, i) => (
            <div key={i} style={{ fontSize: '12px', color: 'rgba(34,39,31,.68)', lineHeight: 1.65 }}>— {x}</div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Il fuoco: una riga che vale per tutte le letture che verranno.
 *
 * Diversa dalla risposta a una voce — quella riguarda una cosa sola e la
 * chiude, questa dice a Myynd dove guardare da qui in avanti. Sta in alto e
 * discreta perché è una scelta che si fa di rado e si cambia ancora più di rado.
 */

/** Quando non c'è niente: dice cosa manca, non finge. */
function Vuoto({ v }: { v: Vals }) {
  const senzaFonti = v.connCount === 0
  const senzaDocumenti = v.totaleDocumenti === 0
  // Prima della risposta non si dice niente; dopo un errore si dice l'errore.
  // Prima questa carta diceva «La tua mente è ancora vuota» anche a un 500.
  if (!v.feedCaricato || v.guastoLettura) return null
  if (v.guastoFeed) {
    return (
      <div style={{ flex: 'none', borderRadius: 24, background: 'rgba(255,253,249,.66)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,.75)', padding: '32px 28px' }}>
        <div style={{ fontSize: 17, lineHeight: 1.55, color: 'rgba(34,39,31,.82)', textWrap: 'pretty', overflowWrap: 'anywhere' }}>{v.guastoFeed}</div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={v.ricaricaFeed} style={BOTTONE}>{t('Riprova')}</button>
        </div>
      </div>
    )
  }
  return (
    <div style={{ flex: 'none', borderRadius: 24, background: 'rgba(255,253,249,.66)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,.75)', padding: '32px 28px' }}>
      {/* Una riga, non tre. Quello che c'era prima spiegava anche come funziona
          la memoria delle risposte — vero, e non è il momento di dirlo: chi
          guarda uno schermo vuoto vuole sapere cosa fare adesso. */}
      <div style={{ fontSize: 17, lineHeight: 1.55, color: 'rgba(34,39,31,.82)', textWrap: 'pretty' }}>
        {senzaFonti
          ? t('Non hai collegato niente.')
          : senzaDocumenti
            ? t('Non ho ancora letto niente.')
            : !v.claudeOn
              ? t('Serve Claude per scegliere cosa conta.')
              : v.haFatte
                ? t('Non è rimasto niente.')
                : t('Niente da segnalare.')}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        {senzaFonti || !v.claudeOn ? (
          <button onClick={v.goConn} style={BOTTONE}>{t('Vai ai connettori')}</button>
        ) : senzaDocumenti ? (
          v.sincronizzando
            ? <Stato tipo="leggo" testo={v.sincronizzando} />
            : <button onClick={v.sincronizza} style={BOTTONE}>{t('Leggi adesso')}</button>
        ) : (
          v.generando
            ? <Stato tipo="cerco" testo={t('Leggo tutto e scelgo cosa conta')} />
            : <button onClick={v.genera} style={BOTTONE}>{t('Fai una lettura')}</button>
        )}
      </div>
    </div>
  )
}

const BOTTONE: React.CSSProperties = {
  padding: '11px 20px', borderRadius: 99, border: 'none',
  background: 'linear-gradient(120deg,#B24E2E,#D98A5A)', color: '#FFF7F0',
  fontSize: '13.5px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit'
}
