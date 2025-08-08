#!/usr/bin/env -S tsx
import {
  CloudFormationClient,
  ListStacksCommand,
  DescribeStackResourcesCommand,
  StackSummary,
} from "@aws-sdk/client-cloudformation";
import { writeFileSync } from "fs";

const region = "us-east-1";
const client = new CloudFormationClient({ region });

const NAME_FILTERS = ["main", "master", "val", "prod"];

async function getAllStacks(): Promise<StackSummary[]> {
  let nextToken: string | undefined = undefined;
  const stacks: StackSummary[] = [];

  do {
    const command: ListStacksCommand = new ListStacksCommand({
      NextToken: nextToken,
    });
    const response = await client.send(command);

    const activeStacks = response.StackSummaries?.filter(
      (stack) =>
        stack.StackStatus !== "DELETE_COMPLETE" &&
        stack.StackName &&
        NAME_FILTERS.some((filter) => {
          if (stack && stack.StackName)
            return stack.StackName.toLowerCase().includes(filter);
        })
    );

    if (activeStacks) {
      stacks.push(...activeStacks);
    }

    nextToken = response.NextToken;
  } while (nextToken);

  return stacks;
}

async function getResourceTypes(stackName: string): Promise<string[]> {
  const command = new DescribeStackResourcesCommand({ StackName: stackName });
  const response = await client.send(command);

  return (
    response.StackResources?.map((res) => res.ResourceType || "").filter(
      Boolean
    ) || []
  );
}

async function main() {
  const stacks = await getAllStacks();
  console.log(`Found ${stacks.length} matching stacks.`);

  const resourceTypeSet = new Set<string>();

  for (const stack of stacks) {
    console.log(`Getting resources for stack: ${stack.StackName}`);
    const types = await getResourceTypes(stack.StackName!);
    types.forEach((type) => resourceTypeSet.add(type));
  }

  const resourceTypes = Array.from(resourceTypeSet).sort();
  writeFileSync("resource-types.txt", resourceTypes.join("\n"));

  console.log(`✅ Done. Found ${resourceTypes.length} unique resource types.`);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
