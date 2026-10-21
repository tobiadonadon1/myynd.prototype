import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { apiP10 } from '../api'
import { frasi, t, tradotta } from '../lingua'
import { Hov } from '../ui'
import { IconCopia, IconFerma, IconFreccia, IconSpunta, IconSu } from '../icons'
import { bottoneBarra, scatolaBarra } from '../barra-scatola'
import { lontanoDalFondo, restaInFondo } from '../chat-in-corso'
import { testoDaCopiare } from '../segni-chat'
import './chat.css'
import { Testo } from '../Testo'
import { senzaTrattiniFuoriCodice } from '../../server/testo.ts'
import type { Vals } from '../vals'
import { Mascotte } from '../components/Mascotte'

/** La faccia accanto alla bolla: piccola, allineata alla prima riga. */
// la mascotte accanto a ogni fumetto di Myynd: il lato e il vuoto sotto
// l'etichetta del mittente vanno insieme, se no l'etichetta non è più allineata
const LATO_MASCOTTE = 40
const AVATAR: React.CSSProperties = { flex: 'none', marginTop: -6, marginRight: 14 }
/** Dove comincia il testo della risposta: dopo la faccia e il suo margine. */
const RIENTRO = LATO_MASCOTTE + 14
/**
 * La colonna di lettura: settecentosessanta, centrata, come in Claude e in
 * ChatGPT. Era novecentoquaranta con due bolle ai bordi («right now it's
 * pretty condensed and pretty thin», ed era vero per le bolle all'80%); senza
 * la scatola intorno la risposta prende tutta la colonna, e la riga di testo
 * resta lunga quanto prima (sui settecento) invece di allargarsi con la finestra.
 */
const COLONNA = 760
/** Chi scrive, sopra la prima bolla: un nome, non un'intestazione. */
const MITTENTE: React.CSSProperties = { fontSize: 11, fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(var(--inchiostro-rgb),.5)', margin: `4px 0 -14px ${RIENTRO}px` }

const PASTIGLIA: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 99, border: '1px solid rgba(var(--inchiostro-rgb),.16)', background: 'rgba(var(--carta-rgb),.7)',
  color: 'var(--inchiostro)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit'
}

/** Una bolla di Myynd, con la faccia accanto. Fuori dal componente: dentro, rinascerebbe a ogni tasto. */
function Sua({ testo, bolla }: { testo: string; bolla: Vals['bolla'] }) {
  return <div style={bolla.rigaSua}><Mascotte size={LATO_MASCOTTE} style={AVATAR} /><div style={bolla.sua}>{testo}</div></div>
}

/**
 * L'intervista: Myynd fa le domande delle preferenze, qui, una alla volta.
 *
 * Le stesse bolle della chat — le domande sono sue, le risposte mie — perché
 * è una conversazione, non un modulo travestito. Dove si sceglie invece di
 * scrivere (il tono, l'autonomia) le scelte stanno sotto la domanda come le
 * pastiglie della chat vuota; «Salta» c'è sempre. Alla fine, se non c'è un
 * progetto, lo si fa da qui.
 */
function Intervista({ v }: { v: Vals }) {
  const i = v.intervista
  if (!i) return null
  return (
    <>
      <div style={MITTENTE}>Myynd</div>
      <Sua bolla={v.bolla} testo={t('Prima due parole su di te, così so con chi parlo.')} />
      {i.battute.map((b, n) => (
        <div key={n} style={{ display: 'contents' }}>
          <Sua bolla={v.bolla} testo={t(b.domanda)} />
          <div style={v.bolla.rigaMia}><div style={v.bolla.mia}>{b.risposta === '—' ? '—' : t(b.risposta)}</div></div>
        </div>
      ))}
      {i.domanda && <>
        <Sua bolla={v.bolla} testo={t(i.domanda.testo)} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '0 2px' }}>
          {i.domanda.scelte?.map(s => (
            <Hov key={s.id} as="button" onClick={() => i.rispondi(s.id)} style={PASTIGLIA}
              hover={{ background: 'var(--carta-alta)', borderColor: 'var(--rame)' }}>{t(s.testo)}</Hov>
          ))}
        </div>
      </>}
      {i.finita && <>
        <Sua bolla={v.bolla} testo={t('Fatto. Cambi tutto quando vuoi, dalle preferenze.')} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '0 2px' }}>
          {v.senzaProgetto && (
            <Hov as="button" onClick={i.configuraProgetto} style={PASTIGLIA}
              hover={{ background: 'var(--carta-alta)', borderColor: 'var(--rame)' }}>{t('Configura il progetto')}</Hov>
          )}
          <Hov as="button" onClick={i.chiudi} style={{ ...PASTIGLIA, color: 'rgba(var(--inchiostro-rgb),.6)' }}
            hover={{ background: 'var(--carta-alta)' }}>{t('Chiudi')}</Hov>
        </div>
      </>}
    </>
  )
}

