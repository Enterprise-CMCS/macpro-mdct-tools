#!/bin/zsh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
QUERY_SCRIPT="${SCRIPT_DIR}/query-recent-submissions.js"
OUTPUT_DIR="${SCRIPT_DIR}/output"

[[ -f "$QUERY_SCRIPT" ]] || { echo "Error: query-recent-submissions.js not found" >&2; exit 1; }

TARGET_ACCOUNTS=(
  "MDCT Dev|461|mdct-dev-application-admin|seds|main|mdct-seds-dev.csv"
  "mdct-carts-prod|932|mdct-carts-prod-application-admin|carts|production|mdct-carts-prod.csv"
  "mdct-mcr-prod|879|mdct-mcr-prod-application-admin|mcr|production|mdct-mcr-prod.csv"
  "mdct-mfp-prod|1185|mdct-mfp-prod-application-admin|mfp|production|mdct-mfp-prod.csv"
  "mdct-qmr-prod|654|mdct-qmr-prod-application-admin|qmr|production|mdct-qmr-prod.csv"
  "mdct-rhtp-prod|1666|mdct-rhtp-prod-application-admin|seds|production|mdct-rhtp-prod.csv"
  "mdcthcbs-prod|1387|mdcthcbs-prod-application-admin|hcbs|production|mdct-hcbs-prod.csv"
)

mkdir -p "$OUTPUT_DIR"

echo "Querying submissions across MDCT accounts"
echo "Results will be saved to: $OUTPUT_DIR"
echo

for account in "${TARGET_ACCOUNTS[@]}"; do
  IFS='|' read -r friendly account_id car app env output_name <<< "$account"
  output_file="${OUTPUT_DIR}/${output_name}"

  echo "Processing: $friendly ($app/$env)"

  kion run --account "$account_id" --car "$car" --region us-east-1 -- \
    node "$QUERY_SCRIPT" "$app" "$env" "$output_file" || echo "  Failed" >&2
done

echo
echo "Done. Reports in: $OUTPUT_DIR"
