import assert from 'node:assert/strict';
import test from 'node:test';
import { deferNotice, orderNoticeQueue } from '../src/domain/noticeQueue';

const notices = ['a', 'b', 'c'].map((id) => ({ id }));
const order = (deferred: string[], items = notices, promoted?: string) =>
  orderNoticeQueue(items, deferred, promoted).map(({ id }) => id);

test('보류는 목록 맨 뒤로 이동하며 반복해도 FIFO 순서로 순환한다', () => {
  let deferred: string[] = [];
  for (const expected of ['a', 'b', 'c', 'a', 'b', 'c']) {
    assert.equal(order(deferred)[0], expected);
    deferred = deferNotice(deferred, expected);
  }
  assert.deepEqual(deferred, ['a', 'b', 'c']);
});

test('필터·삭제 후에도 남은 공지만 순환하고 한 장은 즉시 다시 표시한다', () => {
  assert.deepEqual(order(['a', 'b', 'c'], [notices[0]!]), ['a']);
  assert.deepEqual(order(['a', 'b', 'c'], []), []);
  assert.deepEqual(order(['a', 'b'], [notices[1]!, notices[2]!]), ['c', 'b']);
});

test('새 시연 공지도 보류하면 우선 표시 대신 목록 뒤로 이동한다', () => {
  assert.deepEqual(order([], notices, 'c'), ['c', 'a', 'b']);
  assert.deepEqual(order(['c'], notices, 'c'), ['a', 'b', 'c']);
});
