import yargs from "https://deno.land/x/yargs@v17.7.2-deno/deno.ts";
import {
  // ensureDir,
  ensureDirSync,
} from "https://deno.land/std@0.149.0/fs/mod.ts";
import {
  consoleLogger,
  delay,
  ldAPIRequest,
  rateLimitRequest,
  writeSourceData,
} from "../utils/utils.ts";

interface Arguments {
  projKey: string;
  apikey: string;
  domain: string;
}

const inputArgs: Arguments = yargs(Deno.args)
  .alias("p", "projKey")
  .alias("k", "apikey")
  .alias("u", "domain")
  .default("u", "app.launchdarkly.com")
  .parse() as Arguments;

// ensure output directory exists
const projPath = `./data/source/project/${inputArgs.projKey}`;
ensureDirSync(projPath);

// Project Data //
const projResp = await rateLimitRequest(
  ldAPIRequest(
    inputArgs.apikey,
    inputArgs.domain,
    `projects/${inputArgs.projKey}?expand=environments`
  ),
  "project"
);
if (projResp == null) {
  console.log("Failed getting project");
  Deno.exit(1);
}
const projData = await projResp.json();

await writeSourceData(projPath, "project", projData);

// Segment Data //

if (projData.environments.items.length > 0) {
  console.log(`Found ${projData.environments.items.length} environments`);

  projData.environments.items.forEach(async (env: any) => {
    console.log(`Getting Segments for environment: ${env.key}`);

    const segmentResp = await fetch(
      ldAPIRequest(
        inputArgs.apikey,
        inputArgs.domain,
        `segments/${inputArgs.projKey}/${env.key}?limit=50`
      )
    );
    if (segmentResp == null) {
      console.log("Failed getting Segments");
      Deno.exit(1);
    }
    const segmentData = await segmentResp.json();

    await writeSourceData(projPath, `segment-${env.key}`, segmentData);
    const end = Date.now() + 2_000;
    while (Date.now() < end);
  });
}

// Get List of all Flags
const pageSize: number = 5;
let offset: number = 0;
let moreFlags: boolean = true;
const flags: string[] = [];
let path = `flags/${inputArgs.projKey}?summary=true&limit=${pageSize}&offset=${offset}`;

while (moreFlags) {
  console.log(`Building flag list: ${offset} to ${offset + pageSize}`);

  const flagsResp = await rateLimitRequest(
    ldAPIRequest(inputArgs.apikey, inputArgs.domain, path),
    "flags"
  );

  if (flagsResp.status > 201) {
    consoleLogger(flagsResp.status, `Error getting flags: ${flagsResp.status}`);
    consoleLogger(flagsResp.status, await flagsResp.text());
  }
  if (flagsResp == null) {
    console.log("Failed getting Flags");
    Deno.exit(1);
  }

  const flagsData = await flagsResp.json();

  flags.push(...flagsData.items.map((flag: any) => flag.key));

  if (flagsData._links.next) {
    offset += pageSize;
    path = `flags/${inputArgs.projKey}?summary=true&limit=${pageSize}&offset=${offset}`;
  } else {
    moreFlags = false;
  }
}

console.log(`Found ${flags.length} flags`);

await writeSourceData(projPath, "flags", flags);

// Get Individual Flag Data //
ensureDirSync(`${projPath}/flags`);

for (const [index, flagKey] of flags.entries()) {
  console.log(`Getting flag ${index + 1} of ${flags.length}: ${flagKey}`);

  await delay(200);

  const flagResp = await fetch(
    ldAPIRequest(
      inputArgs.apikey,
      inputArgs.domain,
      `flags/${inputArgs.projKey}/${flagKey}`
    )
  );
  if (flagResp.status > 201) {
    consoleLogger(
      flagResp.status,
      `Error getting flag '${flagKey}': ${flagResp.status}`
    );
    consoleLogger(flagResp.status, await flagResp.text());
  }
  if (flagResp == null) {
    console.log("Failed getting flag '${flagKey}'");
    Deno.exit(1);
  }

  const flagData = await flagResp.json();

  await writeSourceData(`${projPath}/flags`, flagKey, flagData);
}
