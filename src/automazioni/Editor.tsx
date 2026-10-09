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
import { Costruttore, fraseDi } from './Costruttore'
import { api, apiP6, type Attrezzo, type Automazione, type MesePrima as MeseDati, type Proponi, type ProvaVista, type Raccolta, type RicettaComposta } from '../api'
import { Prova } from './Prova'
import { frasiProva } from '../prova'
import { interpreta } from './interpreta'
import { frasi, loc, t } from '../lingua'
import { Cestino, Hov, LABEL, useFocoDialogo } from '../ui'
import { Glifo } from '../components/Stato'
import { IconCroce, IconGiro } from '../icons'
import { Casella, RIGO } from './Chiocciola'
import { mesePrima, quandoData, quandoGira, ricevuta } from './quando'

const PIENO: React.CSSProperties = {
  padding: '10px 19px', borderRadius: 99, border: 'none',
  background: 'var(--rame-forte)', color: 'var(--avorio)',
  fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit'
}

const VUOTO: React.CSSProperties = {
  padding: '9px 15px', borderRadius: 99, cursor: 'pointer',
  border: '1px solid rgba(var(--inchiostro-rgb),.18)', background: 'rgba(var(--luce-rgb),.6)',
  color: 'rgba(var(--inchiostro-rgb),.78)', fontSize: '12.5px', fontFamily: 'inherit'
}

function Campo({ etichetta, children, nota }: {
  etichetta: string; children: React.ReactNode; nota?: string
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ ...LABEL, fontSize: '10px', marginBottom: 6 }}>{etichetta}</div>
      {children}
      {nota && (
        <div style={{ fontSize: '11px', color: 'rgba(var(--inchiostro-rgb),.42)', marginTop: 5, lineHeight: 1.5, textWrap: 'pretty' }}>
          {nota}
        </div>
      )}
    </div>
  )
}

/** Le due linguette. Sono due modi di dire la stessa cosa, non due schermate. */
type Dove = 'parole' | 'campi' | 'prova'
function Linguette({ dove, vai, conProva }: { dove: Dove; vai: (d: Dove) => void; conProva: boolean }) {
  return (
    <div role="tablist" style={{
      display: 'inline-flex', gap: 2, padding: 3, borderRadius: 99, flex: 'none',
      background: 'rgba(var(--inchiostro-rgb),.055)'
    }}>
      {([['parole', 'A parole'], ['campi', 'Binari'], ...(conProva ? [['prova', 'Prova'] as const] : [])] as const).map(([id, testo]) => (
        <button key={id} type="button" role="tab" aria-selected={dove === id} onClick={() => vai(id)}
          style={{
            padding: '5px 13px', borderRadius: 99, cursor: 'pointer', fontSize: '12px',
            border: 'none', fontFamily: 'inherit',
            fontWeight: dove === id ? 500 : 400,
            background: dove === id ? 'rgba(var(--luce-rgb),.95)' : 'transparent',
            color: dove === id ? 'var(--inchiostro)' : 'rgba(var(--inchiostro-rgb),.55)',
            boxShadow: dove === id ? '0 2px 6px -2px rgba(var(--ombra-rgb),.28)' : 'none',
            transition: 'background .18s, color .18s'
          }}>{t(testo)}</button>
      ))}
    </div>
  )
}

/**
 * Il mese prima: «il mese scorso avrebbe fatto fino a N cose, da questi documenti».
 *
 * Ha preso il posto di due cose. Dei quattordici giorni di vassoio, che
 * tenevano lontano dalla lista tutto quello che un'automazione faceva, e su
 * quattordici create non ne girava nessuna; e di «Cosa troverebbe adesso», che
 * guardava un istante solo e quasi sempre diceva niente. Qui si guarda un mese
 * intero dell'indice, volta per volta, con la stessa funzione del motore.
 *
 * Non chiama nessun modello e non scrive niente, quindi si carica da sé: una
 * ricetta salvata la mostra appena aperta, una nuova mentre la si compone.
 */
export function Mese({ dati, guardo, guaio, catalogo }: {
  dati: MeseDati | null; guardo: boolean; guaio: string; catalogo: Attrezzo[]
}) {
  const nome = (n: string) => catalogo.find(x => x.nome === n)?.etichetta ?? n
  if (guaio) return <div className="auto-mese"><div className="auto-mese-testa guaio">{t(guaio)}</div></div>
  if (!dati) return guardo ? <div className="auto-mese"><div className="auto-mese-testa">{t('Guardo il mese scorso…')}</div></div> : null
  return (
    <div className="auto-mese" aria-live="polite">
      <div className={`auto-mese-testa${dati.cose ? ' piena' : ''}`}>{mesePrima(dati.cose, dati.documenti)}</div>
      {!!dati.staccati.length && <div className="auto-mese-staccati">{t('Non è collegato:')} {dati.staccati.map(nome).join(', ')}</div>}
      {!!dati.docs.length && <ul>
        {dati.docs.slice(0, 5).map(d => (
          <li key={d.id}><span>{d.titolo}</span>
            <time>{d.quando ? new Date(d.quando).toLocaleDateString(loc(), { day: 'numeric', month: 'short' }) : ''}</time></li>
        ))}
        {dati.documenti > 5 && <li className="auto-mese-altri">{`+${dati.documenti - 5}`}</li>}
      </ul>}
    </div>
  )
}

