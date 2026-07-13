# MDCT Submission Reports

Query recent submissions across MDCT applications.

## Simplest Monthly Process

Use this when you need reports for the full previous calendar month across the configured MDCT reporting accounts.

1. Open a terminal in `reporting/`.
2. Install dependencies once:

```bash
npm install
```

3. Run the monthly job:

```bash
./queryRecentSubmissionsAllAccounts.sh
```

4. Collect CSV files from `reporting/output/`.

Notes:
- The script obtains credentials for each account with `kion run`.

## Quick Start

### Run All Configured Accounts

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
- **Credential source**: `kion run` assume-role flow
- **Output directory**: `./output/`

Configured accounts:

- MDCT Dev (461)
- mdct-carts-prod (932)
- mdct-mcr-prod (879)
- mdct-mfp-prod (1185)
- mdct-qmr-prod (654)
- mdct-rhtp-prod (1666)
- mdcthcbs-prod (1387)

## Output

CSV files with columns:

- Application, Report Type, State, Report Name, Submission Date, Submitted By, Submitter Email, Notes
