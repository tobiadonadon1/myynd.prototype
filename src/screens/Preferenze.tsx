import { useCallback, useEffect, useState } from 'react'
import { api, sessione, type ChatGPT, type ClaudeCon } from '../api'
import { campo, classeCampo, etichetta } from '../components/forms'
import { frasi, t } from '../lingua'
import { CARD_GLASS, Hov, LABEL, daTastiera, knob, track } from '../ui'
import { IconAvanti } from '../icons'
import type { Vals } from '../vals'
import { acceleratore, avvisiAccesi, desktop, impostaAvvisi, nomePiattaforma, simboli, soloModificatore, type Aggiornamento } from '../desktop'
import './preferenze.css'
import { nomePianoChatGPT } from '../chatgpt-accesso.ts'

/** Il bottone di seconda fila, com'è in «Il tuo accesso» e nel fascicolo. */
const SECONDARIO: React.CSSProperties = {
  flex: 'none', padding: '11px 20px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
  border: '1px solid rgba(var(--inchiostro-rgb),.18)', background: 'rgba(var(--luce-rgb),.6)', color: 'rgba(var(--inchiostro-rgb),.78)', fontSize: '13px'
}

/**
 * L'app da scrivania: quello che sa fare il guscio e il sito no.
 *
 * Si vede solo dentro l'app. Sono le quattro cose che una persona tocca una
 * volta e poi dimentica: la scorciatoia che porta Myynd davanti da qualunque
 * programma, se parte da solo all'accesso, gli aggiornamenti, e dove stanno i
 * file. La scorciatoia si cambia premendola — non scrivendola — perché
 * «CommandOrControl+Shift+M» non è una cosa che si chiede a nessuno di sapere.
 *
 * Quando l'app non può aggiornarsi lo dice con una frase e basta, senza un
 * bottone spento accanto: un «Controlla» che non controlla niente insegna a
 * non fidarsi degli altri.
 */
function LApp() {
  const d = desktop()
  const [acc, setAcc] = useState('')
  const [registro, setRegistro] = useState(false)
  const [avvio, setAvvio] = useState<boolean | null>(null)
  const [avvisi, setAvvisi] = useState(avvisiAccesi)
  const [agg, setAgg] = useState<Aggiornamento | null>(null)
  const [chiedo, setChiedo] = useState(false)
  const [dati, setDati] = useState('')
  const [guaio, setGuaio] = useState('')

  useEffect(() => {
    if (!d) return
    d.scorciatoia().then(setAcc).catch(() => {})
    d.avvioAutomatico().then(setAvvio).catch(() => {})
    // la cartella vera, non `home + '/.myynd'`: con MYYND_DATI è un'altra
    api.stato().then(s => setDati(s.dati || (s.home ? `${s.home}/.myynd` : ''))).catch(() => {})
    // gli eventi già mandati prima che questa scheda esistesse non tornano:
    // si chiede com'è adesso, e da lì in poi si ascolta
    d.aggiornamenti.attuale().then(setAgg).catch(() => {})
    return d.aggiornamenti.stato(setAgg)
  }, [d])

  /*
   * La registrazione: il prossimo tasto premuto è la scorciatoia nuova.
   *
   * In cattura e su `window`, così arriva prima di qualunque campo o
   * scorciatoia della pagina — ⌘K aprirebbe la ricerca invece di diventare
   * la combinazione. Esc lascia com'era; un modificatore da solo aspetta.
   */
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
      d.impostaScorciatoia(nuovo)
        .then(r => { if (r.ok) setAcc(nuovo); else setGuaio(r.errore ? t(r.errore) : t('Non sono riuscito a cambiare la scorciatoia.')) })
        .catch(e => setGuaio(e instanceof Error ? t(e.message) : String(e)))
    }
    window.addEventListener('keydown', alTasto, true)
    return () => window.removeEventListener('keydown', alTasto, true)
  }, [registro, d])

  if (!d) return null

  const cambiaAvvio = async () => {
    const nuovo = !avvio
    setAvvio(nuovo); setGuaio('')
    try { await d.impostaAvvioAutomatico(nuovo) }
    catch (e) { setAvvio(!nuovo); setGuaio(e instanceof Error ? t(e.message) : String(e)) }
  }

  const controlla = async () => {
    setChiedo(true); setGuaio('')
    try { setAgg(await d.aggiornamenti.controlla()) }
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
  const mac = d.piattaforma === 'darwin'

  const RIGA: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }
  const TESTO: React.CSSProperties = { flex: 1, minWidth: 0 }
  const NOTA: React.CSSProperties = { fontSize: '12.5px', lineHeight: 1.55, color: 'rgba(var(--inchiostro-rgb),.65)', marginTop: 4, textWrap: 'pretty', overflowWrap: 'anywhere' }

  return (
    <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: 20, padding: '18px 22px' }}>
      <div style={LABEL}>{t('L’app')}</div>

      <div style={{ ...RIGA, marginTop: 12 }}>
        <div style={TESTO}>
          <div style={{ fontSize: 15 }}>{t('Versione')} {d.versione} · {nomePiattaforma(d.piattaforma)}</div>
          <div style={NOTA}>{rigaAggiornamenti()}</div>
        </div>
        {agg?.stato === 'pronta' ? (
          <button type="button" onClick={() => d.aggiornamenti.installa()} style={{
            flex: 'none', padding: '11px 20px', borderRadius: 99, border: 'none',
            background: 'linear-gradient(120deg,var(--rame-profondo),var(--ambra))', color: 'var(--avorio)',
            fontSize: '13.5px', fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer'
          }}>{t('Riavvia e aggiorna')}</button>
        ) : agg?.stato !== 'spento' && (
          <button type="button" onClick={controlla} disabled={inCorso} style={{ ...SECONDARIO, cursor: inCorso ? 'default' : 'pointer', opacity: inCorso ? 0.6 : 1 }}>
            {inCorso ? t('Controllo…') : t('Controlla')}
          </button>
        )}
      </div>

      <div style={RIGA}>
        <div style={TESTO}>
          {registro
            ? <div style={{ fontSize: 15 }}>{t('Premi la combinazione nuova…')}</div>
            : <div style={{ fontSize: 15 }}>
                <span style={{ background: 'rgba(var(--inchiostro-rgb),.07)', padding: '2px 9px', borderRadius: 7, letterSpacing: '.06em' }}>{acc ? simboli(acc, d.piattaforma) : '…'}</span>
              </div>}
          <div style={NOTA}>
            {registro
              ? t('Esc lascia com’è.')
              : t('Apre il richiamo da qualunque programma.')}
          </div>
        </div>
        <button type="button" onClick={() => { setGuaio(''); setRegistro(r => !r) }} style={SECONDARIO}>
          {registro ? t('Annulla') : t('Cambia')}
        </button>
      </div>

      <div style={RIGA}>
        <div style={TESTO}>
          <div style={{ fontSize: 15 }}>{t('Si apre all’accesso')}</div>
          <div style={NOTA}>{t('Myynd parte da solo quando entri nel computer.')}</div>
        </div>
        <button type="button" role="switch" aria-checked={!!avvio} aria-label={t('Si apre all’accesso')}
          disabled={avvio === null} onClick={cambiaAvvio} style={track(!!avvio)}><span style={knob()} /></button>
      </div>

      {/* Spento finché non lo si accende: il brief vuole un'app quieta, e un
          avviso è un'interruzione che si sceglie. */}
      <div style={RIGA}>
        <div style={TESTO}>
          <div style={{ fontSize: 15 }}>{t('Avvisami quando una bozza è pronta')}</div>
          <div style={NOTA}>{t('Un avviso di sistema, solo se Myynd non è davanti.')}</div>
        </div>
        <button type="button" role="switch" aria-checked={avvisi} aria-label={t('Avvisami quando una bozza è pronta')}
          onClick={() => { impostaAvvisi(!avvisi); setAvvisi(!avvisi) }} style={track(avvisi)}><span style={knob()} /></button>
      </div>

      <div style={RIGA}>
        <div style={TESTO}>
          <div style={{ fontSize: 15 }}>{t('I tuoi dati')}</div>
          <div style={NOTA}>
            <code style={{ background: 'rgba(var(--inchiostro-rgb),.07)', padding: '1px 6px', borderRadius: 5 }}>{dati || '~/.myynd'}</code>
          </div>
        </div>
        <button type="button" disabled={!dati} onClick={() => { d.mostraNelFinder(dati).catch(() => {}) }} style={{ ...SECONDARIO, opacity: dati ? 1 : 0.6 }}>
          {mac ? t('Mostra nel Finder') : t('Mostra la cartella dei dati')}
        </button>
      </div>

      {guaio && <div style={{ fontSize: '12.5px', color: 'var(--rame-testo)', marginTop: 10, overflowWrap: 'anywhere' }}>{guaio}</div>}
    </div>
  )
}


