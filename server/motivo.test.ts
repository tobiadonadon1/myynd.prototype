// Perché nasce una riga: chiesta, qualcuno aspetta, o promessa. Il resto non è una riga.
//
//   node --import ./build/test-profile.mjs --test server/motivo.test.ts

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dati = mkdtempSync(join(tmpdir(), 'myynd-motivo-'))
process.env.MYYND_DATI = dati
writeFileSync(join(dati, 'config.json'), JSON.stringify({ lingua: 'en', nome: 'Anna' }))
const store = await import('./store.ts')
const progetti = await import('./progetti.ts')
const mandato = await import('./mandato.ts')
const candidati = await import('./candidati.ts')
const motivo = await import('./motivo.ts')

after(() => { store.chiudiIndici(); delete process.env.MYYND_DATI; rmSync(dati, { recursive: true, force: true }) })

const ORA = Date.now()
const GIORNO = 86_400_000
const iso = (t: number) => new Date(t).toISOString()

test('aspetta: una persona vera che ha scritto da poco e non ha avuto risposta; non una newsletter, non un file qualunque', () => {
  store.salvaDocumenti([
    { id: 'posta:1', fonte: 'posta', tipo: 'email', titolo: 'Quote for the kitchen', corpo: 'Hi Anna, here is the quote.', autore: 'Marco <marco@studio.example>', quando: iso(ORA - GIORNO), messageId: 'm1@studio.example', filo: 'f1' },
    { id: 'posta:2', fonte: 'posta', tipo: 'email', titolo: 'Weekly digest', corpo: 'Top stories this week.', autore: 'News <news@list.example>', quando: iso(ORA - GIORNO), massa: true },
    { id: 'posta:3', fonte: 'posta', tipo: 'email', titolo: 'Old thread', corpo: 'Can you check this?', autore: 'Lia <lia@example.com>', quando: iso(ORA - 30 * GIORNO) },
    { id: 'posta:4', fonte: 'posta', tipo: 'email', titolo: 'Re: Quote for the kitchen', corpo: 'Thanks Marco, all good.', quando: iso(ORA - GIORNO / 2), inviato: true, risponde: 'm1@studio.example', filo: 'f1' },
    { id: 'posta:5', fonte: 'posta', tipo: 'email', titolo: 'Dinner?', corpo: 'Are you free on Friday?', autore: 'Sara <sara@example.com>', quando: iso(ORA - GIORNO), messageId: 'm5@example.com', filo: 'f5' },
    { id: 'desktop:/x/notes.md', fonte: 'desktop', tipo: 'file', titolo: 'Atlas notes', corpo: 'The Atlas launch moved to November.', quando: iso(ORA - GIORNO) },
    { id: 'note:riunione', fonte: 'note', tipo: 'nota', titolo: 'Call with the client', corpo: 'Could you send the revised plan by Monday?', quando: iso(ORA - GIORNO) }
  ] as never)
  assert.equal(motivo.aspetta(store.documento('posta:1'), ORA), false, 'ha già risposto')
  assert.equal(motivo.aspetta(store.documento('posta:2'), ORA), false, 'posta di massa')
  assert.equal(motivo.aspetta(store.documento('posta:3'), ORA), false, 'troppo vecchia')
  assert.equal(motivo.aspetta(store.documento('posta:4'), ORA), false, 'è sua')
  assert.equal(motivo.aspetta(store.documento('posta:5'), ORA), true)
  assert.equal(motivo.aspetta(store.documento('desktop:/x/notes.md'), ORA), false, 'un file che parla del progetto non aspetta niente')
  assert.equal(motivo.aspetta(store.documento('note:riunione'), ORA), true, 'una richiesta scritta in una nota sì')
  store.salvaDocumenti([
    { id: 'note:azioni', fonte: 'note', tipo: 'nota', titolo: 'Weekly sync', corpo: 'Action items:\nAnna to send the proposal to Marco by Friday', quando: iso(ORA - GIORNO) },
    { id: 'note:it', fonte: 'note', tipo: 'nota', titolo: 'Riunione cantiere', corpo: 'Anna manda la bozza a Luca entro giovedì.', quando: iso(ORA - GIORNO) },
    { id: 'slack:c1', fonte: 'slack', tipo: 'conversazione', titolo: '#design', corpo: 'Luca: can you review the floor plan?\nAnna: done, sent it', quando: iso(ORA - GIORNO) },
    { id: 'slack:c2', fonte: 'slack', tipo: 'conversazione', titolo: '#design', corpo: 'Anna: sent the plan\nLuca: could you add the window sizes?', quando: iso(ORA - GIORNO) },
    { id: 'slack:c3', fonte: 'slack', tipo: 'conversazione', titolo: '#random', corpo: 'Luca: nice weather today\nMarta: yes', quando: iso(ORA - GIORNO) }
  ] as never)
  assert.equal(motivo.aspetta(store.documento('note:azioni'), ORA), true, 'un\'azione data a lei in una riunione')
  assert.equal(motivo.aspetta(store.documento('note:it'), ORA), true, 'anche in italiano')
  assert.equal(motivo.aspetta(store.documento('slack:c1'), ORA), false, 'ha scritto per ultima lei')
  assert.equal(motivo.aspetta(store.documento('slack:c2'), ORA), true, 'le chiedono qualcosa')
  assert.equal(motivo.aspetta(store.documento('slack:c3'), ORA), false, 'nessuno le chiede niente')
})

