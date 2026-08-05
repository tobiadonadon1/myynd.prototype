import { Hov, LABEL } from '../ui'
import { IconEspandi, IconSu } from '../icons'
import type { Vals } from '../vals'

/** I chip di legenda sotto il canvas: filtrano il grafo per gruppo. */
export function Legenda({ v }: { v: Vals }) {
  return (
    <>
      {v.legenda.map(g => (
        <button key={g.id} onClick={g.onClick} style={g.chip}>
          <span style={g.dot} />{g.nome}
        </button>
      ))}
    </>
  )
}

/** Il pannello di destra: cosa c'è dentro il gruppo selezionato. */
function Pannello({ v, scuro }: { v: Vals; scuro?: boolean }) {
  const testo = scuro ? 'rgba(244,239,232,.72)' : 'rgba(34,39,31,.75)'
  const etichetta = scuro
    ? { ...LABEL, color: 'rgba(244,239,232,.5)' }
    : LABEL
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={etichetta}>{v.selTipo}</div>
          <div style={{ fontSize: scuro ? 20 : 21, lineHeight: 1.3, letterSpacing: '-.02em', marginTop: 6 }}>{v.selNome}</div>
        </div>
        <span style={v.selDot} />
      </div>
      <div style={{ fontSize: scuro ? 13 : '13.5px', lineHeight: 1.6, color: testo, marginTop: 10, textWrap: 'pretty' }}>{v.selTesto}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: scuro ? 7 : 8, marginTop: scuro ? 12 : 14 }}>
        {v.selFatti.map(f => (
          <div key={f.k} style={{ display: 'flex', gap: 10, fontSize: scuro ? '12.5px' : 13, lineHeight: 1.5, color: scuro ? 'rgba(244,239,232,.8)' : 'rgba(34,39,31,.8)', paddingTop: scuro ? 7 : 8, borderTop: '1px solid ' + (scuro ? 'rgba(255,247,240,.12)' : 'rgba(34,39,31,.09)') }}>
            <span style={{ color: scuro ? 'rgba(244,239,232,.45)' : 'rgba(34,39,31,.5)', minWidth: scuro ? 78 : 82 }}>{f.k}</span>
            <span style={{ flex: 1 }}>{f.v}</span>
          </div>
        ))}
      </div>
    </>
  )
}

/** La barra per chiedere qualcosa sul gruppo selezionato. */
function BarraNodo({ v, scuro }: { v: Vals; scuro?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 9, marginTop: scuro ? 12 : 14,
      padding: scuro ? '7px 7px 7px 13px' : '8px 8px 8px 13px', borderRadius: 99,
      background: scuro ? 'rgba(255,247,240,.1)' : 'rgba(255,255,255,.8)',
      border: '1px solid ' + (scuro ? 'rgba(255,247,240,.18)' : 'rgba(34,39,31,.14)')
    }}>
      <input value={v.nodeMsg} onChange={v.onNodeType} onKeyDown={v.onNodeKey} placeholder={v.nodePlaceholder}
        style={{ flex: 1, minWidth: 0, border: 'none', background: 'none', outline: 'none', fontFamily: 'inherit', fontSize: 13, color: scuro ? '#F4EFE8' : '#22271F' }} />
      <button onClick={v.askNode} style={{ width: 28, height: 28, flex: 'none', borderRadius: '50%', border: 'none', background: 'linear-gradient(120deg,#C4623B,#7E9C82)', color: '#FFF7F0', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
        <IconSu size={14} />
      </button>
    </div>
  )
}