/** Il mese prima di una ricetta salvata: si ricarica a ogni salvataggio. */
function MeseDi({ id, catalogo, chiave }: { id: string; catalogo: Attrezzo[]; chiave: number }) {
  const [dati, setDati] = useState<MeseDati | null>(null)
  const [guardo, setGuardo] = useState(true)
  const [guaio, setGuaio] = useState('')
  useEffect(() => {
    let vivo = true
    setDati(null); setGuaio(''); setGuardo(true)
    api.meseDi(id).then(r => { if (vivo) setDati(r) })
      .catch(e => { if (vivo) setGuaio(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (vivo) setGuardo(false) })
    return () => { vivo = false }
  }, [id, chiave])
  return <Mese dati={dati} guardo={guardo} guaio={guaio} catalogo={catalogo} />
}

const IN_CORSO = new Set(['in coda', 'in corso'])
const FINITE = new Set(['finita', 'fermata', 'tetto', 'occupato', 'interrotta', 'guaio'])

export function Editor({ a, catalogo, cartelle, raccolte, cambiata, chiudi, spostata, inizio, vaiAlleFonti }: {
  a: Automazione
  /** Da dove si apre: la linguetta «Prova» per un suggerimento appena adottato (P6). */
  inizio?: 'prova'
  vaiAlleFonti?: () => void
  catalogo: Attrezzo[]
  /** Le cartelle del desktop collegate: sono le sole in cui Claude Code può lavorare. */
  cartelle: string[]
  raccolte: Raccolta[]
  cambiata: (tutte: Automazione[]) => void
  chiudi: () => void
  spostata: (id: string, raccolta: string | null) => void
}) {
  // «The automation should open in the words panel»: si apre da leggere, a
  // parole; i binari sono per chi vuole cambiarne un pezzo
  const [dove, setDove] = useState<Dove>(inizio === 'prova' && a.prova ? 'prova' : 'parole')
  /*
   * La prova sugli ultimi 30 giorni (P6): l'ultima, se c'è, si legge aprendo.
   * Premere il bottone passa alla linguetta subito, prima che il server
   * risponda; se il server dice di no, si torna dov'eri.
   */
  const [vista, setVista] = useState<ProvaVista | null>(null)
  useEffect(() => {
    if (!a.prova) return
    let vivo = true
    apiP6.ultimaProva(a.id).then(r => { if (vivo && r.prova) setVista(r.prova) }).catch(() => {})
    return () => { vivo = false }
  }, [a.id, a.prova?.id])

  const [confermaChiusura, setConfermaChiusura] = useState(false)
  const chiediChiusura = () => { if (modificata) setConfermaChiusura(true); else chiudi() }
  const [passi, setPassi] = useState(a.passi ?? [])
  const campiRef = useRef<HTMLDivElement>(null)
  const [nome, setNome] = useState(a.nome)
  const [spiega, setSpiega] = useState(a.spiega)
  const [fai, setFai] = useState(a.fai)
  const [cerca, setCerca] = useState(a.guarda.cerca ?? '')
  const [quando, setQuando] = useState(a.quando)
  const [inLista, setInLista] = useState(a.metti.inLista)
  const [modo, setModo] = useState(a.metti.modo ?? 'io')
  const [perDocumento, setPerDocumento] = useState(!!a.metti.perDocumento)
  const [suoi, setSuoi] = useState<string[]>(a.attrezzi)
  const [cartella, setCartella] = useState(a.cartella ?? '')
  /** Cosa consegna oltre a una riga (E): niente = una riga in lista. */
  const [proponi, setProponi] = useState<Proponi | null>(a.proponi ?? null)
  const [ogniVolta, setOgniVolta] = useState(!!a.guarda.ogniVolta)
  /** La ricetta com'è adesso, con le modifiche non salvate: la leggono i binari e la frase a parole. */
  const ricetta = { nome, spiega, quando, guarda: { ...a.guarda, cerca, ogniVolta: ogniVolta || undefined }, fai, passi, metti: { inLista, modo, ...(perDocumento ? { perDocumento: true as const } : {}) }, attrezzi: suoi, cartella, ...(proponi ? { proponi } : {}) }

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
  useFocoDialogo(finestra, chiediChiusura)

  const vuoleCartella = suoi.includes('claude.lavora')

  /** Ricarica i campi da quello che è tornato dal server. */
  const riprendi = (tutte: Automazione[]) => {
    cambiata(tutte)
    const n = tutte.find(x => x.id === a.id)
    if (!n) return
    setPassi(n.passi ?? []); setNome(n.nome); setSpiega(n.spiega); setFai(n.fai)
    setCerca(n.guarda.cerca ?? ''); setQuando(n.quando)
    setInLista(n.metti.inLista); setModo(n.metti.modo ?? 'io'); setPerDocumento(!!n.metti.perDocumento)
    setSuoi(n.attrezzi); setCartella(n.cartella ?? ''); setProponi(n.proponi ?? null); setOgniVolta(!!n.guarda.ogniVolta)
    setProvata(x => x + 1)
  }

  const patch = { nome, spiega, fai, cerca, quando,
    metti: { inLista, modo, ...(perDocumento ? { perDocumento: true } : {}) },
    attrezzi: suoi, cartella: vuoleCartella ? cartella : '', passi, proponi, ogniVolta }
  const modificata = JSON.stringify(patch) !== JSON.stringify({
    nome: a.nome, spiega: a.spiega, fai: a.fai, cerca: a.guarda.cerca ?? '', quando: a.quando,
    metti: { inLista: a.metti.inLista, modo: a.metti.modo ?? 'io', ...(a.metti.perDocumento ? { perDocumento: true } : {}) },
    attrezzi: a.attrezzi, cartella: a.attrezzi.includes('claude.lavora') ? a.cartella ?? '' : '', passi: a.passi ?? [], proponi: a.proponi ?? null, ogniVolta: !!a.guarda.ogniVolta
  })
  const salva = async (): Promise<boolean> => {
    setSalvo(true); setGuaio(''); setDetto('')
    try {
      const r = await api.cambiaAutomazione(a.id, patch)
      cambiata(r.automazioni)
      setProvata(n => n + 1)
      setDetto(t('Salvata.'))
      return true
    } catch (e) { setGuaio(e instanceof Error ? e.message : String(e)); return false }
    finally { setSalvo(false) }
  }

  const ottimizza = async () => {
    if (modificata && !await salva()) return
    setPenso('ottimizzo'); setGuaio(''); setDetto('')
    try {
      riprendi((await api.ottimizzaAutomazione(a.id)).automazioni)
      setDetto(t('Riscritta. Guarda cosa è cambiato prima di accenderla.'))
    } catch (e) { setGuaio(e instanceof Error ? e.message : String(e)) }
    setPenso('')
  }

  const riscrivi = async () => {
    if (occupato || richiesta.trim().length < 3) return
    if (modificata && !await salva()) return
    setPenso('riscrivo'); setGuaio(''); setDetto('')
    try {
      riprendi((await api.riscriviAutomazione(a.id, richiesta)).automazioni)
      setRichiesta('')
      setDetto(t('Fatto. Guarda com’è venuta.'))
      setDove('campi')
    } catch (e) { setGuaio(e instanceof Error ? e.message : String(e)) }
    setPenso('')
  }

  const prova = async () => {
    if (salvo || gira || penso) return
    const prima = dove
    setGira(true); setDetto(''); setGuaio('')
    if (modificata && !await salva()) { setGira(false); return }
    setDove('prova')
    setVista(v => ({
      id: '', stato: 'in corso', esito: null, giusti: 0, giudicati: 0, tue: 0, documenti: 0, risultati: 0, bozze: 0,
      al: null, cambiata: false, parziale: [], davanti: null, esiti: [], altri: 0, puoScrivere: false, ...(v && IN_CORSO.has(v.stato) ? v : {})
    }))
    try {
      const r = await apiP6.provaAutomazione(a.id)
      setVista(r.prova)
    } catch (e) {
      setDove(prima); setVista(null)
      setGuaio(e instanceof Error ? e.message : String(e))
    }
    setGira(false)
  }

  const adesso = async () => {
    if (salvo || gira || penso) return
    setGira(true); setDetto(''); setGuaio('')
    if (modificata && !await salva()) { setGira(false); return }
    try {
      const r = await api.automazioneAdesso(a.id)
      cambiata(r.automazioni)
      // la ricevuta del giro appena fatto: quanti documenti, quante cose, o perché niente
      const nuova = r.automazioni.find(x => x.id === a.id)
      setDetto(r.esito === 'gia' ? t('Ce n’è già una in lista da questa.') : ricevuta(nuova?.ricevuta, nuova?.riprova))
    } catch (e) { setGuaio(e instanceof Error ? e.message : String(e)) }
    setGira(false)
  }

  const butta = async () => {
    try {
      cambiata((await api.buttaAutomazione(a.id)).automazioni)
      chiudi()
    } catch (e) { setGuaio(e instanceof Error ? e.message : String(e)) }
  }

  const occupato = !!penso || salvo || gira

  return (
    <>
      <div onClick={chiediChiusura} style={{
        position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(var(--ombra-rgb),.3)',
        backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)', animation: 'fadein .2s ease'
      }} />

      <div ref={finestra} className="auto-editor" role="dialog" aria-modal="true" aria-labelledby="editor-titolo"
        onKeyDown={e => {
          if (e.key !== 'Tab') return
          const nodes = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex="0"]'))
            .filter(el => el.getClientRects().length > 0 && !el.closest('[inert]'))
          const first = nodes[0], last = nodes[nodes.length - 1]
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
        }} style={{
        position: 'fixed', zIndex: 61, top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)',
        width: 720, maxWidth: 'calc(100vw - 40px)', maxHeight: 'calc(100dvh - 64px)',
        display: 'flex', flexDirection: 'column', borderRadius: 28, overflow: 'hidden',
        background: 'linear-gradient(180deg,rgba(var(--carta-rgb),.97),rgba(var(--carta-rgb),.95))',
        backdropFilter: 'blur(40px) saturate(1.6)', WebkitBackdropFilter: 'blur(40px) saturate(1.6)',
        border: '1px solid rgba(var(--luce-rgb),.95)',
        boxShadow: '0 44px 100px -24px rgba(var(--ombra-rgb),.46)',
        animation: 'editoresu .3s cubic-bezier(.2,.8,.25,1) both'
      }}>

        {confermaChiusura && <div className="auto-error" role="alert" style={{ margin: 12 }}><p>{t('Hai modifiche non salvate.')}</p><button className="auto-button" onClick={() => setConfermaChiusura(false)}>{t('Continua a modificare')}</button> <button className="auto-button" onClick={chiudi}>{t('Scarta e chiudi')}</button></div>}
        {/* la testa: chi è, e i due bottoni che valgono per tutta la scheda */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, flex: 'none', padding: '21px 24px 19px',
          borderBottom: '1px solid rgba(var(--inchiostro-rgb),.08)', background: 'rgba(var(--salvia-rgb),.08)'
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div id="editor-titolo" style={{
              fontSize: '19px', fontWeight: 450, color: 'var(--inchiostro)', letterSpacing: '-.02em',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
            }}>{nome || a.nome}</div>
            <div style={{
              fontSize: '11.5px', color: 'rgba(var(--inchiostro-rgb),.5)', marginTop: 2,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
            }}>
              {a.riprova
                ? ricevuta(a.ricevuta, a.riprova)
                : a.accesa
                  ? (a.prossima ? frasi.giraDaSolaProssima(quandoData(a.prossima)) : quandoGira(a.quando))
                  : t('In pausa')}
              {a.prova && dove !== 'prova' && FINITE.has(a.prova.stato) && <> · <button type="button" className="auto-link editor-sub-link" onClick={() => setDove('prova')}>
                {a.prova.giudicati >= 5 ? frasiProva.contoEditor(a.prova.giusti, a.prova.giudicati) : frasiProva.poche(a.prova.giudicati)}
                {a.prova.cambiata ? ` · ${t('cambiata da allora')}` : ''}</button></>}
            </div>
          </div>

          {/*
            Ottimizza. Sta qui e non fra i bottoni in fondo perché non è un
            salvataggio: è una cosa che riguarda tutta la scheda, e va dove si
            guarda per prima quando ci si accorge che una non funziona.
          */}
          <Hov as="button" onClick={ottimizza} disabled={occupato} aria-label={t('Ottimizza')}
            title={t('Falla guardare a Claude e falla scrivere meglio')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, flex: 'none',
              padding: '9px', borderRadius: 11, fontFamily: 'inherit', fontSize: '12px',
              fontWeight: 500, cursor: occupato ? 'default' : 'pointer',
              border: '1px solid rgba(var(--rame-rgb),.32)', background: 'rgba(var(--rame-rgb),.1)',
              color: 'var(--rame-testo)', opacity: occupato ? 0.6 : 1
            }}
            hover={occupato ? {} : { background: 'rgba(var(--rame-rgb),.18)', borderColor: 'rgba(var(--rame-rgb),.5)' }}>
            {penso === 'ottimizzo'
              ? <Glifo tipo="penso" dim={11} colore="var(--rame-testo)" />
              : <IconGiro size={12} />}
          </Hov>

          <Hov as="button" onClick={chiediChiusura} title={t('Chiudi')} aria-label={t('Chiudi')}
            style={{
              display: 'grid', placeItems: 'center', width: 30, height: 30, flex: 'none', padding: 0,
              borderRadius: 10, border: 'none', background: 'rgba(var(--inchiostro-rgb),.06)',
              color: 'rgba(var(--inchiostro-rgb),.5)', cursor: 'pointer'
            }}
            hover={{ background: 'rgba(var(--inchiostro-rgb),.13)', color: 'var(--inchiostro)' }}><IconCroce size={12} /></Hov>
        </div>

        <div className="auto-editor-body" inert={occupato} style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 15, flexWrap: 'wrap' }}>
            <Linguette dove={dove} vai={setDove} conProva={!!vista || !!a.prova} />
            <div style={{ flex: 1 }} />
            {/* la cartella in cui sta: un menù, perché trascinare dentro un
                pannello aperto non si può */}
            {!!raccolte.length && <select value={a.raccolta ?? ''} aria-label={t('In che cartella')}
              onChange={e => spostata(a.id, e.target.value || null)}
              style={{ ...RIGO, width: 'auto', cursor: 'pointer', fontSize: '12px', padding: '6px 9px' }}>
              <option value="">{t('in nessuna cartella')}</option>
              {raccolte.map(r => <option key={r.nome} value={r.nome}>{r.nome}</option>)}
            </select>}
          </div>

          {dove === 'prova' && vista ? (
            <Prova vista={vista} cambia={setVista} riprova={prova} guaio={setGuaio}
              vaiAlleFonti={() => { chiudi(); vaiAlleFonti?.() }} />
          ) : dove === 'parole' ? (
            <div>
              {/* a parole, prima di tutto quello che fa adesso: è la stessa frase
                  che sta in cima ai binari, ed era la prima cosa che si leggeva
                  aprendola quando si apriva sui binari */}
              <p className="auto-frase">{fraseDi(ricetta, catalogo)}</p>
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
                {penso === 'riscrivo' && <Glifo tipo="penso" dim={11} colore="var(--avorio)" />}
                {penso === 'riscrivo' ? t('La riscrivo…') : t('Riscrivila')}
              </button>
            </div>
          ) : (
            <div>
              {/*
                I binari: la ricetta a pezzi, con le mani. Sopra c'è la frase
                che si riscrive da sola; sotto i tratti — quando, legge, i
                passaggi, fa, mette — che si toccano o si trascinano. Il nome
                e la riga che lo spiega stanno in un riquadro a parte, perché
                non sono la ricetta: sono come la si chiama.
              */}
              <Costruttore catalogo={catalogo} cartelle={cartelle}
                r={ricetta}
                cambia={n => {
                  setQuando(n.quando); setCerca(n.guarda.cerca ?? ''); setFai(n.fai); setPassi(n.passi ?? [])
                  setInLista(n.metti.inLista); setModo(n.metti.modo ?? 'io'); setPerDocumento(!!n.metti.perDocumento)
                  setSuoi(n.attrezzi ?? []); setCartella(n.cartella ?? ''); setProponi(n.proponi ?? null); setOgniVolta(!!n.guarda.ogniVolta)
                }}
                coda={modificata ? <p className="auto-muted">{t('Salva le modifiche per vedere quali documenti leggerà.')}</p> : <MeseDi id={a.id} catalogo={catalogo} chiave={provata} />} />
              <div className="auto-editor-settings" ref={campiRef}>
              <Campo etichetta={t('Come si chiama')}>
                <input aria-label={t('Come si chiama')} value={nome} onChange={e => setNome(e.target.value)} style={RIGO} />
              </Campo>
              <Campo etichetta={t('Cosa fa, in una riga')}>
                <input aria-label={t('Cosa fa, in una riga')} value={spiega} onChange={e => setSpiega(e.target.value)} style={RIGO} />
              </Campo>
              </div>
              <details className="auto-history"><summary>{t('Cronologia esecuzioni')}</summary>
                {a.storia.length ? <ol>{[...a.storia].reverse().map((r, i) => <li key={i}><time>{new Date(r.quando).toLocaleString(loc())}</time><span>{ricevuta(r)}</span>{r.risultato && <details className="auto-run-result"><summary>{t('Risultato')}</summary><p>{r.risultato}</p></details>}</li>)}</ol> : <p className="auto-muted">{t('Non è ancora girata.')}</p>}
              </details>
            </div>
          )}
        </div>

        <div style={{
          flex: 'none', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          padding: '15px 24px', borderTop: '1px solid rgba(var(--inchiostro-rgb),.08)',
          background: 'rgba(var(--luce-rgb),.4)'
        }}>
          {dove === 'campi' && (
            <button onClick={salva} disabled={salvo || occupato || !modificata} style={{ ...PIENO, opacity: modificata ? 1 : .45 }}>
              {salvo ? t('Salvo…') : t('Salva')}
            </button>
          )}

          {/*
            Dal vivo, subito (E): non c'è più un vassoio che lo tenga lontano
            dalla lista, e il mese prima si legge nel tratto «Legge».
          */}
          <Hov as="button" onClick={adesso} disabled={gira || occupato}
            style={{ ...VUOTO, display: 'inline-flex', alignItems: 'center', gap: 7, cursor: gira ? 'default' : 'pointer' }}
            hover={gira ? {} : { borderColor: 'var(--rame)', color: 'var(--rame-testo)' }}>
            {gira && <Glifo tipo="penso" dim={11} colore="var(--rame-testo)" />}
            {gira ? t('La faccio girare…') : t('Falla girare adesso')}
          </Hov>

          <div style={{ flex: 1, minWidth: 20 }} />
          <button className="auto-button" disabled={occupato} onClick={async () => {
            if (modificata && !await salva()) return
            setSalvo(true)
            try { cambiata((await api.accendiAutomazione(a.id, !a.accesa)).automazioni) }
            catch (e) { setGuaio(e instanceof Error ? e.message : String(e)) }
            finally { setSalvo(false) }
          }}>{a.accesa ? t('Mettila in pausa') : t('Accendila')}</button>

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
            borderTop: '1px solid rgba(var(--inchiostro-rgb),.06)',
            background: a.salute.stato === 'ferma' ? 'rgba(var(--inchiostro-rgb),.035)' : 'rgba(var(--rame-rgb),.07)',
            color: a.salute.stato === 'ferma' ? 'rgba(var(--inchiostro-rgb),.6)' : 'var(--rame-testo)'
          }}>
            <details style={{ width: '100%' }}><summary style={{ cursor: 'pointer', fontSize: 11.5 }}>
              {a.salute.stato === 'scollegata' ? t('manca una fonte') : a.salute.stato === 'guaio' ? t('L’ultima volta è andata storta.') : a.salute.stato === 'ferma' ? t('aspetta che chiudi la sua riga') : t('Da controllare')}
            </summary><div style={{ paddingTop: 9 }}>
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
                  border: '1px solid rgba(var(--rame-rgb),.4)', background: 'rgba(var(--luce-rgb),.7)',
                  color: 'var(--rame-testo)'
                }}
                hover={occupato ? {} : { background: 'rgba(var(--rame-rgb),.14)' }}>
                {t('Riscrivile le parole')}
              </Hov>
            )}
            </div></details>
          </div>
        )}

        {(detto || guaio || a.guaio || a.ricevuta?.quando) && (
          <div style={{
            flex: 'none', padding: '9px 18px 11px', fontSize: '11.5px', lineHeight: 1.55,
            borderTop: '1px solid rgba(var(--inchiostro-rgb),.06)', background: 'rgba(var(--luce-rgb),.4)'
          }}>
            {detto && <div style={{ color: 'var(--verde-cupo)' }}>{detto}</div>}
            {(guaio || a.guaio) && <div style={{ color: 'var(--rame-testo)', overflowWrap: 'anywhere' }}>{t(guaio || a.guaio || '')}</div>}
            {!detto && !guaio && !a.guaio && a.ricevuta && (
              <div style={{ color: 'rgba(var(--inchiostro-rgb),.42)' }}>
                {new Date(a.ricevuta.quando).toLocaleString(loc(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                {` · ${ricevuta(a.ricevuta, a.riprova)}`}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}

/** La scheda per scrivertene una nuova: la stessa finestra, con dentro una casella. */
/**
 * Nuova automazione: una frase, e i binari sotto.
 *
 * Erano una casella vuota con dentro un «@» da scoprire, e un bottone «Creala»
 * che scriveva un file al buio: si vedeva cosa era venuto fuori solo dopo, in
 * pausa, dentro una scheda. Adesso la frase è in cima e i binari sotto, e i
 * due si parlano: mentre si scrive «ogni lunedì mattina guarda nella posta»
 * il tratto «quando» e il tratto «legge» si riempiono da soli — senza nessun
 * modello, è lettura di due parole — e «Componi con Myynd» fa il resto, il
 * nome, l'istruzione, le parole con cui cercare. Si crea quando la frase in
 * cima ai binari dice quello che si voleva, non prima.
 *
 * Le fonti si trascinano, o si toccano. Non c'è più una «@» da sapere.
 */
export function Nuova({ catalogo, cartelle, chiudi, fatta, daCarta = null }: {
  catalogo: Attrezzo[]
  cartelle: string[]
  chiudi: () => void
  fatta: (tutte: Automazione[], id: string) => void
  /**
   * Da una carta (E): la frase con cui parte, «Ogni lunedì mattina: …», e il
   * testo della carta, che diventa la cosa da fare. È un promemoria: torna in
   * lista ogni volta, anche senza niente da leggere, e si crea con un dito.
   */
  daCarta?: { frase: string; testo: string } | null
}) {
  const [frase, setFrase] = useState('')
  const [r, setR] = useState<RicettaComposta>({ nome: '', spiega: '', quando: { quandoArriva: true }, guarda: {}, fai: '', passi: [], metti: { inLista: 'oggi', modo: 'io' }, attrezzi: [] })
  const [compongo, setCompongo] = useState(false)
  const [creo, setCreo] = useState(false)
  const [guaio, setGuaio] = useState('')
  const [detto, setDetto] = useState('')
  const finestra = useRef<HTMLDivElement>(null)
  const occupato = compongo || creo
  useFocoDialogo(finestra, () => { if (!occupato) chiudi() })

  /** La frase letta subito: quando, dove e cosa consegna, senza modello. */
  const scrivi = (testo: string) => {
    setFrase(testo)
    const letta = interpreta(testo, catalogo)
    setR(x => ({
      ...x,
      ...(letta.quando ? { quando: letta.quando } : {}),
      ...(letta.proponi ? { proponi: letta.proponi } : {}),
      attrezzi: [...new Set([...(x.attrezzi ?? []), ...letta.attrezzi])]
    }))
  }
  // da una carta: la frase c'è già, e si legge come se l'avesse scritta lui
  useEffect(() => {
    if (!daCarta) return
    scrivi(daCarta.frase)
    const testo = daCarta.testo.replace(/\s+/g, ' ').trim()
    setR(x => ({ ...x, nome: testo.slice(0, 60), fai: testo, guarda: { ogniVolta: true }, metti: { inLista: 'oggi', modo: 'io' } }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daCarta])

  const componi = async () => {
    if (occupato || frase.trim().length < 8) return
    setCompongo(true); setGuaio(''); setDetto('')
    try {
      const { ricetta } = await api.componiAutomazione(frase, r.attrezzi?.length ? r.attrezzi : undefined)
      // cosa consegna resta quello letto dalla frase: il modello compone una riga
      setR(x => ({ nome: ricetta.nome, spiega: ricetta.spiega, quando: ricetta.quando, guarda: ricetta.guarda, fai: ricetta.fai, passi: ricetta.passi ?? [], metti: ricetta.metti, attrezzi: ricetta.attrezzi ?? [], ...(ricetta.cartella ? { cartella: ricetta.cartella } : {}), ...(x.proponi ? { proponi: x.proponi } : {}) }))
      setDetto(t('Composta. Guarda i binari: se dicono quello che volevi, creala.'))
    } catch (e) { setGuaio(e instanceof Error ? e.message : String(e)) }
    setCompongo(false)
  }

  // un nome, se non gliel'ha dato nessuno: la frase stessa, corta
  const nomeProposto = r.nome.trim() || frase.trim().split(/[.\n]/)[0].slice(0, 60).trim()
  const pronta = nomeProposto.length >= 3 && r.fai.trim().length >= 8

  const campi = {
    nome: nomeProposto, spiega: r.spiega, fai: r.fai, cerca: r.guarda.cerca ?? '', quando: r.quando,
    metti: r.metti, attrezzi: r.attrezzi ?? [], cartella: r.cartella ?? '', passi: r.passi ?? [], proponi: r.proponi ?? null,
    ogniVolta: !!r.guarda.ogniVolta
  }
  const chiave = JSON.stringify(campi)

  /*
   * Il mese prima, mentre la si compone (E): «il mese scorso avrebbe fatto
   * fino a N cose». Sola lettura, nessun modello: si ricalcola da sé mezzo
   * secondo dopo l'ultimo tocco, e si crea guardandolo. Da lì gira dal vivo.
   */
  const [mese, setMese] = useState<MeseDati | null>(null)
  const [guardoMese, setGuardoMese] = useState(false)
  useEffect(() => {
    if (!pronta) { setMese(null); return }
    let vivo = true
    setGuardoMese(true)
    const tempo = setTimeout(() => {
      api.mesePrima(JSON.parse(chiave)).then(x => { if (vivo) setMese(x) }).catch(() => { if (vivo) setMese(null) })
        .finally(() => { if (vivo) setGuardoMese(false) })
    }, 500)
    return () => { vivo = false; clearTimeout(tempo) }
  }, [chiave, pronta])

  const crea = async () => {
    if (occupato || !pronta) return
    setCreo(true); setGuaio('')
    try {
      const esito = await api.nuovaAutomazione(campi)
      fatta(esito.automazioni, esito.id)
    } catch (e) { setGuaio(e instanceof Error ? e.message : String(e)) }
    setCreo(false)
  }

  return (
    <>
      <div onClick={() => { if (!occupato) chiudi() }} style={{
        position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(var(--ombra-rgb),.3)',
        backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)', animation: 'fadein .2s ease'
      }} />
      <div ref={finestra} className="auto-editor" role="dialog" aria-modal="true" aria-labelledby="nuova-titolo" style={{
        position: 'fixed', zIndex: 61, top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        // «The card for it is extra wide»: ottocentosessanta su una finestra da
        // milleduecentottanta erano il foglio intero, e un modulo largo quanto
        // lo schermo si legge come una tabella. Seicentoquaranta è la misura
        // del foglio del Brief, ed è la stessa ragione: una colonna sola.
        width: 640, maxWidth: 'calc(100vw - 40px)', maxHeight: 'calc(100dvh - 48px)',
        display: 'flex', flexDirection: 'column', borderRadius: 28, overflow: 'hidden',
        background: 'linear-gradient(180deg,rgba(var(--carta-rgb),.98),rgba(var(--carta-rgb),.96))',
        border: '1px solid rgba(var(--luce-rgb),.95)',
        boxShadow: '0 44px 100px -24px rgba(var(--ombra-rgb),.46)',
        animation: 'editoresu .3s cubic-bezier(.2,.8,.25,1) both'
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, flex: 'none', padding: '18px 18px 16px 24px',
          borderBottom: '1px solid rgba(var(--inchiostro-rgb),.08)'
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div id="nuova-titolo" style={{ fontSize: '17px', fontWeight: 500, color: 'var(--inchiostro)', letterSpacing: '-.01em' }}>{t('Nuovo ordine fisso')}</div>
          </div>
          <Hov as="button" onClick={() => { if (!occupato) chiudi() }} title={t('Chiudi')} aria-label={t('Chiudi')}
            style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, flex: 'none', padding: 0, borderRadius: 10, border: 'none', background: 'rgba(var(--inchiostro-rgb),.06)', color: 'rgba(var(--inchiostro-rgb),.5)', cursor: 'pointer' }}
            hover={{ background: 'rgba(var(--inchiostro-rgb),.13)', color: 'var(--inchiostro)' }}><IconCroce size={12} /></Hov>
        </div>

        <div className="auto-editor-body" inert={occupato} style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <div className="auto-dettatura">
            <textarea rows={2} autoFocus value={frase} onChange={e => scrivi(e.target.value)} aria-label={t('Dilla in una frase')}
              placeholder={t('Ogni lunedì mattina dimmi quali preventivi nella posta sono ancora senza risposta')}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void componi() } }} />
            <div className="auto-dettatura-riga">
              <button type="button" className="auto-button" disabled={occupato || frase.trim().length < 8} onClick={componi}>
                {compongo && <Glifo tipo="penso" dim={11} colore="var(--rame-testo)" />}{compongo ? t('La compongo…') : t('Componi con Myynd')}
              </button>
              <div className="auto-spunti">
                {SPUNTI.map(([label, s]) => (
                  <button key={s} type="button" onClick={() => scrivi(t(s))}>{t(label)}</button>
                ))}
              </div>
            </div>
            {detto && <p className="auto-muted" role="status">{detto}</p>}
          </div>

          <label className="auto-campo auto-nome">
            <span>{t('Come si chiama')}</span>
            <input value={r.nome} onChange={e => setR({ ...r, nome: e.target.value })} placeholder={nomeProposto || t('Preventivi fermi')} />
          </label>

          <Costruttore r={r} cambia={setR} catalogo={catalogo} cartelle={cartelle} />
          {pronta && <Mese dati={mese} guardo={guardoMese} guaio="" catalogo={catalogo} />}
        </div>

        <div style={{
          flex: 'none', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          padding: '13px 24px', borderTop: '1px solid rgba(var(--inchiostro-rgb),.08)', background: 'rgba(var(--luce-rgb),.4)'
        }}>
          <button onClick={crea} disabled={occupato || !pronta}
            style={{ ...PIENO, display: 'inline-flex', alignItems: 'center', gap: 7, opacity: occupato || !pronta ? 0.5 : 1, cursor: occupato || !pronta ? 'default' : 'pointer' }}>
            {creo && <Glifo tipo="penso" dim={11} colore="var(--avorio)" />}
            {creo ? t('La creo…') : t('Crea e accendi')}
          </button>
          {!pronta && <span className="auto-muted">{t('Le manca cosa deve fare: scrivilo nel tratto «Fa», o componila con Myynd.')}</span>}
          {guaio && <span style={{ fontSize: '12px', color: 'var(--rame-testo)', textWrap: 'pretty' }}>{t(guaio)}</span>}
        </div>
      </div>
    </>
  )
}

/** Gli attacchi buoni: toccarne uno riempie la casella invece di guardarla vuota. */
const SPUNTI = [
  ['Preventivi', 'Ogni lunedì mattina dimmi quali preventivi sono ancora senza risposta'],
  ['Fatture', 'Quando arriva una fattura, controlla l’importo e mettimela in lista'],
  ['Risposte', 'Ogni sera prepara la risposta a chi mi ha scritto e aspetta ancora']
]
