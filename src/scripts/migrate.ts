// deno-lint-ignore-file no-explicit-any
import yargs from "https://deno.land/x/yargs@v17.7.2-deno/deno.ts";
import {
  buildPatch,
  buildRules,
  consoleLogger,
  getJson,
  ldAPIPatchRequest,
  ldAPIPostRequest,
  rateLimitRequest,
  // delay
} from "../utils/utils.ts";
import * as Colors from "https://deno.land/std@0.149.0/fmt/colors.ts";

interface Arguments {
  projKeySource: string;
  projKeyDest: string;
  apikey: string;
  domain: string;
  assignMaintainerIds: boolean;
}

const inputArgs: Arguments = (yargs(Deno.args)
  .alias("p", "projKeySource")
  .alias("d", "projKeyDest")
  .alias("k", "apikey")
  .alias("u", "domain")
  .alias("m", "assignMaintainerIds")
  .default("u", "app.launchdarkly.com")
  .default("m", false)
  .demandOption(["p", "d", "k"])
  .parse() as unknown) as Arguments;

// Project Data //
const projectJson = await getJson(
  `./data/source/project/${inputArgs.projKeySource}/project.json`,
);

const buildEnv: Array<any> = [];

projectJson.environments.items.forEach((env: any) => {
  const newEnv: any = {
    name: env.name,
    key: env.key,
    color: env.color,
  };

  if (env.defaultTtl) newEnv.defaultTtl = env.defaultTtl;
  if (env.confirmChanges) newEnv.confirmChanges = env.confirmChanges;
  if (env.secureMode) newEnv.secureMode = env.secureMode;
  if (env.defaultTrackEvents) newEnv.defaultTrackEvents = env.defaultTrackEvents;
  if (env.tags) newEnv.tags = env.tags;

  buildEnv.push(newEnv);
});

const envkeys: Array<string> = buildEnv.map((env: any) => env.key);

const projRep = projectJson; //as Project
const projPost: any = {
  key: inputArgs.projKeyDest,
  name: inputArgs.projKeyDest,  // Optional TODO: convert the target project key to a human-friendly project name
  tags: projRep.tags,
  environments: buildEnv,
}; //as ProjectPost

if (projRep.defaultClientSideAvailability) {
  projPost.defaultClientSideAvailability = projRep.defaultClientSideAvailability;
} else {
  projPost.includeInSnippetByDefault = projRep.includeInSnippetByDefault;
}

const projResp = await rateLimitRequest(
  ldAPIPostRequest(inputArgs.apikey, inputArgs.domain, `projects`, projPost),
  'projects'
);

consoleLogger(
  projResp.status,
  `Creating Project: ${inputArgs.projKeyDest} Status: ${projResp.status}`,
);
await projResp.json();

for (const env of projRep.environments.items) {
  const segmentData = await getJson(
    `./data/source/project/${inputArgs.projKeySource}/segment-${env.key}.json`,
  );

  // We are ignoring big segments/synced segments for now
  for (const segment of segmentData.items) {
    if (segment.unbounded == true) {
      console.log(Colors.yellow(
        `Segment: ${segment.key} in Environment ${env.key} is unbounded, skipping`,
      ));
      continue;
    }

    const newSegment: any = {
      name: segment.name,
      key: segment.key,
    };

    if (segment.tags) newSegment.tags = segment.tags;
    if (segment.description) newSegment.description = segment.description;

    const post = ldAPIPostRequest(
      inputArgs.apikey,
      inputArgs.domain,
      `segments/${inputArgs.projKeyDest}/${env.key}`,
      newSegment,
    )

    const segmentResp = await rateLimitRequest(
      post,
      'segments'
    );

    const segmentStatus = await segmentResp.status;
    consoleLogger(
      segmentStatus,
      `Creating segment ${newSegment.key} status: ${segmentStatus}`,
    );
    if (segmentStatus > 201) {
      console.log(JSON.stringify(newSegment));
    }

    // Build Segment Patches //
    const sgmtPatches = [];

    if (segment.included?.length > 0) {
      sgmtPatches.push(buildPatch("included", "add", segment.included));
    }
    if (segment.excluded?.length > 0) {
      sgmtPatches.push(buildPatch("excluded", "add", segment.excluded));
    }

    if (segment.rules?.length > 0) {
      console.log(`Copying Segment: ${segment.key} rules`);
      sgmtPatches.push(...buildRules(segment.rules));
    }

    const patchRules = await rateLimitRequest(
      ldAPIPatchRequest(
        inputArgs.apikey,
        inputArgs.domain,
        `segments/${inputArgs.projKeyDest}/${env.key}/${newSegment.key}`,
        sgmtPatches,
      ),
      'segments'
    );

    const segPatchStatus = patchRules.statusText;
    consoleLogger(
      patchRules.status,
      `Patching segment ${newSegment.key} status: ${segPatchStatus}`,
    );
  };
};

// Flag Data //
const flagList: Array<string> = await getJson(
  `./data/source/project/${inputArgs.projKeySource}/flags.json`,
);

const flagsDoubleCheck: string[] = [];

interface Variation {
  _id: string;
  value: any;
  name?: string;
  description?: string;
}

