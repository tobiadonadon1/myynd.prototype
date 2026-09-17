import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cartelleDiLavoro } from './connettori/desktop.ts'

const casa = mkdtempSync(join(tmpdir(), 'myynd-cartelle-'))
after(() => rmSync(casa, { recursive: true, force: true }))

test('le cartelle di lavoro sono i progetti di codice, con la data e il README, dalla più recente', async () => {
  mkdirSync(join(casa, 'x-engine'))
  writeFileSync(join(casa, 'x-engine', 'package.json'), '{}')
  writeFileSync(join(casa, 'x-engine', 'README.md'), '# x-engine\n\nPosts to X with Hermes.\n')
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
  utimesSync(join(casa, 'x-engine', 'package.json'), vecchio, vecchio)
  utimesSync(join(casa, 'x-engine', 'README.md'), vecchio, vecchio)
  const c = await cartelleDiLavoro([casa])
  assert.deepEqual(c.map(x => x.nome), ['everwave', 'x-engine'])
  assert.equal(c[1].readme, '# x-engine Posts to X with Hermes.')
  assert.equal(c[0].readme, '')
  assert.ok(Date.parse(c[0].modificata) > Date.parse(c[1].modificata))
})
