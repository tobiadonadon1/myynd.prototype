// Le preferenze: tre sezioni a sinistra, e dentro ognuna una griglia di schede.
//
// «I like the layout as is. I think the thing that is confusing is the
// settings and all of the memory.» (P5)
//
// Le regole che la tengono insieme, e che valgono anche per la Memoria:
//
//   · una scheda è un titolo, un controllo, e al massimo una riga che dice
//     come sta la cosa adesso. Niente paragrafi che insegnano.
//   · un campo solo (quello della barra), un bottone solo, una scelta sola,
//     un interruttore solo: il corredo di components/forme.tsx.
//   · ogni pressione cambia qualcosa nello stesso fotogramma, e se il server
//     dice di no torna com'era e lo dice in una riga.
//   · le sezioni e l'ordine delle schede li decide src/sezioni.ts, provato
//     sotto node; `v.apri('pref', sezione, scheda)` porta su una scheda.

import { useEffect, useMemo, useState } from 'react'
import { api, memoriaP5, sessione, type ChatGPT, type ClaudeCon } from '../api'
import { rilettura, suCollegamento } from '../collegamenti'
import { frasi, t } from '../lingua'
import { daTastiera } from '../ui'
import type { Vals } from '../vals'
import { acceleratore, avvisiAccesi, desktop, impostaAvvisi, nomePiattaforma, simboli, soloModificatore, type Aggiornamento } from '../desktop'
import { PreferenzeOsservatore, useOsservatoreDisponibile } from './PreferenzeOsservatore'
import './preferenze.css'
import { nomePianoChatGPT } from '../chatgpt-accesso.ts'
import { ProvaRisposte } from './ProvaRisposte'
import { Bottone, Campo, Carta, Casella, Interruttore, Scatola, Scelte } from '../components/forme'
import { PaginaASezioni, sezioneRicordata } from '../components/PaginaASezioni'
import { sezioneAttesa, sezioneIniziale, sezioniPreferenze, type SezionePref } from '../sezioni.ts'

const detto = (e: unknown) => (e instanceof Error ? t(e.message) : String(e))

/**
 * L'app da scrivania: quello che sa fare il guscio e il sito no. Si vede solo
 * dentro l'app. La scorciatoia si cambia premendola, non scrivendola.
 */