/**
 * Lo scorrimento della conversazione, come in Claude e in ChatGPT.
 *
 * Prima ogni messaggio nuovo riportava la colonna in fondo, ma la risposta
 * che cresceva no: le righe arrivavano sotto il bordo e non si vedevano; e
 * chi era risalito a rileggere veniva strappato giù a ogni domanda. Adesso:
 * finché lui è in fondo, la colonna lo segue anche mentre la risposta scrive;
 * se è risalito, resta dov'è, e una freccia in basso lo riporta all'ultimo
 * messaggio. Una domanda mandata o una chat aperta riportano sempre in fondo.
 */
function useInFondo(ref: React.RefObject<HTMLDivElement | null>, contenuto: string, ripartenza: string) {
  const inFondo = useRef(true)
  const [lontano, setLontano] = useState(false)
  const misura = () => {
    const el = ref.current
    if (!el) return
    inFondo.current = restaInFondo(el.scrollHeight, el.scrollTop, el.clientHeight)
    setLontano(lontanoDalFondo(el.scrollHeight, el.scrollTop, el.clientHeight))
  }
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.addEventListener('scroll', misura, { passive: true })
    return () => el.removeEventListener('scroll', misura)
  }, [ref])
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (inFondo.current) el.scrollTop = el.scrollHeight
    misura()
  }, [contenuto])
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    inFondo.current = true
    el.scrollTop = el.scrollHeight
    misura()
  }, [ripartenza])
  const giu = () => {
    const el = ref.current
    if (!el) return
    inFondo.current = true
    el.scrollTo({ top: el.scrollHeight, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }
  return { lontano, giu }
}

/**
 * Sotto una risposta: «Copia», e basta.
 *
 * Si vede sotto l'ultima risposta e, sulle altre, al passaggio del mouse
 * (`chat.css`), come in Claude. Il gesto si vede subito: la spunta per un
 * secondo e mezzo. Copia il testo senza i numerini delle citazioni.
 */
function Gesti({ testo, sempre }: { testo: string; sempre: boolean }) {
  const [copiato, setCopiato] = useState(false)
  const tempo = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(tempo.current), [])
  const copia = () => {
    void navigator.clipboard?.writeText(testoDaCopiare(testo)).catch(() => {})
    setCopiato(true)
    clearTimeout(tempo.current)
    tempo.current = setTimeout(() => setCopiato(false), 1500)
  }
  return (
    <div className={sempre ? 'chat-gesti chat-gesti-sempre' : 'chat-gesti'} style={{ display: 'flex', gap: 2, margin: `6px 0 0 ${RIENTRO - 6}px`, height: 28 }}>
      <Hov as="button" type="button" onClick={copia} aria-label={copiato ? t('Copiato') : t('Copia')} title={copiato ? t('Copiato') : t('Copia')}
        style={{ width: 28, height: 28, display: 'grid', placeItems: 'center', border: 'none', background: 'none', borderRadius: 10, color: 'rgba(var(--inchiostro-rgb),.45)', cursor: 'pointer', padding: 0 }}
        hover={{ color: 'var(--inchiostro)' }}>
        {copiato ? <IconSpunta size={15} /> : <IconCopia size={15} />}
      </Hov>
    </div>
  )
}

