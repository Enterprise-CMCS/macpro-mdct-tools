#!/usr/bin/env -S tsx
import {
  CloudFormationClient,
  ListStacksCommand,
  DescribeStackResourcesCommand,
  StackSummary,
} from "@aws-sdk/client-cloudformation";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const region = "us-east-1";
const cf = new CloudFormationClient({ region });
const sts = new STSClient({ region });

const NAME_FILTERS = ["main", "master", "val", "prod"];
const PROJECTS = ["mcr", "mfp", "carts", "qmr", "seds", "hcbs"];
const OUT_DIR = "resource-types";

async function getAccountId(): Promise<string> {
  const resp = await sts.send(new GetCallerIdentityCommand({}));
  if (!resp.Account) throw new Error("Unable to determine AWS account ID.");
  return resp.Account;
}

async function getAllStacks(): Promise<StackSummary[]> {
  let nextToken: string | undefined = undefined;
  const stacks: StackSummary[] = [];

  do {
    const resp = await cf.send(new ListStacksCommand({ NextToken: nextToken }));
    const active = resp.StackSummaries!.filter(
      (s) =>
        s.StackStatus !== "DELETE_COMPLETE" &&
        s.StackName &&
        NAME_FILTERS.some((f) => s.StackName!.toLowerCase().includes(f))
    );
    stacks.push(...active);
    nextToken = resp.NextToken;
  } while (nextToken);

  return stacks;
}

async function getResourceTypes(stackName: string): Promise<string[]> {
  const resp = await cf.send(
    new DescribeStackResourcesCommand({ StackName: stackName })
  );
  const types = resp
    .StackResources!.map((r) => r.ResourceType || "")
    .filter(Boolean);
  return Array.from(new Set(types)).sort();
}

function sanitize(name: string): string {
  // Preserve alphanumerics and '-', '_', '.', replace others with '-'
  return name
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function main() {
  const accountId = await getAccountId();
  mkdirSync(OUT_DIR, { recursive: true });

  const stacks = await getAllStacks();
  console.log(`Found ${stacks.length} matching stacks.`);

  for (const s of stacks) {
    const stackName = s.StackName!;
    console.log(`Processing: ${stackName}`);
    const types = await getResourceTypes(stackName);

    const filename = `${accountId}-${sanitize(stackName)}.txt`;
    const outPath = join(OUT_DIR, filename);
    writeFileSync(outPath, types.join("\n") + "\n", "utf8");
  }

  console.log(`✅ Done. Wrote ${stacks.length} files to ./${OUT_DIR}/`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
