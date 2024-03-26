#!/usr/bin/env -S npx ts-node -T

import {
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createHash } from "crypto";
import path from "path";
import fs from "fs";

const DOWNLOAD_URL_PREFIX =
  "https://raw.githubusercontent.com/sensible-hq/sensible-sample-documents/main";

const targets: Record<string, readonly string[]> = {
  "us-west-2": ["prod", "dev", "exp1"],
  "eu-west-2": ["prod"],
  "ca-central-1": ["prod"],
} as const;

async function uploadManifest(manifest: string) {
  const ContentMD5 = createHash("md5").update(manifest).digest("base64");
  await Promise.all(
    Object.entries(targets).flatMap(async ([region, stages]) => {
      const s3 = new S3Client({ region });
      return stages.map(async (stage) =>
        s3.send(
          new PutObjectCommand({
            Bucket: `sensible-so-utility-bucket-${stage}-${region}`,
            Key: "SAMPLE_DOCUMENTS/manifest_v2.json",
            Body: manifest,
            ContentMD5,
            ContentType: "application/json",
          })
        )
      );
    })
  );
}

function generateManifest(): string {
  const root = path.join(__dirname, "..", "..", "..");

  type Manifest = Entry[];

  type Entry = {
    config_data?: ConfigDataReturn & { path: string };
    files?: RepoFile[];
  };

  type ConfigDataReturn = {
    category: string;
    description: string;
    display_name: string;
    icon: string;
  };

  type RepoFile = {
    path: string;
    download_url: string;
  };

  const directory = fs.readdirSync(root, { withFileTypes: true });

  const manifest: Manifest = [];
  for (const dir of directory) {
    const entry: Entry = {};
    const files: RepoFile[] = [];
    if (dir.isDirectory() && !dir.name.startsWith(".")) {
      const innerFiles = fs.readdirSync(`${root}/${dir.name}`);
      for (const innerFile of innerFiles) {
        if (innerFile == "config.json") {
          const configData: ConfigDataReturn = JSON.parse(
            fs.readFileSync(`${root}/${dir.name}/${innerFile}`, "utf-8")
          );
          entry.config_data = { path: dir.name, ...configData };
        } else {
          files.push({
            path: `${dir.name}/${innerFile}`,
            download_url: `${DOWNLOAD_URL_PREFIX}/${dir.name}/${innerFile}`,
          });
        }
      }
      entry.files = files;
      manifest.push(entry);
    }
  }
  return JSON.stringify(manifest);
}

async function main() {
  const manifest = generateManifest();
  await uploadManifest(manifest);
  await new S3Client({ region: "us-west-2" }).send(
    new ListObjectsV2Command({
      Bucket: "sensible-so-utility-bucket-dev-us-west-2",
      Prefix: "SAMPLE_DOCUMENTS/",
    })
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
