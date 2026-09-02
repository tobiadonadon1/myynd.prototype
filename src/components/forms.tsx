// I moduli per collegare una fonte. Stessi campi nell'onboarding e nel
// pannello Connessioni: si scrivono una volta sola.
//
// Le credenziali le digiti tu, nella tua app, e vanno al tuo server locale.

import { useEffect, useState, type CSSProperties } from 'react'
import { api } from '../api'
import type { Stato } from '../api'
import { frasi, t } from '../lingua'

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
    border: `1px solid ${scuro ? 'rgba(244,239,232,.22)' : 'rgba(34,39,31,.18)'}`,
    background: scuro ? 'rgba(244,239,232,.06)' : 'rgba(255,255,255,.7)',
    color: scuro ? CHIARO : '#22271F',
    fontSize: 15, fontFamily: 'inherit', outline: 'none'
  }
}

export function etichetta(tema: Tema): CSSProperties {
  return {
    fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase',
    color: tema === 'scuro' ? 'rgba(244,239,232,.45)' : 'rgba(34,39,31,.5)',
    marginTop: 12
  }
}

function nota(tema: Tema): CSSProperties {
  return {
    fontSize: '12.5px', lineHeight: 1.55, marginBottom: 4,
    color: tema === 'scuro' ? 'rgba(244,239,232,.62)' : 'rgba(34,39,31,.62)'
  }
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
function Errore({ testo }: { testo: string }) {
  if (!testo) return null
  return <div style={{ fontSize: '12.5px', color: '#D4674A', marginTop: 12, lineHeight: 1.5 }}>{t(testo)}</div>
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
        ? (scuro ? 'rgba(244,239,232,.2)' : 'rgba(34,39,31,.18)')
        : (scuro ? CHIARO : 'linear-gradient(120deg,#C4623B,#7E9C82)'),
      color: spento ? (scuro ? 'rgba(244,239,232,.6)' : 'rgba(34,39,31,.5)') : (scuro ? '#191715' : '#FFF7F0'),
      fontSize: '13.5px', fontWeight: 500, fontFamily: 'inherit',
      cursor: spento ? 'default' : 'pointer'
    }}>{occupato ? t('Provo…') : children}</button>
  )
}

type Props = { tema: Tema; ok: () => void }

