// Il corredo di P5: un campo, un bottone, una scelta, un interruttore, una
// scheda. Uno solo di ciascuno, per le Preferenze, la Memoria e quello che
// verrà: stesso disegno, stessi tasti, e ogni pressione si vede subito.
//
// Le regole stanno in src/campo.ts (provate sotto node); qui c'è il disegno.
// Le classi stanno in src/index.css, fra i segni «P5: forme».

import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from 'react'
import { daSalvare, iniziale, riduci, sporco as eSporco, tastiCampo, tastiScelte, type Azione, type StatoCampo } from '../campo.ts'
import { t } from '../lingua'
import { IconSpunta } from '../icons'

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '')

/** La scatola della barra: il fondo, il bordo che si accende quando ci scrivi. Niente vetro, se non `libera`. */
export function Scatola({ children, libera, spento, className }: { children: ReactNode; libera?: boolean; spento?: boolean; className?: string }) {
  return <div className={`f-scatola${libera ? ' libera' : ''}${spento ? ' spento' : ''}${className ? ` ${className}` : ''}`}>{children}</div>
}

export function Etichetta({ children, per, id }: { children: ReactNode; per?: string; id?: string }) {
  return <label className="f-etichetta" htmlFor={per} id={id}>{children}</label>
}

/** La spunta che dice «l'ho salvato», e se ne va da sola. Una sola, per tutta l'app. */
export function Salvato({ mostra }: { mostra: boolean }) {
  return (
    <span className="f-salvato" aria-live="polite" style={{ opacity: mostra ? 1 : 0 }}>
      {mostra && <><IconSpunta size={11} />{t('Salvato')}</>}
    </span>
  )
}

let contatore = 0
const nuovoId = (base: string) => `${base}-${++contatore}`

/** Il campo dopo questo nella stessa scheda (o nella pagina): «avanti» ci porta il fuoco. */
function prossimoCampo(da: HTMLElement) {
  const dentro = da.closest('.f-carta') ?? document
  const tutti = [...dentro.querySelectorAll<HTMLElement>('.f-scatola input, .f-scatola textarea')]
  const i = tutti.indexOf(da)
  tutti[i + 1]?.focus()
}

/**
 * Un campo che si salva da sé: lasciandolo, con Invio (una riga) o ⌘Invio
 * (un testo lungo). La spunta c'è prima della risposta del server; se il
 * server dice di no, il guaio si dice sotto e resta quello che hai scritto.
 */
