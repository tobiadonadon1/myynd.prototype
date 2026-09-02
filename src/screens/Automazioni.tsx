// Le automazioni: il lavoro che si fa da solo.
//
// Prima erano un elenco: undici righe alte cinquanta pixel, tutte uguali,
// dentro una scheda alta un numero fisso con un pannello che saliva dal fondo.
// Funzionava per scorrerle e non per *sceglierne* una — e sceglierne una è
// quello che si viene a fare qui. Un elenco di nomi non dice cosa fa una cosa,
// e soprattutto non dice **cosa apre mentre non la guardi**, che su una cosa
// che gira alle sette di mattina è la domanda più importante di tutte.
//
// Adesso è una griglia di schede, e la schermata ha tre pezzi:
//
//   · **la colonna delle cartelle**, a sinistra. Sono tue, le fai tu, e ci si
//     trascina dentro. Non un filtro automatico per genere: quello lo sa già
//     fare la piastrella di ogni scheda, e non è come le persone si
//     organizzano — «i clienti», «le fatture», «il codice» non sono generi.
//   · **la griglia**, quattro per riga quando c'è posto, che scende a tre, due
//     e una senza mai far sbordare niente.
//   · **la scheda che viene avanti**, al centro, quando ne apri una.
//
// La cartella non sta nella ricetta ma nel database, ed è la ragione per cui si
// può mettere in «Fatture» un'automazione arrivata con l'azienda senza doverne
// prima fare una copia: come ti organizzi è tuo, e un aggiornamento del
// fornitore non deve scompaginarlo.
//
// E la cosa che non cambia, che regge tutto il resto: un'automazione **prepara,
// non manda**.

import { useCallback, useEffect, useState } from 'react'
import { api, type Attrezzo, type Automazione, type Raccolta, type StatoRicette } from '../api'
import { frasi, loc, t } from '../lingua'
import { Cestino, Hov, LABEL, daTastiera, useAttiva, useLarghezza } from '../ui'
import { IconPenna, IconPiu } from '../icons'
import { Scheda, Vuota } from '../automazioni/Scheda'
import { Editor, Nuova } from '../automazioni/Editor'
import type { Vals } from '../vals'

/** Quanto è larga la colonna delle cartelle, quando c'è. */
const COLONNA = 176

/**
 * Quante schede per riga.
 *
 * Quattro è quello che è stato chiesto ed è quello che si ha quando c'è posto.
 * Sotto, si scende — e si scende invece di rimpicciolire le schede, perché una
 * scheda sotto i duecento pixel non ha più spazio per la frase che spiega, e
 * senza quella torna a essere una riga di elenco con più aria intorno.
 */
function colonne(largo: number): number {
  if (largo >= 1060) return 4
  if (largo >= 800) return 3
  if (largo >= 520) return 2
  return 1
}

/**
 * Una cartella nella colonna, che è anche un posto dove lasciar cadere.
 *
 * Il bordo che si accende mentre ci passi sopra con una scheda in mano è tutta
 * l'interfaccia che serve: senza, trascinare è un gesto al buio e si lascia la
 * presa sperando bene.
 */
