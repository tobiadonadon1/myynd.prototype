#!/bin/zsh
# La notte sul lato scelto (`server/lato-lavoro.ts`), dal vivo.
#
#   OUT=<cartella> PORTA=18980 prove/lato-notte.sh
#
# La scena `lato-notte` (tre investitori che aspettano una risposta, un filo
# dove lui ha scritto per ultimo, una mail che non c'entra) col modello finto
# e il copione `lato` (COPIONE per cambiarlo), il server acceso e la notte
# messa attorno all'ora della prova. Poi il sì al lato, come lo scriverebbe la
# risposta in chat: il mandato confermato sul progetto e `lato.json`. Niente
# si affida a mano: la preparazione di ogni quarto d'ora (il primo giro due
# minuti e mezzo dopo l'avvio) propone le carte del lato, e il turno le lavora.
# Si aspetta che almeno una carta del lato sia pronta, si controlla che
# nessuna vada a lui e che le idee per X non siano nate, e si copiano in OUT
# le carte e i pezzi del registro. FOTO=1 fotografa anche la prima pagina.
set -e
RADICE=$(cd "$(dirname "$0")/.." && pwd)
cd "$RADICE"
PORTA=${PORTA:-18980}
OUT=${OUT:-$(mktemp -d "${TMPDIR:-/tmp}/myynd-foto-lato-XXXXXX")}
mkdir -p "$OUT"
TOKEN=sviluppo-non-in-produzione
B=http://127.0.0.1:$PORTA
COPIONE=${COPIONE:-prove/copioni/lato.json}
[[ -f "$COPIONE" ]] || { echo "lato-notte · manca il copione $COPIONE" >&2; exit 1 }
SPEGNI=
fine() { [[ -n "$SPEGNI" ]] && eval "$SPEGNI" 2>/dev/null || true }
trap fine EXIT INT TERM

COSTRUISCI=${COSTRUISCI:-auto} TIENI=1 FOTO=0 OUT="$OUT" PORTA=$PORTA SCENA=prove/scene/lato-notte.json COPIONE="$COPIONE" \
  prove/scena.sh | tee "$OUT/scena.log"
SPEGNI=$(grep -o 'per spegnere: .*' "$OUT/scena.log" | sed 's/per spegnere: //')
T=$(echo "$SPEGNI" | sed 's/.*rm -rf //')
[[ -d "$T" ]] || { echo "lato-notte · non trovo la cartella della scena" >&2; exit 1 }
PROFILO=$(print -l "$T"/dati/utenti/*(/N) | head -1)
[[ -d "$PROFILO" ]] || { echo "lato-notte · non trovo la cartella del conto" >&2; exit 1 }

# il sì al lato: il mandato confermato sul progetto, e il lato scelto
PROGETTO=$(curl -s -H "authorization: Bearer $TOKEN" $B/api/progetti | node -e '
  let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
    const p = (JSON.parse(s).progetti ?? []).find(x => x.nome === "Investor follow-ups")
    if (!p) process.exit(1); process.stdout.write(p.id)
  })') || { echo "lato-notte · il progetto del lato non c'è" >&2; exit 1 }
curl -sf -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -X PUT $B/api/progetti/$PROGETTO/mandato \
  -d '{"esito":"No investor is left waiting for a reply","misura":"Every investor thread gets a reply within two days","classi":{"bozza_posta":"auto","nota":"auto","file":"auto","invio":"chiedi","contatto_nuovo":"chiedi","calendario":"chiedi","paga":"mai","cancella":"mai"},"conferma":true}' > /dev/null \
  || { echo "lato-notte · il mandato non si conferma" >&2; exit 1 }
node -e '
  const [file, progetto] = process.argv.slice(1)
  require("fs").writeFileSync(file, JSON.stringify({ scelto: { id: "investitori", esito: "No investor is left waiting for a reply", progetto, quando: new Date().toISOString() } }))
' "$PROFILO/lato.json" "$PROGETTO"
echo "lato-notte · lato scelto: investitori, progetto $PROGETTO"

# fino a sette minuti: il primo giro della preparazione, poi il turno una carta alla volta
i=0
until curl -s -H "authorization: Bearer $TOKEN" $B/api/compiti | node -e '
  let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
    const c = (JSON.parse(s).compiti ?? []).filter(x => x.origine === "lato")
    process.exit(c.some(x => x.stato === "pronto") ? 0 : 1)
  })'; do
  i=$((i + 1)); (( i > 210 )) && { echo "lato-notte · nessuna carta del lato pronta in sette minuti" >&2; grep 'lato\|turno\|seguito' "$OUT/server.log" | tail -30 >&2; exit 1 }
  sleep 2
done
echo "lato-notte · pronta dopo $((i * 2)) s"

curl -s -H "authorization: Bearer $TOKEN" $B/api/compiti > "$OUT/compiti.json"
grep 'myynd · lato\|myynd · seguito\|myynd · candidati' "$OUT/server.log" > "$OUT/registro-lato.log" || true
node -e '
  const c = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).compiti ?? []
  const lato = c.filter(x => x.origine === "lato")
  const male = []
  if (!lato.length) male.push("nessuna carta del lato")
  if (lato.length > 3) male.push(`troppe carte del lato: ${lato.length}`)
  for (const x of lato) {
    if (x.doc && !/^posta:INBOX:3[123]$/.test(x.doc)) male.push(`${x.id}: doc ${x.doc} non è un investitore che aspetta`)
    if (x.email?.a && /sviluppo@myynd\.local/i.test(x.email.a)) male.push(`${x.id}: la bozza va a lui`)
  }
  if (c.some(x => x.origine === "idee-x" || x.origine === "copione-video")) male.push("le idee per X o il copione sono nati col lato investitori")
  for (const x of lato) console.log(`lato-notte · ${x.id} · ${x.stato} · ${x.doc ?? "-"} · ${x.email?.a ?? "-"} · ${x.testo}`)
  if (male.length) { console.error(male.map(m => `lato-notte · ${m}`).join("\n")); process.exit(1) }
' "$OUT/compiti.json"

if [[ "${FOTO:-0}" == "1" ]]; then
  for tema in chiaro scuro; do
    curl -s -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -X POST $B/api/profilo -d "{\"tema\":\"$tema\"}" > /dev/null
    for larga in 1280 1100; do
      env -i PATH="$PATH" HOME="$T/casa" URL=$B/ OUT="$OUT" TEMA=$tema LARGA=$larga TOKEN=$TOKEN DATI_ELECTRON="$T/electron-$tema-$larga" ${PASSI:+PASSI="$PASSI"} \
        node_modules/.bin/electron prove/scatta.cjs 2>> "$OUT/electron.log" | tee -a "$OUT/scatta.log"
    done
  done
fi
echo "lato-notte · fatto: $OUT"