export function Campo({ etichetta, etichettaDa, valore, salva, esempio, righe = 1, limite, vuotoVietato, avanti, disabilitato, id }: {
  etichetta?: string
  /** L'id di un titolo visibile che fa da etichetta (il titolo della scheda). */
  etichettaDa?: string
  valore: string
  salva: (v: string) => Promise<void>
  /** Solo un esempio: l'etichetta è sopra, o è il titolo. */
  esempio?: string
  righe?: number
  limite?: number
  vuotoVietato?: boolean
  /** Invio porta al campo dopo invece di salvare. */
  avanti?: boolean
  disabilitato?: boolean
  id?: string
}) {
  const [s, setS] = useState<StatoCampo>(() => iniziale(valore))
  const vero = useRef(s)
  vero.current = s
  const [rimetti, setRimetti] = useState(false)
  const idCampo = useRef(id ?? nuovoId('campo')).current
  const multilinea = righe >= 2
  const orologi = useRef<ReturnType<typeof setTimeout>[]>([])
  const salvaRef = useRef(salva)
  salvaRef.current = salva

  const manda = useCallback((a: Azione) => {
    const dopo = riduci(vero.current, a, { vuotoVietato })
    vero.current = dopo
    setS(dopo)
    return dopo
  }, [vuotoVietato])

  useEffect(() => { manda({ tipo: 'arriva', valore }) }, [valore, manda])
  useEffect(() => () => {
    for (const o of orologi.current) clearTimeout(o)
    // smontato con qualcosa di scritto e non salvato: si manda lo stesso
    const v = daSalvare(vero.current, { vuotoVietato })
    if (v !== null) salvaRef.current(v).catch(() => {})
  }, [vuotoVietato])

  const aspetta = (ms: number, f: () => void) => { orologi.current.push(setTimeout(f, ms)) }

  const commit = () => {
    const prima = vero.current
    if (!eSporco(prima)) return
    const dopo = manda({ tipo: 'commit' })
    if (dopo.fase !== 'salvato') return
    const testo = dopo.salvato
    salvaRef.current(testo)
      .then(() => { manda({ tipo: 'riuscito' }); aspetta(1600, () => { if (vero.current.fase === 'salvato') manda({ tipo: 'spegni' }) }) })
      .catch((e: unknown) => manda({ tipo: 'fallito', guaio: e instanceof Error && e.message ? e.message : 'Non sono riuscito a salvarlo.' }))
  }

  const tasti = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const g = tastiCampo({ key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing },
      { multilinea, sporco: eSporco(vero.current), avanti: !!avanti, mac: MAC })
    if (g === 'salva') { e.preventDefault(); commit() }
    else if (g === 'avanti') { e.preventDefault(); commit(); prossimoCampo(e.currentTarget) }
    else if (g === 'annulla') {
      e.preventDefault(); e.stopPropagation()
      manda({ tipo: 'annulla', multilinea })
      if (multilinea) { setRimetti(true); aspetta(6000, () => setRimetti(false)) }
    } else if (g === 'passa') e.currentTarget.blur()
  }

  const comune = {
    id: idCampo, value: s.testo, disabled: disabilitato, placeholder: esempio,
    'aria-labelledby': etichettaDa, 'aria-invalid': s.fase === 'guaio' || undefined,
    onChange: (e: { target: { value: string } }) => manda({ tipo: 'scrivi', testo: limite ? e.target.value.slice(0, limite) : e.target.value }),
    onFocus: () => manda({ tipo: 'fuoco', si: true }),
    onBlur: () => { manda({ tipo: 'fuoco', si: false }); commit() },
    onKeyDown: tasti
  }
  const resta = limite ? limite - s.testo.length : Infinity

  return (
    <div className="f-campo">
      {etichetta && !etichettaDa && (
        <div className="f-riga-etichetta"><Etichetta per={idCampo}>{etichetta}</Etichetta><Salvato mostra={s.fase === 'salvato'} /></div>
      )}
      <Scatola spento={disabilitato}>
        {multilinea ? <textarea rows={righe} {...comune} /> : <input {...comune} />}
      </Scatola>
      {(s.fase === 'guaio' || rimetti || resta < 120 || !!etichettaDa) && (
        <div className="f-piede-campo">
          {s.fase === 'guaio' ? <span className="f-guaio" role="alert">{t(s.guaio)}</span>
            : rimetti ? <button type="button" className="f-bottone parola piccolo" onMouseDown={e => e.preventDefault()}
                onClick={() => { manda({ tipo: 'rimetti' }); setRimetti(false) }}><span>{t('Rimetti com’era')}</span></button>
            : resta < 120 ? <span className={`f-conto${resta < 60 ? ' rame' : ''}`}>{resta} {t('caratteri rimasti')}</span>
            : <span />}
          {etichettaDa && <Salvato mostra={s.fase === 'salvato'} />}
        </div>
      )}
    </div>
  )
}

/**
 * Una casella di un modulo (una password, il nome di un progetto nuovo, un
 * passo da aggiungere): il valore lo tiene chi la usa, e la manda un bottone
 * o Invio (⌘Invio se è lunga). Stessa scatola e stessi tasti del campo:
 * Invio va avanti o manda, Esc svuota una casella scritta.
 */
export function Casella({ etichetta, valore, cambia, invio, alUscire, avanti, esempio, id, righe = 1, dopo, ...resto }: {
  etichetta?: string
  valore: string
  cambia: (v: string) => void
  /** Invio sull'ultima casella: manda il modulo. */
  invio?: () => void
  alUscire?: () => void
  avanti?: boolean
  esempio?: string
  id?: string
  righe?: number
  /** Quello che sta dentro la scatola dopo il testo: un bottone «Aggiungi». */
  dopo?: ReactNode
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'placeholder' | 'id' | 'onKeyDown' | 'onBlur'>) {
  const idCampo = useRef(id ?? nuovoId('casella')).current
  const multilinea = righe >= 2
  const tasti = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const g = tastiCampo({ key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing },
      { multilinea, sporco: valore !== '', avanti: !!avanti, mac: MAC })
    if (g === 'avanti') { e.preventDefault(); prossimoCampo(e.currentTarget) }
    else if (g === 'salva') { e.preventDefault(); invio?.() }
    else if (g === 'annulla') { e.preventDefault(); e.stopPropagation(); cambia('') }
  }
  return (
    <div className="f-campo">
      {etichetta && <Etichetta per={idCampo}>{etichetta}</Etichetta>}
      <Scatola spento={resto.disabled}>
        {multilinea
          ? <textarea id={idCampo} rows={righe} value={valore} placeholder={esempio} aria-label={etichetta ? undefined : resto['aria-label']}
              maxLength={resto.maxLength} disabled={resto.disabled} onChange={e => cambia(e.target.value)} onKeyDown={tasti} onBlur={alUscire} />
          : <input {...resto} id={idCampo} value={valore} placeholder={esempio} aria-label={etichetta ? undefined : resto['aria-label']}
              onChange={e => cambia(e.target.value)} onKeyDown={tasti} onBlur={alUscire} />}
        {dopo}
      </Scatola>
    </div>
  )
}

