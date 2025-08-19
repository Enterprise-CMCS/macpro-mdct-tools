#!npx tsx
import {
  CloudFormationClient,
  ListStackResourcesCommand,
} from "@aws-sdk/client-cloudformation";
import { LambdaClient, GetFunctionCommand } from "@aws-sdk/client-lambda";
import AdmZip from "adm-zip";
import { prompt } from "./utils.ts";

const REGION = "us-east-1";
const STACK_NAME = await prompt("Enter STACK NAME: ");
const cf = new CloudFormationClient({ region: REGION });
const lambda = new LambdaClient({ region: REGION });

async function listLambdaPhysicalIds(stackName: string): Promise<string[]> {
  const ids: string[] = [];
  let NextToken: string | undefined;
  do {
    const r = await cf.send(
      new ListStackResourcesCommand({ StackName: stackName, NextToken })
    );
    for (const s of r.StackResourceSummaries!) {
      if (s.ResourceType === "AWS::Lambda::Function" && s.PhysicalResourceId)
        ids.push(s.PhysicalResourceId);
    }
    NextToken = r.NextToken;
  } while (NextToken);
  return ids;
}

function isOnlyNodeModules(zipBuf: Buffer): boolean {
  const zip = new AdmZip(zipBuf);
  const topLevel = new Set<string>();

  for (const e of zip.getEntries()) {
    const clean = e.entryName.replace(/^\.?\/+/, "");
    const top = clean.split(/[\\/]/)[0];
    topLevel.add(top);

    if (topLevel.size > 1) return true;
  }
  return topLevel.size === 1 && topLevel.has("node_modules");
}

async function checkLambdaFunction(functionId: string): Promise<{
  id: string;
  onlyNodeModules: boolean;
  ignored?: string;
  error?: string;
}> {
  try {
    const r = await lambda.send(
      new GetFunctionCommand({ FunctionName: functionId })
    );
    const pkg = r.Configuration!.PackageType;
    if (pkg !== "Zip") {
      return {
        id: functionId,
        onlyNodeModules: false,
        ignored: `This only checks zip file package types, this function is a ${pkg}`,
      };
    }
    const url = r.Code!.Location;

    const resp = await fetch(url!);
    if (!resp.ok)
      return {
        id: functionId,
        onlyNodeModules: false,
        error: `HTTP ${resp.status} downloading code`,
      };
    const buf = Buffer.from(await resp.arrayBuffer());
    const bad = isOnlyNodeModules(buf);
    return { id: functionId, onlyNodeModules: bad };
  } catch (e: any) {
    return {
      id: functionId,
      onlyNodeModules: false,
      error: e.message || String(e),
    };
  }
}

async function main() {
  console.log(`Stack:  ${STACK_NAME}`);

  const ids = await listLambdaPhysicalIds(STACK_NAME);
  if (ids.length === 0) {
    console.log("No Lambda functions found in this stack.");
    return;
  }

  const results = [];
  for (const id of ids) {
    const r = await checkLambdaFunction(id);
    if (r.ignored) {
      console.log(`IGNORING  ${id}  ${r.ignored}`);
    } else if (r.error) {
      console.log(`ERROR     ${id}  ${r.error}`);
    } else {
      console.log(`${r.onlyNodeModules ? "ONLY_NODE_MODULES" : "OK"}  ${id}`);
    }
    results.push(r);
  }

  const offenders = results.filter((r) => r.onlyNodeModules);
  console.log("\nSummary");
  console.log(`  Total functions:   ${results.length}`);
  console.log(`  Problem functions: ${offenders.length}`);
  if (offenders.length) {
    console.log("\nFunctions with only node_modules:");
    for (const o of offenders) console.log(`  - ${o.id}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
