# T05 AI Worker 구현과 인계

- 기준: [구현 설계안](campus_notice_implementation_design.md) 4·7·12·13절
- 작업일: 2026-11-13
- 상태: T05 완료. 실제 Gemini 두 본문 분석·원문 대조, Cloudflare 배포 및 배포 URL의 인증·호출 제한·토큰 만료/복구를 확인했다.
- 배포: `https://team15-notice-ai.team15-campus-notice.workers.dev/analyze-notice` (인증된 POST 전용)
- 검증 버전: `dd6a8c43-cb20-4523-87b4-08530572a8c6`, 모델 `gemini-3.5-flash-lite`, 계약 1.1/e1.
- 보관 증거: [실제 배포 응답·접근 검증 JSON](../fixtures/real/worker/t05_verified.json), 2026-11-13 23:13 KST 검증.

## 1 구현 범위

`POST /analyze-notice`에서 shared 1.1/e1 계약을 사용한다. Bearer 토큰의 SHA-256·만료를 확인하고 토큰 해시를 Rate Limiting key로 사용한다. 토큰 원문과 Gemini 키를 로그에 남기지 않는다. 서버의 `ANALYSIS_ENABLED`가 `true`가 아니거나 필수 설정이 없으면 분석하지 않는다.

요청은 실제 UTF-8 스트림을 읽으며 128 KiB까지 허용한다. 본문 20,000자·링크/첨부 각 30개를 넘으면 413, 버전 불일치는 409, JSON·스킴·해시 오류는 400이다. c1 SHA-256을 Web Crypto로 재계산한다. 해시는 본문의 실제 출처를 인증하지 않는다.

Gemini REST `generateContent`에 서버 고정 지침과 shared Zod에서 생성한 JSON Schema 부분집합을 전달한다. 공지는 별도의 user 데이터로 전달하고 모델이 시스템 지침·봉투·모델 선택을 제어하지 않는다. 모델 호출과 응답 본문 읽기에 합쳐 25초 제한, 입력 읽기에 5초 제한, 모델 응답에는 256 KiB 제한을 적용한다. 리다이렉트를 따라가지 않으며 자동 재호출은 없다.

정상 응답 봉투의 ID·해시·버전·시각은 서버가 작성한다. 오류는 공통 `ApiError`, `X-Request-Id`를 사용하고 429에는 `Retry-After`를 보낸다. 애플리케이션 로그는 요청 ID·공지 ID(최대 200자)·상태·오류 코드·지연·토큰 사용량·공급자 HTTP 상태와 사전 정의한 오류 분류만 남긴다. 공급자 오류 본문·키는 기록하지 않는다. `retryable`은 수동 재시도 가능성을 뜻하며 자동 재시도를 켜는 의미가 아니다.

