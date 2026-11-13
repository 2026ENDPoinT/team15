import { expect, test } from '@playwright/test';

test('맞춤 공지는 한 장씩 처리하고 스크롤 없이 표시하고 상세는 별도 화면에서 읽는다', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto('/');
  const discover = page.getByRole('tab', { name: '맞춤 공지', exact: true });
  await discover.click();
  await expect(discover).toBeEnabled();
  const active = page.getByTestId('active-page');
  const card = active.getByTestId('discover-card');
  const body = card.getByTestId('discover-card-body');
  const scholarship = '2026학년도 2학기 장학금 신청 안내';
  const next = '학부생 AI 연구 프로젝트 참여자 추가 모집';
  await expect(card).toHaveCount(1);
  await expect(card.getByText(scholarship, { exact: true })).toBeVisible();
  await expect(active.getByText(next, { exact: true })).toHaveCount(0);
  await expect(active.getByText('나에게 맞는 새로운 기회')).toHaveCount(0);
  const originalHeight = (await card.boundingBox())!.height;
  await expect(
    card.getByRole('button', { name: '선택 →', exact: true }),
  ).toBeInViewport();
  await active.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  expect(await active.evaluate((el) => el.scrollTop)).toBe(0);
  await card.getByRole('button', { name: '공지 자세히 보기 ↗' }).click();
  const sheet = page.getByTestId('notice-sheet-content');
  await expect(sheet.getByTestId(/^notice-detail-/)).toBeVisible();
  await sheet.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(sheet).toHaveCSS('overflow-y', 'auto');
  await page.screenshot({ path: testInfo.outputPath('discover-details.png') });
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(body.getByTestId(/^notice-detail-/)).toHaveCount(0);
  expect((await card.boundingBox())!.height).toBe(originalHeight);
  await page.screenshot({ path: testInfo.outputPath('discover-fixed.png') });
  await card.getByRole('button', { name: '↕ 보류', exact: true }).click();
  await expect(card.getByText(next, { exact: true })).toBeVisible();
  await expect(card.getByText(scholarship, { exact: true })).toHaveCount(0);
  await expect(
    card.getByRole('button', { name: '공지 자세히 보기 ↗' }),
  ).toHaveAttribute('aria-expanded', 'false');
  await card.getByRole('button', { name: '↕ 보류', exact: true }).click();
  await expect(card.getByText(scholarship, { exact: true })).toBeVisible();
  await card.getByRole('button', { name: '↕ 보류', exact: true }).click();
  await expect(card.getByText(next, { exact: true })).toBeVisible();
  await card.getByRole('button', { name: '← 버리기', exact: true }).click();
  await expect(card.getByText(scholarship, { exact: true })).toBeVisible();
  await card.getByRole('button', { name: '↕ 보류', exact: true }).click();
  await expect(card.getByText(scholarship, { exact: true })).toBeVisible();
  const home = page.getByRole('tab', { name: '메인', exact: true });
  await home.click();
  await expect(home).toBeEnabled();
  await discover.click();
  await expect(discover).toBeEnabled();
  await expect(card.getByText(scholarship, { exact: true })).toBeVisible();
  await card.getByRole('button', { name: '선택 →', exact: true }).click();
  await expect(card).toHaveCount(0);
});

test('상단 당기기는 새로고침만 실행하고 카드와 화면 위치를 유지한다', async ({
  page,
}) => {
  let requests = 0;
  await page.route('https://**.seoultech.ac.kr/**', async (route) => {
    requests += 1;
    await route.fulfill({ status: 503, body: 'Test collection unavailable' });
  });
  await page.clock.install({ time: new Date('2026-11-14T03:00:00Z') });
  await page.goto('/');
  await page.getByRole('tab', { name: '맞춤 공지', exact: true }).click();
  const refresh = page.getByRole('button', {
    name: '공지 새로고침',
    exact: true,
  });
  await expect(refresh).toBeEnabled();
  await page.clock.fastForward(31_000);
  const title = await page
    .getByTestId('discover-card')
    .getByRole('heading')
    .innerText();
  const before = requests;
  const header = (await page
    .getByTestId('discover-refresh-area')
    .boundingBox())!;
  await page.mouse.move(header.x + 15, header.y + 10);
  await page.mouse.down();
  await page.mouse.move(header.x + 15, header.y + 90, { steps: 12 });
  await page.mouse.up();
  await expect.poll(() => requests).toBeGreaterThan(before);
  await expect(refresh).toBeEnabled();
  await expect(
    page.getByTestId('discover-card').getByRole('heading'),
  ).toHaveText(title);
  expect(
    await page.getByTestId('active-page').evaluate((el) => el.scrollTop),
  ).toBe(0);
});

test('저장 응답을 기다리는 동안에도 다음 공지를 연속 처리한다', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    const original = Worker.prototype.postMessage;
    const queued: (() => void)[] = [];
    let paused = false;
    Worker.prototype.postMessage = function (...args) {
      const send = () =>
        original.apply(this, args as Parameters<typeof original>);
      if (paused) queued.push(send);
      else send();
    };
    Object.assign(window, {
      pauseDatabase: () => {
        paused = true;
      },
      resumeDatabase: () => {
        paused = false;
        queued.splice(0).forEach((send) => send());
      },
    });
  });
  await page.goto('/');
  const discover = page.getByRole('tab', { name: '맞춤 공지', exact: true });
  await discover.click();
  await expect(discover).toBeEnabled();
  const card = page.getByTestId('active-page').getByTestId('discover-card');
  await expect(card.getByRole('heading')).toHaveText(
    '2026학년도 2학기 장학금 신청 안내',
  );
  await page.evaluate(() =>
    (window as typeof window & { pauseDatabase(): void }).pauseDatabase(),
  );
  try {
    await card.getByRole('button', { name: '선택 →', exact: true }).click();
    await expect(card.getByRole('heading')).toHaveText(
      '학부생 AI 연구 프로젝트 참여자 추가 모집',
      { timeout: 1500 },
    );
    await page.screenshot({
      path: testInfo.outputPath('discover-next-pending.png'),
    });
    await card.getByRole('button', { name: '← 버리기', exact: true }).click();
    await expect(card).toHaveCount(0, { timeout: 1500 });
  } finally {
    await page.evaluate(() =>
      (window as typeof window & { resumeDatabase(): void }).resumeDatabase(),
    );
  }
  await page.getByRole('tab', { name: '메인', exact: true }).click();
  await expect(
    page
      .getByTestId('active-page')
      .getByText('2026학년도 2학기 장학금 신청 안내', { exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: '휴지통', exact: true }).click();
  await expect(
    page
      .getByTestId('active-page')
      .getByText('학부생 AI 연구 프로젝트 참여자 추가 모집', { exact: true }),
  ).toBeVisible();
});
