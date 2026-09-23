import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type MouseEvent, type ReactNode } from 'react'
import { frasi, lingua, t } from '../lingua'
import { Hov, daTastiera, useAttiva } from '../ui'
import { IconAvanti, IconOcchio, IconPiu, IconSpunta } from '../icons'
import { Glifo } from '../components/Stato'
import { Marchio } from '../components/Marchio'
import { Rassegna } from '../components/Rassegna'
import { Punto } from '../components/Punto'
import { generePrimoDocumento, nomeDelFile, nomePorta, parolaFonte, portaInChat, primoParagrafo, siPuoParlarne, taglia, type Vals } from '../vals'
import type { Lista } from '../oggi/useCompiti'
import { secchioVivo } from '../oggi/secchi'
import { giornoLocale } from '../oggi/giorni'
import type { Chiesta, Compito } from '../api'
import type { VoceFeed } from '../data'
import { quando } from '../data'
import { dataFonte, testoCarta } from '../feed-carta'
import { azioneEmail } from '../oggi/azione-email'
import { blocchiFeed, chiaveBlocco, type Blocco as BloccoFeed, ordinaBlocchi, ordineDopoIlTrascinamento, ordineStabile, sulTavolo } from '../blocchi-feed'
import { AuroraCompito, PassoAttivo } from '../components/AuroraCompito'
import { compitoInEsecuzione } from '../compito-attivo'
import { presentazioneRevisione, statoRevisione } from '../consegna-ui'
import { velato } from '../colori-progetto'
import { PrioritaProgetto } from '../components/PrioritaProgetto'

/** Il bottone pieno su fondo scuro: ne resta uno, sulla fascia «Myynd ti ha scritto». */
const PIENO_SCURO: CSSProperties = {
  padding: '12px 26px', borderRadius: 99, border: '1px solid var(--avorio)', background: 'var(--avorio)', color: 'var(--su-avorio)',
  fontSize: 14, fontWeight: 500, boxShadow: '0 10px 24px rgba(var(--ombra-rgb),.3)', cursor: 'pointer', fontFamily: 'inherit'
}

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
const PERCHE: CSSProperties = { fontSize: '13px', lineHeight: 1.5, color: 'rgba(var(--inchiostro-rgb),.64)', marginTop: 3, textWrap: 'pretty', overflowWrap: 'anywhere' }
const OFFERTA: CSSProperties = { ...PERCHE, color: 'rgba(var(--inchiostro-rgb),.78)', marginTop: 5 }
const QUANDO: CSSProperties = { flex: 'none', fontSize: 12, color: 'rgba(var(--inchiostro-rgb),.5)', marginTop: 2, whiteSpace: 'nowrap' }
/** La pastiglia a destra: l'urgenza di una voce, o quello che una riga aspetta da te. */
const PASTIGLIA: CSSProperties = {
  flex: 'none', fontSize: '11.5px', fontWeight: 600, letterSpacing: '.02em', color: 'var(--rame-testo)',
  background: 'rgba(var(--rame-rgb),.14)', border: '1px solid rgba(var(--rame-rgb),.3)', borderRadius: 99, padding: '3px 9px', whiteSpace: 'nowrap'
}
/**
 * La pastiglia di una cosa finita: rame pieno, non il rame velato dell'attesa.
 *
 * «Segnala più chiaramente quando ha finito, con un messaggio chiaro.» Una
 * riga pronta portava la stessa pastiglia leggera di tutto il resto, e da
 * lontano non si distingueva da una riga qualsiasi. Piena si vede da un
 * metro, ed è l'unica di questo peso in pagina: se ce ne fossero due non
 * direbbe più niente.
 */
const PASTIGLIA_FATTA: CSSProperties = {
  ...PASTIGLIA, color: 'var(--avorio)', background: 'var(--rame)', borderColor: 'var(--rame)'
}
/** Il nome del progetto in cima al blocco: maiuscoletto spaziato, nel suo colore. */
const NOME: CSSProperties = { fontSize: '11.5px', fontWeight: 600, letterSpacing: '.09em', textTransform: 'uppercase', minWidth: 0, overflowWrap: 'anywhere', textAlign: 'left' }
/** Un gesto scritto piccolo, senza bordo: quello che si fa di rado. */
const GESTO: CSSProperties = { padding: '2px 0', border: 'none', background: 'none', color: 'rgba(var(--inchiostro-rgb),.55)', fontSize: '12.5px', fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }
/** Il bottone della riga: uno solo per riga, ed è quello che si fa quasi sempre. */
const PILLOLA: CSSProperties = {
  padding: '4px 11px', borderRadius: 99, border: '1px solid rgba(var(--inchiostro-rgb),.2)', background: 'rgba(var(--luce-rgb),.7)',
  color: 'rgba(var(--inchiostro-rgb),.72)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap'
}
const PILLOLA_SOPRA: CSSProperties = { borderColor: 'var(--rame)', color: 'var(--rame-testo)' }
/** Un link scritto nel rame: la sottolineatura c'è solo sotto il dito. */
const LINK: CSSProperties = {
  padding: 0, border: 'none', background: 'none', fontFamily: 'inherit', fontSize: '12.5px', color: 'var(--rame-testo)', cursor: 'pointer',
  textDecoration: 'underline', textDecorationColor: 'transparent', textUnderlineOffset: 3, whiteSpace: 'nowrap', textAlign: 'left'
}
/**
 * Il bottone pieno di una riga: uno solo, e c'è solo dove qualcosa si manda.
 *
 * Sulla riga i gesti sono di contorno o scritti e basta; il rame pieno resta
 * per la cosa che parte — «Manda» sotto le domande — perché lì c'è una scelta
 * fatta che aspetta di essere spedita, e non deve cercarla nessuno.
 */
const MANDA: CSSProperties = {
  flex: 'none', padding: '8px 16px', borderRadius: 99, border: 'none',
  background: 'linear-gradient(120deg,var(--rame-profondo),var(--ambra))', color: 'var(--avorio)',
  fontSize: '13px', fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer'
}
const MANDA_SPENTO: CSSProperties = {
  ...MANDA, background: 'rgba(var(--inchiostro-rgb),.1)', color: 'rgba(var(--inchiostro-rgb),.3)', cursor: 'default'
}

/** Un gesto dentro una riga che è essa stessa un bersaglio: il clic non deve risalire. */
const fermo = (fai: () => void) => (e: MouseEvent) => { e.stopPropagation(); fai() }

/**
 * La scatola in cui si scrive: la stessa della barra che aggiunge una cosa
 * da fare (`Barra.tsx`), copiata e non ridisegnata.
 *
 * «This input bar is very small and it's not designed like the others. I
 * liked the other designs better.» Un campo sottolineato in fondo alla
 * pagina e una casella con un altro raggio dentro una riga erano tre disegni
 * per lo stesso mestiere. Da qui in poi è uno: raggio 14, la carta all'86%,
 * il vetro, e il bordo che si accende quando ci sei dentro.
 */
