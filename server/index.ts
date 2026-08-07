// Il server locale di Myynd. Gira solo su 127.0.0.1: le credenziali che
// scrivi nell'onboarding restano su questa macchina.

import express from 'express'
import { homedir } from 'node:os'
import * as cfg from './config.ts'
import * as store from './store.ts'
import * as claude from './claude.ts'
import * as posta from './connettori/posta.ts'
import * as desktop from './connettori/desktop.ts'
import * as notion from './connettori/notion.ts'
import { CATALOGO } from './connettori/registro.ts'
import * as auth from './auth.ts'

const app = express()
app.use(express.json({ limit: '2mb' }))

const PORTA = Number(process.env.MYYND_PORT ?? 5174)

// — accesso —

app.get('/api/auth', (req, res) => {
  res.json({
    registrato: auth.registrato(),
    entrato: auth.valida(auth.tokenDi(req)),
    account: auth.conto()
  })
})

app.post('/api/auth/registra', (req, res) => {
  const { email, password } = req.body ?? {}
  const e = auth.registra(String(email ?? ''), String(password ?? ''))
  if (!e.ok) return res.status(400).json({ errore: e.errore })
  res.json({ ok: true, token: e.token, account: auth.conto() })
})

app.post('/api/auth/entra', (req, res) => {
  const { email, password } = req.body ?? {}
  const e = auth.entra(String(email ?? ''), String(password ?? ''))
  if (!e.ok) return res.status(401).json({ errore: e.errore })
  res.json({ ok: true, token: e.token, account: auth.conto() })
})

app.post('/api/auth/esci', (req, res) => {
  auth.esci(auth.tokenDi(req))
  res.json({ ok: true })
})

// da qui in giù serve essere dentro
app.use(auth.guardia)

function errore(res: express.Response, e: unknown, stato = 500) {
  const m = e instanceof Error ? e.message : String(e)
  res.status(stato).json({ errore: m })
}

// — stato generale —

app.get('/api/stato', (_req, res) => {
  const c = cfg.leggi()
  const n = store.conteggi()
  res.json({
    config: cfg.pubblica(c),
    conteggi: n,
    connettori: CATALOGO.map(v => ({
      ...v,
      collegato:
        v.id === 'posta' ? !!c.posta :
        v.id === 'desktop' ? !!c.desktop :
        v.id === 'notion' ? !!c.notion :
        v.id === 'claude' ? claude.collegato() : false,
      documenti: n.perFonte.find(f => f.fonte === v.id)?.n ?? 0
    })),
    suggerimentiDesktop: desktop.suggerimenti(),
    presetPosta: posta.PRESET,
    home: homedir()
  })
})

app.post('/api/profilo', (req, res) => {
  // solo i campi davvero presenti: un patch parziale non deve cancellare il resto
  const b = req.body ?? {}
  const patch: Record<string, unknown> = {}
  for (const k of ['nome', 'ruolo', 'tono', 'autonomia', 'onboarding'] as const) {
    if (b[k] !== undefined) patch[k] = b[k]
  }
  res.json(cfg.pubblica(cfg.aggiorna(patch)))
})

// — connettori —

app.post('/api/connettori/posta', async (req, res) => {
  const { host, porta, utente, password, giorni, cartelle } = req.body ?? {}
  if (!host || !utente || !password) return res.status(400).json({ errore: 'Servono host, indirizzo e password.' })
  const c: cfg.ConfigPosta = { host, porta: Number(porta) || 993, utente, password, giorni: Number(giorni) || 30, cartelle }
  try {
    const esito = await posta.prova(c)
    if (!esito.ok) return res.status(400).json({ errore: esito.errore })
    cfg.aggiorna({ posta: c })
    res.json({ ok: true, cartelle: esito.cartelle, certificatoAdattato: esito.certificatoAdattato })
  } catch (e) { errore(res, e) }
})

app.post('/api/connettori/desktop', async (req, res) => {
  const cartelle: string[] = req.body?.cartelle ?? []
  if (!cartelle.length) return res.status(400).json({ errore: 'Scegli almeno una cartella.' })
  try {
    const esito = await desktop.prova({ cartelle })
    if (!esito.ok) return res.status(400).json({ errore: esito.errore })
    cfg.aggiorna({ desktop: { cartelle: esito.cartelle } })
    res.json({ ok: true, cartelle: esito.cartelle })
  } catch (e) { errore(res, e) }
})

