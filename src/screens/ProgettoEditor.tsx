// Un progetto: la sua scheda, e i pezzi che la scheda presta alla sua pagina.
//
// «Se voglio cancellare un progetto deve essere più immediato, e modificarli
// deve essere più facile, quasi come se fosse una specie di dashboard.»
//
// Quello che si fa tutti i giorni sta sulla scheda e non chiede di aprire
// niente: il nome e l'obiettivo si scrivono cliccandoci sopra, il pallino
// apre la tavolozza, lo stato è un interruttore a tre scatti, il cestino sta
// in alto a destra e compare passandoci sopra. Cliccandola si apre la pagina
// del progetto (`PaginaProgetto.tsx`): a cosa serve, i prossimi passi, quello
// che è fatto e quello che Myynd sa; e in fondo, chiuso, quello che si tocca
// di rado: gli altri nomi, il progetto dentro cui sta, unire.
//
// Quattro scelte, e perché:
//
//   · niente doppioni. Quello che si cambia sulla scheda non si ripete
//     nell'editor: due caselle per lo stesso nome sono due posti dove
//     correggerlo e uno solo che hai guardato.
//   · si salva lasciando il campo, con una spunta piccola che lo dice. Niente
//     bottone «Salva»: un bottone grosso in fondo a otto campi è la promessa
//     che se sbagli la pagina prima di premerlo hai perso tutto.
//   · eliminare è un gesto solo, e sta dove sta in tutto il resto dell'app:
//     il cestino in alto a destra, che chiede «Sicuro?» una volta. Prima era
//     un testo smorto in fondo all'editor: per arrivarci bisognava aprire il
//     progetto e scorrere due schermate, cioè non era un gesto, era una caccia.
//   · ogni guaio sta sotto alla cosa che l'ha causato. Una riga rossa in fondo
//     alla schermata dice che qualcosa non è andato, non dice cosa.

import { useEffect, useRef, useState } from 'react'
import { type CambioProgetto, type Progetto, type StatoProgetto } from '../api'
import { PrioritaProgetto } from '../components/PrioritaProgetto'
import { frasi, t } from '../lingua'
import { Cestino, Hov, LABEL, daTastiera, useAttiva } from '../ui'
import { IconAvanti, IconGiu, IconSpunta } from '../icons'
import { COLORE_VALIDO, TAVOLOZZA, coloreProgetto } from '../colori-progetto'
import { SPIEGA_STATO, STATI, aggiungiAlias, aliasPuliti, togliAlias } from '../progetto-modifica'
import { GRADIENTE } from '../tema'

const INCHIOSTRO = 'var(--inchiostro)'
const SPENTO = 'rgba(var(--inchiostro-rgb),.55)'
const APPENA = 'rgba(var(--inchiostro-rgb),.42)'
/** Il rame che fa da testo: di notte schiarisce da solo, un valore fisso no. */
const RAME_TESTO = 'var(--rame-testo)'
/** Il verde degli stati, che di notte schiarisce: la spunta e basta. */
const VERDE = 'var(--verde-cupo)'

/** Chi cambia un progetto: se il server dice di no, l'eccezione arriva a chi chiama. */
export type Cambia = (id: string, c: CambioProgetto) => Promise<void>

export const COLORE_STATO: Record<StatoProgetto, { testo: string; fondo: string }> = {
  attivo: { testo: 'var(--verde-cupo)', fondo: 'rgba(var(--salvia-rgb),.18)' },
  fermo: { testo: 'var(--rame-testo)', fondo: 'rgba(var(--rame-rgb),.2)' },
  chiuso: { testo: 'rgba(var(--inchiostro-rgb),.55)', fondo: 'rgba(var(--inchiostro-rgb),.08)' }
}

export const CASELLA = {
  width: '100%', boxSizing: 'border-box' as const, padding: '9px 12px', borderRadius: 10,
  border: '1px solid rgba(var(--inchiostro-rgb),.16)', background: 'rgba(var(--luce-rgb),.75)',
  color: INCHIOSTRO, fontSize: '13.5px', lineHeight: 1.5, fontFamily: 'inherit', outline: 'none'
}

