# T01 앱 뼈대와 팀 인계

## 1 범위와 상태

구현 기준은 [구현 설계안 12.2절](campus_notice_implementation_design.md#122-구현-작업과-완료-기준)이다. Expo Router의 홈·공지 찾기와 공통 상세에서 같은 가상 공지 한 건을 사용한다. 관심 저장·해제는 공통 Context를 통해 즉시 함께 반영한다.

- [x] Expo·React Native·Router 프로젝트와 의존성 lockfile 구성.
- [x] shared 1.1 계약과 같은 샘플 공지를 홈·찾기에서 표시.
- [x] 홈·찾기·상세의 관심 저장·해제 경로 연결.
- [x] 타입 검사와 공통 계약 테스트.
- [x] Android JavaScript/Hermes 번들 export.
- [x] 웹 UI 통합 검증: 탭 이동·관심 저장/해제·상세·잘못된 ID 복귀.
- [x] Android 실기기 실행: 2026-11-13 사용자가 홈·찾기·상세 이동과 관심 저장·해제 확인 완료.
- [ ] A·B의 계약·소유권 검토: 팀원 확인 필요.

실기기 기본 동작은 사용자 확인으로 완료했으며 A·B의 계약·소유권 검토는 별도 항목으로 남아 있다. Android 번들은 APK가 아니며, 웹 확인은 Android 실기기 확인을 대신하지 않는다.

## 2 버전과 실행

권장 Node 버전은 `.nvmrc`에 고정한 24.22.3이다. 22.23.5에서 시작한 공통 계약을 유지하며, Expo SDK 58과 React Native 0.88.1, React 19.3.0을 사용한다. 앱에서 선택한 네이티브 모듈은 Expo의 호환 버전 목록에 맞춘다.

```sh
nvm install
nvm use
npm ci
npm run start
```

PC와 기기를 같은 네트워크에 연결하고 SDK 58을 지원하는 Android Expo Go로 터미널 QR을 연다. 기존 SDK 57 작업 환경에서는 `npm ci` 후 `npm run start -- --clear`로 Metro 캐시를 초기화한다. SDK 버전이 맞지 않으면 [Expo Go 다운로드](https://expo.dev/go)에서 SDK 58용 앱을 확인한다. 연결이 되지 않으면 방화벽·같은 네트워크 여부를 먼저 확인한다. 에뮬레이터가 준비된 PC에서는 `npm run android`를 사용할 수 있다. 지금 단계는 Expo Go 개발 실행이며 독립 APK 제출용 빌드는 후속 작업이다.

웹에서 보조 확인:

```sh
npm run web
```

## 3 실기기에서 확인할 순서

1. 홈에 `[가상] AI 캠퍼스 해커톤 참가자 모집`과 가상 일정이 보이는지 확인한다.
2. 공지 찾기로 이동해 같은 제목·마감을 확인한다.
3. 관심 해제 후 홈에서 빈 상태를 확인한다.
4. 공지 찾기에서 다시 관심 저장하고 홈에 돌아와 같은 공지가 표시되는지 확인한다.
5. 두 탭에서 공통 상세를 열고 제목·모집 대상·일정·준비물이 동일한지 확인한다.
6. 상세의 뒤로 가기와 기기의 뒤로 가기 동작을 확인한다.

시연 데이터임을 화면에 명시하며 실제 원문·신청 URL은 열지 않는다. 첫 실행은 저장된 샘플 한 건으로 시작한다. T01 초기 구현은 메모리 상태였으나 main의 T03 구현 병합 후 관심 저장·해제, 신청 상태와 체크 기록은 SQLite에 보존한다. 기존 T01 실기기 확인은 이 병합 전 결과이며 새 저장 흐름의 기기 검증과 구분한다.

## 4 다음 담당자의 시작점

| 담당 | 시작 파일                                                  | 이어서 할 일                                        |
| ---- | ---------------------------------------------------------- | --------------------------------------------------- |
| A    | `app/(tabs)/discover.tsx`, `src/components/NoticeCard.tsx` | 온보딩·프로필·추천 읽기 모델과 카드 연결            |
| B    | `app/(tabs)/index.tsx`, `app/notice/[id].tsx`              | SQLite repository·NoticeActions·체크 기록·날짜·알림 |
| C    | `shared/`, `fixtures/`                                     | 실제 수집 어댑터·동기화·AI Worker                   |

`src/features/demo/demoNotice.ts`가 API/fixture를 화면용 camelCase 읽기 모델로 한 번 변환한다. `DemoNoticeProvider`는 T01 임시 구현이며 `saveNotice`·`unsaveNotice` 시그니처를 공유 계약에서 가져온다. B는 해당 경계를 DB 기반 서비스로 교체한다. 화면에 SQL·파서·AI 호출을 넣지 않는다.

위 표는 T01 당시의 소유권 기록이다. 당시 두 탭에서 공유한 `NoticeCard.tsx`는 이후 `CampusApp.tsx`·`DiscoverCard.tsx` 기반 UI로 대체되어 미사용 파일 정리에서 삭제했다. 공통 UI 수정의 소유권은 A·B가 맞춘 뒤 변경한다. T01에서 날짜는 샘플의 확정 값을 표시만 하며 실제 현재 시각에 따른 마감 판정·추천·알림은 구현하지 않는다.

## 5 검증 명령

```sh
npm run check
npm run build:android
npm run build:web
npx playwright install chromium
npm run test:e2e
```

`build:android`는 `dist/android`에 Metro/Hermes 번들을 생성한다. `build:web`은 보조 검증용 웹 출력을 `dist/web`에 생성한다. `test:e2e`는 웹 출력을 생성한 뒤 작은 모바일 뷰포트에서 탭 이동·저장/해제 상태 공유·상세·잘못된 ID의 복귀를 검증한다. 결과와 스크린샷은 `test-results/`에 저장하며 해당 폴더는 커밋하지 않는다.

T01 초기 검증 결과: Node.js 24.22.3에서 타입·포맷 검사, 계약 테스트 22개, UI 통합 테스트 2개, Android·웹 번들 생성 통과. 브라우저 다운로드 CDN이 응답하지 않아 이번 UI 검증은 별도 설치한 Chromium 경로를 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`에 지정해 수행했다. 일반 개발 환경에서는 위의 Playwright 기본 설치 명령을 사용한다.

SDK 58 전환 재검증(2026-11-13): Node.js 24.22.3에서 `npm ci`, Expo Doctor 20개 검사, 타입·포맷 검사, 계약·수집 테스트 42개, Android·웹 번들 생성, 웹 UI 테스트 3개를 통과했다. 웹 테스트는 `/tmp/chromium`을 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`로 지정했다. SDK 58 Router가 비활성 화면을 `inert` 상태로 DOM에 유지하므로 공통 링크와 관심 해제 버튼의 테스트 선택자는 활성 화면으로 한정했다. 이후 Android Expo Go 실기기 기본 동작도 사용자가 확인 완료했다. 상세 결과는 [T02 실기기 확인 기록](campus_notice_t02_handoff.md#5-android-실기기-확인-기록)을 참고한다.

아래는 390×844 웹 뷰포트에서 캡처한 화면이며 Android 실기기 캡처가 아니다.

- [홈 화면](screenshots/t01_home.png)
- [공지 찾기 화면](screenshots/t01_discover.png)
- [공통 상세 화면](screenshots/t01_detail.png)

## 6 참고

- [Expo SDK 업그레이드](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/), [SDK 58 변경 사항](https://expo.dev/changelog/sdk-58): SDK 57에서 58로 올리고 호환 의존성을 함께 갱신.
- [Expo Router 설치](https://docs.expo.dev/router/installation/): 기존 shared 프로젝트에 Router 진입점·호환 패키지 추가.
- [Node.js 릴리스](https://nodejs.org/en/about/previous-releases): 팀 권장 런타임은 Node 24 LTS, 실행 버전은 `.nvmrc`로 고정.

## HTML UI 정합성 반영 (2026-11-13)

- 루트 Expo 화면은 `src/components/CampusApp.tsx`에서 HTML 시안의 A 휴지통 / B 맞춤 공지 / C 메인 / D 설정 순서로 표시한다. 시작 화면은 C다.
- 녹색·연두색 팔레트, 공지 카드, 월별 캘린더와 날짜 필터, 학과·학년·학적과 키워드 설정을 반영했다.
- 공지는 unseen / saved / dismissed로 분류하며 영구 삭제는 제공하지 않는다. 보류는 화면을 떠나면 해제한다.
- 카드 내 스와이프는 분류와 보류, 카드 밖 가로 스와이프는 화면 이동에 사용한다. 같은 동작을 버튼으로도 제공한다.
- 다섯 개 가상 공지를 사용하는 UI 데모다. 상태는 실행 중 메모리에 유지되며 재시작 시 초기화된다. HTML의 localStorage에 해당하는 기기 영속 저장, 실제 수집·AI 분석·알림은 미구현이다.
- `/discover`는 통합된 네 화면의 진입점 `/`로 이동한다. 기존 상세 경로는 별도 T01 데모이며 새 카드 상세는 모달을 사용한다.
- Android 실기기에서 카드의 수직 보류와 목록 스크롤의 터치 우선순위를 추가 확인해야 한다.
