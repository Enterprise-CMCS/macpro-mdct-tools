#!npx tsx
import {
  LambdaClient,
  paginateListLayers,
  paginateListLayerVersions,
} from "@aws-sdk/client-lambda";

const client = new LambdaClient({ region: "us-east-1" });

export async function getAllLayerVersionArns(): Promise<string[]> {
  const arns: string[] = [];

  for await (const layersPage of paginateListLayers({ client }, {})) {
    for (const layer of layersPage.Layers!) {
      for await (const versionsPage of paginateListLayerVersions(
        { client },
        { LayerName: layer.LayerName! }
      )) {
        for (const v of versionsPage.LayerVersions!) {
          arns.push(v.LayerVersionArn!);
        }
      }
    }
  }

  return arns;
}

async function main() {
  const arns = await getAllLayerVersionArns();
  for (const a of arns) console.log(a);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