/**
 * La chat sul tuo materiale, come la conoscono tutti (21 ott 2026).
 *
 * «It feels a bit like an HTML kind of vibe… I wish it felt a bit more like
 * ChatGPT or Claude.» Quello che le mancava per sembrarlo, in ordine di peso:
 * una colonna di lettura centrata invece di due bolle ai due bordi di una
 * striscia larga novecento; la risposta come testo sulla pagina invece di una
 * scatola; le tabelle e i link veri, il codice con «Copia»; il bottone che
 * diventa «Ferma» finché la risposta arriva; la colonna che segue la risposta
 * mentre scrive e lascia stare chi è risalito; «Copia» sotto ogni risposta; il
 * fuoco nel campo appena si apre; la barra uguale a quella della lista.
 */
export function Chat({ v }: { v: Vals }) {
  // mentre Myynd fa le sue domande si risponde a lui, anche senza un motore collegato
  // e mentre gli si dice quale altro lato, dopo «Something else»
  const rispondendo = !!v.intervista?.domanda || !!v.lato?.scrivendo
  const scrivibile = v.claudeOn || rispondendo
  // il bottone si accende quando c'è qualcosa da mandare: pieno su un
  // campo vuoto sembrava pronto a mandare il niente
  const daMandare = scrivibile && !!v.draftMsg.trim() && (rispondendo || !v.inCorso)
  // finché la risposta arriva, il bottone è «Ferma»: subito, non dopo cinque
  // secondi, e anche dopo la prima parola (prima si poteva fermare solo l'attesa)
  const ferma = v.inCorso && !rispondendo
  const ultimo = v.messages[v.messages.length - 1]
  const ultimaMia = [...v.messages].reverse().find(m => m.mio)?.id ?? ''
  const { lontano, giu } = useInFondo(
    v.threadRef,
    `${v.messages.length}:${ultimo?.text.length ?? 0}:${v.pensando}:${v.passoChat}:${v.intervista?.battute.length ?? -1}:${!!v.intervista?.finita}:${!!v.lato && !v.pensando}`,
    `${v.chatAperta}:${ultimaMia}`
  )
  const vuota = v.chatEmpty && v.chatCaricata && !v.pensando && !v.intervista
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', minWidth: 0 }}>
      <div ref={v.threadRef} style={{ flex: 1, width: '100%', overflowY: 'auto', overflowX: 'hidden', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: COLONNA, minWidth: 0, padding: '18px 2px 28px', display: 'flex', flexDirection: 'column', gap: 26 }}>
        {/* «Cosa vuoi sapere?» solo quando è vero: per un attimo, mentre i
            messaggi arrivavano, la chat piena si presentava vuota */}
        {vuota && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '0 4px 24px' }}>
            {/* Il conto dei documenti letti stava qui sotto la domanda. Ma
                che abbia letto le tue cose è il presupposto del prodotto, non
                una notizia. Se non ha letto niente invece va detto, perché
                allora non può rispondere. */}
            <div style={{ fontSize: 30, lineHeight: 1.25, letterSpacing: '-.025em', color: 'rgba(var(--inchiostro-rgb),.78)' }}>{t('Cosa vuoi sapere?')}</div>
            {!v.totaleDocumenti && (
              <div style={{ fontSize: 14, color: 'rgba(var(--inchiostro-rgb),.6)', marginTop: 10 }}>{frasi.nienteLetto()}</div>
            )}
            {/* senza un motore i suggerimenti mandavano una domanda e tornava
                una risposta di circostanza: la strada è la riga qui sotto, e basta */}
            {v.claudeOn && v.prompts.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 22 }}>
                {v.prompts.map(p => (
                  <Hov key={p.id} as="button" onClick={p.onClick} style={PASTIGLIA}
                    hover={{ background: 'var(--carta-alta)', borderColor: 'rgba(var(--inchiostro-rgb),.3)' }}>{p.text}</Hov>
                ))}
              </div>
            )}
          </div>
        )}

        <Intervista v={v} />

        {!v.intervista && v.messages.map((m, i) => {
          // la risposta che sta ancora arrivando non ha gesti: si copia finita
          const viva = v.inCorso && !m.mio && i === v.messages.length - 1
          return (
          <div key={m.id} className={m.mio ? undefined : 'chat-risposta'} style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={m.row}>
            {!m.mio && <Mascotte size={LATO_MASCOTTE} style={AVATAR} />}
            <div style={m.bubble}>
              {/* Le domande restano testo semplice: le hai scritte tu, non
                  c'è niente da impaginare. Le risposte passano dal compositore. */}
              {/* una risposta che è una frase dell'app («collega Claude nelle
                  Fonti», detta dal server senza motore) passa dal dizionario:
                  arrivava in italiano in una chat inglese */}
              {/* le lineette non compaiono mai, nemmeno mentre la risposta arriva: il salvato le ha già tolte, il vivo passa di qui; dentro il codice restano */}
              {m.mio ? m.text : <Testo ricco testo={tradotta(m.text) ? t(m.text) : senzaTrattiniFuoriCodice(m.text)} fonti={m.sources} onApri={v.apriFonte} />}
            </div>
          </div>
          {!m.mio && !viva && !tradotta(m.text) && <Gesti testo={m.text} sempre={i === v.messages.length - 1} />}
          {/* Il lato che Myynd propone: due risposte sotto il suo messaggio, e
              basta. «We need to keep the UI and UX simpler, less clutter.» Le
              stesse pastiglie dell'intervista, rientrate quanto il testo. */}
          {v.lato && m.id === v.lato.idMessaggio && !v.pensando && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: `10px 2px 0 ${RIENTRO}px` }}>
              <Hov as="button" onClick={v.lato.si} style={PASTIGLIA}
                hover={{ background: 'var(--carta-alta)', borderColor: 'var(--rame)' }}>{t('Sì')}</Hov>
              <Hov as="button" onClick={v.lato.altro} style={v.lato.scrivendo ? { ...PASTIGLIA, borderColor: 'var(--rame)' } : PASTIGLIA}
                hover={{ background: 'var(--carta-alta)', borderColor: 'var(--rame)' }}>{t('Qualcos\'altro')}</Hov>
            </div>
          )}
          </div>
          )
        })}

        {/* Prima della prima parola: la faccia e una parola che respira, niente
            rotella dentro una pastiglia. Il passo, se il server lo dice
            («Cerco nelle tue fonti»), prende il posto di «Ci penso». */}
        {v.pensando && (
          <div style={v.bolla.rigaSua}>
            <Mascotte size={LATO_MASCOTTE} style={AVATAR} />
            <div role="status" className="chat-respiro" style={{ alignSelf: 'center', fontSize: 15, color: 'rgba(var(--inchiostro-rgb),.6)', overflowWrap: 'anywhere', minWidth: 0 }}>
              {t(v.passoChat || 'Ci penso')}
            </div>
          </div>
        )}
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: COLONNA, position: 'relative', flex: 'none' }}>
        {/* risalito a rileggere: una freccia per tornare all'ultimo messaggio */}
        {lontano && (
          <Hov as="button" type="button" onClick={giu} aria-label={t('Vai all’ultimo messaggio')} title={t('Vai all’ultimo messaggio')}
            style={{
              position: 'absolute', left: '50%', top: -46, transform: 'translateX(-50%)', width: 34, height: 34, borderRadius: '50%',
              display: 'grid', placeItems: 'center', border: '1px solid rgba(var(--luce-rgb),.9)', background: 'var(--carta-piena)',
              color: 'rgba(var(--inchiostro-rgb),.7)', boxShadow: '0 6px 18px rgba(var(--ombra-rgb),.14)', cursor: 'pointer', padding: 0, zIndex: 2
            }}
            hover={{ color: 'var(--inchiostro)' }}>
            <IconFreccia size={15} verso="giu" />
          </Hov>
        )}
        <Scatola fuori={
          scrivibile ? null : (
            // un campo spento che dice «collega Claude» senza un posto dove farlo
            // è una porta chiusa: la riga stessa apre le connessioni su Claude
            <Hov as="button" type="button" onClick={() => v.apriConnessioni('claude')}
              style={{ flex: 1, minWidth: 0, textAlign: 'left', border: 'none', background: 'none', padding: '7px 0 7px 3px', fontFamily: 'inherit', fontSize: 15, color: 'rgba(var(--inchiostro-rgb),.55)', cursor: 'pointer', overflowWrap: 'anywhere' }}
              hover={{ color: 'var(--rame-testo)' }}>
              {t('Collega Claude per fare domande')}
            </Hov>
          )
        } v={v} rispondendo={rispondendo}>
          {ferma ? (
            <button type="button" onClick={v.annulla} aria-label={t('Ferma')} title={t('Ferma')} style={bottoneBarra(true, 34)}>
              <IconFerma size={12} />
            </button>
          ) : (
            <button type="button" onClick={v.send} disabled={!daMandare} aria-label={t('Manda')} style={bottoneBarra(daMandare, 34)}>
              <IconSu size={15} />
            </button>
          )}
        </Scatola>
      </div>
    </div>
  )
}

