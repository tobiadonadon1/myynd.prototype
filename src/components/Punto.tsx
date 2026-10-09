// La ricevuta: la carta di quando torni, e il foglio che ci sta dietro.
//
// Dal 9 ottobre 2026 la carta in cima non è più «Il punto di oggi»: è la
// ricevuta, cosa è stato fatto e cosa aspetta lui (`server/mattina.ts`), e il
// foglio comincia da lì. Sotto, le novità dei progetti che il punto aveva già.
// Quello che segue racconta il foglio del punto, che è rimasto.
//
// Sono due cose, e vanno tenute distinte. In prima pagina c'è una carta come
// le altre — titolo, una riga sotto, un bottone: «Il punto di oggi. 5 cose.
// Dieci secondi.» Non è un rigo di servizio scritto piccolo, perché la
// domanda con cui si torna nell'app merita il peso delle altre carte.
//
// Aprendola si apre un *documento*: un foglio color avorio, largo seicento
// quaranta, con i margini di una pagina e una riga per cosa. Le sezioni del
// punto sono le domande che ha scelto lui: i progetti, GitHub, chi ha
// risposto, gli aggiornamenti pratici. Le notizie no: stanno nella pastiglia
// «News» in testa alla pagina, e dirle due volte era rumore. Ogni riga apre il documento da cui viene — la
// mail, la pagina del repository, il file — e le righe che non hanno niente
// dietro sono testo e basta.
//
// Quello che qui non c'è più sono le cose da fare. Stavano sotto «adesso» con
// una freccia che apriva una riga nuova della lista, e la sua frase è stata
// questa: «quello lo devi mettere nel mio feed, non lì». Adesso il server le
// mette in lista mentre scrive il punto, e nel feed la freccia apre la mail a
// cui deve rispondere.
//
// Sotto il titolo ci stanno la data e il conto delle righe, e basta. Per un
// po' c'è stato anche da quanto mancava — «sei stato via tredici ore» — e la
// sua risposta è stata secca: «I don't care to know, and I don't want him to
// tell me». Quanto è stato via lo sa il server, perché è con quello che
// decide da dove ripartire a guardare; non è una cosa da dire a lui.

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { frasi, loc, t, tradotta } from '../lingua'
import { Hov, LABEL, useFocoDialogo } from '../ui'
import { IconAvanti, IconCroce } from '../icons'
import { IeriGemello } from './IeriGemello'
import type { Vals } from '../vals'
import { usePunto } from '../usePunto'
import { righeDelPunto } from '../collegamenti'
import type { AspettaMattina, Compito, Mattina, Punto as PuntoDelGiorno, RigaPunto } from '../api'
import type { Lista } from '../oggi/useCompiti'
import { RIGHE_IN_CARTA } from '../mattina'
import { laNotte, ora, rigaDellaNotte, RigheAspettano, RigheFatte } from './Stanotte'

/**
 * La lista delle righe e come si apre una carta: le righe della ricevuta
 * aprono la loro carta, e la riga della notte (F9) legge il turno da qui.
 */
export type NotteDelPunto = { l: Lista; apri: (c: Compito) => void }

/** Il guaio del server, se lo sappiamo dire; se no una frase sola, invece di un errore grezzo in un'altra lingua. */
function spiegaGuaio(g: string): string {
  return tradotta(g) ? t(g) : t('Il punto non è arrivato: il fornitore non ha risposto.')
}

export const VELO: CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 90, display: 'grid', placeItems: 'center',
  background: 'rgba(var(--inchiostro-rgb),.28)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
  padding: 20, animation: 'fadein .16s ease'
}

/** Il foglio: un documento da leggere, con i margini di una pagina. */
export const FOGLIO: CSSProperties = {
  position: 'relative', width: 'min(640px, 100%)', maxHeight: 'min(86vh, 820px)',
  overflowY: 'auto', overflowX: 'hidden', minWidth: 0,
  padding: 'clamp(28px, 5vw, 40px) clamp(28px, 6vw, 44px)', borderRadius: 20,
  background: 'var(--carta-piena)', border: '1px solid rgba(var(--luce-rgb),.9)',
  boxShadow: '0 30px 80px rgba(var(--ombra-rgb),.28)', color: 'var(--inchiostro)',
  fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif"
}

