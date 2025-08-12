#!npx tsx
import {
  CognitoIdentityProviderClient,
  ListUserPoolsCommand,
} from "@aws-sdk/client-cognito-identity-provider";

const client = new CognitoIdentityProviderClient({ region: "us-east-1" });

export async function getAllUserPools(): Promise<string[]> {
  const ids: string[] = [];
  let token: string | undefined;

  do {
    const r = await client.send(
      new ListUserPoolsCommand({ MaxResults: 60, NextToken: token })
    );
    for (const p of r.UserPools!) {
      ids.push(p.Id!);
    }
    token = r.NextToken;
  } while (token);

  return ids;
}

async function main() {
  const ids = await getAllUserPools();
  for (const id of ids) console.log(id);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
