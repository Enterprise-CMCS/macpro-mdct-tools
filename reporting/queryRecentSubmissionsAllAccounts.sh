#!/bin/zsh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
QUERY_SCRIPT="${SCRIPT_DIR}/query-recent-submissions.js"
OUTPUT_DIR="${SCRIPT_DIR}/output"
ACCOUNTS_FILE="${REPORTING_ACCOUNTS_FILE:-${HOME}/data/mdct-reporting/accounts.list}"

[[ -f "$QUERY_SCRIPT" ]] || { echo "Error: query-recent-submissions.js not found" >&2; exit 1; }
[[ -f "$ACCOUNTS_FILE" ]] || { echo "Error: account config not found at $ACCOUNTS_FILE" >&2; exit 1; }

SUPPORTED_APPS=(carts hcbs mcr mfp qmr seds)

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
echo "Using account config: $ACCOUNTS_FILE"
echo "Results will be saved to: $OUTPUT_DIR"
echo

while IFS='|' read -r account_alias account_id car app env output_name || [[ -n "$account_alias" ]]; do
  [[ -z "${account_alias// }" || "$account_alias" == \#* ]] && continue

  output_file="${OUTPUT_DIR}/${output_name}"

  echo "Processing: $account_alias ($app/$env)"

  if [[ -z "$account_id" || -z "$car" || -z "$app" || -z "$env" || -z "$output_name" ]]; then
    echo "  Invalid account config row" >&2
    continue
  fi

  if [[ " ${SUPPORTED_APPS[*]} " != *" $app "* ]]; then
    echo "  Skipping unsupported app: $app" >&2
    continue
  fi

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
done < "$ACCOUNTS_FILE"

echo
echo "Done. Reports in: $OUTPUT_DIR"