/** La spunta che dice «l'ho salvato», e se ne va da sola. */
export function Tic({ mostra }: { mostra: boolean }) {
  return (
    <span aria-live="polite" style={{
      flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '11px',
      color: VERDE, opacity: mostra ? 1 : 0, transition: 'opacity .35s'
    }}>
      {mostra && <><IconSpunta size={11} />{t('Salvato')}</>}
    </span>
  )
}

/** Un campo: la sua etichetta, la sua spunta, la sua riga di aiuto, il suo guaio. */
export function Riquadro({ etichetta, aiuto, guaio, salvato, children }: {
  etichetta: string
  aiuto?: string
  guaio?: string
  salvato?: boolean
  children: React.ReactNode
}) {
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7 }}>
        <span style={{ ...LABEL, flex: 'none' }}>{etichetta}</span>
        <Tic mostra={!!salvato} />
      </div>
      {children}
      {aiuto && (
        <div style={{ fontSize: '12px', color: APPENA, marginTop: 6, lineHeight: 1.55, textWrap: 'pretty' }}>{aiuto}</div>
      )}
      {guaio && (
        <div role="alert" style={{ fontSize: '12px', color: RAME_TESTO, marginTop: 6, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
          {t(guaio)}
        </div>
      )}
    </div>
  )
}

/**
 * Un elenco a tendina che sembra quello che è.
 *
 * L'aspetto di sistema stona con tutto il resto (su macOS è un controllo grigio
 * con il suo raggio e la sua ombra), ma togliendolo sparisce anche la freccia,
 * e un elenco senza freccia si legge come una casella di testo che non si
 * lascia scrivere. La freccia gliela rimettiamo noi, con l'icona dell'app.
 */
export function Tendina({ children, ...resto }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span style={{ position: 'relative', display: 'block' }}>
      <select {...resto} style={{ ...CASELLA, cursor: 'pointer', appearance: 'none', paddingRight: 36 }}>
        {children}
      </select>
      <span style={{
        position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)',
        display: 'flex', pointerEvents: 'none'
      }}>
        <IconGiu size={12} />
      </span>
    </span>
  )
}

/**
 * Mandare un cambiamento, e sapere com'è andata per *quel* campo.
 *
 * La riga e l'editor salvano allo stesso modo, ognuno per conto suo: una
 * spunta dove hai scritto, e il guaio sotto alla cosa che l'ha causato.
 */
export function useSalvataggi(id: string, cambia: Cambia) {
  const [guai, setGuai] = useState<Record<string, string>>({})
  const [fatti, setFatti] = useState<Record<string, boolean>>({})
  const orologi = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  useEffect(() => {
    const suoi = orologi.current
    return () => { for (const k of Object.keys(suoi)) clearTimeout(suoi[k]) }
  }, [])

  const manda = async (campo: string, c: CambioProgetto) => {
    try {
      await cambia(id, c)
      setGuai(g => ({ ...g, [campo]: '' }))
      setFatti(f => ({ ...f, [campo]: true }))
      clearTimeout(orologi.current[campo])
      orologi.current[campo] = setTimeout(() => setFatti(f => ({ ...f, [campo]: false })), 2400)
    } catch (e) {
      setGuai(g => ({ ...g, [campo]: e instanceof Error ? e.message : String(e) }))
    }
  }
  const segnala = (campo: string, guaio: string) => setGuai(g => ({ ...g, [campo]: guaio }))
  return { guai, fatti, manda, segnala }
}

/**
 * Un testo che si scrive dov'è scritto.
 *
 * Sembra testo, e cliccandoci sopra è una casella con lo stesso carattere e
 * nello stesso posto: il nome non si sposta di un pixel fra il leggerlo e il
 * correggerlo. Si salva lasciando il campo o con Invio, Esc rimette com'era.
 *
 * Il negativo dei margini pareggia il bordo e l'imbottitura della casella: è
 * quello che tiene ferme le due parole mentre una diventa l'altra.
 */