function LApp() {
  const d = desktop()
  const [acc, setAcc] = useState('')
  const [registro, setRegistro] = useState(false)
  const [avvio, setAvvio] = useState<boolean | null>(null)
  const [avvisi, setAvvisi] = useState(avvisiAccesi)
  const [agg, setAgg] = useState<Aggiornamento | null>(null)
  const [chiedo, setChiedo] = useState(false)
  const [guaio, setGuaio] = useState('')

  useEffect(() => {
    if (!d) return
    // ogni risposta del guscio passa da Promise.resolve: un guscio vecchio (o quello finto delle prove) può non dare una promessa
    const vero = <T,>(x: T) => (typeof x === 'string' || typeof x === 'boolean' || (x && typeof x === 'object') ? x : null)
    Promise.resolve(d.scorciatoia()).then(x => { if (typeof x === 'string') setAcc(x) }).catch(() => {})
    Promise.resolve(d.avvioAutomatico()).then(x => { if (typeof x === 'boolean') setAvvio(x) }).catch(() => {})
    // gli eventi già mandati prima che questa scheda esistesse non tornano
    Promise.resolve(d.aggiornamenti.attuale()).then(x => { const a = vero(x); if (a && typeof (a as Aggiornamento).stato === 'string') setAgg(a as Aggiornamento) }).catch(() => {})
    const smetti = d.aggiornamenti.stato(setAgg)
    return () => { if (typeof smetti === 'function') smetti() }
  }, [d])

  // la registrazione: il prossimo tasto premuto è la scorciatoia nuova (in cattura, prima di ogni altra)
  useEffect(() => {
    if (!registro || !d) return
    const alTasto = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation()
      if (e.key === 'Escape') { setRegistro(false); return }
      if (soloModificatore(e.key)) return
      const nuovo = acceleratore(e, d.piattaforma)
      if (!nuovo) {
        setGuaio(d.piattaforma === 'darwin' ? t('Serve ⌘, ⌃ o ⌥ insieme a un tasto.') : t('Serve Ctrl, Alt o Win insieme a un tasto.'))
        return
      }
      setRegistro(false); setGuaio('')
      Promise.resolve(d.impostaScorciatoia(nuovo))
        .then(r => { if (r.ok) setAcc(nuovo); else setGuaio(r.errore ? t(r.errore) : t('Non sono riuscito a cambiare la scorciatoia.')) })
        .catch(e => setGuaio(detto(e)))
    }
    window.addEventListener('keydown', alTasto, true)
    return () => window.removeEventListener('keydown', alTasto, true)
  }, [registro, d])

  if (!d) return null

  const cambiaAvvio = async () => {
    const nuovo = !avvio
    setAvvio(nuovo); setGuaio('')
    try { await Promise.resolve(d.impostaAvvioAutomatico(nuovo)) }
    catch (e) { setAvvio(!nuovo); setGuaio(detto(e)) }
  }

  const controlla = async () => {
    setChiedo(true); setGuaio('')
    try { setAgg(await Promise.resolve(d.aggiornamenti.controlla())) }
    catch (e) { setAgg({ stato: 'errore', messaggio: e instanceof Error ? e.message : String(e) }) }
    setChiedo(false)
  }

  const rigaAggiornamenti = (): string => {
    if (!agg) return t('Non ho ancora controllato.')
    switch (agg.stato) {
      case 'spento':
        return agg.perche === 'non-firmata' ? t('L’app non è firmata, quindi non può ancora aggiornarsi da sola.')
          : agg.perche === 'sviluppo' ? t('In sviluppo non si aggiorna.')
          : t('Questa copia non ha un indirizzo da cui aggiornarsi.')
      case 'controllo': return t('Controllo…')
      case 'aggiornata': return t('È l’ultima versione.')
      case 'scarico': return frasi.scaricoAggiornamento(agg.versione, agg.percento)
      case 'pronta': return frasi.aggiornamentoPronto(agg.versione)
      case 'errore': return `${t('Non sono riuscito a controllare.')} ${agg.messaggio}`
    }
  }
  const inCorso = chiedo || agg?.stato === 'controllo' || agg?.stato === 'scarico'

  return (
    <Carta titolo={t('L’app')} id="app" larga stato={guaio || undefined} statoRame>
      <div className="f-riga">
        <div>
          <div className="f-nome">{t('Versione')} {d.versione} · {nomePiattaforma(d.piattaforma)}</div>
          <div className="f-stato">{rigaAggiornamenti()}</div>
        </div>
        {agg?.stato === 'pronta' ? (
          <Bottone tipo="pieno" onClick={() => d.aggiornamenti.installa()}>{t('Riavvia e aggiorna')}</Bottone>
        ) : agg?.stato !== 'spento' && (
          <Bottone onClick={controlla} occupato={inCorso} etichettaOccupato={t('Controllo…')}>{t('Controlla')}</Bottone>
        )}
      </div>

      <div className="f-riga">
        <div>
          <div className="f-nome">{t('Barra rapida')}</div>
          {registro
            ? <div className="f-stato rame">{t('Premi la combinazione nuova…')} {t('Esc lascia com’è.')}</div>
            : <div style={{ marginTop: 4 }}><span className="prefs-tasto">{acc ? simboli(acc, d.piattaforma) : '…'}</span></div>}
        </div>
        <Bottone onClick={() => { setGuaio(''); setRegistro(r => !r) }}>{registro ? t('Annulla') : t('Cambia')}</Bottone>
      </div>

      <div className="f-riga">
        <div className="f-nome">{t('Si apre all’accesso')}</div>
        <Interruttore acceso={!!avvio} cambia={cambiaAvvio} etichetta={t('Si apre all’accesso')} disabilitato={avvio === null} />
      </div>

      {/* spento finché non lo si accende; P8 lo usa anche per una fonte che si rompe */}
      <div className="f-riga">
        <div className="f-nome">{t('Notifiche')}</div>
        <Interruttore acceso={avvisi} cambia={() => { impostaAvvisi(!avvisi); setAvvisi(!avvisi) }} etichetta={t('Notifiche')} />
      </div>

      {/* il mostriciattolo (P1B): resta in questa scheda */}
      <PreferenzeOsservatore parte="schermo" />
    </Carta>
  )
}

