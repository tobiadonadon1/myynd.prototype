import { Hov } from './ui'
import { IconCerca, IconDoc } from './icons'
import type { Vals } from './vals'

const VELO = (z: number, alpha: number, blur: number) => ({
  position: 'absolute' as const, inset: 0, background: `rgba(40,30,22,${alpha})`,
  backdropFilter: `blur(${blur}px)`, WebkitBackdropFilter: `blur(${blur}px)`, zIndex: z
})

const FOGLIO = {
  background: '#FFFDF9', border: '1px solid rgba(255,255,255,.95)',
  boxShadow: '0 40px 90px rgba(60,44,30,.36)', overflow: 'hidden' as const
}

/** Il compositore: la bozza che puoi rileggere e correggere prima di mandarla. */
export function Composer({ v }: { v: Vals }) {
  return (
    <>
      <div onClick={v.cancelEdit} style={VELO(42, 0.32, 3)} />
      <div style={{ ...FOGLIO, position: 'absolute', top: 80, left: '50%', transform: 'translateX(-50%)', width: 620, maxWidth: '86%', borderRadius: '22px 18px 22px 18px', zIndex: 43 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', background: 'rgba(34,39,31,.05)', borderBottom: '1px solid rgba(34,39,31,.09)' }}>
          <span style={v.compDot} />
          <span style={{ fontSize: '12.5px', fontWeight: 500 }}>{v.compApp}</span>
          <span style={{ fontSize: 12, color: 'rgba(34,39,31,.55)' }}>{v.compStato}</span>
          <div style={{ flex: 1 }} />
          <button onClick={v.cancelEdit} style={{ border: 'none', background: 'none', color: 'rgba(34,39,31,.55)', fontSize: 20, cursor: 'pointer', padding: '0 2px' }}>×</button>
        </div>
        <div style={{ padding: '4px 20px 20px' }}>
          {v.compCampi.map(c => (
            <div key={c.k} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 2px', borderBottom: '1px solid rgba(34,39,31,.09)' }}>
              <span style={{ minWidth: 64, fontSize: '12.5px', color: 'rgba(34,39,31,.5)' }}>{c.k}</span>
              <span style={{ flex: 1, fontSize: '13.5px' }}>{c.v}</span>
            </div>
          ))}
          <textarea value={v.heroEditText} onChange={v.onHeroEdit}
            style={{ width: '100%', boxSizing: 'border-box', marginTop: 14, minHeight: 220, resize: 'vertical', border: 'none', background: 'none', padding: 0, fontSize: '14.5px', lineHeight: 1.7, color: '#22271F', outline: 'none' }} />
          {v.heroHasAllegato && (
            <Hov onClick={v.openDoc}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginTop: 6, padding: '9px 13px', borderRadius: 12, border: '1px solid rgba(34,39,31,.16)', background: 'rgba(34,39,31,.04)', cursor: 'pointer' }}
              hover={{ background: '#FFFFFF', borderColor: '#C4623B' }}>
              <IconDoc size={18} style={{ flex: 'none' }} />
              <span style={{ fontSize: '12.5px' }}>{v.heroAllegato}</span>
            </Hov>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(34,39,31,.09)' }}>
            <button onClick={v.sendFromComposer} style={{ padding: '11px 24px', borderRadius: 99, border: 'none', background: 'linear-gradient(120deg,#C4623B,#7E9C82)', color: '#FFF7F0', fontSize: '13.5px', fontWeight: 500, cursor: 'pointer' }}>{v.heroPrimaryLabel}</button>
            <button onClick={v.saveEdit} style={{ padding: '11px 18px', borderRadius: 99, border: '1px solid rgba(34,39,31,.2)', background: 'none', color: '#22271F', fontSize: '13.5px', cursor: 'pointer' }}>Salva e chiudi</button>
            <div style={{ flex: 1 }} />
            <button onClick={v.cancelEdit} style={{ padding: '11px 12px', border: 'none', background: 'none', color: 'rgba(34,39,31,.55)', fontSize: 13, cursor: 'pointer' }}>Annulla</button>
          </div>
        </div>
      </div>
    </>
  )
}

/** Il documento allegato, impaginato come un foglio vero. */
export function Documento({ v }: { v: Vals }) {
  return (
    <>
      <div onClick={v.closeDoc} style={VELO(48, 0.4, 4)} />
      <div style={{ position: 'absolute', top: 60, bottom: 60, left: '50%', transform: 'translateX(-50%)', width: 600, maxWidth: '84%', zIndex: 49, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 4px 12px', color: '#FFF7F0' }}>
          <span style={{ fontSize: 13, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.heroAllegato}</span>
          <span style={{ fontSize: 12, opacity: 0.7 }}>{v.heroAllegatoMeta}</span>
          <button onClick={v.closeDoc} style={{ padding: '6px 13px', borderRadius: 99, border: '1px solid rgba(255,255,255,.5)', background: 'rgba(255,255,255,.14)', color: '#FFFFFF', fontSize: '12.5px', cursor: 'pointer' }}>Chiudi</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', background: '#FFFFFF', borderRadius: 4, boxShadow: '0 40px 90px rgba(20,12,6,.5)', padding: '52px 56px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, paddingBottom: 22, borderBottom: '2px solid #22271F' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 19, fontWeight: 500, letterSpacing: '-.01em' }}>Donadon Srl</div>
              <div style={{ fontSize: '11.5px', lineHeight: 1.6, color: 'rgba(34,39,31,.6)', marginTop: 4 }}>Via del Lavoro 12 · 31100 Treviso<br />P. IVA 03219870265</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11.5px', letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(34,39,31,.55)' }}>{v.docTipo}</div>
              <div style={{ fontSize: 15, marginTop: 5 }}>{v.docNumero}</div>
              <div style={{ fontSize: '11.5px', color: 'rgba(34,39,31,.6)', marginTop: 3 }}>{v.docData}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 40, marginTop: 26 }}>
            {v.docMeta.map(m => (
              <div key={m.k}>
                <div style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(34,39,31,.5)' }}>{m.k}</div>
                <div style={{ fontSize: '13.5px', lineHeight: 1.6, marginTop: 5, whiteSpace: 'pre-line' }}>{m.v}</div>
              </div>
            ))}
          </div>
          {v.docHasRighe && (
            <div style={{ marginTop: 34 }}>
              <div style={{ display: 'flex', gap: 12, paddingBottom: 8, borderBottom: '1px solid rgba(34,39,31,.2)', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(34,39,31,.5)' }}>
                <span style={{ flex: 1 }}>Descrizione</span>
                <span style={{ width: 74, textAlign: 'right' }}>Q.tà</span>
                <span style={{ width: 84, textAlign: 'right' }}>Prezzo</span>
                <span style={{ width: 96, textAlign: 'right' }}>Totale</span>
              </div>
              {v.docRighe.map(r => (
                <div key={r.d} style={{ display: 'flex', gap: 12, padding: '13px 0', borderBottom: '1px solid rgba(34,39,31,.09)', fontSize: '13.5px' }}>
                  <span style={{ flex: 1, lineHeight: 1.5 }}>{r.d}</span>
                  <span style={{ width: 74, textAlign: 'right', color: 'rgba(34,39,31,.7)' }}>{r.q}</span>
                  <span style={{ width: 84, textAlign: 'right', color: 'rgba(34,39,31,.7)' }}>{r.p}</span>
                  <span style={{ width: 96, textAlign: 'right' }}>{r.t}</span>
                </div>
              ))}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'flex-end', marginTop: 16 }}>
                {v.docTotali.map(t => (
                  <div key={t.k} style={{ display: 'flex', gap: 26, fontSize: '13.5px' }}>
                    <span style={{ color: 'rgba(34,39,31,.6)' }}>{t.k}</span>
                    <span style={{ minWidth: 96, textAlign: 'right', fontWeight: 500 }}>{t.v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{ fontSize: 13, lineHeight: 1.75, color: 'rgba(34,39,31,.78)', marginTop: 32, whiteSpace: 'pre-line', textWrap: 'pretty' }}>{v.docNote}</div>
          <div style={{ fontSize: 11, color: 'rgba(34,39,31,.45)', marginTop: 40, paddingTop: 14, borderTop: '1px solid rgba(34,39,31,.12)' }}>Preparato da Myynd con il listino di luglio 2026 e lo storico del cliente. Rivisto da te prima dell'invio.</div>
        </div>
      </div>
    </>
  )
}

/** Il messaggio originale, come è arrivato dall'app di partenza. */
export function Originale({ v }: { v: Vals }) {
  return (
    <>
      <div onClick={v.closeOriginal} style={VELO(42, 0.3, 3)} />
      <div style={{ ...FOGLIO, position: 'absolute', top: 90, left: '50%', transform: 'translateX(-50%)', width: 580, maxWidth: '84%', borderRadius: '22px 18px 22px 18px', zIndex: 43 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', background: 'rgba(34,39,31,.05)', borderBottom: '1px solid rgba(34,39,31,.09)' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: v.origColore, flex: 'none' }} />
          <span style={{ fontSize: '12.5px', fontWeight: 500 }}>{v.origApp}</span>
          <span style={{ fontSize: 12, color: 'rgba(34,39,31,.55)' }}>originale, come è arrivato</span>
          <div style={{ flex: 1 }} />
          <button onClick={v.closeOriginal} style={{ border: 'none', background: 'none', color: 'rgba(34,39,31,.55)', fontSize: 20, cursor: 'pointer', padding: '0 2px' }}>×</button>
        </div>
        <div style={{ padding: '20px 22px 22px' }}>
          <div style={{ fontSize: 18, lineHeight: 1.35, letterSpacing: '-.01em' }}>{v.origTitolo}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14 }}>
            {v.origCampi.map(c => (
              <div key={c.k} style={{ display: 'flex', gap: 12, fontSize: '12.5px', lineHeight: 1.5 }}>
                <span style={{ minWidth: 74, color: 'rgba(34,39,31,.5)' }}>{c.k}</span>
                <span style={{ flex: 1, color: 'rgba(34,39,31,.82)' }}>{c.v}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(34,39,31,.1)', fontSize: 14, lineHeight: 1.65, color: 'rgba(34,39,31,.85)', whiteSpace: 'pre-line', textWrap: 'pretty' }}>{v.origCorpo}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20 }}>
            <div style={{ flex: 1, fontSize: '11.5px', color: 'rgba(34,39,31,.5)' }}>Aprendola qui non la segno come letta in {v.origApp}.</div>
            {v.heroEditabile && (
              <button onClick={v.editFromOriginal} style={{ padding: '9px 16px', borderRadius: 99, border: '1px solid rgba(34,39,31,.2)', background: 'none', color: '#22271F', fontSize: 13, cursor: 'pointer' }}>Modifica la risposta</button>
            )}
            <button onClick={v.closeOriginal} style={{ padding: '9px 18px', borderRadius: 99, border: 'none', background: '#33221F', color: '#FFF7F0', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Chiudi</button>
          </div>
        </div>
      </div>
    </>
  )
}

/** Finestrella con una casella di testo: nuova automazione, oppure ticket. */
export function Scheda({
  titolo, valore, onChange, placeholder, conferma, onConferma, onChiudi
}: {
  titolo: string
  valore: string
  onChange: (e: { target: { value: string } }) => void
  placeholder: string
  conferma: string
  onConferma: () => void
  onChiudi: () => void
}) {
  return (
    <>
      <div onClick={onChiudi} style={VELO(44, 0.26, 3)} />
      <div style={{ position: 'absolute', top: 110, left: '50%', transform: 'translateX(-50%)', width: 540, maxWidth: '84%', borderRadius: '26px 22px 26px 20px', background: 'rgba(255,253,249,.96)', border: '1px solid rgba(255,255,255,.95)', boxShadow: '0 40px 90px rgba(60,44,30,.34)', zIndex: 45, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 21, letterSpacing: '-.02em', flex: 1 }}>{titolo}</span>
          <button onClick={onChiudi} style={{ border: 'none', background: 'none', color: 'rgba(34,39,31,.55)', fontSize: 21, cursor: 'pointer' }}>×</button>
        </div>
        <textarea value={valore} onChange={onChange} placeholder={placeholder}
          style={{ width: '100%', boxSizing: 'border-box', marginTop: 16, minHeight: titolo === 'Apri un ticket' ? 110 : 120, resize: 'vertical', borderRadius: 16, border: '1px solid rgba(34,39,31,.18)', background: 'rgba(255,255,255,.7)', padding: '14px 15px', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.6, color: '#22271F', outline: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
          <div style={{ flex: 1 }} />
          <button onClick={onChiudi} style={{ padding: '10px 16px', borderRadius: 99, border: '1px solid rgba(34,39,31,.2)', background: 'none', color: '#22271F', fontFamily: 'inherit', fontSize: '13.5px', cursor: 'pointer' }}>Annulla</button>
          <button onClick={onConferma} style={{ padding: '10px 22px', borderRadius: 99, border: 'none', background: 'linear-gradient(120deg,#C4623B,#7E9C82)', color: '#FFF7F0', fontFamily: 'inherit', fontSize: '13.5px', fontWeight: 500, cursor: 'pointer' }}>{conferma}</button>
        </div>
      </div>
    </>
  )
}

/** La ricerca globale, aperta dalla lente in alto a sinistra. */
export function Ricerca({ v }: { v: Vals }) {
  return (
    <>
      <div onClick={v.closeSearch} style={VELO(46, 0.24, 3)} />
      <div style={{ position: 'absolute', top: 88, left: '50%', transform: 'translateX(-50%)', width: 600, maxWidth: '82%', borderRadius: '24px 20px 24px 20px', background: 'rgba(255,253,249,.96)', border: '1px solid rgba(255,255,255,.95)', boxShadow: '0 40px 90px rgba(60,44,30,.34)', zIndex: 47, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', borderBottom: '1px solid rgba(34,39,31,.09)' }}>
          <IconCerca size={17} style={{ flex: 'none', color: 'rgba(34,39,31,.6)' }} />
          <input value={v.query} onChange={v.onQuery} placeholder="Cerca in email, file, chat, fatture…" autoFocus
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
                <div style={{ fontSize: '14.5px' }}>{r.titolo}</div>
                <div style={{ fontSize: '12.5px', color: 'rgba(34,39,31,.62)', marginTop: 3 }}>{r.fonte}</div>
              </div>
              <span style={{ fontSize: 12, color: 'rgba(34,39,31,.5)' }}>{r.quando}</span>
            </Hov>
          ))}
        </div>
      </div>
    </>
  )
}

/** La notifica in alto a destra, con l'annulla quando l'azione è reversibile. */
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
