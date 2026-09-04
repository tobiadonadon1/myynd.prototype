// Dare un lavoro a Claude Code.
//
// Qui non si prova che Claude Code funzioni — funziona, è un programma suo. Si
// prova il recinto: che non si possa mettere a lavorare in una cartella che non
// gli è stata data, che la richiesta resti testo invece di diventare un
// comando, e — in fondo — che cosa gli si concede di toccare quando parte da
// solo, che è l'altra metà dello stesso recinto.
//
//   node --test server/lavoro.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-lavoro-'))
const PROGETTO = join(CASA, 'Progetti')
const FUORI = join(CASA, 'Altrui')
mkdirSync(PROGETTO, { recursive: true })
mkdirSync(FUORI, { recursive: true })
process.env.HOME = CASA

const l = await import('./lavoro.ts')
after(() => rmSync(CASA, { recursive: true, force: true }))

const DESKTOP = { cartelle: [PROGETTO] }

test('fuori dalle cartelle collegate non lavora', async () => {
  await assert.rejects(
    () => l.fai(DESKTOP, { cartella: FUORI, richiesta: 'fai qualcosa', passo: 'piano' }),
    /solo nelle cartelle/
  )
})

test('un link simbolico non lo porta fuori', async () => {
  const ponte = join(PROGETTO, 'ponte')
  symlinkSync(FUORI, ponte)
  await assert.rejects(
    () => l.fai(DESKTOP, { cartella: ponte, richiesta: 'fai qualcosa', passo: 'piano' }),
    /solo nelle cartelle/
  )
})

test('senza cartelle collegate non parte', async () => {
  await assert.rejects(
    () => l.fai({ cartelle: [] }, { cartella: PROGETTO, richiesta: 'x', passo: 'piano' }),
    /Collega una cartella/
  )
})

test('una richiesta vuota non diventa un lavoro', async () => {
  await assert.rejects(
    () => l.fai(DESKTOP, { cartella: PROGETTO, richiesta: '   ', passo: 'piano' }),
    /niente da chiedergli/
  )
})

test('sa dire se Claude Code c’è su questa macchina', () => {
  // non si controlla *quale* risposta: si controlla che sia una risposta e non
  // un'esplosione, perché la schermata la usa per decidere se offrirlo
  const dove = l.installato()
  assert.ok(dove === null || dove.endsWith('/claude'))
})

// — cosa può toccare, quando parte da solo —
//
// `argomentiDi` è una superficie di sicurezza. Un `.claude/settings.json`
// dentro la cartella collegata può dichiarare hook — comandi che partono da
// soli, prima e dopo ogni attrezzo — e un `.mcp.json` può dichiarare server a
// cui parlare: li ha scritti chi ha fatto quel progetto, non chi l'ha
// collegato. Queste prove esistono per il giorno in cui qualcuno «ripulisce»
// questi argomenti senza sapere cosa tengono chiuso.

/** Il valore che segue una bandiera, per non dipendere dall'ordine. */
function dopo(args: string[], bandiera: string): string | undefined {
  const i = args.indexOf(bandiera)
  return i < 0 ? undefined : args[i + 1]
}

test('le impostazioni del progetto non si caricano, in nessuno dei due passi', () => {
  for (const passo of ['piano', 'fai'] as const) {
    const a = l.argomentiDi(passo)
    assert.equal(dopo(a, '--setting-sources'), 'user', `${passo}: solo le impostazioni della persona`)
    assert.ok(a.includes('--strict-mcp-config'), `${passo}: nessun server MCP del progetto`)
    // `--strict-mcp-config` da solo vuol dire «nessuno»: un `--mcp-config` qui
    // rimetterebbe in gioco proprio i file che stiamo escludendo
    assert.ok(!a.includes('--mcp-config'), `${passo}: e nessuno da caricare`)
  }
})

test('in modalità piano non c’è né shell né rete', () => {
  const a = l.argomentiDi('piano')
  assert.equal(dopo(a, '--permission-mode'), 'plan')
  const i = a.indexOf('--disallowedTools')
  assert.ok(i > 0, 'gli attrezzi negati ci sono')
  // è variadico: quello che segue, fino alla fine, sono i nomi
  const negati = a.slice(i + 1)
  for (const n of ['Bash', 'WebFetch', 'WebSearch']) {
    assert.ok(negati.includes(n), `${n} è negato in modalità piano`)
  }
})

test('il passo che tocca i file lo chiede una persona, e allora può scrivere', () => {
  const a = l.argomentiDi('fai')
  assert.equal(dopo(a, '--permission-mode'), 'acceptEdits')
  // qui `Bash` serve — è come si fa girare una prova dopo aver cambiato un file —
  // e la differenza è che questo passo lo ha letto e premuto qualcuno
  assert.ok(!a.includes('--disallowedTools'), 'nessun attrezzo negato dopo l’approvazione')
})

test('la richiesta è un argomento, non un pezzo di riga di comando', () => {
  const cattiva = 'scrivi una nota; rm -rf ~'
  const a = l.argomentiDi('piano', cattiva)
  // intero e da solo: se finisse dentro una stringa di shell, il punto e
  // virgola smetterebbe di essere testo
  assert.equal(a[a.indexOf('-p') + 1], cattiva)
})
