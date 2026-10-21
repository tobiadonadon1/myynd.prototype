import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { lingua, t } from '../lingua'
import { api, type CorrezioneFatta, type PrioritaSue } from '../api'
import { Bottone, Casella } from '../components/forme'
import { velato } from '../colori-progetto'
import type { Vals } from '../vals'

/**
 * Come Myynd vede la sua settimana, e la frase che la corregge.
 *
 * «Show me what you think I'm doing, and let me correct it in one sentence.»
 * In alto i progetti attivi nell'ordine in cui Myynd li tiene, ognuno con la
 * cosa di questa settimana in una riga e il perché preso dal suo materiale;
 * sotto, piano, quello che lascia stare apposta. In fondo la barra di casa
 * (`Casella`, la stessa scatola di `Barra.tsx`): una frase, e i cambi si vedono qui
 * sotto uno per riga, ognuno con il suo «Disfa».
 *
 * Il gesto si vede subito: la frase lascia la barra e diventa la riga di
 * stato prima che il modello risponda; se qualcosa va storto, la frase torna
 * nella barra com'era.
 */
type Giro =
  | { stato: 'in corso'; frase: string }
  | { stato: 'cambi'; correzione: CorrezioneFatta }
  | { stato: 'domanda'; frase: string; testo: string }
  | { stato: 'risposta'; testo: string }
  | { stato: 'guaio'; testo: string }

const CAMPO_ID = 'cv-frase'

const dataBreve = (giorno: string) => new Date(`${giorno}T12:00:00`).toLocaleDateString(lingua() === 'it' ? 'it-IT' : 'en-GB', { day: 'numeric', month: 'long' })

