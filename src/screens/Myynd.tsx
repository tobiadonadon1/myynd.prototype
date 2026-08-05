import { Hov, LABEL } from '../ui'
import { IconDoc, IconGiu, IconSpunta } from '../icons'
import type { Vals } from '../vals'

/** Il feed: la cosa più urgente in grande, il resto sotto, le fatte in fondo. */
export function Myynd({ v }: { v: Vals }) {
  return (
    <div style={{ width: 760, maxWidth: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 4px 0' }}>
        <span style={{ fontSize: 12, color: 'rgba(34,39,31,.7)', textTransform: 'capitalize' }}>{v.oggi} · {v.ora}</span>
        <div style={{ flex: 1 }} />
        <Hov as="a" href="#" onClick={v.goConn}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#2F4A33', background: 'rgba(255,255,255,.7)', border: '1px solid rgba(255,255,255,.9)', borderRadius: 99, padding: '5px 11px', transform: 'rotate(-.6deg)' }}
          hover={{ background: '#FFFFFF' }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: v.connCount ? '#5C7660' : '#B0705A' }} />
          {v.connCount} fonti · {v.totaleDocumenti.toLocaleString('it-IT')} documenti
        </Hov>
      </div>

      <div style={{ fontSize: 40, lineHeight: 1.18, letterSpacing: '-.03em', maxWidth: 600, padding: '22px 3px 26px', textWrap: 'pretty' }}>
        {v.headline}
      </div>

      {v.hasHero && (
        <div style={v.heroStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#FFF7F0', flex: 'none' }} />
            <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: '.02em' }}>{v.heroTipo}</span>
            <span style={{ fontSize: '12.5px', color: 'rgba(255,247,240,.85)' }}>{v.heroFonte}{v.heroOra ? ` · ${v.heroOra}` : ''}</span>
            <div style={{ flex: 1 }} />
            {v.heroUrgenza && (
              <span style={{ fontSize: '12.5px', fontWeight: 700, letterSpacing: '.02em', color: '#33221F', background: '#FFF7F0', borderRadius: 99, padding: '5px 12px', boxShadow: '0 6px 16px rgba(30,20,14,.28)' }}>{v.heroUrgenza}</span>
            )}
          </div>

          <div style={{ fontSize: 22, lineHeight: 1.35, marginTop: 20, maxWidth: 600, textWrap: 'pretty', fontWeight: 500 }}>{v.heroTitolo}</div>
          <div style={{ fontSize: 16, lineHeight: 1.6, marginTop: 12, maxWidth: 600, color: 'rgba(255,247,240,.9)', textWrap: 'pretty', whiteSpace: 'pre-line' }}>{v.heroTesto}</div>

          {v.heroHaDoc && (
            <Hov onClick={v.apriDoc}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 11, marginTop: 20, padding: '11px 14px', borderRadius: 14, border: '1px solid rgba(255,255,255,.4)', background: 'rgba(255,253,249,.9)', cursor: 'pointer', color: '#22271F', alignSelf: 'flex-start' }}
              hover={{ background: '#FFFFFF', borderColor: '#FFFFFF' }}>
              <IconDoc size={19} style={{ flex: 'none' }} />
              <span style={{ fontSize: '13px', fontWeight: 500 }}>Apri il documento</span>
            </Hov>
          )}

          <div style={{ flex: 1, minHeight: 14 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 22 }}>
            <Hov as="button" onClick={v.heroPrimary}
              style={{ padding: '12px 24px', borderRadius: 99, border: 'none', background: '#FFF7F0', color: '#22271F', fontSize: 14, fontWeight: 500, boxShadow: '0 10px 24px rgba(30,20,14,.3)', cursor: 'pointer', fontFamily: 'inherit' }}
              hover={{ background: '#FFFFFF' }}>Fatto</Hov>
            <Hov as="button" onClick={v.heroAsk}
              style={{ padding: '12px 20px', borderRadius: 99, border: '1px solid rgba(255,247,240,.6)', background: 'rgba(255,247,240,.14)', color: '#FFF7F0', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}
              hover={{ background: 'rgba(255,247,240,.28)' }}>Chiedi a Myynd</Hov>
            <div style={{ flex: 1 }} />
            <Hov as="button" onClick={v.heroSkip} title="Più tardi"
              style={{ padding: '10px 12px', border: 'none', background: 'none', color: 'rgba(255,247,240,.8)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
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
                  <span style={{ fontSize: 12, color: 'rgba(34,39,31,.6)' }}>{i.fonte}{i.ora ? ` · ${i.ora}` : ''}</span>
                </div>
                <div style={{ fontSize: '14.5px', fontWeight: 500, marginTop: 6 }}>{i.titolo}</div>
                <div style={{ fontSize: '14px', lineHeight: 1.5, color: 'rgba(34,39,31,.7)', marginTop: 3, textWrap: 'pretty' }}>{i.testo}</div>
              </div>
              {i.urgenza && <span style={i.pill}>{i.urgenza}</span>}
            </div>
          ))}
        </div>
      )}

      {v.feedVuoto && <Vuoto v={v} />}

      {v.hasDone && (
        <div style={{ flex: 'none', marginTop: 22 }}>
          <div onClick={v.toggleDone} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 6px 10px', cursor: 'pointer' }}>
            <span style={LABEL}>Fatte · {v.doneCount}</span>
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
                      <div style={{ fontSize: 12, color: 'rgba(34,39,31,.58)', marginTop: 3 }}>{d.tipo}{d.fonte ? ` · ${d.fonte}` : ''}{d.at ? ` · ${d.at}` : ''}</div>
                    </div>
                    <span style={{ fontSize: '12.5px', color: '#3E5140' }}>{d.label}</span>
                  </div>
                  {d.open && (
                    <div style={{ padding: '0 20px 18px 47px' }}>
                      <div style={{ borderRadius: 14, background: 'rgba(255,255,255,.8)', border: '1px solid rgba(255,255,255,.9)', padding: '14px 16px', fontSize: '13.5px', lineHeight: 1.6, color: 'rgba(34,39,31,.78)', textWrap: 'pretty' }}>{d.testo}</div>
                      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                        <button onClick={d.onRestore} style={{ padding: '8px 15px', borderRadius: 99, border: '1px solid rgba(34,39,31,.2)', background: 'rgba(255,255,255,.6)', color: '#22271F', fontSize: '12.5px', cursor: 'pointer', fontFamily: 'inherit' }}>Rimetti in cima</button>
                        <Hov as="button" onClick={d.onAsk}
                          style={{ padding: '8px 15px', borderRadius: 99, border: 'none', background: 'none', color: '#3E5140', fontSize: '12.5px', cursor: 'pointer', fontFamily: 'inherit' }}
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

/** Quando non c'è niente: dice cosa manca, non finge. */
function Vuoto({ v }: { v: Vals }) {
  const senzaFonti = v.connCount === 0
  const senzaDocumenti = v.totaleDocumenti === 0
  return (
    <div style={{ flex: 'none', borderRadius: 24, background: 'rgba(255,253,249,.66)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,.75)', padding: '32px 28px' }}>
      <div style={{ fontSize: 17, lineHeight: 1.55, color: 'rgba(34,39,31,.82)', textWrap: 'pretty' }}>
        {senzaFonti
          ? 'Non hai ancora collegato niente. Myynd non ha nulla da leggere.'
          : senzaDocumenti
            ? 'Le fonti sono collegate ma non ho ancora letto niente.'
            : v.claudeOn
              ? 'Ho letto tutto, ma non ho ancora tirato fuori niente da segnalarti.'
              : 'Ho letto tutto. Per farmi scegliere cosa conta serve Claude collegato.'}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        {senzaFonti || !v.claudeOn ? (
          <button onClick={v.goConn} style={BOTTONE}>Vai ai connettori</button>
        ) : senzaDocumenti ? (
          <button onClick={v.sincronizza} style={BOTTONE} disabled={!!v.sincronizzando}>
            {v.sincronizzando ?? 'Leggi adesso'}
          </button>
        ) : (
          <button onClick={v.genera} style={BOTTONE} disabled={v.generando}>
            {v.generando ? 'Sto leggendo…' : 'Fai una lettura'}
          </button>
        )}
      </div>
    </div>
  )
}

const BOTTONE: React.CSSProperties = {
  padding: '11px 20px', borderRadius: 99, border: 'none',
  background: 'linear-gradient(120deg,#C4623B,#7E9C82)', color: '#FFF7F0',
  fontSize: '13.5px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit'
}
