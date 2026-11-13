import type { NoticeAnalysis } from '../../shared/contracts';
import { parseCollege, type College } from './campusProfile';

type Eligibility = NoticeAnalysis['eligibility'];

export function matchesCollege(
  selected: College | null,
  title: string,
  body: string,
  eligibility?: Eligibility,
): boolean {
  if (!selected || eligibility?.departments.mode === 'all') return true;
  const source = `${title}\n${body}`;
  if (
    /(?:전교생|전\s*학과|전\s*단과대학|(?:본교|전체|모든)\s*(?:학부생|재학생|학생)|누구나)/.test(
      source,
    )
  )
    return true;

  // Only a closed list on an audience line is evidence. A sponsor or a
  // bracketed board label does not establish who can participate.
  const audienceLines = source.split(/\r?\n/).flatMap((line) => {
    const match = line
      .trim()
      .match(
        /^(?:(?:[가-하]|\d+)\.\s*)?(?:(?:참여|참가|신청|모집|지원|수강|선발)\s*)?대상\s*[:：]\s*(.+)$/,
      );
    return match?.[1] ? [match[1]] : [];
  });
  const audiences = audienceLines.map((line) =>
    line
      .replace(/[.。]$/, '')
      .split(/[,，·ㆍ、/]|\s+및\s+/)
      .map((part) =>
        parseCollege(
          part
            .trim()
            .replace(
              /\s*(?:소속\s*)?(?:학부\s*)?(?:재학생|학부생|학생)\s*(?:만)?$/,
              '',
            ),
        ),
      ),
  );
  if (audiences.length && audiences.every((group) => group.every(Boolean))) {
    return audiences.some((group) => group.includes(selected));
  }

  const scope = eligibility?.departments;
  if (eligibility?.comparison !== 'all_of' || scope?.mode !== 'specific')
    return true;
  const candidates = scope.values.map(parseCollege);
  return (
    candidates.some((college) => !college) || candidates.includes(selected)
  );
}