/**
 * Il fondo in movimento è bello e costa: le macchie sfocate stanno dietro a
 * pannelli con backdrop-filter, e ogni loro fotogramma obbliga a rifare la
 * sfocatura. Su qualche macchina si vede tremolare. Chi non lo vuole lo spegne,
 * e resta il colore — non l'ho tolto a tutti per un problema di alcuni.
 */
/** Il campo del fuoco: stato suo, di nessun altro. */
function CampoFuoco({ v }: { v: Vals }) {
  const [testo, setTesto] = useState(v.fuoco)
  // si riallinea solo quando il valore vero cambia — cioè al caricamento e al
  // salvataggio. Mentre scrivi, nessun caricamento in sottofondo può toccarlo.
  useEffect(() => { setTesto(v.fuoco) }, [v.fuoco])

  return (
    <>
      <div style={{ display: 'flex', gap: 9, marginTop: 14 }}>
        <input
          value={testo}
          onChange={e => setTesto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') v.salvaFuoco(testo) }}
          placeholder={t('Questa settimana solo i preventivi e i pagamenti')}
          style={{
            flex: 1, minWidth: 0, padding: '12px 15px', borderRadius: 13,
            border: '1px solid rgba(var(--inchiostro-rgb),.18)', background: 'rgba(var(--luce-rgb),.75)',
            color: 'var(--inchiostro)', fontSize: '14px', fontFamily: 'inherit', outline: 'none'
          }} />
        <button onClick={() => v.salvaFuoco(testo)} style={{
          flex: 'none', padding: '12px 22px', borderRadius: 99, border: 'none',
          background: 'linear-gradient(120deg,var(--rame-profondo),var(--ambra))', color: 'var(--avorio)',
          fontSize: '13.5px', fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer'
        }}>{t('Salva')}</button>
      </div>

      {/*
        Chi ha scritto quella riga.

        Stessa nota che sta sotto gli argomenti, e per la stessa ragione: il
        campo restava vuoto perché «su cosa vuoi che mi concentri adesso?» non
        è una domanda a cui si risponde in astratto. Adesso, se è vuoto, lo
        scrive Myynd da quello che ha in lista — e lo dice, perché una riga
        comparsa da sola che nessuno dichiara è peggio di una riga vuota.
      */}
      {v.fuocoDaMe && !!v.fuoco && (
        <div style={{
          marginTop: 9, fontSize: '12px', color: 'rgba(var(--inchiostro-rgb),.5)', textWrap: 'pretty'
        }}>
          {t('L’ha scritto Myynd dalle tue attività e dai tuoi progetti. Se non torna, correggilo.')}
        </div>
      )}
    </>
  )
}

/**
 * Gli argomenti della rassegna.
 *
 * Gemello del fuoco, e vale la pena tenerli distinti anche qui sotto gli occhi:
 * il fuoco dice a Myynd dove guardare *dentro* — nella posta, nei file, in
 * quello che ti riguarda — questo dice cosa cercare *fuori*, nei giornali.
 * Mescolarli vorrebbe dire che chi si concentra sui preventivi smette di
 * ricevere notizie dal mondo, che non è quello che ha chiesto.
 *
 * Vuoto è una risposta buona e va detto: chi non sa ancora cosa gli interessa
 * non deve sentirsi davanti a un campo obbligatorio.
 */
/**
 * Portarsi il proprio Myynd da un'altra parte.
 *
 * Esiste perché la cosa più ovvia — «ce l'ho qui, lo rivoglio là» — non aveva
 * nessuna strada che non passasse dalla riga di comando di chi ospita: una
 * cosa che si può chiedere a chi sviluppa, non a chi usa. Un file che si
 * scarica di qua e si carica di là non chiede di sapere niente.
 *
 * La riga sulle credenziali sta in alto e non in fondo. Quel file apre la
 * casella di posta di chi l'ha fatto, e chi lo scarica deve saperlo *prima* di
 * lasciarlo nei Download per sei mesi.
 */
/**
 * Il conto: la password si cambia da qui, e le sessioni si chiudono da qui.
 * Prima l'unica strada era la riga di comando di chi ospita — cioè nessuna,
 * per chi usa.
 */
/**
 * Quanto è costato ragionare, e dove sta il tetto.
 *
 * Prima «perché ho speso sei dollari in tre giorni» non aveva un posto in
 * cui trovare risposta. Qui si vede oggi e gli ultimi giorni, in token — che
 * è quello che si paga — e si mette un tetto oltre il quale Myynd smette di
 * chiamare il modello fino a domani.
 */
function Uso() {
  const [u, setU] = useState<Awaited<ReturnType<typeof api.uso>> | null>(null)
  const [tetto, setTetto] = useState('')
  const [salvo, setSalvo] = useState(false)
  const [guaio, setGuaio] = useState('')
  useEffect(() => {
    // un errore qui faceva sparire la carta intera, senza dire niente: è la
    // stessa distinzione fra «vuoto» e «guasto» che vale per il feed e la mappa
    api.uso()
      .then(x => { setU(x); setTetto(x.oggi.tetto ? String(x.oggi.tetto) : '') })
      .catch(e => setGuaio(e instanceof Error ? t(e.message) : String(e)))
  }, [])

  const salva = async () => {
    const n = Math.max(0, Math.floor(Number(tetto) || 0))
    setSalvo(true); setGuaio('')
    try { await api.profilo({ tetto: n }); setU(await api.uso()) }
    catch (e) { setGuaio(e instanceof Error ? t(e.message) : String(e)) }
    setSalvo(false)
  }

  if (!u) {
    if (!guaio) return null
    return (
      <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: 20, padding: '18px 22px' }}>
        <div style={LABEL}>{t('Quanto ha ragionato')}</div>
        <div style={{ fontSize: '13.5px', color: 'var(--rame-testo)', marginTop: 8, overflowWrap: 'anywhere' }}>{guaio}</div>
      </div>
    )
  }
  const mila = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : String(n)
  const giorni = u.giorni.slice(-7)
  const max = Math.max(1, ...giorni.map(g => g.entrata + g.uscita))

  return (
    <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: 20, padding: '18px 22px' }}>
      <div style={LABEL}>{t('Quanto ha ragionato')}</div>
      <div style={{ fontSize: '13.5px', color: 'rgba(var(--inchiostro-rgb),.65)', lineHeight: 1.55, marginTop: 6, maxWidth: 540, textWrap: 'pretty' }}>
        {u.oggi.chiamate
          ? frasi.usoOggi(u.oggi.chiamate, mila(u.oggi.entrata + u.oggi.uscita), mila(u.oggi.cache))
          : t('Oggi ancora niente.')}
        {u.oggi.raggiunto && <span style={{ color: 'var(--rame-testo)' }}> {t('Tetto raggiunto: si riparte domani.')}</span>}
      </div>
      {giorni.length > 1 && (
        <div aria-hidden="true" style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 44, marginTop: 14, maxWidth: 320 }}>
          {giorni.map(g => {
            const tot = g.entrata + g.uscita
            return <div key={g.giorno} title={`${g.giorno} · ${mila(tot)}`} style={{
              flex: 1, height: `${Math.max(8, Math.round(100 * tot / max))}%`, borderRadius: 3, background: 'rgba(var(--rame-rgb),.55)'
            }} />
          })}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <div style={etichetta('chiaro')}>{t('Tetto al giorno, in token')}</div>
          <input inputMode="numeric" value={tetto} placeholder={t('nessuno')}
            onChange={e => setTetto(e.target.value.replace(/[^\d]/g, ''))}
            onKeyDown={e => { if (e.key === 'Enter') salva() }}
            className={classeCampo('chiaro')} style={{ ...campo('chiaro'), width: 160 }} />
        </div>
        <button onClick={salva} disabled={salvo} style={{
          padding: '10px 18px', borderRadius: 99, border: '1px solid rgba(var(--inchiostro-rgb),.18)', background: 'rgba(var(--luce-rgb),.6)',
          color: 'rgba(var(--inchiostro-rgb),.78)', fontSize: '13px', fontFamily: 'inherit', cursor: salvo ? 'default' : 'pointer'
        }}>{salvo ? t('Un momento…') : t('Salva')}</button>
      </div>
      <div style={{ fontSize: '12.5px', color: 'rgba(var(--inchiostro-rgb),.5)', marginTop: 8 }}>{t('Vuoto vuol dire: nessun tetto. Mille token sono circa una pagina.')}</div>
      {guaio && <div style={{ fontSize: '12.5px', color: 'var(--rame-testo)', marginTop: 8, overflowWrap: 'anywhere' }}>{guaio}</div>}
    </div>
  )
}

