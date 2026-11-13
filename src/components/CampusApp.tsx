import { deferNotice, orderNoticeQueue } from '../domain/noticeQueue';
import { DiscoverToolbar } from './DiscoverToolbar';
import { RenderedPage } from './RenderedPage';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing as MotionEasing,
} from 'react-native-reanimated';
import {
  GestureScrollView,
  PageGestureContext,
  useCardMotion,
} from './gestureMotion';
import { useCardTouchLock } from './useCardTouchLock';
import {
  useCallback,
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
  Keyboard,
  Modal,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  colleges,
  type College,
  type CampusProfile,
} from '../domain/campusProfile';
import {
  attendanceFollowUpEnded,
  gatheringEnded,
  recruitmentEnded,
} from '../domain/dates';
import { matchesCollege } from '../domain/collegeFilter';
import type { Notice } from '../features/demo/campusNotices';
import { useDemoNotice } from '../features/demo/DemoNoticeProvider';
import DiscoverCard from './DiscoverCard';
import { AnalysisSettings } from './AnalysisSettings';
import { NotificationSettings } from './NotificationSettings';
import { developerToolsEnabled } from '../features/verification/developerTools';
import {
  detailReviewNotes,
  detailEventLabel,
  deadlineReminderLabel,
} from '../features/demo/noticeDetailPresentation';

