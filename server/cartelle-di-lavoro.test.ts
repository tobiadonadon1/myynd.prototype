import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, utimesSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cartelleDiLavoro, documentiDiLavoro } from './connettori/desktop.ts'

const casa = mkdtempSync(join(tmpdir(), 'myynd-cartelle-'))
after(() => rmSync(casa, { recursive: true, force: true }))

const git = (dir: string, ...args: string[]) => execFileSync('git', ['-C', dir, ...args], { stdio: 'pipe', env: { ...process.env, GIT_AUTHOR_NAME: 'prova', GIT_AUTHOR_EMAIL: 'p@example.com', GIT_COMMITTER_NAME: 'prova', GIT_COMMITTER_EMAIL: 'p@example.com', GIT_AUTHOR_DATE: '2026-09-10T10:00:00Z', GIT_COMMITTER_DATE: '2026-09-10T10:00:00Z' } })

test('le cartelle di lavoro sono i progetti di codice, con la storia: commit, README, file toccati; le altre no', async () => {
  mkdirSync(join(casa, 'x-engine'))
  writeFileSync(join(casa, 'x-engine', 'package.json'), '{}')
  writeFileSync(join(casa, 'x-engine', 'README.md'), '# x-engine\n\nPosts to X with Hermes.\n')
  writeFileSync(join(casa, 'x-engine', 'TODO.md'), '- reply path\n- rate limits\n')
  git(join(casa, 'x-engine'), 'init', '-q')
  git(join(casa, 'x-engine'), 'add', '.')
  git(join(casa, 'x-engine'), 'commit', '-q', '-m', 'browser reply path working: per-target isolation')
  mkdirSync(join(casa, 'Desktop', 'everwave'), { recursive: true })
  mkdirSync(join(casa, 'Desktop', 'everwave', '.git'))
  writeFileSync(join(casa, 'Desktop', 'everwave', 'main.swift'), '')
  mkdirSync(join(casa, 'Documents', 'Fatture'), { recursive: true })
  writeFileSync(join(casa, 'Documents', 'Fatture', 'a.pdf'), '')
  mkdirSync(join(casa, '.hermes'))
  writeFileSync(join(casa, '.hermes', 'package.json'), '{}')
  mkdirSync(join(casa, 'node_modules', 'lib'), { recursive: true })
  writeFileSync(join(casa, 'node_modules', 'lib', 'package.json'), '{}')
  const vecchio = new Date(Date.now() - 10 * 86_400_000)
  for (const f of ['package.json', 'README.md', 'TODO.md']) utimesSync(join(casa, 'x-engine', f), vecchio, vecchio)
  const c = await cartelleDiLavoro([casa])
  assert.deepEqual(c.map(x => x.nome), ['everwave', 'x-engine'])
  const x = c[1]
  assert.equal(x.readme, '# x-engine Posts to X with Hermes.')
  assert.equal(x.appunti, '- reply path - rate limits')
  assert.deepEqual(x.commit, [{ quando: '2026-09-10', messaggio: 'browser reply path working: per-target isolation' }])
  assert.ok(x.recenti.includes('README.md'))
  assert.equal(c[0].commit.length, 0, 'un .git vuoto non ha storia, e non è un errore')
  assert.ok(Date.parse(c[0].modificata) > Date.parse(x.modificata))

  // come documenti dell'indice: uno per cartella, con la storia nel corpo
  const docs = await documentiDiLavoro([casa])
  const d = docs.find(d => d.titolo === 'Lavoro: x-engine')!
  assert.equal(d.id, `lavoro:${join(casa, 'x-engine')}`)
  assert.equal(d.fonte, 'lavoro')
  assert.equal(d.percorso, join(casa, 'x-engine'))
  assert.match(d.corpo, /Ultimi commit:\n2026-09-10  browser reply path working/)
  assert.match(d.corpo, /README: # x-engine Posts to X with Hermes\./)
  assert.match(d.corpo, /Appunti: - reply path/)
  // al giorno, non al secondo: una cartella dove gira un programma cambia data di continuo
  assert.equal(d.quando, `${x.modificata.slice(0, 10)}T12:00:00.000Z`)
  assert.doesNotMatch(d.corpo, /File toccati/)
})