/** La scatola in basso: la stessa della lista (`barra-scatola.ts`), col campo che cresce. */
function Scatola({ v, rispondendo, fuori, children }: { v: Vals; rispondendo: boolean; fuori: React.ReactNode; children: React.ReactNode }) {
  const [fuoco, setFuoco] = useState(false)
  return (
    <div onFocus={() => setFuoco(true)} onBlur={() => setFuoco(false)} style={{
      display: 'flex', alignItems: 'flex-end', gap: 10, padding: '8px 8px 8px 16px', marginBottom: 4,
      ...scatolaBarra(fuoco)
    }}>
      {fuori ?? <Campo v={v} rispondendo={rispondendo} />}
      {children}
    </div>
  )
}

/**
 * Il campo in cui scrive, che cresce con quello che scrive.
 *
 * Era un `<input>` di una riga: una frase lunga finiva fuori dal bordo e non
 * si vedeva più, «un bug». Adesso è un textarea che si alza fino a sei
 * righe e poi scorre; Invio manda, Maiusc+Invio va a capo. L'altezza si
 * misura a ogni resa, così torna a una riga quando il campo si svuota.
 */
function Campo({ v, rispondendo }: { v: Vals; rispondendo: boolean }) {
  const el = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => {
    const x = el.current
    if (!x) return
    x.style.height = 'auto'
    // sei righe al massimo, più i 7 px sopra e sotto che fanno una riga alta come il bottone
    x.style.height = Math.min(x.scrollHeight, 6 * 22 + 14) + 'px'
  }, [v.draftMsg])
  /*
   * Il fuoco nel campo appena si apre una chat, come in Claude: si apre per
   * scrivere. Il fuoco messo da qui non sveglia il modello di casa: quello lo
   * fa il primo gesto suo (un clic nel campo, o la prima lettera).
   */
  const daSolo = useRef(false)
  const sveglio = useRef(false)
  const sveglia = () => { if (!sveglio.current) { sveglio.current = true; apiP10.scaldaIlModello() } }
  useEffect(() => {
    const x = el.current
    if (!x || document.activeElement === x) return
    daSolo.current = true
    x.focus({ preventScroll: true })
    daSolo.current = false
  }, [v.chatAperta])
  return (
    <textarea ref={el} rows={1} value={v.draftMsg} onKeyDown={v.onKey}
      onChange={e => { sveglia(); v.onType(e) }}
      // P10 · il modello di questo Mac si sveglia mentre si scrive, non dopo l'invio
      onFocus={() => { if (!daSolo.current) { sveglio.current = true; apiP10.scaldaIlModello() } }}
      data-campo-chat
      placeholder={v.lato?.scrivendo ? t('Cosa preferisci che prenda io?') : rispondendo ? t('Rispondi qui…') : t('Chiedi qualcosa al tuo materiale…')}
      style={{
        /*
          Sette sopra e sotto: una riga sola è alta 36, quanto il bottone
          accanto, e sta al centro invece che appoggiata in fondo. Tre a
          sinistra: senza, la prima lettera si mangiava il bordo — la «I» e
          la «L» uscivano tagliate, perché il glifo sporge un pixel oltre il
          suo riquadro e il campo lo ritaglia.
        */
        flex: 1, minWidth: 0, border: 'none', background: 'none', outline: 'none', resize: 'none', padding: '7px 0 7px 3px', margin: 0,
        fontFamily: 'inherit', fontSize: 15, lineHeight: '22px', color: 'var(--inchiostro)', overflowY: 'auto', display: 'block', boxSizing: 'border-box'
      }} />
  )
}
