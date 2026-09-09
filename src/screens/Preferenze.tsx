import { useCallback, useEffect, useState } from 'react'
import { api, sessione, type ClaudeCon, type Gettone } from '../api'
import { campo, classeCampo, etichetta } from '../components/forms'
import { frasi, t } from '../lingua'
import { CARD_GLASS, Hov, LABEL, daTastiera, knob, track } from '../ui'
import { IconAvanti } from '../icons'
import type { Vals } from '../vals'
import { acceleratore, avvisiAccesi, desktop, impostaAvvisi, nomePiattaforma, simboli, soloModificatore, type Aggiornamento } from '../desktop'
import './preferenze.css'

/** Una riga che si sceglie, scritta come bottone: perde il vestito del bottone e tiene il suo. */
const RIGA_BOTTONE: React.CSSProperties = {
  border: 'none', fontFamily: 'inherit', fontSize: 'inherit', color: 'inherit', textAlign: 'left', width: '100%'
}

/** Il bottone di seconda fila, com'è in «Il tuo accesso» e nel fascicolo. */
const SECONDARIO: React.CSSProperties = {
  flex: 'none', padding: '11px 20px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
  border: '1px solid rgba(34,39,31,.18)', background: 'rgba(255,255,255,.6)', color: 'rgba(34,39,31,.78)', fontSize: '13px'
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
  const NOTA: React.CSSProperties = { fontSize: '12.5px', lineHeight: 1.55, color: 'rgba(34,39,31,.65)', marginTop: 4, textWrap: 'pretty', overflowWrap: 'anywhere' }

  return (
    <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: '20px 24px 20px 24px', padding: '22px 24px' }}>
      <div style={LABEL}>{t('L’app')}</div>

      <div style={{ ...RIGA, marginTop: 12 }}>
        <div style={TESTO}>
          <div style={{ fontSize: 15 }}>{t('Versione')} {d.versione} · {nomePiattaforma(d.piattaforma)}</div>
          <div style={NOTA}>{rigaAggiornamenti()}</div>
        </div>
        {agg?.stato === 'pronta' ? (
          <button type="button" onClick={() => d.aggiornamenti.installa()} style={{
            flex: 'none', padding: '11px 20px', borderRadius: 99, border: 'none',
            background: 'linear-gradient(120deg,#C4623B,#7E9C82)', color: '#FFF7F0',
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
                <span style={{ background: 'rgba(34,39,31,.07)', padding: '2px 9px', borderRadius: 7, letterSpacing: '.06em' }}>{acc ? simboli(acc, d.piattaforma) : '…'}</span>
              </div>}
          <div style={NOTA}>
            {registro
              ? t('Esc lascia com’è.')
              : t('Apre il richiamo da qualunque programma: una riga da segnare, o una domanda con «?». Premuta di nuovo, lo chiude.')}
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
          <div style={NOTA}>{t('Un avviso di sistema, solo se Myynd non è davanti. Vale anche per le domande che ti fa.')}</div>
        </div>
        <button type="button" role="switch" aria-checked={avvisi} aria-label={t('Avvisami quando una bozza è pronta')}
          onClick={() => { impostaAvvisi(!avvisi); setAvvisi(!avvisi) }} style={track(avvisi)}><span style={knob()} /></button>
      </div>

      <div style={RIGA}>
        <div style={TESTO}>
          <div style={{ fontSize: 15 }}>{t('I tuoi dati')}</div>
          <div style={NOTA}>
            <code style={{ background: 'rgba(34,39,31,.07)', padding: '1px 6px', borderRadius: 5 }}>{dati || '~/.myynd'}</code>
          </div>
        </div>
        <button type="button" disabled={!dati} onClick={() => { d.mostraNelFinder(dati).catch(() => {}) }} style={{ ...SECONDARIO, opacity: dati ? 1 : 0.6 }}>
          {mac ? t('Mostra nel Finder') : t('Mostra la cartella dei dati')}
        </button>
      </div>

      {guaio && <div style={{ fontSize: '12.5px', color: '#8E3F1F', marginTop: 10, overflowWrap: 'anywhere' }}>{guaio}</div>}
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
            border: '1px solid rgba(34,39,31,.18)', background: 'rgba(255,255,255,.75)',
            color: '#22271F', fontSize: '14px', fontFamily: 'inherit', outline: 'none'
          }} />
        <button onClick={() => v.salvaFuoco(testo)} style={{
          flex: 'none', padding: '12px 22px', borderRadius: 99, border: 'none',
          background: 'linear-gradient(120deg,#C4623B,#7E9C82)', color: '#FFF7F0',
          fontSize: '13.5px', fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer'
        }}>{t('Salva')}</button>
      </div>
      <div style={{ fontSize: '12.5px', color: 'rgba(34,39,31,.5)', marginTop: 10 }}>
        {t('Vuoto vuol dire: guarda tutto.')}
      </div>
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
      <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: '20px 24px 20px 24px', padding: '22px 24px' }}>
        <div style={LABEL}>{t('Quanto ha ragionato')}</div>
        <div style={{ fontSize: '13.5px', color: '#8E3F1F', marginTop: 8, overflowWrap: 'anywhere' }}>{guaio}</div>
      </div>
    )
  }
  const mila = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : String(n)
  const giorni = u.giorni.slice(-7)
  const max = Math.max(1, ...giorni.map(g => g.entrata + g.uscita))

  return (
    <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: '20px 24px 20px 24px', padding: '22px 24px' }}>
      <div style={LABEL}>{t('Quanto ha ragionato')}</div>
      <div style={{ fontSize: '13.5px', color: 'rgba(34,39,31,.65)', lineHeight: 1.55, marginTop: 6, maxWidth: 540, textWrap: 'pretty' }}>
        {u.oggi.chiamate
          ? frasi.usoOggi(u.oggi.chiamate, mila(u.oggi.entrata + u.oggi.uscita), mila(u.oggi.cache))
          : t('Oggi ancora niente.')}
        {u.oggi.raggiunto && <span style={{ color: '#8E3F1F' }}> {t('Tetto raggiunto: si riparte domani.')}</span>}
      </div>
      {giorni.length > 1 && (
        <div aria-hidden="true" style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 44, marginTop: 14, maxWidth: 320 }}>
          {giorni.map(g => {
            const tot = g.entrata + g.uscita
            return <div key={g.giorno} title={`${g.giorno} · ${mila(tot)}`} style={{
              flex: 1, height: `${Math.max(8, Math.round(100 * tot / max))}%`, borderRadius: 3, background: 'rgba(196,98,59,.55)'
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
          padding: '10px 18px', borderRadius: 99, border: '1px solid rgba(34,39,31,.18)', background: 'rgba(255,255,255,.6)',
          color: 'rgba(34,39,31,.78)', fontSize: '13px', fontFamily: 'inherit', cursor: salvo ? 'default' : 'pointer'
        }}>{salvo ? t('Un momento…') : t('Salva')}</button>
      </div>
      <div style={{ fontSize: '12.5px', color: 'rgba(34,39,31,.5)', marginTop: 8 }}>{t('Vuoto vuol dire: nessun tetto. Mille token sono circa una pagina.')}</div>
      {guaio && <div style={{ fontSize: '12.5px', color: '#8E3F1F', marginTop: 8, overflowWrap: 'anywhere' }}>{guaio}</div>}
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
    background: acceso ? 'linear-gradient(120deg,#C4623B,#7E9C82)' : 'rgba(34,39,31,.18)',
    color: acceso ? '#FFF7F0' : 'rgba(34,39,31,.5)',
    fontSize: '13.5px', fontWeight: 500, fontFamily: 'inherit', cursor: acceso ? 'pointer' : 'default'
  })

  return (
    <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: '20px 24px 20px 24px', padding: '22px 24px' }}>
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
          border: '1px solid rgba(34,39,31,.18)', background: 'rgba(255,255,255,.6)', color: 'rgba(34,39,31,.78)', fontSize: '13px'
        }}>{faccio === 'esco' ? t('Un momento…') : t('Esci da tutti i dispositivi')}</button>
      </div>
      {detto && <div style={{ fontSize: '12.5px', color: '#3E5140', marginTop: 10 }}>{detto}</div>}
      {guaio && <div style={{ fontSize: '12.5px', color: '#8E3F1F', marginTop: 10, overflowWrap: 'anywhere' }}>{guaio}</div>}
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
    <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: '24px 20px 24px 20px', padding: '22px 24px' }}>
      <div style={LABEL}>{t('Chi sei')}</div>
      <div style={{ fontSize: '13.5px', color: 'rgba(34,39,31,.65)', lineHeight: 1.55, marginTop: 6, maxWidth: 520, textWrap: 'pretty' }}>
        {t('Come ti chiamo, e che lavoro fai. Entrano in ogni risposta e in ogni bozza: è la differenza fra una mail scritta per te e una scritta per nessuno.')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 12, maxWidth: 520 }}>
        <div>
          <div style={etichetta('chiaro')}>{t('Nome')}</div>
          <input value={nome} onChange={e => setNome(e.target.value)} disabled={!caricato}
            onKeyDown={e => { if (e.key === 'Enter' && caricato) salva() }}
            placeholder={t('come ti chiamano al lavoro')} className={classeCampo('chiaro')} style={campo('chiaro')} />
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
          background: caricato && !salvo ? 'linear-gradient(120deg,#C4623B,#7E9C82)' : 'rgba(34,39,31,.18)',
          color: caricato && !salvo ? '#FFF7F0' : 'rgba(34,39,31,.5)',
          fontSize: '13.5px', fontWeight: 500, fontFamily: 'inherit', cursor: caricato && !salvo ? 'pointer' : 'default'
        }}>{salvo ? t('Un momento…') : t('Salva')}</button>
        {detto && <span style={{ fontSize: '12.5px', color: '#3E5140' }}>{detto}</span>}
      </div>
      {guaio && <div style={{ fontSize: '12.5px', color: '#8E3F1F', marginTop: 10, overflowWrap: 'anywhere' }}>{guaio}</div>}
    </div>
  )
}

