import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { frasi, t } from '../lingua'
import { api, type CartellaSuggerita, type ProgettoVisto } from '../api'
import { Bottone, Casella } from '../components/forme'
import { IconPiu } from '../icons'
import { velato } from '../colori-progetto'
import { daQuando, lettoInRiga } from '../progetti-vista'
import { ComeLaVedo } from './ComeLaVedo'
import type { Vals } from '../vals'
import './progetti.css'

/**
 * I progetti, come Myynd li ha capiti.
 *
 * «I want it to have a gist of my projects.» Il quadro di ogni progetto
 * (`server/quadro.ts`) c'era, ma ne uscivano solo le carte del feed.
 *
 * Era un elenco di righe con un filo sotto, e si leggeva come una lista
 * scritta: «make it look less like a writing list, more aesthetic and
 * functional» (19 ottobre 2026). Adesso è un fuoco e uno scaffale: in alto,
 * grande, il progetto che conta adesso (l'alta priorità, se c'è, se no quello
 * che si è mosso per ultimo) col succo intero, il prossimo passo e cosa ha
 * letto; sotto, una tessera per ciascuno degli altri, nel suo colore. Una
 * tessera premuta prende il posto in alto; «Apri il progetto» apre la pagina.
 * Sotto ancora, piano, le cartelle in cui lavora che non sono ancora un
 * progetto, con un bottone solo: non ne fa mai uno da sé.
 */
