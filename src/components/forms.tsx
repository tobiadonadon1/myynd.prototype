// I moduli per collegare una fonte. Stessi campi nell'onboarding e nel
// pannello Connessioni: si scrivono una volta sola.
//
// Le credenziali le digiti tu, nella tua app, e vanno al tuo server locale.

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { api } from '../api'
import { suCollegamento } from '../collegamenti'
import type { ChatGPT, ClaudeCon, Stato } from '../api'
import { frasi, lingua, t } from '../lingua'
import { casoDaErrore, mailto, richiestaAmministratore } from '../amministratore.ts'
// lo stesso riconoscimento del server: una funzione pura, senza niente di Node
import { dominioAziendale, type CasoAmministratore } from '../../server/connettori/amministratore.ts'
import { AMBITI_SLACK, PAGINE, TOKEN_GITHUB_A_MANO, appSlack, paginaTokenGithub } from '../dove-trovarlo.ts'
import { desktop } from '../desktop'
import { knob, track } from '../ui'
import { preparaApertura } from '../navigazione.ts'
import { controllaAccessoChatGPT, nomePianoChatGPT } from '../chatgpt-accesso.ts'
import {statoAccessoNote} from '../note-access.ts'

export type Tema = 'scuro' | 'chiaro'

const CHIARO = '#F4EFE8'

/** La classe che porta il colore giusto al placeholder e al fuoco da tastiera. */
export function classeCampo(tema: Tema): string {
  return tema === 'scuro' ? 'scuro' : ''
}

export function campo(tema: Tema): CSSProperties {
  const scuro = tema === 'scuro'
  return {
    width: '100%', boxSizing: 'border-box', marginTop: 8, padding: '12px 15px',
    borderRadius: 13,
    border: `1px solid ${scuro ? 'rgba(244,239,232,.22)' : 'rgba(var(--inchiostro-rgb),.18)'}`,
    background: scuro ? 'rgba(244,239,232,.06)' : 'rgba(var(--luce-rgb),.7)',
    color: scuro ? CHIARO : 'var(--inchiostro)',
    fontSize: 15, fontFamily: 'inherit', outline: 'none'
  }
}

/**
 * L'etichetta di un campo. Più scura di prima: a metà inchiostro, in maiuscolo
 * e a 12px, era una delle righe che «si vedono appena» — e l'etichetta è la
 * sola parola che dice cosa va scritto nella casella sotto.
 */
export function etichetta(tema: Tema): CSSProperties {
  return {
    fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase',
    color: tema === 'scuro' ? 'rgba(244,239,232,.6)' : 'rgba(var(--inchiostro-rgb),.68)',
    marginTop: 12
  }
}

/**
 * La riga d'apertura: cosa dà questa fonte a Myynd, e basta.
 *
 * Inchiostro pieno, non grigio su grigio. Era il difetto che queste schede si
 * portavano addosso tutte e diciassette: un paragrafo chiaro su uno sfondo
 * chiaro, che si legge solo se si sa già cosa c'è scritto. Una riga sola, e
 * tutto il resto di quello che c'era qui adesso sta chiuso più in basso.
 */
function guida(tema: Tema): CSSProperties {
  return {
    fontSize: '13.5px', lineHeight: 1.5, overflowWrap: 'anywhere',
    color: tema === 'scuro' ? CHIARO : 'rgba(var(--inchiostro-rgb),.88)'
  }
}

/** Il testo di servizio: sotto un campo, o dentro un blocco aperto. Mai più chiaro di così. */
function nota(tema: Tema): CSSProperties {
  return {
    fontSize: '12.5px', lineHeight: 1.55, overflowWrap: 'anywhere',
    color: tema === 'scuro' ? 'rgba(244,239,232,.82)' : 'rgba(var(--inchiostro-rgb),.78)'
  }
}

/** La riga che si apre: un titolo che dice cosa c'è dentro, e si vede che si clicca. */
function sommario(tema: Tema): CSSProperties {
  return {
    fontSize: 13, fontWeight: 500, lineHeight: 1.5, cursor: 'pointer', padding: '2px 0',
    color: tema === 'scuro' ? 'rgba(244,239,232,.72)' : 'rgba(var(--inchiostro-rgb),.7)'
  }
}

/** Il bottone piccolo accanto a un avviso: rame, una riga sola, mai il primario. */
function azione(tema: Tema): CSSProperties {
  return {
    flex: 'none', padding: '8px 14px', borderRadius: 99, fontSize: '12.5px',
    fontFamily: 'inherit', cursor: 'pointer', border: '1px solid var(--rame)',
    background: 'rgba(var(--rame-rgb),.16)', color: tema === 'scuro' ? '#E8A87C' : 'var(--rame-testo)'
  }
}

/** Un campo per riga: etichetta corta, casella, e — se proprio serve — una riga sotto. */
function Campo({ tema, nome, sotto, children }: {
  tema: Tema; nome: React.ReactNode; sotto?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ ...etichetta(tema), marginTop: 0 }}>{nome}</div>
      {children}
      {sotto ? <div style={{ ...nota(tema), marginTop: 6 }}>{sotto}</div> : null}
    </div>
  )
}

/**
 * Quello che non serve per collegare: chiuso, con sopra il titolo di cosa c'è dentro.
 *
 * Non «Dettagli» e non «Altro»: chi legge deve sapere se aprirlo prima di
 * aprirlo, altrimenti la riga chiusa costa quanto il paragrafo aperto.
 */
function Aiuto({ tema, titolo, children }: { tema: Tema; titolo: string; children: React.ReactNode }) {
  return (
    <details style={{ marginTop: 12 }}>
      <summary style={sommario(tema)}>{titolo}</summary>
      <div style={{ marginTop: 8 }}>{children}</div>
    </details>
  )
}

/**
 * Un indirizzo da aprire, scritto com'è.
 *
 * Il testo del collegamento è l'indirizzo senza `https://`, non «clicca qui»:
 * è la stessa cosa che la persona vedrà nella barra del browser, e si legge
 * uguale nelle due lingue. Si apre fuori: dentro l'app `target=_blank` finisce
 * nel browser di sistema (`finestra.ts`), nel browser in una scheda nuova.
 */
function Vai({ tema, url, testo }: { tema: Tema; url: string; testo?: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" style={{ ...link(tema), overflowWrap: 'anywhere' }}>
      {testo ?? url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
    </a>
  )
}

/**
 * La conferma che si conta: quello che ha letto, in una riga, e «Avanti».
 *
 * È il quarto pezzo della scheda del calendario, quello che la tester ha
 * notato: un numero è l'unica prova che chi ha incollato può controllare da
 * solo — «12 repository» vuol dire che il token vede quello che deve vedere,
 * «0» vuol dire che qualcosa manca. La scheda del calendario la scrive per
 * conto suo e resta com'è; le altre passano di qui.
 */
function Fatto({ tema, testo, ok }: { tema: Tema; testo: string; ok: () => void }) {
  return (
    <div>
      <div role="status" style={guida(tema)}>{testo}</div>
      <Conferma onClick={ok} occupato={false} tema={tema}>{t('Avanti')}</Conferma>
    </div>
  )
}

/**
 * Quando a dire di no è l'azienda: una riga, e la richiesta già scritta.
 *
 * Non è rosso, perché non è uno sbaglio di chi collega: sta nella sabbia
 * degli avvisi che valgono adesso. La riga dice chi può sbloccarlo; i due
 * bottoni fanno la sola cosa che resta da fare — chiederglielo — con il
 * messaggio già scritto: cosa legge Myynd, che è in sola lettura, dove
 * restano i dati, e la voce esatta della console da cambiare
 * (`src/amministratore.ts`). Chiuso sotto, per chi vuole leggerlo prima di
 * mandarlo, c'è il testo intero.
 *
 * Uno solo per tutte le schede: la posta, l'agenda, GitHub, Google e
 * Microsoft dicono la stessa cosa nello stesso modo.
 */
export function ChiediAllAmministratore({ tema, caso }: { tema: Tema; caso: CasoAmministratore }) {
  const [copiata, setCopiata] = useState(false)
  const [aperta, setAperta] = useState(false)
  const [ospitato, setOspitato] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    api.stato().then(s => { if (vivo) setOspitato(s.ospitato ? window.location.host : null) }).catch(() => {})
    return () => { vivo = false }
  }, [])
  const r = richiestaAmministratore(caso, { inglese: lingua() === 'en', ospitato })
  const intera = `${r.oggetto}\n\n${r.corpo}`

  const riga = caso.forse
    ? t('Se il token è di un’organizzazione, un suo amministratore deve approvarlo.')
    : caso.servizio === 'gmail' ? t('La tua azienda non permette ad altre app di leggere la posta di Gmail. Può permetterlo il tuo amministratore.')
    : caso.servizio === 'calendario' ? t('La tua azienda non permette di condividere l’agenda con un indirizzo. Può permetterlo il tuo amministratore.')
    : caso.servizio === 'google-oauth' ? t('La tua azienda deve approvare Myynd su Google prima che tu possa collegarlo.')
    : caso.servizio === 'microsoft-oauth' ? t('La tua azienda deve approvare Myynd su Microsoft prima che tu possa collegarlo.')
    : t('Un amministratore dell’organizzazione deve approvare questo token.')

  const scrivi = async () => {
    const url = mailto(r)
    const d = desktop()
    try { if (d) await d.apriFuori(url); else window.location.href = url }
    catch { setAperta(true) }
  }
  const copia = async () => {
    try { await navigator.clipboard.writeText(intera); setCopiata(true) }
    // senza appunti (una pagina non sicura, un permesso negato) il testo si
    // apre qui sotto, dove si può selezionare a mano
    catch { setAperta(true) }
  }

  return (
    <Avviso tema={tema}>
      <div role="status">{riga}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        <button type="button" onClick={scrivi} style={azione(tema)}>{t('Scrivi all’amministratore')}</button>
        <button type="button" onClick={copia} style={azione(tema)}>{copiata ? t('Richiesta copiata') : t('Copia la richiesta')}</button>
      </div>
      <details open={aperta} onToggle={e => setAperta((e.currentTarget as HTMLDetailsElement).open)} style={{ marginTop: 10 }}>
        <summary style={sommario(tema)}>{t('Cosa c’è scritto nella richiesta')}</summary>
        <div style={{ ...nota(tema), marginTop: 8, whiteSpace: 'pre-wrap', maxHeight: 220, overflowY: 'auto', userSelect: 'text' }}>{intera}</div>
      </details>
    </Avviso>
  )
}

/**
 * L'errore, o il no dell'azienda: mai tutti e due in rosso.
 *
 * Quando il server dice che è l'amministratore, la riga rossa non c'è: c'è
 * il blocco con la richiesta. Quando è solo *una* delle spiegazioni (`forse`),
 * c'è la riga rossa con la spiegazione più probabile, e sotto il blocco come
 * seconda strada.
 */
function ErroreOAzienda({ tema, testo, caso, prima }: { tema: Tema; testo: string; caso: CasoAmministratore | null; prima?: string }) {
  if (caso && !caso.forse) return <ChiediAllAmministratore tema={tema} caso={caso} />
  return (
    <>
      <Errore testo={testo} prima={prima} />
      {testo && caso && <ChiediAllAmministratore tema={tema} caso={caso} />}
    </>
  )
}

/**
 * L'ultimo passo di un «Dove trovo…?», per quando la voce non c'è.
 *
 * Su un account di lavoro la voce che i passi nominano può semplicemente
 * mancare: Google lo scrive nella sua guida («If you can't find the Secret
 * Address, ask your admin»), e nessun errore arriva mai a Myynd, perché la
 * persona non ha niente da incollare. Il posto dove se ne accorge è qui, a
 * metà dei passi: e qui trova la richiesta da mandare.
 */
function PassoAzienda({ tema, testo, caso }: { tema: Tema; testo: string; caso: CasoAmministratore }) {
  const [aperto, setAperto] = useState(false)
  return (
    <>
      {testo}{' '}
      {!aperto && (
        <button type="button" onClick={() => setAperto(true)} style={{
          border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
          fontSize: 'inherit', textDecoration: 'underline', ...link(tema)
        }}>{t('Chiedi all’amministratore')}</button>
      )}
      {aperto && <ChiediAllAmministratore tema={tema} caso={caso} />}
    </>
  )
}

/** I passi dentro un blocco aperto: una lista corta e numerata, non un paragrafo. */
function Passi({ tema, passi, numerati = true }: {
  tema: Tema; passi: React.ReactNode[]; numerati?: boolean
}) {
  const stile: CSSProperties = { ...nota(tema), margin: 0, paddingLeft: 18 }
  const voci = passi.map((p, i) => <li key={i} style={{ marginTop: i ? 5 : 0 }}>{p}</li>)
  return numerati ? <ol style={stile}>{voci}</ol> : <ul style={stile}>{voci}</ul>
}

/**
 * Un avviso che vale adesso: inchiostro su sabbia.
 *
 * Resta aperto perché parla di questa persona in questo momento — il permesso
 * che manca, il credito che non c'è, la password della forma sbagliata — e
 * chiuderlo vorrebbe dire nasconderlo proprio a chi lo riguarda.
 */
function Avviso({ tema, children }: { tema: Tema; children: React.ReactNode }) {
  return (
    <div style={{
      marginTop: 12, padding: '10px 13px', borderRadius: 12,
      border: `1px solid ${tema === 'scuro' ? 'rgba(244,239,232,.2)' : 'rgba(var(--rame-rgb),.28)'}`,
      background: tema === 'scuro' ? 'rgba(244,239,232,.07)' : 'var(--sabbia)',
      fontSize: '12.5px', lineHeight: 1.55, overflowWrap: 'anywhere',
      color: tema === 'scuro' ? CHIARO : 'var(--inchiostro)'
    }}>{children}</div>
  )
}

/**
 * `t()` anche qui, e non è un dettaglio.
 *
 * Il dizionario ha una sezione intera intitolata «quello che può dire il
 * server» — una ventina di errori con la loro traduzione inglese, scritti uno
 * per uno. Poi ogni posto che un errore lo mostra davvero rendeva la stringa
 * grezza. Le traduzioni c'erano ed erano giuste; non le leggeva nessuno. Con
 * l'interfaccia in inglese, sbagliare la password rispondeva in italiano.
 *
 * Una chiave che non è nel dizionario torna sé stessa, quindi passare di qui
 * non può peggiorare niente: al massimo non traduce, come prima.
 */
function Errore({ testo, prima }: { testo: string; prima?: string }) {
  if (!testo) return null
  return <div style={{ fontSize: '12.5px', color: '#D4674A', marginTop: 12, lineHeight: 1.5, overflowWrap: 'anywhere' }}>{prima ? `${prima} · ` : ''}{t(testo)}</div>
}

/**
 * «Provo…» si legge solo mentre si prova davvero.
 *
 * Prima `occupato` faceva due cose — spegnere il bottone e cambiargli il
 * nome — e i moduli lo passavano anche per «il campo è ancora vuoto»: un
 * bottone che diceva «Provo…» su una casella vuota, prima di aver premuto
 * niente. Adesso «non ancora» e «sto lavorando» sono due cose diverse.
 */
function Conferma({ onClick, occupato, disabilitato = false, tema, children }: {
  onClick: () => void; occupato: boolean; disabilitato?: boolean; tema: Tema; children: React.ReactNode
}) {
  const scuro = tema === 'scuro'
  const spento = occupato || disabilitato
  return (
    <button onClick={onClick} disabled={spento} style={{
      marginTop: 18, padding: '11px 22px', borderRadius: 99, border: 'none',
      background: spento
        ? (scuro ? 'rgba(244,239,232,.2)' : 'rgba(var(--inchiostro-rgb),.18)')
        : (scuro ? CHIARO : 'linear-gradient(120deg,var(--rame-profondo),var(--ambra))'),
      color: spento ? (scuro ? 'rgba(244,239,232,.6)' : 'rgba(var(--inchiostro-rgb),.5)') : (scuro ? '#191715' : 'var(--avorio)'),
      fontSize: '13.5px', fontWeight: 500, fontFamily: 'inherit',
      cursor: spento ? 'default' : 'pointer'
    }}>{occupato ? t('Provo…') : children}</button>
  )
}

