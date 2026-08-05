import { CARD_GLASS, LABEL } from '../ui'
import type { Vals } from '../vals'

/** Quanto lasciar fare a Myynd, con che tono, e dove non deve entrare. */
export function Preferenze({ v }: { v: Vals }) {
  return (
    <div style={{ width: 720, maxWidth: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 34, lineHeight: 1.1, letterSpacing: '-.03em', padding: '12px 4px 22px' }}>Preferenze</div>

      <div style={{ ...CARD_GLASS, flex: 'none', borderRadius: '24px 20px 24px 20px', padding: '22px 24px' }}>
        <div style={LABEL}>Autonomia</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 12 }}>
          {v.autonomie.map(a => (
            <div key={a.id} onClick={a.onClick} style={a.row}>
              <span style={a.radio} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15 }}>{a.titolo}</div>
                <div style={{ fontSize: '12.5px', lineHeight: 1.5, color: 'rgba(34,39,31,.65)', marginTop: 3 }}>{a.nota}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: '20px 24px 20px 24px', padding: '22px 24px' }}>
        <div style={LABEL}>Tono</div>
        <div style={{ display: 'flex', gap: 9, marginTop: 14 }}>
          {v.toni.map(t => (
            <button key={t.id} onClick={t.onClick} style={t.style}>{t.label}</button>
          ))}
        </div>
        <div style={{ fontSize: '13.5px', lineHeight: 1.6, color: 'rgba(34,39,31,.72)', marginTop: 14, padding: '13px 15px', borderRadius: 14, background: 'rgba(34,39,31,.05)', textWrap: 'pretty' }}>{v.tonoEsempio}</div>
      </div>

      <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: '24px 20px 24px 20px', padding: '6px 24px' }}>
        {v.switches.map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '17px 0', borderTop: '1px solid rgba(34,39,31,.08)' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15 }}>{s.titolo}</div>
              <div style={{ fontSize: '12.5px', lineHeight: 1.5, color: 'rgba(34,39,31,.65)', marginTop: 4 }}>{s.nota}</div>
            </div>
            <div onClick={s.onToggle} style={s.track}><div style={s.knob} /></div>
          </div>
        ))}
      </div>

      <div style={{ ...CARD_GLASS, flex: 'none', marginTop: 14, borderRadius: '20px 24px 20px 24px', padding: '22px 24px' }}>
        <div style={LABEL}>Dove non entra</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
          {v.aree.map(a => (
            <button key={a.id} onClick={a.onClick} style={a.style}>{a.label}</button>
          ))}
        </div>
      </div>

      <div style={{ flex: 'none', marginTop: 14, borderRadius: '24px 20px 24px 20px', background: 'linear-gradient(140deg,rgba(196,98,59,.14),rgba(255,253,249,.78) 52%,rgba(126,156,130,.18))', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,.8)', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15 }}>Qualcosa non va</div>
          <div style={{ fontSize: '12.5px', color: 'rgba(34,39,31,.65)', marginTop: 3 }}>Scrivi al team che tiene su Myynd.</div>
        </div>
        <button onClick={v.openTicket} style={{ padding: '9px 18px', borderRadius: 99, border: 'none', background: 'linear-gradient(120deg,#C4623B,#7E9C82)', color: '#FFF7F0', fontFamily: 'inherit', fontSize: '13.5px', fontWeight: 500, cursor: 'pointer', flex: 'none' }}>Apri un ticket</button>
      </div>
    </div>
  )
}