/** Il fuoco: dove guardare dentro (la posta, i file, quello che ti riguarda). */
function CartaFuoco({ v }: { v: Vals }) {
  return (
    <Carta titolo={t('Fuoco')} id="fuoco" larga
      stato={v.fuocoDaMe && !!v.fuoco ? t('Scritto da Myynd dalle tue attività e dai progetti.') : undefined}>
      <Campo etichettaDa="carta-fuoco" righe={3} valore={v.fuoco} salva={v.salvaFuocoCampo}
        esempio={t('Questa settimana solo i preventivi e i pagamenti')} />
    </Carta>
  )
}

/** Le notizie: cosa cercare fuori, nei giornali. La riga di stato solo quando c'è qualcosa di vero da dire. */
function CartaNotizie({ v }: { v: Vals }) {
  const [gusto, setGusto] = useState('')
  useEffect(() => {
    let vivo = true
    memoriaP5.gusto().then(g => { if (vivo) setGusto(g.vale ? g.testo : '') }).catch(() => {})
    return () => { vivo = false }
  }, [])
  return (
    <Carta titolo={t('Notizie')} id="notizie" larga stato={gusto || undefined}>
      <Campo etichettaDa="carta-notizie" righe={3} valore={v.argomenti} salva={v.salvaArgomentiCampo}
        esempio={t('intelligenza artificiale, startup, Medio Oriente, mercati')} />
    </Carta>
  )
}

/** Quanto è costato ragionare: la scheda c'è subito, i numeri arrivano. */
function Uso() {
  const [u, setU] = useState<Awaited<ReturnType<typeof api.uso>> | null>(null)
  const [guaio, setGuaio] = useState('')
  useEffect(() => {
    api.uso().then(setU).catch(e => setGuaio(detto(e)))
  }, [])

  const mila = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : String(n)
  const giorni = u ? u.giorni.slice(-7) : []
  const max = Math.max(1, ...giorni.map(g => g.entrata + g.uscita))

  return (
    <Carta titolo={t('Consumo')} id="consumo">
      <div className={`f-stato${guaio ? ' rame' : ''}`}>
        {guaio || (!u ? '…' : u.oggi.chiamate
          ? frasi.usoOggi(u.oggi.chiamate, mila(u.oggi.entrata + u.oggi.uscita), mila(u.oggi.cache))
          : t('Oggi ancora niente.'))}
      </div>
      {giorni.length > 1 && (
        <div aria-hidden="true" className="prefs-barre">
          {giorni.map(g => {
            const tot = g.entrata + g.uscita
            return <div key={g.giorno} className="prefs-barra" title={`${g.giorno} · ${mila(tot)}`}
              style={{ height: `${Math.max(8, Math.round(100 * tot / max))}%` }} />
          })}
        </div>
      )}
      {/* la prova delle risposte (P7): l'ultima riga di questa scheda */}
      <ProvaRisposte />
    </Carta>
  )
}

/** L'accesso: la password si cambia da qui, e le sessioni si chiudono da qui. */
function Conto() {
  const [attuale, setAttuale] = useState('')
  const [nuova, setNuova] = useState('')
  const [ripeti, setRipeti] = useState('')
  const [faccio, setFaccio] = useState<'' | 'cambio' | 'esco'>('')
  const [fatto, setFatto] = useState('')
  const [guaio, setGuaio] = useState('')

  const pronto = attuale.length > 0 && nuova.length >= 8 && ripeti.length >= 8 && !faccio
  const cambia = async () => {
    if (!pronto) return
    if (nuova !== ripeti) { setGuaio(t('Le due password nuove non coincidono.')); return }
    setFaccio('cambio'); setFatto(''); setGuaio('')
    try {
      await api.cambiaPassword(attuale, nuova)
      setAttuale(''); setNuova(''); setRipeti('')
      setFatto(t('Password cambiata. Gli altri dispositivi dovranno rientrare.'))
    } catch (e) { setGuaio(detto(e)) }
    setFaccio('')
  }

  const esciOvunque = async () => {
    setFaccio('esco'); setGuaio('')
    try { await api.esciOvunque(); sessione.pulisci(); location.reload() }
    catch (e) { setGuaio(detto(e)); setFaccio('') }
  }

  return (
    <Carta titolo={t('Accesso')} id="accesso" larga>
      <div className="prefs-password">
        <Casella etichetta={t('Password attuale')} type="password" valore={attuale} cambia={setAttuale} autoComplete="current-password" avanti />
        <Casella etichetta={t('Password nuova')} type="password" valore={nuova} cambia={setNuova} autoComplete="new-password" esempio={t('otto caratteri')} avanti />
        <Casella etichetta={t('Ripeti la nuova')} type="password" valore={ripeti} cambia={setRipeti} autoComplete="new-password" invio={cambia} />
      </div>
      <div className="f-piede">
        <Bottone tipo="parola" piccolo onClick={esciOvunque} occupato={faccio === 'esco'} etichettaOccupato={t('Un momento…')}>{t('Esci da tutti i dispositivi')}</Bottone>
        <div style={{ flex: 1 }} />
        <Bottone tipo="pieno" onClick={cambia} disabled={!pronto && faccio !== 'cambio'} occupato={faccio === 'cambio'} etichettaOccupato={t('Un momento…')}>{t('Cambia la password')}</Bottone>
      </div>
      {fatto && <div className="f-stato verde">{fatto}</div>}
      {guaio && <div className="f-stato rame">{guaio}</div>}
    </Carta>
  )
}

