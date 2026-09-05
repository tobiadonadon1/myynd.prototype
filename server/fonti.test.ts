// Le fonti nuove: i punti in cui sbaglierebbero senza dirlo.
//
// Non si prova la rete. Si prova quello che succede *ai dati* intorno alla
// rete, che è dove i guasti non fanno rumore — un messaggio indicizzato come
// una riga di codici, una firma che si può fabbricare, un recinto che dice di
// esserci e non c'è.
//
// Le quattro cose che si guardano, e perché ognuna:
//
//   · **la firma di WhatsApp.** È l'unica difesa di un indirizzo che, per come
//     è fatta l'API di Meta, deve stare aperto a internet. Se si potesse
//     aggirare, chiunque scriverebbe nella mente di qualcun altro.
//   · **il recinto delle automazioni.** `attrezzi.ts` e `automazioni.ts`
//     tenevano due elenchi della stessa corrispondenza, e uno solo veniva
//     aggiornato. Il difetto non dà errore: dà un'automazione che dichiara di
//     guardare una fonte e le guarda tutte.
//   · **le scritte di Slack.** `<@U04J8KQ2M>` indicizzato com'è vuol dire che
//     cercare il nome di una persona non trova la conversazione con quella
//     persona — cioè la ricerca che si farà più spesso.
//   · **il catalogo.** Una fonte nuova che porta documenti e che nessuno ha
//     messo nel recinto è una fonte che nessuna automazione può restringere.
//
//   node --test server/fonti.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASA = mkdtempSync(join(tmpdir(), 'myynd-fonti-'))
mkdirSync(join(CASA, '.myynd'), { recursive: true })
const CASA_VERA = process.env.HOME
process.env.HOME = CASA

const SEGRETO = 'un-segreto-che-solo-meta-conosce'
writeFileSync(join(CASA, '.myynd', 'config.json'), JSON.stringify({
  whatsapp: { token: 'x', numero: '123', segreto: SEGRETO, parola: 'apriti-sesamo' },
  slack: { token: 'xoxp-finto' },
  microsoft: { clientId: 'x', refresh: 'y', parti: ['posta', 'file'] }
}), { mode: 0o600 })

const whatsapp = await import('./connettori/whatsapp.ts')
const granola = await import('./connettori/granola.ts')
const ospitato = await import('./ospitato.ts')
const slack = await import('./connettori/slack.ts')
const microsoft = await import('./connettori/microsoft.ts')
const estrai = await import('./connettori/estrai.ts')
const registro = await import('./connettori/registro.ts')
const attrezzi = await import('./attrezzi.ts')

after(() => {
  process.env.HOME = CASA_VERA
  rmSync(CASA, { recursive: true, force: true })
})

// — WhatsApp: la firma è tutta la porta —

const firma = (corpo: string, con = SEGRETO) =>
  'sha256=' + createHmac('sha256', con).update(Buffer.from(corpo)).digest('hex')

test('un corpo firmato con il segreto giusto passa', () => {
  const corpo = '{"entry":[]}'
  assert.equal(whatsapp.firmaBuona(Buffer.from(corpo), firma(corpo)), true)
})

test('un corpo firmato con un altro segreto non passa', () => {
  const corpo = '{"entry":[]}'
  assert.equal(whatsapp.firmaBuona(Buffer.from(corpo), firma(corpo, 'un altro segreto')), false)
})

test('la firma vale per quel corpo e non per un altro', () => {
  // il caso vero: qualcuno intercetta una richiesta buona e ne cambia il
  // contenuto tenendo la firma. Se passasse, la firma non servirebbe a niente
  const buono = '{"entry":[{"changes":[]}]}'
  const cattivo = '{"entry":[{"changes":[{"value":{"messages":[]}}]}]}'
  assert.equal(whatsapp.firmaBuona(Buffer.from(cattivo), firma(buono)), false)
})

