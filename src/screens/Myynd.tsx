import { useState, type CSSProperties, type MouseEvent } from 'react'
import { frasi, lingua, t } from '../lingua'
import { Hov } from '../ui'
import { IconDoc, IconFrecciaDx, IconGiu, IconSpunta } from '../icons'
import { Glifo, Stato } from '../components/Stato'
import { Marchio } from '../components/Marchio'
import { Rassegna } from '../components/Rassegna'
import { taglia, type Vals } from '../vals'
import type { Lista } from '../oggi/useCompiti'
import type { Compito } from '../api'

// Sulla riga aperta la freccia lascia il posto al pallino di prima: mentre
// leggi, «vai qui» non è più il consiglio giusto — ci sei già.
const PUNTINO: CSSProperties = {
  width: 7, height: 7, borderRadius: '50%', margin: '3px 0',
  background: '#FFFDF9', boxShadow: '0 0 0 1px rgba(34,39,31,.16)'
}

/**
 * Una riga del resto.
 *
 * La riga intera porta la voce in cima; il chevron in fondo alla frase apre il
 * testo e basta, e per questo si ferma il click prima che risalga. Sono due
 * gesti che stanno nello stesso rettangolo, quindi devono essere due bersagli
 * distinti e non due interpretazioni dello stesso.
 */
function Riga({ riga }: { riga: Vals['resto'][number] }) {
  const [sopra, setSopra] = useState(false)
  return (
    <div onClick={riga.onPromote} style={{ ...riga.row, borderTop: 'none' }}
      onMouseEnter={() => setSopra(true)} onMouseLeave={() => setSopra(false)}>
      <span style={riga.freccia}>
        {riga.aperto ? <span style={PUNTINO} /> : <IconFrecciaDx size={13} />}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={riga.tipoStyle}>{t(riga.tipo)}</span>
          <span style={{ fontSize: 12, color: 'rgba(34,39,31,.6)', minWidth: 0, overflowWrap: 'anywhere' }}>{riga.fonte}{riga.ora ? ` · ${riga.ora}` : ''}</span>
        </div>
        {/* titoli e testi li scrive il modello da oggetti di email e nomi di
            file: una parola senza spazi non deve poter uscire dalla riga */}
        <div style={{ fontSize: '14.5px', fontWeight: 500, marginTop: 6, overflowWrap: 'anywhere' }}>{riga.titolo}</div>
        <div style={{ fontSize: '14px', lineHeight: 1.5, color: 'rgba(34,39,31,.7)', marginTop: 3, textWrap: 'pretty', overflowWrap: 'anywhere' }}>
          {riga.testo}
          {riga.espandibile && (
            <Hov as="button" onClick={(e: MouseEvent) => { e.stopPropagation(); riga.onToggle() }}
              title={riga.aperto ? t('Richiudi') : t('Vedi tutto')}
              style={riga.chevron} hover={{ color: '#22271F' }}>
              <IconGiu size={13} stroke="currentColor" />
            </Hov>
          )}
        </div>
      </div>
      {/* prendere in carico una cosa che lui ha notato: è il gesto che unisce le
          due schermate, e va fatto da qui — dove la cosa la stai leggendo */}
      <Hov as="button"
        onClick={(e: MouseEvent) => { e.stopPropagation(); riga.onInLista() }}
        title={t('Mettila in lista')} aria-label={t('Mettila in lista')}
        style={{
          flex: 'none', padding: '4px 11px', borderRadius: 99, border: '1px solid rgba(34,39,31,.2)',
          background: 'rgba(255,255,255,.7)', color: 'rgba(34,39,31,.72)', fontSize: 12,
          fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
          opacity: sopra ? 1 : 0, pointerEvents: sopra ? 'auto' : 'none', transition: 'opacity .15s'
        }}
        hover={{ borderColor: '#C4623B', color: '#8E3F1F' }}>{t('in lista')}</Hov>

      {riga.urgenza && <span style={riga.pill}>{riga.urgenza}</span>}
    </div>
  )
}

/** Il feed: la cosa più urgente in grande, il resto sotto, le fatte in fondo. */

/** La pastiglia a destra della riga: la stessa che porta l'urgenza delle sue. */
const PASTIGLIA: CSSProperties = {
  flex: 'none', fontSize: '12px', fontWeight: 700, letterSpacing: '.02em', color: '#8E3F1F',
  background: 'rgba(196,98,59,.16)', border: '1px solid rgba(196,98,59,.32)', borderRadius: 99, padding: '5px 11px'
}

/** Cosa c'è scritto accanto a «DA FARE»: cosa sta succedendo, o dove sta. */
function didascalia(c: Compito): string {
  if (c.stato === 'delegato') return t('ci sta lavorando')
  return t(c.quando === 'oggi' ? 'Oggi' : c.quando === 'settimana' ? 'Questa settimana' : 'Prima o poi').toLowerCase()
}

