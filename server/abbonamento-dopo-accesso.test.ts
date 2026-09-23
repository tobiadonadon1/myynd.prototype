// Dopo l'accesso all'account Claude, la risposta è «sì» subito.
//
// `claude auth status` impiega da due decimi di secondo a qualche secondo, e
// la sua risposta vale mezzo minuto. Una verifica partita *prima* che
// l'accesso finisse ha visto «non entrato»: se arriva dopo, e scrive, la
// scheda e le preferenze dicono «da collegare» per trenta secondi a chi ha
// appena fatto l'accesso — mentre la prima pagina dice il contrario.
//
//   node --test server/abbonamento-dopo-accesso.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { syncBuiltinESMExports } from 'node:module'
import fs from 'node:fs'
import childProcess from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type Finto = EventEmitter & { stdout: PassThrough; stderr: PassThrough; stdin: PassThrough; kill(): boolean }

test('una verifica partita prima della fine dell’accesso non lascia «non entrato» per mezzo minuto', async t => {
  const dir = fs.mkdtempSync(join(tmpdir(), 'myynd-dopo-accesso-'))
  process.env.MYYND_DATI = dir
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const esiste = fs.existsSync
  t.mock.method(fs, 'existsSync', (p: fs.PathLike) => String(p).endsWith('/claude') || esiste(p))

  // Claude Code finto: `auth status` risponde con quello che vedeva quando è
  // partito; il primo resta appeso finché la prova non lo lascia andare
  let entrato = false
  let trattieni = true
  const appese: (() => void)[] = []
  let verifiche = 0
  let accesso: Finto | null = null
  t.mock.method(childProcess, 'spawn', (_exe: string, args: string[]) => {
    const p: Finto = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), kill() { return true }
    })
    if (args[0] === 'auth' && args[1] === 'login') { accesso = p; return p }
    verifiche++
    const visto = JSON.stringify({ loggedIn: entrato })
    const rispondi = () => { p.stdout.emit('data', visto); p.emit('close', 0) }
    if (trattieni) { trattieni = false; appese.push(rispondi) } else setImmediate(rispondi)
    return p
  })
  syncBuiltinESMExports()
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports() })

  const a = await import('./abbonamento.ts')

  // 1. la scheda chiede «ci è entrato?» e Claude Code ci mette un po'
  const primaDomanda = a.entrato()
  assert.equal(verifiche, 1)

  // 2. intanto l'accesso nel browser va a buon fine
  const { loginId } = a.iniziaAccesso()
  entrato = true
  accesso!.emit('close', 0)
  assert.equal(a.statoAccesso(loginId)?.stato, 'completed')

  // 3. la verifica vecchia risponde adesso, con quello che aveva visto prima
  appese[0]()

  // 4. chi chiede dopo l'accesso sente la verità, non la fotografia di prima
  const dopo = await a.stato()
  assert.equal(dopo.entrato, true, 'la verifica di prima ha scritto «non entrato» sopra un accesso appena fatto')
  assert.equal(dopo.verificaInSospeso, false)
  assert.equal(await primaDomanda, true, 'anche chi aveva chiesto prima deve ricevere la risposta di adesso')
  assert.equal(await a.entrato(), true)
})
