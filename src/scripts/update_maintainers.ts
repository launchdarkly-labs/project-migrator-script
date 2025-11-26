import yargs from "https://deno.land/x/yargs@v17.7.2-deno/deno.ts";
// import { ensureDirSync } from "https://deno.land/std@0.149.0/fs/mod.ts";
// import { consoleLogger } from "../utils/utils.ts";

interface Arguments {
  projKey: string;
  mappingFile: string;
}

interface MaintainerMapping {
  [key: string]: string;
}

interface FlagData {
  maintainerId?: string;
  [key: string]: any;
}

const inputArgs: Arguments = yargs(Deno.args)
  .alias("p", "projKey")
  .alias("m", "mappingFile")
  .demandOption(["p", "m"])
  .parse() as Arguments;

// Read and parse the mapping file
const mappingContent = await Deno.readTextFile(inputArgs.mappingFile);
const maintainerMapping: MaintainerMapping = JSON.parse(mappingContent);

// Read the flags from the source directory
const projPath = `./data/source/project/${inputArgs.projKey}`;
const flagsDir = `${projPath}/flags`;

// Get list of all flag files
const flagFiles: string[] = [];
for await (const dirEntry of Deno.readDir(flagsDir)) {
  if (dirEntry.isFile && dirEntry.name.endsWith(".json")) {
    flagFiles.push(dirEntry.name);
  }
}

console.log(`Found ${flagFiles.length} flags to process`);

// Process each flag
for (const flagFile of flagFiles) {
  const flagKey = flagFile.replace(".json", "");
  const flagContent = await Deno.readTextFile(`${flagsDir}/${flagFile}`);
  const flagData: FlagData = JSON.parse(flagContent);

  // Check if the flag has a maintainerId that needs to be updated
  if (flagData.maintainerId) {
    const oldMaintainerId = flagData.maintainerId;
    const newMaintainerId = maintainerMapping[flagData.maintainerId] ?? null;

    console.log(
      `Updating maintainer for flag ${flagKey}: ${oldMaintainerId} -> ${newMaintainerId}`
    );

    // Update the maintainerId
    flagData.maintainerId = newMaintainerId;

    // Update the local file
    await Deno.writeTextFile(
      `${flagsDir}/${flagFile}`,
      JSON.stringify(flagData, null, 2)
    );
  }
}

console.log("Finished updating maintainer IDs in local files");
