// I segnali senza permessi: Spotlight (uscite scritte a mano), i repository
// (creati qui, in una cartella temporanea), gli editor (un state.vscdb finto).
// Nessun comando guarda il Mac di chi fa girare le prove.
//
//   node --import ./build/test-profile.mjs --test server/segnali-mac.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as spot from './connettori/spotlight-recenti.ts'
import * as git from './connettori/git-profondo.ts'
import * as ed from './connettori/editor-recenti.ts'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-segnali-mac-'))
after(() => rmSync(CASA, { recursive: true, force: true }))

/* ------------------------------------------------------------- Spotlight */

test('Spotlight: gli argomenti chiedono sette giorni sotto casa, data e numero di usi', () => {
  assert.deepEqual(spot.argomentiRecenti('/Users/anna'), ['-onlyin', '/Users/anna', '-attr', 'kMDItemLastUsedDate', '-attr', 'kMDItemUseCount', 'kMDItemLastUsedDate >= $time.today(-7)'])
})

test('Spotlight: l’uscita di mdfind diventa percorso, quando e quante volte; Library, cache, node_modules, .git e nascosti fuori', () => {
  const uscita = [
    '/Users/anna/Documents/Northwind offer.pages   kMDItemLastUsedDate = 2026-10-16 09:12:33 +0000   kMDItemUseCount = 4',
    '/Users/anna/Code/northwind/src/pricing.ts   kMDItemLastUsedDate = 2026-10-16 10:01:00 +0000   kMDItemUseCount = (null)',
    '/Users/anna/Library/Caches/x.db   kMDItemLastUsedDate = 2026-10-16 09:00:00 +0000   kMDItemUseCount = 9',
    '/Users/anna/Code/northwind/node_modules/a/index.js   kMDItemLastUsedDate = 2026-10-16 09:00:00 +0000   kMDItemUseCount = 1',
    '/Users/anna/.ssh/config   kMDItemLastUsedDate = 2026-10-16 09:00:00 +0000   kMDItemUseCount = 1',
    '/Users/anna/Code/northwind/.git/HEAD   kMDItemLastUsedDate = 2026-10-16 09:00:00 +0000   kMDItemUseCount = 1',
    '/Applications/Safari.app   kMDItemLastUsedDate = 2026-10-16 09:00:00 +0000   kMDItemUseCount = 100',
    '/Users/anna/Desktop/senza data.txt   kMDItemLastUsedDate = (null)   kMDItemUseCount = 1',
    'riga rotta',
    ''
  ].join('\n')
  const r = spot.leggiUscita(uscita, '/Users/anna')
  assert.deepEqual(r, [
    { percorso: '/Users/anna/Code/northwind/src/pricing.ts', usato: '2026-10-16T10:01:00.000Z', volte: 1 },
    { percorso: '/Users/anna/Documents/Northwind offer.pages', usato: '2026-10-16T09:12:33.000Z', volte: 4 }
  ])
})

test('Spotlight: le cartelle .git diventano repository, a tre livelli al massimo', () => {
  const uscita = ['/Users/anna/Code/northwind/.git', '/Users/anna/a/b/c/d/.git', '/Users/anna/Library/x/.git', '/Users/anna/.config/y/.git', '/tmp/z/.git', '/Users/anna/Code/harbor/.git'].join('\n')
  assert.deepEqual(spot.leggiRepository(uscita, '/Users/anna'), ['/Users/anna/Code/northwind', '/Users/anna/Code/harbor'])
})

test('Spotlight: con un esecutore finto, recenti() passa gli argomenti e legge la risposta', async () => {
  let chiesto: string[] = []
  const r = await spot.recenti({ casa: '/Users/anna', esegui: async (cmd, a) => { chiesto = [cmd, ...a]; return '/Users/anna/x.md   kMDItemLastUsedDate = 2026-10-16 09:12:33 +0000   kMDItemUseCount = 2\n' } })
  assert.equal(chiesto[0], 'mdfind')
  assert.equal(r.length, 1)
})

/* ------------------------------------------------------------------- git */

const g = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' }, stdio: ['ignore', 'pipe', 'pipe'] }).toString()

