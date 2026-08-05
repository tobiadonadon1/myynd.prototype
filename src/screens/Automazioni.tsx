import { Hov } from '../ui'
import { IconPiu } from '../icons'
import type { Vals } from '../vals'

/** Le automazioni attive, con il dettaglio dei passi quando ne apri una. */
export function Automazioni({ v }: { v: Vals }) {
  return (
    <div style={{ width: 880, maxWidth: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '12px 4px 0' }}>
        <span style={{ fontSize: 34, lineHeight: 1.1, letterSpacing: '-.03em' }}>Automazioni</span>
        <span style={{ fontSize: 13, color: 'rgba(34,39,31,.65)' }}>{v.autoMeta}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, padding: '26px 0 0' }}>
        {v.automazioni.map(a => (
          <div key={a.id} onClick={a.onOpen} style={a.card}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 500 }}>{a.nome}</div>
                <div style={{ fontSize: 13, lineHeight: 1.5, color: 'rgba(34,39,31,.7)', marginTop: 5, textWrap: 'pretty' }}>{a.desc}</div>
              </div>
              <div onClick={a.onToggle} style={a.track}><div style={a.knob} /></div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 18, fontSize: '12.5px', color: 'rgba(34,39,31,.62)' }}>
              <span>{a.esecuzioni} esecuzioni</span><span>·</span>
              <span style={{ color: '#A34E2D', fontWeight: 500 }}>{a.risparmio} risparmiate</span>
              <div style={{ flex: 1 }} />
              <span>{a.ultima}</span>
            </div>
          </div>
        ))}
        <Hov onClick={v.openNuova}
          style={{ borderRadius: 22, border: '1px dashed rgba(34,39,31,.28)', background: 'rgba(255,253,249,.34)', padding: 20, display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer', color: 'rgba(34,39,31,.72)', fontSize: '14.5px' }}
          hover={{ background: 'rgba(255,253,249,.7)', color: '#C4623B', borderColor: '#C4623B' }}>
          <IconPiu size={17} />Nuova automazione
        </Hov>
      </div>

      {v.autoDetail && (
        <div style={{ flex: 'none', marginTop: 16, borderRadius: '24px 20px 24px 20px', background: 'rgba(255,253,249,.8)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,.85)', boxShadow: '0 26px 60px rgba(84,64,44,.16)', padding: '22px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 18, fontWeight: 500, flex: 1 }}>{v.detailNome}</span>
            <span style={{ fontSize: '12.5px', color: 'rgba(34,39,31,.6)' }}>{v.detailMeta}</span>
            <button onClick={v.closeAuto} style={{ border: 'none', background: 'none', color: 'rgba(34,39,31,.6)', fontSize: 20, cursor: 'pointer', padding: '0 4px' }}>×</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 14 }}>
            {v.detailSteps.map(s => (
              <div key={s.n} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '11px 0', borderTop: '1px solid rgba(34,39,31,.08)' }}>
                <span style={{ width: 22, height: 22, flex: 'none', borderRadius: '50%', background: 'linear-gradient(120deg,#C4623B,#7E9C82)', color: '#FFF7F0', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 500 }}>{s.n}</span>
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: 500 }}>{s.titolo}</div>
                  <div style={{ fontSize: 13, lineHeight: 1.5, color: 'rgba(34,39,31,.7)', marginTop: 3 }}>{s.dettaglio}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
