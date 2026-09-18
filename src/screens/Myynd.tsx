import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { frasi, lingua, t } from '../lingua'
import { Hov, daTastiera, useAttiva } from '../ui'
import { IconAvanti, IconFrecciaDx, IconGiu, IconOcchio, IconSpunta } from '../icons'
import { Glifo, Stato } from '../components/Stato'
import { Marchio } from '../components/Marchio'
import { Rassegna } from '../components/Rassegna'
import { Punto } from '../components/Punto'
import { MenuGiu, VOCE_MENU } from '../components/MenuGiu'
import { generePrimoDocumento, nomeDelFile, nomePorta, parolaFonte, portaInChat, primoParagrafo, siPuoParlarne, taglia, type Vals } from '../vals'
import type { Lista } from '../oggi/useCompiti'
import { secchioVivo } from '../oggi/secchi'
import { giornoLocale } from '../oggi/giorni'
import type { Compito } from '../api'
import type { VoceFeed } from '../data'
import { quando } from '../data'
import { dataFonte, testoCarta } from '../feed-carta'
import { blocchiFeed, type Blocco as BloccoFeed, sulTavolo } from '../blocchi-feed'
import { AuroraCompito, PassoAttivo } from '../components/AuroraCompito'
import { compitoInEsecuzione } from '../compito-attivo'
import { consegnaPronta, messaggioConsegna, presentazioneRevisione, statoRevisione } from '../consegna-ui'
import { velato } from '../colori-progetto'

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

/*
 * Il vestito di una riga dentro un blocco.
 *
 * Due righe di testo: cosa, e perché conta adesso. Tutto il resto — da dove
 * viene, cosa farne — sta su una riga sola scritta piccola che compare quando
 * la riga è sotto il dito (o sotto il cursore, con la tastiera). Sempre
 * accesa, su dieci righe, sarebbe una colonna di bottoni: cioè la pagina
 * «pesante di testo» che lui non vuole.
 */
const RIGA: CSSProperties = { position: 'relative', padding: '12px 21px 7px', transition: 'background .15s' }
const TITOLO: CSSProperties = { fontSize: '14.5px', fontWeight: 500, lineHeight: 1.4, overflowWrap: 'anywhere', textWrap: 'pretty' }
const PERCHE: CSSProperties = { fontSize: '13px', lineHeight: 1.5, color: 'rgba(34,39,31,.64)', marginTop: 3, textWrap: 'pretty', overflowWrap: 'anywhere' }
const OFFERTA: CSSProperties = { ...PERCHE, color: 'rgba(34,39,31,.78)', marginTop: 5 }
const QUANDO: CSSProperties = { flex: 'none', fontSize: 12, color: 'rgba(34,39,31,.5)', marginTop: 2, whiteSpace: 'nowrap' }
/** La pastiglia a destra: l'urgenza di una voce, o quello che una riga aspetta da te. */
const PASTIGLIA: CSSProperties = {
  flex: 'none', fontSize: '11.5px', fontWeight: 600, letterSpacing: '.02em', color: '#8E3F1F',
  background: 'rgba(196,98,59,.14)', border: '1px solid rgba(196,98,59,.3)', borderRadius: 99, padding: '3px 9px', whiteSpace: 'nowrap'
}
/** Il nome del progetto in cima al blocco: maiuscoletto spaziato, nel suo colore. */
const NOME: CSSProperties = { fontSize: '11.5px', fontWeight: 600, letterSpacing: '.09em', textTransform: 'uppercase', minWidth: 0, overflowWrap: 'anywhere', textAlign: 'left' }
/** Un gesto scritto piccolo, senza bordo: quello che si fa di rado. */
const GESTO: CSSProperties = { padding: '2px 0', border: 'none', background: 'none', color: 'rgba(34,39,31,.55)', fontSize: '12.5px', fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }
/** Il bottone della riga: uno solo per riga, ed è quello che si fa quasi sempre. */
const PILLOLA: CSSProperties = {
  padding: '4px 11px', borderRadius: 99, border: '1px solid rgba(34,39,31,.2)', background: 'rgba(255,255,255,.7)',
  color: 'rgba(34,39,31,.72)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap'
}
const PILLOLA_SOPRA: CSSProperties = { borderColor: '#C4623B', color: '#8E3F1F' }
/** Un link scritto nel rame: la sottolineatura c'è solo sotto il dito. */
const LINK: CSSProperties = {
  padding: 0, border: 'none', background: 'none', fontFamily: 'inherit', fontSize: '12.5px', color: '#8E3F1F', cursor: 'pointer',
  textDecoration: 'underline', textDecorationColor: 'transparent', textUnderlineOffset: 3, whiteSpace: 'nowrap', textAlign: 'left'
}
/** Lo stesso link, sulla carta scura: un gesto solo non merita un menù da aprire. */
const LINK_SCURO: CSSProperties = {
  ...LINK, fontSize: '13.5px', color: 'rgba(255,247,240,.72)', padding: '12px 4px'
}
const LINK_SCURO_SOPRA: CSSProperties = { color: '#FFF7F0', textDecorationColor: 'currentColor' }

