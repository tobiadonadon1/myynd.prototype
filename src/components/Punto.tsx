// Il punto: la finestra di quando torni.
//
// Non è una carta in mezzo alla pagina: è una finestra sopra a tutto, che si
// apre una volta — quando c'è un punto che non hai ancora visto — e si legge
// in dieci secondi. Poche righe, ognuna con la cosa che si può fare subito
// accanto: aprire la bozza pronta, affidargli una riga, accendere
// un'automazione. Chiusa, resta un rigo in cima alla prima pagina per
// riaprirla.
//
// L'accento sta sui gesti che aspettano lui — la bozza pronta, la domanda —
// e su nient'altro. Il saluto non lo scrive il modello: lo compone la pagina
// dal tempo che la finestra sa, così non dice «sei stato via sette giorni»
// perché il materiale copre sette giorni.

import { useRef, type CSSProperties } from 'react'
import { frasi, t } from '../lingua'
import { Hov, LABEL, useFocoDialogo } from '../ui'
import { IconCroce } from '../icons'
import type { Vals } from '../vals'
import type { Lista } from '../oggi/useCompiti'
import { usePunto } from '../usePunto'
import type { RigaPunto } from '../api'

const VELO: CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 90, display: 'grid', placeItems: 'center',
  background: 'rgba(34,39,31,.28)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
  padding: 20, animation: 'fadein .16s ease'
}

const FINESTRA: CSSProperties = {
  position: 'relative', width: 'min(520px, 100%)', maxHeight: 'min(82vh, 720px)', overflowY: 'auto', overflowX: 'hidden',
  padding: '22px 24px 18px', borderRadius: 20, minWidth: 0,
  background: 'rgba(255,253,249,.97)', border: '1px solid rgba(255,255,255,.9)',
  boxShadow: '0 30px 80px rgba(60,44,30,.28)', color: '#22271F',
  fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif"
}

const RIGA: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, minWidth: 0,
  fontSize: '13.5px', lineHeight: 1.4, color: 'rgba(34,39,31,.85)'
}

const TESTO: CSSProperties = { flex: 1, minWidth: 0, overflowWrap: 'anywhere', textWrap: 'pretty' }

/** Il gesto accanto a una riga: una pastiglia, piccola, che dice il verbo. */
const GESTO: CSSProperties = {
  flex: 'none', padding: '4px 10px', borderRadius: 99, border: '1px solid rgba(34,39,31,.16)',
  background: 'rgba(255,255,255,.7)', fontFamily: 'inherit', fontSize: '11.5px', fontWeight: 500,
  color: '#22271F', cursor: 'pointer', whiteSpace: 'nowrap'
}
/** Lo stesso gesto, quando è l'unico che aspetta lui. */
const GESTO_ATTESA: CSSProperties = {
  ...GESTO, border: 'none', background: '#C4623B', color: '#FFF7F0'
}
const GESTO_FATTO: CSSProperties = {
  ...GESTO, cursor: 'default', color: 'rgba(34,39,31,.5)', background: 'transparent'
}

const PICCOLO: CSSProperties = {
  padding: '2px 0', border: 'none', background: 'none', fontFamily: 'inherit',
  fontSize: 12, cursor: 'pointer', color: 'rgba(34,39,31,.55)', whiteSpace: 'nowrap'
}

function Sezione({ etichetta, children }: { etichetta: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 14, minWidth: 0 }}>
      <div style={LABEL}>{etichetta}</div>
      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 7 }}>{children}</div>
    </div>
  )
}

/**
 * Una riga e il suo gesto.
 *
 * Il verbo lo decide lo stato della riga della lista, non il modello: una
 * bozza pronta si apre, una domanda si risponde, una riga aperta si affida.
 * Un documento si apre. Senza niente da fare, la riga è solo testo.
 */
function Riga({ r, lista, apriCompito, apriDoc }: {
  r: RigaPunto; lista?: Lista; apriCompito: (id: string) => void; apriDoc: (id: string) => void
}) {
  const c = r.compito ? lista?.compiti.find(x => x.id === r.compito) : undefined
  let gesto: { testo: string; fai: () => void; attesa: boolean } | null = null
  if (c?.stato === 'pronto') gesto = { testo: t('Apri'), fai: () => apriCompito(c.id), attesa: true }
  else if (c?.stato === 'chiede') gesto = { testo: t('Rispondi'), fai: () => apriCompito(c.id), attesa: true }
  else if (c?.stato === 'aperto') gesto = { testo: t('Fagliela fare'), fai: () => lista?.delega(c.id, 'bozza'), attesa: false }
  else if (r.compito) gesto = { testo: t('Apri'), fai: () => apriCompito(r.compito!), attesa: false }
  else if (r.doc) gesto = { testo: t('Apri'), fai: () => apriDoc(r.doc!), attesa: false }
  return (
    <div style={RIGA}>
      <span style={TESTO}>{r.testo}</span>
      {gesto && (
        <Hov as="button" type="button" style={gesto.attesa ? GESTO_ATTESA : GESTO}
          hover={gesto.attesa ? { background: '#A9502C' } : { background: 'rgba(34,39,31,.06)' }}
          onClick={gesto.fai}>{gesto.testo}</Hov>
      )}
    </div>
  )
}

