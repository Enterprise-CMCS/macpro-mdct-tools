#!/usr/bin/env -S tsx
import { KMSClient, paginateListKeys } from "@aws-sdk/client-kms";

const client = new KMSClient({ region: "us-east-1" });

export async function getAllKmsKeys(): Promise<string[]> {
    const keyIds: string[] = [];

    for await (const page of paginateListKeys({ client }, { Limit: 100 })) {
        if (page.Keys) {
            keyIds.push(...page.Keys.map((k) => k.KeyId!));
        }
    }

    return keyIds;
}

async function main() {
    const keys = await getAllKmsKeys();

    for (const k of keys) console.log(k);
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