/** Nome e ruolo: la colonna cambia nello stesso fotogramma, e torna com'era se il server dice di no. */
function Identita({ v }: { v: Vals }) {
  return (
    <Carta titolo={t('Nome e ruolo')} id="nome">
      <div className="f-coppia">
        <Campo etichetta={t('Nome')} valore={v.nomeVero} salva={x => v.salvaIdentita('nome', x)} avanti />
        <Campo etichetta={t('Ruolo')} valore={v.ruolo} salva={x => v.salvaIdentita('ruolo', x)} esempio={t('titolare, responsabile vendite, …')} />
      </div>
    </Carta>
  )
}

/** «Dammi tutto quello che avete su di me»: dove stanno, aprirli nel Finder, scaricarli (con la password). */
function Fascicolo({ v }: { v: Vals }) {
  const d = desktop()
  const [dati, setDati] = useState('')
  const [password, setPassword] = useState('')
  const [chiedo, setChiedo] = useState(false)
  const [faccio, setFaccio] = useState(false)
  const [fatto, setFatto] = useState('')
  const [guaio, setGuaio] = useState('')
  useEffect(() => {
    // la cartella vera, non `home + '/.myynd'`: con MYYND_DATI è un'altra
    api.stato().then(s => setDati(s.dati || (s.home ? `${s.home}/.myynd` : ''))).catch(() => {})
  }, [])

  const scarica = async () => {
    if (!password) { setChiedo(true); return }
    setFaccio(true); setFatto(''); setGuaio('')
    try {
      const { nome, dati } = await api.scaricaDati(password)
      setPassword(''); setChiedo(false)
      const url = URL.createObjectURL(dati)
      const a = document.createElement('a')
      a.href = url; a.download = nome; a.click()
      URL.revokeObjectURL(url)
      setFatto(t('Scaricato: è nella cartella dei download.'))
    } catch (e) { setGuaio(detto(e)) }
    setFaccio(false)
  }

  return (
    <Carta titolo={t('I tuoi dati')} id="dati" larga>
      <div className="f-stato">
        {v.ospitato ? frasi.doveStannoIDatiServer() : <code>{dati || '~/.myynd'}</code>}
      </div>
      {chiedo && (
        <Casella type="password" valore={password} cambia={setPassword} autoComplete="current-password" autoFocus
          esempio={t('la tua password')} aria-label={t('la tua password')} invio={() => { if (password) void scarica() }} />
      )}
      <div className="f-piede">
        {d && !v.ospitato && (
          <Bottone disabled={!dati} onClick={() => { Promise.resolve(d.mostraNelFinder(dati)).catch(() => {}) }}>
            {d.piattaforma === 'darwin' ? t('Mostra nel Finder') : t('Mostra la cartella dei dati')}
          </Bottone>
        )}
        <div style={{ flex: 1 }} />
        <Bottone tipo="pieno" onClick={scarica} occupato={faccio} etichettaOccupato={t('Preparo…')}>{chiedo ? t('Conferma') : t('Scarica')}</Bottone>
      </div>
      {fatto && <div className="f-stato verde">{fatto}</div>}
      {guaio && <div className="f-stato rame">{guaio}</div>}
    </Carta>
  )
}

/**
 * Andarsene. La password e il proprio indirizzo ricopiato a mano: davanti a
 * un gesto senza annulla ci si ferma un secondo. La riga sopra non spiega il
 * bottone: dice cosa sparisce.
 */