export function FormClaude({ tema, ok, senzaNota }: Props & { senzaNota?: boolean }) {
  const [apiKey, setApiKey] = useState('')
  const [err, setErr] = useState('')
  // la chiave è buona ma il conto non ha credito: si salva, e prima di andare
  // avanti lo si dice — altrimenti la prima risposta che non arriva sembra un guasto
  const [avviso, setAvviso] = useState('')
  const [occupato, setOccupato] = useState(false)
  const [nellAmbiente, setNellAmbiente] = useState(false)

  // se la chiave è già nell'ambiente non c'è motivo di farla incollare di nuovo
  useEffect(() => {
    api.chiaveNellAmbiente().then(r => setNellAmbiente(r.presente)).catch(() => {})
  }, [])

  const usaAmbiente = async () => {
    setOccupato(true); setErr('')
    try { await api.usaChiaveAmbiente(); ok() }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setOccupato(false)
  }

  const collega = async () => {
    setOccupato(true); setErr('')
    try {
      const r = await api.collegaClaude(apiKey)
      setApiKey('')
      if (r.avviso) setAvviso(r.avviso); else ok()
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setOccupato(false)
  }

  if (avviso) {
    return (
      <div>
        <div style={{ ...nota(tema), overflowWrap: 'anywhere' }}>{t(avviso)}</div>
        <Conferma onClick={ok} occupato={false} tema={tema}>{t('Ho capito')}</Conferma>
      </div>
    )
  }

  return (
    <div>
      <div style={nota(tema)}>
        {senzaNota
          ? t('Da console.anthropic.com. Il conto deve avere credito (Billing).')
          : t('La chiave da console.anthropic.com, con credito sul conto (Billing). Senza, Myynd non ragiona.')}
      </div>
      {nellAmbiente && (
        <div style={{ marginTop: 14 }}>
          <Conferma onClick={usaAmbiente} occupato={occupato} tema={tema}>{t("Usa la chiave che c\'è già")}</Conferma>
          <div style={{ ...nota(tema), marginTop: 10 }}>{t("Ne ho trovata una in ANTHROPIC_API_KEY. Oppure incollane un\'altra qui sotto.")}</div>
        </div>
      )}
      <div style={etichetta(tema)}>{t('Chiave API')}</div>
      <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
        placeholder="sk-ant-…" autoComplete="new-password" className={classeCampo(tema)} style={campo(tema)}
        onKeyDown={e => { if (e.key === 'Enter' && apiKey) collega() }} />
      <Errore testo={err} />
      <Conferma onClick={collega} occupato={occupato} disabilitato={!apiKey} tema={tema}>{t('Collega Claude')}</Conferma>
    </div>
  )
}

/**
 * Gli indirizzi dei fornitori che conosciamo: un bottone riempie il campo.
 *
 * Gli ultimi due sono in casa — Ollama e LM Studio sulla loro porta di serie —
 * ed è la ragione per cui questo modulo esiste anche per chi non vuole
 * pagare nessuno: lo stesso campo, un indirizzo diverso.
 */
const FORNITORI = [
  { nome: 'OpenAI', url: 'https://api.openai.com/v1' },
  { nome: 'OpenRouter', url: 'https://openrouter.ai/api/v1' },
  { nome: 'Groq', url: 'https://api.groq.com/openai/v1' },
  { nome: 'Mistral', url: 'https://api.mistral.ai/v1' },
  { nome: 'Ollama', url: 'http://127.0.0.1:11434/v1' },
  { nome: 'LM Studio', url: 'http://127.0.0.1:1234/v1' }
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
  const [modello, setModello] = useState('')
  const [nome, setNome] = useState('')
  const [modelli, setModelli] = useState<string[]>([])
  const [err, setErr] = useState('')
  const [occupato, setOccupato] = useState(false)

  // se è già collegato si parte da com'è: cambiare un campo non deve voler
  // dire riscriverli tutti e quattro
  useEffect(() => {
    api.stato().then(s => {
      const f = s.config.compatibile
      if (f) { setUrl(f.url); setModello(f.modello); setNome(f.nome ?? '') }
    }).catch(() => {})
  }, [])

  // i modelli del fornitore, con un po' di calma: non a ogni tasto
  useEffect(() => {
    if (!/^https?:\/\/\S+/.test(url)) { setModelli([]); return }
    const sveglia = setTimeout(() => {
      api.modelliCompatibili(url, chiave).then(r => setModelli(r.modelli)).catch(() => setModelli([]))
    }, 600)
    return () => clearTimeout(sveglia)
  }, [url, chiave])

  const collega = async () => {
    setOccupato(true); setErr('')
    try {
      await api.collegaCompatibile({
        url: url.trim(), modello: modello.trim(),
        ...(chiave.trim() ? { chiave: chiave.trim() } : {}),
        ...(nome.trim() ? { nome: nome.trim() } : {})
      })
      ok()
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setOccupato(false)
  }

  const scuro = tema === 'scuro'
  const pastiglia = (attiva: boolean): CSSProperties => ({
    padding: '7px 13px', borderRadius: 99, fontFamily: 'inherit', fontSize: '12.5px', cursor: 'pointer',
    border: `1px solid ${attiva ? '#C4623B' : (scuro ? 'rgba(244,239,232,.22)' : 'rgba(34,39,31,.18)')}`,
    background: attiva ? 'rgba(196,98,59,.1)' : (scuro ? 'rgba(244,239,232,.06)' : 'rgba(255,255,255,.6)'),
    color: attiva ? '#8E3F1F' : (scuro ? CHIARO : '#22271F')
  })
  const pronto = !!url.trim() && !!modello.trim()

  return (
    <div>
      <div style={nota(tema)}>
        {t('Al posto di Claude, per le risposte, le bozze e il feed. Serve un indirizzo che parli come OpenAI e il nome di un modello; la chiave solo se il fornitore la vuole.')}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
        {FORNITORI.map(f => (
          <button key={f.nome} type="button" style={pastiglia(url === f.url)}
            onClick={() => { setUrl(f.url); if (!nome) setNome(f.nome) }}>{f.nome}</button>
        ))}
      </div>
      <div style={etichetta(tema)}>{t('Indirizzo')}</div>
      <input value={url} onChange={e => setUrl(e.target.value)}
        placeholder="https://api.openai.com/v1" autoComplete="off" className={classeCampo(tema)} style={campo(tema)} />
      <div style={etichetta(tema)}>{t('Chiave API (se serve)')}</div>
      <input type="password" value={chiave} onChange={e => setChiave(e.target.value)}
        placeholder="sk-…" autoComplete="new-password" className={classeCampo(tema)} style={campo(tema)} />
      <div style={etichetta(tema)}>{t('Modello')}</div>
      <input list="modelli-compatibili" value={modello} onChange={e => setModello(e.target.value)}
        placeholder="gpt-4.1 · qwen2.5:14b" autoComplete="off" className={classeCampo(tema)} style={campo(tema)}
        onKeyDown={e => { if (e.key === 'Enter' && pronto) collega() }} />
      <datalist id="modelli-compatibili">
        {modelli.map(m => <option key={m} value={m} />)}
      </datalist>
      <div style={etichetta(tema)}>{t('Come lo chiami (facoltativo)')}</div>
      <input value={nome} onChange={e => setNome(e.target.value)}
        placeholder={t('il mio Ollama')} autoComplete="off" className={classeCampo(tema)} style={campo(tema)} />
      <Errore testo={err} />
      <Conferma onClick={collega} occupato={occupato} disabilitato={!pronto} tema={tema}>{t('Collega il fornitore')}</Conferma>
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
    setOccupato(true); setErr(''); setAvviso('')
    try {
      const r = await api.collegaPosta({ host, porta: 993, utente, password, giorni })
      setPassword('')
      if (r.certificatoAdattato) {
        setAvviso(frasi.certificatoAltroNome(r.certificatoAdattato))
      }
      ok()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      // se le credenziali sono giuste ma il server no, deve poterlo correggere
      setAMano(true)
    }
    setOccupato(false)
  }

  const pronto = !!host && !!utente && !!password
  // Gmail, iCloud e Yahoo non accettano la password dell'account via IMAP:
  // vogliono una «password per le app». Dirlo prima che fallisca.
  const h = host.toLowerCase()
  const consiglio = /gmail|googlemail/.test(h)
    ? t('Gmail non accetta la password dell’account: serve una «password per le app», da myaccount.google.com/apppasswords, con la verifica in due passaggi attiva.')
    : /mail\.me\.com|icloud/.test(h) ? t('iCloud vuole una password specifica per le app, da appleid.apple.com.')
    : /yahoo/.test(h) ? t('Yahoo vuole una password per le app, dalle impostazioni di sicurezza dell’account.')
    : /office365|outlook|hotmail|live\./.test(h) ? t('Outlook non accetta più la password via IMAP: collega «Outlook e Calendario» invece di questa scheda.')
    : ''
  return (
    <div>
      <div style={nota(tema)}>{t('Basta indirizzo e password: il server lo trovo io.')}</div>

      <div style={etichetta(tema)}>{t('Indirizzo')}</div>
      <input value={utente} onChange={e => { setUtente(e.target.value); setTrovato(false) }}
        placeholder={t('tu@tuodominio.it')} autoComplete="username" className={classeCampo(tema)} style={campo(tema)} />

      <div style={etichetta(tema)}>{t('Password della casella')}</div>
      <input type="password" value={password} onChange={e => setPassword(e.target.value)}
        autoComplete="current-password" className={classeCampo(tema)} style={campo(tema)}
        onKeyDown={e => { if (e.key === 'Enter' && pronto) collega() }} />

      {cerco && <div style={{ ...nota(tema), marginTop: 12 }}>{t('Cerco il tuo server…')}</div>}

      {consiglio && <div style={{ ...nota(tema), marginTop: 12, overflowWrap: 'anywhere' }}>{consiglio}</div>}

      {trovato && !aMano && (
        <div style={{ ...nota(tema), marginTop: 12, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ overflowWrap: 'anywhere' }}>{t('Server trovato:')}{' '}<strong style={{ fontWeight: 500 }}>{host}</strong></span>
          <button onClick={() => setAMano(true)} style={{
            border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
            fontSize: '12.5px', color: tema === 'scuro' ? '#E8A87C' : '#8E3F1F', textDecoration: 'underline'
          }}>{t('non è questo')}</button>
        </div>
      )}

      {aMano && (
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 2 }}>
            <div style={etichetta(tema)}>{t('Server IMAP')}</div>
            <input value={host} onChange={e => setHost(e.target.value)}
              placeholder={t('imap.tuodominio.it')} className={classeCampo(tema)} style={campo(tema)} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={etichetta(tema)}>{t('Giorni')}</div>
            <input type="number" value={giorni} onChange={e => setGiorni(Number(e.target.value))} className={classeCampo(tema)} style={campo(tema)} />
          </div>
        </div>
      )}

      <Errore testo={err} />
      {avviso && <div style={{ ...nota(tema), marginTop: 12 }}>{avviso}</div>}
      <Conferma onClick={collega} occupato={occupato} disabilitato={!pronto} tema={tema}>{t('Collega la posta')}</Conferma>
    </div>
  )
}

