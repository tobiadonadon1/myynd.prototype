#!/bin/zsh
# «Undo» sotto una bozza su una convinzione tenuta da un documento: l'avviso
# la può rimettere, come per una regola sul tono. E il dettaglio di una riga
# guadagnata non mostra il compito per chi lavora fra le note.
#
#   OUT=<cartella> PORTA=18863 prove/imparato-d3.sh
#
# «Undo» cambia lo stato: la scena si semina da capo per ogni tema e larghezza.
set -e
RADICE=$(cd "$(dirname "$0")/.." && pwd)
cd "$RADICE"
PORTA=${PORTA:-18863}
OUT=${OUT:-$(mktemp -d "${TMPDIR:-/tmp}/myynd-foto-imparato-d3-XXXXXX")}
mkdir -p "$OUT"
TEMI=${TEMI:-chiaro scuro}
LARGHEZZE=${LARGHEZZE:-1100 1500}
COSTRUISCI=${COSTRUISCI:-auto}
for tema in ${=TEMI}; do
  for larga in ${=LARGHEZZE}; do
    echo "imparato-d3 · $tema $larga"
    OUT="$OUT" PORTA=$PORTA TEMI=$tema LARGHEZZE=$larga COSTRUISCI=$COSTRUISCI \
      SCENA=prove/scene/imparato-d3.json COPIONE=prove/copioni/imparato-d.json PASSI=prove/passi/imparato-d3.json \
      prove/scena.sh
    COSTRUISCI=no
    for f in server.log modello.jsonl modello.log scatta.log semina.log electron.log; do
      [[ -f "$OUT/$f" ]] && mv "$OUT/$f" "$OUT/${f%.*}-$tema-$larga.${f##*.}"
    done
  done
done
echo "imparato-d3 · fatto: $OUT"
