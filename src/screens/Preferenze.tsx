import { useCallback, useEffect, useState } from 'react'
import { api, sessione, type Abbonamento as TipoAbbonamento } from '../api'
import { campo, classeCampo, etichetta } from '../components/forms'
import { frasi, t } from '../lingua'
import { CARD_GLASS, Hov, LABEL, daTastiera, knob, track } from '../ui'
import type { Vals } from '../vals'

/** Una riga che si sceglie, scritta come bottone: perde il vestito del bottone e tiene il suo. */
const RIGA_BOTTONE: React.CSSProperties = {
  border: 'none', fontFamily: 'inherit', fontSize: 'inherit', color: 'inherit', textAlign: 'left', width: '100%'
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
 * Ragionare con il tuo abbonamento invece che a consumo.
 *
 * È la scelta che decide quanto costa tenere Myynd acceso. Con una chiave API si
 * paga ogni riga che scrive; con questo il lavoro grosso passa da Claude Code —
 * che è già installato qui e già entrato con il tuo account — e non costa niente
 * in più di quello che già paghi.
 *
 * Sta spento finché non lo accendi tu, e non è timidezza: manda il lavoro sul
 * tuo conto, e una cosa così si chiede. Se `claude` non c'è su questa macchina
 * non compare nemmeno l'interruttore: un comando spento per un programma che non
 * hai è solo una domanda senza risposta.
 */
function Abbonamento() {
  const [s, setS] = useState<TipoAbbonamento | null>(null)

  const guarda = useCallback(() => {
    api.abbonamento().then(setS).catch(() => setS(null))
  }, [])
  useEffect(() => { guarda() }, [guarda])

  if (!s || !s.installato) return null

  const cambia = async () => {
    setS({ ...s, acceso: !s.acceso })
    try { await api.usaAbbonamento(!s.acceso) } finally { guarda() }
  }

  return (
    <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: '20px 24px 20px 24px', padding: '22px 24px' }}>
      <div style={LABEL}>{t('Con il tuo abbonamento')}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15 }}>
            {/*
              Installato e non entrato sono due cose diverse, e prima si
              vedevano uguali: l'interruttore era lì, si accendeva, e poi ogni
              lavoro falliva. Adesso lo dice — e lo dice gratis, perché
              `claude auth status` non parla con nessun modello.
            */}
            {!s.entrato
              ? t('Installato, ma non ci sei ancora entrato.')
              : s.acceso ? t('Acceso: il lavoro grosso passa da Claude Code.') : t('Spento: si paga a consumo con la chiave.')}
          </div>
          <div style={{ fontSize: '12.5px', lineHeight: 1.55, color: 'rgba(34,39,31,.65)', marginTop: 5, maxWidth: 470, textWrap: 'pretty' }}>
            {s.entrato
              ? t('Claude Code è su questo computer ed è già entrato con il tuo account. Acceso, le risposte e le bozze passano di lì e non costano niente oltre a quello che paghi già. Myynd non vede le tue credenziali: lancia il programma che hai tu.')
              : t('Apri il Terminale, scrivi «claude» e fai l’accesso. Da lì in poi Myynd può ragionare con l’abbonamento che paghi già, invece che a consumo con la chiave.')}
          </div>
          {s.inRiposo && (
            <div style={{ fontSize: '12px', color: '#8E3F1F', marginTop: 6 }}>
              {t('L’ultima volta non ha risposto: per qualche minuto uso la chiave.')}
            </div>
          )}
        </div>
        {/*
          Un interruttore per una strada che fallirebbe è peggio che nessun
          interruttore — ma toglierlo a chi l'ha già acceso lo lascerebbe senza
          il modo di spegnerlo, se nel frattempo è uscito da Claude Code. Si
          nasconde solo quando non c'è niente da guadagnare ad accenderlo.
        */}
        {(s.entrato || s.acceso) && (
          <button type="button" role="switch" aria-checked={s.acceso} aria-label={t('Con il tuo abbonamento')}
            onClick={cambia} style={track(s.acceso)}><span style={knob()} /></button>
        )}
      </div>
    </div>
  )
}

/**
 * Il modello che gira su questa macchina.
 *
 * Sta qui e si vede, invece di succedere di nascosto. Una parte del lavoro —
 * dare un nome a una conversazione, decidere se un testo è una bozza o una
 * domanda, tradurre quattro righe — non ha bisogno di un modello di frontiera,
 * e se su questo computer ce n'è uno acceso la fa lui, gratis. Ma «gratis e di
 * nascosto» non è una combinazione accettabile in un prodotto che chiede di
 * fidarsi: chi lo usa deve sapere che succede, e poter dire di no.
 *
 * Quello che *non* passa mai di qui: le risposte, le bozze che escono
 * dall'azienda, la lettura del feed. Su quelle si paga, perché è lì che una
 * risposta sbagliata costa.
 */