export function FormDesktop({ tema, ok }: Props) {
  const [cartelle, setCartelle] = useState<string[]>([])
  const [manuale, setManuale] = useState('')
  const [suggeriti, setSuggeriti] = useState<string[]>([])
  const [err, setErr] = useState('')
  const [occupato, setOccupato] = useState(false)

  // Le cartelle suggerite arrivano già scelte: erano tutte da spuntare a mano
  // prima, e sono le stesse tre volte su quattro. Toglierne una è un clic,
  // sceglierle tutte era tre.
  useEffect(() => {
    api.stato().then(s => {
      setSuggeriti(s.suggerimentiDesktop)
      setCartelle(c => (c.length ? c : s.suggerimentiDesktop))
    }).catch(() => {})
  }, [])

  const alterna = (c: string) => setCartelle(v => (v.includes(c) ? v.filter(x => x !== c) : [...v, c]))

  const collega = async () => {
    setOccupato(true); setErr('')
    const tutte = manuale.trim() ? [...cartelle, manuale.trim()] : cartelle
    try { await api.collegaDesktop(tutte); ok() }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setOccupato(false)
  }

  const scuro = tema === 'scuro'
  return (
    <div>
      <div style={nota(tema)}>{t('PDF, Word, testo. Solo lettura, solo dove dici tu.')}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {suggeriti.map(c => {
          const on = cartelle.includes(c)
          return (
            <button key={c} onClick={() => alterna(c)} style={{
              padding: '9px 14px', borderRadius: 99, fontSize: '12.5px', cursor: 'pointer', fontFamily: 'inherit',
              border: `1px solid ${on ? '#C4623B' : scuro ? 'rgba(244,239,232,.22)' : 'rgba(34,39,31,.2)'}`,
              background: on ? 'rgba(196,98,59,.16)' : 'none',
              color: on ? (scuro ? '#E8A87C' : '#8E3F1F') : (scuro ? 'rgba(244,239,232,.62)' : 'rgba(34,39,31,.62)')
            }}>{c.split('/').pop()}</button>
          )
        })}
      </div>
      <div style={etichetta(tema)}>{t('Oppure un percorso')}</div>
      <input value={manuale} onChange={e => setManuale(e.target.value)} placeholder={t('/Users/…/Lavoro')} className={classeCampo(tema)} style={campo(tema)} />
      <Errore testo={err} />
      <Conferma onClick={collega} occupato={occupato} tema={tema}>{t('Collega il desktop')}</Conferma>
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
      <div style={nota(tema)}>
        {t("Token da notion.so/my-integrations. Poi condividi con l'integrazione le pagine da leggere.")}
      </div>
      <div style={etichetta(tema)}>{t('Token di integrazione')}</div>
      <input type="password" value={token} onChange={e => setToken(e.target.value)}
        placeholder="ntn_…" autoComplete="new-password" className={classeCampo(tema)} style={campo(tema)}
        onKeyDown={e => { if (e.key === 'Enter' && token) collega() }} />
      <Errore testo={err} />
      <Conferma onClick={collega} occupato={occupato} tema={tema}>{t('Collega Notion')}</Conferma>
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
  const [occupato, setOccupato] = useState(false)
  const vai = async () => {
    setOccupato(true); setErr('')
    try { const { dove } = await avvia(); window.location.assign(dove) }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); setOccupato(false) }
  }
  return (
    <div>
      <div style={{ ...nota(tema), overflowWrap: 'anywhere' }}>
        {disponibile
          ? frasi.viaWeb(nome)
          : t('Non ancora disponibile su questo server. Per la posta usa «Posta», con una password per le app.')}
      </div>
      <Errore testo={err} />
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
  const [occupato, setOccupato] = useState(false)
  const [s, setS] = useState<Stato | null>(null)
  useEffect(() => { api.stato().then(setS).catch(() => {}) }, [])

  const collega = async () => {
    setOccupato(true); setErr('')
    try { await api.collegaGoogle(id.trim(), segreto.trim()); setId(''); setSegreto(''); ok() }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setOccupato(false)
  }

  if (s?.ospitato) return <ViaWeb tema={tema} disponibile={!!s.oauth?.google} avvia={api.avviaGoogle} nome="Google" />

  return (
    <div>
      <div style={nota(tema)}>
        {t('Su console.cloud.google.com: crea un progetto, attiva Gmail API e Calendar API, poi Credenziali › ID client OAuth › Applicazione desktop. Incolla qui quello che ti dà.')}
      </div>
      <div style={etichetta(tema)}>{t('ID client')}</div>
      <input value={id} onChange={e => setId(e.target.value)}
        placeholder="…apps.googleusercontent.com" autoComplete="off"
        className={classeCampo(tema)} style={campo(tema)} />
      <div style={{ ...etichetta(tema), marginTop: 12 }}>{t('Segreto del client')}</div>
      <input type="password" value={segreto} onChange={e => setSegreto(e.target.value)}
        placeholder={t('se il tuo progetto ne ha uno')} autoComplete="new-password"
        className={classeCampo(tema)} style={campo(tema)}
        onKeyDown={e => { if (e.key === 'Enter' && id) collega() }} />
      <Errore testo={err} />
      <Conferma onClick={collega} occupato={occupato} tema={tema}>
        {occupato ? t('Ti aspetto nel browser…') : t('Collega Google')}
      </Conferma>
    </div>
  )
}

