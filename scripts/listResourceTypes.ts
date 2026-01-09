#!/usr/bin/env -S tsx
import {
  CloudFormationClient,
  paginateListStacks,
  DescribeStackResourcesCommand,
  StackSummary,
} from "@aws-sdk/client-cloudformation";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const region = "us-east-1";
const cf = new CloudFormationClient({ region });
const sts = new STSClient({ region });

const PROJECTS = ["mcr", "mfp", "carts", "qmr", "seds", "hcbs"];
const ENVS = ["main", "val", "prod", "production"];
const OUT_DIR = "resource-types";

const PERSISTENT_STACKS = new Set(
  PROJECTS.flatMap((p) => ENVS.map((e) => `${p}-${e}`))
);

async function getAccountId(): Promise<string> {
  const resp = await sts.send(new GetCallerIdentityCommand({}));
  if (!resp.Account) throw new Error("Unable to determine AWS account ID.");
  return resp.Account;
}

async function getAllStacks(): Promise<StackSummary[]> {
  const stacks: StackSummary[] = [];

  for await (const page of paginateListStacks({ client: cf }, {})) {
    const active = page.StackSummaries!.filter(
      (s) =>
        s.StackStatus !== "DELETE_COMPLETE" &&
        s.StackName &&
        PERSISTENT_STACKS.has(s.StackName)
    );
    stacks.push(...active);
  }

  return stacks;
}

async function getResourceTypes(stackName: string): Promise<string[]> {
  const resp = await cf.send(
    new DescribeStackResourcesCommand({ StackName: stackName })
  );
  const types: string[] = resp
    .StackResources!.map((r) => r.ResourceType)
    .filter((type): type is string => Boolean(type));
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

main();
