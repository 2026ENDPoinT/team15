import {
  analysisEnvelopeSchema,
  EXTRACTOR_VERSION,
  SCHEMA_VERSION,
  type AnalysisEnvelope,
  type CollectedNotice,
  type Disposition,
  type Progress,
  type SourceId,
  type AnalysisStatus,
} from '../../shared/contracts';
import { normalizeText } from '../../shared/canonicalize';
import {
  deadlineSignature,
  describeDate,
  type ResolvedEvent,
} from '../domain/dates';
import { migration1, migration2, migration3 } from './migrations';
import type { CampusProfile } from '../domain/campusProfile';
import type { CollectionResult } from '../sources/collector';

type BindValue = string | number | null;

// The subset of SQLiteDatabase used by the repository.
export interface NoticeDatabase {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: BindValue[]): Promise<{ changes: number }>;
  getFirstAsync<T>(sql: string, params?: BindValue[]): Promise<T | null>;
  getAllAsync<T>(sql: string, params?: BindValue[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

export interface SavedNotice {
  id: string;
  title: string;
  sourceId: SourceId;
  sourceUrl: string;
  savedAt: string;
  progress: Progress;
}

export interface NoticeRepository {
  getProfile(): Promise<CampusProfile | null>;
  saveProfile(profile: CampusProfile): Promise<void>;
  upsertRawNotice(notice: CollectedNotice): Promise<void>;
  applyAnalysis(
    analysis: AnalysisEnvelope,
    request?: AnalysisRequestKey,
  ): Promise<boolean>;
  listNoticeRecords(): Promise<NoticeRecord[]>;
  beginAnalysis(request: AnalysisRequestKey): Promise<boolean>;
  failAnalysis(
    request: AnalysisRequestKey,
    status: 'failed' | 'unsupported',
    error: string,
  ): Promise<boolean>;
  recoverInterruptedAnalysis(): Promise<void>;
  getSyncState(): Promise<{
    sources: SourceSyncState[];
    analysisRetryAt: string | null;
  }>;
  beginSourceSync(sourceId: SourceId, attemptedAt: string): Promise<void>;
  finishSourceSync(result: CollectionResult): Promise<void>;
  setAnalysisRetryAt(retryAt: string | null): Promise<void>;
  saveNotice(noticeId: string): Promise<void>;
  dismissNotice(noticeId: string): Promise<void>;
  restoreNotice(noticeId: string): Promise<void>;
  unsaveNotice(noticeId: string): Promise<void>;
  setProgress(noticeId: string, progress: Progress): Promise<void>;
  setChecklistCompleted(itemId: string, completed: boolean): Promise<void>;
  getChecklist(noticeId: string): Promise<{
    items: ChecklistItem[];
    updatedChecklist: AnalysisEnvelope['data']['checklist'] | null;
  }>;
  listSavedNotices(): Promise<SavedNotice[]>;
  getHomeModel(
    now?: Date,
  ): Promise<{ notices: SavedNoticeWithAnalysis[]; schedule: ScheduleEntry[] }>;
  listNoticeIds(): Promise<string[]>;
  getNoticeDetail(noticeId: string): Promise<NoticeDetail | null>;
  acknowledgeDeadlineChange(noticeId: string): Promise<void>;
  listReminders(): Promise<ReminderRecord[]>;
  persistReminder(reminder: ReminderRecord): Promise<void>;
}

export interface AnalysisRequestKey {
  noticeId: string;
  contentHash: string;
  requestId: string;
}

export interface NoticeRecord {
  notice: CollectedNotice;
  disposition: Disposition;
  progress: Progress | null;
  analysisFresh: boolean;
  analysisStatus: AnalysisStatus;
  lastError: string | null;
}

export interface SourceSyncState {
  sourceId: SourceId;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  detailFailures: number;
}

export interface ReminderRecord {
  key: string;
  noticeId: string;
  desiredFireAt: string | null;
  appliedFireAt: string | null;
  identifier: string | null;
  state: 'needs_sync' | 'synced' | 'error';
  error: string | null;
}

export interface NoticeDetail {
  id: string;
  title: string;
  sourceId: SourceId;
  sourceUrl: string;
  disposition: Disposition;
  progress: Progress | null;
  analysis: AnalysisEnvelope | null;
  analysisFresh: boolean;
  deadlineChanged: boolean;
  analysisStatus: AnalysisStatus;
  lastError: string | null;
  raw: Pick<
    CollectedNotice,
    | 'bodyText'
    | 'extractedLinks'
    | 'attachments'
    | 'hasBodyImages'
    | 'sourceUpdatedAt'
  >;
}

interface SavedNoticeWithAnalysis extends SavedNotice {
  events: AnalysisEnvelope['data']['events'];
  analysisFresh: boolean;
}

type ScheduleEntry = ResolvedEvent & {
  noticeId: string;
  title: string;
  daysLeft: number;
  ended: boolean;
};

interface AnalysisColumns {
  analysisJson: string | null;
  contentHash: string;
}

const analysisColumns =
  'n.analysis_json AS analysisJson, n.content_hash AS contentHash';
const savedColumns = `n.id, n.title, n.source_id AS sourceId, n.source_url AS sourceUrl,
  u.saved_at AS savedAt, u.progress`;
const savedRows = `FROM user_notices u JOIN notices n ON n.id = u.notice_id
  WHERE u.disposition = 'saved' ORDER BY u.saved_at DESC, n.id`;

function readAnalysis(json: string | null): AnalysisEnvelope | null {
  if (!json) return null;
  return analysisEnvelopeSchema.safeParse(JSON.parse(json)).data ?? null;
}

function isFresh(
  analysis: AnalysisEnvelope | null,
  contentHash: string,
): analysis is AnalysisEnvelope {
  return (
    analysis !== null &&
    analysis.content_hash === contentHash &&
    analysis.schema_version === SCHEMA_VERSION &&
    analysis.extractor_version === EXTRACTOR_VERSION
  );
}

interface ChecklistItem {
  id: string;
  text: string;
  evidence: string;
  completed: boolean;
}

interface ChecklistSnapshot {
  analysisJson: string | null;
  initialized: number;
  snapshotHash: string | null;
  deadlineBaseline: string | null;
}

export interface NoticeRepositoryCrypto {
  randomUUID(): string;
  sha256(text: string): Promise<string>;
}

// Create one repository for the app's database connection.
export async function createNoticeRepository(
  db: NoticeDatabase,
  crypto: NoticeRepositoryCrypto,
): Promise<NoticeRepository> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  await db.withTransactionAsync(async () => {
    const version = await db.getFirstAsync<{ user_version: number }>(
      'PRAGMA user_version',
    );
    const current = version?.user_version;
    if (current === 3) return;
    if (current !== 0 && current !== 1 && current !== 2)
      throw new Error('Unsupported notice database version');
    if (current === 0) await db.execAsync(migration1);
    if (current < 2) await db.execAsync(migration2);
    await db.execAsync(migration3);
    await db.execAsync('PRAGMA user_version = 3');
  });

  let pending = Promise.resolve();
  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = pending.then(work);
    pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  function readChecklistSnapshot(noticeId: string) {
    return db.getFirstAsync<ChecklistSnapshot>(
      `SELECT u.checklist_initialized AS initialized,
              u.checklist_snapshot_hash AS snapshotHash,
              u.deadline_baseline_hash AS deadlineBaseline,
              CASE WHEN n.content_hash = n.analyzed_content_hash
               AND n.schema_version = ? AND n.extractor_version = ?
              THEN n.analysis_json END AS analysisJson
       FROM user_notices u JOIN notices n ON n.id = u.notice_id
       WHERE u.notice_id = ? AND u.disposition = 'saved'`,
      [SCHEMA_VERSION, EXTRACTOR_VERSION, noticeId],
    );
  }

  function hashChecklist(checklist: AnalysisEnvelope['data']['checklist']) {
    const entries = checklist.map(({ text, evidence }) =>
      JSON.stringify([normalizeText(text), normalizeText(evidence)]),
    );
    return crypto.sha256(JSON.stringify([...new Set(entries)].sort()));
  }

  async function initializeChecklist(noticeId: string, now: string) {
    const snapshot = await readChecklistSnapshot(noticeId);
    if (!snapshot?.analysisJson) return;
    const analysis = readAnalysis(snapshot.analysisJson);
    if (!analysis) return;
    if (snapshot.deadlineBaseline === null) {
      await db.runAsync(
        'UPDATE user_notices SET deadline_baseline_hash = ? WHERE notice_id = ?',
        [
          await crypto.sha256(deadlineSignature(analysis.data.events)),
          noticeId,
        ],
      );
    }
    if (snapshot.initialized) return;
    const checklist = analysis.data.checklist;
    for (const item of checklist) {
      await db.runAsync(
        `INSERT INTO checklist_items (id, notice_id, text, evidence, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), noticeId, item.text, item.evidence, now],
      );
    }
    await db.runAsync(
      `UPDATE user_notices SET checklist_initialized = 1, checklist_snapshot_hash = ?
       WHERE notice_id = ?`,
      [await hashChecklist(checklist), noticeId],
    );
  }

  return {
    getProfile() {
      return enqueue(async () => {
        const row = await db.getFirstAsync<
          Omit<CampusProfile, 'keywords' | 'customKeywords'> & {
            keywordsJson: string;
            customKeywordsJson: string;
          }
        >(`SELECT college, department, grade, enrollment, keywords_json AS keywordsJson,
                 custom_keywords_json AS customKeywordsJson FROM profile WHERE id = 1`);
        if (!row) return null;
        const { keywordsJson, customKeywordsJson, ...profile } = row;
        return {
          ...profile,
          keywords: JSON.parse(keywordsJson) as string[],
          customKeywords: JSON.parse(customKeywordsJson) as string[],
        };
      });
    },
    saveProfile(profile) {
      return enqueue(async () => {
        await db.runAsync(
          `INSERT INTO profile
            (id, college, department, grade, enrollment, keywords_json, custom_keywords_json, updated_at)
           VALUES (1, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET college = excluded.college, department = excluded.department,
             grade = excluded.grade, enrollment = excluded.enrollment, keywords_json = excluded.keywords_json,
             custom_keywords_json = excluded.custom_keywords_json, updated_at = excluded.updated_at`,
          [
            profile.college,
            profile.department,
            profile.grade,
            profile.enrollment,
            JSON.stringify(profile.keywords),
            JSON.stringify(profile.customKeywords),
            new Date().toISOString(),
          ],
        );
      });
    },
    listNoticeRecords() {
      return enqueue(async () => {
        const rows = await db.getAllAsync<{
          id: string;
          sourceId: SourceId;
          boardId: string;
          postId: string;
          sourceUrl: string;
          title: string;
          publishedDate: string | null;
          fetchedAt: string;
          rawJson: string;
          contentHash: string;
          analysisJson: string | null;
          disposition: Disposition;
          progress: Progress | null;
          analysisStatus: AnalysisStatus;
          lastError: string | null;
        }>(`SELECT n.id, n.source_id AS sourceId, n.board_id AS boardId, n.post_id AS postId,
          n.source_url AS sourceUrl, n.title, n.published_date AS publishedDate,
          n.fetched_at AS fetchedAt, n.raw_json AS rawJson, ${analysisColumns},
          n.analysis_status AS analysisStatus, n.last_error AS lastError,
          COALESCE(u.disposition, 'unseen') AS disposition, u.progress
          FROM notices n LEFT JOIN user_notices u ON u.notice_id = n.id
          ORDER BY n.fetched_at DESC, n.id`);
        return rows.map(
          ({
            rawJson,
            analysisJson,
            disposition,
            progress,
            analysisStatus,
            lastError,
            ...notice
          }) => ({
            notice: { ...notice, ...JSON.parse(rawJson) } as CollectedNotice,
            disposition,
            progress,
            analysisStatus,
            lastError,
            analysisFresh: isFresh(
              readAnalysis(analysisJson),
              notice.contentHash,
            ),
          }),
        );
      });
    },

    beginAnalysis(request) {
      return enqueue(async () => {
        const result = await db.runAsync(
          `UPDATE notices SET analysis_status = 'running',
          analysis_request_id = ?, last_error = NULL WHERE id = ? AND content_hash = ?
          AND NOT (analysis_json IS NOT NULL AND analyzed_content_hash IS content_hash
            AND schema_version IS ? AND extractor_version IS ?)`,
          [
            request.requestId,
            request.noticeId,
            request.contentHash,
            SCHEMA_VERSION,
            EXTRACTOR_VERSION,
          ],
        );
        return result.changes > 0;
      });
    },

    failAnalysis(request, status, error) {
      return enqueue(async () => {
        const result = await db.runAsync(
          `UPDATE notices SET analysis_status = ?, last_error = ?,
          analysis_request_id = NULL WHERE id = ? AND content_hash = ? AND analysis_request_id = ?`,
          [
            status,
            error,
            request.noticeId,
            request.contentHash,
            request.requestId,
          ],
        );
        return result.changes > 0;
      });
    },

    recoverInterruptedAnalysis() {
      return enqueue(async () => {
        await db.runAsync(
          `UPDATE notices SET analysis_status = 'pending', analysis_request_id = NULL
          WHERE analysis_status = 'running'`,
          [],
        );
      });
    },

    getSyncState() {
      return enqueue(async () => ({
        sources:
          await db.getAllAsync<SourceSyncState>(`SELECT source_id AS sourceId,
          last_attempt_at AS lastAttemptAt, last_success_at AS lastSuccessAt,
          last_error AS lastError, detail_failures AS detailFailures FROM sync_state`),
        analysisRetryAt:
          (
            await db.getFirstAsync<{ retryAt: string | null }>(
              'SELECT analysis_retry_at AS retryAt FROM sync_control WHERE id = 1',
            )
          )?.retryAt ?? null,
      }));
    },

    beginSourceSync(sourceId, attemptedAt) {
      return enqueue(async () => {
        await db.runAsync(
          `INSERT INTO sync_state (source_id, last_attempt_at) VALUES (?, ?)
          ON CONFLICT(source_id) DO UPDATE SET last_attempt_at = excluded.last_attempt_at`,
          [sourceId, attemptedAt],
        );
      });
    },

    finishSourceSync(result) {
      return enqueue(async () => {
        await db.runAsync(
          `UPDATE sync_state SET last_success_at = CASE WHEN ? = 'success'
          THEN ? ELSE last_success_at END, last_error = ?, detail_failures = ?
          WHERE source_id = ? AND last_attempt_at = ?`,
          [
            result.status,
            result.completedAt,
            result.failures[0]?.code ?? null,
            result.failures.filter(({ stage }) => stage === 'detail').length,
            result.sourceId,
            result.attemptedAt,
          ],
        );
      });
    },

    setAnalysisRetryAt(retryAt) {
      return enqueue(async () => {
        await db.runAsync(
          'UPDATE sync_control SET analysis_retry_at = ? WHERE id = 1',
          [retryAt],
        );
      });
    },

    upsertRawNotice(notice) {
      return enqueue(async () => {
        const raw = JSON.stringify({
          bodyText: notice.bodyText,
          extractedLinks: notice.extractedLinks,
          attachments: notice.attachments,
          hasBodyImages: notice.hasBodyImages,
          sourceUpdatedAt: notice.sourceUpdatedAt,
        });
        await db.runAsync(
          `INSERT INTO notices (
             id, source_id, board_id, post_id, source_url, title,
             raw_json, content_hash, fetched_at, published_date
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             source_url = excluded.source_url,
             title = excluded.title,
             raw_json = excluded.raw_json,
             content_hash = excluded.content_hash,
             fetched_at = excluded.fetched_at,
             published_date = excluded.published_date,
             analysis_json = CASE WHEN notices.published_date IS NOT excluded.published_date
               THEN NULL ELSE notices.analysis_json END,
             analyzed_content_hash = CASE WHEN notices.published_date IS NOT excluded.published_date
               THEN NULL ELSE notices.analyzed_content_hash END,
             analysis_status = CASE WHEN notices.content_hash <> excluded.content_hash
               OR notices.published_date IS NOT excluded.published_date
               THEN 'pending' ELSE notices.analysis_status END,
             analysis_request_id = CASE WHEN notices.content_hash <> excluded.content_hash
               OR notices.published_date IS NOT excluded.published_date
               THEN NULL ELSE notices.analysis_request_id END,
             last_error = CASE WHEN notices.content_hash <> excluded.content_hash
               OR notices.published_date IS NOT excluded.published_date
               THEN NULL ELSE notices.last_error END
           WHERE julianday(excluded.fetched_at) >= julianday(notices.fetched_at)`,
          [
            notice.id,
            notice.sourceId,
            notice.boardId,
            notice.postId,
            notice.sourceUrl,
            notice.title,
            raw,
            notice.contentHash,
            notice.fetchedAt,
            notice.publishedDate,
          ],
        );
      });
    },

    applyAnalysis(input, request) {
      return enqueue(async () => {
        const analysis = analysisEnvelopeSchema.parse(input);
        if (analysis.extractor_version !== EXTRACTOR_VERSION) return false;
        if (
          request &&
          (request.noticeId !== analysis.notice_id ||
            request.contentHash !== analysis.content_hash)
        )
          return false;
        let applied = false;
        await db.withTransactionAsync(async () => {
          const result = await db.runAsync(
            `UPDATE notices
             SET analysis_json = ?, analyzed_content_hash = ?, schema_version = ?,
                 extractor_version = ?, analyzed_at = ?, analysis_status = 'ready', last_error = NULL,
                 analysis_request_id = NULL
             WHERE id = ? AND content_hash = ?
               AND (? IS NULL OR analysis_request_id = ?)
               AND (analyzed_content_hash IS NOT content_hash OR extractor_version IS NOT ?
                 OR analyzed_at IS NULL OR julianday(analyzed_at) <= julianday(?))`,
            [
              JSON.stringify(analysis),
              analysis.content_hash,
              analysis.schema_version,
              analysis.extractor_version,
              analysis.analyzed_at,
              analysis.notice_id,
              analysis.content_hash,
              request?.requestId ?? null,
              request?.requestId ?? null,
              analysis.extractor_version,
              analysis.analyzed_at,
            ],
          );
          applied = result.changes > 0;
          if (applied)
            await initializeChecklist(
              analysis.notice_id,
              new Date().toISOString(),
            );
        });
        return applied;
      });
    },

    saveNotice(noticeId) {
      return enqueue(() =>
        db.withTransactionAsync(async () => {
          const now = new Date().toISOString();
          // The foreign key rejects IDs that have yet to be collected or seeded.
          await db.runAsync(
            `INSERT INTO user_notices (notice_id, disposition, progress, saved_at, updated_at)
           VALUES (?, 'saved', 'saved', ?, ?)
           ON CONFLICT(notice_id) DO UPDATE SET
             disposition = 'saved',
             progress = COALESCE(user_notices.progress, excluded.progress),
             saved_at = excluded.saved_at,
             updated_at = excluded.updated_at
           WHERE user_notices.disposition <> 'saved'`,
            [noticeId, now, now],
          );
          await initializeChecklist(noticeId, now);
        }),
      );
    },

    dismissNotice(noticeId) {
      return enqueue(async () => {
        await db.runAsync(
          `INSERT INTO user_notices (notice_id, disposition, updated_at)
           VALUES (?, 'dismissed', ?)
           ON CONFLICT(notice_id) DO UPDATE SET disposition = 'dismissed',
             updated_at = excluded.updated_at WHERE user_notices.disposition = 'unseen'`,
          [noticeId, new Date().toISOString()],
        );
      });
    },

    restoreNotice(noticeId) {
      return enqueue(async () => {
        await db.runAsync(
          `UPDATE user_notices SET disposition = 'unseen', updated_at = ?
           WHERE notice_id = ? AND disposition = 'dismissed'`,
          [new Date().toISOString(), noticeId],
        );
      });
    },

    unsaveNotice(noticeId) {
      return enqueue(async () => {
        await db.runAsync(
          `UPDATE user_notices
           SET disposition = 'unseen', updated_at = ?
           WHERE notice_id = ? AND disposition = 'saved'`,
          [new Date().toISOString(), noticeId],
        );
      });
    },

    setProgress(noticeId, progress) {
      return enqueue(async () => {
        await db.runAsync(
          `UPDATE user_notices
           SET progress = ?, updated_at = ?
           WHERE notice_id = ? AND disposition = 'saved' AND progress <> ?`,
          [progress, new Date().toISOString(), noticeId, progress],
        );
      });
    },

    setChecklistCompleted(itemId, completed) {
      return enqueue(async () => {
        await db.runAsync(
          `UPDATE checklist_items SET completed = ?
           WHERE id = ? AND EXISTS (
             SELECT 1 FROM user_notices u
             WHERE u.notice_id = checklist_items.notice_id AND u.disposition = 'saved'
           )`,
          [Number(completed), itemId],
        );
      });
    },

    getChecklist(noticeId) {
      return enqueue(async () => {
        const snapshot = await readChecklistSnapshot(noticeId);
        if (!snapshot) return { items: [], updatedChecklist: null };
        const rows = await db.getAllAsync<
          Omit<ChecklistItem, 'completed'> & { completed: number }
        >(
          'SELECT id, text, evidence, completed FROM checklist_items WHERE notice_id = ? ORDER BY rowid',
          [noticeId],
        );
        const items = rows.map((row) => ({
          ...row,
          completed: row.completed === 1,
        }));
        const latest = snapshot.analysisJson
          ? analysisEnvelopeSchema.parse(JSON.parse(snapshot.analysisJson)).data
              .checklist
          : null;
        const updatedChecklist =
          latest &&
          snapshot.initialized &&
          (await hashChecklist(latest)) !== snapshot.snapshotHash
            ? latest
            : null;
        return { items, updatedChecklist };
      });
    },

    listSavedNotices() {
      return enqueue(() =>
        db.getAllAsync<SavedNotice>(`SELECT ${savedColumns} ${savedRows}`),
      );
    },

    getHomeModel(now = new Date()) {
      return enqueue(async () => {
        const rows = await db.getAllAsync<SavedNotice & AnalysisColumns>(
          `SELECT ${savedColumns}, ${analysisColumns} ${savedRows}`,
        );
        const notices = rows.map(({ analysisJson, contentHash, ...notice }) => {
          const analysis = readAnalysis(analysisJson);
          const analysisFresh = isFresh(analysis, contentHash);
          return {
            ...notice,
            analysisFresh,
            events: analysisFresh ? analysis.data.events : [],
          };
        });
        const schedule = notices.flatMap(({ id, title, events }) =>
          events.flatMap((event) =>
            event.status === 'resolved'
              ? [{ ...event, noticeId: id, title, ...describeDate(event, now) }]
              : [],
          ),
        );
        schedule.sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            (a.time ?? '').localeCompare(b.time ?? ''),
        );
        return { notices, schedule };
      });
    },

    listNoticeIds() {
      return enqueue(async () => {
        const rows = await db.getAllAsync<{ id: string }>(
          'SELECT id FROM notices ORDER BY published_date DESC, id',
        );
        return rows.map(({ id }) => id);
      });
    },

    getNoticeDetail(noticeId) {
      return enqueue(async () => {
        const row = await db.getFirstAsync<
          Omit<
            NoticeDetail,
            'analysis' | 'analysisFresh' | 'deadlineChanged' | 'raw'
          > &
            AnalysisColumns & {
              rawJson: string;
              deadlineBaseline: string | null;
            }
        >(
          `SELECT n.id, n.title, n.source_id AS sourceId, n.source_url AS sourceUrl,
                  n.analysis_status AS analysisStatus, n.last_error AS lastError,
                  COALESCE(u.disposition, 'unseen') AS disposition, u.progress,
                  n.raw_json AS rawJson, u.deadline_baseline_hash AS deadlineBaseline,
                  ${analysisColumns}
           FROM notices n LEFT JOIN user_notices u ON u.notice_id = n.id WHERE n.id = ?`,
          [noticeId],
        );
        if (!row) return null;
        const {
          rawJson,
          analysisJson,
          contentHash,
          deadlineBaseline,
          ...notice
        } = row;
        const analysis = readAnalysis(analysisJson);
        const analysisFresh = isFresh(analysis, contentHash);
        const deadlineChanged =
          notice.disposition === 'saved' &&
          analysisFresh &&
          deadlineBaseline !== null &&
          (await crypto.sha256(deadlineSignature(analysis.data.events))) !==
            deadlineBaseline;
        return {
          ...notice,
          raw: JSON.parse(rawJson),
          analysis,
          analysisFresh,
          deadlineChanged,
        };
      });
    },

    acknowledgeDeadlineChange(noticeId) {
      return enqueue(async () => {
        const snapshot = await readChecklistSnapshot(noticeId);
        const analysis = readAnalysis(snapshot?.analysisJson ?? null);
        if (!analysis) return;
        await db.runAsync(
          'UPDATE user_notices SET deadline_baseline_hash = ? WHERE notice_id = ?',
          [
            await crypto.sha256(deadlineSignature(analysis.data.events)),
            noticeId,
          ],
        );
      });
    },

    listReminders() {
      return enqueue(() =>
        db.getAllAsync<ReminderRecord>(
          `SELECT reminder_key AS key, notice_id AS noticeId, desired_fire_at AS desiredFireAt,
                applied_fire_at AS appliedFireAt, os_identifier AS identifier, state, last_error AS error
         FROM reminders`,
        ),
      );
    },

    persistReminder(reminder) {
      return enqueue(async () => {
        await db.runAsync(
          `INSERT INTO reminders
             (reminder_key, notice_id, desired_fire_at, applied_fire_at, os_identifier, state, last_error)
           SELECT ?, notice_id, ?, ?, ?, ?, ? FROM user_notices WHERE notice_id = ?
           ON CONFLICT(reminder_key) DO UPDATE SET
             desired_fire_at = excluded.desired_fire_at, applied_fire_at = excluded.applied_fire_at,
             os_identifier = excluded.os_identifier, state = excluded.state, last_error = excluded.last_error`,
          [
            reminder.key,
            reminder.desiredFireAt,
            reminder.appliedFireAt,
            reminder.identifier,
            reminder.state,
            reminder.error,
            reminder.noticeId,
          ],
        );
      });
    },
  };
}