/** Il corpo: il guaio se c'è, quello che ha scritto lui se è arrivato, la nota se l'hai messa. */
function corpo(c: Compito): string {
  if (c.guaio) return t(c.guaio)
  if (c.stato === 'pronto' || c.stato === 'chiede') return c.risultato ?? ''
  return c.nota ?? ''
}

/** Quello che aspetta te, detto in una parola. */
function attesaDi(c: Compito): string {
  return c.stato === 'pronto' ? t('pronta') : c.stato === 'chiede' ? t('ti chiede') : ''
}

/**
 * Le cose della lista, dentro il feed, vestite ESATTAMENTE come le altre.
 *
 * Niente card a parte, niente alone che respira sul bordo: una riga della lista
 * è una riga del feed — stesso tipo in maiuscoletto, stesso corpo, stessa
 * pastiglia a destra. Quello che la distingue è quello che c'è *scritto* —
 * «DA FARE», nello stesso posto in cui le sue dicono «DA LEGGERE». Un'etichetta
 * al posto di un trucco grafico: si legge, invece di doverla imparare.
 *
 * E si comporta come le altre: cliccandola sale in cima, dove c'è lo spazio per
 * farci qualcosa. Prima ti portava nell'altra schermata, che è il contrario di
 * un feed — se per chiudere una riga devi cambiare stanza, quella riga lì non
 * ci stava davvero.
 */
function RigaCompito({ c, l, apri }: { c: Compito; l: Lista; apri: () => void }) {
  const [sopra, setSopra] = useState(false)
  const attesa = attesaDi(c)
  const testo = corpo(c)

  return (
    <div onClick={apri}
      style={{ display: 'flex', gap: 13, alignItems: 'flex-start', padding: '17px 21px', cursor: 'pointer' }}
      onMouseEnter={() => setSopra(true)} onMouseLeave={() => setSopra(false)}>
      <span style={{ flex: 'none', width: 14, marginTop: 4, display: 'flex', justifyContent: 'center', color: 'rgba(62,81,64,.6)' }}>
        {c.stato === 'delegato'
          ? <Glifo tipo="penso" dim={13} colore="#C4623B" />
          : <IconFrecciaDx size={13} />}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ fontSize: '11.5px', fontWeight: 600, letterSpacing: '.09em', textTransform: 'uppercase', color: '#3E5140' }}>{t('Da fare')}</span>
          <span style={{ fontSize: 12, color: 'rgba(34,39,31,.6)' }}>{didascalia(c)}</span>
        </div>
        <div style={{ fontSize: '14.5px', fontWeight: 500, marginTop: 6, overflowWrap: 'anywhere' }}>{c.testo}</div>
        {testo && (
          <div style={{ fontSize: '14px', lineHeight: 1.5, color: 'rgba(34,39,31,.7)', marginTop: 3, textWrap: 'pretty' }}>
            {taglia(testo, 150)}
          </div>
        )}
      </div>

      {/* chiuderla senza nemmeno aprirla: è il gesto che si fa più spesso, e sta
          nello stesso punto in cui le voci di Myynd offrono «in lista» */}
      <Hov as="button"
        onClick={(e: MouseEvent) => { e.stopPropagation(); l.chiudi(c.id) }}
        title={t('Fatto')} aria-label={`${t('Fatto')}: ${c.testo}`}
        style={{
          flex: 'none', padding: '4px 11px', borderRadius: 99, border: '1px solid rgba(34,39,31,.2)',
          background: 'rgba(255,255,255,.7)', color: 'rgba(34,39,31,.72)', fontSize: 12,
          fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
          opacity: sopra ? 1 : 0, pointerEvents: sopra ? 'auto' : 'none', transition: 'opacity .15s'
        }}
        hover={{ borderColor: '#C4623B', color: '#8E3F1F' }}>{t('fatta')}</Hov>

      {attesa && <span style={PASTIGLIA}>{attesa}</span>}
    </div>
  )
}

/**
 * Una cosa della tua lista, in cima.
 *
 * Stessa card di quelle che nota lui — stesso vetro caldo, stesso titolo
 * grande, stessa fascia di bottoni in fondo — perché in cima ci va quello che
 * conta adesso, e quello che conta adesso può benissimo essere una cosa che ti
 * sei segnato tu.
 *
 * Quello che cambia sono i verbi. Una voce si risolve; un compito si chiude, si
 * affida, si rimanda o si toglie. Tutto da qui: la ragione per cui questa card
 * esiste è che il feed non deve mai mandarti da un'altra parte per finire una
 * cosa che sta guardando.
 */