export function Scritta({ valore, testoStile, etichetta, vuoto, salva, apriSubito, tornaAlFuoco, salvato }: {
  valore: string
  /** Il carattere del testo: lo stesso da fermo e mentre si scrive. */
  testoStile: React.CSSProperties
  etichetta: string
  /** Cosa si legge quando non c'è ancora niente. */
  vuoto?: string
  salva: (v: string) => void
  /** Appena nato: si apre da sé, con dentro tutto selezionato. */
  apriSubito?: boolean
  /** Dove torna il fuoco uscendo con Invio o con Esc: la riga. */
  tornaAlFuoco?: () => void
  salvato?: boolean
}) {
  const [scrivo, setScrivo] = useState(false)
  const [testo, setTesto] = useState(valore)
  const annulla = useRef(false)
  const daTastiera = useRef(false)
  const nato = useRef(false)
  useEffect(() => { setTesto(valore) }, [valore])
  useEffect(() => {
    if (!apriSubito || nato.current) return
    nato.current = true
    setScrivo(true)
  }, [apriSubito])

  /** Si riapre sempre da quello che è scritto davvero, non da un tentativo andato male. */
  const apriti = () => { setTesto(valore); setScrivo(true) }

  const comune: React.CSSProperties = {
    ...testoStile, minWidth: 0, boxSizing: 'border-box',
    padding: '3px 7px', margin: '-4px -8px', borderRadius: 7,
    borderWidth: 1, borderStyle: 'solid', fontFamily: 'inherit'
  }

  if (scrivo) {
    return (
      <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          autoFocus
          ref={el => {
            if (!el) return
            if (apriSubito) el.select()
            else el.setSelectionRange(el.value.length, el.value.length)
          }}
          value={testo}
          onChange={e => setTesto(e.target.value.replace(/\n/g, ' '))}
          onClick={e => e.stopPropagation()}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); daTastiera.current = true; e.currentTarget.blur() }
            else if (e.key === 'Escape') {
              e.stopPropagation(); annulla.current = true; daTastiera.current = true; e.currentTarget.blur()
            }
          }}
          onBlur={() => {
            const annullato = annulla.current
            const tastiera = daTastiera.current
            annulla.current = false
            daTastiera.current = false
            setScrivo(false)
            if (tastiera) tornaAlFuoco?.()
            if (annullato) return setTesto(valore)
            const v = testo.trim()
            if (v !== valore.trim()) salva(v)
          }}
          aria-label={etichetta} spellCheck={false}
          style={{
            ...comune, flex: '1 1 auto', width: '100%', outline: 'none',
            background: 'var(--carta-alta)', borderColor: 'rgba(var(--rame-rgb),.45)', color: INCHIOSTRO
          }} />
      </span>
    )
  }

  return (
    <span style={{ flex: '0 1 auto', minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
      <Hov as="span" role="button" tabIndex={0}
        onClick={(e: React.MouseEvent) => { e.stopPropagation(); apriti() }}
        onFocus={apriti}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); apriti() }
        }}
        style={{
          ...comune, display: 'block', cursor: 'text', borderColor: 'transparent',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: valore ? testoStile.color : APPENA
        }}
        hover={{ background: 'rgba(var(--inchiostro-rgb),.06)' }}>
        {valore || vuoto || etichetta}
      </Hov>
      <Tic mostra={!!salvato} />
    </span>
  )
}

/**
 * Il pallino, e la tavolozza che ci sta sotto.
 *
 * Il colore era una fila di otto pastiglie dentro l'editor, cioè due clic e
 * una schermata di distanza da dove il colore si vede. Qui è il pallino
 * stesso: si preme, si sceglie, si richiude.
 */
