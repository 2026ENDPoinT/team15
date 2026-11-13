import type { NoticeActions } from '../../shared/contracts';
import type { NoticeRepository } from '../db/noticeRepository';

export function createNoticeActions(
  repository: NoticeRepository,
): Pick<NoticeActions, 'saveNotice'> {
  return {
    saveNotice(noticeId: string): Promise<void> {
      return repository.saveNotice(noticeId);
    },
  };
}
