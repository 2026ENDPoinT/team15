# team15

ENDPoinT 해커톤 2026 Team 15

서울과기대 맞춤 공지 앱. [구현 설계안](docs/campus_notice_implementation_design.md)을 구현 기준으로 사용한다. 이전 기획서와 계약이 다르면 구현 설계안의 **1.1 계약**을 따른다.

## 1 현재 구현 범위

main의 네 화면 UI(휴지통·맞춤 공지·메인·설정), SQLite repository와 T02의 두 게시판 수집 어댑터를 포함한다. 가상 공지 5건의 저장·휴지통·신청 상태·체크 기록은 SQLite에 연결되어 있다. Android 알림 예약·취소와 기기 검증용 동작도 구현되어 있다. 실제 수집은 별도의 개발 검증 화면과 CLI에서 실행한다. **T02 수집의 Android 실기기 검증은 2026-11-13 사용자 확인으로 완료**했다. 새 UI·SQLite·알림 병합 후 실기기 검증은 별도로 필요하다. **T05 AI Worker의 실제 Gemini 호출·Cloudflare 배포·두 본문 원문 대조를 완료**했다. 실제 공지 수집·AI 분석을 제품 화면과 연결하는 작업은 T07 범위다.

| 경로                     | 내용                                               |
| ------------------------ | -------------------------------------------------- |
| `app/`                   | Expo Router 홈·찾기 탭과 공통 상세                 |
| `src/features/demo/`     | 가상 공지 읽기 모델과 SQLite 상태 연결             |
| `src/components/`        | 공통 카드·버튼·화면 구성                           |
| `shared/contracts.ts`    | Zod 스키마, 추론 타입, 공통 사용자 동작 인터페이스 |
| `shared/canonicalize.ts` | 정규화 c1, 플랫폼 SHA-256 함수 주입                |
| `shared/mappers.ts`      | 수집 공지 → AI 요청 변환                           |
| `fixtures/synthetic/`    | 가상 공지 5건, 오류 응답, 시연 프로필              |
| `tests/*.test.ts`        | 계약·날짜 유효성·정규화·샘플 일관성 검증           |
| `src/sources/`           | 두 게시판 목록·상세 파싱, 수집, 부분 실패 처리     |
| `src/platform/sha256.ts` | Expo SHA-256 구현                                  |
| `fixtures/real/`         | 출처·수집 시각·원본 해시가 있는 실제 HTML          |
| `app/dev/collection.tsx` | 기기 수집·해시 검증 화면                           |
| `worker/`                | Gemini 중계, 인증·호출 제한, 출력 검증, 배포 설정  |
| `scripts/worker_*.ts`    | 로컬 비밀 설정·모델 조회·실제 본문 smoke 검증      |

[T01 팀 인계 및 실기기 체크리스트](docs/campus_notice_t01_handoff.md), [역할 C 착수 계획](docs/campus_notice_c_startup_plan.md), [샘플 사용법](fixtures/README.md)을 참고한다. 샘플은 실제 공지나 실제 AI 응답이 아니며, UI에도 가상 데이터임을 표시한다.

[T02 수집 인계 및 기기 검증](docs/campus_notice_t02_handoff.md)에 어댑터 계약 변경, 실제 HTML 검증 결과와 실기기 확인 기록을 정리했다. 가상 샘플은 `fixtures/synthetic/`, 실제 원본은 `fixtures/real/`로 구분한다.

## 2 설치와 개발

팀 권장 버전은 **Node.js 24.22.3**이며 `.nvmrc`에 고정한다. 최초 계약은 Node.js 22.23.5로 검증했고 앱은 Node 24에서 검증한다. `engines`는 호환 하한을, `.nvmrc`는 팀 공통 버전을 나타낸다. Expo SDK 58·React Native 0.88.1·React 19.3.0과 `package-lock.json`을 함께 사용한다.

```sh
nvm install
nvm use
npm ci
npm run start
```

