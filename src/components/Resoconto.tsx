/**
 * Quello che Myynd ha fatto per lui (P9).
 *
 * Tre pezzi: la carta del lunedì in prima pagina, l'ospite montato una volta
 * in App che apre il foglio da dovunque lo si chieda, e il foglio. Il foglio
 * si legge e basta: ogni numero è fatto di righe, e ogni riga apre quello che
 * conta o è testo. Nessuno zero, nessuna sezione vuota, nessun «carico…».
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { api, resocontoApi, type QualeResoconto, type Resoconto, type VoceResoconto } from '../api'
import { frasi, t } from '../lingua'
import { Hov, useFocoDialogo } from '../ui'
import { IconAvanti, IconCroce, IconSpunta } from '../icons'
import { desktop } from '../desktop'
import { preparaApertura } from '../navigazione'
import { rigaAbitudine } from '../gemello-frasi'
import type { AbitudineVista } from '../api'
import type { Vals } from '../vals'
import { APRIBILE, CARTA, ETICHETTA, FOGLIO, LINEA, RAME, SOTTO, SPENTO, TESTO, VELO } from './Punto'
import { apriResoconto, ascoltaChiusura, ascoltaResoconto, resocontoChiuso, useLunedi } from '../useResoconto'
import { gestoDi } from '../resoconto-gesti'
import * as parole from '../resoconto-parole'

// — la carta del lunedì —

/**
 * «La settimana scorsa.» sotto il punto, da lunedì alle sei a mercoledì
 * sera. Tutta la carta è il bottone; la freccia piccola dice che si apre. Non
 * ha la pastiglia di rame: quella resta alla carta del punto, sopra.
 */
export function CartaSettimana({ v }: { v: Vals }) {
  const { carta, nascondi, rimetti } = useLunedi(v.feedCaricato)
  const [sopra, setSopra] = useState(false)
  if (!carta) return null
  const riga = parole.rigaNumeri(carta.numeri)
  const premi = () => {
    nascondi()
    apriResoconto('scorsa')
    resocontoApi.visto(carta.lunedi).catch(() => {
      // non si è segnato: quando il foglio si chiude la carta torna, e basta
      const via = ascoltaChiusura(() => { via(); rimetti() })
    })
  }
  return (
    <button type="button" onClick={premi} aria-label={`${t('La settimana scorsa.')} ${riga}`}
      onMouseEnter={() => setSopra(true)} onMouseLeave={() => setSopra(false)}
      style={{ ...CARTA, width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit', flexWrap: 'nowrap' }}>
      <span style={{ flex: 1, minWidth: 0, display: 'block' }}>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 500, overflowWrap: 'anywhere', ...(sopra ? { color: 'var(--rame)' } : {}) }}>{t('La settimana scorsa.')}</span>
        <span style={{ ...SOTTO, display: 'block' }}>{riga}</span>
      </span>
      <IconAvanti size={12} style={{ flex: 'none', opacity: .5 }} />
    </button>
  )
}

// — l'ospite —

/**
 * Il foglio, aperto da chiunque lo chieda. Mentre è aperto si rilegge, al
 * più ogni due secondi, quando la lista cambia o la finestra torna in primo
 * piano; mai altrimenti.
 */
export function ResocontoAperto({ v }: { v: Vals }) {
  const [quale, setQuale] = useState<QualeResoconto | null>(null)
  const [r, setR] = useState<Resoconto | null>(null)
  const ultima = useRef(0)

  useEffect(() => ascoltaResoconto(q => { setR(null); setQuale(q) }), [])

  useEffect(() => {
    if (!quale) return
    let vivo = true
    const leggi = (prima: boolean) => {
      if (!prima && Date.now() - ultima.current < 2000) return
      ultima.current = Date.now()
      resocontoApi.leggi(quale).then(x => {
        if (!vivo) return
        setR(x)
        // la settimana scorsa aperta da dovunque: la carta del lunedì non torna
        if (prima && quale === 'scorsa') resocontoApi.visto(x.lunedi).catch(() => {})
      }).catch(e => {
        if (!vivo || !prima) return
        v.mostraToast(t(e instanceof Error ? e.message : String(e)))
        setQuale(null)
        resocontoChiuso()
      })
    }
    leggi(true)
    const via = api.flussoCompiti(() => leggi(false))
    const fuoco = () => leggi(false)
    window.addEventListener('focus', fuoco)
    return () => { vivo = false; via(); window.removeEventListener('focus', fuoco) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quale])

  if (!quale || !r || r.quale !== quale) return null
  const chiudi = () => { setQuale(null); setR(null); resocontoChiuso() }
  return <FoglioResoconto r={r} v={v} chiudi={chiudi} />
}

// — il foglio —

const PIASTRELLA: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, padding: '14px 16px', borderRadius: 14,
  // l'ombra, non l'inchiostro: di giorno un velo caldo, di notte più scuro del foglio, mai una lastra chiara
  background: 'rgba(var(--ombra-rgb),.08)', border: 'none', textAlign: 'left', font: 'inherit', color: 'var(--inchiostro)',
  transition: 'box-shadow .2s ease'
}
const NUMERO: CSSProperties = { fontFamily: 'var(--serif)', fontSize: 34, lineHeight: 1.05, letterSpacing: '-.02em', color: 'var(--inchiostro)', overflowWrap: 'anywhere' }
const STATO: CSSProperties = { ...SPENTO, fontSize: 13, lineHeight: 1.5, marginTop: 4, overflowWrap: 'anywhere' }
// l'anello sta fuori dalla sezione, senza spostarla: un margine del colore del foglio, poi il rame
const ANELLO: CSSProperties = { boxShadow: '0 0 0 8px var(--carta-piena), 0 0 0 10px var(--rame)', borderRadius: 14 }

