# Myynd su un server.
#
# Un'immagine sola: si costruisce l'interfaccia e poi la serve lo stesso
# processo che tiene l'API — `express.static` su `dist/` c'era già, e questo
# rende l'intera applicazione un contenitore e una porta, senza proxy davanti.
#
# Node 24 e non meno: `node:sqlite` — che è tutto il database di Myynd — è
# arrivato in Node 22 dietro una bandiera ed è diventato normale dopo. Su
# un'immagine più vecchia questo programma non parte, e l'errore parla di un
# modulo che non esiste invece che di una versione.

FROM node:24-slim AS costruzione
WORKDIR /app

# prima i manifest, poi il resto: così `npm ci` si rifà solo quando cambiano
# le dipendenze, e non a ogni riga di codice toccata
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# `dist/` non sta in git — è roba generata — quindi va costruita qui, o il
# server non troverebbe nessuna interfaccia da servire e risponderebbe 404 a
# ogni pagina restando perfettamente «acceso»
RUN npm run build

# — l'immagine che gira —
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production

# solo quelle che servono a girare: niente TypeScript, niente Vite, niente
# Electron. Sono centinaia di megabyte che su un server non aprono mai un file.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=costruzione /app/dist ./dist
COPY server ./server
COPY automazioni ./automazioni

# Dove vive la mente. Va montato un volume qui sopra, o a ogni ridistribuzione
# il contenitore riparte con l'indice vuoto, senza account e senza automazioni
# — e senza un errore da nessuna parte che lo dica.
ENV MYYND_DATI=/dati
RUN mkdir -p /dati

# Si resta root, e la ragione è una sola e concreta.
#
# I volumi di Railway si montano di proprietà di root, *sopra* la cartella
# creata qui: qualunque `chown` fatto in fase di costruzione sparisce nel
# momento in cui il volume viene montato. Un processo che gira come `node`
# trova `/dati` non scrivibile e muore aprendo il database, con un errore che
# parla di SQLite e non di permessi — e il contenitore entra in un giro di
# riavvii che dice «Application failed to respond».
#
# Dentro un contenitore isolato, con un processo solo e nessuna capability in
# più, root non è un'escalation: il confine vero è il contenitore. Scambiare
# un rischio teorico per un giro di riavvii sicuro sarebbe stata la scelta
# sbagliata, ma va scritto qui invece di sembrare una dimenticanza.

EXPOSE 5174
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.ts"]
