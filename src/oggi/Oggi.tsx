// Oggi — la lista.
//
// Una riga, e tre colonne: la faccio io, me ne fai una bozza, te ne occupi tu
// fino in fondo. Non è un menù nascosto sotto il mouse — sono tre caselle in
// colonna, e si vede a colpo d'occhio quanto di questa giornata sta in mano
// tua e quanto in mano sua. È tutto il prodotto in una griglia.
//
// Poche parole, di proposito. Una lista di cose da fare che ti spiega sé stessa
// è una lista che non stai leggendo.

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Hov, LABEL, PILL, useLarghezza } from '../ui'
import { frasi, t } from '../lingua'
import { IconCestino, IconGiu, IconSpunta } from '../icons'
import { Glifo } from '../components/Stato'
import { Testo } from '../Testo'
import { SECCHI, type Lista, type Secchio } from './useCompiti'
import { Barra } from './Barra'
import { Coriandoli } from './Coriandoli'
import { Giro } from './Giro'
import { api, type Compito } from '../api'

const NOME: Record<Secchio, string> = { oggi: 'Oggi', settimana: 'Questa settimana', poi: 'Prima o poi' }

/** La guida, per chi la cerca. Si apre nel browser, non dentro la finestra. */
const GUIDA = 'https://claude.ai/code/artifact/101d7d6e-5755-4149-a88a-cb53ac516b1b'

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

