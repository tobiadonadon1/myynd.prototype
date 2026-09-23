// La pagina di un progetto.
//
// «The tester did not understand what the project's home is for.» Si arrivava
// qui cliccando il nome del progetto sulla prima pagina, e si atterrava nella
// Memoria con sopra una finestra che cominciava con tre caselle vuote: «Altri
// nomi», «Dentro», «Note». Sembravano le impostazioni di qualcos'altro. Quello
// per cui uno apre un progetto (a cosa punta, cosa c'è da fare adesso, cosa è
// già fatto e cosa ne sa Myynd) stava in fondo, chiuso in due tendine.
//
// Adesso l'ordine è quello delle domande con cui si apre un progetto, e i
// titoli le dicono senza spiegarle:
//
//   · in cima, cos'è: «Progetto», il nome, e l'obiettivo come riga sotto il
//     titolo. Lo stato, la priorità e il conto stanno lì accanto, perché sono
//     la stessa risposta: com'è messo;
//   · «Prossimi passi»: le righe aperte di questo progetto, le stesse della
//     lista e della prima pagina, con la spunta e la barra per aggiungerne una.
//     Vuoto, è una domanda sola con la barra sotto: il primo passo;
//   · «Fatto» e «Quello che Myynd sa»: il lavoro chiuso con il suo esito, e
//     quello che Myynd ha raccolto (decisioni, cose notate). Compaiono quando
//     c'è qualcosa: una sezione vuota senza un gesto che la riempia è rumore;
//   · «Note», che si aggiungono con la data;
//   · in fondo, chiuso, «Nomi e raggruppamento»: quello che si tocca di rado.
//
// Si apre sopra la schermata in cui si era (la prima pagina, la lista, la
// Memoria) e chiudendola si torna lì: prima si finiva nella Memoria anche
// venendo dalla prima pagina, e chiudendo la finestra ci si restava.

import { useEffect, useRef, useState } from 'react'
import { api, type CambioProgetto, type Compito, type Progetto, type ProjectEvidence } from '../api'
import { frasi, loc, t } from '../lingua'
import { Hov, useFocoDialogo } from '../ui'
import { IconGiu, IconSpunta } from '../icons'
import { coloreProgetto } from '../colori-progetto'
import { PrioritaProgetto } from '../components/PrioritaProgetto'
import { portaAlleAttivita, primoParagrafo, siPuoAprireLeCose, type Vals } from '../vals'
import type { Lista } from '../oggi/useCompiti'
import { NomiERaggruppamento, Pallino, Scritta, Stati, Tic, useSalvataggi } from './ProgettoEditor'
import { CAMPO, Scatola } from './Myynd'
import './progetto.css'

const INCHIOSTRO = 'var(--inchiostro)'

/** Le righe aperte: quelle che aspettano ancora qualcuno, lui o Myynd. */
const aperta = (c: Compito) => c.stato !== 'fatto' && c.stato !== 'lasciato'

/** Cosa aspetta una riga, detto come lo dice la lista. «Da fare» non si scrive: è il caso normale. */
const STATO_RIGA: Record<string, string> = { delegato: 'Al lavoro', pronto: 'Da rivedere', chiede: 'Aspetta te' }

const GENERE: Record<ProjectEvidence['kind'], string> = {
  goal: 'Obiettivo', note: 'Note', decision: 'Decisione', observation: 'Osservazione', work: 'Lavoro'
}
const PROVENIENZA: Record<ProjectEvidence['provenance'], string> = {
  'user-field': 'Salvato da te', 'user-chat': 'Dalla tua chat',
  'source-inference': 'Dedotto da una fonte', 'task-record': 'Risultato del lavoro'
}

const giorno = (v: string | null | undefined) => v && Number.isFinite(Date.parse(v))
  ? new Date(v).toLocaleDateString(loc(), { day: 'numeric', month: 'short' }) : ''

/**
 * Il guscio: trova il progetto aperto fra quelli che conosce la pagina.
 *
 * Se non c'è ancora (la pagina si apre prima che l'elenco sia arrivato) lo
 * richiede una volta; se non c'è più (unito in un altro, cancellato) si chiude.
 */