export function Scatola({ children, alto = false }: { children: ReactNode; alto?: boolean }) {
  const [fuoco, setFuoco] = useState(false)
  return (
    <div onFocus={() => setFuoco(true)} onBlur={() => setFuoco(false)} style={{
      flex: 1, minWidth: 0, display: 'flex', alignItems: alto ? 'flex-end' : 'center', gap: 6,
      padding: alto ? '9px 9px 9px 15px' : '3px 9px 3px 15px', borderRadius: 14,
      background: 'rgba(var(--carta-rgb),.86)', backdropFilter: 'blur(22px)', WebkitBackdropFilter: 'blur(22px)',
      border: `1px solid ${fuoco ? 'rgba(var(--inchiostro-rgb),.26)' : 'rgba(var(--luce-rgb),.9)'}`,
      boxShadow: fuoco ? '0 8px 26px rgba(var(--ombra-rgb),.10)' : '0 4px 16px rgba(var(--ombra-rgb),.05)',
      transition: 'border-color .15s, box-shadow .15s'
    }}>{children}</div>
  )
}
/** Il campo dentro la scatola: senza bordo suo, è la scatola che lo veste. */
export const CAMPO: CSSProperties = {
  flex: 1, minWidth: 0, border: 'none', background: 'none', outline: 'none',
  color: 'var(--inchiostro)', fontSize: '13.5px', fontFamily: 'inherit', padding: '7px 0'
}

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
      <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '2px 7px', minWidth: 0, fontSize: '12.5px', color: 'rgba(var(--inchiostro-rgb),.55)' }}>{sinistra}</div>
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
  /*
   * La pastiglia dice quando, in tre parole: «entro venerdì», «domani 9:30».
   *
   * Sulla carta dell'audit c'era scritto «Tuesday Sep 22, 2026, 9:30am.
   * 10am Eastern Time», quarantacinque caratteri dentro una pastiglia
   * fatta per tre parole: la riga si spezzava e non si leggeva niente. Le
   * voci nuove nascono già corte (`rifinitura.ts`); quelle di prima, se
   * sono lunghe, la pastiglia non la portano: la data resta nel testo.
   */
  const pastiglia = (voce.urgenza ?? '').trim()
  const conPastiglia = pastiglia.length > 0 && pastiglia.length <= 26 && !/[.;]\s\S/.test(pastiglia)
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

  const fatto = <Hov as="button" type="button" onClick={fermo(() => v.risolviVoce(voce))} style={proposta && lista ? GESTO : PILLOLA} hover={proposta && lista ? { color: 'var(--rame-testo)' } : PILLOLA_SOPRA}>{t('Fatto')}</Hov>
  const affidalo = lista && (
    <Hov as="button" type="button" onClick={fermo(() => { void affida() })} disabled={affidando}
      style={{ ...(proposta ? PILLOLA : GESTO), opacity: affidando ? .6 : 1 }} hover={proposta ? PILLOLA_SOPRA : { color: 'var(--rame-testo)' }}>{t('Affidalo a Myynd')}</Hov>
  )

  return (
    <div role={espandibile ? 'button' : undefined} tabIndex={0} onClick={apri} onKeyDown={daTastiera(apri)} {...props}
      aria-expanded={espandibile ? aperta : undefined}
      style={{ ...RIGA, cursor: espandibile ? 'pointer' : 'default', background: attiva ? 'var(--riga-sopra)' : 'transparent' }}>
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
        {conPastiglia && <span style={PASTIGLIA}>{pastiglia}</span>}
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
            <Hov as="button" type="button" onClick={fermo(() => v.parlaneDi(voce))} style={GESTO} hover={{ color: 'var(--rame-testo)' }}>{t('Parlane in chat')}</Hov>
            <Hov as="button" type="button" onClick={fermo(() => v.scartaVoce(voce))} title={t('Toglila dal feed')} style={GESTO} hover={{ color: 'var(--rame-testo)' }}>{t('Non mi interessa')}</Hov>
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
  const quieto = scuro ? 'rgba(var(--avorio-rgb),.68)' : 'rgba(var(--inchiostro-rgb),.55)'
  const acceso = scuro ? 'var(--avorio)' : 'var(--rame-testo)'
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
function Portami({ c, l, v, scuro, piatto = false, anteprima = false, etichetta: data }: { c: Compito; l: Lista; v: Vals; scuro?: boolean; piatto?: boolean; anteprima?: boolean; etichetta?: string }) {
  if ((!c.porta && !c.consegna) || (anteprima && !c.consegna?.anteprima)) return null

  const vai = async () => {
    const r = await l.portami(c.id, anteprima ? { anteprima: true } : undefined)
    // il perché l'ha già detto la lista, con un avviso: qui non si aggiunge niente
    if (!r || !r.ok) return
    // i due posti che stanno dentro l'app: li apre chi ha lo schermo
    if (r.dove === 'compito') { l.chiediDiAprire(r.id); v.goOggi() }
    else if (r.dove === 'progetto') v.apriProgetto(r.id)
  }

  const etichetta = data ?? (anteprima ? (lingua() === 'en' ? 'Preview PDF' : 'Anteprima PDF')
    : c.consegna ? (c.consegna.app === 'File' ? t('Apri') : `${lingua() === 'en' ? 'Open in' : 'Apri in'} ${c.consegna.app}`)
    : nomePorta(c.porta!))
  const vestito: CSSProperties = scuro
    ? {
        padding: '12px 20px', borderRadius: 99, border: '1px solid rgba(var(--avorio-rgb),.32)',
        background: 'none', color: 'rgba(var(--avorio-rgb),.9)', fontSize: 14
      }
    : piatto ? LINK : {
        padding: '4px 11px', borderRadius: 99, border: '1px solid rgba(var(--inchiostro-rgb),.2)',
        background: 'rgba(var(--luce-rgb),.7)', color: 'rgba(var(--inchiostro-rgb),.72)', fontSize: 12
      }

  return (
    <Hov as="button" type="button"
      onClick={(e: MouseEvent) => { e.stopPropagation(); void vai() }}
      title={c.consegna?.percorso ?? c.consegna?.titolo ?? etichetta}
      style={{ ...vestito, flex: 'none', whiteSpace: data ? 'normal' : 'nowrap', overflowWrap: 'anywhere', cursor: 'pointer', fontFamily: 'inherit' }}
      hover={scuro ? { background: 'rgba(var(--avorio-rgb),.16)', borderColor: 'rgba(var(--avorio-rgb),.5)' } : piatto ? { textDecorationColor: 'currentColor' } : { borderColor: 'var(--rame)', color: 'var(--rame-testo)' }}>
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

/**
 * Il documento che ha scritto: una riga, non una carta.
 *
 * Era una scheda con il titolo grande, il messaggio di consegna, la revisione
 * e due bottoni — cioè, dentro una riga alta quaranta pixel, un secondo
 * oggetto alto centoventi. «Che senso ha che si aprano così e occupino tutto
 * quello spazio.» Quello che serve sapere sono tre cose: che c'è, come si
 * chiama, e come si apre. La revisione si scrive solo se ha trovato qualcosa:
 * «revisione superata» sotto una cosa già dichiarata pronta è la stessa
 * notizia detta due volte.
 */
function ConsegnaPronta({ c, l, v }: { c: Compito; l: Lista; v: Vals }) {
  const d = c.consegna
  if (!d) return null
  const en = lingua() === 'en'
  /*
   * Il file che ha scritto da sé: dove sta, come si chiama, «Apri».
   *
   * «He should tell me, "Hey, I saved it to your desktop"». Il verdetto
   * della rilettura non si ripete qui: lo dice già `Riletta`, sopra.
   */
  if (d.app === 'File') {
    return (
      <div className="task-completed" aria-label={en ? 'Saved file' : 'File salvato'}>
        <span className="task-completed-check"><IconSpunta size={12} /></span>
        <span className="task-completed-meta">{frasi.salvatoDove(d.dove)}</span>
        {/* il nome è il bottone: un «Apri» a parte andava a capo da solo, staccato dal nome */}
        <Portami c={c} l={l} v={v} piatto etichetta={d.titolo} />
      </div>
    )
  }
  const male = d.revisione?.esito !== 'pass'
  return (
    <div className="task-completed" aria-label={en ? 'Document' : 'Documento'}>
      <span className="task-completed-check"><IconSpunta size={12} /></span>
      <span className="task-completed-name" title={d.titolo}>{d.titolo}</span>
      <span className="task-completed-meta">{[d.app, d.pagine ? `${d.pagine} ${en ? (d.pagine === 1 ? 'page' : 'pages') : (d.pagine === 1 ? 'pagina' : 'pagine')}` : null].filter(Boolean).join(' · ')}</span>
      <Portami c={c} l={l} v={v} piatto />
      {male && <span className="task-completed-review">{statoRevisione(d.revisione, en)}</span>}
    </div>
  )
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
 * Il corpo: una riga sola sotto il titolo, come sotto una voce del feed.
 *
 * Il guaio se c'è; su una cosa finita la riga che dice che è finita; su una
 * cosa che chiede, quello che ha visto prima di fermarsi — le domande stanno
 * sotto, in chiaro, e ripeterle qui sarebbe la stessa frase due volte; sul
 * resto, la nota.
 */
function corpo(c: Compito): string {
  if (c.guaio) return t(c.guaio)
  // su un file scritto da sé resta la riga per lei, se c'era: le ipotesi
  // fatte, la scelta presa. Il documento sta nel file, non qui.
  if (c.consegna) return c.consegna.app === 'File' ? dopoLaChiusura(c.risultato ?? '') : ''
  if (c.stato === 'pronto') return fraseFinita(c) || primoParagrafo(c.risultato ?? '')
  if (c.stato === 'chiede') return domande(c).visto
  return presentazioneRevisione(c, lingua() === 'en')?.descrizione ?? c.nota ?? ''
}

/**
 * Quello che chiede, smontato: cosa ha visto, e cosa vuole sapere.
 *
 * Quando si ferma scrive due righe: la prima dice dove è arrivato («ho letto
 * la proposta ma manca il proprietario»), la seconda è la domanda vera («chi
 * segue il pilota H-Farm?»). A quelle si aggiungono le domande a scelta che
 * manda a parte, in `chieste`. Da qui escono già nella forma in cui si
 * disegnano: una riga sotto il titolo, e un elenco di domande.
 *
 * Se ha scritto una riga sola: è la domanda, a meno che le domande a scelta ci
 * siano già — allora quella riga è quello che ha visto, e le domande sono le
 * loro.
 */
function domande(c: Compito): { visto: string; tutte: Chiesta[] } {
  const righe = (c.risultato ?? '').split('\n').map(r => r.trim()).filter(Boolean)
  const scelte = c.chieste ?? []
  // le domande a scelta sono le stesse domande, con le risposte da toccare:
  // con quelle, la prosa non si ripete sotto come una domanda in più
  const libera = scelte.length ? '' : righe.length > 1 ? righe.slice(1).join('\n') : righe.length === 1 ? righe[0] : ''
  const visto = righe.length > 1 || (righe.length === 1 && scelte.length) ? righe[0] : ''
  return { visto, tutte: [...(libera ? [{ domanda: libera, opzioni: [], multipla: false }] : []), ...scelte] }
}

/** Quello che viene dopo la frase di chiusura, se è corto: la riga per lei. */
function dopoLaChiusura(risultato: string): string {
  const [, ...resto] = risultato.trim().split(/\n\s*\n/)
  const nota = resto.join('\n').trim()
  return nota.length <= 400 ? nota : ''
}

/**
 * La riga che dice che ha finito, se il lavoro ne porta una.
 *
 * Il server apre quello che scrive con una riga sola che dice cosa ha fatto
 * («Fatto: la definizione del pilota è scritta e salvata in Pages»), e quella
 * riga è la risposta alla cosa che lui chiedeva: sapere, senza aprire niente,
 * che è finita e com'è finita. Se non c'è resta l'inizio del lavoro, che è
 * quello che si leggeva prima: meglio una frase vera che un annuncio finto.
 */
function fraseFinita(c: Compito): string {
  const prima = (c.risultato ?? '').split('\n').map(r => r.trim()).find(Boolean) ?? ''
  return /^(fatto|done)\s*:/i.test(prima) ? prima : ''
}

/**
 * Il verdetto sulla bozza, in una riga: «riletta come te e come Rossi: regge».
 *
 * «Quando affido una cosa a Myynd devo sapere che è di qualità.» La rilettura
 * la fa il server (`revisione-lavoro.ts`); qui si dice che è stata fatta e
 * com'è andata, e se restano punti aperti si elencano, corti. Senza modello
 * non si dice niente: una riga che dice «non riletta» è una scusa.
 */
function Riletta({ c, chiaro = false }: { c: Compito; chiaro?: boolean }) {
  const r = c.revisione
  if (c.stato !== 'pronto' || !r || r.esito === 'unavailable') return null
  return (
    <div style={{ marginTop: chiaro ? 5 : 12, maxWidth: 600, fontSize: chiaro ? '12.5px' : '13px', lineHeight: 1.5, color: chiaro ? 'rgba(var(--inchiostro-rgb),.58)' : 'rgba(var(--avorio-rgb),.72)', textWrap: 'pretty' }}>
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
  return c.stato === 'pronto' ? t('fatto') : c.stato === 'chiede' ? t('ti chiede') : ''
}

/**
 * Le sue domande, tutte insieme, sotto il titolo della riga.
 *
 * «Avere dieci domande non è bello: meglio un compito solo con più domande
 * dentro… e fammi rispondere sul feed.» Erano una riga a testa, o una carta
 * scura grande mezzo schermo con dentro una casella sola. Qui sono un elenco
 * corto: ogni domanda una riga, le sue opzioni come pastiglie da toccare, e in
 * fondo un rigo per scrivere e un «Manda» solo. Quello che parte è un
 * messaggio unico — una riga per domanda, «domanda → risposta» — perché il
 * lavoro riparte una volta, non una per domanda.
 *
 * Le pastiglie di una domanda a scelta singola si comportano come un radio:
 * toccarne un'altra sostituisce. Con `multipla` si accendono e si spengono.
 */
function Domande({ c, l }: { c: Compito; l: Lista }) {
  const [testo, setTesto] = useState('')
  const [scelte, setScelte] = useState<Record<number, Set<string>>>({})
  const { tutte } = domande(c)

  const tocca = (i: number, o: string, multipla: boolean) => setScelte(s => {
    const ora = new Set(s[i] ?? [])
    if (ora.has(o)) ora.delete(o)
    else if (multipla) ora.add(o)
    else { ora.clear(); ora.add(o) }
    return { ...s, [i]: ora }
  })

  /** Un messaggio solo: una riga per domanda a cui ha risposto, poi quello che ha scritto. */
  const composta = () => {
    const scritto = testo.trim()
    const libera = tutte.findIndex(q => !q.opzioni.length)
    const righe = tutte
      .map((q, i) => {
        const prese = [...(scelte[i] ?? [])]
        if (prese.length) return `${q.domanda} → ${prese.join(', ')}`
        // la domanda aperta prende quello che ha scritto: è la sua risposta,
        // e mandarla staccata dalla domanda vorrebbe dire farlo indovinare
        if (i === libera && scritto) return `${q.domanda} → ${scritto}`
        return ''
      })
      .filter(Boolean)
    if (scritto && libera < 0) righe.push(scritto)
    return righe.join('\n')
  }

  const qualcosa = !!testo.trim() || Object.values(scelte).some(s => s.size)
  const manda = () => { if (qualcosa) l.rispondi(c.id, composta()) }

  return (
    <div style={{ marginTop: 9 }} onClick={e => e.stopPropagation()}>
      {tutte.map((q, i) => (
        <div key={i} style={{ marginTop: i ? 9 : 0 }}>
          <div style={{ fontSize: '13px', lineHeight: 1.45, color: 'var(--inchiostro)', overflowWrap: 'anywhere' }}>{q.domanda}</div>
          {q.opzioni.length > 0 && (
            <div role={q.multipla ? 'group' : 'radiogroup'} aria-label={q.domanda} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
              {q.opzioni.map(o => {
                const presa = !!scelte[i]?.has(o)
                return (
                  <Hov as="button" key={o} type="button" role={q.multipla ? 'switch' : 'radio'} aria-checked={presa}
                    onClick={fermo(() => tocca(i, o, q.multipla))}
                    style={{
                      padding: '5px 11px', borderRadius: 99, fontFamily: 'inherit', fontSize: '12.5px',
                      cursor: 'pointer', maxWidth: '100%', overflowWrap: 'anywhere',
                      border: `1px solid ${presa ? 'var(--rame)' : 'rgba(var(--inchiostro-rgb),.18)'}`,
                      background: presa ? 'rgba(var(--rame-rgb),.14)' : 'rgba(var(--luce-rgb),.7)',
                      color: presa ? 'var(--rame-testo)' : 'var(--inchiostro)'
                    }}
                    hover={presa ? { borderColor: 'var(--rame-testo)' } : { borderColor: 'var(--rame)', color: 'var(--rame-testo)' }}>{o}</Hov>
                )
              })}
            </div>
          )}
        </div>
      ))}

      <div style={{ display: 'flex', gap: 8, marginTop: 10, maxWidth: 560, alignItems: 'center' }}>
        {/* la scatola è quella di casa (`Barra.tsx`): una barra sola per scrivere, in tutta l'app */}
        <Scatola>
          <input
            value={testo}
            onChange={e => setTesto(e.target.value)}
            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') manda() }}
            aria-label={t('Rispondi qui')}
            placeholder={t('Rispondi qui')}
            style={CAMPO} />
        </Scatola>
        <button type="button" onClick={fermo(manda)} disabled={!qualcosa} style={qualcosa ? MANDA : MANDA_SPENTO}>{t('Manda')}</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '2px 14px', marginTop: 7 }}>
        {/* la risposta che chiude: il server la riconosce e la lascia perdere,
            senza rimandarla a lavorare su una cosa che non serve più */}
        <Hov as="button" type="button" onClick={fermo(() => l.rispondi(c.id, 'not relevant'))}
          style={LINK} hover={{ textDecorationColor: 'currentColor' }}>{t('Non mi serve, lasciala perdere')}</Hov>
        {/* l'altra strada: certe righe non si sbloccano con un dato, perché non
            sono compiti — vedi il bottone gemello in `Oggi` */}
        {siPuoParlarne() && (
          <Hov as="button" type="button" onClick={fermo(() => portaInChat(frasi.scomponi(c.testo)))}
            title={t('Non è un compito? Parlane in chat e scomponilo insieme a Myynd.')}
            style={{ ...LINK, color: 'rgba(var(--inchiostro-rgb),.55)' }} hover={{ color: 'var(--rame-testo)', textDecorationColor: 'currentColor' }}>{t('Scomponila in chat')}</Hov>
        )}
      </div>
    </div>
  )
}

/**
 * Una riga della tua lista, dentro il blocco del suo progetto.
 *
 * Vestita come una voce del feed, e basta: il titolo, una riga sotto, lo stato
 * a destra, e sotto il dito la stessa fascia di gesti. «Perché dovrebbero
 * aprirsi in modo diverso? Devono aprirsi uguali, e preferisco il secondo:
 * più pulito, occupa meno spazio.» Prima una riga tua si apriva in una carta
 * scura alta mezzo schermo mentre una voce del feed restava una riga: due
 * modi di dire la stessa cosa nella stessa pagina, e il più ingombrante
 * toccava proprio alle cose sue.
 *
 * Quindi niente carta: quello che serviva lì dentro sta qui. Il testo lungo si
 * apre sul posto, cliccando la riga; le domande si rispondono sul posto; il
 * documento è una riga; i gesti sono la fascia. Una riga affidata non si apre
 * e non si chiede: ha la sua luce addosso e un solo modo di fermarla.
 */
function RigaCompito({ c, l, v }: { c: Compito; l: Lista; v: Vals }) {
  const { attiva, props } = useAttiva()
  const [aperta, setAperta] = useState(false)
  const attesa = attesaDi(c)
  const pronto = c.stato === 'pronto'
  const chiede = c.stato === 'chiede'
  // affidata: è nelle sue mani, in coda o già sotto le dita. Il passo che sta
  // facendo si vede solo quando arriva davvero (`compitoInEsecuzione`): la
  // luce dice «ce l'ha lui», la riga accanto dice a che punto è.
  const affidato = c.stato === 'delegato'
  const attivo = compitoInEsecuzione(c, l.passi[c.id])
  /*
   * Il momento in cui finisce.
   *
   * «The animation of when the work gets done is not good.» Quando la riga
   * passa da affidata a pronta (o a una domanda), il fuoco non sparisce di
   * colpo: si raccoglie, si spegne nel rame e si posa, un secondo e mezzo,
   * e poi la riga è quella di sempre con la pastiglia piena. Si ricorda com'era
   * al giro prima: il passaggio si vede una volta, non a ogni ridisegno.
   */
  const eraAffidato = useRef(affidato)
  const [finita, setFinita] = useState(false)
  useEffect(() => {
    if (eraAffidato.current && !affidato && (c.stato === 'pronto' || c.stato === 'chiede')) setFinita(true)
    eraAffidato.current = affidato
  }, [affidato, c.stato])
  const titolo = presentazioneRevisione(c, lingua() === 'en')?.titolo ?? c.testo
  const testo = corpo(c)
  // quello che ha scritto per intero: si legge aprendo la riga, dove stava, e
  // si tiene quando accetti la bozza — è da lì che impara come scrivi
  // su un file scritto da sé quello che si apre sul posto è la riga per
  // lei, non il documento: quello sta nel file
  const intero = pronto && !c.consegna ? (c.risultato ?? '').trim() || testo : testo
  const corta = taglia(testo, 150)
  const espandibile = !chiede && intero.length > corta.length
  const apri = () => { if (espandibile) setAperta(x => !x) }
  const parlane = siPuoParlarne() ? () => v.discutiCompito(c) : null
  const email = pronto && c.email && azioneEmail(c).tipo === 'invia'

  return (
    <div className="task-aurora-host task-aurora-row" data-working={affidato || finita || undefined}
      {...(espandibile ? { role: 'button', tabIndex: 0, onClick: apri, onKeyDown: daTastiera(apri), 'aria-expanded': aperta } : {})}
      style={{ ...RIGA, cursor: espandibile ? 'pointer' : 'default', background: attiva ? 'var(--riga-sopra)' : 'transparent' }}
      {...props}>
      {affidato && !finita && <AuroraCompito />}
      {finita && <AuroraCompito fase="finita" onFinita={() => setFinita(false)} />}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...TITOLO, display: 'flex', alignItems: 'center', gap: 8 }}>
            {affidato && <Glifo tipo="penso" dim={12} colore="var(--inchiostro)" />}
            <span style={{ minWidth: 0 }}>{titolo}</span>
          </div>
          {testo && <div style={{ ...PERCHE, whiteSpace: aperta ? 'pre-line' : undefined }}>{aperta ? intero : corta}</div>}
          <Riletta c={c} chiaro />
          {attivo && <PassoAttivo passo={l.passi[c.id]} />}
          <ConsegnaPronta c={c} l={l} v={v} /><BozzaInPosta c={c} />
          {chiede && <Domande c={c} l={l} />}
        </div>
        {attesa
          ? <span style={pronto ? PASTIGLIA_FATTA : PASTIGLIA}>{attesa}</span>
          : <span style={QUANDO}>{didascalia(c, attivo)}</span>}
      </div>
      <Fascia attiva={attiva}
        sinistra={<Prove c={c} v={v} l={l} inRiga />}
        destra={affidato
          ? (
            // una riga che sta lavorando non si chiude e non si affida due
            // volte: l'unica cosa da fare è fermarla
            <Hov as="button" type="button" onClick={fermo(() => l.richiama(c.id))} style={PILLOLA} hover={PILLOLA_SOPRA}>{t('Richiamala')}</Hov>
          )
          : (
            <>
              {/* su una bozza pronta «Fatto» sarebbe una bugia: quello che
                  chiudi lì è il testo che hai davanti, e va tenuto */}
              <Hov as="button" type="button" aria-label={`${pronto ? t('Va bene') : t('Fatto')}: ${titolo}`}
                onClick={fermo(() => (pronto ? l.chiudi(c.id, t('Va bene così.'), intero) : l.chiudi(c.id)))}
                style={PILLOLA} hover={PILLOLA_SOPRA}>{pronto ? t('Va bene') : t('Fatto')}</Hov>
              {email && (
                <Hov as="button" type="button" onClick={fermo(() => { void l.manda(c.id) })} style={PILLOLA} hover={PILLOLA_SOPRA}>{t('Manda')}</Hov>
              )}
              {pronto && (
                <Hov as="button" type="button" onClick={fermo(() => l.delega(c.id, c.modo))} style={GESTO} hover={{ color: 'var(--rame-testo)' }}>{t('Rifallo')}</Hov>
              )}
              {/* Un modo solo di affidarla, ed è questo.
                  «"Myynd takes it" and "Draft it for me" are too similar
                  because that's basically what Myynd does: it drafts it, and
                  then you can approve it and send it out.» Erano due bottoni
                  uno accanto all'altro che chiedevano di scegliere fra due
                  parole per la stessa cosa, prima ancora di sapere cosa
                  sarebbe venuto fuori. La scelta non era sua da fare: quello
                  che cambia — un file sulla Scrivania, una risposta pronta da
                  mandare, una modifica nel progetto — lo decide la cosa da
                  fare, non un bottone. La bozza resta scrivendo «/draft»
                  nella barra, per chi la vuole nominare. */}
              {c.stato === 'aperto' && (
                <Hov as="button" type="button" onClick={fermo(() => l.delega(c.id, 'tutto'))} style={GESTO} hover={{ color: 'var(--rame-testo)' }}>{t('Se ne occupa Myynd')}</Hov>
              )}
              {parlane && (
                <Hov as="button" type="button" onClick={fermo(parlane)} style={GESTO} hover={{ color: 'var(--rame-testo)' }}>{t('Parlane in chat')}</Hov>
              )}
              {!c.consegna && <Portami c={c} l={l} v={v} piatto />}
              {/* niente «Sicuro?»: toglierla è la decisione, non l'inizio di una domanda */}
              <Hov as="button" type="button" title={t('Toglila')} onClick={fermo(() => { void l.elimina(c.id) })}
                style={GESTO} hover={{ color: 'var(--rame-testo)' }}>{t('Toglila')}</Hov>
            </>
          )} />
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
    <div style={{ padding: '0 21px 12px', marginTop: -2, fontSize: '12.5px', lineHeight: 1.45, color: 'rgba(var(--inchiostro-rgb),.6)', overflowWrap: 'anywhere' }}>
      <span style={{ fontWeight: 600 }}>{t('Poi:')}</span> {c.testo}
    </div>
  )
}

export type BloccoPagina = BloccoFeed<VoceFeed, Compito>

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
 * colore, e in fondo a parità di attesa.
 *
 * La testa si trascina: l'ordine dei blocchi lo decide lui, e chi decide
 * l'ordine lo fa prendendo la cosa e spostandola. Vedi `ordinaBlocchi`.
 * Accanto al nome c'è la priorità del progetto: accesa si vede sempre, spenta
 * compare sotto mano con gli altri gesti della testa.
 *
 * Un blocco senza righe esiste solo per un progetto appena nato: dentro c'è
 * la domanda del primo passo, con la barra per scriverlo.
 */
function Blocco({ b, v, lista, indice, ultimo, muovi }: {
  b: BloccoPagina; v: Vals; lista?: Lista
  /** Dove sta adesso, e dove può andare: il trascinamento parla per posti, non per nomi. */
  indice: number; ultimo: boolean; muovi: (da: number, a: number) => void
}) {
  const { attiva, props } = useAttiva()
  const [sopra, setSopra] = useState(false)
  const suo = b.progetto !== null
  const colore = suo ? v.coloreProgetto(b.progetto!) : 'rgba(var(--inchiostro-rgb),.5)'
  const filo = suo ? velato(colore, .18) : 'rgba(var(--inchiostro-rgb),.09)'
  const apriProgetto = () => { if (b.progetto) v.apriProgetto(b.progetto) }

  /*
   * Trascinare un blocco sopra un altro.
   *
   * «Vorrei poter trascinare e dare priorità a una sezione sull'altra.» Si
   * prende dalla testa — il nome, non una riga: le righe dentro si cliccano, e
   * un blocco che parte mentre si prova a premere «Fatto» è una cosa che si
   * rompe sotto le dita. Quello che si sposta è il posto, non il contenuto: il
   * numero di partenza viaggia dentro l'evento, e chi riceve dice il suo.
   *
   * Accanto c'è la stessa cosa da tastiera: «Sposta su» e «Sposta giù» nella
   * fascia della testa. Non è un ripiego per chi non può trascinare, è l'unico
   * modo in cui questo gesto esiste per chi non usa il mouse — e chi lo usa
   * spesso preferisce due clic a una mira.
   */
  const prendi = (e: DragEvent) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(indice))
  }
  const sorvola = (e: DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setSopra(true) }
  const posa = (e: DragEvent) => {
    e.preventDefault()
    setSopra(false)
    const da = Number(e.dataTransfer.getData('text/plain'))
    if (Number.isInteger(da)) muovi(da, indice)
  }

  return (
    <section aria-label={b.nome} data-blocco={chiaveBlocco(b)}
      onDragOver={sorvola} onDragLeave={() => setSopra(false)} onDrop={posa}
      style={{
        flex: 'none', marginTop: 14, borderRadius: 20, overflow: 'hidden',
        background: suo ? `linear-gradient(0deg, ${velato(colore, .10)}, ${velato(colore, .10)}), rgba(var(--carta-rgb),.84)` : 'rgba(var(--carta-rgb),.66)',
        backdropFilter: 'blur(24px) saturate(1.4)', WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
        border: `1px solid ${suo ? velato(colore, .34) : 'rgba(var(--luce-rgb),.7)'}`,
        // dove si posa: un filo di rame in cima, e niente altro. Un blocco che
        // si illumina tutto mentre ne trascini un altro sembra il bersaglio
        // sbagliato — quello che cambia è il posto, e il posto è la riga sopra
        boxShadow: sopra ? `inset 0 3px 0 var(--rame), 0 22px 52px rgba(var(--ombra-rgb),.09)` : '0 22px 52px rgba(var(--ombra-rgb),.09)'
      }}>
      <div draggable onDragStart={prendi} onDragEnd={() => setSopra(false)} {...props}
        title={t('Trascinalo per cambiare ordine')}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 21px 3px', cursor: 'grab' }}>
        {suo && <span style={{ width: 8, height: 8, borderRadius: '50%', background: colore, flex: 'none' }} />}
        {suo
          ? (
            // il nome apre la pagina del progetto, qui sopra: l'obiettivo, i passi, quello che è fatto
            <Hov as="button" type="button" onClick={apriProgetto} title={t('Apri il progetto')}
              style={{ ...NOME, color: colore, border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline', textDecorationColor: 'transparent', textUnderlineOffset: 3 }}
              hover={{ textDecorationColor: 'currentColor' }}>{b.nome}</Hov>
          )
          : <span style={{ ...NOME, color: colore }}>{b.nome}</span>}
        {suo && !b.progetto!.startsWith('nuovo-') && (
          <PrioritaProgetto alta={!!b.alto} visibile={attiva} nome={b.nome}
            cambia={alta => { v.cambiaProgetto(b.progetto!, { priorita: alta ? 'alta' : null }).catch(() => v.mostraToast(t('Non sono riuscito a salvarlo.'))) }} />
        )}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: attiva ? 1 : 0, pointerEvents: attiva ? 'auto' : 'none', transition: 'opacity .15s' }}>
          <Hov as="button" type="button" disabled={indice === 0} onClick={() => muovi(indice, indice - 1)}
            aria-label={`${t('Sposta su')}: ${b.nome}`}
            style={{ ...GESTO, opacity: indice === 0 ? .35 : 1, cursor: indice === 0 ? 'default' : 'pointer' }} hover={{ color: 'var(--rame-testo)' }}>{t('Sposta su')}</Hov>
          <Hov as="button" type="button" disabled={ultimo} onClick={() => muovi(indice, indice + 1)}
            aria-label={`${t('Sposta giù')}: ${b.nome}`}
            style={{ ...GESTO, opacity: ultimo ? .35 : 1, cursor: ultimo ? 'default' : 'pointer' }} hover={{ color: 'var(--rame-testo)' }}>{t('Sposta giù')}</Hov>
        </div>
      </div>
      {!b.righe.length && b.progetto && lista && <PrimoPasso progetto={b.progetto} lista={lista} ultimo={v.progettiNuovi[v.progettiNuovi.length - 1] === b.progetto} />}
      {b.righe.map((r, i) => {
        const chiave = r.genere === 'voce' ? r.voce.id : r.compito.id
        return (
          <div key={chiave} style={{ borderTop: i === 0 ? 'none' : `1px solid ${filo}` }}>
            {r.genere === 'voce' && <RigaVoce voce={r.voce} v={v} lista={lista} />}
            {r.genere === 'compito' && <RigaCompito c={r.compito} l={lista!} v={v} />}
            {r.genere === 'compito' && r.seguito && <Seguito c={r.seguito} />}
          </div>
        )
      })}
    </section>
  )
}

