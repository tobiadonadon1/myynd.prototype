// fs.watch can block in the kernel while opening a protected/cloud folder.
// It must never run on the HTTP server thread, even during startup.
import { watch, type FSWatcher } from 'node:fs'
import { parentPort, workerData } from 'node:worker_threads'

const porta = parentPort!
const { cartella, ritardo = 0 } = workerData as { cartella: string; ritardo?: number }
let osservatore: FSWatcher | null = null
let chiuso = false

function chiudi() {
  if (chiuso) return
  chiuso = true
  osservatore?.close()
  osservatore = null
  porta.close()
}

function guaio(e: unknown) {
  const errore = e as NodeJS.ErrnoException
  porta.postMessage({ tipo: 'errore', errore: errore.code ?? errore.message ?? String(e) })
  chiudi()
}

porta.on('message', m => { if (m?.tipo === 'chiudi') chiudi() })
try {
  // Test-only delay models a synchronous kernel wait without touching a real
  // inaccessible volume. Production always passes zero.
  if (ritardo > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ritardo)
  osservatore = watch(cartella, { recursive: true, persistent: false }, (_evento, nome) => {
    if (!chiuso && nome != null) porta.postMessage({ tipo: 'cambiato', nome: String(nome) })
  })
  osservatore.on('error', guaio)
  porta.postMessage({ tipo: 'pronta' })
} catch (e) { guaio(e) }