export function Pallino({ p, colore, manda, guaio, segnala }: {
  p: Progetto
  colore: string
  manda: (campo: string, c: CambioProgetto) => Promise<void>
  guaio?: string
  segnala: (campo: string, guaio: string) => void
}) {
  const [aperto, setAperto] = useState(false)
  const [scritto, setScritto] = useState(p.colore)
  const scatola = useRef<HTMLSpanElement>(null)
  const bottone = useRef<HTMLButtonElement>(null)
  useEffect(() => { setScritto(p.colore) }, [p.colore])
  useEffect(() => {
    if (!aperto) return
    const fuori = (e: MouseEvent) => {
      if (!scatola.current?.contains(e.target as Node)) setAperto(false)
    }
    document.addEventListener('mousedown', fuori)
    return () => document.removeEventListener('mousedown', fuori)
  }, [aperto])

  const salvaScritto = () => {
    const v = scritto.trim()
    if (v === p.colore) return
    if (v && !COLORE_VALIDO.test(v)) return segnala('colore', 'Il colore di un progetto si scrive #RRGGBB.')
    segnala('colore', '')
    void manda('colore', { colore: v })
  }

  return (
    // il clic non esce da qui: la scheda che ci sta attorno si apre cliccandola,
    // e scegliere una tinta dalla tavolozza non vuol dire «aprimi il progetto»
    <span ref={scatola} style={{ flex: 'none', position: 'relative', display: 'flex' }}
      onClick={(e: React.MouseEvent) => e.stopPropagation()}
      onKeyDown={e => { if (e.key === 'Escape' && aperto) { e.stopPropagation(); setAperto(false); bottone.current?.focus() } }}>
      <Hov as="button" type="button" ref={bottone}
        onClick={(e: React.MouseEvent) => { e.stopPropagation(); setAperto(v => !v) }}
        aria-label={t('Colore')} title={t('Colore')} aria-expanded={aperto}
        style={{
          flex: 'none', width: 22, height: 22, borderRadius: '50%', border: 'none', padding: 0,
          background: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center'
        }}>
        <span style={{
          width: 13, height: 13, borderRadius: '50%', background: colore,
          border: '2px solid rgba(var(--luce-rgb),.9)',
          boxShadow: aperto ? `0 0 0 2px ${colore}` : '0 0 0 1px rgba(var(--inchiostro-rgb),.15)'
        }} />
      </Hov>
      {aperto && (
        <span style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: -6, zIndex: 20, width: 267,
          display: 'block', padding: '12px 13px 13px', borderRadius: 14,
          background: 'var(--carta-piena)', border: '1px solid var(--filo)',
          boxShadow: '0 12px 30px rgba(var(--ombra-rgb),.22)', animation: 'fadein .12s ease'
        }}>
          {/* le otto tinte in una riga sola: due righe da sei e due fanno
              sembrare che le ultime due siano un'altra cosa */}
          <span role="radiogroup" aria-label={t('Colore')} style={{ display: 'flex', gap: 9 }}>
            {TAVOLOZZA.map(c => (
              <Hov key={c} as="button" type="button" role="radio" aria-checked={c === colore} title={c} aria-label={c}
                onClick={() => { setScritto(c); segnala('colore', ''); if (c !== p.colore) void manda('colore', { colore: c }) }}
                style={{
                  width: 22, height: 22, borderRadius: '50%', background: c, padding: 0, cursor: 'pointer',
                  border: '2px solid rgba(var(--luce-rgb),.9)',
                  boxShadow: c === colore ? `0 0 0 2px ${c}` : '0 0 0 1px rgba(var(--inchiostro-rgb),.15)'
                }}
                hover={{ boxShadow: `0 0 0 2px ${c}` }} />
            ))}
          </span>
          <input value={scritto} onChange={e => setScritto(e.target.value)} onBlur={salvaScritto}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            aria-label={t('Un altro colore, scritto #RRGGBB')} spellCheck={false} placeholder={colore}
            style={{ ...CASELLA, marginTop: 11, fontSize: '12.5px', padding: '7px 10px', letterSpacing: '.02em' }} />
          <span style={{ display: 'block', fontSize: '11.5px', color: APPENA, marginTop: 8, lineHeight: 1.5, textWrap: 'pretty' }}>
            {t('Senza sceglierne uno, Myynd gliene dà uno suo, diverso da quello degli altri.')}
          </span>
          {guaio && (
            <span role="alert" style={{ display: 'block', fontSize: '11.5px', color: RAME_TESTO, marginTop: 7, lineHeight: 1.45 }}>
              {t(guaio)}
            </span>
          )}
        </span>
      )}
    </span>
  )
}

/**
 * Lo stato, a tre scatti, sulla riga.
 *
 * Erano tre riquadri alti dentro l'editor, con sotto ognuno la riga che dice
 * cosa cambia sulla prima pagina. Le tre righe servono ancora, perché la
 * scelta di mezzo esiste proprio per «non è chiuso, è in pausa», ma non servono
 * *sempre*: compaiono passando sopra al controllo e per qualche secondo dopo
 * aver scelto, cioè nei due momenti in cui qualcuno se lo sta chiedendo. E
 * compaiono sopra la riga, non dentro: una riga che cresce al passaggio del
 * mouse sposta tutte quelle sotto.
 */