test('senza firma non passa niente', () => {
  assert.equal(whatsapp.firmaBuona(Buffer.from('{}'), undefined), false)
  assert.equal(whatsapp.firmaBuona(Buffer.from('{}'), ''), false)
  // una firma in un formato che non conosciamo non è «forse buona»
  assert.equal(whatsapp.firmaBuona(Buffer.from('{}'), 'sha1=abcdef'), false)
})

test('la stretta di mano vuole la parola giusta, e rimanda la sfida', () => {
  const bene = whatsapp.verifica({
    'hub.mode': 'subscribe', 'hub.verify_token': 'apriti-sesamo', 'hub.challenge': '31415'
  })
  assert.deepEqual(bene, { ok: true, sfida: '31415' })

  const male = whatsapp.verifica({
    'hub.mode': 'subscribe', 'hub.verify_token': 'apriti-sesamoo', 'hub.challenge': '31415'
  })
  assert.equal(male.ok, false)
})

test('una parola giusta con il modo sbagliato non apre', () => {
  // Meta manda sempre `subscribe`: qualunque altra cosa non viene da lei
  const e = whatsapp.verifica({
    'hub.mode': 'unsubscribe', 'hub.verify_token': 'apriti-sesamo', 'hub.challenge': '1'
  })
  assert.equal(e.ok, false)
})

// — Slack: i codici tornano nomi —

test('le menzioni diventano nomi, o la ricerca per nome non trova niente', () => {
  const chi = new Map([['U04J8KQ2M', 'Marta Bianchi']])
  assert.equal(
    slack.inChiaro('ciao <@U04J8KQ2M>, hai visto il preventivo?', chi),
    'ciao Marta Bianchi, hai visto il preventivo?'
  )
})

test('un link tiene la sua etichetta, che è la parte che si cerca', () => {
  assert.equal(
    slack.inChiaro('guarda <https://esempio.it/x|il preventivo Rossi>', new Map()),
    'guarda il preventivo Rossi (https://esempio.it/x)'
  )
})

test('una menzione di qualcuno che non conosciamo non lascia un codice in giro', () => {
  assert.equal(slack.inChiaro('<@U0SCONOSCIUTO> ci pensi tu?', new Map()), '@qualcuno ci pensi tu?')
})

test('i canali restano canali, e le entità tornano caratteri', () => {
  assert.equal(slack.inChiaro('vedi <#C01|generale> &amp; <!here>', new Map()), 'vedi #generale & @tutti')
})

// — Microsoft: l'HTML non finisce nell'indice —

test('il corpo HTML di una mail diventa testo, non nomi di tag', () => {
  const html = '<style>p{color:red}</style><p>Ciao Marta,</p><div>ti mando il preventivo.</div>'
  assert.equal(microsoft.spoglia(html), 'Ciao Marta,\nti mando il preventivo.')
})

test('spogliare un testo che è già testo non lo rovina', () => {
  assert.equal(microsoft.spoglia('Ciao Marta, ti mando il preventivo.'), 'Ciao Marta, ti mando il preventivo.')
})

// — i file: cosa si sa aprire —

test('si aprono i documenti, non i file macchina', () => {
  for (const n of ['contratto.pdf', 'Nota.docx', 'appunti.md', 'listino.csv']) {
    assert.equal(estrai.leggibile(n), true, n)
  }
  for (const n of ['app.js', 'foto.png', 'archivio.zip', 'senzaestensione']) {
    assert.equal(estrai.leggibile(n), false, n)
  }
})

test('il tipo è una parola da persone, non un MIME', () => {
  assert.equal(estrai.tipoDi('contratto.PDF'), 'pdf')
  assert.equal(estrai.tipoDi('Nota.docx'), 'documento')
  assert.equal(estrai.tipoDi('listino.csv'), 'tabella')
})

// — il recinto: un elenco solo, non due —

