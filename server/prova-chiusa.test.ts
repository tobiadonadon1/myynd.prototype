// Il recinto della prova (P6): le porte chiuse, l'orologio, il conto.
//
//   node --test server/prova-chiusa.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-recinto-'))
mkdirSync(join(CASA, '.myynd'), { recursive: true })
const CASA_VERA = process.env.HOME
process.env.HOME = CASA
process.env.MYYND_DATI = join(CASA, '.myynd')
writeFileSync(join(CASA, '.myynd', 'config.json'), JSON.stringify({ lingua: 'it' }), { mode: 0o600 })

const pc = await import('./prova-chiusa.ts')
const agenda = await import('./agenda.ts')
const microsoft = await import('./connettori/microsoft.ts')
const bozze = await import('./mailbox-drafts.ts')
const invio = await import('./invio.ts')
const postaUscita = await import('./postaUscita.ts')
const posta = await import('./connettori/posta.ts')
const google = await import('./connettori/google.ts')
const mani = await import('./mani.ts')
const lavoro = await import('./lavoro.ts')
const cfg = await import('./config.ts')
const store = await import('./store.ts')

after(() => {
  store.chiudiIndici()
  process.env.HOME = CASA_VERA
  rmSync(CASA, { recursive: true, force: true })
})

const nuovo = (al: string | null = '2026-09-01T09:00:00.000Z'): import('./prova-chiusa.ts').Contesto =>
  ({ tipo: 'prova', prova: 'p1', al, conto: { gettoni: 0, tetto: 100, sforato: false }, parziale: new Set() })

const x = {} as never
/** Ogni porta, chiamata davvero: dentro la prova deve lanciare prima di fare qualunque cosa. */
const PORTE: Record<string, () => unknown> = {
  'agenda.prossimi': () => agenda.prossimi(),
  'agenda.aggiungi': () => agenda.aggiungi([]),
  'agenda.aggiungiVerificati': () => agenda.aggiungiVerificati([], 'x'),
  'agenda.creaEvento': () => agenda.creaEvento({}),
  'agenda.modificaEvento': () => agenda.modificaEvento('x', {}),
  'agenda.eliminaEvento': () => agenda.eliminaEvento('x'),
  'microsoft.prossimi': () => microsoft.prossimi(),
  'mailbox-drafts.salvaBozzaCasella': () => bozze.salvaBozzaCasella('c', 's', x),
  'mailbox-drafts.salvaRevisioneCasella': () => bozze.salvaRevisioneCasella(x, x),
  'invio.manda': () => invio.manda(x, x, x),
  'postaUscita.manda': () => postaUscita.manda(x),
  'posta.invia': () => posta.invia(x, x),
  'posta.salvaBozza': () => posta.salvaBozza(x, 's', x, 'm'),
  'posta.aggiornaBozza': () => (posta.aggiornaBozza as (...a: unknown[]) => unknown)(x, 's', 'o', x, 'm', x),
  'posta.sposta': () => (posta.sposta as (...a: unknown[]) => unknown)(x, [], 'x'),
  'posta.verificaEArchiviaPerRegola': () => posta.verificaEArchiviaPerRegola(x, 'i', 's', null),
  'google.cestina': () => google.cestina(['google:1']),
  'google.archivia': () => google.archivia(['google:1']),
  'google.salvaBozza': () => google.salvaBozza('s', x, 'm'),
  'google.aggiornaBozza': () => (google.aggiornaBozza as (...a: unknown[]) => unknown)('s', 'd', x, 'm', x),
  'google.verificaEArchiviaPerRegola': () => google.verificaEArchiviaPerRegola('google:1', 's', 'm'),
  'google.mettiInAgenda': () => google.mettiInAgenda([]),
  'mani.salvaConsegna': () => mani.salvaConsegna({ titolo: 't', testo: 'x', luogo: 'myynd' as never }),
  'mani.crea_nota': () => mani.esegui('crea_nota', { titolo: 't', testo: 'x' }),
  'mani.scrivi_file': () => mani.esegui('scrivi_file', { percorso: 'a.md', testo: 'x' }),
  'mani.lavora_nel_codice': () => mani.esegui('lavora_nel_codice', { richiesta: 'x' }, { cartella: CASA }),
  'lavoro.fai': () => lavoro.fai(null, { cartella: CASA, richiesta: 'x', passo: 'piano' as never }),
  'config.aggiorna': () => cfg.aggiorna({ lingua: 'en' })
}

