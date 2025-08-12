#!npx tsx
import {
  LambdaClient,
  ListLayersCommand,
  ListLayerVersionsCommand,
} from "@aws-sdk/client-lambda";

const client = new LambdaClient({ region: "us-east-1" });

export async function getAllLayerVersionArns(): Promise<string[]> {
  const arns: string[] = [];
  let marker: string | undefined;

  do {
    const layers = await client.send(new ListLayersCommand({ Marker: marker }));
    for (const layer of layers.Layers!) {
      let vMarker: string | undefined;
      do {
        const vers = await client.send(
          new ListLayerVersionsCommand({
            LayerName: layer.LayerName!,
            Marker: vMarker,
          })
        );
        for (const v of vers.LayerVersions!) {
          arns.push(v.LayerVersionArn!);
        }
        vMarker = vers.NextMarker;
      } while (vMarker);
    }
    marker = layers.NextMarker;
  } while (marker);

  return arns;
}

async function main() {
  const arns = await getAllLayerVersionArns();
  for (const a of arns) console.log(a);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
