#!npx tsx
import {
  CloudFrontClient,
  ListDistributionsCommand,
} from "@aws-sdk/client-cloudfront";

const client = new CloudFrontClient({ region: "us-east-1" });

export async function getAllDistributions(): Promise<string[]> {
  const ids: string[] = [];
  let marker: string | undefined;

  do {
    const r = await client.send(
      new ListDistributionsCommand({ Marker: marker })
    );

    for (const d of r.DistributionList?.Items!) {
      ids.push(d.Id!);
    }

    marker = r.DistributionList?.NextMarker;
  } while (marker);

  return ids;
}

async function main() {
  const ids = await getAllDistributions();
  for (const id of ids) console.log(id);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
