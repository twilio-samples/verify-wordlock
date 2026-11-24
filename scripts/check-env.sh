#!/usr/bin/env bash
# Fails if the env var names in .env.example, deploy.sh (secret_keys +
# plain_keys) and the deploy workflow's generated .env.local differ, so a
# new variable can't be added locally and forgotten in production.
set -euo pipefail
cd "$(dirname "$0")/.."

example=$(grep -E '^[A-Z_][A-Z0-9_]*=' .env.example | cut -d= -f1 | sort -u)

deploy_sh=$(awk '/^(secret|plain)_keys=\(/{f=1; sub(/^[a-z_]+=\(/, "")} f{print} /\)/{f=0}' deploy.sh \
  | tr -d '()' | tr -s ' \t' '\n' | grep -E '^[A-Z_][A-Z0-9_]*$' | sort -u)

workflow=$(awk '/cat > \.env\.local <<EOF/{f=1; next} /^ *EOF *$/{f=0} f' .github/workflows/deploy.yml \
  | sed -E 's/^ *//' | cut -d= -f1 | grep -E '^[A-Z_][A-Z0-9_]*$' | sort -u)

status=0
compare() {
  local name="$1" list="$2"
  local missing extra
  missing=$(comm -23 <(echo "$example") <(echo "$list"))
  extra=$(comm -13 <(echo "$example") <(echo "$list"))
  if [[ -n "$missing" ]]; then echo "Missing from $name: $(echo $missing)"; status=1; fi
  if [[ -n "$extra" ]]; then echo "In $name but not .env.example: $(echo $extra)"; status=1; fi
}
compare "deploy.sh" "$deploy_sh"
compare ".github/workflows/deploy.yml" "$workflow"

if [[ $status -eq 0 ]]; then echo "Env var lists match ($(echo "$example" | wc -l | tr -d ' ') vars)."; fi
exit $status
