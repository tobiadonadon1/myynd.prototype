import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Config } from './config.ts'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-lettura-feed-'))
process.env.MYYND_DATI = CASA
const cfg = await import('./config.ts')
const store = await import('./store.ts')
const { dimenticaLetture, esitoLettura, fontiIncomplete, LetturaInCorso, lettureInCorso, motivoLettura, osservaLettura } = await import('./lettura-feed.ts')
const chi = await import('./chi.ts')
after(() => { store.chiudiIndici(); rmSync(CASA, { recursive: true, force: true }) })

// tutte le fonti di queste prove sono collegate: una scollegata non compare mai
const TUTTE = {
  note: { note: 0 }, desktop: { cartelle: ['/tmp'], scelte: true }, posta: { host: 'imap.esempio.it', porta: 993, utente: 'a@esempio.it', password: 'x' },
  slack: { token: 'xoxp-finto' }, github: { token: 'ghp_finto' }, notion: { token: 'ntn_finto' }
}
beforeEach(() => { dimenticaLetture(); store.default.exec('DELETE FROM salute_fonti'); cfg.scrivi(TUTTE as Config) })

/** Una lettura intera, con gli eventi dati, alle ore date (in minuti da un'origine lontana da ogni risveglio). */
function leggi(eventi: unknown[], o: { minuto?: number; soloFonte?: string | null; interrotta?: boolean } = {}) {
  let cambiato = 0
  const t = Date.parse('2026-09-20T10:00:00Z') + (o.minuto ?? 0) * 60_000
  const oss = osservaLettura('conto', o.soloFonte ?? null, { adesso: () => t, quandoCambia: () => { cambiato++ }, risveglio: 0 })
  for (const e of eventi) oss.avvisa(e)
  oss.chiudi(o.interrotta ?? false)
  return cambiato
}
const fonti = () => fontiIncomplete('conto').map(f => [f.fonte, f.motivo, f.rimedio])

test('un guaio con una causa che resta si mostra subito; una lettura a metà passeggera aspetta la terza volta', () => {
  leggi([{ fase: 'note', stato: 'guaio', errore: 'x', rimedio: 'permesso-disco' }])
  assert.deepEqual(fonti(), [['note', 'non-disponibile', 'permesso-disco']])
  dimenticaLetture()
  // Slack con un canale che non si apre: la prima e la seconda volta non si dice niente
  leggi([{ fase: 'slack', stato: 'fatto', falliti: ['canale'] }], { minuto: 0 })
  assert.deepEqual(fonti(), [])
  leggi([{ fase: 'slack', stato: 'fatto', falliti: ['canale'] }], { minuto: 10 })
  assert.deepEqual(fonti(), [])
  const c = leggi([{ fase: 'slack', stato: 'fatto', falliti: ['canale'] }], { minuto: 20 })
  assert.deepEqual(fonti(), [['slack', 'incompleta', 'attendi']])
  assert.equal(c, 1, 'la riga fissa cambia una volta, quando si mostra')
})

test('ogni forma di lettura a metà si segna; il guaio senza causa è «guarda»', () => {
  for (const evento of [{ fase: 'posta', stato: 'fatto', cartelleFallite: ['Drafts'], rimedio: 'guarda' },
    { fase: 'github', stato: 'fatto', falliti: ['repo'], rimedio: 'guarda' },
    { fase: 'notion', stato: 'fatto', interrotto: true, rimedio: 'guarda' },
    { fase: 'desktop', stato: 'fatto', illeggibili: ['/Users/private/folder'], rimedio: 'guarda' }]) {
    dimenticaLetture()
    leggi([evento])
    assert.deepEqual(fonti(), [[evento.fase, 'incompleta', 'guarda']], evento.fase)
  }
  dimenticaLetture()
  leggi([{ fase: 'posta', stato: 'guaio', errore: 'qualcosa' }])
  assert.deepEqual(fonti(), [['posta', 'non-disponibile', 'guarda']])
})

