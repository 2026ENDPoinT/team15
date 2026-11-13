# GongMoa 개발·운영 가이드

[프로젝트 소개로 돌아가기](../README.md)

ENDPoinT 해커톤 2026 Team 15

서울과기대 맞춤 공지 앱. [구현 설계안](campus_notice_implementation_design.md)을 구현 기준으로 사용한다. 이전 기획서와 계약이 다르면 구현 설계안의 **1.1 계약**을 따른다.

## 1 현재 구현 범위

main의 네 화면 UI(휴지통·맞춤 공지·메인·설정), SQLite repository와 T02의 두 게시판 수집 어댑터를 포함한다. 기본 실행에서는 실제 공지만 표시하고, 이전 버전이 저장한 가상 예시는 시작 시 목록과 캘린더에서 제거한다. Android 알림 예약·취소와 기기 검증용 동작도 구현되어 있다. 실제 수집·AI 분석은 맞춤 공지의 새로고침과 상세 화면에서 실행하며, 가상 예시는 개발자 도구와 `EXPO_PUBLIC_NOTICE_DEMO=1`을 함께 켠 시연 모드에서만 생성한다. **T02 수집의 Android 실기기 검증은 2026-11-13 사용자 확인으로 완료**했다. 새 UI·SQLite·SecureStore 통합 이후의 실기기 체크리스트는 2026-11-14 사용자 전체 통과 보고로 확인했다. **T05 AI Worker의 실제 Gemini 호출·Cloudflare 배포·두 본문 원문 대조를 완료**했다. T07 C의 수집·AI 클라이언트·동기화·DB·제품 화면 연결과 실제 두 공지의 Node SQLite 재실행 검증을 완료했다. Android의 저장·토큰 재실행 보존, 오프라인 복구와 가상 공지 알림 예약·취소까지 사용자 확인을 받아 T07 C 담당을 완료했다. [T07 인계 문서](campus_notice_t07_handoff.md)를 참고한다.

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

[T01 팀 인계 및 실기기 체크리스트](campus_notice_t01_handoff.md), [역할 C 착수 계획](campus_notice_c_startup_plan.md), [샘플 사용법](../fixtures/README.md)을 참고한다. 샘플은 실제 공지나 실제 AI 응답이 아니며, UI에도 가상 데이터임을 표시한다.

[T02 수집 인계 및 기기 검증](campus_notice_t02_handoff.md)에 어댑터 계약 변경, 실제 HTML 검증 결과와 실기기 확인 기록을 정리했다. 가상 샘플은 `fixtures/synthetic/`, 실제 원본은 `fixtures/real/`로 구분한다.

## 2 설치와 개발

팀 권장 버전은 **Node.js 24.22.3**이며 `.nvmrc`에 고정한다. 최초 계약은 Node.js 22.23.5로 검증했고 앱은 Node 24에서 검증한다. `engines`는 호환 하한을, `.nvmrc`는 팀 공통 버전을 나타낸다. Expo SDK 58·React Native 0.88.1·React 19.3.0과 `package-lock.json`을 함께 사용한다.

```sh
nvm install
nvm use
npm ci
npm run start
```

