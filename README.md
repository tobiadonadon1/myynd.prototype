# Myynd

Il secondo cervello dell'azienda. Legge le fonti che le colleghi, ti mette
davanti solo quello che richiede una decisione, e tiene il resto a portata di
domanda.

Questa è l'interfaccia, importata dal design
[Myynd dashboard design](https://claude.ai/design/p/62b47f1f-7438-4d88-99cb-cd6f9478812c)
e riscritta in React + TypeScript.

## Avvio

```bash
npm install
npm run dev      # http://localhost:5173
```

Altri comandi: `npm run build` (typecheck + bundle), `npm run preview`,
`npm run typecheck`.

## Le schermate

| Schermata       | Cosa fa                                                                  |
| --------------- | ------------------------------------------------------------------------ |
| **Myynd**       | Il feed. La cosa più urgente in grande, il resto sotto, le fatte in fondo |
| **Chat**        | Domande sul corpus, con le fonti citate sotto ogni risposta              |
| **Automazioni** | Le regole che girano da sole, con i passi di ognuna                       |
| **Mappa**       | Il grafo dei nodi: 4.045 nodi in 5 gruppi, navigabile in 3D              |
| **Preferenze**  | Quanta autonomia dare a Myynd, con che tono, e dove non deve entrare      |
| **Connettori**  | Le fonti collegate e quelle da collegare                                  |

## Com'è fatto

```
src/
  App.tsx          guscio: colonna di sinistra, schermata attiva, finestre
  vals.ts          tutto lo stato + i valori già pronti per il rendering
  data.ts          il corpus del prototipo (inventato)
  brain.ts         generazione della palla di nodi, seme fisso
  useMappa.ts      disegno del grafo su canvas, trascinamento e zoom
  modals.tsx       compositore, documento, originale, ricerca, toast
  screens/         una schermata per file
  ui.tsx           stili condivisi e `Hov` (l'equivalente di `style-hover`)
  icons.tsx        le icone SVG
```

`vals.ts` ricalca il `renderVals()` del design: lo stato sta tutto lì e le
schermate ricevono valori già calcolati, senza decidere niente per conto loro.

## Stato

Prototipo dell'interfaccia. I dati in `data.ts` sono inventati — Donadon Srl, i
clienti, i fornitori e i documenti servono solo a far vedere come si comporta
Myynd. Non c'è ancora un motore dietro: il prossimo passo è collegare
[gbrain](https://github.com/garrytan/gbrain) come cervello vero.
