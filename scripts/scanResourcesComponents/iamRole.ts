#!npx tsx
import { IAMClient, ListRolesCommand } from "@aws-sdk/client-iam";

const client = new IAMClient({ region: "us-east-1" });

async function backoff(attempt: number) {
  const delay = Math.min(1000 * 2 ** attempt, 16000); // cap at 16s
  await new Promise((resolve) => setTimeout(resolve, delay));
}

export async function getAllIamRoles(): Promise<string[]> {
  const names: string[] = [];
  let Marker: string | undefined;
  let attempt = 0;

  do {
    try {
      const r = await client.send(
        new ListRolesCommand({ Marker, MaxItems: 1000 })
      );

      for (const role of r.Roles!) {
        const name = role.RoleName!;
        if (name.toLowerCase().match(/^(seds|qmr|mcr|mfp|hcbs|carts)/)) {
          names.push(name);
        }
      }

      Marker = r.Marker;
      attempt = 0; // reset after a successful call
    } catch (err) {
      if ((err as any).name === "ThrottlingException") {
        await backoff(attempt++);
        continue; // retry same Marker
      }
      throw err;
    }
  } while (Marker);

  return names;
}

async function main() {
  const names = await getAllIamRoles();
  for (const n of names) console.log(n);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