/** Un gesto dentro una riga che è essa stessa un bersaglio: il clic non deve risalire. */
const fermo = (fai: () => void) => (e: MouseEvent) => { e.stopPropagation(); fai() }

/**
 * La riga piccola sotto il testo: da dove viene a sinistra, cosa farne a destra.
 *
 * Occupa il suo posto anche quando non si vede — opacità, non `display` —
 * così passare col mouse non fa saltare le righe sotto. E i bottoni restano
 * raggiungibili con Tab anche da spenti: appena uno prende il fuoco la riga
 * si accende, perché `useAttiva` ascolta anche il fuoco.
 */
function Fascia({ attiva, sinistra, destra }: { attiva: boolean; sinistra?: ReactNode; destra: ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 14px', marginTop: 4, minHeight: 22,
      opacity: attiva ? 1 : 0, pointerEvents: attiva ? 'auto' : 'none', transition: 'opacity .15s'
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '2px 7px', minWidth: 0, fontSize: '12.5px', color: 'rgba(34,39,31,.55)' }}>{sinistra}</div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 14px' }}>{destra}</div>
    </div>
  )
}

/**
 * Una voce del feed, in due righe.
 *
 * «Corte, dirette e piane: una riga per il cosa e una per il perché conta
 * adesso.» Il titolo è il cosa. La seconda riga è il perché, scritto apposta
 * da chi ha messo la voce sul feed; per una priorità il testo dice già cosa
 * e perché, e il perché ripeterebbe l'obiettivo. Il tipo — da decidere, da
 * leggere — non si scrive: il titolo lo dice da sé, e un'etichetta in più
 * sopra ogni riga pesava quanto il titolo del blocco.
 *
 * La fonte compare solo sotto il dito: una parola, la data, e «Portami lì»
 * che apre il posto vero. Le azioni stanno lì accanto: un bottone solo —
 * «Affidalo a Myynd» su una priorità, «Fatto» sulle altre — e il resto
 * scritto piccolo. Niente «Mettila in lista»: una voce del feed è già una
 * cosa da fare.
 *
 * Il clic sulla riga apre il testo intero, se ce n'è di più: leggere e
 * decidere sono due gesti diversi, e hanno due bersagli diversi.
 */
