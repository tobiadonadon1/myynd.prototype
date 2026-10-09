// La schermata d'accesso nell'app sul Mac.
//
// Due cose che la prima persona di fuori ha toccato subito: «ho dimenticato
// la password» non c'era (in casa la posta del server non esiste), e creare
// il conto chiedeva la password due volte. Qui si guarda il sorgente, come
// `desktop/pannelli.test.ts`: la schermata vera la fotografa
// `prove/passi/primo-avvio-pubblico.json`.
//
//   node --test src/accesso-mac.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const accesso = readFileSync(new URL('./Accesso.tsx', import.meta.url), 'utf8')

test('on the Mac, "forgot password" exists without any server mail, and goes through the shell', () => {
  assert.match(accesso, /registrato && \(dalMac \|\| accesso\.reimpostazione\)/)
  assert.match(accesso, /const dalMac = !ospitato && !!guscio\?\.reimpostaPassword/)
  // la pagina non cambia la password da sé: chiede al guscio, che chiede al Mac
  assert.match(accesso, /guscio!\.reimpostaPassword!\(email, password, via\)/)
  assert.doesNotMatch(accesso, /reimposta\/mac/)
})

test('creating an account asks for the password once: the eye shows it instead', () => {
  assert.doesNotMatch(accesso, /t\('Conferma la password'\)/)
  assert.doesNotMatch(accesso, /ripeti/)
  assert.match(accesso, /<Occhiello vedi=\{vedi\}/)
})