export function ComeLaVedo({ v, dopo }: { v: Vals; dopo?: () => void }) {
  const [vista, setVista] = useState<PrioritaSue | null>(null)
  const [testo, setTesto] = useState('')
  const [giro, setGiro] = useState<Giro | null>(null)

  const carica = useCallback(async () => {
    try { setVista(await api.prioritaSue()) } catch { /* la sezione resta com'era */ }
  }, [])
  const quanti = v.progetti.length
  useEffect(() => { void carica() }, [carica, quanti])

  const manda = async () => {
    const scritta = testo.trim()
    if (!scritta || giro?.stato === 'in corso') return
    // una risposta a una domanda di ritorno porta con sé la frase di prima: da sola («Orbit») non dice cosa fare
    const frase = giro?.stato === 'domanda' ? `${giro.frase}. ${scritta}` : scritta
    setTesto('')
    setGiro({ stato: 'in corso', frase: scritta })
    try {
      const r = await api.correggiPriorita(frase)
      setVista(r.vista)
      if (r.esito.genere === 'cambi') { setGiro({ stato: 'cambi', correzione: r.esito.correzione }); dopo?.(); void v.ricaricaProgetti() }
      else if (r.esito.genere === 'domanda') { setGiro({ stato: 'domanda', frase, testo: r.esito.testo }); document.getElementById(CAMPO_ID)?.focus() }
      else setGiro({ stato: 'risposta', testo: r.esito.testo })
    } catch (e) {
      // la frase torna nella barra, con le sue parole
      setTesto(scritta)
      setGiro({ stato: 'guaio', testo: e instanceof Error && e.message ? t(e.message) : t('Non sono riuscito a cambiarlo.') })
    }
  }

  const disfa = async (c: CorrezioneFatta, i: number) => {
    // subito: la riga si spegne prima della risposta, e torna se non riesce
    const segna = (disfatto: boolean) => setGiro(g => g?.stato === 'cambi' && g.correzione.id === c.id
      ? { stato: 'cambi', correzione: { ...g.correzione, cambi: g.correzione.cambi.map((x, j) => j === i ? { ...x, disfatto } : x) } } : g)
    segna(true)
    try {
      const r = await api.disfaCorrezione(c.id, i)
      setVista(r.vista)
      dopo?.()
      void v.ricaricaProgetti()
    } catch {
      segna(false)
      v.mostraToast(t('Non sono riuscito a cambiarlo.'))
    }
  }

  if (!vista) return null
  const qualcosa = !!testo.trim() && giro?.stato !== 'in corso'

  return (
    <section className="cv" aria-labelledby="cv-titolo">
      <h2 id="cv-titolo" className="cv-titolo">{t('Come vedo la tua settimana')}</h2>
      {vista.ordine.length > 0 && (
        <ol className="cv-ordine">
          {vista.ordine.map(r => {
            const colore = v.coloreProgetto(r.id)
            return (
              <li key={r.id} className="cv-riga" style={{ '--pj-colore': colore, '--pj-velo': velato(colore, .10), '--pj-filo': velato(colore, .34) } as CSSProperties}>
                <div className="cv-testa">
                  <span className="pj-punto" aria-hidden="true" />
                  <span className="cv-nome">{r.nome}</span>
                  {r.alta && <span className="pj-alta">{t('Priorità alta')}</span>}
                </div>
                <p className={r.fuoco ? 'cv-fuoco' : 'cv-fuoco muto'}>{r.fuoco || t('Non ancora letto')}</p>
                {!!r.perche && <p className="cv-perche">{r.perche}</p>}
              </li>
            )
          })}
        </ol>
      )}

      {vista.lasciati.length > 0 && (
        <div className="cv-lasciati">
          <h3>{t('Lascio stare')}</h3>
          <ul>
            {vista.lasciati.map(l => (
              <li key={`${l.genere}:${l.id}`}>
                <span className="cv-lasciato-nome">{l.nome}</span>
                <span className="cv-lasciato-stato">
                  {l.genere === 'pausa' ? (l.fino ? `${t('In pausa fino al')} ${dataBreve(l.fino)}` : t('In pausa'))
                    : l.genere === 'detto' ? t('Fermo, l’hai detto tu')
                    : l.progetto ? `${t('Solo per')} ${l.progetto}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form className="cv-correggi" onSubmit={e => { e.preventDefault(); void manda() }}>
        {/* la scatola è quella di casa (`Barra.tsx`): una barra sola per scrivere, in tutta l'app */}
        <Casella id={CAMPO_ID} valore={testo} cambia={setTesto} invio={() => void manda()} maxLength={400}
          aria-label={t('Correggimi in una frase')}
          esempio={giro?.stato === 'domanda' ? t('Rispondi qui, o scrivi un’altra frase') : t('Correggimi in una frase')} />
        <Bottone tipo="pieno" type="submit" disabled={!qualcosa}>{t('Manda')}</Bottone>
      </form>

      {giro && (
        <div className="cv-esito" role="status" aria-live="polite">
          {giro.stato === 'in corso' && <p className="cv-stato"><span className="cv-frase">{giro.frase}</span><span className="cv-attesa">{t('Lo cambio…')}</span></p>}
          {giro.stato === 'cambi' && (
            <ul className="cv-cambi">
              {giro.correzione.cambi.map((c, i) => (
                <li key={i} className={c.disfatto ? 'disfatto' : undefined}>
                  <span className="cv-cambio">{c.riga}</span>
                  {c.disfatto
                    ? <span className="cv-disfatto">{t('Disfatto')}</span>
                    : <button type="button" className="cv-disfa" onClick={() => void disfa(giro.correzione, i)}>{t('Disfa')}</button>}
                </li>
              ))}
            </ul>
          )}
          {giro.stato === 'domanda' && <p className="cv-domanda">{giro.testo}</p>}
          {giro.stato === 'risposta' && <p className="cv-risposta">{giro.testo}</p>}
          {giro.stato === 'guaio' && <p className="cv-guaio">{giro.testo}</p>}
        </div>
      )}
    </section>
  )
}
