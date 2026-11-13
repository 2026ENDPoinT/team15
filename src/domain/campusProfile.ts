import type { Profile } from '../../shared/contracts';

export const colleges = [
  '공과대학',
  '정보통신대학',
  '에너지바이오대학',
  '조형대학',
  '인문사회대학',
  '기술경영융합대학',
  '미래융합대학',
  '창의융합대학',
  '교양대학',
  '국제대학',
] as const;

export type College = (typeof colleges)[number];
export type CampusProfile = Omit<Profile, 'universityId'> & {
  college: College | null;
  customKeywords: string[];
};

export const defaultCampusProfile: CampusProfile = {
  college: null,
  department: '컴퓨터공학과',
  grade: 3,
  enrollment: 'enrolled',
  keywords: ['대회', '장학금'],
  customKeywords: [],
};

export function parseCollege(value: string): College | undefined {
  const name = value.replace(/\s+/g, '').replace(/대학교$/, '대학');
  return colleges.find((college) => college === name);
}