/** La mappa dentro la pagina: canvas a sinistra, dettaglio a destra. */
export function Mappa({ v }: { v: Vals }) {
  return (
    <div style={{ width: 1010, maxWidth: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '12px 4px 18px' }}>
        <span style={{ fontSize: 34, lineHeight: 1.1, letterSpacing: '-.03em' }}>Mappa</span>
        <span style={{ fontSize: 13, color: 'rgba(34,39,31,.65)' }}>{v.mappaMeta}</span>
      </div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'stretch' }}>
        <div style={{ flex: 1, minWidth: 0, borderRadius: '24px 20px 24px 20px', background: '#1B1917', border: '1px solid rgba(255,247,240,.14)', boxShadow: '0 30px 70px rgba(50,36,24,.32)', overflow: 'hidden', position: 'relative' }}>
          <canvas ref={v.cvA} style={{ display: 'block', width: '100%', height: 480, cursor: 'grab', touchAction: 'none' }} />
          <Hov as="button" onClick={v.expandMap}
            style={{ position: 'absolute', top: 14, right: 14, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 15px', borderRadius: 99, border: '1px solid rgba(255,255,255,.55)', background: 'rgba(255,255,255,.14)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', color: '#FFFFFF', fontFamily: 'inherit', fontSize: '12.5px', fontWeight: 500, cursor: 'pointer' }}
            hover={{ background: '#FFFFFF', color: '#1B1917' }}>
            <IconEspandi />Espandi
          </Hov>
          <div style={{ position: 'absolute', left: 14, bottom: 12, display: 'flex', flexWrap: 'wrap', gap: 6, maxWidth: '78%' }}>
            <Legenda v={v} />
          </div>
          <div style={{ position: 'absolute', right: 16, bottom: 14, fontSize: 11, color: 'rgba(255,247,240,.4)' }}>trascina per girare · rotella per lo zoom</div>
        </div>

        <div style={{ width: 308, flex: 'none', borderRadius: '22px 26px 20px 24px', background: 'rgba(255,253,249,.74)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,.8)', boxShadow: '0 22px 52px rgba(84,64,44,.14)', padding: 20, display: 'flex', flexDirection: 'column' }}>
          <Pannello v={v} />
          <div style={{ ...LABEL, marginTop: 18 }}>Cosa hai chiesto</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 9 }}>
            {v.selChiesto.map(c => (
              <Hov key={c.id} onClick={c.onClick}
                style={{ fontSize: '12.5px', lineHeight: 1.45, color: 'rgba(34,39,31,.78)', padding: '9px 11px', borderRadius: 12, background: 'rgba(34,39,31,.05)', cursor: 'pointer' }}
                hover={{ background: 'rgba(196,98,59,.14)' }}>{c.q}</Hov>
            ))}
          </div>
          <div style={{ flex: 1, minHeight: 12 }} />
          <BarraNodo v={v} />
        </div>
      </div>
    </div>
  )
}

/** La mappa a tutto schermo. */
export function MappaPiena({ v }: { v: Vals }) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 40, background: '#191715', display: 'flex', flexDirection: 'column', animation: 'fadein .22s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 22px', flex: 'none' }}>
        <span style={{ fontSize: 15, color: 'rgba(255,247,240,.9)' }}>Mappa</span>
        <span style={{ fontSize: '12.5px', color: 'rgba(255,247,240,.5)' }}>{v.mappaMeta} · trascina per girare, rotella per lo zoom</span>
        <div style={{ flex: 1 }} />
        <button onClick={v.resetView} style={{ padding: '8px 15px', borderRadius: 99, border: '1px solid rgba(255,255,255,.34)', background: 'none', color: 'rgba(255,255,255,.85)', fontFamily: 'inherit', fontSize: '12.5px', cursor: 'pointer' }}>Rimetti a fuoco</button>
        <button onClick={v.closeMap} style={{ padding: '8px 15px', borderRadius: 99, border: '1px solid rgba(255,255,255,.55)', background: 'rgba(255,255,255,.14)', color: '#FFFFFF', fontFamily: 'inherit', fontSize: '12.5px', fontWeight: 500, cursor: 'pointer' }}>Chiudi</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <canvas ref={v.cvB} style={{ display: 'block', width: '100%', height: '100%', cursor: 'grab', touchAction: 'none' }} />
        <div style={{ position: 'absolute', left: 22, bottom: 20, display: 'flex', flexWrap: 'wrap', gap: 7, maxWidth: 520 }}>
          <Legenda v={v} />
        </div>
        <div style={{ position: 'absolute', right: 22, top: 14, width: 330, borderRadius: 20, background: 'rgba(28,25,23,.9)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)', border: '1px solid rgba(255,247,240,.16)', boxShadow: '0 30px 70px rgba(0,0,0,.5)', padding: 20, color: '#F4EFE8', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100% - 34px)' }}>
          <Pannello v={v} scuro />
          <div style={{ overflowY: 'auto', marginTop: 14 }}>
            {v.selChiesto.map(c => (
              <Hov key={c.id} onClick={c.onClick}
                style={{ fontSize: '12.5px', lineHeight: 1.45, color: 'rgba(244,239,232,.8)', padding: '9px 11px', borderRadius: 12, background: 'rgba(255,247,240,.07)', cursor: 'pointer', marginBottom: 6 }}
                hover={{ background: 'rgba(255,247,240,.14)' }}>{c.q}</Hov>
            ))}
          </div>
          <BarraNodo v={v} scuro />
        </div>
      </div>
    </div>
  )
}