function Conto() {
  const [attuale, setAttuale] = useState('')
  const [nuova, setNuova] = useState('')
  const [ripeti, setRipeti] = useState('')
  const [faccio, setFaccio] = useState<'' | 'cambio' | 'esco'>('')
  const [detto, setDetto] = useState('')
  const [guaio, setGuaio] = useState('')

  const cambia = async () => {
    if (nuova !== ripeti) { setGuaio(t('Le due password nuove non coincidono.')); return }
    setFaccio('cambio'); setDetto(''); setGuaio('')
    try {
      await api.cambiaPassword(attuale, nuova)
      setAttuale(''); setNuova(''); setRipeti('')
      setDetto(t('Password cambiata. Gli altri dispositivi dovranno rientrare.'))
    } catch (e) { setGuaio(e instanceof Error ? t(e.message) : String(e)) }
    setFaccio('')
  }

  const esciOvunque = async () => {
    setFaccio('esco'); setGuaio('')
    try { await api.esciOvunque(); sessione.pulisci(); location.reload() }
    catch (e) { setGuaio(e instanceof Error ? t(e.message) : String(e)); setFaccio('') }
  }

  const pronto = attuale.length > 0 && nuova.length >= 8 && ripeti.length >= 8 && !faccio
  const BOTTONE = (acceso: boolean): React.CSSProperties => ({
    padding: '11px 20px', borderRadius: 99, border: 'none',
    background: acceso ? 'linear-gradient(120deg,var(--rame-profondo),var(--ambra))' : 'rgba(var(--inchiostro-rgb),.18)',
    color: acceso ? 'var(--avorio)' : 'rgba(var(--inchiostro-rgb),.5)',
    fontSize: '13.5px', fontWeight: 500, fontFamily: 'inherit', cursor: acceso ? 'pointer' : 'default'
  })

  return (
    <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: 20, padding: '18px 22px' }}>
      <div style={LABEL}>{t('Il tuo accesso')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 6, maxWidth: 640 }}>
        <div>
          <div style={etichetta('chiaro')}>{t('Password attuale')}</div>
          <input type="password" value={attuale} onChange={e => setAttuale(e.target.value)} autoComplete="current-password"
            className={classeCampo('chiaro')} style={campo('chiaro')} />
        </div>
        <div>
          <div style={etichetta('chiaro')}>{t('Password nuova')}</div>
          <input type="password" value={nuova} onChange={e => setNuova(e.target.value)} autoComplete="new-password"
            placeholder={t('otto caratteri')} className={classeCampo('chiaro')} style={campo('chiaro')} />
        </div>
        <div>
          <div style={etichetta('chiaro')}>{t('Ripeti la nuova')}</div>
          <input type="password" value={ripeti} onChange={e => setRipeti(e.target.value)} autoComplete="new-password"
            onKeyDown={e => { if (e.key === 'Enter' && pronto) cambia() }}
            className={classeCampo('chiaro')} style={campo('chiaro')} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={cambia} disabled={!pronto} style={BOTTONE(pronto)}>
          {faccio === 'cambio' ? t('Un momento…') : t('Cambia la password')}
        </button>
        <button onClick={esciOvunque} disabled={!!faccio} style={{
          padding: '11px 20px', borderRadius: 99, cursor: faccio ? 'default' : 'pointer', fontFamily: 'inherit',
          border: '1px solid rgba(var(--inchiostro-rgb),.18)', background: 'rgba(var(--luce-rgb),.6)', color: 'rgba(var(--inchiostro-rgb),.78)', fontSize: '13px'
        }}>{faccio === 'esco' ? t('Un momento…') : t('Esci da tutti i dispositivi')}</button>
      </div>
      {detto && <div style={{ fontSize: '12.5px', color: 'var(--verde-cupo)', marginTop: 10 }}>{detto}</div>}
      {guaio && <div style={{ fontSize: '12.5px', color: 'var(--rame-testo)', marginTop: 10, overflowWrap: 'anywhere' }}>{guaio}</div>}
    </div>
  )
}

/**
 * Come ti chiami, e cosa fai.
 *
 * `/api/profilo` li accetta da sempre e li chiedeva **solo l'onboarding**: una
 * scrittura andata storta là dentro — la rete che salta, una scheda chiusa a
 * metà — e da lì in avanti Myynd ti chiamava «tu» per sempre, senza nessuna
 * schermata da cui rimediare. Due campi non sono una funzione nuova: sono la
 * via d'uscita che mancava a una cosa che si può scrivere una volta sola.
 *
 * Si va a prendere il valore vero invece di leggerlo da `v.nome`, che porta già
 * il ripiego: un campo precompilato con «tu» chiede di cancellare una parola
 * che nessuno ha scritto.
 */
function Identita() {
  const [nome, setNome] = useState('')
  const [ruolo, setRuolo] = useState('')
  const [caricato, setCaricato] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const [detto, setDetto] = useState('')
  const [guaio, setGuaio] = useState('')

  useEffect(() => {
    api.stato()
      .then(s => { setNome(s.config.nome ?? ''); setRuolo(s.config.ruolo ?? ''); setCaricato(true) })
      .catch(e => setGuaio(e instanceof Error ? t(e.message) : String(e)))
  }, [])

  const salva = async () => {
    setSalvo(true); setDetto(''); setGuaio('')
    try {
      await api.profilo({ nome: nome.trim(), ruolo: ruolo.trim() })
      setDetto(t('Salvato.'))
    } catch (e) { setGuaio(e instanceof Error ? t(e.message) : String(e)) }
    setSalvo(false)
  }

  return (
    <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: 20, padding: '18px 22px' }}>
      <div style={LABEL}>{t('Chi sei')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 12, maxWidth: 520 }}>
        <div>
          <div style={etichetta('chiaro')}>{t('Nome')}</div>
          <input value={nome} onChange={e => setNome(e.target.value)} disabled={!caricato}
            onKeyDown={e => { if (e.key === 'Enter' && caricato) salva() }}
            className={classeCampo('chiaro')} style={campo('chiaro')} />
        </div>
        <div>
          <div style={etichetta('chiaro')}>{t('Ruolo')}</div>
          <input value={ruolo} onChange={e => setRuolo(e.target.value)} disabled={!caricato}
            onKeyDown={e => { if (e.key === 'Enter' && caricato) salva() }}
            placeholder={t('titolare, responsabile vendite, …')} className={classeCampo('chiaro')} style={campo('chiaro')} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={salva} disabled={!caricato || salvo} style={{
          padding: '11px 20px', borderRadius: 99, border: 'none',
          background: caricato && !salvo ? 'linear-gradient(120deg,var(--rame-profondo),var(--ambra))' : 'rgba(var(--inchiostro-rgb),.18)',
          color: caricato && !salvo ? 'var(--avorio)' : 'rgba(var(--inchiostro-rgb),.5)',
          fontSize: '13.5px', fontWeight: 500, fontFamily: 'inherit', cursor: caricato && !salvo ? 'pointer' : 'default'
        }}>{salvo ? t('Un momento…') : t('Salva')}</button>
        {detto && <span style={{ fontSize: '12.5px', color: 'var(--verde-cupo)' }}>{detto}</span>}
      </div>
      {guaio && <div style={{ fontSize: '12.5px', color: 'var(--rame-testo)', marginTop: 10, overflowWrap: 'anywhere' }}>{guaio}</div>}
    </div>
  )
}