type Props = { tema: Tema; ok: () => void }

/** Una pastiglia di stato accanto al titolo di una strada: «in uso», «pronto», «da collegare». */
function pastigliaStato(tema: Tema, pronto: boolean): CSSProperties {
  const scuro = tema === 'scuro'
  return {
    display: 'inline-flex', alignItems: 'center', minHeight: 18, padding: '1px 7px', borderRadius: 99,
    fontSize: '9.5px', fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase',
    background: pronto ? (scuro ? 'rgba(var(--salvia-rgb),.25)' : 'rgba(var(--salvia-rgb),.14)') : (scuro ? 'rgba(var(--rame-rgb),.22)' : 'rgba(var(--rame-rgb),.09)'),
    color: pronto ? (scuro ? '#B9CDAA' : 'var(--salvia)') : (scuro ? '#E8A87C' : 'var(--rame-testo)')
  }
}

/** Il colore di un collegamento dentro una nota. */
function link(tema: Tema): CSSProperties {
  return { color: tema === 'scuro' ? '#E8A87C' : 'var(--rame-testo)' }
}

/**
 * Una strada dentro una scheda: il titolo, lo stato accanto, e sotto quello che serve.
 *
 * Anthropic e OpenAI hanno due strade ciascuna — l'account e la chiave — e
 * questa è la riga che le separa. Lo stato sta accanto al titolo, non in fondo:
 * è la prima cosa che si cerca aprendo la scheda.
 */
function Strada({ tema, titolo, stato, children }: {
  tema: Tema; titolo: string; stato?: { testo: string; pronto: boolean } | null; children: React.ReactNode
}) {
  return (
    <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${tema === 'scuro' ? 'rgba(244,239,232,.14)' : 'rgba(var(--inchiostro-rgb),.1)'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        <div style={{ ...guida(tema), fontWeight: 500 }}>{titolo}</div>
        {stato && <span style={pastigliaStato(tema, stato.pronto)}>{stato.testo}</span>}
      </div>
      {children}
    </div>
  )
}

/** Lo stato di una strada, detto in una parola. */
function statoStrada(collegata: boolean, inUso: boolean, mancante?: string): { testo: string; pronto: boolean } {
  if (mancante) return { testo: mancante, pronto: false }
  if (!collegata) return { testo: t('Da collegare'), pronto: false }
  return inUso ? { testo: t('In uso'), pronto: true } : { testo: t('Pronto'), pronto: true }
}

/**
 * Anthropic: Claude in due modi, nella stessa scheda.
 *
 * Con il tuo account, attraverso Claude Code su questo computer — è lui a
 * fare l'accesso nel browser e a tenere le credenziali, Myynd non le vede —
 * o con una chiave API a consumo. Si possono collegare tutt'e due, e la
 * scheda dice quale sta lavorando; l'altra si sceglie con un clic.
 *
 * Prima l'account era una nota a piè di pagina e ChatGPT stava in una fascia
 * sopra la griglia delle fonti: due fornitori uguali disegnati in due modi.
 * Adesso Anthropic e OpenAI sono due schede uguali, con le stesse due strade.
 */
export function FormClaude({ tema, ok }: Props) {
  const verifiche = useRef(0)
  const [s, setS] = useState<ClaudeCon | null>(null)
  const guarda = useCallback(() => { api.claude().then(setS).catch(() => {}) }, [])
  useEffect(() => { guarda() }, [guarda])
  // le due strade si cambiano anche da fuori (le preferenze, l'altra strada): si rileggono
  useEffect(() => suCollegamento(guarda), [guarda])
  // A cold native credential check can time out without losing the account.
  useEffect(() => {
    if (!s?.abbonamento.verificaInSospeso) { verifiche.current = 0; return }
    if (verifiche.current >= 3) return
    verifiche.current++
    const timer = setTimeout(guarda, 5_000)
    return () => clearTimeout(timer)
  }, [s, guarda])
  return (
    <div>
      <div style={guida(tema)}>{t('Claude, con il tuo account o con una chiave API. Puoi collegare tutt’e due e scegliere quale lavora.')}</div>
      <ConAccountClaude tema={tema} s={s} ok={ok} ricarica={guarda} />
      {s?.abbonamento.verificaInSospeso && <button type="button" onClick={() => { verifiche.current = 0; guarda() }} style={azione(tema)}>{t('Riprova')}</button>}
      <ConChiaveClaude tema={tema} s={s} ok={ok} ricarica={guarda} />
    </div>
  )
}

/**
 * L'account Claude, con Claude Code che fa l'accesso.
 *
 * «Accedi con Claude» lancia `claude auth login`: si apre il browser sulla
 * pagina di Anthropic, e quando si torna la strada è pronta e scelta. Se il
 * browser non si apre, la via di sempre — il Terminale — è scritta sotto.
 * Solo in casa: ospitati non c'è nessun Claude Code, e la strada non si mostra.
 */
function ConAccountClaude({ tema, s, ok, ricarica }: Props & { s: ClaudeCon | null; ricarica: () => void }) {
  const [attesa, setAttesa] = useState<{ id: string; scade: number } | null>(null)
  const [occupato, setOccupato] = useState(false)
  const [err, setErr] = useState('')
  const [avviso, setAvviso] = useState('')
  const vivo = useRef(true)
  const loginId = useRef<string | null>(null)
  useEffect(() => {
    vivo.current = true
    return () => {
      vivo.current = false
      if (loginId.current) { void api.annullaAccessoClaude(loginId.current).catch(() => {}); loginId.current = null }
    }
  }, [])

  useEffect(() => {
    if (!attesa) return
    return controllaAccessoChatGPT({
      leggi: signal => api.statoAccessoClaude(attesa.id, signal),
      entrato: () => { loginId.current = null; setAttesa(null); setErr(''); ricarica(); ok() },
      terminato: esito => {
        loginId.current = null; setAttesa(null)
        if (esito.stato === 'failed') setErr(esito.errore || 'L’accesso a Claude non è riuscito. Riprova.')
        else setAvviso(t('Accesso annullato.'))
      },
      errore: e => setErr(e instanceof Error ? e.message : String(e)),
      scaduto: () => {
        const id = loginId.current
        loginId.current = null; setAttesa(null)
        if (id) void api.annullaAccessoClaude(id).catch(() => {})
        setAvviso(t('Il tempo per l’accesso è terminato. Riprova.'))
      }
    }, { durata: attesa.scade - Date.now() })
  }, [attesa])

  const accedi = async () => {
    setOccupato(true); setErr(''); setAvviso('')
    try {
      const r = await api.accediClaude()
      if (!vivo.current) { void api.annullaAccessoClaude(r.loginId).catch(() => {}); return }
      loginId.current = r.loginId
      setAttesa({ id: r.loginId, scade: Date.now() + 180_000 })
    } catch (e) { if (vivo.current) setErr(e instanceof Error ? e.message : String(e)) }
    finally { if (vivo.current) setOccupato(false) }
  }
  const annulla = async () => {
    const id = loginId.current
    loginId.current = null; setAttesa(null)
    if (id) { try { await api.annullaAccessoClaude(id) } catch { /* era già finito */ } }
    if (vivo.current) setAvviso(t('Accesso annullato.'))
  }
  const usa = async () => {
    setOccupato(true); setErr('')
    try { await api.claudeCon('abbonamento'); ricarica(); ok() }
    catch (e) { if (vivo.current) setErr(e instanceof Error ? e.message : String(e)) }
    finally { if (vivo.current) setOccupato(false) }
  }

  // ospitati l'account non esiste: la strada non si disegna
  if (s && !s.abbonamentoPossibile) return null
  const a = s?.abbonamento
  const inUso = !!a?.entrato && s?.con === 'abbonamento'
  const stato = !s ? null : a?.verificaInSospeso ? { testo: t('Verifica della connessione in corso…'), pronto: false } : statoStrada(!!a?.entrato, inUso, a?.installato ? undefined : t('Serve Claude Code'))

  return (
    <Strada tema={tema} titolo={t('Con il tuo account Claude')} stato={stato}>
      <div style={{ ...nota(tema), marginTop: 6 }}>{t('Passa da Claude Code su questo computer: è lui a fare l’accesso e a tenere le credenziali. Non costa niente oltre al tuo piano.')}</div>
      {s && !a?.installato && (
        <div style={{ ...nota(tema), marginTop: 8 }}>
          {t('Claude Code non è su questo computer.')}{' '}
          <a href="https://claude.com/claude-code" target="_blank" rel="noreferrer" style={link(tema)}>{t('Come si installa')}</a>
        </div>
      )}
      {attesa && <div role="status" style={{ ...nota(tema), marginTop: 8 }}>{t('Completa l’accesso nel browser e torna qui. Se il browser non si è aperto: Terminale, scrivi «claude», fai l’accesso.')}</div>}
      {avviso && <div role="status" style={{ ...nota(tema), marginTop: 8 }}>{avviso}</div>}
      <Errore testo={err} />
      {a?.installato && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {!attesa && !a.verificaInSospeso && <button type="button" onClick={accedi} disabled={occupato} style={azione(tema)}>{a.entrato ? t('Accedi con un altro account') : t('Accedi con Claude')}</button>}
          {a.entrato && !inUso && !attesa && <button type="button" onClick={usa} disabled={occupato} style={azione(tema)}>{t('Usa il mio account')}</button>}
          {attesa && <button type="button" onClick={annulla} style={azione(tema)}>{t('Annulla')}</button>}
        </div>
      )}
    </Strada>
  )
}

/** Claude con la chiave API, a consumo. */
function ConChiaveClaude({ tema, s, ok, ricarica }: Props & { s: ClaudeCon | null; ricarica: () => void }) {
  const [apiKey, setApiKey] = useState('')
  const [err, setErr] = useState('')
  // la chiave è buona ma il conto non ha credito: si salva, e prima di andare
  // avanti lo si dice — altrimenti la prima risposta che non arriva sembra un guasto
  const [avviso, setAvviso] = useState('')
  // la frase con cui Anthropic ha detto di no, testuale: è l'unica che dice
  // *cosa* è successo, e riassumerla è esattamente l'errore che ha fermato una
  // cliente due volte sulla stessa schermata
  const [dettaglio, setDettaglio] = useState('')
  const [occupato, setOccupato] = useState(false)
  const [nellAmbiente, setNellAmbiente] = useState(false)
  const chiaveSalvata = !!s?.chiave.collegata
  const inUso = chiaveSalvata && s?.con === 'chiave'

  // se la chiave è già nell'ambiente non c'è motivo di farla incollare di nuovo
  useEffect(() => {
    api.chiaveNellAmbiente().then(r => setNellAmbiente(r.presente)).catch(() => {})
  }, [])

  const usaAmbiente = async () => {
    setOccupato(true); setErr('')
    try {
      const r = await api.usaChiaveAmbiente()
      ricarica()
      if (r.avviso) { setAvviso(r.avviso); setDettaglio(r.dettaglio ?? '') } else ok()
    }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setOccupato(false)
  }

  const collega = async () => {
    setOccupato(true); setErr('')
    try {
      const r = await api.collegaClaude(apiKey)
      setApiKey('')
      // una chiave appena collegata è quella che lavora: chi la incolla lo fa per quello
      if (s?.con === 'abbonamento') await api.claudeCon('chiave').catch(() => {})
      ricarica()
      if (r.avviso) { setAvviso(r.avviso); setDettaglio(r.dettaglio ?? '') } else ok()
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setOccupato(false)
  }

  const usa = async () => {
    setOccupato(true); setErr('')
    try { await api.claudeCon('chiave'); ricarica(); ok() }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setOccupato(false)
  }

  /*
   * La chiave è salvata, ma c'è qualcosa da sapere.
   *
   * Il bottone dice «Avanti» e non «Riprova»: da qui non si torna indietro e
   * non si è sbagliato niente. Il credito si aggiunge su un altro sito, il
   * modello si cambia in un'altra schermata, e in tutti e due i casi il posto
   * giusto in cui trovarsi *adesso* è il passo successivo. Fermare qui chi ha
   * appena incollato una chiave che funziona è il difetto che stiamo correggendo.
   */
  if (avviso) {
    return (
      <Strada tema={tema} titolo={t('Con una chiave API')} stato={statoStrada(true, true)}>
        <div style={{ ...guida(tema), marginTop: 8 }}>{t('La chiave è salvata, ma c’è una cosa da sapere.')}</div>
        <Avviso tema={tema}>{t(avviso)}</Avviso>
        <Conferma onClick={ok} occupato={false} tema={tema}>{t('Avanti')}</Conferma>
        {dettaglio && (
          <Aiuto tema={tema} titolo={t('Cosa ha risposto Anthropic')}>
            <div style={{ ...nota(tema), maxHeight: 96, overflowY: 'auto' }}>{dettaglio}</div>
          </Aiuto>
        )}
      </Strada>
    )
  }

  return (
    <Strada tema={tema} titolo={t('Con una chiave API')} stato={s ? statoStrada(chiaveSalvata, inUso) : null}>
      <div style={{ ...nota(tema), marginTop: 6 }}>{t('A consumo, sul credito Anthropic. È il modello su cui Myynd è stato messo a punto.')}</div>
      {/* la chiave che c'è già nell'ambiente: un avviso che vale adesso, e il
          suo bottone piccolo — il primario resta uno, ed è quello sotto */}
      {nellAmbiente && !chiaveSalvata && (
        <Avviso tema={tema}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>{t('Ne ho trovata una in ANTHROPIC_API_KEY.')}</div>
            <button type="button" onClick={usaAmbiente} disabled={occupato} style={azione(tema)}>{t('Usa quella')}</button>
          </div>
        </Avviso>
      )}
      <Campo tema={tema} nome={t('Chiave API')}>
        <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
          placeholder={chiaveSalvata ? t('Lascia vuoto per mantenere la chiave salvata') : 'sk-ant-…'} autoComplete="new-password" className={classeCampo(tema)} style={campo(tema)}
          onKeyDown={e => { if (e.key === 'Enter' && apiKey) collega() }} />
      </Campo>
      <Errore testo={err} />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Conferma onClick={collega} occupato={occupato} disabilitato={!apiKey.trim()} tema={tema}>{chiaveSalvata ? t('Cambia chiave') : t('Collega con la chiave')}</Conferma>
        {chiaveSalvata && !inUso && <button type="button" onClick={usa} disabled={occupato} style={{ ...azione(tema), marginTop: 18 }}>{t('Usa la chiave')}</button>}
      </div>
      <Aiuto tema={tema} titolo={t('Dove trovo la chiave?')}>
        <Passi tema={tema} passi={[
          t('Su console.anthropic.com apri «API keys» e creane una.'),
          t('In «Billing» metti del credito sul conto.'),
          t('Incolla qui la chiave: comincia per sk-ant-.')
        ]} />
      </Aiuto>
    </Strada>
  )
}

/**
 * OpenAI: ChatGPT in due modi, nella stessa scheda.
 *
 * Con l'account ChatGPT — l'accesso si fa nel browser, e i limiti sono quelli
 * del piano che uno paga già — o con una chiave API OpenAI a consumo. La
 * stessa forma della scheda di Anthropic: due strade, uno stato per ciascuna,
 * e la scelta di quale lavora.
 */
export function FormOpenAI({ tema, ok }: Props) {
  const [s, setS] = useState<Stato | null>(null)
  const [chatgpt, setChatgpt] = useState<ChatGPT | null>(null)
  const [erroreChatgpt, setErroreChatgpt] = useState('')
  const guarda = useCallback(() => {
    api.stato().then(setS).catch(() => {})
    api.chatgpt().then(c => { setChatgpt(c); setErroreChatgpt('') })
      .catch(e => setErroreChatgpt(e instanceof Error ? e.message : 'Non riesco a verificare l’accesso a ChatGPT.'))
  }, [])
  useEffect(() => { guarda() }, [guarda])
  useEffect(() => suCollegamento(guarda), [guarda])
  const accountInUso = s?.config.motore === 'chatgpt' && !!s.config.chatgpt?.attivo && !!chatgpt?.acceso
  return (
    <div>
      <div style={guida(tema)}>{t('ChatGPT, con il tuo account o con una chiave API OpenAI. Puoi collegare tutt’e due e scegliere quale lavora.')}</div>
      <ConAccountChatGPT tema={tema} chatgpt={chatgpt} errore={erroreChatgpt} inUso={accountInUso} ok={ok} ricarica={guarda} />
      <ConChiaveOpenAI tema={tema} s={s} ok={ok} ricarica={guarda} />
    </div>
  )
}

/**
 * L'account ChatGPT, dal browser.
 *
 * Trovare l'account è una lettura; entrare è un gesto esplicito nel browser;
 * e appena si è dentro l'account è la strada scelta — ci si è collegati per
 * quello. Il ponte tiene le credenziali, Myynd non le vede. Chi vuole tornare
 * alla chiave lo sceglie sotto, con un clic.
 */
function ConAccountChatGPT({ tema, chatgpt, errore, inUso, ok, ricarica }: Props & {
  chatgpt: ChatGPT | null; errore: string; inUso: boolean; ricarica: () => void
}) {
  const [occupato, setOccupato] = useState(false)
  const [err, setErr] = useState('')
  const [avviso, setAvviso] = useState('')
  const [attesa, setAttesa] = useState<{ id: string; scade: number } | null>(null)
  const vivo = useRef(true)
  const login = useRef<AbortController | null>(null)
  const loginId = useRef<string | null>(null)
  useEffect(() => {
    vivo.current = true
    return () => {
      vivo.current = false; login.current?.abort()
      if (loginId.current) { void api.annullaAccessoChatGPT(loginId.current).catch(() => {}); loginId.current = null }
    }
  }, [])

  const usa = async (attivo: boolean) => {
    setOccupato(true); setErr(''); setAvviso('')
    try { await api.usaChatGPT(attivo); ricarica(); ok() }
    catch (e) { if (vivo.current) setErr(e instanceof Error ? e.message : 'Non sono riuscito a cambiare motore.') }
    finally { if (vivo.current) setOccupato(false) }
  }

  useEffect(() => {
    if (!attesa) return
    return controllaAccessoChatGPT({
      leggi: signal => api.statoAccessoChatGPT(attesa.id, signal),
      // dentro: l'account diventa la strada scelta, senza un secondo clic
      entrato: () => { loginId.current = null; setAttesa(null); setErr(''); void usa(true) },
      terminato: esito => {
        loginId.current = null; setAttesa(null)
        if (esito.stato === 'failed') setErr(esito.errore || 'L’accesso a ChatGPT non è riuscito. Riprova.')
        else setAvviso(t('Accesso annullato.'))
      },
      errore: e => setErr(e instanceof Error ? e.message : 'Non riesco a verificare l’accesso a ChatGPT.'),
      scaduto: () => {
        const id = loginId.current
        loginId.current = null; setAttesa(null)
        if (id) void api.annullaAccessoChatGPT(id).catch(() => {})
        setAvviso(t('Il tempo per l’accesso è terminato. Riprova.'))
      }
    }, { durata: attesa.scade - Date.now() })
  }, [attesa])

  const accedi = async () => {
    const apertura = preparaApertura()
    const controller = new AbortController(); login.current = controller
    setOccupato(true); setErr(''); setAvviso(''); setAttesa(null)
    try {
      const { authUrl, loginId: id } = await api.accediChatGPT(controller.signal)
      if (!vivo.current || controller.signal.aborted) { void api.annullaAccessoChatGPT(id).catch(() => {}); return }
      loginId.current = id
      const r = await apertura.completa({ ok: true, dove: 'pagina', url: authUrl })
      if (!r.ok) throw new Error(r.errore)
      if (vivo.current) setAttesa({ id, scade: Date.now() + 120_000 })
    } catch (e) {
      if (loginId.current) { void api.annullaAccessoChatGPT(loginId.current).catch(() => {}); loginId.current = null }
      if (vivo.current && !controller.signal.aborted) setErr(e instanceof Error ? e.message : 'Non sono riuscito ad aprire l’accesso a ChatGPT.')
    } finally { apertura.annulla(); if (vivo.current) setOccupato(false) }
  }
  const annulla = async () => {
    const id = loginId.current
    loginId.current = null; setAttesa(null); setOccupato(true); setErr('')
    try {
      const esito = id ? await api.annullaAccessoChatGPT(id) : null
      if (esito?.stato === 'completed') { await usa(true); return }
      ricarica()
      if (vivo.current) setAvviso(t('Accesso annullato.'))
    } catch (e) { if (vivo.current) setErr(e instanceof Error ? e.message : String(e)) }
    finally { if (vivo.current) setOccupato(false) }
  }

  const piano = nomePianoChatGPT(chatgpt?.piano)
  const manca = chatgpt && !chatgpt.installato ? t('Non disponibile') : undefined
  const stato = !chatgpt ? (errore ? statoStrada(false, false, t('Da verificare')) : null) : statoStrada(chatgpt.entrato, inUso, manca)

  return (
    <Strada tema={tema} titolo={t('Con il tuo account ChatGPT')} stato={stato}>
      <div style={{ ...nota(tema), marginTop: 6 }}>{t('Entri dal browser e usi i limiti del tuo piano. Non serve una chiave, e non si passa mai a una chiave a pagamento da soli.')}</div>
      {chatgpt?.entrato && <div style={{ ...nota(tema), marginTop: 8 }}>{[chatgpt.email || t('Account ChatGPT collegato'), piano].filter(Boolean).join(' · ')}</div>}
      {manca && <div style={{ ...nota(tema), marginTop: 8 }}>{t('La connessione ChatGPT non è disponibile in questa installazione. Aggiorna Myynd e riprova.')}</div>}
      {attesa && <div role="status" style={{ ...nota(tema), marginTop: 8 }}>{t('Completa l’accesso nel browser e torna qui.')}</div>}
      {avviso && <div role="status" style={{ ...nota(tema), marginTop: 8 }}>{avviso}</div>}
      <Errore testo={err || (chatgpt?.errore ?? '') || errore} />
      {chatgpt?.installato && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {!attesa && <button type="button" onClick={accedi} disabled={occupato} style={azione(tema)}>{chatgpt.entrato ? t('Accedi con un altro account') : t('Accedi con ChatGPT')}</button>}
          {chatgpt.entrato && !inUso && !attesa && <button type="button" onClick={() => usa(true)} disabled={occupato} style={azione(tema)}>{t('Usa il mio account')}</button>}
          {attesa && <button type="button" onClick={annulla} disabled={occupato} style={azione(tema)}>{t('Annulla')}</button>}
        </div>
      )}
    </Strada>
  )
}

