import { Hov } from '../ui'
import { IconSu } from '../icons'
import { Stato } from '../components/Stato'
import type { Vals } from '../vals'

/** La chat sul tuo materiale: bolle, fonti citate sotto ogni risposta. */
export function Chat({ v }: { v: Vals }) {
  return (
    <div style={{ width: 760, maxWidth: '100%', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div ref={v.threadRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 2px 8px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {v.chatEmpty && !v.pensando && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 4px 40px' }}>
            <div style={{ fontSize: 30, lineHeight: 1.25, letterSpacing: '-.025em', color: 'rgba(34,39,31,.75)' }}>Cosa vuoi sapere?</div>
            <div style={{ fontSize: 14, color: 'rgba(34,39,31,.6)', marginTop: 10 }}>
              {v.totaleDocumenti
                ? `Ho letto ${v.totaleDocumenti.toLocaleString('it-IT')} documenti da ${v.connCount} fonti. Chiedimi qualsiasi cosa: ti dico anche da dove viene la risposta.`
                : 'Non ho ancora letto niente. Collega una fonte e poi torna qui.'}
            </div>
          </div>
        )}

        {v.messages.map(m => (
          <div key={m.id} style={m.row}>
            <div style={m.bubble}>
              {m.text}
              {m.hasSources && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
                  {m.sources.map(s => (
                    <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '11.5px', color: '#2F4A33', background: 'rgba(255,255,255,.8)', border: '1px solid rgba(34,39,31,.1)', borderRadius: 99, padding: '4px 10px' }}>{s.label}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {v.pensando && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <Stato tipo="cerco" testo="Cerco tra le fonti" stile={{ background: 'rgba(255,253,249,.7)', border: '1px solid rgba(255,255,255,.8)' }} />
          </div>
        )}
      </div>

      {v.prompts.length > 0 && v.chatEmpty && (
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
          placeholder={v.claudeOn ? 'Chiedi qualcosa al tuo materiale…' : 'Collega Claude per fare domande'}
          disabled={!v.claudeOn}
          style={{ flex: 1, border: 'none', background: 'none', outline: 'none', fontFamily: 'inherit', fontSize: 15, color: '#22271F' }} />
        <button onClick={v.send} disabled={!v.claudeOn || v.pensando} style={{
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
