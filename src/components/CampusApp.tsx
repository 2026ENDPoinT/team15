import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from 'react';

import { router } from 'expo-router';
import {
  Animated,
  Easing,
  Keyboard,
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
import DiscoverCard from './DiscoverCard';
import { AnalysisSettings } from './AnalysisSettings';
import {
  detailReviewNotes,
  deadlineReminderLabel,
} from '../features/demo/noticeDetailPresentation';

import type { Disposition as Bucket, Profile } from '../../shared/contracts';
import { evaluateEligibility } from '../domain/eligibility';

const eligibilityLabels = {
  basic_match: '기본 조건 일치',
  mismatch: '지원 조건 불일치',
  needs_review: '지원 조건 확인 필요',
};
function DetailOnOpen({
  onOpen,
  children,
}: {
  onOpen: () => void;
  children: ReactNode;
}) {
  const openRef = useRef(onOpen);
  useEffect(() => {
    openRef.current();
  }, []);
  return <>{children}</>;
}
const names = ['휴지통', '맞춤 공지', '메인', '설정'];
const green = '#28634d';
function Button({
  label,
  onPress,
  primary = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
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
  detailContent,
  eligibilityLabel,
  onDragging,
}: {
  notice: Notice;
  bucket: Bucket;
  act: (action: string) => void;
  detailContent: ReactNode;
  eligibilityLabel: string;
  onDragging: (dragging: boolean) => void;
}) {
  const position = useRef(new Animated.ValueXY()).current;
  const axis = useRef<'x' | 'y' | null>(null);
  const actRef = useRef(act);
  actRef.current = act;
  const [dragging, setDragging] = useState(false);
  const [expanded, setExpanded] = useState(false);

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
  const responder = useMemo(
    () =>
      PanResponder.create({
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
            actRef.current(
              g.dx > 0
                ? bucket === 'dismissed'
                  ? 'restore'
                  : 'select'
                : bucket === 'unseen'
                  ? 'discard'
                  : 'none',
            );
          else if (axis.current === 'y' && Math.abs(g.dy) >= 48)
            actRef.current('hold');
          reset();
        },
      }),
    [bucket, position, onDragging],
  );

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
      <Text style={s.muted}>{eligibilityLabel}</Text>
      <Text style={s.muted}>
        {notice.date
          ? `${notice.date} · ${notice.time ? `${notice.time ?? '시각 미확인'} KST` : '시각 미확인'}`
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
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        aria-expanded={expanded}
        onPress={() => setExpanded((old) => !old)}
      >
        <Text style={s.link}>
          {expanded ? '상세 접기 ∧' : '공지 자세히 보기 ∨'}
        </Text>
      </Pressable>
      {expanded && detailContent}
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
    reminders,
    notificationSnapshot,
    refreshReminders,
    notices,
    home,
    syncState,
    syncStatus,
    reminderWarning,
    refreshNotices,
    analyzeNotice,
    setKeywords,
  } = useDemoNotice();
  const changing = useRef(false);
  const [held, setHeld] = useState<string[]>([]);
  const [keys, setKeys] = useState(['대회', '장학금']);
  const [draft, setDraft] = useState(keys);
  const [options] = useState([
    '대회',
    '장학금',
    '취업',
    '인턴십',
    '교환학생',
    '인공지능',
  ]);
  const [customOptions, setCustomOptions] = useState<string[]>([]);
  const [deletingKeywords, setDeletingKeywords] = useState(false);
  const [custom, setCustom] = useState('');
  const [dept, setDept] = useState('컴퓨터공학과');
  const [grade, setGrade] = useState('3학년');
  const [status, setStatus] = useState('재학');
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [cardDragging, setCardDragging] = useState(false);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const [picked, setPicked] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [message, setMessage] = useState('');
  const [testingNotification, setTestingNotification] = useState(false);
  const scrolls = useRef<(ComponentRef<typeof ScrollView> | null)[]>([]);
  const { width } = useWindowDimensions();
  const pageOffset = useRef(new Animated.Value(-2 * width)).current;
  const transitioning = useRef(false);
  const pageDragging = useRef(false);
  const [pageTransitioning, setPageTransitioning] = useState(false);
  const [draggingPage, setDraggingPage] = useState(false);
  useLayoutEffect(() => {
    pageOffset.stopAnimation();
    pageOffset.setValue(-pageRef.current * width);
    transitioning.current = false;
    pageDragging.current = false;
    setPageTransitioning(false);
    setDraggingPage(false);
    return () => pageOffset.stopAnimation();
  }, [width, pageOffset]);
  const settlePage = (next: number) => {
    const previous = pageRef.current;
    pageDragging.current = false;
    setDraggingPage(false);
    transitioning.current = true;
    setPageTransitioning(true);
    if (next !== previous) {
      setDeletingKeywords(false);
      Keyboard.dismiss();
      scrolls.current[next]?.scrollTo({ y: 0, animated: false });
    }
    Animated.timing(pageOffset, {
      toValue: -next * width,
      duration: 260 + Math.abs(next - previous) * 60,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      if (next !== previous) {
        pageRef.current = next;
        setPage(next);
        setHeld([]);
        setMessage('');
        scrolls.current[next]?.scrollTo({ y: 0, animated: false });
      }
      transitioning.current = false;
      setPageTransitioning(false);
    });
  };

  const navigate = (next: number) => {
    if (
      next < 0 ||
      next > 3 ||
      next === pageRef.current ||
      transitioning.current ||
      pageDragging.current ||
      cardDragging
    )
      return;
    settlePage(next);
  };
  const pager = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          !transitioning.current &&
          !cardDragging &&
          Math.abs(g.dx) > 18 &&
          Math.abs(g.dx) > Math.abs(g.dy) * 1.25,
        onPanResponderGrant: () => {
          pageDragging.current = true;
          setDraggingPage(true);
          pageOffset.stopAnimation();
          // Incoming pages always start at the top, even during the drag preview.
          scrolls.current.forEach((scroll, index) => {
            if (index !== pageRef.current)
              scroll?.scrollTo({ y: 0, animated: false });
          });
        },
        onPanResponderMove: (_, g) => {
          pageOffset.setValue(
            Math.max(-3 * width, Math.min(0, -pageRef.current * width + g.dx)),
          );
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderTerminate: () => settlePage(pageRef.current),
        onPanResponderRelease: (_, g) => {
          const advance =
            Math.abs(g.dx) >= width * 0.22 ||
            (Math.abs(g.dx) > 12 && Math.abs(g.vx) > 0.45 && g.dx * g.vx > 0);
          const next = advance
            ? Math.max(0, Math.min(3, pageRef.current + (g.dx < 0 ? 1 : -1)))
            : pageRef.current;
          settlePage(next);
        },
      }),
    [width, cardDragging, pageOffset],
  );
  const act = async (id: string, action: string) => {
    if (action === 'hold') {
      setHeld((old) => [...old, id]);
      setMessage('보류했어요. 다른 화면에 다녀오면 다시 나타나요.');
      return true;
    }
    const write = {
      discard: actions.dismissNotice,
      select: actions.saveNotice,
      restore: actions.restoreNotice,
      unselect: actions.unsaveNotice,
    }[action as 'discard' | 'select' | 'restore' | 'unselect'];
    if (!write || changing.current) return false;
    changing.current = true;
    try {
      await write(id);
    } catch {
      setMessage('공지 상태를 저장하지 못했어요. 다시 시도해 주세요.');
      return false;
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
    return true;
  };
  const [showAll, setShowAll] = useState(false);
  const profile: Pick<Profile, 'department' | 'grade' | 'enrollment'> = {
    department: dept,
    grade: Number(grade.slice(0, 1)) as Profile['grade'],
    enrollment:
      status === '재학' ? 'enrolled' : status === '휴학' ? 'leave' : 'other',
  };
  const eligibility = Object.fromEntries(
    notices.map(({ id }) => [
      id,
      evaluateEligibility(
        profile,
        details[id]?.analysis?.data ?? null,
        details[id]?.analysisFresh ?? false,
      ),
    ]),
  );

  const prefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-`;
  const events = home.schedule.filter(
    (event) =>
      event.date.startsWith(prefix) && (!picked || event.date === picked),
  );
  const [detailUpdating, setDetailUpdating] = useState(false);
  const [detailErrors, setDetailErrors] = useState<Record<string, boolean>>({});
  async function updateDetail(id: string, write: () => Promise<void>) {
    if (changing.current) return;
    changing.current = true;
    setDetailUpdating(true);
    setDetailErrors((old) => ({ ...old, [id]: false }));
    try {
      await write();
    } catch {
      setDetailErrors((old) => ({ ...old, [id]: true }));
    } finally {
      changing.current = false;
      setDetailUpdating(false);
    }
  }
  function renderNoticeDetails(notice: Notice) {
    const selectedDetail = details[notice.id];
    const selectedChecklist = checklists[notice.id];
    return (
      <DetailOnOpen
        onOpen={() => {
          if (!notice.synthetic)
            void analyzeNotice(notice.id).catch(() =>
              setDetailErrors((old) => ({ ...old, [notice.id]: true })),
            );
        }}
      >
        <View style={s.inlineDetail} testID={`notice-detail-${notice.id}`}>
          <Text style={s.section}>상세 내용</Text>
          <Text
            style={s.description}
          >{`${notice.org}\n\n${notice.summary}\n\n${notice.date ? `${notice.date} ${notice.time ? `${notice.time} KST` : '시각 미확인'}` : '일정 미정 · 원문 확인 필요'}\n\n${notice.synthetic ? '가상 예시 공지입니다. 실제 원문 링크는 연결되어 있지 않습니다.' : notice.analysisLabel}`}</Text>
          <Text style={s.reason}>
            {eligibilityLabels[eligibility[notice.id]!.result]} ·{' '}
            {eligibility[notice.id]!.reasons.join(' ')}
          </Text>
          {!notice.synthetic && selectedDetail && (
            <>
              <Button
                label="공지 원문 열기"
                onPress={() => {
                  void Linking.openURL(selectedDetail.sourceUrl).catch(() =>
                    setDetailErrors((old) => ({ ...old, [notice.id]: true })),
                  );
                }}
              />
              <Button
                label="분석 다시 시도"
                onPress={() => {
                  void analyzeNotice(notice.id).catch(() =>
                    setDetailErrors((old) => ({ ...old, [notice.id]: true })),
                  );
                }}
              />
              {detailReviewNotes(
                selectedDetail.analysisFresh
                  ? (selectedDetail.analysis?.data.review_notes ?? [])
                  : [],
                selectedDetail.raw.hasBodyImages ||
                  selectedDetail.raw.attachments.length > 0,
              ).map((note) => (
                <Text key={note} style={s.reason}>
                  {note}
                </Text>
              ))}
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
                  disabled={detailUpdating}
                  onPress={() =>
                    void updateDetail(notice.id, () =>
                      actions.saveNotice(notice.id),
                    )
                  }
                />
              )}
            </>
          )}

          {selectedDetail?.disposition === 'saved' && (
            <>
              {selectedDetail.deadlineChanged && (
                <>
                  <Text style={s.reason}>
                    마감이 변경되었어요. 새 일정을 확인해 주세요.
                  </Text>
                  <Button
                    label="마감 변경 확인"
                    disabled={detailUpdating}
                    onPress={() =>
                      void updateDetail(notice.id, () =>
                        actions.acknowledgeDeadlineChange(notice.id),
                      )
                    }
                  />
                </>
              )}
              <Text style={s.section}>신청·제출 체크리스트</Text>
              {selectedChecklist?.updatedChecklist && (
                <Text style={s.reason}>
                  체크리스트가 변경되었어요. 기존 체크 기록은 유지합니다. 새
                  목록:{' '}
                  {selectedChecklist.updatedChecklist
                    .map(({ text }) => text)
                    .join(', ')}
                </Text>
              )}

              {selectedChecklist?.items.length ? (
                selectedChecklist.items.map((item) => (
                  <Pressable
                    key={item.id}
                    accessibilityRole="checkbox"
                    accessibilityLabel={item.text}
                    accessibilityState={{
                      checked: item.completed,
                      disabled: detailUpdating,
                    }}
                    disabled={detailUpdating}
                    aria-checked={item.completed}
                    style={[s.button, item.completed && s.checkedItem]}
                    onPress={() =>
                      void updateDetail(notice.id, () =>
                        actions.setChecklistCompleted(item.id, !item.completed),
                      )
                    }
                  >
                    <Text
                      style={s.buttonText}
                    >{`${item.completed ? '☑ 완료' : '☐ 미완료'} · ${item.text}`}</Text>
                  </Pressable>
                ))
              ) : (
                <Text style={s.muted}>확인된 신청·제출 항목이 없어요.</Text>
              )}
              <View style={s.reminderStatus}>
                <Text style={s.buttonText}>
                  {deadlineReminderLabel(
                    notice.id,
                    notificationSnapshot,
                    reminders,
                  )}
                </Text>
                <Text style={s.muted}>
                  확정된 신청 마감 하루 전 오전 9시(KST)에 알려드려요. 신청 완료
                  상태이거나 예약 시각이 지났다면 예약하지 않아요. 가상 공지는
                  테스트 예약을 사용해요.
                </Text>
                <Button
                  label="알림 상태 다시 확인"
                  disabled={detailUpdating}
                  onPress={() => void updateDetail(notice.id, refreshReminders)}
                />
              </View>
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
                  disabled={detailUpdating}
                  onPress={() =>
                    void updateDetail(notice.id, () =>
                      actions.setProgress(notice.id, 'preparing'),
                    )
                  }
                />
              )}
              {selectedDetail.progress !== 'applied' && (
                <Button
                  label="신청 완료로 변경"
                  disabled={detailUpdating}
                  onPress={() =>
                    void updateDetail(notice.id, () =>
                      actions.setProgress(notice.id, 'applied'),
                    )
                  }
                />
              )}
              {detailErrors[notice.id] && (
                <Text accessibilityRole="alert">
                  변경 내용을 저장하지 못했어요.
                </Text>
              )}
            </>
          )}
        </View>
      </DetailOnOpen>
    );
  }
  const addKey = () => {
    const k = custom.trim();
    if (!k) return;
    if (deletingKeywords) return;
    if (!options.includes(k)) {
      setCustomOptions((old) => (old.includes(k) ? old : [...old, k]));
    }
    setDraft((old) => (old.includes(k) ? old : [...old, k]));
    setCustom('');
  };
  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.brand}>GongMoa</Text>
        <Text style={s.demo}>캠퍼스 공지 · 데모</Text>

        <Button label="도움말" onPress={() => setHelp(true)} />
      </View>
      {!!reminderWarning &&
        (page !== 1 || reminderWarning !== syncStatus.message) && (
          <Text accessibilityLiveRegion="polite" style={s.reason}>
            {reminderWarning}
          </Text>
        )}
      <View style={s.pageViewport} {...pager.panHandlers}>
        <Animated.View
          pointerEvents={pageTransitioning ? 'none' : 'auto'}
          style={{
            flex: 1,
            flexDirection: 'row',
            width: width * names.length,
            transform: [{ translateX: pageOffset }],
          }}
        >
          {names.map((_, page) => {
            const bucket: Bucket =
              page === 0 ? 'dismissed' : page === 1 ? 'unseen' : 'saved';
            const visible = notices.filter(
              (n) =>
                buckets[n.id] === bucket &&
                (page !== pageRef.current || !held.includes(n.id)) &&
                (page !== 1 ||
                  showAll ||
                  (eligibility[n.id]!.result !== 'mismatch' &&
                    keys.some(
                      (k) =>
                        n.tags.includes(k) ||
                        n.title.includes(k) ||
                        n.summary.includes(k),
                    ))),
            );
            const nextNotice = visible[0];
            return (
              <View
                key={page}
                testID={`campus-page-${page}`}
                style={{ width, flexShrink: 0 }}
                pointerEvents={page === pageRef.current ? 'auto' : 'none'}
                aria-hidden={page !== pageRef.current}
                accessibilityElementsHidden={page !== pageRef.current}
                importantForAccessibility={
                  page === pageRef.current ? 'auto' : 'no-hide-descendants'
                }
              >
                {page === 1 ? (
                  <ScrollView
                    testID={
                      page === pageRef.current
                        ? 'active-page'
                        : 'inactive-page-1'
                    }
                    scrollEnabled={
                      !cardDragging && !draggingPage && !pageTransitioning
                    }
                    ref={(scroll) => {
                      scrolls.current[page] = scroll;
                    }}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={s.discoverPage}
                  >
                    <View style={s.between}>
                      <Text accessibilityRole="header" style={s.section}>
                        맞춤 공지
                      </Text>
                      <Text style={s.muted}>남은 공지 {visible.length}개</Text>
                    </View>
                    <Button
                      label={
                        syncStatus.phase === 'idle'
                          ? '실제 공지 새로고침'
                          : '공지 갱신 중…'
                      }
                      onPress={() => {
                        if (syncStatus.phase === 'idle') void refreshNotices();
                      }}
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
                          ? new Date(source.lastSuccessAt).toLocaleString(
                              'ko-KR',
                              {
                                timeZone: 'Asia/Seoul',
                              },
                            )
                          : '아직 없음'}
                        {source.lastError
                          ? ` · 일부 수집 실패 (${source.detailFailures}건)`
                          : ''}
                      </Text>
                    ))}
                    {!!syncStatus.message && (
                      <Text style={s.reason}>{syncStatus.message}</Text>
                    )}
                    {!!syncStatus.analysisRetryAt &&
                      Date.parse(syncStatus.analysisRetryAt) > Date.now() && (
                        <Text style={s.muted}>
                          분석 재시도 가능:{' '}
                          {new Date(syncStatus.analysisRetryAt).toLocaleString(
                            'ko-KR',
                            { timeZone: 'Asia/Seoul' },
                          )}{' '}
                          KST
                        </Text>
                      )}
                    {__DEV__ && (
                      <>
                        <Button
                          label="T02 수집 검증 열기"
                          onPress={() => router.push('/dev/collection')}
                        />
                        <Button
                          label="T09 변경·알림 검증 열기"
                          onPress={() => router.push('/dev/t09')}
                        />
                      </>
                    )}

                    {nextNotice ? (
                      <DiscoverCard
                        key={nextNotice.id}
                        notice={nextNotice}
                        eligibilityLabel={
                          eligibilityLabels[eligibility[nextNotice.id]!.result]
                        }
                        onDragging={setCardDragging}
                        act={(action) => act(nextNotice.id, action)}
                        detailContent={renderNoticeDetails(nextNotice)}
                      />
                    ) : (
                      <View style={s.card}>
                        <Text style={s.description}>
                          {held.length
                            ? '보류한 공지는 다른 화면에 다녀오면 다시 표시돼요.'
                            : '선호 키워드에 맞는 새 공지가 없어요.'}
                        </Text>
                        <Button
                          label="키워드 수정하기 →"
                          onPress={() => navigate(3)}
                        />
                      </View>
                    )}
                  </ScrollView>
                ) : (
                  <ScrollView
                    testID={
                      page === pageRef.current
                        ? 'active-page'
                        : `inactive-page-${page}`
                    }
                    scrollEnabled={
                      !cardDragging && !draggingPage && !pageTransitioning
                    }
                    ref={(scroll) => {
                      scrolls.current[page] = scroll;
                    }}
                    contentContainerStyle={s.content}
                    keyboardShouldPersistTaps="handled"
                  >
                    <Text style={s.eyebrow}>
                      {
                        [
                          'A / TRASH',
                          'B / DISCOVER',
                          'C / HOME',
                          'D / SETTINGS',
                        ][page]
                      }
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
                    {page === 2 && (
                      <View style={s.card}>
                        <View style={s.between}>
                          <Button
                            label="이전 달"
                            onPress={() => {
                              setMonth(
                                new Date(
                                  month.getFullYear(),
                                  month.getMonth() - 1,
                                  1,
                                ),
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
                                new Date(
                                  month.getFullYear(),
                                  month.getMonth() + 1,
                                  1,
                                ),
                              );
                              setPicked(null);
                            }}
                          />
                        </View>
                        <View>
                          <View style={s.calendarRow}>
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
                          </View>
                          {Array.from(
                            {
                              length: Math.ceil(
                                (month.getDay() +
                                  new Date(
                                    month.getFullYear(),
                                    month.getMonth() + 1,
                                    0,
                                  ).getDate()) /
                                  7,
                              ),
                            },
                            (_, week) => (
                              <View key={week} style={s.calendarRow}>
                                {Array.from({ length: 7 }, (_, weekday) => {
                                  const i = week * 7 + weekday - month.getDay();
                                  const days = new Date(
                                    month.getFullYear(),
                                    month.getMonth() + 1,
                                    0,
                                  ).getDate();
                                  if (i < 0 || i >= days)
                                    return (
                                      <View key={weekday} style={s.cell} />
                                    );
                                  const date =
                                    prefix + String(i + 1).padStart(2, '0');

                                  const hasEvent = home.schedule.some(
                                    (event) => event.date === date,
                                  );
                                  return (
                                    <Pressable
                                      key={date}
                                      accessibilityRole="button"
                                      accessibilityLabel={`${date}, 일정 ${hasEvent ? 1 : 0}개`}
                                      accessibilityState={{
                                        selected: picked === date,
                                      }}
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
                                          picked === date
                                            ? s.light
                                            : s.buttonText,
                                          weekday === 0 && s.sunday,
                                          weekday === 6 && s.saturday,
                                        ]}
                                      >
                                        {i + 1}
                                      </Text>
                                      <Text
                                        style={[
                                          s.dot,
                                          picked === date && s.light,
                                        ]}
                                      >
                                        {hasEvent ? '•' : ' '}
                                      </Text>
                                    </Pressable>
                                  );
                                })}
                              </View>
                            ),
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
                            eligibilityLabel={
                              eligibilityLabels[eligibility[n.id]!.result]
                            }
                            bucket={bucket}
                            onDragging={setCardDragging}
                            act={(action) => act(n.id, action)}
                            detailContent={renderNoticeDetails(n)}
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
                                accessibilityState={{
                                  selected: draft.includes(k),
                                }}
                                disabled={deletingKeywords}
                                onPress={() =>
                                  setDraft((old) =>
                                    old.includes(k)
                                      ? old.filter((v) => v !== k)
                                      : [...old, k],
                                  )
                                }
                                style={[
                                  s.button,
                                  draft.includes(k) && s.primary,
                                ]}
                              >
                                <Text
                                  style={
                                    draft.includes(k) ? s.light : s.buttonText
                                  }
                                >
                                  {k}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                          {customOptions.length > 0 && (
                            <View style={s.customKeywords}>
                              <Text style={s.muted}>직접 추가한 키워드</Text>
                              <View style={s.row}>
                                {customOptions.map((k) => (
                                  <Pressable
                                    key={k}
                                    accessibilityRole="button"
                                    accessibilityLabel={
                                      deletingKeywords ? `${k} 삭제` : k
                                    }
                                    accessibilityState={{
                                      selected: draft.includes(k),
                                    }}
                                    onPress={() => {
                                      if (deletingKeywords) {
                                        setCustomOptions((old) =>
                                          old.filter((v) => v !== k),
                                        );
                                        setDraft((old) =>
                                          old.filter((v) => v !== k),
                                        );
                                        const nextKeys = keys.filter(
                                          (v) => v !== k,
                                        );
                                        setKeys(nextKeys);
                                        setKeywords(nextKeys);
                                      } else {
                                        setDraft((old) =>
                                          old.includes(k)
                                            ? old.filter((v) => v !== k)
                                            : [...old, k],
                                        );
                                      }
                                    }}
                                    style={[
                                      s.button,
                                      draft.includes(k) && s.primary,
                                      deletingKeywords && s.deletableKeyword,
                                    ]}
                                  >
                                    <Text
                                      style={
                                        draft.includes(k)
                                          ? s.light
                                          : s.buttonText
                                      }
                                    >
                                      {k}
                                    </Text>
                                  </Pressable>
                                ))}
                              </View>
                            </View>
                          )}
                          {deletingKeywords && (
                            <Text style={s.deleteHint}>
                              빨간 테두리의 키워드를 누르면 삭제됩니다.
                            </Text>
                          )}
                          <TextInput
                            editable={!deletingKeywords}
                            accessibilityLabel="직접 키워드 입력"
                            placeholder="직접 키워드 입력"
                            value={custom}
                            onChangeText={setCustom}
                            onSubmitEditing={addKey}
                            style={s.input}
                          />
                          <View style={s.keywordActions}>
                            <View style={{ flex: 7 }}>
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="키워드 추가"
                                disabled={deletingKeywords}
                                onPress={addKey}
                                style={[
                                  s.button,
                                  deletingKeywords && { opacity: 0.4 },
                                ]}
                              >
                                <Text style={s.buttonText}>키워드 추가</Text>
                              </Pressable>
                            </View>
                            <View style={{ flex: 3 }}>
                              <Button
                                label={
                                  deletingKeywords ? '삭제 취소' : '키워드 삭제'
                                }
                                onPress={() =>
                                  setDeletingKeywords((old) => !old)
                                }
                              />
                            </View>
                          </View>
                        </View>
                        <Button
                          label="설정 저장"
                          primary
                          onPress={() => {
                            if (!draft.length) {
                              setMessage(
                                '선호 키워드를 하나 이상 선택해주세요.',
                              );
                              return;
                            }
                            setKeys([...draft]);
                            setKeywords([...draft]);
                            setMessage(
                              '설정을 저장했어요. 맞춤 공지에 반영했습니다.',
                            );
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
                            <Text style={s.section}>
                              가상 공지 마감 알림 검증
                            </Text>
                            <Text style={s.muted}>
                              해커톤 공지를 선택하고 신청 상태를 준비 중으로
                              바꾼 뒤 예약하세요. 테스트 알림은 5분 뒤에
                              예정돼요.
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
                                    const count =
                                      await reservationStatus(enable);
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
                    <Text style={s.muted}>
                      가상 예시는 카드에 표시됩니다. 실제 공지의 내용은 원문에서
                      확인하세요. 공지 선택과 준비물 체크는 이 기기에
                      저장됩니다.
                    </Text>
                  </ScrollView>
                )}
              </View>
            );
          })}
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
            aria-selected={page === i}
            accessibilityState={{
              selected: page === i,
              disabled: pageTransitioning || draggingPage || cardDragging,
            }}
            disabled={pageTransitioning || draggingPage || cardDragging}

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
        visible={help}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setHelp(false);
        }}
      >
        <View style={s.backdrop}>
          <View style={s.dialog}>
            <Text style={s.section}>사용 방법 안내</Text>
            <Text style={s.description}>
              {
                '카드 안에서 ← 버리기, → 선택 또는 복구, ↕ 보류할 수 있어요.\n\n보류한 공지는 다른 화면에 갔다 돌아오면 다시 나타나요.\n\n카드 바깥 여백에서 좌우로 밀거나 하단 탭을 눌러 화면을 이동하세요. 휴지통에서는 영구 삭제하지 않습니다.'
              }
            </Text>

            <Button
              label="닫기"
              primary
              onPress={() => {
                setHelp(false);
              }}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  checkedItem: { backgroundColor: '#e8f1e8', borderColor: '#83a26c' },
  reminderStatus: {
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#f1f5e9',
  },
  inlineDetail: {
    borderTopWidth: 1,
    borderTopColor: '#dfe5d9',
    paddingTop: 16,
    gap: 14,
  },
  discoverPage: {
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    padding: 20,
    gap: 12,
  },

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
  keywordActions: { flexDirection: 'row', gap: 7 },
  customKeywords: {
    borderTopWidth: 1,
    borderTopColor: '#dfe5d9',
    paddingTop: 14,
    gap: 10,
  },
  deletableKeyword: { borderColor: '#cf3434', borderWidth: 2 },
  deleteHint: { color: '#b52e2e', fontSize: 12 },
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
  calendarRow: { flexDirection: 'row', flexWrap: 'nowrap' },
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
    flex: 1,
    minWidth: 0,
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