function Cartella({ nome, etichetta, quante, scelta, vai, cadi, sopraCon, rinomina, butta }: {
  /** Null è «Tutte»: non ha un nome perché non è una cartella. */
  nome: string | null
  /** Come si legge, quando non è il suo nome. */
  etichetta?: string
  quante: number
  scelta: boolean
  vai: () => void
  cadi?: (id: string) => void
  /** Vero se c'è una scheda in mano adesso: solo allora è un bersaglio. */
  sopraCon: boolean
  rinomina?: (a: string) => void
  butta?: () => void
}) {
  const [dentro, setDentro] = useState(false)
  const { attiva, passa, props: sottoMano } = useAttiva()
  const [scrivo, setScrivo] = useState(false)
  const [testo, setTesto] = useState(nome ?? '')

  const conferma = () => {
    const n = testo.trim()
    if (n && n !== nome && rinomina) rinomina(n)
    setScrivo(false)
  }

  if (scrivo) {
    return (
      <input autoFocus value={testo} onChange={e => setTesto(e.target.value)}
        onBlur={conferma}
        onKeyDown={e => {
          if (e.key === 'Enter') conferma()
          if (e.key === 'Escape') { setTesto(nome ?? ''); setScrivo(false) }
        }}
        style={{
          width: '100%', boxSizing: 'border-box', padding: '8px 11px', borderRadius: 12,
          border: '1px solid rgba(196,98,59,.5)', background: 'rgba(255,255,255,.9)',
          color: '#22271F', fontSize: '13px', fontFamily: 'inherit', outline: 'none', marginBottom: 2
        }} />
    )
  }

  // i due gesti compaiono quando la riga è sotto mano; su un dito ci sono
  // sempre, e allora il conto resta accanto invece di sparire
  const controlli = attiva && !!nome && !!rinomina && !!butta

  return (
    <div
      role="button" tabIndex={0} aria-pressed={scelta}
      onClick={vai} onKeyDown={daTastiera(vai)}
      {...sottoMano}
      onDragOver={e => { if (cadi) { e.preventDefault(); setDentro(true) } }}
      onDragLeave={() => setDentro(false)}
      onDrop={e => {
        setDentro(false)
        const id = e.dataTransfer.getData('text/plain')
        if (id && cadi) { e.preventDefault(); cadi(id) }
      }}
      style={{
        display: 'flex', alignItems: 'center', gap: 9, padding: '8px 11px', borderRadius: 12,
        cursor: 'pointer', marginBottom: 2, position: 'relative',
        background: dentro ? 'rgba(196,98,59,.14)' : scelta ? 'rgba(34,39,31,.06)' : 'transparent',
        border: `1px solid ${dentro ? 'rgba(196,98,59,.55)' : sopraCon && cadi ? 'rgba(34,39,31,.12)' : 'transparent'}`,
        borderStyle: dentro ? 'solid' : sopraCon && cadi ? 'dashed' : 'solid',
        transition: 'background .15s, border-color .15s'
      }}>
      <span style={{
        fontSize: '13px', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden',
        textOverflow: 'ellipsis',
        color: scelta ? '#22271F' : 'rgba(34,39,31,.7)',
        fontWeight: scelta ? 500 : 400
      }}>{nome ?? etichetta ?? t('Tutte')}</span>

      {controlli && (
        <span style={{ display: 'flex', gap: 2, flex: 'none', alignItems: 'center' }}>
          <Hov as="button" type="button"
            onClick={(e: React.MouseEvent) => { e.stopPropagation(); setTesto(nome!); setScrivo(true) }}
            title={t('Rinominala')} aria-label={t('Rinominala')}
            style={{ display: 'grid', placeItems: 'center', width: 19, height: 19, borderRadius: 6, border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: 'rgba(34,39,31,.4)' }}
            hover={{ background: 'rgba(34,39,31,.09)', color: '#22271F' }}><IconPenna size={11} /></Hov>
          {/* buttarla chiede una volta, come ogni cestino qui dentro */}
          <Cestino fai={butta!} titolo={t('Butta la cartella')} dim={19} icona={10} />
        </span>
      )}
      {(!controlli || !passa) && (
        <span style={{ fontSize: '11px', color: 'rgba(34,39,31,.36)', flex: 'none' }}>{quante || ''}</span>
      )}
    </div>
  )
}

/**
 * Da dove arrivano quelle dell'azienda.
 *
 * Sta in fondo e in piccolo: chi usa Myynd non deve sapere che esiste un
 * repository. Serve a chi le scrive, quando è al telefono con il cliente.
 */
