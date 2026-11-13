# Repository Guidelines

## Project Structure & Module Organization

This repository contains planning documentation and role C's shared contracts, synthetic fixtures, and contract tests for Team 15’s ENDPoinT 2026 hackathon campus notice app. The Expo application and AI Worker have not been scaffolded.

- `README.md`: team and project identification.
- `docs/campus_notice_hackathon_plan.md`: product scope, workflows, and delivery checklist.
- `docs/campus_notice_implementation_design.md`: proposed architecture, data contracts, and validation cases.
- `docs/campus_notice_c_startup_plan.md`: role C's implementation sequence, handoff requirements, and current scope.
- `shared/`: Zod contracts, input mapping, and content canonicalization.
- `fixtures/synthetic/`: explicitly fictional notices and API responses.
- `tests/`: contract and canonicalization tests.

The design proposes Expo/TypeScript screens in `app/`, application logic in `src/`, and an AI proxy in `worker/`. Treat those as planned paths; `shared/` and `fixtures/` now exist. Keep SQL, HTML parsing, and AI SDK calls out of screens; isolate eligibility and date calculations as pure functions.

## Build, Test, and Development Commands

The root package provides contract checks only. No application development or deployment build command exists yet.

- `npm ci`: install locked dependencies.
- `npm run check`: run strict TypeScript checks, Node tests through tsx, and Prettier checks.
- `npm test`: run `tests/*.test.ts`.
- `npm run format`: format the shared scaffold and its documentation.

- `rg --files`: inspect available repository files.
- `git diff --check`: check tracked changes for whitespace errors.
- `git diff -- docs/`: review changes to tracked planning documents; use `git status --short` to identify new files separately.

When scaffolding the app or Worker, document exact installation, development, build, and test commands in `README.md`.

## Coding Style & Naming Conventions

Preserve the existing Korean prose and numbered headings when editing planning documents. Use fenced code blocks with language labels and descriptive snake_case Markdown filenames, matching `campus_notice_implementation_design.md`.

Use strict TypeScript and Prettier with two-space indentation, single quotes, and trailing commas. A separate ESLint configuration has not been added. Follow proposed names such as `NoticeCard` for components and `reminderReconciler` for services.

## Testing Guidelines

Use Node's test runner with `*.test.ts` filenames and descriptive behavior names. No coverage threshold is established. Use the implementation design’s section 13 validation matrix as the initial acceptance checklist. Prioritize eligibility, date handling, cache invalidation, checklist preservation, and reminder reconciliation. Verify parsers with real HTML fixtures and persistence and notification cancellation on a real device; synthetic fixtures are not evidence of live collection or device behavior.

## Commit & Pull Request Guidelines

History contains only `Initial commit`; no commit convention is established. Use concise, imperative subjects and focused commits. PRs should describe the change, reference relevant design sections or issues, and report validation performed. Include screenshots for UI changes and explain deviations from the documented design.

## Security & Configuration

Keep AI keys and demo tokens out of source code and public environment variables. The proposed design stores server secrets in Worker configuration and device tokens in SecureStore.
