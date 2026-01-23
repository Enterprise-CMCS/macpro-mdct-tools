/**
 * Query recent submissions for MDCT applications.
 *
 * Usage: node query-recent-submissions.js <application> <environment> <output-file>
 * Example: node query-recent-submissions.js mcr production output.csv
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, paginateScan } from "@aws-sdk/lib-dynamodb";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getApplicationsConfig } from "./applicationsConfig.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "output");

const VALID_APPS = ["mcr", "mfp", "hcbs", "carts", "seds", "qmr"];
const DAYS_TO_QUERY = 30;
const AWS_REGION = "us-east-1";

const authTableCache = new Map();

const [application, environment, outputFileArg] = process.argv.slice(2);

const outputFile = outputFileArg
  ? join(OUTPUT_DIR, basename(outputFileArg))
  : null;

function validateArgs() {
  const usage =
    "Usage: node query-recent-submissions.js <application> <environment> <output-file>";

  if (!application) {
    console.error(
      `\nError: Application parameter is required\n${usage}\nValid applications: ${VALID_APPS.join(
        ", "
      )}\n`
    );
    process.exit(1);
  }

  if (!VALID_APPS.includes(application)) {
    console.error(
      `\nError: Invalid application "${application}"\nValid applications: ${VALID_APPS.join(
        ", "
      )}\n`
    );
    process.exit(1);
  }

  if (!environment) {
    console.error(`\nError: Environment parameter is required\n${usage}\n`);
    process.exit(1);
  }

  if (!outputFileArg) {
    console.error(`\nError: Output file parameter is required\n${usage}\n`);
    process.exit(1);
  }
}

validateArgs();

const sinceDate = new Date(Date.now() - DAYS_TO_QUERY * 24 * 60 * 60 * 1000);
const sinceTimestamp = sinceDate.getTime();

console.log(
  `\nQuerying ${application} ${environment} for submissions since ${
    sinceDate.toISOString().split("T")[0]
  } (last ${DAYS_TO_QUERY} days)`
);

const appConfig = getApplicationsConfig(environment)[application];
if (!appConfig) {
  console.error(
    `\nError: Application configuration not found for "${application}"\n`
  );
  process.exit(1);
}

async function scanTable(tableName) {
  const ddbClient = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: AWS_REGION })
  );
  const items = [];
  for await (const page of paginateScan(
    { client: ddbClient },
    { TableName: tableName }
  )) {
    items.push(...(page.Items ?? []));
  }
  return items;
}

async function getS3FieldData(bucketName, fieldDataId, state) {
  const s3Client = new S3Client({ region: AWS_REGION });
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: `fieldData/${state}/${fieldDataId}.json`,
  });
  const response = await s3Client.send(command);
  const bodyString = await response.Body.transformToString();
  return JSON.parse(bodyString);
}

async function loadAuthTableCache(tableName) {
  if (authTableCache.has(tableName)) return; // Already loaded

  const items = await scanTable(tableName); // Note: This table has no GSI on username, so we must scan

  // Build a map of username -> email
  const userMap = new Map();
  for (const item of items) {
    if (item.username && item.email) {
      userMap.set(item.username, item.email);
    }
  }

  authTableCache.set(tableName, userMap);
}

async function getUserEmailFromAuthTable(tableName, username) {
  if (!username || username === "N/A") return "N/A";
  if (username.includes("@")) return username; // Already an email

  await loadAuthTableCache(tableName);
  return authTableCache.get(tableName)?.get(username) || "N/A (user not found)";
}

function matchesStatus(item, config) {
  const v = item[config.statusField];
  if (Array.isArray(config.statusValue)) return config.statusValue.includes(v);
  return v === config.statusValue;
}

function filterRecentSubmissions(items, config, sinceTimestamp) {
  if (!items) return [];

  return items.filter((item) => {
    const dateValue = item[config.dateField];
    if (!dateValue || !matchesStatus(item, config)) return false;

    return new Date(dateValue).getTime() >= sinceTimestamp;
  });
}

function formatDate(timestamp) {
  if (!timestamp) return "N/A";
  return new Date(timestamp).toISOString().split("T")[0];
}

function formatReportSummary(report, dateField, appName, reportType = null) {
  const submissionDate = formatDate(report[dateField]);

  if (appName === "CARTS") {
    return {
      application: "CARTS",
      reportType: "CARTS",
      reportName: `${report.stateId} ${report.year} (${
        report.programType || "N/A"
      })`,
      state: report.stateId || "N/A",
      submissionDate,
      submittedBy: report.username || "N/A",
      submitterEmail: "N/A (not stored)",
    };
  }

  if (appName === "SEDS") {
    const statusName =
      report.status_id === 2
        ? "Provisional"
        : report.status_id === 3
          ? "Final"
          : "Unknown";
    return {
      application: "SEDS",
      reportType: "SEDS",
      reportName: `${report.form || "N/A"} Q${report.quarter || "?"} ${
        report.year || ""
      }`,
      state: report.state_id || "N/A",
      submissionDate,
      submittedBy: report.status_modified_by || "N/A",
      submitterEmail: null, // Will be filled in later from auth-user table
      username: report.status_modified_by, // Store for lookup
      notes: `${statusName} Cert`,
    };
  }

  if (appName === "QMR") {
    return {
      application: "QMR",
      reportType: `${report.coreSet || "N/A"} Core Set`,
      reportName: `${report.coreSet || "N/A"} Core Set - ${
        report.year || "N/A"
      }`,
      state: report.state || "N/A",
      submissionDate,
      submittedBy: report.lastAlteredBy || "N/A",
      submitterEmail: "N/A (not stored)",
      notes: `${report.progress?.numComplete || 0}/${
        report.progress?.numAvailable || 0
      } measures`,
    };
  }

  if (appName === "HCBS") {
    return {
      application: "HCBS",
      reportType: reportType || "N/A",
      reportName:
        report.submissionName || report.name || report.programName || "N/A",
      state: report.state || "N/A",
      submissionDate,
      submittedBy: report.submittedBy || "N/A",
      submitterEmail: report.submittedByEmail || "N/A",
    };
  }

  return {
    application: appName,
    reportType: reportType || "N/A",
    reportName:
      report.submissionName || report.name || report.programName || "N/A",
    state: report.state || "N/A",
    submissionDate,
    submittedBy: report.submittedBy || "N/A",
    submitterEmail: null, // Will be filled in later from S3
    fieldDataId: report.fieldDataId,
  };
}

async function queryApplication(app) {
  const results = { name: app.name, totalSubmissions: 0, byReportType: {} };

  for (const reportType of app.reportTypes) {
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
      await Promise.all(
        formattedSubmissions.map(async (submission) => {
          if (submission.fieldDataId && submission.state) {
            const fieldData = await getS3FieldData(
              reportType.bucketName,
              submission.fieldDataId,
              submission.state
            );
            submission.submitterEmail =
              fieldData?.submitterEmailAddress || "N/A (not found in S3)";
          }
        })
      );
    }

    // For SEDS, fetch email addresses from auth-user table
    if (app.needsUserLookup) {
      const authUserTable = `${environment}-auth-user`;
      await Promise.all(
        formattedSubmissions.map(async (submission) => {
          if (submission.username) {
            submission.submitterEmail = await getUserEmailFromAuthTable(
              authUserTable,
              submission.username
            );
          }
        })
      );
    }

    results.byReportType[reportType.type] = {
      count: formattedSubmissions.length,
      submissions: formattedSubmissions,
    };
    results.totalSubmissions += formattedSubmissions.length;

    console.log(
      `Found ${formattedSubmissions.length} ${reportType.type} submission(s)`
    );
  }

  return results;
}

function escapeCSV(value) {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function writeCSV(result, filePath) {
  const lines = [];

  lines.push(
    "Application,Report Type,State,Report Name,Submission Date,Submitted By,Submitter Email,Notes"
  );

  for (const [, data] of Object.entries(result.byReportType)) {
    for (const submission of data.submissions) {
      const row = [
        submission.application,
        submission.reportType,
        submission.state,
        submission.reportName,
        submission.submissionDate,
        submission.submittedBy,
        submission.submitterEmail || "",
        submission.notes || "",
      ]
        .map(escapeCSV)
        .join(",");
      lines.push(row);
    }
  }

  await writeFile(filePath, lines.join("\n") + "\n", "utf8");
}

async function main() {
  console.log(`Querying ${appConfig.name} application`);
  const result = await queryApplication(appConfig);

  if (result.totalSubmissions === 0) {
    console.log(`\nNo submissions found. Skipping file creation.\n`);
    process.exit(0);
  }

  await mkdir(OUTPUT_DIR, { recursive: true });

  console.log(`\nWriting CSV to ${outputFile}`);
  await writeCSV(result, outputFile);

  console.log(`\nDone! Found ${result.totalSubmissions} total submissions.\n`);
}

main();
