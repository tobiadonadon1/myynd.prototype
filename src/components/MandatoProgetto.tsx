// Il mandato del progetto, sulla sua pagina.
//
// Quello che Myynd fa da solo su questo progetto, quello per cui chiede, e
// quello che non fa mai: tre righe corte, e ogni azione si sposta con un
// tocco nella riga dopo. Sopra l'esito, come lo sapremo, entro quando, il
// budget del mese e quando lo si rivede: campi che si salvano da sé. Un
// bottone solo, «Conferma», finché è proposto. È l'unico posto da cui il
// mandato cambia (`PUT /api/progetti/:id/mandato`).

import { useEffect, useState } from 'react'
import { api, type ClasseMandato, type CambioMandato, type RegolaMandato, type StatoMandato } from '../api'
import { frasi, t } from '../lingua'
import { Campo } from './forme'

const NOMI: Record<ClasseMandato, string> = {
  bozza_posta: 'Bozze nella casella', file: 'File', notion: 'Notion', nota: 'Note',
  codice_copia: 'Codice in una copia', codice_applica: 'Codice nel progetto', invio: 'Invii',
  pubblica: 'Pubblicare', calendario: 'Calendario', paga: 'Pagamenti', cancella: 'Cancellare',
  contatto_nuovo: 'Persone nuove'
}

const RIGHE: { regola: RegolaMandato; titolo: string }[] = [
  { regola: 'auto', titolo: 'Fa da solo' }, { regola: 'chiedi', titolo: 'Mi chiede' }, { regola: 'mai', titolo: 'Mai' }
]

/**
 * Quello che il lavoro da solo non sa ancora fare (lo stesso elenco di
 * `SENZA_MANO` in `server/mandato.ts`): per queste «da solo» non si offre,
 * e il tocco passa fra «chiede» e «mai».
 */
export const SENZA_MANO: readonly ClasseMandato[] = ['invio', 'pubblica', 'paga', 'calendario']

/** La riga dopo: da solo, chiede, mai, e di nuovo da solo (o di nuovo chiede, se da solo non c'è). */
export function dopo(r: RegolaMandato, c?: ClasseMandato): RegolaMandato {
  const senza = !!c && SENZA_MANO.includes(c)
  return r === 'auto' ? 'chiedi' : r === 'chiedi' ? 'mai' : senza ? 'chiedi' : 'auto'
}

const GIORNO = /^\d{4}-\d{2}-\d{2}$/

export function MandatoProgetto({ progetto }: { progetto: string }) {
  const [s, setS] = useState<StatoMandato | null>(null)
  const [guaio, setGuaio] = useState('')
  const [manda, setManda] = useState(false)

  useEffect(() => {
    let vivo = true
    api.mandato(progetto).then(r => { if (vivo) setS(r) }).catch(() => { if (vivo) setGuaio('Non sono riuscito a leggere il mandato.') })
    return () => { vivo = false }
  }, [progetto])

  const salva = async (c: CambioMandato) => {
    setGuaio('')
    try { setS(await api.salvaMandato(progetto, c)) }
    catch (e) { const m = e instanceof Error ? e.message : String(e); setGuaio(m); throw e }
  }
  const data = (k: 'scadenza' | 'revisione') => async (v: string) => {
    const x = v.trim()
    if (x && !GIORNO.test(x)) throw new Error('Una data è giorno, mese e anno.')
    await salva({ [k]: x || null })
  }

  if (!s) return guaio ? <section className="prog-sezione"><div role="alert" className="prog-guaio">{t(guaio)}</div></section> : null
  const m = s.mandato
  // le regole che si vedono sono le sue, quelle che valgono da confermato (da proposto vale la più stretta fra queste e quelle di serie)
  const regole = m.classi
  const confermato = m.stato === 'confermato'

  const sposta = (c: ClasseMandato) => {
    const nuova = dopo(regole[c], c)
    // si vede subito, prima della risposta del server
    setS({ ...s, mandato: { ...m, classi: { ...m.classi, [c]: nuova } } })
    void salva({ classi: { [c]: nuova } }).catch(() => {})
  }

  return (
    <section className="prog-sezione prog-mandato" aria-labelledby="prog-mandato">
      <div className="prog-testa">
        <h2 id="prog-mandato">{t('Il mandato')}</h2>
        <span className="prog-mandato-stato" data-stato={m.stato}>{t(confermato ? 'Confermato' : 'Proposto')}</span>
        {s.spesa > 0 && <span className="prog-mandato-spesa">{frasi.spesaDelMese(s.spesa)}</span>}
      </div>
      <div className="prog-mandato-campi">
        <Campo etichetta={t('Esito')} valore={m.esito} limite={200} salva={v => salva({ esito: v })} />
        <Campo etichetta={t('Come lo sapremo')} valore={m.misura} limite={160} salva={v => salva({ misura: v })} />
        <div className="prog-mandato-tre">
          <Campo etichetta={t('Entro')} valore={m.scadenza ?? ''} esempio="2026-12-31" salva={data('scadenza')} />
          <Campo etichetta={t('Budget al mese ($)')} valore={m.budget == null ? '' : String(m.budget)} esempio="5"
            salva={v => salva({ budget: v.trim() ? Number(v.replace(',', '.')) : null })} />
          <Campo etichetta={t('Da rivedere il')} valore={m.revisione ?? ''} esempio="2026-12-31" salva={data('revisione')} />
        </div>
      </div>
      <div className="prog-mandato-righe">
        {RIGHE.map(r => {
          const dentro = s.classi.filter(c => regole[c] === r.regola)
          return (
            <div key={r.regola} className="prog-mandato-riga">
              <span className="prog-mandato-titolo">{t(r.titolo)}</span>
              <span className="prog-mandato-voci">
                {dentro.length ? dentro.map(c => (
                  <button key={c} type="button" className="prog-mandato-voce" data-regola={r.regola} onClick={() => sposta(c)}
                    title={`${t('Sposta in')}: ${t(RIGHE.find(x => x.regola === dopo(r.regola, c))!.titolo)}`}>
                    {t(NOMI[c])}
                  </button>
                )) : <span className="prog-mandato-vuoto">{t('Niente')}</span>}
              </span>
            </div>
          )
        })}
      </div>
      {guaio && <div role="alert" className="prog-guaio">{t(guaio)}</div>}
      {!confermato && (
        <button type="button" className="prog-mandato-conferma" disabled={manda} aria-busy={manda || undefined}
          onClick={() => { setManda(true); void salva({ conferma: true }).catch(() => {}).finally(() => setManda(false)) }}>
          {t('Conferma')}
        </button>
      )}
    </section>
  )
}