app.post('/api/connettori/notion', async (req, res) => {
  const token: string = req.body?.token ?? ''
  if (!token) return res.status(400).json({ errore: 'Serve il token di integrazione.' })
  try {
    const esito = await notion.prova({ token })
    if (!esito.ok) return res.status(400).json({ errore: esito.errore })
    cfg.aggiorna({ notion: { token } })
    res.json({ ok: true, pagine: esito.pagine })
  } catch (e) { errore(res, e) }
})

app.post('/api/connettori/claude', async (req, res) => {
  const apiKey: string = req.body?.apiKey ?? ''
  if (!apiKey) return res.status(400).json({ errore: 'Serve la chiave API.' })
  try {
    const esito = await claude.prova(apiKey)
    if (!esito.ok) return res.status(400).json({ errore: esito.errore })
    cfg.aggiorna({ claude: { apiKey } })
    res.json({ ok: true })
  } catch (e) { errore(res, e) }
})

app.delete('/api/connettori/:id', (req, res) => {
  const id = req.params.id
  const c = cfg.leggi()
  if (id === 'posta') delete c.posta
  else if (id === 'desktop') delete c.desktop
  else if (id === 'notion') delete c.notion
  else if (id === 'claude') delete c.claude
  else return res.status(400).json({ errore: 'Connettore sconosciuto.' })
  cfg.scrivi(c)
  if (id !== 'claude') store.svuotaFonte(id)
  res.json({ ok: true })
})

// — sincronizzazione, in streaming —

let sincronizzazioneInCorso = false

