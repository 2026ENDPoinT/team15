import type { NoticeRepository } from '../db/noticeRepository';

export function createNoticeActions(repository: NoticeRepository) {
  return {
    saveNotice(noticeId: string): Promise<void> {
      return repository.saveNotice(noticeId);
    },
  };
}