function ModelloDiCasa() {
  const [s, setS] = useState<{ acceso: boolean; modello: string | null; spento: boolean } | null>(null)

  const guarda = useCallback(() => {
    api.modelloLocale().then(setS).catch(() => setS(null))
  }, [])
  useEffect(() => { guarda() }, [guarda])

  // non c'è niente da vedere finché non si sa, e se non c'è nessun modello
  // installato non ha senso mostrare un interruttore per una cosa che non esiste
  if (!s || (!s.acceso && !s.spento)) return null

  const cambia = async () => {
    const attivo = !!s.spento
    setS({ ...s, spento: !attivo })
    try { await api.usaModelloLocale(attivo) } finally { guarda() }
  }

  return (
    <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: '24px 20px 24px 20px', padding: '22px 24px' }}>
      <div style={LABEL}>{t('Il lavoro piccolo, su questo computer')}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15 }}>
            {s.spento ? t('Spento: fa tutto Claude.')
              : s.modello
                ? `${t('Acceso')} · ${s.modello}`
                : t('Nessun modello trovato su questa macchina.')}
          </div>
          <div style={{ fontSize: '12.5px', lineHeight: 1.55, color: 'rgba(34,39,31,.65)', marginTop: 5, maxWidth: 460, textWrap: 'pretty' }}>
            {t('Titoli delle chat, traduzioni, e quello che si segna di te: se qui c’è un modello acceso lo fa lui e non costa niente. Le risposte e le bozze restano a Claude, perché è lì che sbagliare costa.')}
          </div>
        </div>
        <button type="button" role="switch" aria-checked={!s.spento} aria-label={t('Il lavoro piccolo, su questo computer')}
          onClick={cambia} style={track(!s.spento)}><span style={knob()} /></button>
      </div>
      {/*
        La strada per farlo fare tutto a un modello di casa esiste, e va detta
        qui — con il prezzo scritto accanto. Non si nasconde perché è una scelta
        legittima per chi non vuole mandare fuori niente; non si consiglia
        perché un modello piccolo sbaglia di più, e su una bozza che esce
        dall'azienda si vede.
      */}
      <div style={{ fontSize: '12px', lineHeight: 1.55, color: 'rgba(34,39,31,.55)', marginTop: 12, maxWidth: 560, textWrap: 'pretty', overflowWrap: 'anywhere' }}>
        {t('Può fare anche il lavoro grosso: collega un fornitore compatibile con OpenAI puntandolo a http://127.0.0.1:11434/v1, con un modello come qwen2.5:14b. Ma sappi cosa scegli: un modello piccolo sbaglia di più e inventa più volentieri, e sulle bozze e sulle fonti si vede.')}
      </div>
    </div>
  )
}

/**
 * Chi fa il lavoro grosso: Claude, o un fornitore compatibile con OpenAI.
 *
 * Due scelte e non tre, perché l'abbonamento e il modello di casa non sono
 * motori alternativi: sono modi di pagare Claude di meno, e hanno le loro
 * schede. Qui si decide *chi* ragiona — e siccome Myynd è stato messo a punto
 * su Claude, scegliere l'altro si può, ma con l'avviso scritto sotto e non in
 * una nota a piè di pagina: la qualità non deve calare in silenzio.
 *
 * Il fornitore non collegato si collega da qui: scegliendolo si apre la scheda,
 * e collegarlo lo sceglie. Collegato, si vede cosa è — nome, modello, indirizzo
 * — e «Cambia» riapre la stessa scheda.
 */