function HeroCompito({ c, l, v }: { c: Compito; l: Lista; v: Vals }) {
  const [menu, setMenu] = useState(false)
  const [lungo, setLungo] = useState(false)
  const [risposta, setRisposta] = useState('')
  const pronto = c.stato === 'pronto'
  const chiede = c.stato === 'chiede'
  const delegato = c.stato === 'delegato'
  const testo = corpo(c)
  const tagliato = testo.length > 220

  /** Il «⋯»: quello che non si fa quasi mai, e che quindi non deve stare in vista. */
  const altro = [
    ...(delegato || pronto ? [] : [{ id: 'bozza', label: t('Fanne una bozza'), fai: () => l.delega(c.id, 'bozza') }]),
    ...(c.quando !== 'oggi' ? [{ id: 'oggi', label: t('Riportala a oggi'), fai: () => l.cambia(c.id, { quando: 'oggi' }) }] : []),
    ...(c.quando !== 'settimana' ? [{ id: 'sett', label: t('Rimandala a questa settimana'), fai: () => l.cambia(c.id, { quando: 'settimana' }) }] : []),
    ...(c.quando !== 'poi' ? [{ id: 'poi', label: t('Rimandala a prima o poi'), fai: () => l.cambia(c.id, { quando: 'poi' }) }] : [])
  ]

  const rispondi = () => { if (risposta.trim()) l.rispondi(c.id, risposta.trim()) }

  return (
    <div style={v.heroStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Glifo tipo="penso" dim={15} colore="#FFF7F0" />
        <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: '.02em' }}>{t('Da fare')}</span>
        <span style={{ fontSize: '12.5px', color: 'rgba(255,247,240,.85)' }}>{didascalia(c)}</span>
        {attesaDi(c) && (
          <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '.02em', color: '#FFF7F0', background: 'rgba(255,247,240,.2)', border: '1px solid rgba(255,247,240,.4)', borderRadius: 99, padding: '3px 10px' }}>
            {attesaDi(c)}
          </span>
        )}
      </div>

      <div style={{ fontSize: 22, lineHeight: 1.35, marginTop: 20, maxWidth: 600, textWrap: 'pretty', fontWeight: 500, overflowWrap: 'anywhere' }}>{c.testo}</div>

      {testo && (
        <div style={{ fontSize: '15.5px', lineHeight: 1.6, marginTop: 10, maxWidth: 600, color: 'rgba(255,247,240,.82)', textWrap: 'pretty', whiteSpace: 'pre-line' }}>
          {lungo ? testo : taglia(testo, 220)}
          {tagliato && (
            <Hov as="button" onClick={() => setLungo(x => !x)}
              style={{ border: 'none', background: 'none', padding: '0 0 0 6px', fontFamily: 'inherit', fontSize: '13.5px', color: 'rgba(255,247,240,.6)', cursor: 'pointer' }}
              hover={{ color: '#FFF7F0' }}>{lungo ? t('meno') : t('di più')}</Hov>
          )}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20 }}>
        {/* quello che si fa quasi sempre. Su una bozza pronta «Fatto» sarebbe
            una bugia: quello che chiudi lì è il testo che hai davanti, e va
            tenuto — è da lì che impara come scrivi */}
        <Hov as="button"
          onClick={() => (pronto ? l.chiudi(c.id, t('Va bene così.'), testo) : l.chiudi(c.id))}
          style={{ padding: '12px 26px', borderRadius: 99, border: 'none', background: '#FFF7F0', color: '#22271F', fontSize: 14, fontWeight: 500, boxShadow: '0 10px 24px rgba(30,20,14,.3)', cursor: 'pointer', fontFamily: 'inherit' }}
          hover={{ background: '#FFFFFF' }}>{pronto ? t('Va bene') : t('Fatto')}</Hov>

        <Hov as="button"
          onClick={() => (pronto ? l.delega(c.id, c.modo) : delegato ? l.richiama(c.id) : l.delega(c.id, 'tutto'))}
          style={{ padding: '12px 20px', borderRadius: 99, border: '1px solid rgba(255,247,240,.5)', background: 'none', color: '#FFF7F0', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}
          hover={{ background: 'rgba(255,247,240,.16)' }}>
          {pronto ? t('Rifallo') : delegato ? t('Richiamala') : t('Se ne occupa Myynd')}
        </Hov>

        {altro.length > 0 && (
          <div style={{ position: 'relative' }}>
            <Hov as="button" onClick={() => setMenu(m => !m)} title={t('Altro')}
              style={{ padding: '12px 15px', borderRadius: 99, border: '1px solid rgba(255,247,240,.28)', background: menu ? 'rgba(255,247,240,.16)' : 'none', color: 'rgba(255,247,240,.85)', fontSize: 15, lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit' }}
              hover={{ background: 'rgba(255,247,240,.16)', borderColor: 'rgba(255,247,240,.5)' }}>⋯</Hov>

            {menu && (
              <>
                <div onClick={() => setMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
                <div style={{
                  position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, zIndex: 21, minWidth: 210,
                  borderRadius: 16, background: '#FFFDF9', border: '1px solid rgba(255,255,255,.9)',
                  boxShadow: '0 24px 56px rgba(30,20,14,.34)', overflow: 'hidden', padding: 5,
                  animation: 'fadein .14s ease'
                }}>
                  {altro.map(a => (
                    <Hov key={a.id} onClick={() => { setMenu(false); a.fai() }}
                      style={{ display: 'block', padding: '9px 12px', borderRadius: 10, cursor: 'pointer', fontSize: '13.5px', color: '#22271F', whiteSpace: 'nowrap' }}
                      hover={{ background: 'rgba(196,98,59,.09)' }}>{a.label}</Hov>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <div style={{ flex: 1 }} />
        <Hov as="button" onClick={() => l.elimina(c.id)} title={t('Toglila')}
          style={{ padding: '12px 4px', border: 'none', background: 'none', color: 'rgba(255,247,240,.6)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
          hover={{ color: '#FFFFFF' }}>{t('Toglila')}</Hov>
      </div>

      {/* una domanda senza il rigo per rispondere è un vicolo cieco: qui sotto
          si risponde, e il lavoro riparte da solo */}
      {chiede && (
        <div style={{ display: 'flex', gap: 9, marginTop: 14 }}>
          <input
            className="scuro"
            value={risposta}
            onChange={e => setRisposta(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') rispondi() }}
            aria-label={t('Rispondigli')}
            placeholder={t('Rispondigli e ci riprova')}
            style={{
              flex: 1, minWidth: 0, padding: '11px 15px', borderRadius: 13,
              border: '1px solid rgba(255,247,240,.34)', background: 'rgba(20,14,10,.24)',
              color: '#FFF7F0', fontSize: '13.5px', fontFamily: 'inherit', outline: 'none'
            }} />
          <button onClick={rispondi} disabled={!risposta.trim()} style={{
            flex: 'none', padding: '11px 20px', borderRadius: 99, border: 'none',
            background: risposta.trim() ? '#FFF7F0' : 'rgba(255,247,240,.22)',
            color: risposta.trim() ? '#22271F' : 'rgba(255,247,240,.7)',
            fontSize: '13.5px', fontWeight: 500, fontFamily: 'inherit',
            cursor: risposta.trim() ? 'pointer' : 'default'
          }}>{t('Manda')}</button>
        </div>
      )}
    </div>
  )
}

export function Myynd({ v, lista }: { v: Vals; lista?: Lista }) {
  /**
   * Quale cosa della tua lista sta in cima.
   *
   * Vuoto vuol dire «decidi tu»: se lui ha qualcosa da dire ci va la sua voce,
   * altrimenti ci va la prima della lista — perché una pagina che si apre su
   * niente mentre hai sei cose da fare è una pagina che non ti guarda. Si
   * riempie cliccando una riga, e si svuota cliccando una delle sue.
   */
  const [inCima, setInCima] = useState<string | null>(null)
  const compiti = lista?.compiti ?? []
  const inTesta = compiti.find(c => c.id === inCima) ?? (v.hasHero ? null : compiti[0] ?? null)
  // quando in cima ci va una cosa tua, la voce che stava lì scende fra le righe
  // invece di sparire: è ancora aperta, e deve restare raggiungibile
  const voci = inTesta && v.rigaHero ? [v.rigaHero, ...v.resto] : v.resto
  const righe = [
    ...compiti.filter(c => c.id !== inTesta?.id).slice(0, 6).map(c => ({
      chiave: c.id,
      nodo: <RigaCompito c={c} l={lista!} apri={() => setInCima(c.id)} />
    })),
    ...voci.map(r => ({
      chiave: r.id,
      // cliccare una sua voce le ridà il posto in cima: un solo gesto, e vale
      // per tutte e due le specie di riga
      nodo: <Riga riga={{ ...r, onPromote: () => { setInCima(null); r.onPromote() } }} />
    }))
  ]

  return (
    <div style={{ width: 760, maxWidth: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Titolo sopra, data sotto — identico alla finestra dell'app. Sono due
          facce della stessa cosa e devono aprirsi con la stessa immagine. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '52px 4px 26px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{
            fontSize: 40, lineHeight: 1.15, letterSpacing: '-.032em', maxWidth: 600,
            margin: 0, padding: '0 0 0 3px', fontWeight: 400, textWrap: 'pretty'
          }}>{v.feedVuoto && (lista?.compiti.length ?? 0) > 0
            ? frasi.daFare(lista!.compiti.length)
            : v.headline}</h1>
          <div style={{
            marginTop: 9, paddingLeft: 3, fontSize: '12.5px', fontWeight: 500, letterSpacing: '.02em',
            color: 'rgba(34,39,31,.5)', textTransform: 'capitalize'
          }}>{v.oggi}</div>
        </div>
        <Hov as="a" href="#" onClick={v.goConn}
          style={{ flex: 'none', marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#2F4A33', background: 'rgba(255,255,255,.7)', border: '1px solid rgba(255,255,255,.9)', borderRadius: 99, padding: '5px 11px' }}
          hover={{ background: '#FFFFFF' }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: v.connCount ? '#5C7660' : '#B0705A' }} />
          {frasi.fontiEDocumenti(v.connCount, v.totaleDocumenti.toLocaleString(lingua() === 'en' ? 'en-GB' : 'it-IT'))}
        </Hov>
      </div>

      {/*
        Il mondo, prima del lavoro.

        Sta fra la data e la card in cima, e non è un caso: sopra alla card ci
        vuole perché la mattina è la prima cosa che si guarda, e *sotto* al
        titolo perché non deve rubare il posto a quello che oggi ti riguarda
        davvero. Tre righe piatte in mezzo a due superfici di vetro: si legge in
        un minuto, e l'occhio arriva comunque alla card scura subito dopo.

        Se non c'è niente da leggere non c'è neanche la fascia: una cornice
        vuota in cima alla prima pagina tutti i giorni sarebbe la cosa peggiore
        che potevamo aggiungere qui.
      */}
      <Rassegna />

      {inTesta && <HeroCompito c={inTesta} l={lista!} v={v} />}

      {!inTesta && v.hasHero && (
        <div style={v.heroStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Glifo tipo="penso" dim={15} colore="#FFF7F0" />
            <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: '.02em' }}>{t(v.heroTipo)}</span>
            <span style={{ fontSize: '12.5px', color: 'rgba(255,247,240,.85)' }}>{v.heroFonte}{v.heroOra ? ` · ${v.heroOra}` : ''}</span>
          </div>

          <div style={{ fontSize: 22, lineHeight: 1.35, marginTop: 20, maxWidth: 600, textWrap: 'pretty', fontWeight: 500, overflowWrap: 'anywhere' }}>{v.heroTitolo}</div>
          <div style={{ fontSize: '15.5px', lineHeight: 1.6, marginTop: 10, maxWidth: 600, color: 'rgba(255,247,240,.82)', textWrap: 'pretty', whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
            {v.heroTesto}
            {v.heroTagliato && (
              <Hov as="button" onClick={v.heroToggle}
                style={{ border: 'none', background: 'none', padding: '0 0 0 6px', fontFamily: 'inherit', fontSize: '13.5px', color: 'rgba(255,247,240,.6)', cursor: 'pointer' }}
                hover={{ color: '#FFF7F0' }}>{v.heroLong ? t('meno') : t('di più')}</Hov>
            )}
          </div>

          {v.heroHaDoc && (
            <Hov onClick={v.apriDoc}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 16, padding: '4px 2px', border: 'none', background: 'none', cursor: 'pointer', color: 'rgba(255,247,240,.75)', alignSelf: 'flex-start' }}
              hover={{ color: '#FFF7F0' }}>
              <IconDoc size={16} style={{ flex: 'none', color: '#FFF7F0' }} />
              <span style={{ fontSize: '13px' }}>{t('Apri il documento')}</span>
            </Hov>
          )}

          {/*
            Una fascia sola di azioni, non tre.

            Prima c'erano il bottone Fatto, una riga di quattro pastiglie e un
            campo di testo, tutti visibili insieme — e «Già fatto» faceva la
            stessa cosa del bottone Fatto due centimetri più in su. Adesso c'è
            quello che si fa quasi sempre, e un «⋯» per il resto.
          */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20, position: 'relative' }}>
            <Hov as="button" onClick={v.heroPrimary}
              style={{ padding: '12px 26px', borderRadius: 99, border: 'none', background: '#FFF7F0', color: '#22271F', fontSize: 14, fontWeight: 500, boxShadow: '0 10px 24px rgba(30,20,14,.3)', cursor: 'pointer', fontFamily: 'inherit' }}
              hover={{ background: '#FFFFFF' }}>{t('Fatto')}</Hov>
            <Hov as="button" onClick={v.heroAsk}
              style={{ padding: '12px 20px', borderRadius: 99, border: '1px solid rgba(255,247,240,.5)', background: 'none', color: '#FFF7F0', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}
              hover={{ background: 'rgba(255,247,240,.16)' }}>{t('Chiedi a Myynd')}</Hov>

            <Hov as="button" onClick={v.apriMenu} title={t('Altro')}
              style={{ padding: '12px 15px', borderRadius: 99, border: '1px solid rgba(255,247,240,.28)', background: v.menuAperto ? 'rgba(255,247,240,.16)' : 'none', color: 'rgba(255,247,240,.85)', fontSize: 15, lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit' }}
              hover={{ background: 'rgba(255,247,240,.16)', borderColor: 'rgba(255,247,240,.5)' }}>⋯</Hov>

            <div style={{ flex: 1 }} />
            <Hov as="button" onClick={v.heroSkip} title={t('Rimandala in fondo')}
              style={{ padding: '12px 4px', border: 'none', background: 'none', color: 'rgba(255,247,240,.6)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
              hover={{ color: '#FFFFFF' }}>{t('Più tardi')}</Hov>

            {v.menuAperto && (
              <>
                <div onClick={v.chiudiMenu} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
                <div style={{
                  position: 'absolute', bottom: 'calc(100% + 8px)', left: 178, zIndex: 21, minWidth: 190,
                  borderRadius: 16, background: '#FFFDF9', border: '1px solid rgba(255,255,255,.9)',
                  boxShadow: '0 24px 56px rgba(30,20,14,.34)', overflow: 'hidden', padding: 5,
                  animation: 'fadein .14s ease'
                }}>
                  {v.correzioni.map(c => (
                    <Hov key={c.id} onClick={c.onClick}
                      style={{ display: 'block', padding: '9px 12px', borderRadius: 10, cursor: 'pointer', fontSize: '13.5px', color: '#22271F' }}
                      hover={{ background: 'rgba(196,98,59,.09)' }}>{c.label}</Hov>
                  ))}
                </div>
              </>
            )}
          </div>

          {v.scriviAperto && (
            <div style={{ display: 'flex', gap: 9, marginTop: 14 }}>
              <input
                autoFocus
                className="scuro"
                value={v.risposta}
                onChange={e => v.setRisposta(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); v.rispondiAlHero() }
                  if (e.key === 'Escape') v.chiudiScrivi()
                }}
                placeholder={t("L'ho mandato lunedì col listino nuovo")}
                style={{
                  flex: 1, minWidth: 0, padding: '11px 15px', borderRadius: 13,
                  border: '1px solid rgba(255,247,240,.34)', background: 'rgba(20,14,10,.24)',
                  color: '#FFF7F0', fontSize: '13.5px', fontFamily: 'inherit', outline: 'none'
                }} />
              <button onClick={v.rispondiAlHero} disabled={v.rispondendo || !v.risposta.trim()} style={{
                flex: 'none', padding: '11px 20px', borderRadius: 99, border: 'none',
                background: v.risposta.trim() && !v.rispondendo ? '#FFF7F0' : 'rgba(255,247,240,.22)',
                color: v.risposta.trim() && !v.rispondendo ? '#22271F' : 'rgba(255,247,240,.7)',
                fontSize: '13.5px', fontWeight: 500, fontFamily: 'inherit',
                cursor: v.risposta.trim() && !v.rispondendo ? 'pointer' : 'default'
              }}>{v.rispondendo ? t('Segno…') : t('Manda')}</button>
              <Hov as="button" onClick={v.chiudiScrivi} title={t('Annulla (Esc)')}
                style={{ flex: 'none', padding: '11px 6px', border: 'none', background: 'none', color: 'rgba(255,247,240,.55)', fontSize: 18, cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1 }}
                hover={{ color: '#FFF7F0' }}>×</Hov>
            </div>
          )}
        </div>
      )}

      <Domanda v={v} />


      {righe.length > 0 && (
        <div style={{ flex: 'none', marginTop: 16, borderRadius: '22px 26px 20px 24px', background: 'rgba(255,253,249,.66)', backdropFilter: 'blur(24px) saturate(1.4)', WebkitBackdropFilter: 'blur(24px) saturate(1.4)', border: '1px solid rgba(255,255,255,.7)', boxShadow: '0 22px 52px rgba(84,64,44,.11)', transform: 'rotate(.2deg)', overflow: 'hidden' }}>
          {/* le tue righe stanno DENTRO la stessa lista delle sue, vestite
              uguali. Il filo va per posizione, non per specie: la prima non ha
              bordo sopra e tutte le altre sì — chiunque sia la prima. */}
          {righe.map((r, i) => (
            <div key={r.chiave} style={{ borderTop: i === 0 ? 'none' : '1px solid rgba(34,39,31,.09)' }}>
              {r.nodo}
            </div>
          ))}
        </div>
      )}

      {v.feedVuoto && !(lista?.compiti.length) && <Vuoto v={v} />}

      {/* niente elenco delle fatte qui: quello che hai chiuso è chiuso.
          Il conto restava lì a crescere — «Done · 14» — come un cassetto che
          non si svuota mai. La storia resta nel database, non sullo schermo. */}
    </div>
  )
}

/**
 * Quando è lui a chiedere.
 *
 * Deliberatamente diversa da una voce del feed: chiara, ma non urgente. Una
 * voce è lavoro che ti aspetta; questa è un collega che alza la testa dalla
 * scrivania. Se avesse l'aria di un compito, in tre giorni la salteresti come
 * si saltano i compiti — e allora tanto varrebbe non chiedere.
 *
 * Sta sotto la card in cima, mai sopra: non deve mettersi in mezzo al lavoro
 * vero. Ma quando non c'è lavoro resta l'unica cosa sullo schermo, ed è il
 * momento migliore per chiedere qualcosa a qualcuno.
 */
function Domanda({ v }: { v: Vals }) {
  // Dopo la risposta, l'esito prende il posto della domanda e resta lì. Non è
  // un avviso che sfarfalla: è la prova che rispondere è servito a qualcosa.
  if (v.esitoDom) {
    return (
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 13, marginTop: 16, padding: '18px 20px',
        borderRadius: '20px 22px 18px 22px', border: '1px solid rgba(126,156,130,.4)',
        background: 'rgba(126,156,130,.12)', animation: 'fadein .3s ease'
      }}>
        <IconSpunta style={{ flex: 'none', marginTop: 1 }} />
        <div style={{ flex: 1, minWidth: 0, fontSize: '15px', lineHeight: 1.55, color: '#22271F', textWrap: 'pretty' }}>
          {t(v.esitoDom)}
        </div>
        <Hov as="button" onClick={v.chiudiEsito} title={t('Chiudi')}
          style={{ flex: 'none', border: 'none', background: 'none', color: 'rgba(34,39,31,.4)', fontSize: 17, lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit', padding: 2 }}
          hover={{ color: '#22271F' }}>×</Hov>
      </div>
    )
  }

  if (!v.domanda) return null

  return (
    <div style={{
      /*
        Sottile, e di vetro.

        La versione con la card occupava l'altezza di un blocco per contenere
        una riga di testo. Questa è una fascia: la domanda, il rigo su cui
        rispondere e la freccia stanno tutti sulla stessa linea, e in verticale
        costa un terzo.

        Il gradiente va al contrario di quello della card sopra — quella parte
        opaca in alto a sinistra e si spegne in basso a destra, questa fa
        l'inverso: quasi trasparente dove comincia, densa dove finisce. Le due
        superfici si passano la luce invece di ripeterla.
      */
      /*
        Lo z-index del pannello «perché» non bastava: questa fascia ha un
        backdrop-filter, e un filtro crea un contesto di impilamento — quindi
        il 25 del pannello valeva solo *dentro* la fascia, e la card che viene
        dopo, essendo un fratello successivo, gli finiva sopra. Si alza la
        fascia intera, non il figlio.
      */
      position: 'relative', zIndex: 12, display: 'flex', alignItems: 'center', gap: 13,
      margin: '14px 0 4px', padding: '10px 14px 10px 15px',
      borderRadius: '16px 20px 16px 18px',
      background: 'linear-gradient(258deg, rgba(255,253,249,.82) 0%, rgba(255,253,249,.46) 55%, rgba(255,253,249,.16) 100%)',
      backdropFilter: 'blur(22px) saturate(1.7)', WebkitBackdropFilter: 'blur(22px) saturate(1.7)',
      border: '1px solid rgba(255,255,255,.55)',
      borderLeft: '2px solid rgba(196,98,59,.55)',
      boxShadow: '0 10px 30px -14px rgba(84,64,44,.3), inset 0 1px 0 rgba(255,255,255,.5)',
      animation: 'fadein .3s ease'
    }}>
      <Marchio dim={14} animato={false} />

      <span style={{ fontSize: '15px', color: '#22271F', flex: 'none', maxWidth: 300, textWrap: 'pretty', lineHeight: 1.3 }}>
        {v.domanda.testo}
      </span>

      {/* il rigo su cui si risponde, non una casella */}
      <input
        value={v.rispostaDom}
        onChange={e => v.setRispostaDom(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') v.rispondiADomanda()
          if (e.key === 'Escape') v.lasciaCadere()
        }}
        placeholder={t('Bastano cinque parole')}
        style={{
          flex: 1, minWidth: 90, padding: '5px 2px', border: 'none',
          borderBottom: '1px solid rgba(34,39,31,.2)', background: 'none',
          color: '#22271F', fontSize: '14px', fontFamily: 'inherit', outline: 'none'
        }} />

      <Hov as="button" onClick={v.rispondiADomanda} disabled={!v.rispostaDom.trim()} title={t('Rispondi')}
        style={{
          flex: 'none', border: 'none', background: 'none', padding: '4px 2px',
          fontFamily: 'inherit', fontSize: 16, lineHeight: 1,
          color: v.rispostaDom.trim() ? '#8E3F1F' : 'rgba(34,39,31,.25)',
          cursor: v.rispostaDom.trim() ? 'pointer' : 'default'
        }}
        hover={v.rispostaDom.trim() ? { color: '#C4623B' } : {}}>→</Hov>

      <Hov as="button" onClick={v.apriSpunto} title={t('Perché me lo chiedi?')}
        style={{ flex: 'none', border: 'none', background: 'none', padding: '4px 3px', fontFamily: 'inherit', fontSize: '13px', color: 'rgba(34,39,31,.34)', cursor: 'pointer' }}
        hover={{ color: '#8E3F1F' }}>?</Hov>

      <Hov as="button" onClick={v.lasciaCadere} title={t('Lascia perdere: non te lo richiedo')}
        style={{ flex: 'none', border: 'none', background: 'none', padding: '4px 3px', color: 'rgba(34,39,31,.28)', fontSize: 15, lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit' }}
        hover={{ color: '#22271F' }}>×</Hov>

      {v.spuntoAperto && (
        <div style={{
          position: 'absolute', zIndex: 25, marginTop: 4, top: '100%', left: 15, maxWidth: 420,
          padding: '11px 14px', borderRadius: 13, background: '#FFFDF9',
          border: '1px solid rgba(255,255,255,.9)', boxShadow: '0 18px 44px rgba(30,20,14,.24)',
          animation: 'fadein .16s ease'
        }}>
          <div style={{ fontSize: '12px', color: 'rgba(34,39,31,.5)', lineHeight: 1.5, marginBottom: 5 }}>
            {t('Hai tolto di mezzo queste senza dirmi perché:')}
          </div>
          {v.domanda.spunto.slice(0, 4).map((x, i) => (
            <div key={i} style={{ fontSize: '12px', color: 'rgba(34,39,31,.68)', lineHeight: 1.65 }}>— {x}</div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Il fuoco: una riga che vale per tutte le letture che verranno.
 *
 * Diversa dalla risposta a una voce — quella riguarda una cosa sola e la
 * chiude, questa dice a Myynd dove guardare da qui in avanti. Sta in alto e
 * discreta perché è una scelta che si fa di rado e si cambia ancora più di rado.
 */

/** Quando non c'è niente: dice cosa manca, non finge. */
function Vuoto({ v }: { v: Vals }) {
  const senzaFonti = v.connCount === 0
  const senzaDocumenti = v.totaleDocumenti === 0
  // Prima della risposta non si dice niente; dopo un errore si dice l'errore.
  // Prima questa carta diceva «La tua mente è ancora vuota» anche a un 500.
  if (!v.feedCaricato) return null
  if (v.guastoFeed) {
    return (
      <div style={{ flex: 'none', borderRadius: 24, background: 'rgba(255,253,249,.66)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,.75)', padding: '32px 28px' }}>
        <div style={{ fontSize: 17, lineHeight: 1.55, color: 'rgba(34,39,31,.82)', textWrap: 'pretty', overflowWrap: 'anywhere' }}>{v.guastoFeed}</div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={v.ricaricaFeed} style={BOTTONE}>{t('Riprova')}</button>
        </div>
      </div>
    )
  }
  return (
    <div style={{ flex: 'none', borderRadius: 24, background: 'rgba(255,253,249,.66)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,.75)', padding: '32px 28px' }}>
      {/* Una riga, non tre. Quello che c'era prima spiegava anche come funziona
          la memoria delle risposte — vero, e non è il momento di dirlo: chi
          guarda uno schermo vuoto vuole sapere cosa fare adesso. */}
      <div style={{ fontSize: 17, lineHeight: 1.55, color: 'rgba(34,39,31,.82)', textWrap: 'pretty' }}>
        {senzaFonti
          ? t('Non hai collegato niente.')
          : senzaDocumenti
            ? t('Non ho ancora letto niente.')
            : !v.claudeOn
              ? t('Serve Claude per scegliere cosa conta.')
              : v.haFatte
                ? t('Non è rimasto niente.')
                : t('Niente da segnalare.')}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        {senzaFonti || !v.claudeOn ? (
          <button onClick={v.goConn} style={BOTTONE}>{t('Vai ai connettori')}</button>
        ) : senzaDocumenti ? (
          v.sincronizzando
            ? <Stato tipo="leggo" testo={v.sincronizzando} />
            : <button onClick={v.sincronizza} style={BOTTONE}>{t('Leggi adesso')}</button>
        ) : (
          v.generando
            ? <Stato tipo="cerco" testo={t('Leggo tutto e scelgo cosa conta')} />
            : <button onClick={v.genera} style={BOTTONE}>{t('Fai una lettura')}</button>
        )}
      </div>
    </div>
  )
}

const BOTTONE: React.CSSProperties = {
  padding: '11px 20px', borderRadius: 99, border: 'none',
  background: 'linear-gradient(120deg,#C4623B,#7E9C82)', color: '#FFF7F0',
  fontSize: '13.5px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit'
}
