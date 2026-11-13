export const noticeProgressOptions = [
  { value: 'preparing', label: '준비 중' },
  { value: 'applied', label: '신청 완료' },
] as const;

export type NoticeProgress = (typeof noticeProgressOptions)[number]['value'];
export type NoticeProgressSelectProps = {
  value: NoticeProgress;
  disabled: boolean;
  onChange: (value: NoticeProgress) => void;
};
