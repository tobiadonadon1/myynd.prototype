// Una Myynd sola sul Mac (build/una-sola.cjs).
//
// «Non voglio mille versioni di Myynd sul computer»: ogni pacchetto lasciava
// copie registrate in Launch Services e indicizzate da Spotlight. Qui si prova
// la parte che decide, con un lsregister finto: nessuna prova tocca il Mac.
//
//   node --test desktop/una-sola.test.ts

import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { registrate, daTogliere, unaSola, INSTALLATA } = createRequire(import.meta.url)('../build/una-sola.cjs')

const blocco = (percorso: string, id: string) => [
  '--------------------------------------------------------------------------------',
  'bundle id:                  4242',
  `path:                       ${percorso} (0x1a2b)`,
  'name:                       Myynd',
  `identifier:                 ${id}`,
  'version:                    0.2.41'
].join('\n')

const DUMP = [
  blocco('/Applications/Myynd.app', 'com.myynd.app'),
  blocco('/Applications/Myynd.app/Contents/Frameworks/Myynd Helper.app', 'com.myynd.app.helper'),
  blocco('/Users/x/myynd/dist-app/mac-arm64/Myynd.app', 'com.myynd.app'),
  blocco('/Users/x/myynd/.claude/worktrees/a/dist-app/mac/Myynd.app', 'com.myynd.app'),
  blocco('/Volumes/Myynd 0.2.40-arm64/Myynd.app', 'com.myynd.app'),
  blocco('/Applications/Safari.app', 'com.apple.Safari')
].join('\n')

test('from the Launch Services dump, only Myynd itself is read, never its helpers or other apps', () => {
  assert.deepEqual(registrate(DUMP), [
    '/Applications/Myynd.app',
    '/Users/x/myynd/dist-app/mac-arm64/Myynd.app',
    '/Users/x/myynd/.claude/worktrees/a/dist-app/mac/Myynd.app',
    '/Volumes/Myynd 0.2.40-arm64/Myynd.app'
  ])
})

test('every copy goes except the one in /Applications', () => {
  assert.deepEqual(daTogliere(registrate(DUMP)), [
    '/Users/x/myynd/dist-app/mac-arm64/Myynd.app',
    '/Users/x/myynd/.claude/worktrees/a/dist-app/mac/Myynd.app',
    '/Volumes/Myynd 0.2.40-arm64/Myynd.app'
  ])
  assert.equal(INSTALLATA, '/Applications/Myynd.app')
})

test('after a build: build outputs are unregistered and dist-app is never indexed; a dry run touches nothing', () => {
  const radice = mkdtempSync(join(tmpdir(), 'myynd-una-sola-'))
  try {
    // un pacchetto appena fatto: Launch Services non lo nomina ancora, ma va tolto lo stesso
    mkdirSync(join(radice, 'dist-app', 'mac-arm64', 'Myynd.app'), { recursive: true })
    const appena = join(radice, 'dist-app', 'mac-arm64', 'Myynd.app')
    const chiamate: string[][] = []
    const esegui = (args: string[]) => { chiamate.push(args); return { stdout: args[0] === '-dump' ? DUMP : '' } }

    const prova = unaSola({ radice, prova: true, esegui })
    assert.ok(prova.tolte.includes(appena))
    assert.deepEqual(chiamate, [['-dump']], 'a dry run only reads')
    assert.equal(existsSync(join(radice, 'dist-app', '.metadata_never_index')), false)

    chiamate.length = 0
    const r = unaSola({ radice, esegui })
    assert.equal(r.resta, '/Applications/Myynd.app')
    const tolte = chiamate.filter(a => a[0] === '-u').map(a => a[1])
    assert.ok(tolte.includes(appena))
    assert.ok(tolte.includes('/Volumes/Myynd 0.2.40-arm64/Myynd.app'))
    assert.ok(!tolte.includes('/Applications/Myynd.app'), 'the installed app stays registered')
    assert.ok(existsSync(join(radice, 'dist-app', '.metadata_never_index')))
  } finally { rmSync(radice, { recursive: true, force: true }) }
})

test('packaging and the packaged-app probe both clean up, and the app keeps a single-instance lock', () => {
  const leggi = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')
  const configura = leggi('../build/configura.cjs')
  assert.match(configura, /afterAllArtifactBuild[\s\S]*unaSola\(/)
  assert.match(configura, /nonIndicizzare\(/)
  assert.match(leggi('../prove/app.mjs'), /unaSola\(/)
  // la seconda apertura porta su la prima, non ne fa partire un'altra
  const main = leggi('./main.ts')
  assert.match(main, /if \(!app\.requestSingleInstanceLock\(\)\) \{\s*app\.quit\(\)/)
  assert.match(main, /app\.on\('second-instance', finestra\.mostra\)/)
})
