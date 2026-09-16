// PDF.js must use its Node canvas backend inside this dedicated Electron worker.
// Electron utility processes have no browser DOM despite exposing process.type.
import { parentPort, workerData } from 'node:worker_threads'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
if (process.versions.electron) Object.defineProperty(process, 'type', {value: undefined, configurable: true})
try {
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({data: readFileSync(workerData.pdf)})
  try {
    const info = await parser.getInfo()
    if (info.total < 1 || info.total > 12) throw new Error('Visual review requires a document of 1–12 pages.')
    const rendered = await parser.getScreenshot({scale:1.5,imageDataUrl:false,imageBuffer:true})
    if (rendered.pages.length !== info.total) throw new Error('Not every document page could be rendered.')
    const immagini = rendered.pages.map(p => {
      const file = join(dirname(workerData.pdf), `page-${p.pageNumber}.png`)
      writeFileSync(file,p.data,{mode:0o600})
      return file
    })
    parentPort?.postMessage({ok:true,pagine:info.total,immagini})
  } finally { await parser.destroy() }
} catch(e) { parentPort?.postMessage({ok:false,errore:e instanceof Error ? e.message : String(e)}) }
