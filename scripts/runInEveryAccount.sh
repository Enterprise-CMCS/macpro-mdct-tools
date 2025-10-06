#!/bin/zsh

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
ACCOUNTS_FILE="${SCRIPT_DIR}/accounts.list"

if [[ ! -f "${ACCOUNTS_FILE}" ]]; then
  echo "accounts.list not found at ${ACCOUNTS_FILE}" >&2
  exit 1
fi

if [[ $# -eq 0 ]]; then
  echo "Usage: $0 \"<command to run in each account>\"" >&2
  echo "Example: $0 \"aws sts get-caller-identity\"" >&2
  exit 1
fi

USER_COMMAND="$*"
echo "Using accounts file: ${ACCOUNTS_FILE}"
echo "Command to run: ${USER_COMMAND}"
echo "------------------------------------"

# Read each non-empty, non-comment line (format: Friendly|AccountId|RoleName)
while IFS='|' read -r friendly account_id role || [[ -n "$friendly" ]]; do
  # Skip blank lines and comments (lines starting with #)
  if [[ -z "${friendly// }" ]] || [[ "$friendly" == \#* ]]; then
    continue
  fi

  echo "Assuming: $friendly"
  echo "Account:  $account_id"
  echo "Role:     $role"

  if kion run --account "$account_id" --car "$role" -- bash -c "$USER_COMMAND"; then
    echo "✅ Success for $friendly"
  else
    echo "❌ Failed for $friendly"
  fi

  echo "------------------------------------"
done < "$ACCOUNTS_FILE"