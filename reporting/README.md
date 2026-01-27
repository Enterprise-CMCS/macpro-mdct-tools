# MDCT Submission Reports

Query recent submissions across MDCT applications.

## Quick Start

### Run All Production Accounts

```bash
./queryRecentSubmissionsAllAccounts.sh --prod-only
```

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
kion run --account 044969939588 --car mdctmcr-application-admin -- \
  node query-recent-submissions.js mcr production output/mcr-prod.csv
```

## Production Accounts

| App   | Account ID   | IAM Role                    |
| ----- | ------------ | --------------------------- |
| SEDS  | 459236791836 | MDCT Application Admin      |
| CARTS | 175972079437 | mdctcarts-application-admin |
| MCR   | 044969939588 | mdctmcr-application-admin   |
| MFP   | 006660783728 | mdctmfp-application-admin   |
| QMR   | 204375272847 | mdctqmr-application-admin   |
| HCBS  | 339713052013 | mdcthcbs-application-admin  |

## Configuration

- **Date range**: Edit `DAYS_TO_QUERY` in `query-recent-submissions.js` (default: 30 days)
- **Output directory**: `./output/`

## Output

CSV files with columns:

- Application, Report Type, State, Report Name, Submission Date, Submitted By, Submitter Email, Notes
