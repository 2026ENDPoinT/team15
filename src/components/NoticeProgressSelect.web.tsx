import {
  noticeProgressOptions,
  type NoticeProgressSelectProps,
} from './noticeProgressOptions';

export function NoticeProgressSelect({
  value,
  disabled,
  onChange,
}: NoticeProgressSelectProps) {
  return (
    <select
      aria-label="공지 상태"
      value={value}
      disabled={disabled}
      onChange={(event) => {
        const option = noticeProgressOptions.find(
          (item) => item.value === event.target.value,
        );
        if (option) onChange(option.value);
      }}
      style={{
        minHeight: 44,
        border: '1px solid #dfe5d9',
        borderRadius: 11,
        padding: '8px 12px',
        background: 'white',
        color: '#213e32',
        fontSize: 12,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {noticeProgressOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
