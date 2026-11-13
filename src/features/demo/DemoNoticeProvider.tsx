import {
  createContext,
  useContext,
  useState,
  type PropsWithChildren,
} from 'react';
import type { NoticeActions } from '../../../shared/contracts';
import { demoNotice } from './demoNotice';

type DemoNoticeState = {
  notice: typeof demoNotice;
  saved: boolean;
  actions: Pick<NoticeActions, 'saveNotice' | 'unsaveNotice'>;
};

const DemoNoticeContext = createContext<DemoNoticeState | null>(null);

export function DemoNoticeProvider({ children }: PropsWithChildren) {
  // 두 탭에서 같은 공지를 바로 확인할 수 있게 관심 저장된 샘플로 시작한다.
  // T03의 SQLite 구현 전까지 현재 실행 중에만 상태를 공유한다.
  const [saved, setSaved] = useState(true);
  const actions: DemoNoticeState['actions'] = {
    async saveNotice(noticeId) {
      if (noticeId !== demoNotice.id) throw new Error('Unknown demo notice');
      setSaved(true);
    },
    async unsaveNotice(noticeId) {
      if (noticeId !== demoNotice.id) throw new Error('Unknown demo notice');
      setSaved(false);
    },
  };
  return (
    <DemoNoticeContext.Provider value={{ notice: demoNotice, saved, actions }}>
      {children}
    </DemoNoticeContext.Provider>
  );
}

export function useDemoNotice() {
  const value = useContext(DemoNoticeContext);
  if (!value) throw new Error('DemoNoticeProvider is required');
  return value;
}
