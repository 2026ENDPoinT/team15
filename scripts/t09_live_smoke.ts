import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { openNodeNoticeRepository, nodeSha256 } from './node_notice_repository';
import { createAnalysisClient } from '../src/services/analysisClient';
import { createNoticeSync } from '../src/services/noticeSync';
import { collectDetail } from '../src/sources/collector';
import { reminderFireAt } from '../src/domain/dates';

try {
  const env = parseEnv(
    readFileSync(new URL('../.env.worker-client', import.meta.url), 'utf8'),
  );
  if (!env.WORKER_URL || !env.DEMO_ACCESS_TOKEN)
    throw new Error('배포 Worker 설정이 필요합니다.');
  const directory = new URL(`../dist/t09-live/${Date.now()}/`, import.meta.url);
  mkdirSync(directory, { recursive: true });
  let rawHash = '';
  const notice = await collectDetail(
    {
      id: 'seoultech_general:4691:897698',
      sourceId: 'seoultech_general',
      boardId: '4691',
      postId: '897698',
      sourceUrl:
        'https://www.seoultech.ac.kr/service/info/notice?do=commonview&bnum=4691&bidx=897698',
      title: '영상 콘텐츠 공모전',
      publishedDate: null,
    },
    {
      sha256: nodeSha256,
      fetch: async (url, init) => {
        const response = await fetch(url, init);
        if (response.ok) {
          const bytes = Buffer.from(await response.clone().arrayBuffer());
          rawHash = createHash('sha256').update(bytes).digest('hex');
          writeFileSync(new URL('detail.html', directory), bytes);
        }
        return response;
      },
    },
  );
  const file = new URL('notices.db', directory).pathname;
  let { db, repository } = await openNodeNoticeRepository(file);
  try {
    await repository.upsertRawNotice(notice);
    await repository.saveNotice(notice.id);
    let aiCalls = 0;
    const client = createAnalysisClient({
      endpoint: new URL('/analyze-notice', env.WORKER_URL).href,
      getToken: async () => env.DEMO_ACCESS_TOKEN!,
    });
    const sync = createNoticeSync({
      repository,
      randomUUID,
      collector: { sha256: nodeSha256 },
      analyze: async (request) => {
        aiCalls++;
        return client(request);
      },
    });
    await sync.analyzeNotice(notice.id);
    const detail = (await repository.getNoticeDetail(notice.id))!;
    assert.equal(
      detail.analysisFresh,
      true,
      sync.getStatus().message ?? '분석 실패',
    );
    const events = detail.analysis!.data.events;
    const deadline = events.filter(({ type }) => type === 'application_close');
    assert.equal(deadline.length, 1);
    assert.equal(deadline[0]!.date, '2026-12-27');
    assert.equal(deadline[0]!.time, null);
    assert.ok(deadline[0]!.evidence.includes('2026'));
    const fireAt = reminderFireAt(events, new Date());
    assert.equal(fireAt, '2026-12-26T00:00:00.000Z');
    const checklist = await repository.getChecklist(notice.id);
    assert.ok(checklist.items.some(({ text }) => /신청서/.test(text)));
    assert.ok(checklist.items.some(({ text }) => /동영상|영상/.test(text)));
    const item = checklist.items[0]!;
    await repository.setChecklistCompleted(item.id, true);
    await repository.setProgress(notice.id, 'preparing');
    await sync.analyzeNotice(notice.id);
    assert.equal(aiCalls, 1);
    db.close();
    ({ db, repository } = await openNodeNoticeRepository(file));
    assert.equal(
      (await repository.getChecklist(notice.id)).items.find(
        ({ id }) => id === item.id,
      )!.completed,
      true,
    );
    assert.equal(
      (await repository.getNoticeDetail(notice.id))!.progress,
      'preparing',
    );
    const report = {
      verified_at: new Date().toISOString(),
      input_kind: 'live_html',
      device_validation: false,
      os_schedule_verified: false,
      raw_html_sha256: rawHash,
      notice,
      envelope: detail.analysis,
      ai_calls: aiCalls,
      cache_extra_calls: 0,
      sqlite_reopened: true,
      checklist_preserved: true,
      progress_preserved: true,
      desired_fire_at: fireAt,
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
      `실제 공지 ${notice.id}: 마감 2026-12-27(시각 미확인), D-1 09:00 KST, 준비물·캐시·DB 재개방 통과. AI ${aiCalls}회. 증거: ${directory.pathname}`,
    );
  } finally {
    db.close();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'T09 실제 검증 실패');
  process.exitCode = 1;
}