/**
 * Il primo passo di un progetto appena nato: una domanda, e la barra sotto.
 *
 * «Empty states teach by doing»: il blocco vuoto non spiega cos'è un
 * progetto, chiede la cosa che lo fa partire. La riga nasce nella lista con
 * il progetto già scritto, e compare qui nell'istante di Invio, al posto
 * della domanda. Il fuoco ci arriva da solo quando il progetto è appena
 * stato creato da qui.
 */
function PrimoPasso({ progetto, lista, ultimo }: { progetto: string; lista: Lista; ultimo: boolean }) {
  const [testo, setTesto] = useState('')
  // l'id provvisorio: il server non lo conosce ancora, e una riga scritta ora
  // finirebbe senza progetto. Dura il tempo di una risposta
  const provvisorio = progetto.startsWith('nuovo-')
  const manda = () => {
    const pulito = testo.trim()
    if (!pulito || provvisorio) return
    setTesto('')
    void lista.aggiungi(pulito, 'poi', null, null, { progetto })
  }
  const id = `primo-passo-${progetto}`
  return (
    <div style={{ padding: '8px 21px 16px' }}>
      <label htmlFor={id} style={{ ...PERCHE, display: 'block', marginTop: 0, marginBottom: 8, color: 'rgba(var(--inchiostro-rgb),.78)', fontSize: '13.5px' }}>
        {t('Qual è il primo passo?')}
      </label>
      <form onSubmit={e => { e.preventDefault(); manda() }} style={{ display: 'flex' }}>
        <Scatola>
          <input id={id} autoFocus={ultimo} value={testo} maxLength={300} onChange={e => setTesto(e.target.value)}
            placeholder={t('Manda il preventivo a Rossi')} style={CAMPO} />
          {!!testo.trim() && <button type="submit" disabled={provvisorio} style={{ ...PILLOLA, flex: 'none' }}>{t('Aggiungi')}</button>}
        </Scatola>
      </form>
    </div>
  )
}