/** L'etichetta di una sezione: la stessa di sempre, con più aria intorno. */
export const ETICHETTA: CSSProperties = { ...LABEL, fontSize: 11, letterSpacing: '.12em' }

/** Una riga: quindici pixel, respiro, e nient'altro addosso. */
export const LINEA: CSSProperties = {
  display: 'flex', alignItems: 'baseline', gap: 12, minWidth: 0,
  fontSize: 15, lineHeight: 1.55, color: 'var(--inchiostro)'
}

export const TESTO: CSSProperties = { flex: 1, minWidth: 0, overflowWrap: 'anywhere', textWrap: 'pretty' }

/** Quello che sta accanto alla frase e non è la frase: il perché, il dove sei. */
export const SPENTO: CSSProperties = { color: 'rgba(var(--inchiostro-rgb),.55)' }

/**
 * La riga intera è il bersaglio.
 *
 * Aveva una pastiglia «Apri» a destra, e ogni riga ne portava una: quattro
 * bottoni in colonna che dicevano tutti la stessa parola. Il verbo era già
 * nella frase; qui si clicca la frase, e in fondo resta una freccia piccola
 * che dice che si può.
 */
export const APRIBILE: CSSProperties = {
  ...LINEA, width: '100%', textAlign: 'left', padding: 0, margin: 0,
  border: 'none', background: 'none', fontFamily: 'inherit', cursor: 'pointer'
}

/** Il rame al passaggio: l'unico accento, e solo dove si può cliccare. */
export const RAME: CSSProperties = { color: 'var(--rame)', textDecoration: 'underline', textUnderlineOffset: 3 }

/** La carta in prima pagina: come le altre, non un rigo di servizio. */
export const CARTA: CSSProperties = {
  flex: 'none', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', minWidth: 0,
  borderRadius: 20, background: 'rgba(var(--carta-rgb),.66)',
  backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
  border: '1px solid rgba(var(--luce-rgb),.75)', padding: '18px 22px', marginBottom: 14
}

/** Un bottone solo per carta, ed è questo. */
const BOTTONE: CSSProperties = {
  flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '11px 20px', borderRadius: 99, border: 'none',
  background: 'var(--gradiente-rame)', color: 'var(--avorio)',
  fontSize: '13.5px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit'
}

/** La riga sotto il titolo della carta: quello che il titolo non dice. */
export const SOTTO: CSSProperties = {
  fontSize: 13, lineHeight: 1.5, color: 'rgba(var(--inchiostro-rgb),.65)', marginTop: 3,
  textWrap: 'pretty', overflowWrap: 'anywhere'
}
/** Perché non è arrivato: si legge se lo si cerca, e non toglie il posto al resto. */
const SPIEGA: CSSProperties = { ...SOTTO, color: 'rgba(var(--inchiostro-rgb),.5)' }

/** «5 cose» comincia una frase: la maiuscola la mette la pagina, non il dizionario. */
const maiuscola = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1)

export function Sezione({ etichetta, children }: { etichetta: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 26, minWidth: 0 }}>
      <div style={ETICHETTA}>{etichetta}</div>
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </div>
  )
}

/**
 * Una riga del punto.
 *
 * Se dietro c'è un documento la riga si apre, e in fondo compare la freccia
 * piccola che dice che si può; se non c'è, è solo testo. Non c'è un verbo da
 * scegliere: il verbo è quello che c'è dietro alla frase. `nome` è il progetto,
 * l'unica cosa che si scrive più forte del resto.
 */
function Voce({ nome, testo, doc, apriDoc }: {
  nome?: string; testo: string; doc: string | null; apriDoc: (id: string) => void
}) {
  const dentro = (
    <span style={TESTO}>
      {nome ? <span style={{ fontWeight: 500 }}>{nome} </span> : null}
      {nome ? <span style={SPENTO}>{testo}</span> : testo}
    </span>
  )
  if (!doc) return <div style={LINEA}>{dentro}</div>
  return (
    <Hov as="button" type="button" style={APRIBILE} hover={RAME} onClick={() => apriDoc(doc)}>
      {dentro}
      <IconAvanti size={12} style={{ flex: 'none', opacity: .5 }} />
    </Hov>
  )
}