test('ogni attrezzo che legge l’indice punta a fonti che esistono davvero', () => {
  const vere = new Set(registro.FONTI)
  for (const a of attrezzi.ATTREZZI) {
    for (const f of attrezzi.fontiDi(a.nome)) {
      assert.ok(vere.has(f), `«${a.nome}» punta a «${f}», che non è una fonte del catalogo`)
    }
  }
})

test('ogni fonte che porta documenti è raggiungibile da un attrezzo', () => {
  /*
   * È il difetto che non dà errore.
   *
   * Una fonte nuova collegata, che riempie l'indice, e nessun attrezzo che la
   * nomini: nessuna automazione può dichiararla, quindi nessuna può
   * *restringersi* a lei — e chi ne scrive una che dovrebbe guardare lì si
   * ritrova una cosa che gira ogni mattina guardando altrove.
   */
  const raggiunte = new Set(attrezzi.ATTREZZI.flatMap(a => attrezzi.fontiDi(a.nome)))
  const orfane = registro.FONTI.filter(f => !raggiunte.has(f))
  assert.deepEqual(orfane, [], `fonti senza un attrezzo che le apra: ${orfane.join(', ')}`)
})

test('il catalogo non ha due voci con lo stesso id', () => {
  // due voci con lo stesso id vuol dire una scheda che ne nasconde un'altra,
  // e uno «scollega» che stacca quella sbagliata
  const visti = new Set<string>()
  const doppi = registro.CATALOGO.filter(c => visti.size === visti.add(c.id).size)
  assert.deepEqual(doppi.map(c => c.id), [])
})

test('gli attrezzi non hanno due volte lo stesso nome né la stessa tinta', () => {
  const nomi = attrezzi.ATTREZZI.map(a => a.nome)
  assert.equal(new Set(nomi).size, nomi.length, 'due attrezzi con lo stesso nome')
  // la tinta è come si riconosce una pastiglia da lontano: due uguali vuol
  // dire due fonti che sembrano la stessa cosa sulla scheda di un'automazione
  const tinte = attrezzi.ATTREZZI.map(a => a.tinta)
  assert.equal(new Set(tinte).size, tinte.length, 'due attrezzi con la stessa tinta')
})

// — Granola: un file di qualcun altro, che nessuno ci ha promesso —

/**
 * La cache come la scrive Granola: un JSON che dentro ne contiene un altro
 * **come stringa**. È la prima cosa contro cui sbatte chi prova a leggerla,
 * perché `JSON.parse` riesce senza lamentarsi e quello che si ha in mano è
 * una stringa dove ci si aspettava una mappa.
 */
const scriviCache = (dentro: unknown) => {
  mkdirSync(join(CASA, 'Library', 'Application Support', 'Granola'), { recursive: true })
  writeFileSync(
    join(CASA, 'Library', 'Application Support', 'Granola', 'cache-v3.json'),
    JSON.stringify({ cache: JSON.stringify(dentro) })
  )
}

test('la cache annidata si apre, e le note diventano documenti', async () => {
  scriviCache({
    state: {
      documents: {
        d1: {
          id: 'd1', title: 'Punto con Riccardo', created_at: '2026-09-03T09:00:00.000Z',
          notes_markdown: 'Preventivo entro venerdì',
          google_calendar_event: { attendees: [{ displayName: 'Riccardo', email: 'r@esempio.it' }] }
        }
      }
    }
  })
  const e = await granola.leggi()
  assert.equal(e.docs.length, 1)
  const d = e.docs[0]!
  assert.equal(d.id, 'granola:d1')
  assert.equal(d.fonte, 'granola')
  assert.equal(d.titolo, 'Punto con Riccardo')
  /*
   * Chi c'era deve stare *dentro* il corpo, non solo accanto.
   *
   * L'indice cerca a parole intere sul testo del documento: fuori di lì il
   * nome sta in un campo che la ricerca non guarda, e «cosa ci siamo detti
   * con Riccardo» non trova la riunione con Riccardo.
   */
  assert.match(d.corpo, /Riccardo/)
  assert.match(d.corpo, /Preventivo entro venerdì/)
})

