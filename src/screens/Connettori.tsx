import { Hov, LABEL, useLarghezza } from '../ui'
import { t } from '../lingua'
import { IconPiu } from '../icons'
import type { Vals } from '../vals'

/** Le fonti da cui Myynd legge. */
export function Connettori({ v }: { v: Vals }) {
  // due card da 350 pixel affiancate smettono di starci molto prima
  // dell'intera schermata: sotto, una per riga
  const stretta = useLarghezza() < 900
  return (
    <div style={{ width: 700, maxWidth: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '12px 4px 20px' }}>
        <span style={{ fontSize: 34, lineHeight: 1.1, letterSpacing: '-.03em' }}>{t('Connettori')}</span>
        <span style={{ fontSize: 13, color: 'rgba(34,39,31,.65)' }}>{v.connMeta}</span>
        <div style={{ flex: 1 }} />
        {v.connCount > 0 && (
          <button onClick={v.sincronizza} disabled={!!v.sincronizzando} style={{
            padding: '9px 17px', borderRadius: 99, border: '1px solid rgba(34,39,31,.2)',
            background: 'rgba(255,255,255,.7)', color: '#22271F', fontSize: '12.5px',
            cursor: v.sincronizzando ? 'default' : 'pointer', fontFamily: 'inherit'
          }}>{v.sincronizzando ?? t('Rileggi tutto')}</button>
        )}
      </div>

      {v.connAttivi.length > 0 && (
        <>
          <div style={{ ...LABEL, color: 'rgba(34,39,31,.5)', padding: '0 4px 10px' }}>{t('Attivi')}</div>
          <div style={{ flex: 'none', display: 'grid', gridTemplateColumns: stretta ? '1fr' : '1fr 1fr', gap: 10 }}>
            {v.connAttivi.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '15px 17px', borderRadius: 16, background: 'rgba(255,253,249,.66)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,.78)' }}>
                <span style={{ width: 7, height: 7, flex: 'none', borderRadius: '50%', background: '#5C7660' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14.5px' }}>{t(c.nome)}</div>
                  <div style={{ fontSize: '11.5px', color: 'rgba(34,39,31,.55)', marginTop: 2 }}>{c.stato}</div>
                </div>
                <Hov as="button" onClick={c.onClick} title={t('Scollega')}
                  style={{ border: 'none', background: 'none', color: 'rgba(34,39,31,.45)', fontFamily: 'inherit', fontSize: '12.5px', cursor: 'pointer', flex: 'none' }}
                  hover={{ color: '#C4623B' }}>{t('Scollega')}</Hov>
              </div>
            ))}
          </div>
        </>
      )}

      {v.connSpenti.length > 0 && (
        <>
          <div style={{ ...LABEL, color: 'rgba(34,39,31,.5)', padding: '24px 4px 10px' }}>{t('Da collegare')}</div>
          <div style={{ flex: 'none', display: 'flex', flexWrap: 'wrap', gap: 9 }}>
            {v.connSpenti.map(c => (
              <Hov key={c.id} as="button" onClick={c.onClick} title={t(c.nota)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '11px 17px', borderRadius: 99, border: '1px dashed rgba(34,39,31,.3)', background: 'none', color: 'rgba(34,39,31,.72)', fontFamily: 'inherit', fontSize: '13.5px', cursor: 'pointer' }}
                hover={{ borderColor: '#C4623B', color: '#C4623B', borderStyle: 'solid' }}>
                <IconPiu />{t(c.nome)}
              </Hov>
            ))}
          </div>
        </>
      )}

      <div style={{ ...LABEL, color: 'rgba(34,39,31,.5)', padding: '24px 4px 10px' }}>{t('Più avanti')}</div>
      <div style={{ flex: 'none', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {v.connFuturi.map(c => (
          <span key={c.id} title={t(c.nota)} style={{
            padding: '9px 15px', borderRadius: 99, fontSize: '12.5px',
            border: '1px dashed rgba(34,39,31,.16)', color: 'rgba(34,39,31,.42)'
          }}>{t(c.nome)}</span>
        ))}
      </div>
      <div style={{ fontSize: '12.5px', color: 'rgba(34,39,31,.5)', lineHeight: 1.6, padding: '14px 4px 0', maxWidth: 520 }}>{t('Questi restano qui perché fanno parte del disegno, ma non sono ancora collegabili.')}</div>
    </div>
  )
}