function RigaVoce({ voce, v, lista }: { voce: VoceFeed; v: Vals; lista?: Lista }) {
  const { attiva, props } = useAttiva()
  const [aperta, setAperta] = useState(false)
  const [affidando, setAffidando] = useState(false)
  const carta = testoCarta(voce)
  const priorita = voce.tipo === 'Priorità'
  const proposta = priorita || voce.tipo === 'Proposta'
  const perche = proposta ? (carta.testo || carta.perche) : (carta.perche || carta.testo)
  const altro = [carta.testo, carta.perche].filter(x => x && x !== perche)
  const corta = taglia(perche, 150)
  const espandibile = corta !== perche || altro.length > 0
  const apri = () => { if (espandibile) setAperta(x => !x) }
  const offerta = voce.offerta ?? ''
  const fonte = voce.doc || voce.fonte ? parolaFonte(voce.fonte, voce.doc) : ''
  const ora = quando(dataFonte(voce))
  const dettaglio = [voce.fonteAutore, voce.fonteTitolo].filter(Boolean).join(' · ')
  const aprendo = !!voce.doc && v.aprendoFonte === voce.doc

  /**
   * «Affidalo a Myynd»: la voce diventa una riga tua, e parte.
   *
   * Nasce la riga con dentro il documento da cui viene e l'offerta come
   * nota — «preparo la risposta ad Apple con…» è il compito — la prende lui,
   * e la voce se ne va dal feed: il server l'ha già chiusa.
   */
  const affida = async () => {
    if (!lista || affidando) return
    setAffidando(true)
    const id = await lista.affidaNuovo(carta.titolo, { doc: voce.doc, voce: voce.id, nota: offerta || null })
    setAffidando(false)
    if (!id) return
    v.viaDalFeed(voce.id)
    v.mostraToast(t('Affidata a Myynd: la trovi nella lista.'))
  }

  const fatto = <Hov as="button" type="button" onClick={fermo(() => v.risolviVoce(voce))} style={proposta && lista ? GESTO : PILLOLA} hover={proposta && lista ? { color: '#8E3F1F' } : PILLOLA_SOPRA}>{t('Fatto')}</Hov>
  const affidalo = lista && (
    <Hov as="button" type="button" onClick={fermo(() => { void affida() })} disabled={affidando}
      style={{ ...(proposta ? PILLOLA : GESTO), opacity: affidando ? .6 : 1 }} hover={proposta ? PILLOLA_SOPRA : { color: '#8E3F1F' }}>{t('Affidalo a Myynd')}</Hov>
  )

  return (
    <div role={espandibile ? 'button' : undefined} tabIndex={0} onClick={apri} onKeyDown={daTastiera(apri)} {...props}
      aria-expanded={espandibile ? aperta : undefined}
      style={{ ...RIGA, cursor: espandibile ? 'pointer' : 'default', background: attiva ? 'rgba(255,255,255,.34)' : 'transparent' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={TITOLO}>{carta.titolo}</div>
          {perche && <div style={PERCHE}>{aperta ? perche : corta}</div>}
          {aperta && altro.map((x, i) => <div key={i} style={{ ...PERCHE, marginTop: 6 }}>{x}</div>)}
          {/* cosa farebbe lui: sotto una priorità sempre, sulle altre quando la riga è sotto il dito */}
          {offerta && (priorita || attiva || aperta) && (
            <div style={OFFERTA}><span style={{ fontWeight: 600 }}>{t('Posso farlo io:')}</span> {offerta}</div>
          )}
        </div>
        {voce.urgenza && <span style={PASTIGLIA}>{voce.urgenza}</span>}
      </div>
      <Fascia attiva={attiva}
        sinistra={(fonte || ora) && (
          <>
            <span>{[fonte, ora].filter(Boolean).join(' · ')}</span>
            {voce.doc && (
              <Hov as="button" type="button" title={dettaglio || t('Portami lì')} disabled={aprendo}
                onClick={fermo(() => { void v.portamiFonte(voce.doc!) })}
                style={{ ...LINK, cursor: aprendo ? 'wait' : 'pointer' }} hover={{ textDecorationColor: 'currentColor' }}>{aprendo ? t('Un momento…') : t('Portami lì')}</Hov>
            )}
          </>
        )}
        destra={
          <>
            {proposta && lista ? <>{affidalo}{fatto}</> : <>{fatto}{affidalo}</>}
            <Hov as="button" type="button" onClick={fermo(() => v.parlaneDi(voce))} style={GESTO} hover={{ color: '#8E3F1F' }}>{t('Parlane in chat')}</Hov>
            <Hov as="button" type="button" onClick={fermo(() => v.scartaVoce(voce))} title={t('Toglila dal feed')} style={GESTO} hover={{ color: '#8E3F1F' }}>{t('Non mi interessa')}</Hov>
          </>
        } />
    </div>
  )
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
 *
 * `inRiga`: dentro la fascia piccola di una riga, senza lo spazio sopra che
 * ha sulla carta scura.
 */
function Prove({ c, v, l, scuro, inRiga }: { c: Compito; v: Vals; l?: Lista; scuro?: boolean; inRiga?: boolean }) {
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
    <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '2px 7px', marginTop: inRiga ? 0 : 12, maxWidth: '100%', minWidth: 0 }}>
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
 * nasconde dietro tre puntini. Dentro la fascia di una riga (`piatto`) è
 * scritto e basta: lì il bottone è uno solo, ed è «Fatto».
 */
function Portami({ c, l, v, scuro, piatto = false, anteprima = false }: { c: Compito; l: Lista; v: Vals; scuro?: boolean; piatto?: boolean; anteprima?: boolean }) {
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
    : piatto ? LINK : {
        padding: '4px 11px', borderRadius: 99, border: '1px solid rgba(34,39,31,.2)',
        background: 'rgba(255,255,255,.7)', color: 'rgba(34,39,31,.72)', fontSize: 12
      }

  return (
    <Hov as="button" type="button"
      onClick={(e: MouseEvent) => { e.stopPropagation(); void vai() }}
      title={c.consegna?.titolo ?? etichetta}
      style={{ ...vestito, flex: 'none', whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: 'inherit' }}
      hover={scuro ? { background: 'rgba(255,247,240,.16)', borderColor: 'rgba(255,247,240,.5)' } : piatto ? { textDecorationColor: 'currentColor' } : { borderColor: '#C4623B', color: '#8E3F1F' }}>
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

/** Cosa c'è scritto accanto al titolo di una riga tua: cosa sta succedendo, o quando è. */
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

/**
 * Il verdetto sulla bozza, in una riga: «riletta come te e come Rossi: regge».
 *
 * «Quando affido una cosa a Myynd devo sapere che è di qualità.» La rilettura
 * la fa il server (`revisione-lavoro.ts`); qui si dice che è stata fatta e
 * com'è andata, e se restano punti aperti si elencano, corti. Senza modello
 * non si dice niente: una riga che dice «non riletta» è una scusa.
 */
function Riletta({ c }: { c: Compito }) {
  const r = c.revisione
  if (c.stato !== 'pronto' || !r || r.esito === 'unavailable') return null
  return (
    <div style={{ marginTop: 12, maxWidth: 600, fontSize: '13px', lineHeight: 1.5, color: 'rgba(255,247,240,.72)', textWrap: 'pretty' }}>
      {frasi.riletta(r.per || t('chi la riceve'), r.esito, r.giri)}
      {r.esito === 'revise' && r.problemi.length > 0 && (
        <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
          {r.problemi.slice(0, 3).map((p, i) => <li key={i}>{p}</li>)}
        </ul>
      )}
    </div>
  )
}

/** Quello che aspetta te, detto in una parola. */
function attesaDi(c: Compito): string {
  return c.stato === 'pronto' ? t('pronta') : c.stato === 'chiede' ? t('ti chiede') : ''
}

/**
 * Una riga della tua lista, dentro il blocco del suo progetto.
 *
 * Vestita come una voce del feed — il titolo, una riga sotto — perché nel
 * blocco sono tutte cose da fare per quel progetto, e non serve dire quale
 * l'ha scritta lui e quale l'hai scritta tu. Quello che cambia sono i gesti
 * sotto il dito: «Fatto», «Se ne occupa Myynd», e il posto vero da cui viene.
 * La riga intera la apre nella carta scura, dove c'è spazio per lavorarci.
 */
function RigaCompito({ c, l, v, apri }: { c: Compito; l: Lista; v: Vals; apri: () => void }) {
  const { attiva, props } = useAttiva()
  const attesa = attesaDi(c)
  const testo = corpo(c)
  const attivo = compitoInEsecuzione(c, l.passi[c.id])
  const titolo = presentazioneRevisione(c, lingua() === 'en')?.titolo ?? c.testo

  if (consegnaPronta(c)) return <div style={{ padding: 8 }}><ConsegnaPronta c={c} l={l} v={v} /></div>

  return (
    <div className="task-aurora-host task-aurora-row" data-working={attivo || undefined} role="button" tabIndex={0} onClick={apri} onKeyDown={daTastiera(apri)}
      style={{ ...RIGA, cursor: 'pointer', background: attiva ? 'rgba(255,255,255,.34)' : 'transparent' }}
      {...props}>
      {attivo && <AuroraCompito />}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...TITOLO, display: 'flex', alignItems: 'center', gap: 8 }}>
            {attivo && <Glifo tipo="penso" dim={12} colore="#C4623B" />}
            <span style={{ minWidth: 0 }}>{titolo}</span>
          </div>
          {testo && <div style={PERCHE}>{taglia(testo, 150)}</div>}
          {attivo && <PassoAttivo passo={l.passi[c.id]} />}
          <Consegna c={c} l={l} v={v} /><BozzaInPosta c={c} />
        </div>
        {attesa
          ? <span style={PASTIGLIA}>{attesa}</span>
          : <span style={QUANDO}>{didascalia(c, attivo)}</span>}
      </div>
      <Fascia attiva={attiva}
        sinistra={<Prove c={c} v={v} l={l} inRiga />}
        destra={
          <>
            {/* chiuderla senza nemmeno aprirla: è il gesto che si fa più spesso */}
            <Hov as="button" type="button" onClick={fermo(() => l.chiudi(c.id))} aria-label={`${t('Fatto')}: ${titolo}`}
              style={PILLOLA} hover={PILLOLA_SOPRA}>{t('Fatto')}</Hov>
            {c.stato === 'aperto' && (
              <Hov as="button" type="button" onClick={fermo(() => l.delega(c.id, 'tutto'))} style={GESTO} hover={{ color: '#8E3F1F' }}>{t('Se ne occupa Myynd')}</Hov>
            )}
            {!c.consegna && <Portami c={c} l={l} v={v} piatto />}
          </>
        } />
    </div>
  )
}

/**
 * La cosa dopo: quello che Myynd propone di fare quando questa è finita.
 *
 * Una riga piccola sotto la riga da cui nasce, non una riga sua: è la stessa
 * cosa, un passo avanti. La riga vera sta in lista, e là si può prendere.
 */
function Seguito({ c }: { c: Compito }) {
  return (
    <div style={{ padding: '0 21px 12px', marginTop: -2, fontSize: '12.5px', lineHeight: 1.45, color: 'rgba(34,39,31,.6)', overflowWrap: 'anywhere' }}>
      <span style={{ fontWeight: 600 }}>{t('Poi:')}</span> {c.testo}
    </div>
  )
}

/**
 * Una cosa della tua lista, aperta.
 *
 * Stessa carta scura di prima, ma al posto della riga, dentro il blocco del
 * suo progetto: si apre dove sta, così non si perde di vista di cosa è.
 * Una voce si risolve; un compito si chiude, si affida, si rimanda o si
 * toglie. Tutto da qui: la ragione per cui questa card esiste è che il feed
 * non deve mai mandarti da un'altra parte per finire una cosa che sta
 * guardando.
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

  /*
   * Il «⋯»: quello che si può fare con questa riga senza andarsene da qui.
   *
   * Dentro c'erano i tre scaffali — «riportala a oggi», «rimandala a questa
   * settimana», «rimandala a prima o poi» — e lui li ha letti per quello che
   * erano: «non hanno senso, è già una cosa sul mio feed; sembrano
   * segnaposto». Aveva ragione. La prima pagina è quello che c'è adesso:
   * spostare una riga fra gli scaffali è un gesto della lista, e la lista ha
   * una schermata sua dove quel gesto si vede per intero.
   *
   * Restano le tre cose che qui vogliono dire qualcosa: parlarne, andare a
   * vederla dove sta, e chiedergli la bozza — quest'ultima solo se la riga è
   * ancora tua e ferma, perché su una già affidata o già pronta sarebbe un
   * bottone che non fa niente. Se ne resta una sola non è un menù: è un link,
   * e si legge senza doverlo aprire.
   */
  const altro = [
    ...(siPuoParlarne() ? [{ id: 'chat', label: t('Parlane in chat'), fai: () => portaInChat(frasi.parlaneDelCompito(c.testo)) }] : []),
    { id: 'lista', label: t('Apri nella lista'), fai: () => { l.chiediDiAprire(c.id); v.goOggi() } },
    ...(c.stato === 'aperto' ? [{ id: 'bozza', label: t('Fanne una bozza'), fai: () => l.delega(c.id, 'bozza') }] : [])
  ]

  const rispondi = () => { if (risposta.trim()) l.rispondi(c.id, risposta.trim()) }

  if (consegnaPronta(c)) return <ConsegnaPronta c={c} l={l} v={v} richiudi={richiudi} />

  return (
    <div className="task-aurora-host task-aurora-hero" data-working={attivo || undefined}
      // dritta e senza l'entrata dal basso: dentro un blocco la carta prende
      // il posto di una riga, e una riga non arriva storta
      style={{ ...v.cartaScura, transform: 'none', animation: 'fadein .25s ease', position: 'relative', zIndex: menu ? 30 : undefined }}>
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
      <Riletta c={c} />

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

        {/* un gesto solo: aprirlo da un menù sarebbe nascondere una cosa sola dietro una porta */}
        {altro.length === 1 && (
          <Hov as="button" type="button" onClick={altro[0].fai}
            style={LINK_SCURO} hover={LINK_SCURO_SOPRA}>{altro[0].label}</Hov>
        )}

        {altro.length > 1 && (
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

/**
 * La domanda di Myynd su un progetto: l'ultima riga del suo blocco.
 *
 * Era una carta a sé, sotto la lista, col nome del progetto scritto sopra.
 * Adesso il progetto ce l'ha già il blocco, e la domanda sta in fondo alle
 * sue cose — mai sopra: «la carta di H-Farm dove mi fa domande deve stare
 * sotto le priorità». Il marchio davanti dice che è lui a chiedere. Un
 * bottone solo: «Parliamone», o «Apri il compito» se c'è già una riga.
 *
 * Quando «Leggi adesso» non trova niente di nuovo ma i progetti aspettano,
 * la pagina la porta sotto gli occhi e la accende per un attimo: l'avviso
 * dice «qui sotto», e questo è il «qui».
 */
function RigaDomanda({ item, v, lista, colore, prima }: { item: Vals['iniziative'][number]; v: Vals; lista?: Lista; colore: string; prima: boolean }) {
  const { attiva, props } = useAttiva()
  const riga = useRef<HTMLDivElement | null>(null)
  const [accesa, setAccesa] = useState(false)
  useEffect(() => {
    if (!v.evidenziaProgetti) return
    if (prima) riga.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setAccesa(true)
    const via = setTimeout(() => setAccesa(false), 1600)
    return () => clearTimeout(via)
  }, [v.evidenziaProgetti, prima])
  const parla = () => v.discutiIniziativa(item)
  const bottone: CSSProperties = { ...PILLOLA, border: `1px solid ${velato(colore, .45)}`, color: colore }
  return (
    <div ref={riga} role="button" tabIndex={0} onClick={parla} onKeyDown={daTastiera(parla)} {...props}
      style={{
        ...RIGA, padding: '13px 21px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
        background: attiva ? 'rgba(255,255,255,.34)' : 'transparent',
        boxShadow: accesa ? `inset 0 0 0 2px ${colore}` : 'inset 0 0 0 2px transparent', transition: 'background .15s, box-shadow .3s'
      }}>
      <Marchio dim={14} animato={false} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={TITOLO}>{item.question ?? item.title}</div>
        {item.description && <div style={PERCHE}>{taglia(item.description, 150)}</div>}
      </div>
      {item.taskId && lista
        ? <Hov as="button" type="button" onClick={fermo(() => { lista.chiediDiAprire(item.taskId!); v.goOggi() })} title={t('Apri il compito')} style={bottone} hover={{ background: '#FFFFFF' }}>{t('Apri il compito')}</Hov>
        : <Hov as="button" type="button" onClick={fermo(parla)} title={t('Parliamone in chat')} style={bottone} hover={{ background: '#FFFFFF' }}>{t('Parliamone')}</Hov>}
      <Hov as="button" type="button" onClick={fermo(() => { void v.scartaIniziativa(item.id) })}
        title={t('Toglila dal feed')}
        style={{ ...GESTO, opacity: attiva ? 1 : 0, pointerEvents: attiva ? 'auto' : 'none', transition: 'opacity .15s' }}
        hover={{ color: '#8E3F1F' }}>{t('Non mi interessa')}</Hov>
    </div>
  )
}

export type BloccoPagina = BloccoFeed<VoceFeed, Compito, Vals['iniziative'][number]>

/**
 * Un progetto, un blocco.
 *
 * «Raggruppate per progetto, ogni progetto un blocco suo, così vedo a colpo
 * d'occhio dove stanno le cose.» Il colore del progetto — quello che sceglie
 * lui in Memoria — è la prima cosa che si vede: fondo velato, bordo, nome in
 * cima. Dentro, le righe una sotto l'altra, vestite uguali: le voci che ha
 * notato Myynd, le righe della tua lista, e in fondo la sua domanda.
 *
 * «Il resto» è il blocco di quello che non sta in nessun progetto: senza
 * colore, e sempre in fondo.
 */
function Blocco({ b, v, lista, primaDomanda }: {
  b: BloccoPagina; v: Vals; lista?: Lista; primaDomanda: string | null
}) {
  /*
   * Una carta aperta per blocco, e la prima è già aperta.
   *
   * Prima era una sola in tutta la pagina, e nessuna finché non ne cliccavi
   * una: i blocchi erano dieci righe uguali, e per vedere cosa c'era dentro
   * una bisognava aprirla. «Preferisco che siano già aperte, col disegno di
   * prima, e indicizzate: una sola aperta per categoria, le altre chiuse
   * dentro la parentesi della sezione.»
   *
   * Quindi: in ogni blocco che ha delle cose da fare, una è aperta nella
   * carta scura e le altre restano righe. Quale, se non ha ancora scelto: la
   * prima pronta, perché una bozza che aspetta lui viene prima di tutto; se
   * non ce n'è, la prima del blocco. Quando ne apre un'altra, quella di prima
   * si richiude — dentro questo blocco e basta, gli altri non si muovono. La
   * scelta vive quanto la pagina, perché vive qui: il blocco resta montato
   * finché il progetto sta sul tavolo.
   */
  const compiti = b.righe.flatMap(r => (r.genere === 'compito' ? [r.compito] : []))
  const preferita = compiti.find(c => c.stato === 'pronto')?.id ?? compiti[0]?.id ?? null
  // `undefined` è «non ha ancora scelto», e vale la preferita; `null` è
  // «le ho richiuse tutte», e resta così finché non ne apre una lui
  const [scelta, setScelta] = useState<string | null | undefined>(undefined)
  // una scelta che non c'è più — la riga è stata chiusa, o è scivolata sotto
  // il tetto — non lascia il blocco senza carta: torna la preferita
  const aperta = scelta === null ? null
    : scelta && compiti.some(c => c.id === scelta) ? scelta
      : preferita

  const suo = b.progetto !== null
  const colore = suo ? v.coloreProgetto(b.progetto!) : 'rgba(34,39,31,.5)'
  const filo = suo ? velato(colore, .18) : 'rgba(34,39,31,.09)'
  const apriProgetto = () => { if (b.progetto) v.apriProgetto(b.progetto) }
  return (
    <section aria-label={b.nome} style={{
      flex: 'none', marginTop: 14, borderRadius: 20, overflow: 'hidden',
      background: suo ? `linear-gradient(0deg, ${velato(colore, .10)}, ${velato(colore, .10)}), rgba(255,253,249,.84)` : 'rgba(255,253,249,.66)',
      backdropFilter: 'blur(24px) saturate(1.4)', WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
      border: `1px solid ${suo ? velato(colore, .34) : 'rgba(255,255,255,.7)'}`,
      boxShadow: '0 22px 52px rgba(84,64,44,.09)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 21px 3px' }}>
        {suo && <span style={{ width: 8, height: 8, borderRadius: '50%', background: colore, flex: 'none' }} />}
        {suo
          ? (
            // il nome porta al progetto, nella Memoria: è l'unico posto in cui si legge l'obiettivo
            <Hov as="button" type="button" onClick={apriProgetto} title={t('Apri il progetto')}
              style={{ ...NOME, color: colore, border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline', textDecorationColor: 'transparent', textUnderlineOffset: 3 }}
              hover={{ textDecorationColor: 'currentColor' }}>{b.nome}</Hov>
          )
          : <span style={{ ...NOME, color: colore }}>{b.nome}</span>}
      </div>
      {b.righe.map((r, i) => {
        const chiave = r.genere === 'voce' ? r.voce.id : r.genere === 'compito' ? r.compito.id : r.domanda.id
        // la carta porta il suo bordo: il filo del blocco sopra di lei sarebbe
        // una seconda riga di confine, e passerebbe dritto sotto i suoi angoli
        const carta = r.genere === 'compito' && r.compito.id === aperta
        return (
          <div key={chiave} style={{ borderTop: i === 0 || carta ? 'none' : `1px solid ${filo}` }}>
            {r.genere === 'voce' && <RigaVoce voce={r.voce} v={v} lista={lista} />}
            {r.genere === 'compito' && (carta
              ? <HeroCompito c={r.compito} l={lista!} v={v} richiudi={() => setScelta(null)} />
              : <RigaCompito c={r.compito} l={lista!} v={v} apri={() => setScelta(r.compito.id)} />)}
            {r.genere === 'compito' && r.seguito && <Seguito c={r.seguito} />}
            {r.genere === 'domanda' && <RigaDomanda item={r.domanda} v={v} lista={lista} colore={colore} prima={primaDomanda === r.domanda.id} />}
          </div>
        )
      })}
    </section>
  )
}

export function Myynd({ v, lista, blocchi: dalGuscio }: { v: Vals; lista?: Lista; blocchi?: BloccoPagina[] }) {
  // quale riga è aperta nella carta scura lo sa ogni blocco per conto suo:
  // una per blocco, la prima già aperta — vedi `Blocco`
  const compiti = lista?.compiti ?? []
  // i blocchi li fa il guscio (`App.tsx`), una volta, e li usa anche per il
  // numero nel menù: qui si ricalcolano solo se nessuno li ha passati
  const blocchi: BloccoPagina[] = dalGuscio ?? blocchiFeed({ voci: v.voci, compiti, domande: v.iniziative, progetti: v.progetti, nomeResto: t('Il resto') })
  // quello che c'è in pagina: ogni riga che si vede, domande comprese, e la
  // domanda in cima. Lo stesso conto del menù, per costruzione.
  const inPagina = sulTavolo(blocchi, !!v.domanda)
  const primaDomanda = blocchi.flatMap(b => b.righe).map(r => (r.genere === 'domanda' ? r.domanda.id : null)).find(Boolean) ?? null

  return (
    <div style={{ width: 760, maxWidth: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Titolo sopra, data sotto — identico alla finestra dell'app. Sono due
          facce della stessa cosa e devono aprirsi con la stessa immagine. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, padding: '52px 4px 26px' }}>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <h1 style={{
            fontSize: 40, lineHeight: 1.15, letterSpacing: '-.032em', maxWidth: 600,
            margin: 0, padding: '0 0 0 3px', fontWeight: 400, textWrap: 'pretty'
          }}>{v.feedCaricato && !v.guastoFeed && inPagina > 0
            ? v.sulTavolo(inPagina)
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
          {/* «Leggi adesso» era un bottone pieno di rame che chiedeva attenzione:
              «più piccolo, più umile». Un occhio accanto alle fonti, e basta:
              la lettura ormai parte da sola ogni dieci minuti, questo è per
              chi non vuole aspettarli. Il nome lo dice al passaggio. */}
          <Hov as="button" type="button" onClick={v.genera} disabled={v.generando}
            title={v.generando ? t('Leggo…') : t('Leggi adesso')} aria-label={t('Leggi adesso')}
            style={{
              flex: 'none', marginTop: 6, width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '50%', border: '1px solid rgba(196,98,59,.35)', background: 'rgba(255,255,255,.7)',
              color: '#C4623B', cursor: v.generando ? 'wait' : 'pointer', padding: 0,
              opacity: v.generando ? 0.55 : 1, animation: v.generando ? 'pulse 1.2s ease-in-out infinite' : undefined
            }}
            hover={{ background: '#FFFFFF', borderColor: '#C4623B' }}>
            <IconOcchio size={15} />
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
          ai blocchi perché è la risposta alla domanda con cui si torna.
          È una carta — titolo, una riga, un bottone — e non un rigo scritto
          piccolo: aprendola si apre il foglio da leggere. Il vestito ce l'ha
          dentro, in `components/Punto.tsx`. */}
      {/* Una riga del punto apre il documento da cui viene, e niente altro: le
          cose da fare non stanno lì dentro, stanno qui sotto. */}
      <Punto v={v} />

      <Domanda v={v} />

      {/*
        I blocchi non sono inclinati, e le altre carte sì. Non è una dimenticanza.

        Un quinto di grado su una card che si vede tutta insieme è la mano
        che l'ha posata storta: si legge come carattere. Ma questi sono la
        pagina intera — duemila pixel, spesso tremila — e di una cosa così
        alta non si vede mai la forma, si vede solo il bordo che passa.
        Inclinato, quel bordo non è più verticale, e mentre si scorre sembra
        che si muova la finestra.
      */}
      {blocchi.map(b => (
        <Blocco key={b.progetto ?? 'resto'} b={b} v={v} lista={lista} primaDomanda={primaDomanda} />
      ))}

      {blocchi.length === 0 && <Vuoto v={v} />}

      {/* niente elenco delle fatte qui: quello che hai chiuso è chiuso.
          Il conto restava lì a crescere — «Done · 14» — come un cassetto che
          non si svuota mai. La storia resta nel database, non sullo schermo. */}
    </div>
  )
}

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
 * Quando è lui a chiedere.
 *
 * Deliberatamente diversa da una voce del feed: chiara, ma non urgente. Una
 * voce è lavoro che ti aspetta; questa è un collega che alza la testa dalla
 * scrivania. Se avesse l'aria di un compito, in tre giorni la salteresti come
 * si saltano i compiti — e allora tanto varrebbe non chiedere.
 *
 * Sta sopra i blocchi, mai in mezzo: non deve mettersi in mezzo al lavoro
 * vero. Ma quando non c'è lavoro resta l'unica cosa sullo schermo, ed è il
 * momento migliore per chiedere qualcosa a qualcuno.
 */
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
  // il riferimento non sta in cinque parole: è una riga per progetto, e si
  // scrive in una casella che va a capo, con la domanda sopra
  const lunga = v.domanda.tema === 'riferimento'

  return (
    <div style={{
      /*
        Sottile, e di vetro.

        La versione con la card occupava l'altezza di un blocco per contenere
        una riga di testo. Questa è una fascia: la domanda, il rigo su cui
        rispondere e la freccia stanno tutti sulla stessa linea, e in verticale
        costa un terzo.

        Il gradiente va al contrario di quello delle carte sopra — quelle
        partono opache in alto a sinistra e si spengono in basso a destra,
        questa fa l'inverso: quasi trasparente dove comincia, densa dove
        finisce. Le due superfici si passano la luce invece di ripeterla.
      */
      /*
        Lo z-index del pannello «perché» non bastava: questa fascia ha un
        backdrop-filter, e un filtro crea un contesto di impilamento — quindi
        il 25 del pannello valeva solo *dentro* la fascia, e il blocco che
        viene dopo, essendo un fratello successivo, gli finiva sopra. Si alza
        la fascia intera, non il figlio.
      */
      position: 'relative', zIndex: 12, display: 'flex', alignItems: 'center', gap: 13, flexWrap: lunga ? 'wrap' : 'nowrap',
      margin: '14px 0 4px', padding: lunga ? '14px 16px' : '10px 14px 10px 15px',
      borderRadius: 16,
      background: 'linear-gradient(258deg, rgba(255,253,249,.82) 0%, rgba(255,253,249,.46) 55%, rgba(255,253,249,.16) 100%)',
      backdropFilter: 'blur(22px) saturate(1.7)', WebkitBackdropFilter: 'blur(22px) saturate(1.7)',
      border: '1px solid rgba(255,255,255,.55)',
      borderLeft: '2px solid rgba(196,98,59,.55)',
      boxShadow: '0 10px 30px -14px rgba(84,64,44,.3), inset 0 1px 0 rgba(255,255,255,.5)',
      animation: 'fadein .3s ease'
    }}>
      <Marchio dim={14} animato={false} />

      <span style={{ fontSize: '15px', color: '#22271F', flex: lunga ? '1 1 100%' : 'none', maxWidth: lunga ? 640 : 300, textWrap: 'pretty', lineHeight: 1.35 }}>
        {v.domanda.testo}
      </span>

      {/* il rigo su cui si risponde, non una casella; per il riferimento una casella che va a capo */}
      {lunga ? (
        <textarea
          value={v.rispostaDom}
          onChange={e => v.setRispostaDom(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); v.rispondiADomanda() }
            if (e.key === 'Escape') { e.stopPropagation(); v.lasciaCadere() }
          }}
          rows={5}
          placeholder={t('Una riga per progetto: su cosa sei, cosa è morto, cosa è bloccato. Cmd+Invio per mandare.')}
          style={{
            flex: '1 1 100%', minWidth: 0, padding: '8px 10px', border: '1px solid rgba(34,39,31,.16)', borderRadius: 10,
            background: 'rgba(255,255,255,.55)', color: '#22271F', fontSize: '14px', lineHeight: 1.5, fontFamily: 'inherit', outline: 'none', resize: 'vertical'
          }} />
      ) : (
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
      )}

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