SDK 58을 지원하는 Android Expo Go에서 QR을 열어 실행한다. PC와 같은 네트워크를 사용한다. 기존 SDK 57 작업 환경에서는 `npm ci` 후 `npm run start -- --clear`로 Metro 캐시를 초기화한다. SDK 버전이 맞지 않으면 [Expo Go 다운로드](https://expo.dev/go)에서 SDK 58용 앱을 확인한다. 에뮬레이터가 준비되어 있으면 `npm run android`, 브라우저에서 보조 확인하려면 `npm run web`을 사용한다. 일반 실행에서는 실제 공지만 표시한다. 공지 상태와 프로필·키워드는 SQLite에 저장하며, 프로필이 없는 첫 실행에서는 아래 초기 설정을 안내한다.

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
npm run test:e2e:release
```

`build:android`는 Android용 Metro/Hermes 번들만 생성하며 **설치 가능한 APK를 만들지 않는다**. Expo Go 실행과 독립 APK 제출은 구분한다. 웹 테스트도 실기기 확인을 대신하지 않는다. 출력은 `dist/`, UI 테스트 결과는 `test-results/`에 저장한다. Worker 실행·배포는 4절을 따른다.

저장된 프로필이 없는 첫 실행에서는 별도 초기 설정 화면에서 **내 정보 → 관심 키워드 → 설정 완료하고 시작하기** 순서로 안내한다. 완료할 때 SQLite에 프로필을 저장하며, 다음 실행부터 메인 화면으로 진입한다. 완료 전에 앱을 닫으면 다음 실행에 다시 안내하며, 기존에 프로필을 저장한 사용자는 초기 설정을 생략한다. 초기 설정의 재실행·이전 단계·저장 유지 동작은 `tests/e2e/initial_setup.spec.ts`에서 검증한다. 새 초기 설정 화면의 Android 실기기 확인은 별도로 필요하다.

설정 탭에서 내 정보와 선호 키워드는 변경 즉시 자동 저장하며 맞춤 공지에 반영한다. 별도 설정 저장 버튼은 없고 저장 실패 시 재시도할 수 있다. 키워드를 모두 해제하면 맞춤 공지 필터의 대상이 없어지며 선택 안내를 표시한다. AI 시연 토큰은 기존처럼 입력 후 **AI 토큰 저장**으로 등록한다.

일반 알림 권한은 **설정 → 마감 알림 → 마감 알림 허용**에서 요청한다. 허용 후 저장된 실제 공지의 마감 예약을 갱신하며, 권한 거절 시 **기기 알림 설정 열기**로 다시 허용할 수 있다. 웹에서는 지원하지 않는다는 안내만 표시한다.

검증 화면과 테스트 알림은 **설정 → 개발자 도구**에 모았다. 개발 실행(`__DEV__`)에서 사용할 수 있으며, 기본 배포 번들은 메뉴를 숨기고 `/dev`, `/dev/collection`, `/dev/t09` 접근을 메인으로 돌려보낸다. `EXPO_PUBLIC_ENABLE_DEV_TOOLS=1`은 검증용 export에만 사용하는 공개 빌드 플래그이며 비밀 값이 아니다. `npm run test:e2e`는 이 플래그를 켜서 기존 수집 화면까지 검사하고, `npm run test:e2e:release`는 끈 상태로 다시 빌드해 일반 화면과 직접 주소 접근 차단을 검사한다. 배포 번들 생성 시 이 플래그를 설정하지 않는다. 자동 테스트·CLI 스크립트·fixture·기존 기기 검증 기록은 유지한다.

T09 변경·실패·알림 재조정은 `npm run test:t09`로 검증한다. 실제 정상 공지 후보 수집은 `npm run t09:candidates`, 선정 공지의 배포 AI 1회·SQLite 검증은 `npm run t09:live-smoke`를 사용한다. Android에서는 개발 앱의 **설정 → 개발자 도구 → T09 변경·알림 검증 열기**로 가상 변경·실패와 실제 OS 예약을 확인한다. [T09 검증 기록과 기기 인수 절차](campus_notice_t09_handoff.md)를 따른다.

T02의 실제 서버 수집 확인(두 게시판 각각 목록 1·2페이지와 상세 1건, 네트워크 필요):

```sh
npm run collect:smoke
```

기기에서는 `npm run start`로 실행하고 **설정 → 개발자 도구 → T02 수집 검증 열기 → 두 게시판 수집 확인**을 누른다. 진입 버튼은 개발 모드에만 표시한다. 검증 화면은 `/dev/collection`이며 결과를 DB에 저장하지 않는다. 웹 통합 테스트는 실제 HTML fixture를 네트워크 응답으로 주입하므로 Android fetch·TLS·네이티브 해시 검증을 대신하지 않는다.

### 2.1 단과대학별 학과 선택

초기 설정과 설정 탭은 `src/components/ProfileFields.tsx`를 공유한다. 단과대학을 선택하면 `src/domain/campusDepartments.ts`의 해당 학과·학부·전공만 표시한다. 다른 단과대학으로 바꾸면 이전 학과를 해제하고, 같은 단과대학을 다시 누르면 현재 학과를 유지한다. 목록에 없는 기존 입력값은 보존하며 **목록에 없는 학과 직접 입력**으로 수정할 수 있다. 단과대학 미선택 상태에서도 직접 입력을 지원한다.

2026-11-14에 아래 공식 출처를 확인했다. 학과명은 사용자 요청에 따라 **학교 대학소개 페이지 표기로 통일**한다. 학과별 홈페이지에서 다른 이름을 사용하더라도 두 이름을 병기하지 않는다. 예를 들어 정보통신대학은 전기정보공학과·전자공학과·컴퓨터공학과·스마트ICT융합공학과와 자유전공학부(정보통신대학)를 제공한다. 이 목록은 소속 선택용이며, 자유전공 학생의 전공 진입 가능 학과를 판정하는 자료가 아니다.

- [학교 대학소개](https://www.seoultech.ac.kr/univ/univ/intro/): 10개 단과대학의 학과·학부·전공 표기. 공과대학에서 존속 중으로 안내하는 기존 학과와 계약학과도 포함하며, 전공이 나뉜 학부·학과는 전공까지 구분한다.
- [교양대학 자유전공 안내](https://liberal.seoultech.ac.kr/specialty/st/specialty/): ST자유전공과 단과대학별 자유전공의 구분. 공식 명칭인 ‘자유전공학부’를 사용한다.
- [학교 학칙 별표 1](https://www.seoultech.ac.kr/storage/www/rules/53205/SNUST1732605565984.pdf): 자유전공학부가 설치된 7개 단과대학과 교양대학의 ST자유전공학부를 보완 확인한다. 개편된 일반 학과명은 이 과거 문서보다 학교 대학소개를 우선한다. 조형대학에 별도 자유전공학부를 임의로 추가하지 않는다.

`tests/e2e/departments.spec.ts`에서 단과대별 목록 교체, 자유전공 저장·재실행, 기존 입력값 유지와 대학 변경 시 학과 해제를 검증한다. 새 학과 선택 UI의 Android 실기기 확인은 별도로 필요하다.

## 3 설정과 비밀 정보

자동 테스트에는 API 키나 계정이 필요 없다. 실제 AI 호출은 Worker 비밀 설정의 Gemini 키를 사용한다. 로컬 CLI의 시연 토큰은 `.env.worker-client`에 보관하고 서버에는 해시와 만료만 전달한다. 기기에서는 설정의 AI 시연 토큰 입력을 통해 SecureStore에 저장한다. 웹 검증의 토큰은 메모리에만 유지하며 새로고침하면 사라진다. `.env`·`.dev.vars`의 실제 값은 커밋하지 않는다.

## 4 T05 AI Worker 시작하기

배포 주소는 `https://team15-notice-ai.team15-campus-notice.workers.dev/analyze-notice`이며 인증된 POST 요청을 받는다. 2026-11-13에 실제 두 본문·인증·호출 제한·토큰 만료와 복구를 검증했다. [보관한 실제 응답](../fixtures/real/worker/t05_verified.json)을 참고한다.

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

배포한 접근 인증은 `npm run worker:access-smoke`로 확인한다. 인증 누락·위조의 401과 유효한 토큰의 잘못된 입력에 대한 400을 검증한다. 이 명령은 Gemini를 호출하지 않으며 호출 제한 검증은 하지 않는다. 공용 캐시 추가 후에는 검증된 캐시 미스만 모델 호출 제한을 소모한다. 실제 Rate Limiting binding과 캐시 적중 시 제한 우회는 `npm run test:worker`의 workerd 테스트로 검증한다. 증거는 `dist/worker-smoke/access.json`에 저장한다.

토큰 만료 동작을 다시 검증할 때는 `npm run worker:expiry-smoke`를 사용한다. 원격 만료 시각을 잠깐 과거로 바꿨다가 복원하므로 시연 중에는 실행하지 않는다. 현재 시연 토큰은 2026-11-14 22:34 KST에 만료된다.

Worker 실행은 `placement.region=gcp:asia-northeast3`로 서울 인근에 배치했다. 기본 위치에서 관찰된 Gemini 미지원 지역 오류를 해결하기 위한 설정이다. 설정 변경 후에는 배포 URL에서 실제 분석을 다시 확인한다.

시연을 중지하려면 `worker/wrangler.jsonc`의 `ANALYSIS_ENABLED`를 `"false"`로 바꾸고 다시 배포한다. 토큰이 만료되면 새 만료 시각을 로컬 비밀 파일에 지정하고 `worker:secrets`로 반영한다. 토큰 교체는 클라이언트 원문 토큰과 서버 SHA-256 해시를 함께 바꾼다. 토큰당 60초 10회 제한은 위치별 근사 제한이며 전역 비용 상한이 아니다. [Cloudflare 호출 제한](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

[T05 인계 문서](campus_notice_t05_handoff.md)에 구현 경계·검증 증거·남은 완료 조건을 정리했다.

### 4.3 공용 분석 캐시

Worker에 SQLite 기반 `AnalysisCache` Durable Object를 연결했다. 같은 요청·모델·프롬프트의 성공 분석을 7일간 공유하고 동시 요청을 하나의 Gemini 호출로 합친다. 본문뿐 아니라 게시일·공지 ID·schema/extractor 버전도 캐시 키에 포함한다. 캐시 반환에도 인증·토큰 만료·입력 검증을 적용하며, 앱의 응답 계약과 SQLite 캐시는 유지한다. 검증 로직 변경 시에는 기존 규칙대로 extractor 버전을 올려야 한다.

```bash
npm run test:worker
npm run worker:build
# 운영 반영 시 실행: 바인딩과 SQLite Durable Object migration을 함께 배포
npm run worker:deploy
```

별도 저장소 ID 생성이나 API 키 재등록은 필요 없다. 저장소 오류는 503으로 반환하며 우회 Gemini 호출은 하지 않는다. Durable Object는 Worker의 서울 placement를 상속하지 않으므로, 기존 HKG 미지원 지역 문제를 피하도록 EU jurisdiction에 생성한다. [Cloudflare 실행 지역 문서](https://developers.cloudflare.com/durable-objects/reference/data-location/). 이번 캐시 변경은 로컬 검증 대상이며 운영 배포·실제 Gemini 지역 검증은 별도로 필요하다. 새 공지의 첫 분석과 캐시 만료 후 분석은 여전히 Gemini 한도를 사용한다.

로컬 workerd는 jurisdiction을 구현하지 않으므로 `worker/.dev.vars`에 `ANALYSIS_CACHE_JURISDICTION="local"`을 추가한다. 운영 `wrangler.jsonc`의 `eu` 설정은 유지한다. 로컬 Gemini 요청은 개발 환경의 네트워크에서 실행된다.

## 5 T07 실제 공지 연결

현재 앱·운영 Worker의 추출 버전은 **e2**다. 이전에 버전 불일치 오류가 났다면 앱을 완전히 종료한 뒤 재실행하고 **공지 새로고침**을 누른다. e2 Worker 배포와 공개 공지 두 건의 실제 요청 성공은 [T05 8절](campus_notice_t05_handoff.md#8-e2-운영-배포와-버전-불일치-복구-2026-11-14)에 기록했다.

```sh
nvm use
npm ci
npm run start -- --clear
```

앱의 **설정 → AI 분석 설정**에서 팀의 기존 시연 토큰을 입력한다. **맞춤 공지 → 공지 새로고침 → 전체 공지 보기**에서 최신 AI 분석이 완료된 실제 공지만 확인한다. 수집·분석 중에는 완료/전체 건수와 분석 중·대기·실패·분석 불가 건수를 표시한다. 미분석·실패·이전 버전의 카드는 숨기며, 수집 후 남은 분석을 자동으로 이어간다. 실패·중단 후에는 **다시 시도**로 재수집 없이 분석을 재개한다. 인증 문제는 AI 분석 설정에서 해결하고 호출 제한은 표시된 재시도 시각까지 기다린다. 저장·체크 기록은 유지한다. 확정된 최신 일정만 메인 캘린더와 알림에 반영한다. `npm run test:e2e`는 가상 예시를 사용하는 시연 모드를 명시적으로 켜서 실행한다. 일반 실행에서는 가상 카드를 생성하지 않으며 기존 가상 카드의 알림 예약은 알림 동기화에서 취소한다.

첫 수동 갱신 이후 앱 시작·포그라운드 복귀 시 30분 기준으로 갱신한다. 수동 갱신 간격은 30초이며 AI는 동시 1건으로 미완료 공지를 끝까지 처리하며 같은 실행 안에서 실패한 공지를 반복 호출하지 않는다. 오류가 발생하면 자동 진행을 멈춘다. 저장 공지·관심 키워드를 우선하고 나머지 공지도 순차 분석한다. 429 대기 시각은 재실행 후에도 유지한다. 프로필·키워드는 SQLite에 저장한다. 웹의 실제 게시판 fetch는 CORS로 실패할 수 있으므로 기기에서 확인한다.

실제 게시판·배포 Worker·SQLite 파일 재개방 검증(기존 `.env.worker-client` 설정 필요, AI 2회):

```sh
npm run sync:smoke
```

공개 결과는 `dist/t07-smoke/latest.json`, 실행별 SQLite와 보고서는 `dist/t07-smoke/<실행시각>/`에 저장한다. 일반 검증은 `npm run check`, 화면 검증은 `npm run test:e2e`, Android 번들 생성은 `npm run build:android`다. [T07 인계 문서](campus_notice_t07_handoff.md)에 repository 추가 메서드·설계 조정·실제 증거·사용자 확인에 따른 실기기 완료 기록을 정리했다.
