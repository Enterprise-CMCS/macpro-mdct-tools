#!npx tsx
import { IAMClient, paginateListRoles } from "@aws-sdk/client-iam";

const client = new IAMClient({ region: "us-east-1" });

export async function getAllIamRoles(): Promise<string[]> {
  const names: string[] = [];

  for await (const page of paginateListRoles({ client }, { MaxItems: 1000 })) {
    for (const role of page.Roles!) {
      names.push(role.RoleName!);
    }
  }

  return names;
}

async function main() {
  const names = await getAllIamRoles();
  for (const n of names) console.log(n);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
