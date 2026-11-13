import type { NoticeActions } from '../../shared/contracts';
import type { NoticeRepository } from '../db/noticeRepository';

export function createNoticeActions(
  repository: NoticeRepository,
  reconcileReminders: NoticeActions['reconcileReminders'] = async () => {},
): Pick<
  NoticeActions,
  | 'saveNotice'
  | 'dismissNotice'
  | 'unsaveNotice'
  | 'setProgress'
  | 'addChecklistItem'
  | 'deleteChecklistItem'
  | 'setChecklistCompleted'
  | 'acknowledgeDeadlineChange'
  | 'reconcileReminders'
> {
  async function syncAfter(write: Promise<void>) {
    await write;
    // A failed platform operation must not turn a committed user write into a failed save.
    void reconcileReminders().catch(() => undefined);
  }

  return {
    saveNotice(noticeId: string): Promise<void> {
      return syncAfter(repository.saveNotice(noticeId));
    },
    dismissNotice(noticeId) {
      return syncAfter(repository.dismissNotice(noticeId));
    },
    unsaveNotice(noticeId) {
      return syncAfter(repository.unsaveNotice(noticeId));
    },
    setProgress(noticeId, progress) {
      return syncAfter(repository.setProgress(noticeId, progress));
    },
    addChecklistItem(noticeId, text) {
      return repository.addChecklistItem(noticeId, text);
    },
    deleteChecklistItem(itemId) {
      return repository.deleteChecklistItem(itemId);
    },
    setChecklistCompleted(itemId, completed) {
      return repository.setChecklistCompleted(itemId, completed);
    },
    acknowledgeDeadlineChange(noticeId) {
      return repository.acknowledgeDeadlineChange(noticeId);
    },
    reconcileReminders,
  };
}