SDK 58을 지원하는 Android Expo Go에서 QR을 열어 실행한다. PC와 같은 네트워크를 사용한다. 기존 SDK 57 작업 환경에서는 `npm ci` 후 `npm run start -- --clear`로 Metro 캐시를 초기화한다. SDK 버전이 맞지 않으면 [Expo Go 다운로드](https://expo.dev/go)에서 SDK 58용 앱을 확인한다. 에뮬레이터가 준비되어 있으면 `npm run android`, 브라우저에서 보조 확인하려면 `npm run web`을 사용한다. 첫 실행은 데모 공지 한 건을 관심 저장한 상태다. 네 화면 UI의 공지 상태는 SQLite에 저장하며, 설정의 프로필·키워드 등은 아직 메모리 상태다.

```sh
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

계약 테스트는 Node 내장 러너와 tsx로 `tests/*.test.ts`를 한 프로세스에서 실행한다. UI 통합 테스트는 Playwright의 `tests/e2e/*.spec.ts`를 사용한다. TypeScript strict 검사와 Prettier의 2칸 들여쓰기·작은따옴표·후행 쉼표를 적용한다. 별도 ESLint는 아직 도입하지 않았다.

번들 생성과 웹 UI 통합 검증:

```sh
npm run build:android
npm run build:web
npx playwright install chromium
npm run test:e2e
```

`build:android`는 Android용 Metro/Hermes 번들만 생성하며 **설치 가능한 APK를 만들지 않는다**. Expo Go 실행과 독립 APK 제출은 구분한다. 웹 테스트도 실기기 확인을 대신하지 않는다. 출력은 `dist/`, UI 테스트 결과는 `test-results/`에 저장한다. Worker 실행·배포는 4절을 따른다.

T02의 실제 서버 수집 확인(두 게시판 각각 목록 1·2페이지와 상세 1건, 네트워크 필요):

```sh
npm run collect:smoke
```

기기에서는 `npm run start`로 실행하고 **맞춤 공지 → T02 수집 검증 열기 → 두 게시판 수집 확인**을 누른다. 진입 버튼은 개발 모드에만 표시한다. 검증 화면은 `/dev/collection`이며 결과를 DB에 저장하지 않는다. 웹 통합 테스트는 실제 HTML fixture를 네트워크 응답으로 주입하므로 Android fetch·TLS·네이티브 해시 검증을 대신하지 않는다.

## 3 설정과 비밀 정보

자동 테스트에는 API 키나 계정이 필요 없다. 실제 AI 호출은 Worker 비밀 설정의 Gemini 키를 사용한다. 로컬 CLI의 시연 토큰은 `.env.worker-client`에 보관하고 서버에는 해시와 만료만 전달한다. 기기의 SecureStore·접근 설정 UI 연결은 T07 범위다. `.env`·`.dev.vars`의 실제 값은 커밋하지 않는다.

## 4 T05 AI Worker 시작하기

배포 주소는 `https://team15-notice-ai.team15-campus-notice.workers.dev/analyze-notice`이며 인증된 POST 요청을 받는다. 2026-11-13에 실제 두 본문·인증·호출 제한·토큰 만료와 복구를 검증했다. [보관한 실제 응답](fixtures/real/worker/t05_verified.json)을 참고한다.

루트에서 Node 24.22.3과 잠금 파일의 Wrangler를 사용한다. Worker용 별도 `npm install`은 필요 없다.

```sh
nvm use
npm ci
npm run test:worker
npm run worker:build
```

`test:worker`는 HTTP·원문 대조와 workerd/Miniflare의 실제 호출 제한 binding을 검증한다. Gemini 응답은 mock이므로 실제 AI 품질이나 배포 증거가 아니다. 로컬 포트 실행 권한이 필요하다. `worker:build`는 `dist/worker/`에 번들을 생성하는 배포 전 dry-run이다.

### 4.1 Gemini 키와 로컬 실행

1. [Google AI Studio의 API 키 화면](https://aistudio.google.com/apikey)에서 로그인하고 프로젝트를 선택하거나 만든 뒤 API 키를 생성한다. 계정·지역·사용량 조건은 [공식 키 안내](https://ai.google.dev/gemini-api/docs/api-key)를 확인한다.
2. `npm run worker:setup`을 **한 번** 실행한다. `worker/.dev.vars`와 `.env.worker-client`가 생성된다. 기존 파일은 덮어쓰지 않는다. 이 작업 세션에서 이미 생성했다면 다시 실행할 필요가 없다.
3. 편집기에서 `worker/.dev.vars`의 `GEMINI_API_KEY=""` 따옴표 안에 키를 입력한다. 채팅·소스 코드·`EXPO_PUBLIC_*`에 붙이지 않는다. 자동 생성된 토큰 해시와 24시간 만료 시각은 그대로 둔다.
4. 다음 명령으로 모델 목록을 확인한다. 사용할 `generateContent`·구조화 출력 지원 모델 ID를 같은 파일의 `GEMINI_MODEL`에 입력한다. 현재 기본 모델은 실제 두 본문으로 검증한 `gemini-3.5-flash-lite`다. 모델 목록 조회는 계정별 호출 가능 여부를 보장하지 않으므로 smoke로 확인한다.

```sh
npm run worker:models
npm run worker:dev
```

다른 터미널에서 실제 캡처 HTML 두 건으로 분석을 요청한다. Gemini 호출 2회가 발생하고 계정 사용량에 반영된다. 자동 재시도는 없다.

```sh
npm run worker:smoke
```

결과는 `dist/worker-smoke/latest.json`에 저장된다. 본문·근거·날짜·준비물을 원문과 대조하고, 성공한 모델 ID를 `worker/wrangler.jsonc`의 `vars.GEMINI_MODEL`에 고정한다. 모델·프롬프트·검증 규칙을 이후 변경할 때는 `shared/contracts.ts`의 `EXTRACTOR_VERSION`도 갱신해 이전 분석 캐시와 구분한다.

### 4.2 Cloudflare 로그인과 배포

1. [Cloudflare 계정](https://dash.cloudflare.com/sign-up)을 만들고 가입 이메일 인증을 완료한 뒤 아래 로그인 명령이 여는 브라우저에서 승인한다. 계정 비밀번호는 터미널이나 채팅에 입력하지 않는다.
2. 로컬 검증이 끝난 모델 ID를 `worker/wrangler.jsonc`에 고정했는지 확인한다. 팀 계정에 다른 rate limit이 있으면 `namespace_id=1505`와 충돌하지 않는 값을 지정한다.
3. 배포 후 로컬 비밀 파일의 **API 키·토큰 해시·만료 시각 세 값만** 업로드한다. 비밀 설정이 없으면 API는 분석 요청을 거절한다.

```sh
npm run worker:login
npm run worker:deploy
npm run worker:secrets
```

브라우저와 개발 환경이 달라 localhost 로그인 콜백을 받을 수 없다면 `npm run worker:login -- --device`를 사용한다. CLI가 안내하는 Cloudflare 인증 화면에 일회용 코드를 입력해 승인한다. 이 배포는 Workers와 계정 조회 권한만 사용한다.

`.env.worker-client`의 `WORKER_URL`을 배포 명령이 출력한 HTTPS 주소로 변경하고 `npm run worker:smoke`를 다시 실행한다. **배포 URL에서의 실제 모델 응답·원문 대조까지 성공해야 T05 완료**로 기록한다. `worker:deploy`는 `.dev.vars`를 자동 업로드하지 않는다. [Cloudflare 비밀 설정](https://developers.cloudflare.com/workers/configuration/secrets/)

배포한 접근 제한은 `npm run worker:access-smoke`로 확인한다. 인증 누락·위조의 401과, 유효한 토큰으로 잘못된 입력을 보내 400→429 및 Retry-After를 검증한다. 이 명령은 Gemini를 호출하지 않지만 테스트 뒤 해당 토큰의 호출 제한이 잠시 유지된다. 증거는 `dist/worker-smoke/access.json`에 저장한다.

토큰 만료 동작을 다시 검증할 때는 `npm run worker:expiry-smoke`를 사용한다. 원격 만료 시각을 잠깐 과거로 바꿨다가 복원하므로 시연 중에는 실행하지 않는다. 현재 시연 토큰은 2026-11-14 22:34 KST에 만료된다.

Worker 실행은 `placement.region=gcp:asia-northeast3`로 서울 인근에 배치했다. 기본 위치에서 관찰된 Gemini 미지원 지역 오류를 해결하기 위한 설정이다. 설정 변경 후에는 배포 URL에서 실제 분석을 다시 확인한다.

시연을 중지하려면 `worker/wrangler.jsonc`의 `ANALYSIS_ENABLED`를 `"false"`로 바꾸고 다시 배포한다. 토큰이 만료되면 새 만료 시각을 로컬 비밀 파일에 지정하고 `worker:secrets`로 반영한다. 토큰 교체는 클라이언트 원문 토큰과 서버 SHA-256 해시를 함께 바꾼다. 토큰당 60초 10회 제한은 위치별 근사 제한이며 전역 비용 상한이 아니다. [Cloudflare 호출 제한](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

[T05 인계 문서](docs/campus_notice_t05_handoff.md)에 구현 경계·검증 증거·남은 완료 조건을 정리했다.
