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
- The script obtains credentials for each account with `kion run` using account aliases and cloud access roles, not Kion favorites.

## Quick Start

### Run All Configured Accounts

```bash
./queryRecentSubmissionsAllAccounts.sh
```

### Run a Single Application

```bash
kion run --alias <account_alias> --car <role> -- \
  node query-recent-submissions.js <app> <environment> <output-file>
```

Example:

```bash
kion run --alias aws-cms-cmcs-mdctmcr-prod --car mdctmcr-application-admin -- \
  node query-recent-submissions.js mcr production output/mcr-prod.csv
```

## Configuration

- **Date range**: Complete prior calendar month only (for example, on July 9 it runs June 1 through June 30)
- **Credential source**: `kion run` assume-role flow
- **Output directory**: `./output/`

Configured accounts:

- aws-cms-oit-iusg-acct283
- aws-cms-cmcs-mdct-carts-prod
- aws-cms-cmcs-mdctmcr-prod
- aws-cms-cmcs-mdct-mfp-prod
- aws-cms-cmcs-mdct-qmr-prod
- aws-cms-cmcs-mdct-rhtp-prod
- aws-cms-cmcs-mdcthcbs-prod

The six `aws-cms-cmcs-*prod` aliases are directly identified as production by their Kion aliases. The `aws-cms-oit-iusg-acct283` alias does not include `prod`; it is configured as the SEDS production reporting account based on the Kion selection used for this report.

## Output

CSV files with columns:

- Application, Report Type, State, Report Name, Submission Date, Submitted By, Submitter Email, Notes
