#!npx tsx
import { DynamoDBClient, ListTablesCommand } from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({ region: "us-east-1" });

export async function getAllTableNames(): Promise<string[]> {
  const names: string[] = [];
  let last: string | undefined;

  do {
    const r = await client.send(
      new ListTablesCommand({ ExclusiveStartTableName: last, Limit: 100 })
    );
    names.push(...r.TableNames!);
    last = r.LastEvaluatedTableName;
  } while (last);

  return names;
}

async function main() {
  const tables = await getAllTableNames();

  for (const t of tables) console.log(t);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
