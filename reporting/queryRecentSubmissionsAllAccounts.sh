#!/bin/zsh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
QUERY_SCRIPT="${SCRIPT_DIR}/query-recent-submissions.js"
OUTPUT_DIR="${SCRIPT_DIR}/output"

[[ -f "$QUERY_SCRIPT" ]] || { echo "Error: query-recent-submissions.js not found" >&2; exit 1; }

TARGET_ACCOUNTS=(
  "aws-cms-oit-iusg-acct283|459236791836|MDCT Application Admin|seds|production|mdct-seds-prod.csv"
  "aws-cms-cmcs-mdct-carts-prod|175972079437|mdctcarts-application-admin|carts|production|mdct-carts-prod.csv"
  "aws-cms-cmcs-mdctmcr-prod|044969939588|mdctmcr-application-admin|mcr|production|mdct-mcr-prod.csv"
  "aws-cms-cmcs-mdct-mfp-prod|006660783728|mdctmfp-application-admin|mfp|production|mdct-mfp-prod.csv"
  "aws-cms-cmcs-mdct-qmr-prod|204375272847|mdctqmr-application-admin|qmr|production|mdct-qmr-prod.csv"
  "aws-cms-cmcs-mdct-rhtp-prod|823615568263|mdct-rhtp-application-admin|seds|production|mdct-rhtp-prod.csv"
  "aws-cms-cmcs-mdcthcbs-prod|339713052013|mdcthcbs-application-admin|hcbs|production|mdct-hcbs-prod.csv"
)

get_credential_field() {
  KION_CREDENTIAL_JSON="$credential_json" node -e '
const fieldName = process.argv[1];
try {
  const credentials = JSON.parse(process.env.KION_CREDENTIAL_JSON || "");
  const value = credentials[fieldName];
  if (!value) process.exit(2);
  process.stdout.write(value);
} catch {
  process.exit(1);
}
' "$1"
}

mkdir -p "$OUTPUT_DIR"

echo "Querying submissions across MDCT accounts"
echo "Results will be saved to: $OUTPUT_DIR"
echo

for account in "${TARGET_ACCOUNTS[@]}"; do
  IFS='|' read -r account_alias account_id car app env output_name <<< "$account"
  output_file="${OUTPUT_DIR}/${output_name}"

  echo "Processing: $account_alias ($app/$env)"

  if ! credential_json="$(kion stak --account "$account_id" --car "$car" --region us-east-1 --credential-process)"; then
    echo "  Failed to get Kion credentials" >&2
    continue
  fi

  if ! AWS_ACCESS_KEY_ID="$(get_credential_field AccessKeyId)" ||
    ! AWS_SECRET_ACCESS_KEY="$(get_credential_field SecretAccessKey)" ||
    ! AWS_SESSION_TOKEN="$(get_credential_field SessionToken)"; then
    echo "  Kion did not return credential-process JSON" >&2
    unset credential_json AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
    continue
  fi

  AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID" \
    AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY" \
    AWS_SESSION_TOKEN="$AWS_SESSION_TOKEN" \
    AWS_REGION=us-east-1 \
    AWS_DEFAULT_REGION=us-east-1 \
    node "$QUERY_SCRIPT" "$app" "$env" "$output_file" || echo "  Failed" >&2

  unset credential_json AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
done

echo
echo "Done. Reports in: $OUTPUT_DIR"