/**
 * La riga dei progetti, sotto i blocchi: quelli che oggi non hanno niente sul
 * tavolo, e il gesto per farne uno nuovo.
 *
 * «Users can only create one project.» Si poteva averne quanti si voleva, ma
 * l'unico posto per farne uno era una scheda in fondo alla Memoria, dietro il
 * menù del conto; e un progetto senza righe non compariva da nessuna parte
 * della prima pagina. Qui c'è quello che serve e basta: i nomi dei progetti
 * attivi che non hanno un blocco, ognuno apre la sua pagina, e «Nuovo
 * progetto», che diventa la barra dove è scritto. Invio e il progetto c'è,
 * con il suo blocco e la domanda del primo passo: prima la presa, poi l'esito.
 */
function RigaProgetti({ v, blocchi }: { v: Vals; blocchi: BloccoPagina[] }) {
  const [scrivo, setScrivo] = useState(false)
  const [nome, setNome] = useState('')
  const conBlocco = new Set(blocchi.map(b => b.progetto).filter(Boolean))
  const altri = v.progetti.filter(p => p.stato === 'attivo' && !conBlocco.has(p.id))
  const crea = () => {
    const pulito = nome.trim()
    if (!pulito) return
    setNome(''); setScrivo(false)
    void v.nuovoProgetto(pulito)
  }
  if (scrivo) {
    return (
      <form onSubmit={e => { e.preventDefault(); crea() }} style={{ marginTop: 16, padding: '0 4px' }}>
        <label htmlFor="nuovo-progetto" style={{ ...NOME, display: 'block', marginBottom: 8, color: 'rgba(var(--inchiostro-rgb),.55)' }}>{t('Nuovo progetto')}</label>
        <div style={{ display: 'flex' }}>
          <Scatola>
            <input id="nuovo-progetto" autoFocus value={nome} maxLength={100} onChange={e => setNome(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); setNome(''); setScrivo(false) } }}
              onBlur={() => { if (!nome.trim()) setScrivo(false) }}
              placeholder={t('Il rilancio del sito')} style={CAMPO} />
            {!!nome.trim() && <button type="submit" style={{ ...PILLOLA, flex: 'none' }}>{t('Aggiungi')}</button>}
          </Scatola>
        </div>
      </form>
    )
  }
  const conProgetti = blocchi.some(b => b.progetto !== null)
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 14px', marginTop: 16, padding: '0 4px', minWidth: 0 }}>
      {!!altri.length && <span style={{ ...NOME, color: 'rgba(var(--inchiostro-rgb),.5)' }}>{conProgetti ? t('Altri progetti') : t('Progetti')}</span>}
      {altri.map(p => (
        <Hov key={p.id} as="button" type="button" onClick={() => v.apriProgetto(p.id)}
          style={{ ...GESTO, display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%', color: 'rgba(var(--inchiostro-rgb),.72)' }}
          hover={{ color: 'var(--inchiostro)' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', flex: 'none', background: v.coloreProgetto(p.id) }} />
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nome}</span>
          {p.priorita === 'alta' && <span style={{ color: 'var(--rame-testo)', fontSize: '11px' }}>{t('Priorità alta')}</span>}
        </Hov>
      ))}
      <Hov as="button" type="button" onClick={() => setScrivo(true)}
        style={{ ...GESTO, display: 'inline-flex', alignItems: 'center', gap: 6 }}
        hover={{ color: 'var(--rame-testo)' }}>
        <IconPiu size={12} />{t('Nuovo progetto')}
      </Hov>
    </div>
  )
}

export function Myynd({ v, lista, blocchi: dalGuscio }: { v: Vals; lista?: Lista; blocchi?: BloccoPagina[] }) {
  const compiti = lista?.compiti ?? []
  // i blocchi li fa il guscio (`App.tsx`), una volta, e li usa anche per il
  // numero nel menù: qui si ricalcolano solo se nessuno li ha passati
  const grezzi: BloccoPagina[] = dalGuscio ?? blocchiFeed({ voci: v.voci, compiti, progetti: v.progetti, nomeResto: t('Il resto'), fermi: lista?.appenaFinite, vuoti: v.progettiNuovi })
  // l'ordine è l'ultima cosa che si decide, ed è l'unica che decide lui: il
  // guscio mette insieme le righe, questa riga le mette in fila
  const ordinati = ordinaBlocchi(grezzi, v.ordineBlocchi)
  /*
   * E mentre la pagina è aperta, l'ordine che vede resta quello (`ordineStabile`):
   * spuntare una riga non fa scambiare i blocchi sotto il dito. Si comincia a
   * tenerlo solo a pagina carica — la lista e il feed arrivano in due tempi, e
   * tenere l'ordine della metà arrivata prima vorrebbe dire ignorare il peso
   * del feed — e lo si lascia andare quando cambia il suo ordine salvato: un
   * «Sposta su» vince sempre.
   */
  const pronta = v.feedCaricato && (!lista || lista.caricato)
  // anche segnare un progetto alto è un ordine suo: la pagina lo lascia salire subito
  const salvato = (v.ordineBlocchi ?? []).join('|') + '#' + v.progetti.filter(p => p.priorita === 'alta').map(p => p.id).join('|')
  const visto = useRef<{ chiavi: string[]; salvato: string } | null>(null)
  const tieni = pronta && visto.current !== null && visto.current.salvato === salvato
  const chiavi = tieni ? ordineStabile(ordinati.map(chiaveBlocco), visto.current!.chiavi) : ordinati.map(chiaveBlocco)
  useEffect(() => { if (pronta) visto.current = { chiavi, salvato } })
  const blocchi = chiavi.map(k => ordinati.find(b => chiaveBlocco(b) === k)!)
  const muovi = (da: number, a: number) => {
    if (da === a || a < 0 || a >= chiavi.length) return
    v.salvaOrdineBlocchi(ordineDopoIlTrascinamento(chiavi, da, a, v.ordineBlocchi))
  }
  // quello che c'è in pagina: ogni riga che si vede, e le domande nella loro
  // carta. Lo stesso conto del menù, per costruzione.
  const inPagina = sulTavolo(blocchi, (v.domanda ? 1 : 0) + v.iniziative.length)

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
            color: 'rgba(var(--inchiostro-rgb),.5)', textTransform: 'capitalize'
          }}>{v.oggi}</div>
        </div>
        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 7, flexWrap: 'wrap' }}>
          <Rassegna />
          <Hov as="a" href="#" onClick={v.goConn}
            style={{ flex: 'none', marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'rgba(var(--inchiostro-rgb),.78)', background: 'rgba(var(--luce-rgb),.7)', border: '1px solid rgba(var(--luce-rgb),.9)', borderRadius: 99, padding: '5px 11px' }}
            hover={{ background: 'var(--carta-alta)' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: v.connCount ? 'var(--salvia)' : 'var(--ambra)' }} />
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
              borderRadius: '50%', border: '1px solid rgba(var(--rame-rgb),.35)', background: 'rgba(var(--luce-rgb),.7)',
              color: 'var(--rame)', cursor: v.generando ? 'wait' : 'pointer', padding: 0,
              opacity: v.generando ? 0.55 : 1, animation: v.generando ? 'pulse 1.2s ease-in-out infinite' : undefined
            }}
            hover={{ background: 'var(--carta-alta)', borderColor: 'var(--rame)' }}>
            <IconOcchio size={15} />
          </Hov>
        </div>
      </div>

      <Avviso v={v} />

      {/* Myynd ha scritto: le domande per conoscerti aspettano in chat. Sta in
          cima a tutto, perché rispondergli viene prima del resto. */}
      {v.chatDaLeggere && (
        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', borderRadius: 20, background: 'var(--carta-scura)', color: 'var(--avorio)', padding: '18px 22px', marginBottom: 14, boxShadow: '0 22px 52px rgba(var(--ombra-rgb),.18)' }}>
          <span style={{ width: 8, height: 8, flex: 'none', borderRadius: '50%', background: 'var(--avorio)' }} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 15, fontWeight: 500 }}>{t('Myynd ti ha scritto.')}</div>
            <div style={{ fontSize: '13px', lineHeight: 1.5, color: 'rgba(var(--avorio-rgb),.78)', marginTop: 3, textWrap: 'pretty' }}>{t('Ha qualche domanda per conoscerti: due minuti.')}</div>
          </div>
          <button onClick={v.goChat} style={{ ...PIENO_SCURO, display: 'inline-flex', alignItems: 'center', gap: 8 }}>{t('Rispondi')} <IconAvanti /></button>
        </div>
      )}

      {/* Il primo progetto, dalla prima pagina e non da una carta in fondo alle
          preferenze: finché non c'è, è la cosa che manca, e si dice qui. */}
      {v.senzaProgetto && (
        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', borderRadius: 20, background: 'rgba(var(--carta-rgb),.66)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(var(--luce-rgb),.75)', padding: '18px 22px', marginBottom: 14 }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 15, fontWeight: 500 }}>{t('Nessun progetto ancora.')}</div>
            <div style={{ fontSize: '13px', lineHeight: 1.5, color: 'rgba(var(--inchiostro-rgb),.65)', marginTop: 3, textWrap: 'pretty' }}>{t('Un progetto e un obiettivo: da lì scelgo cosa conta.')}</div>
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

      {/*
        I blocchi non sono inclinati, e le altre carte sì. Non è una dimenticanza.

        Un quinto di grado su una card che si vede tutta insieme è la mano
        che l'ha posata storta: si legge come carattere. Ma questi sono la
        pagina intera — duemila pixel, spesso tremila — e di una cosa così
        alta non si vede mai la forma, si vede solo il bordo che passa.
        Inclinato, quel bordo non è più verticale, e mentre si scorre sembra
        che si muova la finestra.
      */}
      {blocchi.map((b, i) => (
        <Blocco key={chiaveBlocco(b)} b={b} v={v} lista={lista}
          indice={i} ultimo={i === blocchi.length - 1} muovi={muovi} />
      ))}

      {/* i progetti che oggi non hanno un blocco, e «Nuovo progetto»: finché
          non ce n'è nessuno lo dice la carta qui sopra, con il primo avvio */}
      {v.feedCaricato && !v.senzaProgetto && <RigaProgetti v={v} blocchi={blocchi} />}

      {/* le sue domande, tutte in una carta, sotto il lavoro: «la carta dove
          mi fa domande deve stare sotto le priorità», e «if it's multiple
          questions, don't stack them one over the other» */}
      <CartaDomande v={v} />

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
      padding: '10px 16px', borderRadius: 14, background: 'rgba(var(--rame-rgb),.10)', border: '1px solid rgba(var(--rame-rgb),.28)',
      color: 'var(--rame-testo)', fontSize: 13, lineHeight: 1.5
    }}>
      <span style={{ width: 6, height: 6, flex: 'none', borderRadius: '50%', background: 'var(--rame)' }} />
      <span style={{ flex: '1 1 220px', minWidth: 0, textWrap: 'pretty', overflowWrap: 'anywhere' }}>{frase}</span>
      <Hov as="a" href="#" onClick={v.goConn}
        style={{ flex: 'none', color: 'var(--rame-testo)', fontWeight: 500, textDecoration: 'underline', textUnderlineOffset: 3, whiteSpace: 'nowrap' }}
        hover={{ color: 'var(--inchiostro)' }}>{t('Vai alle Fonti')}</Hov>
    </div>
  )
}