/**
 * «Dammi tutto quello che avete su di me».
 *
 * Accanto al pacco del trasloco e non dentro, perché sono due cose diverse e
 * confonderle costa: quello sposta un'installazione e **dentro ha le
 * credenziali vere** — apre la casella di posta di chi l'ha fatto — questo si
 * legge, si stampa, si manda a un consulente, e le credenziali non ce le ha.
 * La password si chiede lo stesso: dentro non ci sono chiavi, ma c'è tutta la
 * posta letta.
 */
function Fascicolo() {
  const [password, setPassword] = useState('')
  const [chiedo, setChiedo] = useState(false)
  const [faccio, setFaccio] = useState(false)
  const [detto, setDetto] = useState('')
  const [guaio, setGuaio] = useState('')

  const scarica = async () => {
    if (!password) { setChiedo(true); return }
    setFaccio(true); setDetto(''); setGuaio('')
    try {
      const { nome, dati } = await api.scaricaDati(password)
      setPassword(''); setChiedo(false)
      const url = URL.createObjectURL(dati)
      const a = document.createElement('a')
      a.href = url; a.download = nome; a.click()
      URL.revokeObjectURL(url)
      setDetto(t('Scaricato: è nella cartella dei download.'))
    } catch (e) { setGuaio(e instanceof Error ? t(e.message) : String(e)) }
    setFaccio(false)
  }

  return (
    <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: 20, padding: '18px 22px' }}>
      <div style={LABEL}>{t('Tutto quello che tengo su di te')}</div>
      <div style={{ fontSize: '13.5px', color: 'rgba(var(--inchiostro-rgb),.65)', lineHeight: 1.55, marginTop: 6, maxWidth: 540, textWrap: 'pretty' }}>
        {t('Un file che si legge, con dentro il tuo conto, i documenti, la lista, quello che ho imparato su di te, le chat, le automazioni e quanto è costato. Le password e i token non ci sono: per spostare un’installazione serve il file qui sopra.')}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={scarica} disabled={faccio} style={{
          padding: '11px 20px', borderRadius: 99, cursor: faccio ? 'default' : 'pointer', fontFamily: 'inherit',
          border: '1px solid rgba(var(--inchiostro-rgb),.18)', background: 'rgba(var(--luce-rgb),.6)',
          color: 'rgba(var(--inchiostro-rgb),.78)', fontSize: '13px'
        }}>{faccio ? t('Preparo…') : chiedo ? t('Conferma') : t('Scarica i miei dati')}</button>
        {chiedo && (
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            autoComplete="current-password" placeholder={t('la tua password')}
            onKeyDown={e => { if (e.key === 'Enter' && password) scarica() }}
            className={classeCampo('chiaro')} style={{ ...campo('chiaro'), width: 220, marginTop: 0 }} />
        )}
      </div>
      {detto && <div style={{ fontSize: '12.5px', color: 'var(--verde-cupo)', marginTop: 10 }}>{detto}</div>}
      {guaio && <div style={{ fontSize: '12.5px', color: 'var(--rame-testo)', marginTop: 10, overflowWrap: 'anywhere' }}>{guaio}</div>}
    </div>
  )
}

/**
 * Andarsene.
 *
 * Due cose insieme, e non è una cerimonia: la password dice che è lei, e il
 * proprio indirizzo ricopiato a mano la obbliga a fermarsi un secondo davanti a
 * un gesto che non ha un annulla. Un bottone rosso con «sei sicuro?» si preme
 * per riflesso; ricopiare il proprio indirizzo no.
 *
 * E sopra ai due campi c'è scritto **cosa sparisce**, per esteso. Chi cancella
 * un conto quasi sempre non sa che se ne va anche l'indice — mesi di posta
 * letta — e scoprirlo dopo non serve a niente.
 */
function Cancella() {
  const [aperto, setAperto] = useState(false)
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [faccio, setFaccio] = useState(false)
  const [guaio, setGuaio] = useState('')

  const cancella = async () => {
    setFaccio(true); setGuaio('')
    try {
      await api.cancellaConto(password, email)
      sessione.pulisci()
      location.reload()
    } catch (e) { setGuaio(e instanceof Error ? t(e.message) : String(e)); setFaccio(false) }
  }

  const puo = !!password && !!email.trim() && !faccio

  return (
    <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: 20, padding: '18px 22px' }}>
      <div style={LABEL}>{t('Cancella il conto')}</div>
      <div style={{ fontSize: '13.5px', color: 'rgba(var(--inchiostro-rgb),.65)', lineHeight: 1.55, marginTop: 6, maxWidth: 540, textWrap: 'pretty' }}>
        {t('Sparisce tutto: documenti, lista, chat, memoria, automazioni e fonti. Non si torna indietro.')}
      </div>

      {!aperto ? (
        <button onClick={() => setAperto(true)} style={{
          marginTop: 14, padding: '11px 20px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
          border: '1px solid rgba(var(--rame-rgb),.35)', background: 'rgba(var(--luce-rgb),.6)', color: 'var(--rame-testo)', fontSize: '13px'
        }}>{t('Voglio cancellare il conto')}</button>
      ) : (
        <div style={{
          marginTop: 12, padding: '14px 15px', borderRadius: 14,
          border: '1px solid rgba(var(--rame-rgb),.35)', background: 'rgba(var(--rame-rgb),.08)', maxWidth: 540
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
            <div>
              <div style={etichetta('chiaro')}>{t('La tua password')}</div>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                autoComplete="current-password" className={classeCampo('chiaro')} style={campo('chiaro')} />
            </div>
            <div>
              <div style={etichetta('chiaro')}>{t('Il tuo indirizzo, per conferma')}</div>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="off"
                placeholder={t('tu@tuodominio.it')} className={classeCampo('chiaro')} style={campo('chiaro')} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button onClick={cancella} disabled={!puo} style={{
              padding: '9px 17px', borderRadius: 99, border: 'none', fontFamily: 'inherit', fontSize: '12.5px',
              background: puo ? 'var(--rame-forte)' : 'rgba(var(--inchiostro-rgb),.18)', color: puo ? 'var(--avorio)' : 'rgba(var(--inchiostro-rgb),.5)',
              cursor: puo ? 'pointer' : 'default'
            }}>{faccio ? t('Un momento…') : t('Cancella tutto, per sempre')}</button>
            <button onClick={() => { setAperto(false); setPassword(''); setEmail(''); setGuaio('') }} style={{
              padding: '9px 17px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
              border: '1px solid rgba(var(--inchiostro-rgb),.18)', background: 'rgba(var(--luce-rgb),.6)',
              color: 'rgba(var(--inchiostro-rgb),.7)', fontSize: '12.5px'
            }}>{t('Lascia stare')}</button>
          </div>
          {guaio && <div style={{ fontSize: '12.5px', color: 'var(--rame-testo)', marginTop: 10, overflowWrap: 'anywhere' }}>{guaio}</div>}
        </div>
      )}
    </div>
  )
}

