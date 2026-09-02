import { frasi, t } from '../lingua'
import { Hov } from '../ui'
import { IconSu } from '../icons'
import { Stato } from '../components/Stato'
import { Testo } from '../Testo'
import type { Vals } from '../vals'

/** La chat sul tuo materiale: bolle, fonti citate sotto ogni risposta. */
export function Chat({ v }: { v: Vals }) {
  return (
    <div style={{ width: 760, maxWidth: '100%', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div ref={v.threadRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 2px 8px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* «Cosa vuoi sapere?» solo quando è vero: per un attimo, mentre i
            messaggi arrivavano, la chat piena si presentava vuota */}
        {v.chatEmpty && v.chatCaricata && !v.pensando && (
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

        {v.messages.map(m => (
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

      {v.prompts.length > 0 && v.chatEmpty && v.chatCaricata && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '6px 2px 12px' }}>
          {v.prompts.map(p => (
            <Hov key={p.id} as="button" onClick={p.onClick}
              style={{ padding: '8px 14px', borderRadius: 99, border: '1px solid rgba(34,39,31,.16)', background: 'rgba(255,253,249,.7)', color: '#22271F', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
              hover={{ background: '#FFFFFF', borderColor: '#C4623B' }}>{p.text}</Hov>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px 12px 18px', borderRadius: '22px 20px 22px 18px', background: 'rgba(255,253,249,.78)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,.8)', boxShadow: '0 22px 52px rgba(84,64,44,.13)', marginBottom: 4 }}>
        <input value={v.draftMsg} onChange={v.onType} onKeyDown={v.onKey}
          placeholder={v.claudeOn ? t('Chiedi qualcosa al tuo materiale…') : t('Collega Claude per fare domande')}
          disabled={!v.claudeOn}
          style={{ flex: 1, border: 'none', background: 'none', outline: 'none', fontFamily: 'inherit', fontSize: 15, color: '#22271F' }} />
        <button onClick={v.send} disabled={!v.claudeOn || v.pensando} aria-label={t('Manda')} style={{
          width: 36, height: 36, flex: 'none', borderRadius: '50%', border: 'none',
          background: v.claudeOn ? 'linear-gradient(120deg,#C4623B,#7E9C82)' : 'rgba(34,39,31,.18)',
          color: '#FFF7F0', display: 'grid', placeItems: 'center', cursor: v.claudeOn ? 'pointer' : 'default'
        }}>
          <IconSu />
        </button>
      </div>
    </div>
  )
}
