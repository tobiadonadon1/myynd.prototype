// Il giro: come si usa, provandolo.
//
// Un testo che spiega un'interfaccia è un testo che nessuno legge. Qui i pezzi
// sono veri e si toccano: le tre colonne si premono davvero e il pallino si
// sposta, la riga si spunta davvero e sparisce. Cinque schermate, un minuto,
// e alla fine sai usare l'app perché l'hai usata.
//
// Si apre da solo la prima volta, e poi solo se lo cerchi.

import { useEffect, useState, type CSSProperties } from 'react'
import { Hov } from '../ui'
import { t } from '../lingua'
import { IconPiu, IconSpunta } from '../icons'

const CARTA: CSSProperties = {
  borderRadius: 14, background: 'rgba(255,253,249,.9)',
  border: '1px solid rgba(255,255,255,.9)', padding: '14px 16px'
}
const GRIGLIA: CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 46px 46px 46px', alignItems: 'center'
}
const ETICHETTA: CSSProperties = {
  fontSize: '9.5px', fontWeight: 500, letterSpacing: '.13em',
  textTransform: 'uppercase', color: 'rgba(34,39,31,.4)', textAlign: 'center'
}

/** Un pallino della griglia, premibile davvero. */
function Punto({ acceso, mio, onClick }: { acceso: boolean; mio: boolean; onClick?: () => void }) {
  return (
    <Hov as="button" type="button" onClick={onClick}
      style={{
        height: 28, border: 'none', background: 'none', cursor: onClick ? 'pointer' : 'default',
        padding: 0, display: 'grid', placeItems: 'center'
      }}
      hover={onClick ? { background: 'rgba(34,39,31,.04)' } : {}}>
      <span style={{
        width: acceso ? 9 : 7, height: acceso ? 9 : 7, borderRadius: '50%',
        background: acceso ? (mio ? '#22271F' : '#C4623B') : 'transparent',
        border: acceso ? 'none' : '1px solid rgba(34,39,31,.2)'
      }} />
    </Hov>
  )
}

/** — 1 — si scrive e basta */
function Scrivere() {
  const [testo, setTesto] = useState('')
  const [messa, setMessa] = useState(false)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ ...CARTA, display: 'flex', alignItems: 'center', gap: 8, padding: '5px 5px 5px 14px' }}>
        <input
          autoFocus value={testo}
          onChange={e => setTesto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && testo.trim()) setMessa(true) }}
          placeholder={t('mandare il preventivo a Rossi')}
          style={{
            flex: 1, border: 'none', background: 'none', outline: 'none',
            fontFamily: 'inherit', fontSize: '14px', color: '#22271F', padding: '8px 0'
          }} />
        <span style={{
          width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center',
          background: testo.trim() ? '#22271F' : 'rgba(34,39,31,.07)',
          color: testo.trim() ? '#FFF7F0' : 'rgba(34,39,31,.28)'
        }}><IconPiu size={12} /></span>
      </div>
      {messa && (
        <div style={{ ...CARTA, ...GRIGLIA, animation: 'fadein .2s ease' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '14px' }}>
            <span style={{ width: 15, height: 15, borderRadius: '50%', border: '1.5px solid rgba(34,39,31,.22)' }} />
            {testo}
          </span>
          <Punto acceso mio /><Punto acceso={false} mio={false} /><Punto acceso={false} mio={false} />
        </div>
      )}
    </div>
  )
}

/** — 2 — i comandi */
function Comandi({ lingua }: { lingua: string }) {
  const [scelto, setScelto] = useState<string | null>(null)
  const voci = lingua === 'en'
    ? [['/today', 'To do now'], ['/week', 'By Friday'], ['/draft', 'He writes it, you send it'], ['/myynd', 'Right up to the last step']]
    : [['/oggi', 'Da fare adesso'], ['/settimana', 'Entro venerdì'], ['/bozza', 'La scrive lui, la mandi tu'], ['/myynd', "Fino all'ultimo passo"]]
  return (
    <div style={{ ...CARTA, padding: 6 }}>
      {voci.map(([k, n]) => (
        <Hov key={k} onClick={() => setScelto(k)}
          style={{
            display: 'flex', alignItems: 'baseline', gap: 10, padding: '8px 11px', borderRadius: 9,
            cursor: 'pointer', background: scelto === k ? 'rgba(34,39,31,.06)' : 'transparent'
          }}
          hover={{ background: 'rgba(34,39,31,.06)' }}>
          <span style={{ fontSize: '13px', color: '#22271F', flex: 1 }}>{n}</span>
          <span style={{ fontSize: '11.5px', color: 'rgba(34,39,31,.4)' }}>{k}</span>
        </Hov>
      ))}
    </div>
  )
}

