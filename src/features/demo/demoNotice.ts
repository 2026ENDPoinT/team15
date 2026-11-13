import {
  normalNoticeFixture,
  demoProfile,
} from '../../../fixtures/synthetic/notices';

// T01 전용 읽기 모델. API 필드를 화면마다 변환하지 않는다.
const { notice, analysis } = normalNoticeFixture;
export const demoNotice = {
  id: notice.id,
  title: notice.title,
  sourceLabel: '컴퓨터공학과 · 가상 공지',
  publishedLabel: '2026.11.13',
  summary: analysis.data.summary,
  tags: analysis.data.tags,
  benefits: analysis.data.benefits,
  eligibilityLabel: '전 학과 2~4학년 재학생',
  eligibilityEvidence: analysis.data.eligibility.grades.evidence,
  checklist: analysis.data.checklist,
  activity: analysis.data.activity?.location_text ?? '장소 미확인',
  events: analysis.data.events.map((event) => ({
    type: event.type,
    label: event.label,
    date: event.date,
    time: event.time,
    evidence: event.evidence,
    displayDate: event.date
      ? event.date.replaceAll('-', '.')
      : '날짜 확인 필요',
  })),
};
export const demoProfileLabel = `${demoProfile.department} ${demoProfile.grade}학년`;
export type DemoNotice = typeof demoNotice;
