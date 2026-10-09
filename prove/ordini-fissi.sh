#!/bin/zsh
# Le scene degli ordini fissi (E), una semina per ogni passata.
#
#   OUT=<cartella> PORTA=18880 prove/ordini-fissi.sh
#
# Due scene: il conto con quattro ordini fissi (le ricevute, uno andato storto,
# il mese prima, le proposte da approvare, «Fallo ogni settimana» da una riga),
# e il conto vuoto con le quattro di partenza. I passi del conto vuoto
# accendono un interruttore: come per P3 e P6 ogni tema e larghezza riparte da
# capo, e i registri portano il tema e la larghezza nel nome.
set -e
RADICE=$(cd "$(dirname "$0")/.." && pwd)
cd "$RADICE"
PORTA=${PORTA:-18880}
OUT=${OUT:-$(mktemp -d "${TMPDIR:-/tmp}/myynd-foto-ordini-fissi-XXXXXX")}
mkdir -p "$OUT"
TEMI=${TEMI:-chiaro scuro}
LARGHEZZE=${LARGHEZZE:-1100 1500}
COSTRUISCI=${COSTRUISCI:-auto}
for scena in ordini-fissi ordini-fissi-vuoto; do
  for tema in ${=TEMI}; do
    for larga in ${=LARGHEZZE}; do
      echo "$scena · $tema $larga"
      OUT="$OUT" PORTA=$PORTA TEMI=$tema LARGHEZZE=$larga COSTRUISCI=$COSTRUISCI \
        SCENA=prove/scene/$scena.json PASSI=prove/passi/$scena.json \
        prove/scena.sh
      COSTRUISCI=no
      for f in server.log modello.jsonl modello.log scatta.log semina.log electron.log; do
        [[ -f "$OUT/$f" ]] && mv "$OUT/$f" "$OUT/${f%.*}-$scena-$tema-$larga.${f##*.}"
      done
    done
  done
done
echo "ordini-fissi · fatto: $OUT"