/**
 * Le sue domande, tutte in una carta.
 *
 * «If it is a question, it should look like the UI of the question that you
 * can answer on the feed. We already designed this. If it's multiple
 * questions, don't stack them one over the other. Just ask them in one
 * unique card, not four different ones.» Prima erano tre cose diverse: una
 * fascia in cima per la domanda sua (il riferimento, uno scarto ripetuto),
 * una riga in fondo a ogni blocco con «Parliamone» per la domanda sul
 * progetto, e con otto progetti la pagina finiva con otto carte che erano
 * solo domande, una sotto l'altra.
 *
 * Qui stanno tutte insieme, sotto il lavoro (17 settembre: «la carta dove mi
 * fa domande deve stare sotto le priorità»), e si risponde sul posto, come
 * sotto una riga che chiede: ogni domanda la sua riga e la sua scatola, un
 * «Manda» solo per tutte, Invio che manda. Quello che fa una risposta lo
 * dice l'esito che prende il posto della domanda: «In lista per H-Farm: …»,
 * «Da adesso i rinnovi non te li porto più». Una domanda sul progetto ha
 * ancora «Parliamone» per chi preferisce la chat, sotto il dito.
 *
 * Il gesto si vede subito: mandando, le domande risposte lasciano il posto a
 * «Presa.», e la riga si riscrive quando arriva l'esito vero. Se il server
 * non ce la fa, la domanda torna con dentro le sue parole.
 */