export function PaginaProgetto({ v, lista }: { v: Vals; lista: Lista }) {
  const id = v.progettoAperto
  const p = v.progetti.find(x => x.id === id) ?? null
  const trovato = !!p
  /** L'id per cui l'elenco è già stato richiesto: se dopo non c'è, non c'è più. */
  const [cercato, setCercato] = useState<string | null>(null)
  const { chiudiProgetto, ricaricaProgetti } = v
  useEffect(() => {
    if (!id || trovato) return
    if (cercato === id) { chiudiProgetto(); return }
    let vivo = true
    void ricaricaProgetti().then(() => { if (vivo) setCercato(id) })
    return () => { vivo = false }
  }, [id, trovato, cercato]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!id || !p) return null
  return <Pagina key={p.id} p={p} v={v} lista={lista} />
}

function Pagina({ p, v, lista }: { p: Progetto; v: Vals; lista: Lista }) {
  const foglio = useRef<HTMLDivElement>(null)
  useFocoDialogo(foglio, v.chiudiProgetto)
  const cambia = (id: string, c: CambioProgetto) => v.cambiaProgetto(id, c)
  const { guai, fatti, manda, segnala } = useSalvataggi(p.id, cambia)
  const colore = coloreProgetto(p, v.progetti)
  const chiuso = p.stato === 'chiuso'
  const padre = v.progetti.find(x => x.id === p.genitore) ?? null

  // — i passi: le righe vere della lista, così la spunta qui è la spunta di là —
  const aperte = lista.compiti.filter(c => c.progetto === p.id && aperta(c))

  // — il fatto: la storia del progetto dal server, più quello chiuso adesso —
  const [storia, setStoria] = useState<Compito[]>([])
  const [sa, setSa] = useState<ProjectEvidence[]>([])
  const chiuseOra = lista.chiusi.filter(c => c.progetto === p.id && c.stato === 'fatto')
  const firmaChiuse = chiuseOra.map(c => c.id).join('|')
  useEffect(() => {
    let vivo = true
    api.attivitaProgetto(p.id).then(r => { if (vivo) setStoria(r.attivita.filter(c => c.stato === 'fatto')) }).catch(() => {})
    return () => { vivo = false }
  }, [p.id, firmaChiuse])
  useEffect(() => {
    let vivo = true
    api.memoriaProgetto(p.id).then(r => {
      if (!vivo) return
      // quello che ha raccolto lui: l'obiettivo e le note stanno già sopra, e il
      // lavoro chiuso sta in «Fatto», con il suo esito
      setSa(r.records.filter(x => !x.supersededBy && x.kind !== 'goal' && x.kind !== 'note' && x.provenance !== 'task-record'))
    }).catch(() => {})
    return () => { vivo = false }
  }, [p.id, p.aggiornato])
  const fatte = [...chiuseOra, ...storia.filter(c => !chiuseOra.some(x => x.id === c.id))]

  const salvaNome = (nome: string) => {
    if (!nome) return segnala('nome', 'Un progetto ha bisogno di un nome.')
    segnala('nome', '')
    void manda('nome', { nome })
  }

  return (
    <>
      <div className="prog-velo" onClick={v.chiudiProgetto} />
      <div ref={foglio} className="prog-foglio" role="dialog" aria-modal="true" aria-labelledby="prog-titolo">
        <header className="prog-cima">
          <div className="prog-riga">
            {/* «Chiudi» è il primo nel fuoco: aprendo la pagina il cursore non
                deve finire dentro il nome e metterlo in modifica */}
            <button type="button" className="prog-chiudi" onClick={v.chiudiProgetto}>{t('Chiudi')}</button>
            <Pallino p={p} colore={colore} manda={manda} guaio={guai.colore} segnala={segnala} />
            <span className="prog-kicker" style={{ color: colore }}>{t('Progetto')}</span>
            {padre && <span className="prog-dentro">{frasi.dentroProgetto(padre.nome)}</span>}
          </div>
          <h1 id="prog-titolo" className="prog-titolo">
            <Scritta valore={p.nome} etichetta={t('Nome')} salva={salvaNome} salvato={fatti.nome}
              testoStile={{
                fontSize: 30, fontWeight: 400, lineHeight: 1.2, letterSpacing: '-.03em', color: INCHIOSTRO,
                fontFamily: 'var(--serif)', textDecoration: chiuso ? 'line-through' : 'none'
              }} />
          </h1>
          <div className="prog-obiettivo">
            <Scritta valore={p.obiettivo} etichetta={t('Obiettivo')} vuoto={t('A cosa serve? Una riga.')}
              salva={o => void manda('obiettivo', { obiettivo: o.slice(0, 200) })} salvato={fatti.obiettivo}
              testoStile={{ fontSize: '14.5px', color: 'rgba(var(--inchiostro-rgb),.66)', lineHeight: 1.45 }} />
          </div>
          <div className="prog-controlli">
            <Stati p={p} manda={manda} />
            {!chiuso && (
              <PrioritaProgetto alta={p.priorita === 'alta'} nome={p.nome}
                cambia={alta => void manda('priorita', { priorita: alta ? 'alta' : null })} />
            )}
            <Tic mostra={!!(fatti.stato || fatti.priorita)} />
            <span className="prog-conto">{frasi.attivitaDelProgetto(aperte.length, fatte.length)}</span>
          </div>
          {(guai.nome || guai.obiettivo || guai.stato || guai.priorita) && (
            <div role="alert" className="prog-guaio">{t(guai.nome || guai.obiettivo || guai.stato || guai.priorita)}</div>
          )}
        </header>

        <div className="prog-corpo">
          <Passi p={p} aperte={aperte} lista={lista} chiudiPagina={v.chiudiProgetto} />

          {!!fatte.length && (
            <section className="prog-sezione" aria-labelledby="prog-fatto">
              <h2 id="prog-fatto">{t('Fatto')}</h2>
              <ul className="prog-elenco">
                {fatte.slice(0, 8).map(c => {
                  const esito = c.esito?.trim() || primoParagrafo(c.risultato ?? '')
                  return (
                    <li key={c.id} className="prog-fatta">
                      <span className="prog-spunta-fatta" aria-hidden="true"><IconSpunta size={11} /></span>
                      <div className="prog-testo">
                        <span>{c.testo}</span>
                        {esito && <small>{esito}</small>}
                      </div>
                      <span className="prog-quando">{giorno(c.chiuso)}</span>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {!!sa.length && (
            <section className="prog-sezione" aria-labelledby="prog-sa">
              <h2 id="prog-sa">{t('Quello che Myynd sa')}</h2>
              <ul className="prog-elenco">
                {sa.slice(0, 8).map(r => (
                  <li key={r.id} className="prog-ricordo" data-vecchio={r.stale ? '' : undefined}>
                    <p>{r.value}</p>
                    <small>
                      {[t(GENERE[r.kind]), t(PROVENIENZA[r.provenance]), giorno(r.evidenceAt)].filter(Boolean).join(' · ')}
                      {r.stale && <span className="prog-da-ricontrollare">{t('Da ricontrollare')}</span>}
                    </small>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Note p={p} manda={manda} salvato={!!fatti.note} guaio={guai.note} />

          <details className="prog-altro">
            <summary>
              <span className="prog-freccia"><IconGiu size={10} stroke="currentColor" /></span>
              {t('Nomi e raggruppamento')}
            </summary>
            <NomiERaggruppamento p={p} tutti={v.progetti} cambia={cambia}
              unisci={async (id, dentro) => {
                await api.unisciProgetto(id, dentro)
                await v.ricaricaProgetti()
                // questo non c'è più: resta aperto quello in cui è confluito
                v.apriProgetto(dentro)
              }} />
          </details>
        </div>
      </div>
    </>
  )
}

/**
 * I prossimi passi: le righe aperte di questo progetto, e la barra per scriverne una.
 *
 * Sono le righe della lista, non una copia: la spunta qui le chiude di là, con
 * lo stesso «Annulla», e una riga scritta qui compare subito anche nel blocco
 * della prima pagina. Nascono in «Prima o poi», come prima: il giorno lo
 * sceglie la lista, non la pagina del progetto.
 */
function Passi({ p, aperte, lista, chiudiPagina }: { p: Progetto; aperte: Compito[]; lista: Lista; chiudiPagina: () => void }) {
  const [testo, setTesto] = useState('')
  const chiuso = p.stato === 'chiuso'
  const aggiungi = () => {
    const pulito = testo.trim()
    if (!pulito) return
    setTesto('')
    void lista.aggiungi(pulito, 'poi', null, null, { progetto: p.id })
  }
  return (
    <section className="prog-sezione" aria-labelledby="prog-passi">
      <h2 id="prog-passi">{t('Prossimi passi')}</h2>
      {!!aperte.length && (
        <ul className="prog-elenco">
          {aperte.map(c => (
            <li key={c.id} className="prog-passo">
              <Hov as="button" type="button" className="prog-cerchio" onClick={() => lista.chiudi(c.id)}
                aria-label={`${t('Fatto')}: ${c.testo}`} title={t('Fatto')}
                data-attende={c.stato === 'pronto' || c.stato === 'chiede' ? '' : undefined}
                hover={{ borderColor: 'var(--inchiostro)' }} />
              <div className="prog-testo"><span>{c.testo}</span></div>
              {STATO_RIGA[c.stato] && <span className="prog-stato-riga" data-stato={c.stato}>{t(STATO_RIGA[c.stato])}</span>}
            </li>
          ))}
        </ul>
      )}
      {!chiuso && (
        <>
          {/* vuoto, la sezione è una domanda sola con la barra sotto: P4, si impara facendo */}
          {!aperte.length && <label htmlFor="prog-nuovo-passo" className="prog-invito">{t('Qual è il primo passo?')}</label>}
          <form className="prog-barra" onSubmit={e => { e.preventDefault(); aggiungi() }}>
            <Scatola>
              <input id="prog-nuovo-passo" value={testo} maxLength={300} onChange={e => setTesto(e.target.value)}
                placeholder={aperte.length ? t('Aggiungi un passo') : t('Manda il preventivo a Rossi')}
                aria-label={aperte.length ? t('Aggiungi un passo') : t('Qual è il primo passo?')} style={CAMPO} />
              {!!testo.trim() && <button type="submit" className="prog-aggiungi">{t('Aggiungi')}</button>}
            </Scatola>
          </form>
        </>
      )}
      {!!aperte.length && siPuoAprireLeCose() && (
        <button type="button" className="prog-link" onClick={() => { chiudiPagina(); portaAlleAttivita() }}>{t('Aprile in Da fare')}</button>
      )}
    </section>
  )
}

/** Le note: quelle di prima restano dove sono, la nuova arriva datata. */
function Note({ p, manda, salvato, guaio }: {
  p: Progetto
  manda: (campo: string, c: CambioProgetto) => Promise<void>
  salvato: boolean
  guaio?: string
}) {
  const [nota, setNota] = useState('')
  const aggiungi = () => {
    const testo = nota.trim()
    if (!testo) return
    const data = new Date().toLocaleDateString(loc(), { day: 'numeric', month: 'short', year: 'numeric' })
    setNota('')
    void manda('note', { note: (p.note ? `${p.note}\n\n` : '') + `${data}\n${testo}` })
  }
  return (
    <section className="prog-sezione" aria-labelledby="prog-note">
      <div className="prog-testa"><h2 id="prog-note">{t('Note')}</h2><Tic mostra={salvato} /></div>
      {p.note && <div className="prog-note">{p.note}</div>}
      <Scatola alto>
        <textarea value={nota} onChange={e => setNota(e.target.value)} onBlur={aggiungi}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); aggiungi() } }}
          rows={2} aria-label={t('Aggiungi una nota')} placeholder={t('Aggiungi una nota')}
          style={{ ...CAMPO, resize: 'vertical', lineHeight: 1.5, padding: '2px 0', minHeight: 40 }} />
      </Scatola>
      {guaio && <div role="alert" className="prog-guaio">{t(guaio)}</div>}
    </section>
  )
}
