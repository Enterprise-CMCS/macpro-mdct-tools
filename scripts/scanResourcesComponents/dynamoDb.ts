#!/usr/bin/env -S tsx
import { DynamoDBClient, paginateListTables } from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({ region: "us-east-1" });

export async function getAllTableNames(): Promise<string[]> {
  const names: string[] = [];

  for await (const page of paginateListTables({ client }, { Limit: 100 })) {
    names.push(...page.TableNames!);
  }

  return names;
}

async function main() {
  const tables = await getAllTableNames();

  for (const t of tables) console.log(t);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
