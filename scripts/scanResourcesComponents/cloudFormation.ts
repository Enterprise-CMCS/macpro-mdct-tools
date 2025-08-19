#!npx tsx
import {
  CloudFormationClient,
  paginateListStacks,
  paginateListStackResources,
  StackStatus,
  StackSummary,
} from "@aws-sdk/client-cloudformation";

const client = new CloudFormationClient({ region: "us-east-1" });

async function getAllStacks(): Promise<StackSummary[]> {
  const stacks: StackSummary[] = [];

  for await (const page of paginateListStacks(
    { client },
    {
      StackStatusFilter: Object.values(StackStatus).filter(
        (s) => s !== StackStatus.DELETE_COMPLETE
      ),
    }
  )) {
    stacks.push(...page.StackSummaries!);
  }

  return stacks;
}

export async function getSelectedCfResourceIds(): Promise<
  Record<string, string[]>
> {
  const interestedTypes = new Set([
    "AWS::ApiGateway::RestApi",
    "AWS::CloudFront::CachePolicy",
    "AWS::CloudFront::Distribution",
    "AWS::CloudFront::OriginAccessControl",
    "AWS::CloudFront::ResponseHeadersPolicy",
    "AWS::Cognito::IdentityPool",
    "AWS::Cognito::UserPool",
    "AWS::DynamoDB::Table",
    "AWS::Events::Rule",
    "AWS::IAM::ManagedPolicy",
    "AWS::IAM::Policy",
    "AWS::IAM::Role",
    "AWS::Lambda::Function",
    "AWS::Lambda::LayerVersion",
    "AWS::Logs::LogGroup",
    "AWS::S3::Bucket",
    "AWS::WAFv2::WebACL",
  ]);

  const stacks = await getAllStacks();
  const result: Record<string, string[]> = {};

  for (const stack of stacks) {
    const stackName = stack.StackName!;

    for await (const page of paginateListStackResources(
      { client },
      { StackName: stackName }
    )) {
      for (const r of page.StackResourceSummaries) {
        const type = r.ResourceType;
        if (!type || !interestedTypes.has(type)) continue;
        if (!r.PhysicalResourceId) continue;
        (result[type] ||= []).push(r.PhysicalResourceId);
      }
    }
  }

  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  getSelectedCfResourceIds().then((x) => console.log(x));
}
