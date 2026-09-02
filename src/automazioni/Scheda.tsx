// Una automazione, come scheda.
//
// L'elenco di prima diceva un nome e un'ora. Bastava a scorrere, non a
// *scegliere*: undici righe che si somigliano non sono un elenco di cose
// diverse, sono un elenco di nomi, e per sapere cosa faceva una bisognava
// aprirla. La scheda esiste per rispondere da chiusa a tre domande, e la
// gerarchia di quello che c'è dentro è quell'ordine:
//
//   · **come si chiama** — il titolo, per intero e nel corpo che hanno i
//     titoli dappertutto qui dentro. È la prima riga e la più grande, e non
//     divide più lo spazio con niente.
//   · **cosa apre** — le pastiglie, con la tinta della loro fonte. È la
//     domanda che prima non aveva risposta da nessuna parte, e riguarda una
//     cosa che gira mentre dormi. Sono anche l'unico colore della scheda:
//     lasciata sola, una tinta si riconosce da lontano.
//   · **quando** — la riga in fondo, con accanto l'interruttore che la
//     riguarda. Se è in pausa lo dice al posto dell'ora.
//
// Quello che c'era e non c'è più: la piastrella colorata del genere in alto a
// sinistra, e il conto delle volte che è girata. La prima rubava il posto al
// titolo e metteva un secondo colore accanto a quelli delle pastiglie, che
// sono i colori che vogliono dire qualcosa; il secondo era un numero che si
// legge una volta sola nella vita, e stava su ogni scheda per sempre. Dentro
// c'è ancora.
//
// Il vetro non è decorazione: la scheda sta sopra lo sfondo vivo dell'app, e
// quello che la tiene leggibile senza staccarla dal fondo è la stessa sfocatura
// che usano le altre superfici. Una scheda opaca qui dentro sembrerebbe
// incollata sopra invece che appoggiata.

import { useState } from 'react'
import type { Attrezzo, Automazione } from '../api'
import { frasi, loc, t } from '../lingua'
import { Cestino, Hov, daTastiera, useAttiva } from '../ui'
import { Pastiglia } from './Chiocciola'

const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato']

export function quandoGira(a: Automazione): string {
  const q = a.quando
  if ('quandoArriva' in q) return t('quando arriva qualcosa di nuovo')
  const ora = `${String(q.ora).padStart(2, '0')}:00`
  if (q.ogni === 'giorno') return `${t('ogni giorno alle')} ${ora}`
  return `${t('ogni')} ${t(GIORNI[q.giorno] ?? 'lunedì')} ${t('alle')} ${ora}`
}

export function quandoData(iso: string): string {
  return new Date(iso).toLocaleString(loc(), { weekday: 'long', hour: '2-digit', minute: '2-digit' })
}

/**
 * La riga in fondo alla scheda: cosa sta facendo, e cosa la ferma.
 *
 * Prima diceva due cose sole — l'ora del prossimo giro, o «manca una
 * connessione» — e fra le due c'era il buco che conta: **un'automazione che
 * gira ogni mattina e non trova mai niente si scriveva identica a una che
 * funziona.** Stessa riga, stesso pallino verde, stessa ora. L'unico modo di
 * accorgersene era aprirla e leggere «girata 47 volte» senza avere mai visto
 * comparire una riga in lista.
 *
 * Adesso lo dice. E lo dice **in fondo alla scheda invece che dentro**, perché
 * la domanda «quale delle mie undici automazioni sta perdendo tempo?» si fa
 * guardando la griglia, non aprendone una per una.
 */