export function Stati({ p, manda }: { p: Progetto; manda: (campo: string, c: CambioProgetto) => Promise<void> }) {
  const [sopra, setSopra] = useState(false)
  const [appena, setAppena] = useState(false)
  const bottoni = useRef<(HTMLButtonElement | null)[]>([])
  const orologio = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(orologio.current), [])

  const scegli = (s: StatoProgetto) => {
    clearTimeout(orologio.current)
    setAppena(true)
    orologio.current = setTimeout(() => setAppena(false), 3200)
    if (s !== p.stato) void manda('stato', { stato: s })
  }

  return (
    // come la tavolozza: il clic resta qui dentro, anche quello sulla nota
    <span style={{ flex: 'none', position: 'relative', display: 'flex' }}
      onClick={(e: React.MouseEvent) => e.stopPropagation()}
      onMouseEnter={() => setSopra(true)} onMouseLeave={() => setSopra(false)}>
      <span role="radiogroup" aria-label={t('Stato')} style={{
        display: 'flex', gap: 2, padding: 2, borderRadius: 9,
        border: '1px solid var(--filo)', background: 'rgba(var(--luce-rgb),.35)'
      }}>
        {STATI.map((s, i) => {
          const suo = p.stato === s
          return (
            <Hov key={s} as="button" type="button" role="radio" aria-checked={suo}
              ref={(el: HTMLButtonElement | null) => { bottoni.current[i] = el }}
              tabIndex={suo ? 0 : -1}
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); scegli(s) }}
              onKeyDown={(e: React.KeyboardEvent) => {
                const avanti = e.key === 'ArrowRight' || e.key === 'ArrowDown'
                const indietro = e.key === 'ArrowLeft' || e.key === 'ArrowUp'
                if (!avanti && !indietro) return
                e.preventDefault(); e.stopPropagation()
                const ora = STATI.indexOf(p.stato)
                const j = (ora + (avanti ? 1 : STATI.length - 1)) % STATI.length
                scegli(STATI[j])
                bottoni.current[j]?.focus()
              }}
              style={{
                padding: '3px 9px', borderRadius: 7, border: 'none', cursor: suo ? 'default' : 'pointer',
                fontFamily: 'inherit', fontSize: '11px', fontWeight: 500, whiteSpace: 'nowrap',
                textTransform: 'capitalize',
                color: suo ? COLORE_STATO[s].testo : APPENA,
                background: suo ? COLORE_STATO[s].fondo : 'transparent'
              }}
              hover={suo ? {} : { color: INCHIOSTRO, background: 'rgba(var(--inchiostro-rgb),.06)' }}>
              {t(s)}
            </Hov>
          )
        })}
      </span>
      {(sopra || appena) && (
        // a sinistra e non a destra: sulla riga di una volta lo stato stava in
        // fondo a destra e la nota rientrava; dentro una scheda lo stato è la
        // prima cosa del piede, e una nota ancorata a destra usciva dal bordo
        // sinistro della colonna e si leggeva a metà
        <span role="note" style={{
          position: 'absolute', top: 'calc(100% + 7px)', left: 0, zIndex: 18, width: 250,
          display: 'block', padding: '8px 11px', borderRadius: 10, textAlign: 'left',
          background: 'var(--carta-piena)', border: '1px solid var(--filo)',
          boxShadow: '0 12px 30px rgba(var(--ombra-rgb),.22)',
          fontSize: '11.5px', lineHeight: 1.5, color: SPENTO, textWrap: 'pretty', animation: 'fadein .12s ease'
        }}>{t(SPIEGA_STATO[p.stato])}</span>
      )}
    </span>
  )
}

/**
 * `x` sta dentro `radice`, anche passando per un progetto di mezzo.
 *
 * Serve a non far scegliere un padre che è già un figlio: due progetti che si
 * tengono dentro a vicenda sono un giro infinito per chiunque li legga, a
 * partire dal prompt.
 */