test('le note scritte come albero dell’editor diventano testo, non JSON', async () => {
  /*
   * Granola non salva testo: salva il documento ProseMirror in cui l'hai
   * visto. Preso com'è, nell'indice ci finisce `{"type":"doc",…}` — una nota
   * che non si trova cercando nessuna delle parole che contiene.
   */
  scriviCache({
    state: {
      documents: {
        d2: {
          id: 'd2', title: 'Commercialista', created_at: '2026-09-04T14:30:00.000Z',
          notes: {
            type: 'doc',
            content: [
              { type: 'heading', content: [{ type: 'text', text: 'Scadenze' }] },
              { type: 'bulletList', content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'IVA il 16' }] }] }
              ] }
            ]
          }
        }
      }
    }
  })
  const e = await granola.leggi()
  const corpo = e.docs[0]!.corpo
  assert.ok(!corpo.includes('"type"'), 'l’albero dell’editor è finito nell’indice così com’è')
  assert.match(corpo, /Scadenze/)
  assert.match(corpo, /IVA il 16/)
})

test('il riassunto di Granola e i propri appunti stanno tutti e due nel documento', async () => {
  // rispondono a due domande diverse: cosa è stato deciso, e cosa hai pensato
  // tu mentre lo decidevate. Tenerne uno solo butta via metà della riunione
  scriviCache({
    state: {
      documents: { d3: { id: 'd3', title: 'Riunione', notes_markdown: 'i miei appunti' } },
      documentPanels: {
        d3: { p1: { content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'il riassunto di Granola' }] }] } } }
      }
    }
  })
  const e = await granola.leggi()
  assert.match(e.docs[0]!.corpo, /il riassunto di Granola/)
  assert.match(e.docs[0]!.corpo, /i miei appunti/)
})

test('una nota buttata via resta buttata, e una senza parole si conta invece di sparire', async () => {
  scriviCache({
    state: {
      documents: {
        viva: { id: 'viva', title: 'Viva', notes_plain: 'qualcosa' },
        morta: { id: 'morta', title: 'Morta', notes_plain: 'roba', deleted_at: '2026-09-01T00:00:00.000Z' },
        muta: { id: 'muta', title: 'Riunione senza appunti' }
      }
    }
  })
  const e = await granola.leggi()
  assert.deepEqual(e.docs.map(d => d.id), ['granola:viva'])
  /*
   * `vuote` non è una statistica: è la riga che spiega perché chi ha quaranta
   * riunioni legge «Granola · 12 documenti». Senza, sembra che il
   * collegamento perda roba.
   */
  assert.equal(e.vuote, 1)
})

test('quando il file non si capisce più lo si dice, invece di collegarsi a zero', async () => {
  /*
   * `cache-v3.json` ha già un numero di versione in fondo: è Granola stessa
   * che avvisa che ce n'è stata una due. Il giorno della quattro, il modo
   * peggiore di comportarsi è collegarsi lo stesso e restare a zero per
   * sempre — una fonte rotta che si scopre dopo un mese.
   */
  mkdirSync(join(CASA, 'Library', 'Application Support', 'Granola'), { recursive: true })
  writeFileSync(join(CASA, 'Library', 'Application Support', 'Granola', 'cache-v3.json'), '{"qualcosa":"d’altro"}')
  await assert.rejects(() => granola.leggi(), /cambiato il modo in cui salva/)
})

test('Granola non si offre su un server, dove quella cartella non è di nessuno', () => {
  // legge `~/Library/Application Support` del Mac di chi la usa: dentro un
  // contenitore quella cartella o non c'è o è quella del server
  assert.ok(ospitato.SOLO_IN_CASA.includes('granola'))
})
