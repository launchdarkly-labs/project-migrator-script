# Project Migrator 

### Requirements

- You must have Deno installeds


### Considerations

- These scripts (migrate and source) are supported strictly as is and LD support cannot be expected for help running this

### Known Issues

- Bug with 429 rate limiting. The request that is rate limited will still fail
  but subsequent requests work
- Importing LD API typescript types causes an import error so are commented out
  in various spots
- Types in generally are very loose which Deno is not happy about but it runs as
  JavaScript overall compared to validating the TypeScript first
- Due to the current API configuration, the environments count for a given project tops at 20 environments for a single project
- Due to considerations around many API requests at once - monitor 400 errors for flag configurations that may not be up to date
- To Avoid a race condition, a few waits have been placed in the script

### Sourcing data

The data will be written out to a newly created
`source/project/<source-project-key>` directory

```
deno run --allow-env --allow-read --allow-net --allow-write source.ts -p <SOURCE PROJECT> -k <LD API KEY>

```

### Migrating data

The data will be read out of the previously created
`source/project/<source-project-key>` directory. The script will use the
`DESTINATION PROJECT` as the key to use as part of the API request path when
sending the POSTs and PATCHs.

```
deno run --allow-env --allow-read --allow-net --allow-write migrate.ts -p <SOURCE PROJECT> -k <LD API KEY> -d <DESTINATION PROJECT>

```

### Pointing to a different instance

Pass in the `-u` argument with the domain of the other instance. It will default
to `app.launchdarkly.com`.