/**
 * Il titolo della ricevuta: dice quello che c'è, mai di più.
 *
 * «Fatto mentre dormivi» sopra una ricevuta senza niente di fatto prometteva
 * un lavoro che non c'era, e «Da quando sei uscito» al primo avvio parlava di
 * un'uscita mai avvenuta. Senza niente di fatto il titolo è il giorno.
 */
export const titoloRicevuta = (m: Mattina | null) => !m?.done.length ? t('Oggi.')
  : m.mattina ? t('Fatto mentre dormivi.') : t('Da quando sei uscito.')

/**
 * Le domande stanno nella loro carta, sotto i blocchi: una riga della
 * ricevuta che ne nomina una porta lì, e mette il cursore nella prima
 * scatola. Rispondere si fa dove si risponde.
 */
function vaiAlleDomande() {
  const carta = document.querySelector<HTMLElement>('[data-carta-domande]')
  if (!carta) return
  carta.scrollIntoView({ behavior: 'smooth', block: 'center' })
  carta.querySelector<HTMLElement>('textarea, input')?.focus({ preventScroll: true })
}

/**
 * Il foglio: la ricevuta per intero, poi il punto.
 *
 * Prima quello che è stato fatto, poi quello che aspetta lui, poi la riga
 * della settimana; sotto, le novità dei progetti che il punto aveva già. Il
 * punto può mancare: il foglio resta, con la sola ricevuta.
 */
