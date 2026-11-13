# Repository Guidelines

## Project Structure & Module Organization

This repository contains the T01 Expo application scaffold, T02 live collection adapters, SQLite persistence merged from main, planning documentation, shared contracts, synthetic and real HTML fixtures, and contract/UI tests for Team 15’s ENDPoinT 2026 hackathon campus notice app. The AI Worker and live collection integration into the product screens remain planned. T01 basic flows and T02 Android device verification were confirmed complete by the user on 2026-11-13 before the SQLite merge; that report does not verify the newly merged persistence flow on a device. See the T02 handoff for the scope and evidence.

- `README.md`: team and project identification.
- `docs/campus_notice_hackathon_plan.md`: product scope, workflows, and delivery checklist.
- `docs/campus_notice_implementation_design.md`: proposed architecture, data contracts, and validation cases.
- `docs/campus_notice_c_startup_plan.md`: role C's implementation sequence, handoff requirements, and current scope.
- `shared/`: Zod contracts, input mapping, and content canonicalization.
- `fixtures/synthetic/`: explicitly fictional notices and API responses.
- `tests/`: contract and canonicalization tests.
- `app/`: Expo Router home/discover tabs and shared notice detail.
- `src/`: shared UI, SQLite-backed demo state, collection, and services.
- `src/db/`: migrations and B's notice repository.
- `docs/campus_notice_t01_handoff.md`: app execution, ownership boundaries, and device checks.
- `src/sources/`: board adapters, HTML cleanup, collection, and smoke verification.
- `fixtures/real/`: original public HTML responses and capture metadata.
- `docs/campus_notice_t02_handoff.md`: collection contracts, automated validation, and user-reported device verification.

The AI proxy in `worker/` remains planned. Keep SQL, HTML parsing, and AI SDK calls out of screens; isolate eligibility and date calculations as pure functions. Use B's repository/service boundary for persistence and future collection integration.

## Build, Test, and Development Commands

Use the Node version pinned in `.nvmrc`. The root package provides the Expo development server, bundle exports, and tests; it does not produce an APK yet.

- `npm ci`: install locked dependencies.
- `npm run check`: run strict TypeScript checks, Node tests through tsx, and Prettier checks.
- `npm test`: run `tests/*.test.ts`.
- `npm run format`: format the shared scaffold and its documentation.
- `npm run start`: start Expo for Expo Go.
- `npm run android`: open a configured Android emulator/device.
- `npm run web`: browser preview, not device validation.
- `npm run build:android`: export an Android Metro/Hermes bundle, not an APK.
- `npm run build:web`: export the browser verification build.
- `npm run test:e2e`: build web and run Playwright UI integration tests; install Chromium first with `npx playwright install chromium`.

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

Use concise, imperative subjects and focused commits. PRs should describe the change, reference relevant design sections or issues, and report validation performed. Include screenshots for UI changes and explain deviations from the documented design.

## Security & Configuration

Keep AI keys and demo tokens out of source code and public environment variables. The proposed design stores server secrets in Worker configuration and device tokens in SecureStore.
