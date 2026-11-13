import type { NoticeRepository } from '../db/noticeRepository';
import { isLiveNotice } from './noticeSync';

export async function removeSyntheticNotices(
  repository: Pick<
    NoticeRepository,
    'listNoticeRecords' | 'dismissNotice' | 'deleteNotice'
  >,
) {
  for (const { notice } of await repository.listNoticeRecords()) {
    if (isLiveNotice(notice)) continue;
    // Use the repository deletion path so saved cards, calendars, and reminder
    // reconciliation all agree that this notice is no longer active.
    await repository.dismissNotice(notice.id);
    await repository.deleteNotice(notice.id);
  }
}
