> [!CAUTION]
> This repository is no longer maintained. Please use <a href="https://github.com/launchdarkly-labs/ld-migration-scripts">@launchdarkly-labs/ld-migration-scripts</a> instead.

# Project Migrator

A tool for migrating LaunchDarkly projects, including flags, segments, and
environments.

## Project Structure

```
project-migrator-script/
├── src/                    # Source code
│   ├── scripts/           # Main migration scripts
│   ├── utils/             # Utility functions
│   └── types/             # TypeScript type definitions
├── config/                # Configuration files
├── data/                  # Data directory
│   ├── source/           # Downloaded source project data
│   └── mappings/         # Mapping files (e.g., maintainer IDs)
└── .vscode/              # VS Code settings
```

## Prerequisites

- [Deno](https://deno.land/) installed
  - If you use Homebrew: `brew install deno`
- LaunchDarkly API key with appropriate permissions

## Quick Start

1. **Download Source Project Data**
   ```bash
   # Using deno task (recommended)
   deno task start -p SOURCE_PROJECT_KEY -k API_KEY

   # Or using deno run directly
   deno run --allow-net --allow-read --allow-write src/scripts/source.ts -p SOURCE_PROJECT_KEY -k API_KEY
   ```

2. **(Optional) Update Maintainer IDs**

   Member accounts across different LaunchDarkly instances will have different
   IDs. To properly assign maintainers in the destination project, you must
   first create a mapping between the old and new maintainer IDs.

   ```bash
   # 1. Create mapping file in data/mappings/maintainer_mapping.json
   # Example mapping file:
   {
     "old-maintainer-id-1": "new-maintainer-id-1",
     "old-maintainer-id-2": "new-maintainer-id-2"
   }

   # 2. Run update script to apply the mapping
   deno task update-maintainers -p SOURCE_PROJECT_KEY -m data/mappings/maintainer_mapping.json
   ```

3. **Migrate Project**
   ```bash
   # Using deno task (recommended)
   # If you've created a maintainer mapping and want to assign maintainers:
   deno task migrate -p SOURCE_PROJECT_KEY -d DESTINATION_PROJECT_KEY -k API_KEY -m

   # If you haven't created a maintainer mapping, omit the -m flag:
   deno task migrate -p SOURCE_PROJECT_KEY -d DESTINATION_PROJECT_KEY -k API_KEY
   ```

For more information about using Deno tasks, see
[Using Deno Tasks](#using-deno-tasks) below.

## Using Deno Tasks

The project includes predefined Deno tasks for easier execution. These tasks are
configured in `deno.json` and include all necessary permissions.

### Available Tasks

```json
{
  "tasks": {
    "start": "deno run --allow-net --allow-read --allow-write src/scripts/source.ts",
    "update-maintainers": "deno run --allow-read --allow-write src/scripts/update_maintainers.ts",
    "migrate": "deno run --allow-net --allow-read --allow-write src/scripts/migrate.ts"
  }
}
```

### Task Descriptions

1. **start**: Downloads all project data (flags, segments, environments) from
   the source project
   - Requires network access for API calls
   - Requires file system access to save downloaded data
   - Creates directory structure in `data/source/project/`

2. **update-maintainers**: Updates maintainer IDs in local flag files
   - Requires file system access to read and write flag files
   - Uses mapping file from `data/mappings/maintainer_mapping.json`
   - Must be run before migration if you want to assign maintainers

3. **migrate**: Creates a new project with all components
   - Requires network access for API calls
   - Requires file system access to read source data
   - Creates new project with all flags, segments, and environments
   - Can optionally assign maintainers if mapping was done

### Task Permissions

Each task includes the necessary permissions:

- `--allow-net`: Required for API calls to LaunchDarkly
- `--allow-read`: Required for reading local files
- `--allow-write`: Required for writing downloaded data

These permissions are automatically included in the task definitions, so you
don't need to specify them manually.

## Detailed Usage

### 1. Download Source Project Data

Downloads all project data to `data/source/project/SOURCE_PROJECT_KEY/`:

```bash
deno task start -p SOURCE_PROJECT_KEY -k API_KEY
```

### 2. Update Maintainer IDs (Optional)

Create a mapping file at `data/mappings/maintainer_mapping.json`:

```json
{
  "old-maintainer-id-1": "new-maintainer-id-1",
  "old-maintainer-id-2": "new-maintainer-id-2"
}
```

Update maintainer IDs in local files:

```bash
deno task update-maintainers -p SOURCE_PROJECT_KEY -m data/mappings/maintainer_mapping.json
```

### 3. Migrate Project

Creates a new project with all components:

```bash
# If you've created a maintainer mapping and want to assign maintainers:
deno task migrate -p SOURCE_PROJECT_KEY -d DESTINATION_PROJECT_KEY -k API_KEY -m

# If you haven't created a maintainer mapping, omit the -m flag:
deno task migrate -p SOURCE_PROJECT_KEY -d DESTINATION_PROJECT_KEY -k API_KEY
```

## Command Line Arguments

### source.ts

- `-p, --projKey`: Source project key
- `-k, --apikey`: LaunchDarkly API key
- `-u, --domain`: (Optional) LaunchDarkly domain, defaults to
  "app.launchdarkly.com"

### update_maintainers.ts

- `-p, --projKey`: Project key
- `-m, --mappingFile`: Path to the maintainer ID mapping file

### migrate.ts

- `-p, --projKeySource`: Source project key
- `-d, --projKeyDest`: Destination project key
- `-k, --apikey`: LaunchDarkly API key
- `-u, --domain`: (Optional) LaunchDarkly domain, defaults to
  "app.launchdarkly.com"
- `-m, --assignMaintainerIds`: (Optional) Whether to assign maintainer IDs from
  source project, defaults to false. Requires maintainer mapping to be done
  first.

## Important Notes

- Maintainer IDs cannot be directly preserved between different LaunchDarkly
  instances
- You must create a mapping between old and new maintainer IDs before using the
  `-m` flag
- The update_maintainers.ts script must be run before migration if you want to
  assign maintainers
- Test the migration in a non-production environment first
- The destination project must not exist before migration
- Maximum 20 environments per project
- Monitor for 400 errors in flag configurations

## Known Issues

- TypeScript types are loose due to API client limitations
- Importing LaunchDarkly API TypeScript types causes import errors
- Rate limiting may affect flag configuration updates

## Things you Should Consider when migrating flags?

- What can you scope down? Do all the flags need to moved over or can we use
  this as a way to clean up the environment?
- Do all my environments need to go? or maybe just a few?
- Am I able to stop edits in the destination project? This script does not keep
  them in sync, so if changes need to be made they should be prior
- Who is going to run it and how? The calls can take a while, with rate limits,
  so should I run it on an EC2 or the like?
- If I have thousands or even hundreds of updates: what is critical, how will I
  verify the changes are correct?
- Have you created a mapping between old and new maintainer IDs? Without this
  mapping, you cannot assign maintainers in the destination project.
