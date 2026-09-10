// Il primo paragrafo, quando il resto è troppo per un titolo.
//
// `svolgi()` adesso scrive due cose in una: un'essenza di una o due frasi in
// cima, una riga vuota, e poi il lavoro vero — l'email, l'elenco, la bozza
// intera. In lista sotto il titolo del compito non c'è spazio per la seconda
// parte, e non dovrebbe servire: l'essenza è già la risposta a «cosa ha
// scritto». Qui si prende solo quella.
//
// Vive fuori da `vals.ts` perché quel file trascina la metà dell'app — React,
// il grafo, l'API — e sotto `node --test` gli import senza estensione che
// porta con sé non si risolvono. Questa funzione non ha bisogno di niente di
// tutto ciò, e così la si può provare da sola.

/**
 * Il testo fino alla prima riga vuota, con gli a capo interni spianati.
 *
 * Non tronca: se non c'è una riga vuota, torna il testo intero — è il caso di
 * chi ha scritto un paragrafo solo, e non c'è un'«essenza» da separare dal
 * resto.
 */
export function primoParagrafo(testo: string): string {
  const senzaAttacco = testo.replace(/^\s+/, '')
  const vuota = senzaAttacco.match(/\n[ \t]*\r?\n/)
  const primo = vuota ? senzaAttacco.slice(0, vuota.index) : senzaAttacco
  return primo.trim().replace(/\s*\n\s*/g, ' ')
}
