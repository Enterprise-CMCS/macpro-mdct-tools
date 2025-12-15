#!/usr/bin/env -S tsx
import fs from "fs";
import { getAllRestApis } from "./scanResourcesComponents/apiGateway";
import { getSelectedCfResourceIds } from "./scanResourcesComponents/cloudFormation";
import { getAllDistributions } from "./scanResourcesComponents/cloudFrontDistribution";
import { getAllS3Buckets } from "./scanResourcesComponents/s3Buckets";
import { getAllCustomResponseHeadersPolicies } from "./scanResourcesComponents/cloudFrontResponseHeadersPolicy";
import { getAllOriginAccessControls } from "./scanResourcesComponents/cloudFrontOriginAccessControl";
import { getAllCustomCachePolicies } from "./scanResourcesComponents/cloudFrontCachePolicy";
import { getAllLogGroups } from "./scanResourcesComponents/cloudWatchLogs";
import { getAllLambdaFunctions } from "./scanResourcesComponents/lambdaFunction";
import { getAllTableNames } from "./scanResourcesComponents/dynamoDb";
import { getAllIamRoles } from "./scanResourcesComponents/iamRole";
import { getAllLayerVersionArns } from "./scanResourcesComponents/lambdaLayers";
import { getAllUserPools } from "./scanResourcesComponents/cognitoUserPool";
import { getAllIdentityPools } from "./scanResourcesComponents/cognitoIdentityPool";
import { getAllWafv2WebACLsCfnIds } from "./scanResourcesComponents/wafWebACL";
import { getAllEventRules } from "./scanResourcesComponents/eventsRule";
import {
  APIGatewayClient,
  GetStagesCommand,
} from "@aws-sdk/client-api-gateway";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { IAMClient, ListAccountAliasesCommand } from "@aws-sdk/client-iam";

const apigw = new APIGatewayClient({ region: "us-east-1" });

let outputFile = "unmanaged-resources.txt";

function log(line: string = "") {
  console.log(line);
  fs.appendFileSync(outputFile, line + "\n");
}

async function getAccountIdentifier(): Promise<string> {
  const iam = new IAMClient({});
  let alias: string | undefined;
  const accountId = await getAccountId();
  try {
    const aliasResp = await iam.send(new ListAccountAliasesCommand({}));
    if (aliasResp.AccountAliases && aliasResp.AccountAliases.length > 0) {
      alias = aliasResp.AccountAliases[0];
    }
  } catch {
    // ignore
  }

  return (alias || accountId || "unknown-account").replace(
    /[^a-zA-Z0-9-_]/g,
    "_"
  );
}

async function getAccountId(): Promise<string | undefined> {
  try {
    const sts = new STSClient({});
    const idResp = await sts.send(new GetCallerIdentityCommand({}));
    return idResp.Account;
  } catch {
    return undefined;
  }
}

function header(
  label: string,
  total: number,
  managed: number,
  additionalExcludes?: { [key: string]: number }
) {
  log(`${label} (total: ${total})`);
  log(`Managed by CloudFormation: ${managed}`);
  if (additionalExcludes) {
    for (const [reason, count] of Object.entries(additionalExcludes)) {
      if (count > 0) log(`Excluded for ${reason}: ${count}`);
    }
  }
}

function listUnmanaged(items: string[]) {
  if (items.length === 0) {
    log("✅ All are managed by CloudFormation or excluded.\n");
  } else {
    log("❌ Unmanaged:");
    for (const it of items) log(`- ${it}`);
    log();
  }
}

