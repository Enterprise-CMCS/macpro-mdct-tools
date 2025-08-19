#!/usr/bin/env -S tsx
import {
  CognitoIdentityClient,
  paginateListIdentityPools,
} from "@aws-sdk/client-cognito-identity";

const client = new CognitoIdentityClient({ region: "us-east-1" });

export async function getAllIdentityPools(): Promise<string[]> {
  const ids: string[] = [];

  for await (const page of paginateListIdentityPools(
    { client },
    { MaxResults: 60 }
  )) {
    for (const p of page.IdentityPools!) {
      ids.push(p.IdentityPoolId!);
    }
  }

  return ids;
}

async function main() {
  const ids = await getAllIdentityPools();
  for (const id of ids) console.log(id);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