type Domanda = {
  id: string; testo: string; genere: 'sua' | 'progetto'
  progetto?: string | null; nomeProgetto?: string
  /** Il riferimento si scrive su più righe: la scatola è alta. */
  lunga: boolean
  spunto: string[]
  originale?: Vals['iniziative'][number]
}

function CartaDomande({ v }: { v: Vals }) {
  const domande: Domanda[] = [
    ...(v.domanda ? [{ id: v.domanda.id, testo: v.domanda.testo, genere: 'sua' as const, lunga: v.domanda.tema === 'riferimento', spunto: v.domanda.spunto }] : []),
    ...v.iniziative.map(i => ({
      id: i.id, testo: i.question ?? i.title, genere: 'progetto' as const,
      progetto: i.projectId, nomeProgetto: i.projectName, lunga: false, spunto: [] as string[], originale: i
    }))
  ]
  const [risposte, setRisposte] = useState<Record<string, string>>({})
  const [esiti, setEsiti] = useState<{ id: string; testo: string; presa: boolean }[]>([])
  const [mandando, setMandando] = useState(false)
  const carta = useRef<HTMLElement | null>(null)

  // «Leggi adesso» non ha trovato niente di nuovo ma i progetti aspettano: la
  // pagina porta la carta sotto gli occhi e la accende per un attimo
  const [accesa, setAccesa] = useState(false)
  useEffect(() => {
    if (!v.evidenziaProgetti || !domande.length) return
    carta.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setAccesa(true)
    const via = setTimeout(() => setAccesa(false), 1600)
    return () => clearTimeout(via)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.evidenziaProgetti])

  if (!domande.length && !esiti.length) return null

  const piene = domande.filter(q => (risposte[q.id] ?? '').trim())
  const scrivi = (id: string, testo: string) => setRisposte(r => ({ ...r, [id]: testo }))

  const manda = async () => {
    if (!piene.length || mandando) return
    setMandando(true)
    // la presa subito, per ogni domanda risposta; l'esito vero si riscrive sopra
    setEsiti(e => [...e.filter(x => !piene.some(q => q.id === x.id)), ...piene.map(q => ({ id: q.id, testo: t('Presa.'), presa: true }))])
    await Promise.all(piene.map(async q => {
      const testo = (risposte[q.id] ?? '').trim()
      try {
        const esito = q.genere === 'sua' ? await v.rispondiADomanda(q.id, testo) : await v.rispondiIniziativa(q.id, testo)
        setEsiti(e => e.map(x => (x.id === q.id ? { id: q.id, testo: esito, presa: false } : x)))
        setRisposte(r => { const { [q.id]: _via, ...resto } = r; return resto })
      } catch {
        // la domanda è tornata (ci pensa `vals`) e le sue parole sono ancora nel campo
        setEsiti(e => e.filter(x => x.id !== q.id))
      }
    }))
    setMandando(false)
  }

  const lascia = (q: Domanda) => {
    setRisposte(r => { const { [q.id]: _via, ...resto } = r; return resto })
    if (q.genere === 'sua') void v.lasciaCadere()
    else void v.scartaIniziativa(q.id)
  }

  return (
    <section ref={carta} aria-label={t('Myynd ti chiede')} style={{
      flex: 'none', marginTop: 14, borderRadius: 20, overflow: 'visible',
      background: 'rgba(var(--carta-rgb),.66)', backdropFilter: 'blur(24px) saturate(1.4)', WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
      border: '1px solid rgba(var(--luce-rgb),.7)',
      boxShadow: accesa ? 'inset 0 0 0 2px var(--rame), 0 22px 52px rgba(var(--ombra-rgb),.09)' : '0 22px 52px rgba(var(--ombra-rgb),.09)',
      transition: 'box-shadow .3s', animation: 'fadein .3s ease'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '13px 21px 3px' }}>
        <Marchio dim={14} animato={false} />
        <span style={{ ...NOME, color: 'rgba(var(--inchiostro-rgb),.55)' }}>{t('Myynd ti chiede')}</span>
      </div>

      {/* quello che le risposte hanno fatto: resta scritto, e si chiude con una × */}
      {esiti.map(e => (
        <div key={e.id} role="status" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 21px 4px' }}>
          <IconSpunta size={13} style={{ flex: 'none', marginTop: 3, color: e.presa ? 'rgba(var(--inchiostro-rgb),.4)' : 'var(--salvia)' }} />
          <div style={{ flex: 1, minWidth: 0, fontSize: '13.5px', lineHeight: 1.5, color: e.presa ? 'rgba(var(--inchiostro-rgb),.55)' : 'var(--inchiostro)', textWrap: 'pretty', overflowWrap: 'anywhere' }}>{t(e.testo)}</div>
          {!e.presa && (
            <Hov as="button" type="button" onClick={() => setEsiti(x => x.filter(y => y.id !== e.id))} title={t('Chiudi')} aria-label={t('Chiudi')}
              style={{ flex: 'none', border: 'none', background: 'none', color: 'rgba(var(--inchiostro-rgb),.4)', fontSize: 17, lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit', padding: 2 }}
              hover={{ color: 'var(--inchiostro)' }}>×</Hov>
          )}
        </div>
      ))}

      {domande.map((q, i) => (
        <RigaDomanda key={q.id} q={q} v={v} prima={i === 0 && !esiti.length}
          testo={risposte[q.id] ?? ''} scrivi={testo => scrivi(q.id, testo)} manda={() => { void manda() }} lascia={() => lascia(q)} />
      ))}

      {domande.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '4px 21px 14px' }}>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={() => { void manda() }} disabled={!piene.length || mandando}
            style={piene.length && !mandando ? MANDA : MANDA_SPENTO}>{t('Manda')}</button>
        </div>
      )}
    </section>
  )
}

