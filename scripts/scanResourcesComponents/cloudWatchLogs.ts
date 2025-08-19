#!/usr/bin/env -S tsx
import {
  CloudWatchLogsClient,
  paginateDescribeLogGroups,
} from "@aws-sdk/client-cloudwatch-logs";

const client = new CloudWatchLogsClient({ region: "us-east-1" });

export async function getAllLogGroups(): Promise<string[]> {
  const names: string[] = [];

  for await (const page of paginateDescribeLogGroups({ client }, {})) {
    for (const g of page.logGroups!) {
      names.push(g.logGroupName!);
    }
  }

  return names;
}

async function main() {
  const names = await getAllLogGroups();
  for (const n of names) console.log(n);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