app.get('/api/sincronizza', async (req, res) => {
  if (sincronizzazioneInCorso) {
    return res.status(409).json({ errore: 'Una lettura è già in corso.' })
  }
  sincronizzazioneInCorso = true

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  const invia = (d: unknown) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(d)}\n\n`) }

  let annullata = false
  req.on('close', () => { annullata = true })

  const c = cfg.leggi()
  const soloFonte = typeof req.query.fonte === 'string' ? req.query.fonte : null
  let totale = 0

  try {
    if (c.desktop && (!soloFonte || soloFonte === 'desktop')) {
      invia({ fase: 'desktop', stato: 'apro le cartelle' })
      const e = await desktop.sincronizza(c.desktop, n => invia({ fase: 'desktop', stato: `${n} documenti` }))
      store.salvaDocumenti(e.docs)
      const tolti = store.riconcilia('desktop', e.docs.map(d => d.id))
      totale += e.docs.length
      invia({
        fase: 'desktop', stato: 'fatto', documenti: e.docs.length,
        saltati: e.saltatiProgetti.length, falliti: e.falliti,
        illeggibili: e.illeggibili, troncato: e.troncato, tolti
      })
    }
    if (!annullata && c.notion && (!soloFonte || soloFonte === 'notion')) {
      invia({ fase: 'notion', stato: 'leggo le pagine' })
      const e = await notion.sincronizza(c.notion)
      store.salvaDocumenti(e.docs)
      const tolti = e.interrotto ? 0 : store.riconcilia('notion', e.docs.map(d => d.id))
      totale += e.docs.length
      invia({ fase: 'notion', stato: 'fatto', documenti: e.docs.length, parziali: e.parziali, interrotto: e.interrotto, tolti })
    }
    if (!annullata && c.posta && (!soloFonte || soloFonte === 'posta')) {
      invia({ fase: 'posta', stato: 'mi collego alla casella' })
      const e = await posta.sincronizza(c.posta, (fatti, tot) =>
        invia({ fase: 'posta', stato: `${fatti} di ${tot} messaggi` }))
      store.salvaDocumenti(e.docs)
      totale += e.docs.length
      invia({ fase: 'posta', stato: 'fatto', documenti: e.docs.length, cartelleFallite: e.cartelleFallite })
    }
    invia({ fase: 'fine', totale, conteggi: store.conteggi() })
  } catch (e) {
    invia({ fase: 'errore', errore: e instanceof Error ? e.message : String(e) })
  } finally {
    sincronizzazioneInCorso = false
    if (!res.writableEnded) res.end()
  }
})

// — la mente —

app.get('/api/mente', (_req, res) => {
  const n = store.conteggi()
  res.json({
    totale: n.totale,
    gruppi: n.perGruppo.map(g => ({
      id: g.gruppo,
      nome: g.gruppo === 'posta' ? 'Posta' : g.gruppo === 'documenti' ? 'Documenti' : g.gruppo === 'note' ? 'Note' : 'Altro',
      colore: g.gruppo === 'posta' ? '#C4553C' : g.gruppo === 'documenti' ? '#E0A44A' : g.gruppo === 'note' ? '#5B9BC9' : '#7FA98A',
      nodi: g.n
    }))
  })
})

app.get('/api/cerca', (req, res) => {
  const q = String(req.query.q ?? '').trim()
  // senza query mostro gli ultimi letti: così si vede subito cosa c'è dentro
  const trovati = q ? store.cerca(q, 20) : store.recenti(20)
  res.json(trovati.map(d => ({
    id: d.id, titolo: d.titolo, fonte: d.fonte, gruppo: d.gruppo,
    quando: d.quando, estratto: d.corpo.slice(0, 180)
  })))
})

// id come query: gli identificativi contengono ':' e '/' (posta:INBOX:42, desktop:/Users/…)
app.get('/api/documento', (req, res) => {
  const d = store.documento(String(req.query.id ?? ''))
  if (!d) return res.status(404).json({ errore: 'Non trovato.' })
  res.json(d)
})

// — feed —

app.get('/api/feed', (_req, res) => {
  res.json({ aperti: store.elencoFeed('aperto'), fatte: store.elencoFeed('fatto') })
})

app.post('/api/feed/genera', async (_req, res) => {
  try {
    const voci = await claude.generaFeed()
    store.salvaFeed(voci.map((v, i) => ({ id: `f${Date.now()}-${i}`, ...v })))
    res.json({ ok: true, generate: voci.length, feed: store.elencoFeed('aperto') })
  } catch (e) { errore(res, e) }
})

app.post('/api/feed/:id/:stato', (req, res) => {
  store.cambiaStatoFeed(req.params.id, req.params.stato === 'fatto' ? 'fatto' : 'aperto')
  res.json({ ok: true })
})

// — chat —

app.get('/api/chat', (_req, res) => res.json(store.elencoChat()))
app.get('/api/chat/:id', (req, res) => res.json(store.messaggi(req.params.id)))
app.delete('/api/chat/:id', (req, res) => { store.eliminaChat(req.params.id); res.json({ ok: true }) })

app.post('/api/chat/:id', async (req, res) => {
  const chat = req.params.id
  const domanda: string = req.body?.testo ?? ''
  if (!domanda.trim()) return res.status(400).json({ errore: 'Scrivi qualcosa.' })

  const idMsg = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  const idUtente = idMsg('u')
  try {
    if (!store.esisteChat(chat)) {
      store.creaChat(chat, domanda.slice(0, 40))
      claude.titoloChat(domanda).then(t => store.rinominaChat(chat, t)).catch(() => {})
    }
    // la conversazione precedente, così i seguiti hanno senso
    const storico = store.messaggi(chat).map(m => ({ ruolo: m.role, testo: m.text }))
    store.salvaMessaggio({ id: idUtente, chat, ruolo: 'u', testo: domanda })
    const r = await claude.rispondi(domanda, storico)
    store.salvaMessaggio({ id: idMsg('a'), chat, ruolo: 'a', testo: r.testo, fonti: r.fonti })
    res.json({ messaggi: store.messaggi(chat) })
  } catch (e) {
    // niente domanda orfana se la risposta non arriva
    store.togliMessaggio(idUtente)
    errore(res, e)
  }
})

app.post('/api/azzera', (_req, res) => { store.azzeraTutto(); res.json({ ok: true }) })

// qualunque cosa sfugga ai singoli handler esce come JSON, non come stack HTML
app.use((e: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('myynd · errore non gestito:', e instanceof Error ? e.message : e)
  if (!res.headersSent) res.status(500).json({ errore: 'Errore interno.' })
})

app.listen(PORTA, '127.0.0.1', () => {
  console.log(`myynd · server su http://127.0.0.1:${PORTA}`)
})
