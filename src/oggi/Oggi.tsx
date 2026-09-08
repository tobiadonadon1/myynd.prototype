// Oggi — la lista.
//
// Una riga, e tre colonne: la faccio io, me ne fai una bozza, te ne occupi tu
// fino in fondo. Non è un menù nascosto sotto il mouse — sono tre caselle in
// colonna, e si vede a colpo d'occhio quanto di questa giornata sta in mano
// tua e quanto in mano sua. È tutto il prodotto in una griglia.
//
// Poche parole, di proposito. Una lista di cose da fare che ti spiega sé stessa
// è una lista che non stai leggendo.
//
// C'è un quarto modo, e non è una colonna: «preparami il prompt» — la riga
// diventa la richiesta da incollare in Claude o ChatGPT, con dentro il suo
// materiale. Sta sotto i tre puntini della riga, perché è una cosa che si
// chiede ogni tanto, non una che si guarda a colpo d'occhio.

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Cestino, Hov, LABEL, PILL, useAttiva, useLarghezza } from '../ui'
import { frasi, t } from '../lingua'
import { IconGiu, IconSpunta } from '../icons'
import { Glifo } from '../components/Stato'
import { Testo } from '../Testo'
import { SECCHI, type Lista, type Secchio } from './useCompiti'
import { Barra, type Modo } from './Barra'
import { spezzaPrompt } from './prompt'
import { Coriandoli } from './Coriandoli'
import { Giro } from './Giro'
import { api, type Compito, type PassoCompito } from '../api'
import { Calendario } from './Calendario'
import { Dettaglio } from './Dettaglio'
import { giornoLocale, secchioDelGiorno } from './giorni'
import { desktop } from '../desktop'

const NOME: Record<Secchio, string> = { oggi: 'Oggi', settimana: 'Questa settimana', poi: 'Prima o poi' }

/** I tre modi, in colonna. L'ordine è quanto lavoro passa a lui. */
const MODI = [
  { id: 'io', nome: 'io' },
  { id: 'bozza', nome: 'bozza' },
  // la terza colonna porta il suo nome: è lui che se ne occupa, e «tutto» non
  // diceva di chi
  { id: 'tutto', nome: 'Myynd' }
] as const

// `useLarghezza` sta in ui.tsx: la usa anche l'impaginato intero, e due copie
// dello stesso ascoltatore di resize sono due posti dove cambiare una soglia.

/** Le colonne, identiche in ogni sezione: è quello che le tiene allineate. */
function griglia(stretta: boolean): CSSProperties {
  const c = stretta ? 40 : 52
  return { display: 'grid', gridTemplateColumns: `minmax(0,1fr) ${c}px ${c}px ${c}px`, alignItems: 'center' }
}

/**
 * Le zone di trascinamento disegnate a mano non ci sono più: la finestra ha la
 * sua barra del titolo, che è il posto dove chiunque si aspetta di afferrarla.
 * Le costanti restano vuote invece di sparire perché sono spruzzate ovunque, e
 * toglierle una a una è rumore per niente.
 */
const SPOSTA: CSSProperties = {}
const FERMO: CSSProperties = {}

/**
 * Il bottone pieno e quello di contorno. Il bordo c'è in tutti e due —
 * trasparente nel pieno — così passare dall'uno all'altro non sposta niente.
 */
const PIENO: CSSProperties = {
  padding: '8px 17px', borderRadius: 99, border: '1px solid transparent',
  background: 'linear-gradient(120deg,#C4623B,#7E9C82)', color: '#FFF7F0',
  fontSize: '13px', fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer'
}
const CONTORNO: CSSProperties = {
  ...PIENO, border: '1px solid rgba(34,39,31,.18)', background: 'none', color: '#22271F'
}

/** Un pannello sotto la bozza: sa se è aperto, e lo dice alla bozza che lo apre e lo chiude. */
type Pannello = { aperto: boolean; apri: () => void; chiudi: () => void }

/**
 * Di che colore è una riga.
 *
 * Non dal secchio in cui sta e nemmeno da come l'hai etichettata: da **chi sta
 * aspettando chi**. È l'unica cosa che vuoi sapere passando l'occhio su otto
 * righe, e finora non era scritta da nessuna parte — le righe erano tutte
 * identiche e la differenza stava in una pastiglia in fondo, cioè dopo aver
 * letto tutto il resto.
 *
 * Tre stati, e sono gli stessi tre colori che questa app usa ovunque: il rame
 * vuol dire «tocca a te» dal feed alle notifiche, il verde vuol dire «ci sta
 * pensando lui», e una cosa tua che non ha ancora nessuna storia non ha nessun
 * colore — perché non è successo niente.
 *
 * Il colore non sostituisce le parole: la pastiglia «pronta» e «ti chiede»
 * restano dove sono. Le anticipa, che è un lavoro diverso.
 */
type Tinta = { barra: string; fondo: string; bordo: string }

const TINTE: Record<'aspetta' | 'lavora' | 'mia', Tinta> = {
  aspetta: { barra: '#C4623B', fondo: 'rgba(196,98,59,.10)', bordo: 'rgba(196,98,59,.34)' },
  lavora: { barra: '#7E9C82', fondo: 'rgba(126,156,130,.12)', bordo: 'rgba(126,156,130,.38)' },
  mia: { barra: 'rgba(34,39,31,.18)', fondo: 'rgba(255,255,255,.34)', bordo: 'rgba(255,255,255,.95)' }
}

function tinta(c: Compito): Tinta {
  if (c.stato === 'pronto' || c.stato === 'chiede') return TINTE.aspetta
  if (c.stato === 'delegato') return TINTE.lavora
  return TINTE.mia
}

/** Il cerchio che si spunta. */
function Cerchio({ c, onClick }: { c: Compito; onClick: () => void }) {
  const pronto = c.stato === 'pronto' || c.stato === 'chiede'
  return (
    <Hov as="button" type="button" onClick={onClick}
      aria-label={`${t('Fatto')}: ${c.testo}`} title={t('Fatto')}
      style={{
        width: 16, height: 16, flex: 'none', padding: 0, borderRadius: '50%',
        border: `${pronto ? 2 : 1.5}px solid ${pronto ? '#C4623B' : 'rgba(34,39,31,.22)'}`,
        background: 'none', cursor: 'pointer'
      }}
      hover={{ borderColor: '#22271F' }} />
  )
}

/** Il passo, detto nella lingua di chi legge: il server manda la struttura, non la frase. */
function frasePasso(p: PassoCompito): string {
  if (p.passo === 'cerco') return frasi.passoCerco(p.dettaglio ?? '')
  if (p.passo === 'apro') return frasi.passoApro(p.dettaglio ?? '')
  return t('Scrivo…')
}

/**
 * Una casella della griglia.
 *
 * Piena vuol dire «è così». Non c'è un bottone «delega»: scegliere la colonna
 * *è* delegare, e tornare su «io» è richiamarlo indietro. Un gesto solo, e la
 * riga dice sempre da sola in che mani sta.
 */
function Casella({ scelto, lavora, onClick, id, nome, riga }: {
  scelto: boolean; lavora: boolean; onClick: () => void; id: string; nome: string; riga: string
}) {
  return (
    <Hov as="button" type="button" onClick={onClick}
      role="radio" aria-checked={scelto} aria-label={`${nome}: ${riga}`}
      style={{
        height: 30, border: 'none', background: 'none', cursor: 'pointer', padding: 0,
        display: 'grid', placeItems: 'center', fontFamily: 'inherit'
      }}
      hover={{ background: 'rgba(34,39,31,.04)' }}>
      {/* col colore dichiarato il glifo perde il suo riquadro di fondo, che su
          una riga chiara si vedeva come un quadratino pieno invece che come
          una griglia che si accende */}
      {lavora ? <Glifo tipo="penso" dim={19} colore="#C4623B" /> : (
        <span style={{
          width: scelto ? 9 : 7, height: scelto ? 9 : 7, borderRadius: '50%',
          background: scelto ? (id === 'io' ? '#22271F' : '#C4623B') : 'transparent',
          border: scelto ? 'none' : '1px solid rgba(34,39,31,.2)'
        }} />
      )}
    </Hov>
  )
}

/**
 * Una riga, e adesso è una lastra per conto suo.
 *
 * Stavano tutte dentro un blocco solo, separate da un filo grigio: un elenco,
 * cioè la forma che si dà alle cose quando l'unica cosa che conta è che siano
 * in ordine. Ma queste non sono voci di un elenco — ognuna è una cosa che sta
 * succedendo, con un suo stato e una sua attesa, e meritano di essere oggetti
 * separati che si possono prendere uno alla volta.
 *
 * Quindi: vetro proprio, bordo proprio, ombra propria, e sotto il cursore si
 * alza di un pixel prendendo il colore di quello che aspetta. La grammatica è
 * identica per tutte — stessa forma, stessa misura, stesso gesto — e cambia
 * solo la tinta, che è quello che le distingue davvero.
 */
