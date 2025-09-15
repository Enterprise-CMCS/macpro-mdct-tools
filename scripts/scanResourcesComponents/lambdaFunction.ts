#!/usr/bin/env -S tsx
import { LambdaClient, paginateListFunctions } from "@aws-sdk/client-lambda";

const client = new LambdaClient({ region: "us-east-1" });

export async function getAllLambdaFunctions(): Promise<string[]> {
  const names: string[] = [];

  for await (const page of paginateListFunctions({ client }, {})) {
    for (const f of page.Functions!) {
      names.push(f.FunctionName!);
    }
  }

  return names;
}

async function main() {
  const names = await getAllLambdaFunctions();
  for (const n of names) console.log(n);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
