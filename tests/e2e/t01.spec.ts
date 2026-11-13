import { expect, test } from '@playwright/test';

const title = '[가상] AI 캠퍼스 해커톤 참가자 모집';

test('같은 공지를 홈·찾기·상세에서 보고 관심 저장 상태를 공유한다', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByText('저장한 공지', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('link', { name: `${title} 상세 보기`, exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('home.png'),
    fullPage: true,
  });

  await page.getByRole('tab', { name: '공지 찾기' }).click();
  await expect(
    page.getByRole('link', { name: `${title} 상세 보기`, exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('discover.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: '관심 해제', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '관심 저장', exact: true }),
  ).toBeVisible();

  await page.getByRole('tab', { name: '홈', exact: true }).click();
  await expect(page.getByText('아직 저장한 공지가 없어요')).toBeVisible();
  await page.getByRole('button', { name: '공지 찾으러 가기' }).click();
  await page.getByRole('button', { name: '관심 저장', exact: true }).click();
  await page.getByRole('tab', { name: '홈', exact: true }).click();
  await expect(
    page.getByRole('link', { name: `${title} 상세 보기`, exact: true }),
  ).toBeVisible();

  await page
    .getByRole('link', { name: `${title} 상세 보기`, exact: true })
    .click();
  await expect(page.getByText('어떤 활동인가요?')).toBeVisible();
  await expect(page.getByText('• 참가 신청서 준비')).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('detail.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: '관심 해제', exact: true }).click();
  await page.getByRole('button', { name: '뒤로 가기' }).click();
  await expect(page.getByText('아직 저장한 공지가 없어요')).toBeVisible();

  // T01의 메모리 상태는 실행을 새로 시작하면 초기 샘플로 복원된다.
  await page.reload();
  await expect(
    page.getByRole('link', { name: `${title} 상세 보기`, exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('직접 연 잘못된 공지 ID에서 홈으로 복귀할 수 있다', async ({ page }) => {
  await page.goto('/notice/missing');
  await expect(page.getByText('공지를 찾을 수 없어요')).toBeVisible();
  await page.getByRole('button', { name: '홈으로 이동' }).click();
  await expect(
    page.getByRole('link', { name: `${title} 상세 보기`, exact: true }),
  ).toBeVisible();
});
