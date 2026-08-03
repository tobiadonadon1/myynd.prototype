# Struttura del renderer

Vincolo architetturale, non estetico. Per l'estetica vale `DESIGN.md`, che ha
sempre la precedenza sulle scelte visive fatte qui.

## Regola prima

Il renderer non sa che esistono file su disco, né che esiste un modello.
Parla solo con `window.myynd` (`MyyndApi` in `src/shared/types.ts`).
Nessun `fetch`, nessun `require`, nessuna logica di dominio.

## Alberatura

```
src/renderer/
  index.html
  src/
    main.tsx            monta App
    App.tsx             shell + stato di navigazione
    lib/
      api.ts            wrapper tipizzato su window.myynd
      useAsk.ts         hook per la domanda in streaming
      markers.ts        parsing dei marcatori ⟦s1⟧
    screens/
      Dashboard.tsx     home: cosa aspetta, cosa ha fatto
      Attesa.tsx        lavoro in attesa + approvazione
      Chiedi.tsx        domanda e risposta
      Trasparenza.tsx   cosa legge, cosa scrive, cosa esce, registro
    components/
      Testo.tsx         testo con sorgenti inline (vedi sotto)
      Sorgente.tsx      popover della sorgente
    design/             di proprietà del designer — non modificare
```

## Navigazione

Quattro schermi, nessun router. Stato locale in `App.tsx`:

```ts
type Vista =
  | { s: 'dashboard' }
  | { s: 'attesa'; id?: string }   // id = proposta aperta
  | { s: 'chiedi' }
  | { s: 'trasparenza' }
```

Dalla dashboard si entra in una proposta aprendo `{ s: 'attesa', id }`.

## Marcatori di sorgente

Il testo generato contiene `⟦s1⟧` subito dopo la frase che fondano.
`markers.ts` esporta:

```ts
type Pezzo =
  | { t: 'testo'; v: string }
  | { t: 'sorgente'; id: string; v: string }  // v = frase che precede il marcatore

function dividi(testo: string, sorgenti: SourceRef[]): Pezzo[]
```

Un marcatore senza sorgente corrispondente viene **rimosso dal testo**, mai
mostrato grezzo. `Testo.tsx` rende i pezzi: il testo normale così com'è, il
pezzo `sorgente` con il segno tenue definito da `DESIGN.md`, che al passaggio
del mouse rivela `Sorgente.tsx`. Niente blocchi di citazione, niente elenco
sorgenti, niente pannello. Se nessuno passa il mouse, non si vede nulla.

## Streaming

`useAsk` chiama `api.ask(domanda)`, si iscrive a `onAskChunk`, accumula i token
e li mostra **mentre arrivano**. Mai uno spinner. Prima del primo token, una
riga di testo breve che dice cosa sta facendo. Alla ricezione di `done` sostituisce
il testo accumulato con `answer.text` e attacca le sorgenti.
Annullare una domanda in corso è possibile e non lascia stato sporco.

## Stati che devono esistere

- **modello non collegato** — `getModelStatus().ready === false`: una riga che dice
  cosa manca (`claude non trovato`, `claude non collegato`) e si ferma lì. Nessun
  wizard, nessun campo da compilare, nessun bottone «riprova» che finge. Il resto
  dell'app resta navigabile e il lavoro già preparato resta leggibile.
- **niente in attesa** — vuoto onesto, non un invito a fare qualcosa.
- **non lo so** — `answer.status === 'insufficiente'`: si mostra la frase del
  modello e ci si ferma. Non si propone una ricerca, non si riformula.
- **modello non raggiungibile** — `'non_disponibile'`: lo si dice e basta.

## Azioni

`invia` e `ignora` chiamano `actOnProposal` e usano la lista aggiornata che
torna. `modifica` rende il corpo della bozza editabile **in linea**, non in una
modale; salvando si passa il corpo modificato a `invia`.

Nulla parte da solo. Nessuna azione viene eseguita senza che una persona
abbia premuto un bottone. Questo vale anche nella demo.