/** — 3 — le tre colonne, premibili */
function Colonne() {
  const [modo, setModo] = useState<'io' | 'bozza' | 'tutto'>('io')
  const spiega: Record<string, string> = {
    io: 'La faccio io. Myynd non la tocca.',
    bozza: 'Te la scrive: rileggi e mandi tu.',
    tutto: "La porta fino all'ultimo passo: testo, allegati, a chi va."
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ ...GRIGLIA, padding: '0 16px' }}>
        <span />
        <span style={ETICHETTA}>{t('io')}</span>
        <span style={ETICHETTA}>{t('bozza')}</span>
        <span style={ETICHETTA}>Myynd</span>
      </div>
      <div style={{ ...CARTA, ...GRIGLIA, borderLeft: modo === 'io' ? '2px solid transparent' : '2px solid rgba(196,98,59,.55)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '14px' }}>
          <span style={{ width: 15, height: 15, flex: 'none', borderRadius: '50%', border: '1.5px solid rgba(34,39,31,.22)' }} />
          {t('mandare il preventivo a Rossi')}
        </span>
        <Punto acceso={modo === 'io'} mio onClick={() => setModo('io')} />
        <Punto acceso={modo === 'bozza'} mio={false} onClick={() => setModo('bozza')} />
        <Punto acceso={modo === 'tutto'} mio={false} onClick={() => setModo('tutto')} />
      </div>
      <div style={{ fontSize: '13px', color: 'rgba(34,39,31,.6)', minHeight: 20, paddingLeft: 2 }}>
        {t(spiega[modo])}
      </div>
    </div>
  )
}

/** — 4 — quando non può, chiede */
function Chiede() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ ...CARTA, ...GRIGLIA, borderLeft: '2px solid rgba(196,98,59,.55)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '14px' }}>
          <span style={{ width: 15, height: 15, flex: 'none', borderRadius: '50%', border: '2px solid #C4623B' }} />
          {t('mandare una mail a mio padre')}
          <span style={{
            padding: '3px 9px', borderRadius: 99, fontSize: '11px', fontWeight: 500,
            color: '#8E3F1F', background: 'rgba(196,98,59,.14)', border: '1px solid rgba(196,98,59,.32)'
          }}>{t('ti chiede')}</span>
        </span>
        <span /><span /><Punto acceso mio={false} />
      </div>
      <div style={{ ...CARTA, fontSize: '13px', lineHeight: 1.6, color: 'rgba(34,39,31,.75)' }}>
        {t('Non ho la sua email e non so cosa vuoi dirgli. E la posta non è ancora collegata: collegamela e te la scrivo.')}
      </div>
    </div>
  )
}

/** — 5 — spuntala */
function Spuntare({ finito }: { finito: () => void }) {
  const [via, setVia] = useState(false)
  useEffect(() => { if (via) finito() }, [via, finito])
  return (
    <div style={{ ...CARTA, ...GRIGLIA, opacity: via ? 0.35 : 1, transition: 'opacity .3s' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '14px' }}>
        <Hov as="button" type="button" onClick={() => setVia(true)}
          style={{
            width: 15, height: 15, flex: 'none', padding: 0, borderRadius: '50%',
            border: '1.5px solid rgba(34,39,31,.22)', background: 'none', cursor: 'pointer',
            display: 'grid', placeItems: 'center', color: 'rgba(34,39,31,.4)'
          }}
          hover={{ borderColor: '#22271F' }}>{via && <IconSpunta size={9} />}</Hov>
        <span style={{ textDecoration: via ? 'line-through' : 'none', color: via ? 'rgba(34,39,31,.4)' : '#22271F' }}>
          {t('richiamare lo studio')}
        </span>
      </span>
      <Punto acceso mio /><Punto acceso={false} mio={false} /><Punto acceso={false} mio={false} />
    </div>
  )
}