function statoInFondo(a: Automazione): { testo: string; tinta: string; pallino: string } {
  const ROSSO = '#8E3F1F'
  const AMBRA = '#9A6B2F'
  const VERDE = '#7E9C82'
  const SPENTO = 'rgba(34,39,31,.2)'

  if (!a.accesa) return { testo: t('In pausa'), tinta: 'rgba(34,39,31,.5)', pallino: SPENTO }

  switch (a.salute.stato) {
    case 'scollegata':
      return { testo: t('manca una connessione'), tinta: ROSSO, pallino: ROSSO }
    case 'guaio':
      return { testo: t('l’ultima volta è andata storta'), tinta: ROSSO, pallino: ROSSO }
    case 'muta':
      // il numero conta: «non trova niente» è normale una volta, e sospetto
      // alla quinta. Senza il conto, chi legge non sa in quale dei due è
      return { testo: frasi.maiTrovatoNiente(a.salute.quante), tinta: AMBRA, pallino: AMBRA }
    case 'ferma':
      return { testo: t('aspetta che chiudi la sua riga'), tinta: 'rgba(34,39,31,.55)', pallino: AMBRA }
    default:
      return {
        // un turno già passato scritto come una data — «giovedì alle 09:00»
        // letto di venerdì — sembra un guasto: è invece la cosa che sta per
        // succedere, e va detta così
        testo: a.inRitardo ? t('a breve') : a.prossima ? quandoData(a.prossima) : quandoGira(a),
        tinta: 'rgba(34,39,31,.5)',
        pallino: VERDE
      }
  }
}

/** L'interruttore. Piccolo: la scheda intera è già un bersaglio. */
function Interruttore({ on, onClick, titolo }: {
  on: boolean; onClick: (e: React.MouseEvent) => void; titolo: string
}) {
  return (
    // un bottone, non un div: da tastiera un div non si raggiunge
    <button type="button" onClick={onClick} title={titolo} role="switch" aria-checked={on} aria-label={titolo}
      style={{
        width: 32, height: 19, flex: 'none', borderRadius: 99, padding: 2, boxSizing: 'border-box', border: 'none',
        cursor: 'pointer', display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start',
        background: on ? 'linear-gradient(120deg,#C4623B,#7E9C82)' : 'rgba(34,39,31,.17)',
        transition: 'background .2s'
      }}>
      <span style={{ width: 15, height: 15, borderRadius: '50%', background: '#FFFDF9', boxShadow: '0 1px 4px rgba(30,20,14,.28)' }} />
    </button>
  )
}