function Motore({ v }: { v: Vals }) {
  const f = v.compatibile
  const scelte: { id: 'claude' | 'compatibile'; titolo: string; nota: string }[] = [
    {
      id: 'claude', titolo: 'Claude',
      nota: t('Il predefinito. Myynd è stato messo a punto su Claude: le risposte, le bozze e il feed passano di lì, con la chiave o con il tuo abbonamento.')
    },
    {
      id: 'compatibile', titolo: t('Un fornitore compatibile con OpenAI'),
      nota: t('OpenAI, OpenRouter, Groq, Mistral — o un modello in casa con Ollama o LM Studio. Lo colleghi con un indirizzo e il nome di un modello.')
    }
  ]

  return (
    <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: '24px 20px 24px 20px', padding: '22px 24px' }}>
      <div style={LABEL}>{t('Con quale motore lavora')}</div>
      <div role="radiogroup" aria-label={t('Con quale motore lavora')} style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 12 }}>
        {scelte.map(s => {
          const scelto = v.motore === s.id
          return (
            // dentro c'è il bottone «Cambia»: la riga tiene il ruolo, non il tag
            <div key={s.id} role="radio" aria-checked={scelto} tabIndex={0}
              onClick={() => v.scegliMotore(s.id)} onKeyDown={daTastiera(() => v.scegliMotore(s.id))} style={{
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
                <div style={{ fontSize: 15 }}>{s.titolo}</div>
                <div style={{ fontSize: '12.5px', lineHeight: 1.5, color: 'rgba(34,39,31,.65)', marginTop: 3, textWrap: 'pretty' }}>{s.nota}</div>

                {s.id === 'compatibile' && f && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 9, flexWrap: 'wrap' }}>
                    {/* l'indirizzo può essere lungo: si spezza, non sfora */}
                    <div style={{ flex: 1, minWidth: 0, fontSize: '12.5px', color: 'rgba(34,39,31,.78)', overflowWrap: 'anywhere' }}>
                      {[f.nome, f.modello, f.url].filter(Boolean).join(' · ')}
                    </div>
                    <Hov as="button" type="button"
                      onClick={(e: React.MouseEvent) => { e.stopPropagation(); v.apriConnessioni('compatibile') }}
                      style={{ flex: 'none', border: '1px solid rgba(34,39,31,.18)', background: 'rgba(255,255,255,.7)', borderRadius: 99, padding: '6px 13px', color: '#22271F', fontSize: '12.5px', cursor: 'pointer', fontFamily: 'inherit' }}
                      hover={{ borderColor: '#C4623B', color: '#8E3F1F' }}>
                      {t('Cambia')}
                    </Hov>
                  </div>
                )}
                {s.id === 'compatibile' && !f && (
                  <div style={{ fontSize: '12px', color: '#8E3F1F', marginTop: 6 }}>
                    {t('Non ancora collegato: scegliendolo si apre la scheda per collegarlo.')}
                  </div>
                )}
                {s.id === 'compatibile' && scelto && (
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

export function Preferenze({ v }: { v: Vals }) {
  return (
    <div style={{ width: 720, maxWidth: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 34, lineHeight: 1.1, letterSpacing: '-.03em', padding: '12px 4px 22px' }}>{t('Preferenze')}</div>

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

      <Trasloco />

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

      {/* Chi ragiona: Claude, o un fornitore compatibile con OpenAI. */}
      <Motore v={v} />

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

      {/* l'abbonamento è un modo di pagare Claude di meno: con un altro motore
          non c'entra, e un interruttore che non fa niente è peggio di nessuno */}
      {v.motore === 'claude' && <Abbonamento />}
      <ModelloDiCasa />

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
          {/* `tono`, non `t`: la variabile del map copriva la funzione di
              traduzione, e il giorno che qualcuno avesse chiamato `t` qui
              dentro avrebbe chiamato una pastiglia invece del dizionario */}
          {v.toni.map(tono => (
            <button key={tono.id} onClick={tono.onClick} style={tono.style}>{tono.label}</button>
          ))}
        </div>
        <div style={{ fontSize: '13.5px', lineHeight: 1.6, color: 'rgba(34,39,31,.72)', marginTop: 14, padding: '13px 15px', borderRadius: 14, background: 'rgba(34,39,31,.05)', textWrap: 'pretty' }}>{v.tonoEsempio}</div>
      </div>

      <Conto />

      <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: '24px 20px 24px 20px', padding: '22px 24px' }}>
        <div style={LABEL}>{t('Dove stanno i tuoi dati')}</div>
        <div style={{ fontSize: '13.5px', lineHeight: 1.65, color: 'rgba(34,39,31,.75)', marginTop: 12, textWrap: 'pretty' }}>
          {v.ospitato ? frasi.doveStannoIDatiServer() : frasi.doveStannoIDati(
            <code style={{ background: 'rgba(34,39,31,.07)', padding: '1px 6px', borderRadius: 5 }}>~/.myynd</code>,
            <code style={{ background: 'rgba(34,39,31,.07)', padding: '1px 6px', borderRadius: 5 }}>mente.db</code>,
            <code style={{ background: 'rgba(34,39,31,.07)', padding: '1px 6px', borderRadius: 5 }}>config.json</code>
          )}
        </div>
      </div>

      <div style={{ flex: 'none', marginTop: 14, borderRadius: '24px 20px 24px 20px', background: 'linear-gradient(140deg,rgba(196,98,59,.14),rgba(255,253,249,.78) 52%,rgba(126,156,130,.18))', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,.8)', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15 }}>{t('Le tue fonti')}</div>
          <div style={{ fontSize: '12.5px', color: 'rgba(34,39,31,.65)', marginTop: 3 }}>{t('Collega o scollega quando vuoi, senza rifare tutto.')}</div>
        </div>
        <button onClick={() => v.apriConnessioni()} style={{ padding: '9px 18px', borderRadius: 99, border: 'none', background: 'linear-gradient(120deg,#C4623B,#7E9C82)', color: '#FFF7F0', fontFamily: 'inherit', fontSize: '13.5px', fontWeight: 500, cursor: 'pointer', flex: 'none' }}>{t('Apri')}</button>
      </div>
    </div>
  )
}
