# Formato del corpus

Questi sono file veri. L'app li legge davvero: li indicizza, li cerca e ci
fonda sopra ogni risposta. Non esiste nessuna risposta preconfezionata.

Sostituire questa cartella con mail e documenti reali deve bastare a far
funzionare l'app senza toccare l'interfaccia.

```
data/
  profilo.json          un oggetto Profile
  mail/*.json           un oggetto Thread per file
  documenti/*.md        un documento con frontmatter
```

## data/profilo.json

Corrisponde a `Profile` in `src/shared/types.ts`.

```json
{
  "company": {
    "name": "…",
    "legalName": "…",
    "description": "…",
    "city": "…",
    "site": "…"
  },
  "owner": { "name": "…", "email": "…", "role": "…" },
  "colleagues": [{ "name": "…", "email": "…", "role": "…" }],
  "clients": [{ "name": "…", "email": "…", "role": "…", "org": "…" }],
  "suppliers": [{ "name": "…", "email": "…", "role": "…", "org": "…" }]
}
```

## data/mail/<id>.json

Corrisponde a `Thread`. I messaggi vanno dal più vecchio al più recente.

```json
{
  "id": "t-sconto-brembana",
  "subject": "richiesta sconto ordine ricorrente",
  "messages": [
    {
      "id": "m-1",
      "threadId": "t-sconto-brembana",
      "from": { "name": "…", "email": "…", "org": "…" },
      "to": [{ "name": "…", "email": "…" }],
      "cc": [],
      "subject": "…",
      "date": "2026-07-28T09:12:00+02:00",
      "body": "testo integrale del messaggio, a capo reali",
      "attachments": [{ "name": "listino-2025.md", "path": "documenti/listino-2025.md" }],
      "direction": "ricevuta",
      "unanswered": true
    }
  ]
}
```

- `direction`: `"ricevuta"` o `"inviata"`.
- `unanswered: true` solo sull'ultimo messaggio di un thread che aspetta una
  nostra risposta. È il segnale che genera il lavoro in attesa.
- `path` degli allegati è relativo a `data/`.

## data/documenti/<nome>.md

Frontmatter YAML semplice (solo `chiave: valore`), poi il corpo in markdown.

```markdown
---
id: listino-2025
title: listino prezzi 2025
kind: listino
date: 2025-01-15
superseded: true
supersededBy: listino-2026
supersededNote: sostituito a gennaio 2026, aumento medio 6% sulle flange
---

corpo del documento…
```

Campi: `id` `title` `kind` `date` obbligatori. `kind` è uno fra
`documento` `listino` `preventivo` `trascrizione`.
`superseded` `supersededBy` `supersededNote` solo dove servono.