function CampoArgomenti({ v }: { v: Vals }) {
  const [testo, setTesto] = useState(v.argomenti)
  const [salvato, setSalvato] = useState(false)
  const [gusto, setGusto] = useState('')
  const [chiedo, setChiedo] = useState(false)
  const [detto, setDetto] = useState('')
  useEffect(() => { setTesto(v.argomenti) }, [v.argomenti])

  // quello che ha notato da come leggi: si chiede una volta, all'apertura
  useEffect(() => { api.rassegna().then(r => setGusto(r.gusto)).catch(() => {}) }, [])

  const salva = () => {
    v.salvaArgomenti(testo)
    setSalvato(true)
    setTimeout(() => setSalvato(false), 1800)
  }

  /**
   * La proposta, che si mette nel campo e non ci si scrive da sola.
   *
   * Chi ha scritto quella riga se la tiene: qui si riempie la casella e basta,
   * e a salvare ci pensa lei. La differenza fra le due cose è tutto quello che
   * separa un aiuto da una cosa che ti riscrive addosso.
   */
  const proponi = async () => {
    setChiedo(true); setDetto('')
    try {
      const r = await api.proponiArgomenti()
      if (r.argomenti) { setTesto(r.argomenti); setDetto(t('Guarda se ti torna, poi salva.')) }
      else setDetto(t('Non ho ancora abbastanza per dire cosa ti interessa.'))
    } catch { setDetto(t('Non ce l’ha fatta.')) }
    setChiedo(false)
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 9, marginTop: 14 }}>
        <input
          value={testo}
          onChange={e => setTesto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') salva() }}
          placeholder={t('intelligenza artificiale, startup, Medio Oriente, mercati')}
          style={{
            flex: 1, minWidth: 0, padding: '12px 15px', borderRadius: 13,
            border: '1px solid rgba(var(--inchiostro-rgb),.18)', background: 'rgba(var(--luce-rgb),.75)',
            color: 'var(--inchiostro)', fontSize: '14px', fontFamily: 'inherit', outline: 'none'
          }} />
        <button onClick={salva} style={{
          flex: 'none', padding: '12px 22px', borderRadius: 99, border: 'none',
          background: 'linear-gradient(120deg,var(--rame-profondo),var(--ambra))', color: 'var(--avorio)',
          fontSize: '13.5px', fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer'
        }}>{salvato ? t('Salvato') : t('Salva')}</button>
      </div>

      {/*
        Quello che ha imparato guardandoti leggere.

        Sta qui sotto e non dentro il campo perché non è una cosa che hai
        scritto tu: è una cosa che ha concluso lui. Tenerle separate è quello
        che permette di crederci — e di correggerlo scrivendo sopra nel campo,
        che è l'unica leva che deve avere chi non è d'accordo.
      */}
      {/*
        Chi ha scritto quella riga.

        Il campo restava vuoto per sempre, e non per distrazione: «su cosa vuoi
        essere tenuto aggiornato?» è una domanda a cui non si risponde davanti a
        una casella di testo. Adesso, se è vuoto, lo scrive Myynd da quello che
        apri davvero — e lo dice, perché una riga comparsa da sola che nessuno
        dichiara è peggio di una riga vuota.
      */}
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap',
        marginTop: 9, fontSize: '12px', color: 'rgba(var(--inchiostro-rgb),.5)'
      }}>
        {v.argomentiDaMe && !!v.argomenti && (
          <span style={{ textWrap: 'pretty' }}>
            {t('L’ho scritto io, da quello che apri. Se lo cambi, resta tuo.')}
          </span>
        )}
        <Hov as="button" type="button" onClick={proponi} disabled={chiedo}
          style={{
            border: 'none', background: 'none', padding: 0, fontFamily: 'inherit',
            fontSize: '12px', color: 'var(--rame-testo)', cursor: chiedo ? 'default' : 'pointer'
          }}
          hover={chiedo ? {} : { color: 'var(--rame)' }}>
          {chiedo ? t('Guardo…') : t('Scrivilo da quello che faccio e leggo')}
        </Hov>
        {detto && <span>{detto}</span>}
      </div>

      {gusto && (
        <div style={{
          marginTop: 12, padding: '10px 13px', borderRadius: 12,
          background: 'rgba(var(--inchiostro-rgb),.05)', border: '1px solid rgba(var(--inchiostro-rgb),.07)'
        }}>
          <div style={{ ...LABEL, fontSize: '10.5px', color: 'rgba(var(--inchiostro-rgb),.45)' }}>
            {t('Da come leggi')}
          </div>
          <div style={{ fontSize: '12.5px', lineHeight: 1.55, color: 'rgba(var(--inchiostro-rgb),.7)', marginTop: 5, textWrap: 'pretty' }}>
            {gusto}
          </div>
        </div>
      )}
    </>
  )
}

/**
 * Con chi ragiona Myynd: una scelta sola, con tre strade.
 *
 * Anthropic, OpenAI, o un modello sul proprio computer (e chiunque parli la
 * lingua di OpenAI). Le prime due sono le due schede delle Fonti: ognuna si
 * collega con l'account che uno paga già o con una chiave a consumo, e
 * *come* è collegata lo dice la riga sotto il nome. Qui si sceglie solo chi
 * lavora; per collegare o cambiare strada c'è il bottone, che apre la scheda.
 *
 * Era una riga per ogni modo di pagare — ChatGPT, Claude con la chiave,
 * Claude Code, un altro fornitore — con tre righe di spiegazione ciascuna.
 * Quattro righe per tre fornitori: si leggevano tutte per capire quale fosse
 * accesa. Adesso è un fornitore per riga, e una riga per fornitore.
 *
 * Siccome Myynd è stato messo a punto su Claude, scegliere un altro si può,
 * ma con l'avviso scritto sotto e non in una nota a piè di pagina: la
 * qualità non deve calare in silenzio.
 */
/** «Ollama · qwen3.5:9b»: il nome che gli ha dato lei, e il modello che lavora davvero. */
function chiEComeSiChiama(f: NonNullable<Vals['compatibile']>): string {
  return [f.nome, f.modello].filter(Boolean).join(' · ')
}

