#!npx tsx
import {
  CloudFormationClient,
  ListStackResourcesCommand,
  ListStacksCommand,
  StackStatus,
  StackSummary,
} from "@aws-sdk/client-cloudformation";

const client = new CloudFormationClient({ region: "us-east-1" });

async function getAllStacks(): Promise<StackSummary[]> {
  const stacks: StackSummary[] = [];
  let nextToken: string | undefined;

  do {
    const response = await client.send(
      new ListStacksCommand({
        NextToken: nextToken,
        StackStatusFilter: Object.values(StackStatus).filter(
          (s) => s !== StackStatus.DELETE_COMPLETE
        ),
      })
    );
    if (response.StackSummaries) stacks.push(...response.StackSummaries);
    nextToken = response.NextToken;
  } while (nextToken);

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
    let nextToken: string | undefined;

    do {
      const response = await client.send(
        new ListStackResourcesCommand({
          StackName: stackName,
          NextToken: nextToken,
        })
      );

      for (const r of response.StackResourceSummaries!) {
        const type = r.ResourceType;
        if (!type || !interestedTypes.has(type)) continue;
        if (!r.PhysicalResourceId) continue;

        (result[type] ||= []).push(r.PhysicalResourceId);
      }

      nextToken = response.NextToken;
    } while (nextToken);
  }

  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  getSelectedCfResourceIds().then((x) => console.log(x));
}
