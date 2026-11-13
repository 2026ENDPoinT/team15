# Repository Guidelines

## Project Structure & Module Organization

This repository currently contains planning documentation for Team 15’s ENDPoinT 2026 hackathon campus notice app; application code, tests, and assets have not been added.

- `README.md`: team and project identification.
- `docs/campus_notice_hackathon_plan.md`: product scope, workflows, and delivery checklist.
- `docs/campus_notice_implementation_design.md`: proposed architecture, data contracts, and validation cases.

The design proposes Expo/TypeScript screens in `app/`, application logic in `src/`, shared Zod contracts in `shared/`, an AI proxy in `worker/`, and sample data in `fixtures/`. Treat these as planned paths. Keep SQL, HTML parsing, and AI SDK calls out of screens; isolate eligibility and date calculations as pure functions.

## Build, Test, and Development Commands

No package manifest, build scripts, test runner, or local application command exists yet. Do not assume `npm test` or `npm run dev` works.

- `rg --files`: inspect available repository files.
- `git diff --check`: check tracked changes for whitespace errors.
- `git diff -- docs/`: review changes to tracked planning documents; use `git status --short` to identify new files separately.

When scaffolding the app or Worker, document exact installation, development, build, and test commands in `README.md`.

## Coding Style & Naming Conventions

Preserve the existing Korean prose and numbered headings when editing planning documents. Use fenced code blocks with language labels and descriptive snake_case Markdown filenames, matching `campus_notice_implementation_design.md`.

No formatter, linter, or code indentation policy is configured. Establish these with the initial TypeScript scaffold. Follow proposed names such as `NoticeCard` for components and `reminderReconciler` for services.

## Testing Guidelines

No test framework or coverage threshold is established. Use the implementation design’s section 13 validation matrix as the initial acceptance checklist. Prioritize eligibility, date handling, cache invalidation, checklist preservation, and reminder reconciliation. Verify parsers with HTML fixtures and persistence and notification cancellation on a real device. Define test naming and execution commands when adding the runner.

## Commit & Pull Request Guidelines

History contains only `Initial commit`; no commit convention is established. Use concise, imperative subjects and focused commits. PRs should describe the change, reference relevant design sections or issues, and report validation performed. Include screenshots for UI changes and explain deviations from the documented design.

## Security & Configuration

Keep AI keys and demo tokens out of source code and public environment variables. The proposed design stores server secrets in Worker configuration and device tokens in SecureStore.
