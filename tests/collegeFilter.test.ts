import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchesCollege } from '../src/domain/collegeFilter';

test('소속과 다른 단과대학만 모집하는 공지를 제외한다', () => {
  const college = '정보통신대학';
  assert.equal(
    matchesCollege(college, '학술제', '참가 대상: 에너지바이오대학 재학생'),
    false,
  );
  assert.equal(
    matchesCollege(
      college,
      '교육',
      '가. 신청 대상: 공과대학·에너지바이오대학 학생만',
    ),
    false,
  );
  assert.equal(
    matchesCollege(
      college,
      '교육',
      '모집 대상: 에너지바이오대학 및 정보통신대학 학생',
    ),
    true,
  );
  assert.equal(matchesCollege(null, '교육', '모집 대상: 공과대학 학생'), true);
});

test('주관 단과대학이나 대상이 불명확한 공지와 전교생 대상 공지는 유지한다', () => {
  const college = '정보통신대학';
  assert.equal(
    matchesCollege(college, '[공과대학] 특강', '공과대학에서 개최합니다.'),
    true,
  );
  assert.equal(
    matchesCollege(college, '[공과대학] 특강', '참가 대상: 전체 학생'),
    true,
  );
  assert.equal(
    matchesCollege(
      college,
      '교육',
      '대상: 공과대학 재학생, 타 대학 학생은 문의',
    ),
    true,
  );
});
