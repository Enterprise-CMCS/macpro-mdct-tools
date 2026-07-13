#!/bin/zsh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
QUERY_SCRIPT="${SCRIPT_DIR}/query-recent-submissions.js"
OUTPUT_DIR="${SCRIPT_DIR}/output"

[[ -f "$QUERY_SCRIPT" ]] || { echo "Error: query-recent-submissions.js not found" >&2; exit 1; }

AWS_CONFIG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mdct-reporting-aws.XXXXXX")"
AWS_CONFIG_FILE="${AWS_CONFIG_DIR}/config"
AWS_PROFILE_NAME="mdct-reporting"

trap 'rm -rf "$AWS_CONFIG_DIR"' EXIT

TARGET_ACCOUNTS=(
  "aws-cms-oit-iusg-acct283|MDCT Application Admin|seds|production|mdct-seds-prod.csv"
  "aws-cms-cmcs-mdct-carts-prod|mdctcarts-application-admin|carts|production|mdct-carts-prod.csv"
  "aws-cms-cmcs-mdctmcr-prod|mdctmcr-application-admin|mcr|production|mdct-mcr-prod.csv"
  "aws-cms-cmcs-mdct-mfp-prod|mdctmfp-application-admin|mfp|production|mdct-mfp-prod.csv"
  "aws-cms-cmcs-mdct-qmr-prod|mdctqmr-application-admin|qmr|production|mdct-qmr-prod.csv"
  "aws-cms-cmcs-mdct-rhtp-prod|mdct-rhtp-application-admin|seds|production|mdct-rhtp-prod.csv"
  "aws-cms-cmcs-mdcthcbs-prod|mdcthcbs-application-admin|hcbs|production|mdct-hcbs-prod.csv"
)

quote_for_credential_process() {
  printf "%q" "$1"
}

mkdir -p "$OUTPUT_DIR"

echo "Querying submissions across MDCT accounts"
echo "Results will be saved to: $OUTPUT_DIR"
echo

for account in "${TARGET_ACCOUNTS[@]}"; do
  IFS='|' read -r account_alias car app env output_name <<< "$account"
  output_file="${OUTPUT_DIR}/${output_name}"

  echo "Processing: $account_alias ($app/$env)"

  {
    printf "%s\n" "[profile ${AWS_PROFILE_NAME}]"
    printf "%s\n" "region = us-east-1"
    printf "%s\n" "credential_process = kion stak --alias $(quote_for_credential_process "$account_alias") --car $(quote_for_credential_process "$car") --region us-east-1 --credential-process"
  } > "$AWS_CONFIG_FILE"

  AWS_PROFILE="$AWS_PROFILE_NAME" \
    AWS_CONFIG_FILE="$AWS_CONFIG_FILE" \
    AWS_SHARED_CREDENTIALS_FILE=/dev/null \
    AWS_SDK_LOAD_CONFIG=1 \
    AWS_REGION=us-east-1 \
    AWS_DEFAULT_REGION=us-east-1 \
    node "$QUERY_SCRIPT" "$app" "$env" "$output_file" || echo "  Failed" >&2
done

echo
echo "Done. Reports in: $OUTPUT_DIR"