/**
 * Slack: un campo, e una nota che dice dove cliccare.
 *
 * Il token si crea in cinque minuti su api.slack.com, e i cinque minuti sono
 * tutti nella scelta degli ambiti: sbagliarli vuol dire un token che si collega
 * e non vede niente. Per questo la nota li elenca invece di dire «dai i
 * permessi necessari», che è il modo in cui una guida fa perdere un pomeriggio.
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
      <div style={nota(tema)}>
        {t('Su api.slack.com/apps: crea un’app, in «OAuth & Permissions» aggiungi gli ambiti utente channels:history, groups:history, im:history, mpim:history, channels:read e users:read, installala nel tuo spazio e copia il token che comincia per xoxp-.')}
      </div>
      <div style={etichetta(tema)}>{t('Token utente')}</div>
      <input type="password" value={token} onChange={e => setToken(e.target.value)}
        placeholder="xoxp-…" autoComplete="new-password" className={classeCampo(tema)} style={campo(tema)}
        onKeyDown={e => { if (e.key === 'Enter' && token) collega() }} />
      <div style={{ ...nota(tema), marginTop: 10 }}>
        {t('Legge solo i canali di cui fai già parte: non è un permesso in più di quelli che hai.')}
      </div>
      <Errore testo={err} />
      <Conferma onClick={collega} occupato={occupato} disabilitato={!token} tema={tema}>{t('Collega Slack')}</Conferma>
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
    setOccupato(true); setErr('')
    try { await api.collegaDrive(id.trim(), segreto.trim()); setId(''); setSegreto(''); ok() }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setOccupato(false)
  }

  if (s?.ospitato) return <ViaWeb tema={tema} disponibile={!!s.oauth?.google} avvia={api.avviaDrive} nome="Google Drive" />

  return (
    <div>
      <div style={nota(tema)}>
        {daGmail
          ? t('Stesso progetto di Gmail: riusa lo stesso ID client, e attiva anche Google Drive API. Il consenso si rifà, perché stavolta riguarda i tuoi file.')
          : t('Su console.cloud.google.com: crea un progetto, attiva Google Drive API, poi Credenziali › ID client OAuth › Applicazione desktop.')}
      </div>
      <div style={etichetta(tema)}>{t('ID client')}</div>
      <input value={id} onChange={e => setId(e.target.value)}
        placeholder="…apps.googleusercontent.com" autoComplete="off"
        className={classeCampo(tema)} style={campo(tema)} />
      <div style={{ ...etichetta(tema), marginTop: 12 }}>{t('Segreto del client')}</div>
      <input type="password" value={segreto} onChange={e => setSegreto(e.target.value)}
        placeholder={t('se il tuo progetto ne ha uno')} autoComplete="new-password"
        className={classeCampo(tema)} style={campo(tema)}
        onKeyDown={e => { if (e.key === 'Enter' && id) collega() }} />
      <Errore testo={err} />
      <Conferma onClick={collega} occupato={occupato} disabilitato={!id} tema={tema}>
        {occupato ? t('Ti aspetto nel browser…') : t('Collega Drive')}
      </Conferma>
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
    setOccupato(true); setErr('')
    try { await api.collegaMicrosoft(id.trim(), tenant.trim(), parte); setId(''); ok() }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setOccupato(false)
  }

  if (s?.ospitato) {
    return <ViaWeb tema={tema} disponibile={!!s.oauth?.microsoft} nome="Microsoft"
      avvia={() => api.avviaMicrosoft(parte)} />
  }

  return (
    <div>
      <div style={nota(tema)}>
        {gia.length
          ? t('L’app su Entra ID è la stessa che hai già registrato: l’ID è quello. Microsoft richiederà il consenso, perché stavolta chiede altri permessi.')
          : t('Su entra.microsoft.com: Registrazioni app › Nuova registrazione, piattaforma «App per dispositivi mobili e desktop», e come URI di reindirizzamento aggiungi http://localhost. Poi copia qui l’ID applicazione.')}
      </div>
      <div style={etichetta(tema)}>{t('ID applicazione')}</div>
      <input value={id} onChange={e => setId(e.target.value)}
        placeholder="00000000-0000-0000-0000-000000000000" autoComplete="off"
        className={classeCampo(tema)} style={campo(tema)} />
      <div style={{ ...etichetta(tema), marginTop: 12 }}>{t('ID del tenant')}</div>
      <input value={tenant} onChange={e => setTenant(e.target.value)}
        placeholder={t('lascia vuoto se non lo sai')} autoComplete="off"
        className={classeCampo(tema)} style={campo(tema)}
        onKeyDown={e => { if (e.key === 'Enter' && id) collega() }} />
      <div style={{ ...nota(tema), marginTop: 10 }}>
        {parte === 'posta'
          ? t('Chiederà di poter leggere la posta e il calendario. Niente altro, e niente in scrittura.')
          : t('Chiederà di poter leggere i file dei siti che segui. Niente altro, e niente in scrittura.')}
      </div>
      <Errore testo={err} />
      <Conferma onClick={collega} occupato={occupato} disabilitato={!id} tema={tema}>
        {occupato ? t('Ti aspetto nel browser…') : t('Collega Microsoft')}
      </Conferma>
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
      <div style={nota(tema)}>
        {t('Su dropbox.com/developers/apps: crea un’app «Scoped access», in Permissions spunta files.metadata.read e files.content.read, poi copia qui la App key.')}
      </div>
      <div style={etichetta(tema)}>{t('Chiave dell’app')}</div>
      <input value={chiave} onChange={e => setChiave(e.target.value)}
        autoComplete="off" className={classeCampo(tema)} style={campo(tema)}
        onKeyDown={e => { if (e.key === 'Enter' && chiave && !dove) inizia() }} />

      {!dove ? (
        <>
          <Errore testo={err} />
          <Conferma onClick={inizia} occupato={occupato} disabilitato={!chiave} tema={tema}>{t('Apri Dropbox')}</Conferma>
        </>
      ) : (
        <>
          <div style={{ ...nota(tema), marginTop: 14 }}>
            {t('Dropbox ti ha scritto un codice sullo schermo: incollalo qui.')}
          </div>
          <div style={etichetta(tema)}>{t('Codice')}</div>
          <input value={codice} onChange={e => setCodice(e.target.value)}
            autoComplete="off" autoFocus className={classeCampo(tema)} style={campo(tema)}
            onKeyDown={e => { if (e.key === 'Enter' && codice) finisci() }} />
          <div style={{ ...nota(tema), marginTop: 10 }}>
            {t('Non si è aperto niente?')}{' '}
            <a href={dove} target="_blank" rel="noreferrer"
              style={{ color: '#C4623B' }}>{t('apri la pagina a mano')}</a>
          </div>
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
      <div style={{
        ...nota(tema), padding: '11px 13px', borderRadius: 12, marginBottom: 4,
        border: '1px solid rgba(196,98,59,.3)', background: 'rgba(196,98,59,.08)'
      }}>
        {t('WhatsApp non si può rileggere: Meta i messaggi li manda, non li fa chiedere. Vuol dire due cose — quello che è arrivato prima di oggi non ci sarà, e questo computer dev’essere raggiungibile da internet perché ne arrivino di nuovi.')}
      </div>
      <div style={{ ...nota(tema), marginTop: 12 }}>
        {t('Su developers.facebook.com: nell’app WhatsApp, in Configurazione dell’API, copia l’ID del numero e crea un token permanente da utente di sistema. Il segreto dell’app sta in Impostazioni › Di base.')}
      </div>

      <div style={etichetta(tema)}>{t('ID del numero di telefono')}</div>
      <input value={numero} onChange={e => setNumero(e.target.value)}
        autoComplete="off" className={classeCampo(tema)} style={campo(tema)} />

      <div style={{ ...etichetta(tema), marginTop: 12 }}>{t('Token permanente')}</div>
      <input type="password" value={token} onChange={e => setToken(e.target.value)}
        autoComplete="new-password" className={classeCampo(tema)} style={campo(tema)} />

      <div style={{ ...etichetta(tema), marginTop: 12 }}>{t('Segreto dell’app')}</div>
      <input type="password" value={segreto} onChange={e => setSegreto(e.target.value)}
        autoComplete="new-password" className={classeCampo(tema)} style={campo(tema)} />
      <div style={{ ...nota(tema), marginTop: 6 }}>
        {t('È quello che firma i messaggi in arrivo: senza, quell’indirizzo non saprebbe distinguere Meta da chiunque altro.')}
      </div>

      <div style={{ ...etichetta(tema), marginTop: 12 }}>{t('Parola d’ordine del webhook')}</div>
      <input value={parola} onChange={e => setParola(e.target.value)}
        placeholder={t('inventala, e riscrivila su Meta')} autoComplete="off"
        className={classeCampo(tema)} style={campo(tema)}
        onKeyDown={e => { if (e.key === 'Enter' && pronto) collega() }} />
      <div style={{ ...nota(tema), marginTop: 6 }}>
        {t('Su Meta, come URL del webhook metti il tuo indirizzo pubblico seguito da /api/whatsapp/webhook, e iscriviti al campo «messages».')}
      </div>

      <Errore testo={err} />
      <Conferma onClick={collega} occupato={occupato} disabilitato={!pronto} tema={tema}>{t('Collega WhatsApp')}</Conferma>
    </div>
  )
}

export function Form({ id, tema, ok }: { id: string } & Props) {
  if (id === 'google') return <FormGoogle tema={tema} ok={ok} />
  if (id === 'claude') return <FormClaude tema={tema} ok={ok} />
  if (id === 'compatibile') return <FormCompatibile tema={tema} ok={ok} />
  if (id === 'posta') return <FormPosta tema={tema} ok={ok} />
  if (id === 'desktop') return <FormDesktop tema={tema} ok={ok} />
  if (id === 'notion') return <FormNotion tema={tema} ok={ok} />
  if (id === 'slack') return <FormSlack tema={tema} ok={ok} />
  if (id === 'drive') return <FormDrive tema={tema} ok={ok} />
  // due schede diverse, lo stesso modulo con dentro una parola diversa: sono
  // due permessi, e la schermata del consenso di Microsoft lo dirà
  if (id === 'microsoft') return <FormMicrosoft tema={tema} ok={ok} parte="posta" />
  if (id === 'sharepoint') return <FormMicrosoft tema={tema} ok={ok} parte="file" />
  if (id === 'dropbox') return <FormDropbox tema={tema} ok={ok} />
  if (id === 'whatsapp') return <FormWhatsapp tema={tema} ok={ok} />
  return null
}