function Cancella() {
  const [aperto, setAperto] = useState(false)
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [faccio, setFaccio] = useState(false)
  const [guaio, setGuaio] = useState('')

  const puo = !!password && !!email.trim() && !faccio
  const cancella = async () => {
    if (!puo) return
    setFaccio(true); setGuaio('')
    try {
      await api.cancellaConto(password, email)
      sessione.pulisci()
      location.reload()
    } catch (e) { setGuaio(detto(e)); setFaccio(false) }
  }

  return (
    <Carta titolo={t('Cancella il conto')} id="cancella" quieta larga>
      <div className="f-stato">{t('Sparisce tutto: documenti, lista, chat, memoria, automazioni e fonti. Non si torna indietro.')}</div>
      {!aperto ? (
        <div className="f-piede">
          <div style={{ flex: 1 }} />
          <Bottone onClick={() => setAperto(true)}>{t('Voglio cancellare il conto')}</Bottone>
        </div>
      ) : (
        <>
          <div className="f-coppia">
            <Casella etichetta={t('La tua password')} type="password" valore={password} cambia={setPassword} autoComplete="current-password" avanti />
            <Casella etichetta={t('Il tuo indirizzo, per conferma')} type="email" valore={email} cambia={setEmail} autoComplete="off"
              esempio={t('nome@esempio.it')} invio={cancella} />
          </div>
          <div className="f-piede">
            <Bottone tipo="parola" piccolo onClick={() => { setAperto(false); setPassword(''); setEmail(''); setGuaio('') }}>{t('Lascia stare')}</Bottone>
            <div style={{ flex: 1 }} />
            <Bottone tipo={puo ? 'pericolo' : 'pieno'} onClick={cancella} disabled={!puo && !faccio} occupato={faccio} etichettaOccupato={t('Un momento…')}>
              {t('Cancella tutto, per sempre')}
            </Bottone>
          </div>
        </>
      )}
      {guaio && <div className="f-stato rame">{guaio}</div>}
    </Carta>
  )
}

/** «Ollama · qwen3.5:9b»: il nome che gli ha dato lei, e il modello che lavora davvero. */
function chiEComeSiChiama(f: NonNullable<Vals['compatibile']>): string {
  return [f.nome, f.modello].filter(Boolean).join(' · ')
}

/**
 * Con chi ragiona Myynd: Anthropic, OpenAI, o un modello sul proprio computer.
 * Qui si sceglie solo chi lavora; collegare apre la sua scheda delle Fonti.
 */
