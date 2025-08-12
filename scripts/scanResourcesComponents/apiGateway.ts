#!npx tsx
import {
  APIGatewayClient,
  GetRestApisCommand,
} from "@aws-sdk/client-api-gateway";

const client = new APIGatewayClient({ region: "us-east-1" });

export async function getAllRestApis(): Promise<string[]> {
  const ids: string[] = [];
  let position: string | undefined;

  do {
    const r = await client.send(
      new GetRestApisCommand({ position, limit: 500 })
    );
    for (const api of r.items!) ids.push(api.id!);
    position = r.position;
  } while (position);

  return ids;
}

async function main() {
  const ids = await getAllRestApis();
  for (const id of ids) console.log(id);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