async function checkGeneric(
  label: string,
  all: string[],
  cfManaged: string[],
  additionalExcludes?: { [key: string]: number },
  additionalExactExcludes?: { [key: string]: number },
  additionalContainsExcludes?: { [key: string]: number }
) {
  const excludePrefixes: string[] = Object.keys(additionalExcludes ?? {});
  const excludeExact: string[] = Object.keys(additionalExactExcludes ?? {});
  const excludeContains: string[] = Object.keys(
    additionalContainsExcludes ?? {}
  );

  let managedCount = 0;
  const unmanaged: string[] = [];

  for (const id of all) {
    if (cfManaged.includes(id)) {
      managedCount++;
      continue;
    }

    const excludedByPrefix =
      excludePrefixes.length > 0 &&
      excludePrefixes.some((p) => (p ? id.startsWith(p) : false));

    const excludedByExact =
      excludeExact.length > 0 && excludeExact.includes(id);

    const excludedByContains =
      excludeContains.length > 0 &&
      excludeContains.some((s) => (s ? id.includes(s) : false));

    if (!(excludedByPrefix || excludedByExact || excludedByContains)) {
      unmanaged.push(id);
    }
  }

  const combinedCounts = {
    ...(additionalExcludes ?? {}),
    ...(additionalExactExcludes ?? {}),
    ...(additionalContainsExcludes ?? {}),
  };

  header(label, all.length, managedCount, combinedCounts);
  listUnmanaged(unmanaged);
}

async function apiGatewayLogGroups(getArray: (k: string) => string[]) {
  const restApiIds = getArray("AWS::ApiGateway::RestApi");
  const apiGatewayLogGroups: string[] = [];
  for (const restApiId of restApiIds) {
    try {
      const stages = await apigw.send(new GetStagesCommand({ restApiId }));
      for (const s of stages.item!) {
        if (!s.stageName) continue;
        apiGatewayLogGroups.push(
          `API-Gateway-Execution-Logs_${restApiId}/${s.stageName}`
        );
      }
    } catch {}
  }
  return apiGatewayLogGroups;
}