function Ricette({ stato, arrivate }: {
  stato: StatoRicette
  arrivate: (a: Automazione[], r: StatoRicette) => void
}) {
  const [guardo, setGuardo] = useState(false)
  const [detto, setDetto] = useState('')

  const guarda = async () => {
    setGuardo(true); setDetto('')
    try {
      const r = await api.aggiornaRicette()
      arrivate(r.automazioni, r.ricette)
      const mosse = r.nuove + r.cambiate + r.tolte
      setDetto(mosse ? frasi.ricetteArrivate(r.nuove, r.cambiate, r.tolte) : t('Nessuna novità.'))
    } catch (e) {
      setDetto(e instanceof Error ? t(e.message) : t('Non ce l’ha fatta.'))
    }
    setGuardo(false)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '16px 4px 0', flexWrap: 'wrap' }}>
      <Hov as="button" type="button" onClick={guarda} disabled={guardo}
        style={{
          border: 'none', background: 'none', padding: 0, cursor: guardo ? 'default' : 'pointer',
          fontFamily: 'inherit', fontSize: '12.5px', color: '#8E3F1F'
        }}
        hover={{ color: '#C4623B' }}>
        {guardo ? t('Guardo…') : t('Cerca automazioni nuove')}
      </Hov>
      <span style={{ fontSize: '11.5px', color: 'rgba(34,39,31,.4)' }}>
        {detto || (stato.guaio ? t(stato.guaio) : stato.quando
          ? frasi.guardatoIl(new Date(stato.quando).toLocaleString(loc(), {
              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
            }))
          : '')}
      </span>
    </div>
  )
}

/**
 * Cosa si sta guardando.
 *
 * Le cartelle sono come *tu* le hai messe; gli attrezzi sono cosa *aprono*.
 * Sono due tagli diversi sulle stesse schede e servono in due momenti diversi
 * — «dove ho messo quella dei clienti» e «cosa tocca la mia posta» — perciò
 * stanno nella stessa colonna ma non nella stessa lista, e non si sommano: se
 * ne sceglie uno alla volta, che è come funziona il fatto di guardare.
 */
type Filtro =
  | { che: 'tutte' }
  | { che: 'raccolta'; nome: string }
  | { che: 'senza' }
  | { che: 'attrezzo'; nome: string }

const uguali = (a: Filtro, b: Filtro): boolean =>
  a.che === b.che && ('nome' in a ? a.nome === (b as { nome?: string }).nome : true)