function Motore({ v, avvisa }: { v: Vals; avvisa: (testo: string) => void }) {
  type Via = 'claude' | 'openai' | 'compatibile'
  const [s, setS] = useState<ClaudeCon | null>(null)
  const [chatgpt, setChatgpt] = useState<ChatGPT | null>(null)
  const [occupato, setOccupato] = useState(false)
  const guarda = useCallback(() => { api.claude().then(setS).catch(() => setS(null)) }, [])
  // e si rilegge quando cambia quello che è collegato: la scheda si apre
  // sopra questa schermata, e chiudendola la riga deve dire «pronto» senza
  // che uno esca e rientri
  useEffect(() => { guarda() }, [guarda, v.claudeOn, v.compatibile, v.motore])
  useEffect(() => {
    const controller = new AbortController()
    api.chatgpt(controller.signal).then(r => { if (!controller.signal.aborted) setChatgpt(r) })
      .catch(() => { if (!controller.signal.aborted) setChatgpt(null) })
    return () => controller.abort()
  }, [v.motore, v.claudeOn, v.openai])

  const f = v.compatibile
  const o = v.openai

  /*
   * Il modello di casa, provato davvero, all'apertura della scheda.
   *
   * Questa riga diceva solo *cosa* era collegato — nome, modello, indirizzo —
   * e non se funzionava. Ma un modello sul proprio computer è una cosa che si
   * spegne: si chiude Ollama, si riavvia il portatile, e la riga continua a
   * dire «In uso» mentre la chat non risponde più. Si prova, e si dice in
   * quanto ha risposto. Solo in casa: la rotta che prova riscrive la
   * configurazione con quello che le si manda, e la chiave di un fornitore
   * in rete qui non ce l'abbiamo.
   */
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
  // Claude è collegato con la chiave, o con l'account scelto e in cui si è entrati
  const conAccountClaude = !!s?.abbonamentoPossibile && s.con === 'abbonamento' && s.abbonamento.entrato
  const claudeCollegato = !!s && (s.chiave.collegata || conAccountClaude)
  const accountChatGPT = !!chatgpt?.entrato
  const openaiCollegato = accountChatGPT || !!o?.collegato
  const accountChatGPTInUso = v.motore === 'chatgpt' && !!chatgpt?.acceso

  /** Da quale strada passa, detto in una riga. Vuoto = niente da dire. */
  const dettaglio = (via: Via): string | undefined => {
    if (via === 'claude') {
      if (!claudeCollegato) return undefined
      return conAccountClaude && (s?.con === 'abbonamento') ? t('Con il tuo account, tramite Claude Code') : t('Con la chiave API')
    }
    if (via === 'openai') {
      if (accountChatGPTInUso || (accountChatGPT && v.motore !== 'openai')) {
        return [t('ChatGPT, con il tuo account'), chatgpt?.email, nomePianoChatGPT(chatgpt?.piano)].filter(Boolean).join(' · ')
      }
      return o?.collegato ? [t('Con la chiave API'), o.modello].join(' · ') : undefined
    }
    if (!f) return undefined
    // l'indirizzo può essere lungo: si spezza, non sfora. E davanti, quando
    // si è potuto misurare, quello che conta di più: risponde, e in quanto
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
    if (via === 'claude') return claudeCollegato || !s ? '' : t('Non ancora collegato.')
    if (via === 'openai') return openaiCollegato || !chatgpt ? '' : t('Non ancora collegato.')
    return f ? '' : t('Non ancora collegato.')
  }

  const scegli = async (via: Via) => {
    if (occupato) return
    // finché non si sa cosa c'è, un clic non deve aprire schede a caso
    if (via === 'claude' && !s) return
    // premere di nuovo la riga scelta serve solo a svegliare l'account dopo un
    // guasto: il server azzera il riposo e riprova alla richiesta successiva
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
      // l'account prima della chiave: è quello che non manda una bolletta
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
    <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: 20, padding: '18px 22px' }}>
      <div style={LABEL}>{t('Con quale motore lavora')}</div>
      <div role="radiogroup" aria-label={t('Con quale motore lavora')} style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 12 }}>
        {vie.map(x => {
          const scelto = attuale === x.id
          const guaio = manca(x.id)
          const riga = dettaglio(x.id)
          const spento = x.id === 'openai' && scelto && v.motore === 'chatgpt' && chatgpt && !chatgpt.acceso
          return (
            // dentro c'è il bottone «Gestisci»: la riga tiene il ruolo, non il tag
            <div key={x.id} role="radio" aria-checked={scelto} tabIndex={0}
              onClick={() => scegli(x.id)} onKeyDown={daTastiera(() => scegli(x.id))} style={{
                display: 'flex', gap: 13, alignItems: 'flex-start', padding: '13px 14px', borderRadius: 16, cursor: 'pointer',
                background: scelto ? 'rgba(var(--luce-rgb),.85)' : 'transparent',
                boxShadow: scelto ? '0 12px 30px rgba(var(--ombra-rgb),.1)' : 'none'
              }}>
              <span style={{
                width: 15, height: 15, flex: 'none', borderRadius: '50%', marginTop: 3,
                border: scelto ? '4px solid var(--rame)' : '1.5px solid rgba(var(--inchiostro-rgb),.35)',
                background: scelto ? 'var(--avorio)' : 'transparent'
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 15, overflowWrap: 'anywhere', flex: 1, minWidth: 0 }}>{x.titolo}</span>
                  <span className={`prefs-status ${guaio || spento ? 'needs-attention' : 'ready'}`}>
                    {spento ? t('Disattivato in Myynd') : guaio ? t('Da collegare') : scelto ? t('In uso') : t('Pronto')}
                  </span>
                  <Hov as="button" type="button"
                    onClick={(e: React.MouseEvent) => { e.stopPropagation(); x.apri() }}
                    style={{ flex: 'none', border: '1px solid rgba(var(--inchiostro-rgb),.18)', background: 'rgba(var(--luce-rgb),.7)', borderRadius: 99, padding: '5px 12px', color: 'var(--inchiostro)', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}
                    hover={{ borderColor: 'var(--rame)', color: 'var(--rame-testo)' }}>
                    {x.collegato ? t('Gestisci') : t('Collega')}
                  </Hov>
                </div>
                {/* da quale strada passa, o cosa manca: sotto il nome, in una riga */}
                {(riga || guaio) && (
                  <div style={{ fontSize: '12.5px', marginTop: 5, color: guaio ? 'var(--rame-testo)' : 'rgba(var(--inchiostro-rgb),.65)', overflowWrap: 'anywhere', textWrap: 'pretty' }}>
                    {riga ?? guaio}
                  </div>
                )}
                {scelto && x.id === 'claude' && s?.con === 'abbonamento' && s.abbonamento.inRiposo && (
                  <div style={{ fontSize: '12px', color: 'var(--rame-testo)', marginTop: 6, display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span>{t('L’ultima volta non ha risposto: per qualche minuto uso la chiave.')}</span>
                    <span style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>{t('Riprova adesso')}</span>
                  </div>
                )}
                {/*
                  Un modello che ci mette più di dieci secondi a cominciare non
                  è «un po' lento»: è la chat che sembra rotta, ed è la cosa che
                  lui ha raccontato per prima. Dirlo qui, con la via d'uscita.
                */}
                {scelto && x.id === 'compatibile' && velocita?.ok && velocita.ms > LENTO && (
                  <div style={{ fontSize: '12.5px', color: 'var(--rame-testo)', marginTop: 8, textWrap: 'pretty' }}>
                    {t('Questo modello è lento sul tuo computer: prova uno più piccolo.')}
                  </div>
                )}
                {scelto && x.id !== 'claude' && (
                  <div style={{
                    fontSize: '12.5px', lineHeight: 1.55, marginTop: 10, padding: '10px 13px', borderRadius: 12,
                    border: '1px solid rgba(var(--rame-rgb),.28)', background: 'rgba(var(--rame-rgb),.07)', color: 'var(--rame-testo)',
                    textWrap: 'pretty'
                  }}>
                    {t('Myynd è stato messo a punto su Claude. Con un altro modello le risposte possono essere meno precise — soprattutto le bozze e le fonti citate: rileggile prima di fidarti.')}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** La pastiglia di un modello: scelta, di rame; altrimenti solo il bordo. */
function pastigliaModello(scelta: boolean): React.CSSProperties {
  return scelta
    ? { padding: '7px 14px', borderRadius: 99, border: '1px solid rgba(var(--luce-rgb),.5)', background: 'linear-gradient(120deg,var(--rame-profondo),var(--ambra))', color: 'var(--avorio)', fontFamily: 'inherit', fontSize: '12.5px', fontWeight: 500, cursor: 'pointer' }
    : { padding: '7px 14px', borderRadius: 99, border: '1px solid rgba(var(--inchiostro-rgb),.2)', background: 'rgba(var(--luce-rgb),.5)', color: 'var(--inchiostro)', fontFamily: 'inherit', fontSize: '12.5px', cursor: 'pointer' }
}

/**
 * Quale modello di Claude, per quale lavoro.
 *
 * Era una scelta sola — un modello per tutto — con tre righe di spiegazione
 * per modello. Ma il lavoro non è uno: dare un titolo a una chat e scrivere
 * una bozza che esce dall'azienda non valgono la stessa spesa, e chi paga
 * deve poterlo dire senza conoscere la tabella dei lavori. Tre righe, una
 * per livello, e su ognuna i tre modelli come pastiglie: si legge in un
 * colpo d'occhio dove si spende, e si cambia con un clic.
 *
 * Sta nelle preferenze e non nel codice perché è una scelta di costo. Si vede
 * solo quando è Claude a lavorare: con un altro motore il modello lo dice la
 * sua scheda.
 */
function Modelli({ v }: { v: Vals }) {
  return (
    <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: 20, padding: '18px 22px' }}>
      <div style={LABEL}>{t('Quale modello, per quale lavoro')}</div>
      <div style={{ fontSize: '12.5px', color: 'rgba(var(--inchiostro-rgb),.65)', marginTop: 6, lineHeight: 1.5, maxWidth: 520, textWrap: 'pretty' }}>
        {t('Haiku costa un decimo di Sonnet, Opus cinque volte tanto. Scegli dove spendere.')}
      </div>
      <div style={{ marginTop: 8 }}>
        {v.livelli.map(l => (
          <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '12px 0', borderTop: '1px solid rgba(var(--inchiostro-rgb),.08)' }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 14 }}>{l.titolo}</div>
              <div style={{ fontSize: '12px', lineHeight: 1.45, color: 'rgba(var(--inchiostro-rgb),.6)', marginTop: 2, textWrap: 'pretty' }}>{l.nota}</div>
            </div>
            <div role="radiogroup" aria-label={l.titolo} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {v.modelli.map(m => (
                <button key={m.id} type="button" role="radio" aria-checked={l.scelto === m.id} title={m.nota}
                  onClick={() => { if (l.scelto !== m.id) l.scegli(m.id) }} style={pastigliaModello(l.scelto === m.id)}>{m.nome}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Quale modello di OpenAI, per quale lavoro.
 *
 * La stessa carta di Claude, con una differenza che decide la forma: i modelli
 * non sono tre nostri, sono quelli del catalogo — dell'API con la chiave, del
 * piano con l'account — e possono essere venti. Quindi un menù per riga, non
 * le pastiglie. Con l'account, la prima voce è «il modello del piano»: è
 * quello che lavora finché non si sceglie altro.
 */
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
  if (!via || !scelti) return null

  const scegli = (livello: 'casa' | 'media' | 'frontiera', modello: string) => {
    const nuovi = { ...scelti, [livello]: modello }
    setScelti(nuovi)
    api.scegliModelliOpenAI(nuovi).catch(() => { v.mostraToast(t('Non sono riuscito a salvare la preferenza.')); v.ricaricaStato() })
  }
  // il modello scelto resta in lista anche se il catalogo non è arrivato: un
  // menù che non mostra quello che c'è scritto sembra rotto
  const opzioni = (attuale: string) => [...new Set([...(attuale && !catalogo.includes(attuale) ? [attuale] : []), ...catalogo])]

  return (
    <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: 20, padding: '18px 22px' }}>
      <div style={LABEL}>{t('Quale modello, per quale lavoro')}</div>
      <div style={{ fontSize: '12.5px', color: 'rgba(var(--inchiostro-rgb),.65)', marginTop: 6, lineHeight: 1.5, maxWidth: 520, textWrap: 'pretty' }}>
        {via === 'account' ? t('I modelli del tuo piano ChatGPT. Vuoto: quello predefinito del piano.') : t('I modelli della tua chiave OpenAI. Il più piccolo per il lavoro di servizio, il migliore per quello che firmi.')}
      </div>
      {guaio && <div style={{ fontSize: '12.5px', color: 'var(--rame-testo)', marginTop: 8 }}>{guaio}</div>}
      <div style={{ marginTop: 8 }}>
        {v.livelli.map(l => (
          <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '12px 0', borderTop: '1px solid rgba(var(--inchiostro-rgb),.08)' }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 14 }}>{l.titolo}</div>
              <div style={{ fontSize: '12px', lineHeight: 1.45, color: 'rgba(var(--inchiostro-rgb),.6)', marginTop: 2, textWrap: 'pretty' }}>{l.nota}</div>
            </div>
            <select aria-label={l.titolo} value={scelti[l.id]} onChange={e => scegli(l.id, e.target.value)}
              className={classeCampo('chiaro')} style={{ ...campo('chiaro'), width: 'auto', minWidth: 200, maxWidth: '100%', padding: '8px 12px', fontSize: '13px' }}>
              {via === 'account' && <option value="">{t('Il modello del piano')}</option>}
              {opzioni(scelti[l.id]).map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Preferenze({ v }: { v: Vals }) {
  type Sezione = 'myynd' | 'intelligenza' | 'dati' | 'account'
  const [sezione, setSezione] = useState<Sezione>('myynd')
  const sezioni: { id: Sezione; titolo: string; nota: string }[] = [
    { id: 'myynd', titolo: 'Myynd', nota: t('Priorità, autonomia e voce') },
    { id: 'intelligenza', titolo: t('Intelligenza e costi'), nota: t('Modello, chiave e utilizzo') },
    { id: 'dati', titolo: t('Dati e fonti'), nota: t('Fonti, memoria e trasferimento') },
    { id: 'account', titolo: t('Account e app'), nota: t('Accesso, notifiche e sicurezza') }
  ]
  const attuale = sezioni.find(s => s.id === sezione)!

  return (
    <main className="prefs-page">
      <header className="prefs-header">
        <h1>{t('Preferenze')}</h1>
        <p>{t('Scegli un’area. Le impostazioni meno usate restano fuori dalla strada finché non ti servono.')}</p>
      </header>

      <div className="prefs-layout">
        <nav className="prefs-nav" aria-label={t('Sezioni delle preferenze')}>
          {sezioni.map(s => (
            <button key={s.id} type="button" aria-current={sezione === s.id ? 'page' : undefined}
              onClick={() => setSezione(s.id)}>
              <span>{s.titolo}</span>
              <small>{s.nota}</small>
            </button>
          ))}
        </nav>

        <section className="prefs-panel" aria-labelledby={`prefs-${sezione}`}>
          <div className="prefs-panel-heading">
            <h2 id={`prefs-${sezione}`}>{attuale.titolo}</h2>
            <p>{attuale.nota}</p>
          </div>

      {sezione === 'myynd' && <>
      {/*
        Il fuoco sta qui e non più come pastiglia sopra al feed.
        È una preferenza a tutti gli effetti — vale per tutte le letture che
        verranno, non per quella che stai guardando — e sopra al feed era una
        riga di testo in mezzo al lavoro, per una cosa che si cambia una volta
        alla settimana. Quello che scrivi qui è anche l'unica leva che hai per
        non farti riempire la prima pagina di roba che non ti serve.
      */}
      <div style={{ ...CARD_GLASS, flex: 'none', borderRadius: 20, padding: '18px 22px' }}>
        <div style={LABEL}>{t('Su cosa mi concentro')}</div>
        <div style={{ fontSize: '13.5px', color: 'rgba(var(--inchiostro-rgb),.65)', lineHeight: 1.55, marginTop: 6, maxWidth: 520, textWrap: 'pretty' }}>
          {t('Viene prima di tutto quando scelgo cosa metterti in prima pagina.')}
        </div>
        <CampoFuoco v={v} />
      </div>

      {/* Subito sotto al fuoco perché sono la stessa domanda fatta due volte —
          dove guardo dentro, cosa cerco fuori — e leggerle vicine è l'unico
          modo per non confonderle. */}
      <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: 20, padding: '18px 22px' }}>
        <div style={LABEL}>{t('Di cosa ti tengo aggiornato')}</div>
        <div style={{ fontSize: '13.5px', color: 'rgba(var(--inchiostro-rgb),.65)', lineHeight: 1.55, marginTop: 6, maxWidth: 520, textWrap: 'pretty' }}>
          {t('Cosa ti interessa nei giornali. Vuoto: un po’ di tutto.')}
        </div>
        <CampoArgomenti v={v} />
      </div>

      <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: 20, padding: '18px 22px' }}>
        <div style={LABEL}>{t('Autonomia')}</div>
        {/* tre pastiglie come il tono, e sotto una riga sola: quella della scelta */}
        <div role="radiogroup" aria-label={t('Autonomia')} style={{ display: 'flex', gap: 9, marginTop: 14, flexWrap: 'wrap' }}>
          {v.autonomie.map(a => (
            <button key={a.id} type="button" role="radio" aria-checked={a.scelto} onClick={a.onClick} title={a.nota} style={a.scelto
              ? { padding: '10px 20px', borderRadius: 99, border: '1px solid rgba(var(--luce-rgb),.5)', background: 'linear-gradient(120deg,var(--rame-profondo),var(--ambra))', color: 'var(--avorio)', fontFamily: 'inherit', fontSize: '13.5px', fontWeight: 500, cursor: 'pointer' }
              : { padding: '10px 20px', borderRadius: 99, border: '1px solid rgba(var(--inchiostro-rgb),.2)', background: 'rgba(var(--luce-rgb),.5)', color: 'var(--inchiostro)', fontFamily: 'inherit', fontSize: '13.5px', cursor: 'pointer' }}>{a.titolo}</button>
          ))}
        </div>
        <div style={{ fontSize: '13px', lineHeight: 1.55, color: 'rgba(var(--inchiostro-rgb),.65)', marginTop: 12, textWrap: 'pretty' }}>{v.autonomie.find(a => a.scelto)?.nota}</div>
        {/* il tono nella stessa carta: sono le due manopole di come lavora e come parla */}
        <div style={{ height: 1, background: 'rgba(var(--inchiostro-rgb),.08)', margin: '18px 0 14px' }} />
        <div style={LABEL}>{t('Tono')}</div>
        <div style={{ display: 'flex', gap: 9, marginTop: 14 }}>
          {v.toni.map(tono => (
            <button key={tono.id} onClick={tono.onClick} style={tono.style}>{tono.label}</button>
          ))}
        </div>
        <div style={{ fontSize: '13.5px', lineHeight: 1.6, color: 'rgba(var(--inchiostro-rgb),.72)', marginTop: 14, padding: '13px 15px', borderRadius: 14, background: 'rgba(var(--inchiostro-rgb),.05)', textWrap: 'pretty' }}>{v.tonoEsempio}</div>
      </div>

      <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: 20, padding: '18px 22px' }}>
        <div style={LABEL}>{t('Lingua')}</div>
        <div style={{ fontSize: '12.5px', color: 'rgba(var(--inchiostro-rgb),.65)', marginTop: 6, lineHeight: 1.5, maxWidth: 460, textWrap: 'pretty' }}>{t('Risposte e prima pagina. I documenti restano nella loro lingua.')}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 13 }}>
          {v.lingue.map(l => (
            <button key={l.id} onClick={l.onClick} disabled={l.occupato} style={l.scelto
              ? { padding: '10px 20px', borderRadius: 99, border: '1px solid rgba(var(--luce-rgb),.5)', background: 'linear-gradient(120deg,var(--rame-profondo),var(--ambra))', color: 'var(--avorio)', fontFamily: 'inherit', fontSize: '13.5px', fontWeight: 500, cursor: 'pointer' }
              : { padding: '10px 20px', borderRadius: 99, border: '1px solid rgba(var(--inchiostro-rgb),.2)', background: 'rgba(var(--luce-rgb),.5)', color: l.occupato ? 'rgba(var(--inchiostro-rgb),.4)' : 'var(--inchiostro)', fontFamily: 'inherit', fontSize: '13.5px', cursor: l.occupato ? 'default' : 'pointer' }}>
              {l.occupato && !l.scelto ? t('Traduco…') : l.nome}
            </button>
          ))}
        </div>
      </div>

      {/* L'ora del giorno, accanto alla lingua: sono le due cose che
          cambiano come l'app ti parla e come ti guarda, e si cercano insieme.
          «Sistema» per primo perche e la risposta giusta per quasi tutti. */}
      <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: 20, padding: '18px 22px' }}>
        <div style={LABEL}>{t('Aspetto')}</div>
        <div style={{ fontSize: '12.5px', color: 'rgba(var(--inchiostro-rgb),.65)', marginTop: 6, lineHeight: 1.5, maxWidth: 460, textWrap: 'pretty' }}>{t('Chiaro di giorno, scuro di sera. «Sistema» segue il tuo computer.')}</div>
        <div role="radiogroup" aria-label={t('Aspetto')} style={{ display: 'flex', gap: 8, marginTop: 13, flexWrap: 'wrap' }}>
          {v.temi.map(x => (
            <button key={x.id} type="button" role="radio" aria-checked={x.scelto} onClick={x.onClick} style={x.scelto
              ? { padding: '10px 20px', borderRadius: 99, border: '1px solid rgba(var(--luce-rgb),.5)', background: 'var(--gradiente-rame)', color: 'var(--avorio)', fontFamily: 'inherit', fontSize: '13.5px', fontWeight: 500, cursor: 'pointer' }
              : { padding: '10px 20px', borderRadius: 99, border: '1px solid rgba(var(--inchiostro-rgb),.2)', background: 'rgba(var(--luce-rgb),.5)', color: 'var(--inchiostro)', fontFamily: 'inherit', fontSize: '13.5px', cursor: 'pointer' }}>{x.label}</button>
          ))}
        </div>
      </div>

      <Identita />
      </>}

      {sezione === 'intelligenza' && <>

      {/* Chi ragiona: Anthropic, OpenAI, o un modello in casa. */}
      <Motore v={v} avvisa={v.mostraToast} />

      {/* I modelli di Claude, uno per livello di lavoro: solo quando è Claude a lavorare. */}
      {v.motore === 'claude' && <Modelli v={v} />}
      {(v.motore === 'openai' || v.motore === 'chatgpt') && <ModelliOpenAI v={v} />}

      <Uso />
      </>}

      {sezione === 'dati' && <>
      <div className="prefs-sources-card">
        <div>
          <div style={LABEL}>{t('Le tue fonti')}</div>
          <p>{t('Collega o scollega quando vuoi, senza rifare tutto.')}</p>
        </div>
        <button onClick={() => v.apriConnessioni()}>{t('Gestisci')} <IconAvanti /></button>
      </div>

      <Fascicolo />

      <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: 20, padding: '18px 22px' }}>
        <div style={LABEL}>{t('Dove stanno i tuoi dati')}</div>
        <div style={{ fontSize: '13.5px', lineHeight: 1.65, color: 'rgba(var(--inchiostro-rgb),.75)', marginTop: 12, textWrap: 'pretty' }}>
          {v.ospitato ? frasi.doveStannoIDatiServer() : frasi.doveStannoIDati(
            <code key="directory" style={{ background: 'rgba(var(--inchiostro-rgb),.07)', padding: '1px 6px', borderRadius: 5 }}>~/.myynd</code>,
            <code key="database" style={{ background: 'rgba(var(--inchiostro-rgb),.07)', padding: '1px 6px', borderRadius: 5 }}>mente.db</code>,
            <code key="config" style={{ background: 'rgba(var(--inchiostro-rgb),.07)', padding: '1px 6px', borderRadius: 5 }}>config.json</code>
          )}
        </div>
      </div>
      </>}

      {sezione === 'account' && <>

      <Conto />

      {/* solo dentro l'app da scrivania: nel browser la carta non si disegna */}
      <LApp />

      {/* ultimo di tutti, e non per pudore: è l'unica cosa in questa schermata
          che non si può annullare, e non deve stare accanto a niente che si
          preme di fretta */}
      <Cancella />
      </>}
        </section>
      </div>
    </main>
  )
}