async function main() {
  const accountIdent = await getAccountIdentifier();
  const accountId = await getAccountId();
  outputFile = `unmanaged-resources-${accountIdent}.txt`;
  fs.writeFileSync(outputFile, "");
  console.log(`Writing scan results to ${outputFile}`);

  const cf = await getSelectedCfResourceIds();
  const getArray = (k: string) => cf[k] || [];

  await checkGeneric(
    "API Gateway REST APIs",
    await getAllRestApis(),
    getArray("AWS::ApiGateway::RestApi")
  );

  await checkGeneric(
    "CloudFront Distributions",
    await getAllDistributions(),
    getArray("AWS::CloudFront::Distribution")
  );

  await checkGeneric(
    "CloudFront Custom Response Headers Policies",
    await getAllCustomResponseHeadersPolicies(),
    getArray("AWS::CloudFront::ResponseHeadersPolicy")
  );

  await checkGeneric(
    "CloudFront Custom Cache Policies",
    await getAllCustomCachePolicies(),
    getArray("AWS::CloudFront::CachePolicy")
  );

  await checkGeneric(
    "CloudFront Origin Access Controls",
    await getAllOriginAccessControls(),
    getArray("AWS::CloudFront::OriginAccessControl")
  );

  const allS3Buckets = await getAllS3Buckets();
  const s3SubstringExcludes: string[] = [
    "prod",
    "us-west-2",
    ...(accountId ? [accountId] : []),
  ];
  const s3ContainsCounts: { [k: string]: number } = {};
  for (const sub of s3SubstringExcludes) {
    s3ContainsCounts[sub] = allS3Buckets.filter((b) => b.includes(sub)).length;
  }
  await checkGeneric(
    "S3 Buckets",
    allS3Buckets,
    getArray("AWS::S3::Bucket"),
    undefined,
    undefined,
    s3ContainsCounts
  );

  const allLogGroups = await getAllLogGroups();
  const treatedAsManagedLogGroups: string[] = [
    ...getArray("AWS::Logs::LogGroup"),
    ...getArray("AWS::Lambda::Function").map((fn) => `/aws/lambda/${fn}`),
    ...(await apiGatewayLogGroups(getArray)),
  ];

  const logGroupExcludedPrefixes = [
    "/aws/ec2",
    "/aws/rds",
    "/aws/lambda/CMS-Cloud",
    "/aws/lambda/cms-cloud",
    "/aws/lambda/NewRelicInfrastructure-Integrations-LambdaFunction",
  ];
  const logGroupExactExcludes = [
    "/aws/ssm/CMS-Cloud-Security-RunInspec",
    "amazon-ssm-agent.log",
    "cms-cloud-vpc-querylogs",
    "/aws/apigateway/welcome",
    "/aws/lambda/CF-Custom-Resource-SSM-Association",
    "/aws/lambda/CMS-Custom-Resource-Placeholder-Document",
    "/aws/lambda/ITOPS-Security-Attach-Inspector-to-SNS",
  ];

  const cwAdditionalExcludePrefixes: { [k: string]: number } = {};
  for (const prefix of logGroupExcludedPrefixes) {
    cwAdditionalExcludePrefixes[prefix] = allLogGroups.filter((n) =>
      n.startsWith(prefix)
    ).length;
  }

  const cwAdditionalExactExcludes: { [k: string]: number } = {};
  for (const exact of logGroupExactExcludes) {
    cwAdditionalExactExcludes[exact] = allLogGroups.filter(
      (n) => n === exact
    ).length;
  }

  await checkGeneric(
    "CloudWatch Log Groups",
    allLogGroups,
    treatedAsManagedLogGroups,
    cwAdditionalExcludePrefixes,
    cwAdditionalExactExcludes
  );

  await checkGeneric(
    "Lambda Functions",
    await getAllLambdaFunctions(),
    getArray("AWS::Lambda::Function")
  );

  await checkGeneric(
    "Lambda LayerVersions",
    await getAllLayerVersionArns(),
    getArray("AWS::Lambda::LayerVersion")
  );

  await checkGeneric(
    "DynamoDB Tables",
    await getAllTableNames(),
    getArray("AWS::DynamoDB::Table")
  );

  const allIamRoles = await getAllIamRoles();
  log("All IAM Roles: " + allIamRoles.length);
  const projectRolePattern = /^(seds|qmr|mcr|mfp|hcbs|carts)/i;
  const projectIamRoles = allIamRoles.filter((name) =>
    projectRolePattern.test(name)
  );
  await checkGeneric(
    "IAM Roles (project-scoped, excluding service-linked)",
    projectIamRoles,
    getArray("AWS::IAM::Role")
  );

  await checkGeneric(
    "Cognito User Pools",
    await getAllUserPools(),
    getArray("AWS::Cognito::UserPool")
  );

  await checkGeneric(
    "Cognito Identity Pools",
    await getAllIdentityPools(),
    getArray("AWS::Cognito::IdentityPool")
  );

  const allWebAcls = await getAllWafv2WebACLsCfnIds();
  const webAclExcludedPrefixes = ["FMManagedWebACLV2-cms-cloud"];

  const wafAdditionalExcludes: { [k: string]: number } = {};
  for (const prefix of webAclExcludedPrefixes) {
    wafAdditionalExcludes[prefix] = allWebAcls.filter((a) =>
      a.startsWith(prefix)
    ).length;
  }

  await checkGeneric(
    "WAFv2 WebACLs (REGIONAL & CLOUDFRONT)",
    allWebAcls,
    getArray("AWS::WAFv2::WebACL"),
    wafAdditionalExcludes
  );

  const allEventRules = await getAllEventRules();
  const eventRulesExcludedPrefixes = [
    "SSMExplorerManagedRule",
    "billing-alerts",
    "health-events",
    "custodian",
  ];

  const eventRulesAdditionalExcludes: { [k: string]: number } = {};
  for (const prefix of eventRulesExcludedPrefixes) {
    eventRulesAdditionalExcludes[prefix] = allEventRules.filter((a) =>
      a.startsWith(prefix)
    ).length;
  }

  await checkGeneric(
    "Event Rules",
    allEventRules,
    getArray("AWS::Events::Rule"),
    eventRulesAdditionalExcludes
  );

  console.log(`Scan complete. See ${outputFile}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
