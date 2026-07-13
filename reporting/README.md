# MDCT Submission Reports

Query recent submissions across MDCT applications.

## Simplest Monthly Process

Use this when you need reports for the full previous calendar month across all production accounts.

1. Open a terminal in `reporting/`.
2. Install dependencies once:

```bash
npm install
```

3. Ensure `../scripts/accounts.list` exists and has one row per account in this format:

```text
friendly_name|account_id|role|aws_profile
```

4. Run the monthly job:

```bash
./queryRecentSubmissionsAllAccounts.sh --prod-only --use-shared-credentials
```

5. Collect CSV files from `reporting/output/`.

Notes:
- `--use-shared-credentials` uses profiles in `~/.aws/credentials`.
- If an app has zero submissions, the script still writes a header-only CSV.

## Quick Start

### Run All Production Accounts

```bash
./queryRecentSubmissionsAllAccounts.sh --prod-only
```

### Run Using ~/.aws/credentials Profiles

```bash
./queryRecentSubmissionsAllAccounts.sh --prod-only --use-shared-credentials
```

When using `--use-shared-credentials`, the script uses `AWS_PROFILE` per row from `scripts/accounts.list`:
- If a 4th column exists, it is used as the profile name.
- Otherwise, it uses the account ID as the profile name.

### Run All Accounts (dev, impl, prod)

```bash
./queryRecentSubmissionsAllAccounts.sh
```

### Run a Single Application

```bash
kion run --account <account_id> --car <role> -- \
  node query-recent-submissions.js <app> <environment> <output-file>
```

Example:

```bash
kion run --account XXXXXXXXXXXX --car XXXXXXX-application-admin -- \
  node query-recent-submissions.js mcr production output/mcr-prod.csv
```

## Configuration

- **Date range**: Complete prior calendar month only (for example, on July 9 it runs June 1 through June 30)
- **Credential source (default)**: `kion run` assume-role flow
- **Credential source (optional)**: Pass `--use-shared-credentials` to use profiles from `~/.aws/credentials`
- **Output directory**: `./output/`

## Output

CSV files with columns:

- Application, Report Type, State, Report Name, Submission Date, Submitted By, Submitter Email, Notes