/** Cambiare il testo di una riga. Niente di più: il resto sta nelle colonne. */
function Modifica({ c, l, chiudi }: { c: Compito; l: Lista; chiudi: () => void }) {
  const [testo, setTesto] = useState(c.testo)
  const salva = () => {
    const pulito = testo.trim()
    if (pulito && pulito !== c.testo) l.cambia(c.id, { testo: pulito })
    chiudi()
  }
  return (
    <input
      autoFocus
      value={testo}
      onChange={e => setTesto(e.target.value)}
      onBlur={salva}
      onKeyDown={e => {
        if (e.key === 'Enter') salva()
        if (e.key === 'Escape') { e.stopPropagation(); chiudi() }
      }}
      aria-label={t('Il testo della riga')}
      style={{
        width: '100%', boxSizing: 'border-box', padding: '2px 6px', marginLeft: -7,
        borderRadius: 7, border: '1px solid rgba(34,39,31,.2)', background: '#FFFDF9',
        color: '#22271F', fontSize: '14.5px', fontFamily: 'inherit', outline: 'none'
      }} />
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
function Riga({ c, l, stretta }: { c: Compito; l: Lista; stretta: boolean }) {
  const [sopra, setSopra] = useState(false)
  const [dentro, setDentro] = useState(false)
  const [modifico, setModifico] = useState(false)
  /** Vera solo mentre tieni premuta la striscia: vedi il commento lì sotto. */
  const [afferrata, setAfferrata] = useState(false)
  const aperto = l.aperti.has(c.id)
  const pronto = c.stato === 'pronto'
  const chiede = c.stato === 'chiede'
  const delegato = c.stato === 'delegato'
  const aspetta = pronto || chiede
  const mostra = sopra || dentro
  const col = tinta(c)

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
      onMouseEnter={() => setSopra(true)}
      onMouseLeave={() => setSopra(false)}
      onFocus={() => setDentro(true)}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDentro(false) }}>

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
          {modifico ? (
            <Modifica c={c} l={l} chiudi={() => setModifico(false)} />
          ) : (
            <Hov as="button" type="button" onClick={() => setModifico(true)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', border: 'none',
                background: 'none', padding: 0, fontFamily: 'inherit', cursor: 'text',
                fontSize: '14.5px', lineHeight: 1.4, overflowWrap: 'anywhere',
                color: delegato ? 'rgba(34,39,31,.6)' : '#22271F'
              }}
              hover={{ color: '#8E3F1F' }}>{c.testo}</Hov>
          )}

          {c.guaio && (
            <div style={{ fontSize: '12px', color: '#8E3F1F', marginTop: 3 }}>{t(c.guaio)}</div>
          )}
        </div>

        {aspetta && (
          <Hov as="button" type="button" onClick={() => l.apriChiudi(c.id)} aria-expanded={aperto}
            style={{ ...PILL, flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontFamily: 'inherit' }}
            hover={{ background: 'rgba(196,98,59,.22)' }}>
            {/* «pronta» su una riga che in realtà ti sta chiedendo una cosa era
                la bugia più grossa dell'app: leggevi «fatto» dove c'era scritto
                «non posso». Adesso le due cose hanno due nomi. */}
            {chiede ? t('ti chiede') : t('pronta')}
            <span aria-hidden="true" style={{ display: 'flex', transform: aperto ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
              <IconGiu size={10} stroke="currentColor" />
            </span>
          </Hov>
        )}

        <Hov as="button" type="button" onClick={() => l.elimina(c.id)}
          title={t('Toglila')} aria-label={t('Toglila')}
          style={{
            flex: 'none', width: 20, height: 20, display: 'grid', placeItems: 'center', border: 'none',
            background: 'none', padding: 0, cursor: 'pointer', color: 'rgba(34,39,31,.35)',
            opacity: mostra ? 1 : 0, pointerEvents: mostra ? 'auto' : 'none', transition: 'opacity .15s'
          }}
          hover={{ color: '#8E3F1F' }}><IconCestino size={11} /></Hov>
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
          <div style={{ fontSize: '13.5px', color: '#22271F', marginBottom: 7 }}>{q.domanda}</div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {q.opzioni.map(o => {
              const presa = scelte[i]?.has(o)
              return (
                <Hov as="button" key={o} type="button" onClick={() => tocca(i, o, q.multipla)}
                  style={{
                    padding: '7px 13px', borderRadius: 99, fontFamily: 'inherit', fontSize: '12.5px',
                    cursor: 'pointer',
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
              <div style={{ fontSize: '12px', color: 'rgba(34,39,31,.5)', marginTop: 1 }}>{v.perche}</div>
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
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) l.chiudi(c.id, t('Mandata.'), testo)
          }}
          aria-label={t('La bozza')}
          style={{
            width: '100%', boxSizing: 'border-box', border: 'none', background: 'none', outline: 'none',
            resize: 'none', color: '#22271F', fontSize: '14px', lineHeight: 1.6,
            fontFamily: 'inherit', maxHeight: 400, overflowY: 'auto'
          }} />
      ) : (
        <div style={{
          fontSize: '14px', lineHeight: 1.6, color: '#22271F', whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere', maxHeight: 340, overflowY: 'auto'
        }}>
          <Testo testo={testo} fonti={c.fonti ?? []} />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 13 }}>
        <Hov as="button" type="button" onClick={() => l.chiudi(c.id, t('Mandata.'), testo)}
          style={{
            padding: '8px 17px', borderRadius: 99, border: 'none',
            background: 'linear-gradient(120deg,#C4623B,#7E9C82)', color: '#FFF7F0',
            fontSize: '13px', fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer'
          }}
          hover={{ opacity: 0.92 }}>{t('Va bene')}</Hov>

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

      <Manda c={c} l={l} />
      <Salva c={c} l={l} testo={testo} />
      <Lavora c={c} l={l} />
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
function Lavora({ c, l }: { c: Compito; l: Lista }) {
  const [pronto, setPronto] = useState<{ pronto: boolean; cartelle: string[] } | null>(null)
  const [aperto, setAperto] = useState(false)
  const [cartella, setCartella] = useState('')
  const [gira, setGira] = useState<'' | 'piano' | 'fai'>('')
  const [guaio, setGuaio] = useState('')
  // vero dopo il primo passo: è quello che sblocca «fallo davvero»
  const [pianoFatto, setPianoFatto] = useState(false)

  useEffect(() => {
    if (!aperto || pronto) return
    api.lavoroPronto().then(setPronto).catch(() => setPronto({ pronto: false, cartelle: [] }))
  }, [aperto, pronto])

  const vai = async (passo: 'piano' | 'fai') => {
    setGira(passo); setGuaio('')
    try {
      const r = await l.lavora(c.id, { cartella: cartella || pronto?.cartelle[0] || '', passo })
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
    return (
      <div style={{ marginTop: 4 }}>
        <Hov as="button" type="button" onClick={() => setAperto(true)}
          style={{
            border: 'none', background: 'none', padding: '4px 0', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: '12.5px', color: '#8E3F1F'
          }}
          hover={{ color: '#C4623B' }}>{t('Falla fare a Claude Code…')}</Hov>
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

            <Hov as="button" type="button" onClick={() => { setAperto(false); setGuaio('') }}
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
function Salva({ c, l, testo }: { c: Compito; l: Lista; testo: string }) {
  const [aperto, setAperto] = useState(false)
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
        <Hov as="button" type="button" onClick={() => setAperto(true)}
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
        <Hov as="button" type="button" onClick={() => { setAperto(false); setGuaio('') }}
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
 * L'avviso sul destinatario sconosciuto non blocca niente. Dice solo che quel
 * nome nella tua posta non c'è mai stato, che è esattamente il momento in cui
 * vale la pena guardarlo due volte invece di una.
 */
function Manda({ c, l }: { c: Compito; l: Lista }) {
  const [aperto, setAperto] = useState(false)
  const [preparo, setPreparo] = useState(false)
  const [mando, setMando] = useState(false)
  const [guaio, setGuaio] = useState('')
  const [m, setM] = useState<{ a: string; oggetto: string; corpo: string; conosciuto: boolean } | null>(null)

  const prepara = async () => {
    setPreparo(true); setGuaio('')
    try { setM(await api.preparaEmail(c.id)); setAperto(true) }
    catch (e) { setGuaio(e instanceof Error ? e.message : String(e)) }
    setPreparo(false)
  }

  const manda = async () => {
    if (!m) return
    setMando(true); setGuaio('')
    try { await l.manda(c.id, { a: m.a, oggetto: m.oggetto, corpo: m.corpo }) }
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

  if (!aperto) {
    return (
      <div style={{ marginTop: 10 }}>
        <Hov as="button" type="button" onClick={prepara} disabled={preparo}
          style={{
            border: 'none', background: 'none', padding: '4px 0', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: '12.5px', color: '#8E3F1F'
          }}
          hover={{ color: '#C4623B' }}>
          {preparo ? t('Preparo l’email…') : t('Mandala per email…')}
        </Hov>
        {guaio && <div style={{ fontSize: 12, color: '#8E3F1F', marginTop: 6 }}>{t(guaio)}</div>}
      </div>
    )
  }

  return (
    <div style={{
      marginTop: 12, padding: '13px 15px', borderRadius: 13,
      background: 'rgba(255,255,255,.7)', border: '1px solid rgba(34,39,31,.12)'
    }}>
      <div style={etichetta}>{t('A')}</div>
      <input value={m?.a ?? ''} onChange={e => setM(v => (v ? { ...v, a: e.target.value } : v))}
        placeholder={t('nome@dominio.it')} style={campo} />
      {m && !m.a && (
        <div style={{ fontSize: '11.5px', color: '#8E3F1F', marginTop: 5 }}>
          {t('Nel materiale non ho trovato un indirizzo: scrivilo tu.')}
        </div>
      )}
      {m && !!m.a && !m.conosciuto && (
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

      {guaio && <div style={{ fontSize: 12, color: '#8E3F1F', marginTop: 9 }}>{t(guaio)}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12 }}>
        <button type="button" onClick={manda} disabled={mando || !m?.a?.trim() || !m?.corpo?.trim()} style={{
          padding: '9px 20px', borderRadius: 99, border: 'none',
          background: !mando && m?.a?.trim() && m?.corpo?.trim() ? 'linear-gradient(120deg,#C4623B,#7E9C82)' : 'rgba(34,39,31,.1)',
          color: !mando && m?.a?.trim() && m?.corpo?.trim() ? '#FFF7F0' : 'rgba(34,39,31,.35)',
          fontSize: '13px', fontWeight: 500, fontFamily: 'inherit',
          cursor: mando ? 'default' : 'pointer'
        }}>{mando ? t('Mando…') : t('Manda')}</button>
        <Hov as="button" type="button" onClick={() => { setAperto(false); setGuaio('') }}
          style={{
            border: 'none', background: 'none', padding: '9px 4px', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: '12.5px', color: 'rgba(34,39,31,.45)'
          }}
          hover={{ color: '#22271F' }}>{t('Annulla')}</Hov>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '11px', color: 'rgba(34,39,31,.35)' }}>{t('parte dalla tua casella')}</span>
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
function Gruppo({ s, l, stretta }: { s: Secchio; l: Lista; stretta: boolean }) {
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
            <Riga c={c} l={l} stretta={stretta} />
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
          onClick={() => l.cambia(prossima.id, { quando: 'oggi' })}
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

export function Oggi({ l, oggi, lingua, giroFatto, segnaGiro }: {
  l: Lista; oggi: string; lingua: string; giroFatto: boolean; segnaGiro: () => void
}) {
  const [fatteAperte, setFatteAperte] = useState(false)
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

  const aggiungi = async (testo: string, quando: Secchio, modo: 'bozza' | 'tutto' | null) => {
    const id = await l.aggiungi(testo, quando)
    // «/bozza» e «/tutto» scrivono e affidano nello stesso gesto
    if (id && modo) l.delega(id, modo)
  }

  return (
    // il fondo si può afferrare: è così che si sposta la finestra. Tutto quello
    // che si tocca dentro dice «no-drag», altrimenti non lo tocchi più
    <div style={{ ...SPOSTA, width: 660, maxWidth: '100%', display: 'flex', flexDirection: 'column' }}>
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

      <Barra aggiungi={aggiungi} mostraFatte={() => setFatteAperte(a => !a)} />

      {l.guasto && (
        <div style={{ ...FERMO, marginTop: 22, padding: '0 4px', fontSize: '13.5px', color: '#8E3F1F' }}>{t(l.guasto)}</div>
      )}

      {l.caricato && !l.guasto && !vuota && (
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

          {SECCHI.map(s => <Gruppo key={s} s={s} l={l} stretta={stretta} />)}
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
        <Hov as="a" href={GUIDA} target="_blank" rel="noreferrer"
          style={{ marginLeft: 14, fontSize: '11.5px', color: 'rgba(34,39,31,.3)', textDecoration: 'none' }}
          hover={{ color: '#8E3F1F' }}>{t('La guida')}</Hov>
      </div>

      <Coriandoli quando={festa} finito={() => setFesta(0)} />
      {giro && <Giro lingua={lingua} chiudi={() => { setGiro(false); segnaGiro() }} festa={() => setFesta(Date.now())} />}
    </div>
  )
}