function discendeDa(x: Progetto, radice: string, tutti: Progetto[]): boolean {
  const visti = new Set<string>()
  let g = x.genitore ?? null
  while (g && !visti.has(g)) {
    if (g === radice) return true
    visti.add(g)
    g = tutti.find(y => y.id === g)?.genitore ?? null
  }
  return false
}

/**
 * Quello che di un progetto si tocca di rado: gli altri nomi, il progetto
 * dentro cui sta, unirlo a un altro.
 *
 * Stava in cima alla finestra del progetto, e la finestra si apriva su tre
 * caselle vuote («Altri nomi», «Dentro», «Note») che sembravano le
 * impostazioni di qualcos'altro: la prima persona da fuori non ha capito a
 * cosa servisse la pagina. Adesso sta in fondo alla pagina, chiuso, sotto un
 * titolo che dice cosa c'è dentro; e senza le righe che spiegavano ogni
 * campo: il titolo e il controllo bastano.
 *
 * `cambia` butta l'eccezione del server invece di mangiarsela: è l'unico modo
 * per cui il messaggio «Esiste già un progetto con questo nome» possa comparire
 * sotto al campo giusto invece che in fondo alla schermata.
 */
export function NomiERaggruppamento({ p, tutti, cambia, unisci }: {
  p: Progetto
  tutti: Progetto[]
  cambia: Cambia
  unisci: (id: string, dentro: string) => Promise<void>
}) {
  const { guai, fatti, manda, segnala } = useSalvataggi(p.id, cambia)

  // — gli altri nomi —
  const alias = aliasPuliti(p.alias ?? [], p.nome)
  const [altroNome, setAltroNome] = useState('')
  const aggiungiNome = () => {
    const r = aggiungiAlias(alias, altroNome, p.nome)
    if (r.guaio) return segnala('alias', r.guaio)
    setAltroNome('')
    segnala('alias', '')
    if (r.alias.length !== alias.length) void manda('alias', { alias: r.alias })
  }

  // — il progetto dentro cui sta: mai sé stesso, mai uno dei suoi —
  const padri = tutti.filter(x => x.id !== p.id && x.stato === 'attivo' && !discendeDa(x, p.id, tutti))
  const padre = tutti.find(x => x.id === p.genitore) ?? null

  // — unire due progetti che erano lo stesso progetto —
  const [dentroChi, setDentroChi] = useState('')
  const [unisco, setUnisco] = useState(false)
  const bersaglio = tutti.find(x => x.id === dentroChi) ?? null
  const altri = tutti.filter(x => x.id !== p.id && x.stato !== 'chiuso')

  const facciamoUno = async () => {
    if (!bersaglio || unisco) return
    setUnisco(true)
    try { await unisci(p.id, bersaglio.id); segnala('unisci', ''); setDentroChi('') }
    catch (e) { segnala('unisci', e instanceof Error ? e.message : String(e)) }
    finally { setUnisco(false) }
  }

  return (
    <div style={{ paddingBottom: 4 }}>
      {/* gli altri nomi: le cartelle e i soprannomi con cui lo chiama davvero */}
      <Riquadro etichetta={t('Altri nomi')} salvato={fatti.alias} guaio={guai.alias}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          {alias.map(a => (
            <span key={a} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '100%',
              padding: '4px 5px 4px 11px', borderRadius: 99, background: 'rgba(var(--inchiostro-rgb),.05)',
              border: '1px solid rgba(var(--inchiostro-rgb),.1)', fontSize: '12.5px', color: INCHIOSTRO
            }}>
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{a}</span>
              <Hov as="button" type="button" title={t('Togli questo nome')} aria-label={t('Togli questo nome')}
                onClick={() => void manda('alias', { alias: togliAlias(alias, a) })}
                style={{
                  flex: 'none', width: 18, height: 18, borderRadius: '50%', border: 'none', padding: 0,
                  background: 'none', cursor: 'pointer', color: APPENA, fontFamily: 'inherit',
                  fontSize: '14px', lineHeight: 1, display: 'grid', placeItems: 'center'
                }}
                hover={{ background: 'rgba(var(--rame-rgb),.14)', color: RAME_TESTO }}>×</Hov>
            </span>
          ))}
          <input value={altroNome} onChange={e => setAltroNome(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); aggiungiNome() } }}
            onBlur={aggiungiNome} placeholder={t('Un altro nome: «everwave»')} aria-label={t('Un altro nome')}
            style={{ ...CASELLA, flex: '1 1 200px', minWidth: 0, fontSize: '12.5px', padding: '7px 11px' }} />
        </div>
      </Riquadro>

      {/* dentro quale progetto sta: H-Brain è uno spin-off di Myynd, non un progetto a parte */}
      <Riquadro etichetta={t('Dentro')} salvato={fatti.genitore} guaio={guai.genitore}>
        <Tendina value={p.genitore ?? ''} aria-label={t('Dentro')}
          onChange={e => void manda('genitore', { genitore: e.target.value || null })}>
          <option value="">{t('Nessuno')}</option>
          {padri.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
          {/* un padre fermo o chiuso resta scritto: toglierlo dall'elenco lo cancellerebbe in silenzio */}
          {padre && !padri.some(x => x.id === padre.id) && <option value={padre.id}>{padre.nome}</option>}
        </Tendina>
      </Riquadro>

      {/* — unire due progetti che erano lo stesso progetto — */}
      <Riquadro etichetta={t('Unisci in un altro')} guaio={guai.unisci}
        aiuto={altri.length ? undefined : t('Non c’è nessun altro progetto in cui unirlo.')}>
        {!!altri.length && (
          <Tendina value={dentroChi} onChange={e => { setDentroChi(e.target.value); segnala('unisci', '') }}
            aria-label={t('Unisci in un altro')}>
            <option value="">{t('Scegli un progetto')}</option>
            {altri.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
          </Tendina>
        )}
        {bersaglio && (
          <>
            <div style={{ fontSize: '12.5px', color: SPENTO, marginTop: 9, lineHeight: 1.6, textWrap: 'pretty' }}>
              {frasi.unisciDentro(p.nome, bersaglio.nome)}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 11 }}>
              <Hov as="button" type="button" onClick={facciamoUno} disabled={unisco}
                style={{
                  flex: 'none', padding: '9px 18px', borderRadius: 99, border: 'none', background: GRADIENTE,
                  color: 'var(--avorio)', fontSize: '13px', fontWeight: 500, fontFamily: 'inherit',
                  cursor: unisco ? 'default' : 'pointer'
                }}
                hover={unisco ? {} : { opacity: 0.92 }}>
                {unisco ? t('Unisco…') : t('Unisci')}
              </Hov>
            </div>
          </>
        )}
      </Riquadro>
    </div>
  )
}