export function Progetti({ v }: { v: Vals }) {
  const [vista, setVista] = useState<{ progetti: ProgettoVisto[]; suggeriti: CartellaSuggerita[] } | null>(null)
  const [guaio, setGuaio] = useState(false)
  const [scelto, setScelto] = useState<string | null>(null)
  const [aggiungo, setAggiungo] = useState<string | null>(null)
  const carica = useCallback(async () => {
    try { setVista(await api.vistaProgetti()); setGuaio(false) } catch { setGuaio(true) }
  }, [])
  // e di nuovo quando i progetti cambiano altrove (uno nuovo, un nome cambiato)
  const quanti = v.progetti.length
  useEffect(() => { void carica() }, [carica, quanti])

  const aggiungi = async (c: CartellaSuggerita) => {
    if (aggiungo) return
    setAggiungo(c.percorso)
    // la riga se ne va subito: il gesto si vede prima della risposta
    setVista(x => x && { ...x, suggeriti: x.suggeriti.filter(s => s.percorso !== c.percorso) })
    try {
      await api.progettoDaCartella(c.percorso)
      await v.ricaricaProgetti()
      await carica()
    } catch {
      v.mostraToast(t('Non sono riuscito ad aggiungerla.'))
      await carica()
    } finally { setAggiungo(null) }
  }

  if (guaio && !vista) return <main className="pj"><h1>{t('Progetti')}</h1><p className="pj-vuoto">{t('Non sono riuscito a leggere i progetti.')}</p></main>
  if (!vista) return <main className="pj" aria-busy="true"><h1>{t('Progetti')}</h1></main>

  const fuoco = vista.progetti.find(p => p.id === scelto) ?? inFuoco(vista.progetti)
  const altri = vista.progetti.filter(p => p !== fuoco)
  const scegli = (id: string) => {
    setScelto(id)
    document.querySelector('.pj')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <main className="pj">
      <h1>{t('Progetti')}</h1>
      {!fuoco
        ? <div className="pj-vuoto-riga"><p className="pj-vuoto">{t('Ancora nessun progetto.')}</p><NuovoProgetto v={v} etichetta={t('Aggiungi un progetto')} /></div>
        : (
          <>
            <Fuoco key={fuoco.id} p={fuoco} colore={v.coloreProgetto(fuoco.id)} vai={() => v.apriProgetto(fuoco.id)} />
            <ul className="pj-scaffale" aria-label={t('Progetti')}>
              {altri.map(p => (
                <li key={p.id}>
                  <Tessera p={p} colore={v.coloreProgetto(p.id)} scegli={() => scegli(p.id)} />
                </li>
              ))}
              <li className="pj-tessera-nuova"><NuovoProgetto v={v} etichetta={t('Nuovo progetto')} /></li>
            </ul>
          </>
        )}
      {/* come vede la sua settimana, e la frase che la corregge (`ComeLaVedo.tsx`) */}
      {!!fuoco && <ComeLaVedo v={v} dopo={() => void carica()} />}
      {vista.suggeriti.length > 0 && (
        <section className="pj-cartelle" aria-labelledby="pj-cartelle-titolo">
          <h2 id="pj-cartelle-titolo">{t('Cartelle in cui stai lavorando')}</h2>
          <ul>
            {vista.suggeriti.map(c => (
              <li key={c.percorso} className="pj-cartella">
                <span className="pj-cartella-nome">{c.nome}</span>
                <span className="pj-cartella-dove" title={c.percorso}>{c.dove}</span>
                <span className="pj-quando">{daQuando(c.ultima)}</span>
                <Bottone piccolo onClick={() => void aggiungi(c)} occupato={aggiungo === c.percorso}>{t('Aggiungi')}</Bottone>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}

/** Il progetto grande in alto: il succo intero, il prossimo passo, cosa ha letto, e la porta della sua pagina. */
function Fuoco({ p, colore, vai }: { p: ProgettoVisto; colore: string; vai: () => void }) {
  const succo = p.sintesi || ''
  const passo = p.mossa?.titolo || p.traguardo
  const quando = daQuando(p.ultima)
  return (
    <article className="pj-fuoco" style={{ '--pj-colore': colore, '--pj-velo': velato(colore, .10), '--pj-filo': velato(colore, .34) } as CSSProperties}>
      <header className="pj-fuoco-testa">
        <span className="pj-punto" aria-hidden="true" />
        <h2 className="pj-fuoco-nome">{p.nome}</h2>
        {p.priorita === 'alta' && <span className="pj-alta">{t('Priorità alta')}</span>}
        {quando && <span className="pj-quando">{quando}</span>}
      </header>
      {succo ? <p className="pj-testo">{succo}</p> : <p className="pj-testo muto">{t('Non ancora letto')}</p>}
      {!!passo && (
        <div className="pj-campo pj-passo-riquadro">
          <span className="pj-etichetta">{t('Prossimo passo')}</span>
          <p className="pj-passo">{passo}</p>
          {p.mossa?.testo && <p className="pj-perche">{p.mossa.testo}</p>}
        </div>
      )}
      <div className="pj-piede">
        <span title={p.letto.length > 0 ? lettoInRiga(p.letto) : undefined}>
          {[p.capito ? frasi.lettoUltimaVolta(daQuando(p.capito)) : '', p.letto.length > 0 ? lettoInRiga(p.letto) : ''].filter(Boolean).join(' · ')}
        </span>
        <Bottone piccolo onClick={vai}>{t('Apri il progetto')}</Bottone>
      </div>
    </article>
  )
}

/** Una tessera dello scaffale: il colore, il nome, quando si è mosso. Premuta, sale in alto. */
function Tessera({ p, colore, scegli }: { p: ProgettoVisto; colore: string; scegli: () => void }) {
  const quando = daQuando(p.ultima)
  return (
    <button type="button" className="pj-tessera" onClick={scegli} title={p.sintesi || p.nome}
      style={{ '--pj-colore': colore, '--pj-velo': velato(colore, .07), '--pj-filo': velato(colore, .26) } as CSSProperties}>
      <span className="pj-tessera-nome"><span className="pj-punto" aria-hidden="true" /><span>{p.nome}</span></span>
      <span className="pj-quando">{quando || t('Non ancora letto')}</span>
    </button>
  )
}

/** Quello che conta adesso: l'alta priorità che si è mossa per ultima, se no il primo che si è mosso. */
function inFuoco(progetti: ProgettoVisto[]): ProgettoVisto | undefined {
  const recente = (a: ProgettoVisto, b: ProgettoVisto) => (b.ultima ?? '').localeCompare(a.ultima ?? '')
  return [...progetti].sort((a, b) => (a.priorita === 'alta' ? 0 : 1) - (b.priorita === 'alta' ? 0 : 1) || recente(a, b))[0]
}

/** «Nuovo progetto», che diventa la casella dove si scrive: Invio e c'è, per la stessa strada della prima pagina (`RigaProgetti`). */
function NuovoProgetto({ v, etichetta }: { v: Vals; etichetta: string }) {
  const [scrivo, setScrivo] = useState(false)
  const [nome, setNome] = useState('')
  const crea = async () => {
    const pulito = nome.trim()
    if (!pulito) return
    setNome(''); setScrivo(false)
    if (!await v.nuovoProgetto(pulito)) { setNome(pulito); setScrivo(true) }
  }
  if (!scrivo) {
    return (
      <button type="button" className="pj-gesto" onClick={() => setScrivo(true)}>
        <IconPiu size={12} />{etichetta}
      </button>
    )
  }
  return (
    <div className="pj-nuovo">
      {/* Esc svuota la casella, e una casella vuota che perde il fuoco torna il gesto */}
      <Casella autoFocus aria-label={t('Nuovo progetto')} valore={nome} cambia={setNome} maxLength={100}
        invio={() => void crea()} alUscire={() => { if (!nome.trim()) setScrivo(false) }}
        esempio={t('Il rilancio del sito')}
        dopo={nome.trim() ? <Bottone piccolo onMouseDown={e => e.preventDefault()} onClick={() => void crea()}>{t('Aggiungi')}</Bottone> : undefined} />
    </div>
  )
}
