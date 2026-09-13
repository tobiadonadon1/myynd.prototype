// Il punto: la carta di quando torni, e il foglio che ci sta dietro.
//
// Sono due cose, e vanno tenute distinte. In prima pagina c'è una carta come
// le altre — titolo, una riga sotto, un bottone: «Il punto di oggi. 5 cose.
// Dieci secondi.» Non è un rigo di servizio scritto piccolo, perché la
// domanda con cui si torna nell'app merita il peso delle altre carte.
//
// Aprendola si apre un *documento*: un foglio color avorio, largo seicento
// quaranta, con i margini di una pagina e una riga per cosa. Quattro sezioni,
// e sono le quattro domande che ha scelto lui: i progetti, GitHub, cosa
// leggere, chi ha risposto. Ogni riga apre il documento da cui viene — la
// mail, la pagina del repository, il file — e le righe che non hanno niente
// dietro sono testo e basta.
//
// Quello che qui non c'è più sono le cose da fare. Stavano sotto «adesso» con
// una freccia che apriva una riga nuova della lista, e la sua frase è stata
// questa: «quello lo devi mettere nel mio feed, non lì». Adesso il server le
// mette in lista mentre scrive il punto, e nel feed la freccia apre la mail a
// cui deve rispondere.
//
// Il saluto non lo scrive il modello: lo compone la pagina dal tempo che la
// finestra sa, così non dice «sei stato via sette giorni» perché il materiale
// copre sette giorni.

import { useRef, type CSSProperties } from 'react'
import { frasi, loc, t, tradotta } from '../lingua'
import { Hov, LABEL, useFocoDialogo } from '../ui'
import { IconAvanti, IconCroce } from '../icons'
import type { Vals } from '../vals'
import { usePunto } from '../usePunto'
import type { RigaPunto } from '../api'

/** Il guaio del server, se lo sappiamo dire; se no una frase sola, invece di un errore grezzo in un'altra lingua. */
function spiegaGuaio(g: string): string {
  return tradotta(g) ? t(g) : t('Il punto non è arrivato: il fornitore non ha risposto.')
}

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

/** La riga sotto il titolo della carta: quello che il titolo non dice. */
const SOTTO: CSSProperties = {
  fontSize: 13, lineHeight: 1.5, color: 'rgba(34,39,31,.65)', marginTop: 3,
  textWrap: 'pretty', overflowWrap: 'anywhere'
}
/** Perché non è arrivato: si legge se lo si cerca, e non toglie il posto al resto. */
const SPIEGA: CSSProperties = { ...SOTTO, color: 'rgba(34,39,31,.5)' }

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
 * Se dietro c'è un documento la riga si apre, e in fondo compare la freccia
 * piccola che dice che si può; se non c'è, è solo testo. Non c'è un verbo da
 * scegliere: il verbo è quello che c'è dietro alla frase. `nome` è il progetto,
 * l'unica cosa che si scrive più forte del resto.
 */
function Voce({ nome, testo, doc, apriDoc }: {
  nome?: string; testo: string; doc: string | null; apriDoc: (id: string) => void
}) {
  const dentro = (
    <span style={TESTO}>
      {nome ? <span style={{ fontWeight: 500 }}>{nome} </span> : null}
      {nome ? <span style={SPENTO}>{testo}</span> : testo}
    </span>
  )
  if (!doc) return <div style={LINEA}>{dentro}</div>
  return (
    <Hov as="button" type="button" style={APRIBILE} hover={RAME} onClick={() => apriDoc(doc)}>
      {dentro}
      <IconAvanti size={12} style={{ flex: 'none', opacity: .5 }} />
    </Hov>
  )
}

