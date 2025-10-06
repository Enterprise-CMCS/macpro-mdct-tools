#!/bin/zsh

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
ACCOUNTS_FILE="${SCRIPT_DIR}/accounts.list"

if [[ ! -f "${ACCOUNTS_FILE}" ]]; then
  echo "accounts.list not found at ${ACCOUNTS_FILE}" >&2
  exit 1
fi

echo "Using accounts file: ${ACCOUNTS_FILE}"\n

# Read each non-empty, non-comment line (format: Friendly|AccountId|RoleName)
while IFS='|' read -r friendly account_id role || [[ -n "$friendly" ]]; do
  # Skip blank lines and comments (lines starting with #)
  if [[ -z "${friendly// }" ]] || [[ "$friendly" == \#* ]]; then
    continue
  fi

  echo "Assuming: $friendly"
  echo "Account:  $account_id"
  echo "Role:     $role"

  if kion run --account "$account_id" --car "$role" -- bash -c 'aws sts get-caller-identity'; then
    echo "✅ Success for $friendly"
  else
    echo "❌ Failed for $friendly"
  fi

  echo "------------------------------------"
done < "$ACCOUNTS_FILE"