/**
 * Una domanda nella carta: il progetto, la domanda, la scatola per rispondere.
 *
 * Sotto il dito compaiono i gesti di contorno: «Parliamone» sulla domanda di
 * un progetto (la chat resta una strada), «Perché me lo chiedi?» dove c'è
 * uno spunto, e «Non mi interessa» che la toglie di mezzo.
 */
function RigaDomanda({ q, v, prima, testo, scrivi, manda, lascia }: {
  q: Domanda; v: Vals; prima: boolean
  testo: string; scrivi: (testo: string) => void; manda: () => void; lascia: () => void
}) {
  const { attiva, props } = useAttiva()
  const [spunto, setSpunto] = useState(false)
  const colore = q.progetto ? v.coloreProgetto(q.progetto) : null
  const tasti = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Enter' && (!q.lunga || e.metaKey || e.ctrlKey)) { e.preventDefault(); manda() }
    if (e.key === 'Escape') (e.currentTarget as HTMLElement).blur()
  }
  return (
    <div {...props} style={{ ...RIGA, padding: '12px 21px 10px', borderTop: prima ? 'none' : '1px solid rgba(var(--inchiostro-rgb),.09)', background: attiva ? 'var(--riga-sopra)' : 'transparent' }}>
      {q.nomeProgetto && colore && (
        <div style={{ ...NOME, color: colore, fontSize: '11px', marginBottom: 4 }}>{q.nomeProgetto}</div>
      )}
      <div style={{ ...TITOLO, fontWeight: 400, fontSize: '14.5px', maxWidth: 640 }}>{q.testo}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, maxWidth: 640, alignItems: 'center' }}>
        <Scatola alto={q.lunga}>
          {q.lunga ? (
            <textarea value={testo} onChange={e => scrivi(e.target.value)} onKeyDown={tasti} rows={4}
              aria-label={t('Rispondi qui')} placeholder={t('Una riga per progetto: su cosa sei, cosa è morto, cosa è bloccato. Cmd+Invio per mandare.')}
              style={{ ...CAMPO, lineHeight: 1.5, resize: 'vertical' }} />
          ) : (
            <input value={testo} onChange={e => scrivi(e.target.value)} onKeyDown={tasti}
              aria-label={t('Rispondi qui')} placeholder={t('Rispondi qui')} style={CAMPO} />
          )}
        </Scatola>
      </div>
      <Fascia attiva={attiva}
        sinistra={spunto && q.spunto.length > 0 && (
          <span style={{ flexBasis: '100%', color: 'rgba(var(--inchiostro-rgb),.6)', lineHeight: 1.6 }}>
            {t('Hai tolto di mezzo queste senza dirmi perché:')} {q.spunto.slice(0, 4).map(x => `«${x}»`).join(', ')}
          </span>
        )}
        destra={
          <>
            {q.originale && (
              <Hov as="button" type="button" onClick={fermo(() => v.discutiIniziativa(q.originale!))} style={GESTO} hover={{ color: 'var(--rame-testo)' }}>{t('Parliamone')}</Hov>
            )}
            {q.spunto.length > 0 && (
              <Hov as="button" type="button" onClick={fermo(() => setSpunto(x => !x))} aria-expanded={spunto} style={GESTO} hover={{ color: 'var(--rame-testo)' }}>{t('Perché me lo chiedi?')}</Hov>
            )}
            <Hov as="button" type="button" onClick={fermo(lascia)} title={t('Lascia perdere: non te lo richiedo')} style={GESTO} hover={{ color: 'var(--rame-testo)' }}>{t('Non mi interessa')}</Hov>
          </>
        } />
    </div>
  )
}

