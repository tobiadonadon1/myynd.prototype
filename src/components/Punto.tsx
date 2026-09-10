// Il punto: la carta di quando torni, e il foglio che ci sta dietro.
//
// Sono due cose, e vanno tenute distinte. In prima pagina c'è una carta come
// le altre — titolo, una riga sotto, un bottone: «Il punto di oggi. 5 cose.
// Dieci secondi.» Non è un rigo di servizio scritto piccolo, perché la
// domanda con cui si torna nell'app merita il peso delle altre carte.
//
// Aprendola si apre un *documento*: un foglio color avorio, largo seicento
// quaranta, con i margini di una pagina e una riga per cosa. Era una finestra
// fitta — tredici pixel, pastiglie a destra di ogni riga, incisi con la
// lineetta, note in corsivo — e la si chiudeva senza leggerla. Qui la riga è
// il bersaglio: se parla di una bozza, cliccarla apre la bozza; se parla di
// una notizia, il titolo la apre. Niente pastiglie, niente corsivo, niente
// lineette: quelle le toglie anche il server, ma la pagina non le rimette.
//
// Il saluto non lo scrive il modello: lo compone la pagina dal tempo che la
// finestra sa, così non dice «sei stato via sette giorni» perché il materiale
// copre sette giorni.

import { useRef, type CSSProperties } from 'react'
import { frasi, loc, t } from '../lingua'
import { Hov, LABEL, useFocoDialogo } from '../ui'
import { IconAvanti, IconCroce } from '../icons'
import type { Vals } from '../vals'
import type { Lista } from '../oggi/useCompiti'
import { usePunto } from '../usePunto'
import type { RigaPunto } from '../api'

const VELO: CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 90, display: 'grid', placeItems: 'center',
  background: 'rgba(34,39,31,.28)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
  padding: 20, animation: 'fadein .16s ease'
}

/** Il foglio: un documento da leggere, con i margini di una pagina. */
const FOGLIO: CSSProperties = {
  position: 'relative', width: 'min(640px, 100%)', maxHeight: 'min(86vh, 820px)',
  overflowY: 'auto', overflowX: 'hidden', minWidth: 0,
  padding: 'clamp(28px, 5vw, 40px) clamp(28px, 6vw, 44px)', borderRadius: 20,
  background: 'var(--avorio)', border: '1px solid rgba(255,255,255,.9)',
  boxShadow: '0 30px 80px rgba(60,44,30,.28)', color: 'var(--inchiostro)',
  fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif"
}

/** L'etichetta di una sezione: la stessa di sempre, con più aria intorno. */
const ETICHETTA: CSSProperties = { ...LABEL, fontSize: 11, letterSpacing: '.12em' }

/** Una riga: quindici pixel, respiro, e nient'altro addosso. */
const LINEA: CSSProperties = {
  display: 'flex', alignItems: 'baseline', gap: 12, minWidth: 0,
  fontSize: 15, lineHeight: 1.55, color: 'var(--inchiostro)'
}

const TESTO: CSSProperties = { flex: 1, minWidth: 0, overflowWrap: 'anywhere', textWrap: 'pretty' }

/** Quello che sta accanto alla frase e non è la frase: il perché, il dove sei. */
const SPENTO: CSSProperties = { color: 'rgba(34,39,31,.55)' }

/**
 * La riga intera è il bersaglio.
 *
 * Aveva una pastiglia «Apri» a destra, e ogni riga ne portava una: quattro
 * bottoni in colonna che dicevano tutti la stessa parola. Il verbo era già
 * nella frase; qui si clicca la frase, e in fondo resta una freccia piccola
 * che dice che si può.
 */
const APRIBILE: CSSProperties = {
  ...LINEA, width: '100%', textAlign: 'left', padding: 0, margin: 0,
  border: 'none', background: 'none', fontFamily: 'inherit', cursor: 'pointer'
}

/** Il rame al passaggio: l'unico accento, e solo dove si può cliccare. */
const RAME: CSSProperties = { color: '#C4623B', textDecoration: 'underline', textUnderlineOffset: 3 }

/** Un gesto che non deve chiamare l'occhio: piccolo, spento, rame se ci passi sopra. */
const QUIETO: CSSProperties = {
  flex: 'none', padding: 0, border: 'none', background: 'none', fontFamily: 'inherit',
  fontSize: 12, lineHeight: 1.55, color: 'rgba(34,39,31,.5)', cursor: 'pointer', whiteSpace: 'nowrap'
}
const FERMO: CSSProperties = { ...QUIETO, cursor: 'default' }

