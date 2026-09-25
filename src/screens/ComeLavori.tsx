// «Come lavori»: le righe che Myynd ha contato su di te, le affermazioni di
// oggi e di ieri, e quante volte ci ha preso accanto a chi non ti conosce.
//
// Sta nella Memoria subito dopo i progetti. Ogni gesto è ottimista: la riga
// cambia subito, e se il server dice di no torna com'era con una riga di rame.
// Niente spiega il software: un titolo, una riga di stato, le righe.

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { api, gemelloApi, type AbitudineVista, type Gemello, type PrevisioneVista } from '../api'
import { frasi, t } from '../lingua'
import { Cestino, useAttiva } from '../ui'
import { IconCroce, IconGiu, IconSpunta } from '../icons'
import { portaAlleFonti } from '../vals'
import { preparaApertura } from '../navigazione'
import * as g from '../gemello-frasi'

type Gruppo = 'posta' | 'agenda' | 'lavoro'
/** I tagli «Tutte (n)»: cinque righe per mittente (posta e agenda), tre per cartella; il resto si apre con un tocco. */
const TAGLI: Record<Gruppo, { generi: Set<string>; quante: number }> = {
  posta: { generi: new Set(['posta.risponde_sempre', 'posta.lascia']), quante: 5 },
  agenda: { generi: new Set(['agenda.rifiuta']), quante: 5 },
  lavoro: { generi: new Set(['codice.con_agenti']), quante: 3 }
}
const gruppoDi = (genere: string): Gruppo =>
  genere.startsWith('posta.') ? 'posta' : genere.startsWith('agenda.') ? 'agenda' : 'lavoro'

type Prova = { riga: string; esempi: AbitudineVista['esempi'] }

/**
 * Una riga di «Come lavori»: la frase, l'evidenza, il perché; sotto mano,
 * Correggi e il cestino. Le proprietà sono quelle che P5 sposterà altrove.
 */
