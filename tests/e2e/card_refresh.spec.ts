import { expect, test } from '@playwright/test';

type DatabaseControl = typeof window & {
  pauseDatabase(): void;
  resumeDatabase(fail?: boolean): void;
};

for (const scenario of [
  {
    tab: '메인',
    title: 'AI 캠퍼스 해커톤 참가자 모집',
    action: '← 휴지통으로 이동',
    destination: '휴지통',
  },
  {
    tab: '휴지통',
    title: '겨울학기 글로벌 교류 프로그램 설명회',
    action: '복구 →',
    destination: '맞춤 공지',
  },
  {
    tab: '휴지통',
    title: '겨울학기 글로벌 교류 프로그램 설명회',
    action: '← 삭제',
    destination: null,
  },
]) {
  for (const fail of [false, true]) {
    test(`${scenario.tab} ${scenario.action}: 저장 대기 중 즉시 갱신하고 ${fail ? '실패하면 복원한다' : '저장 후 유지한다'}`, async ({
      page,
    }) => {
      await page.addInitScript(() => {
        const original = Worker.prototype.postMessage;
        const queued: ((fail: boolean) => void)[] = [];
        let paused = false;
        Worker.prototype.postMessage = function (...args) {
          const message = args[0] as {
            id: number;
            type: string;
            data?: { source?: string };
          };
          const send = (fail: boolean) => {
            // Fail only the state-changing SQL preparation, before it commits.
            if (
              fail &&
              message.type === 'prepare' &&
              /(?:INSERT INTO|UPDATE) user_notices/.test(
                message.data?.source ?? '',
              )
            ) {
              this.dispatchEvent(
                new MessageEvent('message', {
                  data: {
                    id: message.id,
                    error: 'Synthetic database write failure',
                  },
                }),
              );
            } else original.apply(this, args as Parameters<typeof original>);
          };
          if (paused) queued.push(send);
          else send(false);
        };
        Object.assign(window, {
          pauseDatabase: () => {
            paused = true;
          },
          resumeDatabase: (fail = false) => {
            paused = false;
            queued.splice(0).forEach((send) => send(fail));
          },
        });
      });
      await page.goto('/');
      await page.getByRole('tab', { name: scenario.tab, exact: true }).click();
      const active = page.getByTestId('active-page');
      const title = active.getByText(scenario.title, { exact: true });
      await expect(title).toBeVisible();
      await page.evaluate(() => (window as DatabaseControl).pauseDatabase());
      try {
        await title
          .locator('..')
          .getByRole('button', { name: scenario.action, exact: true })
          .click();
        await expect(title).toHaveCount(0, { timeout: 1500 });
        // Switching tabs must not bring a pending card back into its old list.
        await page
          .getByRole('tab', {
            name: scenario.destination ?? '메인',
            exact: true,
          })
          .click();
        if (scenario.destination === '휴지통')
          await expect(title).toBeVisible();
        await page
          .getByRole('tab', { name: scenario.tab, exact: true })
          .click();
        await expect(title).toHaveCount(0);
      } finally {
        await page.evaluate(
          (fail) => (window as DatabaseControl).resumeDatabase(fail),
          fail,
        );
      }
      if (fail) {
        await expect(
          page.getByText('공지 상태를 저장하지 못했어요. 다시 시도해 주세요.', {
            exact: true,
          }),
        ).toBeVisible();
        await expect(title).toBeVisible();
      } else {
        await expect(
          page.getByText(
            scenario.action === '복구 →'
              ? '맞춤 공지로 복구했어요.'
              : scenario.action === '← 삭제'
                ? '공지를 영구 삭제했어요.'
                : '휴지통으로 옮겼어요.',
            { exact: true },
          ),
        ).toBeVisible();
      }
      await page.reload();
      await page.getByRole('tab', { name: scenario.tab, exact: true }).click();
      if (fail) await expect(title).toBeVisible();
      else await expect(title).toHaveCount(0);
    });
  }
}
