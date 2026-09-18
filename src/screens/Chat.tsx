import { useEffect, useRef, useState } from 'react'
import { frasi, t } from '../lingua'
import { Hov } from '../ui'
import { IconSu } from '../icons'
import { Stato } from '../components/Stato'
import { Testo } from '../Testo'
import type { Vals } from '../vals'
import { Mascotte } from '../components/Mascotte'

/** La faccia accanto alla bolla: piccola, allineata alla prima riga. */
// la mascotte accanto a ogni fumetto di Myynd: il lato e il vuoto sotto
// l'etichetta del mittente vanno insieme, se no l'etichetta non è più allineata
const LATO_MASCOTTE = 40
const AVATAR: React.CSSProperties = { flex: 'none', marginTop: 4, marginRight: 8 }
/** Chi scrive, sopra la prima bolla: un nome, non un'intestazione. */
const MITTENTE: React.CSSProperties = { fontSize: 11, fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(var(--inchiostro-rgb),.5)', margin: `4px 0 -6px ${LATO_MASCOTTE + 8}px` }

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
 * «Annulla», accanto alla rotella — ma non subito.
 *
 * Con Claude la prima parola arriva in un paio di secondi e un bottone per
 * fermarla sarebbe rumore: c'è e sparisce prima che uno lo legga. Con un
 * modello sul proprio computer no, e lì l'attesa è la cosa che lui ha
 * raccontato per prima. Cinque secondi sono la soglia in cui uno smette di
 * aspettare e comincia a chiedersi se si è rotto qualcosa: è lì che deve
 * comparire il modo di fermarla, e non prima.
 *
 * Sottovoce: è un'uscita, non un invito. Chi vuole aspettare deve continuare a
 * poterlo fare senza che niente gli dica che sta sbagliando.
 */
function Annulla({ su }: { su: () => void }) {
  const [visibile, setVisibile] = useState(false)
  useEffect(() => {
    const s = setTimeout(() => setVisibile(true), 5000)
    return () => { clearTimeout(s); setVisibile(false) }
  }, [])
  if (!visibile) return null
  return (
    <Hov as="button" type="button" onClick={su} style={{
      alignSelf: 'center', marginLeft: 10, border: 'none', background: 'none', padding: '4px 2px',
      fontFamily: 'inherit', fontSize: 12.5, color: 'rgba(var(--inchiostro-rgb),.5)', cursor: 'pointer'
    }} hover={{ color: 'var(--rame-testo)' }}>{t('Annulla')}</Hov>
  )
}

/** La chat sul tuo materiale: bolle, fonti citate sotto ogni risposta. */
export function Chat({ v }: { v: Vals }) {
  // mentre Myynd fa le sue domande si risponde a lui, anche senza un motore collegato
  const rispondendo = !!v.intervista?.domanda
  const scrivibile = v.claudeOn || rispondendo
  return (
    <div style={{ width: 760, maxWidth: '100%', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div ref={v.threadRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 2px 8px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* «Cosa vuoi sapere?» solo quando è vero: per un attimo, mentre i
            messaggi arrivavano, la chat piena si presentava vuota */}
        {v.chatEmpty && v.chatCaricata && !v.pensando && !v.intervista && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 4px 40px' }}>
            {/* Il conto dei documenti letti stava qui sotto la domanda. Ma
                che abbia letto le tue cose è il presupposto del prodotto, non
                una notizia: dirlo ogni volta che apri la chat è come farsi
                presentare da qualcuno che vedi tutti i giorni. Se non ha letto
                niente invece va detto, perché allora non può rispondere. */}
            <div style={{ fontSize: 30, lineHeight: 1.25, letterSpacing: '-.025em', color: 'rgba(var(--inchiostro-rgb),.75)' }}>{t('Cosa vuoi sapere?')}</div>
            {!v.totaleDocumenti && (
              <div style={{ fontSize: 14, color: 'rgba(var(--inchiostro-rgb),.6)', marginTop: 10 }}>{frasi.nienteLetto()}</div>
            )}
          </div>
        )}

        <Intervista v={v} />

        {!v.intervista && v.messages.map(m => (
          <div key={m.id} style={m.row}>
            {!m.mio && <Mascotte size={LATO_MASCOTTE} style={AVATAR} />}
            <div style={m.bubble}>
              {/* Le domande restano testo semplice: le hai scritte tu, non
                  c'è niente da impaginare. Le risposte passano dal compositore. */}
              {m.mio ? m.text : <Testo testo={m.text} fonti={m.sources} onApri={v.apriFonte} />}
            </div>
          </div>
        ))}

        {v.pensando && (
          <div style={v.bolla.rigaSua}>
            <Mascotte size={LATO_MASCOTTE} style={AVATAR} />
            <Stato tipo="cerco" testo={t(v.passoChat || 'Ci penso')} stile={{ background: 'rgba(var(--carta-rgb),.7)', border: '1px solid rgba(var(--luce-rgb),.8)' }} />
            <Annulla su={v.annulla} />
          </div>
        )}
      </div>

      {v.prompts.length > 0 && v.chatEmpty && v.chatCaricata && !v.intervista && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '6px 2px 12px' }}>
          {v.prompts.map(p => (
            <Hov key={p.id} as="button" onClick={p.onClick} style={PASTIGLIA}
              hover={{ background: 'var(--carta-alta)', borderColor: 'var(--rame)' }}>{p.text}</Hov>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, padding: '12px 14px 12px 18px', borderRadius: 20, background: 'rgba(var(--carta-rgb),.78)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(var(--luce-rgb),.8)', boxShadow: '0 22px 52px rgba(var(--ombra-rgb),.13)', marginBottom: 4 }}>
        {scrivibile ? (
          <Campo v={v} rispondendo={rispondendo} />
        ) : (
          // un campo spento che dice «collega Claude» senza un posto dove farlo
          // è una porta chiusa: la riga stessa apre le connessioni su Claude
          <Hov as="button" type="button" onClick={() => v.apriConnessioni('claude')}
            style={{ flex: 1, minWidth: 0, textAlign: 'left', border: 'none', background: 'none', padding: 0, fontFamily: 'inherit', fontSize: 15, color: 'rgba(var(--inchiostro-rgb),.55)', cursor: 'pointer', overflowWrap: 'anywhere' }}
            hover={{ color: 'var(--rame-testo)' }}>
            {t('Collega Claude per fare domande')}
          </Hov>
        )}
        <button onClick={v.send} disabled={rispondendo ? false : (!v.claudeOn || v.pensando)} aria-label={t('Manda')} style={{
          width: 36, height: 36, flex: 'none', borderRadius: '50%', border: 'none',
          background: scrivibile ? 'linear-gradient(120deg,var(--rame-profondo),var(--ambra))' : 'rgba(var(--inchiostro-rgb),.18)',
          color: 'var(--avorio)', display: 'grid', placeItems: 'center', cursor: scrivibile ? 'pointer' : 'default'
        }}>
          <IconSu />
        </button>
      </div>
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
  return (
    <textarea ref={el} rows={1} value={v.draftMsg} onChange={v.onType} onKeyDown={v.onKey} autoFocus={rispondendo}
      placeholder={rispondendo ? t('Rispondi qui…') : t('Chiedi qualcosa al tuo materiale…')}
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
