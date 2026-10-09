// Il primo avvio per chi arriva da zero: chi ragiona, per chi è, la posta.
//
// Le scelte stanno in `onboarding/primo-avvio.ts`, senza React: qui si prova
// l'ordine delle strade (prima quella che non chiede niente), che la domanda
// «per chi è» cambia solo esempi e ordine, che sul Mac la posta di serie è
// Mail del Mac, e i due passi di Gmail. Le schermate le fotografa
// `prove/passi/primo-avvio-pubblico.json`.
//
//   node --test src/primo-avvio.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const { STRADE, CONSIGLIATA, stradeQui, prioritaFonti, esempi, gmailPerLeApp, pubblicoDi } = await import('./onboarding/primo-avvio.ts')

const dizionario = readFileSync(new URL('./lingua.ts', import.meta.url), 'utf8')
const tradotta = (k: string) => dizionario.includes(`'${k}':`)

test('with nothing connected, ChatGPT sign-in comes first and is the recommended one; Claude says it needs Claude Code', () => {
  assert.deepEqual(STRADE.map(s => s.id), ['chatgpt', 'claude', 'chiave', 'locale'])
  assert.equal(CONSIGLIATA, 'chatgpt')
  assert.match(STRADE[1]!.nota, /Claude Code/)
  assert.equal(STRADE.find(s => s.id === 'locale')!.connettore, 'compatibile')
  for (const s of STRADE) { assert.ok(tradotta(s.nome), s.nome); assert.ok(tradotta(s.nota), s.nota) }
  // su un server gli account e il modello in casa non esistono: resta la chiave
  assert.deepEqual(stradeQui(true).map(s => s.id), ['chiave'])
  assert.equal(stradeQui(false), STRADE)
})

test('the onboarding uses the four routes, the recommended mark and a link to get Claude Code', () => {
  const onboarding = readFileSync(new URL('./onboarding/Onboarding.tsx', import.meta.url), 'utf8')
  assert.match(onboarding, /stradeQui\(s\.ospitato\)\.map\(/)
  assert.match(onboarding, /x\.id === CONSIGLIATA && <em>\{t\('Consigliato'\)\}<\/em>/)
  assert.match(onboarding, /href="https:\/\/claude\.com\/claude-code"/)
  assert.match(onboarding, /<FormStrada strada=\{strada\}/)
})

test('the intro no longer says "no model included": it says how Myynd thinks, short', () => {
  const intro = readFileSync(new URL('./onboarding/Introduzione.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(intro, /Nessun modello incluso|Con la tua chiave/)
  assert.match(intro, /Ragiona con ChatGPT, Claude o un modello sul tuo Mac\./)
  assert.ok(tradotta('Ragiona con ChatGPT, Claude o un modello sul tuo Mac. Cancelli tutto quando vuoi.'))
})

test('on a Mac, Mail on this Mac is the mail route: right after the Mac, and IMAP mail moves behind "All sources"', () => {
  for (const p of ['persona', 'azienda'] as const) {
    const l = prioritaFonti(true, p)
    assert.equal(l[0], 'desktop')
    assert.equal(l[1], 'postamac')
    assert.ok(!l.includes('posta'), 'IMAP is still there, behind All sources and a link under Mail on this Mac')
    assert.equal(l.length, 9)
  }
  // fuori dal Mac Mail del Mac non c'è: la posta resta la casella
  assert.ok(prioritaFonti(false, 'persona').includes('posta'))
  const onboarding = readFileSync(new URL('./onboarding/Onboarding.tsx', import.meta.url), 'utf8')
  assert.match(onboarding, /scelta\.id === 'postamac'[^\n]*onClick=\{\(\) => apri\('posta'\)\}/)
})

test('Mail on this Mac without Full Disk Access: three numbered steps, open Settings and reopen Myynd, no Connect that would fail', () => {
  const forms = readFileSync(new URL('./components/forms.tsx', import.meta.url), 'utf8')
  const posta = forms.slice(forms.indexOf('export function FormPostaMac'), forms.indexOf('function GuidaDisco'))
  assert.match(posta, /accesso === 'no' && d\?\.riavvia\s*\? <GuidaDisco/)
  assert.match(posta, /\{!\(accesso === 'no' && d\?\.riavvia\) && <Conferma/)
  const guida = forms.slice(forms.indexOf('function GuidaDisco'))
  assert.match(guida, /apriFuori\(PANNELLO_ACCESSO_DISCO\)/)
  assert.match(guida, /bottone: t\('Riapri Myynd'\), fai: riapri/)
  for (const k of ['Apri Impostazioni di Sistema › Privacy e sicurezza › Accesso completo al disco.', 'Accendi l’interruttore di Myynd.', 'Riapri Myynd: si riprende da qui.']) assert.ok(tradotta(k), k)
})

test('who it is for changes examples and order only, never what can be connected', () => {
  const persona = prioritaFonti(true, 'persona'), azienda = prioritaFonti(true, 'azienda')
  assert.ok(azienda.indexOf('slack') < azienda.indexOf('calendario'))
  assert.ok(persona.indexOf('note') < persona.indexOf('slack'))
  assert.notDeepEqual(esempi('persona'), esempi('azienda'))
  for (const e of [esempi('persona'), esempi('azienda')]) for (const v of Object.values(e)) assert.ok(tradotta(v), v)
  assert.equal(pubblicoDi('azienda'), 'azienda')
  assert.equal(pubblicoDi(null), 'persona')
  assert.equal(pubblicoDi('team'), 'persona')
  const onboarding = readFileSync(new URL('./onboarding/Onboarding.tsx', import.meta.url), 'utf8')
  assert.match(onboarding, /api\.profilo\(\{ pubblico: p \}\)/)
})

test('Gmail over IMAP: the exact app-password steps in two lines, with the page, from the host or the address', () => {
  const daHost = gmailPerLeApp('imap.gmail.com', '')
  assert.ok(daHost)
  assert.equal(daHost!.righe.length, 2)
  assert.equal(daHost!.url, 'https://myaccount.google.com/apppasswords')
  assert.ok(gmailPerLeApp('', 'anna@gmail.com'), 'known before the server lookup')
  assert.equal(gmailPerLeApp('outlook.office365.com', 'anna@azienda.it'), null)
  assert.equal(gmailPerLeApp('', 'anna@azienda.it'), null)
  for (const r of daHost!.righe) assert.ok(tradotta(r), r)
})
