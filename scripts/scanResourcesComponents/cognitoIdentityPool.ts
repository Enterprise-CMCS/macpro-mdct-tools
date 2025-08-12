#!npx tsx
import {
  CognitoIdentityClient,
  ListIdentityPoolsCommand,
} from "@aws-sdk/client-cognito-identity";

const client = new CognitoIdentityClient({ region: "us-east-1" });

export async function getAllIdentityPools(): Promise<string[]> {
  const ids: string[] = [];
  let token: string | undefined;

  do {
    const r = await client.send(
      new ListIdentityPoolsCommand({ MaxResults: 60, NextToken: token })
    );
    for (const p of r.IdentityPools!) {
      ids.push(p.IdentityPoolId!);
    }
    token = r.NextToken;
  } while (token);

  return ids;
}

async function main() {
  const ids = await getAllIdentityPools();
  for (const id of ids) console.log(id);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
