import { Sfondo } from './Sfondo'
import { Hov } from './ui'
import {
  IconCerca, IconCestino, IconChat, IconFulmine, IconIngranaggio,
  IconMappa, IconMyynd, IconPiu, IconSpina, IconSuPiccola
} from './icons'
import { Composer, Documento, Originale, Ricerca, Scheda, Toast } from './modals'
import { Automazioni } from './screens/Automazioni'
import { Chat } from './screens/Chat'
import { Connettori } from './screens/Connettori'
import { Mappa, MappaPiena } from './screens/Mappa'
import { Myynd } from './screens/Myynd'
import { Preferenze } from './screens/Preferenze'
import { useVals } from './vals'

export default function App() {
  const v = useVals()

  return (
    <div style={{
      position: 'relative', display: 'flex', width: '100%', minWidth: 1180, height: '100vh', minHeight: 820,
      boxSizing: 'border-box', background: '#F2E9DC', color: '#22271F',
      fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 14, overflow: 'hidden'
    }}>
      <Sfondo />

      {/* colonna di sinistra */}
      <div style={{
        position: 'relative', width: 234, flex: 'none', display: 'flex', flexDirection: 'column',
        margin: '18px 0 18px 18px', padding: '22px 15px 15px', borderRadius: '26px 22px 24px 20px',
        background: 'linear-gradient(180deg,rgba(255,253,249,.72),rgba(255,253,249,.5))',
        backdropFilter: 'blur(26px) saturate(1.5)', WebkitBackdropFilter: 'blur(26px) saturate(1.5)',
        border: '1px solid rgba(255,255,255,.7)', boxShadow: '0 26px 60px rgba(84,64,44,.13)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 4px 24px' }}>
          <span style={{ fontSize: 22, fontWeight: 300, letterSpacing: '.02em', lineHeight: 1, flex: 1 }}>myynd</span>
          <Hov as="button" title="Cerca" onClick={v.openSearch}
            style={{ width: 26, height: 26, display: 'grid', placeItems: 'center', border: 'none', background: 'none', padding: 0, color: 'rgba(34,39,31,.7)', cursor: 'pointer' }}
            hover={{ color: '#C4623B' }}>
            <IconCerca />
          </Hov>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <a href="#" onClick={v.goMyynd} style={v.navMyynd}>
            <IconMyynd style={{ flex: 'none' }} />
            <span style={{ flex: 1 }}>Myynd</span>
            <span style={v.badge}>{v.apertiCount}</span>
          </a>
          <a href="#" onClick={v.goChat} style={v.navChat}>
            <IconChat style={{ flex: 'none' }} />
            <span style={{ flex: 1 }}>Chat</span>
          </a>

          {v.isChat && (
            <div style={{ margin: '2px 0 6px', padding: 5, borderRadius: 14, background: 'rgba(34,39,31,.05)', animation: 'fadein .2s ease' }}>
              <Hov as="button" onClick={v.newChat}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', borderRadius: 11, border: '1px solid rgba(34,39,31,.16)', background: 'rgba(255,255,255,.66)', color: '#8E3F1F', fontSize: '12.5px', fontWeight: 500, cursor: 'pointer' }}
                hover={{ background: '#FFFFFF', borderColor: '#C4623B' }}>
                <IconPiu />Nuova chat
              </Hov>
              <div style={{ maxHeight: 116, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1, marginTop: 4 }}>
                {v.threads.map(t => (
                  <div key={t.id} onMouseEnter={t.onEnter} onMouseLeave={t.onLeave} onClick={t.onClick} style={t.row}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.titolo}</div>
                      <div style={{ fontSize: '10.5px', color: 'rgba(34,39,31,.5)', marginTop: 2 }}>{t.quando}</div>
                    </div>
                    <button onClick={t.onDelete} title="Elimina" style={t.binStyle}><IconCestino /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <a href="#" onClick={v.goAuto} style={v.navAuto}>
            <IconFulmine style={{ flex: 'none' }} />
            <span style={{ flex: 1 }}>Automazioni</span>
          </a>
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ position: 'relative' }}>
          {v.menuOpen && (
            <div style={{ position: 'absolute', left: -3, right: -3, bottom: 54, borderRadius: '18px 16px 18px 14px', background: 'rgba(255,253,249,.92)', backdropFilter: 'blur(30px) saturate(1.5)', WebkitBackdropFilter: 'blur(30px) saturate(1.5)', border: '1px solid rgba(255,255,255,.85)', boxShadow: '0 22px 50px rgba(84,64,44,.22)', padding: 5, zIndex: 5, animation: 'fadein .18s ease' }}>
              <a href="#" onClick={v.goPref} style={v.menuPref}><IconIngranaggio style={{ flex: 'none' }} />Preferenze</a>
              <a href="#" onClick={v.goMappa} style={v.menuMappa}><IconMappa style={{ flex: 'none' }} />Mappa</a>
              <a href="#" onClick={v.goConn} style={v.menuConn}>
                <IconSpina style={{ flex: 'none' }} />
                <span style={{ flex: 1 }}>Connettori</span>
                <span style={{ fontSize: 12, opacity: 0.7 }}>{v.connCount}</span>
              </a>
            </div>
          )}
          <Hov onClick={v.toggleMenu}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 8px', borderRadius: 14, background: 'rgba(255,255,255,.42)', border: '1px solid rgba(255,255,255,.72)', cursor: 'pointer' }}
            hover={{ background: 'rgba(255,255,255,.72)' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(140deg,#C4623B,#8FA593)', color: '#FFF7F0', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 500 }}>TD</div>
            <span style={{ flex: 1, fontSize: '13.5px' }}>Tobia <span style={{ color: 'rgba(34,39,31,.6)' }}>· Titolare</span></span>
            <span style={v.chevron}><IconSuPiccola /></span>
          </Hov>
        </div>
      </div>

      {/* colonna centrale */}
      <div style={{ position: 'relative', flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center', overflowY: 'auto', padding: '22px 34px 44px 30px' }}>
        {v.isMyynd && <Myynd v={v} />}
        {v.isChat && <Chat v={v} />}
        {v.isAuto && <Automazioni v={v} />}
        {v.isMappa && <Mappa v={v} />}
        {v.isPref && <Preferenze v={v} />}
        {v.isConn && <Connettori v={v} />}
      </div>

      {v.mapFull && <MappaPiena v={v} />}
      {v.compOpen && <Composer v={v} />}
      {v.docOpen && <Documento v={v} />}
      {v.origOpen && <Originale v={v} />}
      {v.toastOn && <Toast v={v} />}
      {v.nuovaOpen && (
        <Scheda titolo="Nuova automazione" valore={v.nuovaText} onChange={v.onNuova}
          placeholder="Quando arriva un ordine sopra i 5.000 euro, avvisami prima di confermarlo."
          conferma="Costruiscila" onConferma={v.sendNuova} onChiudi={v.closeNuova} />
      )}
      {v.ticketOpen && (
        <Scheda titolo="Apri un ticket" valore={v.ticketText} onChange={v.onTicket}
          placeholder="Cosa non funziona."
          conferma="Invia" onConferma={v.sendTicket} onChiudi={v.closeTicket} />
      )}
      {v.searchOpen && <Ricerca v={v} />}
    </div>
  )
}
