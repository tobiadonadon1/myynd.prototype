// Il punto: la carta di quando torni.
//
// Sta sopra alla card scura e sotto alla rassegna, e non le somiglia: niente
// colore, niente vetro pesante, solo testo su una superficie appena più chiara
// del fondo. È una lettura di venti secondi — cosa è cambiato, cosa ha fatto
// lui, da dove si riprende — e deve sembrare una nota lasciata sulla
// scrivania, non un pannello.
//
// L'accento c'è in un posto solo: la pastiglia accanto a una riga della lista
// che aspetta un dito. È la regola di tutta l'app, e qui vale doppio, perché
// «adesso» è proprio l'elenco delle cose da fare.
//
// Se non c'è un punto, non c'è la carta. Una cornice vuota in cima alla prima
// pagina è la cosa peggiore che si possa aggiungere qui.

import type { CSSProperties } from 'react'
import { t } from '../lingua'
import { Hov, LABEL, PILL } from '../ui'
import { IconCroce } from '../icons'
import type { Vals } from '../vals'
import type { Lista } from '../oggi/useCompiti'
import { usePunto } from '../usePunto'
import type { RigaPunto } from '../api'

const CARTA: CSSProperties = {
  position: 'relative', minWidth: 0, marginBottom: 18,
  padding: '24px 28px 18px', borderRadius: 22,
  background: 'rgba(255,253,249,.55)', border: '1px solid rgba(255,255,255,.85)'
}

/** Una riga di testo: scritta dal modello, quindi può contenere qualsiasi cosa senza spazi. */
const VOCE: CSSProperties = {
  fontSize: '14.5px', lineHeight: 1.5, color: 'rgba(34,39,31,.85)',
  textWrap: 'pretty', overflowWrap: 'anywhere', minWidth: 0
}

/** Un verbo dentro il testo: «apri». Sottolineato piano, senza cornice. */
const LINK: CSSProperties = {
  padding: 0, border: 'none', background: 'none', fontFamily: 'inherit', fontSize: '13px',
  cursor: 'pointer', color: '#2F4A33', textDecoration: 'underline',
  textDecorationColor: 'rgba(47,74,51,.35)', textUnderlineOffset: 3, whiteSpace: 'nowrap'
}

/** Le due piccole azioni su un angolo, e il «rifai» in fondo. */
const PICCOLO: CSSProperties = {
  padding: '2px 0', border: 'none', background: 'none', fontFamily: 'inherit',
  fontSize: 12, cursor: 'pointer', color: 'rgba(34,39,31,.55)', whiteSpace: 'nowrap'
}

function Sezione({ etichetta, children }: { etichetta: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 18, minWidth: 0 }}>
      <div style={LABEL}>{etichetta}</div>
      <div style={{ marginTop: 7, display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </div>
  )
}

/**
 * Una riga con, se c'è, la cosa da aprire.
 *
 * Il verbo sta dopo il testo, sulla stessa riga, e la pastiglia solo se quella
 * riga della lista aspetta lui: «pronta» o «ti chiede», con l'unico colore.
 */
function Riga({ r, lista, apriCompito, apriDoc }: {
  r: RigaPunto; lista?: Lista; apriCompito: (id: string) => void; apriDoc: (id: string) => void
}) {
  const c = r.compito ? lista?.compiti.find(x => x.id === r.compito) : undefined
  const attesa = c?.stato === 'pronto' ? t('pronta') : c?.stato === 'chiede' ? t('ti chiede') : ''
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
      <span style={{ ...VOCE, flex: 1 }}>
        {r.testo}
        {(r.compito || r.doc) && (
          <>
            {' '}
            <Hov as="button" type="button" style={LINK} hover={{ color: '#22271F' }}
              onClick={() => (r.compito ? apriCompito(r.compito) : apriDoc(r.doc!))}>{t('Apri').toLowerCase()}</Hov>
          </>
        )}
      </span>
      {attesa && <span style={{ ...PILL, flex: 'none' }}>{attesa}</span>}
    </div>
  )
}

