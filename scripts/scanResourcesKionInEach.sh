#!/bin/zsh

ACCOUNTS_FILE="$(dirname "$0")/accounts.list"

if [[ ! -f "$ACCOUNTS_FILE" ]]; then
  echo "Accounts file not found: $ACCOUNTS_FILE" >&2
  echo "Create it with lines in the format: Friendly Name|123456789012|role-name" >&2
  exit 1
fi

while IFS='|' read -r friendly account_id role; do
  # Skip blank lines or comments
  [[ -z "$friendly" || "$friendly" == \#* ]] && continue

  echo "Assuming: $friendly"
  echo "Account:  $account_id"
  echo "Role:     $role"

  if kion run --account "$account_id" --car "$role" -- bash -c './scanResources.ts'; then
    echo "✅ Success for $friendly"
  else
    echo "❌ Failed for $friendly"
  fi

  echo "------------------------------------"
done < "$ACCOUNTS_FILE"
