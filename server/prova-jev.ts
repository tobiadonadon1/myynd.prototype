// Jev sui documenti veri: una tabella, e nient'altro.
//
// Le soglie di `giudizi.ts` sono scelte, non verità, e l'unico modo onesto di
// difenderle è guardarle addosso alla posta vera: chi esce dalla fila, chi
// passa davanti, cosa costa. Senza questo comando resterebbero tre numeri
// scritti in un file con accanto un commento sicuro di sé.
//
// Non scrive niente e non salva niente: legge l'indice, chiede a Jev, stampa.
//
//   node --env-file-if-exists=.env.local server/prova-jev.ts --conto tobia@donadon.com [--quanti 20] [--dati ~/.myynd]
//
// Gli import sono dinamici come in `valuta-feed.ts`, e per la stessa ragione:
// `--dati` deve valere prima che `config.ts` legga l'ambiente.

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const USO = `Uso: node server/prova-jev.ts --conto <email> [--quanti <n>] [--dati <cartella>]
  --conto    l'email del conto da guardare
  --quanti   quanti documenti giudicare (20 di serie)
  --peso     l'altra domanda: quanto ognuno dice sul lavoro che ha in mano
  --dati     un'altra cartella dati, per provare su una copia`

type Argomenti = { conto?: string; quanti: number; dati?: string; peso?: boolean; aiuto?: boolean; sbagliato?: string }
function leggiArgomenti(argv: string[]): Argomenti {
  const a: Argomenti = { quanti: 20 }
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i]
    const valore = () => argv[++i]
    if (x === '--conto') a.conto = valore()
    else if (x === '--quanti') a.quanti = Math.max(1, Math.min(60, Number(valore()) || 20))
    else if (x === '--dati') a.dati = valore()
    else if (x === '--peso') a.peso = true
    else if (x === '--aiuto' || x === '-h' || x === '--help') a.aiuto = true
    else a.sbagliato = x
  }
  return a
}

const riga = (s: string, n: number) => (s.replace(/\s+/g, ' ').trim().slice(0, n) + ' '.repeat(n)).slice(0, n)

async function main() {
  const a = leggiArgomenti(process.argv.slice(2))
  if (a.aiuto) { console.log(USO); return }
  if (a.sbagliato) { console.error(`Argomento che non conosco: ${a.sbagliato}\n\n${USO}`); process.exitCode = 2; return }
  if (!a.conto) { console.error(`Dimmi il conto: --conto <email>\n\n${USO}`); process.exitCode = 2; return }
  if (a.dati) process.env.MYYND_DATI = resolve(a.dati)

  const [conti, chi, config, store, jev, giudizi, rilevanza] = await Promise.all([
    import('./conti.ts'), import('./chi.ts'), import('./config.ts'), import('./store.ts'),
    import('./jev.ts'), import('./giudizi.ts'), import('./rilevanza.ts')
  ])
  await conti.avvia()
  await config.avvia()
  const cerco = a.conto.trim().toLowerCase()
  const id = conti.tutti().find(u => conti.conto(u)?.email === cerco) ?? null
  if (!id) {
    const tutti = conti.tutti().map(u => conti.conto(u)?.email).filter(Boolean)
    console.error(`Non c'è nessun conto ${a.conto} in ${config.RADICE}.` + (tutti.length ? ` Ci sono: ${tutti.join(', ')}` : ''))
    process.exitCode = 2
    return
  }

  try {
    await chi.dentro(id, async () => {
      if (!jev.collegato()) {
        console.error('Jev non è collegato: metti MYYND_TYPESAFE in .env.local, o collegalo dalle Fonti.')
        process.exitCode = 2
        return
      }
      /*
       * Tutto quello che le regole non buttano via, non solo quello che
       * mandano al feed.
       *
       * Il confronto è il punto di questa tabella: la colonna «regola» dice
       * dove finiva prima — sul feed, o nel punto — e le due colonne accanto
       * dicono cosa ne pensa Jev. Dove le due cose non coincidono c'è o un
       * guadagno o un errore, e si guarda a occhio quale dei due.
       */
      const candidati = store.recenti(400)
        .filter(d => rilevanza.classificaAttenzione(d).destinazione !== 'ignora')
        .slice(0, a.quanti)
      if (!candidati.length) { console.log('Non c\'è niente che passi le regole di oggi: niente da giudicare.'); return }

      const partito = Date.now()

      /*
       * L'altra domanda, quella delle priorità.
       *
       * Qui il materiale è lo stesso ma la domanda cambia: non «chi aspetta
       * lui» — le sue chat non aspettano niente da nessuno — ma «quanto
       * questo dice sul lavoro che ha in mano». È la domanda con cui si
       * scelgono i quarantotto documenti del giro delle priorità, e senza
       * questa vista si sarebbe potuta provare solo a occhio.
       */
      if (a.peso) {
        const pesi = await giudizi.peso(candidati, a.quanti)
        const fila = giudizi.primaQuelloCheConta(candidati, pesi)
        console.log(`\n${candidati.length} documenti, ${((Date.now() - partito) / 1000).toFixed(1)}s, ${jev.consumo().giudizi} giudizi, ${jev.consumo().gettoni.toLocaleString('it')} gettoni\n`)
        console.log(`${riga('', 3)}${riga('peso', 6)}${riga('fonte', 15)}titolo`)
        console.log('─'.repeat(100))
        for (const [n, d] of fila.entries()) {
          console.log(riga(String(n + 1), 3) + riga(pesi.get(d.id)?.toFixed(2) ?? '—', 6) + riga(d.fonte, 15) + riga(d.titolo, 70))
        }
        console.log()
        return
      }

      const visti = await giudizi.attenzione(candidati, a.quanti)
      const fila = giudizi.primaChiAspetta(candidati, visti)
      const dentro = new Set(fila.map(d => d.id))

      console.log(`\n${candidati.length} documenti, ${((Date.now() - partito) / 1000).toFixed(1)}s, ${jev.consumo().giudizi} giudizi, ${jev.consumo().gettoni.toLocaleString('it')} gettoni\n`)
      console.log(`${riga('', 3)}${riga('chiede', 7)}${riga('urg', 5)}${riga('genere', 15)}${riga('regola', 7)}${riga('da', 24)}titolo`)
      console.log('─'.repeat(116))
      for (const [n, d] of fila.entries()) {
        const g = visti.get(d.id)
        console.log(
          riga(String(n + 1), 3) +
          riga(g ? g.chiede.toFixed(2) : '—', 7) +
          riga(g ? g.urgenza.toFixed(1) : '—', 5) +
          riga(g?.genere ?? '—', 15) +
          riga(rilevanza.classificaAttenzione(d).destinazione, 7) +
          riga(d.autore ?? d.fonte, 24) +
          riga(d.titolo, 44)
        )
      }
      const fuori = candidati.filter(d => !dentro.has(d.id))
      if (fuori.length) {
        console.log(`\nFuori dalla lettura — nessuno aspetta lui (${fuori.length}):`)
        for (const d of fuori) {
          const g = visti.get(d.id)
          console.log(`   ${riga(g ? g.chiede.toFixed(2) : '—', 7)}${riga(rilevanza.classificaAttenzione(d).destinazione, 7)}${riga(d.autore ?? d.fonte, 24)}${riga(d.titolo, 54)}`)
        }
      }
      console.log()
    })
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e))
    process.exitCode = 1
  } finally {
    store.chiudiIndici()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
