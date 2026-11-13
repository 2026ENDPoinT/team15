import type { NoticeAnalysis, Profile } from '../../shared/contracts';

export interface EligibilityResult {
  result: 'basic_match' | 'mismatch' | 'needs_review';
  reasons: string[];
}

const departmentAliases: Record<string, string> = {
  컴공: '컴퓨터공학과',
  컴공과: '컴퓨터공학과',
  컴퓨터공학과: '컴퓨터공학과',
};
function department(value: string) {
  const normalized = value.normalize('NFKC').replace(/\s+/g, '');
  return departmentAliases[normalized] ?? normalized;
}

export function evaluateEligibility(
  profile: Pick<Profile, 'department' | 'grade' | 'enrollment'>,
  analysis: NoticeAnalysis | null,
  fresh: boolean,
): EligibilityResult {
  if (!fresh || !analysis)
    return { result: 'needs_review', reasons: ['최신 분석을 확인해야 해요.'] };
  const conditions = analysis.eligibility;
  if (conditions.comparison === 'manual_review')
    return {
      result: 'needs_review',
      reasons: ['복합 지원 조건은 원문에서 확인해 주세요.'],
    };
  const mismatches: string[] = [];
  const unknowns: string[] = [];
  const checks = [
    {
      label: '학과',
      scope: conditions.departments,
      matches: conditions.departments.values.some(
        (value) => department(value) === department(profile.department),
      ),
      unknownProfile: !profile.department.trim(),
    },
    {
      label: '학년',
      scope: conditions.grades,
      matches: conditions.grades.values.includes(profile.grade),
      unknownProfile: profile.grade === 5,
    },
    {
      label: '학적',
      scope: conditions.enrollments,
      matches: conditions.enrollments.values.includes(profile.enrollment),
      unknownProfile: profile.enrollment === 'other',
    },
  ];
  for (const { label, scope, matches, unknownProfile } of checks) {
    if (scope.mode === 'all') continue;
    if (scope.mode === 'unknown' || unknownProfile)
      unknowns.push(`${label} 조건을 직접 확인해 주세요.`);
    else if (!matches)
      mismatches.push(`${label} 조건이 입력한 프로필과 달라요.`);
  }
  if (mismatches.length) return { result: 'mismatch', reasons: mismatches };
  if (conditions.other_conditions.length)
    unknowns.push('추가 지원 조건을 원문에서 확인해 주세요.');
  if (unknowns.length) return { result: 'needs_review', reasons: unknowns };
  return {
    result: 'basic_match',
    reasons: [
      '확인된 학과·학년·학적 조건이 맞아요. 최종 자격은 원문을 확인하세요.',
    ],
  };
}