export function Automazioni({ v }: { v: Vals }) {
  const [tutte, setTutte] = useState<Automazione[] | null>(null)
  // «non sono riuscito a leggerle» è diverso da «non ce n'è nessuna»: prima
  // un errore del server mostrava la griglia vuota e l'invito a scriverne una
  const [guastoElenco, setGuastoElenco] = useState<string | null>(null)
  const [ricette, setRicette] = useState<StatoRicette | null>(null)
  const [raccolte, setRaccolte] = useState<Raccolta[]>([])
  const [catalogo, setCatalogo] = useState<Attrezzo[]>([])
  const [cartelle, setCartelle] = useState<string[]>([])
  const [filtro, setFiltro] = useState<Filtro>({ che: 'tutte' })
  /** null = niente aperto; '' = la scheda del «nuova»; un id = quella scheda. */
  const [aperto, setAperto] = useState<string | null>(null)
  /** L'id della scheda che si sta trascinando adesso. */
  const [inMano, setInMano] = useState<string | null>(null)
  const [nuovaCartella, setNuovaCartella] = useState(false)
  const [nome, setNome] = useState('')

  const largo = useLarghezza()

  const carica = useCallback(() => {
    api.automazioni()
      .then(r => { setTutte(r.automazioni); setRicette(r.ricette); setGuastoElenco(null) })
      .catch(e => { setTutte(null); setGuastoElenco(e instanceof Error ? t(e.message) : t('Non riesco a leggere le automazioni.')) })
    api.raccolte().then(r => setRaccolte(r.raccolte)).catch(() => { /* niente cartelle: pazienza */ })
    api.attrezzi().then(r => { setCatalogo(r.attrezzi); setCartelle(r.cartelle) })
      .catch(() => { /* il menù della chiocciola resta vuoto, il resto funziona */ })
  }, [])
  useEffect(() => { carica() }, [carica])

  const elenco = tutte ?? []
  const accese = elenco.filter(a => a.accesa).length
  const senza = elenco.filter(a => !a.raccolta).length

  /**
   * Un filtro che punta a una cosa che non c'è più non è un filtro: è una
   * schermata vuota senza spiegazione.
   *
   * È successo davvero, ed è il difetto peggiore che questa schermata potesse
   * avere. Filtrando per «desktop» e buttando le automazioni del desktop, la
   * riga «desktop» spariva dalla colonna — la calcolavo solo su quelle in uso —
   * ma `filtro` continuava a puntarci: griglia vuota, nessuna riga accesa nella
   * colonna, e nessun modo di capire che c'era un filtro. Da fuori è
   * indistinguibile da «le hai cancellate tutte», ed è esattamente quello che
   * sembrava fosse successo.
   *
   * La cartella sparita si risolve tornando a «Tutte»; l'attrezzo no — quello
   * si tiene in colonna, a zero, acceso. Sono due risposte diverse perché sono
   * due domande diverse: una cartella buttata non esiste più e non c'è niente
   * da mostrare, un attrezzo esiste sempre e «nessuna lo apre» è una risposta
   * vera, che va detta invece che nascosta.
   */
  const vivo: Filtro =
    filtro.che === 'raccolta' && !raccolte.some(r => r.nome === filtro.nome)
      ? { che: 'tutte' }
      : filtro

  const viste = vivo.che === 'tutte' ? elenco
    : vivo.che === 'senza' ? elenco.filter(a => !a.raccolta)
      : vivo.che === 'raccolta' ? elenco.filter(a => a.raccolta === vivo.nome)
        : elenco.filter(a => a.attrezzi.includes(vivo.nome))

  /**
   * Gli attrezzi che qualcuno usa davvero — più quello che stai guardando
   * adesso, anche se non lo usa più nessuno. Senza quel «più», la riga su cui
   * hai cliccato ti sparisce sotto le dita.
   */
  const inUso = catalogo
    .map(x => ({ x, quante: elenco.filter(a => a.attrezzi.includes(x.nome)).length }))
    .filter(r => r.quante > 0 || (vivo.che === 'attrezzo' && vivo.nome === r.x.nome))

  const scelta = aperto ? elenco.find(a => a.id === aperto) ?? null : null

  /** Quanta larghezza resta alla griglia una volta tolta la colonna. */
  const conColonna = largo >= 900
  const perRiga = colonne(largo - (conColonna ? COLONNA + 26 : 0) - 90)

  const sposta = async (id: string, raccolta: string | null) => {
    // ottimista: la scheda salta nella cartella mentre la richiesta viaggia.
    // Trascinare e aspettare mezzo secondo che la scheda si muova è il genere
    // di ritardo che fa ritrascinare tutto una seconda volta.
    setTutte(t => t?.map(a => a.id === id ? { ...a, raccolta } : a) ?? t)
    try {
      const r = await api.mettiInRaccolta(id, raccolta)
      setTutte(r.automazioni); setRaccolte(r.raccolte)
    } catch { carica() }
  }

  const creaCartella = async () => {
    const n = nome.trim()
    setNuovaCartella(false); setNome('')
    if (!n) return
    try {
      setRaccolte((await api.creaRaccolta(n)).raccolte)
      setFiltro({ che: 'raccolta', nome: n })
    } catch {
      // il nome era gia preso: la colonna resta com'e
    }
  }

  return (
    <div style={{ width: '100%', maxWidth: 1240, display: 'flex', flexDirection: 'column', paddingBottom: 30 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '12px 4px 16px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 34, lineHeight: 1.1, letterSpacing: '-.03em' }}>{t('Automazioni')}</span>
        {!!elenco.length && (
          <span style={{ fontSize: 13, color: 'rgba(34,39,31,.6)' }}>{frasi.acceseSu(accese, elenco.length)}</span>
        )}
      </div>

      <div style={{
        fontSize: '13px', lineHeight: 1.6, color: 'rgba(34,39,31,.58)',
        padding: '0 4px 18px', maxWidth: 640, textWrap: 'pretty'
      }}>
        {t('Guardano quello che gli hai concesso di guardare, all’ora che decidi tu, e ti lasciano una riga in lista. Non mandano niente a nessuno.')}
      </div>

      <div style={{ display: 'flex', gap: 26, alignItems: 'flex-start' }}>

        {conColonna && (
          <div style={{ width: COLONNA, flex: 'none', position: 'sticky', top: 0 }}>
            <div style={{ ...LABEL, fontSize: '10px', padding: '0 11px 8px' }}>{t('cartelle')}</div>

            <Cartella nome={null} quante={elenco.length} scelta={vivo.che === 'tutte'}
              vai={() => setFiltro({ che: 'tutte' })} sopraCon={!!inMano}
              cadi={id => sposta(id, null)} />

            {raccolte.map(r => (
              <Cartella key={r.nome} nome={r.nome}
                quante={elenco.filter(a => a.raccolta === r.nome).length}
                scelta={uguali(vivo, { che: 'raccolta', nome: r.nome })}
                vai={() => setFiltro({ che: 'raccolta', nome: r.nome })}
                sopraCon={!!inMano} cadi={id => sposta(id, r.nome)}
                rinomina={async a => {
                  try {
                    const x = await api.rinominaRaccolta(r.nome, a)
                    setRaccolte(x.raccolte); setTutte(x.automazioni)
                    if (uguali(vivo, { che: 'raccolta', nome: r.nome })) setFiltro({ che: 'raccolta', nome: a })
                  } catch {
                    // il nome era gia preso: la colonna resta com'e
                  }
                }}
                butta={async () => {
                  try {
                    const x = await api.buttaRaccolta(r.nome)
                    setRaccolte(x.raccolte); setTutte(x.automazioni)
                    if (uguali(vivo, { che: 'raccolta', nome: r.nome })) setFiltro({ che: 'tutte' })
                  } catch { carica() }
                }} />
            ))}

            {/* «Fuori da tutte» compare solo quando c'è una cartella e c'è
                qualcosa fuori: prima non vuol dire niente */}
            {!!raccolte.length && senza > 0 && (
              <Cartella nome={null} etichetta={t('Fuori dalle cartelle')} quante={senza}
                scelta={vivo.che === 'senza'} vai={() => setFiltro({ che: 'senza' })}
                sopraCon={false} />
            )}

            {nuovaCartella ? (
              <input autoFocus value={nome} onChange={e => setNome(e.target.value)}
                onBlur={creaCartella}
                onKeyDown={e => {
                  if (e.key === 'Enter') creaCartella()
                  if (e.key === 'Escape') { setNuovaCartella(false); setNome('') }
                }}
                placeholder={t('come si chiama')}
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '8px 11px', borderRadius: 12,
                  border: '1px solid rgba(196,98,59,.5)', background: 'rgba(255,255,255,.9)',
                  color: '#22271F', fontSize: '13px', fontFamily: 'inherit', outline: 'none', marginTop: 4
                }} />
            ) : (
              <Hov as="button" type="button" onClick={() => setNuovaCartella(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 11px', borderRadius: 12,
                  border: 'none', background: 'none', fontFamily: 'inherit', textAlign: 'left',
                  cursor: 'pointer', marginTop: 4, color: 'rgba(34,39,31,.45)', fontSize: '12.5px'
                }}
                hover={{ background: 'rgba(34,39,31,.05)', color: '#22271F' }}>
                <IconPiu size={10} />{t('Nuova cartella')}
              </Hov>
            )}

            {/*
              L'altro taglio: per cosa aprono.
              Le cartelle rispondono a «dove l'ho messa», questo a «cosa tocca
              la mia posta» — che è la domanda che ci si fa quando si scollega
              qualcosa, o quando si vuole vedere di colpo tutto quello che gira
              dentro il computer invece che nella casella.
            */}
            {!!inUso.length && (
              <>
                <div style={{ ...LABEL, fontSize: '10px', padding: '20px 11px 8px' }}>{t('per cosa aprono')}</div>
                {inUso.map(({ x, quante }) => {
                  const on = uguali(vivo, { che: 'attrezzo', nome: x.nome })
                  return (
                    <Hov key={x.nome} as="button" type="button" aria-pressed={on}
                      onClick={() => setFiltro(on ? { che: 'tutte' } : { che: 'attrezzo', nome: x.nome })}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 11px',
                        borderRadius: 12, cursor: 'pointer', marginBottom: 2, fontFamily: 'inherit', textAlign: 'left',
                        background: on ? `${x.tinta}14` : 'transparent',
                        border: `1px solid ${on ? `${x.tinta}38` : 'transparent'}`
                      }}
                      hover={on ? {} : { background: 'rgba(34,39,31,.05)' }}>
                      <span style={{
                        width: 7, height: 7, flex: 'none', borderRadius: '50%',
                        background: x.collegato ? x.tinta : 'transparent',
                        border: x.collegato ? 'none' : '1px solid rgba(34,39,31,.28)'
                      }} />
                      <span style={{
                        fontSize: '12.5px', flex: 1, minWidth: 0, whiteSpace: 'nowrap',
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        color: on ? x.tinta : 'rgba(34,39,31,.68)', fontWeight: on ? 500 : 400
                      }}>{x.etichetta}</span>
                      <span style={{ fontSize: '11px', color: 'rgba(34,39,31,.34)', flex: 'none' }}>{quante}</span>
                    </Hov>
                  )
                })}
              </>
            )}
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* cartelle e attrezzi in orizzontale quando la colonna non ci sta */}
          {!conColonna && (!!raccolte.length || !!inUso.length) && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              {([{ che: 'tutte' }, ...raccolte.map(r => ({ che: 'raccolta' as const, nome: r.nome })),
                 ...inUso.map(({ x }) => ({ che: 'attrezzo' as const, nome: x.nome }))] as Filtro[]).map(f => {
                const on = uguali(vivo, f)
                const tinta = f.che === 'attrezzo'
                  ? catalogo.find(x => x.nome === f.nome)?.tinta ?? '#C4623B' : '#C4623B'
                const testo = f.che === 'tutte' ? t('Tutte')
                  : f.che === 'attrezzo' ? (catalogo.find(x => x.nome === f.nome)?.etichetta ?? f.nome)
                    : 'nome' in f ? f.nome : ''
                return (
                  <Hov key={`${f.che}:${'nome' in f ? f.nome : ''}`} as="button" type="button" aria-pressed={on} onClick={() => setFiltro(f)}
                    style={{
                      padding: '6px 13px', borderRadius: 99, cursor: 'pointer', fontSize: '12.5px', fontFamily: 'inherit',
                      border: `1px solid ${on ? `${tinta}66` : 'rgba(34,39,31,.14)'}`,
                      background: on ? `${tinta}1A` : 'rgba(255,255,255,.5)',
                      color: on ? tinta : 'rgba(34,39,31,.65)'
                    }}
                    hover={{ borderColor: `${tinta}66` }}>{testo}</Hov>
                )
              })}
            </div>
          )}

          <div style={{
            display: 'grid', gap: 14,
            gridTemplateColumns: `repeat(${perRiga}, minmax(0, 1fr))`,
            alignItems: 'stretch'
          }}>
            {viste.map((a, i) => (
              <Scheda key={a.id} a={a} catalogo={catalogo}
                ritardo={Math.min(i, 11) * 26}
                apri={() => setAperto(a.id)}
                prendi={e => {
                  e.dataTransfer.setData('text/plain', a.id)
                  e.dataTransfer.effectAllowed = 'move'
                  setInMano(a.id)
                  // la presa si molla comunque, anche se il drop cade nel vuoto
                  setTimeout(() => setInMano(null), 4000)
                }}
                accendi={async e => {
                  e.stopPropagation()
                  try { setTutte((await api.accendiAutomazione(a.id, !a.accesa)).automazioni) } catch { carica() }
                }}
                butta={async () => {
                  try { setTutte((await api.buttaAutomazione(a.id)).automazioni) } catch { carica() }
                }} />
            ))}
            {tutte && <Vuota apri={() => setAperto('')} />}
          </div>

          {tutte && !elenco.length && (
            <div style={{
              fontSize: '13.5px', lineHeight: 1.65, color: 'rgba(34,39,31,.55)',
              padding: '18px 4px 0', maxWidth: 480, textWrap: 'pretty'
            }}>
              {t('Non ce n’è ancora nessuna. Scrivine una a parole: dille quando guardare e cosa può aprire.')}
              {/*
                Le undici del pacchetto, offerte invece che imposte.
                Arrivavano accese su ogni conto nuovo: undici cose che nessuno
                aveva scritto, su fatture e clienti di un'azienda immaginaria, e
                la prima cosa che si faceva era cancellarle una per una. Sono un
                buon punto di partenza per chi le vuole — e per chi le vuole
                basta una riga.
              */}
              <div style={{ marginTop: 12 }}>
                <Hov as="button" onClick={async () => {
                  try { setTutte((await api.automazioniDiSerie(true)).automazioni) } catch { carica() }
                }}
                  style={{
                    padding: '8px 15px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: '12.5px', border: '1px solid rgba(34,39,31,.18)',
                    background: 'rgba(255,255,255,.6)', color: 'rgba(34,39,31,.75)'
                  }}
                  hover={{ borderColor: '#C4623B', color: '#8E3F1F' }}>
                  {t('Oppure parti da undici già pronte')}
                </Hov>
              </div>
            </div>
          )}
          {/*
            Vuoto perché filtrato, non vuoto perché non c'è niente.
            La differenza dev'essere scritta, e dev'esserci accanto il modo di
            uscirne: una griglia vuota senza una via d'uscita è come si arriva a
            credere di aver cancellato tutto.
          */}
          {tutte && !!elenco.length && !viste.length && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              fontSize: '13.5px', color: 'rgba(34,39,31,.55)', padding: '18px 4px 0'
            }}>
              <span>
                {vivo.che === 'attrezzo'
                  ? t('Nessuna apre questo, per ora.')
                  : t('Questa cartella è vuota. Trascinacene dentro una.')}
              </span>
              <Hov as="button" onClick={() => setFiltro({ che: 'tutte' })}
                style={{
                  padding: '6px 13px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: '12.5px', border: '1px solid rgba(34,39,31,.18)',
                  background: 'rgba(255,255,255,.6)', color: 'rgba(34,39,31,.75)'
                }}
                hover={{ borderColor: '#C4623B', color: '#8E3F1F' }}>
                {frasi.mostraTutte(elenco.length)}
              </Hov>
            </div>
          )}
          {!tutte && (
            <div style={{ padding: '18px 4px', fontSize: 14, color: guastoElenco ? '#8E3F1F' : 'rgba(34,39,31,.45)', overflowWrap: 'anywhere' }}>
              {guastoElenco ?? t('carico…')}
              {guastoElenco && (
                <Hov as="button" onClick={carica}
                  style={{ marginLeft: 10, padding: '4px 11px', borderRadius: 99, border: '1px solid rgba(34,39,31,.2)', background: 'rgba(255,255,255,.7)', color: 'rgba(34,39,31,.72)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }}
                  hover={{ borderColor: '#C4623B', color: '#8E3F1F' }}>{t('Riprova')}</Hov>
              )}
            </div>
          )}

          {ricette?.repo && <Ricette stato={ricette} arrivate={(a, r) => { setTutte(a); setRicette(r) }} />}

          <div style={{
            ...LABEL, color: 'rgba(34,39,31,.4)', padding: '18px 4px 0', maxWidth: 560,
            letterSpacing: '.06em', textTransform: 'none', fontSize: '11.5px', lineHeight: 1.6
          }}>
            {/* «su questo computer» su un server è falso, ed è la frase su cui
                si basa la fiducia: va detta solo dov'è vera */}
            {v.ospitato
              ? t('Quello che leggono resta nel tuo spazio. Le automazioni descrivono solo cosa guardare e cosa farne: non contengono niente di tuo.')
              : t('Quello che leggono resta su questo computer. Le automazioni descrivono solo cosa guardare e cosa farne: non contengono niente di tuo.')}
          </div>
        </div>
      </div>

      {scelta && (
        <Editor a={scelta} catalogo={catalogo} cartelle={cartelle} raccolte={raccolte}
          cambiata={setTutte} chiudi={() => setAperto(null)} spostata={sposta} />
      )}
      {aperto === '' && (
        <Nuova catalogo={catalogo} chiudi={() => setAperto(null)}
          fatta={(a, id) => { setTutte(a); setAperto(id) }} />
      )}

      {/* `v` resta nella firma: la usano le altre schermate. */}
      <span hidden>{v.connCount}</span>
    </div>
  )
}
