// Una riga scritta sul quaderno, letta: il testo, e le tre cose che si
// possono dire di lei senza aprire niente.
//
// «The to-do list is kind of uncomfortable to fill out.» Prima, per dire
// l'ora o il progetto di una riga nuova si apriva una scheda con tre campi.
// Sul quaderno si scrive e basta, come su TeuxDeux: una riga, Invio, la
// riga dopo. E chi vuole dire di più lo dice scrivendo:
//
//   · «!» in fondo: alta;
//   · «@10», «@10:30», «@9pm»: l'ora;
//   · «#Northwind»: il progetto, se ce n'è uno con quel nome (o che comincia
//     così, o uno dei suoi altri nomi). Un «#» che non è un progetto resta
//     nel testo com'è: «#1 priority» non è un progetto.
//
// Pura: niente React, niente rete. Le prove stanno in src/scrivi-riga.test.ts.

export type RigaLetta = { testo: string; ora: string | null; priorita: 'alta' | null; progetto: string | null }
type ProgettoNoto = { id: string; nome: string; alias?: string[] | null; stato?: string }

const normale = (s: string) => s.toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '')

/** L'ora scritta dopo «@», come «HH:MM»; null se non è un'ora. */
export function oraDa(s: string): string | null {
  const m = /^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/i.exec(s.trim())
  if (!m) return null
  let h = Number(m[1])
  const min = m[2] ? Number(m[2]) : 0
  const suffisso = m[3]?.toLowerCase()
  if (suffisso === 'pm' && h < 12) h += 12
  if (suffisso === 'am' && h === 12) h = 0
  if (h > 23 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

/** Il progetto nominato da «#parola»: esatto, poi per inizio, poi fra gli altri nomi. */
export function progettoDa(parola: string, progetti: ProgettoNoto[]): string | null {
  const p = normale(parola)
  if (p.length < 2) return null
  const vivi = progetti.filter(x => x.stato !== 'chiuso')
  const esatto = vivi.find(x => normale(x.nome) === p || (x.alias ?? []).some(a => normale(a) === p))
  if (esatto) return esatto.id
  const inizio = vivi.filter(x => normale(x.nome).startsWith(p) || (x.alias ?? []).some(a => normale(a).startsWith(p)))
  return inizio.length === 1 ? inizio[0].id : null
}

export function leggiRiga(scritto: string, progetti: ProgettoNoto[] = []): RigaLetta {
  let testo = scritto.replace(/\s+/g, ' ').trim()
  let priorita: RigaLetta['priorita'] = null
  let ora: string | null = null
  let progetto: string | null = null
  // «!» in fondo (anche «!!»), staccato o attaccato: alta
  if (/(?:^|\s|[^!])!+$/.test(testo) && !/\?!+$/.test(testo)) {
    priorita = 'alta'
    testo = testo.replace(/\s*!+$/, '').trim()
  }
  testo = testo.replace(/(^|\s)@(\d{1,2}(?:[:.]\d{2})?\s?(?:am|pm)?)(?=\s|$)/gi, (tutto, prima: string, o: string) => {
    const letta = oraDa(o)
    if (!letta || ora) return tutto
    ora = letta
    return prima
  })
  testo = testo.replace(/(^|\s)#([\p{L}\p{N}][\p{L}\p{N}._-]*)/gu, (tutto, prima: string, parola: string) => {
    if (progetto) return tutto
    const id = progettoDa(parola, progetti)
    if (!id) return tutto
    progetto = id
    return prima
  })
  testo = testo.replace(/\s+/g, ' ').trim()
  // una riga fatta solo di segni non è una riga: il testo resta quello scritto
  if (!testo) return { testo: scritto.trim(), ora: null, priorita: null, progetto: null }
  return { testo, ora, priorita, progetto }
}
