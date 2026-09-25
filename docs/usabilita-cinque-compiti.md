# Cinque compiti, per chi prova Myynd la prima volta

Una prova di chiarezza delle Preferenze e della Memoria (P5). Si fa su un conto
di prova con dati inventati, mai su quello di chi prova. Chi guida legge la
frase del compito ad alta voce, una volta, e poi tace: non indica, non spiega,
non dice «quasi». Si ferma chi prova quando dice «fatto» o «non ci riesco», o
dopo tre minuti.

Per ogni compito si segna: riuscito sì o no (lo dice il server, non la
persona: `node prove/verifica-compiti.mjs <indirizzo>`), il tempo, quante volte
è tornato indietro, e la prima parola che ha detto.

## I compiti

1. **Titoli delle finestre.** «Fai in modo che Myynd smetta di leggere i titoli
   delle finestre, ma continui a guardare quali app usi.»
   Riuscito: osservatore acceso, titoli spenti.

2. **Il fuoco.** «Di’ a Myynd di concentrarsi sul lancio di Northwind.»
   Riuscito: il fuoco contiene «Northwind».

3. **Una convinzione sbagliata.** «Myynd pensa che con i fornitori preferisci
   le telefonate alle email. Non è vero: fagliela scordare, e tieni quella sul
   rispondere a Harbor Labs.»
   Riuscito: la prima non è né fra quelle che sa né fra quelle di prima; la
   seconda è tenuta.

4. **Un progetto.** «Crea un progetto che si chiama Newsletter, con
   l’obiettivo Mandare il primo numero.»
   Riuscito: il progetto c’è, con quell’obiettivo.

5. **Tono e aspetto.** «Rendi il tono formale, e passa l’app allo scuro.»
   Riuscito: tono formale, tema scuro.

## Come si prepara

```zsh
OUT=/tmp/prova-compiti SCENA=prove/scene/chiarezza.json PORTA=18760 APP=1 TIENI=1 FOTO=0 prove/scena.sh
```

In inglese la scena è già in inglese; per una persona italiana si cambia la
lingua dalle Preferenze prima di cominciare. Alla fine:
`node prove/verifica-compiti.mjs http://127.0.0.1:18760 /tmp/prova-compiti`,
poi si spegne il server con il comando che `scena.sh` stampa.
