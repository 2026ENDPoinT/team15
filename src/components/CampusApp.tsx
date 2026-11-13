import { useLayoutEffect, useRef, useState, type ComponentRef } from 'react';
import { router } from 'expo-router';
import {
  Animated,
  Easing,
  Modal,
  Linking,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Notice } from '../features/demo/campusNotices';
import { useDemoNotice } from '../features/demo/DemoNoticeProvider';
import { AnalysisSettings } from './AnalysisSettings';
import type { Disposition as Bucket } from '../../shared/contracts';
const names = ['휴지통', '맞춤 공지', '메인', '설정'];
const green = '#28634d';
function Button({
  label,
  onPress,
  primary = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[s.button, primary && s.primary]}
    >
      <Text style={[s.buttonText, primary && s.light]}>{label}</Text>
    </Pressable>
  );
}
function SwipeCard({
  notice,
  bucket,
  act,
  detail,
  onDragging,
}: {
  notice: Notice;
  bucket: Bucket;
  act: (action: string) => void;
  detail: () => void;
  onDragging: (dragging: boolean) => void;
}) {
  const position = useRef(new Animated.ValueXY()).current;
  const axis = useRef<'x' | 'y' | null>(null);
  const [dragging, setDragging] = useState(false);
  const reset = () => {
    axis.current = null;
    setDragging(false);
    onDragging(false);
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: true,
      friction: 8,
      tension: 90,
    }).start();
  };
  const responder = PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, g) =>
      bucket !== 'saved' && (Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8),
    onMoveShouldSetPanResponder: (_, g) =>
      bucket !== 'saved' && (Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8),
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      position.stopAnimation();
      position.setValue({ x: 0, y: 0 });
      axis.current = null;
      setDragging(true);
      onDragging(true);
    },
    onPanResponderMove: (_, g) => {
      // Ignore initial finger jitter; diagonal drags favor vertical hold.
      if (!axis.current && Math.max(Math.abs(g.dx), Math.abs(g.dy)) >= 24)
        axis.current = Math.abs(g.dx) > Math.abs(g.dy) * 1.5 ? 'x' : 'y';
      position.setValue({
        x: axis.current === 'x' ? g.dx : 0,
        y: axis.current === 'y' ? g.dy : 0,
      });
    },
    onPanResponderTerminate: reset,
    onPanResponderRelease: (_, g) => {
      if (axis.current === 'x' && Math.abs(g.dx) >= 56)
        act(
          g.dx > 0
            ? bucket === 'dismissed'
              ? 'restore'
              : 'select'
            : bucket === 'unseen'
              ? 'discard'
              : 'none',
        );
      else if (axis.current === 'y' && Math.abs(g.dy) >= 48) act('hold');
      reset();
    },
  });
  return (
    <Animated.View
      style={[
        s.card,
        { transform: position.getTranslateTransform() },
        dragging && s.draggingCard,
      ]}
      {...responder.panHandlers}
    >
      <View style={s.between}>
        <Text style={s.muted}>{notice.org}</Text>
        <Text style={s.tag}>
          {notice.date
            ? `${notice.date.slice(5).replace('-', '.')} 마감`
            : '일정 미정'}
        </Text>
      </View>
      <Text style={s.cardTitle}>{notice.title}</Text>
      <Text style={s.muted}>
        {notice.synthetic ? '가상 예시' : `실제 공지 · ${notice.analysisLabel}`}
      </Text>
      <View style={s.row}>
        {notice.tags.map((tag) => (
          <Text key={tag} style={s.tag}>
            {tag}
          </Text>
        ))}
      </View>
      <Text style={s.reason}>{notice.summary}</Text>
      <Text style={s.muted}>
        {notice.date
          ? `${notice.date} · ${notice.time ? `${notice.time} KST` : '시각 미확인'}`
          : '정확한 일정은 원문에서 확인'}
      </Text>
      <View style={s.row}>
        {bucket === 'saved' ? (
          <Button label="선택 취소" onPress={() => act('unselect')} />
        ) : (
          <>
            {bucket === 'unseen' && (
              <Button label="← 버리기" onPress={() => act('discard')} />
            )}
            <Button label="↕ 보류" onPress={() => act('hold')} />
            <Button
              label={bucket === 'dismissed' ? '복구 →' : '선택 →'}
              primary
              onPress={() => act(bucket === 'dismissed' ? 'restore' : 'select')}
            />
          </>
        )}
      </View>
      <Pressable accessibilityRole="button" onPress={detail}>
        <Text style={s.link}>공지 자세히 보기 ↗</Text>
      </Pressable>
    </Animated.View>
  );
}
export default function CampusApp() {
  const [page, setPage] = useState(2);
  const pageRef = useRef(page);
  pageRef.current = page;
  const {
    buckets,
    actions,
    details,
    checklists,
    testNotification,
    reservationStatus,
    notices,
    home,
    syncState,
    syncStatus,
    refreshNotices,
    analyzeNotice,
    setKeywords,
  } = useDemoNotice();
  const changing = useRef(false);
  const [held, setHeld] = useState<string[]>([]);
  const [keys, setKeys] = useState(['대회', '장학금']);
  const [draft, setDraft] = useState(keys);
  const [options, setOptions] = useState([
    '대회',
    '장학금',
    '취업',
    '인턴십',
    '교환학생',
    '인공지능',
  ]);
  const [custom, setCustom] = useState('');
  const [dept, setDept] = useState('컴퓨터공학과');
  const [grade, setGrade] = useState('3학년');
  const [status, setStatus] = useState('재학');
  const [month, setMonth] = useState(() => {
    const date = new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const [cardDragging, setCardDragging] = useState(false);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const [picked, setPicked] = useState<string | null>(null);
  const [openedDetail, setDetail] = useState<Notice | null>(null);
  const detail = notices.find(({ id }) => id === openedDetail?.id) ?? null;
  const [showAll, setShowAll] = useState(false);
  const [help, setHelp] = useState(false);
  const [message, setMessage] = useState('');
  const [testingNotification, setTestingNotification] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const { width } = useWindowDimensions();
  const pageOffset = useRef(new Animated.Value(0)).current;
  const transitioning = useRef(false);
  const [pageTransitioning, setPageTransitioning] = useState(false);
  useLayoutEffect(() => {
    if (!transitioning.current) return;
    scroll.current?.scrollTo({ y: 0, animated: false });
    const animation = Animated.timing(pageOffset, {
      toValue: 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) {
        transitioning.current = false;
        setPageTransitioning(false);
      }
    });
    return () => animation.stop();
  }, [page, pageOffset]);
  const navigate = (next: number) => {
    if (
      next < 0 ||
      next > 3 ||
      next === pageRef.current ||
      transitioning.current ||
      cardDragging
    )
      return;
    const direction = next > pageRef.current ? 1 : -1;
    transitioning.current = true;
    setPageTransitioning(true);
    Animated.timing(pageOffset, {
      toValue: -direction * width,
      duration: 140,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      pageOffset.setValue(direction * width);
      setHeld([]);
      setMessage('');
      setPage(next);
    });
  };
  const pager = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) =>
      Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 1.25,
    onPanResponderRelease: (_, g) => {
      if (Math.abs(g.dx) >= 56) navigate(pageRef.current + (g.dx < 0 ? 1 : -1));
    },
  });
  const act = async (id: string, action: string) => {
    if (action === 'hold') {
      setHeld((old) => [...old, id]);
      setMessage('보류했어요. 다른 화면에 다녀오면 다시 나타나요.');
      return;
    }
    const write = {
      discard: actions.dismissNotice,
      select: actions.saveNotice,
      restore: actions.restoreNotice,
      unselect: actions.unsaveNotice,
    }[action as 'discard' | 'select' | 'restore' | 'unselect'];
    if (!write || changing.current) return;
    changing.current = true;
    try {
      await write(id);
    } catch {
      setMessage('공지 상태를 저장하지 못했어요. 다시 시도해 주세요.');
      return;
    } finally {
      changing.current = false;
    }
    setMessage(
      (
        {
          discard: '휴지통으로 옮겼어요.',
          select: '선택한 공지에 추가했어요.',
          restore: '맞춤 공지로 복구했어요.',
          unselect: '선택을 취소했어요.',
        } as Record<string, string>
      )[action] ?? '',
    );
  };
  const bucket: Bucket =
    page === 0 ? 'dismissed' : page === 1 ? 'unseen' : 'saved';
  const visible = notices.filter(
    (n) =>
      buckets[n.id] === bucket &&
      !held.includes(n.id) &&
      (page !== 1 ||
        showAll ||
        keys.some(
          (k) =>
            n.tags.includes(k) || n.title.includes(k) || n.summary.includes(k),
        )),
  );
  const prefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-`;
  const events = home.schedule.filter(
    (event) =>
      event.date.startsWith(prefix) && (!picked || event.date === picked),
  );
  const selectedDetail = detail ? details[detail.id] : undefined;
  const selectedChecklist = detail ? checklists[detail.id] : undefined;
  const [detailError, setDetailError] = useState(false);
  async function updateDetail(write: () => Promise<void>) {
    if (changing.current) return;
    changing.current = true;
    setDetailError(false);
    try {
      await write();
    } catch {
      setDetailError(true);
    } finally {
      changing.current = false;
    }
  }
  const addKey = () => {
    const k = custom.trim();
    if (!k) return;
    setOptions((old) => (old.includes(k) ? old : [...old, k]));
    setDraft((old) => (old.includes(k) ? old : [...old, k]));
    setCustom('');
  };
  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.brand}>
          moa<Text style={{ color: '#83a26c' }}>.</Text>
        </Text>
        <Text style={s.demo}>캠퍼스 공지</Text>
        <Button label="도움말" onPress={() => setHelp(true)} />
      </View>
      <View style={s.pageViewport} {...pager.panHandlers}>
        <Animated.View
          pointerEvents={pageTransitioning ? 'none' : 'auto'}
          style={{ flex: 1, transform: [{ translateX: pageOffset }] }}
        >
          <ScrollView
            scrollEnabled={!cardDragging}
            ref={scroll}
            contentContainerStyle={s.content}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={s.eyebrow}>
              {['A / TRASH', 'B / DISCOVER', 'C / HOME', 'D / SETTINGS'][page]}
            </Text>
            <Text accessibilityRole="header" style={s.title}>
              {
                [
                  '잠시 내려놓은 공지',
                  '나에게 맞는 새로운 기회',
                  '선택한 기회를 한눈에',
                  '나를 위한 공지 설정',
                ][page]
              }
            </Text>
            <Text style={s.description}>
              {
                [
                  '버린 공지를 확인하고 다시 복구할 수 있어요.',
                  '선호 키워드에 맞는 공지를 살펴보고 선택하세요.',
                  '캘린더와 선택한 공지를 함께 확인하세요.',
                  '내 정보와 관심 키워드를 설정하세요.',
                ][page]
              }
            </Text>
            {page === 1 && (
              <>
                <Button
                  label={
                    syncStatus.phase === 'idle'
                      ? '실제 공지 새로고침'
                      : '공지 갱신 중…'
                  }
                  onPress={() => void refreshNotices()}
                />
                <Button
                  label={showAll ? '키워드 맞춤 보기' : '전체 공지 보기'}
                  onPress={() => setShowAll(!showAll)}
                />
                <Text accessibilityLiveRegion="polite" style={s.muted}>
                  {syncStatus.phase === 'collecting'
                    ? '원문 수집 중 · 수집된 공지는 바로 확인할 수 있어요.'
                    : syncStatus.phase === 'analyzing'
                      ? 'AI 분석 중 · 공지를 먼저 저장할 수 있어요.'
                      : '공지 갱신 대기 중'}
                </Text>
                {syncState.sources.map((source) => (
                  <Text key={source.sourceId} style={s.muted}>
                    {source.sourceId === 'seoultech_cs' ? '학과' : '본교'} ·
                    마지막 전체 수집 성공:{' '}
                    {source.lastSuccessAt
                      ? new Date(source.lastSuccessAt).toLocaleString('ko-KR', {
                          timeZone: 'Asia/Seoul',
                        })
                      : '아직 없음'}
                    {source.lastError
                      ? ` · 일부 수집 실패 (${source.detailFailures}건)`
                      : ''}
                  </Text>
                ))}
                <View style={s.row}>
                  {keys.map((k) => (
                    <Text key={k} style={s.tag}>
                      {k}
                    </Text>
                  ))}
                </View>
                <Text style={s.reason}>
                  카드: ← 버리기 · → 선택 · ↕ 보류{'\n'}카드 바깥 여백: ← → 화면
                  이동
                </Text>
              </>
            )}
            {page === 2 && (
              <View style={s.card}>
                <View style={s.between}>
                  <Button
                    label="이전 달"
                    onPress={() => {
                      setMonth(
                        new Date(month.getFullYear(), month.getMonth() - 1, 1),
                      );
                      setPicked(null);
                    }}
                  />
                  <Text style={s.cardTitle}>
                    {month.getFullYear()}년 {month.getMonth() + 1}월
                  </Text>
                  <Button
                    label="다음 달"
                    onPress={() => {
                      setMonth(
                        new Date(month.getFullYear(), month.getMonth() + 1, 1),
                      );
                      setPicked(null);
                    }}
                  />
                </View>
                <View style={s.grid}>
                  {['일', '월', '화', '수', '목', '금', '토'].map(
                    (d, weekday) => (
                      <View key={d} style={s.cell}>
                        <Text
                          style={[
                            s.muted,
                            weekday === 0 && s.sunday,
                            weekday === 6 && s.saturday,
                          ]}
                        >
                          {d}
                        </Text>
                      </View>
                    ),
                  )}
                  {Array.from({ length: month.getDay() }, (_, i) => (
                    <View key={`blank${i}`} style={s.cell} />
                  ))}
                  {Array.from(
                    {
                      length: new Date(
                        month.getFullYear(),
                        month.getMonth() + 1,
                        0,
                      ).getDate(),
                    },
                    (_, i) => {
                      const date = prefix + String(i + 1).padStart(2, '0');
                      const weekday = (month.getDay() + i) % 7;
                      const hasEvent = home.schedule.some(
                        (event) => event.date === date,
                      );
                      return (
                        <Pressable
                          key={date}
                          accessibilityRole="button"
                          accessibilityLabel={`${date}, 일정 ${hasEvent ? 1 : 0}개`}
                          accessibilityState={{ selected: picked === date }}
                          onPress={() =>
                            setPicked(picked === date ? null : date)
                          }
                          style={[
                            s.cell,
                            picked === date && s.primary,
                            date === today && s.today,
                          ]}
                        >
                          <Text
                            style={[
                              picked === date ? s.light : s.buttonText,
                              weekday === 0 && s.sunday,
                              weekday === 6 && s.saturday,
                            ]}
                          >
                            {i + 1}
                          </Text>
                          <Text style={[s.dot, picked === date && s.light]}>
                            {hasEvent ? '•' : ' '}
                          </Text>
                        </Pressable>
                      );
                    },
                  )}
                </View>
                <Text style={s.reason}>
                  {events.length
                    ? events
                        .map(
                          (event) =>
                            `${event.date} ${event.time ?? '시각 미확인'} · ${event.label} · ${event.title}`,
                        )
                        .join('\n')
                    : '선택한 일정이 없어요.'}
                </Text>
              </View>
            )}
            {page !== 3 ? (
              <>
                <View style={s.between}>
                  <Text style={s.section}>
                    {names[page]}
                    {page === 2 ? ' · 선택한 공지' : ''}
                  </Text>
                  <Text style={s.muted}>{visible.length}개</Text>
                </View>
                {visible.map((n) => (
                  <SwipeCard
                    key={n.id}
                    notice={n}
                    bucket={bucket}
                    onDragging={setCardDragging}
                    act={(action) => act(n.id, action)}
                    detail={() => {
                      setDetailError(false);
                      setDetail(n);
                      if (!n.synthetic)
                        void analyzeNotice(n.id).catch(() =>
                          setDetailError(true),
                        );
                    }}
                  />
                ))}
                {!visible.length && (
                  <View style={s.card}>
                    <Text style={s.description}>
                      {held.length
                        ? '보류한 공지는 다른 화면에 다녀오면 다시 표시돼요.'
                        : page === 0
                          ? '휴지통이 비어 있어요.'
                          : page === 1
                            ? '선호 키워드에 맞는 새 공지가 없어요.'
                            : '아직 선택한 공지가 없어요.'}
                    </Text>
                    {page !== 0 && (
                      <Button
                        label={
                          page === 1
                            ? '키워드 설정하기 →'
                            : '맞춤 공지 찾아보기 →'
                        }
                        onPress={() => navigate(page === 1 ? 3 : 1)}
                      />
                    )}
                  </View>
                )}
              </>
            ) : (
              <>
                <AnalysisSettings />
                <View style={s.card}>
                  <Text style={s.section}>내 정보</Text>
                  <Text style={s.muted}>학과</Text>
                  <TextInput
                    accessibilityLabel="학과"
                    value={dept}
                    onChangeText={setDept}
                    style={s.input}
                  />
                  <Text style={s.muted}>학년</Text>
                  <View style={s.row}>
                    {['1학년', '2학년', '3학년', '4학년'].map((g) => (
                      <Button
                        key={g}
                        label={g}
                        primary={grade === g}
                        onPress={() => setGrade(g)}
                      />
                    ))}
                  </View>
                  <Text style={s.muted}>학적 상태</Text>
                  <View style={s.row}>
                    {['재학', '휴학', '졸업'].map((g) => (
                      <Button
                        key={g}
                        label={g}
                        primary={status === g}
                        onPress={() => setStatus(g)}
                      />
                    ))}
                  </View>
                </View>
                <View style={s.card}>
                  <Text style={s.section}>선호 키워드</Text>
                  <View style={s.row}>
                    {options.map((k) => (
                      <Pressable
                        key={k}
                        accessibilityRole="button"
                        accessibilityLabel={k}
                        accessibilityState={{ selected: draft.includes(k) }}
                        onPress={() =>
                          setDraft((old) =>
                            old.includes(k)
                              ? old.filter((v) => v !== k)
                              : [...old, k],
                          )
                        }
                        style={[s.button, draft.includes(k) && s.primary]}
                      >
                        <Text
                          style={draft.includes(k) ? s.light : s.buttonText}
                        >
                          {k}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <TextInput
                    accessibilityLabel="직접 키워드 입력"
                    placeholder="직접 키워드 입력"
                    value={custom}
                    onChangeText={setCustom}
                    onSubmitEditing={addKey}
                    style={s.input}
                  />
                  <Button label="키워드 추가" onPress={addKey} />
                </View>
                <Button
                  label="설정 저장"
                  primary
                  onPress={() => {
                    if (!draft.length) {
                      setMessage('선호 키워드를 하나 이상 선택해주세요.');
                      return;
                    }
                    setKeys([...draft]);
                    setKeywords([...draft]);
                    setMessage('설정을 저장했어요. 맞춤 공지에 반영했습니다.');
                  }}
                />
                {testNotification && (
                  <Button
                    label={
                      testingNotification
                        ? '알림 예약 중…'
                        : '10초 뒤 테스트 알림'
                    }
                    onPress={async () => {
                      if (testingNotification) return;
                      setTestingNotification(true);
                      try {
                        const scheduled = await testNotification();
                        setMessage(
                          scheduled
                            ? '테스트 알림을 예약했어요.'
                            : '기기 설정에서 알림을 허용해 주세요.',
                        );
                      } catch (error) {
                        setMessage(
                          error instanceof Error
                            ? error.message
                            : '테스트 알림을 예약하지 못했어요.',
                        );
                      } finally {
                        setTestingNotification(false);
                      }
                    }}
                  />
                )}
                {reservationStatus && (
                  <View style={s.card}>
                    <Text style={s.section}>가상 공지 마감 알림 검증</Text>
                    <Text style={s.muted}>
                      해커톤 공지를 선택하고 신청 상태를 준비 중으로 바꾼 뒤
                      예약하세요. 테스트 알림은 5분 뒤에 예정돼요.
                    </Text>
                    {([true, false] as const).map((enable) => (
                      <Button
                        key={String(enable)}
                        label={
                          enable
                            ? '가상 마감 알림 예약'
                            : '가상 마감 예약 수 확인'
                        }
                        onPress={async () => {
                          if (testingNotification) return;
                          setTestingNotification(true);
                          try {
                            const count = await reservationStatus(enable);
                            setMessage(
                              `기기에 남은 가상 마감 예약 · ${count}건`,
                            );
                          } catch (error) {
                            setMessage(
                              error instanceof Error
                                ? error.message
                                : '예약을 확인하지 못했어요.',
                            );
                          } finally {
                            setTestingNotification(false);
                          }
                        }}
                      />
                    ))}
                  </View>
                )}
              </>
            )}
            {__DEV__ && page === 1 && (
              <Button
                label="T02 수집 검증 열기"
                onPress={() => router.push('/dev/collection')}
              />
            )}
            <Text style={s.muted}>
              가상 예시는 카드에 표시됩니다. 실제 공지의 내용과 신청 방법은
              원문에서 확인하세요. 공지 선택과 준비물 체크는 이 기기에
              저장됩니다.
            </Text>
            {!!syncStatus.message && (
              <Text accessibilityLiveRegion="polite" style={s.reason}>
                {syncStatus.message}
              </Text>
            )}
            {!!syncStatus.analysisRetryAt &&
              Date.parse(syncStatus.analysisRetryAt) > Date.now() && (
                <Text style={s.reason}>
                  분석 재시도 가능:{' '}
                  {new Date(syncStatus.analysisRetryAt).toLocaleString(
                    'ko-KR',
                    {
                      timeZone: 'Asia/Seoul',
                    },
                  )}{' '}
                  KST
                </Text>
              )}
          </ScrollView>
        </Animated.View>
      </View>
      {!!message && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="알림 닫기"
          onPress={() => setMessage('')}
          style={s.toast}
        >
          <Text accessibilityRole="alert" style={s.light}>
            {message}
          </Text>
        </Pressable>
      )}
      <View style={s.nav}>
        {names.map((name, i) => (
          <Pressable
            key={name}
            accessibilityRole="tab"
            accessibilityLabel={name}
            accessibilityState={{ selected: page === i }}
            onPress={() => navigate(i)}
            style={[s.navItem, page === i && s.primary]}
          >
            <Text style={[s.navLetter, page === i && s.light]}>
              {['A', 'B', 'C', 'D'][i]}
            </Text>
            <Text style={[s.buttonText, page === i && s.light]}>{name}</Text>
          </Pressable>
        ))}
      </View>
      <Modal
        visible={help || !!detail}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setHelp(false);
          setDetail(null);
        }}
      >
        <View style={s.backdrop}>
          <ScrollView style={s.dialog} contentContainerStyle={{ gap: 12 }}>
            <Text style={s.section}>{detail?.title ?? '모아 사용 방법'}</Text>
            <Text style={s.description}>
              {detail
                ? `${detail.org}\n\n${detail.summary}\n\n${detail.date ? `${detail.date} ${detail.time ?? '시각 미확인'}` : '확정 신청 마감 없음 · 원문 확인 필요'}\n\n${detail.synthetic ? '가상 예시 공지입니다. 실제 원문 링크는 연결되어 있지 않습니다.' : detail.analysisLabel}`
                : '카드 안에서 ← 버리기, → 선택 또는 복구, ↕ 보류할 수 있어요.\n\n보류한 공지는 다른 화면에 갔다 돌아오면 다시 나타나요.\n\n카드 바깥 여백에서 좌우로 밀거나 하단 탭을 눌러 화면을 이동하세요. 휴지통에서는 영구 삭제하지 않습니다.'}
            </Text>
            {detail && !detail.synthetic && selectedDetail && (
              <>
                <Button
                  label="공지 원문 열기"
                  onPress={() => {
                    void Linking.openURL(selectedDetail.sourceUrl).catch(() =>
                      setDetailError(true),
                    );
                  }}
                />
                <Button
                  label="분석 다시 시도"
                  onPress={() => {
                    void analyzeNotice(detail.id).catch(() =>
                      setDetailError(true),
                    );
                  }}
                />
                <Text style={s.muted}>
                  {selectedDetail.raw.hasBodyImages ||
                  selectedDetail.raw.attachments.length
                    ? '이미지·첨부 내용은 원문에서 직접 확인하세요.'
                    : ''}
                </Text>
                {selectedDetail.analysisFresh &&
                  selectedDetail.analysis?.data.review_notes.map(
                    (note, index) => (
                      <Text key={`review-${index}`} style={s.reason}>
                        {note}
                      </Text>
                    ),
                  )}
                {selectedDetail.analysisFresh &&
                  selectedDetail.analysis?.data.events.map((event, index) => (
                    <Text key={index} style={s.description}>
                      {event.label} ·{' '}
                      {event.status === 'resolved'
                        ? `${event.date} ${event.time ?? '시각 미확인'}`
                        : '날짜 확인 필요'}
                    </Text>
                  ))}
                {!selectedDetail.analysis && (
                  <Text selectable style={s.description}>
                    {selectedDetail.raw.bodyText}
                  </Text>
                )}
                {selectedDetail.disposition !== 'saved' && (
                  <Button
                    label="관심 저장"
                    onPress={() =>
                      void updateDetail(() => actions.saveNotice(detail.id))
                    }
                  />
                )}
              </>
            )}
            {detail && selectedDetail?.disposition === 'saved' && (
              <>
                <Text style={s.section}>준비물</Text>
                {selectedChecklist?.updatedChecklist && (
                  <Text style={s.reason}>
                    준비물이 변경되었어요. 기존 체크 기록은 유지합니다. 새 목록:{' '}
                    {selectedChecklist.updatedChecklist
                      .map(({ text }) => text)
                      .join(', ')}
                  </Text>
                )}
                {selectedChecklist?.items.length ? (
                  selectedChecklist.items.map((item) => (
                    <Button
                      key={item.id}
                      label={`${item.completed ? '체크됨' : '체크하기'} · ${item.text}`}
                      onPress={() =>
                        void updateDetail(() =>
                          actions.setChecklistCompleted(
                            item.id,
                            !item.completed,
                          ),
                        )
                      }
                    />
                  ))
                ) : (
                  <Text style={s.muted}>확인된 준비물이 없어요.</Text>
                )}
                <Text style={s.muted}>
                  신청 상태 ·{' '}
                  {selectedDetail.progress === 'applied'
                    ? '신청 완료'
                    : selectedDetail.progress === 'preparing'
                      ? '준비 중'
                      : '관심 저장'}
                </Text>
                {selectedDetail.progress !== 'preparing' && (
                  <Button
                    label="준비 중으로 변경"
                    onPress={() =>
                      void updateDetail(() =>
                        actions.setProgress(detail.id, 'preparing'),
                      )
                    }
                  />
                )}
                {selectedDetail.progress !== 'applied' && (
                  <Button
                    label="신청 완료로 변경"
                    onPress={() =>
                      void updateDetail(() =>
                        actions.setProgress(detail.id, 'applied'),
                      )
                    }
                  />
                )}
                {detailError && (
                  <Text accessibilityRole="alert">
                    변경 내용을 저장하지 못했어요.
                  </Text>
                )}
              </>
            )}
            <Button
              label="닫기"
              primary
              onPress={() => {
                setHelp(false);
                setDetail(null);
              }}
            />
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  pageViewport: { flex: 1, overflow: 'hidden' },
  safe: { flex: 1, backgroundColor: '#f7f8f3' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#dfe5d9',
    gap: 8,
  },
  brand: { fontSize: 30, fontWeight: '900', color: '#213e32' },
  demo: {
    backgroundColor: '#e0efaa',
    borderRadius: 20,
    padding: 7,
    fontSize: 10,
    color: green,
  },
  content: {
    padding: 28,
    gap: 16,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    paddingBottom: 40,
  },
  eyebrow: { color: green, fontSize: 10, letterSpacing: 2, fontWeight: '800' },
  title: { fontSize: 28, fontWeight: '800', color: '#213e32', lineHeight: 38 },
  description: { fontSize: 14, lineHeight: 24, color: '#728174' },
  muted: { color: '#728174', fontSize: 12, lineHeight: 19 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  between: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
  },
  card: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#dfe5d9',
    borderRadius: 20,
    padding: 18,
    gap: 14,
  },
  cardTitle: {
    color: '#213e32',
    fontSize: 18,
    lineHeight: 27,
    fontWeight: '700',
    flexShrink: 1,
  },
  section: { color: '#213e32', fontSize: 17, fontWeight: '700' },
  tag: {
    color: '#56713f',
    fontSize: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#edf2e2',
    borderRadius: 7,
  },
  reason: {
    backgroundColor: '#f1f5e9',
    padding: 12,
    borderRadius: 10,
    color: '#213e32',
    fontSize: 12,
    lineHeight: 21,
  },
  button: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: '#dfe5d9',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: green, borderColor: green, borderRadius: 12 },
  buttonText: { color: green, fontSize: 12 },
  light: { color: 'white', fontSize: 12, lineHeight: 20 },
  link: { color: green, fontSize: 12, paddingVertical: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  today: { borderWidth: 2, borderColor: '#83a26c', borderRadius: 12 },
  saturday: { color: '#2563eb' },
  sunday: { color: '#dc2626' },
  draggingCard: {
    zIndex: 10,
    elevation: 8,
    shadowColor: '#213e32',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
  },
  cell: {
    width: '14.285714%',
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { fontSize: 10, lineHeight: 10, color: green },
  input: {
    borderWidth: 1,
    borderColor: '#dfe5d9',
    padding: 12,
    borderRadius: 11,
    color: '#213e32',
  },
  nav: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderColor: '#dfe5d9',
    padding: 12,
    gap: 5,
  },
  navItem: { flex: 1, alignItems: 'center', padding: 8, gap: 3 },
  navLetter: { color: green, fontSize: 16, fontWeight: '800' },
  toast: {
    backgroundColor: '#213e32',
    padding: 14,
    marginHorizontal: 20,
    borderRadius: 12,
  },
  backdrop: {
    flex: 1,
    backgroundColor: '#18382888',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '95%',
    flexGrow: 0,
    alignSelf: 'center',
    backgroundColor: '#f7f8f3',
    borderRadius: 24,
    padding: 26,
    gap: 22,
  },
});