function Finestra({ v, p }: { v: Vals; p: ReturnType<typeof usePunto> }) {
  const finestra = useRef<HTMLDivElement>(null)
  useFocoDialogo(finestra, p.nascondi)
  const punto = p.punto!

  /*
   * Una riga si apre su quello che la dice.
   *
   * È l'unico gesto rimasto nella finestra, ed è sempre lo stesso: la mail che
   * ha ricevuto, la pagina del repository, il file arrivato. Il documento si
   * apre nel visore dell'app, quindi la finestra si chiude prima.
   */
  const apriDoc = (id: string) => { p.nascondi(); v.apriFonte(id) }
  const righe = (xs: RigaPunto[]) => xs.map((r, i) =>
    <Voce key={i} testo={r.testo} doc={r.doc} apriDoc={apriDoc} />)

  const quante = punto.progetti.length + punto.github.length + punto.daLeggere.length + punto.risposte.length
  const vuoto = quante === 0
  const data = new Date(punto.quando).toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long' })
  const sotto = [
    data,
    // quando non c'è niente lo dice il foglio, una riga sotto: dirlo due volte
    // nella stessa finestra è il modo di far sembrare vuoto anche il resto
    vuoto ? '' : frasi.coseNelPunto(quante),
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

        {vuoto && (
          <div style={{ ...LINEA, marginTop: 26 }}>
            <span style={TESTO}>{t('Niente di nuovo da quando ci siamo visti.')}</span>
          </div>
        )}

        {punto.progetti.length > 0 && (
          <Sezione etichetta={t('Progetti')}>
            {punto.progetti.map(pr => (
              <Voce key={pr.id || pr.nome} nome={pr.nome} testo={pr.novita} doc={pr.doc} apriDoc={apriDoc} />
            ))}
          </Sezione>
        )}
        {punto.github.length > 0 && (
          <Sezione etichetta={t('GitHub')}>{righe(punto.github)}</Sezione>
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
        {punto.risposte.length > 0 && (
          <Sezione etichetta={t('Risposte')}>{righe(punto.risposte)}</Sezione>
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
 * Il punto di ieri, che non è il punto di oggi.
 *
 * Il testo non si mostra: era vero alle due del pomeriggio di ieri, e quello
 * che diceva di fare adesso lui l'ha fatto ieri sera. Si dice che è scaduto e
 * si offre l'unica cosa che serve — rifarlo — con accanto, se c'è, il motivo
 * per cui l'ultimo tentativo non è andato.
 */
function Scaduto({ p }: { p: ReturnType<typeof usePunto> }) {
  return (
    <div style={CARTA}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontSize: 15, fontWeight: 500 }}>{t('Il punto di ieri è scaduto.')}</div>
        <div style={SOTTO}>{t('Rifallo quando vuoi: dieci secondi.')}</div>
        {p.guaio && <div style={SPIEGA}>{spiegaGuaio(p.guaio)}</div>}
        {p.tetto && <div style={SPIEGA}>{t('Per oggi basta: tre punti al giorno. Si riparte domani.')}</div>}
      </div>
      <button type="button" onClick={p.rifai} disabled={p.carico} style={BOTTONE}>
        {p.carico ? t('Un momento…') : t('Rifai il punto')}
      </button>
    </div>
  )
}

/**
 * In pagina: il foglio se il punto è da vedere, altrimenti la carta che lo
 * riapre. Senza un punto, niente — una cornice vuota in cima alla prima
 * pagina è la cosa peggiore che si possa aggiungere qui — tranne quando ce
 * n'è uno di ieri: allora la carta c'è, e dice che è scaduto.
 */
export function Punto({ v }: { v: Vals }) {
  const p = usePunto()
  if (!p.punto) return p.vecchio ? <Scaduto p={p} /> : null
  if (p.daVedere) return <Finestra v={v} p={p} />
  const quante = p.punto.progetti.length + p.punto.github.length + p.punto.daLeggere.length + p.punto.risposte.length
  return (
    <div style={CARTA}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontSize: 15, fontWeight: 500 }}>{t('Il punto di oggi.')}</div>
        <div style={SOTTO}>
          {maiuscola(frasi.coseNelPunto(quante))}. {t('Dieci secondi.')}
        </div>
        {p.guaio && <div style={SPIEGA}>{spiegaGuaio(p.guaio)}</div>}
      </div>
      <button type="button" onClick={p.riapri} style={BOTTONE}>{t('Apri')} <IconAvanti /></button>
    </div>
  )
}
