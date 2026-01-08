#!/usr/bin/env -S tsx
import fs from "node:fs";
import { StackStatus } from "@aws-sdk/client-cloudformation";
import { Octokit } from "@octokit/rest";
import { getAccountIdentifier } from "./utils";
import { getAllStacks } from "./scanResourcesComponents/cloudFormation";

interface StackInfo {
  name: string;
  creationTime: Date;
  status: string;
}

async function getRepoBranches(repoName: string): Promise<string[]> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN not set");
  const octokit = new Octokit({ auth: token });

  const branches: string[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const branchesResponse = await octokit.repos.listBranches({
      owner: "Enterprise-CMCS",
      repo: repoName,
      per_page: 100,
      page,
    });

    branches.push(...branchesResponse.data.map((b) => b.name));
    hasMore = branchesResponse.data.length === 100;
    page++;
  }

  return branches;
}

async function main() {
  const repoName = process.argv[2];
  if (!repoName) {
    console.error(
      "Usage: auditCloudFormationStacksAgainstGitBranches.ts <repo-name>"
    );
    console.error(
      "Example: auditCloudFormationStacksAgainstGitBranches.ts macpro-mdct-hcbs"
    );
    process.exit(1);
  }

  const repoEnding = repoName.replace(/^macpro-mdct-/, "");
  const accountIdentifier = await getAccountIdentifier();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputFile = `orphaned-stacks-${repoEnding}-${accountIdentifier}-${timestamp}.txt`;

  const log = (line: string = "") => {
    console.log(line);
    fs.appendFileSync(outputFile, line + "\n");
  };

  log(`CloudFormation Stack Audit Report`);
  log(`Repository: ${repoName}`);
  log(`Account: ${accountIdentifier}`);
  log(`Generated: ${new Date().toISOString()}`);
  log();

  console.log("Fetching CloudFormation stacks...");
  const stackSummaries = await getAllStacks();
  const stacks: StackInfo[] = stackSummaries
    .filter(
      (s) =>
        s.StackName &&
        s.CreationTime &&
        s.StackStatus !== StackStatus.DELETE_COMPLETE
    )
    .map((s) => ({
      name: s.StackName!,
      creationTime: s.CreationTime!,
      status: s.StackStatus!,
    }));
  log(`Total stacks found: ${stacks.length}`);

  console.log("Fetching branches from GitHub...");
  let branches: string[] = [];
  try {
    branches = await getRepoBranches(repoName);
    log(`Total branches found: ${branches.length}`);
  } catch (e: any) {
    log(`Failed to fetch branches: ${e?.message || e}`);
    console.error("Failed to fetch branches:", e?.message || e);
    process.exit(1);
  }

  log();
  log("Filtering stacks...");
  const filteredStacks = stacks
    .filter(
      (stack) =>
        !branches.some((branch) => stack.name.includes(branch)) &&
        !/^cms/i.test(stack.name) &&
        stack.name !== "cbj-delete-snapshot"
    )
    .sort((a, b) => a.creationTime.getTime() - b.creationTime.getTime());

  log(`Orphaned stacks (no matching branch): ${filteredStacks.length}`);
  log();

  if (!filteredStacks.length) {
    log("✅ No orphaned stacks found.");
  } else {
    log("❌ Orphaned stacks:");
    for (const stack of filteredStacks) {
      log(
        `- ${
          stack.name
        } (Created: ${stack.creationTime.toISOString()}, Status: ${
          stack.status
        })`
      );
    }
  }

  log();
  log(`Report saved to: ${outputFile}`);
  console.log(`Report saved to: ${outputFile}`);
}

main().catch((e) => {
  console.error("Unhandled error:", e);
  process.exit(1);
});