function Finestra({ v, punto, guaio, chiudi, m, ricevuta, notte }: {
  v: Vals; punto: PuntoDelGiorno | null; guaio: string | null; chiudi: () => void
  m: Mattina | null; ricevuta: AspettaMattina[]; notte?: NotteDelPunto
}) {
  const finestra = useRef<HTMLDivElement>(null)
  useFocoDialogo(finestra, chiudi)

  /*
   * Una riga si apre su quello che la dice.
   *
   * È l'unico gesto rimasto nella finestra, ed è sempre lo stesso: la mail che
   * ha ricevuto, la pagina del repository, il file arrivato, la carta. Il
   * documento si apre alla fonte originale; la copia salvata è un ripiego
   * dichiarato. Aprire una carta chiude il foglio: la carta si apre in pagina.
   */
  const apriDoc = (id: string) => { chiudi(); void v.portamiFonte(id) }
  const apriCarta = (c: Compito) => { chiudi(); notte?.apri(c) }
  const righe = (xs: RigaPunto[]) => xs.map((r, i) =>
    <Voce key={i} testo={r.testo} doc={r.doc} apriDoc={apriDoc} />)

  const fatte = m?.done ?? []
  const settimana = m && m.week.mandate > 0 ? frasi.bozzePartite(m.week.mandate, m.week.comeEra, m.week.ritoccate) : null
  // F9 · la mattina, la riga della notte: quanto è costata, cosa l'ha fermata, quando il Mac dormiva
  const n = m?.mattina && notte ? laNotte(notte.l) : null
  const data = new Date(punto?.quando ?? Date.now()).toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long' })
  /*
   * La data e il conto. Quanto sei stato via, no.
   *
   * «Remove the time that I was away for. I don't care to know, and I don't
   * want him to tell me.» Quello che è successo lo dicono le righe. E il
   * conto nemmeno: contava fatte, attese e novità insieme, e diceva un numero
   * diverso dal titolo della pagina sotto.
   */
  const sotto = data

  return (
    <div style={VELO} onMouseDown={e => { if (e.target === e.currentTarget) chiudi() }}>
      <div ref={finestra} role="dialog" aria-modal="true" aria-labelledby="punto-titolo" tabIndex={-1} style={FOGLIO}>
        <Hov as="button" type="button" onClick={chiudi} title={t('Chiudi')} aria-label={t('Chiudi')}
          style={{
            position: 'absolute', top: 14, right: 14, width: 28, height: 28, borderRadius: 99,
            border: 'none', background: 'none', cursor: 'pointer', color: 'rgba(var(--inchiostro-rgb),.4)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
          }}
          hover={{ color: 'var(--inchiostro)' }}>
          <IconCroce size={11} />
        </Hov>

        {/* il titolo del foglio è quello della ricevuta, in grazie come ogni h1; sotto, la data e il conto */}
        <h1 id="punto-titolo" style={{ margin: 0, fontSize: 28, lineHeight: 1.2, paddingRight: 34, textWrap: 'pretty', overflowWrap: 'anywhere' }}>
          {titoloRicevuta(m)}
        </h1>
        <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5, color: 'rgba(var(--inchiostro-rgb),.5)', overflowWrap: 'anywhere' }}>
          {sotto}
        </div>
        {/* P10 · se l'ultimo punto non è arrivato, si dice perché, in una riga */}
        {guaio && <div style={SPIEGA}>{spiegaGuaio(guaio)}</div>}

        {(fatte.length > 0 || n) && (
          <Sezione etichetta={t('Fatto')}>
            {/* sotto «Fatto» la notte conta le fatte: quelle che aspettano lui hanno la loro sezione, col loro numero */}
            {n && notte && <p className="stanotte-conto">{rigaDellaNotte(notte.l.turno, { ...n, attende: [] })}</p>}
            {fatte.length > 0 && <RigheFatte xs={fatte} l={notte?.l} apri={apriCarta} disfa />}
          </Sezione>
        )}
        {ricevuta.length > 0 && (
          <Sezione etichetta={t('Aspetta te')}>
            <RigheAspettano xs={ricevuta} l={notte?.l} apri={apriCarta}
              apriChat={() => { chiudi(); v.goChat() }} apriDomande={() => { chiudi(); vaiAlleDomande() }} />
          </Sezione>
        )}
        {settimana && (
          <Sezione etichetta={t('Questa settimana')}>
            <div style={LINEA}><span style={TESTO}>{settimana}</span></div>
          </Sezione>
        )}

        {fatte.length + ricevuta.length + (punto ? righeDelPunto(punto) : 0) === 0 && !n && (
          <div style={{ ...LINEA, marginTop: 26 }}>
            <span style={TESTO}>{prossimaCosa(m) ?? t('Niente di nuovo da quando ci siamo visti.')}</span>
          </div>
        )}

        {punto && punto.progetti.length > 0 && (
          <Sezione etichetta={t('Progetti')}>
            {punto.progetti.map(pr => (
              <Voce key={pr.id || pr.nome} nome={pr.nome} testo={pr.novita} doc={pr.doc} apriDoc={apriDoc} />
            ))}
          </Sezione>
        )}
        {punto && punto.github.length > 0 && (
          <Sezione etichetta={t('GitHub')}>{righe(punto.github)}</Sezione>
        )}
        {/* le notizie no: stanno nella pastiglia «News» in testa alla pagina, e basta */}
        {punto && punto.risposte.length > 0 && (
          <Sezione etichetta={t('Risposte')}>{righe(punto.risposte)}</Sezione>
        )}
        {punto && !!punto.aggiornamenti?.length && (
          <Sezione etichetta={t('Aggiornamenti')}>{righe(punto.aggiornamenti)}</Sezione>
        )}

        {/* In fondo non c'è niente: un foglio da leggere si chiude dove si
            chiudono i fogli, e finisce con l'ultima riga. */}
        <IeriGemello chiudi={chiudi} apriMemoria={() => v.goMemoria()} />
      </div>
    </div>
  )
}

/**
 * La prossima cosa che farà, per una ricevuta senza niente da dire: la notte,
 * con le carte in coda o senza, o la coda adesso. Mai un allarme, mai «niente
 * da segnalare»: se non c'è una prossima cosa, null.
 */
export function prossimaCosa(m: Mattina | null): string | null {
  const p = m?.prossima
  if (!p) return null
  if (p.genere === 'coda') return frasi.carteInCoda(p.carte)
  return frasi.prossimaNotte(ora(p.quando), p.carte)
}

/**
 * La ricevuta in cima alla prima pagina.
 *
 * Sostituisce tre carte: «Il punto di oggi», «Mentre dormivi» (che stava nel
 * foglio del punto) e la fascia «Myynd ti ha scritto». Un titolo che dice da
 * quando, «Fatto mentre dormivi.» la mattina e «Da quando sei uscito.» il
 * resto del giorno, poi le prime tre cose fatte e le prime tre che aspettano
 * lui, e un bottone solo che apre il foglio intero. Senza niente da dire, una
 * riga sola con la prossima cosa che farà.
 *
 * Non dice mai che il punto di ieri è scaduto (9 ottobre 2026: «Why would you
 * tell me "just produce another one for today"?»): il punto di oggi si scrive
 * da solo quando torna, e se non c'è il foglio ha la sola ricevuta. Il
 * foglio si apre da solo una volta al giorno, come prima (`usePunto`).
 */
