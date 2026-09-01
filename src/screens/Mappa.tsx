import { Hov, LABEL, useLarghezza } from '../ui'
import { t } from '../lingua'
import { IconEspandi, IconSu } from '../icons'
import type { Vals } from '../vals'

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

function Pannello({ v, scuro }: { v: Vals; scuro?: boolean }) {
  const testo = scuro ? 'rgba(244,239,232,.72)' : 'rgba(34,39,31,.75)'
  const etichetta = scuro ? { ...LABEL, color: 'rgba(244,239,232,.5)' } : LABEL
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
    </>
  )
}

function BarraNodo({ v, scuro }: { v: Vals; scuro?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 9, marginTop: scuro ? 12 : 14,
      padding: scuro ? '7px 7px 7px 13px' : '8px 8px 8px 13px', borderRadius: 99,
      background: scuro ? 'rgba(255,247,240,.1)' : 'rgba(255,255,255,.8)',
      border: '1px solid ' + (scuro ? 'rgba(255,247,240,.18)' : 'rgba(34,39,31,.14)')
    }}>
      <input value={v.nodeMsg} onChange={v.onNodeType} onKeyDown={v.onNodeKey} placeholder={v.nodePlaceholder}
        className={scuro ? 'scuro' : undefined}
        disabled={!v.claudeOn}
        style={{ flex: 1, minWidth: 0, border: 'none', background: 'none', outline: 'none', fontFamily: 'inherit', fontSize: 13, color: scuro ? '#F4EFE8' : '#22271F' }} />
      <button onClick={v.askNode} disabled={!v.claudeOn} style={{ width: 28, height: 28, flex: 'none', borderRadius: '50%', border: 'none', background: v.claudeOn ? 'linear-gradient(120deg,#C4623B,#7E9C82)' : 'rgba(120,110,100,.35)', color: '#FFF7F0', display: 'grid', placeItems: 'center', cursor: v.claudeOn ? 'pointer' : 'default' }}>
        <IconSu size={14} />
      </button>
    </div>
  )
}

export function Mappa({ v }: { v: Vals }) {
  // Sotto i mille pixel il canvas e il pannello laterale non ci stanno
  // affiancati: 308 fissi per il pannello lasciavano al disegno una fetta
  // sempre più stretta finché la palla non era più leggibile. Si impilano.
  const stretta = useLarghezza() < 1000
  return (
    <div style={{ width: 1010, maxWidth: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '12px 4px 18px' }}>
        <span style={{ fontSize: 34, lineHeight: 1.1, letterSpacing: '-.03em' }}>{t('Mappa')}</span>
        <span style={{ fontSize: 13, color: 'rgba(34,39,31,.65)' }}>{v.mappaMeta}</span>
      </div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'stretch', flexDirection: stretta ? 'column' : 'row' }}>
        <div style={{ flex: 1, minWidth: 0, borderRadius: '24px 20px 24px 20px', background: '#1B1917', border: '1px solid rgba(255,247,240,.14)', boxShadow: '0 30px 70px rgba(50,36,24,.32)', overflow: 'hidden', position: 'relative' }}>
          <canvas ref={v.cvA} style={{ display: 'block', width: '100%', height: 480, cursor: 'grab', touchAction: 'none' }} />
          {v.mappaVuota && (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'rgba(255,247,240,.5)', fontSize: 14, textAlign: 'center', padding: 30 }}>{t('Niente da mostrare: collega una fonte e fai leggere qualcosa a Myynd.')}</div>
          )}
          {!v.mappaVuota && (
            <>
              <Hov as="button" onClick={v.expandMap}
                style={{ position: 'absolute', top: 14, right: 14, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 15px', borderRadius: 99, border: '1px solid rgba(255,255,255,.55)', background: 'rgba(255,255,255,.14)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', color: '#FFFFFF', fontFamily: 'inherit', fontSize: '12.5px', fontWeight: 500, cursor: 'pointer' }}
                hover={{ background: '#FFFFFF', color: '#1B1917' }}>
                <IconEspandi />{t('Espandi')}</Hov>
              <div style={{ position: 'absolute', left: 14, bottom: 12, display: 'flex', flexWrap: 'wrap', gap: 6, maxWidth: '78%' }}>
                <Legenda v={v} />
              </div>
              <div style={{ position: 'absolute', right: 16, bottom: 14, fontSize: 11, color: 'rgba(255,247,240,.4)' }}>{t('trascina per girare · rotella per lo zoom')}</div>
            </>
          )}
        </div>

        <div style={{ width: stretta ? '100%' : 308, flex: 'none', borderRadius: '22px 26px 20px 24px', background: 'rgba(255,253,249,.74)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,.8)', boxShadow: '0 22px 52px rgba(84,64,44,.14)', padding: 20, display: 'flex', flexDirection: 'column' }}>
          <Pannello v={v} />
          <div style={{ flex: 1, minHeight: 12 }} />
          <BarraNodo v={v} />
        </div>
      </div>
    </div>
  )
}

export function MappaPiena({ v }: { v: Vals }) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 40, background: '#191715', display: 'flex', flexDirection: 'column', animation: 'fadein .22s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 22px', flex: 'none' }}>
        <span style={{ fontSize: 15, color: 'rgba(255,247,240,.9)' }}>{t('Mappa')}</span>
        <span style={{ fontSize: '12.5px', color: 'rgba(255,247,240,.5)' }}>{v.mappaMeta} · trascina per girare, rotella per lo zoom</span>
        <div style={{ flex: 1 }} />
        <button onClick={v.resetView} style={{ padding: '8px 15px', borderRadius: 99, border: '1px solid rgba(255,255,255,.34)', background: 'none', color: 'rgba(255,255,255,.85)', fontFamily: 'inherit', fontSize: '12.5px', cursor: 'pointer' }}>{t('Rimetti a fuoco')}</button>
        <button onClick={v.closeMap} style={{ padding: '8px 15px', borderRadius: 99, border: '1px solid rgba(255,255,255,.55)', background: 'rgba(255,255,255,.14)', color: '#FFFFFF', fontFamily: 'inherit', fontSize: '12.5px', fontWeight: 500, cursor: 'pointer' }}>{t('Chiudi')}</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <canvas ref={v.cvB} style={{ display: 'block', width: '100%', height: '100%', cursor: 'grab', touchAction: 'none' }} />
        <div style={{ position: 'absolute', left: 22, bottom: 20, display: 'flex', flexWrap: 'wrap', gap: 7, maxWidth: 520 }}>
          <Legenda v={v} />
        </div>
        <div style={{ position: 'absolute', right: 22, top: 14, width: 330, borderRadius: 20, background: 'rgba(28,25,23,.9)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)', border: '1px solid rgba(255,247,240,.16)', boxShadow: '0 30px 70px rgba(0,0,0,.5)', padding: 20, color: '#F4EFE8', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100% - 34px)' }}>
          <Pannello v={v} scuro />
          <div style={{ flex: 1, minHeight: 10 }} />
          <BarraNodo v={v} scuro />
        </div>
      </div>
    </div>
  )
}
