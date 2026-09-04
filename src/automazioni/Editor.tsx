// Una automazione aperta: la scheda che viene avanti.
//
// Non un pannello che sale dal fondo e non una schermata a parte. Il gesto è
// «prendo in mano questa qui», e quello che deve succedere è che questa qui si
// stacchi dal muro e venga davanti, con tutto il resto che resta dov'è, un po'
// più indietro. Una schermata nuova perde il posto in cui eri; un pannello in
// fondo alla pagina non è la cosa che hai toccato.
//
// Dentro, due modi di cambiarla, e sono due modi diversi di sapere cosa vuoi:
//
//   · **a parole** — quando sai cosa vuoi e non dove sta. «Falla girare anche
//     il sabato», «smetti di guardare nel desktop». Il modello riscrive la
//     ricetta partendo da quella che c'è, senza buttare via il resto.
//   · **i campi** — quando sai già quale tendina toccare. Tutti scrivibili
//     subito, senza un bottone «modifica» davanti: chi apre una scheda l'ha
//     aperta per toccarla.
//
// E in alto a destra **Ottimizza**, che è la cosa che non si poteva fare prima:
// far guardare l'automazione a Claude e fargliela scrivere meglio — le parole
// della ricerca nella lingua dei documenti, gli attrezzi che le servono
// davvero, l'istruzione con dentro cosa fare quando non c'è niente da fare. Sta
// su un bottone e non succede da sola, apposta: una cosa che riscrive quello
// che hai scritto tu senza che tu l'abbia chiesto non è un aiuto.

import { useEffect, useRef, useState } from 'react'
import { api, type Anteprima as AnteprimaDati, type Attrezzo, type Automazione, type Raccolta } from '../api'
import { frasi, loc, t } from '../lingua'
import { Cestino, Hov, LABEL, useFocoDialogo } from '../ui'
import { Glifo } from '../components/Stato'
import { IconCroce, IconGiro } from '../icons'
import { Casella, Pastiglia, RIGO } from './Chiocciola'
import { quandoData, quandoGira } from './Scheda'

const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato']

const PIENO: React.CSSProperties = {
  padding: '10px 19px', borderRadius: 99, border: 'none',
  background: 'linear-gradient(120deg,#C4623B,#7E9C82)', color: '#FFF7F0',
  fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit'
}

const VUOTO: React.CSSProperties = {
  padding: '9px 15px', borderRadius: 99, cursor: 'pointer',
  border: '1px solid rgba(34,39,31,.18)', background: 'rgba(255,255,255,.6)',
  color: 'rgba(34,39,31,.78)', fontSize: '12.5px', fontFamily: 'inherit'
}

function Campo({ etichetta, children, nota }: {
  etichetta: string; children: React.ReactNode; nota?: string
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ ...LABEL, fontSize: '10px', marginBottom: 6 }}>{etichetta}</div>
      {children}
      {nota && (
        <div style={{ fontSize: '11px', color: 'rgba(34,39,31,.42)', marginTop: 5, lineHeight: 1.5, textWrap: 'pretty' }}>
          {nota}
        </div>
      )}
    </div>
  )
}

/** Le due linguette. Sono due modi di dire la stessa cosa, non due schermate. */
function Linguette({ dove, vai }: { dove: 'parole' | 'campi'; vai: (d: 'parole' | 'campi') => void }) {
  return (
    <div role="tablist" style={{
      display: 'inline-flex', gap: 2, padding: 3, borderRadius: 99, flex: 'none',
      background: 'rgba(34,39,31,.055)'
    }}>
      {([['parole', 'A parole'], ['campi', 'I campi']] as const).map(([id, testo]) => (
        <button key={id} type="button" role="tab" aria-selected={dove === id} onClick={() => vai(id)}
          style={{
            padding: '5px 13px', borderRadius: 99, cursor: 'pointer', fontSize: '12px',
            border: 'none', fontFamily: 'inherit',
            fontWeight: dove === id ? 500 : 400,
            background: dove === id ? 'rgba(255,255,255,.95)' : 'transparent',
            color: dove === id ? '#22271F' : 'rgba(34,39,31,.55)',
            boxShadow: dove === id ? '0 2px 6px -2px rgba(84,64,44,.28)' : 'none',
            transition: 'background .18s, color .18s'
          }}>{t(testo)}</button>
      ))}
    </div>
  )
}

