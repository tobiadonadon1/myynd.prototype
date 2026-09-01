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

# Non da root. Un processo che legge la posta di un'azienda non ha nessun
# motivo di poter riscrivere il sistema operativo sotto di sé.
RUN chown -R node:node /dati /app
USER node

EXPOSE 5174
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.ts"]