function CartaCalendario({ c, l, modifica }: { c: Compito; l: Lista; modifica: (c: Compito) => void }) {
  const attende = c.stato === 'pronto' || c.stato === 'chiede'
  const classi = ['task-planning-card', attende && 'waiting', c.stato === 'delegato' && 'working'].filter(Boolean).join(' ')
  const apri = () => {
    l.apriChiudi(c.id)
    if (!l.aperti.has(c.id)) requestAnimationFrame(() => document.getElementById(`task-result-${c.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'auto' }))
  }
  return <li className={classi} draggable onDragStart={e => { e.dataTransfer.setData('text/plain', c.id); e.dataTransfer.effectAllowed = 'move' }}>
    <div className="task-planning-main"><Cerchio c={c} onClick={() => l.chiudi(c.id)} />
      <button type="button" className="task-planning-title" onClick={() => modifica(c)}>{c.testo}</button>
    </div>
    <div className="task-planning-footer">
      <select aria-label={`${t('Assegnazione')}: ${c.testo}`} value={c.modo}
        onChange={e => { if (e.target.value === 'io') l.richiama(c.id); else l.delega(c.id, e.target.value) }}>
        {MODI.map(m => <option key={m.id} value={m.id}>{t(m.nome)}</option>)}
      </select>
      {attende ? <button type="button" className="task-planning-status" aria-expanded={l.aperti.has(c.id)} onClick={apri}>{c.stato === 'chiede' ? t('ti chiede') : t('pronta')} ↗</button>
        : c.stato === 'delegato' ? <span className="task-planning-status">{t('Al lavoro')}</span> : null}
    </div>
    {c.guaio && <p className="task-planning-error">{t(c.guaio)}</p>}
  </li>
}

function Riga({ c, l, stretta, modifica }: { c: Compito; l: Lista; stretta: boolean; modifica: (c: Compito) => void }) {
  // sotto mano: il mouse sopra, il fuoco dentro, o un dito — che non sa passare sopra a niente
  const { attiva: mostra, props: sottoMano } = useAttiva()
  /** Vera solo mentre tieni premuta la striscia: vedi il commento lì sotto. */
  const [afferrata, setAfferrata] = useState(false)
  const aperto = l.aperti.has(c.id)
  const pronto = c.stato === 'pronto'
  const chiede = c.stato === 'chiede'
  const delegato = c.stato === 'delegato'
  const aspetta = pronto || chiede
  const col = tinta(c)
  /** Ha chiesto il prompt, non la cosa: nessuna delle tre caselle è sua, e la riga lo dice a parole. */
  const prompt = c.modo === 'prompt'
  const [menu, setMenu] = useState(false)

  return (
    <li
      draggable={afferrata}
      onDragStart={e => {
        e.dataTransfer.setData('text/plain', c.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragEnd={() => setAfferrata(false)}
      style={{
        ...griglia(stretta), ...FERMO,
        position: 'relative', listStyle: 'none', borderRadius: 16, boxSizing: 'border-box',
        padding: stretta ? '11px 10px 11px 18px' : '11px 15px 11px 22px',
        background: mostra
          ? `linear-gradient(102deg, ${col.fondo} 0%, rgba(255,255,255,.6) 62%)`
          : 'rgba(255,253,249,.48)',
        backdropFilter: 'blur(20px) saturate(1.45)', WebkitBackdropFilter: 'blur(20px) saturate(1.45)',
        border: `1px solid ${mostra ? col.bordo : 'rgba(255,255,255,.7)'}`,
        boxShadow: mostra
          ? '0 16px 30px -18px rgba(84,64,44,.45), inset 0 1px 0 rgba(255,255,255,.6)'
          : '0 3px 10px -8px rgba(84,64,44,.24), inset 0 1px 0 rgba(255,255,255,.45)',
        transform: mostra ? 'translateY(-1px)' : 'none',
        transition: 'background .18s ease, border-color .18s ease, box-shadow .24s ease, transform .24s ease'
      }}
      {...sottoMano}>

      {/*
        La striscia del colore, che è anche l'appiglio.

        Erano due cose e stavano nello stesso punto: la striscia a sinistra, e i
        sei puntini del trascinamento che comparivano col mouse — sopra la
        striscia, spostati di due pixel. Due affordance sovrapposte sullo stesso
        centimetro quadrato, e nessuna delle due leggibile.

        Adesso è una sola. La striscia c'è sempre, dice di chi è il turno con il
        suo colore, e afferrandola si sposta la riga: il bersaglio è largo undici
        pixel — un filo di tre non si prende — ma quello che si vede resta il
        filo. E non compare niente al passaggio del mouse, quindi la riga non si
        muove di due pixel ogni volta che ci passi sopra.

        `draggable` si accende solo tenendola premuta: se la riga fosse sempre
        trascinabile non si potrebbe più selezionare il suo testo con il mouse, e
        il testo qui si clicca per correggerlo.
      */}
      <span
        aria-hidden="true"
        title={t('Trascina per spostarla')}
        onMouseDown={() => setAfferrata(true)}
        onMouseUp={() => setAfferrata(false)}
        style={{
          position: 'absolute', left: 2, top: 9, bottom: 9, width: 13,
          display: 'flex', justifyContent: 'center', cursor: 'grab', userSelect: 'none'
        }}>
        <span style={{
          width: mostra ? 4 : 3, borderRadius: 99, background: col.barra,
          opacity: mostra ? 1 : 0.75, transition: 'width .18s ease, opacity .18s ease'
        }} />
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0, paddingRight: 14 }}>
        <Cerchio c={c} onClick={() => l.chiudi(c.id)} />

        <div style={{ flex: 1, minWidth: 0 }}>
            <Hov as="button" type="button" onClick={() => modifica(c)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', border: 'none',
                background: 'none', padding: 0, fontFamily: 'inherit', cursor: 'pointer',
                fontSize: '14.5px', lineHeight: 1.4, overflowWrap: 'anywhere',
                color: delegato ? 'rgba(34,39,31,.6)' : '#22271F'
              }}
              hover={{ color: '#8E3F1F' }}>{c.testo}</Hov>

          {c.guaio && (
            <div style={{ fontSize: '12px', color: '#8E3F1F', marginTop: 3, overflowWrap: 'anywhere', overflow: 'hidden' }}>{t(c.guaio)}</div>
          )}

          {/* cosa sta facendo, finché ci lavora: una riga sola, smorzata, che
              non può sforare — un titolo di documento può essere lungo quanto vuole */}
          {delegato && l.passi[c.id] && (
            <div style={{
              fontSize: '12.5px', color: 'rgba(34,39,31,.5)', marginTop: 3,
              overflowWrap: 'anywhere', overflow: 'hidden'
            }}>{frasePasso(l.passi[c.id])}</div>
          )}
        </div>

        {aspetta && (
          <Hov as="button" type="button" onClick={() => l.apriChiudi(c.id)} aria-expanded={aperto}
            style={{ ...PILL, flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontFamily: 'inherit' }}
            hover={{ background: 'rgba(196,98,59,.22)' }}>
            {/* «pronta» su una riga che in realtà ti sta chiedendo una cosa era
                la bugia più grossa dell'app: leggevi «fatto» dove c'era scritto
                «non posso». Adesso le due cose hanno due nomi. */}
            {chiede ? t('ti chiede') : prompt ? t('prompt') : t('pronta')}
            <span aria-hidden="true" style={{ display: 'flex', transform: aperto ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
              <IconGiu size={10} stroke="currentColor" />
            </span>
          </Hov>
        )}

        {/* mentre scrive il prompt nessuna casella si accende — non è nessuna
            delle tre — e senza questa parola la riga sembrerebbe ferma */}
        {delegato && prompt && (
          <span style={{
            flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 12, color: 'rgba(34,39,31,.5)'
          }}>
            <Glifo tipo="penso" dim={14} colore="#C4623B" />
            {t('prompt')}
          </span>
        )}

        {/*
          I tre puntini: quello che si chiede ogni tanto.

          Una cosa sola, per ora — «preparami il prompt» — e sta qui e non in
          una quarta colonna perché le colonne dicono di chi è la riga a colpo
          d'occhio, e un prompt non è di nessuno dei due: è una richiesta da
          portare altrove. Solo sulle righe ancora tue: sotto una bozza pronta
          c'è già «Rifallo».
        */}
        {!delegato && !aspetta && (
          <span style={{ position: 'relative', flex: 'none', display: 'flex' }}>
            <Hov as="button" type="button"
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); setMenu(m => !m) }}
              onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Escape') setMenu(false) }}
              aria-label={t('Altro')} title={t('Altro')} aria-haspopup="menu" aria-expanded={menu}
              style={{
                width: 20, height: 20, display: 'grid', placeItems: 'center', border: 'none',
                background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 15, lineHeight: 1, color: menu ? '#8E3F1F' : 'rgba(34,39,31,.35)',
                opacity: mostra || menu ? 1 : 0, pointerEvents: mostra || menu ? 'auto' : 'none',
                transition: 'opacity .15s, color .15s'
              }}
              hover={{ color: '#8E3F1F' }}>⋯</Hov>
            {menu && (
              <div role="menu" style={{
                position: 'absolute', right: 0, top: 24, zIndex: 5, minWidth: 200,
                padding: 5, borderRadius: 11, background: '#FFFDF9',
                border: '1px solid rgba(34,39,31,.14)', boxShadow: '0 12px 28px -12px rgba(84,64,44,.4)',
                animation: 'fadein .12s ease'
              }}>
                <Hov as="button" type="button" role="menuitem" autoFocus
                  onClick={() => { setMenu(false); l.delega(c.id, 'prompt') }}
                  // il fuoco resta sulla voce mentre la si preme: Safari non
                  // lo dà ai bottoni, e il blur chiuderebbe il menù prima del clic
                  onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
                  onBlur={() => setMenu(false)}
                  onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setMenu(false) } }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'none',
                    padding: '7px 10px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
                    color: '#22271F', fontSize: '13px'
                  }}
                  hover={{ background: 'rgba(34,39,31,.06)' }}>
                  <div>{t('Preparami il prompt')}</div>
                  <div style={{ fontSize: '11px', color: 'rgba(34,39,31,.45)', marginTop: 1 }}>{t('Da incollare in Claude o ChatGPT')}</div>
                </Hov>
              </div>
            )}
          </span>
        )}

        {/* toglierla chiede una volta, sul posto: la stessa regola di ogni cestino qui dentro */}
        <Cestino fai={() => l.elimina(c.id)} titolo={t('Toglila')} visibile={mostra} dim={20} icona={11} />
      </div>

      <div role="radiogroup" aria-label={c.testo} style={{ display: 'contents' }}>
        {MODI.map(m => (
          <Casella key={m.id} id={m.id} nome={t(m.nome)} riga={c.testo}
            scelto={c.modo === m.id}
            lavora={delegato && c.modo === m.id}
            onClick={() => (m.id === 'io' ? l.richiama(c.id) : l.delega(c.id, m.id))} />
        ))}
      </div>

      {aperto && (chiede ? <Domanda c={c} l={l} />
        : c.proposta ? <Proposta c={c} l={l} />
        : pronto ? <Bozza c={c} l={l} /> : null)}
    </li>
  )
}

/**
 * Quando ti chiede una cosa.
 *
 * Non è una bozza da approvare, è una domanda da rispondere — e ha una faccia
 * sua per questo. Quello che scrivi si attacca al compito e il lavoro riparte
 * subito: rispondere a una domanda e poi dover premere ancora «fallo» sarebbe
 * chiedere due volte la stessa cosa.
 */
/**
 * Quando si è fermato: le stesse cose, ma da toccare.
 *
 * Il modo vecchio era un paragrafo e una casella vuota. Tutto vero e inutile:
 * rimandava addosso a chi legge il lavoro di capire cosa mancasse e di
 * scriverlo in prosa — più fatica del compito stesso.
 *
 * Le opzioni fanno una seconda cosa, che vale quanto la prima: dicono *di cosa
 * è capace*. «Tre blog da mille parole» accanto a «uno lungo» è il modo in cui
 * si scopre cosa sa fare, senza dover chiedere.
 *
 * La casella di testo resta sempre, sotto: le opzioni sono un punto di
 * partenza, non un modulo. E si può mandare anche solo scrivendo, come prima.
 */
function Domanda({ c, l }: { c: Compito; l: Lista }) {
  const [testo, setTesto] = useState('')
  // le scelte fatte, per domanda: un insieme perché alcune ne prendono più di una
  const [scelte, setScelte] = useState<Record<number, Set<string>>>({})
  const chieste = c.chieste ?? []

  const tocca = (i: number, o: string, multipla: boolean) => setScelte(s => {
    const ora = new Set(s[i] ?? [])
    if (ora.has(o)) ora.delete(o)
    else if (multipla) ora.add(o)
    else { ora.clear(); ora.add(o) }
    return { ...s, [i]: ora }
  })

  /** Quello che gli arriva: le domande con la risposta sotto, più quello che hai scritto. */
  const composta = () => {
    const parti = chieste
      .map((q, i) => [q, [...(scelte[i] ?? [])]] as const)
      .filter(([, s]) => s.length)
      .map(([q, s]) => `${q.domanda} ${s.join(', ')}`)
    if (testo.trim()) parti.push(testo.trim())
    return parti.join('\n')
  }

  const qualcosa = !!testo.trim() || Object.values(scelte).some(s => s.size)
  const manda = () => { if (qualcosa) l.rispondi(c.id, composta()) }

  return (
    <div style={{
      // Scavato dentro la lastra, non appoggiato sopra.
      //
      // Era una card bianca su una riga trasparente, e funzionava finché la
      // riga non era niente. Adesso la riga è vetro: una seconda superficie
      // chiara sopra la prima fa due strati che si somigliano, e non si capisce
      // più chi contiene chi. Un fondo appena più scuro con l'ombra all'interno
      // dice l'unica cosa che deve dire — questo sta *dentro* quella riga lì.
      gridColumn: '1 / -1', marginTop: 11, marginBottom: 2, padding: '15px 17px',
      borderRadius: 13, background: 'rgba(34,39,31,.045)',
      border: '1px solid rgba(255,255,255,.5)',
      boxShadow: 'inset 0 1px 3px rgba(84,64,44,.09)'
    }}>
      <div style={{
        fontSize: '14px', lineHeight: 1.6, color: '#22271F', whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere', maxHeight: 300, overflowY: 'auto'
      }}>
        <Testo testo={c.risultato ?? ''} fonti={c.fonti ?? []} />
      </div>

      {chieste.map((q, i) => (
        <div key={i} style={{ marginTop: 14 }}>
          <div style={{ fontSize: '13.5px', color: '#22271F', marginBottom: 7, overflowWrap: 'anywhere' }}>{q.domanda}</div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {q.opzioni.map(o => {
              const presa = scelte[i]?.has(o)
              return (
                <Hov as="button" key={o} type="button" onClick={() => tocca(i, o, q.multipla)}
                  style={{
                    padding: '7px 13px', borderRadius: 99, fontFamily: 'inherit', fontSize: '12.5px',
                    cursor: 'pointer', maxWidth: '100%', overflowWrap: 'anywhere',
                    border: `1px solid ${presa ? 'transparent' : 'rgba(34,39,31,.18)'}`,
                    background: presa ? 'linear-gradient(120deg,#C4623B,#7E9C82)' : 'rgba(255,255,255,.7)',
                    color: presa ? '#FFF7F0' : '#22271F'
                  }}
                  hover={presa ? { opacity: 0.92 } : { borderColor: '#C4623B', color: '#8E3F1F' }}>
                  {o}
                </Hov>
              )
            })}
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 8, marginTop: 13 }}>
        <input
          autoFocus={!chieste.length}
          value={testo}
          onChange={e => setTesto(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') manda()
            if (e.key === 'Escape') { e.stopPropagation(); l.apriChiudi(c.id) }
          }}
          aria-label={t('Rispondigli')}
          placeholder={chieste.length ? t('Aggiungi qualcosa, se serve') : t('Rispondigli e ci riprova')}
          style={{
            flex: 1, minWidth: 0, padding: '9px 13px', borderRadius: 11,
            border: '1px solid rgba(34,39,31,.18)', background: 'rgba(255,255,255,.85)',
            color: '#22271F', fontSize: '13.5px', fontFamily: 'inherit', outline: 'none'
          }} />
        <button type="button" onClick={manda} disabled={!qualcosa} style={{
          flex: 'none', padding: '9px 17px', borderRadius: 99, border: 'none',
          background: qualcosa ? 'linear-gradient(120deg,#C4623B,#7E9C82)' : 'rgba(34,39,31,.1)',
          color: qualcosa ? '#FFF7F0' : 'rgba(34,39,31,.3)',
          fontSize: '13px', fontWeight: 500, fontFamily: 'inherit',
          cursor: qualcosa ? 'pointer' : 'default'
        }}>{chieste.length ? t('Vai') : t('Manda')}</button>
      </div>
    </div>
  )
}

/**
 * Quello che si offre di fare, prima di farlo.
 *
 * È il secondo posto — dopo l'email — da cui esce qualcosa da questa app, e la
 * forma è quella lì apposta: si vede l'elenco intero, uno per uno, con accanto
 * il perché di ognuno; e sotto un bottone solo.
 *
 * L'elenco non è riassunto e non è impaginato. «Ventitré messaggi da mettere
 * nel cestino» con dentro un «vedi tutti» è il modo in cui si preme senza aver
 * guardato — e la volta che fra i ventitré c'era una fattura, la colpa non è di
 * chi ha premuto. Se sono tanti la lista scorre: scorrere costa un secondo,
 * ritrovare una mail nel cestino costa molto di più.
 *
 * Non c'è un bottone «no». Chiudere la riga è già il no, ed è il gesto che si
 * fa con tutte le altre: aggiungere un rifiuto qui vorrebbe dire due modi di
 * dire la stessa cosa nella stessa schermata.
 */
function Proposta({ c, l }: { c: Compito; l: Lista }) {
  const [faccio, setFaccio] = useState(false)
  const [guaio, setGuaio] = useState('')
  const p = c.proposta
  if (!p) return null
  const cestino = p.azione === 'posta.cestina'

  const vai = async () => {
    setFaccio(true); setGuaio('')
    try { await l.esegui(c.id) }
    catch (e) { setGuaio(e instanceof Error ? e.message : String(e)); setFaccio(false) }
  }

  return (
    <div style={{
      // Scavato dentro la lastra, non appoggiato sopra.
      //
      // Era una card bianca su una riga trasparente, e funzionava finché la
      // riga non era niente. Adesso la riga è vetro: una seconda superficie
      // chiara sopra la prima fa due strati che si somigliano, e non si capisce
      // più chi contiene chi. Un fondo appena più scuro con l'ombra all'interno
      // dice l'unica cosa che deve dire — questo sta *dentro* quella riga lì.
      gridColumn: '1 / -1', marginTop: 11, marginBottom: 2, padding: '15px 17px',
      borderRadius: 13, background: 'rgba(34,39,31,.045)',
      border: '1px solid rgba(255,255,255,.5)',
      boxShadow: 'inset 0 1px 3px rgba(84,64,44,.09)'
    }}>
      <div style={{
        fontSize: '10.5px', letterSpacing: '.1em', textTransform: 'uppercase',
        color: 'rgba(34,39,31,.45)', marginBottom: 9
      }}>{t(cestino ? 'Da mettere nel cestino' : 'Da archiviare')}</div>

      <div style={{ maxHeight: 300, overflowY: 'auto', display: 'grid', gap: 9 }}>
        {p.voci.map(v => (
          <div key={v.doc} style={{ display: 'flex', gap: 9, alignItems: 'baseline' }}>
            <span style={{ color: 'rgba(34,39,31,.3)', fontSize: 11, flex: 'none' }}>—</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '13.5px', color: '#22271F', overflowWrap: 'anywhere' }}>{v.titolo}</div>
              <div style={{ fontSize: '12px', color: 'rgba(34,39,31,.5)', marginTop: 1, overflowWrap: 'anywhere' }}>{v.perche}</div>
            </div>
          </div>
        ))}
      </div>

      {guaio && <div style={{ fontSize: 12, color: '#8E3F1F', marginTop: 10 }}>{t(guaio)}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 13 }}>
        <button type="button" onClick={vai} disabled={faccio} style={{
          padding: '9px 18px', borderRadius: 99, border: 'none',
          background: faccio ? 'rgba(34,39,31,.1)' : 'linear-gradient(120deg,#C4623B,#7E9C82)',
          color: faccio ? 'rgba(34,39,31,.35)' : '#FFF7F0',
          fontSize: '13px', fontWeight: 500, fontFamily: 'inherit',
          cursor: faccio ? 'default' : 'pointer'
        }}>{faccio ? t('Li sposto…') : frasi.mettiViaTutti(p.voci.length, cestino)}</button>
        <span style={{ fontSize: '11px', color: 'rgba(34,39,31,.35)' }}>
          {t('si spostano, non si cancellano')}
        </span>
      </div>
    </div>
  )
}

/** La bozza, sotto la riga che l'ha chiesta. */
function Bozza({ c, l }: { c: Compito; l: Lista }) {
  const [testo, setTesto] = useState(c.risultato ?? '')
  const [modifico, setModifico] = useState(false)
  /**
   * Un prompt non si manda e non si salva: si copia. Il testo è quello che
   * finirà negli appunti — testo semplice, senza le fonti trasformate in
   * chip — e la riga per lei sta sotto, smorzata, fuori da quello che si copia.
   */
  const prompt = c.modo === 'prompt'
  const spezzato = prompt ? spezzaPrompt(testo) : null
  /**
   * Quale dei tre pannelli sotto è aperto: mandare, salvare, far lavorare.
   * Uno alla volta, e lo sa la bozza: finché uno è aperto il bottone pieno è
   * il suo, e «Va bene» si fa di contorno — un solo gesto principale per volta.
   */
  const [pannello, setPannello] = useState<'' | 'manda' | 'salva' | 'lavora'>('')
  const area = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { setTesto(c.risultato ?? '') }, [c.risultato])
  useEffect(() => {
    const a = area.current
    if (!modifico || !a) return
    a.style.height = 'auto'
    a.style.height = `${Math.min(a.scrollHeight, 400)}px`
    a.focus()
    a.setSelectionRange(a.value.length, a.value.length)
  }, [modifico])

  return (
    <div style={{
      // Scavato dentro la lastra, non appoggiato sopra.
      //
      // Era una card bianca su una riga trasparente, e funzionava finché la
      // riga non era niente. Adesso la riga è vetro: una seconda superficie
      // chiara sopra la prima fa due strati che si somigliano, e non si capisce
      // più chi contiene chi. Un fondo appena più scuro con l'ombra all'interno
      // dice l'unica cosa che deve dire — questo sta *dentro* quella riga lì.
      gridColumn: '1 / -1', marginTop: 11, marginBottom: 2, padding: '15px 17px',
      borderRadius: 13, background: 'rgba(34,39,31,.045)',
      border: '1px solid rgba(255,255,255,.5)',
      boxShadow: 'inset 0 1px 3px rgba(84,64,44,.09)'
    }}>
      {modifico ? (
        <textarea
          ref={area}
          value={testo}
          onChange={e => {
            setTesto(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = `${Math.min(e.target.scrollHeight, 400)}px`
          }}
          onKeyDown={e => {
            if (e.key === 'Escape') { e.stopPropagation(); setTesto(c.risultato ?? ''); setModifico(false) }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) l.chiudi(c.id, t('Va bene così.'), testo)
          }}
          aria-label={prompt ? t('Il prompt') : t('La bozza')}
          style={{
            width: '100%', boxSizing: 'border-box', border: 'none', background: 'none', outline: 'none',
            resize: 'none', color: '#22271F', fontSize: '14px', lineHeight: 1.6,
            fontFamily: 'inherit', maxHeight: 400, overflowY: 'auto'
          }} />
      ) : spezzato ? (
        <div style={{
          fontSize: '14px', lineHeight: 1.6, color: '#22271F', whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere', maxHeight: 340, overflowY: 'auto'
        }}>
          {spezzato.prompt}
          {spezzato.nota && (
            <div style={{ marginTop: 12, fontSize: '12.5px', color: 'rgba(34,39,31,.55)' }}>{spezzato.nota}</div>
          )}
        </div>
      ) : (
        <div style={{
          fontSize: '14px', lineHeight: 1.6, color: '#22271F', whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere', maxHeight: 340, overflowY: 'auto'
        }}>
          <Testo testo={testo} fonti={c.fonti ?? []} />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 13, flexWrap: 'wrap' }}>
        {/* il gesto principale di un prompt è copiarlo: «Va bene» si fa di contorno */}
        {spezzato && (
          <Hov as="button" type="button" onClick={() => l.copia(spezzato.prompt)}
            style={pannello ? CONTORNO : PIENO}
            hover={pannello ? { borderColor: '#C4623B', color: '#8E3F1F' } : { opacity: 0.92 }}>{t('Copia il prompt')}</Hov>
        )}
        <Hov as="button" type="button" onClick={() => l.chiudi(c.id, t('Va bene così.'), testo)}
          style={pannello || spezzato ? CONTORNO : PIENO}
          hover={pannello || spezzato ? { borderColor: '#C4623B', color: '#8E3F1F' } : { opacity: 0.92 }}>{t('Va bene')}</Hov>

        <Hov as="button" type="button" onClick={() => setModifico(m => !m)}
          style={{
            padding: '8px 15px', borderRadius: 99, border: '1px solid rgba(34,39,31,.18)',
            background: 'none', color: '#22271F', fontSize: '13px',
            fontFamily: 'inherit', cursor: 'pointer'
          }}
          hover={{ borderColor: '#C4623B', color: '#8E3F1F' }}>{modifico ? t('Rileggi') : t('Correggi')}</Hov>

        <div style={{ flex: 1 }} />

        <Hov as="button" type="button" onClick={() => l.delega(c.id, c.modo)}
          style={{
            padding: '8px 4px', border: 'none', background: 'none', color: 'rgba(34,39,31,.45)',
            fontSize: 12, fontFamily: 'inherit', cursor: 'pointer'
          }}
          hover={{ color: '#22271F' }}>{t('Rifallo')}</Hov>
      </div>

      {/* un prompt non ha un destinatario né un file da diventare: va negli
          appunti, o dritto a Claude Code se c'è un progetto in cui lavorare */}
      {!spezzato && <Manda c={c} l={l} aperto={pannello === 'manda'} apri={() => setPannello('manda')} chiudi={() => setPannello('')} />}
      {!spezzato && <Salva c={c} l={l} testo={testo} aperto={pannello === 'salva'} apri={() => setPannello('salva')} chiudi={() => setPannello('')} />}
      <Lavora c={c} l={l} richiesta={spezzato?.prompt}
        aperto={pannello === 'lavora'} apri={() => setPannello('lavora')} chiudi={() => setPannello('')} />
    </div>
  )
}

/**
 * Farla fare a Claude Code, dentro un progetto.
 *
 * Due passi, e sono due apposta: prima guarda il progetto e scrive cosa
 * farebbe — senza toccare un file — e quello che torna si legge come una bozza
 * qualsiasi; poi, se il piano regge, lo fa davvero.
 *
 * Il secondo bottone compare solo dopo il primo. Non è una precauzione
 * decorativa: fra i due passi ci va una persona che ha letto, ed è l'unica cosa
 * che rende accettabile lasciare un agente dentro una cartella di lavoro.
 */
function Lavora({ c, l, richiesta, aperto, apri, chiudi }: {
  c: Compito; l: Lista
  /** Un testo già scritto per lui — il prompt della riga — al posto del titolo. */
  richiesta?: string
} & Pannello) {
  const [pronto, setPronto] = useState<{ pronto: boolean; cartelle: string[] } | null>(null)
  const [cartella, setCartella] = useState('')
  const [gira, setGira] = useState<'' | 'piano' | 'fai'>('')
  const [guaio, setGuaio] = useState('')
  // vero dopo il primo passo: è quello che sblocca «fallo davvero»
  const [pianoFatto, setPianoFatto] = useState(false)

  // Di solito si chiede solo aprendo il pannello. Con un prompt si chiede
  // subito: «Apri in Claude Code…» sotto un prompt va offerto solo a chi può
  // premerlo davvero — una cartella collegata e Claude Code installato — e
  // per saperlo prima di mostrarlo bisogna chiederlo prima.
  useEffect(() => {
    if ((!aperto && !richiesta) || pronto) return
    api.lavoroPronto().then(setPronto).catch(() => setPronto({ pronto: false, cartelle: [] }))
  }, [aperto, pronto, richiesta])

  const vai = async (passo: 'piano' | 'fai') => {
    setGira(passo); setGuaio('')
    try {
      // il prompt va con il primo passo; al secondo vale il piano approvato,
      // che il server ha già sotto mano
      const r = await l.lavora(c.id, {
        cartella: cartella || pronto?.cartelle[0] || '', passo,
        ...(passo === 'piano' && richiesta?.trim() ? { richiesta } : {})
      })
      if (passo === 'piano') setPianoFatto(true)
      if (!r.finito) setGuaio('Si è fermato dopo il tempo massimo: quello che ha fatto è qui sopra.')
    } catch (e) { setGuaio(e instanceof Error ? e.message : String(e)) }
    setGira('')
  }

  const campo: CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '8px 11px', borderRadius: 9,
    border: '1px solid rgba(34,39,31,.16)', background: 'rgba(255,255,255,.85)',
    color: '#22271F', fontSize: '13px', fontFamily: 'inherit', outline: 'none'
  }

  if (!aperto) {
    // sotto un prompt il verso compare solo se c'è dove andare
    if (richiesta && !(pronto?.pronto && pronto.cartelle.length)) return null
    return (
      <div style={{ marginTop: 4 }}>
        <Hov as="button" type="button" onClick={apri}
          style={{
            border: 'none', background: 'none', padding: '4px 0', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: '12.5px', color: '#8E3F1F'
          }}
          hover={{ color: '#C4623B' }}>{richiesta ? t('Apri in Claude Code…') : t('Falla fare a Claude Code…')}</Hov>
      </div>
    )
  }

  const cartelle = pronto?.cartelle ?? []
  return (
    <div style={{
      marginTop: 12, padding: '13px 15px', borderRadius: 13,
      background: 'rgba(255,255,255,.7)', border: '1px solid rgba(34,39,31,.12)'
    }}>
      {pronto && !pronto.pronto ? (
        <div style={{ fontSize: '12.5px', color: '#8E3F1F' }}>
          {t('Claude Code non è installato su questo computer.')}
        </div>
      ) : (
        <>
          <div style={{
            fontSize: '10.5px', letterSpacing: '.1em', textTransform: 'uppercase',
            color: 'rgba(34,39,31,.45)', marginBottom: 5
          }}>{t('In quale progetto')}</div>
          <select value={cartella || cartelle[0] || ''} onChange={e => setCartella(e.target.value)}
            aria-label={t('In quale progetto')} style={campo}>
            {cartelle.map((x: string) => <option key={x} value={x}>{x.replace(/^.*\/(?=[^/]+\/[^/]+$)/, '')}</option>)}
          </select>

          <div style={{ fontSize: '12px', color: 'rgba(34,39,31,.5)', marginTop: 9, lineHeight: 1.5 }}>
            {t(pianoFatto
              ? 'Adesso cambia i file davvero, come nel piano qui sopra.'
              : 'Legge il progetto e scrive cosa farebbe. Non tocca niente.')}
          </div>

          {guaio && <div style={{ fontSize: 12, color: '#8E3F1F', marginTop: 9 }}>{t(guaio)}</div>}

          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => vai('piano')} disabled={!!gira || !cartelle.length} style={{
              padding: '9px 18px', borderRadius: 99, border: '1px solid rgba(34,39,31,.2)',
              background: 'rgba(255,255,255,.8)', color: '#22271F',
              fontSize: '13px', fontFamily: 'inherit', cursor: gira ? 'default' : 'pointer'
            }}>{gira === 'piano' ? t('Guardo il progetto…') : t('Guarda e dimmi cosa faresti')}</button>

            {pianoFatto && (
              <button type="button" onClick={() => vai('fai')} disabled={!!gira} style={{
                padding: '9px 18px', borderRadius: 99, border: 'none',
                background: gira ? 'rgba(34,39,31,.1)' : 'linear-gradient(120deg,#C4623B,#7E9C82)',
                color: gira ? 'rgba(34,39,31,.35)' : '#FFF7F0',
                fontSize: '13px', fontWeight: 500, fontFamily: 'inherit',
                cursor: gira ? 'default' : 'pointer'
              }}>{gira === 'fai' ? t('Lo sto facendo…') : t('Fallo davvero')}</button>
            )}

            <Hov as="button" type="button" onClick={() => { chiudi(); setGuaio('') }}
              style={{
                border: 'none', background: 'none', padding: '9px 4px', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: '12.5px', color: 'rgba(34,39,31,.45)'
              }}
              hover={{ color: '#22271F' }}>{t('Annulla')}</Hov>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Dalla bozza a un file vero.
 *
 * È il primo verbo di questa app che lascia un segno fuori dalla sua finestra
 * senza mandarlo a nessuno, ed è quello che mancava di più: una bozza che devi
 * selezionare, copiare e incollare in Word non è un lavoro finito, è un lavoro
 * da finire.
 *
 * Le cartelle sono solo quelle che hai collegato — le stesse che si fa leggere.
 * Non è una restrizione tecnica, è la stessa promessa detta due volte: quello
 * che tocca è quello che gli hai mostrato.
 */
function Salva({ c, l, testo, aperto, apri, chiudi }: { c: Compito; l: Lista; testo: string } & Pannello) {
  const [nome, setNome] = useState(c.testo)
  const [formato, setFormato] = useState('.rtf')
  const [cartella, setCartella] = useState('')
  const [salvo, setSalvo] = useState(false)
  const [guaio, setGuaio] = useState('')
  // le cartelle collegate si chiedono quando serve, cioè quando apri il
  // pannello: tenerle in memoria per un bottone che quasi mai si preme
  // vorrebbe dire una chiamata in più a ogni caricamento della lista
  const [cartelle, setCartelle] = useState<string[]>([])
  useEffect(() => {
    if (!aperto) return
    api.stato().then(s => setCartelle(s.config.desktop?.cartelle ?? [])).catch(() => setCartelle([]))
  }, [aperto])

  const salva = async () => {
    setSalvo(true); setGuaio('')
    try { await l.salvaDocumento(c.id, { testo, nome, formato, cartella: cartella || cartelle[0] }) }
    catch (e) { setGuaio(e instanceof Error ? e.message : String(e)); setSalvo(false) }
  }

  const campo: CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '8px 11px', borderRadius: 9,
    border: '1px solid rgba(34,39,31,.16)', background: 'rgba(255,255,255,.85)',
    color: '#22271F', fontSize: '13px', fontFamily: 'inherit', outline: 'none'
  }

  if (!aperto) {
    return (
      <div style={{ marginTop: 4 }}>
        <Hov as="button" type="button" onClick={apri}
          style={{
            border: 'none', background: 'none', padding: '4px 0', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: '12.5px', color: '#8E3F1F'
          }}
          hover={{ color: '#C4623B' }}>{t('Salvala come documento…')}</Hov>
      </div>
    )
  }

  return (
    <div style={{
      marginTop: 12, padding: '13px 15px', borderRadius: 13,
      background: 'rgba(255,255,255,.7)', border: '1px solid rgba(34,39,31,.12)'
    }}>
      <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
        <input value={nome} onChange={e => setNome(e.target.value)}
          aria-label={t('Come si chiama')} placeholder={t('Come si chiama')}
          style={{ ...campo, flex: 1, minWidth: 180 }} />
        <select value={formato} onChange={e => setFormato(e.target.value)}
          aria-label={t('Word, Pages')} style={{ ...campo, width: 'auto' }}>
          <option value=".rtf">.rtf · {t('Word, Pages')}</option>
          <option value=".md">.md · Markdown</option>
          <option value=".txt">.txt · {t('testo semplice')}</option>
        </select>
      </div>

      {cartelle.length > 1 && (
        <select value={cartella || cartelle[0]} onChange={e => setCartella(e.target.value)}
          aria-label={t('Dove')} style={{ ...campo, marginTop: 9 }}>
          {cartelle.map((x: string) => <option key={x} value={x}>{x.split('/').slice(-2).join('/')}</option>)}
        </select>
      )}

      {guaio && <div style={{ fontSize: 12, color: '#8E3F1F', marginTop: 9 }}>{t(guaio)}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12 }}>
        <button type="button" onClick={salva} disabled={salvo || !nome.trim() || !cartelle.length} style={{
          padding: '9px 18px', borderRadius: 99, border: 'none',
          background: !salvo && nome.trim() && cartelle.length ? 'linear-gradient(120deg,#C4623B,#7E9C82)' : 'rgba(34,39,31,.1)',
          color: !salvo && nome.trim() && cartelle.length ? '#FFF7F0' : 'rgba(34,39,31,.35)',
          fontSize: '13px', fontWeight: 500, fontFamily: 'inherit',
          cursor: salvo ? 'default' : 'pointer'
        }}>{salvo ? t('Salvo…') : t('Salva e apri')}</button>
        <Hov as="button" type="button" onClick={() => { chiudi(); setGuaio('') }}
          style={{
            border: 'none', background: 'none', padding: '9px 4px', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: '12.5px', color: 'rgba(34,39,31,.45)'
          }}
          hover={{ color: '#22271F' }}>{t('Annulla')}</Hov>
        <div style={{ flex: 1 }} />
        {!cartelle.length && (
          <span style={{ fontSize: '11px', color: '#8E3F1F' }}>
            {t('Collega una cartella del desktop e potrò scriverci.')}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * Mandarla davvero.
 *
 * È l'unico punto di tutta l'applicazione da cui esce qualcosa. Il brief lo
 * mette come condizione, non come limite: «non agisce mai da solo. Prepara,
 * suggerisce, e una persona preme il bottone. Mandare un'email vuol dire che il
 * testo è scritto e gli allegati scelti, e l'ultimo gesto lo fa l'essere umano.
 * Non è una limitazione da togliere dopo: è la ragione per cui ci si fida
 * abbastanza da lasciarlo lavorare.»
 *
 * Quindi: si vede a chi va prima di mandarla, si vede l'oggetto, si vede il
 * testo esatto che arriverà — e sono tutti e tre modificabili, perché un campo
 * che non si può correggere è un campo di cui ci si deve fidare alla cieca.
 *
 * Ma vedere non vuol dire compilare. Se l'email è già pronta sulla riga — il
 * server la smonta quando la bozza diventa pronta — qui non c'è nessun
 * «Preparo…»: una riga con a chi va e l'oggetto, il testo che riceve, e un
 * bottone solo che dice a chi la manda. I tre campi restano a un clic, per chi
 * vuole correggere. Si aprono da soli in un caso: il destinatario manca o non
 * è mai comparso nella posta letta — è esattamente il momento in cui vale la
 * pena guardarlo due volte invece di una, e il bottone lo dice.
 *
 * Per le righe senza email pronta resta la strada di prima: si prepara quando
 * lo chiedi, e si rileggono i tre campi.
 */
type Email = { a: string; oggetto: string; corpo: string; conosciuto: boolean }

function Manda({ c, l, aperto, apri, chiudi }: { c: Compito; l: Lista } & Pannello) {
  const pronta = c.email
  const [preparo, setPreparo] = useState(false)
  const [mando, setMando] = useState(false)
  const [guaio, setGuaio] = useState('')
  const [m, setM] = useState<Email | null>(pronta)
  /** Ha chiesto di vedere i tre campi: da lì in poi restano. */
  const [tutto, setTutto] = useState(false)
  /** Il testo si sta correggendo sul posto. */
  const [scrivo, setScrivo] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)

  // L'email pronta apre il pannello da sola: è lei il gesto che aspetta una
  // persona, e la bozza sopra lo sa — il suo «Va bene» si fa di contorno.
  // Solo quando arriva, non a ogni giro: chi preme «Annulla» non se lo
  // ritrova riaperto. «Arriva» si misura sul contenuto e non sull'oggetto:
  // la lista si rilegge a ogni annuncio e ogni rilettura rifà gli oggetti,
  // e sull'oggetto il pannello si riapriva — buttando le correzioni in corso —
  // ogni volta che cambiava un'altra riga.
  const chiavePronta = pronta ? `${pronta.a}\n${pronta.oggetto}\n${pronta.corpo}` : ''
  useEffect(() => {
    setM(pronta)
    if (pronta) apri()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chiavePronta])

  useEffect(() => {
    const a = area.current
    if (!scrivo || !a) return
    a.style.height = 'auto'
    a.style.height = `${Math.min(a.scrollHeight, 400)}px`
    a.focus()
  }, [scrivo])

  const prepara = async () => {
    setPreparo(true); setGuaio('')
    try { setM(await api.preparaEmail(c.id)); setTutto(true); apri() }
    catch (e) { setGuaio(e instanceof Error ? e.message : String(e)) }
    setPreparo(false)
  }

  const manda = async () => {
    if (!m) return
    setMando(true); setGuaio('')
    // se non ha toccato niente parte quella sulla riga, com'è scritta là: il
    // server non deve fidarsi di una copia che ha fatto il giro del browser
    const uguale = !!pronta && m.a === pronta.a && m.oggetto === pronta.oggetto && m.corpo === pronta.corpo
    try { await l.manda(c.id, uguale ? undefined : { a: m.a, oggetto: m.oggetto, corpo: m.corpo }) }
    catch (e) { setGuaio(e instanceof Error ? e.message : String(e)); setMando(false) }
  }

  const campo: CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '8px 11px', borderRadius: 9,
    border: '1px solid rgba(34,39,31,.16)', background: 'rgba(255,255,255,.85)',
    color: '#22271F', fontSize: '13px', fontFamily: 'inherit', outline: 'none'
  }
  const etichetta: CSSProperties = {
    fontSize: '10.5px', letterSpacing: '.1em', textTransform: 'uppercase',
    color: 'rgba(34,39,31,.45)', marginBottom: 4
  }
  const lieve: CSSProperties = {
    border: 'none', background: 'none', padding: '4px 0', cursor: 'pointer',
    fontFamily: 'inherit', fontSize: '12.5px', color: '#8E3F1F'
  }

  if (!aperto) {
    return (
      <div style={{ marginTop: 10 }}>
        <Hov as="button" type="button" onClick={pronta ? () => { setM(pronta); apri() } : prepara} disabled={preparo}
          style={lieve}
          hover={{ color: '#C4623B' }}>
          {preparo ? t('Preparo l’email…') : t('Mandala per email…')}
        </Hov>
        {guaio && <div style={{ fontSize: 12, color: '#8E3F1F', marginTop: 6 }}>{t(guaio)}</div>}
      </div>
    )
  }

  const a = m?.a?.trim() ?? ''
  const corpo = m?.corpo?.trim() ?? ''
  // senza indirizzo, o con uno mai visto, i campi si aprono e il bottone
  // chiede di guardare: è l'unico caso in cui il gesto solo non basta
  const daControllare = !m || !a || !m.conosciuto
  const campi = tutto || daControllare
  const puo = !mando && !!a && !!corpo

  return (
    <div style={{
      marginTop: 12, padding: '13px 15px', borderRadius: 13,
      background: 'rgba(255,255,255,.7)', border: '1px solid rgba(34,39,31,.12)',
      overflow: 'hidden'
    }}>
      {campi ? (
        <>
          <div style={etichetta}>{t('A')}</div>
          <input value={m?.a ?? ''} onChange={e => setM(v => (v ? { ...v, a: e.target.value } : v))}
            placeholder={t('nome@dominio.it')} style={campo} />
          {m && !a && (
            <div style={{ fontSize: '11.5px', color: '#8E3F1F', marginTop: 5 }}>
              {t('Nel materiale non ho trovato un indirizzo: scrivilo tu.')}
            </div>
          )}
          {m && !!a && !m.conosciuto && (
            <div style={{ fontSize: '11.5px', color: '#8A6317', marginTop: 5 }}>
              {t('Non ho mai visto questo indirizzo nella tua posta. Controllalo.')}
            </div>
          )}

          <div style={{ ...etichetta, marginTop: 11 }}>{t('Oggetto')}</div>
          <input value={m?.oggetto ?? ''} onChange={e => setM(v => (v ? { ...v, oggetto: e.target.value } : v))}
            style={campo} />

          <div style={{ ...etichetta, marginTop: 11 }}>{t('Quello che riceve')}</div>
          <textarea value={m?.corpo ?? ''} onChange={e => setM(v => (v ? { ...v, corpo: e.target.value } : v))}
            rows={8} style={{ ...campo, lineHeight: 1.55, resize: 'vertical' }} />
        </>
      ) : (
        <>
          {/* a chi e cosa, in una riga che non può sforare: un indirizzo lungo si tronca, non spinge */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
            <div style={{
              flex: 1, minWidth: 0, fontSize: '12.5px', color: 'rgba(34,39,31,.6)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
            }}>
              {t('A')} <span style={{ color: '#22271F', fontWeight: 500 }}>{a}</span>
              {m?.oggetto ? <> · <span style={{ color: '#22271F' }}>{m.oggetto}</span></> : null}
            </div>
            <Hov as="button" type="button" onClick={() => setTutto(true)}
              style={{ ...lieve, flex: 'none', padding: 0, color: 'rgba(34,39,31,.45)' }}
              hover={{ color: '#22271F' }}>{t('Modifica')}</Hov>
          </div>

          {scrivo ? (
            <textarea
              ref={area}
              value={m?.corpo ?? ''}
              onChange={e => {
                setM(v => (v ? { ...v, corpo: e.target.value } : v))
                e.target.style.height = 'auto'
                e.target.style.height = `${Math.min(e.target.scrollHeight, 400)}px`
              }}
              onBlur={() => setScrivo(false)}
              onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setScrivo(false) } }}
              aria-label={t('Quello che riceve')}
              style={{ ...campo, marginTop: 9, lineHeight: 1.55, resize: 'none', maxHeight: 400, overflowY: 'auto' }} />
          ) : (
            // il testo si corregge toccandolo, come la bozza qui sopra
            <div role="button" tabIndex={0} onClick={() => setScrivo(true)}
              onKeyDown={e => { if (e.key === 'Enter') setScrivo(true) }}
              title={t('Modifica')}
              style={{
                marginTop: 9, fontSize: '13.5px', lineHeight: 1.55, color: '#22271F',
                whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', overflow: 'hidden',
                maxHeight: 300, overflowY: 'auto', cursor: 'text'
              }}>{m?.corpo}</div>
          )}
        </>
      )}

      {guaio && <div style={{ fontSize: 12, color: '#8E3F1F', marginTop: 9, overflowWrap: 'anywhere' }}>{t(guaio)}</div>}

      {/* la riga va a capo prima di stringere il bottone: «Manda a nome@…» è
          l'unica cosa che qui deve leggersi per intero, e la nota in fondo
          può scendere sotto senza perdere niente */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12, minWidth: 0, flexWrap: 'wrap' }}>
        <button type="button" onClick={manda} disabled={!puo} style={{
          padding: '9px 20px', borderRadius: 99, border: 'none',
          background: puo ? 'linear-gradient(120deg,#C4623B,#7E9C82)' : 'rgba(34,39,31,.1)',
          color: puo ? '#FFF7F0' : 'rgba(34,39,31,.35)',
          fontSize: '13px', fontWeight: 500, fontFamily: 'inherit',
          cursor: puo ? 'pointer' : 'default',
          // l'indirizzo sta dentro il bottone: lungo, si tronca — non esce dal riquadro
          maxWidth: '100%', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
        }}>{mando ? t('Mando…') : daControllare ? t('Controlla e manda') : frasi.mandaA(a)}</button>
        <Hov as="button" type="button" onClick={() => { chiudi(); setGuaio(''); setScrivo(false) }}
          style={{
            border: 'none', background: 'none', padding: '9px 4px', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: '12.5px', color: 'rgba(34,39,31,.45)', flex: 'none'
          }}
          hover={{ color: '#22271F' }}>{t('Annulla')}</Hov>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '11px', color: 'rgba(34,39,31,.35)', flex: 'none', whiteSpace: 'nowrap', marginLeft: 'auto' }}>
          {pronta?.rispondeA ? t('Risponde nel filo del suo messaggio.') : t('parte dalla tua casella')}
        </span>
      </div>
    </div>
  )
}

/**
 * Un gruppo: l'etichetta e le sue righe. Vuoto, non si disegna.
 *
 * E qui si trascina. Sotto c'era già tutto — le chiavi frazionarie di
 * `ordine.ts`, la rotta che sposta fra due vicini, il metodo del client, il
 * ritorno indietro se il server dice di no — costruito con cura e provato con
 * duecento righe di test. Non c'era solo il gesto: nessun componente chiamava
 * `l.sposta`, quindi nessuna riga si poteva muovere. Duecento righe di algoritmo
 * per una cosa che non si poteva fare.
 *
 * Si mandano i *vicini*, non una posizione: una posizione calcolata su una
 * lista vecchia di due secondi mette la riga nel posto sbagliato, e il giorno
 * che la stessa lista vive anche su un telefono lo fa sempre.
 */
function Gruppo({ s, l, stretta, modifica }: { s: Secchio; l: Lista; stretta: boolean; modifica: (c: Compito) => void }) {
  const righe = l.perSecchio(s)
  // l'id della riga davanti alla quale si andrebbe a cadere, per disegnare il filo
  const [bersaglio, setBersaglio] = useState<string | null>(null)
  if (!righe.length) return null

  /** Chi finisce sopra e chi sotto, calcolati senza la riga che si sta spostando. */
  const lascia = (id: string, primaDi: string | null) => {
    setBersaglio(null)
    if (!id) return
    const senza = righe.filter(c => c.id !== id)
    const k = primaDi === null ? senza.length : Math.max(0, senza.findIndex(c => c.id === primaDi))
    const sopra = senza[k - 1]?.id ?? null
    const sotto = senza[k]?.id ?? null
    // spostarla dove già sta non è un movimento: non si disturba il server
    if (sopra === null && sotto === null) return
    l.sposta(id, sopra, sotto, s)
  }

  const filo = (acceso: boolean): CSSProperties => ({
    height: 2, margin: '0 10px 4px', borderRadius: 2,
    background: acceso ? '#C4623B' : 'transparent',
    boxShadow: acceso ? '0 0 10px rgba(196,98,59,.55)' : 'none',
    transition: 'background .12s, box-shadow .12s'
  })

  return (
    <section style={{ ...FERMO, marginTop: 24 }}>
      <h2 style={{ ...LABEL, display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 4px 9px', margin: 0 }}>
        {t(NOME[s])}
        {/* il conto accanto al titolo: con le righe staccate la lunghezza di un
            gruppo non si legge più a colpo d'occhio come in un blocco chiuso */}
        <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: 'none', color: 'rgba(34,39,31,.38)' }}>
          {righe.length}
        </span>
      </h2>
      {/*
        Niente più cassa attorno alle righe.

        Era un blocco di vetro con dentro dei fili grigi, e faceva sembrare le
        cose da fare le celle di una tabella. Adesso il vetro ce l'ha ognuna, e
        fra una e l'altra c'è aria: è la differenza fra un elenco e una pila di
        cose, e una pila la si guarda una alla volta.

        Il segno del trascinamento sta *dentro* lo spazio fra due righe e occupa
        due pixel anche da spento, così accendendosi non spinge giù mezza lista.
      */}
      <ul
        style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setBersaglio(null) }}>
        {righe.map(c => (
          <div key={c.id}
            onDragOver={e => { e.preventDefault(); setBersaglio(c.id) }}
            onDrop={e => { e.preventDefault(); lascia(e.dataTransfer.getData('text/plain'), c.id) }}>
            <div style={filo(bersaglio === c.id)} />
            <Riga c={c} l={l} stretta={stretta} modifica={modifica} />
          </div>
        ))}
        {/* l'ultimo pezzo di lista: lasciarla qui vuol dire «in fondo» */}
        <div
          onDragOver={e => { e.preventDefault(); setBersaglio('*fondo*') }}
          onDrop={e => { e.preventDefault(); lascia(e.dataTransfer.getData('text/plain'), null) }}
          style={{ paddingBottom: 2 }}>
          <div style={filo(bersaglio === '*fondo*')} />
        </div>
      </ul>
    </section>
  )
}

/**
 * Quello che hai chiuso.
 *
 * In fondo alla pagina e in punta di piedi: è archivio, e un archivio che si
 * fa notare è un archivio che ti fa guardare indietro invece che avanti. Una
 * riga sola, grigia, che si apre se la cerchi.
 */
function Fatte({ l, aperto, apri }: { l: Lista; aperto: boolean; apri: () => void }) {
  if (!l.chiusi.length) return null

  return (
    <section style={{ ...FERMO, marginTop: 40 }}>
      <Hov as="button" type="button" onClick={apri} aria-expanded={aperto}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '0 4px 8px', border: 'none',
          background: 'none', cursor: 'pointer', fontFamily: 'inherit',
          fontSize: '12px', color: 'rgba(34,39,31,.34)'
        }}
        hover={{ color: 'rgba(34,39,31,.62)' }}>
        <span aria-hidden="true" style={{ display: 'flex', transform: aperto ? 'none' : 'rotate(-90deg)', transition: 'transform .2s' }}>
          <IconGiu size={9} stroke="currentColor" />
        </span>
        {frasi.fatteConteggio(l.chiusi.length)}
      </Hov>

      {aperto && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {l.chiusi.map(c => (
            <Hov key={c.id} as="li" style={{
              display: 'flex', gap: 10, alignItems: 'center', padding: '6px 16px', borderRadius: 9
            }} hover={{ background: 'rgba(255,255,255,.42)' }}>
              <span aria-hidden="true" style={{ flex: 'none', display: 'flex', color: 'rgba(34,39,31,.26)' }}>
                <IconSpunta size={11} />
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: '12.5px', color: 'rgba(34,39,31,.42)', overflowWrap: 'anywhere' }}>{c.testo}</span>
              <Hov as="button" type="button" onClick={() => l.riapri(c.id)}
                style={{
                  flex: 'none', border: 'none', background: 'none', padding: '0 2px', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: '11.5px', color: 'rgba(34,39,31,.3)'
                }}
                hover={{ color: '#8E3F1F' }}>{t('rimettila')}</Hov>
            </Hov>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * Quando oggi è finito.
 *
 * Una lista che a serbatoio vuoto non dice niente ti lascia lì. Se nella
 * settimana c'è qualcosa, se ne prende una e te la offre — così portarsi avanti
 * è un clic e non una decisione. Se non c'è più niente da nessuna parte, lo
 * dice e si toglie di mezzo: è l'unico momento in cui questa app ha il diritto
 * di suggerirti di smettere.
 */
const RIPOSI = [
  'Vai a fare un giro.',
  'Prenditi il pomeriggio.',
  'Chiama qualcuno che non senti da un po\'.',
  'Esci prima.'
]

function Finito({ l }: { l: Lista }) {
  const prossima = l.compiti.find(c => c.quando === 'settimana') ?? l.compiti.find(c => c.quando === 'poi')

  if (prossima) {
    return (
      <div style={{ ...FERMO, marginTop: 22, padding: '0 4px', display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '14px', color: 'rgba(34,39,31,.62)' }}>{t('Oggi è finito.')}</span>
        <Hov as="button" type="button"
          onClick={() => l.cambia(prossima.id, { quando: 'oggi', giorno: giornoLocale() })}
          style={{
            border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
            fontSize: '14px', color: '#8E3F1F', textAlign: 'left'
          }}
          hover={{ color: '#C4623B' }}>
          {t('Ti porti avanti con')} «{prossima.testo}»?
        </Hov>
      </div>
    )
  }

  // la stessa per tutto il giorno: cambiare frase a ogni ridisegno sarebbe
  // un tic, non un consiglio
  const quale = RIPOSI[new Date().getDate() % RIPOSI.length]
  return (
    <div style={{ ...FERMO, marginTop: 26, padding: '0 4px', fontSize: '14px', color: 'rgba(34,39,31,.5)' }}>
      {t(quale)}
    </div>
  )
}

export function Oggi({ l, oggi, lingua, giroFatto, segnaGiro, apriGuida }: {
  l: Lista; oggi: string; lingua: string; giroFatto: boolean; segnaGiro: () => void
  /** La guida sta dentro l'app: era un indirizzo privato su claude.ai, e non si apriva a nessuno. */
  apriGuida: () => void
}) {
  const [fatteAperte, setFatteAperte] = useState(false)
  const [vista, setVista] = useState<'calendario' | 'lista'>('calendario')
  const [giorno, setGiorno] = useState(giornoLocale)
  const [senzaData, setSenzaData] = useState(false)
  const [modifica, setModifica] = useState<Compito | null>(null)
  const [dataOggi, setDataOggi] = useState(giornoLocale)
  useEffect(() => {
    const aggiorna = () => setDataOggi(giornoLocale())
    const timer = window.setInterval(aggiorna, 60_000)
    window.addEventListener('focus', aggiorna)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', aggiorna) }
  }, [])
  const larghezza = useLarghezza()
  // sotto questa soglia la finestra è una colonna stretta di lato, non una
  // finestra: cambia il titolo, i margini e la larghezza delle tre colonne
  const stretta = larghezza < 560
  const [festa, setFesta] = useState(0)
  // la prima volta si apre da solo — e «prima volta» vuol dire per account,
  // scritto nel profilo: prima stava nel localStorage della finestra, e ogni
  // finestra nuova era una «prima volta» daccapo. Era il giro che ripartiva
  // a ogni apertura.
  const [giro, setGiro] = useState(() => !giroFatto)
  const erano = useRef(-1)
  const chiuseErano = useRef(-1)

  const vuota = !l.compiti.length
  const oggiFinito = !vuota && !l.perSecchio('oggi').length

  /**
   * I coriandoli scendono quando spunti l'ultima riga. Due condizioni, tutte e
   * due necessarie: la lista si è svuotata, *e* si è svuotata perché hai
   * chiuso qualcosa. Prima bastava che il conto delle cose da fare andasse a
   * zero — e ci andava anche quando lui consegnava una bozza, che è il momento
   * in cui il lavoro comincia, non quello in cui finisce.
   */
  useEffect(() => {
    if (!l.caricato) return
    const vive = l.compiti.length
    if (erano.current > 0 && vive === 0 && l.chiusi.length > chiuseErano.current) setFesta(Date.now())
    erano.current = vive
    chiuseErano.current = l.chiusi.length
  }, [l.compiti.length, l.chiusi.length, l.caricato])

  const destinazione = (quando: Secchio, esplicito = false): { data: string | null; secchio: Secchio } => {
    if (esplicito || vista === 'lista') return { data: quando === 'oggi' ? dataOggi : null, secchio: quando }
    const data = senzaData ? null : giorno
    return { data, secchio: secchioDelGiorno(data) }
  }
  const aggiungi = async (testo: string, quando: Secchio, modo: Modo | null, esplicito = false) => {
    const { data, secchio } = destinazione(quando, esplicito)
    const id = await l.aggiungi(testo, secchio, data)
    // «/bozza», «/myynd» e «/prompt» scrivono e affidano nello stesso gesto
    if (id && modo) l.delega(id, modo)
  }

  /** Una lista incollata: una riga per cosa, e il comando scelto vale per tutte. */
  const aggiungiRighe = async (righe: string[], quando: Secchio, modo: Modo | null, esplicito = false) => {
    const { data, secchio } = destinazione(quando, esplicito)
    const ids = await l.aggiungiTante(righe, secchio, data)
    if (modo) for (const id of ids) l.delega(id, modo)
  }

  return (
    // il fondo si può afferrare: è così che si sposta la finestra. Tutto quello
    // che si tocca dentro dice «no-drag», altrimenti non lo tocchi più
    <div style={{ ...SPOSTA, width: vista === 'calendario' ? 1480 : 780, maxWidth: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: stretta ? 24 : 34 }} />

      <div style={{ ...SPOSTA, padding: stretta ? '0 2px 20px' : '0 4px 26px' }}>
        <h1 style={{
          fontSize: stretta ? 26 : 36, lineHeight: 1.1, letterSpacing: '-.032em', margin: 0, fontWeight: 400
        }}>
          {!l.caricato ? '\u00A0'
            : l.guasto ? t('Qualcosa non va.')
            // aver finito e non aver mai cominciato non sono la stessa cosa,
            // e sotto i coriandoli si vede la differenza
            : vuota ? (l.chiusi.length ? t('Fatto tutto.') : t('Niente in lista.'))
            : l.daFare === 0 ? t('Tutto pronto.')
            : frasi.daFare(l.daFare)}
        </h1>
        <div style={{
          marginTop: 9, fontSize: '12.5px', fontWeight: 500, letterSpacing: '.02em',
          color: 'rgba(34,39,31,.5)', textTransform: 'capitalize'
        }}>{oggi}</div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <div className="task-view-toggle" role="group" aria-label={t('Vista attività')}>
          <button type="button" aria-pressed={vista === 'calendario'} onClick={() => setVista('calendario')}>{t('Calendario')}</button>
          <button type="button" aria-pressed={vista === 'lista'} onClick={() => setVista('lista')}>{t('Lista')}</button>
        </div>
      </div>
      <Barra aggiungi={aggiungi} aggiungiRighe={aggiungiRighe} mostraFatte={() => setFatteAperte(a => !a)}
        giorno={vista === 'calendario' && !senzaData ? giorno : undefined} lingua={lingua} />

      {l.guasto && (
        <div style={{ ...FERMO, marginTop: 22, padding: '0 4px', fontSize: '13.5px', color: '#8E3F1F' }}>{t(l.guasto)}</div>
      )}

      {l.caricato && !l.guasto && vista === 'calendario' && <Calendario compiti={l.compiti} oggi={dataOggi}
        giorno={giorno} scegli={setGiorno} lingua={lingua} senzaData={senzaData} setSenzaData={setSenzaData}
        pianifica={(id, data) => { void l.cambia(id, { giorno: data, quando: secchioDelGiorno(data) }) }}
        renderRiga={c => <CartaCalendario key={c.id} c={c} l={l} modifica={setModifica} />} />}

      {vista === 'calendario' && l.compiti.filter(c => l.aperti.has(c.id) && (c.stato === 'pronto' || c.stato === 'chiede')).map(c =>
        <section key={c.id} id={`task-result-${c.id}`} className="task-calendar-result"><ul className="task-agenda-list"><Riga c={c} l={l} stretta={stretta} modifica={setModifica} /></ul></section>)}

      {l.caricato && !l.guasto && !vuota && vista === 'lista' && (
        <>
          {/*
            Le intestazioni delle colonne, una volta sola in cima.

            L'imbottitura non è la stessa delle righe ed è di proposito: una
            riga adesso ha un bordo di un pixel, e il bordo sta fuori dalla sua
            imbottitura. Perché le tre caselle cadano esattamente sotto le tre
            parole, qui bisogna aggiungere quel pixel da tutt'e due le parti —
            se un giorno cambia l'imbottitura delle righe, va cambiata anche
            questa, o le colonne scivolano via di poco. Che è il modo peggiore:
            abbastanza poco da non vederlo, abbastanza da sentirlo storto.
          */}
          <div style={{ ...griglia(stretta), ...FERMO, marginTop: 30, padding: stretta ? '0 11px 0 19px' : '0 16px 0 23px' }}>
            <span />
            {MODI.map(m => (
              <span key={m.id} style={{
                ...LABEL, textAlign: 'center', color: 'rgba(34,39,31,.4)',
                // con la spaziatura piena «MYYND» è più largo della sua colonna
                // e le tre etichette si toccano
                fontSize: stretta ? '8.5px' : '9.5px',
                letterSpacing: stretta ? '.04em' : '.1em'
              }}>{t(m.nome)}</span>
            ))}
          </div>

          {SECCHI.map(s => <Gruppo key={s} s={s} l={l} stretta={stretta} modifica={setModifica} />)}
          {oggiFinito && <Finito l={l} />}
        </>
      )}

      <Fatte l={l} aperto={fatteAperte} apri={() => setFatteAperte(a => !a)} />

      <div style={{ ...SPOSTA, flex: 1, minHeight: 40 }} />
      <div style={{ ...FERMO, padding: '0 4px 24px' }}>
        <Hov as="button" type="button" onClick={() => setGiro(true)}
          style={{
            border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
            fontSize: '11.5px', color: 'rgba(34,39,31,.3)'
          }}
          hover={{ color: '#8E3F1F' }}>{t('Come funziona')}</Hov>
        {!desktop() && <Hov as="a" href="#" onClick={(e: React.MouseEvent) => { e.preventDefault(); apriGuida() }}
          style={{ marginLeft: 14, fontSize: '11.5px', color: 'rgba(34,39,31,.3)', textDecoration: 'none' }}
          hover={{ color: '#8E3F1F' }}>{t('La guida')}</Hov>}
      </div>

      <Coriandoli quando={festa} finito={() => setFesta(0)} />
      {modifica && <Dettaglio c={modifica} l={l} chiudi={() => setModifica(null)} />}
      {giro && <Giro lingua={lingua} chiudi={() => { setGiro(false); segnaGiro() }} festa={() => setFesta(Date.now())} />}
    </div>
  )
}
