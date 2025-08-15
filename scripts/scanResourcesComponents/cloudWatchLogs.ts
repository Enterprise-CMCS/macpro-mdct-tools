#!npx tsx
import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
} from "@aws-sdk/client-cloudwatch-logs";

const client = new CloudWatchLogsClient({ region: "us-east-1" });

export async function getAllLogGroups(): Promise<string[]> {
  const names: string[] = [];
  let nextToken: string | undefined;

  do {
    const r = await client.send(new DescribeLogGroupsCommand({ nextToken }));

    for (const g of r.logGroups!) {
      const n = g.logGroupName!;
      names.push(n);
    }

    nextToken = r.nextToken;
  } while (nextToken);

  return names;
}

async function main() {
  const names = await getAllLogGroups();
  for (const n of names) console.log(n);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
