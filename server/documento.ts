// Il lavoro consegnato, come documento di Word.
//
// «Rather than MD, I could write docs, notes, or text, because MD always opens
// Xcode for most people» (9 ottobre 2026). Un file .md su un Mac si apre con
// quello che l'ha preso per sé, e da chi ha installato gli strumenti di Apple
// è Xcode: un programma per scrivere codice, per leggere cinque post. Un .docx
// si apre in Pages, in Word, e se non c'è nessuno dei due in TextEdit, che
// c'è su ogni Mac.
//
// Il testo arriva come lo scrive il modello: righe, righe vuote fra i
// paragrafi, qualche «#» per i titoli, «- » per gli elenchi, «**» per il
// grassetto. Qui diventa quello che sembra: un titolo è un titolo, un elenco
// ha i pallini, e i simboli non si vedono. Niente di più: niente tabelle,
// niente immagini. Lo zip si scrive da sé, in modo sincrono, perché chi salva
// (`mani.salvaConsegna`) non aspetta.

import { crc32, deflateRawSync } from 'node:zlib'

/** Il testo dentro una riga XML: i cinque caratteri che contano, e via i controlli. */
function xml(s: string): string {
  return s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Una riga in pezzi: il grassetto fra «**», il resto piano. */
function pezzi(riga: string): string {
  const out: string[] = []
  const parti = riga.split(/(\*\*[^*]+\*\*)/g).filter(Boolean)
  for (const p of parti) {
    const grassetto = /^\*\*[^*]+\*\*$/.test(p)
    const testo = grassetto ? p.slice(2, -2) : p
    out.push(`<w:r>${grassetto ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${xml(testo)}</w:t></w:r>`)
  }
  return out.join('')
}

/** Un paragrafo: più righe vanno a capo dentro lo stesso, come nel testo. */
function paragrafo(righe: string[], stile?: string): string {
  const corpo = righe.map(pezzi).join('<w:r><w:br/></w:r>')
  return `<w:p>${stile ? `<w:pPr><w:pStyle w:val="${stile}"/></w:pPr>` : ''}${corpo}</w:p>`
}

/** Il corpo del documento, dal testo. */
export function corpoDocumento(testo: string): string {
  const out: string[] = []
  let blocco: string[] = []
  const chiudi = () => { if (blocco.length) out.push(paragrafo(blocco)); blocco = [] }
  for (const grezza of testo.replace(/\r\n?/g, '\n').split('\n')) {
    const riga = grezza.replace(/\s+$/, '')
    if (!riga.trim()) { chiudi(); continue }
    const titolo = riga.match(/^(#{1,3})\s+(.+)$/)
    if (titolo) { chiudi(); out.push(paragrafo([titolo[2]], `Titolo${titolo[1].length}`)); continue }
    const voce = riga.match(/^\s*[-*•]\s+(.+)$/)
    if (voce) { chiudi(); out.push(paragrafo([`•\t${voce[1]}`], 'Elenco')); continue }
    blocco.push(riga)
  }
  chiudi()
  return out.join('')
}

const TIPI = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
  '</Types>'

const RELAZIONI = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  '</Relationships>'

const RELAZIONI_DOC = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  '</Relationships>'

const titolo = (n: number, mezziPunti: number) =>
  `<w:style w:type="paragraph" w:styleId="Titolo${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>` +
  `<w:pPr><w:keepNext/><w:spacing w:before="${n === 1 ? 240 : 200}" w:after="80"/><w:outlineLvl w:val="${n - 1}"/></w:pPr>` +
  `<w:rPr><w:b/><w:sz w:val="${mezziPunti}"/></w:rPr></w:style>`

const STILI = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Helvetica Neue" w:hAnsi="Helvetica Neue" w:cs="Helvetica Neue" w:eastAsia="Helvetica Neue"/>' +
  '<w:sz w:val="23"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault>' +
  '<w:pPrDefault><w:pPr><w:spacing w:after="180" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
  titolo(1, 34) + titolo(2, 28) + titolo(3, 24) +
  '<w:style w:type="paragraph" w:styleId="Elenco"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/>' +
  '<w:pPr><w:spacing w:after="60"/><w:tabs><w:tab w:val="left" w:pos="360"/></w:tabs><w:ind w:left="360" w:hanging="360"/></w:pPr></w:style>' +
  '</w:styles>'

function documento(testo: string): string {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    corpoDocumento(testo) +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>' +
    '</w:body></w:document>'
}

/**
 * Uno zip, scritto a mano: intestazione locale, dati compressi, indice
 * centrale, fine. È tutto quello che un .docx chiede.
 */
function zip(file: { nome: string; dati: Buffer }[]): Buffer {
  const locali: Buffer[] = []
  const centrali: Buffer[] = []
  let scarto = 0
  for (const f of file) {
    const nome = Buffer.from(f.nome, 'utf8')
    const compressi = deflateRawSync(f.dati)
    const crc = crc32(f.dati)
    const locale = Buffer.alloc(30)
    locale.writeUInt32LE(0x04034b50, 0)
    locale.writeUInt16LE(20, 4)        // versione per estrarre
    locale.writeUInt16LE(0x0800, 6)    // nomi in UTF-8
    locale.writeUInt16LE(8, 8)         // deflate
    locale.writeUInt16LE(0, 10)        // ora
    locale.writeUInt16LE(0x21, 12)     // data: 1 gennaio 1980
    locale.writeUInt32LE(crc, 14)
    locale.writeUInt32LE(compressi.length, 18)
    locale.writeUInt32LE(f.dati.length, 22)
    locale.writeUInt16LE(nome.length, 26)
    locale.writeUInt16LE(0, 28)
    locali.push(locale, nome, compressi)
    const centrale = Buffer.alloc(46)
    centrale.writeUInt32LE(0x02014b50, 0)
    centrale.writeUInt16LE(20, 4)
    centrale.writeUInt16LE(20, 6)
    centrale.writeUInt16LE(0x0800, 8)
    centrale.writeUInt16LE(8, 10)
    centrale.writeUInt16LE(0, 12)
    centrale.writeUInt16LE(0x21, 14)
    centrale.writeUInt32LE(crc, 16)
    centrale.writeUInt32LE(compressi.length, 20)
    centrale.writeUInt32LE(f.dati.length, 24)
    centrale.writeUInt16LE(nome.length, 28)
    centrale.writeUInt32LE(scarto, 42)
    centrali.push(centrale, nome)
    scarto += 30 + nome.length + compressi.length
  }
  const indice = Buffer.concat(centrali)
  const fine = Buffer.alloc(22)
  fine.writeUInt32LE(0x06054b50, 0)
  fine.writeUInt16LE(file.length, 8)
  fine.writeUInt16LE(file.length, 10)
  fine.writeUInt32LE(indice.length, 12)
  fine.writeUInt32LE(scarto, 16)
  return Buffer.concat([...locali, indice, fine])
}

/** Il .docx intero, dal testo. */
export function documentoWord(testo: string): Buffer {
  const b = (s: string) => Buffer.from(s, 'utf8')
  return zip([
    { nome: '[Content_Types].xml', dati: b(TIPI) },
    { nome: '_rels/.rels', dati: b(RELAZIONI) },
    { nome: 'word/_rels/document.xml.rels', dati: b(RELAZIONI_DOC) },
    { nome: 'word/document.xml', dati: b(documento(testo)) },
    { nome: 'word/styles.xml', dati: b(STILI) }
  ])
}
