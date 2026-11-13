import { expect, test } from '@playwright/test';

test('HTML과 같은 네 화면에서 분류·보류·복구·설정이 연결된다', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByText('선택한 기회를 한눈에')).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('home.png'),
    fullPage: true,
  });
  await page.getByRole('tab', { name: '맞춤 공지', exact: true }).click();
  const scholarship = page.getByText('2026학년도 2학기 장학금 신청 안내', {
    exact: true,
  });
  await expect(scholarship).toBeVisible();
  await page
    .getByRole('button', { name: '↕ 보류', exact: true })
    .first()
    .click();
  await expect(scholarship).toHaveCount(0);
  await page.getByRole('tab', { name: '메인', exact: true }).click();
  await page.getByRole('tab', { name: '맞춤 공지', exact: true }).click();
  await expect(scholarship).toBeVisible();
  await page
    .getByRole('button', { name: '← 버리기', exact: true })
    .first()
    .click();
  await page.getByRole('tab', { name: '휴지통', exact: true }).click();
  await expect(scholarship).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('trash.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: '복구 →', exact: true })
    .first()
    .click();
  await expect(scholarship).toHaveCount(0);
  await page.getByRole('tab', { name: '맞춤 공지', exact: true }).click();
  await page
    .getByRole('button', { name: '선택 →', exact: true })
    .first()
    .click();
  await page.getByRole('tab', { name: '메인', exact: true }).click();
  await expect(scholarship).toBeVisible();
  await page
    .getByRole('button', { name: '공지 자세히 보기 ↗', exact: true })
    .first()
    .click();
  await page
    .getByRole('button', { name: '체크하기 · 참가 신청서 준비' })
    .click();
  await expect(
    page.getByRole('button', { name: '체크됨 · 참가 신청서 준비' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '준비 중으로 변경' }).click();
  await expect(page.getByText('신청 상태 · 준비 중')).toBeVisible();
  await page.reload();
  await expect(scholarship).toBeVisible();
  await page
    .getByRole('button', { name: '공지 자세히 보기 ↗', exact: true })
    .first()
    .click();
  await expect(
    page.getByRole('button', { name: '체크됨 · 참가 신청서 준비' }),
  ).toBeVisible();
  await expect(page.getByText('신청 상태 · 준비 중')).toBeVisible();
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await page.getByRole('tab', { name: '설정', exact: true }).click();
  await page.getByRole('button', { name: '대회', exact: true }).click();
  await page.getByRole('button', { name: '장학금', exact: true }).click();
  await page.getByRole('button', { name: '설정 저장', exact: true }).click();
  await expect(
    page.getByText('선호 키워드를 하나 이상 선택해주세요.'),
  ).toBeVisible();
  await page
    .getByRole('textbox', { name: '직접 키워드 입력', exact: true })
    .fill('인공지능');
  await page.getByRole('button', { name: '키워드 추가', exact: true }).click();
  await page.getByRole('button', { name: '설정 저장', exact: true }).click();
  await page.screenshot({
    path: testInfo.outputPath('settings.png'),
    fullPage: true,
  });
  await page.getByRole('tab', { name: '맞춤 공지', exact: true }).click();
  await expect(
    page.getByText('학부생 AI 연구 프로젝트 참여자 추가 모집', { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('discover.png'),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