/** OpenAI con la chiave API, a consumo: la chiave, e il modello. */
function ConChiaveOpenAI({ tema, s, ok, ricarica }: Props & { s: Stato | null; ricarica: () => void }) {
  const [chiave, setChiave] = useState('')
  const [modello, setModello] = useState('')
  const [modelli, setModelli] = useState<string[]>([])
  const [err, setErr] = useState('')
  const [occupato, setOccupato] = useState(false)
  const o = s?.config.openai ?? null
  const collegata = !!o?.collegato
  const inUso = collegata && s?.config.motore === 'openai'

  // se è già collegata si parte da com'è: cambiare la chiave non deve voler dire riscrivere il modello
  useEffect(() => { if (o?.modello) setModello(m => m || o.modello) }, [o?.modello])

  // i modelli di OpenAI, con un po' di calma: non a ogni tasto. Senza una
  // chiave — nuova o salvata — non c'è niente da chiedere
  useEffect(() => {
    if (!chiave.trim() && !o?.chiaveSalvata) { setModelli([]); return }
    let ancora = true
    const sveglia = setTimeout(() => {
      api.modelliOpenAI(chiave.trim()).then(r => { if (ancora) setModelli(r.modelli) }).catch(() => { if (ancora) setModelli([]) })
    }, 600)
    return () => { ancora = false; clearTimeout(sveglia) }
  }, [chiave, o?.chiaveSalvata])

  const collega = async () => {
    setOccupato(true); setErr('')
    try {
      await api.collegaOpenAI({ modello: modello.trim(), ...(chiave.trim() ? { chiave: chiave.trim() } : {}) })
      setChiave(''); ricarica(); ok()
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setOccupato(false)
  }
  const usa = async () => {
    setOccupato(true); setErr('')
    try { await api.scegliMotore('openai'); ricarica(); ok() }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setOccupato(false)
  }
  const pronto = !!modello.trim() && (!!chiave.trim() || !!o?.chiaveSalvata)

  return (
    <Strada tema={tema} titolo={t('Con una chiave API')} stato={s ? statoStrada(collegata, inUso) : null}>
      <div style={{ ...nota(tema), marginTop: 6 }}>{t('A consumo, sul credito OpenAI. Il modello lo scegli tu.')}</div>
      <Campo tema={tema} nome={t('Chiave API')}>
        <input type="password" value={chiave} onChange={e => setChiave(e.target.value)}
          placeholder={o?.chiaveSalvata ? t('Lascia vuoto per mantenere la chiave salvata') : 'sk-…'} autoComplete="new-password" className={classeCampo(tema)} style={campo(tema)} />
      </Campo>
      <Campo tema={tema} nome={t('Modello')}>
        <input list="modelli-openai" value={modello} onChange={e => setModello(e.target.value)}
          placeholder="gpt-5.4 · gpt-5.4-mini" autoComplete="off" className={classeCampo(tema)} style={campo(tema)}
          onKeyDown={e => { if (e.key === 'Enter' && pronto) collega() }} />
        <datalist id="modelli-openai">
          {modelli.map(m => <option key={m} value={m} />)}
        </datalist>
      </Campo>
      <Errore testo={err} />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Conferma onClick={collega} occupato={occupato} disabilitato={!pronto} tema={tema}>{collegata ? t('Cambia chiave o modello') : t('Collega con la chiave')}</Conferma>
        {collegata && !inUso && <button type="button" onClick={usa} disabled={occupato} style={{ ...azione(tema), marginTop: 18 }}>{t('Usa la chiave')}</button>}
      </div>
      <Aiuto tema={tema} titolo={t('Dove trovo la chiave?')}>
        <Passi tema={tema} passi={[
          t('Su platform.openai.com apri «API keys» e creane una.'),
          t('In «Billing» metti del credito sul conto.'),
          t('Incolla qui la chiave: comincia per sk-.')
        ]} />
      </Aiuto>
    </Strada>
  )
}

/**
 * Gli indirizzi dei fornitori che conosciamo: un bottone riempie il campo.
 *
 * Gli ultimi tre sono in casa — Ollama, LM Studio e llama.cpp sulla loro
 * porta di serie — ed è la ragione per cui questo modulo esiste anche per chi
 * non vuole pagare nessuno: lo stesso campo, un indirizzo diverso. Myynd non
 * installa nessun modello: se ce n'è uno acceso qui, si collega da qui.
 */
const FORNITORI = [
  { nome: 'OpenAI', url: 'https://api.openai.com/v1' },
  { nome: 'OpenRouter', url: 'https://openrouter.ai/api/v1' },
  { nome: 'Groq', url: 'https://api.groq.com/openai/v1' },
  { nome: 'Mistral', url: 'https://api.mistral.ai/v1' },
  { nome: 'Ollama', url: 'http://127.0.0.1:11434/v1' },
  { nome: 'LM Studio', url: 'http://127.0.0.1:1234/v1' },
  { nome: 'llama.cpp', url: 'http://127.0.0.1:8080/v1' }
]

/**
 * Un fornitore compatibile con OpenAI, al posto di Claude per il lavoro grosso.
 *
 * Quattro campi, e solo due obbligatori: l'indirizzo e il modello. La chiave
 * manca quando il fornitore è in casa; il nome è come lo si vuole leggere nelle
 * preferenze. L'elenco dei modelli si chiede al fornitore appena l'indirizzo
 * sembra un indirizzo — su Ollama è la lista di quello che c'è installato, che
 * è esattamente quello che uno non ricorda mai come si scrive.
 */
export function FormCompatibile({ tema, ok }: Props) {
  const [url, setUrl] = useState('')
  const [chiave, setChiave] = useState('')
  const [chiaveSalvataPer, setChiaveSalvataPer] = useState('')
  const [modello, setModello] = useState('')
  const [nome, setNome] = useState('')
  const [modelli, setModelli] = useState<string[]>([])
  const [err, setErr] = useState('')
  const [occupato, setOccupato] = useState(false)
  /**
   * Se c'è qualcuno a quell'indirizzo, detto mentre lo si scrive.
   *
   * `null` è «non lo so ancora» — l'indirizzo non è finito, o la domanda è per
   * strada — e non va disegnato: una scritta «non risponde» mentre uno sta
   * ancora battendo l'indirizzo è una bugia che compare a ogni tasto.
   */
  const [vivo, setVivo] = useState<boolean | null>(null)
  /** Quanto ci ha messo a dire la prima parola, misurato collegandolo davvero. */
  const [primaParola, setPrimaParola] = useState<number | null>(null)

  // se è già collegato si parte da com'è: cambiare un campo non deve voler
  // dire riscriverli tutti e quattro
  useEffect(() => {
    api.stato().then(s => {
      const f = s.config.compatibile
      if (f) { setUrl(f.url); setModello(f.modello); setNome(f.nome ?? ''); if (f.chiaveSalvata) setChiaveSalvataPer(f.url.replace(/\/+$/, '')) }
    }).catch(() => {})
  }, [])

  // i modelli del fornitore, con un po' di calma: non a ogni tasto
  useEffect(() => {
    if (!/^https?:\/\/\S+/.test(url)) { setModelli([]); setVivo(null); return }
    let ancora = true
    setVivo(null)
    const sveglia = setTimeout(() => {
      api.modelliCompatibili(url, chiave)
        .then(r => { if (ancora) { setModelli(r.modelli); setVivo(r.modelli.length > 0) } })
        .catch(() => { if (ancora) { setModelli([]); setVivo(false) } })
    }, 600)
    return () => { ancora = false; clearTimeout(sveglia) }
  }, [url, chiave])

  const collega = async () => {
    setOccupato(true); setErr('')
    /*
     * Il cronometro sta qui, e non sul server.
     *
     * La rotta che collega prova il fornitore con una richiesta vera e aspetta
     * la prima parola: il tempo di quella chiamata *è* il tempo che ci metterà
     * a rispondere in chat, più un giro su questa macchina — cioè niente.
     * Misurarlo qui costa una riga e dice a chi collega la cosa che vorrebbe
     * sapere prima di fidarsi: quanto dovrà aspettare.
     */
    const partito = Date.now()
    try {
      await api.collegaCompatibile({
        url: url.trim(), modello: modello.trim(),
        ...(chiave.trim() ? { chiave: chiave.trim() } : {}),
        ...(nome.trim() ? { nome: nome.trim() } : {})
      })
      setPrimaParola(Date.now() - partito)
      ok()
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setOccupato(false)
  }

  const scuro = tema === 'scuro'
  const pastiglia = (attiva: boolean): CSSProperties => ({
    padding: '7px 13px', borderRadius: 99, fontFamily: 'inherit', fontSize: '12.5px', cursor: 'pointer',
    border: `1px solid ${attiva ? 'var(--rame)' : (scuro ? 'rgba(244,239,232,.22)' : 'rgba(var(--inchiostro-rgb),.18)')}`,
    background: attiva ? 'rgba(var(--rame-rgb),.1)' : (scuro ? 'rgba(244,239,232,.06)' : 'rgba(var(--luce-rgb),.6)'),
    color: attiva ? 'var(--rame-testo)' : (scuro ? CHIARO : 'var(--inchiostro)')
  })
  const pronto = !!url.trim() && !!modello.trim()

  return (
    <div>
      <div style={guida(tema)}>{t('Un altro modello al posto di Claude: tuo, o di un fornitore.')}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
        {FORNITORI.map(f => (
          <button key={f.nome} type="button" style={pastiglia(url === f.url)}
            onClick={() => { setUrl(f.url); if (!nome) setNome(f.nome) }}>{f.nome}</button>
        ))}
      </div>
      <Campo tema={tema} nome={t('Indirizzo')}>
        <input value={url} onChange={e => setUrl(e.target.value)}
          placeholder="https://api.openai.com/v1" autoComplete="off" className={classeCampo(tema)} style={campo(tema)} />
      </Campo>
      <Campo tema={tema} nome={t('Chiave API (se serve)')} sotto={t('In casa di solito non serve.')}>
        <input type="password" value={chiave} onChange={e => setChiave(e.target.value)}
          placeholder={chiaveSalvataPer && url.trim().replace(/\/+$/, '') === chiaveSalvataPer ? t('Lascia vuoto per mantenere la chiave salvata') : 'sk-…'} autoComplete="new-password" className={classeCampo(tema)} style={campo(tema)} />
      </Campo>
      {/*
        Se c'è qualcuno, detto sotto l'indirizzo mentre lo si scrive.
        È la riga che mancava: chi incolla la porta di Ollama con Ollama spento
        non aveva nessun modo di saperlo finché non premeva «Collega» e non
        leggeva un errore che parlava dell'indirizzo.
      */}
      {vivo !== null && (
        <div style={{ ...nota(tema), marginTop: 8, display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span style={{ color: vivo ? 'var(--salvia)' : 'var(--rame-testo)' }}>{vivo ? t('Risponde') : t('Non risponde')}</span>
          {vivo && modelli.length > 0 && <span>· {frasi.modelliTrovati(modelli.length)}</span>}
          {primaParola !== null && <span>· {t('Prima parola in')} <span>{(primaParola / 1000).toFixed(1)} s</span></span>}
        </div>
      )}
      <Campo tema={tema} nome={t('Modello')}>
        <input list="modelli-compatibili" value={modello} onChange={e => setModello(e.target.value)}
          placeholder="gpt-4.1 · qwen2.5:14b" autoComplete="off" className={classeCampo(tema)} style={campo(tema)}
          onKeyDown={e => { if (e.key === 'Enter' && pronto) collega() }} />
        <datalist id="modelli-compatibili">
          {modelli.map(m => <option key={m} value={m} />)}
        </datalist>
      </Campo>
      <Campo tema={tema} nome={t('Come lo chiami (facoltativo)')}>
        <input value={nome} onChange={e => setNome(e.target.value)}
          placeholder={t('il mio Ollama')} autoComplete="off" className={classeCampo(tema)} style={campo(tema)} />
      </Campo>
      <Errore testo={err} />
      <Conferma onClick={collega} occupato={occupato} disabilitato={!pronto} tema={tema}>{t('Collega il fornitore')}</Conferma>
      <Aiuto tema={tema} titolo={t('Dove trovo la chiave?')}>
        <Passi tema={tema} numerati={false} passi={[
          <>OpenAI: <Vai tema={tema} url={PAGINE.chiaviOpenAI} /></>,
          <>OpenRouter: <Vai tema={tema} url={PAGINE.chiaviOpenRouter} /></>,
          <>Groq: <Vai tema={tema} url={PAGINE.chiaviGroq} /></>,
          <>Mistral: <Vai tema={tema} url={PAGINE.chiaviMistral} /> › API Keys</>,
          t('Crea una chiave nuova e incollala qui sopra: il sito la mostra una volta sola.')
        ]} />
      </Aiuto>
      <Aiuto tema={tema} titolo={t('Come si collega un modello sul mio computer')}>
        <Passi tema={tema} passi={[
          t('Accendi Ollama, LM Studio o llama.cpp sul tuo computer.'),
          t('Qui sopra scegli il suo nome: l’indirizzo si riempie da solo.'),
          t('Scrivi il nome del modello che hai scaricato. La chiave non serve.')
        ]} />
      </Aiuto>
    </div>
  )
}

export function FormPosta({ tema, ok }: Props) {
  const [utente, setUtente] = useState('')
  const [password, setPassword] = useState('')
  const [host, setHost] = useState('')
  const [giorni, setGiorni] = useState(30)
  const [cerco, setCerco] = useState(false)
  const [trovato, setTrovato] = useState(false)
  const [aMano, setAMano] = useState(false)
  const [err, setErr] = useState('')
  const [caso, setCaso] = useState<CasoAmministratore | null>(null)
  const [avviso, setAvviso] = useState('')
  const [occupato, setOccupato] = useState(false)

  // Appena l'indirizzo è completo si cerca da soli dove sta la sua posta.
  // Prima qui c'era "imap.register.it" scritto per tutti: chi non era su
  // Register partiva da un valore sbagliato e non aveva modo di sapere quale
  // fosse il suo. Adesso lo si chiede al dominio.
  useEffect(() => {
    if (aMano || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(utente)) return
    let vivo = true
    const t = setTimeout(async () => {
      setCerco(true)
      try {
        const r = await api.scopriPosta(utente)
        if (!vivo) return
        if (r.host) { setHost(r.host); setTrovato(true) }
        else { setTrovato(false); setAMano(true) }
      } catch { if (vivo) setAMano(true) }
      if (vivo) setCerco(false)
    }, 450)
    return () => { vivo = false; clearTimeout(t) }
  }, [utente, aMano])

  const collega = async () => {
    setOccupato(true); setErr(''); setAvviso(''); setCaso(null)
    try {
      const r = await api.collegaPosta({ host, porta: 993, utente, password, giorni })
      setPassword('')
      if (r.certificatoAdattato) {
        setAvviso(frasi.certificatoAltroNome(r.certificatoAdattato))
      }
      ok()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      const c = casoDaErrore(e)
      setCaso(c)
      // se le credenziali sono giuste ma il server no, deve poterlo correggere;
      // se ha detto di no l'azienda, il server era giusto e non c'è niente da correggere
      if (!c) setAMano(true)
    }
    setOccupato(false)
  }

  const pronto = !!host && !!utente && !!password
  // Gmail, iCloud e Yahoo non accettano la password dell'account via IMAP:
  // vogliono una «password per le app». Dirlo prima che fallisca.
  const h = host.toLowerCase()
  const perLeApp = /gmail|googlemail/.test(h) ? 'google'
    : /mail\.me\.com|icloud/.test(h) ? 'apple'
    : /yahoo/.test(h) ? 'yahoo' : ''
  const consiglio = perLeApp === 'google'
    ? t('Gmail vuole una «password per le app», non quella del tuo account.')
    : perLeApp === 'apple' ? t('iCloud vuole una password specifica per le app, da appleid.apple.com.')
    : perLeApp === 'yahoo' ? t('Yahoo vuole una password per le app, dalle impostazioni di sicurezza dell’account.')
    : /office365|outlook|hotmail|live\./.test(h) ? t('Outlook non accetta più password dalle app di posta, nemmeno quelle per le app. Il collegamento con Outlook arriva presto.')
    : ''
  const dove = perLeApp === 'google' ? 'https://myaccount.google.com/apppasswords'
    : perLeApp === 'apple' ? 'https://appleid.apple.com' : ''

  /*
   * La password che *non* è una password per le app, riconosciuta mentre la scrive.
   *
   * Una password per le app è sedici lettere, sempre, su tutti e tre. Otto
   * caratteri su Gmail sono la password del suo account Google, e via IMAP non
   * funzioneranno mai: si può dire subito invece di farglielo scoprire da un
   * errore che arriva dopo dieci secondi e che assomiglia troppo al consiglio
   * scritto qui sopra. Una cliente ci si è fermata il 2 settembre 2026.
   *
   * Dice e non blocca. Un dominio Google aziendale può avere regole sue, e una
   * regola nostra che impedisce di provare sarebbe peggio del problema.
   */
  const nudo = password.replace(/[\s-]/g, '')
  const formaSbagliata = !!perLeApp && password.length > 0 && !/^[a-z]{16}$/i.test(nudo)
  return (
    <div>
      <div style={guida(tema)}>{t('La tua posta, in sola lettura: chi ti scrive e cosa dice.')}</div>

      <Campo tema={tema} nome={t('Indirizzo')} sotto={
        cerco ? t('Cerco il tuo server…')
          : trovato && !aMano ? (
            <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span>{t('Server trovato:')}{' '}<strong style={{ fontWeight: 500 }}>{host}</strong></span>
              <button onClick={() => setAMano(true)} style={{
                border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
                fontSize: '12.5px', color: tema === 'scuro' ? '#E8A87C' : 'var(--rame-testo)', textDecoration: 'underline'
              }}>{t('non è questo')}</button>
            </span>
          ) : undefined
      }>
        <input value={utente} onChange={e => { setUtente(e.target.value); setTrovato(false) }}
          placeholder={t('nome@esempio.it')} autoComplete="username" className={classeCampo(tema)} style={campo(tema)} />
      </Campo>

      <Campo tema={tema} nome={t('Password della casella')}>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
          autoComplete="current-password" className={classeCampo(tema)} style={campo(tema)}
          onKeyDown={e => { if (e.key === 'Enter' && pronto) collega() }} />
      </Campo>

      {/* un campo per riga: erano affiancati, e il secondo si leggeva per ultimo */}
      {aMano && (
        <>
          <Campo tema={tema} nome={t('Server IMAP')}>
            <input value={host} onChange={e => setHost(e.target.value)}
              placeholder={t('imap.tuodominio.it')} className={classeCampo(tema)} style={campo(tema)} />
          </Campo>
          <Campo tema={tema} nome={t('Giorni')}>
            <input type="number" value={giorni} onChange={e => setGiorni(Number(e.target.value))}
              className={classeCampo(tema)} style={{ ...campo(tema), width: 110 }} />
          </Campo>
        </>
      )}

      {consiglio && (
        <Avviso tema={tema}>
          {consiglio}
          {dove && (
            <>
              {' '}
              <a href={dove} target="_blank" rel="noreferrer" style={{
                color: tema === 'scuro' ? '#E8A87C' : 'var(--rame-testo)'
              }}>{t('Creane una')}</a>.
            </>
          )}
        </Avviso>
      )}

      {/*
        Non è un errore e non sta in rosso: è un'osservazione su quello che ha
        appena scritto, e arriva prima di premere qualsiasi cosa.
      */}
      {formaSbagliata && <Avviso tema={tema}>{frasi.nonSembraPerLeApp(nudo.length)}</Avviso>}

      <ErroreOAzienda tema={tema} testo={err} caso={caso} />
      {avviso && <Avviso tema={tema}>{avviso}</Avviso>}
      <Conferma onClick={collega} occupato={occupato} disabilitato={!pronto} tema={tema}>{t('Collega la posta')}</Conferma>
      {/*
        I passi nominano le voci che si vedono sull'altro sito, e ognuno porta
        il suo indirizzo: la pagina delle password per le app di Google ha un
        indirizzo diretto, e prima bisognava trovarla da «Sicurezza». L'ultimo
        passo è per chi quella pagina la trova vuota: su un account di lavoro
        è l'azienda che l'ha spenta, e la richiesta è già scritta.
      */}
      <Aiuto tema={tema} titolo={t('Dove trovo la password per le app?')}>
        <Passi tema={tema} passi={[
          <>{t('Gmail: apri la pagina, scrivi «Myynd» come nome dell’app e premi «Crea».')}{' '}<Vai tema={tema} url={PAGINE.passwordAppGoogle} /></>,
          <>{t('iCloud: Accesso e sicurezza › Password specifiche per le app.')}{' '}<Vai tema={tema} url={PAGINE.passwordAppApple} /></>,
          <>{t('Yahoo: Sicurezza dell’account › Crea password per app.')}{' '}<Vai tema={tema} url={PAGINE.passwordAppYahoo} /></>,
          t('Sono sedici lettere: incollale qui sopra, al posto della password.'),
          <PassoAzienda tema={tema} caso={{ servizio: 'gmail', ...(dominioAziendale(utente) ? { dominio: dominioAziendale(utente) } : {}) }}
            testo={t('La voce non c’è? Su Gmail serve la verifica in due passaggi; su un account di lavoro può averla spenta la tua azienda.')} />
        ]} />
      </Aiuto>
    </div>
  )
}

/**
 * Le estensioni che sappiamo leggere, ripetute qui.
 *
 * La stessa lista sta in `server/connettori/estrai.ts`, e non c'è modo pulito
 * di condividerla: quel file importa `pdf-parse` e `mammoth`, pacchetti Node
 * che un browser non sa cosa farsene. È un elenco di sette estensioni — il
 * doppio mantenimento costa meno del bundle che servirebbe a evitarlo.
 */
const LETTI_NEL_BROWSER = ['.pdf', '.docx', '.md', '.markdown', '.txt', '.rtf', '.csv', '.org', '.tex']

/** Fino a dove si guarda dentro una cartella scelta nel browser, prima di fermarsi. */
const MASSIMO_FILE_BROWSER = 1200

function base64Di(buf: ArrayBuffer): string {
  const byte = new Uint8Array(buf)
  let binario = ''
  // a pezzi: passare centomila caratteri in un colpo solo a
  // `String.fromCharCode` supera lo stack di qualche browser
  const pezzo = 0x8000
  for (let i = 0; i < byte.length; i += pezzo) binario += String.fromCharCode(...byte.subarray(i, i + pezzo))
  return btoa(binario)
}

/**
 * Il desktop, scelto nel browser — la scheda che si vede ospitati.
 *
 * Non chiede un percorso: un percorso scritto qui sarebbe il percorso del
 * server, che non ha le tue cartelle. Chiede al browser di aprire il
 * selettore vero del sistema — lo stesso che apre qualunque sito quando
 * carichi una foto — e da lì legge e manda i file uno a pezzi, senza che
 * nessun dato resti da qualche parte finché non lo mandi tu.
 */
function FormDesktopBrowser({ tema, ok }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [stato, setStato] = useState<'fermo' | 'carico' | 'fatto' | 'guaio'>('fermo')
  const [avanzamento, setAvanzamento] = useState({ fatti: 0, totale: 0 })
  const [fatti, setFatti] = useState<number | null>(null)
  const [err, setErr] = useState('')

  const scegli = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const lista = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!lista.length) return

    const conPercorso = (f: File) => (f as unknown as { webkitRelativePath?: string }).webkitRelativePath || f.name
    const radice = conPercorso(lista[0]).split('/')[0]

    setStato('carico'); setErr(''); setFatti(null)
    const utili: { file: File; percorso: string }[] = []
    const visti: string[] = []
    for (const f of lista) {
      const percorso = conPercorso(f)
      const punto = percorso.lastIndexOf('.')
      if (!LETTI_NEL_BROWSER.includes(punto < 0 ? '' : percorso.slice(punto).toLowerCase())) continue
      if (!f.size || f.size > 12_000_000) { visti.push(`desktop:${percorso}`); continue }
      if (utili.length < MASSIMO_FILE_BROWSER) utili.push({ file: f, percorso })
    }
    setAvanzamento({ fatti: 0, totale: utili.length })

    try {
      const PEZZO = 15
      const gruppi = Math.max(1, Math.ceil(utili.length / PEZZO))
      let documenti = 0
      for (let g = 0; g < gruppi; g++) {
        const fetta = utili.slice(g * PEZZO, g * PEZZO + PEZZO)
        const file = await Promise.all(fetta.map(async ({ file: f, percorso }) => ({
          percorso, base64: base64Di(await f.arrayBuffer()), quando: f.lastModified
        })))
        const ultimo = g === gruppi - 1
        const r = await api.caricaFileDesktop({ file, radice, completo: ultimo, visti: ultimo ? visti : [] })
        documenti += r.documenti
        setAvanzamento({ fatti: Math.min((g + 1) * PEZZO, utili.length), totale: utili.length })
      }
      setFatti(documenti)
      setStato('fatto')
      // `ok()` chiude la scheda: per un token digitato ha senso subito, qui
      // no — c'è un «N documenti sincronizzati» da lasciar leggere, o l'unica
      // conferma che ha funzionato sparisce nello stesso istante in cui appare
      setTimeout(ok, 1800)
    } catch (er) {
      setErr(er instanceof Error ? er.message : String(er))
      setStato('guaio')
    }
  }

  return (
    <div>
      <div style={guida(tema)}>{t('La cartella che scegli, letta qui: documenti, note, appunti.')}</div>
      <input ref={input} type="file" multiple
        {...({ webkitdirectory: '', directory: '' } as unknown as React.InputHTMLAttributes<HTMLInputElement>)}
        style={{ display: 'none' }} onChange={scegli} />
      <Errore testo={err} />
      <Conferma onClick={() => input.current?.click()} occupato={stato === 'carico'} tema={tema}>
        {stato === 'carico' ? t('Sto leggendo…') : t('Scegli una cartella')}
      </Conferma>
      {stato === 'carico' && avanzamento.totale > 0 && (
        <div style={{ ...nota(tema), marginTop: 10 }}>{frasi.fileLettiDiTotale(avanzamento.fatti, avanzamento.totale)}</div>
      )}
      {stato === 'fatto' && fatti !== null && (
        <div style={{ ...nota(tema), marginTop: 10 }}>{frasi.cartellaSincronizzata(fatti)}</div>
      )}
      <Aiuto tema={tema} titolo={t('Cosa legge, e cosa no')}>
        <Passi tema={tema} numerati={false} passi={[
          t('Legge PDF, Word, Markdown, testo e RTF.'),
          t('Niente esce dal tuo computer finché non scegli una cartella.'),
          t('Non succede da solo: lo rifai quando vuoi.')
        ]} />
      </Aiuto>
    </div>
  )
}

/**
 * Il computer intero, che è il modo normale di collegare questa fonte.
 *
 * Prima era il contrario: tre cartelle da spuntare e, in fondo, un
 * interruttore «Tutto il Mac» che quasi nessuno accendeva. Il risultato era
 * una persona convinta di aver collegato il suo computer e un Myynd che
 * guardava la Scrivania — non i Download, non i Documenti, non iCloud. Adesso
 * il bottone è uno e collega tutto; chi vuole restringere apre «Solo alcune
 * cartelle», che è la stessa scheda di prima, chiusa.
 */
export function FormDesktop({ tema, ok }: Props) {
  const [cartelle, setCartelle] = useState<string[]>([])
  const [manuale, setManuale] = useState('')
  const [suggeriti, setSuggeriti] = useState<string[]>([])
  const [ospitato, setOspitato] = useState<boolean | null>(null)
  /**
   * Il nome della fonte, che è il nome della macchina: «Il mio Mac» o «Il mio PC».
   *
   * Lo decide il server con `process.platform` — `nomeComputer`, in
   * `connettori/registro.ts` — e non il guscio, perché il computer che si
   * legge è quello dove gira il server, non quello dove sta la finestra.
   * Arriva già dentro `s.connettori`, senza una chiamata in più.
   */
  const [nome, setNome] = useState('')
  /**
   * L'accesso completo al disco, come lo vede il server.
   *
   * Senza, su un Mac, Scrivania, Documenti, Download e la Posta si aprono con
   * «operazione non permessa» — cioè il collegamento riesce e la lettura torna
   * quasi vuota, che è il modo peggiore di fallire. Si dice prima del bottone,
   * ma non lo blocca: il permesso si può dare anche dopo, e la lettura delle
   * sei ore lo ritrova da sola.
   */
  const [accesso, setAccesso] = useState<'si' | 'no' | 'non-mac' | null>(null)
  const [err, setErr] = useState('')
  /** Quale dei due bottoni sta lavorando: sono due azioni diverse, e «Provo…» va su una sola. */
  const [occupato, setOccupato] = useState<'tutto' | 'cartelle' | null>(null)
  /**
   * «Solo alcune cartelle» aperta o chiusa.
   *
   * Chiusa per chi collega la prima volta — è la strada di chi ha una ragione
   * per restringere, non quella normale — e aperta per chi sta *cambiando* una
   * scelta che era già quella: trovarla chiusa, con dentro le sue tre cartelle
   * spuntate e sotto un bottone che dice «collega tutto il Mac», è una scheda
   * che mente su cosa c'è adesso.
   */
  const [apriScelta, setApriScelta] = useState(false)

  // Le cartelle suggerite arrivano già scelte: erano tutte da spuntare a mano
  // prima, e sono le stesse tre volte su quattro. Toglierne una è un clic,
  // sceglierle tutte era tre.
  useEffect(() => {
    api.stato().then(s => {
      setOspitato(s.ospitato)
      setAccesso(s.accessoDisco)
      setNome(s.connettori.find(c => c.id === 'desktop')?.nome ?? '')
      /*
       * Se il computer è già collegato questa scheda è un «Cambia», e deve
       * partire da quello che c'è: le cartelle scelte, spuntate, con dentro
       * anche quelle che non sono fra i suggerimenti — una cartella di lavoro,
       * un disco di rete — o cambiare un dettaglio le farebbe sparire tutte.
       * Con tutto il Mac non c'è niente da preselezionare: la scheda è già
       * quella giusta.
       */
      const gia = s.config.desktop
      const sue = gia && !gia.tutto ? gia.cartelle : []
      setSuggeriti([...s.suggerimentiDesktop, ...sue.filter(c => !s.suggerimentiDesktop.includes(c))])
      setCartelle(c => (c.length ? c : (sue.length ? sue : s.suggerimentiDesktop)))
      if (sue.length) setApriScelta(true)
    }).catch(() => {})
  }, [])

  // Ospitati non c'è nessun percorso da chiedere: il server non ha le tue
  // cartelle, e la scheda che le chiederebbe lo direbbe a chi la guarda per
  // primo. `null` finché non si sa: un lampo della scheda sbagliata mentre
  // arriva la risposta è peggio di un attimo vuoto.
  if (ospitato === null) return null
  if (ospitato) return <FormDesktopBrowser tema={tema} ok={ok} />

  const alterna = (c: string) => setCartelle(v => (v.includes(c) ? v.filter(x => x !== c) : [...v, c]))

  /**
   * Dentro l'app le cartelle si scelgono con la finestra di sistema.
   *
   * Un percorso scritto a mano è la strada del browser, dove non c'è altro:
   * qui c'è il Finder, e chiedere di scrivere `/Users/…/Lavoro` a chi ha una
   * finestra per indicarlo sarebbe assurdo. Le cartelle scelte entrano fra le
   * pastiglie, già spuntate, senza doppioni; il campo resta per chi preferisce.
   */
  const scegli = async () => {
    const d = desktop()
    if (!d) return
    setErr('')
    try {
      // senza doppioni anche dentro la scelta stessa: due pastiglie con la
      // stessa chiave sono una lista che React non sa più tenere
      const scelte = [...new Set(await d.scegliCartelle())]
      if (!scelte.length) return
      setSuggeriti(s => [...s, ...scelte.filter(c => !s.includes(c))])
      setCartelle(c => [...c, ...scelte.filter(x => !c.includes(x))])
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }

  /**
   * `tutto` non è più un interruttore da leggere: è quale bottone si è premuto.
   *
   * Con `tutto` le cartelle non si mandano affatto — le sceglie il server, che
   * è l'unico a sapere dove sta la casa e se c'è un disco in nuvola — e la
   * rotta le ignorerebbe comunque.
   */
  const collega = async (tutto: boolean) => {
    setOccupato(tutto ? 'tutto' : 'cartelle'); setErr('')
    const tutte = manuale.trim() ? [...cartelle, manuale.trim()] : cartelle
    try { await api.collegaDesktop(tutto ? [] : tutte, tutto); ok() }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setOccupato(null)
  }

  const scuro = tema === 'scuro'
  // il nome dice la macchina, e il bottone deve dire la stessa cosa: chi sta
  // su Windows non collega «il mio Mac»
  // finché il server non ha detto il nome, decide la piattaforma del guscio
  const suMac = nome ? nome !== 'Il mio PC' : desktop()?.piattaforma !== 'win32'
  const pastiglia = (on: boolean): CSSProperties => ({
    padding: '9px 14px', borderRadius: 99, fontSize: '12.5px', cursor: 'pointer', fontFamily: 'inherit',
    border: `1px solid ${on ? 'var(--rame)' : scuro ? 'rgba(244,239,232,.22)' : 'rgba(var(--inchiostro-rgb),.2)'}`,
    background: on ? 'rgba(var(--rame-rgb),.16)' : 'none',
    color: on ? (scuro ? '#E8A87C' : 'var(--rame-testo)') : (scuro ? 'rgba(244,239,232,.82)' : 'rgba(var(--inchiostro-rgb),.78)')
  })
  return (
    <div>
      <div style={guida(tema)}>{t('Tutto il tuo computer, in sola lettura: documenti, note, download.')}</div>
      {/* il permesso mancante si dice prima del bottone, non dopo: dopo è una
          fonte collegata che resta a zero e nessuno sa perché */}
      {accesso === 'no' && <AccessoDisco tema={tema}
        testo={t('Per leggere Scrivania, Documenti, Download e la Posta serve l’Accesso completo al disco')}
        coda={t('Apri Impostazioni, aggiungi Myynd, poi torna qui.')} />}
      <Errore testo={err} />
      <Conferma onClick={() => collega(true)} occupato={occupato === 'tutto'} tema={tema}>
        {suMac ? t('Collega il mio Mac') : t('Collega il mio PC')}
      </Conferma>
      {/* La scelta a mano resta intera, ma chiusa: è la strada di chi ha una
          ragione per restringere — una cartella di lavoro sola, un disco di
          rete — non quella di chi apre la scheda per la prima volta. */}
      <details style={{ marginTop: 12 }} open={apriScelta}
        onToggle={e => setApriScelta((e.target as HTMLDetailsElement).open)}>
        <summary style={sommario(tema)}>{t('Solo alcune cartelle')}</summary>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {suggeriti.map(c => (
            // il nome e non il percorso intero, ma il percorso resta nel titolo:
            // due «Lavoro» in due posti diversi si distinguono passandoci sopra
            <button key={c} type="button" title={c} aria-pressed={cartelle.includes(c)} onClick={() => alterna(c)} style={pastiglia(cartelle.includes(c))}>{c.split('/').pop()}</button>
          ))}
          {desktop() && (
            <button type="button" onClick={scegli} style={{ ...pastiglia(false), borderStyle: 'dashed' }}>{t('Scegli le cartelle…')}</button>
          )}
        </div>
        <Campo tema={tema} nome={t('Oppure un percorso')}>
          <input value={manuale} onChange={e => setManuale(e.target.value)} placeholder={t('/Users/…/Lavoro')} className={classeCampo(tema)} style={campo(tema)} />
        </Campo>
        {/* secondario per davvero: di primario ce n'è uno solo, ed è quello sopra */}
        <button type="button" onClick={() => collega(false)} disabled={occupato !== null}
          style={{
            ...pastiglia(false), display: 'block', marginTop: 14, padding: '10px 18px',
            borderColor: 'var(--rame)', color: scuro ? '#E8A87C' : 'var(--rame-testo)',
            cursor: occupato ? 'default' : 'pointer'
          }}>
          {occupato === 'cartelle' ? t('Provo…') : t('Collega le cartelle scelte')}
        </button>
      </details>
      <Aiuto tema={tema} titolo={t('Cosa legge, e cosa no')}>
        <Passi tema={tema} numerati={false} passi={[
          t('Scrivania, Documenti, Download e iCloud Drive.'),
          t('Legge e basta: non sposta e non cancella niente.'),
          t('Immagini, video, codice e file di sistema restano fuori.')
        ]} />
      </Aiuto>
    </div>
  )
}

/**
 * Granola: un bottone, il browser, e il numero.
 *
 * Tiene la misura della scheda del calendario: una riga su cosa arriva, una
 * cosa sola da fare, una conferma che si conta. Qui la cosa da fare non è
 * incollare ma accedere a Granola, quindi non c'è un «Dove lo trovo?»: non
 * c'è niente da trovare.
 *
 * Il bottone chiede al server l'indirizzo del consenso e lo apre fuori:
 * dentro l'app nel browser di sistema, dal guscio; in un browser, nella
 * scheda aperta al clic (dopo la risposta il browser la bloccherebbe). Poi la
 * scheda segue il collegamento — l'attesa, con «Annulla»; la lettura; il
 * numero — e ogni stato ha la sua riga. Ospitati la pagina va da Granola e
 * torna da sola, come per Google.
 */
export function FormGranola({ tema, ok, collegato }: Props & { collegato?: () => void }) {
  const [err, setErr] = useState('')
  const [avviso, setAvviso] = useState('')
  const [occupato, setOccupato] = useState(false)
  const [attesa, setAttesa] = useState<{ id: string; dove: string; scade: number } | null>(null)
  const [lettura, setLettura] = useState(false)
  const [fatto, setFatto] = useState<{ note: number; trentaGiorni: boolean } | null>(null)
  const [ospitato, setOspitato] = useState(false)
  const vivo = useRef(true)
  const inCorso = useRef<string | null>(null)

  useEffect(() => {
    vivo.current = true
    api.stato().then(s => { if (vivo.current) setOspitato(!!s.ospitato) }).catch(() => {})
    return () => {
      vivo.current = false
      // chi chiude la scheda mentre aspetta il browser non lascia una porta aperta
      if (inCorso.current) { void api.annullaGranola(inCorso.current).catch(() => {}); inCorso.current = null }
    }
  }, [])

  useEffect(() => {
    if (!attesa) return
    const fermo = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let sbagli = 0
    const finisci = () => { inCorso.current = null; setAttesa(null); setLettura(false) }
    const guarda = async () => {
      try {
        const s = await api.accessoGranola(attesa.id, fermo.signal)
        if (fermo.signal.aborted) return
        sbagli = 0
        // il server ha scritto il collegamento: chi disegna le schede lo sa subito, prima del numero
        if (s.stato === 'fatto') { finisci(); collegato?.(); setFatto({ note: s.note ?? 0, trentaGiorni: !!s.trentaGiorni }); return }
        if (s.stato === 'errore') { finisci(); setErr(s.errore || 'Non sono riuscito a collegare.'); return }
        if (s.stato === 'annullato') { finisci(); setAvviso(t('Accesso annullato.')); return }
        setLettura(s.stato === 'lettura')
        // il server chiude da sé allo scadere; questo è il margine se non risponde più
        if (s.stato === 'attesa' && Date.now() > attesa.scade + 15_000) {
          void api.annullaGranola(attesa.id).catch(() => {})
          finisci(); setAvviso(t('Il tempo per l’accesso è terminato. Riprova.'))
          return
        }
      } catch (e) {
        if (fermo.signal.aborted) return
        // una risposta persa si riprova; tre di fila vogliono dire che non c'è più
        if (++sbagli >= 3) { finisci(); setErr(e instanceof Error ? e.message : String(e)); return }
      }
      timer = setTimeout(guarda, 1500)
    }
    void guarda()
    return () => { fermo.abort(); clearTimeout(timer) }
  }, [attesa])

  const collega = async () => {
    setOccupato(true); setErr(''); setAvviso('')
    const d = desktop()
    const finestra = !d && !ospitato ? window.open('', '_blank') : null
    try {
      const r = await api.avviaGranola()
      if (!r.id) { finestra?.close(); window.location.assign(r.dove); return }
      if (!vivo.current) { void api.annullaGranola(r.id).catch(() => {}); finestra?.close(); return }
      inCorso.current = r.id
      setAttesa({ id: r.id, dove: r.dove, scade: r.scade ?? Date.now() + 300_000 })
      if (d) await d.apriFuori(r.dove).catch(() => {})
      else if (finestra) { finestra.opener = null; finestra.location.href = r.dove }
    } catch (e) {
      finestra?.close()
      if (vivo.current) setErr(e instanceof Error ? e.message : String(e))
    } finally {
      if (vivo.current) setOccupato(false)
    }
  }

  const annulla = async () => {
    const id = inCorso.current
    inCorso.current = null; setAttesa(null); setLettura(false)
    if (id) { try { await api.annullaGranola(id) } catch { /* era già finito */ } }
    if (vivo.current) setAvviso(t('Accesso annullato.'))
  }

  if (fatto) {
    return (
      <div>
        <div role="status" style={guida(tema)}>{frasi.granolaLette(fatto.note)}</div>
        {fatto.trentaGiorni && <div style={{ ...nota(tema), marginTop: 6 }}>{t('Con il piano gratuito, Granola dà le riunioni degli ultimi 30 giorni.')}</div>}
        {/* nel primo avvio il bottone che va avanti è uno, ed è quello della pagina */}
        {!collegato && <Conferma onClick={ok} occupato={false} tema={tema}>{t('Avanti')}</Conferma>}
      </div>
    )
  }

  if (attesa) {
    return (
      <div>
        <div style={guida(tema)}>{t('Le note delle tue riunioni: accedi con il tuo account Granola.')}</div>
        <div role="status" style={{ ...nota(tema), marginTop: 10 }}>
          {lettura ? t('Leggo le tue riunioni…') : t('Accedi a Granola nel browser e torna qui.')}
        </div>
        {!lettura && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
            <button type="button" onClick={annulla} style={azione(tema)}>{t('Annulla')}</button>
            {/* se il browser non si è aperto, o la pagina è stata chiusa: la stessa, di nuovo */}
            <span style={nota(tema)}><Vai tema={tema} url={attesa.dove} testo={t('Riapri la pagina di Granola')} /></span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div style={guida(tema)}>{t('Le note delle tue riunioni: accedi con il tuo account Granola.')}</div>
      {avviso && <div role="status" style={{ ...nota(tema), marginTop: 8 }}>{avviso}</div>}
      <Errore testo={err} />
      <Conferma onClick={collega} occupato={occupato} tema={tema}>{t('Collega Granola')}</Conferma>
    </div>
  )
}

/**
 * Le Note di Apple: come Granola, una scheda senza un solo campo — con una
 * riga in più che compare solo quando serve.
 *
 * Il database delle Note sta in una cartella che macOS protegge, e senza
 * «Accesso completo al disco» il bottone fallisce. Quel permesso lo dà la
 * persona, a mano, nelle Impostazioni di Sistema: qui si dice la strada e,
 * dentro l'app, si offre il bottone che apre quella schermata. Myynd non la
 * apre mai da solo: lo fa chi preme.
 */
export function FormNote({ tema, ok }: Props) {
  const [err, setErr] = useState('')
  const [occupato, setOccupato] = useState(false)
  const [accesso, setAccesso] = useState<'si' | 'no' | 'non-mac' | null>(null)
  const [diagnosiNote,setDiagnosiNote]=useState<string|null>(null)

  useEffect(() => {
    let live = true
    const refresh = () => api.stato().then(s => { if (live) {
      const diagnosis=statoAccessoNote(s)
      setAccesso(diagnosis.permessoNegato?'no':s.accessoNote?.stato==='non-mac'?'non-mac':'si')
      setDiagnosiNote(diagnosis.permessoNegato?null:diagnosis.messaggio)
      if (s.accessoNote?.stato === 'leggibile') setErr('')
    } }).catch(() => {})
    void refresh()
    window.addEventListener('focus', refresh)
    return () => {live = false; window.removeEventListener('focus', refresh)}
  }, [])

  const collega = async () => {
    setOccupato(true); setErr('')
    try { await api.collegaNote(); ok() }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setOccupato(false)
  }

  return (
    <div>
      <div style={guida(tema)}>{t('Le note dell’app Note di Apple su questo Mac.')}</div>
      {accesso === 'no' && <AccessoDisco tema={tema} coda={t('Il Mac nega l’accesso a questa copia di Myynd. Se il permesso è già attivo, chiudi Myynd completamente e riapri la copia in Applicazioni.')} />}
      {diagnosiNote && <div style={nota(tema)}>{t(diagnosiNote)}</div>}
      <Errore testo={err} />
      <Conferma onClick={collega} occupato={occupato} tema={tema}>{t('Collega le Note')}</Conferma>
      <Aiuto tema={tema} titolo={t('Cosa legge, e cosa no')}>
        <Passi tema={tema} numerati={false} passi={[
          t('Legge una copia del suo archivio, in sola lettura.'),
          t('Le note protette da password restano fuori.'),
          t('Quelle nel cestino restano fuori.')
        ]} />
      </Aiuto>
    </div>
  )
}

/** L'indirizzo che apre la schermata del permesso. Lo stesso, alla lettera, che il guscio accetta. */
const PANNELLO_ACCESSO_DISCO = 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles'

/**
 * La riga del permesso mancante: inchiostro su sabbia, e dentro l'app il bottone.
 *
 * Una riga sola, aperta, perché riguarda questa persona adesso; la strada da
 * fare a mano sta nei tre passi chiusi sotto «Serve un permesso del Mac», che
 * è dove uno la va a cercare — e nel browser, dove il bottone non esiste, è
 * l'istruzione intera. Si mostra solo quando il server dice «no»: una riga sul
 * permesso a chi ce l'ha già è una riga che insegna a ignorare le righe.
 */
export function AccessoDisco({ tema, testo, coda }: {
  tema: Tema
  /**
   * La frase che dice *cosa* non si legge senza il permesso, senza punto in
   * fondo: lo mette il componente, dopo la strada. Cambia con chi la mostra —
   * le Note parlano delle note, il computer parla di Scrivania, Documenti,
   * Download e Posta — e una riga che nomina la cosa sbagliata è una riga che
   * si impara a saltare.
   */
  testo?: string
  /** Cosa fare, in una frase, quando il bottone c'è per farlo davvero. */
  coda?: string
}) {
  const d = desktop()
  const [err, setErr] = useState('')
  const apri = async () => {
    setErr('')
    try { await d?.apriFuori(PANNELLO_ACCESSO_DISCO) }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }
  return (
    <Avviso tema={tema}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {testo ?? t('Per leggere le Note serve l’accesso completo al disco')}
          {'.'}
          {/* «Apri Impostazioni» si dice solo dove quel bottone esiste: nel
              browser la strada sta nei passi qui sotto, che è dove si va a cercarla */}
          {d && coda && <>{' '}{coda}</>}
          {err && <span style={{ color: 'var(--rame-testo)' }}> {t(err)}</span>}
        </div>
        {d && <button type="button" onClick={apri} style={azione(tema)}>{t('Apri Impostazioni')}</button>}
      </div>
      <details style={{ marginTop: 8 }}>
        <summary style={sommario(tema)}>{t('Serve un permesso del Mac')}</summary>
        <div style={{ marginTop: 8 }}>
          <Passi tema={tema} passi={[
            t('Apri Impostazioni di Sistema › Privacy e sicurezza.'),
            t('Apri «Accesso completo al disco».'),
            t('Aggiungi Myynd e accendi il suo interruttore.')
          ]} />
        </div>
      </details>
    </Avviso>
  )
}

/**
 * Le conversazioni: i file esportati, e un interruttore.
 *
 * Il passaggio che costa è l'esportazione, che sta dentro le impostazioni di
 * ChatGPT e di Claude in due posti diversi: i quattro passi stanno scritti
 * qui, chiusi in «Come si esportano le chat», e chi li cerca li trova senza
 * leggerli chi non li cerca.
 * Dentro l'app i file si scelgono con la finestra di sistema; nel browser
 * resta il percorso scritto a mano, come per il desktop. L'interruttore di
 * Claude Code compare solo se la sua cartella c'è: un interruttore su una
 * cartella che non esiste è un bottone che fallisce.
 */
export function FormConversazioni({ tema, ok }: Props) {
  const [file, setFile] = useState<string[]>([])
  const [manuale, setManuale] = useState('')
  const [codice, setCodice] = useState(false)
  const [codicePossibile, setCodicePossibile] = useState(false)
  const [sessioni, setSessioni] = useState(0)
  const [err, setErr] = useState('')
  const [occupato, setOccupato] = useState(false)

  useEffect(() => {
    api.stato().then(s => {
      setCodicePossibile(s.codiceConversazioni)
      setSessioni(s.sessioniCodice)
      // parte acceso se la cartella c'è: è l'unica parte senza attrito, e
      // spegnerlo è un clic
      setCodice(s.codiceConversazioni)
    }).catch(() => {})
  }, [])

  const scegli = async () => {
    const d = desktop()
    if (!d) return
    setErr('')
    try {
      const scelti = [...new Set(await d.scegliFile(['json']))]
      if (!scelti.length) return
      setFile(f => [...f, ...scelti.filter(x => !f.includes(x))])
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }

  const collega = async () => {
    const tutti = manuale.trim() ? [...file, manuale.trim()] : file
    setOccupato(true); setErr('')
    try { await api.collegaConversazioni(tutti, codice); ok() }
    catch (e) {
      // il nome del file accanto alla frase, quando il server dice quale
      const quale = (e as { file?: string }).file
      const frase = e instanceof Error ? t(e.message) : String(e)
      setErr(quale ? `${quale.split('/').pop()} · ${frase}` : frase)
    }
    setOccupato(false)
  }

  const scuro = tema === 'scuro'
  const pronto = file.length > 0 || manuale.trim().length > 0 || codice
  const pastiglia: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 99,
    fontSize: '12.5px', fontFamily: 'inherit', border: '1px solid var(--rame)',
    background: 'rgba(var(--rame-rgb),.16)', color: scuro ? '#E8A87C' : 'var(--rame-testo)'
  }
  return (
    <div>
      <div style={guida(tema)}>{t('Le chat che hai già avuto con ChatGPT e con Claude.')}</div>

      <Campo tema={tema} nome={t('I file esportati')}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {file.map(f => (
            // il nome e non il percorso intero, ma il percorso resta nel titolo:
            // due conversations.json si distinguono passandoci sopra
            <span key={f} title={f} style={pastiglia}>
              {f.split('/').pop()}
              <button type="button" onClick={() => setFile(v => v.filter(x => x !== f))} title={t('Togli')} aria-label={t('Togli')}
                style={{ border: 'none', background: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>
            </span>
          ))}
          {desktop() && (
            <button type="button" onClick={scegli} style={{
              ...pastiglia, cursor: 'pointer', borderStyle: 'dashed', background: 'none',
              borderColor: scuro ? 'rgba(244,239,232,.22)' : 'rgba(var(--inchiostro-rgb),.2)',
              color: scuro ? 'rgba(244,239,232,.82)' : 'rgba(var(--inchiostro-rgb),.78)'
            }}>{t('Scegli i file…')}</button>
          )}
        </div>
      </Campo>
      <Campo tema={tema} nome={t('Oppure un percorso')}>
        <input value={manuale} onChange={e => setManuale(e.target.value)} placeholder={t('/Users/…/Scaricati/conversations.json')}
          className={classeCampo(tema)} style={campo(tema)}
          onKeyDown={e => { if (e.key === 'Enter' && pronto && !occupato) collega() }} />
      </Campo>

      {/* l'interruttore resta, la spiegazione no: sta chiusa qui sotto, in «Cosa legge, e cosa no» */}
      {codicePossibile && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, color: scuro ? CHIARO : 'var(--inchiostro)' }}>{t('Anche le sessioni di Claude Code su questo computer')}</div>
            {sessioni > 0 && <div style={{ ...nota(tema), marginTop: 3 }}>{frasi.sessioniTrovate(sessioni)}</div>}
          </div>
          <button type="button" role="switch" aria-checked={codice} aria-label={t('Anche le sessioni di Claude Code su questo computer')}
            onClick={() => setCodice(c => !c)} style={track(codice)}><span style={knob()} /></button>
        </div>
      )}

      <Errore testo={err} />
      <Conferma onClick={collega} occupato={occupato} disabilitato={!pronto} tema={tema}>{t('Collega le conversazioni')}</Conferma>
      <Aiuto tema={tema} titolo={t('Come si esportano le chat')}>
        <Passi tema={tema} passi={[
          t('ChatGPT: Impostazioni › Controlli dati › Esporta dati.'),
          <>{t('Claude: Impostazioni › Privacy › Esporta dati.')}{' '}<Vai tema={tema} url={PAGINE.esportaClaude} /></>,
          t('Arriva un archivio via email: dentro c’è conversations.json.'),
          t('Scegli quel file qui sopra.')
        ]} />
      </Aiuto>
      <Aiuto tema={tema} titolo={t('Cosa legge, e cosa no')}>
        <Passi tema={tema} numerati={false} passi={[
          t('Le chat di claude.ai vivono dai loro: solo l’esportazione le porta qui.'),
          t('Di Claude Code si tengono le battute, non i file aperti né i comandi lanciati.'),
          t('Le sessioni stanno in ~/.claude/projects.')
        ]} />
      </Aiuto>
    </div>
  )
}

export function FormNotion({ tema, ok }: Props) {
  const [token, setToken] = useState('')
  const [err, setErr] = useState('')
  const [occupato, setOccupato] = useState(false)

  const collega = async () => {
    setOccupato(true); setErr('')
    try { await api.collegaNotion(token); setToken(''); ok() }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setOccupato(false)
  }

  return (
    <div>
      <div style={guida(tema)}>{t('Le pagine di Notion che condividi con l’integrazione.')}</div>
      <Campo tema={tema} nome={t('Token di integrazione')}>
        <input type="password" value={token} onChange={e => setToken(e.target.value)}
          placeholder="ntn_…" autoComplete="new-password" className={classeCampo(tema)} style={campo(tema)}
          onKeyDown={e => { if (e.key === 'Enter' && token) collega() }} />
      </Campo>
      <Errore testo={err} />
      <Conferma onClick={collega} occupato={occupato} tema={tema}>{t('Collega Notion')}</Conferma>
      {/*
        Le voci sono quelle di oggi: Notion ha chiamato «connessioni interne»
        quelle che erano le integrazioni (developers.notion.com, «Internal
        connections»), e il vecchio indirizzo porta lì.
      */}
      <Aiuto tema={tema} titolo={t('Dove trovo il token?')}>
        <Passi tema={tema} passi={[
          <>{t('Apri la pagina e premi «Create a new connection»: dagli un nome e scegli lo spazio di lavoro.')}{' '}<Vai tema={tema} url={PAGINE.notion} /></>,
          t('Nella scheda «Configuration» copia l’«Installation access token»: comincia per ntn_.'),
          t('Nella scheda «Content access» premi «Edit access» e scegli le pagine da leggere.')
        ]} />
      </Aiuto>
    </div>
  )
}

/**
 * Il calendario: due campi, e i passi chiusi sotto «Dove trovo l'indirizzo?».
 *
 * È la fonte con meno attrito di tutte, e l'unica cosa che può andare storta è
 * che qualcuno copi l'indirizzo sbagliato — Google ne mostra tre, uno accanto
 * all'altro, e due non servono. Per questo i passi sono numerati e nominano la
 * voce esatta da cercare: lì dentro una riga generica costerebbe un pomeriggio.
 *
 * Dopo, si dice quanti eventi ha letto. È l'unica conferma che chi ha incollato
 * può capire da solo di aver incollato la cosa giusta.
 */
/**
 * `collegato` suona quando il server ha detto sì, prima di «Avanti».
 *
 * Il calendario è l'unica fonte che si ferma a mostrare cosa ha letto («Work:
 * 42 eventi») prima di chiamare `ok`: nel primo avvio la sua scheda restava
 * «da collegare» accanto a una frase che diceva il contrario, e il bottone
 * contava una fonte in meno. Chi disegna le schede lo sa da qui.
 */
export function FormCalendario({ tema, ok, collegato }: Props & { collegato?: () => void }) {
  const [url, setUrl] = useState('')
  const [giorni, setGiorni] = useState(30)
  const [err, setErr] = useState('')
  const [fatto, setFatto] = useState<{ nome: string; eventi: number } | null>(null)
  const [occupato, setOccupato] = useState(false)

  const collega = async () => {
    setOccupato(true); setErr('')
    try {
      const r = await api.collegaCalendario({ url: url.trim(), giorni })
      setUrl('')
      setFatto({ nome: r.nome, eventi: r.eventi })
      collegato?.()
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setOccupato(false)
  }

  if (fatto) {
    return (
      <div>
        <div style={guida(tema)}>
          {fatto.nome ? frasi.agendaLetta(fatto.nome, fatto.eventi) : frasi.eventiLetti(fatto.eventi)}
        </div>
        <Conferma onClick={ok} occupato={false} tema={tema}>{t('Avanti')}</Conferma>
      </div>
    )
  }

  return (
    <div>
      <div style={guida(tema)}>{t('La tua agenda: cosa hai fatto e cosa ti aspetta.')}</div>

      <Campo tema={tema} nome={t('Indirizzo del calendario')} sotto={t('Tienilo per te: quel link apre la tua agenda.')}>
        <input value={url} onChange={e => setUrl(e.target.value)}
          placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
          autoComplete="off" spellCheck={false} className={classeCampo(tema)} style={campo(tema)}
          onKeyDown={e => { if (e.key === 'Enter' && url.trim()) collega() }} />
      </Campo>

      <Campo tema={tema} nome={t('Quanti giorni indietro')} sotto={t('Avanti guarda sempre sei mesi.')}>
        <input type="number" min={1} max={365} value={giorni}
          onChange={e => setGiorni(Math.max(1, Math.min(365, Number(e.target.value) || 30)))}
          className={classeCampo(tema)} style={{ ...campo(tema), width: 110 }} />
      </Campo>

      <Errore testo={err} />
      <Conferma onClick={collega} occupato={occupato} disabilitato={!url.trim()} tema={tema}>{t('Collega il calendario')}</Conferma>
      <Aiuto tema={tema} titolo={t('Dove trovo l’indirizzo?')}>
        <Passi tema={tema} passi={[
          t('Su Google Calendar apri le impostazioni e clicca il nome della tua agenda.'),
          t('Scendi fino a «Integra il calendario».'),
          t('Copia l’indirizzo privato in formato iCal.'),
          t('Su Outlook e iCloud si chiama «pubblica calendario».'),
          t('Se lo giri per sbaglio, rigeneralo da lì: il vecchio smette di funzionare.'),
          // l'unico passo nuovo, e in fondo: su un account di lavoro la voce può
          // mancare del tutto, e Google stessa dice di chiedere all'amministratore
          <PassoAzienda tema={tema} caso={{ servizio: 'calendario' }}
            testo={t('La voce non c’è? Su un account di lavoro può averla spenta la tua azienda.')} />
        ]} />
      </Aiuto>
    </div>
  )
}

/**
 * Google: due campi, e poi il browser.
 *
 * I due campi sono l'unico attrito, e non si può togliere: per parlare con le
 * API di Google serve un'app registrata su Google Cloud, e a registrarla dev'essere
 * chi possiede l'account — nessuno può farlo al posto suo. Cinque minuti una
 * volta sola, e la nota qui sopra dice esattamente dove cliccare.
 *
 * Il resto è normale: si preme, si apre il browser, si dice di sì a Google, e
 * quando la finestra si chiude la casella è collegata.
 */
/**
 * Ospitati il ballo è un bottone: l'app è di chi ospita e il browser è il tuo.
 * Si va da Google e si torna da soli. In casa resta il modulo con il client ID.
 */
function ViaWeb({ tema, disponibile, avvia, nome }: {
  tema: Tema; disponibile: boolean; avvia: () => Promise<{ dove: string }>; nome: string
}) {
  const [err, setErr] = useState('')
  const [caso, setCaso] = useState<CasoAmministratore | null>(null)
  const [occupato, setOccupato] = useState(false)
  const vai = async () => {
    setOccupato(true); setErr(''); setCaso(null)
    try {
      const { dove } = await avvia()
      // dentro l'app la finestra non va da Google: ci va il browser di sistema
      const d = desktop()
      if (d) { await d.apriFuori(dove); setOccupato(false) } else window.location.assign(dove)
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setCaso(casoDaErrore(e)); setOccupato(false) }
  }
  return (
    <div>
      <div style={guida(tema)}>
        {disponibile
          ? frasi.viaWeb(nome)
          : t('Non ancora disponibile su questo server. Per la posta usa «Posta», con una password per le app.')}
      </div>
      <ErroreOAzienda tema={tema} testo={err} caso={caso} />
      {disponibile && (
        <Conferma onClick={vai} occupato={occupato} tema={tema}>
          {occupato ? t('Un momento…') : frasi.collega(nome)}
        </Conferma>
      )}
    </div>
  )
}

export function FormGoogle({ tema, ok }: Props) {
  const [id, setId] = useState('')
  const [segreto, setSegreto] = useState('')
  const [err, setErr] = useState('')
  const [caso, setCaso] = useState<CasoAmministratore | null>(null)
  const [occupato, setOccupato] = useState(false)
  const [s, setS] = useState<Stato | null>(null)
  useEffect(() => { api.stato().then(setS).catch(() => {}) }, [])

  const collega = async () => {
    setOccupato(true); setErr(''); setCaso(null)
    try { await api.collegaGoogle(id.trim(), segreto.trim()); setId(''); setSegreto(''); ok() }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); setCaso(casoDaErrore(e)) }
    setOccupato(false)
  }

  if (s?.ospitato) return <ViaWeb tema={tema} disponibile={!!s.oauth?.google} avvia={api.avviaGoogle} nome="Google" />

  return (
    <div>
      <div style={guida(tema)}>{t('La tua posta e la tua agenda Google, in sola lettura.')}</div>
      <Campo tema={tema} nome={t('ID client')}>
        <input value={id} onChange={e => setId(e.target.value)}
          placeholder="…apps.googleusercontent.com" autoComplete="off"
          className={classeCampo(tema)} style={campo(tema)} />
      </Campo>
      <Campo tema={tema} nome={t('Segreto del client')}>
        <input type="password" value={segreto} onChange={e => setSegreto(e.target.value)}
          placeholder={t('se il tuo progetto ne ha uno')} autoComplete="new-password"
          className={classeCampo(tema)} style={campo(tema)}
          onKeyDown={e => { if (e.key === 'Enter' && id) collega() }} />
      </Campo>
      <ErroreOAzienda tema={tema} testo={err} caso={caso} />
      <Conferma onClick={collega} occupato={occupato} tema={tema}>
        {occupato ? t('Ti aspetto nel browser…') : t('Collega Google')}
      </Conferma>
      <Aiuto tema={tema} titolo={t('Come si crea l’app su Google Cloud')}>
        <Passi tema={tema} passi={[
          <>{t('Su console.cloud.google.com crea un progetto.')}{' '}<Vai tema={tema} url="https://console.cloud.google.com/apis/credentials" /></>,
          t('Attiva Gmail API e Calendar API.'),
          t('Credenziali › ID client OAuth › Applicazione desktop.'),
          t('Incolla qui quello che ti dà.')
        ]} />
      </Aiuto>
    </div>
  )
}

/**
 * Slack: un campo, e i passi chiusi sotto «Dove trovo il token?».
 *
 * Il token si crea in cinque minuti su api.slack.com, e i cinque minuti sono
 * tutti nella scelta degli ambiti: sbagliarli vuol dire un token che si collega
 * e non vede niente. Per questo il passo li elenca uno per uno invece di dire
 * «dai i permessi necessari», che è il modo in cui una guida fa perdere un
 * pomeriggio.
 */
export function FormSlack({ tema, ok }: Props) {
  const [token, setToken] = useState('')
  const [err, setErr] = useState('')
  const [occupato, setOccupato] = useState(false)

  const collega = async () => {
    setOccupato(true); setErr('')
    try { await api.collegaSlack(token.trim()); setToken(''); ok() }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setOccupato(false)
  }

  return (
    <div>
      <div style={guida(tema)}>{t('I canali di Slack di cui fai già parte, in sola lettura.')}</div>
      {/* l'app si crea già compilata dal suo manifesto: nome e ambiti sono scritti */}
      <a href={appSlack()} target="_blank" rel="noreferrer"
        style={{ ...azione(tema), display: 'inline-block', marginTop: 12, textDecoration: 'none' }}>{t('Crea l’app su Slack')}</a>
      <Campo tema={tema} nome={t('Token utente')}>
        <input type="password" value={token} onChange={e => setToken(e.target.value)}
          placeholder="xoxp-…" autoComplete="new-password" className={classeCampo(tema)} style={campo(tema)}
          onKeyDown={e => { if (e.key === 'Enter' && token) collega() }} />
      </Campo>
      <Errore testo={err} />
      <Conferma onClick={collega} occupato={occupato} disabilitato={!token} tema={tema}>{t('Collega Slack')}</Conferma>
      <Aiuto tema={tema} titolo={t('Dove trovo il token?')}>
        <Passi tema={tema} passi={[
          t('Premi «Crea l’app su Slack»: si apre già compilata, con il nome e i permessi.'),
          t('Scegli il tuo spazio di lavoro, poi «Next» e «Create».'),
          t('In «OAuth & Permissions» premi «Install to Workspace» e poi «Allow». Se c’è «Request to Install», la richiesta va al tuo amministratore di Slack.'),
          t('Copia lo «User OAuth Token», che comincia per xoxp-, e incollalo qui sopra.'),
          <>{t('A mano: crea un’app e in «User Token Scopes» aggiungi')}{' '}<span style={{ overflowWrap: 'anywhere' }}>{AMBITI_SLACK.join(', ')}</span>.</>
        ]} />
      </Aiuto>
    </div>
  )
}

/**
 * GitHub: un bottone che porta alla pagina giusta già compilata, un campo, e i passi.
 *
 * La tester del 23 settembre 2026 si è fermata qui: «le istruzioni per GitHub
 * non sono chiare». Lo erano per chi sa già cos'è un token a grana fine. I
 * passi di prima dicevano «dagli la sola lettura su contenuti, issue e pull
 * request» — tre parole che sulla pagina di GitHub non ci sono, in una
 * pagina con trenta permessi da scegliere a mano.
 *
 * Adesso la pagina di GitHub si apre già compilata (`paginaTokenGithub`): nome,
 * durata e i tre permessi di lettura sono scritti. Resta una scelta sola —
 * quali repository — e i passi sotto «Dove trovo il token?» la nominano con le
 * parole esatte di GitHub, «Repository access», «All repositories», «Generate
 * token». La strada a mano c'è ancora, in fondo, per il giorno in cui GitHub
 * aprisse la pagina vuota.
 *
 * Dopo, si dice quanti repository vede il token: come per il calendario, il
 * numero è l'unica prova che chi ha incollato può controllare da solo.
 *
 * L'elenco dei repository resta secondo apposta. Chi collega GitHub quasi
 * sempre vuole «quello su cui sto lavorando», e i trenta più vivi sono già
 * quella risposta; ma chi ne segue tre su quaranta lo sa già mentre incolla il
 * token, e deve poterlo dire lì. Il riquadro accetta una riga per repository,
 * e quello che non è un `owner/nome` lo butta il server.
 */
export function FormGithub({ tema, ok }: Props) {
  const [token, setToken] = useState('')
  const [repos, setRepos] = useState('')
  const [err, setErr] = useState('')
  const [caso, setCaso] = useState<CasoAmministratore | null>(null)
  /** Il repository di cui parla l'errore, se ne parla uno. */
  const [quale, setQuale] = useState('')
  /** L'indirizzo che GitHub stesso manda per sistemare le cose: l'autorizzazione SSO. */
  const [dove, setDove] = useState('')
  const [fatto, setFatto] = useState<{ login: string; repos: number; oltre: boolean } | null>(null)
  const [occupato, setOccupato] = useState(false)

  const collega = async () => {
    setOccupato(true); setErr(''); setCaso(null); setQuale(''); setDove('')
    try {
      const r = await api.collegaGithub(token.trim(), repos.split('\n').map(r => r.trim()).filter(Boolean))
      setToken(''); setRepos('')
      setFatto({ login: r.login, repos: r.repos, oltre: r.oltre })
    }
    catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setCaso(casoDaErrore(e))
      setQuale((e as { repo?: string }).repo ?? '')
      setDove((e as { dove?: string }).dove ?? '')
    }
    setOccupato(false)
  }

  if (fatto) return <Fatto tema={tema} testo={frasi.githubCollegato(fatto.login, fatto.repos, fatto.oltre)} ok={ok} />

  return (
    <div>
      <div style={guida(tema)}>{t('Le pull request, le issue e i commit dei tuoi repository, in sola lettura.')}</div>
      {/* il link si apre fuori: dentro l'app `target=_blank` va nel browser di sistema */}
      <a href={paginaTokenGithub(lingua() === 'en')} target="_blank" rel="noreferrer"
        style={{ ...azione(tema), display: 'inline-block', marginTop: 12, textDecoration: 'none' }}>{t('Crea il token su GitHub')}</a>
      <Campo tema={tema} nome={t('Token di accesso')}>
        <input type="password" value={token} onChange={e => setToken(e.target.value)}
          placeholder="github_pat_…" autoComplete="new-password" className={classeCampo(tema)} style={campo(tema)}
          onKeyDown={e => { if (e.key === 'Enter' && token) collega() }} />
      </Campo>
      <Campo tema={tema} nome={t('Solo questi repository (uno per riga, owner/nome)')}
        sotto={t('Vuoto: legge i tuoi trenta repository più attivi.')}>
        <textarea value={repos} onChange={e => setRepos(e.target.value)} rows={3}
          autoComplete="off" spellCheck={false}
          className={classeCampo(tema)} style={{ ...campo(tema), resize: 'vertical' }} />
      </Campo>
      <ErroreOAzienda tema={tema} testo={err} caso={caso} prima={quale} />
      {err && dove && <div style={{ ...nota(tema), marginTop: 6 }}><Vai tema={tema} url={dove} testo={t('Autorizza il token su GitHub')} /></div>}
      <Conferma onClick={collega} occupato={occupato} disabilitato={!token} tema={tema}>{t('Collega GitHub')}</Conferma>
      <Aiuto tema={tema} titolo={t('Dove trovo il token?')}>
        <Passi tema={tema} passi={[
          t('Premi «Crea il token su GitHub»: la pagina si apre con nome, scadenza e permessi già scritti.'),
          t('In «Repository access» scegli «All repositories», o «Only select repositories» e quelli da leggere.'),
          t('Se i repository sono di un’organizzazione, sceglila in «Resource owner»: un suo amministratore dovrà approvare il token.'),
          t('In fondo alla pagina premi «Generate token».'),
          t('Copia il token, comincia per github_pat_, e incollalo qui sopra.'),
          <>{t('Se la pagina si apre vuota: Settings › Developer settings › Personal access tokens › Fine-grained tokens › Generate new token, e in «Permissions» dai a Contents, Issues e Pull requests l’accesso «Read-only».')}{' '}<Vai tema={tema} url={TOKEN_GITHUB_A_MANO} /></>
        ]} />
      </Aiuto>
    </div>
  )
}

/**
 * Drive: lo stesso progetto di Gmail, un consenso diverso.
 *
 * Il client id si porta dietro da solo se Gmail è già collegato — è lo stesso
 * progetto su Google Cloud, e farlo ricopiare sarebbe solo un modo di far
 * sbagliare qualcuno. Il *sì* invece si chiede di nuovo, e va chiesto: riguarda
 * i file, non la posta.
 */
export function FormDrive({ tema, ok }: Props) {
  const [id, setId] = useState('')
  const [segreto, setSegreto] = useState('')
  const [err, setErr] = useState('')
  const [caso, setCaso] = useState<CasoAmministratore | null>(null)
  const [occupato, setOccupato] = useState(false)
  const [daGmail, setDaGmail] = useState(false)
  const [s, setS] = useState<Stato | null>(null)

  useEffect(() => {
    api.stato().then(s => {
      setS(s)
      // stesso progetto su Google Cloud: se Gmail è collegato, il suo id è
      // quello che serve anche qui
      if (s.config.google?.clientId) { setId(s.config.google.clientId); setDaGmail(true) }
    }).catch(() => {})
  }, [])

  const collega = async () => {
    setOccupato(true); setErr(''); setCaso(null)
    try { await api.collegaDrive(id.trim(), segreto.trim()); setId(''); setSegreto(''); ok() }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); setCaso(casoDaErrore(e)) }
    setOccupato(false)
  }

  if (s?.ospitato) return <ViaWeb tema={tema} disponibile={!!s.oauth?.google} avvia={api.avviaDrive} nome="Google Drive" />

  return (
    <div>
      <div style={guida(tema)}>{t('I file del tuo Google Drive, in sola lettura.')}</div>
      <Campo tema={tema} nome={t('ID client')} sotto={daGmail ? t('Stesso progetto di Gmail: l’ID è già quello.') : undefined}>
        <input value={id} onChange={e => setId(e.target.value)}
          placeholder="…apps.googleusercontent.com" autoComplete="off"
          className={classeCampo(tema)} style={campo(tema)} />
      </Campo>
      <Campo tema={tema} nome={t('Segreto del client')}>
        <input type="password" value={segreto} onChange={e => setSegreto(e.target.value)}
          placeholder={t('se il tuo progetto ne ha uno')} autoComplete="new-password"
          className={classeCampo(tema)} style={campo(tema)}
          onKeyDown={e => { if (e.key === 'Enter' && id) collega() }} />
      </Campo>
      <ErroreOAzienda tema={tema} testo={err} caso={caso} />
      <Conferma onClick={collega} occupato={occupato} disabilitato={!id} tema={tema}>
        {occupato ? t('Ti aspetto nel browser…') : t('Collega Drive')}
      </Conferma>
      <Aiuto tema={tema} titolo={t('Come si crea l’app su Google Cloud')}>
        <Passi tema={tema} passi={[
          <>{t('Su console.cloud.google.com crea un progetto.')}{' '}<Vai tema={tema} url="https://console.cloud.google.com/apis/credentials" /></>,
          t('Attiva Google Drive API.'),
          t('Credenziali › ID client OAuth › Applicazione desktop.'),
          t('Il consenso si rifà: stavolta riguarda i tuoi file.')
        ]} />
      </Aiuto>
    </div>
  )
}

