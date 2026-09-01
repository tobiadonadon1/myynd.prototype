// Tirare fuori il testo da un file, ovunque quel file sia arrivato.
//
// Stava dentro `desktop.ts`, e lì bastava: c'era una fonte sola di file e la
// leggeva dal disco. Con Drive, SharePoint e Dropbox le fonti diventano
// quattro e il file non è più un percorso: è un pezzo di memoria appena
// scaricato. Copiare quelle venti righe in quattro posti vorrebbe dire quattro
// versioni che divergono — e la prima a divergere sarebbe la chiamata a
// `riflua`, che non è un abbellimento: senza, il testo di un PDF arriva
// spezzato a metà frase e quella frase spezzata finisce sia sotto gli occhi di
// chi legge sia dentro la domanda che si fa al modello.

import { extname } from 'node:path'
import { riflua } from '../testo.ts'

/** Quello che è un documento per una persona, non per un compilatore. */
export const TESTO = ['.md', '.markdown', '.txt', '.rtf', '.csv', '.org', '.tex']
export const RICCHI = ['.pdf', '.docx']
export const LETTI = [...RICCHI, ...TESTO]

/** Il file è di quelli che sappiamo leggere? */
export function leggibile(nome: string): boolean {
  return LETTI.includes(extname(nome).toLowerCase())
}

/**
 * Il testo di un file che abbiamo già in mano.
 *
 * `pdf-parse` e `mammoth` si importano qui dentro e non in cima al file
 * apposta: sono due pacchetti pesanti, e importarli all'avvio vorrebbe dire
 * pagarli anche su un'installazione che non ha mai visto un PDF.
 */
export async function daBuffer(buf: Buffer, nome: string): Promise<string> {
  const ext = extname(nome).toLowerCase()

  if (ext === '.pdf') {
    const { PDFParse } = await import('pdf-parse')
    const p = new PDFParse({ data: new Uint8Array(buf) })
    try {
      const r = await p.getText()
      return riflua((r.text || '').trim())
    } finally {
      await p.destroy()
    }
  }

  if (ext === '.docx') {
    const { default: mammoth } = await import('mammoth')
    const r = await mammoth.extractRawText({ buffer: buf })
    return riflua((r.value || '').trim())
  }

  return riflua(buf.toString('utf8').trim())
}

/**
 * Il tipo, come lo chiama Myynd nelle sue schede.
 *
 * Non il MIME e non l'estensione: è la parola che compare accanto al titolo
 * quando quel documento si ritrova cercando, e va detta in una lingua da
 * persone.
 */
export function tipoDi(nome: string): string {
  const ext = extname(nome).toLowerCase()
  if (ext === '.pdf') return 'pdf'
  if (ext === '.docx') return 'documento'
  if (ext === '.csv') return 'tabella'
  return 'file'
}