import type { Disposition as Bucket } from '../../shared/contracts';
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
  accessibilityLabel = label,
  onPress,
  primary = false,
  disabled = false,
  half = false,
}: {
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  half?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[s.button, half && { flex: 1 }, primary && s.primary]}
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
  progressContent,
  progress,
  eligibilityLabel,
  onDragging,
}: {
  notice: Notice;
  bucket: Bucket;
  act: (action: string) => void;
  detailContent: ReactNode;
  progressContent?: ReactNode;
  progress?: 'saved' | 'preparing' | 'applied' | null | undefined;
  eligibilityLabel: string;
  onDragging: (dragging: boolean) => void;
}) {
  const touchLock = useCardTouchLock(onDragging);
  const actRef = useRef(act);
  actRef.current = act;
  const [dragging, setDragging] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const reset = () => {
    setDragging(false);
    touchLock.release();
    motion.reset();
  };
  const motion = useCardMotion(
    true,
    () => {
      setDragging(true);
      touchLock.startDrag();
    },
    (dx, dy) => {
      if (bucket === 'saved') {
        if (dx <= -56) actRef.current('unselect');
        reset();
        return;
      }
      if (Math.abs(dx) >= 56)
        actRef.current(
          dx > 0
            ? bucket === 'dismissed'
              ? 'restore'
              : 'select'
            : bucket === 'unseen'
              ? 'discard'
              : 'delete',
        );
      else if (Math.abs(dy) >= 48) actRef.current('hold');
      reset();
    },
    reset,
    bucket === 'saved' ? 'left' : bucket === 'dismissed' ? 'horizontal' : 'all',
  );

  return (
    <GestureDetector
      gesture={motion.gesture}
      touchAction={bucket !== 'unseen' ? 'pan-y' : 'none'}
    >
      <Reanimated.View
        style={[s.card, motion.style, dragging && s.draggingCard]}
      >
        <View style={s.between}>
          <Text style={[s.muted, { flexShrink: 1 }]}>{notice.org}</Text>
          <View style={s.noticeStatusTags}>
            {notice.date && (
              <Text style={s.tag}>
                {`${notice.date.slice(5).replace('-', '.')} 마감`}
              </Text>
            )}
            {bucket === 'saved' && (
              <Text
                style={[
                  s.tag,
                  progress === 'preparing'
                    ? s.progressPreparing
                    : progress === 'applied'
                      ? s.progressApplied
                      : s.progressInterested,
                ]}
              >
                {progress === 'preparing'
                  ? '준비 중'
                  : progress === 'applied'
                    ? '신청 완료'
                    : '관심 저장'}
              </Text>
            )}
          </View>
        </View>
        <Text style={s.cardTitle}>{notice.title}</Text>
        <Text style={s.muted}>
          {notice.synthetic
            ? '가상 예시'
            : `실제 공지 · ${notice.analysisLabel}`}
        </Text>
        <View style={s.row}>
          {notice.tags.map((tag) => (
            <Text key={tag} style={s.tag}>
              {tag}
            </Text>
          ))}
        </View>
        <Text style={s.muted}>
          {eligibilityLabel} ·{' '}
          {notice.date
            ? `${notice.date}${notice.time ? ` · ${notice.time} KST` : ''}`
            : (notice.scheduleText ?? '정확한 일정은 원문에서 확인')}
        </Text>
        {bucket === 'saved' && progressContent}
        <View style={s.row}>
          {bucket === 'saved' ? (
            <Button label="<- 선택 취소" onPress={() => act('unselect')} />
          ) : (
            <>
              {bucket === 'unseen' && (
                <Button label="← 버리기" onPress={() => act('discard')} />
              )}
              {bucket === 'dismissed' ? (
                <Button label="<-삭제" onPress={() => act('delete')} />
              ) : (
                <Button label="↕ 보류" onPress={() => act('hold')} />
              )}
              <Button
                label={bucket === 'dismissed' ? '복구 →' : '선택 →'}
                primary
                onPress={() =>
                  act(bucket === 'dismissed' ? 'restore' : 'select')
                }
              />
            </>
          )}
        </View>
        {expanded && bucket === 'saved' && detailContent}
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
        {expanded && bucket !== 'saved' && detailContent}
      </Reanimated.View>
    </GestureDetector>
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
    reminders,
    notificationSnapshot,
    refreshReminders,
    notices,
    home,
    syncState,
    syncStatus,
    analysisProgress,
    hasAnalysisAccess,
    analyzePendingNotices,
    reminderWarning,
    refreshNotices,
    demoNewNoticeId,
    demoStatus,
    refreshDemoNotice,
    analyzeNotice,
    profile,
    saveProfile,
  } = useDemoNotice();
  const changing = useRef(false);
  const changingNotices = useRef(new Set<string>());
  const [pendingNoticeIds, setPendingNoticeIds] = useState<string[]>([]);
  // Keep processed cards out of the queue until a repository snapshot confirms
  // their new bucket. A background reload can supersede the action's reload.
  useEffect(() => {
    setPendingNoticeIds((old) => {
      const next = old.filter((id) => buckets[id] === 'unseen');
      return next.length === old.length ? old : next;
    });
  }, [buckets]);
  const [deferredNoticeIds, setDeferredNoticeIds] = useState<string[]>([]);
  const [draft, setDraft] = useState(profile.keywords);
  const [options] = useState([
    '대회',
    '장학금',
    '취업',
    '인턴십',
    '교환학생',
    '인공지능',
  ]);
  const [customOptions, setCustomOptions] = useState(profile.customKeywords);
  const [deletingKeywords, setDeletingKeywords] = useState(false);
  const [custom, setCustom] = useState('');
  const [college, setCollege] = useState(profile.college);
  const [dept, setDept] = useState(profile.department);
  const [grade, setGrade] = useState(profile.grade);
  const [status, setStatus] = useState(profile.enrollment);
  const saveProfileRef = useRef(saveProfile);
  saveProfileRef.current = saveProfile;
  const profileWrites = useRef(Promise.resolve());
  const profileVersion = useRef(0);
  const lastProfile = useRef(JSON.stringify(profile));
  const [profileSaveState, setProfileSaveState] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle');
  const [profileRetry, setProfileRetry] = useState(0);
  useEffect(() => {
    const next: CampusProfile = {
      college,
      department: dept.trim(),
      grade,
      enrollment: status,
      keywords: draft,
      customKeywords: customOptions,
    };
    const serialized = JSON.stringify(next);
    if (lastProfile.current === serialized && profileRetry === 0) return;
    lastProfile.current = serialized;
    const version = ++profileVersion.current;
    setProfileSaveState('saving');
    // Keep rapid edits in order so an older write cannot replace the latest one.
    profileWrites.current = profileWrites.current
      .then(() => saveProfileRef.current(next))
      .then(() => {
        if (version === profileVersion.current) setProfileSaveState('saved');
      })
      .catch(() => {
        if (version === profileVersion.current) setProfileSaveState('error');
      });
  }, [college, dept, grade, status, draft, customOptions, profileRetry]);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const cardTouchLocked = useRef(false);
  const [minute, setMinute] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setMinute((value) => value + 1), 60_000);
    return () => clearInterval(timer);
  }, []);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const [picked, setPicked] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [message, setMessage] = useState('');
  const scrolls = useRef<(ComponentRef<typeof ScrollView> | null)[]>([]);
  const onCardDragging = useCallback((locked: boolean) => {
    cardTouchLocked.current = locked;
  }, []);
  const { width } = useWindowDimensions();
  const pageOffset = useSharedValue(-2 * width);
  const gesturePage = useSharedValue(2);
  const motionBusy = useSharedValue(false);
  const pagePanActive = useSharedValue(false);
  const transitioning = useRef(false);
  const pageDragging = useRef(false);
  const [pageTransitioning, setPageTransitioning] = useState(false);
  useLayoutEffect(() => {
    cancelAnimation(pageOffset);
    pageOffset.value = -pageRef.current * width;
    motionBusy.value = false;
    transitioning.current = false;
    pageDragging.current = false;
    setPageTransitioning(false);
    return () => cancelAnimation(pageOffset);
  }, [width, pageOffset]);
  const settlePage = (next: number) => {
    const previous = pageRef.current;
    pageDragging.current = false;
    transitioning.current = true;
    setPageTransitioning(true);
    if (next !== previous) {
      setDeletingKeywords(false);
      Keyboard.dismiss();
      scrolls.current[next]?.scrollTo({ y: 0, animated: false });
    }
    motionBusy.value = true;
    const complete = () => {
      if (next !== previous) {
        pageRef.current = next;
        gesturePage.value = next;
        setPage(next);
        setMessage('');
        scrolls.current[next]?.scrollTo({ y: 0, animated: false });
      }
      transitioning.current = false;
      motionBusy.value = false;
      setPageTransitioning(false);
    };
    pageOffset.value = withTiming(
      -next * width,
      {
        duration: 260 + Math.abs(next - previous) * 60,
        easing: MotionEasing.out(MotionEasing.cubic),
      },
      (finished) => {
        if (finished) {
          gesturePage.value = next;
          runOnJS(complete)();
        }
      },
    );
  };
  const navigate = (next: number) => {
    if (
      next < 0 ||
      next > 3 ||
      next === pageRef.current ||
      transitioning.current ||
      pageDragging.current ||
      cardTouchLocked.current
    )
      return;
    settlePage(next);
  };
  const startPageDrag = () => {
    pageDragging.current = true;
    scrolls.current.forEach((scroll, index) => {
      if (index !== pageRef.current)
        scroll?.scrollTo({ y: 0, animated: false });
    });
  };
  const pager = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-18, 18])
        .failOffsetY([-12, 12])
        .maxPointers(1)
        .onStart(() => {
          if (motionBusy.value) return;
          cancelAnimation(pageOffset);
          pagePanActive.value = true;
          runOnJS(startPageDrag)();
        })
        .onUpdate((event) => {
          if (!motionBusy.value)
            pageOffset.value = Math.max(
              -3 * width,
              Math.min(0, -gesturePage.value * width + event.translationX),
            );
        })
        .onEnd((event) => {
          if (motionBusy.value) return;
          const advance =
            Math.abs(event.translationX) >= width * 0.22 ||
            (Math.abs(event.translationX) > 12 &&
              Math.abs(event.velocityX) > 450 &&
              event.translationX * event.velocityX > 0);
          const next = advance
            ? Math.max(
                0,
                Math.min(
                  3,
                  gesturePage.value + (event.translationX < 0 ? 1 : -1),
                ),
              )
            : gesturePage.value;
          runOnJS(settlePage)(next);
        })
        .onFinalize((_, success) => {
          if (!success && pagePanActive.value && !motionBusy.value)
            runOnJS(settlePage)(gesturePage.value);
          pagePanActive.value = false;
        }),
    [width],
  );
  const pageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pageOffset.value }],
  }));

  const act = async (id: string, action: string) => {
    if (action === 'hold') {
      setDeferredNoticeIds((old) => deferNotice(old, id));
      setMessage('목록 맨 뒤로 보냈어요. 차례가 되면 다시 나타나요.');
      return true;
    }
    const write = {
      delete: actions.deleteNotice,
      discard: actions.dismissNotice,
      select: actions.saveNotice,
      restore: actions.restoreNotice,
      unselect: actions.unsaveNotice,
    }[action as 'delete' | 'discard' | 'select' | 'restore' | 'unselect'];
    if (!write || changingNotices.current.has(id)) return false;
    changingNotices.current.add(id);
    if (action === 'select' || action === 'discard') {
      setPendingNoticeIds((old) => [...old, id]);
    }
    try {
      await write(id);
      setDeferredNoticeIds((old) => old.filter((entry) => entry !== id));
    } catch {
      setPendingNoticeIds((old) => old.filter((entry) => entry !== id));
      setMessage('공지 상태를 저장하지 못했어요. 다시 시도해 주세요.');
      return false;
    } finally {
      changingNotices.current.delete(id);
    }
    setMessage(
      (
        {
          delete: '공지를 영구 삭제했어요.',
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
  const endedNoticeIds = new Set(
    notices
      .filter((notice) => {
        const detail = details[notice.id];
        const currentEvents = detail?.analysisFresh
          ? (detail.analysis?.data.events ?? [])
          : [];
        return (
          gatheringEnded(
            notice.title,
            detail?.raw.publishedDate ?? null,
            now,
            detail?.raw.bodyText,
          ) ||
          recruitmentEnded(notice.title, currentEvents, now) ||
          attendanceFollowUpEnded(
            notice.title,
            currentEvents,
            now,
            detail?.raw.bodyText,
          )
        );
      })
      .map(({ id }) => id),
  );
  const events = home.schedule.filter(
    (event) =>
      !endedNoticeIds.has(event.noticeId) &&
      event.date.startsWith(prefix) &&
      (!picked || event.date === picked),
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
  function renderNoticeProgress(notice: Notice) {
    const selectedDetail = details[notice.id];
    if (selectedDetail?.disposition !== 'saved') return null;
    return (
      <View style={{ gap: 8 }}>
        <View style={s.detailActions}>
          {(
            [
              { progress: 'saved', label: '관심 저장' },
              { progress: 'preparing', label: '준비 중' },
              { progress: 'applied', label: '신청 완료' },
            ] as const
          )
            .filter(
              ({ progress }) =>
                progress !== (selectedDetail.progress ?? 'saved'),
            )
            .map(({ progress, label }) => (
              <Button
                key={progress}
                half
                label={`${label}으로 변경`}
                disabled={detailUpdating}
                onPress={() =>
                  void updateDetail(notice.id, () =>
                    actions.setProgress(notice.id, progress),
                  )
                }
              />
            ))}
        </View>
        {detailErrors[notice.id] && (
          <Text accessibilityRole="alert">변경 내용을 저장하지 못했어요.</Text>
        )}
      </View>
    );
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
          {notice.synthetic && (
            <Text style={s.description}>
              가상 예시 공지입니다. 실제 원문 링크는 연결되어 있지 않습니다.
            </Text>
          )}
          {eligibility[notice.id]!.result !== 'needs_review' && (
            <Text style={s.reason}>
              {eligibilityLabels[eligibility[notice.id]!.result]}
            </Text>
          )}
          {!notice.synthetic && selectedDetail && (
            <>
              {selectedDetail.analysisFresh &&
                selectedDetail.analysis?.data.events
                  .filter((event) => event.status === 'resolved')
                  .map((event, index) => (
                    <Text key={index} style={s.description}>
                      {detailEventLabel(event)}
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

          {!notice.synthetic && selectedDetail && (
            <View style={s.detailActions}>
              <Button
                half
                label="공지 원문 열기"
                onPress={() => {
                  void Linking.openURL(selectedDetail.sourceUrl).catch(() =>
                    setDetailErrors((old) => ({ ...old, [notice.id]: true })),
                  );
                }}
              />
              <Button
                half
                label="분석 다시 시도"
                onPress={() => {
                  void analyzeNotice(notice.id).catch(() =>
                    setDetailErrors((old) => ({ ...old, [notice.id]: true })),
                  );
                }}
              />
            </View>
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
                    >{`${item.completed ? '☑' : '☐'} ${item.text}`}</Text>
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
                  상태이거나 예약 시각이 지났다면 예약하지 않아요.
                </Text>
                <Button
                  label="알림 상태 다시 확인"
                  disabled={detailUpdating}
                  onPress={() => void updateDetail(notice.id, refreshReminders)}
                />
              </View>
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
      <PageGestureContext.Provider value={pager}>
        <GestureDetector gesture={pager}>
          <View style={s.pageViewport}>
            <Reanimated.View
              pointerEvents={pageTransitioning ? 'none' : 'auto'}
              style={[
                { flex: 1, flexDirection: 'row', width: width * names.length },
                pageStyle,
              ]}
            >
              {names.map((_, page) => (
                <RenderedPage
                  key={page}
                  inputs={[
                    width,
                    today,
                    page === pageRef.current,
                    ...(page === 3
                      ? [
                          draft,
                          profileSaveState,
                          options,
                          customOptions,
                          deletingKeywords,
                          custom,
                          dept,
                          grade,
                          status,
                          college,
                          saveProfile,
                          reminders,
                          notificationSnapshot,
                          refreshReminders,
                        ]
                      : [
                          notices,
                          buckets,
                          details,
                          checklists,
                          detailErrors,
                          detailUpdating,
                          dept,
                          grade,
                          status,
                          reminders,
                          notificationSnapshot,
                          refreshReminders,
                          deferredNoticeIds,
                          pendingNoticeIds,
                          profile,
                          page === 1 ? showAll : null,
                          minute,
                          actions,
                          analyzeNotice,
                          page === 2 ? month : null,
                          page === 2 ? picked : null,
                          page === 2 ? home : null,
                          page === 1 ? syncState : null,
                          page === 1 ? syncStatus : null,
                          page === 1 ? refreshNotices : null,
                          analysisProgress,
                          page === 1 ? hasAnalysisAccess : null,
                          page === 1 ? analyzePendingNotices : null,
                          page === 1 || page === 2 ? demoNewNoticeId : null,
                          page === 1 ? refreshDemoNotice : null,
                          page === 1 ? demoStatus : null,
                        ]),
                  ]}
                  render={() => {
                    const bucket: Bucket =
                      page === 0
                        ? 'dismissed'
                        : page === 1
                          ? 'unseen'
                          : 'saved';
                    let visible = notices.filter((notice) => {
                      if (
                        buckets[notice.id] !== bucket ||
                        (page === 1 && pendingNoticeIds.includes(notice.id)) ||
                        ((page === 1 || page === 2) &&
                          endedNoticeIds.has(notice.id))
                      )
                        return false;
                      if (page !== 1 || showAll) return true;
                      const detail = details[notice.id];
                      return (
                        matchesCollege(
                          profile.college,
                          notice.title,
                          detail?.raw.bodyText ?? '',
                          detail?.analysisFresh
                            ? detail.analysis?.data.eligibility
                            : undefined,
                        ) &&
                        eligibility[notice.id]?.result !== 'mismatch' &&
                        profile.keywords.some(
                          (keyword) =>
                            notice.tags.includes(keyword) ||
                            notice.title.includes(keyword) ||
                            notice.summary.includes(keyword),
                        )
                      );
                    });
                    const demoPreview =
                      page === 2 &&
                      demoNewNoticeId &&
                      !endedNoticeIds.has(demoNewNoticeId) &&
                      buckets[demoNewNoticeId] === 'unseen'
                        ? notices.find(({ id }) => id === demoNewNoticeId)
                        : undefined;
                    if (page === 2) {
                      const priority = { preparing: 0, saved: 1, applied: 2 };
                      visible.sort((a, b) => {
                        const rank = (id: string) => {
                          const progress = details[id]?.progress;
                          return progress === 'preparing'
                            ? priority.preparing
                            : progress === 'applied'
                              ? priority.applied
                              : priority.saved;
                        };
                        return rank(a.id) - rank(b.id);
                      });
                    }
                    visible = orderNoticeQueue(
                      visible,
                      deferredNoticeIds,
                      page === 1 ? demoNewNoticeId : undefined,
                    );
                    const nextNotice = visible[0];
                    return (
                      <View
                        key={page}
                        testID={`campus-page-${page}`}
                        style={{ width, flexShrink: 0 }}
                        pointerEvents={
                          page === pageRef.current ? 'auto' : 'none'
                        }
                        aria-hidden={page !== pageRef.current}
                        accessibilityElementsHidden={page !== pageRef.current}
                        importantForAccessibility={
                          page === pageRef.current
                            ? 'auto'
                            : 'no-hide-descendants'
                        }
                      >
                        {page === 1 ? (
                          <View
                            testID={
                              page === pageRef.current
                                ? 'active-page'
                                : 'inactive-page-1'
                            }
                            style={s.discoverPage}
                          >
                            <DiscoverToolbar
                              active={page === pageRef.current}
                              count={visible.length}
                              showAll={showAll}
                              onToggle={() => setShowAll(!showAll)}
                              refreshing={syncStatus.phase !== 'idle'}
                              onRefresh={refreshNotices}
                              status={
                                syncStatus.phase === 'collecting'
                                  ? '수집 중'
                                  : syncStatus.phase === 'analyzing'
                                    ? `AI 분석 ${analysisProgress.completed}/${analysisProgress.total}`
                                    : analysisProgress.failed +
                                          analysisProgress.waiting >
                                          0 || !!syncStatus.message
                                      ? '갱신 안내 확인'
                                      : '갱신 상태'
                              }
                            >
                              {refreshDemoNotice && (
                                <Button
                                  label="시연 공지 새로고침"
                                  onPress={() => void refreshDemoNotice()}
                                />
                              )}
                              {syncStatus.phase === 'collecting' && (
                                <Text
                                  accessibilityLiveRegion="polite"
                                  style={s.muted}
                                >
                                  공지 수집 중…
                                </Text>
                              )}
                              {analysisProgress.total > 0 && (
                                <View
                                  testID="analysis-progress"
                                  style={s.analysisProgress}
                                >
                                  <Text
                                    accessibilityLiveRegion="polite"
                                    style={s.muted}
                                  >
                                    AI{' '}
                                    {syncStatus.phase === 'analyzing'
                                      ? '분석 중'
                                      : '분석'}{' '}
                                    · {analysisProgress.completed} /{' '}
                                    {analysisProgress.total}건
                                  </Text>
                                  <View
                                    accessibilityRole="progressbar"
                                    accessibilityLabel="공지 분석 진행률"
                                    accessibilityValue={{
                                      min: 0,
                                      max: analysisProgress.total,
                                      now: analysisProgress.completed,
                                    }}
                                    style={{
                                      height: 3,
                                      backgroundColor: '#e4e9df',
                                      borderRadius: 3,
                                      overflow: 'hidden',
                                    }}
                                  >
                                    <View
                                      style={{
                                        height: 3,
                                        width: `${(analysisProgress.completed / analysisProgress.total) * 100}%`,
                                        backgroundColor: '#28634d',
                                      }}
                                    />
                                  </View>
                                  {analysisProgress.waiting +
                                    analysisProgress.failed +
                                    analysisProgress.unsupported >
                                    0 && (
                                    <Text style={s.muted}>
                                      {[
                                        analysisProgress.waiting > 0 &&
                                          `대기 ${analysisProgress.waiting}`,
                                        analysisProgress.failed > 0 &&
                                          `실패 ${analysisProgress.failed}`,
                                        analysisProgress.unsupported > 0 &&
                                          `분석 불가 ${analysisProgress.unsupported}`,
                                      ]
                                        .filter(Boolean)
                                        .join(' · ')}
                                    </Text>
                                  )}
                                  {analysisProgress.waiting +
                                    analysisProgress.failed >
                                    0 &&
                                    syncStatus.phase === 'idle' &&
                                    (hasAnalysisAccess &&
                                    !syncStatus.analysisBlocked ? (
                                      <Button
                                        label="다시 시도"
                                        disabled={
                                          !!syncStatus.analysisRetryAt &&
                                          Date.parse(
                                            syncStatus.analysisRetryAt,
                                          ) > Date.now()
                                        }
                                        onPress={() =>
                                          void analyzePendingNotices()
                                        }
                                      />
                                    ) : (
                                      <Button
                                        label="AI 분석 설정하기"
                                        onPress={() => navigate(3)}
                                      />
                                    ))}
                                </View>
                              )}
                              {syncState.sources.map((source) => (
                                <Text key={source.sourceId} style={s.muted}>
                                  {source.sourceId === 'seoultech_cs'
                                    ? '학과'
                                    : '본교'}{' '}
                                  · 마지막 전체 수집 성공:{' '}
                                  {source.lastSuccessAt
                                    ? new Date(
                                        source.lastSuccessAt,
                                      ).toLocaleString('ko-KR', {
                                        timeZone: 'Asia/Seoul',
                                      })
                                    : '아직 없음'}
                                  {source.lastError
                                    ? ` · 일부 수집 실패 (${source.detailFailures}건)`
                                    : ''}
                                </Text>
                              ))}
                              {!!demoStatus && (
                                <Text
                                  accessibilityLiveRegion="polite"
                                  style={s.reason}
                                >
                                  {demoStatus}
                                </Text>
                              )}
                              {!!syncStatus.message && (
                                <Text style={s.reason}>
                                  {syncStatus.message}
                                </Text>
                              )}
                              {!!syncStatus.analysisRetryAt &&
                                Date.parse(syncStatus.analysisRetryAt) >
                                  Date.now() && (
                                  <Text style={s.muted}>
                                    분석 재시도 가능:{' '}
                                    {new Date(
                                      syncStatus.analysisRetryAt,
                                    ).toLocaleString('ko-KR', {
                                      timeZone: 'Asia/Seoul',
                                    })}{' '}
                                    KST
                                  </Text>
                                )}
                            </DiscoverToolbar>
                            {nextNotice ? (
                              <DiscoverCard
                                key={nextNotice.id}
                                notice={nextNotice}
                                remainingCount={visible.length - 1}
                                isNew={nextNotice.id === demoNewNoticeId}
                                eligibilityLabel={
                                  eligibilityLabels[
                                    eligibility[nextNotice.id]!.result
                                  ]
                                }
                                onDragging={onCardDragging}
                                act={(action) => act(nextNotice.id, action)}
                                detailContent={renderNoticeDetails(nextNotice)}
                              />
                            ) : (
                              <View style={s.card}>
                                <Text style={s.description}>
                                  {analysisProgress.completed <
                                  analysisProgress.total
                                    ? '표시할 분석 완료 공지가 없어요. 위에서 분석 진행 상황을 확인해 주세요.'
                                    : showAll
                                      ? '새 공지가 없어요.'
                                      : '선호 키워드에 맞는 새 공지가 없어요.'}
                                </Text>
                                <Button
                                  label="키워드 수정하기 →"
                                  onPress={() => navigate(3)}
                                />
                              </View>
                            )}
                          </View>
                        ) : (
                          <GestureScrollView
                            testID={
                              page === pageRef.current
                                ? 'active-page'
                                : `inactive-page-${page}`
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
                            {demoPreview && (
                              <View style={s.card}>
                                <Text style={s.tag}>새 맞춤 공지 · 시연</Text>
                                <Text
                                  accessibilityRole="header"
                                  style={s.section}
                                >
                                  {demoPreview.title}
                                </Text>
                                <Text style={s.description}>
                                  {demoPreview.summary}
                                </Text>
                                <Button
                                  label="맞춤 공지에서 보기"
                                  onPress={() => navigate(1)}
                                />
                              </View>
                            )}
                            {page === 2 && (
                              <View style={s.card}>
                                <View style={s.between}>
                                  <Button
                                    label="<"
                                    accessibilityLabel="이전 달"
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
                                    {month.getFullYear()}년{' '}
                                    {month.getMonth() + 1}월
                                  </Text>
                                  <Button
                                    label=">"
                                    accessibilityLabel="다음 달"
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
                                    {[
                                      '일',
                                      '월',
                                      '화',
                                      '수',
                                      '목',
                                      '금',
                                      '토',
                                    ].map((d, weekday) => (
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
                                    ))}
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
                                        {Array.from(
                                          { length: 7 },
                                          (_, weekday) => {
                                            const i =
                                              week * 7 +
                                              weekday -
                                              month.getDay();
                                            const days = new Date(
                                              month.getFullYear(),
                                              month.getMonth() + 1,
                                              0,
                                            ).getDate();
                                            if (i < 0 || i >= days)
                                              return (
                                                <View
                                                  key={weekday}
                                                  style={s.cell}
                                                />
                                              );
                                            const date =
                                              prefix +
                                              String(i + 1).padStart(2, '0');

                                            const hasEvent = home.schedule.some(
                                              (event) =>
                                                !endedNoticeIds.has(
                                                  event.noticeId,
                                                ) && event.date === date,
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
                                                  setPicked(
                                                    picked === date
                                                      ? null
                                                      : date,
                                                  )
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
                                          },
                                        )}
                                      </View>
                                    ),
                                  )}
                                </View>
                                <Text style={s.reason}>
                                  {events.length
                                    ? events
                                        .map(
                                          (event) =>
                                            `${event.date}${event.time ? ` ${event.time}` : ''} · ${event.label} · ${event.title}`,
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
                                  <Text style={s.muted}>
                                    {visible.length}개
                                  </Text>
                                </View>
                                {visible.map((n) => (
                                  <SwipeCard
                                    key={n.id}
                                    notice={n}
                                    eligibilityLabel={
                                      eligibilityLabels[
                                        eligibility[n.id]!.result
                                      ]
                                    }
                                    bucket={bucket}
                                    onDragging={onCardDragging}
                                    act={(action) => act(n.id, action)}
                                    progress={details[n.id]?.progress}
                                    progressContent={renderNoticeProgress(n)}
                                    detailContent={renderNoticeDetails(n)}
                                  />
                                ))}
                                {!visible.length && (
                                  <View style={s.card}>
                                    <Text style={s.description}>
                                      {page === 0
                                        ? '휴지통이 비어 있어요.'
                                        : page === 1
                                          ? '선호 키워드에 맞는 새 공지가 없어요.'
                                          : analysisProgress.completed <
                                              analysisProgress.total
                                            ? '분석 중이거나 확인이 필요한 공지는 숨겨 두었어요. 맞춤 공지에서 분석 진행 상황을 확인해 주세요.'
                                            : '아직 선택한 공지가 없어요.'}
                                    </Text>
                                    {page !== 0 && (
                                      <Button
                                        label={
                                          page === 1
                                            ? '키워드 설정하기 →'
                                            : '맞춤 공지 찾아보기 →'
                                        }
                                        onPress={() =>
                                          navigate(page === 1 ? 3 : 1)
                                        }
                                      />
                                    )}
                                  </View>
                                )}
                              </>
                            ) : (
                              <>
                                <AnalysisSettings />
                                <NotificationSettings />
                                <View style={s.card}>
                                  <Text style={s.section}>내 정보</Text>
                                  <Text style={s.muted}>소속 단과대학</Text>
                                  <View style={s.row}>
                                    {(
                                      [null, ...colleges] as (College | null)[]
                                    ).map((value) => (
                                      <Pressable
                                        key={value ?? 'none'}
                                        accessibilityRole="radio"
                                        accessibilityState={{
                                          checked: college === value,
                                        }}
                                        aria-checked={college === value}
                                        onPress={() => setCollege(value)}
                                        style={[
                                          s.button,
                                          college === value && s.primary,
                                        ]}
                                      >
                                        <Text
                                          style={
                                            college === value
                                              ? s.light
                                              : s.buttonText
                                          }
                                        >
                                          {value ?? '선택 안 함'}
                                        </Text>
                                      </Pressable>
                                    ))}
                                  </View>
                                  <Text style={s.muted}>학과</Text>
                                  <TextInput
                                    accessibilityLabel="학과"
                                    value={dept}
                                    onChangeText={setDept}
                                    style={s.input}
                                  />
                                  <Text style={s.muted}>학년</Text>
                                  <View style={s.row}>
                                    {([1, 2, 3, 4, 5] as const).map((g) => (
                                      <Button
                                        key={g}
                                        label={`${g}학년`}
                                        primary={grade === g}
                                        onPress={() => setGrade(g)}
                                      />
                                    ))}
                                  </View>
                                  <Text style={s.muted}>학적 상태</Text>
                                  <View style={s.row}>
                                    {(
                                      [
                                        ['enrolled', '재학'],
                                        ['leave', '휴학'],
                                        ['other', '졸업'],
                                      ] as const
                                    ).map(([g, label]) => (
                                      <Button
                                        key={g}
                                        label={label}
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
                                  {customOptions.length > 0 && (
                                    <View style={s.customKeywords}>
                                      <Text style={s.muted}>
                                        직접 추가한 키워드
                                      </Text>
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
                                              deletingKeywords &&
                                                s.deletableKeyword,
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
                                        <Text style={s.buttonText}>
                                          키워드 추가
                                        </Text>
                                      </Pressable>
                                    </View>
                                    <View style={{ flex: 3 }}>
                                      <Button
                                        label={
                                          deletingKeywords
                                            ? '삭제 취소'
                                            : '키워드 삭제'
                                        }
                                        onPress={() =>
                                          setDeletingKeywords((old) => !old)
                                        }
                                      />
                                    </View>
                                  </View>
                                </View>
                                <Text
                                  accessibilityLiveRegion="polite"
                                  style={s.muted}
                                >
                                  {profileSaveState === 'saving'
                                    ? '설정 저장 중…'
                                    : profileSaveState === 'error'
                                      ? '설정을 저장하지 못했어요. 다시 시도해 주세요.'
                                      : profileSaveState === 'saved'
                                        ? '설정이 자동 저장됐어요.'
                                        : '변경한 설정은 자동으로 저장돼요.'}
                                </Text>
                                {!draft.length && (
                                  <Text style={s.muted}>
                                    선호 키워드를 선택하면 맞춤 공지를 볼 수
                                    있어요.
                                  </Text>
                                )}
                                {profileSaveState === 'error' && (
                                  <Button
                                    label="설정 저장 다시 시도"
                                    onPress={() =>
                                      setProfileRetry((value) => value + 1)
                                    }
                                  />
                                )}
                                {developerToolsEnabled && (
                                  <Button
                                    label="개발자 도구"
                                    onPress={() => router.push('/dev')}
                                  />
                                )}
                              </>
                            )}
                            <Text style={s.muted}>
                              가상 예시는 카드에 표시됩니다. 실제 공지의 내용은
                              원문에서 확인하세요. 공지 선택과 준비물 체크는 이
                              기기에 저장됩니다.
                            </Text>
                          </GestureScrollView>
                        )}
                      </View>
                    );
                  }}
                />
              ))}
            </Reanimated.View>
          </View>
        </GestureDetector>
      </PageGestureContext.Provider>
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
              disabled: pageTransitioning,
            }}
            disabled={pageTransitioning}

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
                '카드 안에서 ← 버리기, → 선택 또는 복구, ↕ 보류할 수 있어요.\n\n보류한 공지는 목록 맨 뒤로 이동해요. 다른 공지를 넘기면 차례대로 다시 나타나요.\n\n카드 바깥 여백에서 좌우로 밀거나 하단 탭을 눌러 화면을 이동하세요. 휴지통에서는 영구 삭제하지 않습니다.'
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
  analysisProgress: { gap: 4 },
  discoverPage: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    padding: 12,
    gap: 8,
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
  detailActions: { flexDirection: 'row', gap: 8 },
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
  noticeStatusTags: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  progressInterested: { backgroundColor: '#e8eef9', color: '#345b96' },
  progressPreparing: { backgroundColor: '#fff0cf', color: '#855800' },
  progressApplied: { backgroundColor: '#dcf2e6', color: '#226346' },
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