/**
 * Microsoft: la stessa app per due cose, e si dice quale si sta collegando.
 *
 * `parte` non è un dettaglio tecnico che sfugge: è la riga che decide cosa
 * comparirà nella schermata del consenso di Microsoft. Chi collega Outlook
 * legge «Leggere la sua posta» e nient'altro; chi collega SharePoint legge dei
 * file. Sono due frasi diverse perché sono due permessi diversi.
 */
export function FormMicrosoft({ tema, ok, parte }: Props & { parte: 'posta' | 'file' }) {
  const [id, setId] = useState('')
  const [tenant, setTenant] = useState('')
  const [err, setErr] = useState('')
  const [caso, setCaso] = useState<CasoAmministratore | null>(null)
  const [occupato, setOccupato] = useState(false)
  const [gia, setGia] = useState<string[]>([])
  const [s, setS] = useState<Stato | null>(null)

  useEffect(() => {
    api.stato().then(s => {
      setS(s)
      setGia(s.config.microsoft?.parti ?? [])
      // l'app su Entra ID è la stessa per tutte e due le metà: se una c'è già,
      // il suo id è quello giusto e farlo ricopiare a mano è solo un modo di
      // farlo sbagliare
      if (s.config.microsoft?.clientId) setId(s.config.microsoft.clientId)
      if (s.config.microsoft?.tenant) setTenant(s.config.microsoft.tenant)
    }).catch(() => {})
  }, [])

  const collega = async () => {
    setOccupato(true); setErr(''); setCaso(null)
    try { await api.collegaMicrosoft(id.trim(), tenant.trim(), parte); setId(''); ok() }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); setCaso(casoDaErrore(e)) }
    setOccupato(false)
  }

  if (s?.ospitato) {
    return <ViaWeb tema={tema} disponibile={!!s.oauth?.microsoft} nome="Microsoft"
      avvia={() => api.avviaMicrosoft(parte)} />
  }

  return (
    <div>
      <div style={guida(tema)}>
        {parte === 'posta'
          ? t('La tua posta e la tua agenda Outlook, in sola lettura.')
          : t('I file dei siti SharePoint che segui, in sola lettura.')}
      </div>
      <Campo tema={tema} nome={t('ID applicazione')}
        sotto={gia.length ? t('L’app è la stessa che hai già registrato: l’ID è quello.') : undefined}>
        <input value={id} onChange={e => setId(e.target.value)}
          placeholder="00000000-0000-0000-0000-000000000000" autoComplete="off"
          className={classeCampo(tema)} style={campo(tema)} />
      </Campo>
      <Campo tema={tema} nome={t('ID del tenant')}>
        <input value={tenant} onChange={e => setTenant(e.target.value)}
          placeholder={t('lascia vuoto se non lo sai')} autoComplete="off"
          className={classeCampo(tema)} style={campo(tema)}
          onKeyDown={e => { if (e.key === 'Enter' && id) collega() }} />
      </Campo>
      <ErroreOAzienda tema={tema} testo={err} caso={caso} />
      <Conferma onClick={collega} occupato={occupato} disabilitato={!id} tema={tema}>
        {occupato ? t('Ti aspetto nel browser…') : t('Collega Microsoft')}
      </Conferma>
      <Aiuto tema={tema} titolo={t('Come si registra l’app su Entra ID')}>
        <Passi tema={tema} passi={[
          <>{t('Su entra.microsoft.com: Registrazioni app › Nuova registrazione.')}{' '}<Vai tema={tema} url="https://entra.microsoft.com" /></>,
          t('Piattaforma «App per dispositivi mobili e desktop».'),
          t('Come URI di reindirizzamento aggiungi http://localhost.'),
          t('Copia qui l’ID applicazione.')
        ]} />
      </Aiuto>
      <Aiuto tema={tema} titolo={t('Cosa chiederà Microsoft')}>
        <Passi tema={tema} numerati={false} passi={[
          parte === 'posta'
            ? t('Di leggere la posta e il calendario. Niente altro, e niente in scrittura.')
            : t('Di leggere i file dei siti che segui. Niente altro, e niente in scrittura.'),
          t('Se l’app c’era già, il consenso si rifà: i permessi sono altri.')
        ]} />
      </Aiuto>
    </div>
  )
}