export function RigaAbitudine({ testo, prova, inAttesa, superata, fino, guaioFuori, correggi, tieni, scorda }: {
  testo: string; prova: Prova; inAttesa: boolean; superata?: boolean; fino?: string | null
  /** Un guaio nato fuori dalla scheda (un «togli» non riuscito): si mostra qui, sotto la riga premuta. */
  guaioFuori?: string
  correggi: (testo: string) => Promise<void>; tieni?: () => Promise<void>; scorda: () => Promise<void>
}) {
  const { attiva, props } = useAttiva()
  const [aperta, setAperta] = useState(false)
  const [modifico, setModifico] = useState(false)
  const [bozza, setBozza] = useState(testo)
  const [mostrato, setMostrato] = useState(testo)
  const [guaio, setGuaio] = useState('')
  const [aspetta, setAspetta] = useState(inAttesa)
  const campo = useRef<HTMLInputElement>(null)
  useEffect(() => { setMostrato(testo); setBozza(testo) }, [testo])
  useEffect(() => { setAspetta(inAttesa) }, [inAttesa])
  useEffect(() => { if (modifico) campo.current?.select() }, [modifico])
  useEffect(() => { if (guaioFuori) setGuaio(guaioFuori) }, [guaioFuori])

  const salva = async () => {
    const nuovo = bozza.trim()
    setModifico(false)
    if (!nuovo || nuovo === mostrato) { setBozza(mostrato); return }
    const prima = mostrato
    setMostrato(nuovo); setGuaio('')
    try { await correggi(nuovo) } catch {
      // torna com'era, riapre con le sue parole, e lo dice
      setMostrato(prima); setBozza(nuovo); setModifico(true); setGuaio(t('Non sono riuscito a salvarla.'))
    }
  }
  const tasti = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); void salva() }
    if (e.key === 'Escape') { e.preventDefault(); setBozza(mostrato); setModifico(false); setGuaio('') }
  }
  const tienila = async () => {
    if (!tieni) return
    setAspetta(false); setGuaio('')
    try { await tieni() } catch { setAspetta(true); setGuaio(t('Non sono riuscito a salvarla.')) }
  }
  // «Portami lì»: il documento dell'esempio (una mail, non una riga della lista), aperto come ogni altra fonte
  const esempio = async (doc: string) => {
    setGuaio('')
    const apertura = preparaApertura()
    try {
      const r = await apertura.completa(await api.portamiDocumento(doc))
      if (!r.ok) setGuaio(t(r.errore))
    } catch { apertura.annulla(); setGuaio(t('Non trovo più il documento.')) }
  }
  const scordala = async () => { setGuaio(''); await scorda() }

  return (
    <div {...props} className="mem-card mem-convinzione cl-card" data-attiva={attiva ? '' : undefined} data-superata={superata ? '' : undefined}>
      {modifico ? (
        <input ref={campo} className="cl-campo" value={bozza} onChange={e => setBozza(e.target.value)} onKeyDown={tasti} onBlur={() => void salva()} aria-label={t('Correggi')} />
      ) : (
        <div className="mem-enunciato" title={mostrato}>{mostrato}</div>
      )}
      <div className="mem-meta">
        <span>{prova.riga}</span>
        {aspetta && <span style={{ color: 'var(--rame-testo)' }}>{t('non la sto usando')}</span>}
        {superata && fino && <span>{g.finoAl(fino)}</span>}
        {prova.esempi.length > 0 && (
          <button type="button" className="mem-perche" onClick={() => setAperta(a => !a)} aria-expanded={aperta}>
            {t('perché')}
            <span style={{ display: 'flex', transform: aperta ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
              <IconGiu size={9} stroke="currentColor" />
            </span>
          </button>
        )}
        {/* i gesti stanno in fondo alla riga dei numeri: la frase tiene tutta la larghezza */}
        {!superata && !modifico && (
          <div className="cl-gesti">
            <button type="button" className="cl-correggi" onClick={() => setModifico(true)}>{t('Correggi')}</button>
            <Cestino fai={scordala} titolo={t('Toglila')} visibile={attiva} subito />
          </div>
        )}
      </div>
      {aspetta && tieni && !superata && (
        <button type="button" className="mem-tieni" onClick={() => void tienila()}>{t('Tienila')}</button>
      )}
      {guaio && <div className="mem-guaio">{guaio}</div>}
      {aperta && (
        <div className="mem-prova">
          {prova.esempi.map((e, i) => (
            <div key={i} className="cl-esempio">
              <span title={e.testo}>{g.esempio(e)}</span>
              {e.doc && <button type="button" onClick={() => void esempio(e.doc!)}>{t('Portami lì')}</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Una riga tolta: per sei secondi resta il posto per ripensarci. */
function Tolta({ annulla }: { annulla: () => void }) {
  return (
    <div className="mem-card cl-card cl-tolta">
      <span>{t('Tolta.')}</span>
      <button type="button" onClick={annulla}>{frasi.annullaGesto()}</button>
    </div>
  )
}

function Affermazione({ p }: { p: PrevisioneVista }) {
  const frase = g.rigaPrevisione(p)
  const parola = g.esitoPrevisione(p.esito)
  return (
    <div className="cl-affermazione">
      <span className="cl-frase" title={frase}>{frase}</span>
      {p.titolo && <span className="cl-oggetto" title={p.titolo}>{p.titolo}</span>}
      <span className={`cl-segno${p.esito === 'giusta' ? ' giusta' : p.esito === 'sbagliata' ? ' sbagliata' : ''}`} aria-label={parola} title={parola}>
        {p.esito === 'giusta' ? <IconSpunta size={14} style={{ stroke: 'var(--verde-cupo)' }} />
          : p.esito === 'sbagliata' ? <IconCroce size={10} />
          : parola}
      </span>
    </div>
  )
}

/** Il posto giusto per la riga in fondo al punto: `myynd:vai = come-lavori` porta qui e cerchia. */
const VAI = 'myynd:vai'

export function ComeLavori() {
  const [d, setD] = useState<Gemello | null>(null)
  const [tolte, setTolte] = useState<Map<string, { stato: AbitudineVista['stato']; orologio: ReturnType<typeof setTimeout> }>>(new Map())
  /** Per riga: il «togli» che non è riuscito, mostrato dentro la scheda tornata al suo posto. */
  const [guai, setGuai] = useState<Map<string, string>>(new Map())
  /** I gruppi in cui «Tutte (n)» è stato premuto. */
  const [aperti, setAperti] = useState<Set<Gruppo>>(new Set())
  const [superateAperte, setSuperateAperte] = useState(false)
  const [cerchiata, setCerchiata] = useState(false)
  const [guaio, setGuaio] = useState('')
  const sezione = useRef<HTMLElement>(null)

  const carica = useCallback(async () => {
    try { setD(await gemelloApi.vista()) } catch { /* la sezione resta com'è, o non compare */ }
  }, [])
  useEffect(() => { void carica() }, [carica])

  useEffect(() => {
    if (!d) return
    let vai = ''
    try { vai = sessionStorage.getItem(VAI) ?? ''; if (vai) sessionStorage.removeItem(VAI) } catch { /* senza deposito */ }
    if (vai !== 'come-lavori') return
    const s = sezione.current
    if (!s) return
    // senza animazione: uno scorrimento morbido ancora in corso quando la pagina cresce continua verso un
    // punto vecchio, e la sezione finisce mezza fuori; il cerchio di rame è il segno, non il movimento
    s.scrollIntoView({ block: 'start' })
    setCerchiata(true)
    // i blocchi sopra (i progetti) possono arrivare dopo e spingere giù la sezione: per un secondo e mezzo,
    // ogni volta che la sezione cambia posto nella pagina, si riatterra in cima
    let posto = s.offsetTop
    const segui = setInterval(() => {
      if (s.offsetTop === posto) return
      posto = s.offsetTop
      s.scrollIntoView({ block: 'start' })
    }, 120)
    const basta = setTimeout(() => clearInterval(segui), 1500)
    const o = setTimeout(() => setCerchiata(false), 1600)
    return () => { clearTimeout(o); clearTimeout(basta); clearInterval(segui) }
  }, [d])

  if (!d) return null
  const righe = d.abitudini
  const vuota = !righe.length && !d.oggi.quante && !d.ieri && !d.guai.length
  if (vuota) return null

  const aggiornaRiga = (chiave: string, cambio: Partial<AbitudineVista>) =>
    setD(v => v ? { ...v, abitudini: v.abitudini.map(a => a.chiave === chiave ? { ...a, ...cambio } : a) } : v)

  const correggi = (a: AbitudineVista) => async (testo: string) => {
    await gemelloApi.abitudine(a.chiave, 'correggi', testo)
    aggiornaRiga(a.chiave, { testoSuo: testo, stato: 'corretta', inVigore: true })
  }
  const tieni = (a: AbitudineVista) => async () => {
    await gemelloApi.abitudine(a.chiave, 'tieni')
    aggiornaRiga(a.chiave, { stato: 'tenuta', inVigore: true })
  }
  const scorda = (a: AbitudineVista) => async () => {
    const prima = a.stato
    // passati i sei secondi la riga se ne va davvero anche da qui: il server la ha già come tolta
    const orologio = setTimeout(() => {
      setTolte(m => { const n = new Map(m); n.delete(a.chiave); return n })
      setD(v => v ? { ...v, abitudini: v.abitudini.filter(x => x.chiave !== a.chiave) } : v)
    }, 6000)
    setTolte(m => new Map(m).set(a.chiave, { stato: prima, orologio }))
    setGuai(m => { const n = new Map(m); n.delete(a.chiave); return n })
    try { await gemelloApi.abitudine(a.chiave, 'togli') }
    catch {
      clearTimeout(orologio)
      setTolte(m => { const n = new Map(m); n.delete(a.chiave); return n })
      setGuai(m => new Map(m).set(a.chiave, t('Non sono riuscito a toglierla.')))
    }
  }
  const annulla = (a: AbitudineVista) => async () => {
    const v = tolte.get(a.chiave)
    if (!v) return
    clearTimeout(v.orologio)
    setTolte(m => { const n = new Map(m); n.delete(a.chiave); return n })
    try { await gemelloApi.abitudine(a.chiave, 'ripristina', undefined, v.stato) }
    catch { setGuaio(t('Non sono riuscito a toglierla.')); void carica() }
  }

  const vive = righe.filter(a => a.stato !== 'superata')
  const superate = righe.filter(a => a.stato === 'superata')
  const riga = (a: AbitudineVista) => {
    const tolta = tolte.get(a.chiave)
    if (tolta) return <Tolta key={a.chiave} annulla={() => void annulla(a)()} />
    return (
      <RigaAbitudine key={a.chiave} testo={g.rigaAbitudine(a)} prova={{ riga: g.provaAbitudine(a), esempi: a.esempi }}
        inAttesa={!a.inVigore} guaioFuori={guai.get(a.chiave)} correggi={correggi(a)} tieni={a.inVigore ? undefined : tieni(a)} scorda={scorda(a)} />
    )
  }
  const gruppi: { chiave: Gruppo; titolo: string }[] = [
    { chiave: 'posta', titolo: t('Posta') }, { chiave: 'agenda', titolo: t('Agenda') }, { chiave: 'lavoro', titolo: t('Lavoro') }
  ]
  const punteggio = d.punteggio ? g.frasePunteggio(d.punteggio.giuste, d.punteggio.totale, d.punteggio.base) : ''
  const oggi = g.faseOggi(d.oggi)

  return (
    <section ref={sezione} id="come-lavori" className={`mem-section cl-section${cerchiata ? ' cl-cerchiata' : ''}`}>
      <div className="mem-section-head">
        <h2>{t('Come lavori')}</h2>
        {punteggio && <span className="mem-stato">{punteggio}</span>}
      </div>

      {d.guai.includes('posta-inviata') && (
        <div className="cl-riga-fissa" role="status">
          <span>{t('Non vedo la posta che mandi.')}</span>
          <button type="button" className="mem-tieni" onClick={() => portaAlleFonti()}>{t('Vai alle Fonti')}</button>
        </div>
      )}

      {oggi && (
        <div className="cl-blocco">
          <div className="cl-blocco-titolo">{oggi}</div>
          {!d.oggi.sigillate && <div className="cl-affermazioni">{d.oggi.previsioni.map(p => <Affermazione key={p.id} p={p} />)}</div>}
        </div>
      )}

      {d.ieri && (
        <div className="cl-blocco">
          <div className="cl-blocco-titolo">{g.rigaIeri(d.ieri)}</div>
          <div className="cl-affermazioni">{d.ieri.previsioni.map(p => <Affermazione key={p.id} p={p} />)}</div>
        </div>
      )}

      {d.fiducia.length > 0 && (
        <div className="cl-blocco cl-fiducia">
          {d.fiducia.map(f => { const r = g.rigaFiducia(f); return r ? <div key={f.genere} title={r}>{r}</div> : null })}
        </div>
      )}

      {gruppi.map(gr => {
        const mie = vive.filter(a => gruppoDi(a.genere) === gr.chiave)
        if (!mie.length) return null
        const taglio = TAGLI[gr.chiave]
        // per numero di mail o giorni contati (`su`, lo stesso della regola dei venti casi; `casi` dove non c'è): le più forti in cima
        const peso = (a: AbitudineVista) => a.su ?? a.casi
        const inOrdine = (xs: AbitudineVista[]) => xs.slice().sort((x, y) => peso(y) - peso(x) || y.casi - x.casi || x.chiave.localeCompare(y.chiave))
        // il taglio «Tutte (n)» vale per le righe per mittente o per cartella: le prime restano, le altre aspettano un tocco
        const contate = inOrdine(mie.filter(a => taglio.generi.has(a.genere)))
        const altre = mie.filter(a => !taglio.generi.has(a.genere))
        const nascoste = !aperti.has(gr.chiave) && contate.length > taglio.quante
        const mostrate = nascoste ? contate.slice(0, taglio.quante) : contate
        return (
          <div key={gr.chiave} className="cl-blocco">
            <div className="cl-gruppo">{gr.titolo}</div>
            <div className="cl-griglia">{inOrdine([...mostrate, ...altre]).map(riga)}</div>
            {nascoste && <button type="button" className="cl-altre" onClick={() => setAperti(v => new Set(v).add(gr.chiave))}>{g.tutte(contate.length)}</button>}
          </div>
        )
      })}

      {superate.length > 0 && (
        <div className="cl-blocco">
          <button type="button" className="mem-piega" onClick={() => setSuperateAperte(v => !v)} aria-expanded={superateAperte}>
            <span className="freccia" style={{ transform: superateAperte ? 'none' : 'rotate(-90deg)' }}><IconGiu size={10} stroke="currentColor" /></span>
            <span className="cl-blocco-titolo" style={{ margin: 0 }}>{g.nonValgonoPiu(superate.length)}</span>
          </button>
          {superateAperte && (
            <div className="cl-griglia" style={{ marginTop: 8 }}>
              {superate.map(a => (
                <RigaAbitudine key={a.chiave} testo={g.rigaAbitudine(a)} prova={{ riga: g.provaAbitudine(a), esempi: a.esempi }}
                  inAttesa={false} superata fino={a.fino} correggi={correggi(a)} scorda={scorda(a)} />
              ))}
            </div>
          )}
        </div>
      )}

      {guaio && <div className="mem-guaio" role="status">{guaio}</div>}
    </section>
  )
}
