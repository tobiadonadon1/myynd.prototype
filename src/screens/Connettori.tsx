import { Hov, LABEL } from '../ui'
import { IconPiu } from '../icons'
import type { Vals } from '../vals'

/** Le fonti da cui Myynd legge: attive sopra, da collegare sotto. */
export function Connettori({ v }: { v: Vals }) {
  return (
    <div style={{ width: 700, maxWidth: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '12px 4px 24px' }}>
        <span style={{ fontSize: 34, lineHeight: 1.1, letterSpacing: '-.03em' }}>Connettori</span>
        <span style={{ fontSize: 13, color: 'rgba(34,39,31,.65)' }}>{v.connMeta}</span>
      </div>

      <div style={{ ...LABEL, color: 'rgba(34,39,31,.5)', padding: '0 4px 10px' }}>Attivi</div>
      <div style={{ flex: 'none', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {v.connAttivi.map(c => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '15px 17px', borderRadius: 16, background: 'rgba(255,253,249,.66)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,.78)' }}>
            <span style={{ width: 7, height: 7, flex: 'none', borderRadius: '50%', background: '#5C7660' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '14.5px' }}>{c.nome}</div>
              <div style={{ fontSize: '11.5px', color: 'rgba(34,39,31,.55)', marginTop: 2 }}>{c.stato}</div>
            </div>
            <Hov as="button" onClick={c.onClick} title="Scollega"
              style={{ border: 'none', background: 'none', color: 'rgba(34,39,31,.45)', fontFamily: 'inherit', fontSize: '12.5px', cursor: 'pointer', flex: 'none' }}
              hover={{ color: '#C4623B' }}>Scollega</Hov>
          </div>
        ))}
      </div>

      <div style={{ ...LABEL, color: 'rgba(34,39,31,.5)', padding: '24px 4px 10px' }}>Da collegare</div>
      <div style={{ flex: 'none', display: 'flex', flexWrap: 'wrap', gap: 9 }}>
        {v.connSpenti.map(c => (
          <Hov key={c.id} as="button" onClick={c.onClick}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '11px 17px', borderRadius: 99, border: '1px dashed rgba(34,39,31,.3)', background: 'none', color: 'rgba(34,39,31,.72)', fontFamily: 'inherit', fontSize: '13.5px', cursor: 'pointer' }}
            hover={{ borderColor: '#C4623B', color: '#C4623B', borderStyle: 'solid' }}>
            <IconPiu />{c.nome}
          </Hov>
        ))}
      </div>
    </div>
  )
}