export function Punto({ v, mattina: m, ricevuta, notte }: {
  v: Vals; mattina: Mattina | null; ricevuta: AspettaMattina[]; notte?: NotteDelPunto
}) {
  const p = usePunto(v.claudeOn)
  const [aperto, setAperto] = useState(false)
  const chiudi = () => { setAperto(false); if (p.daVedere) p.nascondi() }
  const fatte = m?.done ?? []
  const nelPunto = p.punto ? righeDelPunto(p.punto) : 0
  /*
   * Da solo si apre quando la ricevuta è arrivata (prima il titolo cambiava
   * sotto gli occhi), e solo se il foglio dice più della carta: il punto, o
   * righe oltre le prime. Il primo giorno si apriva sfocando la pagina per
   * ripetere la sola riga che la carta, lì sotto, diceva già.
   */
  const piuDellaCarta = nelPunto > 0 || fatte.length > RIGHE_IN_CARTA || ricevuta.length > RIGHE_IN_CARTA
  // saltata l'apertura di oggi, resta saltata: non deve aprirsi a metà pomeriggio quando arriva una riga in più
  const saltaOggi = p.daVedere && !aperto && !!m && !piuDellaCarta
  const nascondi = p.nascondi
  useEffect(() => { if (saltaOggi) nascondi() }, [saltaOggi, nascondi])
  if (aperto || (p.daVedere && m && piuDellaCarta)) {
    return <Finestra v={v} punto={p.punto} guaio={p.guaio} chiudi={chiudi} m={m} ricevuta={ricevuta} notte={notte} />
  }
  const qualcosa = fatte.length > 0 || ricevuta.length > 0
  const settimana = m && m.week.mandate > 0 ? frasi.bozzePartite(m.week.mandate, m.week.comeEra, m.week.ritoccate) : null
  const prossima = prossimaCosa(m)
  // niente fatto, niente che aspetta, niente nel punto e niente in programma: nessuna cornice vuota
  if (!qualcosa && !nelPunto && !settimana && !prossima) return null
  const daAprire = qualcosa || nelPunto > 0 || !!settimana
  const apriCarta = (c: Compito) => notte?.apri(c)
  const oltre = Math.max(0, fatte.length - RIGHE_IN_CARTA) + Math.max(0, ricevuta.length - RIGHE_IN_CARTA)
  return (
    <section aria-labelledby="ricevuta-titolo" style={{ ...CARTA, flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', minWidth: 0 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2 id="ricevuta-titolo" style={{ margin: 0, fontSize: 15, fontWeight: 500, lineHeight: 1.4, overflowWrap: 'anywhere' }}>{titoloRicevuta(m)}</h2>
          {/* senza righe, la riga sotto il titolo: quello che c'è nel punto, la settimana, o la prossima cosa che farà */}
          {!qualcosa && (
            <div style={SOTTO}>
              {nelPunto > 0 ? `${maiuscola(frasi.coseNelPunto(nelPunto))}. ${t('Dieci secondi.')}` : settimana ?? prossima}
            </div>
          )}
        </div>
        {daAprire && <button type="button" onClick={() => setAperto(true)} style={BOTTONE}>{t('Apri')} <IconAvanti /></button>}
      </div>
      {fatte.length > 0 && <RigheFatte xs={fatte.slice(0, RIGHE_IN_CARTA)} l={notte?.l} apri={apriCarta} inCarta />}
      {ricevuta.length > 0 && (
        <RigheAspettano xs={ricevuta.slice(0, RIGHE_IN_CARTA)} l={notte?.l} apri={apriCarta} inCarta
          apriChat={() => v.goChat()} apriDomande={vaiAlleDomande} />
      )}
      {/* il resto è nel foglio: si dice quante, non si mostrano */}
      {oltre > 0 && <div style={{ ...SOTTO, marginTop: 0 }}>{frasi.altreNelFoglio(oltre)}</div>}
    </section>
  )
}

