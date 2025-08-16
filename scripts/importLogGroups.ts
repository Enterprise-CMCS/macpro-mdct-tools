#!/usr/bin/env -S tsx
import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { prompt } from "./utils.ts";

const INPUT = "cdk-import-map.json";
const OUTPUT = "cdk-import-map.filled.json";

(async () => {
  const PROJECT = (await prompt("Enter PROJECT: ")).toLowerCase();
  const STAGE = await prompt("Enter STAGE: ");

  // Run the CDK import record-resource-mapping command with forced "yes"
  try {
    console.log("Running CDK import record-resource-mapping command...");
    execSync(
      `yes ZZZZZZZZZZ | yarn cdk import --context stage=${STAGE} --force --record-resource-mapping ${INPUT}`,
      { stdio: "inherit", env: { ...process.env, PROJECT } }
    );
    console.log("CDK import record-resource-mapping command completed.\n");
  } catch (err) {
    console.error("CDK import record-resource-mapping command failed:", err);
    process.exit(1);
  }

  const client = new CloudWatchLogsClient({ region: "us-east-1" });

  const logGroups: string[] = [];
  let nextToken: string | undefined;

  do {
    const response = await client.send(
      new DescribeLogGroupsCommand({ nextToken, limit: 50 })
    );
    if (response.logGroups)
      logGroups.push(
        ...response.logGroups
          .map((lg) => lg.logGroupName)
          .filter((name) => typeof name === "string")
      );
    nextToken = response.nextToken;
  } while (nextToken);

  const inputData: { [key: string]: { [key: string]: string } } = JSON.parse(
    readFileSync(INPUT, "utf8")
  );

  // Filter only entries that have a LogGroupName property
  const data = Object.fromEntries(
    Object.entries(inputData).filter(([_, props]) => props.LogGroupName)
  );

  for (const [logicalId, props] of Object.entries(data)) {
    const base = logicalId.replace(/LogGroup[A-Za-z0-9]*$/, "");
    const funcName = base.substring(0, base.length / 2);

    if (!funcName) {
      console.log(`✖ Could not extract function name from ${logicalId}`);
      continue;
    }

    const expectedSuffix = `${STAGE}-${funcName}`;

    const matches = logGroups.filter((group) => group.endsWith(expectedSuffix));

    if (matches.length > 1) {
      throw new Error(
        `Multiple log groups match suffix "${expectedSuffix}" for logical ID "${logicalId}":\n${matches.join(
          "\n"
        )}`
      );
    }

    if (matches.length === 1) {
      const matchedGroup = matches[0];
      console.log(`✔ ${logicalId} → ${funcName} → ${matchedGroup}`);
      props.LogGroupName = matchedGroup;
    } else {
      console.log(`✖ ${logicalId} → ${funcName} — no match`);
    }
  }

  for (const logicalId of Object.keys(data)) {
    const val = data[logicalId].LogGroupName;
    if (typeof val === "string" && /^Z+$/.test(val)) {
      delete data[logicalId];
    }
  }

  writeFileSync(OUTPUT, JSON.stringify(data, null, 2));

  console.log(`
File creation complete.

Now:
1. Comment out the log group retention line in all of this project's lambda constructs.
2. Run: \`PROJECT=${PROJECT} yarn cdk import --context stage=${STAGE} --force --resource-mapping=${OUTPUT}\`
3. Run: \`./run deploy --stage ${STAGE}\` (Note: if this fails with a log group already exists, you just need to run this first script again because it missed one.  That happened in testing but probably only because the stage was so new.)
4. Uncomment the log group retention line in all of this project's lambda constructs.
5. Run: \`./run deploy --stage ${STAGE}\`
6. Merge a PR to ${STAGE} with these log group changes.

`);
})();
