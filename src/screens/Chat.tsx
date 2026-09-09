import { frasi, t } from '../lingua'
import { Hov } from '../ui'
import { IconSu } from '../icons'
import { Stato } from '../components/Stato'
import { Testo } from '../Testo'
import type { Vals } from '../vals'

const PASTIGLIA: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 99, border: '1px solid rgba(34,39,31,.16)', background: 'rgba(255,253,249,.7)',
  color: '#22271F', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit'
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
  const Sua = ({ testo }: { testo: string }) => <div style={v.bolla.rigaSua}><div style={v.bolla.sua}>{testo}</div></div>
  return (
    <>
      <Sua testo={t('Prima due parole su di te, così so con chi parlo.')} />
      {i.battute.map((b, n) => (
        <div key={n} style={{ display: 'contents' }}>
          <Sua testo={t(b.domanda)} />
          <div style={v.bolla.rigaMia}><div style={v.bolla.mia}>{b.risposta === '—' ? '—' : t(b.risposta)}</div></div>
        </div>
      ))}
      {i.domanda && <>
        <Sua testo={t(i.domanda.testo)} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '0 2px' }}>
          {i.domanda.scelte?.map(s => (
            <Hov key={s.id} as="button" onClick={() => i.rispondi(s.id)} style={PASTIGLIA}
              hover={{ background: '#FFFFFF', borderColor: '#C4623B' }}>{t(s.testo)}</Hov>
          ))}
          <Hov as="button" onClick={() => i.rispondi(null)} style={{ ...PASTIGLIA, color: 'rgba(34,39,31,.6)' }}
            hover={{ background: '#FFFFFF' }}>{t('Salta')}</Hov>
        </div>
      </>}
      {i.finita && <>
        <Sua testo={t('Fatto. Cambi tutto quando vuoi, dalle preferenze.')} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '0 2px' }}>
          {v.senzaProgetto && (
            <Hov as="button" onClick={i.configuraProgetto} style={PASTIGLIA}
              hover={{ background: '#FFFFFF', borderColor: '#C4623B' }}>{t('Configura il progetto')}</Hov>
          )}
          <Hov as="button" onClick={i.chiudi} style={{ ...PASTIGLIA, color: 'rgba(34,39,31,.6)' }}
            hover={{ background: '#FFFFFF' }}>{t('Chiudi')}</Hov>
        </div>
      </>}
    </>
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
            <div style={{ fontSize: 30, lineHeight: 1.25, letterSpacing: '-.025em', color: 'rgba(34,39,31,.75)' }}>{t('Cosa vuoi sapere?')}</div>
            {!v.totaleDocumenti && (
              <div style={{ fontSize: 14, color: 'rgba(34,39,31,.6)', marginTop: 10 }}>{frasi.nienteLetto()}</div>
            )}
          </div>
        )}

        <Intervista v={v} />

        {!v.intervista && v.messages.map(m => (
          <div key={m.id} style={m.row}>
            <div style={m.bubble}>
              {/* Le domande restano testo semplice: le hai scritte tu, non
                  c'è niente da impaginare. Le risposte passano dal compositore. */}
              {m.mio ? m.text : <Testo testo={m.text} fonti={m.sources} onApri={v.apriFonte} />}
            </div>
          </div>
        ))}

        {v.pensando && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <Stato tipo="cerco" testo={t('Cerco tra le fonti')} stile={{ background: 'rgba(255,253,249,.7)', border: '1px solid rgba(255,255,255,.8)' }} />
          </div>
        )}
      </div>

      {v.prompts.length > 0 && v.chatEmpty && v.chatCaricata && !v.intervista && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '6px 2px 12px' }}>
          {v.prompts.map(p => (
            <Hov key={p.id} as="button" onClick={p.onClick} style={PASTIGLIA}
              hover={{ background: '#FFFFFF', borderColor: '#C4623B' }}>{p.text}</Hov>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px 12px 18px', borderRadius: 20, background: 'rgba(255,253,249,.78)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,.8)', boxShadow: '0 22px 52px rgba(84,64,44,.13)', marginBottom: 4 }}>
        {scrivibile ? (
          <input value={v.draftMsg} onChange={v.onType} onKeyDown={v.onKey} autoFocus={rispondendo}
            placeholder={rispondendo ? t('Rispondi qui…') : t('Chiedi qualcosa al tuo materiale…')}
            style={{ flex: 1, border: 'none', background: 'none', outline: 'none', fontFamily: 'inherit', fontSize: 15, color: '#22271F' }} />
        ) : (
          // un campo spento che dice «collega Claude» senza un posto dove farlo
          // è una porta chiusa: la riga stessa apre le connessioni su Claude
          <Hov as="button" type="button" onClick={() => v.apriConnessioni('claude')}
            style={{ flex: 1, minWidth: 0, textAlign: 'left', border: 'none', background: 'none', padding: 0, fontFamily: 'inherit', fontSize: 15, color: 'rgba(34,39,31,.55)', cursor: 'pointer', overflowWrap: 'anywhere' }}
            hover={{ color: '#8E3F1F' }}>
            {t('Collega Claude per fare domande')}
          </Hov>
        )}
        <button onClick={v.send} disabled={rispondendo ? false : (!v.claudeOn || v.pensando)} aria-label={t('Manda')} style={{
          width: 36, height: 36, flex: 'none', borderRadius: '50%', border: 'none',
          background: scrivibile ? 'linear-gradient(120deg,#B24E2E,#D98A5A)' : 'rgba(34,39,31,.18)',
          color: '#FFF7F0', display: 'grid', placeItems: 'center', cursor: scrivibile ? 'pointer' : 'default'
        }}>
          <IconSu />
        </button>
      </div>
    </div>
  )
}
