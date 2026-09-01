// La barra in cui si scrive, e il menù che si apre con «/».
//
// I tre bottoni dei secchi stavano lì fissi a occupare spazio per una scelta
// che si fa una volta su dieci. Sotto «/» ci stanno tutti e non si vedono mai,
// e insieme a loro ci sta anche quello che prima non si poteva dire affatto:
// «questa aggiungila e falla fare a lui». Una riga scritta e affidata in un
// gesto solo, senza toccare il mouse.

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Hov } from '../ui'
import { lingua, t } from '../lingua'
import { IconPiu } from '../icons'
import type { Secchio } from './useCompiti'

export type Comando = {
  /** Quello che si scrive. Due, perché un menù in inglese che vuole «/oggi» non è in inglese. */
  it: string
  en: string
  nome: string
  nota: string
  quando?: Secchio
  modo?: 'bozza' | 'tutto'
  fai?: 'fatte'
}

export const COMANDI: Comando[] = [
  { it: 'oggi',      en: 'today', nome: 'Oggi',            nota: 'Da fare adesso',             quando: 'oggi' },
  { it: 'settimana', en: 'week',  nome: 'Questa settimana', nota: 'Entro venerdì',             quando: 'settimana' },
  { it: 'poi',       en: 'later', nome: 'Prima o poi',      nota: 'Quando capita',             quando: 'poi' },
  { it: 'bozza',     en: 'draft', nome: 'Chiedi la bozza',  nota: 'La scrive lui, la mandi tu', modo: 'bozza' },
  { it: 'myynd',     en: 'myynd', nome: 'Falla fare a lui', nota: 'Fino all\'ultimo passo',    modo: 'tutto' },
  { it: 'fatte',     en: 'done',  nome: 'Le fatte',         nota: 'Mostra o nascondi',          fai: 'fatte' }
]

/** La parola da scrivere, nella lingua in cui stai leggendo. */
const chiaveDi = (c: Comando) => (lingua() === 'en' ? c.en : c.it)

const NOME: Record<Secchio, string> = { oggi: 'Oggi', settimana: 'Questa settimana', poi: 'Prima o poi' }

