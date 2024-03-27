#!/usr/bin/env -S npx ts-node -T

import {
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createHash } from "crypto";
import path from "path";
import * as fs from "fs/promises";
import { Dirent } from "fs";

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

async function generateManifest(): Promise<string> {
  const root = path.join(__dirname, "..", "..", "..");

  //types
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

  //helpers
  const isRepoFile = (dir: Dirent): boolean => {
    return !dir.path?.includes(".") && !!dir.name.match(/.*\.(pdf|png|json)/);
  };

  const isConfigFile = (dir: Dirent): boolean => {
    return isRepoFile(dir) && dir.name === "config.json";
  };

  //assumes files are only one folder deep
  const getFolder = (path: string) => path.split("/").slice(-1)[0];

  //find all files in repo
  const directory = await fs.readdir(root, {
    withFileTypes: true,
    recursive: true,
  });

  const manifest: Manifest = [];

  //loop through config.json files
  for (const config of directory.filter((f) => isConfigFile(f))) {
    const entry: Entry = {};
    const files: RepoFile[] = [];

    //set entry config data
    entry.config_data = {
      path: getFolder(config.path),
      ...JSON.parse(
        await fs.readFile(`${config.path}/${config.name}`, "utf-8")
      ),
    };

    //get all files associated with config and add to files
    const associatedFiles = directory.filter(
      (f) =>
        getFolder(f.path) == getFolder(config.path) &&
        isRepoFile(f) &&
        !isConfigFile(f)
    );

    for (const associatedFile of associatedFiles) {
      files.push({
        path: `${getFolder(associatedFile.path)}/${associatedFile.name}`,
        download_url: `${DOWNLOAD_URL_PREFIX}/${getFolder(
          associatedFile.path
        )}/${associatedFile.name}`,
      });
    }
    entry.files = files;
    manifest.push(entry);
  }
  return JSON.stringify(manifest);
}

async function main() {
  const manifest = await generateManifest();
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
