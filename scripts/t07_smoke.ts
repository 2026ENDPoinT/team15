import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { openNodeNoticeRepository, nodeSha256 } from './node_notice_repository';
import { createAnalysisClient } from '../src/services/analysisClient';
import { createNoticeSync } from '../src/services/noticeSync';
import { collectDetail, fetchHtml } from '../src/sources/collector';
import { createBoardAdapter } from '../src/sources/boards';

// Actual network + deployed Worker + on-disk SQLite. Never emit tokens or provider keys.
try {
  const env = parseEnv(
    readFileSync(new URL('../.env.worker-client', import.meta.url), 'utf8'),
  );
  if (!env.WORKER_URL || !env.DEMO_ACCESS_TOKEN)
    throw new Error('.env.worker-client의 배포 주소·시연 토큰이 필요합니다.');
  const endpoint = new URL('/analyze-notice', env.WORKER_URL).href;
  const directory = new URL(
    `../dist/t07-smoke/${Date.now()}/`,
    import.meta.url,
  );
  mkdirSync(directory, { recursive: true });
  const path = new URL('notices.db', directory).pathname;
  let { db, repository } = await openNodeNoticeRepository(path);
  try {
    let aiCalls = 0;
    const analyze = createAnalysisClient({
      endpoint,
      getToken: async () => env.DEMO_ACCESS_TOKEN ?? null,
    });
    const sync = createNoticeSync({
      repository,
      randomUUID,
      collector: { sha256: nodeSha256 },
      analyze: async (request) => {
        aiCalls++;
        return analyze(request);
      },
      collectSource: async (sourceId, dependencies, options) => {
        const attemptedAt = new Date().toISOString();
        const adapter = createBoardAdapter(sourceId);
        const page = await fetchHtml(adapter.listUrl, dependencies);
        const postId = sourceId === 'seoultech_cs' ? '897737' : '897750';
        const ref = adapter
          .parseList(page.html, page.responseUrl)
          .find((item) => item.postId === postId);
        if (!ref)
          throw new Error(
            '검증할 실제 공지가 목록에 없습니다. 시연 공지를 다시 선정하세요.',
          );
        const notice = await collectDetail(ref, dependencies);
        await options?.onNotice?.(notice);
        return {
          sourceId,
          attemptedAt,
          completedAt: new Date().toISOString(),
          status: 'success',
          notices: [notice],
          failures: [],
        };
      },
      onDataChange: async () => {
        for (const {
          notice,
          disposition,
        } of await repository.listNoticeRecords()) {
          if (disposition !== 'saved') await repository.saveNotice(notice.id);
        }
      },
    });
    await sync.refreshNotices('manual');
    const records = await repository.listNoticeRecords();
    assert.equal(
      records.length,
      2,
      sync.getStatus().message ?? '실제 수집 실패',
    );
    assert.ok(
      records.every(({ analysisFresh }) => analysisFresh),
      sync.getStatus().message ?? '실제 분석 실패',
    );
    const checkpoints = [];
    for (const { notice } of records) {
      const checklist = await repository.getChecklist(notice.id);
      const item = checklist.items[0];
      if (item) await repository.setChecklistCompleted(item.id, true);
      await repository.setProgress(notice.id, 'preparing');
      await sync.analyzeNotice(notice.id);
      checkpoints.push({ id: notice.id, itemId: item?.id ?? null });
    }
    assert.equal(aiCalls, 2, '최신 분석을 다시 호출했습니다.');
    db.close();
    ({ db, repository } = await openNodeNoticeRepository(path));
    const results = [];
    for (const checkpoint of checkpoints) {
      const detail = (await repository.getNoticeDetail(checkpoint.id))!;
      assert.equal(detail.analysisFresh, true);
      assert.equal(detail.disposition, 'saved');
      assert.equal(detail.progress, 'preparing');
      const checklist = await repository.getChecklist(checkpoint.id);
      if (checkpoint.itemId)
        assert.equal(
          checklist.items.find(({ id }) => id === checkpoint.itemId)?.completed,
          true,
        );
      results.push({
        notice_id: checkpoint.id,
        source_url: detail.sourceUrl,
        envelope: detail.analysis,
        checklist_count: checklist.items.length,
        checklist_preserved: true,
        progress_preserved: true,
      });
      console.log(`${checkpoint.id}: 실제 수집·AI·저장·재실행·캐시 통과`);
    }
    const report = {
      verified_at: new Date().toISOString(),
      input_kind: 'live_html',
      worker_url: new URL(endpoint).origin,
      ai_calls: aiCalls,
      cache_extra_calls: aiCalls - 2,
      sqlite_reopened: true,
      device_validation: false,
      sync_state: await repository.getSyncState(),
      schedule: (await repository.getHomeModel()).schedule,
      results,
    };
    writeFileSync(
      new URL('verified.json', directory),
      JSON.stringify(report, null, 2) + '\n',
    );
    writeFileSync(
      new URL('../latest.json', directory),
      JSON.stringify(report, null, 2) + '\n',
    );
    console.log(
      '증거: dist/t07-smoke/latest.json (Node SQLite, Android 기기 검증은 별도)',
    );
  } finally {
    db.close();
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'T07 실제 통합 검증 실패',
  );
  process.exitCode = 1;
}
