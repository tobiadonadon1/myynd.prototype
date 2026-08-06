import { Hov } from './ui'
import { IconCerca } from './icons'
import type { Vals } from './vals'

const VELO = (z: number, alpha: number, blur: number) => ({
  position: 'absolute' as const, inset: 0, background: `rgba(40,30,22,${alpha})`,
  backdropFilter: `blur(${blur}px)`, WebkitBackdropFilter: `blur(${blur}px)`, zIndex: z
})

/** Il documento vero, come è stato indicizzato. */
export function Documento({ v }: { v: Vals }) {
  const d = v.doc
  if (!d) return null
  const data = d.quando ? new Date(d.quando).toLocaleString('it-IT', { dateStyle: 'long', timeStyle: 'short' }) : ''
  return (
    <>
      <div onClick={v.chiudiDoc} style={VELO(48, 0.4, 4)} />
      <div style={{ position: 'absolute', top: 60, bottom: 60, left: '50%', transform: 'translateX(-50%)', width: 640, maxWidth: '86%', zIndex: 49, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 4px 12px', color: '#FFF7F0' }}>
          <span style={{ fontSize: 13, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.titolo}</span>
          <span style={{ fontSize: 12, opacity: 0.7 }}>{d.fonte}</span>
          <button onClick={v.chiudiDoc} style={{ padding: '6px 13px', borderRadius: 99, border: '1px solid rgba(255,255,255,.5)', background: 'rgba(255,255,255,.14)', color: '#FFFFFF', fontSize: '12.5px', cursor: 'pointer', fontFamily: 'inherit' }}>Chiudi</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', background: '#FFFFFF', borderRadius: 6, boxShadow: '0 40px 90px rgba(20,12,6,.5)', padding: '44px 48px' }}>
          <div style={{ paddingBottom: 20, borderBottom: '2px solid #22271F' }}>
            <div style={{ fontSize: 21, fontWeight: 500, letterSpacing: '-.015em', lineHeight: 1.3 }}>{d.titolo}</div>
            <div style={{ fontSize: '12.5px', color: 'rgba(34,39,31,.6)', marginTop: 8, lineHeight: 1.7 }}>
              {d.autore && <>{d.autore}<br /></>}
              {data}
              {d.percorso && <><br /><span style={{ wordBreak: 'break-all' }}>{d.percorso}</span></>}
            </div>
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.75, color: 'rgba(34,39,31,.86)', marginTop: 26, whiteSpace: 'pre-wrap', textWrap: 'pretty' }}>{d.corpo}</div>
        </div>
      </div>
    </>
  )
}

/** La ricerca globale sull'indice. */
export function Ricerca({ v }: { v: Vals }) {
  return (
    <>
      <div onClick={v.closeSearch} style={VELO(46, 0.24, 3)} />
      <div style={{ position: 'absolute', top: 88, left: '50%', transform: 'translateX(-50%)', width: 600, maxWidth: '82%', borderRadius: '24px 20px 24px 20px', background: 'rgba(255,253,249,.96)', border: '1px solid rgba(255,255,255,.95)', boxShadow: '0 40px 90px rgba(60,44,30,.34)', zIndex: 47, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', borderBottom: '1px solid rgba(34,39,31,.09)' }}>
          <IconCerca size={17} style={{ flex: 'none', color: 'rgba(34,39,31,.6)' }} />
          <input value={v.query} onChange={v.onQuery}
            placeholder={v.totaleDocumenti ? `Cerca fra ${v.totaleDocumenti.toLocaleString('it-IT')} documenti…` : 'Niente da cercare ancora'} autoFocus
            onKeyDown={e => { if (e.key === 'Escape') v.closeSearch() }}
            style={{ flex: 1, border: 'none', background: 'none', outline: 'none', fontFamily: 'inherit', fontSize: 16, color: '#22271F' }} />
          <button onClick={v.closeSearch} style={{ border: '1px solid rgba(34,39,31,.16)', background: 'none', borderRadius: 7, padding: '3px 8px', fontFamily: 'inherit', fontSize: 11, color: 'rgba(34,39,31,.6)', cursor: 'pointer' }}>esc</button>
        </div>
        <div style={{ maxHeight: 340, overflowY: 'auto', padding: 6 }}>
          {v.risultati.map(r => (
            <Hov key={r.id} onClick={r.onClick}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 13px', borderRadius: 14, cursor: 'pointer' }}
              hover={{ background: 'rgba(34,39,31,.06)' }}>
              <span style={r.dot} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.titolo}</div>
                <div style={{ fontSize: '12.5px', color: 'rgba(34,39,31,.62)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.fonte}</div>
              </div>
              <span style={{ fontSize: 12, color: 'rgba(34,39,31,.5)', flex: 'none' }}>{r.quando}</span>
            </Hov>
          ))}
          {v.query.trim() && !v.risultati.length && (
            <div style={{ padding: '22px 14px', fontSize: 14, color: 'rgba(34,39,31,.6)' }}>Niente che corrisponda.</div>
          )}
          {!v.query.trim() && !v.risultati.length && (
            <div style={{ padding: '22px 14px', fontSize: 14, color: 'rgba(34,39,31,.55)' }}>
              Non c’è ancora niente da cercare.
            </div>
          )}
        </div>
      </div>
    </>
  )
}

/** La notifica in alto a destra. */
export function Toast({ v }: { v: Vals }) {
  return (
    <div style={{ position: 'absolute', top: 22, right: 26, zIndex: 50, display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderRadius: '18px 15px 18px 14px', background: 'rgba(255,253,249,.94)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,.9)', boxShadow: '0 26px 60px rgba(60,44,30,.26)', animation: 'toastin .3s ease', maxWidth: 340 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'linear-gradient(120deg,#C4623B,#7E9C82)', flex: 'none' }} />
      <span style={{ fontSize: '13.5px', lineHeight: 1.45, flex: 1 }}>{v.toastText}</span>
      {v.toastUndo && (
        <button onClick={v.undo} style={{ border: 'none', background: 'none', color: '#3E5140', fontFamily: 'inherit', fontSize: 13, fontWeight: 500, cursor: 'pointer', flex: 'none' }}>Annulla</button>
      )}
    </div>
  )
}
