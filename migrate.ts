// deno-lint-ignore-file no-explicit-any
import yargs from "https://cdn.deno.land/yargs/versions/yargs-v16.2.1-deno/raw/deno.ts";
import {
  buildPatch,
  buildRules,
  consoleLogger,
  getJson,
  ldAPIPatchRequest,
  ldAPIPostRequest,
  rateLimitRequest,
  delay
} from "./utils.ts";
import * as Colors from "https://deno.land/std/fmt/colors.ts";

// Uncommented these give an import error due to axios
// import {
//   EnvironmentPost,
//   Project,
//   ProjectPost,
//   FeatureFlagBody
// } from "https://github.com/launchdarkly/api-client-typescript/raw/main/api.ts";

interface Arguments {
  projKeySource: string;
  projKeyDest: string;
  apikey: string;
  domain: string;
}

let inputArgs: Arguments = yargs(Deno.args)
  .alias("p", "projKeySource")
  .alias("d", "projKeyDest")
  .alias("k", "apikey")
  .alias("u", "domain")
  .default("u", "app.launchdarkly.com").argv;

// Project Data //
const projectJson = await getJson(
  `./source/project/${inputArgs.projKeySource}/project.json`,
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

await Promise.all(projRep.environments.items.map(async (env: any) => {
  const segmentData = await getJson(
    `./source/project/${inputArgs.projKeySource}/segment-${env.key}.json`,
  );
  
  // We are ignoring big segments/synced segments for now
  await Promise.all(segmentData.items.map(async (segment: any) => {
    if (segment.unbounded == true) {
      console.log(Colors.yellow(
        `Segment: ${segment.key} in Environment ${env.key} is unbounded, skipping`,
      ));
      return;
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
    );

    const segPatchStatus = await patchRules.statusText;
    consoleLogger(
      segPatchStatus,
      `Patching segment ${newSegment.key} status: ${segPatchStatus}`,
    );
  }));
}));

// Flag Data //

const flagData = await getJson(
  `./source/project/${inputArgs.projKeySource}/flag.json`,
);

// Creating Global Flags //
for await (const flag of flagData.items) {
  const newVariations = flag.variations.map(({ _id, ...rest }) => rest);

  const newFlag: any = {
    key: flag.key,
    name: flag.name,
    variations: newVariations,
    temporary: flag.temporary,
    tags: flag.tags,
    description: flag.description
  };

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
    `Creating flag: ${flag.key} in Project: ${inputArgs.projKeyDest}`,
  );
  const flagResp = await rateLimitRequest(
    ldAPIPostRequest(
      inputArgs.apikey,
      inputArgs.domain,
      `flags/${inputArgs.projKeyDest}`,
      newFlag,
    ),
  );
  if (flagResp.status == 200 || flagResp.status == 201) {
    console.log("Flag created");
  } else {
    console.log(`Error for flag ${newFlag.key}: ${flagResp.status}`);
  }
}

// Send one patch per Flag for all Environments //
const envList: string[] = [];
projectJson.environments.items.forEach((env: any) => {
  envList.push(env.key);
});


const flagsDoubleCheck: string[] = [];
var count = 0;

for await (const flag of flagData.items) {
  for await (const env of envList) {
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
      await makePatchCall(flag.key, patchReq, env) 
  }

}

async function makePatchCall(flagKey, patchReq, env){
  const patchFlagReq = await rateLimitRequest(
    ldAPIPatchRequest(
      inputArgs.apikey,
      inputArgs.domain,
      `flags/${inputArgs.projKeyDest}/${flagKey}`,
      patchReq,
    ),
  );
  const flagPatchStatus = await patchFlagReq.status;
  if (flagPatchStatus > 200){
    flagsDoubleCheck.push(flagKey)
    consoleLogger(
      flagPatchStatus,
      `Patching ${flagKey} with environment [${env}] specific configuration, Status: ${flagPatchStatus}`,
    );
  }

  if (flagPatchStatus == 400) {
    console.log(patchFlagReq)
  }
  
  consoleLogger(
    flagPatchStatus,
    `Patching ${flagKey} with environment [${env}] specific configuration, Status: ${flagPatchStatus}`,
  );

  return flagsDoubleCheck;
}

if(flagsDoubleCheck.length > 0) {
  console.log("There are a few flags to double check as they have had an error or warning on the patch")
  flagsDoubleCheck.forEach((flag) => {
    console.log(` - ${flag}`)
  });
}
