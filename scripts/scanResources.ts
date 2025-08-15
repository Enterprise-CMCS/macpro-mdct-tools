#!npx tsx
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

const apigw = new APIGatewayClient({ region: "us-east-1" });

function log(line: string = "") {
  console.log(line);
  fs.appendFileSync("unmanaged-resources.txt", line + "\n");
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
    Object.entries(additionalExcludes).forEach(([key, value]) => {
      console.log(`Excluded for ${key}: ${value}`);
    });
  }
}

function listUnmanaged(items: string[]) {
  if (items.length === 0) {
    log("✅ All are managed by CloudFormation.\n");
  } else {
    log("❌ Unmanaged:");
    for (const it of items) log(`- ${it}`);
    log();
  }
}

async function checkGeneric(
  label: string,
  all: string[],
  cfManaged: Set<string>,
  additionalExcludes?: { [key: string]: number }
) {
  const unmanaged = all.filter((id) => !cfManaged.has(id));
  header(label, all.length, cfManaged.size, additionalExcludes);
  listUnmanaged(unmanaged);
}

async function apiGatewayLogGroups(set) {
  const restApiIds = set("AWS::ApiGateway::RestApi");
  const apiGatewayLogGroups: string[] = [];
  for (const restApiId of restApiIds) {
    const stages = await apigw.send(new GetStagesCommand({ restApiId }));
    for (const s of stages.item!) {
      apiGatewayLogGroups.push(
        `API-Gateway-Execution-Logs_${restApiId}/${s.stageName}`
      );
    }
  }
  return apiGatewayLogGroups;
}

async function main() {
  fs.writeFileSync("unmanaged-resources.txt", "");

  const cf = await getSelectedCfResourceIds();
  const set = (k: string) => new Set(cf[k]!);

  await checkGeneric(
    "API Gateway REST APIs",
    await getAllRestApis(),
    set("AWS::ApiGateway::RestApi")
  );
  await checkGeneric(
    "CloudFront Distributions",
    await getAllDistributions(),
    set("AWS::CloudFront::Distribution")
  );
  await checkGeneric(
    "CloudFront Custom Response Headers Policies",
    await getAllCustomResponseHeadersPolicies(),
    set("AWS::CloudFront::ResponseHeadersPolicy")
  );
  await checkGeneric(
    "CloudFront Custom Cache Policies",
    await getAllCustomCachePolicies(),
    set("AWS::CloudFront::CachePolicy")
  );
  await checkGeneric(
    "CloudFront Origin Access Controls",
    await getAllOriginAccessControls(),
    set("AWS::CloudFront::OriginAccessControl")
  );
  await checkGeneric(
    "S3 Buckets",
    await getAllS3Buckets(),
    set("AWS::S3::Bucket")
  );

  const allLogGroups = await getAllLogGroups();
  const cmsCloudTeamLambdaLogGroups = allLogGroups.filter((n) =>
    n.toLowerCase().startsWith("/aws/lambda/cms-cloud")
  );

  await checkGeneric(
    `CloudWatch Log Groups\nLambda Log Groups associated with CMS Cloud Team Lambda Functions: ${cmsCloudTeamLambdaLogGroups.length}`,
    allLogGroups,
    new Set<string>([
      ...set("AWS::Logs::LogGroup"),
      // Log groups created by Lambda functions managed by CloudFormation
      ...Array.from(set("AWS::Lambda::Function"), (i) => `/aws/lambda/${i}`),
      // Log groups created by API Gateways managed by CloudFormation
      ...(await apiGatewayLogGroups(set)),
      ...cmsCloudTeamLambdaLogGroups,
    ])
  );
  await checkGeneric(
    "Lambda Functions",
    await getAllLambdaFunctions(),
    set("AWS::Lambda::Function")
  );
  await checkGeneric(
    "Lambda LayerVersions",
    await getAllLayerVersionArns(),
    set("AWS::Lambda::LayerVersion")
  );
  await checkGeneric(
    "DynamoDB Tables",
    await getAllTableNames(),
    set("AWS::DynamoDB::Table")
  );

  const allIamRoles = await getAllIamRoles();
  log("All IAM Roles: " + allIamRoles.length);
  const ourIamRoles = allIamRoles.filter((name) =>
    name.toLowerCase().match(/^(seds|qmr|mcr|mfp|hcbs|carts)/)
  );
  await checkGeneric(
    "IAM Roles (excluding service-linked)",
    ourIamRoles,
    set("AWS::IAM::Role")
  );
  await checkGeneric(
    "Cognito User Pools",
    await getAllUserPools(),
    set("AWS::Cognito::UserPool")
  );
  await checkGeneric(
    "Cognito Identity Pools",
    await getAllIdentityPools(),
    set("AWS::Cognito::IdentityPool")
  );

  const allWebAcls = await getAllWafv2WebACLsCfnIds();
  const webAclExcludedPrefixes = ["FMManagedWebACLV2-cms-cloud"];

  const wafAdditionalExcludes = {};
  for (const prefix of webAclExcludedPrefixes) {
    const matches = allWebAcls.filter((a) => a.startsWith(prefix));
    wafAdditionalExcludes[`${prefix} prefix`] = matches.length;
  }

  const ourWebAcls = allWebAcls.filter(
    (w) => !webAclExcludedPrefixes.some((prefix) => w.startsWith(prefix))
  );

  await checkGeneric(
    "WAFv2 WebACLs (REGIONAL & CLOUDFRONT)",
    ourWebAcls,
    set("AWS::WAFv2::WebACL"),
    wafAdditionalExcludes
  );
  await checkGeneric(
    "Event Rules",
    await getAllEventRules(),
    set("AWS::Events::Rule")
  );

  console.log("Scan complete. See unmanaged-resources.txt");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
