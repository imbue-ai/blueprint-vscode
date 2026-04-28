# Plan File Paths

Plan files are organized as `blueprint/<feature>/<template-filename>`.

## Features

A "feature" is a subdirectory under `blueprint/` (the `SPEC_DIR` constant in `core/featureManager.ts`). Each new plan gets its own feature directory generated via AI slug generation.

`generateFeatureSlug()` forks the writing session and asks Claude for a 2-5 word kebab-case name, sanitizes it, and deduplicates against existing feature dirs.

- **Fallback**: `feature-{timestamp}` if the Claude call fails (any non-rate-limit error).
- **Deduplication**: appends `-2`, `-3`, etc. if a directory with that name already exists.

`sanitizeSlug` lowercases, strips anything outside `[a-z0-9-]`, collapses consecutive dashes, trims leading/trailing dashes, and caps at 50 characters.

## Template Filename

Each `PromptTemplate` carries a `filename` field (e.g. `plan.md`, `api-design.md`). The plan is placed at `blueprint/<feature>/<filename>`.

Because feature slugs are deduplicated before the path is built, target paths are always fresh (no risk of overwriting an existing plan).

## File Lifecycle

- Plan files are created in `blueprint/<feature>/<filename>` and are **not** gitignored
- On reload or new plan, the provider's current path is cleared but the file stays on disk
- The `blueprint/` directory and feature subdirectories are created on demand

## Path Management

`SpecFileSystemProvider` is the single source of truth for the current plan file path. All modules get the path from the provider rather than using hardcoded constants.

Key methods:
- `setSpecFile(relPath)` — sets or clears the active plan path
- `getSpecUri()` — custom-scheme URI or `null`