type Chiave = 'mail' | 'lavori' | 'scadenze' | 'segnalate'

function SezioneFoglio({ etichetta, stato, anello, dentro, children }: {
  etichetta: string; stato?: string | null; anello?: boolean; dentro?: (el: HTMLDivElement | null) => void; children: ReactNode
}) {
  return (
    <div ref={dentro} style={{ marginTop: 26, minWidth: 0, scrollMarginTop: 12, transition: 'box-shadow .2s ease', ...(anello ? ANELLO : {}) }}>
      <div style={ETICHETTA}>{etichetta}</div>
      {stato ? <div style={STATO}>{stato}</div> : null}
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </div>
  )
}

/** Una riga: tutta la riga è il bersaglio se apre qualcosa, con la freccia in fondo; se no è testo. */
function Riga({ testo, accanto, fine, apri, espansa }: {
  testo: ReactNode; accanto?: ReactNode; fine?: ReactNode; apri?: (() => unknown) | null; espansa?: boolean
}) {
  const dentro = (
    <span style={TESTO}>
      {testo}
      {accanto ? <span style={SPENTO}> {accanto}</span> : null}
      {fine ? <span> {fine}</span> : null}
    </span>
  )
  if (!apri) return <div style={LINEA}>{dentro}</div>
  return (
    <Hov as="button" type="button" style={APRIBILE} hover={RAME} onClick={apri} {...(espansa !== undefined ? { 'aria-expanded': espansa } : {})}>
      {dentro}
      <IconAvanti size={12} style={{ flex: 'none', opacity: .5 }} />
    </Hov>
  )
}

/** Tante righe, poi «altri N» che ne apre altre. */
function Elenco<T>({ voci, passo, riga }: { voci: T[]; passo: number; riga: (x: T, i: number) => ReactNode }) {
  const [quante, setQuante] = useState(passo)
  const resto = voci.length - quante
  return (
    <>
      {voci.slice(0, quante).map(riga)}
      {resto > 0 && (
        <Hov as="button" type="button" onClick={() => setQuante(q => q + passo)}
          style={{ ...APRIBILE, ...SPENTO, fontSize: 13 }} hover={RAME}>
          {frasi.altriN(resto)}
        </Hov>
      )}
    </>
  )
}

const VAI = 'myynd:vai'