/**
 * Cosa troverebbe adesso.
 *
 * È il pezzo che mancava di più a chi ne scrive una, e mancava esattamente dove
 * fa più male: **le parole della ricerca.** Si scrivono in una casella di
 * testo, non tornano niente, e l'unico modo di sapere se erano giuste era
 * accendere l'automazione e aspettare qualche giorno per vedere se compariva
 * una riga in lista. Se non compariva, non si sapeva nemmeno quale delle
 * quattro cose fosse sbagliata: le parole, gli attrezzi, l'ora, o il fatto che
 * davvero non c'era niente.
 *
 * Questo lo dice in mezzo secondo, e lo dice **con i titoli veri**: leggere
 * «Fattura 2026/114 — Bianchi srl» accanto alle proprie parole è la differenza
 * fra credere che funzioni e vedere che funziona.
 *
 * Non chiama nessun modello e non scrive niente: si preme mentre si scrive,
 * quante volte si vuole. Per questo è un bottone piccolo accanto al campo e non
 * un gesto in fondo alla scheda — è una cosa che si fa dieci volte, non una.
 */
function Anteprima({ id, catalogo, chiave }: {
  id: string
  catalogo: Attrezzo[]
  /** Cambia quando salvi: quello che c'è a schermo si riferisce alla ricetta salvata. */
  chiave: number
}) {
  const [dati, setDati] = useState<AnteprimaDati | null>(null)
  const [guardo, setGuardo] = useState(false)
  const [guaio, setGuaio] = useState('')

  // quello che si vede vale per la ricetta com'era salvata: appena salvi, si
  // butta via invece di restare lì a raccontare una cosa vecchia
  useEffect(() => { setDati(null); setGuaio('') }, [chiave])

  const guarda = async () => {
    setGuardo(true); setGuaio('')
    try { setDati(await api.anteprimaAutomazione(id)) }
    catch (e) { setGuaio(e instanceof Error ? e.message : String(e)) }
    setGuardo(false)
  }

  const nomeAttrezzo = (n: string) => catalogo.find(x => x.nome === n)?.etichetta ?? n

  return (
    <div style={{ marginBottom: 14 }}>
      <Hov as="button" type="button" onClick={guarda} disabled={guardo}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 13px',
          borderRadius: 99, cursor: guardo ? 'default' : 'pointer', fontFamily: 'inherit',
          fontSize: '12px', border: '1px solid rgba(34,39,31,.18)',
          background: 'rgba(255,255,255,.6)', color: 'rgba(34,39,31,.75)'
        }}
        hover={guardo ? {} : { borderColor: '#C4623B', color: '#8E3F1F' }}>
        {guardo && <Glifo tipo="penso" dim={11} colore="#8E3F1F" />}
        {guardo ? t('Guardo…') : t('Cosa troverebbe adesso')}
      </Hov>

      {guaio && <div style={{ fontSize: '11.5px', color: '#8E3F1F', marginTop: 8, overflowWrap: 'anywhere' }}>{t(guaio)}</div>}

      {dati && (
        <div style={{
          marginTop: 10, padding: '11px 13px', borderRadius: 14,
          border: '1px solid rgba(34,39,31,.1)', background: 'rgba(255,255,255,.5)'
        }}>
          <div style={{
            fontSize: '12px', fontWeight: 500,
            color: dati.docs.length ? '#3E5140' : '#8E3F1F'
          }}>
            {dati.docs.length ? frasi.neGuarderebbe(dati.docs.length) : t('Adesso non troverebbe niente.')}
          </div>

          {/*
            Il perché di un vuoto, che è la metà che serve davvero.
            «Non trova niente» da solo lascia esattamente dov'eri; «non trova
            niente, e Slack non è collegato» è una cosa da andare a fare.
          */}
          {!!dati.staccati.length && (
            <div style={{ fontSize: '11.5px', color: '#8E3F1F', marginTop: 6, lineHeight: 1.5 }}>
              {t('Non è collegato:')} {dati.staccati.map(nomeAttrezzo).join(', ')}
            </div>
          )}
          {!dati.docs.length && !dati.staccati.length && (
            <div style={{ fontSize: '11.5px', color: 'rgba(34,39,31,.55)', marginTop: 6, lineHeight: 1.5, textWrap: 'pretty' }}>
              {dati.soloNuovi
                ? t('Guarda solo quello che è arrivato dall’ultima volta: se non è arrivato niente, è normale.')
                : t('Prova a cambiare le parole: vanno scritte come le userebbe chi ha scritto quei documenti, nella loro lingua.')}
            </div>
          )}

          {!!dati.docs.length && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {dati.docs.slice(0, 6).map(d => (
                <div key={d.id} style={{
                  display: 'flex', gap: 8, alignItems: 'baseline',
                  fontSize: '11.5px', color: 'rgba(34,39,31,.7)'
                }}>
                  <span style={{
                    flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                  }}>{d.titolo}</span>
                  <span style={{ flex: 'none', fontSize: '10.5px', color: 'rgba(34,39,31,.38)' }}>
                    {d.quando ? new Date(d.quando).toLocaleDateString(loc(), { day: 'numeric', month: 'short' }) : ''}
                  </span>
                </div>
              ))}
              {dati.docs.length > 6 && (
                <div style={{ fontSize: '10.5px', color: 'rgba(34,39,31,.38)' }}>
                  {`+${dati.docs.length - 6}`}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function Editor({ a, catalogo, cartelle, raccolte, cambiata, chiudi, spostata }: {
  a: Automazione
  catalogo: Attrezzo[]
  /** Le cartelle del desktop collegate: sono le sole in cui Claude Code può lavorare. */
  cartelle: string[]
  raccolte: Raccolta[]
  cambiata: (tutte: Automazione[]) => void
  chiudi: () => void
  spostata: (id: string, raccolta: string | null) => void
}) {
  const [dove, setDove] = useState<'parole' | 'campi'>('campi')

  const [nome, setNome] = useState(a.nome)
  const [spiega, setSpiega] = useState(a.spiega)
  const [fai, setFai] = useState(a.fai)
  const [cerca, setCerca] = useState(a.guarda.cerca ?? '')
  const [quando, setQuando] = useState(a.quando)
  const [inLista, setInLista] = useState(a.metti.inLista)
  const [modo, setModo] = useState(a.metti.modo ?? 'io')
  const [suoi, setSuoi] = useState<string[]>(a.attrezzi)
  const [cartella, setCartella] = useState(a.cartella ?? '')

  const [richiesta, setRichiesta] = useState('')
  /**
   * Cambia a ogni salvataggio, e serve a buttare via l'anteprima.
   *
   * L'anteprima la calcola il server sulla ricetta *salvata*: lasciarla a
   * schermo dopo un salvataggio vorrebbe dire un elenco di documenti che dice
   * di riferirsi a parole diverse da quelle che si stanno guardando — cioè la
   * cosa peggiore che possa fare uno strumento che serve a fidarsi.
   */
  const [provata, setProvata] = useState(0)
  const [salvo, setSalvo] = useState(false)
  const [gira, setGira] = useState(false)
  const [penso, setPenso] = useState<'' | 'ottimizzo' | 'riscrivo'>('')
  const [detto, setDetto] = useState('')
  const [guaio, setGuaio] = useState('')
  // il fuoco entra con la finestra, Esc la chiude, e alla chiusura torna alla scheda
  const finestra = useRef<HTMLDivElement>(null)
  useFocoDialogo(finestra, chiudi)

  const ogni = 'quandoArriva' in quando ? 'arrivo' : quando.ogni
  const ora = 'quandoArriva' in quando ? 8 : quando.ora
  const vuoleCartella = suoi.includes('claude.lavora')

  /** Ricarica i campi da quello che è tornato dal server. */
  const riprendi = (tutte: Automazione[]) => {
    cambiata(tutte)
    const n = tutte.find(x => x.id === a.id)
    if (!n) return
    setNome(n.nome); setSpiega(n.spiega); setFai(n.fai)
    setCerca(n.guarda.cerca ?? ''); setQuando(n.quando)
    setInLista(n.metti.inLista); setModo(n.metti.modo ?? 'io')
    setSuoi(n.attrezzi); setCartella(n.cartella ?? '')
    setProvata(x => x + 1)
  }

  const salva = async () => {
    setSalvo(true); setGuaio(''); setDetto('')
    try {
      const r = await api.cambiaAutomazione(a.id, {
        nome, spiega, fai, cerca, quando, metti: { inLista, modo },
        attrezzi: suoi, cartella: vuoleCartella ? cartella : ''
      })
      cambiata(r.automazioni)
      setProvata(n => n + 1)
      setDetto(t('Salvata.'))
    } catch (e) { setGuaio(e instanceof Error ? e.message : String(e)) }
    setSalvo(false)
  }

  const ottimizza = async () => {
    setPenso('ottimizzo'); setGuaio(''); setDetto('')
    try {
      riprendi((await api.ottimizzaAutomazione(a.id)).automazioni)
      setDetto(t('Riscritta. Guarda cosa è cambiato prima di accenderla.'))
    } catch (e) { setGuaio(e instanceof Error ? e.message : String(e)) }
    setPenso('')
  }

  const riscrivi = async () => {
    if (richiesta.trim().length < 3) return
    setPenso('riscrivo'); setGuaio(''); setDetto('')
    try {
      riprendi((await api.riscriviAutomazione(a.id, richiesta)).automazioni)
      setRichiesta('')
      setDetto(t('Fatto. Guarda com’è venuta.'))
      setDove('campi')
    } catch (e) { setGuaio(e instanceof Error ? e.message : String(e)) }
    setPenso('')
  }

  const adesso = async () => {
    setGira(true); setDetto(''); setGuaio('')
    try {
      const r = await api.automazioneAdesso(a.id)
      cambiata(r.automazioni)
      setDetto(r.esito === 'fatta' ? t('Fatto: guarda in lista.')
        : r.esito === 'gia' ? t('Ce n’è già una in lista da questa.')
        : t('Ha guardato, e non c’era niente.'))
    } catch (e) { setGuaio(e instanceof Error ? e.message : String(e)) }
    setGira(false)
  }

  const butta = async () => {
    try {
      cambiata((await api.buttaAutomazione(a.id)).automazioni)
      chiudi()
    } catch (e) { setGuaio(e instanceof Error ? e.message : String(e)) }
  }

  const attaccati = suoi.map(n => catalogo.find(x => x.nome === n)).filter((x): x is Attrezzo => !!x)
  const occupato = !!penso

  return (
    <>
      <div onClick={chiudi} style={{
        position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(40,30,22,.3)',
        backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)', animation: 'fadein .2s ease'
      }} />

      <div ref={finestra} role="dialog" aria-modal="true" aria-labelledby="editor-titolo" style={{
        position: 'fixed', zIndex: 61, top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)',
        width: 600, maxWidth: 'calc(100vw - 40px)', maxHeight: 'calc(100vh - 64px)',
        display: 'flex', flexDirection: 'column', borderRadius: 28, overflow: 'hidden',
        background: 'linear-gradient(180deg,rgba(255,253,249,.97),rgba(255,251,245,.95))',
        backdropFilter: 'blur(40px) saturate(1.6)', WebkitBackdropFilter: 'blur(40px) saturate(1.6)',
        border: '1px solid rgba(255,255,255,.95)',
        boxShadow: '0 44px 100px -24px rgba(60,44,30,.46)',
        animation: 'editoresu .3s cubic-bezier(.2,.8,.25,1) both'
      }}>

        {/* la testa: chi è, e i due bottoni che valgono per tutta la scheda */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, flex: 'none', padding: '16px 15px 15px 19px',
          borderBottom: '1px solid rgba(34,39,31,.08)'
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div id="editor-titolo" style={{
              fontSize: '15px', fontWeight: 500, color: '#22271F', letterSpacing: '-.01em',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
            }}>{nome || a.nome}</div>
            <div style={{
              fontSize: '11.5px', color: 'rgba(34,39,31,.5)', marginTop: 2,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
            }}>
              {a.accesa
                ? (a.prossima ? frasi.giraDaSolaProssima(quandoData(a.prossima)) : quandoGira(a))
                : t('In pausa')}
            </div>
          </div>

          {/*
            Ottimizza. Sta qui e non fra i bottoni in fondo perché non è un
            salvataggio: è una cosa che riguarda tutta la scheda, e va dove si
            guarda per prima quando ci si accorge che una non funziona.
          */}
          <Hov as="button" onClick={ottimizza} disabled={occupato}
            title={t('Falla guardare a Claude e falla scrivere meglio')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, flex: 'none',
              padding: '7px 13px', borderRadius: 99, fontFamily: 'inherit', fontSize: '12px',
              fontWeight: 500, cursor: occupato ? 'default' : 'pointer',
              border: '1px solid rgba(196,98,59,.32)', background: 'rgba(196,98,59,.1)',
              color: '#8E3F1F', opacity: occupato ? 0.6 : 1
            }}
            hover={occupato ? {} : { background: 'rgba(196,98,59,.18)', borderColor: 'rgba(196,98,59,.5)' }}>
            {penso === 'ottimizzo'
              ? <Glifo tipo="penso" dim={11} colore="#8E3F1F" />
              : <IconGiro size={12} />}
            {penso === 'ottimizzo' ? t('Guardo…') : t('Ottimizza')}
          </Hov>

          <Hov as="button" onClick={chiudi} title={t('Chiudi')} aria-label={t('Chiudi')}
            style={{
              display: 'grid', placeItems: 'center', width: 30, height: 30, flex: 'none', padding: 0,
              borderRadius: 10, border: 'none', background: 'rgba(34,39,31,.06)',
              color: 'rgba(34,39,31,.5)', cursor: 'pointer'
            }}
            hover={{ background: 'rgba(34,39,31,.13)', color: '#22271F' }}><IconCroce size={12} /></Hov>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '15px 18px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 15, flexWrap: 'wrap' }}>
            <Linguette dove={dove} vai={setDove} />
            <div style={{ flex: 1 }} />
            {/* la cartella in cui sta: un menù, perché trascinare dentro un
                pannello aperto non si può */}
            <select value={a.raccolta ?? ''} aria-label={t('In che cartella')}
              onChange={e => spostata(a.id, e.target.value || null)}
              style={{ ...RIGO, width: 'auto', cursor: 'pointer', fontSize: '12px', padding: '6px 9px' }}>
              <option value="">{t('in nessuna cartella')}</option>
              {raccolte.map(r => <option key={r.nome} value={r.nome}>{r.nome}</option>)}
            </select>
          </div>

          {dove === 'parole' ? (
            <div>
              <Campo etichetta={t('Cosa vuoi cambiare')}
                nota={t('Dillo come lo diresti a voce. Tengo tutto il resto com’è. Con @ aggiungi cosa può aprire.')}>
                <Casella
                  testo={richiesta} cambia={setRichiesta} righe={4} autoFocus
                  attaccati={suoi} catalogo={catalogo}
                  attacca={n => setSuoi(s => s.includes(n) ? s : [...s, n])}
                  stacca={n => setSuoi(s => s.filter(x => x !== n))}
                  invio={riscrivi}
                  segnaposto={t('falla girare anche il sabato, e guarda pure in @')} />
              </Campo>
              <button onClick={riscrivi} disabled={occupato || richiesta.trim().length < 3}
                style={{
                  ...PIENO, display: 'inline-flex', alignItems: 'center', gap: 7,
                  opacity: occupato || richiesta.trim().length < 3 ? 0.5 : 1,
                  cursor: occupato || richiesta.trim().length < 3 ? 'default' : 'pointer'
                }}>
                {penso === 'riscrivo' && <Glifo tipo="penso" dim={11} colore="#FFF7F0" />}
                {penso === 'riscrivo' ? t('La riscrivo…') : t('Riscrivila')}
              </button>
            </div>
          ) : (
            <div>
              <Campo etichetta={t('Come si chiama')}>
                <input value={nome} onChange={e => setNome(e.target.value)} style={RIGO} />
              </Campo>

              <Campo etichetta={t('Cosa fa, in una riga')}>
                <input value={spiega} onChange={e => setSpiega(e.target.value)} style={RIGO} />
              </Campo>

              {/*
                Cosa può aprire. Sta qui in mezzo e non in fondo apposta: è la
                metà che decide se questa automazione troverà qualcosa, ed è
                anche la sola che dice cosa tocca mentre non la guardi.
              */}
              <Campo etichetta={t('Cosa può aprire')}
                nota={attaccati.some(x => !x.collegato)
                  ? t('Uno di questi non è collegato: finché non lo colleghi, quell’automazione non troverà niente.')
                  : t('Solo quello che le serve: ognuno è un permesso.')}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {catalogo.map(x => {
                    const on = suoi.includes(x.nome)
                    return (
                      <Hov key={x.nome} as="button" type="button"
                        onClick={() => setSuoi(s => on ? s.filter(y => y !== x.nome) : [...s, x.nome])}
                        title={x.spiega}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px',
                          borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px',
                          background: on ? `${x.tinta}16` : 'rgba(255,255,255,.5)',
                          border: `1px solid ${on ? `${x.tinta}4D` : 'rgba(34,39,31,.14)'}`,
                          color: on ? x.tinta : 'rgba(34,39,31,.55)',
                          fontWeight: on ? 500 : 400
                        }}
                        hover={{ borderColor: on ? `${x.tinta}77` : 'rgba(34,39,31,.28)' }}>
                        <span style={{
                          width: 6, height: 6, borderRadius: '50%', flex: 'none',
                          background: on ? x.tinta : 'transparent',
                          border: on ? 'none' : '1px solid rgba(34,39,31,.28)'
                        }} />
                        {x.etichetta}
                        {!x.collegato && <span style={{ fontSize: '10px', opacity: 0.6 }}>·</span>}
                      </Hov>
                    )
                  })}
                </div>
              </Campo>

              {vuoleCartella && (
                <Campo etichetta={t('In che cartella lavora Claude Code')}
                  nota={cartelle.length
                    ? t('Legge il progetto e scrive cosa farebbe. Non tocca un file: quello lo decidi tu.')
                    : t('Collega una cartella del desktop e potrà lavorarci.')}>
                  <select value={cartella} onChange={e => setCartella(e.target.value)}
                    aria-label={t('In che cartella lavora Claude Code')}
                    style={{ ...RIGO, cursor: 'pointer' }}>
                    <option value="">{t('— scegline una —')}</option>
                    {cartelle.map(c => <option key={c} value={c}>{c}</option>)}
                    {/* quella già scritta può stare più in dentro di una radice */}
                    {cartella && !cartelle.includes(cartella) && <option value={cartella}>{cartella}</option>}
                  </select>
                </Campo>
              )}

              <Campo etichetta={t('Quando gira')}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <select value={ogni} aria-label={t('Quando gira')}
                    onChange={e => setQuando(
                      e.target.value === 'arrivo' ? { quandoArriva: true }
                        : e.target.value === 'settimana' ? { ogni: 'settimana', giorno: 1, ora }
                          : { ogni: 'giorno', ora }
                    )}
                    style={{ ...RIGO, width: 'auto', cursor: 'pointer' }}>
                    <option value="giorno">{t('ogni giorno')}</option>
                    <option value="settimana">{t('ogni settimana')}</option>
                    <option value="arrivo">{t('quando arriva qualcosa')}</option>
                  </select>

                  {ogni === 'settimana' && (
                    <select value={'giorno' in quando ? quando.giorno : 1} aria-label={t('In che giorno')}
                      onChange={e => setQuando({ ogni: 'settimana', giorno: Number(e.target.value), ora })}
                      style={{ ...RIGO, width: 'auto', cursor: 'pointer' }}>
                      {GIORNI.map((giorno, i) => <option key={giorno} value={i}>{t(giorno)}</option>)}
                    </select>
                  )}

                  {ogni !== 'arrivo' && (
                    <select value={ora} aria-label={t('A che ora')}
                      onChange={e => setQuando(q => 'quandoArriva' in q ? q
                        : q.ogni === 'settimana' ? { ...q, ora: Number(e.target.value) } : { ogni: 'giorno', ora: Number(e.target.value) })}
                      style={{ ...RIGO, width: 'auto', cursor: 'pointer' }}>
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>{`${String(h).padStart(2, '0')}:00`}</option>
                      ))}
                    </select>
                  )}
                </div>
              </Campo>

              <Campo etichetta={t('Che parole cercare')}
                nota={t('Le parole di chi ha scritto quei documenti, nella loro lingua. Vuoto: guarda tutto.')}>
                <input value={cerca} onChange={e => setCerca(e.target.value)} style={RIGO}
                  placeholder={t('le parole da cercare nei tuoi documenti — vuoto: guarda tutto')} />
              </Campo>

              {/* subito sotto le parole, perché è di quelle che è la risposta */}
              <Anteprima id={a.id} catalogo={catalogo} chiave={provata} />

              <Campo etichetta={t('Cosa deve farne')}>
                <textarea value={fai} onChange={e => setFai(e.target.value)} rows={5}
                  style={{ ...RIGO, resize: 'vertical', lineHeight: 1.55 }} />
              </Campo>

              <Campo etichetta={t('E poi')}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <select value={modo} aria-label={t('Cosa ne fa')}
                    onChange={e => setModo(e.target.value as 'io' | 'bozza')}
                    style={{ ...RIGO, width: 'auto', cursor: 'pointer' }}>
                    <option value="io">{t('mette solo una riga')}</option>
                    <option value="bozza">{t('prepara anche la bozza')}</option>
                  </select>
                  <select value={inLista} aria-label={t('Dove la mette')}
                    onChange={e => setInLista(e.target.value as 'oggi' | 'settimana' | 'poi')}
                    style={{ ...RIGO, width: 'auto', cursor: 'pointer' }}>
                    <option value="oggi">{t('in Oggi')}</option>
                    <option value="settimana">{t('in Questa settimana')}</option>
                    <option value="poi">{t('in Prima o poi')}</option>
                  </select>
                </div>
              </Campo>
            </div>
          )}
        </div>

        <div style={{
          flex: 'none', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          padding: '13px 18px', borderTop: '1px solid rgba(34,39,31,.08)',
          background: 'rgba(255,255,255,.4)'
        }}>
          {dove === 'campi' && (
            <button onClick={salva} disabled={salvo || occupato} style={PIENO}>
              {salvo ? t('Salvo…') : t('Salva')}
            </button>
          )}

          {/* «Provala adesso» c'è anche quando è in pausa: è lì che serve. */}
          <Hov as="button" onClick={adesso} disabled={gira || occupato}
            style={{ ...VUOTO, display: 'inline-flex', alignItems: 'center', gap: 7, cursor: gira ? 'default' : 'pointer' }}
            hover={gira ? {} : { borderColor: '#C4623B', color: '#8E3F1F' }}>
            {gira && <Glifo tipo="penso" dim={11} colore="#8E3F1F" />}
            {gira ? t('Provo…') : t('Provala adesso')}
          </Hov>

          <div style={{ flex: 1, minWidth: 20 }} />

          {/* il cestino chiede una volta: la scheda in griglia lo fa già, e due
              porte sulla stessa azione non devono avere due regole */}
          <Cestino fai={butta} titolo={t('Buttala')} dim={32} icona={13} />
        </div>

        {/*
          Perché non fa niente, detto dove si può ripararlo.

          Sulla griglia la stessa cosa è una riga di sei parole: lì serve a
          *scegliere* quale aprire. Qui c'è spazio per dire cosa fare, e
          soprattutto per mettere il gesto accanto alla diagnosi — «non trova
          niente da sette giri» senza il bottone che riscrive le parole è una
          diagnosi che lascia la persona esattamente dov'era.
        */}
        {a.salute.stato !== 'bene' && (
          <div style={{
            flex: 'none', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            padding: '10px 18px', fontSize: '11.5px', lineHeight: 1.55,
            borderTop: '1px solid rgba(34,39,31,.06)',
            background: a.salute.stato === 'ferma' ? 'rgba(34,39,31,.035)' : 'rgba(196,98,59,.07)',
            color: a.salute.stato === 'ferma' ? 'rgba(34,39,31,.6)' : '#8E3F1F'
          }}>
            <span style={{ flex: 1, minWidth: 180, textWrap: 'pretty' }}>
              {a.salute.stato === 'scollegata'
                ? t('Uno degli attrezzi che ha dichiarato non è collegato: finché resta così, non troverà mai niente.')
                : a.salute.stato === 'guaio'
                  ? t('L’ultima volta è andata storta.')
                  : a.salute.stato === 'ferma'
                    ? t('C’è già una sua riga aperta in lista: finché resta lì non ne nasce un’altra. Chiudila e la prossima arriva da sé.')
                    : frasi.maiTrovatoNienteLungo(a.salute.quante)}
            </span>
            {a.salute.stato === 'muta' && (
              <Hov as="button" type="button" onClick={ottimizza} disabled={occupato}
                style={{
                  flex: 'none', padding: '6px 12px', borderRadius: 99, fontFamily: 'inherit',
                  fontSize: '11.5px', fontWeight: 500, cursor: occupato ? 'default' : 'pointer',
                  border: '1px solid rgba(196,98,59,.4)', background: 'rgba(255,255,255,.7)',
                  color: '#8E3F1F'
                }}
                hover={occupato ? {} : { background: 'rgba(196,98,59,.14)' }}>
                {t('Riscrivile le parole')}
              </Hov>
            )}
          </div>
        )}

        {(detto || guaio || a.guaio || a.quante > 0) && (
          <div style={{
            flex: 'none', padding: '9px 18px 11px', fontSize: '11.5px', lineHeight: 1.55,
            borderTop: '1px solid rgba(34,39,31,.06)', background: 'rgba(255,255,255,.4)'
          }}>
            {detto && <div style={{ color: '#3E5140' }}>{detto}</div>}
            {(guaio || a.guaio) && <div style={{ color: '#8E3F1F' }}>{t(guaio || a.guaio || '')}</div>}
            {!detto && !guaio && !a.guaio && a.quante > 0 && (
              <div style={{ color: 'rgba(34,39,31,.42)' }}>
                {frasi.girataVolte(a.quante)}
                {a.ultima ? ` · ${t('l’ultima')} ${new Date(a.ultima).toLocaleString(loc(), {
                  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                })}` : ''}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}

/** La scheda per scrivertene una nuova: la stessa finestra, con dentro una casella. */
export function Nuova({ catalogo, chiudi, fatta }: {
  catalogo: Attrezzo[]
  chiudi: () => void
  fatta: (tutte: Automazione[], id: string) => void
}) {
  const [testo, setTesto] = useState('')
  const [suoi, setSuoi] = useState<string[]>([])
  const [faccio, setFaccio] = useState(false)
  const [guaio, setGuaio] = useState('')
  // la casella ha già il fuoco con `autoFocus`; qui Esc chiude e il fuoco torna a chi ha aperto
  const finestra = useRef<HTMLDivElement>(null)
  useFocoDialogo(finestra, chiudi)

  const crea = async () => {
    if (testo.trim().length < 8) return
    setFaccio(true); setGuaio('')
    try {
      const r = await api.creaAutomazione(testo)
      // gli attrezzi che ha attaccato con la chiocciola vincono su quelli che
      // il modello ha dedotto: li ha scelti lei, guardando l'elenco
      if (suoi.length) {
        const s = await api.cambiaAutomazione(r.id, { attrezzi: suoi })
        return fatta(s.automazioni, r.id)
      }
      fatta(r.automazioni, r.id)
    } catch (e) { setGuaio(e instanceof Error ? e.message : String(e)) }
    setFaccio(false)
  }

  const attaccati = suoi.map(n => catalogo.find(x => x.nome === n)).filter((x): x is Attrezzo => !!x)
  const corto = testo.trim().length < 8

  return (
    <>
      <div onClick={chiudi} style={{
        position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(40,30,22,.3)',
        backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)', animation: 'fadein .2s ease'
      }} />
      <div ref={finestra} role="dialog" aria-modal="true" aria-labelledby="nuova-titolo" style={{
        position: 'fixed', zIndex: 61, top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 560, maxWidth: 'calc(100vw - 40px)', maxHeight: 'calc(100vh - 64px)',
        display: 'flex', flexDirection: 'column', borderRadius: 28, overflow: 'hidden',
        background: 'linear-gradient(180deg,rgba(255,253,249,.97),rgba(255,251,245,.95))',
        backdropFilter: 'blur(40px) saturate(1.6)', WebkitBackdropFilter: 'blur(40px) saturate(1.6)',
        border: '1px solid rgba(255,255,255,.95)',
        boxShadow: '0 44px 100px -24px rgba(60,44,30,.46)',
        animation: 'editoresu .3s cubic-bezier(.2,.8,.25,1) both'
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, flex: 'none', padding: '16px 15px 15px 18px',
          borderBottom: '1px solid rgba(34,39,31,.08)'
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div id="nuova-titolo" style={{ fontSize: '15px', fontWeight: 500, color: '#22271F', letterSpacing: '-.01em' }}>
              {t('Scrivine una tua')}
            </div>
            <div style={{ fontSize: '11.5px', color: 'rgba(34,39,31,.5)', marginTop: 2 }}>
              {t('Dilla a parole tue, la scrivo io.')}
            </div>
          </div>
          <Hov as="button" onClick={chiudi} title={t('Chiudi')} aria-label={t('Chiudi')}
            style={{
              display: 'grid', placeItems: 'center', width: 30, height: 30, flex: 'none', padding: 0,
              borderRadius: 10, border: 'none', background: 'rgba(34,39,31,.06)',
              color: 'rgba(34,39,31,.5)', cursor: 'pointer'
            }}
            hover={{ background: 'rgba(34,39,31,.13)', color: '#22271F' }}><IconCroce size={12} /></Hov>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 18px 18px' }}>
          <Casella
            testo={testo} cambia={setTesto} righe={4} autoFocus
            attaccati={suoi} catalogo={catalogo}
            attacca={n => setSuoi(s => s.includes(n) ? s : [...s, n])}
            stacca={n => setSuoi(s => s.filter(x => x !== n))}
            invio={crea}
            segnaposto={t('Ogni lunedì dimmi quali preventivi in @ sono ancora senza risposta')} />

          <div style={{ fontSize: '12px', lineHeight: 1.65, color: 'rgba(34,39,31,.52)', marginTop: 13, textWrap: 'pretty' }}>
            {t('Scrivi @ per dirle cosa può aprire — la posta, il desktop, l’agenda. Al resto penso io: nasce in pausa, la provi, e la accendi quando ti convince.')}
          </div>

          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 14 }}>
            {SPUNTI.map(s => (
              <Hov key={s} as="button" onClick={() => setTesto(t(s))}
                style={{
                  padding: '6px 11px', borderRadius: 99, cursor: 'pointer', textAlign: 'left',
                  border: '1px dashed rgba(34,39,31,.2)', background: 'none',
                  color: 'rgba(34,39,31,.55)', fontSize: '11.5px', fontFamily: 'inherit', maxWidth: '100%'
                }}
                hover={{ borderColor: '#C4623B', color: '#8E3F1F' }}>{t(s)}</Hov>
            ))}
          </div>
        </div>

        <div style={{
          flex: 'none', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          padding: '13px 18px', borderTop: '1px solid rgba(34,39,31,.08)', background: 'rgba(255,255,255,.4)'
        }}>
          <button onClick={crea} disabled={faccio || corto}
            style={{ ...PIENO, display: 'inline-flex', alignItems: 'center', gap: 7, opacity: faccio || corto ? 0.5 : 1, cursor: faccio || corto ? 'default' : 'pointer' }}>
            {faccio && <Glifo tipo="penso" dim={11} colore="#FFF7F0" />}
            {faccio ? t('La scrivo…') : t('Creala')}
          </button>
          {!!attaccati.length && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
              {attaccati.map(x => <Pastiglia key={x.nome} a={x} dim="piccola" />)}
            </div>
          )}
          {guaio && <span style={{ fontSize: '12px', color: '#8E3F1F', textWrap: 'pretty' }}>{t(guaio)}</span>}
        </div>
      </div>
    </>
  )
}

/** Gli attacchi buoni: toccarne uno riempie la casella invece di guardarla vuota. */
const SPUNTI = [
  'Ogni lunedì mattina dimmi quali preventivi sono ancora senza risposta',
  'Quando arriva una fattura, controlla l’importo e mettimela in lista',
  'Ogni sera prepara la risposta a chi mi ha scritto e aspetta ancora'
]
