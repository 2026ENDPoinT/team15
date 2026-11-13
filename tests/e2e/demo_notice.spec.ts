import { expect, test } from '@playwright/test';

test('시연 새로고침이 관심 공지를 첫 카드와 메인에 표시한다', async ({
  page,
}) => {
  test.skip(
    process.env.EXPO_PUBLIC_NOTICE_DEMO !== '1',
    '시연 모드 웹 번들이 필요합니다.',
  );
  await page.goto('/');
  await page.getByRole('tab', { name: '설정', exact: true }).click();
  await page.getByRole('radio', { name: '정보통신대학', exact: true }).click();
  await page.getByRole('button', { name: '설정 저장', exact: true }).click();
  await expect(
    page.getByText('설정을 저장했어요. 맞춤 공지에 반영했습니다.'),
  ).toBeVisible();
  await page.getByRole('tab', { name: '맞춤 공지', exact: true }).click();
  await page
    .getByRole('button', { name: '시연 공지 새로고침', exact: true })
    .click();
  const card = page.getByTestId('discover-card');
  await expect(card.getByText('새 공지', { exact: true })).toBeVisible();
  await expect(
    card.getByRole('heading', { name: '정보통신대학 장학금 신청 안내' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '실제 공지 새로고침', exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: '메인', exact: true }).click();
  await expect(
    page.getByRole('heading', {
      name: '정보통신대학 장학금 신청 안내',
      exact: true,
    }),
  ).toBeVisible();
});
