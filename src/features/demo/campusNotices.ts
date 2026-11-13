import { normalNoticeFixture } from '../../../fixtures/synthetic/notices';

export type Notice = {
  id: string;
  sourceUrl?: string;
  title: string;
  org: string;
  tags: string[];
  date: string | null;
  time: string | null;
  scheduleText?: string | null;
  summary: string;
  synthetic?: boolean;
  analysisLabel?: string;
};
export const notices: Notice[] = [
  {
    id: normalNoticeFixture.notice.id,
    title: 'AI 캠퍼스 해커톤 참가자 모집',
    org: '창업지원단',
    tags: ['대회', '인공지능'],
    date: '2026-11-20',
    time: '18:00',
    summary: '아이디어를 서비스로 만들어보는 캠퍼스 해커톤입니다.',
  },
  {
    id: 'seoultech_cs:58476:900001000',
    title: '2026학년도 2학기 장학금 신청 안내',
    org: '학생지원과',
    tags: ['장학금'],
    date: '2026-11-25',
    time: '17:00',
    summary: '장학금 신청 자격과 제출 서류를 확인하세요.',
  },
  {
    id: 'seoultech_cs:58476:900001001',
    title: '개발자를 위한 취업 포트폴리오 특강',
    org: '대학일자리본부',
    tags: ['취업', '인턴십'],
    date: '2026-11-27',
    time: '16:00',
    summary: '개발 직무 포트폴리오 준비 방법을 알아보는 특강입니다.',
  },
  {
    id: 'seoultech_cs:58476:900001002',
    title: '겨울학기 글로벌 교류 프로그램 설명회',
    org: '국제교류처',
    tags: ['교환학생'],
    date: '2026-12-03',
    time: '14:00',
    summary: '해외 대학 교류 프로그램의 일정과 준비 사항을 소개합니다.',
  },
  {
    id: 'seoultech_cs:58476:900001003',
    title: '학부생 AI 연구 프로젝트 참여자 추가 모집',
    org: '컴퓨터공학과',
    tags: ['인공지능', '대회'],
    date: null,
    time: null,
    summary:
      '연구 프로젝트에 관심 있는 학부생을 추가 모집합니다. 일정은 추후 안내합니다.',
  },
];
