#!/usr/bin/env -S npx ts-node -T

import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import * as fs from "fs/promises";
import { Dirent } from "fs";

// Base for the public URL of each sample file. Sample documents are served from
// the config-library bucket under the samples/ prefix, fronted by Cloudflare.
const DOWNLOAD_URL_PREFIX = "https://template-library.sensible.so/samples";

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
    return (
      !dir.parentPath?.includes(".") && !!dir.name.match(/.*\.(pdf|png|json)/)
    );
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
      path: getFolder(config.parentPath),
      ...JSON.parse(
        await fs.readFile(`${config.parentPath}/${config.name}`, "utf-8"),
      ),
    };

    //get all files associated with config and add to files
    const associatedFiles = directory.filter(
      (f) =>
        getFolder(f.parentPath) == getFolder(config.parentPath) &&
        isRepoFile(f) &&
        !isConfigFile(f),
    );

    for (const associatedFile of associatedFiles) {
      files.push({
        path: `${getFolder(associatedFile.parentPath)}/${associatedFile.name}`,
        download_url: `${DOWNLOAD_URL_PREFIX}/${getFolder(
          associatedFile.parentPath,
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
  // Repo-root output/ (gitignored). The CI workflow uploads this manifest and
  // syncs the sample content to the config-library bucket's samples/ prefix.
  const outputDir = path.join(__dirname, "..", "..", "..", "output");
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(path.join(outputDir, "manifest_v2.json"), manifest);
  console.log(`Wrote manifest to ${path.join(outputDir, "manifest_v2.json")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
