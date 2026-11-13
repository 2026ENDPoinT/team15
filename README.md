# team15

ENDPoinT 해커톤 2026 Team 15

서울과기대 맞춤 공지 앱. [구현 설계안](docs/campus_notice_implementation_design.md)을 구현 기준으로 사용한다. 이전 기획서와 계약이 다르면 구현 설계안의 **1.1 계약**을 따른다.

## 1 현재 구현 범위

역할 C의 공통 계약·가상 샘플과 검증 환경을 준비했다. Expo 앱, SQLite, 실제 수집 어댑터, AI Worker는 아직 구현하지 않았다.

| 경로                     | 내용                                               |
| ------------------------ | -------------------------------------------------- |
| `shared/contracts.ts`    | Zod 스키마, 추론 타입, 공통 사용자 동작 인터페이스 |
| `shared/canonicalize.ts` | 정규화 c1, 플랫폼 SHA-256 함수 주입                |
| `shared/mappers.ts`      | 수집 공지 → AI 요청 변환                           |
| `fixtures/synthetic/`    | 가상 공지 5건, 오류 응답, 시연 프로필              |
| `tests/*.test.ts`        | 계약·날짜 유효성·정규화·샘플 일관성 검증           |

[역할 C 착수 계획](docs/campus_notice_c_startup_plan.md)과 [샘플 사용법](fixtures/README.md)을 참고한다. 샘플은 실제 공지나 실제 AI 응답이 아니며, UI에도 가상 데이터임을 표시해야 한다.

## 2 설치와 개발

Node.js 22 이상과 npm을 사용한다. 검증 환경은 Node.js 22이며 의존성은 정확한 버전과 `package-lock.json`으로 고정한다.

```sh
npm ci
npm run typecheck
npm test
npm run format:check
```

전체 검증과 편집 후 포맷 적용:

```sh
npm run check
npm run format
git diff --check
```

테스트는 Node 내장 테스트 러너와 tsx로 `tests/*.test.ts`를 실행한다. 현재 순수 함수 테스트는 `--experimental-test-isolation=none`으로 한 프로세스에서 실행하며 Node.js 22.23.5에서 검증했다. 테스트 이름은 검증할 동작을 설명하며, 파일은 대상 모듈에 맞춘 `*.test.ts` 형식으로 둔다. TypeScript strict 검사를 사용하고 Prettier로 2칸 들여쓰기·작은따옴표·후행 쉼표를 통일한다. 별도 ESLint는 아직 도입하지 않았다.

현재는 계약 검증 단계이므로 앱 개발 서버나 배포 빌드 명령은 없다. Expo·Worker를 추가할 때 해당 실행·빌드 명령과 `tsconfig.json`의 포함 경로를 함께 갱신한다. 기존 `shared/`와 샘플을 유지하며 루트 패키지 설정을 통합한다.

## 3 설정과 비밀 정보

현재 검증에는 API 키나 계정이 필요 없다. 이후 AI 키는 Worker 비밀 설정에, 시연 접근 토큰은 기기의 SecureStore에 저장한다. `.env`·`.dev.vars`의 실제 값은 커밋하지 않는다.