/**
 * Dropbox in due tempi, e il secondo compare solo quando serve.
 *
 * Mostrare subito tutti e due i campi vorrebbe dire un modulo che chiede un
 * codice che ancora non esiste — e chi lo guarda si ferma a cercarlo. Prima la
 * chiave, poi il bottone che apre il browser, e solo allora il campo del
 * codice: ogni passo compare nel momento in cui si può fare.
 */
export function FormDropbox({ tema, ok }: Props) {
  const [chiave, setChiave] = useState('')
  const [codice, setCodice] = useState('')
  const [dove, setDove] = useState('')
  const [err, setErr] = useState('')
  const [occupato, setOccupato] = useState(false)

  const inizia = async () => {
    setOccupato(true); setErr('')
    try { setDove((await api.iniziaDropbox(chiave.trim())).dove) }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setOccupato(false)
  }

  const finisci = async () => {
    setOccupato(true); setErr('')
    try { await api.collegaDropbox(codice.trim()); setChiave(''); setCodice(''); setDove(''); ok() }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setOccupato(false)
  }

  return (
    <div>
      <div style={guida(tema)}>
        {dove
          ? t('Dropbox ti ha scritto un codice sullo schermo: incollalo qui.')
          : t('I file del tuo Dropbox, in sola lettura.')}
      </div>
      <Campo tema={tema} nome={t('Chiave dell’app')}>
        <input value={chiave} onChange={e => setChiave(e.target.value)}
          autoComplete="off" className={classeCampo(tema)} style={campo(tema)}
          onKeyDown={e => { if (e.key === 'Enter' && chiave && !dove) inizia() }} />
      </Campo>

      {!dove ? (
        <>
          <Errore testo={err} />
          <Conferma onClick={inizia} occupato={occupato} disabilitato={!chiave} tema={tema}>{t('Apri Dropbox')}</Conferma>
          <Aiuto tema={tema} titolo={t('Dove trovo la chiave?')}>
            <Passi tema={tema} passi={[
              <>{t('Apri la pagina e premi «Create app»: scegli «Scoped access» e «Full Dropbox», dagli un nome.')}{' '}<Vai tema={tema} url={PAGINE.dropbox} /></>,
              t('Nella scheda «Permissions» spunta files.metadata.read e files.content.read, poi premi «Submit».'),
              t('Nella scheda «Settings» copia la «App key» e incollala qui sopra.')
            ]} />
          </Aiuto>
        </>
      ) : (
        <>
          <Campo tema={tema} nome={t('Codice')} sotto={
            <>
              {t('Non si è aperto niente?')}{' '}
              <a href={dove} target="_blank" rel="noreferrer"
                style={{ color: tema === 'scuro' ? '#E8A87C' : 'var(--rame-testo)' }}>{t('apri la pagina a mano')}</a>
            </>
          }>
            <input value={codice} onChange={e => setCodice(e.target.value)}
              autoComplete="off" autoFocus className={classeCampo(tema)} style={campo(tema)}
              onKeyDown={e => { if (e.key === 'Enter' && codice) finisci() }} />
          </Campo>
          <Errore testo={err} />
          <Conferma onClick={finisci} occupato={occupato} disabilitato={!codice} tema={tema}>{t('Collega Dropbox')}</Conferma>
        </>
      )}
    </div>
  )
}