test('il lavoro del quadro nasce solo dove la persona ha confermato il mandato; il punto solo da chi aspetta', () => {
  const p = progetti.scrivi({ nome: 'Atlas', obiettivo: 'Launch the portal' })
  assert.equal(motivo.motivoDi({ origine: 'quadro', progetto: p.id }), null)
  mandato.salva(p.id, { esito: 'Launch the portal' }, { origine: 'dedotto' })
  assert.equal(motivo.motivoDi({ origine: 'quadro', progetto: p.id }), null, 'un mandato proposto da Myynd non è un suo sì')
  mandato.salva(p.id, { esito: 'Launch the portal' }, { conferma: true, origine: 'lei' })
  assert.equal(motivo.motivoDi({ origine: 'quadro', progetto: p.id }), 'chiesto')
  assert.equal(motivo.motivoDi({ origine: 'punto', doc: 'desktop:/x/notes.md' }, ORA), null)
  assert.equal(motivo.motivoDi({ origine: 'punto', doc: 'posta:5' }, ORA), 'aspetta')
})

test('in coda: un lavoro del quadro senza mandato confermato è scartato «senza motivo», con il mandato passa', () => {
  const p = progetti.scrivi({ nome: 'Orbita', obiettivo: 'Three paying pilots' })
  const c = (chiave: string): import('./candidati.ts').Candidato => ({
    id: `lavoro:${chiave}`, genere: 'lavoro', progetto: p.id, titolo: `Draft ${chiave}`, risultato: 'A file.', perche: 'The project moved.',
    prove: [], eventAt: null, valore: 0.8, incertezza: 0.2, costo: 0.1, classi: ['file'], chiave, scade: iso(ORA + GIORNO),
    carta: { testo: `Draft ${chiave}`, modo: 'tutto', origine: 'quadro' }
  })
  const senza = c('pilot-sheet')
  candidati.proponi(senza)
  candidati.decidi(new Date(ORA))
  assert.equal(candidati.leggi(senza.id)?.motivo, 'senza_motivo')
  mandato.salva(p.id, { esito: 'Three paying pilots' }, { conferma: true, origine: 'lei' })
  const con = c('pilot-plan')
  candidati.proponi(con)
  candidati.decidi(new Date(ORA))
  assert.notEqual(candidati.leggi(con.id)?.motivo, 'senza_motivo')
})