/**
 * La scheda di un progetto: quello che si cambia tutti i giorni, sul posto.
 *
 * Non è una vetrina che si limita a dire quattro cose: il nome e l'obiettivo
 * si scrivono cliccandoci sopra, il pallino apre la tavolozza, lo stato ha i
 * suoi tre scatti, il conto delle attività sta in fondo e il cestino compare
 * in alto a destra passandoci sopra. Il corpo della scheda apre la finestra
 * con il resto, che è quello che si tocca una volta al mese.
 *
 * `role="button"` e non un `<button>`: dentro ci stanno altri bottoni, e un
 * bottone dentro un bottone non esiste. Invio e spazio li porta `daTastiera`,
 * che lascia i tasti ai campi quando è un campo ad averli presi.
 */
export function SchedaProgetto({ p, tutti, cambia, elimina, apri, acceso, conto, nato }: {
  p: Progetto
  /** Gli altri: il colore assegnato a chi non l'ha scelto non deve ripetere il loro. */
  tutti: Progetto[]
  cambia: Cambia
  elimina: (id: string) => Promise<void>
  /** Apre la finestra con il resto del progetto. */
  apri: () => void
  /** Arrivato adesso da una carta della prima pagina: un anello di rame per un attimo. */
  acceso?: boolean
  /** Quante attività ha aperte, e quante ne ha chiuse. */
  conto?: { aperte: number; fatte: number }
  /** Appena creato: la scheda prende il fuoco con il nome già selezionato. */
  nato?: boolean
}) {
  const { attiva, props } = useAttiva()
  const { guai, fatti, manda, segnala } = useSalvataggi(p.id, cambia)
  const [uscendo, setUscendo] = useState(false)
  const scheda = useRef<HTMLDivElement>(null)

  const colore = coloreProgetto(p, tutti)
  const chiuso = p.stato === 'chiuso'
  const padre = tutti.find(x => x.id === p.genitore) ?? null

  useEffect(() => { if (nato) scheda.current?.scrollIntoView({ block: 'center' }) }, [nato])

  const salvaNome = (v: string) => {
    if (!v) return segnala('nome', 'Un progetto ha bisogno di un nome.')
    segnala('nome', '')
    void manda('nome', { nome: v })
  }
  const salvaObiettivo = (v: string) => void manda('obiettivo', { obiettivo: v.slice(0, 200) })

  const togli = async () => {
    segnala('elimina', '')
    // va via prima di tornare il server: la scheda si spegne, e se il server
    // dice di no torna con il suo guaio scritto sotto
    setUscendo(true)
    try { await elimina(p.id) }
    catch (e) { setUscendo(false); segnala('elimina', e instanceof Error ? e.message : String(e)) }
  }

  const conteggio = conto && (conto.aperte || conto.fatte) ? frasi.attivitaDelProgetto(conto.aperte, conto.fatte) : ''

  return (
    // l'id è la maniglia con cui la prima pagina porta questa scheda sotto gli occhi
    <div id={`progetto-${p.id}`} ref={scheda} {...props} className="mem-card mem-progetto"
      role="button" tabIndex={0} aria-label={p.nome} onClick={apri} onKeyDown={daTastiera(apri)}
      data-acceso={acceso ? '' : undefined} data-chiuso={chiuso ? '' : undefined}
      style={{ opacity: uscendo ? 0 : undefined, pointerEvents: uscendo ? 'none' : undefined }}>
      <div className="mem-card-cima">
        <Pallino p={p} colore={colore} manda={manda} guaio={guai.colore} segnala={segnala} />
        <Scritta valore={p.nome} etichetta={t('Nome')} salva={salvaNome} salvato={fatti.nome}
          apriSubito={nato} tornaAlFuoco={() => scheda.current?.focus()}
          testoStile={{
            fontSize: '15px', fontWeight: 500, color: INCHIOSTRO, lineHeight: 1.35,
            textDecoration: chiuso ? 'line-through' : 'none'
          }} />
        {/* accesa si vede sempre; spenta compare sotto mano, come il cestino */}
        {!chiuso && (
          <PrioritaProgetto alta={p.priorita === 'alta'} visibile={attiva} nome={p.nome}
            cambia={alta => void manda('priorita', { priorita: alta ? 'alta' : null })} />
        )}
      </div>
      {/* il cestino dell'app, in alto a destra: compare sotto mano e chiede una volta */}
      <span className="mem-card-gesti" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <Cestino fai={togli} guaio={g => segnala('elimina', g)} titolo={t('Elimina')} visibile={attiva} />
      </span>
      <div className="mem-card-obiettivo">
        <Scritta valore={p.obiettivo} etichetta={t('Obiettivo')} salva={salvaObiettivo} salvato={fatti.obiettivo}
          vuoto={t('Obiettivo non ancora scritto.')} tornaAlFuoco={() => scheda.current?.focus()}
          testoStile={{ fontSize: '13px', color: 'rgba(var(--inchiostro-rgb),.55)', lineHeight: 1.4 }} />
      </div>
      {p.memoria && (
        <div className="mem-project-memory">
          <span>{t('Ultimo ricordo')}</span>
          <p>{p.memoria.value}</p>
        </div>
      )}
      {(padre || (p.origine === 'punto' && !chiuso)) && (
        <div className="mem-card-dentro">
          {padre ? frasi.dentroProgetto(padre.nome) : t('riconosciuto dal punto')}
        </div>
      )}
      <div className="mem-card-piede">
        <Stati p={p} manda={manda} />
        <span className="mem-conto">{conteggio}</span>
        <span className="mem-apri">{t('Apri')}<IconAvanti size={10} /></span>
      </div>
      {/* i guai della scheda stanno dentro la scheda, dove è successo */}
      {(guai.elimina || guai.nome) && (
        <div role="alert" className="mem-guaio">{t(guai.elimina || guai.nome)}</div>
      )}
    </div>
  )
}
