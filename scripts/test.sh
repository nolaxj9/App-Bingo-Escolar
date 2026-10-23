#!/usr/bin/env bash
# Ejecuta todas las comprobaciones del repositorio: vitest, tsc y build de producción.
#   scripts/test.sh            corre todo y muestra un resumen
#   scripts/test.sh --e2e      además corre el recorrido en Chromium (scripts/e2e.mjs)
# Sale con código != 0 si algo falla.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

with_e2e=0
case "${1:-}" in
  --e2e) with_e2e=1 ;;
  "") ;;
  -h|--help) sed -n '2,5p' "$0"; exit 0 ;;
  *) echo "Uso: $0 [--e2e]" >&2; exit 2 ;;
esac

declare -a NAMES=() RESULTS=()
record() { NAMES+=("$1"); RESULTS+=("$2"); }
say() { printf '\n\033[1;34m== %s ==\033[0m\n' "$*"; }
run_step() { # nombre, comando...
  local name="$1"; shift
  say "$name"
  if "$@"; then record "$name" PASS; else record "$name" FAIL; fi
}

command -v npm >/dev/null 2>&1 || { echo "npm no está instalado." >&2; exit 1; }
[ -d node_modules ] || npm ci --no-audit --no-fund || { echo "npm ci falló." >&2; exit 1; }

run_step "pruebas unitarias (vitest)" npx vitest run
run_step "tipos (tsc --noEmit)" npx tsc --noEmit
run_step "build de producción" npx vite build
if [ "$with_e2e" -eq 1 ]; then run_step "e2e (Chromium)" node scripts/e2e.mjs; fi

say "Resumen"
rc=0
for i in "${!NAMES[@]}"; do
  printf '  %-32s %s\n' "${NAMES[$i]}" "${RESULTS[$i]}"
  [ "${RESULTS[$i]}" = PASS ] || rc=1
done
if [ "$rc" -eq 0 ]; then echo "TODO PASÓ"; else echo "HAY PASOS FALLIDOS" >&2; fi
exit "$rc"
