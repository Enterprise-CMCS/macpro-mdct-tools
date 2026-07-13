# MDCT Submission Reports

Query recent submissions across MDCT applications.

## Simplest Monthly Process

Use this when you need reports for the full previous calendar month across the configured MDCT reporting accounts.

1. Open a terminal in `reporting/`.
2. Install dependencies once:

```bash
npm install
```

3. Place the separately distributed account config at `accounts.list`.
   Use `accounts.list.example` for the required row format.

4. Run the monthly job:

```bash
./queryRecentSubmissionsAllAccounts.sh
```

5. Collect CSV files from `reporting/output/`.

Notes:

- The script obtains short-lived credentials for each account by running `kion stak --credential-process` with account IDs and cloud access roles.
- The script does not read or write `~/.aws/credentials`.
- Account IDs are read from `accounts.list` or the `REPORTING_ACCOUNTS_FILE` path.
- Unsupported app rows are skipped before credentials are requested.
- If an app has zero submissions, the script writes a header-only CSV.

## Quick Start

### Run All Configured Accounts

```bash
./queryRecentSubmissionsAllAccounts.sh
```

## Configuration

- **Date range**: Complete prior calendar month only (for example, on July 9 it runs June 1 through June 30)
- **Credential source**: `kion stak --credential-process`
- **Account config**: `./accounts.list`
- **Output directory**: `./output/`

Configured accounts:

- aws-cms-oit-iusg-acct283
- aws-cms-cmcs-mdct-carts-prod
- aws-cms-cmcs-mdctmcr-prod
- aws-cms-cmcs-mdct-mfp-prod
- aws-cms-cmcs-mdct-qmr-prod
- aws-cms-cmcs-mdct-rhtp-prod
- aws-cms-cmcs-mdcthcbs-prod

The six `aws-cms-cmcs-*prod` aliases are directly identified as production by their Kion aliases. The `aws-cms-oit-iusg-acct283` alias does not include `prod`; it is configured as the SEDS production reporting account in the separately distributed account config.

## Output

CSV files with columns:

- Application, Report Type, State, Report Name, Submission Date, Submitted By, Submitter Email, Notes