async function lancia(f: () => unknown): Promise<unknown> {
  try { await f() } catch (e) { return e }
  return null
}

test('ogni porta chiusa lancia «prova-chiusa» dentro la prova', async () => {
  for (const nome of pc.PORTE_CHIUSE) {
    if (nome === 'mani.crea_documento_app') continue // sta dentro claude.svolgi: la guarda il test sorgente sotto
    assert.ok(PORTE[nome], `manca la porta ${nome} nella prova`)
    const e = await pc.dentroLaProva(nuovo(), () => lancia(PORTE[nome]))
    assert.ok(pc.eChiusa(e), `${nome} non lancia dentro la prova: ${e instanceof Error ? e.message : e}`)
    assert.equal((e as { porta: string }).porta, nome)
  }
  // la configurazione non è cambiata
  assert.equal(cfg.leggi().lingua, 'it')
})

test('fuori dalla prova le porte non sono chiuse (controcaso)', () => {
  for (const nome of pc.PORTE_CHIUSE) assert.doesNotThrow(() => pc.vietato(nome))
})

test('ogni porta dell\'elenco ha il suo vietato() nel codice', () => {
  const file: Record<string, string> = {
    agenda: 'agenda.ts', microsoft: 'connettori/microsoft.ts', 'mailbox-drafts': 'mailbox-drafts.ts', invio: 'invio.ts',
    postaUscita: 'postaUscita.ts', posta: 'connettori/posta.ts', google: 'connettori/google.ts', mani: 'mani.ts',
    lavoro: 'lavoro.ts', config: 'config.ts'
  }
  for (const nome of pc.PORTE_CHIUSE) {
    const [mod] = nome.split('.')
    if (nome === 'mani.crea_documento_app') {
      assert.match(readFileSync(new URL('./claude.ts', import.meta.url), 'utf8'), /vietato\('mani\.crea_documento_app'\)/)
      continue
    }
    const testo = readFileSync(new URL(`./${file[mod]}`, import.meta.url), 'utf8')
    if (mod === 'mani' && nome !== 'mani.salvaConsegna') assert.match(testo, /vietato\(`mani\.\$\{nome\}`\)/)
    else assert.ok(testo.includes(`vietato('${nome}')`), `${nome} senza vietato()`)
  }
})

test('l\'orologio segna l\'ora della prova dentro, adesso fuori; fuori() scappa', () => {
  const T = '2026-09-01T09:00:00.000Z'
  const dentro = pc.dentroLaProva(nuovo(T), () => pc.adesso())
  assert.equal(dentro, Date.parse(T))
  const prima = Date.now()
  assert.ok(pc.adesso() >= prima)
  const scappato = pc.dentroLaProva(nuovo(T), () => pc.fuori(() => [pc.inProva(), pc.adesso()] as const))
  assert.equal(scappato[0], null)
  assert.ok(scappato[1] >= prima)
  // il vassoio non ha un'ora: adesso
  assert.ok(pc.dentroLaProva(nuovo(null), () => pc.adesso()) >= prima)
})

test('un recinto chiuso si ignora', () => {
  const c = nuovo()
  c.chiusa = true
  assert.equal(pc.dentroLaProva(c, () => pc.inProva()), null)
  assert.doesNotThrow(() => pc.dentroLaProva(c, () => pc.vietato('config.aggiorna')))
})

test('controllaBudget segna sforato e lancia oltre il tetto; conta non fa niente fuori', () => {
  const c = nuovo()
  pc.dentroLaProva(c, () => { pc.conta(60); pc.controllaBudget() })
  assert.equal(c.conto.sforato, false)
  pc.conta(1000)
  assert.equal(c.conto.gettoni, 60)
  assert.throws(() => pc.dentroLaProva(c, () => { pc.conta(50); pc.controllaBudget() }), new RegExp(pc.BUDGET))
  assert.equal(c.conto.sforato, true)
})
