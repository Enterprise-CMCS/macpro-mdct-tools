#!/bin/zsh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ACCOUNTS_FILE="${SCRIPT_DIR}/../scripts/accounts.list"
QUERY_SCRIPT="${SCRIPT_DIR}/query-recent-submissions.js"
OUTPUT_DIR="${SCRIPT_DIR}/output"

[[ -f "$ACCOUNTS_FILE" ]] || { echo "Error: accounts.list not found" >&2; exit 1; }
[[ -f "$QUERY_SCRIPT" ]] || { echo "Error: query-recent-submissions.js not found" >&2; exit 1; }

get_app_and_env() {
  local friendly="$1"
  local app env

  case "${friendly:l}" in
    *carts*) app="carts" ;;
    *mcr*)   app="mcr" ;;
    *mfp*)   app="mfp" ;;
    *qmr*)   app="qmr" ;;
    *hcbs*)  app="hcbs" ;;
    *)       app="seds" ;;
  esac

  case "${friendly:l}" in
    *prod*) env="production" ;;
    *impl*|*val*) env="val" ;;
    *dev*)  env="main" ;;
    *)      env="unknown" ;;
  esac

  echo "${app}|${env}"
}

mkdir -p "$OUTPUT_DIR"

echo "Querying submissions across MDCT accounts"
echo "Results will be saved to: $OUTPUT_DIR"
echo

while IFS='|' read -r friendly account_id role || [[ -n "$friendly" ]]; do
  [[ -z "${friendly// }" || "$friendly" == \#* ]] && continue

  result=$(get_app_and_env "$friendly")
  app=${result%%|*}
  env=${result##*|}
  
  safe_name="${friendly:l:gs/ /-}"
  safe_name="${safe_name:gs/impl/val}"
  safe_name="${safe_name:gs/mdcthcbs/mdct-hcbs}"
  
  if [[ "$safe_name" == *"$app"* ]]; then
    output_file="${OUTPUT_DIR}/${safe_name}.csv"
  else
    env_suffix="${env//production/prod}"
    env_suffix="${env_suffix//main/dev}"
    output_file="${OUTPUT_DIR}/mdct-${app}-${env_suffix}.csv"
  fi

  echo "Processing: $friendly ($app/$env)"

  [[ "$env" == "unknown" ]] && { echo "  Skipping (couldn't determine environment)"; continue; }

  kion run --account "$account_id" --car "$role" -- \
     node "$QUERY_SCRIPT" "$app" "$env" "$output_file" || echo "  Failed" >&2
done < "$ACCOUNTS_FILE"

echo
echo "Done. Reports in: $OUTPUT_DIR"
