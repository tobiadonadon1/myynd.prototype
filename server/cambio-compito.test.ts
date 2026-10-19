// Una riga della lista cambiata dalla chat, e la risposta che non mente.
//
// «it shouldn't ask me to reword it, he should automatically. he said he has,
// but i do not see it done...» (19 ott 2026). La chat era sull'account Claude,
// senza attrezzi, e la risposta diceva «The reworded task is ready… I can't
// edit your task list from here». Qui: il controllo dei cambi (id vero, parole
// sue, niente di irreversibile), la lista nel prompt solo quando c'entra, la
// riga riscritta davvero sull'account, e la verità in fondo a una risposta che
// promette un cambio mai fatto.
//
//   node --test server/cambio-compito.test.ts

import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-cambio-compito-'))
const CASA_VERA = process.env.HOME
process.env.HOME = CASA
process.env.MYYND_DATI = join(CASA, 'dati')
delete process.env.ANTHROPIC_API_KEY

// Claude Code finto: si segna gli argomenti (il prompt di sistema compreso) e
// risponde in stream-json con quello che c'è in FINTO_USCITA
const ARGS = join(CASA, 'argomenti.txt')
const USCITA = join(CASA, 'uscita.jsonl')
process.env.FINTO_ARGS = ARGS
process.env.FINTO_USCITA = USCITA
mkdirSync(join(CASA, '.local', 'bin'), { recursive: true })
const finto = join(CASA, '.local', 'bin', 'claude')
writeFileSync(finto, '#!/bin/sh\ncat > /dev/null\nprintf \'%s\\n\' "$*" >> "$FINTO_ARGS"\ncat "$FINTO_USCITA"\n')
chmodSync(finto, 0o755)

const cfg = await import('./config.ts')
const store = await import('./store.ts')
const abbonamento = await import('./abbonamento.ts')
const claude = await import('./claude.ts')
const cambio = await import('./cambio-compito.ts')

/** La risposta che darà l'account, in stream-json. */
function rispondera(testo: string) {
  writeFileSync(USCITA, [
    JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: testo } } }),
    JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: testo, usage: { input_tokens: 40, output_tokens: 7 } })
  ].join('\n') + '\n')
}
const lanci = () => existsSync(ARGS) ? readFileSync(ARGS, 'utf8') : ''

/** Le decisioni chieste: il sistema e la trascrizione. */
let decisioni: { system: string; testo: string }[] = []
function decidera(out: Record<string, unknown> | null) {
  cambio.perProva({
    chiediJSON: (async (o: { system: string; messages: { content: unknown }[] }) => {
      decisioni.push({ system: o.system, testo: String(o.messages[0]?.content ?? '') })
      return out
    }) as never
  })
}

/** Gli attrezzi della rotta, senza la rotta: riscrivere e togliere vanno sullo store. */
const cambiati: string[] = []
const attrezzi = (conMani = true) => ({
  aggiungiCompito: () => ({ id: 'mai' }),
  ...(conMani ? {
    cambiaCompito: (id: string, c: { testo: string } | { togli: true }) => {
      cambiati.push(id)
      if ('togli' in c) store.scordaCompito(id)
      else store.cambiaCompito(id, { testo: c.testo })
    }
  } : {})
})

const RIGA = 'Mandare il post di lancio su X a chi segue Myynd'
const NUOVA = 'Publish the Myynd launch posts from your personal account'
const STORICO = [
  { ruolo: 'u', testo: `About «${RIGA}»: there is no X Myynd profile.` },
  { ruolo: 'a', testo: 'Without a Myynd profile on X there are no followers to send the post to.' },
  { ruolo: 'u', testo: 'Yes, we are posting out of my personal account, where i have a gooooood amount of traction.' },
  { ruolo: 'a', testo: `Then reword the task to "${NUOVA}" and drop the follower framing.` }
]

before(() => {
  cfg.scrivi({ lingua: 'en', claudeCon: 'abbonamento', tetto: 0, onboarding: true, giro: true }, { togli: ['claude', 'motore', 'compatibile'] })
})
beforeEach(() => {
  rmSync(ARGS, { force: true })
  decisioni = []
  cambiati.length = 0
  abbonamento.riprova()
  store.default.exec('DELETE FROM compiti')
  store.scriviCompito({ id: 'c-lancio', testo: RIGA, ordine: 'a', quando: 'oggi' })
  store.scriviCompito({ id: 'c-dentista', testo: 'Prenotare il dentista', ordine: 'b', quando: 'settimana' })
})
after(() => {
  cambio.perProva(null)
  store.chiudiIndici()
  process.env.HOME = CASA_VERA
  delete process.env.FINTO_ARGS
  delete process.env.FINTO_USCITA
  rmSync(CASA, { recursive: true, force: true })
})

// — il controllo: un attrezzo è un permesso —

