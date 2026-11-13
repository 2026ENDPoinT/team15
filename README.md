# team15

ENDPoinT 해커톤 2026 Team 15

서울과기대 맞춤 공지 앱. [구현 설계안](docs/campus_notice_implementation_design.md)을 구현 기준으로 사용한다. 이전 기획서와 계약이 다르면 구현 설계안의 **1.1 계약**을 따른다.

## 1 현재 구현 범위

T01의 Expo 앱 뼈대와 역할 C의 공통 계약·가상 샘플을 구현했다. 홈·공지 찾기·상세가 같은 공지를 표시하며 관심 저장 상태를 공유한다. **Android 실기기 확인은 보류 중**이다. SQLite 영속 저장, 실제 수집, AI Worker, 알림은 아직 구현하지 않았다.

| 경로                     | 내용                                               |
| ------------------------ | -------------------------------------------------- |
| `app/`                   | Expo Router 홈·찾기 탭과 공통 상세                 |
| `src/features/demo/`     | 가상 공지 읽기 모델과 메모리 상태 공유             |
| `src/components/`        | 공통 카드·버튼·화면 구성                           |
| `shared/contracts.ts`    | Zod 스키마, 추론 타입, 공통 사용자 동작 인터페이스 |
| `shared/canonicalize.ts` | 정규화 c1, 플랫폼 SHA-256 함수 주입                |
| `shared/mappers.ts`      | 수집 공지 → AI 요청 변환                           |
| `fixtures/synthetic/`    | 가상 공지 5건, 오류 응답, 시연 프로필              |
| `tests/*.test.ts`        | 계약·날짜 유효성·정규화·샘플 일관성 검증           |

[T01 팀 인계 및 실기기 체크리스트](docs/campus_notice_t01_handoff.md), [역할 C 착수 계획](docs/campus_notice_c_startup_plan.md), [샘플 사용법](fixtures/README.md)을 참고한다. 샘플은 실제 공지나 실제 AI 응답이 아니며, UI에도 가상 데이터임을 표시한다.

## 2 설치와 개발

팀 권장 버전은 **Node.js 24.22.3**이며 `.nvmrc`에 고정한다. 최초 계약은 Node.js 22.23.5로 검증했고 앱은 Node 24에서 검증한다. `engines`는 호환 하한을, `.nvmrc`는 팀 공통 버전을 나타낸다. Expo SDK 57·React Native 0.86.3·React 19.2.3과 `package-lock.json`을 함께 사용한다.

```sh
nvm install
nvm use
npm ci
npm run start
```

Android Expo Go에서 QR을 열어 실행한다. PC와 같은 네트워크를 사용한다. 에뮬레이터가 준비되어 있으면 `npm run android`, 브라우저에서 보조 확인하려면 `npm run web`을 사용한다. 첫 실행은 가상 공지 한 건을 관심 저장한 상태다. 저장·해제는 현재 실행 중에만 유지된다.

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

`build:android`는 Android용 Metro/Hermes 번들만 생성하며 **설치 가능한 APK를 만들지 않는다**. Expo Go 실행과 독립 APK 제출은 구분한다. 웹 테스트도 실기기 확인을 대신하지 않는다. 출력은 `dist/`, UI 테스트 결과는 `test-results/`에 저장한다. Worker 배포 명령은 T05에서 추가한다.

## 3 설정과 비밀 정보

현재 검증에는 API 키나 계정이 필요 없다. 이후 AI 키는 Worker 비밀 설정에, 시연 접근 토큰은 기기의 SecureStore에 저장한다. `.env`·`.dev.vars`의 실제 값은 커밋하지 않는다.
