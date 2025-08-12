#!npx tsx
import { IAMClient, ListPoliciesCommand } from "@aws-sdk/client-iam";

const client = new IAMClient({ region: "us-east-1" });

export async function getAllCustomerManagedPolicies(): Promise<string[]> {
  const arns: string[] = [];
  let Marker: string | undefined;

  do {
    const r = await client.send(
      new ListPoliciesCommand({
        Scope: "Local",
        OnlyAttached: false,
        Marker,
        MaxItems: 1000,
      })
    );
    for (const p of r.Policies!) {
      arns.push(p.Arn!);
    }
    Marker = r.Marker;
  } while (Marker);

  return arns;
}

async function main() {
  const arns = await getAllCustomerManagedPolicies();
  for (const a of arns) console.log(a);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
