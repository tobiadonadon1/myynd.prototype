import { Hov, LABEL } from '../ui'
import { IconApri, IconDoc, IconGiu, IconSpunta } from '../icons'
import type { Vals } from '../vals'

/** Il feed: la cosa più urgente in grande, il resto sotto, le fatte in fondo. */
export function Myynd({ v }: { v: Vals }) {
  return (
    <div style={{ width: 760, maxWidth: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 4px 0' }}>
        <span style={{ fontSize: 12, color: 'rgba(34,39,31,.7)' }}>Lunedì 3 agosto · 14:32</span>
        <div style={{ flex: 1 }} />
        <a href="#" onClick={v.goConn} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#2F4A33', background: 'rgba(255,255,255,.7)', border: '1px solid rgba(255,255,255,.9)', borderRadius: 99, padding: '5px 11px', transform: 'rotate(-.6deg)' }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#5C7660' }} />
          {v.connCount} fonti
        </a>
      </div>
      <div style={{ fontSize: 40, lineHeight: 1.18, letterSpacing: '-.03em', maxWidth: 600, padding: '22px 3px 26px', textWrap: 'pretty' }}>{v.headline}</div>

      {v.hasHero && (
        <div style={v.heroStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#FFF7F0', flex: 'none' }} />
            <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: '.02em' }}>{v.heroTipo}</span>
            <span style={{ fontSize: '12.5px', color: 'rgba(255,247,240,.85)' }}>{v.heroFonte} · {v.heroOra}</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: '12.5px', fontWeight: 700, letterSpacing: '.02em', color: '#33221F', background: '#FFF7F0', borderRadius: 99, padding: '5px 12px', boxShadow: '0 6px 16px rgba(30,20,14,.28)' }}>{v.heroUrgenza}</span>
          </div>
          <div style={{ fontSize: 21, lineHeight: 1.45, marginTop: 20, maxWidth: 600, textWrap: 'pretty' }}>{v.heroTesto}</div>

          <div style={{ marginTop: 20, borderRadius: '18px 15px 18px 13px', background: 'rgba(255,253,249,.9)', border: '1px solid rgba(255,255,255,.85)', padding: '16px 18px', color: '#22271F' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={LABEL}>{v.heroQuoteFonte}</span>
              <div style={{ flex: 1 }} />
              <Hov as="button" onClick={v.openOriginal}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', padding: 0, color: '#8E3F1F', fontSize: 12, cursor: 'pointer' }}
                hover={{ color: '#C4623B' }}>
                <IconApri style={{ flex: 'none' }} />{v.heroOpenLabel}
              </Hov>
              <span style={{ width: 1, height: 12, background: 'rgba(34,39,31,.2)' }} />
              <Hov as="button" onClick={v.heroSecondary}
                style={{ border: 'none', background: 'none', padding: 0, color: 'rgba(34,39,31,.6)', fontSize: 12, cursor: 'pointer' }}
                hover={{ color: '#8E3F1F' }}>
                {v.heroSecondaryLabel}
              </Hov>
            </div>
            <div style={{ fontSize: '13.5px', fontWeight: 500, marginTop: 8 }}>{v.heroQuoteTitolo}</div>
            <div style={{ fontSize: 14, lineHeight: 1.6, color: 'rgba(34,39,31,.78)', marginTop: 6, whiteSpace: 'pre-line', textWrap: 'pretty' }}>{v.heroQuote}</div>

            {v.heroHasAllegato && (
              <Hov onClick={v.openDoc}
                style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 14, padding: '11px 13px', borderRadius: 13, border: '1px solid rgba(34,39,31,.16)', background: 'rgba(255,255,255,.7)', cursor: 'pointer' }}
                hover={{ background: '#FFFFFF', borderColor: '#C4623B' }}>
                <IconDoc style={{ flex: 'none' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.heroAllegato}</div>
                  <div style={{ fontSize: '11.5px', color: 'rgba(34,39,31,.58)', marginTop: 2 }}>{v.heroAllegatoMeta}</div>
                </div>
                <span style={{ fontSize: 12, color: '#8E3F1F', flex: 'none' }}>Apri</span>
              </Hov>
            )}
            {v.heroModificata && (
              <span style={{ display: 'inline-block', marginTop: 12, fontSize: '11.5px', color: '#8E3F1F', background: 'rgba(196,98,59,.12)', borderRadius: 99, padding: '4px 10px' }}>modificata da te</span>
            )}
          </div>

          <div style={{ flex: 1, minHeight: 14 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 22 }}>
            <Hov as="button" onClick={v.heroPrimary}
              style={{ padding: '12px 24px', borderRadius: 99, border: 'none', background: '#FFF7F0', color: '#22271F', fontSize: 14, fontWeight: 500, boxShadow: '0 10px 24px rgba(30,20,14,.3)', cursor: 'pointer' }}
              hover={{ background: '#FFFFFF' }}>{v.heroPrimaryLabel}</Hov>
            <Hov as="button" onClick={v.startEdit}
              style={{ padding: '12px 20px', borderRadius: 99, border: '1px solid rgba(255,247,240,.6)', background: 'rgba(255,247,240,.14)', color: '#FFF7F0', fontSize: 14, cursor: 'pointer' }}
              hover={{ background: 'rgba(255,247,240,.28)' }}>{v.heroEditLabel}</Hov>
            <Hov as="button" onClick={v.heroAsk}
              style={{ padding: '12px 17px', borderRadius: 99, border: 'none', background: 'none', color: 'rgba(255,247,240,.9)', fontSize: 14, cursor: 'pointer' }}
              hover={{ color: '#FFFFFF' }}>Chiedi a Myynd</Hov>
            <div style={{ flex: 1 }} />
            <Hov as="button" onClick={v.heroSkip} title="Più tardi"
              style={{ padding: '10px 12px', border: 'none', background: 'none', color: 'rgba(255,247,240,.8)', fontSize: 13, cursor: 'pointer' }}
              hover={{ color: '#FFFFFF' }}>Più tardi</Hov>
          </div>
        </div>
      )}

      {v.hasRest && (
        <div style={{ flex: 'none', marginTop: 16, borderRadius: '22px 26px 20px 24px', background: 'rgba(255,253,249,.66)', backdropFilter: 'blur(24px) saturate(1.4)', WebkitBackdropFilter: 'blur(24px) saturate(1.4)', border: '1px solid rgba(255,255,255,.7)', boxShadow: '0 22px 52px rgba(84,64,44,.11)', transform: 'rotate(.2deg)', overflow: 'hidden' }}>
          {v.resto.map(i => (
            <div key={i.id} onClick={i.onPromote} style={i.row}>
              <span style={i.dot} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ fontSize: '12.5px', fontWeight: 500 }}>{i.tipo}</span>
                  <span style={{ fontSize: 12, color: 'rgba(34,39,31,.6)' }}>{i.fonte} · {i.ora}</span>
                </div>
                <div style={{ fontSize: '14.5px', lineHeight: 1.5, color: 'rgba(34,39,31,.78)', marginTop: 6, textWrap: 'pretty' }}>{i.testo}</div>
              </div>
              <span style={i.pill}>{i.urgenza}</span>
            </div>
          ))}
        </div>
      )}

      {v.feedEmpty && (
        <div style={{ flex: 'none', borderRadius: 24, background: 'rgba(255,253,249,.66)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,.75)', padding: '34px 26px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ flex: 1, fontSize: 16, lineHeight: 1.5, color: 'rgba(34,39,31,.78)' }}>Non è rimasto niente da vedere.</span>
          <button onClick={v.resetFeed} style={{ padding: '10px 17px', borderRadius: 99, border: '1px solid rgba(34,39,31,.2)', background: 'rgba(255,255,255,.6)', color: '#22271F', fontSize: '13.5px', cursor: 'pointer', flex: 'none' }}>Rivedi la giornata</button>
        </div>
      )}

      {v.hasDone && (
        <div style={{ flex: 'none', marginTop: 22 }}>
          <div onClick={v.toggleDone} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 6px 10px', cursor: 'pointer' }}>
            <span style={LABEL}>Fatte oggi · {v.doneCount}</span>
            <span style={v.doneChevron}><IconGiu /></span>
          </div>
          {v.doneOpen && (
            <div style={{ borderRadius: '20px 24px 18px 22px', background: 'rgba(255,253,249,.58)', backdropFilter: 'blur(22px)', WebkitBackdropFilter: 'blur(22px)', border: '1px solid rgba(255,255,255,.65)', overflow: 'hidden' }}>
              {v.fatte.map(d => (
                <div key={d.id} style={d.wrap}>
                  <div onClick={d.onOpen} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '15px 20px', cursor: 'pointer' }}>
                    <IconSpunta style={{ flex: 'none' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14 }}>{d.esito}</div>
                      <div style={{ fontSize: 12, color: 'rgba(34,39,31,.58)', marginTop: 3 }}>{d.tipo} · {d.fonte} · {d.at}</div>
                    </div>
                    <span style={{ fontSize: '12.5px', color: '#3E5140' }}>{d.label}</span>
                  </div>
                  {d.open && (
                    <div style={{ padding: '0 20px 18px 47px' }}>
                      <div style={{ borderRadius: 14, background: 'rgba(255,255,255,.8)', border: '1px solid rgba(255,255,255,.9)', padding: '14px 16px' }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{d.quoteTitolo}</div>
                        <div style={{ fontSize: '13.5px', lineHeight: 1.6, color: 'rgba(34,39,31,.78)', marginTop: 6, textWrap: 'pretty' }}>{d.quote}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                        <button onClick={d.onRestore} style={{ padding: '8px 15px', borderRadius: 99, border: '1px solid rgba(34,39,31,.2)', background: 'rgba(255,255,255,.6)', color: '#22271F', fontSize: '12.5px', cursor: 'pointer' }}>Rimetti in cima</button>
                        <Hov as="button" onClick={d.onAsk}
                          style={{ padding: '8px 15px', borderRadius: 99, border: 'none', background: 'none', color: '#3E5140', fontSize: '12.5px', cursor: 'pointer' }}
                          hover={{ color: '#C4623B' }}>Chiedi a Myynd</Hov>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
