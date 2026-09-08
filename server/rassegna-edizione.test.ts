import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Isolamento prima degli import: nessuna lettura o scrittura nei dati reali.
const dati = mkdtempSync(join(tmpdir(), 'myynd-rassegna-edizione-'))
const datiPrima = process.env.MYYND_DATI
const chiavePrima = process.env.ANTHROPIC_API_KEY
process.env.MYYND_DATI = dati
delete process.env.ANTHROPIC_API_KEY
const cfg = await import('./config.ts')
const store = await import('./store.ts')
const rassegna = await import('./rassegna.ts')
const timone = await import('./timone.ts')
const fetchPrima = globalThis.fetch

after(() => {
  globalThis.fetch = fetchPrima
  if (datiPrima === undefined) delete process.env.MYYND_DATI
  else process.env.MYYND_DATI = datiPrima
  if (chiavePrima === undefined) delete process.env.ANTHROPIC_API_KEY
  else process.env.ANTHROPIC_API_KEY = chiavePrima
  rmSync(dati, { recursive: true, force: true })
})

test('edizione vuota, fallback e cache restano focalizzati anche con notizie precedenti nel database', async () => {
  cfg.scrivi({ lingua: 'en' })
  let richieste = 0
  let alternativa = false
  const quando = new Date().toISOString()
  const altriLetti = Array.from({ length: 7 }, (_, i) => `<item><title>Electron ${'x'.repeat(i + 4)} ${'z'.repeat(i + 4)} sicurezza</title><link>https://example.test/letta-${i}</link><pubDate>${quando}</pubDate></item>`).join('')
  globalThis.fetch = async () => {
    richieste++
    return new Response(`<rss><channel>
      <item><title>Electron fixes macOS sandbox security</title><description>The Electron release fixes sandbox security on macOS.</description><link>https://example.test/electron</link><pubDate>${quando}</pubDate></item>
      <item><title>Canada and Lebanon discuss trade</title><description>Foreign ministers hold talks.</description><link>https://example.test/world</link><pubDate>${quando}</pubDate></item>
      ${alternativa ? altriLetti : ''}
      ${alternativa ? `<item><title>Electron introduces encrypted credential storage</title><description>Credentials can now stay encrypted on the device.</description><link>https://example.test/credentials</link><pubDate>${quando}</pubDate></item>` : ''}
    </channel></rss>`, { status: 200 })
  }
  store.salvaNotizie([{ id: 'precedente', titolo: 'Canada changes tariffs', riassunto: 'Canadian tariffs increase.', perche: 'Lebanon opens peace talks.', fonte: 'Test', link: 'https://example.test/old', argomento: 'mondo', quando }])

  const vuota = await rassegna.aggiorna(true)
  assert.equal(vuota.fatta, true)
  assert.deepEqual(vuota.notizie, [])
  assert.equal(richieste, 0, 'senza contesto non serve chiamare feed o modello')
  assert.ok(vuota.quando, 'anche una selezione vuota ha una data di aggiornamento')
  assert.equal((await rassegna.aggiorna()).fatta, false)

  timone.scriviFuoco('Ship Electron macOS app')
  const fresca = await rassegna.aggiorna()
  assert.equal(fresca.fatta, true, 'il cambiamento di focus invalida la cache vuota')
  assert.equal(fresca.notizie.length, 1, 'la cronaca generale non riempie il minimo')
  assert.equal(fresca.notizie[0].titolo, 'Electron fixes macOS sandbox security')
  assert.equal(fresca.notizie[0].riassunto, 'The Electron release fixes sandbox security on macOS.')
  assert.equal(fresca.notizie[0].perche, null)
  const dopo = richieste
  assert.deepEqual(rassegna.elenco().notizie, fresca.notizie)
  const cache = await rassegna.aggiorna()
  assert.equal(cache.fatta, false)
  assert.deepEqual(cache.notizie, fresca.notizie)
  assert.equal(richieste, dopo, 'la cache evita anche le richieste RSS')

  store.segnaNotiziaLetta(fresca.notizie[0].id)
  const archiviate = rassegna.leggiFeed(`<rss>${altriLetti}</rss>`, { nome: 'Test', url: 'https://example.test/rss', argomento: 'tecnologia', lingua: '*' })
  store.salvaNotizie(archiviate.map(n => ({ ...n, perche: null })))
  for (const n of archiviate) store.segnaNotiziaLetta(n.id)
  assert.deepEqual(rassegna.elenco().notizie, [], 'la lettura svuota anche la cache del server')
  assert.deepEqual(rassegna.elenco().recenti.map(n => n.id), [fresca.notizie[0].id], 'le lette rimangono consultabili, senza diventare nuove')
  alternativa = true
  const dopoLettura = await rassegna.aggiorna(true)
  assert.equal(dopoLettura.notizie.length, 1, 'otto articoli già letti non consumano il budget prima dell’alternativa nuova')
  assert.equal(dopoLettura.notizie[0].titolo, 'Electron introduces encrypted credential storage')
  assert.notEqual(dopoLettura.notizie[0].id, fresca.notizie[0].id, 'il modello/fallback non riseleziona la notizia già letta')

  // Se i feed non ripetono il pezzo già scelto e il modello manca, la buona edizione resta.
  const feedPrima = globalThis.fetch
  globalThis.fetch = async () => new Response('<rss><channel></channel></rss>')
  await assert.rejects(rassegna.aggiorna(true), /giornale/)
  assert.deepEqual(rassegna.elenco().notizie, dopoLettura.notizie)
  assert.equal((await rassegna.aggiorna()).fatta, false, 'dopo un errore GET non martella nuovamente le fonti')
  globalThis.fetch = async () => new Response(`<rss><item><title>Parliament debates a new trade agreement</title><link>https://example.test/unrelated</link><pubDate>${quando}</pubDate></item></rss>`)
  const conservata = await rassegna.aggiorna(true)
  assert.deepEqual(conservata.notizie, dopoLettura.notizie, 'assenza temporanea di novità non cancella la selezione')
  assert.equal(conservata.quando, dopoLettura.quando, 'i titoli conservati non sembrano appena selezionati')
  globalThis.fetch = feedPrima

  timone.scriviFuoco('Organize Kubernetes cluster migration')
  assert.deepEqual(rassegna.elenco().notizie, [], 'la cache precedente non sopravvive al cambio di lavoro')
  const senzaAttinenza = await rassegna.aggiorna()
  assert.deepEqual(senzaAttinenza.notizie, [])
  assert.equal((await rassegna.aggiorna()).fatta, false, 'un fallback vuoto è comunque una edizione valida')

  // Il server aggiorna da solo quando passa il periodo di retry dell’edizione locale.
  const file = join(cfg.cartella(), 'rassegna-edizione.json')
  const edizione = JSON.parse(readFileSync(file, 'utf8'))
  edizione.controllata = new Date(Date.now() - 21 * 60_000).toISOString()
  writeFileSync(file, JSON.stringify(edizione))
  const richiestePrimaDelRetry = richieste
  rassegna.prepara()
  assert.equal(rassegna.elenco().aggiornando, true)
  await rassegna.aggiorna(false)
  assert.ok(richieste > richiestePrimaDelRetry)
  assert.equal(rassegna.elenco().aggiornando, false)
})
