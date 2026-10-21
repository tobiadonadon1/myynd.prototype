// La risposta della chat sul filo (21 ott 2026): gli eventi si ricompongono
// anche spezzati a metà, e «Ferma» taglia davvero la richiesta.
//
//   node --test src/api-chat-flusso.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import * as ts from 'typescript'
import { readFileSync } from 'node:fs'

const apiUrl = new URL('./api.ts', import.meta.url).href
const hooks = registerHooks({ load(url, context, nextLoad) {
  if (url !== apiUrl) return nextLoad(url, context)
  return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText }
} })
const { api } = await import('./api.ts')
hooks.deregister()

const enc = new TextEncoder()

async function conFetch<T>(finto: typeof fetch, f: () => Promise<T>): Promise<T> {
  const prima = globalThis.fetch
  const storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => 'sessione-di-prova', setItem() {}, removeItem() {} } })
  globalThis.fetch = finto
  try { return await f() } finally {
    globalThis.fetch = prima
    if (storage) Object.defineProperty(globalThis, 'localStorage', storage)
    else delete (globalThis as { localStorage?: unknown }).localStorage
  }
}

test('gli eventi spezzati fra un pezzo e l\'altro si ricompongono, in ordine', async () => {
  const fine = { fase: 'fine', messaggi: [{ id: 'u1', role: 'u', text: 'ciao' }, { id: 'a1', role: 'a', text: 'Nora vuole giovedì.' }] }
  const filo = [
    'data: {"fase":"inizio"}\n\n: vivo\n\ndata: {"fase":"passo","testo":"Cerco nelle tue fonti"}\n\nda',
    'ta: {"fase":"testo","delta":"Nora "}\n',
    '\ndata: {"fase":"testo","delta":"vuole giovedì."}\n\ndata: {rotto}\n\n',
    `data: ${JSON.stringify(fine)}\n\n`
  ]
  const delta: string[] = []
  const passi: string[] = []
  const r = await conFetch(async () => new Response(new ReadableStream({
    start(c) { for (const p of filo) c.enqueue(enc.encode(p)); c.close() }
  }), { headers: { 'content-type': 'text/event-stream' } }), () =>
    api.chiedi('th1', 'ciao', d => delta.push(d), undefined, undefined, undefined, p => passi.push(p)))
  assert.deepEqual(delta, ['Nora ', 'vuole giovedì.'])
  assert.deepEqual(passi, ['Cerco nelle tue fonti'])
  assert.equal(r.messaggi.length, 2)
})

test('«Ferma» passa il segnale alla richiesta e la taglia a metà risposta', async () => {
  const ferma = new AbortController()
  let segnaleVisto: AbortSignal | undefined
  const delta: string[] = []
  const finto: typeof fetch = async (_url, init) => {
    segnaleVisto = init?.signal ?? undefined
    const s = segnaleVisto!
    return new Response(new ReadableStream({
      start(c) {
        c.enqueue(enc.encode('data: {"fase":"testo","delta":"Mezza "}\n\n'))
        // il resto non arriva mai: solo l'interruzione chiude il filo, come il fetch vero
        s.addEventListener('abort', () => c.error(new DOMException('fermata', 'AbortError')))
      }
    }), { headers: { 'content-type': 'text/event-stream' } })
  }
  const corsa = conFetch(finto, () => api.chiedi('th1', 'ciao', d => {
    delta.push(d)
    // appena arriva la prima parola, lui preme il quadratino
    ferma.abort()
  }, undefined, ferma.signal))
  await assert.rejects(corsa, (e: unknown) => e instanceof Error && e.name === 'AbortError')
  assert.equal(segnaleVisto, ferma.signal)
  assert.equal(segnaleVisto?.aborted, true)
  assert.deepEqual(delta, ['Mezza '])
})
