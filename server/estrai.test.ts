// Aprire i formati che una persona ha davvero sul disco.
//
// Il computer di Tobia ha migliaia di file e Myynd ne leggeva sessantasei. La
// ragione non era un permesso né un tetto: era l'elenco delle estensioni. Un
// preventivo in `.xlsx`, una presentazione in `.pptx`, una pagina salvata in
// `.html`, un appunto scritto con TextEdit in `.rtf` — quattro cose normali,
// quattro file che venivano contati e buttati.
//
// Qui si prova la parte che sbaglia in silenzio: l'estrazione. Un `.xlsx`
// letto male non dà errore, dà una tabella di numeri d'ordine; un `.html`
// letto male non dà errore, dà `class` e `onclick` dentro la mente. Sono i due
// modi in cui una fonte «funziona» e non serve a niente.
//
// I due archivi si costruiscono qui con jszip invece di tenerne due nel
// repository: un `.xlsx` vero sono ottanta file dentro uno zip, e nessuno
// saprebbe più dire quale pezzo la prova stia davvero guardando.
//
//   node --test server/estrai.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { quiDentro, daHtml, daRtf, leggibile, tipoDi, sembraUnRegistro, LETTI } from './connettori/estrai.ts'

/** Lo scheletro minimo di un archivio Office: solo i pezzi che si leggono. */
async function archivio(file: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip()
  for (const [nome, contenuto] of Object.entries(file)) zip.file(nome, contenuto)
  return zip.generateAsync({ type: 'nodebuffer' })
}

// — i file che si sanno aprire —

test('i formati nuovi sono nell’elenco, quelli che non sappiamo leggere no', () => {
  for (const n of ['preventivo.xlsx', 'Piano.pptx', 'pagina.html', 'pagina.HTM', 'appunti.rtf']) {
    assert.equal(leggibile(n), true, n)
  }
  // `.doc`, i formati di Apple e le immagini restano fuori: dentro non c'è
  // nessun XML da leggere, e un'immagine senza riconoscimento ottico non ha testo
  for (const n of ['vecchio.doc', 'Lettera.pages', 'Conti.numbers', 'Keynote.key', 'scansione.png']) {
    assert.equal(leggibile(n), false, n)
  }
  assert.equal(LETTI.includes('.xlsx'), true)
  assert.equal(LETTI.includes('.pptx'), true)
})

test('il tipo dei formati nuovi è una parola da persone', () => {
  assert.equal(tipoDi('Preventivo.XLSX'), 'tabella')
  assert.equal(tipoDi('Piano.pptx'), 'presentazione')
  assert.equal(tipoDi('pagina.html'), 'pagina')
  assert.equal(tipoDi('appunti.rtf'), 'documento')
})

// — il foglio di calcolo —

test('un .xlsx dà le parole delle celle, non i numeri d’ordine', async () => {
  /*
   * Le parole di un foglio stanno quasi tutte in `sharedStrings.xml`, e nella
   * cella c'è solo l'indice: `t="s"` con dentro `<v>2</v>`. Chi legge solo i
   * fogli indicizza «0 1 2 1200», che è un documento senza una sola parola.
   */
  const buf = await archivio({
    'xl/sharedStrings.xml':
      '<?xml version="1.0"?><sst count="3" uniqueCount="3">' +
      '<si><t>Cliente</t></si><si><t>Totale</t></si><si><t>Rossi &amp; figli</t></si></sst>',
    'xl/worksheets/sheet1.xml':
      '<worksheet><sheetData>' +
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
      '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>1200</v></c></row>' +
      // una cella scritta «in linea»: certi gestionali esportano così, senza
      // l'elenco condiviso, e senza questo ramo metà dei loro file resta vuota
      '<row r="3"><c r="A3" t="inlineStr"><is><t>Acconto versato</t></is></c><c r="B3"/></row>' +
      '</sheetData></worksheet>'
  })
  const testo = await quiDentro(buf, 'preventivo.xlsx')
  assert.equal(testo, 'Cliente Totale\nRossi & figli 1200\nAcconto versato')
})

// — la presentazione —

test('un .pptx dà una riga per slide, nell’ordine delle slide', async () => {
  const slide = (righe: string[]) =>
    '<p:sld><p:cSld><p:spTree><p:sp><p:txBody>' +
    righe.map(r => `<a:p><a:r><a:t>${r}</a:t></a:r></a:p>`).join('') +
    '</p:txBody></p:sp></p:spTree></p:cSld></p:sld>'
  const buf = await archivio({
    'ppt/slides/slide1.xml': slide(['Il piano', 'Tre punti']),
    'ppt/slides/slide2.xml': slide(['I conti']),
    // dieci: in ordine alfabetico finirebbe fra la uno e la due, ed è il
    // difetto che nessuno vede finché la presentazione non passa le nove slide
    'ppt/slides/slide10.xml': slide(['Le conclusioni']),
    // le note del relatore non sono quello che è stato detto: restano fuori
    'ppt/notesSlides/notesSlide1.xml': slide(['non dirlo a nessuno'])
  })
  const testo = await quiDentro(buf, 'Piano.pptx')
  assert.equal(testo, 'Il piano Tre punti\nI conti\nLe conclusioni')
})

// — la pagina salvata —