/**
 * WhatsApp Business, con il suo prezzo scritto prima.
 *
 * Questo modulo dice una cosa che nessun altro deve dire: **quello che è
 * arrivato prima non c'è, e senza un indirizzo pubblico non arriverà niente**.
 * Non è una nota a piè di pagina, è la prima riga — perché è l'unica
 * informazione che, se manca, fa collegare una fonte che resterà a zero per
 * sempre senza che nessun errore lo dica.
 */
export function FormWhatsapp({ tema, ok }: Props) {
  const [token, setToken] = useState('')
  const [numero, setNumero] = useState('')
  const [segreto, setSegreto] = useState('')
  const [parola, setParola] = useState('')
  const [err, setErr] = useState('')
  const [occupato, setOccupato] = useState(false)

  const collega = async () => {
    setOccupato(true); setErr('')
    try {
      await api.collegaWhatsapp({ token: token.trim(), numero: numero.trim(), segreto: segreto.trim(), parola: parola.trim() })
      setToken(''); setNumero(''); setSegreto(''); setParola('')
      ok()
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setOccupato(false)
  }

  const pronto = !!(token && numero && segreto && parola)

  return (
    <div>
      {/*
        La condizione sta nella riga d'apertura, e il prezzo subito sotto.
        «Business» nel nome della scheda si legge come il nome di un'app: la
        prima riga dice che è un numero della piattaforma di Meta, e l'avviso
        dice le due cose che non si possono scoprire dopo — quello che è
        arrivato prima di oggi non c'è, e senza un indirizzo pubblico non ne
        arriverà di nuovi. Restano aperte tutte e due: chiuderle qui vorrebbe
        dire farle leggere dentro un errore, a quattro campi già riempiti.
      */}
      <div style={guida(tema)}>{t('I messaggi del tuo numero su WhatsApp Business, la piattaforma di Meta.')}</div>
      <Avviso tema={tema}>
        {t('Quello che è arrivato prima di oggi non ci sarà, e questo computer dev’essere raggiungibile da internet.')}
      </Avviso>

      <Campo tema={tema} nome={t('ID del numero di telefono')}>
        <input value={numero} onChange={e => setNumero(e.target.value)}
          autoComplete="off" className={classeCampo(tema)} style={campo(tema)} />
      </Campo>

      <Campo tema={tema} nome={t('Token permanente')}>
        <input type="password" value={token} onChange={e => setToken(e.target.value)}
          autoComplete="new-password" className={classeCampo(tema)} style={campo(tema)} />
      </Campo>

      <Campo tema={tema} nome={t('Segreto dell’app')} sotto={t('Firma i messaggi in arrivo: senza, chiunque potrebbe fingersi Meta.')}>
        <input type="password" value={segreto} onChange={e => setSegreto(e.target.value)}
          autoComplete="new-password" className={classeCampo(tema)} style={campo(tema)} />
      </Campo>

      <Campo tema={tema} nome={t('Parola d’ordine del webhook')}>
        <input value={parola} onChange={e => setParola(e.target.value)}
          placeholder={t('inventala, e riscrivila su Meta')} autoComplete="off"
          className={classeCampo(tema)} style={campo(tema)}
          onKeyDown={e => { if (e.key === 'Enter' && pronto) collega() }} />
      </Campo>

      <Errore testo={err} />
      <Conferma onClick={collega} occupato={occupato} disabilitato={!pronto} tema={tema}>{t('Collega WhatsApp')}</Conferma>
      <Aiuto tema={tema} titolo={t('Dove li trovo?')}>
        <Passi tema={tema} passi={[
          <>{t('Su developers.facebook.com apri la tua app WhatsApp.')}{' '}<Vai tema={tema} url={PAGINE.meta} /></>,
          t('In Configurazione dell’API copia l’ID del numero.'),
          t('Crea un token permanente da utente di sistema.'),
          t('Il segreto dell’app sta in Impostazioni › Di base.')
        ]} />
      </Aiuto>
      <Aiuto tema={tema} titolo={t('Come si configura il webhook')}>
        <Passi tema={tema} passi={[
          t('Su Meta, come URL metti il tuo indirizzo pubblico seguito da /api/whatsapp/webhook.'),
          t('Come parola d’ordine, la stessa che hai scritto qui sopra.'),
          t('Iscriviti al campo «messages».')
        ]} />
      </Aiuto>
    </div>
  )
}

/**
 * Jev: una chiave, e una riga che dice cosa cambia.
 *
 * La riga conta quanto il campo. Questa è l'unica scheda delle Fonti che si
 * può non collegare senza perdere niente, e chi la apre deve poterlo capire
 * prima di andare a cercare una chiave: senza, Myynd fa quello che ha sempre
 * fatto. Con, sceglie meglio cosa farsi leggere — e non scrive niente di suo.
 */
export function FormJev({ tema, ok }: Props) {
  const [chiave, setChiave] = useState('')
  const [err, setErr] = useState('')
  const [occupato, setOccupato] = useState(false)

  const collega = async () => {
    setOccupato(true); setErr('')
    try { await api.collegaJev(chiave); setChiave(''); ok() }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setOccupato(false)
  }

  return (
    <div>
      <div style={guida(tema)}>{t('Jev risponde alle domande piccole: chi aspetta una risposta, cosa conta oggi. Myynd le faceva da sé con delle regole, e le regole non sanno leggere. Senza questa chiave non cambia niente: Jev affina, non serve.')}</div>
      <Campo tema={tema} nome={t('Chiave di TypeSafe')}>
        <input type="password" value={chiave} onChange={e => setChiave(e.target.value)}
          placeholder="apikey_…" autoComplete="new-password" className={classeCampo(tema)} style={campo(tema)}
          onKeyDown={e => { if (e.key === 'Enter' && chiave) collega() }} />
      </Campo>
      <Errore testo={err} />
      <Conferma onClick={collega} occupato={occupato} tema={tema}>{t('Collega Jev')}</Conferma>
      <Aiuto tema={tema} titolo={t('Dove trovo la chiave?')}>
        <Passi tema={tema} passi={[
          t('Su typesafe.ai fai un conto e apri le chiavi API.'),
          t('Copia la chiave: comincia per apikey_.'),
          t('Si paga a consumo, e un giudizio costa una frazione di una lettura.')
        ]} />
      </Aiuto>
    </div>
  )
}

export function Form({ id, tema, ok, collegato }: { id: string; collegato?: () => void } & Props) {
  if (id === 'google') return <FormGoogle tema={tema} ok={ok} />
  if (id === 'claude') return <FormClaude tema={tema} ok={ok} />
  if (id === 'jev') return <FormJev tema={tema} ok={ok} />
  if (id === 'openai') return <FormOpenAI tema={tema} ok={ok} />
  if (id === 'compatibile') return <FormCompatibile tema={tema} ok={ok} />
  if (id === 'posta') return <FormPosta tema={tema} ok={ok} />
  if (id === 'desktop') return <FormDesktop tema={tema} ok={ok} />
  if (id === 'notion') return <FormNotion tema={tema} ok={ok} />
  if (id === 'granola') return <FormGranola tema={tema} ok={ok} collegato={collegato} />
  if (id === 'note') return <FormNote tema={tema} ok={ok} />
  if (id === 'conversazioni') return <FormConversazioni tema={tema} ok={ok} />
  if (id === 'calendario') return <FormCalendario tema={tema} ok={ok} collegato={collegato} />
  if (id === 'slack') return <FormSlack tema={tema} ok={ok} />
  if (id === 'github') return <FormGithub tema={tema} ok={ok} />
  if (id === 'drive') return <FormDrive tema={tema} ok={ok} />
  // due schede diverse, lo stesso modulo con dentro una parola diversa: sono
  // due permessi, e la schermata del consenso di Microsoft lo dirà
  if (id === 'microsoft') return <FormMicrosoft tema={tema} ok={ok} parte="posta" />
  if (id === 'sharepoint') return <FormMicrosoft tema={tema} ok={ok} parte="file" />
  if (id === 'dropbox') return <FormDropbox tema={tema} ok={ok} />
  if (id === 'whatsapp') return <FormWhatsapp tema={tema} ok={ok} />
  return null
}
