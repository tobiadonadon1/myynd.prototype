import { useCallback, useEffect, useState } from 'react'
import { frasi, t } from '../lingua'
import { api, type CartellaSuggerita, type ProgettoVisto } from '../api'
import { Bottone, Casella } from '../components/forme'
import { IconPiu } from '../icons'
import { daQuando, lettoInRiga } from '../progetti-vista'
import type { Vals } from '../vals'
import './progetti.css'

/**
 * I progetti, come Myynd li ha capiti.
 *
 * «I want it to have a gist of my projects.» Il quadro di ogni progetto
 * (`server/quadro.ts`) c'era, ma ne uscivano solo le carte del feed. Qui una
 * riga per progetto: il nome, il succo in una riga, quando si è mosso. Un tocco
 * apre il succo intero, il prossimo passo e cosa ha letto per arrivarci. Sotto,
 * piano, le cartelle in cui lavora che non sono ancora un progetto, con un
 * bottone solo: non ne fa mai uno da sé.
 */
export function Progetti({ v }: { v: Vals }) {
  const [vista, setVista] = useState<{ progetti: ProgettoVisto[]; suggeriti: CartellaSuggerita[] } | null>(null)
  const [guaio, setGuaio] = useState(false)
  const [aperto, setAperto] = useState<string | null>(null)
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

  return (
    <main className="pj">
      <h1>{t('Progetti')}</h1>
      {vista.progetti.length === 0
        ? <div className="pj-vuoto-riga"><p className="pj-vuoto">{t('Ancora nessun progetto.')}</p><NuovoProgetto v={v} etichetta={t('Aggiungi un progetto')} /></div>
        : (
          <>
            <ul className="pj-lista">
              {vista.progetti.map(p => (
                <Riga key={p.id} p={p} aperta={aperto === p.id} apri={() => setAperto(a => a === p.id ? null : p.id)} vai={() => v.apriProgetto(p.id)} />
              ))}
            </ul>
            <NuovoProgetto v={v} etichetta={t('Nuovo progetto')} />
          </>
        )}
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

/** Una riga per progetto, su una linea sola; aperta, il succo intero, il prossimo passo e cosa ha letto. */
function Riga({ p, aperta, apri, vai }: { p: ProgettoVisto; aperta: boolean; apri: () => void; vai: () => void }) {
  const succo = p.sintesi || ''
  const passo = p.mossa?.titolo || p.traguardo
  return (
    <li className={`pj-voce${aperta ? ' aperta' : ''}`}>
      <button type="button" className="pj-riga" aria-expanded={aperta} onClick={apri}>
        <span className="pj-nome">{p.nome}</span>
        {/* aperta, il succo sta intero qui sotto: la riga non lo ripete */}
        <span className={`pj-succo${succo ? '' : ' muto'}`} aria-hidden={aperta || undefined}>{aperta ? '' : succo || t('Non ancora letto')}</span>
        <span className="pj-quando">{daQuando(p.ultima)}</span>
      </button>
      {aperta && (
        <div className="pj-dettaglio">
          {succo ? <p className="pj-testo">{succo}</p> : <p className="pj-testo muto">{t('Non ancora letto')}</p>}
          {!!passo && (
            <div className="pj-campo">
              <span className="pj-etichetta">{t('Prossimo passo')}</span>
              <p className="pj-passo">{passo}</p>
              {p.mossa?.testo && <p className="pj-perche">{p.mossa.testo}</p>}
            </div>
          )}
          {p.letto.length > 0 && (
            <div className="pj-campo">
              <span className="pj-etichetta">{t('Cosa ha letto')}</span>
              <p className="pj-letto">{lettoInRiga(p.letto)}</p>
            </div>
          )}
          <div className="pj-piede">
            <span>{p.capito ? frasi.lettoUltimaVolta(daQuando(p.capito)) : ''}</span>
            <Bottone piccolo onClick={vai}>{t('Apri il progetto')}</Bottone>
          </div>
        </div>
      )}
    </li>
  )
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
