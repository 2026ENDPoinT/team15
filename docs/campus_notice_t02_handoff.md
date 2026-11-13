# T02 실제 HTML 수집과 인계

- 작성일: 2026-11-13
- 기준: 구현 설계안 2·6·12.2·13절
- 작업 브랜치: `feat/t02-notice-collection`
- 메인 반영 기준: `e7d8d28` (`Upgrade Expo to SDK 58`). 공통 패키지는 main과 같은 Expo 58.0.25·React Native 0.88.1·React 19.3.0·TypeScript 6.0.3을 사용하며, T02의 `expo-crypto`는 SDK 58 호환 버전 58.0.8을 사용한다. HTML 파서 의존성과 수집 검증 명령은 유지한다.
- 후속 main 병합: `93f6194`의 SQLite 저장·진행 상태·체크리스트 연결을 유지하고 T02 수집 코드를 함께 포함한다. `expo-crypto` 선언은 main의 `~58.0.8`을 따르며 실제 설치 버전은 lockfile로 고정한다.
- 상태: **T02 완료**. 구현·자동 검증에 이어 2026-11-13 사용자가 Android 실기기 검증 항목 모두 확인 완료를 보고했다.

## 1 구현 범위

- 두 출처의 목록·상세 어댑터, 제목·본문·ID·게시일 추출.
- `sourceId:bnum:bidx` ID와 실제 상세 URL 보존, 상세 제목으로 목록의 ‘더보기’ 보정.
- `frmSearch` 숨김 필드를 유지한 `page`·`size` 페이지 이동, 고정 공지 ID 중복 제거.
- 문단·줄바꿈·표의 열 구분, HTML entity, 상대 링크·텍스트 URL 처리.
- JavaScript 첨부는 이름과 `url: null`, 본문 이미지는 존재 여부만 보존. 첨부 다운로드·OCR은 수행하지 않는다.
- 구조 변경·빈 본문·HTTP·네트워크·시간 초과를 오류로 반환. 이미지·첨부만 있는 유효한 공지는 허용한다.
- 수집 시각과 정규화 c1 SHA-256을 포함한 `CollectedNotice` 검증.
- 기본 1페이지, 출처당 최대 30건. 옵션으로 최대 5페이지. 한 `collectBoards` 호출에서 상세 동시 요청은 최대 2개, HTML 응답 본문 읽기까지 10초, 자동 재시도 없음.
- 출처별 전체 성공·부분 실패·실패와 개별 실패 정보 반환. DB·AI·자동 갱신 스케줄은 T03/T05/T07 범위다.

## 2 파일과 계약

| 경로                       | 역할                                             |
| -------------------------- | ------------------------------------------------ |
| `src/sources/boards.ts`    | URL·출처 검증, 게시판 설정과 순수 파서           |
| `src/sources/html.ts`      | 본문 정제, URL 추출                              |
| `src/sources/collector.ts` | 요청 제한 시간, 해시·계약 검증, 부분 실패 수집   |
| `src/sources/smoke.ts`     | Node·Expo 공용 실제 수집 검증                    |
| `src/platform/sha256.ts`   | Expo Crypto SHA-256                              |
| `fixtures/real/seoultech/` | 변경하지 않은 실제 응답 6개와 manifest           |
| `tests/sources.test.ts`    | 실제 fixture·오류·수집 동작 테스트               |
| `tests/e2e/t02.spec.ts`    | 실제 fixture를 응답으로 주입한 웹 UI 통합 테스트 |
| `scripts/collect_smoke.ts` | 현재 서버 응답 확인 CLI                          |
| `app/dev/collection.tsx`   | Expo 기기 검증 화면                              |

설계 초안의 동기 `parseDetail(): CollectedNotice`는 비동기 해시 계산과 맞지 않아 다음과 같이 구체화했다. API 1.1 봉투와 `CollectedNotice` 필드는 변경하지 않았다.

```ts
type ParsedNotice = Omit<CollectedNotice, 'fetchedAt' | 'contentHash'>;
parseDetail(html: string, ref: NoticeRef): ParsedNotice;
buildListUrl(page: number, previousPage?: ListPageContext): string;
```