test('git: ramo, modifiche non salvate, commit suoi e di altri, rami recenti; mai il contenuto', async () => {
  const repo = join(CASA, 'Code', 'northwind')
  mkdirSync(join(repo, 'src'), { recursive: true })
  g(repo, 'init', '-q', '-b', 'main')
  g(repo, 'config', 'user.email', 'anna@esempio.it')
  g(repo, 'config', 'user.name', 'Anna')
  writeFileSync(join(repo, 'src', 'pricing.ts'), 'export const PREZZO_SEGRETO = 42\n')
  g(repo, 'add', '.')
  g(repo, 'commit', '-q', '-m', 'Prezzi della proposta')
  writeFileSync(join(repo, 'README.md'), 'Northwind\n')
  g(repo, 'add', '.')
  g(repo, '-c', 'user.email=marta@altro.it', '-c', 'user.name=Marta', 'commit', '-q', '-m', 'Review fixes')
  g(repo, 'checkout', '-q', '-b', 'feature/offerta')
  writeFileSync(join(repo, 'src', 'pricing.ts'), 'export const PREZZO_SEGRETO = 43\n')
  writeFileSync(join(repo, 'nuovo.txt'), 'x')

  const s = await git.statoRepo(repo, ['ANNA@esempio.it'])
  assert.ok(s)
  assert.equal(s!.nome, 'northwind')
  assert.equal(s!.ramo, 'feature/offerta')
  assert.equal(s!.modifiche, 2)
  assert.deepEqual(s!.commit.map(c => [c.messaggio, c.mio, c.autore]), [['Review fixes', false, 'Marta'], ['Prezzi della proposta', true, 'Anna']])
  assert.ok(s!.commit.every(c => /^\d{4}-\d\d-\d\dT/.test(c.quando) && c.hash.length === 12))
  assert.deepEqual(s!.rami.map(r => r.nome).sort(), ['feature/offerta', 'main'])
  assert.ok(!JSON.stringify(s).includes('PREZZO_SEGRETO'), 'nessun contenuto di file')
  // il repository di un file appena usato, risalendo
  assert.equal(git.repoDelFile(join(repo, 'src', 'pricing.ts'), CASA), repo)
  assert.equal(git.repoDelFile(join(CASA, 'altro', 'x.txt'), CASA), null)
  // una cartella che non è un repository
  assert.equal(await git.statoRepo(join(CASA, 'Code')), null)
})

test('git: le letture pure', () => {
  const US = '\u001f'
  const c = git.leggiLog(`abc123456789def${US}2026-10-16T09:00:00+02:00${US}Anna${US}Anna@Esempio.it${US}Fix${US}more\n`, new Set(['anna@esempio.it']))
  assert.deepEqual(c, [{ hash: 'abc123456789', quando: '2026-10-16T07:00:00.000Z', autore: 'Anna', email: 'anna@esempio.it', mio: true, messaggio: `Fix${US}more` }])
  assert.equal(git.contaModifiche(' M a.ts\n?? b.txt\n'), 2)
  assert.deepEqual(git.leggiRami(`main${US}2026-10-16T09:00:00Z\nrotto\n`), [{ nome: 'main', quando: '2026-10-16T09:00:00.000Z' }])
})

/* ---------------------------------------------------------------- editor */

test('editor: «Apri recenti» da state.vscdb e gli spazi di lavoro con la loro data', () => {
  const utente = join(CASA, 'Library', 'Application Support', 'Cursor', 'User')
  mkdirSync(join(utente, 'globalStorage'), { recursive: true })
  const db = new DatabaseSync(join(utente, 'globalStorage', 'state.vscdb'))
  db.exec('CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)')
  db.prepare('INSERT INTO ItemTable (key, value) VALUES (?, ?)').run('history.recentlyOpenedPathsList', JSON.stringify({
    entries: [
      { folderUri: pathToFileURL('/Users/anna/Code/northwind').href },
      { fileUri: pathToFileURL('/Users/anna/Documents/note harbor.md').href },
      { workspace: { id: 'x', configPath: pathToFileURL('/Users/anna/w.code-workspace').href } },
      { folderUri: 'vscode-remote://ssh-remote+box/home/x' }
    ]
  }))
  db.prepare('INSERT INTO ItemTable (key, value) VALUES (?, ?)').run('altro', 'x')
  db.close()
  const spazio = join(utente, 'workspaceStorage', 'abc123')
  mkdirSync(spazio, { recursive: true })
  writeFileSync(join(spazio, 'workspace.json'), JSON.stringify({ folder: pathToFileURL('/Users/anna/Code/harbor').href }))
  writeFileSync(join(spazio, 'state.vscdb'), '')
  const t = new Date('2026-10-16T11:00:00.000Z')
  utimesSync(join(spazio, 'state.vscdb'), t, t)
  mkdirSync(join(utente, 'workspaceStorage', 'rotto'), { recursive: true })

  const v = ed.leggiEditor({ casa: CASA })
  assert.deepEqual(v, [
    { editor: 'Cursor', percorso: '/Users/anna/Code/harbor', genere: 'cartella', quando: '2026-10-16T11:00:00.000Z' },
    { editor: 'Cursor', percorso: '/Users/anna/Code/northwind', genere: 'cartella', quando: null },
    { editor: 'Cursor', percorso: '/Users/anna/Documents/note harbor.md', genere: 'file', quando: null },
    { editor: 'Cursor', percorso: '/Users/anna/w.code-workspace', genere: 'spazio', quando: null }
  ])
  assert.deepEqual(ed.leggiRecenti('non json', 'VS Code'), [])
})