function Finestra({ v, lista, apriCompito, p }: {
  v: Vals; lista?: Lista; apriCompito: (id: string) => void; p: ReturnType<typeof usePunto>
}) {
  const finestra = useRef<HTMLDivElement>(null)
  useFocoDialogo(finestra, p.nascondi)
  const punto = p.punto!

  // una riga chiusa nel frattempo non sta più sulla prima pagina: si va alla lista
  const apriRiga = (id: string) => {
    p.nascondi()
    if (lista?.compiti.some(c => c.id === id)) apriCompito(id)
    else v.goOggi()
  }
  const apriDoc = (id: string) => { p.nascondi(); v.apriFonte(id) }
  const righe = (xs: RigaPunto[]) => xs.map((r, i) =>
    <Riga key={i} r={r} lista={lista} apriCompito={apriRiga} apriDoc={apriDoc} />)

  const quante = punto.mentreNonCeri.length + punto.adesso.length + punto.daLeggere.length + punto.avvii.length
  const vuoto = quante === 0 && punto.progetti.length === 0

  return (
    <div style={VELO} onMouseDown={e => { if (e.target === e.currentTarget) p.nascondi() }}>
      <div ref={finestra} role="dialog" aria-modal="true" aria-label={t('Il punto')} tabIndex={-1} style={FINESTRA}>
        <Hov as="button" type="button" onClick={p.nascondi} title={t('Chiudi')} aria-label={t('Chiudi')}
          style={{
            position: 'absolute', top: 12, right: 12, width: 28, height: 28, borderRadius: 99,
            border: 'none', background: 'none', cursor: 'pointer', color: 'rgba(34,39,31,.4)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
          }}
          hover={{ color: '#22271F', background: 'rgba(34,39,31,.06)' }}>
          <IconCroce size={11} />
        </Hov>

        {/* il saluto: il tempo lo sa la finestra, il conto lo sa la pagina */}
        <div style={{ fontSize: 18, lineHeight: 1.3, fontWeight: 500, letterSpacing: '-.01em', paddingRight: 32, textWrap: 'pretty' }}>
          {punto.via ? frasi.viaDa(punto.via) : t('Il punto di oggi.')}
        </div>
        <div style={{ marginTop: 3, fontSize: '12.5px', color: 'rgba(34,39,31,.5)' }}>
          {vuoto ? t('Niente di nuovo.') : frasi.coseNelPunto(quante)}
        </div>

        {punto.mentreNonCeri.length > 0 && (
          <Sezione etichetta={t('Mentre non c’eri')}>{righe(punto.mentreNonCeri)}</Sezione>
        )}
        {punto.adesso.length > 0 && (
          <Sezione etichetta={t('Adesso')}>{righe(punto.adesso)}</Sezione>
        )}
        {punto.daLeggere.length > 0 && (
          <Sezione etichetta={t('Da leggere')}>
            {punto.daLeggere.map((n, i) => (
              <div key={i} style={RIGA}>
                <span style={TESTO}>
                  <span style={{ fontWeight: 500 }}>{n.titolo}</span>
                  {n.perche && <span style={{ color: 'rgba(34,39,31,.6)' }}> — {n.perche}</span>}
                </span>
                {n.link && (
                  <Hov as="a" href={n.link} target="_blank" rel="noreferrer" style={{ ...GESTO, textDecoration: 'none' }}
                    hover={{ background: 'rgba(34,39,31,.06)' }}>{t('Apri')}</Hov>
                )}
              </div>
            ))}
          </Sezione>
        )}
        {punto.avvii.length > 0 && (
          <Sezione etichetta={t('Da accendere')}>
            {punto.avvii.map((a, i) => {
              const accesa = p.accese[a.frase]
              return (
                <div key={i} style={RIGA}>
                  <span style={TESTO}>
                    {a.frase}
                    {a.perche && <span style={{ color: 'rgba(34,39,31,.55)' }}> · {a.perche}</span>}
                  </span>
                  {accesa
                    ? <span style={GESTO_FATTO}>{t('Accesa')}</span>
                    : <Hov as="button" type="button" style={GESTO} hover={{ background: 'rgba(34,39,31,.06)' }}
                        onClick={() => p.avvia(a.frase)}>{t('Accendi')}</Hov>}
                </div>
              )
            })}
            {p.guaioAvvio && <div style={{ fontSize: 12, color: '#8E3F1F', overflowWrap: 'anywhere' }}>{t(p.guaioAvvio)}</div>}
          </Sezione>
        )}
        {punto.progetti.length > 0 && (
          <Sezione etichetta={t('I tuoi progetti')}>
            {punto.progetti.map(pr => {
              const tenuto = !!pr.angolo && pr.angoliTenuti.includes(pr.angolo)
              return (
                <div key={pr.nome} style={{ ...RIGA, alignItems: 'flex-start', flexDirection: 'column', gap: 2 }}>
                  <span style={{ ...TESTO, display: 'flex', alignItems: 'baseline', gap: 10, width: '100%' }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 500 }}>{pr.nome}</span>
                      {pr.doveSei && <span style={{ color: 'rgba(34,39,31,.65)' }}> — {pr.doveSei}</span>}
                    </span>
                    {/* il modello i progetti li indovina, e a volte sbaglia: un dito
                        lo chiude in tabella, e non torna — nemmeno al punto dopo */}
                    {pr.id && (
                      <Hov as="button" type="button" style={PICCOLO} hover={{ color: '#22271F' }}
                        onClick={() => p.nonProgetto(pr.id)}>{t('Non è un progetto')}</Hov>
                    )}
                  </span>
                  {pr.angolo && (
                    <span style={{ ...TESTO, display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', width: '100%' }}>
                      <span style={{ flex: '1 1 240px', minWidth: 0, fontStyle: 'italic', color: 'rgba(34,39,31,.8)' }}>{pr.angolo}</span>
                      {tenuto
                        ? <span style={{ ...PICCOLO, cursor: 'default' }}>{t('Tenuto')}</span>
                        : (
                          <span style={{ display: 'inline-flex', gap: 10, flex: 'none' }}>
                            <Hov as="button" type="button" style={PICCOLO} hover={{ color: '#22271F' }}
                              onClick={() => p.tieni(pr.nome, pr.angolo)}>{t('Tienilo')}</Hov>
                            <Hov as="button" type="button" style={PICCOLO} hover={{ color: '#22271F' }}
                              onClick={() => p.scarta(pr.nome, pr.angolo)}>{t('Non è così')}</Hov>
                          </span>
                        )}
                    </span>
                  )}
                </div>
              )
            })}
          </Sezione>
        )}

        <div style={{ marginTop: 16, display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
          <Hov as="button" type="button" style={PICCOLO} hover={{ color: '#22271F' }}
            onClick={p.rifai} disabled={p.carico}>{p.carico ? t('Un momento…') : t('Rifai il punto')}</Hov>
          {p.tetto && (
            <span style={{ fontSize: 12, color: 'rgba(34,39,31,.55)', overflowWrap: 'anywhere' }}>
              {t('Per oggi basta: tre punti al giorno. Si riparte domani.')}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <Hov as="button" type="button" style={PICCOLO} hover={{ color: '#22271F' }} onClick={p.nascondi}>{t('Chiudi')}</Hov>
        </div>
      </div>
    </div>
  )
}

/**
 * In pagina: la finestra se il punto è da vedere, altrimenti un rigo per
 * riaprirla. Senza un punto, niente — una cornice vuota in cima alla prima
 * pagina è la cosa peggiore che si possa aggiungere qui.
 */
export function Punto({ v, lista, apriCompito }: { v: Vals; lista?: Lista; apriCompito: (id: string) => void }) {
  const p = usePunto()
  if (!p.punto) return null
  if (p.daVedere) return <Finestra v={v} lista={lista} apriCompito={apriCompito} p={p} />
  const quante = p.punto.mentreNonCeri.length + p.punto.adesso.length + p.punto.daLeggere.length + p.punto.avvii.length
  return (
    <div style={{ marginBottom: 14, fontSize: '12.5px', color: 'rgba(34,39,31,.55)', display: 'flex', gap: 6, alignItems: 'baseline', minWidth: 0 }}>
      <span style={{ overflowWrap: 'anywhere' }}>{t('Il punto')} · {frasi.coseNelPunto(quante)}</span>
      <Hov as="button" type="button" style={{ ...PICCOLO, textDecoration: 'underline', textUnderlineOffset: 3 }}
        hover={{ color: '#22271F' }} onClick={p.riapri}>{t('apri')}</Hov>
    </div>
  )
}
