import { useEffect, useState } from 'react'
import { Sfondo } from './Sfondo'
import { Hov } from './ui'
import {
  IconCerca, IconCestino, IconChat, IconFulmine, IconIngranaggio,
  IconMappa, IconPiu, IconSpina, IconSuPiccola, IconEsci
} from './icons'
import { Documento, Ricerca, Toast } from './modals'
import { Automazioni } from './screens/Automazioni'
import { Chat } from './screens/Chat'
import { Connettori } from './screens/Connettori'
import { Mappa, MappaPiena } from './screens/Mappa'
import { Myynd } from './screens/Myynd'
import { Preferenze } from './screens/Preferenze'
import { Onboarding } from './onboarding/Onboarding'
import { Stato as Indicatore } from './components/Stato'
import { Connessioni } from './components/Connessioni'
import { Logo, Marchio } from './components/Marchio'
import { useVals } from './vals'
import { alloScadere, api, type Accesso as TipoAccesso, type Stato } from './api'
import { Accesso } from './Accesso'

export default function App() {
  const [accesso, setAccesso] = useState<TipoAccesso | null>(null)
  const [stato, setStato] = useState<Stato | null>(null)
  const [errore, setErrore] = useState('')
  const [onboarding, setOnboarding] = useState(false)
  const [connessioni, setConnessioni] = useState(false)

  // se la sessione cade, si torna all'accesso senza schianti
  useEffect(() => {
    alloScadere(() => {
      setStato(null)
      setConnessioni(false)
      setAccesso(a => (a ? { ...a, entrato: false } : a))
    })
  }, [])

  useEffect(() => {
    api.accesso()
      .then(a => {
        setAccesso(a)
        if (!a.entrato) return
        return api.stato().then(s => { setStato(s); setOnboarding(!s.config.onboarding) })
      })
      .catch(e => setErrore(e instanceof Error ? e.message : String(e)))
  }, [])

  const dentro = async (conto: { email: string }) => {
    try {
      const s = await api.stato()
      setStato(s)
      setOnboarding(!s.config.onboarding)
      setAccesso({ registrato: true, entrato: true, account: conto })
    } catch (e) {
      // se il primo caricamento fallisce non lascio l'utente sullo splash
      setErrore(e instanceof Error ? e.message : String(e))
    }
  }

  const fuori = async () => {
    try { await api.esci() } catch { /* il token è comunque già stato buttato */ }
    setStato(null)
    setOnboarding(false)
    setConnessioni(false)
    setErrore('')
    setAccesso({ registrato: true, entrato: false, account: accesso?.account ?? null })
  }

  if (errore) return <Guasto errore={errore} />
  if (!accesso) return <Attesa />
  if (!accesso.entrato) {
    return (
      <Accesso registrato={accesso.registrato} entrato={dentro} />
    )
  }
  if (!stato) return <Attesa />

  if (onboarding) {
    return (
      <Onboarding
        stato={stato}
        fatto={() => { api.stato().then(s => { setStato(s); setOnboarding(false) }) }}
      />
    )
  }

  return (
    <>
      <Casa stato={stato} apriConnessioni={() => setConnessioni(true)} esci={fuori} />
      {connessioni && (
        <Connessioni
          chiudi={() => setConnessioni(false)}
          cambiato={() => { api.stato().then(setStato).catch(() => {}) }}
        />
      )}
    </>
  )
}

function Casa({ stato, apriConnessioni, esci }: {
  stato: Stato; apriConnessioni: () => void; esci: () => void
}) {
  const v = useVals(stato, apriConnessioni)

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
          <div style={{ flex: 1 }}><Logo dim={20} testo={20} animato={false} /></div>
          <Hov as="button" title="Cerca" onClick={v.openSearch}
            style={{ width: 26, height: 26, display: 'grid', placeItems: 'center', border: 'none', background: 'none', padding: 0, color: 'rgba(34,39,31,.7)', cursor: 'pointer' }}
            hover={{ color: '#C4623B' }}>
            <IconCerca />
          </Hov>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <a href="#" onClick={v.goMyynd} style={v.navMyynd}>
            <Marchio dim={15} animato={false} colore="currentColor" />
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
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', borderRadius: 11, border: '1px solid rgba(34,39,31,.16)', background: 'rgba(255,255,255,.66)', color: '#8E3F1F', fontSize: '12.5px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
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

        {v.sincronizzando && (
          <div style={{ padding: '0 2px 12px' }}>
            <Indicatore tipo="leggo" testo={v.sincronizzando} stile={{ padding: '8px 12px 8px 9px', fontSize: 12 }} />
          </div>
        )}

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
              <div style={{ height: 1, background: 'rgba(34,39,31,.1)', margin: '5px 8px' }} />
              <Hov as="a" href="#"
                onClick={(e: React.MouseEvent) => { e.preventDefault(); esci() }}
                style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 11px', borderRadius: 12, fontSize: '13.5px', cursor: 'pointer', color: 'rgba(34,39,31,.7)' }}
                hover={{ color: '#8E3F1F', background: 'rgba(196,98,59,.1)' }}>
                <IconEsci style={{ flex: 'none' }} />Esci
              </Hov>
            </div>
          )}
          <Hov onClick={v.toggleMenu}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 8px', borderRadius: 14, background: 'rgba(255,255,255,.42)', border: '1px solid rgba(255,255,255,.72)', cursor: 'pointer' }}
            hover={{ background: 'rgba(255,255,255,.72)' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(140deg,#C4623B,#8FA593)', color: '#FFF7F0', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 500 }}>{v.iniziali}</div>
            <span style={{ flex: 1, fontSize: '13.5px' }}>
              {v.nome}{v.ruolo && <span style={{ color: 'rgba(34,39,31,.6)' }}> · {v.ruolo}</span>}
            </span>
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
      {v.docOpen && <Documento v={v} />}
      {v.toastOn && <Toast v={v} />}
      {v.searchOpen && <Ricerca v={v} />}
    </div>
  )
}

function Attesa() {
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: '#191715', color: 'rgba(244,239,232,.6)', fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 15 }}>
      <div style={{ animation: 'puls 1.6s ease-in-out infinite' }}>myynd</div>
    </div>
  )
}

function Guasto({ errore }: { errore: string }) {
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: '#191715', color: '#F4EFE8', fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", padding: 40 }}>
      <div style={{ maxWidth: 480, textAlign: 'center' }}>
        <div style={{ fontSize: 26, letterSpacing: '-.02em' }}>Il server non risponde.</div>
        <div style={{ fontSize: 14, lineHeight: 1.7, color: 'rgba(244,239,232,.6)', marginTop: 16 }}>
          Myynd ha bisogno del suo server locale per leggere posta, file e note.
          Avvialo con <code style={{ background: 'rgba(244,239,232,.1)', padding: '2px 7px', borderRadius: 5 }}>npm run dev</code> e ricarica.
        </div>
        <div style={{ fontSize: '12.5px', color: 'rgba(232,144,122,.9)', marginTop: 18 }}>{errore}</div>
      </div>
    </div>
  )
}
