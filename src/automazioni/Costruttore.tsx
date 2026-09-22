// I binari: un'automazione composta a pezzi, con le mani.
//
// Una ricetta ha quattro campi — quando, cosa legge, cosa ne fa, dove lo
// mette — e qui sono quattro tratti di un binario solo, dall'alto in basso.
// Ogni tratto si riempie toccando o trascinando: le fonti sono tessere che si
// prendono dalla tavolozza e si lasciano cadere nel tratto «legge»; i
// passaggi in mezzo si prendono per la maniglia e si mettono nell'ordine che
// serve. Non ci sono nodi numerati né un diagramma: c'è una frase, in cima,
// che si riscrive da sola mentre si compone, e i pezzi che la formano.
//
// Un colore solo, il rame, e solo dove distingue: il tratto su cui si sta
// lavorando, il posto in cui si può lasciare cadere una tessera, l'azione
// primaria. Tutto il resto è inchiostro su avorio, ad alto contrasto. Le
// tessere portano il segno della loro fonte, come nelle Fonti — colorato se
// è collegata, grigio se no — e nient'altro è colorato.

import { useEffect, useRef, useState, type DragEvent } from 'react'
import type { Attrezzo, Passo, RicettaComposta } from '../api'
import { t } from '../lingua'
import { ConnectorIcon, connectorPerAttrezzo } from '../components/ConnectorIcon'

