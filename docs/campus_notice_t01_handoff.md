# T01 앱 뼈대와 팀 인계

## 1 범위와 상태

구현 기준은 [구현 설계안 12.2절](campus_notice_implementation_design.md#122-구현-작업과-완료-기준)이다. Expo Router의 홈·공지 찾기와 공통 상세에서 같은 가상 공지 한 건을 사용한다. 관심 저장·해제는 공통 Context를 통해 즉시 함께 반영한다.

- [x] Expo·React Native·Router 프로젝트와 의존성 lockfile 구성.
- [x] shared 1.1 계약과 같은 샘플 공지를 홈·찾기에서 표시.
- [x] 홈·찾기·상세의 관심 저장·해제 경로 연결.
- [x] 타입 검사와 공통 계약 테스트.
- [x] Android JavaScript/Hermes 번들 export.
- [x] 웹 UI 통합 검증: 탭 이동·관심 저장/해제·상세·잘못된 ID 복귀.
- [ ] Android 실기기 실행: 사용자가 현재 확인이 어렵다고 하여 보류.
- [ ] A·B의 계약·소유권 검토: 팀원 확인 필요.

실기기 실행이 남아 있으므로 T01의 모든 현장 확인이 끝났다고 표현하지 않는다. Android 번들은 APK가 아니며, 웹 확인은 Android 실기기 확인을 대신하지 않는다.

## 2 버전과 실행

권장 Node 버전은 `.nvmrc`에 고정한 24.22.3이다. 22.23.5에서 시작한 공통 계약을 유지하며, Expo SDK 57과 React Native 0.86.3, React 19.2.3을 사용한다. 앱에서 선택한 네이티브 모듈은 Expo의 호환 버전 목록에 맞춘다.

```sh
nvm install
nvm use
npm ci
npm run start
```

PC와 기기를 같은 네트워크에 연결하고 Android의 Expo Go로 터미널 QR을 연다. 연결이 되지 않으면 방화벽·같은 네트워크 여부를 먼저 확인한다. 에뮬레이터가 준비된 PC에서는 `npm run android`를 사용할 수 있다. 지금 단계는 Expo Go 개발 실행이며 독립 APK 제출용 빌드는 후속 작업이다.

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

시연 데이터임을 화면에 명시하며 실제 원문·신청 URL은 열지 않는다. 첫 실행은 저장된 샘플 한 건으로 시작한다. 저장 상태는 메모리에서만 유지되어 앱을 완전히 다시 열면 초기 상태가 된다. 영속 보존은 T03에서 B가 구현한다.

## 4 다음 담당자의 시작점

| 담당 | 시작 파일                                                  | 이어서 할 일                                        |
| ---- | ---------------------------------------------------------- | --------------------------------------------------- |
| A    | `app/(tabs)/discover.tsx`, `src/components/NoticeCard.tsx` | 온보딩·프로필·추천 읽기 모델과 카드 연결            |
| B    | `app/(tabs)/index.tsx`, `app/notice/[id].tsx`              | SQLite repository·NoticeActions·체크 기록·날짜·알림 |
| C    | `shared/`, `fixtures/`                                     | 실제 수집 어댑터·동기화·AI Worker                   |

`src/features/demo/demoNotice.ts`가 API/fixture를 화면용 camelCase 읽기 모델로 한 번 변환한다. `DemoNoticeProvider`는 T01 임시 구현이며 `saveNotice`·`unsaveNotice` 시그니처를 공유 계약에서 가져온다. B는 해당 경계를 DB 기반 서비스로 교체한다. 화면에 SQL·파서·AI 호출을 넣지 않는다.

카드는 현재 같은 NoticeCard를 두 탭에서 공유한다. 공통 UI 수정의 소유권은 A·B가 맞춘 뒤 변경한다. T01에서 날짜는 샘플의 확정 값을 표시만 하며 실제 현재 시각에 따른 마감 판정·추천·알림은 구현하지 않는다.

## 5 검증 명령

```sh
npm run check
npm run build:android
npm run build:web
npx playwright install chromium
npm run test:e2e
```

`build:android`는 `dist/android`에 Metro/Hermes 번들을 생성한다. `build:web`은 보조 검증용 웹 출력을 `dist/web`에 생성한다. `test:e2e`는 웹 출력을 생성한 뒤 작은 모바일 뷰포트에서 탭 이동·저장/해제 상태 공유·상세·잘못된 ID의 복귀를 검증한다. 결과와 스크린샷은 `test-results/`에 저장하며 해당 폴더는 커밋하지 않는다.

검증 결과: Node.js 24.22.3에서 타입·포맷 검사, 계약 테스트 22개, UI 통합 테스트 2개, Android·웹 번들 생성 통과. 브라우저 다운로드 CDN이 응답하지 않아 이번 UI 검증은 별도 설치한 Chromium 경로를 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`에 지정해 수행했다. 일반 개발 환경에서는 위의 Playwright 기본 설치 명령을 사용한다.

아래는 390×844 웹 뷰포트에서 캡처한 화면이며 Android 실기기 캡처가 아니다.

- [홈 화면](screenshots/t01_home.png)
- [공지 찾기 화면](screenshots/t01_discover.png)
- [공통 상세 화면](screenshots/t01_detail.png)

## 6 참고

- [Expo 프로젝트 생성](https://docs.expo.dev/get-started/create-a-project/): 현재 Expo Go 실기기 확인에 맞춰 SDK 57 선택.
- [Expo Router 설치](https://docs.expo.dev/router/installation/): 기존 shared 프로젝트에 Router 진입점·호환 패키지 추가.
- [Node.js 릴리스](https://nodejs.org/en/about/previous-releases): 팀 권장 런타임은 Node 24 LTS, 실행 버전은 `.nvmrc`로 고정.
