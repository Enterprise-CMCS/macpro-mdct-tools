#!/usr/bin/env -S tsx
import {
    EC2Client,
    paginateDescribeSecurityGroups,
} from "@aws-sdk/client-ec2";

const client = new EC2Client({ region: "us-east-1" });

export async function getAllSecurityGroups(): Promise<string[]> {
    const groupIds: string[] = [];

    for await (const page of paginateDescribeSecurityGroups({ client }, {})) {
        if (page.SecurityGroups) {
            groupIds.push(...page.SecurityGroups.map((sg) => sg.GroupId!));
        }
    }

    return groupIds;
}

async function main() {
    const groups = await getAllSecurityGroups();

    for (const g of groups) console.log(g);
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