export function Scheda({ a, catalogo, apri, accendi, butta, prendi, ritardo }: {
  a: Automazione
  catalogo: Attrezzo[]
  apri: () => void
  accendi: (e: React.MouseEvent) => void
  /** Buttala. Compare passandoci sopra: sta lì e non dentro, perché toglierne
      una è un gesto che si fa guardando la griglia, non aprendo la scheda. */
  butta: () => void
  /** Comincia a trascinarla verso una cartella. */
  prendi: (e: React.DragEvent) => void
  /** Un filo di ritardo sull'entrata: le schede compaiono a cascata, non in blocco. */
  ritardo: number
}) {
  // `sopra` alza la scheda al passaggio; `attiva` — anche con il fuoco dentro, o
  // su un dito — è quello che fa comparire il cestino
  const { attiva, sopra, props: sottoMano } = useAttiva()
  const [presa, setPresa] = useState(false)
  const suoi = a.attrezzi.map(n => catalogo.find(x => x.nome === n)).filter((x): x is Attrezzo => !!x)
  const fondo = statoInFondo(a)

  return (
    <div
      role="button" tabIndex={0}
      draggable
      onDragStart={e => { setPresa(true); prendi(e) }}
      onDragEnd={() => setPresa(false)}
      onClick={apri} onKeyDown={daTastiera(apri)}
      {...sottoMano}
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column',
        minHeight: 186, padding: '16px 17px 14px', borderRadius: 22,
        cursor: 'pointer', boxSizing: 'border-box',
        background: a.accesa
          ? 'linear-gradient(165deg,rgba(255,253,249,.86),rgba(255,251,245,.7))'
          : 'linear-gradient(165deg,rgba(252,250,246,.6),rgba(250,247,242,.46))',
        backdropFilter: 'blur(26px) saturate(1.45)', WebkitBackdropFilter: 'blur(26px) saturate(1.45)',
        border: `1px solid ${sopra ? 'rgba(255,255,255,.98)' : 'rgba(255,255,255,.78)'}`,
        boxShadow: presa
          ? '0 4px 12px -6px rgba(84,64,44,.3)'
          : sopra
            ? '0 26px 52px -20px rgba(84,64,44,.34), inset 0 1px 0 rgba(255,255,255,.7)'
            : '0 14px 32px -18px rgba(84,64,44,.26), inset 0 1px 0 rgba(255,255,255,.55)',
        transform: presa ? 'scale(.97)' : sopra ? 'translateY(-2px)' : 'translateY(0)',
        opacity: presa ? 0.5 : 1,
        transition: 'transform .22s cubic-bezier(.2,.8,.25,1), box-shadow .22s ease, border-color .22s ease, opacity .15s',
        animation: `schedasu .38s cubic-bezier(.2,.8,.25,1) ${ritardo}ms both`
      }}>

      {/*
        Il titolo, e basta. Prende la riga intera perché è la cosa che si legge
        per prima, e ha il corpo che hanno i titoli nel resto dell'applicazione:
        una scheda con il nome più piccolo della frase che lo spiega è una
        scheda che si legge al contrario.
      */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 9, minHeight: 22 }}>
        <div style={{
          flex: 1, minWidth: 0,
          fontSize: '15px', fontWeight: 500, color: '#22271F', letterSpacing: '-.012em',
          lineHeight: 1.32, opacity: a.accesa ? 1 : 0.6,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
        }}>{a.nome}</div>

        {/*
          Il cestino compare quando la scheda è sotto mano, e chiede una volta.
          Non un dialogo in mezzo allo schermo: il bottone stesso diventa la
          domanda, e mollare il mouse è già la risposta «no».
        */}
        <Cestino fai={butta} titolo={t('Buttala')} visibile={attiva} />
      </div>

      <div style={{
        fontSize: '12px', lineHeight: 1.5, color: 'rgba(34,39,31,.55)', flex: 1,
        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        textWrap: 'pretty'
      }}>{a.spiega}</div>

      {/*
        Le pastiglie: l'unico colore rimasto sulla scheda, ed è quello che
        distingue un'automazione della posta da una del desktop da due metri.
      */}
      {!!suoi.length && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', margin: '11px 0 0' }}>
          {suoi.slice(0, 3).map(x => <Pastiglia key={x.nome} a={x} dim="piccola" />)}
          {suoi.length > 3 && (
            <span style={{ fontSize: '10.5px', color: 'rgba(34,39,31,.4)', alignSelf: 'center' }}>
              +{suoi.length - 3}
            </span>
          )}
        </div>
      )}

      {/*
        In fondo: quando gira, e l'interruttore che decide se gira. Stanno
        insieme perché sono la stessa domanda — «questa cosa è viva, e quando» —
        e prima erano ai due capi opposti della riga.
      */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9, marginTop: 11, paddingTop: 10,
        borderTop: '1px solid rgba(34,39,31,.07)'
      }}>
        <span style={{
          width: 6, height: 6, flex: 'none', borderRadius: '50%',
          background: fondo.pallino,
          boxShadow: a.accesa && a.salute.stato === 'bene' ? '0 0 0 3px rgba(126,156,130,.2)' : 'none'
        }} />
        <span title={fondo.testo} style={{
          fontSize: '11px', color: fondo.tinta, flex: 1, minWidth: 0,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
        }}>{fondo.testo}</span>
        <Interruttore on={a.accesa} onClick={accendi}
          titolo={a.accesa ? t('Mettila in pausa') : t('Falla girare da sola')} />
      </div>
    </div>
  )
}

/** Il riquadro tratteggiato che invita a scrivertene una. Sta in griglia con le altre. */
export function Vuota({ apri }: { apri: () => void }) {
  return (
    <Hov as="button" type="button" onClick={apri}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 7, minHeight: 186, borderRadius: 22, cursor: 'pointer', textAlign: 'center',
        padding: '15px 18px', boxSizing: 'border-box', width: '100%', fontFamily: 'inherit',
        border: '1px dashed rgba(34,39,31,.2)', background: 'rgba(255,253,249,.3)',
        color: 'rgba(34,39,31,.5)', transition: 'border-color .2s, color .2s, background .2s'
      }}
      hover={{ borderColor: 'rgba(196,98,59,.6)', color: '#8E3F1F', background: 'rgba(255,253,249,.55)' }}>
      <span style={{ fontSize: 21, lineHeight: 1 }}>+</span>
      <span style={{ fontSize: '12.5px', lineHeight: 1.45, textWrap: 'pretty' }}>
        {t('Scrivine una a parole')}
      </span>
    </Hov>
  )
}
