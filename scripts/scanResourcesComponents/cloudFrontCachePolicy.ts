#!/usr/bin/env -S tsx
import {
  CloudFrontClient,
  ListCachePoliciesCommand,
} from "@aws-sdk/client-cloudfront";

const client = new CloudFrontClient({ region: "us-east-1" });

export async function getAllCustomCachePolicies(): Promise<string[]> {
  const ids: string[] = [];
  let marker: string | undefined;

  do {
    const r = await client.send(
      new ListCachePoliciesCommand({ Marker: marker })
    );

    for (const item of r.CachePolicyList!.Items!) {
      if (item.Type === "custom") ids.push(item.CachePolicy!.Id!);
    }

    marker = r.CachePolicyList!.NextMarker;
  } while (marker);

  return ids;
}

async function main() {
  const ids = await getAllCustomCachePolicies();
  for (const id of ids) console.log(id);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