export function Barra({ aggiungi, mostraFatte }: {
  aggiungi: (testo: string, quando: Secchio, modo: 'bozza' | 'tutto' | null) => void
  mostraFatte: () => void
}) {
  const [testo, setTesto] = useState('')
  const [dove, setDove] = useState<Secchio>('oggi')
  const [modo, setModo] = useState<'bozza' | 'tutto' | null>(null)
  const [fuoco, setFuoco] = useState(false)
  const [scelto, setScelto] = useState(0)
  // acceso appena scegli dal menù: serve a far comparire la targhetta anche
  // quando quello che hai scelto è già il predefinito
  const [vistaScelta, setVistaScelta] = useState(false)
  const campo = useRef<HTMLInputElement>(null)

  // il menù è aperto finché la parola dopo «/» è ancora in scrittura
  const pezzo = /(?:^|\s)\/(\S*)$/.exec(testo)
  const filtro = pezzo?.[1]?.toLowerCase() ?? null
  // si accettano tutte e due le parole: chi ha imparato «/settimana» non deve
  // reimpararlo perché ha cambiato la lingua dell'interfaccia
  const visti = filtro === null ? [] : COMANDI.filter(c =>
    c.it.startsWith(filtro) || c.en.startsWith(filtro) || t(c.nome).toLowerCase().startsWith(filtro))
  const aperto = filtro !== null && visti.length > 0

  useEffect(() => { setScelto(0) }, [filtro])

  const applica = (c: Comando) => {
    if (c.quando) { setDove(c.quando); setVistaScelta(true) }
    if (c.modo) setModo(c.modo)
    if (c.fai === 'fatte') mostraFatte()
    // il comando sparisce dal testo: quello che resta è la cosa da fare
    setTesto(testo.replace(/(?:^|\s)\/\S*$/, '').replace(/^\s+/, ''))
    campo.current?.focus()
  }

  const manda = () => {
    if (!testo.trim()) return
    aggiungi(testo, dove, modo)
    setTesto('')
    setDove('oggi')
    setModo(null)
    setVistaScelta(false)
  }

  const tasti = (e: React.KeyboardEvent) => {
    if (aperto) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setScelto(s => (s + 1) % visti.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setScelto(s => (s - 1 + visti.length) % visti.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); applica(visti[scelto]); return }
      if (e.key === 'Escape') { e.stopPropagation(); setTesto(testo.replace(/(?:^|\s)\/\S*$/, '')); return }
    }
    if (e.key === 'Enter') manda()
    if (e.key === 'Escape') { e.stopPropagation(); setTesto(''); setModo(null); setDove('oggi'); setVistaScelta(false) }
  }

  const etichetta: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6, flex: 'none',
    padding: '4px 9px', borderRadius: 7, fontSize: '11.5px', fontWeight: 500,
    background: 'rgba(34,39,31,.06)', color: 'rgba(34,39,31,.7)'
  }

  return (
    <div style={{ position: 'relative', WebkitAppRegion: 'no-drag' } as CSSProperties}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9, padding: '7px 7px 7px 17px',
        borderRadius: 14, background: 'rgba(255,253,249,.86)',
        backdropFilter: 'blur(22px)', WebkitBackdropFilter: 'blur(22px)',
        border: `1px solid ${fuoco ? 'rgba(34,39,31,.26)' : 'rgba(255,255,255,.9)'}`,
        boxShadow: fuoco ? '0 8px 26px rgba(84,64,44,.10)' : '0 4px 16px rgba(84,64,44,.05)',
        transition: 'border-color .15s, box-shadow .15s'
      }}>
        <input
          ref={campo}
          autoFocus
          value={testo}
          onChange={e => setTesto(e.target.value)}
          onFocus={() => setFuoco(true)}
          onBlur={() => setFuoco(false)}
          onKeyDown={tasti}
          aria-label={t('Cosa c\'è da fare')}
          placeholder={t('Cosa c\'è da fare')}
          style={{
            flex: 1, minWidth: 0, border: 'none', background: 'none', outline: 'none',
            fontFamily: 'inherit', fontSize: '14.5px', color: '#22271F', padding: '8px 0'
          }} />

        {/* Anche «oggi» ha la sua targhetta: se scegliendo dal menù non cambia
            niente a schermo, non sai se hai scelto. Verde bosco per il giorno,
            terracotta per quello che va a lui — due significati, due colori. */}
        {(dove !== 'oggi' || vistaScelta) && (
          <span style={{
            ...etichetta,
            background: dove === 'oggi' ? 'rgba(62,81,64,.12)' : 'rgba(34,39,31,.06)',
            color: dove === 'oggi' ? '#3E5140' : 'rgba(34,39,31,.7)'
          }}>{t(NOME[dove])}</span>
        )}
        {modo && (
          <span style={{ ...etichetta, background: 'rgba(196,98,59,.12)', color: '#8E3F1F' }}>
            {modo === 'bozza' ? t('bozza') : t('Myynd')}
          </span>
        )}

        {!testo && (
          <span style={{
            flex: 'none', fontSize: '11px', color: 'rgba(34,39,31,.3)',
            border: '1px solid rgba(34,39,31,.12)', borderRadius: 5, padding: '2px 6px'
          }}>/</span>
        )}

        <button type="button" onClick={manda} disabled={!testo.trim()}
          title={t('Aggiungila')} aria-label={t('Aggiungila')}
          style={{
            width: 30, height: 30, flex: 'none', borderRadius: 9, border: 'none',
            background: testo.trim() ? '#22271F' : 'rgba(34,39,31,.07)',
            color: testo.trim() ? '#FFF7F0' : 'rgba(34,39,31,.28)',
            display: 'grid', placeItems: 'center',
            cursor: testo.trim() ? 'pointer' : 'default', fontFamily: 'inherit'
          }}><IconPiu size={13} /></button>
      </div>

      {aperto && (
        <div role="listbox" style={{
          position: 'absolute', top: 'calc(100% + 7px)', left: 0, right: 0, zIndex: 30,
          borderRadius: 13, background: 'rgba(255,253,249,.97)',
          backdropFilter: 'blur(26px)', WebkitBackdropFilter: 'blur(26px)',
          border: '1px solid rgba(255,255,255,.9)', boxShadow: '0 20px 46px rgba(60,44,30,.20)',
          padding: 5, animation: 'fadein .12s ease', overflow: 'hidden'
        }}>
          {visti.map((c, i) => (
            <Hov key={c.it} role="option" aria-selected={i === scelto}
              onMouseEnter={() => setScelto(i)}
              onMouseDown={(e: React.MouseEvent) => { e.preventDefault(); applica(c) }}
              style={{
                display: 'flex', alignItems: 'baseline', gap: 10, padding: '8px 11px',
                borderRadius: 9, cursor: 'pointer',
                background: i === scelto ? 'rgba(34,39,31,.06)' : 'transparent'
              }}
              hover={{ background: 'rgba(34,39,31,.06)' }}>
              <span style={{ fontSize: '13.5px', color: '#22271F', flex: 'none' }}>{t(c.nome)}</span>
              <span style={{ fontSize: '12px', color: 'rgba(34,39,31,.45)', flex: 1, minWidth: 0 }}>{t(c.nota)}</span>
              <span style={{
                fontFamily: 'inherit', fontSize: '11px', color: 'rgba(34,39,31,.35)', flex: 'none'
              }}>/{chiaveDi(c)}</span>
            </Hov>
          ))}
        </div>
      )}
    </div>
  )
}
