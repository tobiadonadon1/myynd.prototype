// Il richiamo: la barra che si apre con la scorciatoia, da qualunque app.
//
// Una riga sola. Ci si scrive una cosa da fare e Invio la segna in lista —
// con gli stessi «/» della barra grande: /oggi, /settimana, /poi, /bozza,
// /myynd — oppure una domanda, se comincia con «?» (o con ⌘Invio), e la
// risposta cresce qui sotto, senza aprire l'app. Incollare un elenco segna
// una riga per riga. Esc chiude, e si torna a quello che si stava facendo.
//
// È la stessa pagina dell'app con `?richiamo=1`: nel guscio il ponte
// `window.myynd.richiamo` dice alla finestra quanto è alta e quando
// sparire; nel browser si disegna lo stesso, da sola in mezzo alla pagina,
// e «apri l'app» porta alla radice. Niente qui scorre di lato.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { api, alloScadere, sessione } from '../api'
import { desktop, type Dove } from '../desktop'
import { frasi, lingua, t } from '../lingua'
import { COMANDI, type Comando } from '../oggi/Barra'
import { righeDaTesto } from '../oggi/righe'
import { nuovoId, type Secchio } from '../oggi/useCompiti'
import { Hov } from '../ui'

const INCHIOSTRO = '#22271F'
const RIGA = 'rgba(34,39,31,.1)'
const NOME: Record<Secchio, string> = { oggi: 'Oggi', settimana: 'Questa settimana', poi: 'Prima o poi' }
/** «/fatte» mostra le fatte nella lista grande: qui non c'è una lista. */
const COMANDI_QUI = COMANDI.filter(c => !c.fai)
const chiaveDi = (c: Comando) => (lingua() === 'en' ? c.en : c.it)