/** La carta in prima pagina: come le altre, non un rigo di servizio. */
const CARTA: CSSProperties = {
  flex: 'none', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', minWidth: 0,
  borderRadius: 20, background: 'rgba(255,253,249,.66)',
  backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,.75)', padding: '18px 22px', marginBottom: 14
}

/** Un bottone solo per carta, ed è questo. */
const BOTTONE: CSSProperties = {
  flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '11px 20px', borderRadius: 99, border: 'none',
  background: 'linear-gradient(120deg,#B24E2E,#D98A5A)', color: '#FFF7F0',
  fontSize: '13.5px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit'
}

/** «5 cose» comincia una frase: la maiuscola la mette la pagina, non il dizionario. */
const maiuscola = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1)

function Sezione({ etichetta, children }: { etichetta: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 26, minWidth: 0 }}>
      <div style={ETICHETTA}>{etichetta}</div>
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </div>
  )
}

/**
 * Una riga del punto.
 *
 * Se parla di una riga della lista o di un documento, la riga si apre; se non
 * parla di niente che si possa aprire, è solo testo. Non c'è un verbo da
 * scegliere: il verbo è quello che c'è dietro alla frase.
 */
function Voce({ r, apriCompito, apriDoc }: {
  r: RigaPunto; apriCompito: (id: string) => void; apriDoc: (id: string) => void
}) {
  const apri = r.compito ? () => apriCompito(r.compito!) : r.doc ? () => apriDoc(r.doc!) : null
  if (!apri) return <div style={LINEA}><span style={TESTO}>{r.testo}</span></div>
  return (
    <Hov as="button" type="button" style={APRIBILE} hover={RAME} onClick={apri}>
      <span style={TESTO}>{r.testo}</span>
      <IconAvanti size={12} style={{ flex: 'none', opacity: .5 }} />
    </Hov>
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
    <Voce key={i} r={r} apriCompito={apriRiga} apriDoc={apriDoc} />)

  const quante = punto.mentreNonCeri.length + punto.adesso.length + punto.daLeggere.length + punto.avvii.length
  const vuoto = quante === 0 && punto.progetti.length === 0
  const data = new Date(punto.quando).toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long' })
  const sotto = [
    data,
    vuoto ? t('Niente di nuovo.') : frasi.coseNelPunto(quante),
    punto.via ? frasi.viaDa(punto.via) : ''
  ].filter(Boolean).join(' · ')

  return (
    <div style={VELO} onMouseDown={e => { if (e.target === e.currentTarget) p.nascondi() }}>
      <div ref={finestra} role="dialog" aria-modal="true" aria-labelledby="punto-titolo" tabIndex={-1} style={FOGLIO}>
        <Hov as="button" type="button" onClick={p.nascondi} title={t('Chiudi')} aria-label={t('Chiudi')}
          style={{
            position: 'absolute', top: 14, right: 14, width: 28, height: 28, borderRadius: 99,
            border: 'none', background: 'none', cursor: 'pointer', color: 'rgba(34,39,31,.4)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
          }}
          hover={{ color: '#22271F', background: 'rgba(34,39,31,.06)' }}>
          <IconCroce size={11} />
        </Hov>

        {/* il titolo del foglio, in grazie come ogni h1; sotto, la data e il conto */}
        <h1 id="punto-titolo" style={{ margin: 0, fontSize: 28, lineHeight: 1.2, paddingRight: 34, textWrap: 'pretty', overflowWrap: 'anywhere' }}>
          {t('Il punto di oggi.')}
        </h1>
        <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5, color: 'rgba(34,39,31,.5)', overflowWrap: 'anywhere' }}>
          {sotto}
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
              <div key={i} style={LINEA}>
                <span style={TESTO}>
                  {n.link
                    ? <Hov as="a" href={n.link} target="_blank" rel="noreferrer"
                        style={{ fontWeight: 500, color: 'inherit', textDecoration: 'none', cursor: 'pointer' }}
                        hover={RAME}>{n.titolo}</Hov>
                    : <span style={{ fontWeight: 500 }}>{n.titolo}</span>}
                  {n.perche && <span style={SPENTO}> {n.perche}</span>}
                </span>
              </div>
            ))}
          </Sezione>
        )}
        {punto.avvii.length > 0 && (
          <Sezione etichetta={t('Da accendere')}>
            {punto.avvii.map((a, i) => {
              const accesa = p.accese[a.frase]
              return (
                <div key={i} style={LINEA}>
                  <span style={TESTO}>
                    {a.frase}
                    {a.perche && <span style={SPENTO}> {a.perche}</span>}
                  </span>
                  {accesa
                    ? <span style={FERMO}>{t('Accesa')}</span>
                    : <Hov as="button" type="button" style={QUIETO} hover={{ color: '#C4623B' }}
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
                <div key={pr.nome} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <div style={LINEA}>
                    <span style={TESTO}>
                      <span style={{ fontWeight: 500 }}>{pr.nome}</span>
                      {pr.doveSei && <span style={SPENTO}> {pr.doveSei}</span>}
                    </span>
                    {/* il modello i progetti li indovina, e a volte sbaglia: un dito
                        lo chiude in tabella, e non torna, nemmeno al punto dopo */}
                    {pr.id && (
                      <Hov as="button" type="button" style={QUIETO} hover={{ color: '#C4623B' }}
                        onClick={() => p.nonProgetto(pr.id)}>{t('Non è un progetto')}</Hov>
                    )}
                  </div>
                  {pr.angolo && (
                    <div style={{ ...LINEA, flexWrap: 'wrap', gap: 10 }}>
                      <span style={{ ...TESTO, flexBasis: 260 }}>{pr.angolo}</span>
                      {tenuto
                        ? <span style={FERMO}>{t('Tenuto')}</span>
                        : (
                          <span style={{ display: 'inline-flex', gap: 14, flex: 'none' }}>
                            <Hov as="button" type="button" style={QUIETO} hover={{ color: '#C4623B' }}
                              onClick={() => p.tieni(pr.nome, pr.angolo)}>{t('Tienilo')}</Hov>
                            <Hov as="button" type="button" style={QUIETO} hover={{ color: '#C4623B' }}
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

        <div style={{
          marginTop: 30, paddingTop: 16, borderTop: '1px solid rgba(34,39,31,.08)',
          display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap', minWidth: 0
        }}>
          <Hov as="button" type="button" style={QUIETO} hover={{ color: '#C4623B' }}
            onClick={p.rifai} disabled={p.carico}>{p.carico ? t('Un momento…') : t('Rifai il punto')}</Hov>
          {p.tetto && (
            <span style={{ flex: '1 1 200px', minWidth: 0, fontSize: 12, color: 'rgba(34,39,31,.5)', overflowWrap: 'anywhere' }}>
              {t('Per oggi basta: tre punti al giorno. Si riparte domani.')}
            </span>
          )}
          {!p.tetto && <div style={{ flex: 1 }} />}
          <Hov as="button" type="button" style={QUIETO} hover={{ color: '#C4623B' }}
            onClick={p.nascondi}>{t('Chiudi')}</Hov>
        </div>
      </div>
    </div>
  )
}

/**
 * In pagina: il foglio se il punto è da vedere, altrimenti la carta che lo
 * riapre. Senza un punto, niente — una cornice vuota in cima alla prima
 * pagina è la cosa peggiore che si possa aggiungere qui.
 */
export function Punto({ v, lista, apriCompito }: { v: Vals; lista?: Lista; apriCompito: (id: string) => void }) {
  const p = usePunto()
  if (!p.punto) return null
  if (p.daVedere) return <Finestra v={v} lista={lista} apriCompito={apriCompito} p={p} />
  const quante = p.punto.mentreNonCeri.length + p.punto.adesso.length + p.punto.daLeggere.length + p.punto.avvii.length
  return (
    <div style={CARTA}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontSize: 15, fontWeight: 500 }}>{t('Il punto di oggi.')}</div>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: 'rgba(34,39,31,.65)', marginTop: 3, textWrap: 'pretty', overflowWrap: 'anywhere' }}>
          {maiuscola(frasi.coseNelPunto(quante))}. {t('Dieci secondi.')}
        </div>
      </div>
      <button type="button" onClick={p.riapri} style={BOTTONE}>{t('Apri')} <IconAvanti /></button>
    </div>
  )
}