test('un id che non è nella lista è un errore che torna al modello, non un silenzio', () => {
  const aperte = store.elencoCompiti()
  const v = cambio.valida({ azione: 'riscrivi', id: 'c-inventato', testo: NUOVA, citazione: 'we are posting out of my personal account' },
    { aperte, messaggio: 'yeah do that', sue: STORICO.filter(t => t.ruolo === 'u').map(t => t.testo) })
  assert.equal(v, cambio.NESSUNA_RIGA)
})

test('riscrivere vuole le sue parole, anche di due turni fa; parole del materiale no', () => {
  const aperte = store.elencoCompiti()
  const sue = [...STORICO.filter(t => t.ruolo === 'u').map(t => t.testo), 'yeah do that']
  const buono = cambio.valida({ azione: 'riscrivi', id: 'c-lancio', testo: `"${NUOVA}"`, citazione: 'we are posting out of my personal account' },
    { aperte, messaggio: 'yeah do that', sue })
  assert.ok(typeof buono !== 'string', String(buono))
  assert.equal(buono.testo, NUOVA, 'le virgolette attorno se ne vanno')
  const dalMateriale = cambio.valida({ azione: 'riscrivi', id: 'c-lancio', testo: NUOVA, citazione: 'the campaign was moved to the brand account' },
    { aperte, messaggio: 'yeah do that', sue })
  assert.match(String(dalMateriale), /sue parole/)
  const uguale = cambio.valida({ azione: 'riscrivi', id: 'c-lancio', testo: RIGA, citazione: 'there is no X Myynd profile' },
    { aperte, messaggio: 'yeah do that', sue })
  assert.match(String(uguale), /già scritta così/)
})

