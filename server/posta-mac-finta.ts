// Una cartella di Mail finta, come la scrive Mail su un Mac vero: per le
// prove di Mail del Mac e per le scene dal vivo in `prove/`. Tutto
// inventato: nomi, indirizzi, oggetti. Si scrive sotto una casa finta,
// mai sotto quella vera.

import { mkdirSync, writeFileSync, utimesSync } from 'node:fs'
import { join } from 'node:path'

export type Forma = {
  /** Quante caselle (conti di Mail). */
  caselle: number
  /** Messaggi arrivati negli ultimi novanta giorni, in tutto. */
  inArrivo: number
  /** Messaggi mandati negli ultimi novanta giorni, in tutto. */
  inviate: number
  /** Messaggi arrivati prima dei novanta giorni, in tutto. */
  vecchie: number
  /** Messaggi nella posta indesiderata: non si leggono mai. */
  spazzatura: number
  /** Anche una cartella V9 più vecchia, con un messaggio che non deve contare. */
  versioneVecchia?: boolean
  adesso?: number
}

export const CONTI = ['2F4A7C10-1B3D-4E5F-8A9B-0C1D2E3F4A51', '9C8B7A60-5D4E-4F3A-9B2C-1D0E9F8A7B62', '5A6B7C80-9D0E-4F1A-8B2C-3D4E5F6A7B73']
const PERSONE = [
  ['Maya Lindqvist', 'maya@northwind-studio.test'], ['Owen Price', 'owen@brightpath.test'],
  ['Sara Okafor', 'sara@okafor-legal.test'], ['Leo Martin', 'leo@martin-print.test'], ['Priya Shah', 'priya@shahdesign.test']
]
const IO = ['Alex Morgan', 'alex@morgan-works.test']
export const OGGETTI = [
  'Homepage copy for the new website', 'Launch date for the new website', 'Photos for the About page',
  'Invoice 2026-114', 'Hosting renewal', 'Feedback on the pricing page', 'Coffee next week?',
  'Draft contract for the October campaign', 'Can you confirm the menu wording?', 'Domain transfer'
]

function emlx(m: { da: string[]; a: string[]; oggetto: string; data: Date; id: string; corpo: string; letto: boolean }): Buffer {
  const testo = [
    `From: ${m.da[0]} <${m.da[1]}>`,
    `To: ${m.a[0]} <${m.a[1]}>`,
    `Subject: ${m.oggetto}`,
    `Date: ${m.data.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${m.id}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    m.corpo,
    ''
  ].join('\r\n')
  const b = Buffer.from(testo, 'utf8')
  const coda = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n\t<key>date-received</key>\n\t<integer>${Math.floor(m.data.getTime() / 1000)}</integer>\n\t<key>flags</key>\n\t<integer>${m.letto ? 8590195713 : 8590195712}</integer>\n</dict>\n</plist>\n`
  return Buffer.concat([Buffer.from(`${b.length}\n`, 'ascii'), b, Buffer.from(coda, 'utf8')])
}

/** L'id del documento che Mail del Mac darà a un messaggio di questa cartella finta. */
export const idFinto = (conto: number, casella: string, n: number) => `postamac:${CONTI[conto]}/${casella}/${n}.emlx`

/** Scrive la cartella di Mail sotto `casa`. Torna quanti messaggi ha messo dove. */
export function costruisciMail(casa: string, f: Forma): { inArrivo: string[]; inviate: string[] } {
  const adesso = f.adesso ?? Date.now()
  const radice = join(casa, 'Library', 'Mail', 'V10')
  mkdirSync(join(radice, 'MailData'), { recursive: true })
  const fuori = { inArrivo: [] as string[], inviate: [] as string[] }
  let n = 1
  const scrivi = (conto: number, casella: string, giorni: number, inviata: boolean, i: number) => {
    const dir = join(radice, CONTI[conto]!, `${casella}.mbox`, '6D1F0B3A-1C2D-4E3F-8A5B-9C0D1E2F3A4B', 'Data', String(n % 10), 'Messages')
    mkdirSync(dir, { recursive: true })
    const persona = PERSONE[i % PERSONE.length]!
    const data = new Date(adesso - giorni * 86_400_000 - (i % 7) * 3_600_000)
    const oggetto = OGGETTI[i % OGGETTI.length]!
    const corpo = inviata
      ? `Hi ${persona[0].split(' ')[0]},\n\nThanks, I will send the revised version by Friday.\n\nAlex`
      : `Hi Alex,\n\nQuick note about "${oggetto}". Could you get back to me on this? I need your answer to move ahead with the new website.\n\nThanks,\n${persona[0]}`
    const file = join(dir, `${n}.emlx`)
    writeFileSync(file, emlx({
      da: inviata ? IO : persona, a: inviata ? persona : IO, oggetto: inviata ? `Re: ${oggetto}` : oggetto,
      data, id: `finta-${conto}-${casella.replace(/\W+/g, '')}-${n}@mail.test`, corpo, letto: i % 3 === 0
    }))
    utimesSync(file, data, data)
    const id = idFinto(conto, casella, n)
    n++
    return id
  }
  const conti = Math.max(1, Math.min(CONTI.length, f.caselle))
  for (let i = 0; i < f.inArrivo; i++) fuori.inArrivo.push(scrivi(i % conti, 'INBOX', 1 + (i * 88) / Math.max(1, f.inArrivo), false, i))
  for (let i = 0; i < f.inviate; i++) fuori.inviate.push(scrivi(i % conti, 'Sent Messages', 1 + (i * 88) / Math.max(1, f.inviate), true, i))
  for (let i = 0; i < f.vecchie; i++) scrivi(i % conti, 'INBOX', 120 + i * 5, false, i)
  for (let i = 0; i < f.spazzatura; i++) scrivi(i % conti, 'Junk', 2 + i, false, i)
  // e il resto che non si legge mai: il cestino e le bozze, per ogni conto
  for (let c = 0; c < conti; c++) { scrivi(c, 'Deleted Messages', 3, false, c); scrivi(c, 'Drafts', 3, true, c) }
  if (f.versioneVecchia) {
    const vecchia = join(casa, 'Library', 'Mail', 'V9', CONTI[0]!, 'INBOX.mbox', 'X', 'Data', 'Messages')
    mkdirSync(vecchia, { recursive: true })
    writeFileSync(join(vecchia, '1.emlx'), emlx({ da: PERSONE[0]!, a: IO, oggetto: 'Old version', data: new Date(adesso - 86_400_000), id: 'vecchia-1@mail.test', corpo: 'This lives in V9 and must not be read.', letto: false }))
  }
  return fuori
}
