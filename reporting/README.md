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

- The script obtains short-lived credentials for each account by running `kion stak --credential-process` with account IDs and cloud access roles.
- The script does not read or write `~/.aws/credentials`.

## Quick Start

### Run All Configured Accounts

```bash
./queryRecentSubmissionsAllAccounts.sh
```

## Configuration

- **Date range**: Complete prior calendar month only (for example, on July 9 it runs June 1 through June 30)
- **Credential source**: `kion stak --credential-process`
- **Output directory**: `./output/`

Configured accounts:

- aws-cms-oit-iusg-acct283 (459236791836)
- aws-cms-cmcs-mdct-carts-prod (175972079437)
- aws-cms-cmcs-mdctmcr-prod (044969939588)
- aws-cms-cmcs-mdct-mfp-prod (006660783728)
- aws-cms-cmcs-mdct-qmr-prod (204375272847)
- aws-cms-cmcs-mdct-rhtp-prod (823615568263)
- aws-cms-cmcs-mdcthcbs-prod (339713052013)

The six `aws-cms-cmcs-*prod` aliases are directly identified as production by their Kion aliases. The `aws-cms-oit-iusg-acct283` alias does not include `prod`; it is configured as the SEDS production reporting account based on the Kion selection used for this report.

## Output

CSV files with columns:

- Application, Report Type, State, Report Name, Submission Date, Submitted By, Submitter Email, Notes
