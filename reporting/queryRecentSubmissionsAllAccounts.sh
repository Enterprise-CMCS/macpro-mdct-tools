#!/bin/zsh

# Script to run query-recent-submissions.js across all MDCT AWS accounts
# Maps account names to application types and environments

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
ACCOUNTS_FILE="${SCRIPT_DIR}/../scripts/accounts.list"
QUERY_SCRIPT="${SCRIPT_DIR}/query-recent-submissions.js"

if [[ ! -f "${ACCOUNTS_FILE}" ]]; then
  echo "❌ accounts.list file not found at ${ACCOUNTS_FILE}" >&2
  exit 1
fi

if [[ ! -f "${QUERY_SCRIPT}" ]]; then
  echo "❌ query-recent-submissions.js not found at ${QUERY_SCRIPT}" >&2
  exit 1
fi

# Function to determine application and environment from friendly name
get_app_and_env() {
  local friendly="$1"
  local app=""
  local env=""

  # Parse application name from friendly name
  if [[ "$friendly" =~ "carts" ]]; then
    app="carts"
  elif [[ "$friendly" =~ "mcr" ]]; then
    app="mcr"
  elif [[ "$friendly" =~ "mfp" ]]; then
    app="mfp"
  elif [[ "$friendly" =~ "qmr" ]]; then
    app="qmr"
  elif [[ "$friendly" =~ "hcbs" ]]; then
    app="hcbs"
  else
    # No specific app name means SEDS
    app="seds"
  fi

  # Parse environment name from friendly name
  if [[ "$friendly" =~ "prod" ]]; then
    env="production"
  elif [[ "$friendly" =~ "impl" ]]; then
    env="val"
  elif [[ "$friendly" =~ "dev" ]]; then
    env="main"
  elif [[ "$friendly" =~ "Val" ]]; then
    env="val"
  elif [[ "$friendly" =~ "Prod" ]]; then
    env="production"
  elif [[ "$friendly" =~ "Dev" ]]; then
    env="main"
  else
    env="unknown"
  fi

  echo "${app}|${env}"
}

OUTPUT_DIR="${SCRIPT_DIR}/output"
mkdir -p "${OUTPUT_DIR}"

echo "╔════════════════════════════════════════════════════════════════════════╗"
echo "║     Querying Recent Submissions Across All MDCT AWS Accounts          ║"
echo "╚════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "Using accounts file: ${ACCOUNTS_FILE}"
echo "Using query script:  ${QUERY_SCRIPT}"
echo "Output directory:    ${OUTPUT_DIR}"
echo ""

# Read each account and run the query
while IFS='|' read -r friendly account_id role || [[ -n "$friendly" ]]; do
  # Skip blank lines and comments
  if [[ -z "${friendly// }" ]] || [[ "$friendly" == \#* ]]; then
    continue
  fi

  # Determine app and environment
  local result=$(get_app_and_env "$friendly")
  local app=$(echo "$result" | cut -d'|' -f1)
  local env=$(echo "$result" | cut -d'|' -f2)
  
  # Create output filename with consistent pattern: mdct-{app}-{env}.txt
  # Convert to lowercase and replace spaces with hyphens
  local safe_name=$(echo "$friendly" | tr ' ' '-' | tr '[:upper:]' '[:lower:]')
  
  # Replace 'impl' with 'val' in filename for consistency
  safe_name=$(echo "$safe_name" | sed 's/-impl/-val/g')
  
  # Fix mdcthcbs to mdct-hcbs
  safe_name=$(echo "$safe_name" | sed 's/mdcthcbs/mdct-hcbs/g')
  
  # If the name already has the app name in it (like mdct-carts-dev), use as-is
  # Otherwise build the pattern mdct-{app}-{env} (for SEDS accounts like "MDCT Dev")
  if [[ "$safe_name" == *"$app"* ]]; then
    local output_file="${OUTPUT_DIR}/${safe_name}.txt"
  else
    # Extract just the environment suffix (dev/val/prod) and build consistent name
    local env_suffix=$(echo "$env" | sed 's/production/prod/; s/main/dev/')
    local output_file="${OUTPUT_DIR}/mdct-${app}-${env_suffix}.txt"
  fi

  echo "════════════════════════════════════════════════════════════════════════"
  echo "Account:     $friendly"
  echo "Account ID:  $account_id"
  echo "Application: $app"
  echo "Environment: $env"
  echo "Output file: $output_file"
  echo "════════════════════════════════════════════════════════════════════════"
  echo ""

  if [[ "$env" == "unknown" ]]; then
    echo "⚠️  Skipping - unable to determine environment"
    echo ""
    continue
  fi

  # Run the query in the specific account context and redirect to file
  if kion run --account "$account_id" --car "$role" -- node "$QUERY_SCRIPT" "$app" "$env" > "$output_file" 2>&1; then
    echo ""
    echo "✅ Successfully queried $friendly ($app/$env)"
    echo "   Output saved to: $output_file"
  else
    echo ""
    echo "❌ Failed to query $friendly ($app/$env)"
    echo "   Error log saved to: $output_file"
  fi

  echo ""
done < "$ACCOUNTS_FILE"

echo "════════════════════════════════════════════════════════════════════════"
echo "✅ Finished querying all accounts"
echo "📁 All reports saved to: ${OUTPUT_DIR}"
echo "════════════════════════════════════════════════════════════════════════"
