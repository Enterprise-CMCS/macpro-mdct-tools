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
import { getAllCustomerManagedPolicies } from "./scanResourcesComponents/iamManagedPolicies";
import { getAllLayerVersionArns } from "./scanResourcesComponents/lambdaLayers";
import { getAllUserPools } from "./scanResourcesComponents/cognitoUserPool";
import { getAllIdentityPools } from "./scanResourcesComponents/cognitoIdentityPool";
import { getAllWafv2WebACLsCfnIds } from "./scanResourcesComponents/wafWebACL";
import { getAllEventRules } from "./scanResourcesComponents/eventsRule";

function log(line: string = "") {
  console.log(line);
  fs.appendFileSync("unmanaged-resources.txt", line + "\n");
}

function header(label: string, total: number, managed: number) {
  log(`${label} (total: ${total})`);
  log(`Managed by CloudFormation: ${managed}`);
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
  cfManaged: Set<string>
) {
  const unmanaged = all.filter((id) => !cfManaged.has(id));
  header(label, all.length, cfManaged.size);
  listUnmanaged(unmanaged);
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
  await checkGeneric(
    "CloudWatch Log Groups",
    await getAllLogGroups(),
    new Set<string>([
      ...set("AWS::Logs::LogGroup"),
      // Log groups created by Lambda function managed by CloudFormation
      ...Array.from(set("AWS::Lambda::Function"), (i) => `/aws/lambda/${i}`),
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
  await checkGeneric(
    "IAM Roles (excluding service-linked)",
    await getAllIamRoles(),
    set("AWS::IAM::Role")
  );
  // excluding this for now as these seem to be all CMS Cloud Team
  // await checkGeneric(
  //   "IAM Managed Policies (AWS::IAM::ManagedPolicy, customer-managed)",
  //   await getAllCustomerManagedPolicies(),
  //   set("AWS::IAM::ManagedPolicy")
  // );
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
  await checkGeneric(
    "WAFv2 WebACLs (REGIONAL & CLOUDFRONT)",
    await getAllWafv2WebACLsCfnIds(),
    set("AWS::WAFv2::WebACL")
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