`collectDetail`이 파싱 후 시각·해시를 붙인다. `buildListUrl`의 이전 페이지 인자는 폼의 숨김 필드를 다음 요청에 보존하기 위해 추가했다. 시간·fetch·SHA-256 구현은 주입한다. Node 전용 모듈은 테스트·CLI에만 사용하며 앱 수집 경로는 `htmlparser2`의 문자열 파싱과 `css-select`, Expo Crypto를 사용한다.

B는 `CollectionResult.notices`만 원문 UPSERT로 전달하고 `failures`를 따로 기록해야 한다. `status !== 'success'`이면 전체 동기화 성공 시각을 갱신하면 안 된다. 실패한 공지·목록 밖으로 밀린 저장 공지는 삭제하지 않는다. 저장 중인 공지의 추가 수집과 여러 갱신의 중복 실행 방지는 T07 서비스에서 연결한다. `collectBoards`는 한 호출 내 요청 수를 제한하며 전역 동기화 큐가 아니다.

A·B의 계약 검토는 아직 확인되지 않았다. 화면용 가상 데이터는 그대로이며 수집 결과는 개발 화면에서만 표시한다.

## 3 실행과 검증 명령

```sh
nvm use
npm ci
npm run check
npm run collect:smoke
npm run build:android
npx playwright install chromium
npm run test:e2e
git diff --check
```

