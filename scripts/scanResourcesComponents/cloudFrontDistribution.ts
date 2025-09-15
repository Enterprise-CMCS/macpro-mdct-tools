#!/usr/bin/env -S tsx
import {
  CloudFrontClient,
  paginateListDistributions,
} from "@aws-sdk/client-cloudfront";

const client = new CloudFrontClient({ region: "us-east-1" });

export async function getAllDistributions(): Promise<string[]> {
  const ids: string[] = [];

  for await (const page of paginateListDistributions({ client }, {})) {
    for (const d of page.DistributionList!.Items!) {
      ids.push(d.Id!);
    }
  }

  return ids;
}

async function main() {
  const ids = await getAllDistributions();
  for (const id of ids) console.log(id);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
