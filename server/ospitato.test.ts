// Ospitati: quello che si chiude, quello che si apre, e come ci si registra.
//
// Tutto in `ospitato.ts` si decide al caricamento, dalle variabili d'ambiente:
// qui si mettono *prima* di importare, e si prova un server con il dominio
// noto, l'app di Google registrata, quella di Microsoft no, e la
// registrazione a invito.
//
//   node --test server/ospitato.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-ospitato-'))
process.env.MYYND_DATI = CASA
process.env.RAILWAY_ENVIRONMENT = 'prova'
process.env.MYYND_PUBBLICO = 'https://myynd.esempio.it/'
process.env.MYYND_GOOGLE_CLIENT_ID = 'prova.apps.googleusercontent.com'
delete process.env.MYYND_MICROSOFT_CLIENT_ID
process.env.MYYND_REGISTRAZIONE = 'invito'
process.env.MYYND_INVITO = 'parola-segreta'

const o = await import('./ospitato.ts')
const auth = await import('./auth.ts')

test('il dominio si legge pulito, e il ritorno OAuth è uno solo e fisso', () => {
  assert.equal(o.OSPITATO, true)
  assert.equal(o.DOMINIO, 'myynd.esempio.it')
  assert.equal(o.oauthWeb().ritorno, 'https://myynd.esempio.it/api/oauth/ritorno')
})

test('Google si offre perché chi ospita ha registrato l’app; Microsoft no', () => {
  assert.equal(o.oauthWeb().google, true)
  assert.equal(o.oauthWeb().microsoft, false)
  assert.equal(o.fermoSulServer('google'), false)
  assert.equal(o.fermoSulServer('drive'), false)
  assert.equal(o.fermoSulServer('microsoft'), true)
  assert.equal(o.fermoSulServer('sharepoint'), true)
  assert.equal(o.fermoSulServer('posta'), false)
})

test('il desktop non si offre su un server', () => {
  assert.equal(o.disponibile('desktop'), false)
  assert.equal(o.disponibile('posta'), true)
})

test('i dati fuori da un volume si riconoscono, e un dubbio resta un dubbio', () => {
  /*
   * Un volume vero non c'è in una prova — si monta a mano, e non su ogni
   * macchina che fa girare i test. Quello che si può fissare qui è il resto,
   * cioe' i due casi in cui una risposta sbagliata fa danno.
   *
   * `/` sta sul suo stesso filesystem per definizione: se questo tornasse
   * `true` il controllo direbbe «montato» a qualunque cartella, e l'avviso non
   * comparirebbe mai — un controllo che tace sempre è peggio di nessun
   * controllo, perché sembra che qualcuno stia guardando.
   *
   * E su un percorso che non c'è si risponde `null`, non `false`: «non lo so»
   * non deve diventare un allarme.
   */
  assert.equal(o.suUnVolume('/'), false)
  assert.equal(o.suUnVolume('/questo/percorso/non/esiste/davvero'), null)
})

test('un host di posta non può essere la rete interna di chi ospita', () => {
  for (const h of ['localhost', 'db.railway.internal', 'stampante.local', '127.0.0.1', '10.0.0.7',
    '172.16.5.5', '172.31.255.1', '192.168.1.1', '169.254.1.1', '100.64.0.1', '[::1]', 'fe80::1']) {
    assert.equal(o.hostRaggiungibile(h), false, `${h} doveva essere rifiutato`)
  }
  for (const h of ['imap.gmail.com', 'outlook.office365.com', 'imap.register.it', '172.32.0.1', '8.8.8.8']) {
    assert.equal(o.hostRaggiungibile(h), true, `${h} doveva passare`)
  }
})

test('a invito: senza la parola non ci si registra, con la parola sì', async () => {
  assert.equal(o.REGISTRAZIONE, 'invito')
  const senza = await auth.registra('anna@esempio.it', 'passwordlunga1')
  assert.equal(senza.ok, false)
  assert.match(senza.ok === false ? senza.errore : '', /invito/)
  const storta = await auth.registra('anna@esempio.it', 'passwordlunga1', 'parola-sbagliata')
  assert.equal(storta.ok, false)
  const con = await auth.registra('anna@esempio.it', 'passwordlunga1', 'parola-segreta')
  assert.equal(con.ok, true)
  rmSync(CASA, { recursive: true, force: true })
})