// Creating Global Flags //
for (const [index, flagkey] of flagList.entries()) {

  // Read flag
  console.log(`Reading flag ${index + 1} of ${flagList.length} : ${flagkey}`);

  const flag = await getJson(
    `./data/source/project/${inputArgs.projKeySource}/flags/${flagkey}.json`,
  );

  const newVariations = flag.variations.map(({ _id, ...rest }: Variation) => rest);

  const newFlag: any = {
    key: flag.key,
    name: flag.name,
    variations: newVariations,
    temporary: flag.temporary,
    tags: flag.tags,
    description: flag.description,
    maintainerId: null  // Set to null by default to prevent API from assigning token owner
  };

  // Only assign maintainerId if explicitly requested and mapping exists
  if (inputArgs.assignMaintainerIds && flag.maintainerId) {
    newFlag.maintainerId = flag.maintainerId;
    console.log(`\tPreserving maintainer: ${flag.maintainerId} for flag: ${flag.key}`);
  } else {
    // Ensure maintainerId is null if no mapping or not requested
    newFlag.maintainerId = null;
    console.log(`\tNo maintainer assigned for flag: ${flag.key}`);
  }

  if (flag.clientSideAvailability) {
    newFlag.clientSideAvailability = flag.clientSideAvailability;
  } else if (flag.includeInSnippet) {
    newFlag.includeInSnippet = flag.includeInSnippet;
  }
  if (flag.customProperties) {
    newFlag.customProperties = flag.customProperties;
  }

  if (flag.defaults) {
    newFlag.defaults = flag.defaults;
  }

  console.log(
    `\tCreating flag: ${flag.key} in Project: ${inputArgs.projKeyDest}`,
  );
  const flagResp = await rateLimitRequest(
    ldAPIPostRequest(
      inputArgs.apikey,
      inputArgs.domain,
      `flags/${inputArgs.projKeyDest}`,
      newFlag,
    ),
    'flags'
  );
  if (flagResp.status == 200 || flagResp.status == 201) {
    console.log("\tFlag created");
  } else {
    console.log(`Error for flag ${newFlag.key}: ${flagResp.status}`);
    const errorText = await flagResp.text();
    console.log(`Error details: ${errorText}`);
    console.log(`Request payload: ${JSON.stringify(newFlag, null, 2)}`);
  }

  // Add flag env settings
  for (const env of envkeys) {
    const patchReq: any[] = [];
    const flagEnvData = flag.environments[env];
    const parsedData: Record<string, string> = Object.keys(flagEnvData)
      .filter((key) => !key.includes("salt"))
      .filter((key) => !key.includes("version"))
      .filter((key) => !key.includes("lastModified"))
      .filter((key) => !key.includes("_environmentName"))
      .filter((key) => !key.includes("_site"))
      .filter((key) => !key.includes("_summary"))
      .filter((key) => !key.includes("sel"))
      .filter((key) => !key.includes("access"))
      .filter((key) => !key.includes("_debugEventsUntilDate"))
      .filter((key) => !key.startsWith("_"))
      .filter((key) => !key.startsWith("-"))
      .reduce((cur, key) => {
        return Object.assign(cur, { [key]: flagEnvData[key] });
      }, {});


    Object.keys(parsedData)
      .map((key) => {
        if (key == "rules") {
          patchReq.push(...buildRules(parsedData[key], "environments/" + env));
        } else {
          patchReq.push(
            buildPatch(
              `environments/${env}/${key}`,
              "replace",
              parsedData[key],
            ),
          );

        }
      });
    await makePatchCall(flag.key, patchReq, env);

    console.log(`\tFinished patching flag ${flagkey} for env ${env}`);
  }

}

// Send one patch per Flag for all Environments //
const envList: string[] = [];
projectJson.environments.items.forEach((env: any) => {
  envList.push(env.key);
});

// The # of patch calls is the # of environments * flags,
// if you need to limit run time, a good place to start is to only patch the critical environments in a shorter list
//const envList: string[] = ["test"];


async function makePatchCall(flagKey: string, patchReq: any[], env: string) {
  const patchFlagReq = await rateLimitRequest(
    ldAPIPatchRequest(
      inputArgs.apikey,
      inputArgs.domain,
      `flags/${inputArgs.projKeyDest}/${flagKey}`,
      patchReq,
    ),
    'flags'
  );
  const flagPatchStatus = await patchFlagReq.status;
  if (flagPatchStatus > 200) {
    flagsDoubleCheck.push(flagKey)
    consoleLogger(
      flagPatchStatus,
      `\tPatching ${flagKey} with environment [${env}] specific configuration, Status: ${flagPatchStatus}`,
    );
  }

  if (flagPatchStatus == 400) {
    console.log(patchFlagReq)
  }

  consoleLogger(
    flagPatchStatus,
    `\tPatching ${flagKey} with environment [${env}] specific configuration, Status: ${flagPatchStatus}`,
  );

  return flagsDoubleCheck;
}

if (flagsDoubleCheck.length > 0) {
  console.log("There are a few flags to double check as they have had an error or warning on the patch")
  flagsDoubleCheck.forEach((flag) => {
    console.log(` - ${flag}`)
  });
}