/**
 * Quando non c'è niente: un bottone piccolo, e basta.
 *
 * Le sue parole: «rather than having some messed-up tasks that are complex
 * to read or that do not mean anything, have it empty, without the "Read
 * Now" button and that stupid card that appears when the feed is empty.
 * Rather, a small, minimal, non-clustered "Add Task" button that brings me
 * directly to the to-do where I can add a task.» Quindi niente carta, niente
 * «Leggi adesso», niente righe inventate per riempire il tavolo: una
 * pastiglia che porta alla lista, dove la barra aspetta già con il cursore.
 *
 * Restano, in una riga sola e senza carta, le mancanze vere: nessuna fonte,
 * niente letto, niente modello, nessun progetto, un feed che non si legge.
 * Sono le uniche cose che non si risolvono aggiungendo una riga.
 */
function Vuoto({ v }: { v: Vals }) {
  if (!v.feedCaricato || v.guastoLettura) return null
  const senzaFonti = v.connCount === 0
  const senzaDocumenti = v.totaleDocumenti === 0
  const conProgetti = v.progetti.some(p => !p.stato || p.stato === 'attivo')
  const riga: CSSProperties = { display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '4px 14px', marginTop: 10, padding: '0 4px', fontSize: '13.5px', lineHeight: 1.5, color: 'rgba(var(--inchiostro-rgb),.6)' }
  const link: CSSProperties = { ...LINK, fontSize: '13.5px' }
  if (v.guastoFeed) {
    return (
      <div role="status" style={riga}>
        <span style={{ color: 'var(--rame-testo)', overflowWrap: 'anywhere' }}>{v.guastoFeed}</span>
        <Hov as="button" type="button" onClick={v.ricaricaFeed} style={link} hover={{ textDecorationColor: 'currentColor' }}>{t('Riprova')}</Hov>
      </div>
    )
  }
  const manca = senzaFonti ? { frase: t('Non hai collegato niente.'), gesto: t('Vai alle Fonti'), vai: v.goConn }
    : senzaDocumenti ? { frase: t('Non ho ancora letto niente.'), gesto: null, vai: null }
    : !v.claudeOn ? { frase: t('Serve Claude per scegliere cosa conta.'), gesto: t('Vai alle Fonti'), vai: v.goConn }
    : !conProgetti ? { frase: t('Nessun progetto attivo.'), gesto: t('Apri la memoria'), vai: v.goMemoria }
    : null
  return (
    <div style={{ padding: '0 4px' }}>
      {manca && (
        <div role="status" style={riga}>
          <span>{manca.frase}</span>
          {manca.gesto && manca.vai && (
            <Hov as="a" href="#" onClick={manca.vai} style={link} hover={{ textDecorationColor: 'currentColor' }}>{manca.gesto}</Hov>
          )}
        </div>
      )}
      <Hov as="button" type="button"
        onClick={() => {
          v.goOggi()
          // «brings me directly to the to-do where I can add a task»: il cursore
          // è già nella barra quando arriva. La barra si mette a fuoco da sé
          // nascendo; questo è per il caso in cui è già nata
          requestAnimationFrame(() => document.getElementById('task-composer')?.focus())
        }}
        style={{ ...PILLOLA, display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 14, padding: '7px 14px 7px 11px', fontSize: '12.5px' }}
        hover={PILLOLA_SOPRA}>
        <IconPiu size={12} />{t('Aggiungi una cosa da fare')}
      </Hov>
    </div>
  )
}

const BOTTONE: React.CSSProperties = {
  padding: '11px 20px', borderRadius: 99, border: 'none',
  background: 'linear-gradient(120deg,var(--rame-profondo),var(--ambra))', color: 'var(--avorio)',
  fontSize: '13.5px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit'
}
