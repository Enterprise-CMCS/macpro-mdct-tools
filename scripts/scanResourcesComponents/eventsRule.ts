#!npx tsx
import {
  EventBridgeClient,
  ListRulesCommand,
} from "@aws-sdk/client-eventbridge";

const client = new EventBridgeClient({ region: "us-east-1" });


export async function getAllEventRules(): Promise<string[]> {
  const names: string[] = [];
  let nextToken: string | undefined;

  do {
    const r = await client.send(
      new ListRulesCommand({ Limit: 100, NextToken: nextToken })
    );

    for (const rule of r.Rules!) {
      const name = rule.Name!;
      // if (!excludedPrefixes.some((prefix) => name.startsWith(prefix))) {
      names.push(name);
      // }
    }

    nextToken = r.NextToken;
  } while (nextToken);

  return names;
}

async function main() {
  const rules = await getAllEventRules();
  for (const r of rules) console.log(r);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