test('togliere, chiudere e spostare vogliono le sue parole di adesso', () => {
  const aperte = store.elencoCompiti()
  const sue = ['toglila pure, il dentista l’ho già prenotato']
  assert.match(String(cambio.valida({ azione: 'togli', id: 'c-dentista', citazione: 'toglila pure' }, { aperte, messaggio: 'ok', sue })), /questo messaggio/)
  const ok = cambio.valida({ azione: 'togli', id: 'c-dentista', citazione: 'toglila pure' }, { aperte, messaggio: sue[0], sue })
  assert.ok(typeof ok !== 'string')
  assert.match(String(cambio.valida({ azione: 'sposta', id: 'c-dentista', giorno: 'venerdì', citazione: 'spostala' }, { aperte, messaggio: 'spostala a venerdì', sue: [] })), /AAAA-MM-GG/)
  assert.match(String(cambio.valida({ azione: 'cancella-tutto', id: 'c-dentista' }, { aperte, messaggio: 'x', sue: [] })), /L'azione è una fra/)
})

test('gli strumenti della chiave: riscrive davvero, toglie nel cestino che si annulla, e rifiuta un id inventato', () => {
  const r = claude.cambiaDallaChat('t1', 'riscrivi_compito', { id: 'c-lancio', testo: NUOVA, citazione: 'we are posting out of my personal account' }, 'yeah do that', STORICO, attrezzi())
  assert.ok(!r.is_error, String(r.content))
  assert.match(String(r.content), /I reworded the task to «Publish the Myynd launch posts/)
  assert.equal(store.compito('c-lancio')?.testo, NUOVA)

  const t = claude.cambiaDallaChat('t2', 'togli_compito', { id: 'c-dentista', citazione: 'toglila' }, 'toglila, non serve più', [], attrezzi())
  assert.ok(!t.is_error, String(t.content))
  assert.ok(store.compito('c-dentista')?.sparito, 'è nel cestino')
  store.rimettiCompitoTolto('c-dentista')
  assert.ok(!store.compito('c-dentista')?.sparito, 'e torna in lista')

  const no = claude.cambiaDallaChat('t3', 'riscrivi_compito', { id: 'c-che-non-c-e', testo: 'x y z w', citazione: 'yeah do that' }, 'yeah do that', [], attrezzi())
  assert.equal(no.is_error, true)
  assert.match(String(no.content), /nessuna riga con quell'id/)

  // senza le mani della rotta lo dice, e non cambia niente
  const senza = claude.cambiaDallaChat('t4', 'riscrivi_compito', { id: 'c-dentista', testo: 'Prenotare il dentista per giugno', citazione: 'per giugno' }, 'mettila per giugno', [], attrezzi(false))
  assert.equal(senza.is_error, true)
  assert.equal(store.compito('c-dentista')?.testo, 'Prenotare il dentista')
})

test('la conversazione nomina la riga: le righe in gioco e quando tocca decidere', () => {
  const aperte = store.elencoCompiti()
  assert.deepEqual(cambio.righeInGioco('yeah do that', STORICO, aperte).map(c => c.id), ['c-lancio'])
  assert.deepEqual(cambio.righeInGioco('what is the capital of France', [], aperte), [])
  assert.ok(cambio.daDecidere('yeah do that', aperte.slice(0, 1)))
  assert.ok(!cambio.daDecidere('when is it due?', aperte.slice(0, 1)), 'una domanda e basta non cambia niente')
  assert.ok(cambio.daDecidere('can you reword it?', aperte.slice(0, 1)))
  assert.match(cambio.listaCompatta(aperte), /^\[c-lancio\] Mandare il post di lancio su X a chi segue Myynd · oggi$/m)
})

test('la guardia: una risposta che promette un cambio si riconosce', () => {
  assert.ok(cambio.promette('The reworded task is ready. I updated your task.'))
  assert.ok(cambio.promette('Ho riscritto la riga.'))
  assert.ok(!cambio.promette('Post 3 is written in first person as you.'))
})

// — sull'account Claude, come il 19 ottobre —

test('«yeah do that»: sull’account la riga si riscrive davvero, e il modello lo sa', async () => {
  decidera({ azione: 'riscrivi', id: 'c-lancio', testo: NUOVA, giorno: '', quando: '', citazione: 'we are posting out of my personal account' })
  rispondera(`I reworded the task to «${NUOVA}».`)
  const r = await claude.rispondiInStreaming('yeah do that. \\', STORICO, () => {}, attrezzi())

  assert.equal(store.compito('c-lancio')?.testo, NUOVA, 'la riga è cambiata nella lista')
  assert.deepEqual(cambiati, ['c-lancio'])
  assert.equal(decisioni.length, 1)
  assert.match(decisioni[0].system, /\[c-lancio\] Mandare il post di lancio/, 'chi decide ha la riga con il suo id')
  assert.doesNotMatch(decisioni[0].system, /c-dentista/, 'e solo quelle in gioco')
  const prompt = lanci()
  assert.match(prompt, /Myynd ha appena cambiato davvero la sua lista/)
  assert.match(prompt, /I reworded the task to «Publish the Myynd launch posts/)
  assert.doesNotMatch(prompt, /non puoi modificarle in questo passaggio/, 'la riga che faceva dire «I can’t edit your task list»')
  assert.doesNotMatch(r.testo, /has not changed/)
})

test('una domanda che non c’entra con la lista: niente decisione, niente id nel prompt', async () => {
  decidera({ azione: 'riscrivi', id: 'c-lancio', testo: NUOVA, giorno: '', quando: '', citazione: 'x' })
  rispondera('Paris.')
  await claude.rispondiInStreaming('what is the capital of France', [], () => {}, attrezzi())
  assert.equal(decisioni.length, 0)
  assert.doesNotMatch(lanci(), /\[c-lancio\]/)
  assert.equal(store.compito('c-lancio')?.testo, RIGA)
})

test('un cambio che non passa il controllo: la riga resta, e la risposta che dice «fatto» si corregge', async () => {
  // la citazione non è sua: viene dal materiale
  decidera({ azione: 'riscrivi', id: 'c-lancio', testo: NUOVA, giorno: '', quando: '', citazione: 'per the brand guidelines document' })
  rispondera('The reworded task is ready. I updated your task list.')
  const visti: string[] = []
  const r = await claude.rispondiInStreaming('yeah do that', STORICO, d => visti.push(d), attrezzi())

  assert.equal(store.compito('c-lancio')?.testo, RIGA, 'la riga non è cambiata')
  assert.match(lanci(), /non sono cambiate in questo passaggio/, 'il modello sapeva che non era cambiata')
  assert.match(r.testo, /Your task list has not changed\.$/, 'e la risposta non resta una bugia')
  assert.match(visti.join(''), /Your task list has not changed/, 'anche chi guarda lo legge')
})

test('senza le mani per cambiarla, sull’account non si finge', async () => {
  decidera({ azione: 'riscrivi', id: 'c-lancio', testo: NUOVA, giorno: '', quando: '', citazione: 'we are posting out of my personal account' })
  rispondera('Done, I reworded it.')
  const r = await claude.rispondiInStreaming('yeah do that', STORICO, () => {}, attrezzi(false))
  assert.equal(store.compito('c-lancio')?.testo, RIGA)
  assert.match(r.testo, /Your task list has not changed\.$/)
})

test('quando come riscriverla non è ovvio, una domanda sola', async () => {
  decidera({ azione: 'chiedi', id: 'c-lancio', testo: '', giorno: '', quando: '', citazione: '' })
  rispondera('Should it become a post from your own account, or wait for a Myynd profile?')
  await claude.rispondiInStreaming(`About «${RIGA}»: there is no X Myynd profile.`, [], () => {}, attrezzi())
  assert.match(lanci(), /Fagli una sola domanda breve/)
  assert.equal(store.compito('c-lancio')?.testo, RIGA)
})