function Trasloco() {
  const [faccio, setFaccio] = useState<'' | 'scarico' | 'carico'>('')
  const [detto, setDetto] = useState('')
  const [guaio, setGuaio] = useState('')
  const [conferma, setConferma] = useState(false)
  // la password, prima di scaricare: nel file ci sono le credenziali di ogni fonte
  const [chiedoPassword, setChiedoPassword] = useState(false)
  const [password, setPassword] = useState('')

  const scarica = async () => {
    if (!password) { setChiedoPassword(true); return }
    setFaccio('scarico'); setDetto(''); setGuaio('')
    try {
      const { nome, dati } = await api.scaricaTrasloco(password)
      setPassword(''); setChiedoPassword(false)
      const url = URL.createObjectURL(dati)
      const a = document.createElement('a')
      a.href = url; a.download = nome; a.click()
      URL.revokeObjectURL(url)
      setDetto(frasi.traslocoPronto(nome))
    } catch (e) { setGuaio(e instanceof Error ? e.message : String(e)) }
    setFaccio('')
  }

  const carica = async (file: File) => {
    setFaccio('carico'); setDetto(''); setGuaio(''); setConferma(false)
    try {
      const r = await api.caricaTrasloco(file)
      setDetto(frasi.traslocoArrivato(r.documenti, r.automazioni))
      // quello che c'è a schermo adesso è di prima: si ricarica tutto
      setTimeout(() => location.reload(), 1200)
    } catch (e) { setGuaio(e instanceof Error ? e.message : String(e)) }
    setFaccio('')
  }

  return (
    <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: '24px 20px 24px 20px', padding: '22px 24px' }}>
      <div style={LABEL}>{t('Portalo su un’altra macchina')}</div>
      <div style={{ fontSize: '13.5px', color: 'rgba(34,39,31,.65)', lineHeight: 1.55, marginTop: 6, maxWidth: 540, textWrap: 'pretty' }}>
        {t('Scarica un file con dentro tutto — i documenti, la lista, la memoria, le automazioni e le fonti collegate — e caricalo su un altro Myynd per ritrovartelo identico.')}
      </div>
      <div style={{
        fontSize: '12.5px', lineHeight: 1.55, marginTop: 10, padding: '10px 13px', borderRadius: 12,
        border: '1px solid rgba(196,98,59,.28)', background: 'rgba(196,98,59,.07)', color: '#8E3F1F',
        maxWidth: 540, textWrap: 'pretty'
      }}>
        {t('Dentro ci sono anche le password delle caselle e i token delle fonti: quel file apre la tua posta. Spostalo e cancellalo.')}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* uno solo pieno: mentre «Sostituisci?» è aperto qui sotto, il pieno è quello */}
        <button onClick={scarica} disabled={!!faccio} style={{
          padding: '11px 20px', borderRadius: 99,
          border: conferma && !faccio ? '1px solid rgba(34,39,31,.18)' : '1px solid transparent',
          background: faccio ? 'rgba(34,39,31,.18)' : conferma ? 'rgba(255,255,255,.6)' : 'linear-gradient(120deg,#C4623B,#7E9C82)',
          color: faccio ? 'rgba(34,39,31,.5)' : conferma ? 'rgba(34,39,31,.78)' : '#FFF7F0',
          fontSize: '13.5px', fontWeight: 500, fontFamily: 'inherit',
          cursor: faccio ? 'default' : 'pointer'
        }}>{faccio === 'scarico' ? t('Preparo…') : chiedoPassword ? t('Conferma') : t('Scaricalo')}</button>
        {chiedoPassword && (
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            autoComplete="current-password" placeholder={t('la tua password')}
            onKeyDown={e => { if (e.key === 'Enter' && password) scarica() }}
            className={classeCampo('chiaro')} style={{ ...campo('chiaro'), width: 220, marginTop: 0 }} />
        )}

        <label style={{
          padding: '11px 20px', borderRadius: 99, cursor: faccio ? 'default' : 'pointer',
          border: '1px solid rgba(34,39,31,.18)', background: 'rgba(255,255,255,.6)',
          color: 'rgba(34,39,31,.78)', fontSize: '13px'
        }}>
          {faccio === 'carico' ? t('Carico…') : t('Caricane uno')}
          <input type="file" accept=".myynd,application/gzip" style={{ display: 'none' }}
            onChange={e => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) { setConferma(true); pronto.current = f }
            }} />
        </label>
      </div>

      {/* Sostituisce, non fonde: va chiesto una volta, e va detto cosa si perde. */}
      {conferma && (
        <div style={{
          marginTop: 12, padding: '12px 14px', borderRadius: 14,
          border: '1px solid rgba(196,98,59,.35)', background: 'rgba(196,98,59,.08)',
          fontSize: '13px', lineHeight: 1.55, color: '#8E3F1F', maxWidth: 540, textWrap: 'pretty'
        }}>
          {t('Quello che c’è adesso in questo account viene sostituito: documenti, lista, memoria, automazioni. Non si fondono.')}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={() => pronto.current && carica(pronto.current)} style={{
              padding: '8px 15px', borderRadius: 99, border: 'none',
              background: '#8E3F1F', color: '#FFF7F0', fontSize: '12.5px', fontFamily: 'inherit', cursor: 'pointer'
            }}>{t('Sostituisci')}</button>
            <button onClick={() => setConferma(false)} style={{
              padding: '8px 15px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
              border: '1px solid rgba(34,39,31,.18)', background: 'rgba(255,255,255,.6)',
              color: 'rgba(34,39,31,.7)', fontSize: '12.5px'
            }}>{t('Lascia stare')}</button>
          </div>
        </div>
      )}

      {detto && <div style={{ fontSize: '12.5px', color: '#3E5140', marginTop: 10 }}>{detto}</div>}
      {guaio && <div style={{ fontSize: '12.5px', color: '#8E3F1F', marginTop: 10 }}>{t(guaio)}</div>}
    </div>
  )
}