test('il desktop con cartelle negate è «permesso-disco», subito', () => {
  leggi([{ fase: 'desktop', stato: 'fatto', documenti: 3, negate: 2, rimedio: 'permesso-disco' }])
  assert.deepEqual(fonti(), [['desktop', 'incompleta', 'permesso-disco']])
})

test('un file che non si apre in mezzo a cento non è una fonte che non si legge; un tetto nemmeno', () => {
  for (const evento of [
    { fase: 'desktop', stato: 'fatto', falliti: 3, illeggibili: [], troncato: true },
    { fase: 'note', stato: 'fatto', illeggibili: 1, troncato: true },
    { fase: 'drive', stato: 'fatto', falliti: 2 },
    { fase: 'notion', stato: 'fatto', parziali: 1, interrotto: false },
    { fase: 'posta', stato: 'fatto', cartelleFallite: [], troncato: true },
    { fase: 'desktop', stato: '12 documenti', fatti: 12 },
    { fase: 'fine', totale: 3 }
  ]) {
    assert.equal(motivoLettura(evento), null, JSON.stringify(evento))
    const x = esitoLettura(evento)
    assert.ok(x === null || x.esito === 'pulita', JSON.stringify(evento))
  }
})

test('la lettura dopo pulisce quello che si è sistemato; una fonte sola tocca solo se stessa; fermata a metà, aggiunge e basta', () => {
  leggi([
    { fase: 'note', stato: 'guaio', errore: 'x', rimedio: 'permesso-disco' },
    { fase: 'desktop', stato: 'fatto', illeggibili: ['/a'], rimedio: 'guarda' },
    // il guaio pesa più della lettura a metà che arriva dopo per la stessa fase
    { fase: 'note', stato: 'fatto', illeggibili: ['/b'] }
  ])
  assert.deepEqual(fonti(), [['note', 'non-disponibile', 'permesso-disco'], ['desktop', 'incompleta', 'guarda']])

  leggi([{ fase: 'desktop', stato: 'fatto', illeggibili: [] }], { soloFonte: 'desktop', minuto: 10 })
  assert.deepEqual(fonti(), [['note', 'non-disponibile', 'permesso-disco']])

  leggi([{ fase: 'slack', stato: 'guaio', errore: 'token', rimedio: 'credenziale' }], { interrotta: true, minuto: 20 })
  assert.deepEqual(fonti(), [['note', 'non-disponibile', 'permesso-disco'], ['slack', 'non-disponibile', 'credenziale']])

  // una lettura intera che non ha letto né le Note né Slack chiude i loro episodi
  const c = leggi([], { minuto: 30 })
  assert.deepEqual(fonti(), [])
  assert.equal(c, 1)
})

test('a chi ascolta si dice quali fonti sono guarite: una che si rompe non è guarita, una che si chiude perché non si legge più nemmeno', () => {
  const guarite: string[][] = []
  const leggiE = (eventi: unknown[], minuto: number, soloFonte: string | null = null) => {
    const t = Date.parse('2026-09-20T10:00:00Z') + minuto * 60_000
    const oss = osservaLettura('conto', soloFonte, { adesso: () => t, quandoCambia: c => { guarite.push(c.guarite) }, risveglio: 0 })
    for (const e of eventi) oss.avvisa(e)
    oss.chiudi(false)
  }
  // si rompe: cambiata, nessuna guarita
  leggiE([{ fase: 'note', stato: 'guaio', errore: 'x', rimedio: 'permesso-disco' }, { fase: 'slack', stato: 'guaio', errore: 'token', rimedio: 'credenziale' }], 0)
  assert.deepEqual(guarite, [[]])
  // le Note tornano leggibili (il permesso dato): guarite le Note, Slack ancora rotto
  leggiE([{ fase: 'note', stato: 'fatto', documenti: 3 }, { fase: 'slack', stato: 'guaio', errore: 'token', rimedio: 'credenziale' }], 10)
  assert.deepEqual(guarite, [[], ['note']])
  // (contro) una lettura intera che non legge più Slack chiude il suo episodio, ma non è una guarigione
  leggiE([{ fase: 'note', stato: 'fatto', documenti: 3 }], 20)
  assert.deepEqual(guarite, [[], ['note'], []])
  // (contro) una lettura pulita senza un guaio prima non cambia niente e non dice niente
  leggiE([{ fase: 'note', stato: 'fatto', documenti: 3 }], 30)
  assert.deepEqual(guarite, [[], ['note'], []])
})