Node는 `.nvmrc`의 24.22.3을 사용한다. `collect:smoke`만 외부 게시판 연결이 필요하며 단위 테스트와 웹 UI 테스트는 원본 fixture를 사용한다. API 키나 Worker 계정은 필요 없다. 웹 UI 테스트에서 설치된 Chromium을 별도로 사용할 경우 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`를 지정할 수 있다.

실제 수집 CLI는 각 출처의 목록 1·2페이지와 상세 1건을 읽고 ID·제목·본문 길이·해시를 출력한다. 학과 `897737`, 본교 `897750`은 연도 없는 날짜·선착순·첨부·이미지 사례이며 정상 신청 마감 시연용 확정 사례가 아니다.

## 4 확인한 결과

2026-11-13 Node.js 24.22.3의 실제 서버 수집:

| 출처          | 1페이지 고유 ID | 2페이지 신규 ID | 상세 ID                         | 본문 길이 | 링크·첨부·이미지                      |
| ------------- | --------------- | --------------- | ------------------------------- | --------- | ------------------------------------- |
| 대학공지      | 21              | 15              | `seoultech_general:4691:897750` | 936자     | 링크 1, 첨부 0, 이미지 있음           |
| 컴공 학부공지 | 10              | 6               | `seoultech_cs:58476:897737`     | 518자     | 링크 1, 첨부 1(URL 없음), 이미지 없음 |

- Android Metro/Hermes 번들 export 통과. APK 생성·기기 실행 증거는 아니다.
- `npm run check`: TypeScript strict, 계약·수집 테스트 42개, Prettier 통과. 표 구분자는 셀 사이에만 추가하며 원문 문장 끝의 `|`와 빈 셀을 보존한다.
- `npm run test:e2e`: 기존 T01 2개와 T02 1개, 총 3개 통과. T02는 실제 HTML을 응답으로 주입해 Expo 웹 파서·SHA-256과 Node 결과 일치, 실패 시 이전 결과 제거, 복귀 동작을 확인했다. 이번 환경에서는 `/tmp/chromium`을 별도 Chromium 경로로 사용했다.
- 원본 fixture는 전체 HTML이며 메뉴·푸터·조회수를 본문에서 제외하는 테스트를 포함한다. 같은 본문의 수집 시각이 달라져도 해시가 같음을 검증한다.
- SDK 58 메인 반영 후 재검증: Node.js 24.22.3에서 `npm ci`, `npm run check`(42개), `npm run build:android`, `npm run test:e2e`(3개)를 다시 통과했다. main의 공통 패키지 버전과 작업 파일이 일치하고 `package.json`·lockfile 의존성도 일치한다. T02의 기존 파서·Expo SHA-256 코드는 추가 수정 없이 통과했다. 이후 실기기 검증도 아래 사용자 확인 기록으로 완료했다.

[수집 검증 화면](screenshots/t02_collection_web.png)은 390×844 웹 뷰포트 캡처다. Android 실기기 화면이나 직접 웹 수집 성공을 의미하지 않는다.

## 5 Android 실기기 확인 기록

2026-11-13, 사용자가 Android Expo Go 실행 성공 후 안내한 기능 검증 항목에 대해 **“검증 모두 확인 및 완료”**라고 보고했다. 아래 결과는 사용자 수행·확인에 근거하며 에이전트가 기기를 직접 조작해 확인한 결과는 아니다.

- [x] 홈·공지 찾기·상세 이동 및 관심 저장·해제의 홈 반영.
- [x] Android에서 두 게시판의 수집·파싱·SHA-256 확인 성공.
- [x] 두 출처의 제목·본문·ID·해시·수집 시각과 2페이지 신규 게시물 확인.
- [x] 본교 이미지 안내, 학과 PDF 첨부 이름·원문 확인 안내.
- [x] 각 원문과 제목·본문·첨부 대조, 원문에서 앱으로 복귀.
- [x] 네트워크를 끈 상태의 실패 표시 및 이전 성공 결과 제거.
- [x] 네트워크 복원 후 재수집 성공.

기기 모델·Android 버전·Expo Go 버전과 성공 화면 캡처는 별도로 제공되지 않아 미기록으로 남긴다. 앞서 공유된 오류 화면을 성공 증거로 사용하지 않는다. APK 제출·DB 영속 저장·AI 분석·알림 검증은 이번 완료 범위에 포함하지 않는다.

재검증 절차:

1. `npm run start` 후 Android Expo Go에서 연다.
2. T01 홈·찾기·상세와 관심 저장·해제 동작을 확인한다.
3. 공지 찾기 하단의 **T02 수집 검증 열기**를 누른다. 이 진입 버튼은 개발 모드에만 표시한다.
4. **두 게시판 수집 확인**을 누르고 두 출처의 제목·본문·ID·2페이지 신규 건수와 해시가 표시되는지 확인한다. 공용 SHA-256 고정 벡터도 실행된다.
5. 원문 열기로 텍스트·첨부 이름·이미지 존재 여부를 대조한다. 이미지 내용이나 첨부를 분석한 것으로 표시하지 않는다.
6. 화면을 열린 상태로 두고 Wi-Fi·모바일 데이터를 끈 뒤 수집 버튼을 다시 눌러 실패 표시와 이전 결과 제거를 확인한다. 앱 종료·새로고침 없이 네트워크를 복원하고 다시 수집한다.
7. 기기 모델·Android·Expo Go 버전·확인 일시·성공 화면을 기록한다.

웹 fixture 테스트와 Android 번들 결과는 실기기 결과와 구분한다. 이번 T02의 실기기 완료 판정은 위 사용자 확인에 근거한다.

## 6 main 병합 충돌 해결

README는 SQLite 제품 상태와 T02의 별도 실제 수집을 함께 설명한다. `package.json`은 main의 Metro runtime·SQLite 의존성과 T02의 파서·해시 의존성·검증 스크립트를 보존하고 lockfile을 재생성한다. TypeScript 검사는 T02 CLI가 있는 `scripts/**/*.ts`도 포함한다.

병합 검증: Node.js 24.22.3에서 `npm run check`의 타입·포맷 검사와 테스트 47개, `npm run test:e2e`의 웹 UI 테스트 3개, `npm run build:android`가 통과했다. 웹 UI 테스트는 SQLite 체크·신청 상태와 관심 해제의 새로고침 후 보존, T02 실제 HTML 파싱·해시·실패 표시를 함께 확인한다.

기존 T02 실기기 확인은 병합 전 수집 검증 결과다. 새 SQLite 저장 흐름의 Android 재실행·보존 검증은 별도로 수행해야 한다. 실제 수집 결과의 DB·화면 통합은 T07 범위로 남긴다.
