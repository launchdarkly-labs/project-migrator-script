# Account Migrator 

### Requirements

- You must have Deno installed

### Known Issues

- Bug with 429 rate limiting. The request that is rate limited will still fail
  but subsequent requests work
- Importing LD API typescript types causes an import error so are commented out
  in various spots
- Types in generally are very loose which Deno is not happy about but it runs as
  JavaScript overall compared to validating the TypeScript first

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