const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato']
const ORE = Array.from({ length: 24 }, (_, i) => i)
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`

/** Quando parte, detto in una frase corta. */
export function quandoFrase(q: RicettaComposta['quando']): string {
  if ('quandoArriva' in q) return t('quando arriva qualcosa di nuovo')
  if (q.ogni === 'giorno') return `${t('ogni giorno alle')} ${hh(q.ora)}`
  return `${t('ogni')} ${t(GIORNI[q.giorno] ?? 'lunedì')} ${t('alle')} ${hh(q.ora)}`
}

/**
 * La ricetta letta come una frase.
 *
 * È la riga in cima ai binari, e si riscrive a ogni tocco: è il modo di
 * controllare che i pezzi messi insieme dicano davvero quello che si voleva,
 * senza rileggere quattro campi.
 */
export function fraseDi(r: RicettaComposta, catalogo: Attrezzo[]): string {
  const fonti = (r.attrezzi ?? []).map(n => catalogo.find(a => a.nome === n)?.etichetta ?? n)
  const legge = fonti.length ? `${t('legge')} ${fonti.join(', ')}` : t('guarda quello che ha già letto')
  const cerca = r.guarda.cerca?.trim() ? ` ${t('cercando')} «${r.guarda.cerca.trim()}»` : ''
  const passi = r.passi?.length ? `, ${r.passi.length === 1 ? t('un passaggio in mezzo') : `${r.passi.length} ${t('passaggi in mezzo')}`}` : ''
  const modo = r.metti.modo === 'bozza' ? t('scrive anche la bozza') : r.metti.modo === 'tutto' ? t('fa tutto il lavoro') : r.metti.modo === 'prompt' ? t('prepara il prompt') : t('mette una riga in lista')
  const dove = r.metti.inLista === 'oggi' ? t('in Oggi') : r.metti.inLista === 'settimana' ? t('in Questa settimana') : t('in Prima o poi')
  const per = r.metti.perDocumento ? `, ${t('una per documento')}` : ''
  const q = quandoFrase(r.quando)
  return `${q.charAt(0).toUpperCase()}${q.slice(1)}, ${legge}${cerca}${passi}, ${t('e')} ${modo} ${dove}${per}.`
}

function Tratto({ eyebrow, children, attivo }: { eyebrow: string; children: React.ReactNode; attivo?: boolean }) {
  return (
    <section className={`auto-tratto${attivo ? ' attivo' : ''}`}>
      <div className="auto-tratto-eyebrow"><span /><b>{eyebrow}</b></div>
      <div className="auto-tratto-body">{children}</div>
    </section>
  )
}

function Pillole<T extends string>({ valore, scegli, voci, etichetta }: { valore: T; scegli: (v: T) => void; voci: [T, string][]; etichetta: string }) {
  return (
    <div className="auto-pillole" role="radiogroup" aria-label={etichetta}>
      {voci.map(([v, testo]) => (
        <button key={v} type="button" role="radio" aria-checked={valore === v} className={`auto-pillola${valore === v ? ' on' : ''}`} onClick={() => scegli(v)}>{testo}</button>
      ))}
    </div>
  )
}

const FONTE = 'fonte:'
const PASSO = 'passo:'
const dato = (e: DragEvent, prefisso: string) => {
  const d = e.dataTransfer.getData('text/plain')
  return d.startsWith(prefisso) ? d.slice(prefisso.length) : ''
}
const porta = (e: DragEvent, prefisso: string) => Array.from(e.dataTransfer.types).includes('text/plain') && (e.dataTransfer.getData('text/plain') || '').startsWith(prefisso)

export function Costruttore({ r, cambia, catalogo, cartelle, coda }: {
  r: RicettaComposta
  cambia: (r: RicettaComposta) => void
  catalogo: Attrezzo[]
  /** Le cartelle del desktop collegate: le sole in cui Claude Code può lavorare. */
  cartelle: string[]
  /** Quello che va in fondo al tratto «legge»: l'anteprima, quando la ricetta è salvata. */
  coda?: React.ReactNode
}) {
  const [sopra, setSopra] = useState(false)
  /** Si sta cercando una fonte con la «@»: il tratto si accende come quando si trascina. */
  const [cercaFonte, setCercaFonte] = useState(false)
  const [trascino, setTrascino] = useState<string | null>(null)
  const [aperto, setAperto] = useState<string | null>(null)
  const suoi = r.attrezzi ?? []
  const passi = r.passi ?? []
  const q = r.quando
  const cadenza = 'quandoArriva' in q ? 'arrivo' : q.ogni
  const ora = 'quandoArriva' in q ? 8 : q.ora
  const giorno = 'quandoArriva' in q || q.ogni !== 'settimana' ? 1 : q.giorno

  const aggiungi = (nome: string) => { if (!suoi.includes(nome) && catalogo.some(a => a.nome === nome)) cambia({ ...r, attrezzi: [...suoi, nome] }) }
  const togli = (nome: string) => cambia({ ...r, attrezzi: suoi.filter(x => x !== nome) })
  const cadenzaScelta = (c: 'arrivo' | 'giorno' | 'settimana') => cambia({ ...r, quando: c === 'arrivo' ? { quandoArriva: true } : c === 'giorno' ? { ogni: 'giorno', ora } : { ogni: 'settimana', giorno, ora } })
  const passiCambia = (p: Passo[]) => cambia({ ...r, passi: p })
  const nuovoPasso = (tipo: Passo['tipo']) => { const id = crypto.randomUUID(); passiCambia([...passi, { id, tipo, testo: '' }]); setAperto(id) }
  const sposta = (id: string, primaDi: string | null) => {
    const da = passi.findIndex(p => p.id === id)
    if (da < 0) return
    const senza = passi.filter(p => p.id !== id)
    const a = primaDi ? senza.findIndex(p => p.id === primaDi) : senza.length
    senza.splice(a < 0 ? senza.length : a, 0, passi[da])
    passiCambia(senza)
  }
  const vuoleCartella = suoi.includes('claude.lavora')

  return (
    <div className="auto-binari">
      <p className="auto-frase">{fraseDi(r, catalogo)}</p>

      <Tratto eyebrow={t('Quando')}>
        <Pillole etichetta={t('Quando gira')} valore={cadenza} scegli={cadenzaScelta} voci={[
          ['arrivo', t('Quando arriva qualcosa')], ['giorno', t('Ogni giorno')], ['settimana', t('Ogni settimana')]
        ]} />
        {cadenza !== 'arrivo' && (
          <div className="auto-orario">
            {cadenza === 'settimana' && (
              <select aria-label={t('Che giorno')} value={giorno} onChange={e => cambia({ ...r, quando: { ogni: 'settimana', giorno: Number(e.target.value), ora } })}>
                {[1, 2, 3, 4, 5, 6, 0].map(g => <option key={g} value={g}>{t(GIORNI[g])}</option>)}
              </select>
            )}
            <span>{t('alle')}</span>
            <select aria-label={t('A che ora')} value={ora} onChange={e => cambia({ ...r, quando: cadenza === 'giorno' ? { ogni: 'giorno', ora: Number(e.target.value) } : { ogni: 'settimana', giorno, ora: Number(e.target.value) } })}>
              {ORE.map(h => <option key={h} value={h}>{hh(h)}</option>)}
            </select>
          </div>
        )}
      </Tratto>

      {/* Una riga, non quindici tessere.
          «Rather than putting all of the connectors, just tell me to put an @
          symbol and to tag it. Simply, it's too clustered. There's too much.»
          La tavolozza stendeva l'intero catalogo — email, il Mac, Notion,
          Granola, Note, conversazioni, Slack, Drive, SharePoint, Dropbox,
          WhatsApp, GitHub, agenda, chat, Claude Code — su tre righe di
          pastiglie, sopra a una zona di caduta vuota: quattro righe per dire
          «da dove leggo». Adesso è una riga sola: le fonti scelte, e un campo
          in cui si scrive «@». Si può ancora lasciarci cadere una tessera —
          la zona di caduta è il campo stesso — ma non c'è più niente da
          leggere prima di sapere cosa si vuole. */}
      <Tratto eyebrow={t('Legge')} attivo={sopra || cercaFonte}>
        <MenzioneFonti catalogo={catalogo} scelte={suoi} aggiungi={aggiungi} togli={togli}
          sopra={sopra} setSopra={setSopra} setCerca={setCercaFonte}
          suDrop={e => { e.preventDefault(); setSopra(false); const n = dato(e, FONTE); if (n) aggiungi(n) }}
          suSopra={e => { if (porta(e, FONTE)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; if (!sopra) setSopra(true) } }} />
        <label className="auto-campo">
          <span>{t('Con queste parole')}</span>
          <input value={r.guarda.cerca ?? ''} onChange={e => cambia({ ...r, guarda: { ...r.guarda, cerca: e.target.value } })}
            placeholder={t('preventivo, offerta, in attesa…')} />
          <small>{t('Le parole di chi ha scritto quei documenti, nella loro lingua. Vuoto: solo quello che è arrivato dall’ultima volta.')}</small>
        </label>
        {vuoleCartella && (
          <label className="auto-campo">
            <span>{t('In che cartella lavora Claude Code')}</span>
            <select value={r.cartella ?? ''} onChange={e => cambia({ ...r, cartella: e.target.value })}>
              <option value="">{t('— scegline una —')}</option>
              {cartelle.map(c => <option key={c} value={c}>{c}</option>)}
              {r.cartella && !cartelle.includes(r.cartella) && <option value={r.cartella}>{r.cartella}</option>}
            </select>
          </label>
        )}
        {coda}
      </Tratto>

      {passi.map((p, i) => (
        <Tratto key={p.id} eyebrow={p.tipo === 'condizione' ? t('Solo se') : t('Poi')} attivo={trascino === p.id}>
          <div className={`auto-passo${trascino === p.id ? ' trascinato' : ''}`}
            draggable
            onDragStart={e => { e.dataTransfer.setData('text/plain', PASSO + p.id); e.dataTransfer.effectAllowed = 'move'; setTrascino(p.id) }}
            onDragEnd={() => setTrascino(null)}
            onDragOver={e => { if (porta(e, PASSO)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } }}
            onDrop={e => { e.preventDefault(); const id = dato(e, PASSO); setTrascino(null); if (id && id !== p.id) sposta(id, p.id) }}>
            <span className="auto-maniglia" aria-hidden="true" title={t('Trascina per riordinare')}>⋮⋮</span>
            {aperto === p.id || !p.testo
              ? <textarea rows={3} autoFocus={aperto === p.id} aria-label={p.tipo === 'condizione' ? t('Condizione') : t('Istruzione')} maxLength={4000}
                  placeholder={p.tipo === 'condizione' ? t('continua solo se c’è una richiesta che aspetta una risposta…') : t('estrai le scadenze e raggruppale per progetto…')}
                  value={p.testo} onBlur={() => setAperto(null)} onFocus={() => setAperto(p.id)}
                  onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setAperto(null) } }}
                  onChange={e => passiCambia(passi.map(x => x.id === p.id ? { ...x, testo: e.target.value } : x))} />
              : <button type="button" className="auto-passo-testo" onClick={() => setAperto(p.id)} aria-label={`${t('Modifica')}: ${p.testo}`}>{p.testo}</button>}
            <div className="auto-passo-comandi">
              <button type="button" aria-label={t('Sposta su')} disabled={i === 0} onClick={() => sposta(p.id, passi[i - 1]?.id ?? null)}>↑</button>
              <button type="button" aria-label={t('Sposta giù')} disabled={i === passi.length - 1} onClick={() => sposta(p.id, passi[i + 2]?.id ?? null)}>↓</button>
              <button type="button" aria-label={t('Rimuovi passo')} onClick={() => passiCambia(passi.filter(x => x.id !== p.id))}>×</button>
            </div>
          </div>
        </Tratto>
      ))}
      <div className="auto-aggiungi-passo">
        <button type="button" disabled={passi.length >= 6} onClick={() => nuovoPasso('condizione')}>+ {t('Solo se…')}</button>
        <button type="button" disabled={passi.length >= 6} onClick={() => nuovoPasso('trasforma')}>+ {t('Poi rielabora…')}</button>
        <span>{passi.length}/6</span>
      </div>

      <Tratto eyebrow={t('Fa')}>
        <textarea className="auto-fai" rows={4} aria-label={t('Cosa deve farne')} value={r.fai} maxLength={4000}
          placeholder={t('Dimmi quali preventivi sono ancora senza risposta: chi, cosa, da quanto. Se non ce n’è, dillo e basta.')}
          onChange={e => cambia({ ...r, fai: e.target.value })} />
        <Pillole etichetta={t('Quanto fa')} valore={r.metti.modo ?? 'io'} scegli={m => cambia({ ...r, metti: { ...r.metti, modo: m } })} voci={[
          ['io', t('Mette una riga')], ['bozza', t('Scrive anche la bozza')], ['tutto', t('Fa tutto il lavoro')], ['prompt', t('Prepara il prompt')]
        ]} />
      </Tratto>

      <Tratto eyebrow={t('Mette')}>
        <Pillole etichetta={t('In che lista')} valore={r.metti.inLista} scegli={l => cambia({ ...r, metti: { ...r.metti, inLista: l } })} voci={[
          ['oggi', t('Oggi')], ['settimana', t('Questa settimana')], ['poi', t('Prima o poi')]
        ]} />
        <label className="auto-spunta">
          <input type="checkbox" checked={!!r.metti.perDocumento} onChange={e => cambia({ ...r, metti: { ...r.metti, perDocumento: e.target.checked || undefined } })} />
          <span>{t('Una riga per ogni documento, non una riga con l’elenco')}</span>
        </label>
      </Tratto>
    </div>
  )
}

/**
 * Le fonti, in una riga: quelle scelte, e la «@» per aggiungerne.
 *
 * «Just tell me to put an @ symbol and to tag it.» È lo stesso gesto della
 * casella a parole (`Chiocciola.tsx`), portato sui binari: si scrive «@», si
 * legge un elenco corto di quello che Myynd sa aprire, si sceglie, e resta
 * una pastiglia. Il catalogo intero non sta più in pagina — si guarda solo
 * quando lo si chiede — e quello che prima erano quattro righe adesso è una.
 *
 * Quello che non cambia: si può ancora *lasciarci cadere* una tessera
 * trascinata da un'altra parte, perché il campo è anche la zona di caduta; e
 * una fonte non collegata si vede lo stesso, con scritto che va collegata,
 * perché è la spiegazione di un'automazione che non troverà mai niente.
 */
function MenzioneFonti({ catalogo, scelte, aggiungi, togli, sopra, setSopra, setCerca, suDrop, suSopra }: {
  catalogo: Attrezzo[]
  scelte: string[]
  aggiungi: (nome: string) => void
  togli: (nome: string) => void
  sopra: boolean
  setSopra: (v: boolean) => void
  setCerca: (v: boolean) => void
  suDrop: (e: DragEvent) => void
  suSopra: (e: DragEvent) => void
}) {
  const campo = useRef<HTMLInputElement>(null)
  const [testo, setTesto] = useState('')
  const [scelto, setScelto] = useState(0)
  /** La «@» apre l'elenco; quello che viene dopo lo filtra. */
  const chiocciola = testo.startsWith('@')
  const filtro = chiocciola ? testo.slice(1).trim().toLowerCase() : ''
  const liberi = catalogo.filter(a => !scelte.includes(a.nome)
    && (!filtro || a.etichetta.toLowerCase().includes(filtro) || a.nome.includes(filtro)))
  const aperto = chiocciola && liberi.length > 0
  useEffect(() => { setScelto(0) }, [filtro, chiocciola])
  useEffect(() => { setCerca(aperto) }, [aperto, setCerca])

  const prendi = (a: Attrezzo) => {
    aggiungi(a.nome)
    setTesto('')
    requestAnimationFrame(() => campo.current?.focus())
  }
  const tasti = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!aperto) {
      // niente scritto e Backspace: si toglie l'ultima, come in ogni campo a pastiglie
      if (e.key === 'Backspace' && !testo && scelte.length) togli(scelte[scelte.length - 1])
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); return setScelto(i => (i + 1) % liberi.length) }
    if (e.key === 'ArrowUp') { e.preventDefault(); return setScelto(i => (i - 1 + liberi.length) % liberi.length) }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); return prendi(liberi[scelto]) }
    // chiudere l'elenco non è chiudere la finestra che lo contiene
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setTesto('') }
  }

  return (
    <div className="auto-fonti">
      <div className={['auto-fonti-riga', sopra && 'sopra'].filter(Boolean).join(' ')}
        onDragOver={suSopra} onDragLeave={() => setSopra(false)} onDrop={suDrop}
        onClick={() => campo.current?.focus()}>
        {scelte.map(n => {
          const a = catalogo.find(x => x.nome === n)
          return a ? (
            <button key={n} type="button" className={['auto-tessera', 'dentro', a.collegato ? '' : 'manca'].filter(Boolean).join(' ')}
              title={a.collegato ? a.spiega : `${a.spiega} · ${t('non è collegato')}`}
              aria-label={`${t('Togli')}: ${a.etichetta}`} onClick={e => { e.stopPropagation(); togli(n) }}>
              <ConnectorIcon id={connectorPerAttrezzo(a.nome, a.serve)} size={15} spenta={!a.collegato} />
              <span>{a.etichetta}</span>
              {!a.collegato && <small>{t('da collegare')}</small>}
              <i aria-hidden="true">×</i>
            </button>
          ) : null
        })}
        <input ref={campo} className="auto-fonti-campo" value={testo}
          onChange={e => setTesto(e.target.value)} onKeyDown={tasti}
          onBlur={() => setTimeout(() => setTesto(t => t.startsWith('@') ? '' : t), 140)}
          placeholder={scelte.length ? t('@ per un’altra') : t('Scrivi @ per dire da dove legge')}
          aria-label={t('Scrivi @ per dire da dove legge')} />
      </div>
      {aperto && (
        <div className="auto-fonti-menu" role="listbox" aria-label={t('cosa può aprire')}>
          {liberi.map((a, i) => (
            <div key={a.nome} role="option" aria-selected={i === scelto}
              className={`auto-fonti-voce${i === scelto ? ' scelta' : ''}`}
              onMouseDown={e => { e.preventDefault(); prendi(a) }}
              onMouseEnter={() => setScelto(i)}>
              <ConnectorIcon id={connectorPerAttrezzo(a.nome, a.serve)} size={15} spenta={!a.collegato} />
              <b>{a.etichetta}</b>
              <span>{a.spiega}</span>
              {!a.collegato && <small>{t('da collegare')}</small>}
            </div>
          ))}
        </div>
      )}
      <small className="auto-fonti-nota">
        {scelte.length ? t('Senza parole di ricerca guarda tutto quello che arriva da lì.')
          : t('Senza nessuna fonte, guarda solo quello che ha già letto.')}
      </small>
    </div>
  )
}
