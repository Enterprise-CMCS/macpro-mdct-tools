#!/usr/bin/env node

// To run this script:
// For creating a case:
// ./scripts/manage-support-case.ts create --cloudfrontId "E1234567890" --cloudfrontUrl "https://SOMETHING.cloudfront.net/"
// For getting all existing case details:
// ./scripts/manage-support-case.ts get

import {
  SupportClient,
  CreateCaseCommand,
  DescribeCasesCommand,
} from "@aws-sdk/client-support";

const supportClient = new SupportClient({});

const command = process.argv[2];

const getArgValue = (argName: string): string | undefined => {
  const argIndex = process.argv.indexOf(argName);
  if (argIndex !== -1 && process.argv.length > argIndex + 1) {
    return process.argv[argIndex + 1];
  }
  return undefined;
};

const createSupportCase = async (
  cloudfrontId: string,
  cloudfrontUrl: string
) => {
  try {
    const body = `
    Distribution ID (E1234567890): ${cloudfrontId}
    Service: CloudFront
    Category: Distribution Issue
    Severity: General guidance (24h first-response time target)
    Subject: CMS CloudFront distro SRR onboarding
    Description: Requesting expedited U.S.-only SRR onboarding for: ${cloudfrontUrl}
    Reference case #175512056000814.
    `;

    const command = new CreateCaseCommand({
      subject: "CMS CloudFront distro SRR onboarding",
      communicationBody: body,
      severityCode: "low",
      categoryCode: "distribution-issue",
      serviceCode: "amazon-cloudfront",
      ccEmailAddresses: ["cms-cloud-aws-operations@samtek.io"],
    });
    const response = await supportClient.send(command);
    console.log("Successfully created case:");
    console.log(response.caseId);
  } catch (error) {
    console.error("Error creating support case:", error);
  }
};

const getSupportCaseDetails = async () => {
  const command = new DescribeCasesCommand();
  const response = await supportClient.send(command);
  console.log("Case details:");
  console.log(JSON.stringify(response.cases, null, 2));
};

const main = async () => {
  if (command === "create") {
    const cloudfrontId = getArgValue("--cloudfrontId")!;
    const cloudfrontUrl = getArgValue("--cloudfrontUrl")!;
    await createSupportCase(cloudfrontId, cloudfrontUrl);
  } else if (command === "get") {
    await getSupportCaseDetails();
  }
};

main();
