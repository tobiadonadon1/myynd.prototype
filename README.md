# Myynd — prototipo

Copia digitale di chi in azienda sa come funzionano le cose. I colleghi
chiedono a lei invece di interrompere lui.

Questo è il passo 1: l'interfaccia, su dati inventati ma veri — file che
l'app legge, indicizza e da cui genera davvero. Niente risposte scritte a
mano da qualche parte.

## Avvio

```bash
npm install
npm run dev
```

Poi **⌥Spazio** da qualunque applicazione: la finestra viene avanti sopra
quello che stai facendo.

Serve il CLI `claude` installato e collegato (l'abbonamento, non una chiave
api). Se non c'è, l'app lo dice e si ferma — non inventa.

## Le quattro schermate

`oggi` · `lavoro in attesa` · `chiedi` · `trasparenza`

All'apertura ci sono tre risposte già scritte, in attesa di una persona.
`invia` · `modifica` · `ignora`. **Niente parte da solo, mai.** `invia`
registra l'approvazione: la bozza resta una bozza finché non la manda una
persona dal suo client.

## Com'è fatto

```
src/
  main/        finestra traslucida, scorciatoia globale, segno nel menu bar
  preload/     il ponte, unica superficie che il renderer può toccare
  core/        il motore: lettura, retrieval BM25, generazione, registro
  renderer/    le quattro schermate — non sa che esistono file su disco
  shared/      i contratti fra i tre
data/          il corpus (vedi data/FORMATO.md)
```

Tre documenti governano il codice, e vincono sulle scelte fatte scrivendolo:

- **`DESIGN.md`** — il linguaggio visivo. Chi scrive JSX non scrive css né copy.
- **`RENDERER.md`** — la struttura del renderer.
- **`data/FORMATO.md`** — il formato del corpus su disco.

## Sostituire i dati

`DataSource` in `src/shared/types.ts` è la cucitura. Qualunque cosa la
implementi — la cartella `data/` oggi, Gmail o Drive domani — funziona senza
toccare una riga di interfaccia. Sopra quel livello nessuno sa che esistono
file: i riferimenti alle sorgenti sono opachi e li decide la DataSource.

## Le due regole che non si toccano

**Non manda niente da solo.** Nessun timer, nessuna azione senza che una
persona abbia premuto un bottone.

**Quando non sa, lo dice e si ferma.** Se il materiale non contiene la
risposta: `non lo so`, più una riga su cosa manca. Mai una deduzione, mai un
numero plausibile. Una risposta sbagliata detta con sicurezza costa più di
cinquanta risposte corrette.

Le sorgenti sono presenti e quasi invisibili: un segno tenue nella riga,
rivelato passando il mouse. Nessun blocco di citazioni, nessun pannello.
Un numero che il modello ha calcolato non prende mai un segno di fonte.