test('un .html dà il testo che si legge, non il codice che lo disegna', () => {
  const pagina = [
    '<!doctype html><html><head><title>Preventivo 2026</title>',
    '<style>p{color:red}</style>',
    '<script>var x = 1 < 2; document.write("ciao")</script>',
    '</head><body><!-- una nota per chi scrive -->',
    '<h1 class="grande">Preventivo</h1>',
    '<p>Totale &amp; sconto:&nbsp;1.200&#39;</p>',
    '<div>Rossi</div></body></html>'
  ].join('')
  assert.equal(daHtml(pagina), 'Preventivo 2026\n\nPreventivo\nTotale & sconto: 1.200\'\nRossi')
})

test('l’html senza titolo resta il suo testo, e i tag non lasciano nomi in giro', () => {
  const testo = daHtml('<div class="riga"><span>Ciao</span> <b>Marta</b></div>')
  assert.equal(testo, 'Ciao Marta')
  assert.ok(!/class|span/.test(testo))
})

// — l'appunto di TextEdit —

test('un .rtf dà le parole, non la tabella dei font', () => {
  const rtf = [
    '{\\rtf1\\ansi\\ansicpg1252\\cocoartf2639',
    '{\\fonttbl\\f0\\fswiss\\fcharset0 Helvetica;}',
    '{\\colortbl;\\red255\\green255\\blue255;}',
    '\\pard\\tx720\\pardirnatural\\partightenfactor0',
    // la barra rovescia a fine riga è come la scrive TextEdit: vuol dire «a capo»
    '\\f0\\fs24 \\cf0 Caff\\\'e8 con Marta\\',
    'Preventivo: 1.200 euro\\par',
    '}'
  ].join('\n')
  const testo = daRtf(rtf)
  assert.equal(testo, 'Caffè con Marta\nPreventivo: 1.200 euro')
  // il nome del font è la cosa che finiva in cima a ogni documento
  assert.ok(!/Helvetica|fonttbl|cocoartf/.test(testo))
})

test('un .rtf passa anche dalla strada normale, con lo stesso risultato', async () => {
  const rtf = '{\\rtf1\\ansi{\\fonttbl\\f0 Times;}\\f0\\fs24 Una riga sola, per intero.\\par}'
  assert.equal(await quiDentro(Buffer.from(rtf, 'utf8'), 'appunti.rtf'), 'Una riga sola, per intero.')
})

// — il testo che non l'ha scritto nessuno —
//
// Nella casa di Tobia c'era `~/terminals/`: quattordici file `268734.txt` …
// `268746.txt`, il registro di ogni sessione di terminale. Sono entrati
// nell'indice come documenti e la rassegna del mattino ne ha parlato quattro
// volte — «il server di sviluppo è stato riavviato più volte» — citandoli come
// fonti. Il nome li prende quasi sempre; qui si prova l'altra metà, quella che
// guarda dentro. E si prova soprattutto il contrario: che un appunto vero, con
// dentro un blocco di codice, e una tabella di fatture non vengano scambiati
// per registri. Un falso positivo qui è un documento che sparisce dalla mente.

test('un registro di sessione si riconosce dalla sua intestazione', () => {
  const registro = [
    'pid: 69516 cwd: "/Users/tobia/Desktop/myynd.prototype" command: "mdfind -name terminals" title: "mdfind" status: succeeded started_at: 2026-09-01T20:49:42.779Z',
    '---',
    '{"created_at":"2026-09-01T20:49:39Z","description":null,"exit_code":0,"stderr":"","stdout":"/Users/tobia/terminals"}'
  ].join('\n')
  assert.equal(sembraUnRegistro(registro), true)
})

test('un dump di JSON a righe è un registro anche senza intestazione', () => {
  const righe: string[] = []
  for (let i = 0; i < 10; i++) {
    righe.push(`{"ts":"2026-09-0${(i % 9) + 1}T10:0${i}:00Z","level":"info","msg":"server riavviato","porta":${3000 + i}}`)
  }
  assert.equal(sembraUnRegistro(righe.join('\n')), true)
})

test('un appunto di una persona non è un registro, nemmeno con dentro un blocco di codice', () => {
  const nota = [
    'Un appunto normale, scritto a mano.',
    '',
    'Riunione con Marta: il preventivo va rifatto entro venerdì, e il fornitore',
    'nuovo chiede un anticipo del trenta per cento. Da chiedere a Luca se il',
    'contratto di gennaio lo permette.',
    '',
    'Il comando per far ripartire il server, che dimentico ogni volta:',
    '',
    '```',
    'npm run dev',
    '```',
    '',
    'Poi si apre da solo sulla porta tremila.'
  ].join('\n')
  assert.equal(sembraUnRegistro(nota), false)
  assert.equal(sembraUnRegistro('Caffè con Marta giovedì alle dieci, da confermare.'), false)
})

test('una tabella di fatture non è un registro: le virgole non sono un indizio', () => {
  const csv = [
    'Data,Cliente,Descrizione,Imponibile,IVA,Totale',
    '2026-01-12,"Rossi & figli",Consulenza,1200,264,1464',
    '2026-02-03,"Bianchi srl",Progetto,3400,748,4148',
    '2026-02-28,"Verdi spa",Manutenzione,800,176,976'
  ].join('\n')
  assert.equal(sembraUnRegistro(csv, { soloIntestazione: true }), false)
  // e un `.csv` che è davvero un registro di sessione lo dice dalla prima riga
  assert.equal(sembraUnRegistro('pid: 1,cwd: /tmp,status: succeeded', { soloIntestazione: true }), true)
})
