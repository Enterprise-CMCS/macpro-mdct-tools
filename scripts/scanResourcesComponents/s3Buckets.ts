#!/usr/bin/env -S tsx
import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3";

const client = new S3Client({ region: "us-east-1" });

export async function getAllS3Buckets(): Promise<string[]> {
  const r = await client.send(new ListBucketsCommand({}));
  return r.Buckets!.map((b) => b.Name!);
}

async function main() {
  const names = await getAllS3Buckets();
  for (const n of names) console.log(n);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
