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

test('Prepare ahead toggle sends one JSON content type and a boolean body through actual API transport', async () => {
  const previousFetch = globalThis.fetch
  const storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => 'test-session' } })
  const requests: Request[] = []
  globalThis.fetch = async (input, init) => {
    // Request performs the same case-insensitive header normalization as the
    // browser. Duplicate Content-Type casing used to become a comma list,
    // which Express then refused to parse as JSON.
    const request = new Request(new URL(String(input), 'https://myynd.test'), init)
    requests.push(request)
    const { attiva } = await request.clone().json()
    return Response.json({ attiva, inPausa: false, oggi: 0, limiteGiornaliero: 2, prossima: null })
  }
  try {
    for (const attiva of [true, false]) {
      const result = await api.impostaIniziativa(attiva)
      assert.equal(result.attiva, attiva)
      const request = requests.at(-1)!
      assert.equal(request.url, 'https://myynd.test/api/iniziativa')
      assert.equal(request.method, 'PATCH')
      assert.equal(request.headers.get('content-type'), 'application/json')
      assert.equal(request.headers.get('authorization'), 'Bearer test-session')
      assert.deepEqual(await request.json(), { attiva })
    }
  } finally {
    globalThis.fetch = previousFetch
    if (storage) Object.defineProperty(globalThis, 'localStorage', storage)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
})
