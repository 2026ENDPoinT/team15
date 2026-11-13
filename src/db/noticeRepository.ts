import type {
  CollectedNotice,
  Progress,
  SourceId,
} from '../../shared/contracts';
import { migration1 } from './migrations';

type BindValue = string | number | null;

// The subset of SQLiteDatabase used by the repository.
export interface NoticeDatabase {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: BindValue[]): Promise<{ changes: number }>;
  getFirstAsync<T>(sql: string): Promise<T | null>;
  getAllAsync<T>(sql: string): Promise<T[]>;
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
  upsertRawNotice(notice: CollectedNotice): Promise<void>;
  saveNotice(noticeId: string): Promise<void>;
  listSavedNotices(): Promise<SavedNotice[]>;
}

// Create one repository for the app's database connection.
export async function createNoticeRepository(
  db: NoticeDatabase,
): Promise<NoticeRepository> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  await db.withTransactionAsync(async () => {
    const version = await db.getFirstAsync<{ user_version: number }>(
      'PRAGMA user_version',
    );
    if (version?.user_version === 1) return;
    if (version?.user_version !== 0)
      throw new Error('Unsupported notice database version');
    await db.execAsync(migration1);
    await db.execAsync('PRAGMA user_version = 1');
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

  return {
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
             analysis_status = CASE WHEN notices.content_hash <> excluded.content_hash
               THEN 'pending' ELSE notices.analysis_status END,
             last_error = CASE WHEN notices.content_hash <> excluded.content_hash
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

    saveNotice(noticeId) {
      return enqueue(async () => {
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
      });
    },

    listSavedNotices() {
      return enqueue(() =>
        db.getAllAsync<SavedNotice>(
          `SELECT n.id, n.title, n.source_id AS sourceId, n.source_url AS sourceUrl,
                u.saved_at AS savedAt, u.progress
         FROM user_notices AS u
         INNER JOIN notices AS n ON n.id = u.notice_id
         WHERE u.disposition = 'saved'
         ORDER BY u.saved_at DESC, n.id`,
        ),
      );
    },
  };
}