test('una fonte scollegata a metà lettura perde il suo episodio', () => {
  leggi([{ fase: 'note', stato: 'guaio', errore: 'x', rimedio: 'permesso-disco' }])
  leggi([{ fase: 'note', stato: 'scollegata' }], { soloFonte: 'note', minuto: 10 })
  assert.deepEqual(fonti(), [])
})

test('il nome della fonte non porta fuori un percorso o un segreto, e una fase così non si registra', () => {
  const evento = { fase: '/private/account/notes', stato: 'guaio', errore: 'token=private-secret' }
  assert.deepEqual(motivoLettura(evento), { fonte: 'source', motivo: 'non-disponibile' })
  assert.equal(esitoLettura(evento), null)
  leggi([evento])
  assert.deepEqual(store.default.prepare('SELECT fonte FROM salute_fonti').all(), [])
})

test('le fasi che non sono fonti non si registrano; la frase viaggia solo se classificata', () => {
  for (const fase of ['lavoro', 'desktop-remoto', 'fine', 'errore']) assert.equal(esitoLettura({ fase, stato: 'guaio', errore: 'x' }), null, fase)
  assert.deepEqual(esitoLettura({ fase: 'calendario', stato: 'guaio', errore: 'raw', rimedio: 'credenziale', frase: 'Quell’indirizzo non è più valido' }),
    { fonte: 'calendario', esito: 'guaio', rimedio: 'credenziale', frase: 'Quell’indirizzo non è più valido', documenti: 0, tolti: 0 })
  assert.equal(esitoLettura({ fase: 'calendario', stato: 'guaio', errore: 'raw' })?.frase, null)
  // un rimedio inventato non passa
  assert.equal(esitoLettura({ fase: 'calendario', stato: 'guaio', rimedio: 'fantasia' })?.rimedio, 'guarda')
})

test('una lettura già in corso è un 409 nella lingua scelta', () => {
  const e = new LetturaInCorso()
  assert.equal(e.status, 409)
  assert.equal(e.perLingua('en'), 'A source read is already running. Wait for it to finish and try again.')
  assert.equal(e.perLingua('it'), 'Una lettura delle fonti è già in corso. Attendi che finisca e riprova.')
})

test('una rilettura chiesta durante una lettura aspetta che finisca, una volta per fonte, nel contesto di chi l’ha chiesta', async () => {
  const letture = lettureInCorso()
  const partite: string[] = []
  letture.add('a')
  chi.dentro('utente-a', () => {
    letture.dopo('a', 'note', () => partite.push(`note:${chi.adesso()}`))
    letture.dopo('a', 'note', () => partite.push(`note:${chi.adesso()}`))
  })
  // la lettura di un altro conto che finisce non la fa partire
  letture.add('b')
  letture.delete('b')
  await new Promise(r => setImmediate(r))
  assert.deepEqual(partite, [])
  assert.equal(letture.has('a'), true)
  letture.delete('a')
  assert.equal(letture.has('a'), false)
  await new Promise(r => setImmediate(r))
  assert.deepEqual(partite, ['note:utente-a'])
  // finita una volta, la coda è vuota
  letture.add('a'); letture.delete('a')
  await new Promise(r => setImmediate(r))
  assert.deepEqual(partite, ['note:utente-a'])
})
