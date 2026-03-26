#!/usr/bin/env node

// This script processes the latest Netsparker report from the user's Downloads folder, extracts the CSV data, filters it based on specific criteria, and creates a single Jira ticket summarizing the vulnerabilities found. The latest Netsparker report is emailed to a few folks on the team who can then download the encrypted 7z file and run this script.

// JIRA_USERNAME=your_username JIRA_API_TOKEN=your_api_token ATTACHMENT_PASSWORD='your_password' netsparker.ts  // pragma: allowlist secret

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import Seven from "7zip-min";
import { parse } from "csv-parse/sync";
import JiraApi from "jira-client";

const JIRA_HOST = "jiraent.cms.gov";
const JIRA_USERNAME = process.env.JIRA_USERNAME;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
const ATTACHMENT_PASSWORD = process.env.ATTACHMENT_PASSWORD;

if (!JIRA_USERNAME || !JIRA_API_TOKEN || !ATTACHMENT_PASSWORD) {
  console.error("Missing required environment variables in .env file.");
  process.exit(1);
}

const jira = new JiraApi({
  protocol: "https",
  host: JIRA_HOST,
  bearer: JIRA_API_TOKEN,
  apiVersion: "2",
  strictSSL: true,
});

async function findLatestFile(
  dir: string,
  prefix: string,
  suffix: string
): Promise<string | null> {
  const files = await fs.readdir(dir);
  const matchingFiles = files.filter(
    (file) => file.startsWith(prefix) && file.endsWith(suffix)
  );

  if (matchingFiles.length === 0) {
    return null;
  }

  let latestFile: string | null = null;
  let latestTime = 0;

  for (const file of matchingFiles) {
    const filePath = path.join(dir, file);
    const stats = await fs.stat(filePath);
    if (stats.mtime.getTime() > latestTime) {
      latestTime = stats.mtime.getTime();
      latestFile = filePath;
    }
  }

  return latestFile;
}

async function processCsv(csvData: Buffer): Promise<any[]> {
  const records: any[] = parse(csvData, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });

  const filteredRows = records.filter((row) => {
    const urlMatch = /mdct.*cms\.gov.*/.test(row.Url);
    const excludedTitles = [
      "Cookie Not Marked as HttpOnly",
      "Cookie Not Marked as Secure",
      "Version Disclosure (React)",
    ];
    const titleMatch = !excludedTitles.includes(row.Title);
    return urlMatch && titleMatch;
  });

  return filteredRows;
}

async function createSingleJiraTicket(rows: any[], reportDate: string) {
  if (rows.length === 0) {
    console.log("No vulnerabilities to report. No Jira ticket created.");
    return;
  }

  const summary = `Netsparker Vulnerability Report - ${reportDate}`;

  const getDomain = (url: string) => {
    try {
      return new URL(url).hostname;
    } catch {
      const match = url.match(
        /^(?:https?:\/\/)?(?:[^@\n]+@)?(?:www\.)?([^:\/\n?]+)/im
      );
      return match ? match[1] : "Unknown Domain";
    }
  };

  const groupedByDomain = rows.reduce(
    (acc, row) => {
      const domain = getDomain(row.Url);
      if (!acc[domain]) {
        acc[domain] = [];
      }
      acc[domain].push(row);
      return acc;
    },
    {} as Record<string, any[]>
  );

  let description = `
h2. Netsparker Vulnerability Report

This report contains a summary of vulnerabilities found by Netsparker, grouped by domain.
`;

  for (const domain in groupedByDomain) {
    description += `

h3. ${domain}

||URL||Title||Severity||
`;
    for (const row of groupedByDomain[domain]) {
      description += `|${row.Url}|${row.Title}|${row.Severity}|\n`;
    }
  }

  const issue = {
    fields: {
      project: {
        key: "CMDCT",
      },
      summary: summary,
      description: description,
      issuetype: {
        name: "Task",
      },
    },
  };

  try {
    const newIssue = await jira.addNewIssue(issue);
    console.log(`Created Jira ticket: ${newIssue.key}`);
  } catch (error) {
    console.error("Error creating Jira ticket:", error);
  }
}

async function main() {
  // example of a file name:
  // Medicaid_and_CHIP_Program_System_2026.02.23.7z <- the suffix is a specific encrypted 7z extension
  const downloadsDir = path.join(os.homedir(), "Downloads");
  const filePrefix = "Medicaid_and_CHIP_Program_System";
  const fileSuffix = ".7z";

  const attachmentPath = await findLatestFile(
    downloadsDir,
    filePrefix,
    fileSuffix
  );

  if (!attachmentPath) {
    console.error(
      `No file matching '${filePrefix}*${fileSuffix}' found in ${downloadsDir}.`
    );
    process.exit(1);
  }

  console.log(`Processing file: ${attachmentPath}`);

  const fileName = path.basename(attachmentPath, fileSuffix);
  const dateMatch = fileName.match(/(\d{4}\.\d{2}\.\d{2})/);

  if (!dateMatch) {
    console.error("Could not find date in filename.");
    process.exit(1);
  }
  const reportDate = dateMatch[1].replaceAll(".", "-");

  const tempDir = "./temp-unzip";
  await fs.mkdir(tempDir, { recursive: true });

  await Seven.cmd([
    "x",
    attachmentPath,
    `-p${ATTACHMENT_PASSWORD}`,
    `-o${tempDir}`,
  ]);

  const filesInDir = await fs.readdir(tempDir);
  let csvData: Buffer | undefined;
  let csvFileName: string | undefined;

  for (const fileName of filesInDir) {
    if (fileName.endsWith(".csv")) {
      csvFileName = fileName;
      break;
    }
  }

  if (csvFileName) {
    csvData = await fs.readFile(path.join(tempDir, csvFileName));
  }

  await fs.rm(tempDir, { recursive: true, force: true });

  if (!csvData) {
    console.error("No CSV file found in the extracted files.");
    process.exit(1);
  }

  const rowsToProcess = await processCsv(csvData);

  await createSingleJiraTicket(rowsToProcess, reportDate);
}

main();
