#!/usr/bin/env -S tsx
import {
  APIGatewayClient,
  paginateGetRestApis,
} from "@aws-sdk/client-api-gateway";

const client = new APIGatewayClient({ region: "us-east-1" });

export async function getAllRestApis(): Promise<string[]> {
  const ids: string[] = [];

  for await (const page of paginateGetRestApis({ client }, { limit: 500 })) {
    for (const api of page.items!) ids.push(api.id!);
  }

  return ids;
}

async function main() {
  const ids = await getAllRestApis();
  for (const id of ids) console.log(id);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
