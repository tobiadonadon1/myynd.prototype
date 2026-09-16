import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { briefProduzione, riferimentiPer, tipografiaDocumento, tipoProduzione } from './stile-lavoro.ts'
import type { Documento } from './store.ts'
const doc = (id: string, title: string, extra: Partial<Documento> = {}): Documento => ({ id, fonte: 'desktop', tipo: 'file', titolo: title, corpo: 'A focused discussion of the main topic and its practical implications.', ...extra })

test('relevant historical work outranks generic files; receipts and incoming mail cannot define writing style', () => {
  const refs = riferimentiPer('Write an email to Alice about robotics research', [
    doc('good', 'Alice robotics research', { tipo: 'email', fonte: 'posta', inviato: true, quando: '2020-01-01' }),
    doc('inbound', 'Alice robotics research', { tipo: 'email', fonte: 'posta', inviato: false }),
    doc('other-person', 'Bob robotics research', { tipo: 'email', fonte: 'posta', inviato: true }),
    doc('receipt', 'Alice robotics receipt'), doc('cv', 'Alice robotics CV'),
    doc('promo', 'Alice robotics research', { massa: true }),
    doc('agent', 'Alice robotics AGENTS.md'),
    doc('generated', 'Alice robotics research', { percorso: '/tmp/.myynd/consegne/old.docx' }),
    doc('irrelevant', 'Beer spreadsheet')
  ])
  assert.deepEqual(refs.map(r => r.id), ['good'])
})

test('unrelated documents do not become references merely because there are no better matches', () => {
  assert.deepEqual(riferimentiPer('Write an essay on urban architecture for Alice', [doc('other', 'Quarterly robotics research')]), [])
})

test('explicit style preferences and learned observations remain distinguishable; plain text cannot establish a font', async () => {
  const brief = await briefProduzione({ compito: 'Write an essay about robotics research', cartelle: [],
    documenti: [doc('plain', 'Robotics research', { corpo: 'I use Helvetica 14pt in this document.' })],
    blocchi: [
      { etichetta: 'come_scrivo', descrizione: 'Writing style', valore: 'Use short paragraphs.', tetto: 700 },
      { etichetta: 'stile', descrizione: 'Writing style', valore: 'Often formal.', tetto: 700, daMe: '2026-01-01' }
    ] })
  assert.deepEqual(brief.preferenzeEsplicite, ['Use short paragraphs.'])
  assert.match(brief.osservazioni[0], /Often formal/)
  assert.equal(brief.tipografia.origine, 'default_editoriale')
  assert.equal(brief.tipografia.font, 'Georgia')
  assert.match(brief.testo, /Non attribuirlo alla persona/)
})

test('font metadata comes from a selected DOCX inside a connected folder; symlinks cannot escape', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'myynd-style-'))
  const outside = await mkdtemp(join(tmpdir(), 'myynd-style-out-'))
  try {
    const zip = new JSZip()
    zip.file('word/styles.xml', '<w:styles><w:style w:styleId="Normal"><w:rPr><w:rFonts w:ascii="Aptos"/><w:sz w:val="24"/></w:rPr></w:style></w:styles>')
    const path = join(dir, 'research.docx')
    await writeFile(path, await zip.generateAsync({ type: 'nodebuffer' }))
    const d = doc('styled', 'Robotics research', { percorso: path })
    assert.deepEqual(await tipografiaDocumento(d, [dir]), { origine: 'documento', font: 'Aptos', punti: 12, fonteId: 'styled' })
    assert.equal(await tipografiaDocumento(d, [outside]), null)
    const link = join(outside, 'escape.docx')
    await symlink(path, link)
    assert.equal(await tipografiaDocumento({ ...d, percorso: link }, [outside]), null)
  } finally { await rm(dir, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }) }
})

