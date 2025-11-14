/*
 * Script to query recent submissions/certifications for one MDCT application at a time
 *
 * Applications: MCR, MFP, HCBS, CARTS, SEDS, QMR
 *
 * Note: Different applications track "submissions" differently:
 * - MCR/MFP: Clear submission dates (submittedOnDate field) - Email stored in S3 fieldData
 * - HCBS: Clear submission dates (submitted field) - Has submittedBy and submittedByEmail fields
 * - SEDS: Form certification (status_date tracks certification changes) - Email via auth-user table lookup
 * - CARTS: Certification status (lastChanged tracks ANY status change) - User's name stored, email only in Cognito (no field to match user to cognito)
 * - QMR: Core set submission (lastAltered tracks ANY update) - User's name stored, email only in Cognito (no field to match user to cognito)
 *
 * Report Types by Application:
 * - MCR: MCPAR, MLR, NAAAR
 * - MFP: WP, SAR, ABCD
 * - HCBS: QMS, CI, TACM, PCP (note: Waiting List and IMA not yet built)
 * - CARTS: Single state certification table
 * - SEDS: Single form certification table
 * - QMR: Core sets (Adult, Child, Health Home)
 *
 * Usage:
 *   node query-recent-submissions.js <application> <environment>
 *
 * Parameters:
 *   application: Which app to query (mcr, mfp, hcbs, carts, seds, qmr) - REQUIRED
 *   environment: Branch/environment name (main, val, production, etc.) - REQUIRED
 *
 * Examples:
 *   node query-recent-submissions.js mcr production
 *   node query-recent-submissions.js qmr val
 *   node query-recent-submissions.js carts main
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, paginateScan } from "@aws-sdk/lib-dynamodb";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getApplicationsConfig } from "./applicationsConfig.js";

const validApps = ["mcr", "mfp", "hcbs", "carts", "seds", "qmr"];

// Parse command line arguments
const args = process.argv.slice(2);
const application = args[0];
const environment = args[1];

// Validate application parameter
if (!application) {
  console.error("\n❌ Error: Application parameter is required");
  console.log(
    "\nUsage: node query-recent-submissions.js <application> <environment>"
  );
  console.log(`\nValid applications: ${validApps.join(", ")}\n`);
  console.log("\nExample: node query-recent-submissions.js mcr production\n");
  process.exit(1);
}

if (!validApps.includes(application)) {
  console.error(`\n❌ Error: Invalid application "${application}"`);
  console.log(`\nValid applications: ${validApps.join(", ")}\n`);
  process.exit(1);
}

if (!environment) {
  console.error("\n❌ Error: Environment parameter is required");
  console.log(
    "\nUsage: node query-recent-submissions.js <application> <environment>"
  );
  console.log("Example: node query-recent-submissions.js mcr main\n");
  process.exit(1);
}

// Calculate date 30 days ago from today
const sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
const sinceTimestamp = sinceDate.getTime();

console.log(`\n📊 Querying ${application} application for submissions in the last 30 days (since ${sinceDate.toISOString().split("T")[0]})`);
console.log(`🌍 Environment: ${environment}\n`);

// Get the selected application
const selectedAppConfig = getApplicationsConfig(environment)[application];
if (!selectedAppConfig) {
  console.error(`\n❌ Error: Application configuration not found for "${application}"\n`);
  process.exit(1);
}

async function scanTable(tableName) {
  const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: "us-east-1" }));
  const items = [];
  for await (const page of paginateScan({ client: ddbClient }, { TableName: tableName })) {
    items.push(...(page.Items ?? []));
  }
  return items;
}

async function getS3FieldData(bucketName, fieldDataId, state) {
  const s3Client = new S3Client({ region: "us-east-1" });
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: `fieldData/${state}/${fieldDataId}.json`,
  });
  const response = await s3Client.send(command);
  const bodyString = await response.Body.transformToString();
  return JSON.parse(bodyString);
}

const authTableCache = new Map();

async function loadAuthTableCache(tableName) {
  if (authTableCache.has(tableName)) {
    return; // Already loaded
  }

  console.log(`    Loading auth-user table into cache...`);
  // Note: This table has no GSI on username, so we must scan
  const items = await scanTable(tableName);

  // Build a map of username -> email
  const userMap = new Map();
  for (const item of items) {
    if (item.username && item.email) {
      userMap.set(item.username, item.email);
    }
  }

  authTableCache.set(tableName, userMap);
  console.log(`    Cached ${userMap.size} users from auth table`);
}

async function getUserEmailFromAuthTable(tableName, username) {
  if (!username || username === "N/A") {
    return "N/A";
  }

  // Username might be an email itself (fallback case in SEDS)
  if (username.includes("@")) {
    return username;
  }

  // Ensure auth table is loaded
  await loadAuthTableCache(tableName);

  const userMap = authTableCache.get(tableName);
  return userMap.get(username) || "N/A (user not found)";
}

function filterRecentSubmissions(items, config, sinceTimestamp) {
  if (!items) return [];

  return items.filter((item) => {
    const dateValue = item[config.dateField];
    if (!dateValue) return false;

    // Check status based on type
    let statusMatch = false;
    if (Array.isArray(config.statusValue)) {
      // SEDS: status_id is array [2, 3]
      statusMatch = config.statusValue.includes(item[config.statusField]);
    } else if (typeof config.statusValue === "boolean") {
      // QMR: submitted is boolean
      statusMatch = item[config.statusField] === config.statusValue;
    } else {
      // Normal string comparison
      statusMatch = item[config.statusField] === config.statusValue;
    }

    const timestamp = new Date(dateValue).getTime();
    return statusMatch && timestamp >= sinceTimestamp;
  });
}

function formatDate(timestamp) {
  if (!timestamp) return "N/A";
  return new Date(timestamp).toISOString().split("T")[0];
}

function formatReportSummary(report, dateField, appName, reportType = null) {
  const submissionDate = formatDate(report[dateField]);

  // Different apps have different structures
  if (appName === "CARTS") {
    return {
      application: "CARTS",
      reportType: "CARTS",
      reportName: `${report.stateId} ${report.year} (${report.programType || "N/A"})`,
      state: report.stateId || "N/A",
      submissionDate,
      submittedBy: report.username || "N/A",
      submitterEmail: "N/A (not stored)",
    };
  } else if (appName === "SEDS") {
    const statusName =
      report.status_id === 2
        ? "Provisional"
        : report.status_id === 3
          ? "Final"
          : "Unknown";
    return {
      application: "SEDS",
      reportType: "SEDS",
      reportName: `${report.form || "N/A"} Q${report.quarter || "?"} ${report.year || ""}`,
      state: report.state_id || "N/A",
      submissionDate,
      submittedBy: report.status_modified_by || "N/A",
      submitterEmail: null, // Will be filled in later from auth-user table
      username: report.status_modified_by, // Store for lookup
      notes: `${statusName} Cert`,
    };
  } else if (appName === "QMR") {
    return {
      application: "QMR",
      reportType: `${report.coreSet || "N/A"} Core Set`,
      reportName: `${report.coreSet || "N/A"} Core Set - ${report.year || "N/A"}`,
      state: report.state || "N/A",
      submissionDate,
      submittedBy: report.lastAlteredBy || "N/A",
      submitterEmail: "N/A (not stored)",
      notes: `${report.progress?.numComplete || 0}/${report.progress?.numAvailable || 0} measures`,
    };
  } else if (appName === "HCBS") {
    return {
      application: "HCBS",
      reportType: reportType || "N/A",
      reportName: report.submissionName || report.name || report.programName || "N/A",
      state: report.state || "N/A",
      submissionDate,
      submittedBy: report.submittedBy || "N/A",
      submitterEmail: report.submittedByEmail || "N/A",
    };
  } else {
    // MCR, MFP - will need S3 lookup for email
    return {
      application: appName,
      reportType: reportType || "N/A",
      reportName: report.submissionName || report.name || report.programName || "N/A",
      state: report.state || "N/A",
      submissionDate,
      submittedBy: report.submittedBy || "N/A",
      submitterEmail: null, // Will be filled in later from S3
      fieldDataId: report.fieldDataId,
    };
  }
}

async function queryApplication(app) {
  const results = {
    name: app.name,
    description: app.description,
    totalSubmissions: 0,
    byReportType: {},
  };

  for (const reportType of app.reportTypes) {
    console.log(`  Scanning ${reportType.tableName}...`);

    const items = await scanTable(reportType.tableName);

    const recentSubmissions = filterRecentSubmissions(
      items,
      reportType,
      sinceTimestamp
    );

    const formattedSubmissions = recentSubmissions.map((r) =>
      formatReportSummary(r, reportType.dateField, app.name, reportType.type)
    );

    // For MCR and MFP, fetch email addresses from S3
    if ((app.name === "MCR" || app.name === "MFP") && reportType.bucketName) {
      console.log(`    Fetching submitter emails from S3...`);
      for (const submission of formattedSubmissions) {
        if (submission.fieldDataId && submission.state) {
          const fieldData = await getS3FieldData(
            reportType.bucketName,
            submission.fieldDataId,
            submission.state
          );
          submission.submitterEmail = fieldData?.submitterEmailAddress || "N/A (not found in S3)";
        }
      }
    }

    // For SEDS, fetch email addresses from auth-user table
    if (app.needsUserLookup) {
      console.log(`    Fetching submitter emails from auth-user table...`);
      const authUserTable = `${environment}-auth-user`;
      for (const submission of formattedSubmissions) {
        if (submission.username) {
          submission.submitterEmail = await getUserEmailFromAuthTable(
            authUserTable,
            submission.username
          );
        }
      }
    }

    results.byReportType[reportType.type] = {
      count: formattedSubmissions.length,
      submissions: formattedSubmissions,
    };
    results.totalSubmissions += formattedSubmissions.length;

    console.log(`    ✓ Found ${formattedSubmissions.length} submission(s)`);
  }

  return results;
}

function printResults(allResults) {
  console.log("\n" + "=".repeat(120));
  console.log("📋 SUBMISSION/CERTIFICATION SUMMARY");
  console.log("=".repeat(120) + "\n");

  let grandTotal = 0;

  for (const result of allResults) {
    console.log(`\n${result.name} Application:`);
    console.log(`  ${result.description}`);
    console.log(`  Total: ${result.totalSubmissions}`);

    if (result.totalSubmissions > 0) {
      for (const [reportType, data] of Object.entries(result.byReportType)) {
        if (data.count > 0) {
          console.log(`\n  ${reportType} (${data.count} submission(s)):`);
          console.log(`  ${"─".repeat(116)}`);
          console.log(`  ${"State".padEnd(8)} ${"Report Type".padEnd(15)} ${"Report Name".padEnd(35)} ${"Date".padEnd(12)} ${"Submitter".padEnd(25)} ${"Email".padEnd(20)}`);
          console.log(`  ${"─".repeat(116)}`);

          for (const submission of data.submissions) {
            const reportName = submission.reportName.length > 34
              ? submission.reportName.substring(0, 31) + "..."
              : submission.reportName;
            const submitter = submission.submittedBy.length > 24
              ? submission.submittedBy.substring(0, 21) + "..."
              : submission.submittedBy;
            const email = submission.submitterEmail.length > 19
              ? submission.submitterEmail.substring(0, 16) + "..."
              : submission.submitterEmail;

            console.log(`  ${submission.state.padEnd(8)} ${submission.reportType.padEnd(15)} ${reportName.padEnd(35)} ${submission.submissionDate.padEnd(12)} ${submitter.padEnd(25)} ${email.padEnd(20)}`);
          }
        }
      }
    }

    grandTotal += result.totalSubmissions;
  }

  console.log("\n" + "=".repeat(120));
  console.log(`🎯 Grand Total: ${grandTotal} submission(s)/certification(s) since ${sinceDate.toISOString().split("T")[0]}`);

  const appNames = new Set(allResults.map(r => r.name));
  const relevantNotes = [];

  if (appNames.has("MCR") || appNames.has("MFP")) {
    relevantNotes.push("   • MCR/MFP: Submission dates and emails are stored; emails retrieved from S3");
  }
  if (appNames.has("HCBS")) {
    relevantNotes.push("   • HCBS: Submission dates and emails are stored in DynamoDB");
  }
  if (appNames.has("SEDS")) {
    relevantNotes.push("   • SEDS: Date shows when certification status changed - Email retrieved from auth-user table");
  }
  if (appNames.has("CARTS")) {
    relevantNotes.push("   • CARTS: Date shows when status last changed (includes uncertify/recertify)");
    relevantNotes.push("     Email not available - stored only in Cognito, not linked to certification records");
  }
  if (appNames.has("QMR")) {
    relevantNotes.push("   • QMR: Date shows when core set was last altered (includes any update)");
    relevantNotes.push("     Email not available - stored only in Cognito, not linked to submission records");
  }

  if (relevantNotes.length > 0) {
    console.log("\n⚠️  IMPORTANT NOTES:");
    relevantNotes.forEach(note => console.log(note));
  }

  console.log("=".repeat(120) + "\n");
}

async function main() {
  console.log(`\n🔍 Querying ${selectedAppConfig.name} application...`);
  const result = await queryApplication(selectedAppConfig);

  printResults([result]);

  console.log("✅ Query completed successfully!\n");
}

main();