/** Il file scelto, in attesa della conferma. Non è stato: non ridisegna niente. */
const pronto: { current: File | null } = { current: null }

/**
 * I gettoni per le macchine.
 *
 * Serve a una cosa sola oggi — il Mac di casa che spinge i documenti letti
 * verso un Myynd ospitato — e prima quel lavoro si faceva incollando in
 * `MYYND_DESKTOP_REMOTO_TOKEN` un normale token di sessione: trenta giorni di
 * vita, e la morte a ogni cambio di password. Quando moriva, la spinta
 * falliva in silenzio e per sempre.
 *
 * Il gettone si vede **una volta sola**, adesso, quando nasce: sul server ce
 * n'è l'impronta e da quella non si torna indietro. Quindi la carta lo mostra
 * grosso, con accanto le due righe già pronte da incollare — perché il momento
 * in cui va copiato è questo e non ce ne sarà un altro.
 */
function Gettoni({ ospitato }: { ospitato: boolean }) {
  const [lista, setLista] = useState<Gettone[] | null>(null)
  const [nome, setNome] = useState('')
  const [nato, setNato] = useState('')
  const [faccio, setFaccio] = useState(false)
  const [guaio, setGuaio] = useState('')

  const carica = useCallback(() => {
    api.gettoni()
      .then(r => setLista(r.gettoni))
      .catch(e => setGuaio(e instanceof Error ? t(e.message) : String(e)))
  }, [])
  useEffect(carica, [carica])

  const crea = async () => {
    setFaccio(true); setGuaio(''); setNato('')
    try {
      const r = await api.creaGettone(nome, 'desktop')
      setNato(r.gettone)
      setLista(r.gettoni)
      setNome('')
    } catch (e) { setGuaio(e instanceof Error ? t(e.message) : String(e)) }
    setFaccio(false)
  }

  const revoca = async (id: string) => {
    setGuaio('')
    try { setLista((await api.revocaGettone(id)).gettoni) }
    catch (e) { setGuaio(e instanceof Error ? t(e.message) : String(e)) }
  }

  // le due righe da incollare: l'indirizzo di questo Myynd è quello da cui si
  // sta guardando, e chiederlo a mano sarebbe un modo di farlo sbagliare
  const righe = `MYYND_DESKTOP_REMOTO=${window.location.origin}\nMYYND_DESKTOP_REMOTO_TOKEN=${nato}`

  return (
    <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: '20px 24px 20px 24px', padding: '22px 24px' }}>
      <div style={LABEL}>{t('Gettoni per le macchine')}</div>
      <div style={{ fontSize: '13.5px', color: 'rgba(34,39,31,.65)', lineHeight: 1.55, marginTop: 6, maxWidth: 540, textWrap: 'pretty' }}>
        {ospitato
          ? t('Servono al Myynd di casa per spingere qui i documenti che ha letto dalle tue cartelle. Non scadono, si revocano da qui, e non aprono nient’altro: con uno di questi non si entra nell’app e non si tocca il conto.')
          : t('Servono a un altro Myynd — quello su un server — per ricevere i documenti che questo legge dalle tue cartelle. Non scadono, si revocano da qui, e non aprono nient’altro.')}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={nome} onChange={e => setNome(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && nome.trim() && !faccio) crea() }}
          placeholder={t('il MacBook dell’ufficio')} className={classeCampo('chiaro')}
          style={{ ...campo('chiaro'), width: 240, marginTop: 0 }} />
        <button onClick={crea} disabled={!nome.trim() || faccio} style={{
          padding: '11px 20px', borderRadius: 99, border: 'none',
          background: nome.trim() && !faccio ? 'linear-gradient(120deg,#C4623B,#7E9C82)' : 'rgba(34,39,31,.18)',
          color: nome.trim() && !faccio ? '#FFF7F0' : 'rgba(34,39,31,.5)',
          fontSize: '13.5px', fontWeight: 500, fontFamily: 'inherit', cursor: nome.trim() && !faccio ? 'pointer' : 'default'
        }}>{faccio ? t('Un momento…') : t('Creane uno')}</button>
      </div>

      {/* una volta sola: non c'è nessun modo di rivederlo, e va detto qui */}
      {nato && (
        <div style={{
          marginTop: 12, padding: '13px 15px', borderRadius: 14,
          border: '1px solid rgba(126,156,130,.4)', background: 'rgba(126,156,130,.1)', maxWidth: 540
        }}>
          <div style={{ fontSize: '12.5px', color: '#3E5140', lineHeight: 1.55, textWrap: 'pretty' }}>
            {t('Copialo adesso: questa è l’unica volta che si vede. Incolla queste due righe nel Myynd di casa.')}
          </div>
          <pre style={{
            margin: '10px 0 0', padding: '10px 12px', borderRadius: 10, background: 'rgba(34,39,31,.06)',
            fontSize: '11.5px', lineHeight: 1.6, overflowX: 'auto', whiteSpace: 'pre', userSelect: 'all'
          }}>{righe}</pre>
        </div>
      )}

      {lista && lista.length > 0 && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 540 }}>
          {lista.map(g => (
            <div key={g.id} style={{
              display: 'flex', gap: 12, alignItems: 'center', padding: '10px 12px', borderRadius: 12,
              background: 'rgba(255,255,255,.55)'
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', overflowWrap: 'anywhere' }}>{g.nome}</div>
                <div style={{ fontSize: '11.5px', color: 'rgba(34,39,31,.55)', marginTop: 2 }}>
                  {g.ambito} · {g.usato ? `${t('ultimo uso')} ${new Date(g.usato).toLocaleDateString()}` : t('mai usato')}
                </div>
              </div>
              <button onClick={() => revoca(g.id)} style={{
                flex: 'none', padding: '7px 14px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
                border: '1px solid rgba(34,39,31,.18)', background: 'rgba(255,255,255,.6)',
                color: '#8E3F1F', fontSize: '12.5px'
              }}>{t('Revoca')}</button>
            </div>
          ))}
        </div>
      )}
      {lista && lista.length === 0 && (
        <div style={{ fontSize: '12.5px', color: 'rgba(34,39,31,.5)', marginTop: 12 }}>{t('Non ne hai ancora nessuno.')}</div>
      )}
      {guaio && <div style={{ fontSize: '12.5px', color: '#8E3F1F', marginTop: 10, overflowWrap: 'anywhere' }}>{guaio}</div>}
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
    <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: '20px 24px 20px 24px', padding: '22px 24px' }}>
      <div style={LABEL}>{t('Tutto quello che tengo su di te')}</div>
      <div style={{ fontSize: '13.5px', color: 'rgba(34,39,31,.65)', lineHeight: 1.55, marginTop: 6, maxWidth: 540, textWrap: 'pretty' }}>
        {t('Un file che si legge, con dentro il tuo conto, i documenti, la lista, quello che ho imparato su di te, le chat, le automazioni e quanto è costato. Le password e i token non ci sono: per spostare un’installazione serve il file qui sopra.')}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={scarica} disabled={faccio} style={{
          padding: '11px 20px', borderRadius: 99, cursor: faccio ? 'default' : 'pointer', fontFamily: 'inherit',
          border: '1px solid rgba(34,39,31,.18)', background: 'rgba(255,255,255,.6)',
          color: 'rgba(34,39,31,.78)', fontSize: '13px'
        }}>{faccio ? t('Preparo…') : chiedo ? t('Conferma') : t('Scarica i miei dati')}</button>
        {chiedo && (
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            autoComplete="current-password" placeholder={t('la tua password')}
            onKeyDown={e => { if (e.key === 'Enter' && password) scarica() }}
            className={classeCampo('chiaro')} style={{ ...campo('chiaro'), width: 220, marginTop: 0 }} />
        )}
      </div>
      {detto && <div style={{ fontSize: '12.5px', color: '#3E5140', marginTop: 10 }}>{detto}</div>}
      {guaio && <div style={{ fontSize: '12.5px', color: '#8E3F1F', marginTop: 10, overflowWrap: 'anywhere' }}>{guaio}</div>}
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
    <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: '24px 20px 24px 20px', padding: '22px 24px' }}>
      <div style={LABEL}>{t('Cancella il conto')}</div>
      <div style={{ fontSize: '13.5px', color: 'rgba(34,39,31,.65)', lineHeight: 1.55, marginTop: 6, maxWidth: 540, textWrap: 'pretty' }}>
        {t('Sparisce tutto: i documenti che ho letto, la lista, le chat, quello che ho imparato su di te, le automazioni e le fonti collegate. Non si torna indietro, e non ne tengo una copia. Se vuoi portarti via qualcosa, fallo prima da qui sopra.')}
      </div>

      {!aperto ? (
        <button onClick={() => setAperto(true)} style={{
          marginTop: 14, padding: '11px 20px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
          border: '1px solid rgba(142,63,31,.35)', background: 'rgba(255,255,255,.6)', color: '#8E3F1F', fontSize: '13px'
        }}>{t('Voglio cancellare il conto')}</button>
      ) : (
        <div style={{
          marginTop: 12, padding: '14px 15px', borderRadius: 14,
          border: '1px solid rgba(196,98,59,.35)', background: 'rgba(196,98,59,.08)', maxWidth: 540
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
              background: puo ? '#8E3F1F' : 'rgba(34,39,31,.18)', color: puo ? '#FFF7F0' : 'rgba(34,39,31,.5)',
              cursor: puo ? 'pointer' : 'default'
            }}>{faccio ? t('Un momento…') : t('Cancella tutto, per sempre')}</button>
            <button onClick={() => { setAperto(false); setPassword(''); setEmail(''); setGuaio('') }} style={{
              padding: '9px 17px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
              border: '1px solid rgba(34,39,31,.18)', background: 'rgba(255,255,255,.6)',
              color: 'rgba(34,39,31,.7)', fontSize: '12.5px'
            }}>{t('Lascia stare')}</button>
          </div>
          {guaio && <div style={{ fontSize: '12.5px', color: '#8E3F1F', marginTop: 10, overflowWrap: 'anywhere' }}>{guaio}</div>}
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
            border: '1px solid rgba(34,39,31,.18)', background: 'rgba(255,255,255,.75)',
            color: '#22271F', fontSize: '14px', fontFamily: 'inherit', outline: 'none'
          }} />
        <button onClick={salva} style={{
          flex: 'none', padding: '12px 22px', borderRadius: 99, border: 'none',
          background: 'linear-gradient(120deg,#C4623B,#7E9C82)', color: '#FFF7F0',
          fontSize: '13.5px', fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer'
        }}>{salvato ? t('Salvato') : t('Salva')}</button>
      </div>
      <div style={{ fontSize: '12.5px', color: 'rgba(34,39,31,.5)', marginTop: 10 }}>
        {t('Vuoto vuol dire: dammi un po’ di tutto.')}
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
        marginTop: 9, fontSize: '12px', color: 'rgba(34,39,31,.5)'
      }}>
        {v.argomentiDaMe && !!v.argomenti && (
          <span style={{ textWrap: 'pretty' }}>
            {t('L’ho scritto io, da quello che apri. Se lo cambi, resta tuo.')}
          </span>
        )}
        <Hov as="button" type="button" onClick={proponi} disabled={chiedo}
          style={{
            border: 'none', background: 'none', padding: 0, fontFamily: 'inherit',
            fontSize: '12px', color: '#8E3F1F', cursor: chiedo ? 'default' : 'pointer'
          }}
          hover={chiedo ? {} : { color: '#C4623B' }}>
          {chiedo ? t('Guardo…') : t('Scrivilo da quello che leggo')}
        </Hov>
        {detto && <span>{detto}</span>}
      </div>

      {gusto && (
        <div style={{
          marginTop: 12, padding: '10px 13px', borderRadius: 12,
          background: 'rgba(34,39,31,.05)', border: '1px solid rgba(34,39,31,.07)'
        }}>
          <div style={{ ...LABEL, fontSize: '10.5px', color: 'rgba(34,39,31,.45)' }}>
            {t('Da come leggi')}
          </div>
          <div style={{ fontSize: '12.5px', lineHeight: 1.55, color: 'rgba(34,39,31,.7)', marginTop: 5, textWrap: 'pretty' }}>
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
 * Erano tre carte — il motore, come si paga Claude, il modello di casa — e
 * rispondevano a una domanda sola, «chi fa il lavoro», da tre punti diversi:
 * per capire cosa stesse succedendo bisognava leggerle tutte. Adesso è una
 * riga per strada. Claude con la chiave, Claude con l'abbonamento che si paga
 * già, o un fornitore che parla la lingua di OpenAI — in rete, o un modello
 * sul proprio computer con Ollama, LM Studio, llama.cpp. Myynd non installa
 * niente: il modello di casa che scaricava e accendeva da sé è stato tolto, e
 * un modello locale si collega con un indirizzo come tutti gli altri.
 *
 * La strada non collegata si collega da qui: scegliendola si apre la sua
 * scheda, e collegarla la sceglie. Collegata, si vede cosa è, e «Cambia»
 * riapre la stessa scheda. Siccome Myynd è stato messo a punto su Claude,
 * scegliere l'altra si può, ma con l'avviso scritto sotto e non in una nota
 * a piè di pagina: la qualità non deve calare in silenzio.
 */
function Motore({ v, avvisa }: { v: Vals; avvisa: (testo: string) => void }) {
  type Via = 'chiave' | 'abbonamento' | 'compatibile'
  const [s, setS] = useState<ClaudeCon | null>(null)
  const [occupato, setOccupato] = useState(false)
  const guarda = useCallback(() => { api.claude().then(setS).catch(() => setS(null)) }, [])
  // e si rilegge quando cambia quello che è collegato: la scheda di Claude si
  // apre sopra questa schermata, e chiudendola la riga deve dire «pronto»
  // senza che uno esca e rientri
  useEffect(() => { guarda() }, [guarda, v.claudeOn, v.compatibile])

  const f = v.compatibile
  // ospitati l'abbonamento non esiste: la riga non si mostra, e la scelta non ci cade mai
  const abbonamentoPossibile = !!s?.abbonamentoPossibile
  const attuale: Via = v.motore === 'compatibile' ? 'compatibile'
    : abbonamentoPossibile && s?.con === 'abbonamento' ? 'abbonamento' : 'chiave'

  /** Cosa manca a questa strada per poter lavorare adesso. Vuoto = niente. */
  const manca = (via: Via): string => {
    if (via === 'compatibile') return f ? '' : t('Non ancora collegato.')
    if (via === 'chiave') return s?.chiave.collegata ? '' : t('Manca la chiave: collegala dalla scheda di Claude.')
    if (!s?.abbonamento.installato) return t('Claude Code non è su questo computer.')
    if (!s.abbonamento.entrato) return t('Apri il Terminale, scrivi «claude» e fai l’accesso.')
    return ''
  }

  const scegli = async (via: Via) => {
    // finché non si sa cosa c'è, un clic non deve aprire schede a caso
    if (occupato || !s) return
    // non collegata: si apre la scheda, e collegarla la sceglie
    if (via === 'compatibile') { void v.scegliMotore('compatibile'); return }
    if (via === 'chiave' && !s.chiave.collegata) { v.apriConnessioni('claude'); return }
    // l'abbonamento senza Claude Code entrato non si sceglie: la riga dice già
    // cosa manca, e scriverlo lo stesso spegnerebbe tutta l'app
    if (via === 'abbonamento' && manca(via)) return
    // premere di nuovo l'abbonamento serve anche a svegliarlo dopo un guasto:
    // il server azzera il riposo e riprova alla richiesta successiva
    if (via === attuale && !(via === 'abbonamento' && s?.abbonamento.inRiposo)) return
    setOccupato(true)
    try {
      if (v.motore !== 'claude') await v.scegliMotore('claude')
      if (s && (s.con !== via || via === 'abbonamento')) await api.claudeCon(via)
    } catch (e) { avvisa(e instanceof Error ? t(e.message) : t('Non sono riuscito a cambiare.')) }
    finally { setOccupato(false); guarda(); v.ricaricaStato() }
  }

  const vie: { id: Via; titolo: string; nota: string; dettaglio?: string; azione?: { testo: string; apri: () => void } }[] = [
    {
      id: 'chiave', titolo: t('Claude, con la tua chiave API'),
      nota: t('A consumo, sul credito Anthropic. È il modello su cui Myynd è stato messo a punto.'),
      dettaglio: s?.chiave.collegata ? t('Chiave collegata') : undefined,
      azione: { testo: s?.chiave.collegata ? t('Cambia chiave') : t('Collega'), apri: () => v.apriConnessioni('claude') }
    },
    ...(abbonamentoPossibile ? [{
      id: 'abbonamento' as Via, titolo: t('Claude, con l’abbonamento che paghi già'),
      nota: t('Usa Claude Code su questo computer. È incluso nel tuo piano; le bozze lavorano sul materiale che Myynd ha già trovato.')
    }] : []),
    {
      id: 'compatibile', titolo: t('Un altro fornitore, o un modello sul tuo computer'),
      nota: t('OpenAI, OpenRouter, Groq, Mistral — o Ollama, LM Studio e llama.cpp in casa. Un indirizzo e il nome di un modello: Myynd non installa niente.'),
      // l'indirizzo può essere lungo: si spezza, non sfora
      dettaglio: f ? [f.nome, f.modello, f.url].filter(Boolean).join(' · ') : undefined,
      azione: { testo: f ? t('Cambia') : t('Collega'), apri: () => v.apriConnessioni('compatibile') }
    }
  ]

  return (
    <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: '24px 20px 24px 20px', padding: '22px 24px' }}>
      <div style={LABEL}>{t('Con quale motore lavora')}</div>
      <div role="radiogroup" aria-label={t('Con quale motore lavora')} style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 12 }}>
        {vie.map(x => {
          const scelto = attuale === x.id
          const guaio = manca(x.id)
          return (
            // dentro c'è il bottone «Collega»: la riga tiene il ruolo, non il tag
            <div key={x.id} role="radio" aria-checked={scelto} tabIndex={0}
              onClick={() => scegli(x.id)} onKeyDown={daTastiera(() => scegli(x.id))} style={{
                display: 'flex', gap: 13, alignItems: 'flex-start', padding: '13px 14px', borderRadius: 16, cursor: 'pointer',
                background: scelto ? 'rgba(255,255,255,.85)' : 'transparent',
                boxShadow: scelto ? '0 12px 30px rgba(84,64,44,.1)' : 'none'
              }}>
              <span style={{
                width: 15, height: 15, flex: 'none', borderRadius: '50%', marginTop: 3,
                border: scelto ? '4px solid #C4623B' : '1.5px solid rgba(34,39,31,.35)',
                background: scelto ? '#FFF7F0' : 'transparent'
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 15, overflowWrap: 'anywhere' }}>{x.titolo}</span>
                  <span className={`prefs-status ${guaio ? 'needs-attention' : 'ready'}`}>
                    {guaio ? t('Da configurare') : scelto ? t('In uso') : t('Pronto')}
                  </span>
                </div>
                <div style={{ fontSize: '12.5px', lineHeight: 1.55, color: 'rgba(34,39,31,.65)', marginTop: 4, textWrap: 'pretty' }}>
                  {x.nota}
                </div>
                {/*
                  Quello che manca si dice sotto la strada che l'ha scelta, non
                  in cima alla scheda: è di quella riga che parla, e chi legge
                  deve poter capire quale delle tre non è pronta. Accanto, il
                  bottone che la collega.
                */}
                {(x.dettaglio || guaio || x.azione) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 9, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 0, fontSize: '12.5px', color: guaio ? '#8E3F1F' : 'rgba(34,39,31,.78)', overflowWrap: 'anywhere', textWrap: 'pretty' }}>
                      {x.dettaglio ?? guaio}
                    </div>
                    {x.azione && (
                      <Hov as="button" type="button"
                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); x.azione?.apri() }}
                        style={{ flex: 'none', border: '1px solid rgba(34,39,31,.18)', background: 'rgba(255,255,255,.7)', borderRadius: 99, padding: '6px 13px', color: '#22271F', fontSize: '12.5px', cursor: 'pointer', fontFamily: 'inherit' }}
                        hover={{ borderColor: '#C4623B', color: '#8E3F1F' }}>
                        {x.azione.testo}
                      </Hov>
                    )}
                  </div>
                )}
                {scelto && x.id === 'abbonamento' && s?.abbonamento.inRiposo && (
                  <div style={{ fontSize: '12px', color: '#8E3F1F', marginTop: 6, display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span>{t('L’ultima volta non ha risposto: per qualche minuto uso la chiave.')}</span>
                    <span style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>{t('Riprova adesso')}</span>
                  </div>
                )}
                {scelto && x.id === 'compatibile' && (
                  <div style={{
                    fontSize: '12.5px', lineHeight: 1.55, marginTop: 10, padding: '10px 13px', borderRadius: 12,
                    border: '1px solid rgba(196,98,59,.28)', background: 'rgba(196,98,59,.07)', color: '#8E3F1F',
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

export function Preferenze({ v, avviaOnboarding }: { v: Vals; avviaOnboarding?: () => void }) {
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
      {avviaOnboarding && <div className="prefs-setup-card">
        <div>
          <span className="prefs-eyebrow">{t('Punto di partenza')}</span>
          <h3>{t('Il tuo primo progetto')}</h3>
          <p>{t('Rivedi il progetto, l’obiettivo, la fonte e la prima attività che orientano Myynd.')}</p>
        </div>
        <button type="button" onClick={avviaOnboarding}>
          {t('Rivedi configurazione')} <IconAvanti />
        </button>
      </div>}

      {/*
        Il fuoco sta qui e non più come pastiglia sopra al feed.
        È una preferenza a tutti gli effetti — vale per tutte le letture che
        verranno, non per quella che stai guardando — e sopra al feed era una
        riga di testo in mezzo al lavoro, per una cosa che si cambia una volta
        alla settimana. Quello che scrivi qui è anche l'unica leva che hai per
        non farti riempire la prima pagina di roba che non ti serve.
      */}
      <div style={{ ...CARD_GLASS, flex: 'none', borderRadius: '24px 20px 24px 20px', padding: '22px 24px' }}>
        <div style={LABEL}>{t('Su cosa mi concentro')}</div>
        <div style={{ fontSize: '13.5px', color: 'rgba(34,39,31,.65)', lineHeight: 1.55, marginTop: 6, maxWidth: 520, textWrap: 'pretty' }}>
          {t('Quello che scrivi qui viene prima di tutto il resto quando scelgo cosa metterti in prima pagina.')}
        </div>
        <CampoFuoco v={v} />
      </div>

      {/* Subito sotto al fuoco perché sono la stessa domanda fatta due volte —
          dove guardo dentro, cosa cerco fuori — e leggerle vicine è l'unico
          modo per non confonderle. */}
      <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: '20px 24px 20px 24px', padding: '22px 24px' }}>
        <div style={LABEL}>{t('Di cosa ti tengo aggiornato')}</div>
        <div style={{ fontSize: '13.5px', color: 'rgba(34,39,31,.65)', lineHeight: 1.55, marginTop: 6, maxWidth: 520, textWrap: 'pretty' }}>
          {t('I giornali li leggo io ogni mattina. Scrivi qui cosa ti interessa e scelgo quelle: se lasci vuoto, ti do un po’ di tutto.')}
        </div>
        <CampoArgomenti v={v} />
      </div>

      <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: '20px 24px 20px 24px', padding: '22px 24px' }}>
        <div style={LABEL}>{t('Autonomia')}</div>
        <div role="radiogroup" aria-label={t('Autonomia')} style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 12 }}>
          {v.autonomie.map(a => (
            <button key={a.id} type="button" role="radio" aria-checked={a.scelto} onClick={a.onClick} style={{ ...a.row, ...RIGA_BOTTONE }}>
              <span style={a.radio} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15 }}>{a.titolo}</div>
                <div style={{ fontSize: '12.5px', lineHeight: 1.5, color: 'rgba(34,39,31,.65)', marginTop: 3 }}>{a.nota}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: '24px 20px 24px 20px', padding: '22px 24px' }}>
        <div style={LABEL}>{t('Lingua')}</div>
        <div style={{ fontSize: '12.5px', color: 'rgba(34,39,31,.65)', marginTop: 6, lineHeight: 1.5, maxWidth: 460, textWrap: 'pretty' }}>{t('In che lingua ti risponde e scrive il feed. I documenti li legge comunque nella lingua in cui sono.')}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 13 }}>
          {v.lingue.map(l => (
            <button key={l.id} onClick={l.onClick} disabled={l.occupato} style={l.scelto
              ? { padding: '10px 20px', borderRadius: 99, border: '1px solid rgba(255,255,255,.5)', background: 'linear-gradient(120deg,#C4623B,#7E9C82)', color: '#FFF7F0', fontFamily: 'inherit', fontSize: '13.5px', fontWeight: 500, cursor: 'pointer' }
              : { padding: '10px 20px', borderRadius: 99, border: '1px solid rgba(34,39,31,.2)', background: 'rgba(255,255,255,.5)', color: l.occupato ? 'rgba(34,39,31,.4)' : '#22271F', fontFamily: 'inherit', fontSize: '13.5px', cursor: l.occupato ? 'default' : 'pointer' }}>
              {l.occupato && !l.scelto ? t('Traduco…') : l.nome}
            </button>
          ))}
        </div>
      </div>

      <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: '20px 24px 20px 24px', padding: '22px 24px' }}>
        <div style={LABEL}>{t('Tono')}</div>
        <div style={{ display: 'flex', gap: 9, marginTop: 14 }}>
          {v.toni.map(tono => (
            <button key={tono.id} onClick={tono.onClick} style={tono.style}>{tono.label}</button>
          ))}
        </div>
        <div style={{ fontSize: '13.5px', lineHeight: 1.6, color: 'rgba(34,39,31,.72)', marginTop: 14, padding: '13px 15px', borderRadius: 14, background: 'rgba(34,39,31,.05)', textWrap: 'pretty' }}>{v.tonoEsempio}</div>
      </div>

      <Identita />
      </>}

      {sezione === 'intelligenza' && <>

      {/* Chi ragiona: Claude con la chiave, Claude con l'abbonamento, o un fornitore — anche in casa. */}
      <Motore v={v} avvisa={v.mostraToast} />

      {/* Il modello di Claude. Sta nelle preferenze e non nel codice perché è
          una scelta di costo, e chi paga deve poterla fare senza chiedere a
          nessuno. Si vede solo quando è Claude a lavorare: con un altro
          motore il modello lo dice la sua scheda. */}
      {v.motore === 'claude' && <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: '20px 24px 20px 24px', padding: '22px 24px' }}>
        <div style={LABEL}>{t('Con quale modello ragiona')}</div>
        <div role="radiogroup" aria-label={t('Con quale modello ragiona')} style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 12 }}>
          {v.modelli.map(m => (
            <button key={m.id} type="button" role="radio" aria-checked={m.scelto} onClick={m.onClick} style={{
              ...RIGA_BOTTONE,
              display: 'flex', gap: 13, alignItems: 'flex-start', padding: '13px 14px', borderRadius: 16, cursor: 'pointer',
              background: m.scelto ? 'rgba(255,255,255,.85)' : 'transparent',
              boxShadow: m.scelto ? '0 12px 30px rgba(84,64,44,.1)' : 'none'
            }}>
              <span style={{
                width: 15, height: 15, flex: 'none', borderRadius: '50%', marginTop: 3,
                border: m.scelto ? '4px solid #C4623B' : '1.5px solid rgba(34,39,31,.35)',
                background: m.scelto ? '#FFF7F0' : 'transparent'
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15 }}>{m.nome}</div>
                <div style={{ fontSize: '12.5px', lineHeight: 1.5, color: 'rgba(34,39,31,.65)', marginTop: 3, textWrap: 'pretty' }}>{m.nota}</div>
              </div>
            </button>
          ))}
        </div>
      </div>}

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
      <Trasloco />

      <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: '24px 20px 24px 20px', padding: '22px 24px' }}>
        <div style={LABEL}>{t('Dove stanno i tuoi dati')}</div>
        <div style={{ fontSize: '13.5px', lineHeight: 1.65, color: 'rgba(34,39,31,.75)', marginTop: 12, textWrap: 'pretty' }}>
          {v.ospitato ? frasi.doveStannoIDatiServer() : frasi.doveStannoIDati(
            <code key="directory" style={{ background: 'rgba(34,39,31,.07)', padding: '1px 6px', borderRadius: 5 }}>~/.myynd</code>,
            <code key="database" style={{ background: 'rgba(34,39,31,.07)', padding: '1px 6px', borderRadius: 5 }}>mente.db</code>,
            <code key="config" style={{ background: 'rgba(34,39,31,.07)', padding: '1px 6px', borderRadius: 5 }}>config.json</code>
          )}
        </div>
      </div>
      </>}

      {sezione === 'account' && <>

      <Conto />

      <Gettoni ospitato={v.ospitato} />

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