type Passo = { titolo: string; riga: string; corpo: (a: { lingua: string; festa: () => void }) => React.ReactNode }

const PASSI: Passo[] = [
  {
    titolo: 'Scrivi la riga',
    riga: 'Come la diresti a voce. Invio, e ci sta.',
    corpo: () => <Scrivere />
  },
  {
    titolo: 'Batti / per il resto',
    riga: 'Quando farla, o affidarla subito senza toccare il mouse.',
    corpo: ({ lingua }) => <Comandi lingua={lingua} />
  },
  {
    titolo: 'Le tre colonne',
    riga: 'Provale: decidono quanto se ne occupa lui.',
    corpo: () => <Colonne />
  },
  {
    titolo: 'Se non può, chiede',
    riga: 'Non inventa mai. Rispondi e ci riprova.',
    corpo: () => <Chiede />
  },
  {
    titolo: 'Spuntala',
    riga: 'Un clic. Quando finisci tutto, scendono i coriandoli.',
    corpo: ({ festa }) => <Spuntare finito={festa} />
  }
]

export function Giro({ lingua, chiudi, festa }: { lingua: string; chiudi: () => void; festa: () => void }) {
  const [i, setI] = useState(0)
  const p = PASSI[i]
  const ultimo = i === PASSI.length - 1

  const esci = chiudi

  useEffect(() => {
    const tasto = (e: KeyboardEvent) => { if (e.key === 'Escape') esci() }
    window.addEventListener('keydown', tasto)
    return () => window.removeEventListener('keydown', tasto)
  })

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) esci() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 80, display: 'grid', placeItems: 'center',
        background: 'rgba(40,30,22,.34)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        WebkitAppRegion: 'no-drag', padding: 24
      } as CSSProperties}>
      <div role="dialog" aria-label={t('Come funziona')} style={{
        width: 480, maxWidth: '100%', borderRadius: 20, padding: '26px 26px 20px',
        background: 'rgba(250,246,239,.98)', border: '1px solid rgba(255,255,255,.9)',
        boxShadow: '0 40px 90px rgba(60,44,30,.34)', animation: 'toastin .3s ease'
      }}>
        <div style={{ fontSize: 21, letterSpacing: '-.02em', fontWeight: 500 }}>{t(p.titolo)}</div>
        <div style={{ fontSize: '13.5px', color: 'rgba(34,39,31,.6)', marginTop: 6, lineHeight: 1.5 }}>{t(p.riga)}</div>

        <div style={{ marginTop: 18 }}>{p.corpo({ lingua, festa })}</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 22 }}>
          <div style={{ display: 'flex', gap: 5, flex: 1 }}>
            {PASSI.map((_, k) => (
              <span key={k} aria-hidden="true" style={{
                width: k === i ? 18 : 6, height: 6, borderRadius: 99,
                background: k <= i ? 'rgba(34,39,31,.55)' : 'rgba(34,39,31,.16)',
                transition: 'width .3s, background .3s'
              }} />
            ))}
          </div>

          {i > 0 && (
            <Hov as="button" type="button" onClick={() => setI(i - 1)}
              style={{
                border: 'none', background: 'none', padding: '8px 6px', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: '13px', color: 'rgba(34,39,31,.5)'
              }}
              hover={{ color: '#22271F' }}>{t('Indietro')}</Hov>
          )}
          <Hov as="button" type="button" onClick={() => (ultimo ? esci() : setI(i + 1))}
            style={{
              padding: '9px 20px', borderRadius: 99, border: 'none',
              background: '#22271F', color: '#FFF7F0',
              fontSize: '13px', fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer'
            }}
            hover={{ background: '#3E5140' }}>{ultimo ? t('Ho capito') : t('Avanti')}</Hov>
        </div>
      </div>
    </div>
  )
}