/** Un bottone: pieno (uno per scheda), contorno, parola, pericolo. Le due scritte stanno una sopra l'altra: la larghezza non salta. */
export function Bottone({ tipo = 'contorno', piccolo, occupato, etichettaOccupato, children, className, ...resto }: {
  tipo?: 'pieno' | 'contorno' | 'parola' | 'pericolo'
  piccolo?: boolean
  occupato?: boolean
  etichettaOccupato?: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...resto} disabled={resto.disabled || occupato} aria-busy={occupato || undefined}
      className={`f-bottone ${tipo}${piccolo ? ' piccolo' : ''}${className ? ` ${className}` : ''}`}>
      <span aria-hidden={occupato && etichettaOccupato ? true : undefined}>{children}</span>
      {etichettaOccupato !== undefined && <span aria-hidden={occupato ? undefined : true}>{etichettaOccupato}</span>}
    </button>
  )
}

/** Un gruppo di pastiglie: le frecce muovono il fuoco; Spazio o Invio scelgono ('automatica': anche le frecce). */
export function Scelte<Id extends string>({ etichetta, mostraEtichetta, opzioni, scelta, scegli, attivazione = 'manuale' }: {
  etichetta: string
  mostraEtichetta?: boolean
  /** `occupato`: la scelta sta lavorando (P10: aria-busy, come `Bottone`). */
  opzioni: { id: Id; nome: string; disabilitato?: boolean; occupato?: boolean; titolo?: string }[]
  scelta: Id | null
  scegli: (id: Id) => void
  attivazione?: 'manuale' | 'automatica'
}) {
  const bottoni = useRef<(HTMLButtonElement | null)[]>([])
  const [fuoco, setFuoco] = useState(-1)
  const indiceScelta = opzioni.findIndex(o => o.id === scelta)
  const girevole = fuoco >= 0 ? fuoco : Math.max(0, indiceScelta)
  const idEtichetta = useRef(nuovoId('scelte')).current
  return (
    <div className="f-campo">
      {mostraEtichetta && <span className="f-etichetta" id={idEtichetta}>{etichetta}</span>}
      <div role="radiogroup" aria-label={mostraEtichetta ? undefined : etichetta} aria-labelledby={mostraEtichetta ? idEtichetta : undefined} className="f-scelte">
        {opzioni.map((o, i) => (
          <button key={o.id} ref={el => { bottoni.current[i] = el }} type="button" role="radio" className="f-scelta"
            aria-checked={o.id === scelta} tabIndex={i === girevole ? 0 : -1} disabled={o.disabilitato} aria-busy={o.occupato || undefined} title={o.titolo}
            onFocus={() => setFuoco(i)}
            onClick={() => { if (o.id !== scelta) scegli(o.id) }}
            onKeyDown={e => {
              const r = tastiScelte(e.key, i, opzioni.length, attivazione)
              if (r.fuoco === i && !r.scegli) return
              e.preventDefault()
              if (r.fuoco !== i) bottoni.current[r.fuoco]?.focus()
              const quale = opzioni[r.fuoco]
              if (r.scegli && quale && !quale.disabilitato && quale.id !== scelta) scegli(quale.id)
            }}>
            {o.nome}
          </button>
        ))}
      </div>
    </div>
  )
}

/** L'interruttore: di rame quando è acceso. */
export function Interruttore({ acceso, cambia, etichetta, disabilitato }: { acceso: boolean; cambia: () => void; etichetta: string; disabilitato?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={acceso} aria-label={etichetta} disabled={disabilitato}
      className="f-interruttore" onClick={cambia}><span /></button>
  )
}

/** Una scheda: il titolo è la gerarchia; `id` è quello che un collegamento sa trovare. */
export function Carta({ titolo, id, stato, statoRame, larga, quieta, azione, children }: {
  titolo: string
  id?: string
  /** Una riga che dice come sta la cosa adesso. Mai una che spieghi. */
  stato?: ReactNode
  statoRame?: boolean
  larga?: boolean
  quieta?: boolean
  azione?: ReactNode
  children?: ReactNode
}) {
  return (
    <article className={`f-carta${larga ? ' larga' : ''}${quieta ? ' quieta' : ''}`} data-scheda={id} aria-labelledby={id ? `carta-${id}` : undefined}>
      <div className="f-carta-cima">
        <h3 id={id ? `carta-${id}` : undefined}>{titolo}</h3>
        {azione}
      </div>
      {children}
      {stato ? <div className={`f-stato${statoRame ? ' rame' : ''}`}>{stato}</div> : null}
    </article>
  )
}