export function FoglioResoconto({ r, v, chiudi }: { r: Resoconto; v: Vals; chiudi: () => void }) {
  const finestra = useRef<HTMLDivElement>(null)
  useFocoDialogo(finestra, chiudi)
  const sezioni = useRef<Partial<Record<Chiave, HTMLDivElement | null>>>({})
  const [anello, setAnello] = useState<Chiave | null>(null)
  const [aperte, setAperte] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!anello) return
    const x = setTimeout(() => setAnello(null), 1500)
    return () => clearTimeout(x)
  }, [anello])

  const passo = r.quale === 'inizio' ? 20 : 6
  const perSezione = (s: Chiave) => r.voci.filter(x =>
    s === 'mail' ? x.genere === 'mail' : s === 'scadenze' ? x.genere === 'scadenza' : s === 'segnalate' ? x.genere === 'segnalata' : !['mail', 'scadenza', 'segnalata'].includes(x.genere))
  const mail = perSezione('mail'), lavori = perSezione('lavori'), scadenze = perSezione('scadenze'), segnalate = perSezione('segnalate')
  const tempo = parole.durata(r.numeri.minuti)
  const suMac = !!desktop()

  const vaiA = (s: Chiave) => {
    sezioni.current[s]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setAnello(s)
  }
  const allaMemoria = () => {
    try { sessionStorage.setItem(VAI, 'come-lavori') } catch { /* la Memoria si apre lo stesso */ }
    chiudi()
    v.goMemoria()
  }
  const apri = (x: VoceResoconto) => gestoDi(x.apre, {
    suMac, chiudi, portamiFonte: v.portamiFonte, portami: api.portami, prepara: () => preparaApertura(), avvisa: v.mostraToast, t
  })
  const giorno = (x: VoceResoconto) => parole.quandoRiga(x.quando, r.quale)
  const giraBozza = (k: string) => setAperte(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })

  const rigaMail = (x: VoceResoconto) => (
    <Riga key={x.chiave} testo={x.chi ? `${x.chi}, ${x.titolo}` : x.titolo}
      accanto={<>{giorno(x)}{x.riscritta ? ` · ${t('riscritta')}` : ''}</>} apri={apri(x)} />
  )
  const rigaLavoro = (x: VoceResoconto) => {
    if (x.genere === 'agenda') return <Riga key={x.chiave} testo={parole.agenda(x.quanti ?? 1)} accanto={x.chi ? `${x.chi} · ${giorno(x)}` : giorno(x)} />
    if (x.genere === 'riordino') return <Riga key={x.chiave} testo={parole.riordino(x)} accanto={giorno(x)} />
    if (x.genere === 'documento') {
      return <Riga key={x.chiave} testo={x.titolo} accanto={x.perso ? t('Non più rintracciabile') : x.chi ?? giorno(x)} apri={x.perso ? null : apri(x)} />
    }
    if (x.genere === 'bozza') {
      const aperta = aperte.has(x.chiave)
      return (
        <div key={x.chiave} style={{ minWidth: 0 }}>
          <Riga testo={x.titolo} accanto={x.chi ? `${x.chi} · ${giorno(x)}` : giorno(x)} apri={x.anteprima ? () => giraBozza(x.chiave) : null} espansa={x.anteprima ? aperta : undefined} />
          {aperta && x.anteprima && <div style={{ ...SPENTO, fontSize: 14, lineHeight: 1.55, margin: '4px 0 6px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{x.anteprima}</div>}
        </div>
      )
    }
    return <Riga key={x.chiave} testo={x.titolo} accanto={x.chi ?? giorno(x)} apri={apri(x)} />
  }
  const rigaScadenza = (x: VoceResoconto) => (
    <Riga key={x.chiave} testo={x.titolo} accanto={x.scade ? parole.dataScadenza(x.scade) : null} apri={apri(x)}
      fine={x.presa === 'fatta'
        ? <span style={{ whiteSpace: 'nowrap' }}><IconSpunta size={12} style={{ color: 'var(--salvia)', verticalAlign: '-1px', marginRight: 4 }} />{t('fatta')}</span>
        : <span style={SPENTO}>{x.presa === 'nella lista' ? t('nella lista') : t('vista')}</span>} />
  )
  const rigaSegnalata = (x: VoceResoconto) => <Riga key={x.chiave} testo={x.titolo} accanto={giorno(x)} apri={apri(x)} />

  const piastrelle: { chiave: Chiave | 'tempo'; numero: string; etichetta: string }[] = [
    ...(r.numeri.mail ? [{ chiave: 'mail' as const, numero: String(r.numeri.mail), etichetta: t('Mail mandate') }] : []),
    ...(r.numeri.lavori ? [{ chiave: 'lavori' as const, numero: String(r.numeri.lavori), etichetta: t('Lavori consegnati') }] : []),
    ...(r.numeri.scadenze ? [{ chiave: 'scadenze' as const, numero: String(r.numeri.scadenze), etichetta: t('Scadenze segnalate') }] : []),
    // «1 h 05» non va a capo dentro la piastrella
    ...(tempo ? [{ chiave: 'tempo' as const, numero: tempo.replace(/ /g, '\u00a0'), etichetta: t('Tempo risparmiato') }] : [])
  ]
  const notato = r.notato.map(n => n.stato === 'tenuta' && n.testoSuo ? n.testoSuo
    : rigaAbitudine({ genere: n.genere, dati: (n.dati ?? {}) as AbitudineVista['dati'], stato: n.stato as AbitudineVista['stato'], testoSuo: n.testoSuo })).filter(Boolean)

  return (
    <div style={VELO} onMouseDown={e => { if (e.target === e.currentTarget) chiudi() }}>
      <div ref={finestra} role="dialog" aria-modal="true" aria-labelledby="resoconto-titolo" tabIndex={-1} style={FOGLIO} data-foglio="resoconto">
        <Hov as="button" type="button" onClick={chiudi} title={t('Chiudi')} aria-label={t('Chiudi')}
          style={{
            position: 'absolute', top: 14, right: 14, width: 28, height: 28, borderRadius: 99,
            border: 'none', background: 'none', cursor: 'pointer', color: 'rgba(var(--inchiostro-rgb),.4)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
          }}
          hover={{ color: 'var(--inchiostro)' }}>
          <IconCroce size={11} />
        </Hov>

        <h1 id="resoconto-titolo" style={{ margin: 0, fontSize: 28, lineHeight: 1.2, paddingRight: 34, textWrap: 'pretty', overflowWrap: 'anywhere' }}>
          {parole.titoloFoglio(r.quale)}
        </h1>
        <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5, color: 'rgba(var(--inchiostro-rgb),.55)', overflowWrap: 'anywhere' }}>
          {parole.periodo(r.da, r.a, r.quale)}
        </div>

        {piastrelle.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginTop: 22 }}>
            {piastrelle.map(p => {
              const dentro = <><span style={NUMERO}>{p.numero}</span><span style={{ ...ETICHETTA, overflowWrap: 'anywhere' }}>{p.etichetta}</span></>
              if (p.chiave === 'tempo') return <div key={p.chiave} style={PIASTRELLA}>{dentro}</div>
              const k = p.chiave
              return <button key={k} type="button" onClick={() => vaiA(k)} style={{ ...PIASTRELLA, cursor: 'pointer' }}>{dentro}</button>
            })}
          </div>
        )}
        {tempo && <div style={{ ...STATO, marginTop: 10 }}>{parole.stima(r.stime, r.riscritte)}</div>}

        {r.punteggio && (
          <div style={{ marginTop: 22 }}>
            <Riga testo={parole.punteggio(r.punteggio)} apri={allaMemoria} />
          </div>
        )}

        {notato.length > 0 && (
          <SezioneFoglio etichetta={t('Cosa ha notato di te')}>
            <Elenco voci={notato} passo={3} riga={(s, i) => <Riga key={i} testo={s} apri={allaMemoria} />} />
          </SezioneFoglio>
        )}
        {mail.length > 0 && (
          <SezioneFoglio etichetta={t('Mail mandate')} stato={parole.preparate('mail', r.preparate.mail)} anello={anello === 'mail'} dentro={el => { sezioni.current.mail = el }}>
            <Elenco voci={mail} passo={passo} riga={rigaMail} />
          </SezioneFoglio>
        )}
        {lavori.length > 0 && (
          <SezioneFoglio etichetta={t('Lavori consegnati')} stato={parole.preparate('lavori', r.preparate.lavori)} anello={anello === 'lavori'} dentro={el => { sezioni.current.lavori = el }}>
            <Elenco voci={lavori} passo={passo} riga={rigaLavoro} />
          </SezioneFoglio>
        )}
        {scadenze.length > 0 && (
          <SezioneFoglio etichetta={t('Scadenze segnalate')} anello={anello === 'scadenze'} dentro={el => { sezioni.current.scadenze = el }}>
            <Elenco voci={scadenze} passo={passo} riga={rigaScadenza} />
          </SezioneFoglio>
        )}
        {segnalate.length > 0 && (
          <SezioneFoglio etichetta={t('Cose che ti ha segnalato')} stato={r.segnalate ? parole.statoSegnalate(r.segnalate) : null} dentro={el => { sezioni.current.segnalate = el }}>
            <Elenco voci={segnalate} passo={passo} riga={rigaSegnalata} />
          </SezioneFoglio>
        )}

        {!r.copertura.postaInviata && r.copertura.bozzeInCasella > 0 && (
          <div role="status" style={{
            marginTop: 26, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', minWidth: 0,
            padding: '10px 16px', borderRadius: 14, background: 'rgba(var(--rame-rgb),.10)', border: '1px solid rgba(var(--rame-rgb),.28)',
            color: 'var(--rame-testo)', fontSize: 13, lineHeight: 1.5
          }}>
            <span style={{ width: 6, height: 6, flex: 'none', borderRadius: '50%', background: 'var(--rame)' }} />
            <span style={{ flex: '1 1 220px', minWidth: 0, textWrap: 'pretty', overflowWrap: 'anywhere' }}>
              {t('La posta inviata non è collegata: le mail mandate da lì non si contano.')}
            </span>
            <Hov as="button" type="button" onClick={() => { chiudi(); v.goConn() }}
              style={{ flex: 'none', padding: '6px 14px', borderRadius: 99, border: '1px solid rgba(var(--rame-rgb),.4)', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--rame-testo)' }}
              hover={{ borderColor: 'var(--rame)' }}>
              {t('Vai alle Fonti')}
            </Hov>
          </div>
        )}
      </div>
    </div>
  )
}