export function Punto({ v, lista, apriCompito }: { v: Vals; lista?: Lista; apriCompito: (id: string) => void }) {
  const p = usePunto()
  const punto = p.punto
  if (!punto) return null

  // una riga chiusa nel frattempo non sta più in cima alla prima pagina: si va
  // alla lista, dove si trova fra le fatte
  const apriRiga = (id: string) => {
    if (lista?.compiti.some(c => c.id === id)) apriCompito(id)
    else v.goOggi()
  }

  const righe = (xs: RigaPunto[]) => xs.map((r, i) =>
    <Riga key={i} r={r} lista={lista} apriCompito={apriRiga} apriDoc={v.apriFonte} />)

  return (
    <section aria-label={t('Il punto')} style={CARTA}>
      <Hov as="button" type="button" onClick={p.nascondi} title={t('Nascondi')} aria-label={t('Nascondi')}
        style={{
          position: 'absolute', top: 14, right: 14, width: 28, height: 28, borderRadius: 99,
          border: 'none', background: 'none', cursor: 'pointer', color: 'rgba(34,39,31,.4)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
        }}
        hover={{ color: '#22271F', background: 'rgba(34,39,31,.06)' }}>
        <IconCroce size={11} />
      </Hov>

      {/* il saluto è il titolo: non c'è un'etichetta sopra, perché la carta è quello */}
      <div style={{
        fontSize: 20, lineHeight: 1.35, fontWeight: 500, letterSpacing: '-.01em',
        paddingRight: 32, textWrap: 'pretty', overflowWrap: 'anywhere'
      }}>{punto.saluto}</div>

      {punto.mentreNonCeri.length > 0 && (
        <Sezione etichetta={t('Mentre non c’eri')}>{righe(punto.mentreNonCeri)}</Sezione>
      )}

      {punto.adesso.length > 0 && (
        <Sezione etichetta={t('Adesso')}>{righe(punto.adesso)}</Sezione>
      )}

      {punto.daLeggere.length > 0 && (
        <Sezione etichetta={t('Da leggere')}>
          {punto.daLeggere.map((n, i) => (
            <div key={i} style={VOCE}>
              {n.link
                ? <Hov as="a" href={n.link} target="_blank" rel="noreferrer"
                    style={{ color: '#22271F', fontWeight: 500, textDecoration: 'none' }}
                    hover={{ textDecoration: 'underline' }}>{n.titolo}</Hov>
                : <span style={{ fontWeight: 500 }}>{n.titolo}</span>}
              {n.perche && <span style={{ color: 'rgba(34,39,31,.65)' }}> — {n.perche}</span>}
            </div>
          ))}
        </Sezione>
      )}

      {punto.progetti.length > 0 && (
        <Sezione etichetta={t('I tuoi progetti')}>
          {punto.progetti.map(pr => {
            const tenuto = !!pr.angolo && pr.angoliTenuti.includes(pr.angolo)
            return (
              <div key={pr.nome} style={{ ...VOCE, marginTop: 2 }}>
                <span style={{ fontWeight: 500 }}>{pr.nome}</span>
                {pr.doveSei && <span style={{ color: 'rgba(34,39,31,.7)' }}> — {pr.doveSei}</span>}
                {pr.angolo && (
                  <div style={{ marginTop: 3, display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', minWidth: 0 }}>
                    <span style={{ flex: '1 1 280px', minWidth: 0, color: 'rgba(34,39,31,.85)', fontStyle: 'italic' }}>{pr.angolo}</span>
                    {tenuto
                      ? <span style={{ ...PICCOLO, cursor: 'default' }}>{t('Tenuto')}</span>
                      : (
                        <span style={{ display: 'inline-flex', gap: 12, flex: 'none' }}>
                          <Hov as="button" type="button" style={PICCOLO} hover={{ color: '#22271F' }}
                            onClick={() => p.tieni(pr.nome, pr.angolo)}>{t('Tienilo')}</Hov>
                          <Hov as="button" type="button" style={PICCOLO} hover={{ color: '#22271F' }}
                            onClick={() => p.scarta(pr.nome, pr.angolo)}>{t('Non è così')}</Hov>
                        </span>
                      )}
                  </div>
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
      </div>
    </section>
  )
}