test('RTF reads an actual default font and body size', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'myynd-style-rtf-'))
  try {
    const path = join(dir, 'draft.rtf')
    await writeFile(path, '{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0\\froman Georgia;}}\\pard\\f0\\fs22 Text}')
    const result = await tipografiaDocumento(doc('rtf', 'Robotics research', { percorso: path }), [dir])
    assert.equal(result?.font, 'Georgia'); assert.equal(result?.punti, 11)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('production expectations distinguish an actual rendered video or trained agent from a script', async () => {
  assert.equal(tipoProduzione('Create a slide deck'), 'presentazione')
  assert.equal(tipoProduzione('Write an email'), 'email')
  for (const compito of ['Create a video about robotics', 'Train an agent for robotics']) {
    const b = await briefProduzione({ compito, documenti: [], blocchi: [], cartelle: [] })
    assert.match(b.testo, /non equivale/)
    assert.match(b.testo, /non conferiscono capacità/)
  }
})

test('current typography instructions override saved preferences and source metadata; learned preferences do not', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'myynd-style-priority-'))
  try {
    const zip = new JSZip()
    zip.file('word/styles.xml', '<w:styles><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>')
    const path = join(dir, 'research.docx')
    await writeFile(path, await zip.generateAsync({ type: 'nodebuffer' }))
    const common = { documenti: [doc('ref', 'Robotics research', { percorso: path })], cartelle: [dir], blocchi: [
      { etichetta: 'come_scrivo', descrizione: 'Writing style', valore: 'I use Helvetica Neue for reports, 12pt.', tetto: 700 },
      { etichetta: 'stile', descrizione: 'Style', valore: 'Use Arial 14pt.', tetto: 700, daMe: '2026-01-01' }
    ] }
    const saved = await briefProduzione({ ...common, compito: 'Write robotics research' })
    assert.deepEqual(saved.tipografia, { origine: 'preferenza_esplicita', font: 'Helvetica Neue', punti: 12 })
    const current = await briefProduzione({ ...common, compito: 'Write robotics research', nota: 'Use Times New Roman 11pt.' })
    assert.deepEqual(current.tipografia, { origine: 'preferenza_esplicita', font: 'Times New Roman', punti: 11 })
    assert.match(current.testo, /preferenze esplicite prevalgono/)
    const inherited = await briefProduzione({ ...common, compito: 'Write robotics research', nota: 'Font size: 10pt.' })
    assert.equal(inherited.tipografia.font, 'Helvetica Neue'); assert.equal(inherited.tipografia.punti, 10)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('typography inference rejects prose about fonts, negative instructions, unknown font names and unsafe sizes', async () => {
  const { tipografiaEsplicita } = await import('./stile-lavoro.ts')
  assert.deepEqual(tipografiaEsplicita('Write an essay about Georgia and typography.'), {})
  assert.deepEqual(tipografiaEsplicita("Do not use Helvetica Neue. Never use Arial."), {})
  assert.deepEqual(tipografiaEsplicita('Use UnknownFont 12pt.'), {})
  assert.deepEqual(tipografiaEsplicita('font: Times New Roman 90pt'), { font: 'Times New Roman' })
  assert.deepEqual(tipografiaEsplicita('Use Georgia. Use Aptos 12pt.'), { font: 'Aptos', punti: 12 })
})

test('a current font prohibition cannot silently fall back to the prohibited saved font', async () => {
  const b = await briefProduzione({ compito: 'Write robotics research. Do not use Georgia.', documenti: [], cartelle: [], blocchi: [
    { etichetta: 'come_scrivo', descrizione: 'Style', valore: 'Use Georgia.', tetto: 700 }
  ] })
  assert.notEqual(b.tipografia.font, 'Georgia')
  assert.equal(b.tipografia.origine, 'preferenza_esplicita')
})

test('optional stalled style lookup falls back within one budget and consumes late rejection', async () => {
  let rejectLate!: (e: Error) => void
  let signal: AbortSignal | undefined
  let calls = 0
  const started = Date.now()
  const result = await briefProduzione({ compito: 'Write robotics research', documenti: [doc('a', 'Robotics research'), doc('b', 'Robotics research')], blocchi: [], cartelle: [] }, {
    tempoStileMs: 25,
    leggiTipografia: async (_d, _roots, s) => {
      calls++; signal = s
      return new Promise((_resolve, reject) => { rejectLate = reject })
    }
  })
  assert.equal(result.tipografia.origine, 'default_editoriale')
  assert.ok(Date.now() - started < 1000, 'optional lookup must not hold production indefinitely')
  assert.equal(calls, 1, 'deadline is shared; later candidates do not restart it')
  assert.equal(signal?.aborted, true)
  rejectLate(new Error('cloud file failed after timeout'))
  await new Promise(resolve => setImmediate(resolve))
})

test('cancelling a production brief cancels its optional reader without starting more references', async () => {
  const controller = new AbortController()
  let readerSignal: AbortSignal | undefined
  const reason = new Error('user recalled task')
  const pending = briefProduzione({ compito: 'Write robotics research', documenti: [doc('a', 'Robotics research')], blocchi: [], cartelle: [] }, {
    signal: controller.signal,
    leggiTipografia: async (_d, _roots, signal) => { readerSignal = signal; return new Promise(() => {}) }
  })
  controller.abort(reason)
  await assert.rejects(pending, e => e === reason)
  assert.equal(readerSignal?.aborted, true)
  await assert.rejects(briefProduzione({ compito: 'anything', documenti: [], blocchi: [], cartelle: [] }, { signal: controller.signal }), e => e === reason)
})

test('a cancelled native typography reader does not inspect the file', async () => {
  const signal = AbortSignal.abort()
  assert.equal(await tipografiaDocumento(doc('a', 'Robotics research', { percorso: '/unavailable/research.docx' }), ['/unavailable'], signal), null)
})
