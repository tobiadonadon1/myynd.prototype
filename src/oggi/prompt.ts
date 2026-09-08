// Il prompt sotto una riga: quello che si copia, e quello che resta a lei.
//
// Una riga in modo «prompt» consegna due cose in un testo solo: il prompt da
// incollare in Claude o ChatGPT, e — dopo una riga vuota, in fondo — la riga
// che il modello dice a lei e non all'assistente: un dubbio, una scelta, cosa
// manca. È la stessa forma delle bozze, e per le bozze va bene così: si
// rilegge tutto insieme. Un prompt invece si *copia*, e copiare anche «non ho
// trovato il listino 2026, ho messo quello del 2025» vuol dire incollare in
// ChatGPT una nota scritta per un'altra persona.

/**
 * Il prompt da una parte, la nota per lei dall'altra.
 *
 * La nota è l'ultimo paragrafo se è di una riga sola e non è il primo: un
 * blocco «Fonti:» con due voci è di più righe e resta dentro, e un prompt che
 * è tutto un paragrafo resta intero. Se il modello la nota non l'ha scritta,
 * non si taglia niente: meglio una riga in più incollata che il prompt monco.
 */
export function spezzaPrompt(risultato: string): { prompt: string; nota: string } {
  const pulito = risultato.trim()
  const taglio = pulito.lastIndexOf('\n\n')
  if (taglio < 0) return { prompt: pulito, nota: '' }
  const coda = pulito.slice(taglio + 2).trim()
  if (!coda || coda.includes('\n')) return { prompt: pulito, nota: '' }
  return { prompt: pulito.slice(0, taglio).trim(), nota: coda }
}

/**
 * Negli appunti, in due modi.
 *
 * `navigator.clipboard` è la strada giusta e basta quasi ovunque: la pagina
 * arriva da `http://127.0.0.1`, che per il browser è un contesto sicuro, e
 * dentro l'app il guscio concede `clipboard-sanitized-write`. «Quasi»: un
 * renderer senza fuoco, o un browser vecchio, rifiutano la promessa. Allora si
 * ripiega sul gesto antico — una casella nascosta, seleziona, copia — che non
 * chiede permessi a nessuno. Se anche quello dice di no, si lancia: chi ha
 * premuto deve saperlo, non trovare gli appunti vuoti dopo.
 */
export async function copia(testo: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(testo); return }
  } catch { /* si prova l'altra strada */ }
  const area = document.createElement('textarea')
  area.value = testo
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  let fatto = false
  try { fatto = document.execCommand('copy') } catch { fatto = false }
  area.remove()
  if (!fatto) throw new Error('Non sono riuscito a copiarlo.')
}
