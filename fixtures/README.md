# 공지 샘플 사용법

## 1 샘플의 출처

`synthetic/`의 모든 본문과 분석 결과는 수작업으로 만든 **가상 데이터**다. 실제 학교 공지에서 가져오거나 AI를 호출해 만든 결과가 아니다. `example.invalid` 주소는 네트워크 요청용이 아니다. `sourceId`는 계약의 허용 값을 사용하지만 실제 학교 수집 데이터라는 뜻은 아니다.

실제 HTML은 T02에서 `fixtures/collected/`에 별도로 추가한다. 원문 URL·수집 시각·출처를 기록하고 실제 날짜나 내용을 시연 목적으로 고치지 않는다. 현재 실제 수집 fixture는 없다.

## 2 제공 사례

| export                        | 용도                            | 기대 동작                                                     |
| ----------------------------- | ------------------------------- | ------------------------------------------------------------- |
| `normalNoticeFixture`         | 확정 마감·행사·준비물·신청 URL  | 관심 저장 후 준비물·일정 연결                                 |
| `dateOnlyNoticeFixture`       | 날짜만 있는 신청 마감           | 시각은 null 유지, 당일에는 시각 미확인 표시                   |
| `unknownYearNoticeFixture`    | 선착순 모집·연도 없는 활동일    | 신청 마감 생성 금지, 활동일 자동 일정 제외                    |
| `attachmentOnlyNoticeFixture` | 첨부·이미지에 세부 정보         | 원문 확인 안내, 빈 체크리스트를 준비물 없음으로 단정하지 않음 |
| `changedNoticeFixture`        | 정상 샘플과 같은 ID의 변경 본문 | 기존 체크 기록 유지, 마감·준비물 변경 표시                    |
| `rateLimitedFixture`          | HTTP 429                        | Retry-After 60초 동안 AI 큐 중지                              |
| `invalidModelOutputFixture`   | HTTP 502                        | 기존 성공 분석 보존, 수동 재시도 제공                         |

`syntheticNoticeFixtures`에는 정상 원문과 변경 원문이 함께 있다. 둘은 같은 공지이므로 이 배열을 화면 목록으로 그대로 사용하면 안 된다. 초기 화면에서는 앞의 네 사례를 사용하고, 변경 검증 때 같은 ID에 `changedNoticeFixture`를 반영한다.

## 3 A·B의 연결 예시

```ts
import {
  DEMO_NOW,
  demoProfile,
  normalNoticeFixture,
} from './fixtures/synthetic/notices';

const { notice, request, analysis } = normalNoticeFixture;
// notice: B의 repository에 넘길 CollectedNotice (camelCase)
// request: C의 POST /analyze-notice 입력 (snake_case)
// analysis: 성공 응답 AnalysisEnvelope (API/저장 형식)
// demoProfile: A의 프로필·추천 화면 초기 입력
// DEMO_NOW: B의 날짜·알림 순수 함수 테스트에 주입할 고정 현재 시각
```

경로는 저장소 루트 기준이며 사용하는 파일 위치에 맞춰 바꾼다. 공통 상세의 표시 모델로 변환하는 경계는 A·B와 합의한다. 화면마다 API 필드를 변환하지 않는다.

현재 시각은 `2026-11-13T10:00:00Z`로 고정한다. 정상 샘플의 마감 알림 정책상 시각은 `2026-11-19T00:00:00Z`(한국시간 전날 09:00)다. 실제 기기의 현재 시각이 이 날짜를 지났다면 알림 예약 대상이 아니다. 실제 알림 예약 테스트는 별도 테스트 데이터로 수행하고 테스트임을 표시한다.

사용자 진행·체크 기록은 B가 관심 저장 동작으로 생성한다. 샘플에는 사용자 DB 행이나 체크 항목 UUID를 미리 넣지 않았다. 최초 저장 → 체크 → 변경 원문 반영 후에도 같은 체크 기록이 남는지 B의 구현에서 검증한다.

## 4 샘플 편집과 검증

샘플의 `contentHash`는 정규화 c1 문자열을 UTF-8 SHA-256으로 계산한 실제 값이다. 본문·링크·첨부·이미지 여부를 편집하면 해시를 다시 계산하고, 응답의 근거·날짜·준비물도 함께 수정한다. `makeFixture`가 요청과 응답 봉투를 구성하므로 ID·해시를 별도로 중복 입력하지 않는다.

```sh
npm test
```

샘플별 고정 해시·근거 문구·계약 검증이 실행된다. 실제 AI의 의미 정확성, DB 보존, OS 알림 예약이 검증되는 것은 아니다.
