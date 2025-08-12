#!npx tsx
import {
  CloudFrontClient,
  ListOriginAccessControlsCommand,
} from "@aws-sdk/client-cloudfront";

const client = new CloudFrontClient({ region: "us-east-1" });

export async function getAllOriginAccessControls(): Promise<string[]> {
  const ids: string[] = [];
  let marker: string | undefined;

  do {
    const r = await client.send(
      new ListOriginAccessControlsCommand({ Marker: marker })
    );

    for (const item of r.OriginAccessControlList?.Items!) {
      ids.push(item.Id!);
    }

    marker = r.OriginAccessControlList?.NextMarker;
  } while (marker);

  return ids;
}

async function main() {
  const ids = await getAllOriginAccessControls();
  for (const id of ids) console.log(id);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
