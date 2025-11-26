import * as Colors from "https://deno.land/std/fmt/colors.ts";

const apiVersion = "20240415";

export async function getJson(filePath: string) {
  try {
    return JSON.parse(await Deno.readTextFile(filePath));
  } catch (e) {
    console.log(filePath + ": " + e.message);
  }
}

export async function delay(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

function calculateRateLimitDelay(response: Response): number {
  const now = Date.now();
  const retryAfterHeader = response.headers.get('retry-after');
  const rateLimitResetHeader = response.headers.get('x-ratelimit-reset');

  let retryAfter = 0;
  let rateLmitReset = 0;

  if (retryAfterHeader) {
    retryAfter = parseInt(retryAfterHeader, 10) * 1000; // Convert to ms
  }

  if (rateLimitResetHeader) {
    const resetTime = parseInt(rateLimitResetHeader, 10);
    rateLmitReset = resetTime - now;
  }
                          
  const delay = Math.max(retryAfter, rateLmitReset);

  // add random jitter
  const jitter = Math.floor(Math.random() * 100);
  return delay + jitter;
}

export async function rateLimitRequest(req: Request, path: String) {
  const rateLimitReq = req.clone();
  const res = await fetch(req);
  let newRes = res;
  if (res.status == 409 && path == `projects`) {
    console.warn(Colors.yellow(`It looks like this project has already been created in the destination`));
    console.warn(Colors.yellow(`To avoid errors and possible overwrite, please either:`));
    console.warn(Colors.yellow(`Update your name to a new one, or delete the existing project in the destination instance`));
    Deno.exit(1);
  }
  if (res.status == 429) {
    const delay = calculateRateLimitDelay(res);
    console.log(`Rate Limited for ${req.url} for ${delay}ms`);
    await new Promise((resolve) => setTimeout(resolve, delay));
    console.log(`Making new request for request ${req.url}`);
    newRes = await rateLimitRequest(rateLimitReq, path);
  }

  return newRes;
}

export function ldAPIPostRequest(
  apiKey: string,
  domain: string,
  path: string,
  body: any,
) {
  const req = new Request(
    `https://${domain}/api/v2/${path}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        'User-Agent': 'Project-Migrator-Script',
        "Authorization": apiKey,
        "LD-API-Version": apiVersion,
      },
      body: JSON.stringify(body),
    },
  );
  return req;
}

export function ldAPIPatchRequest(
  apiKey: string,
  domain: string,
  path: string,
  body: any,
) {
  const req = new Request(
    `https://${domain}/api/v2/${path}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": apiKey,
        "LD-API-Version": apiVersion,
      },
      body: JSON.stringify(body),
    },
  );

  return req;
}

export function buildPatch(key: string, op: string, value: any) {
  return {
    path: "/" + key,
    op,
    value,
  };
}

export function buildRules(
  rules: any,
  env?: string,
): { path: string; op: string; value: any }[] {
  const newRules: { path: string; op: string; value: any }[] = [];
  const path = env ? `${env}/rules/-` : "rules/-";
  rules.map(({ clauses, _id, generation, deleted, version, ref, ...rest }) => {
    const newRule = rest;
    const newClauses = { clauses: clauses.map(({ _id, ...rest }) => rest) };
    Object.assign(newRule, newClauses);
    newRules.push(buildPatch(path, "add", newRule));
  });

  return newRules;
}

export async function writeSourceData(
  projPath: string,
  dataType: string,
  data: any,
) {
  return await writeJson(`${projPath}/${dataType}.json`, data);
}

export function ldAPIRequest(apiKey: string, domain: string, path: string) {
  const req = new Request(
    `https://${domain}/api/v2/${path}`,
    {
      headers: {
        "Authorization": apiKey,
        'User-Agent': 'launchdarkly-project-migrator-script',
        "LD-API-Version": apiVersion,
      },
    },
  );

  return req;
}

async function writeJson(filePath: string, o: any) {
  try {
    await Deno.writeTextFile(filePath, JSON.stringify(o, null, 2));
  } catch (e) {
    console.log(e);
  }
}

export function consoleLogger(status: number, message: string) {
  if (status > 201 && status != 429) {
    return console.warn(Colors.yellow(message));
  }

  return console.log(message);
}