기본 실행 위치에서 Gemini가 `UNSUPPORTED_LOCATION`을 반환하는 사례를 확인해 `placement.region=gcp:asia-northeast3`로 설정했다. 서울 인근 배치 후 위 배포 버전에서 두 응답이 모두 200으로 성공했다. Placement Hints는 Cloudflare의 인근 실행 위치 선택이며 법적 데이터 보관 지역 보장은 아니다. 공급자 수요 과다 503도 실제로 관찰했으며 기존 오류 계약으로 처리한다. [Cloudflare Placement](https://developers.cloudflare.com/workers/configuration/placement/), [Gemini 지원 지역](https://ai.google.dev/gemini-api/docs/available-regions)

## 2 원문 대조와 한계

| 항목                               | 서버 처리                                  |
| ---------------------------------- | ------------------------------------------ |
| 구조·날짜·필드 조합·실행 스킴 오류 | 502 INVALID_MODEL_OUTPUT                   |
| 조건 근거가 제목·본문에 없음       | scope를 unknown으로 낮추고 안내 추가       |
| 활동 근거 없음                     | activity=null                              |
| 준비물 근거 없음                   | 항목 제외, 원문 확인 안내                  |
| 일정 근거 없음                     | 후보·근거를 보존하고 needs_review          |
| 해당 날짜의 연·월·일 근거 없음     | needs_review. 현재 연도·게시일을 쓰지 않음 |
| 시각 근거 없음                     | time=null, 날짜가 있으면 precision=date    |
| 같은 유형에 서로 다른 일정 후보    | 후보 보존, 모두 needs_review               |
| 신청 URL이 입력 링크·본문에 없음   | application_url=null                       |
| 첨부·이미지 존재                   | 읽지 않았다는 안내를 서버가 추가           |

주관 학과 문구를 지원 대상 근거로 사용하지 않으며, `all`은 해당 조건(전 학과·학년 무관 등)의 명시적 근거가 있어야 한다. 원문 근거는 NFC·공백 정규화 후 **연속 구절 포함 여부**를 대조한다. 날짜는 숫자 연·월·일이 함께 나온 한국어 또는 `.`, `/`, `-` 표기를 확인한다. 같은 연속 범위에 명시된 시작 연도·월은 끝 날짜에도 연결한다. 연도를 넘는 범위·영문 날짜 등 이 검증기가 확정하지 못하는 표기는 `needs_review`로 보존한다. 같은 유형의 여러 회차는 의미를 자동 구분하지 않고 수동 확인 대상으로 둔다.

이 검증은 요약·혜택의 모든 의미나 근거가 실제로 해당 조건을 뜻하는지 증명하지 않는다. 명령 무시 지침과 JSON 스키마만으로 프롬프트 인젝션 방어가 증명되는 것도 아니다. 실제 모델 응답을 원문과 대조하는 마지막 검증이 필요하다. 첨부·이미지 다운로드, URL 방문, 사용자 프로필 전송은 하지 않는다.

## 3 자동 검증

Node 24.22.3에서 실행한다.

```sh
npm ci
npm run check
npm run worker:build
git diff --check
```

Worker 집중 검증은 `npm run test:worker`다. 테스트 범위는 다음과 같다.

- 정상 봉투·고정 모델·서버 지침·JSON 스키마 전달과 민감값 로그 제외.
- 경로·메서드·Content-Type, 토큰 누락·위조·만료·서버 중지.
- 실제 바이트 경계와 위조 Content-Length, 한글 바이트, 입력 개수 제한.
- 해시·버전·스킴·개인정보 필드 거절, 공급자 오류·차단·잘린 출력·시간 초과.
- 근거 없는 조건·준비물·신청 주소, 연도·시각 추측, 복수 마감.
- 실제 캡처 HTML의 본교 연도 없는 신청 마감, 학과 연도 없는 활동 일정·선착순, 이미지·PDF 미확인.
- **workerd에서 실제 번들과 Web Crypto, Rate Limiting binding 실행**: 정상 2회 후 429. 이 테스트의 한도는 검증 속도를 위해 2회이며 배포 설정은 10회/60초다. Gemini 응답은 mock이다.

workerd 테스트는 로컬 포트를 사용한다. 샌드박스에서 `listen EPERM`이 나면 로컬 포트 실행 권한을 부여한 뒤 같은 명령을 다시 실행한다. dry-run은 Cloudflare 계정 없이 번들·binding 구성을 검증하며 배포를 수행하지 않는다.

## 4 실제 호출·배포 준비

[README 4절](../README.md#4-t05-ai-worker-시작하기)의 설치·키 발급·로컬 실행·배포 명령을 따른다.

- `worker:setup`: 기존 파일을 덮어쓰지 않고 `worker/.dev.vars`, `.env.worker-client` 생성. 토큰은 32바이트 난수, 기본 만료는 생성 후 24시간. 권한 0600, Git 제외.
- `worker:models`: 키로 계정 모델 목록 조회. 모델 호출 성공·한도는 실제 smoke에서 확인.
- `worker:dev`: 로컬 Worker. 모델 ID는 로컬 `.dev.vars`에서 지정.
- `worker:smoke`: 변조되지 않은 실제 HTML 두 건을 기존 어댑터로 파싱해 순차 분석. 계약·해시·식별자·연도 미확인 규칙 확인 후 `dist/worker-smoke/latest.json`에 응답 보관. 자동 재시도 없음.
- `worker:deploy`, `worker:secrets`: 공개 모델 설정과 비밀 세 값을 구분해 배포. `worker:secrets`는 비밀값을 인자로 노출하지 않고 stdin으로 전달.
- `worker:access-smoke`: Gemini 호출 없이 위조·누락 토큰의 401, 잘못된 입력의 400과 호출 제한 429/Retry-After 검증.
- `worker:expiry-smoke`: 배포 토큰의 만료를 잠시 과거로 바꿔 401을 확인한 뒤 원래 값으로 복원. Secret 전파 완료를 확인하며 `finally`에서 복구한다. 시연 중에는 실행하지 않는다.

저장소의 `GEMINI_MODEL`은 실제 계정에서 성공한 `gemini-3.5-flash-lite`로 고정했다(e1). 이후 모델·프롬프트·정규화/의미 검증을 바꾸면 관련 버전을 올려 캐시를 구분한다.

## 5 T05 완료 체크리스트와 후속 경계

- [x] Worker HTTP·인증·호출 제한·해시 재검산·공급자 호출·출력 검증 구현.
- [x] 실제 HTML 표본을 사용하는 의미 검증 테스트와 실제 호출 CLI 제공.
- [x] Node 및 workerd 로컬 Worker 테스트 30건 통과(Gemini mock).
- [x] Wrangler 배포 전 dry-run 번들 생성 확인.
- [x] 전체 `npm run check`: strict TypeScript, 테스트 77건, Prettier 통과. `git diff --check` 통과.
- [x] Gemini 키·모델 목록 확인. 실제 gemini-3.5-flash-lite 호출 성공. 사용자가 AI Studio에서 확인한 gemini-3.5-flash-lite 한도는 RPM 15·TPM 250K·RPD 500이다. 서버는 이보다 낮은 기본값 10회/60초로 설정했다.
- [x] 실제 모델로 두 본문 분석·원문 대조 완료. gemini-3.5-flash-lite를 e1 초기 모델로 고정.
- [x] Cloudflare 이메일 인증·배포 권한·시연 비밀 세 값 등록·배포 URL 확보.
- [x] 배포 URL에서 두 실제 `AnalysisEnvelope` 및 만료·복구·호출 제한 검증.

본교 응답은 방문 기간 2026-12-14~15를 확정하고 신청 마감·결과 안내의 연도는 추측하지 않았다. 학과 응답은 3~4학년 재학 근거와 EPiC 신청·보고서 제출을 보존하고, 연도 없는 활동 일정과 선착순 모집에 임의 확정 마감을 만들지 않았다. 두 응답 모두 주관 학과를 지원 대상 제한으로 단정하지 않으며 확인되지 않은 학과는 unknown이다. 본문 이미지·PDF 첨부 미분석 안내도 보존했다.

배포 접근 검증에서 토큰 누락·위조는 401, 호출 제한은 429와 Retry-After=60을 반환했다. 실제 제한 관찰은 분산 카운터 특성상 설정값 10회를 넘어 429가 나타났으며 엄격한 전역 상한으로 해석하면 안 된다. 만료 시각을 과거로 바꾸면 401, 복원 후에는 다시 인증을 통과했다. 현재 시연 토큰 만료는 **2026-11-14 22:34 KST**다. API 키·토큰 원문은 Git 제외 파일과 Worker Secret에만 보관하며 커밋 대상 파일에서 유출이 없음을 검사했다.

T07에서 모바일 SecureStore·시연 설정 화면·35초 API 요청·분석 큐·B repository 반영을 연결한다. T05 코드만으로 제품 화면 통합, 기존 분석 캐시 보존, 체크 기록 보존, 기기 알림 검증이 완료된 것은 아니다.

## 6 참고 문서

- [Gemini 구조화 출력](https://ai.google.dev/gemini-api/docs/structured-output)
- [Gemini generateContent REST](https://ai.google.dev/api/generate-content)
- [Cloudflare Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Cloudflare Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
