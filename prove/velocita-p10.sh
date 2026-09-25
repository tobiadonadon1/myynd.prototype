#!/bin/zsh
# La scena della velocità (P10), una semina per ogni passata.
#
#   OUT=<cartella> PORTA=18810 prove/velocita-p10.sh
#
# `prove/scena.sh` semina una volta e fotografa quattro volte (due temi, due
# larghezze) sullo stesso server: i passi di questa scena leggono (l'occhio),
# affidano una carta e fanno una domanda, e dalla seconda passata in poi il
# feed non è più com'era. Qui la
# scena riparte da capo per ogni tema e larghezza, così ogni fotografia mostra
# gli stessi stati. Le fotografie e i registri finiscono tutti in OUT, con il
# tema e la larghezza nel nome come sempre.
set -e
RADICE=$(cd "$(dirname "$0")/.." && pwd)
cd "$RADICE"
PORTA=${PORTA:-18810}
OUT=${OUT:-$(mktemp -d "${TMPDIR:-/tmp}/myynd-foto-velocita-p10-XXXXXX")}
mkdir -p "$OUT"
TEMI=${TEMI:-chiaro scuro}
LARGHEZZE=${LARGHEZZE:-1280 1100}
# la UI si costruisce una volta sola, alla prima passata
COSTRUISCI=${COSTRUISCI:-auto}
for tema in ${=TEMI}; do
  for larga in ${=LARGHEZZE}; do
    echo "velocita-p10 · $tema $larga"
    OUT="$OUT" PORTA=$PORTA TEMI=$tema LARGHEZZE=$larga COSTRUISCI=$COSTRUISCI \
      SCENA=prove/scene/velocita-p10.json COPIONE=prove/copioni/velocita-p10.json PASSI=prove/passi/velocita-p10.json \
      prove/scena.sh
    COSTRUISCI=no
    # i registri di questa passata, con il nome della passata
    for f in server.log modello.jsonl modello.log scatta.log semina.log electron.log; do
      [[ -f "$OUT/$f" ]] && mv "$OUT/$f" "$OUT/${f%.*}-$tema-$larga.${f##*.}"
    done
  done
done
echo "velocita-p10 · fatto: $OUT"
