import { expect, test } from './fixtures';
import { notices } from '../../src/features/demo/campusNotices';

test('기본 실행에서 가상 카드와 이전 가상 상세 화면을 표시하지 않는다', async ({
  page,
}) => {
  test.skip(process.env.EXPO_PUBLIC_NOTICE_DEMO === '1', '시연 모드 제외');
  await page.route('https://**.seoultech.ac.kr/**', (route) =>
    route.fulfill({ status: 503, body: 'Offline test' }),
  );
  await page.goto('/');
  for (const tab of ['메인', '맞춤 공지', '휴지통']) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    const active = page.getByTestId('active-page');
    for (const notice of notices) {
      await expect(active.getByText(notice.title, { exact: true })).toHaveCount(
        0,
      );
    }
  }
  await expect(
    page.getByText('휴지통이 비어 있어요.', { exact: true }),
  ).toBeVisible();
  await page.goto(`/notice/${encodeURIComponent(notices[0]!.id)}`);
  await expect(
    page.getByText('공지를 찾을 수 없어요', { exact: true }),
  ).toBeVisible();
});
