#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/.." && pwd)"
cd "$repo_root"
printf 'CI gate repository root: %s\n' "$repo_root"

required_major=24
node_major="$(node -p 'process.versions.node.split(".")[0]')"
if (( node_major < required_major )); then
  printf 'CI gate requires Node.js %s or newer; running Node.js %s. Run it in node:24-bookworm-slim (or install Node 24) and retry.\n' "$required_major" "$(node --version)" >&2
  exit 1
fi

if [[ -e node_modules ]]; then
  printf 'CI gate refuses to reuse pre-existing node_modules. Run it from a fresh clone (or remove the directory deliberately) so npm ci starts from a clean dependency tree.\n' >&2
  exit 1
fi

run_step() {
  local name="$1"
  shift
  printf '\n========== %s ==========%s' "$name" $'\n'
  "$@"
}

run_step 'Install dependencies' npm ci
run_step 'Build all workspaces' npm run build
run_step 'Typecheck backend and frontend' npm run typecheck

# The two startup tests spawn the built server and it refuses to boot without a vault key. The key is generated
# here, per run, and never read from a secret: a CI step that depends on an undeclared variable is a step that
# passes on one machine and dies with `VaultKeyError` on the next. It is ephemeral and never touches a database.
expected_vault_key_bytes=32
export AERO_VAULT_KEY
AERO_VAULT_KEY="$(node -e "process.stdout.write(require('node:crypto').randomBytes(${expected_vault_key_bytes}).toString('base64'))")"
printf 'Exported an ephemeral test AERO_VAULT_KEY for the backend suite\n'

run_step 'Run backend tests' npm run test --workspace=packages/backend
run_step 'Run frontend unit tests' npm run test --workspace=packages/frontend
run_step 'Verify the built schema CLIs' bash scripts/verify-schema-clis.sh
run_step 'Verify the generated API contract is current' bash scripts/verify-openapi-artifact.sh
if [[ "${SKIP_E2E:-}" == "1" ]]; then
  printf '\nSkipping Playwright E2E tests (SKIP_E2E=1)\n'
else
  if [[ "${CI:-}" == "true" ]]; then
    run_step 'Install Playwright browsers' npx --workspace=@trindade/frontend playwright install --with-deps chromium chromium-headless-shell
  fi
  run_step 'Run frontend Playwright E2E tests' npm run test:e2e --workspace=packages/frontend
fi

printf '\n========== CI gate passed ==========%s' $'\n'

# There is no lint step, and there is no `npm run lint` either: the root script was a `--if-present`
# no-op because no workspace defined lint, so a green result said nothing about the code. A gate that
# cannot fail is worse than an absent one, because it is read as evidence. Static checking is
# `npm run typecheck` above; a real linter is a separate decision with its own baseline.
