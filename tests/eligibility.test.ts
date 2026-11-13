import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  normalNoticeFixture,
  demoProfile,
} from '../fixtures/synthetic/notices';
import { evaluateEligibility } from '../src/domain/eligibility';

test('T09 조건 판정: 명시된 학년 불일치, 미확인, 복합 OR를 구분한다', () => {
  const analysis = structuredClone(normalNoticeFixture.analysis.data);
  const evaluate = () =>
    evaluateEligibility({ ...demoProfile, grade: 1 }, analysis, true);
  assert.equal(evaluate().result, 'mismatch');
  analysis.eligibility.grades = { mode: 'unknown', values: [], evidence: null };
  assert.equal(evaluate().result, 'needs_review');
  analysis.eligibility.grades = {
    mode: 'specific',
    values: [3],
    evidence: '3학년 또는 다른 복합 조건',
  };
  analysis.eligibility.comparison = 'manual_review';
  assert.equal(evaluate().result, 'needs_review');
});

test('최신 분석만 기본 조건을 비교하고 미분석·이전 분석·추가 조건을 확정하지 않는다', () => {
  const analysis = structuredClone(normalNoticeFixture.analysis.data);
  assert.equal(
    evaluateEligibility(demoProfile, analysis, true).result,
    'basic_match',
  );
  assert.equal(
    evaluateEligibility(demoProfile, analysis, false).result,
    'needs_review',
  );
  assert.equal(
    evaluateEligibility(demoProfile, null, false).result,
    'needs_review',
  );
  analysis.eligibility.other_conditions = ['소득 기준 확인 필요'];
  assert.equal(
    evaluateEligibility(demoProfile, analysis, true).result,
    'needs_review',
  );
  assert.equal(
    evaluateEligibility({ ...demoProfile, grade: 1 }, analysis, true).result,
    'mismatch',
  );
});

test('학과 별칭은 컴공만 연결하고 다른 전공·5학년 이상·기타 학적을 임의 추정하지 않는다', () => {
  const analysis = structuredClone(normalNoticeFixture.analysis.data);
  analysis.eligibility.departments = {
    mode: 'specific',
    values: ['컴공과'],
    evidence: '컴공과 재학생',
  };
  assert.equal(
    evaluateEligibility(demoProfile, analysis, true).result,
    'basic_match',
  );
  assert.equal(
    evaluateEligibility(
      { ...demoProfile, department: '소프트웨어학과' },
      analysis,
      true,
    ).result,
    'mismatch',
  );
  assert.equal(
    evaluateEligibility({ ...demoProfile, grade: 5 }, analysis, true).result,
    'needs_review',
  );
  assert.equal(
    evaluateEligibility({ ...demoProfile, enrollment: 'other' }, analysis, true)
      .result,
    'needs_review',
  );
  assert.equal(
    evaluateEligibility({ ...demoProfile, enrollment: 'leave' }, analysis, true)
      .result,
    'mismatch',
  );
});