function Motore({ v, avvisa }: { v: Vals; avvisa: (testo: string) => void }) {
  type Via = 'claude' | 'openai' | 'compatibile'
  const [s, setS] = useState<ClaudeCon | null>(null)
  const [chatgpt, setChatgpt] = useState<ChatGPT | null>(null)
  const [occupato, setOccupato] = useState(false)
  // una lettura alla volta, e di nuovo quando cambia un collegamento qualunque
  const guarda = useMemo(() => { const r = rilettura(() => api.claude(), setS); return () => { r().catch(() => setS(null)) } }, [])
  useEffect(() => { guarda() }, [guarda])
  const [giroCollegamento, setGiroCollegamento] = useState(0)
  useEffect(() => suCollegamento(() => { guarda(); setGiroCollegamento(n => n + 1) }), [guarda])
  useEffect(() => {
    const controller = new AbortController()
    api.chatgpt(controller.signal).then(r => { if (!controller.signal.aborted) setChatgpt(r) })
      .catch(() => { if (!controller.signal.aborted) setChatgpt(null) })
    return () => controller.abort()
  }, [giroCollegamento])

  const f = v.compatibile
  const o = v.openai

  // il modello di casa, provato davvero all'apertura della scheda: una cosa che si spegne
  const inCasa = !!f && /^https?:\/\/(127\.|localhost|\[?::1\]?|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(f.url)
  const [velocita, setVelocita] = useState<{ ok: boolean; ms: number } | null>(null)
  const [provando, setProvando] = useState(false)
  useEffect(() => {
    if (v.motore !== 'compatibile' || !f || !inCasa) { setVelocita(null); return }
    let ancora = true
    setProvando(true)
    api.provaMotore({ url: f.url, modello: f.modello, ...(f.nome ? { nome: f.nome } : {}) })
      .then(r => { if (ancora) setVelocita({ ok: r.ok, ms: r.ms }) })
      .finally(() => { if (ancora) setProvando(false) })
    return () => { ancora = false }
  }, [v.motore, f?.url, f?.modello, f?.nome, inCasa])

  /** Sopra i dieci secondi non è un dettaglio: è la chat che sembra rotta. */
  const LENTO = 10_000

  const attuale: Via = v.motore === 'chatgpt' || v.motore === 'openai' ? 'openai' : v.motore === 'compatibile' ? 'compatibile' : 'claude'
  const claudeCollegato = v.claudeCollegato
  const accountChatGPT = !!chatgpt?.entrato
  const openaiCollegato = accountChatGPT || !!o?.collegato
  const accountChatGPTInUso = v.motore === 'chatgpt' && !!chatgpt?.acceso

  /** Da quale strada passa, detto in una riga. Vuoto = niente da dire. */
  const dettaglio = (via: Via): string | undefined => {
    if (via === 'claude') {
      if (!claudeCollegato) return undefined
      return v.claudeVia === 'abbonamento' ? t('Con il tuo account, tramite Claude Code') : t('Con la chiave API')
    }
    if (via === 'openai') {
      if (accountChatGPTInUso || (accountChatGPT && v.motore !== 'openai')) {
        return [t('ChatGPT, con il tuo account'), chatgpt?.email, nomePianoChatGPT(chatgpt?.piano)].filter(Boolean).join(' · ')
      }
      return o?.collegato ? [t('Con la chiave API'), o.modello].join(' · ') : undefined
    }
    if (!f) return undefined
    return [
      provando ? t('Provo…')
        : velocita ? (velocita.ok
          ? frasi.motoreRisponde(chiEComeSiChiama(f), (velocita.ms / 1000).toFixed(1))
          : frasi.motoreGiu(chiEComeSiChiama(f)))
        : chiEComeSiChiama(f),
      f.url
    ].filter(Boolean).join(' · ')
  }

  /** Cosa manca a questa strada per poter lavorare adesso. Vuoto = niente. */
  const manca = (via: Via): string => {
    if (via === 'claude') return claudeCollegato ? '' : t('Non ancora collegato.')
    if (via === 'openai') return openaiCollegato || !chatgpt ? '' : t('Non ancora collegato.')
    return f ? '' : t('Non ancora collegato.')
  }

  const scegli = async (via: Via) => {
    if (occupato) return
    // premere di nuovo la riga scelta serve solo a svegliare l'account dopo un guasto
    if (via === attuale) {
      if (via === 'claude' && s?.con === 'abbonamento' && s.abbonamento.inRiposo) {
        setOccupato(true)
        try { await api.claudeCon('abbonamento') } catch (e) { avvisa(e instanceof Error ? t(e.message) : t('Non sono riuscito a cambiare.')) }
        finally { setOccupato(false); guarda() }
      }
      return
    }
    // non collegata: si apre la scheda, e collegarla la sceglie
    if (via === 'compatibile') { void v.scegliMotore('compatibile'); return }
    if (via === 'claude' && !claudeCollegato) { v.apriConnessioni('claude'); return }
    if (via === 'openai' && !openaiCollegato) { v.apriConnessioni('openai'); return }
    setOccupato(true)
    try {
      if (via === 'claude') await v.scegliMotore('claude')
      else if (accountChatGPT) { await api.usaChatGPT(true); await v.ricaricaStato() }
      else await v.scegliMotore('openai')
    } catch (e) { avvisa(e instanceof Error ? t(e.message) : t('Non sono riuscito a cambiare motore.')) }
    finally { setOccupato(false); guarda(); v.ricaricaStato() }
  }

  const vie: { id: Via; titolo: string; collegato: boolean; apri: () => void }[] = [
    { id: 'claude', titolo: 'Anthropic', collegato: claudeCollegato, apri: () => v.apriConnessioni('claude') },
    { id: 'openai', titolo: 'OpenAI', collegato: openaiCollegato, apri: () => v.apriConnessioni('openai') },
    { id: 'compatibile', titolo: t('Un modello sul tuo computer, o un altro fornitore'), collegato: !!f, apri: () => v.apriConnessioni('compatibile') }
  ]

  return (
    <Carta titolo={t('Motore')} id="motore" larga>
      <div role="radiogroup" aria-labelledby="carta-motore" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {vie.map(x => {
          const scelto = attuale === x.id
          const guaio = manca(x.id)
          const riga = dettaglio(x.id)
          const spento = x.id === 'openai' && scelto && v.motore === 'chatgpt' && chatgpt && !chatgpt.acceso
          return (
            // dentro c'è il bottone «Gestisci»: la riga tiene il ruolo, non il tag
            <div key={x.id} className="prefs-via" role="radio" aria-checked={scelto} tabIndex={0}
              onClick={() => scegli(x.id)} onKeyDown={daTastiera(() => scegli(x.id))}>
              <span className="prefs-bollo" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="prefs-via-cima">
                  <span>{x.titolo}</span>
                  <span className={`prefs-status ${guaio || spento ? 'needs-attention' : 'ready'}`}>
                    {spento ? t('Disattivato in Myynd') : guaio ? t('Da collegare') : scelto ? t('In uso') : t('Pronto')}
                  </span>
                  <Bottone piccolo onClick={e => { e.stopPropagation(); x.apri() }}>{x.collegato ? t('Gestisci') : t('Collega')}</Bottone>
                </div>
                {(riga || guaio) && <div className={`f-stato${guaio ? ' rame' : ''}`} style={{ marginTop: 5 }}>{riga ?? guaio}</div>}
                {scelto && x.id === 'claude' && s?.con === 'abbonamento' && s.abbonamento.inRiposo && (
                  <div className="f-stato rame" style={{ marginTop: 5 }}>
                    {t('L’ultima volta non ha risposto: per qualche minuto uso la chiave.')}{' '}
                    <span style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>{t('Riprova adesso')}</span>
                  </div>
                )}
                {scelto && x.id === 'compatibile' && velocita?.ok && velocita.ms > LENTO && (
                  <div className="f-stato rame" style={{ marginTop: 5 }}>{t('Questo modello è lento sul tuo computer: prova uno più piccolo.')}</div>
                )}
                {scelto && x.id !== 'claude' && (
                  <div className="f-stato rame" style={{ marginTop: 5 }}>{t('Messo a punto su Claude: con un altro modello rileggi le bozze e le fonti citate.')}</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Carta>
  )
}

/** Un modello di Claude per livello di lavoro: tre righe, e su ognuna i modelli come pastiglie. */
function Modelli({ v }: { v: Vals }) {
  return (
    <Carta titolo={t('Un modello per ogni lavoro')} id="modelli" larga>
      <div>
        {v.livelli.map(l => (
          <div key={l.id} className="prefs-livello">
            <div className="f-nome" title={l.nota}>{l.titolo}</div>
            <Scelte etichetta={l.titolo} opzioni={v.modelli.map(m => ({ id: m.id, nome: m.nome, titolo: m.nota }))}
              scelta={l.scelto} scegli={l.scegli} />
          </div>
        ))}
      </div>
    </Carta>
  )
}

/** La stessa scheda per OpenAI: i modelli sono quelli del catalogo, e possono essere venti. Un menù per riga. */
function ModelliOpenAI({ v }: { v: Vals }) {
  const [via, setVia] = useState<'chiave' | 'account' | null>(null)
  const [catalogo, setCatalogo] = useState<string[]>([])
  const [scelti, setScelti] = useState<Record<'casa' | 'media' | 'frontiera', string> | null>(null)
  const [guaio, setGuaio] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    api.modelliMotoreOpenAI(controller.signal)
      .then(r => { if (!controller.signal.aborted) { setVia(r.via); setCatalogo(r.modelli); setScelti(r.scelti) } })
      .catch(e => { if (!controller.signal.aborted) setGuaio(e instanceof Error ? t(e.message) : t('Non riesco a leggere i modelli.')) })
    return () => controller.abort()
  }, [v.motore, v.openai])

  const scegli = (livello: 'casa' | 'media' | 'frontiera', modello: string) => {
    if (!scelti) return
    const prima = scelti
    const nuovi = { ...scelti, [livello]: modello }
    setScelti(nuovi); setGuaio('')
    api.scegliModelliOpenAI(nuovi).catch(() => { setScelti(prima); setGuaio(t('Non sono riuscito a salvare la preferenza.')) })
  }
  // il modello scelto resta in lista anche se il catalogo non è arrivato
  const opzioni = (attuale: string) => [...new Set([...(attuale && !catalogo.includes(attuale) ? [attuale] : []), ...catalogo])]

  return (
    <Carta titolo={t('Un modello per ogni lavoro')} id="modelli" larga stato={guaio || (!via || !scelti ? '…' : undefined)} statoRame={!!guaio}>
      {via && scelti && (
        <div>
          {v.livelli.map(l => (
            <div key={l.id} className="prefs-livello">
              <div className="f-nome" title={l.nota}>{l.titolo}</div>
              <div style={{ minWidth: 200, maxWidth: '100%' }}>
                <Scatola>
                  <select aria-label={l.titolo} value={scelti[l.id]} onChange={e => scegli(l.id, e.target.value)}>
                    {via === 'account' && <option value="">{t('Il modello del piano')}</option>}
                    {opzioni(scelti[l.id]).map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Scatola>
              </div>
            </div>
          ))}
        </div>
      )}
    </Carta>
  )
}

export function Preferenze({ v }: { v: Vals }) {
  const d = desktop()
  const osservatore = useOsservatoreDisponibile()
  const sezioni = sezioniPreferenze({ desktop: !!d, osservatore, motoreDaCollegare: !v.claudeOn })
  const [sezione, setSezione] = useState<SezionePref>(() => sezioneIniziale({
    pagina: 'pref', richiesta: sezioneAttesa('pref')?.sezione ?? null, biglietto: false, nuove: null,
    ricordata: sezioneRicordata('pref', v.emailConto), valide: sezioni.map(s => s.id)
  }) as SezionePref)
  const schede = sezioni.find(s => s.id === sezione)?.schede ?? []

  return (
    <PaginaASezioni titolo={t('Preferenze')} pagina="pref" etichettaNav={t('Sezioni delle preferenze')} sezioni={sezioni}
      attuale={sezione} scegli={id => setSezione(id as SezionePref)} email={v.emailConto}>
      {sezione === 'myynd' && (
        <div className="f-griglia">
          <CartaFuoco v={v} />
          <CartaNotizie v={v} />
          <Carta titolo={t('Autonomia')} id="autonomia" stato={v.autonomie.find(a => a.scelto)?.nota}>
            <Scelte etichetta={t('Autonomia')} opzioni={v.autonomie.map(a => ({ id: a.id, nome: a.titolo }))}
              scelta={v.autonomie.find(a => a.scelto)?.id ?? null} scegli={id => v.autonomie.find(a => a.id === id)?.onClick()} />
          </Carta>
          {schede.includes('osservazione') && (
            <Carta titolo={t('Osservazione')} id="osservazione">
              <PreferenzeOsservatore parte="osservazione" />
            </Carta>
          )}
          <Carta titolo={t('Tono')} id="tono">
            <Scelte etichetta={t('Tono')} opzioni={v.toni.map(x => ({ id: x.id, nome: x.label }))}
              scelta={v.toni.find(x => x.scelto)?.id ?? null} scegli={id => v.toni.find(x => x.id === id)?.onClick()} />
            <div className="f-stato prefs-esempio">{v.tonoEsempio}</div>
          </Carta>
        </div>
      )}

      {sezione === 'intelligenza' && (
        <div className="f-griglia">
          <Motore v={v} avvisa={v.mostraToast} />
          {v.motore === 'claude' && <Modelli v={v} />}
          {(v.motore === 'openai' || v.motore === 'chatgpt') && <ModelliOpenAI v={v} />}
          <Uso />
        </div>
      )}

      {sezione === 'account' && (
        <div className="f-griglia">
          <Identita v={v} />
          <Carta titolo={t('Lingua e aspetto')} id="lingua">
            <Scelte etichetta={t('Lingua')} mostraEtichetta
              opzioni={v.lingue.map(l => ({ id: l.id, nome: l.occupato && !l.scelto ? t('Traduco…') : l.nome, disabilitato: l.occupato, occupato: l.occupato }))}
              scelta={v.lingue.find(l => l.scelto)?.id ?? null} scegli={id => { void v.lingue.find(l => l.id === id)?.onClick() }} />
            <Scelte etichetta={t('Aspetto')} mostraEtichetta attivazione="automatica"
              opzioni={v.temi.map(x => ({ id: x.id, nome: x.label }))}
              scelta={v.temi.find(x => x.scelto)?.id ?? null} scegli={id => v.temi.find(x => x.id === id)?.onClick()} />
          </Carta>
          {/* solo dentro l'app da scrivania: nel browser la scheda non si disegna */}
          {d && <LApp />}
          <Conto />
          <Fascicolo v={v} />
          {/* ultima di tutte: l'unica cosa qui che non si può annullare */}
          <Cancella />
        </div>
      )}
    </PaginaASezioni>
  )
}
