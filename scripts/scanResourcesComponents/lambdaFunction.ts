#!npx tsx
import { LambdaClient, ListFunctionsCommand } from "@aws-sdk/client-lambda";

const client = new LambdaClient({ region: "us-east-1" });

export async function getAllLambdaFunctions(): Promise<string[]> {
  const names: string[] = [];
  let marker: string | undefined;

  do {
    const r = await client.send(new ListFunctionsCommand({ Marker: marker }));
    for (const f of r.Functions!) {
      names.push(f.FunctionName!);
    }
    marker = r.NextMarker;
  } while (marker);

  return names;
}

async function main() {
  const names = await getAllLambdaFunctions();
  for (const n of names) console.log(n);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