/** La risposta a paragrafi, con gli asterischi del grassetto tolti: è testo, non un terminale. */
function paragrafi(testo: string): string[] {
  return testo.replace(/\*\*/g, '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
}

export function Richiamo() {
  const d = desktop()
  const ponte = d?.richiamo ?? null
  const dentro = !!d?.dentroIlRichiamo && !!ponte

  const [testo, setTesto] = useState('')
  const [dove, setDove] = useState<Secchio>('oggi')
  const [modo, setModo] = useState<'bozza' | 'tutto' | null>(null)
  const [scelto, setScelto] = useState(0)
  const [vistaScelta, setVistaScelta] = useState(false)
  const [conferma, setConferma] = useState('')
  const [svanisce, setSvanisce] = useState(false)
  const [guaio, setGuaio] = useState('')
  const [senzaSessione, setSenzaSessione] = useState(() => !sessione.token())
  // la domanda in corso, e la risposta che cresce
  const [domanda, setDomanda] = useState('')
  const [risposta, setRisposta] = useState('')
  const [chat, setChat] = useState<string | null>(null)
  const [pensando, setPensando] = useState(false)

  const campo = useRef<HTMLTextAreaElement>(null)
  const radice = useRef<HTMLDivElement>(null)
  const orologi = useRef<ReturnType<typeof setTimeout>[]>([])

  // il menù è aperto finché la parola dopo «/» è ancora in scrittura
  const pezzo = /(?:^|\s)\/(\S*)$/.exec(testo)
  const filtro = pezzo?.[1]?.toLowerCase() ?? null
  const visti = filtro === null ? [] : COMANDI_QUI.filter(c =>
    c.it.startsWith(filtro) || c.en.startsWith(filtro) || t(c.nome).toLowerCase().startsWith(filtro))
  const aperto = filtro !== null && visti.length > 0
  useEffect(() => { setScelto(0) }, [filtro])

  /*
   * L'altezza la decide il contenuto, e la finestra la segue.
   *
   * Si misura la radice, non la pagina: `html` e `body` sono alti quanto la
   * finestra, che è alta quanto l'ultima misura — si inseguirebbero.
   */
  useLayoutEffect(() => {
    const el = radice.current
    if (!el || !ponte) return
    const misura = () => ponte.misura(Math.ceil(el.getBoundingClientRect().height))
    misura()
    const oss = new ResizeObserver(misura)
    oss.observe(el)
    return () => oss.disconnect()
  }, [ponte])

  // a ogni apertura il fuoco torna nella casella, e si riguarda la sessione:
  // chi è entrato nella finestra grande nel frattempo non deve ricaricare
  useEffect(() => {
    const alRitorno = () => {
      campo.current?.focus()
      if (sessione.token()) setSenzaSessione(false)
    }
    window.addEventListener('focus', alRitorno)
    alRitorno()
    return () => window.removeEventListener('focus', alRitorno)
  }, [])

  // il server ha detto che la sessione non vale più
  useEffect(() => { alloScadere(() => setSenzaSessione(true)) }, [])
  useEffect(() => () => { for (const o of orologi.current) clearTimeout(o) }, [])

  // la casella cresce con quello che c'è dentro, fino a un tetto: poi scorre
  useLayoutEffect(() => {
    const el = campo.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [testo])

  const apri = useCallback((dove: Dove) => {
    if (ponte) ponte.apri(dove)
    else location.href = '/'
  }, [ponte])

  const chiudi = useCallback(() => { ponte?.chiudi() }, [ponte])

  const mostraConferma = (frase: string) => {
    for (const o of orologi.current) clearTimeout(o)
    setConferma(frase); setSvanisce(false)
    orologi.current = [
      setTimeout(() => setSvanisce(true), 1700),
      setTimeout(() => setConferma(''), 2500)
    ]
  }

  const applica = (c: Comando) => {
    if (c.quando) { setDove(c.quando); setVistaScelta(true) }
    if (c.modo) setModo(c.modo)
    setTesto(testo.replace(/(?:^|\s)\/\S*$/, '').replace(/^\s+/, ''))
    campo.current?.focus()
  }

  const daCapo = () => { setTesto(''); setDove('oggi'); setModo(null); setVistaScelta(false) }

  /** Una domanda: una chat nuova, e la risposta qui sotto. */
  const chiedi = async (cosa: string) => {
    const pulita = cosa.trim()
    if (!pulita || pensando) return
    const id = `th${Date.now()}`
    setChat(id); setDomanda(pulita); setRisposta(''); setGuaio(''); setPensando(true)
    daCapo()
    try {
      const r = await api.chiedi(id, pulita, delta => setRisposta(r => r + delta), () => setRisposta(''))
      // alla fine vale quello salvato, non quello scorso: se il server non ha
      // niente da far scorrere — nessun motore collegato — la frase sta solo lì
      const ultimo = [...r.messaggi].reverse().find(m => m.role === 'a')
      if (ultimo?.text) setRisposta(ultimo.text)
    } catch (e) {
      if (sessione.token()) setGuaio(e instanceof Error ? t(e.message) : t('Non sono riuscito a rispondere.'))
      setTesto(`?${pulita}`)
    }
    setPensando(false)
  }

  /** Una riga per riga in lista, con il secchio e il modo scelti dal menù. */
  const segna = async () => {
    const righe = righeDaTesto(testo)
    if (!righe.length) return
    const comEra = { testo, dove, modo }
    setGuaio('')
    daCapo()
    try {
      for (const riga of righe) {
        const id = nuovoId()
        await api.aggiungiCompito({ id, testo: riga, quando: comEra.dove })
        if (comEra.modo) await api.delegaCompito(id, comEra.modo)
      }
      mostraConferma(frasi.segnate(righe.length, comEra.dove))
    } catch (e) {
      if (sessione.token()) setGuaio(e instanceof Error ? t(e.message) : t('Non sono riuscito a segnarlo.'))
      setTesto(comEra.testo); setDove(comEra.dove); setModo(comEra.modo)
    }
  }

  const manda = (chiediComunque: boolean) => {
    const pulito = testo.trim()
    if (!pulito) return
    if (pulito.startsWith('?')) void chiedi(pulito.slice(1))
    else if (chiediComunque) void chiedi(pulito)
    else void segna()
  }

  const tasti = (e: React.KeyboardEvent) => {
    if (aperto) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setScelto(s => (s + 1) % visti.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setScelto(s => (s - 1 + visti.length) % visti.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); applica(visti[scelto]); return }
      if (e.key === 'Escape') { e.preventDefault(); setTesto(testo.replace(/(?:^|\s)\/\S*$/, '')); return }
    }
    // ⇧Invio va a capo: è così che si scrive un elenco a mano
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); manda(e.metaKey || e.ctrlKey); return }
    if (e.key === 'Escape') { e.preventDefault(); chiudi() }
  }

  const etichetta: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', flex: 'none', padding: '4px 9px', borderRadius: 7,
    fontSize: '11.5px', fontWeight: 500, background: 'rgba(34,39,31,.06)', color: 'rgba(34,39,31,.7)'
  }
  const nota: CSSProperties = {
    padding: '0 17px 12px', fontSize: '12.5px', lineHeight: 1.5, color: 'rgba(34,39,31,.6)', overflowWrap: 'anywhere'
  }
  const scheda: CSSProperties = {
    boxSizing: 'border-box', width: '100%', overflow: 'hidden', borderRadius: 14,
    background: dentro ? 'rgba(255,253,249,.88)' : 'rgba(255,253,249,.92)',
    backdropFilter: 'blur(22px)', WebkitBackdropFilter: 'blur(22px)',
    border: '1px solid rgba(255,255,255,.9)',
    boxShadow: dentro ? 'none' : '0 20px 46px rgba(60,44,30,.18)',
    color: INCHIOSTRO, fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif"
  }

  const dentroLaScheda = (
    <div ref={radice} style={scheda}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 9px 7px 17px' }}>
        <textarea
          ref={campo}
          rows={1}
          autoFocus
          value={testo}
          onChange={e => setTesto(e.target.value)}
          onKeyDown={tasti}
          aria-label={t('Segna una cosa, o chiedi con «?»')}
          placeholder={t('Segna una cosa, o chiedi con «?»')}
          style={{
            flex: 1, minWidth: 0, border: 'none', background: 'none', outline: 'none', resize: 'none',
            fontFamily: 'inherit', fontSize: '15px', lineHeight: '22px', color: INCHIOSTRO, padding: '9px 0',
            overflowY: 'auto', overflowX: 'hidden', overflowWrap: 'anywhere'
          }} />
        {(dove !== 'oggi' || vistaScelta) && (
          <span style={{
            ...etichetta,
            background: dove === 'oggi' ? 'rgba(62,81,64,.12)' : 'rgba(34,39,31,.06)',
            color: dove === 'oggi' ? '#3E5140' : 'rgba(34,39,31,.7)'
          }}>{t(NOME[dove])}</span>
        )}
        {modo && (
          <span style={{ ...etichetta, background: 'rgba(196,98,59,.12)', color: '#8E3F1F' }}>
            {modo === 'bozza' ? t('bozza') : t('Myynd')}
          </span>
        )}
        {!testo && (
          <span style={{
            flex: 'none', fontSize: '11px', color: 'rgba(34,39,31,.3)',
            border: '1px solid rgba(34,39,31,.12)', borderRadius: 5, padding: '2px 6px'
          }}>/</span>
        )}
      </div>

      {aperto && (
        <div role="listbox" style={{ padding: '0 5px 6px' }}>
          {visti.map((c, i) => (
            <Hov key={c.it} role="option" aria-selected={i === scelto}
              onMouseEnter={() => setScelto(i)}
              onMouseDown={(e: React.MouseEvent) => { e.preventDefault(); applica(c) }}
              style={{
                display: 'flex', alignItems: 'baseline', gap: 10, padding: '8px 12px', borderRadius: 9, cursor: 'pointer',
                background: i === scelto ? 'rgba(34,39,31,.06)' : 'transparent'
              }}
              hover={{ background: 'rgba(34,39,31,.06)' }}>
              <span style={{ fontSize: '13.5px', flex: 'none' }}>{t(c.nome)}</span>
              <span style={{ fontSize: '12px', color: 'rgba(34,39,31,.45)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t(c.nota)}</span>
              <span style={{ fontSize: '11px', color: 'rgba(34,39,31,.35)', flex: 'none' }}>/{chiaveDi(c)}</span>
            </Hov>
          ))}
        </div>
      )}

      {conferma && (
        <div style={{ ...nota, color: '#3E5140', opacity: svanisce ? 0 : 1, transition: 'opacity .7s' }}>{conferma}</div>
      )}
      {guaio && <div style={{ ...nota, color: '#8E3F1F' }}>{guaio}</div>}

      {senzaSessione && (
        <div style={{ ...nota, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ flex: 1, minWidth: 0 }}>{t('Apri Myynd per entrare')}</span>
          <button type="button" onClick={() => apri('oggi')} style={{
            flex: 'none', padding: '7px 14px', borderRadius: 99, border: 'none', cursor: 'pointer',
            background: INCHIOSTRO, color: '#FFF7F0', fontSize: '12.5px', fontWeight: 500, fontFamily: 'inherit'
          }}>{t('Apri Myynd')}</button>
        </div>
      )}

      {domanda && (
        <div style={{
          borderTop: `1px solid ${RIGA}`, padding: '12px 17px 13px', maxHeight: 340,
          overflowY: 'auto', overflowX: 'hidden', overflowWrap: 'anywhere', fontSize: '14px', lineHeight: 1.5
        }}>
          <div style={{ fontSize: '12.5px', color: 'rgba(34,39,31,.5)', marginBottom: 6 }}>{domanda}</div>
          {pensando && !risposta && <div style={{ color: 'rgba(34,39,31,.55)' }}>{t('Ci penso…')}</div>}
          {paragrafi(risposta).map((p, i) => (
            <p key={i} style={{ margin: '0 0 8px', whiteSpace: 'pre-wrap' }}>{p}</p>
          ))}
          {chat && !pensando && (
            <div style={{ marginTop: 8, fontSize: '12.5px' }}>
              <a href="/" onClick={e => { e.preventDefault(); apri({ dove: 'chat', id: chat }) }}>{t('Continua nell’app')}</a>
            </div>
          )}
        </div>
      )}
    </div>
  )

  // nel guscio la scheda è la finestra; nel browser sta da sola, a un quinto dall'alto
  if (dentro) return dentroLaScheda
  return (
    <div style={{ boxSizing: 'border-box', minHeight: '100%', padding: '20vh 12px 24px', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', overflowX: 'hidden' }}>
      <div style={{ width: 680, maxWidth: '100%' }}>{dentroLaScheda}</div>
    </div>
  )
}
