import { expect, test } from '@playwright/test';

test('맞춤 공지의 상세를 카드별로 펼치고 접으며 도움말 모달과 구분한다', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  const discover = page.getByRole('tab', { name: '맞춤 공지', exact: true });
  await discover.click();
  await expect(discover).toBeEnabled();
  await expect(discover).toHaveAttribute('aria-selected', 'true');
  const active = page.getByTestId('active-page');
  const first = active
    .getByText('2026학년도 2학기 장학금 신청 안내', { exact: true })
    .locator('..');
  const second = active
    .getByText('학부생 AI 연구 프로젝트 참여자 추가 모집', { exact: true })
    .locator('..');
  const firstHeight = (await first.boundingBox())!.height;
  const secondHeight = (await second.boundingBox())!.height;
  await first
    .getByRole('button', { name: '공지 자세히 보기 ∨', exact: true })
    .click();
  await expect(
    first.getByRole('button', { name: '상세 접기 ∧', exact: true }),
  ).toHaveAttribute('aria-expanded', 'true');
  await expect(first.getByText('상세 내용', { exact: true })).toBeVisible();
  expect((await first.boundingBox())!.height).toBeGreaterThan(firstHeight);
  expect((await second.boundingBox())!.height).toBe(secondHeight);
  await expect(
    page.getByRole('button', { name: '닫기', exact: true }),
  ).toHaveCount(0);
  await second
    .getByRole('button', { name: '공지 자세히 보기 ∨', exact: true })
    .click();
  await expect(active.getByText('상세 내용', { exact: true })).toHaveCount(2);
  await first.getByRole('button', { name: '상세 접기 ∧', exact: true }).click();
  await expect(first.getByText('상세 내용', { exact: true })).toHaveCount(0);
  await expect(second.getByText('상세 내용', { exact: true })).toBeVisible();
  await second.getByText('상세 내용', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath('inline-details.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: '도움말', exact: true }).click();
  await expect(page.getByText('사용 방법 안내', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(second.getByText('상세 내용', { exact: true })).toBeVisible();
});
