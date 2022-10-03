# Project Migrator

### Requirements

- You must have [Deno](https://deno.land/) installed. If you use Homebrew, run `brew install deno`.


### Considerations

- These scripts, `migrate.ts` and `source.ts`, are provided strictly as-is. LaunchDarkly Support cannot help run this.

### Known issues

- Bug with 429 rate limiting. The rate-limited request will still fail,
  but subsequent requests will work.
- Importing LD API TypeScript types causes an import error, so they are commented out
  in various spots.
- Types in general are very loose, which Deno is not happy about. The scripts run as
  JavaScript overall instead of validating the TypeScript first.
- Due to the current API configuration, you cannot have more than 20 environments in a single project.
- Due to considerations around many API requests at once, monitor 400 errors for flag configurations that may not be up to date.
- To avoid a race condition, a few `wait`s have been placed in the script.

### Sourcing data

First, export your source data. The `source.ts` script writes the data to a newly created
`source/project/<source-project-key>` directory.

Here's how to export your source data:

```
deno run --allow-env --allow-read --allow-net --allow-write source.ts -p <SOURCE PROJECT KEY> -k <SOURCE LD API KEY>

```

### Migrating data

Then, migrate the source data to the destination project. The `migrate.ts` script reads the source data out of the previously created `source/project/<source-project-key>` directory. Then it uses the
`DESTINATION PROJECT` as the project key, and updates the destination project using a series of `POST`s and `PATCH`s.

Here's how to migrate the source data to your destination project:

```
deno run --allow-env --allow-read --allow-net --allow-write migrate.ts -p <SOURCE PROJECT KEY> -k <DESTINATION LD API KEY> -d <DESTINATION PROJECT KEY>

```

### Pointing to a different instance

Pass in the `-u` argument with the domain of the other instance. By default, these scripts apply to your projects on `app.launchdarkly.com`.
