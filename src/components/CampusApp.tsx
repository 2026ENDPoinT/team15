import { CampusButton } from './CampusButton';
import { campusStyles as s } from './campusStyles';
import { NoticeCalendar } from './NoticeCalendar';
import { ProfileFields } from './ProfileFields';
import { noticeCardStyles as cardStyles } from './noticeCardStyles';
import { NoticeSourceButton } from './NoticeSourceButton';
import { NoticeProgressSelect } from './NoticeProgressSelect';
import {
  confirmedCardText,
  noticeCardMetadata,
} from '../features/demo/noticeCardPresentation';
import type { NoticeProgress } from './noticeProgressOptions';
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
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { CampusProfile } from '../domain/campusProfile';
import {
  attendanceFollowUpEnded,
  eventNoticeEnded,
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
  confirmedDetailReviewNotes,
  detailEventLabel,
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
function SwipeCard({
  notice,
  bucket,
  act,
  detailContent,
  progressContent,
  eligibilityLabel,
  onDragging,
}: {
  notice: Notice;
  bucket: Bucket;
  act: (action: string) => void;
  detailContent: ReactNode;
  progressContent?: ReactNode;
  eligibilityLabel: string;
  onDragging: (dragging: boolean) => void;
}) {
  const touchLock = useCardTouchLock(onDragging);
  const metadata = noticeCardMetadata(notice, eligibilityLabel);
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
        if (dx <= -56) actRef.current('discard');
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
        style={[
          cardStyles.card,
          cardStyles.listCard,
          motion.style,
          dragging && s.draggingCard,
        ]}
      >
        <View style={cardStyles.listHeader}>
          <Text style={[cardStyles.muted, { flexShrink: 1 }]}>
            {notice.org}
          </Text>
          {bucket === 'saved' && progressContent}
        </View>
        <Text accessibilityRole="header" style={cardStyles.title}>
          {notice.title}
        </Text>
        {(bucket === 'unseen' ||
          (bucket === 'dismissed' && notice.synthetic)) && (
          <Text style={s.muted}>
            {notice.synthetic
              ? '가상 예시'
              : `실제 공지 · ${notice.analysisLabel}`}
          </Text>
        )}
        <Text style={cardStyles.tags}>{notice.tags.join(' · ')}</Text>
        {!!metadata && <Text style={cardStyles.muted}>{metadata}</Text>}
        {!!confirmedCardText(notice.summary) && (
          <Text numberOfLines={2} style={cardStyles.muted}>
            {confirmedCardText(notice.summary)}
          </Text>
        )}
        <View style={[cardStyles.detailToggle, cardStyles.listToggle]}>
          <Pressable
            style={cardStyles.detailButton}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            aria-expanded={expanded}
            onPress={() => setExpanded((old) => !old)}
          >
            <Text style={cardStyles.link}>
              {expanded ? '상세 접기 ∧' : '공지 자세히 보기 ∨'}
            </Text>
          </Pressable>
          <NoticeSourceButton notice={notice} />
        </View>
        <View style={cardStyles.listActions}>
          {bucket === 'saved' ? (
            <CampusButton
              cardAction
              label="← 휴지통으로 이동"
              onPress={() => act('discard')}
            />
          ) : (
            <>
              {bucket === 'unseen' && (
                <CampusButton
                  cardAction
                  label="← 버리기"
                  onPress={() => act('discard')}
                />
              )}
              {bucket === 'dismissed' ? (
                <CampusButton
                  cardAction
                  label="← 삭제"
                  onPress={() => act('delete')}
                />
              ) : (
                <CampusButton
                  cardAction
                  label="↕ 보류"
                  onPress={() => act('hold')}
                />
              )}
              <CampusButton
                cardAction
                label={bucket === 'dismissed' ? '복구 →' : '선택 →'}
                primary
                onPress={() =>
                  act(bucket === 'dismissed' ? 'restore' : 'select')
                }
              />
            </>
          )}
        </View>
        {expanded && (
          <View style={cardStyles.listDetails}>{detailContent}</View>
        )}
      </Reanimated.View>
    </GestureDetector>
  );
}
export default function CampusApp() {
  const [page, setPage] = useState(2);
  const pageRef = useRef(page);
  pageRef.current = page;
  const {
    buckets: storedBuckets,
    actions,
    details,
    checklists,
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
    analyzeNotice,
    profile,
    discoveredKeywords,
    saveProfile,
  } = useDemoNotice();
  const changing = useRef(false);
  const changingNotices = useRef(new Set<string>());
  const [pendingBuckets, setPendingBuckets] = useState<
    Record<string, Bucket | undefined>
  >({});
  const buckets = useMemo(
    () => ({ ...storedBuckets, ...pendingBuckets }),
    [storedBuckets, pendingBuckets],
  );
  // Keep optimistic moves until a repository snapshot confirms them. A
  // background reload may supersede the action's reload with an older snapshot.
  useEffect(() => {
    setPendingBuckets((old) => {
      const confirmed = Object.keys(old).filter(
        (id) => storedBuckets[id] === old[id],
      );
      if (!confirmed.length) return old;
      const next = { ...old };
      for (const id of confirmed) delete next[id];
      return next;
    });
  }, [storedBuckets]);
  const [deferredNoticeIds, setDeferredNoticeIds] = useState<string[]>([]);
  const [draft, setDraft] = useState(profile.keywords);
  const options = Array.from(
    new Set([
      '대회',
      '장학금',
      '취업',
      '인턴십',
      '교환학생',
      '인공지능',
      ...discoveredKeywords,
    ]),
  );
  const [customOptions, setCustomOptions] = useState(profile.customKeywords);
  const [deletingKeywords, setDeletingKeywords] = useState(false);
  const [custom, setCustom] = useState('');
  const [keywordSearch, setKeywordSearch] = useState('');
  const [allKeywordsVisible, setAllKeywordsVisible] = useState(false);
  const keywordQuery = keywordSearch.trim().toLocaleLowerCase('ko');
  const availableKeywords = Array.from(new Set([...options, ...customOptions]))
    .filter((keyword) =>
      deletingKeywords
        ? customOptions.includes(keyword) && !options.includes(keyword)
        : !draft.includes(keyword),
    )
    .filter((keyword) =>
      keyword.toLocaleLowerCase('ko').includes(keywordQuery),
    );
  const visibleKeywords =
    allKeywordsVisible || keywordQuery || deletingKeywords
      ? availableKeywords
      : availableKeywords.slice(0, 8);

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
    }[action as 'delete' | 'discard' | 'select' | 'restore'];
    if (!write || changingNotices.current.has(id)) return false;
    changingNotices.current.add(id);
    const targetBucket = {
      select: 'saved',
      discard: 'dismissed',
      restore: 'unseen',
      delete: undefined,
    } as const;
    setPendingBuckets((old) => ({
      ...old,
      [id]: targetBucket[action as keyof typeof targetBucket],
    }));
    try {
      await write(id);
      setDeferredNoticeIds((old) => old.filter((entry) => entry !== id));
    } catch {
      setPendingBuckets((old) => {
        const next = { ...old };
        delete next[id];
        return next;
      });
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
          eventNoticeEnded(
            notice.title,
            detail?.raw.bodyText ?? '',
            currentEvents,
            now,
          ) ||
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
  const [detailUpdating, setDetailUpdating] = useState(false);
  const [pendingProgress, setPendingProgress] = useState<
    Record<string, NoticeProgress>
  >({});
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
        <NoticeProgressSelect
          value={
            pendingProgress[notice.id] ??
            (selectedDetail.progress === 'applied' ? 'applied' : 'preparing')
          }
          disabled={detailUpdating}
          onChange={(progress) => {
            if (changing.current) return;
            setPendingProgress((old) => ({ ...old, [notice.id]: progress }));
            void updateDetail(notice.id, () =>
              actions.setProgress(notice.id, progress),
            ).finally(() => {
              setPendingProgress((old) => {
                const next = { ...old };
                delete next[notice.id];
                return next;
              });
            });
          }}
        />
        {detailErrors[notice.id] && (
          <Text accessibilityRole="alert">변경 내용을 저장하지 못했어요.</Text>
        )}
      </View>
    );
  }
  function renderNoticeDetails(notice: Notice) {
    const selectedDetail = details[notice.id];
    const selectedChecklist = checklists[notice.id];
    const analysis = selectedDetail?.analysisFresh
      ? selectedDetail.analysis?.data
      : undefined;
    const conditions = analysis
      ? [
          ...new Set([
            analysis.eligibility.departments.evidence,
            analysis.eligibility.grades.evidence,
            analysis.eligibility.enrollments.evidence,
            ...analysis.eligibility.other_conditions,
          ]),
        ]
          .filter((text): text is string => !!text)
          .map(confirmedCardText)
          .filter(Boolean)
      : [];
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
          {notice.synthetic && buckets[notice.id] !== 'saved' && (
            <Text style={s.description}>
              가상 예시 공지입니다. 실제 원문 링크는 연결되어 있지 않습니다.
            </Text>
          )}
          {!!confirmedCardText(analysis?.summary ?? notice.summary) && (
            <Text style={s.description}>
              {confirmedCardText(analysis?.summary ?? notice.summary)}
            </Text>
          )}
          {(conditions.length > 0 ||
            eligibility[notice.id]!.result !== 'needs_review') && (
            <>
              <Text style={s.section}>신청 대상</Text>
              {eligibility[notice.id]!.result !== 'needs_review' && (
                <Text style={s.reason}>
                  {eligibilityLabels[eligibility[notice.id]!.result]}
                </Text>
              )}
              {conditions.map((condition) => (
                <Text key={condition} style={s.description}>
                  {condition}
                </Text>
              ))}
              {eligibility[notice.id]!.reasons.map(confirmedCardText)
                .filter(Boolean)
                .map((reason) => (
                  <Text key={reason} style={s.muted}>
                    {reason}
                  </Text>
                ))}
            </>
          )}
          {!!analysis?.events.some((event) => event.status === 'resolved') && (
            <>
              <Text style={s.section}>주요 일정</Text>
              {analysis.events
                .filter((event) => event.status === 'resolved')
                .map((event, index) => (
                  <Text key={index} style={s.description}>
                    {detailEventLabel(event)}
                  </Text>
                ))}
            </>
          )}
          {!analysis && notice.synthetic && notice.date && (
            <>
              <Text style={s.section}>주요 일정</Text>
              <Text style={s.description}>
                신청 마감 · {notice.date}
                {notice.time ? ` ${notice.time} KST` : ''}
              </Text>
            </>
          )}
          {!!analysis?.checklist.some((item) =>
            confirmedCardText(item.text),
          ) && (
            <>
              <Text style={s.section}>신청 방법·제출 서류</Text>
              {analysis.checklist
                .map((item) => confirmedCardText(item.text))
                .filter(Boolean)
                .map((text, index) => (
                  <Text key={index} style={s.description}>
                    • {text}
                  </Text>
                ))}
            </>
          )}
          {!notice.synthetic && analysis?.application_url && (
            <CampusButton
              label="신청 페이지 열기"
              onPress={() => {
                void Linking.openURL(analysis.application_url!).catch(() =>
                  setDetailErrors((old) => ({ ...old, [notice.id]: true })),
                );
              }}
            />
          )}
          {analysis &&
            confirmedDetailReviewNotes(
              analysis.review_notes,
              !!selectedDetail?.raw.attachments.length,
            ).map((note) => (
              <Text key={note} style={s.muted}>
                {note}
              </Text>
            ))}
          {!analysis && selectedDetail?.raw.bodyText && (
            <>
              <Text style={s.section}>공지 본문</Text>
              <Text selectable style={s.description}>
                {selectedDetail.raw.bodyText}
              </Text>
            </>
          )}
          {detailErrors[notice.id] && (
            <Text style={s.reason}>
              요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.
            </Text>
          )}
          {!notice.synthetic && selectedDetail && (
            <>
              {selectedDetail.disposition !== 'saved' && (
                <CampusButton
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
                  <CampusButton
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

        <CampusButton label="도움말" onPress={() => setHelp(true)} />
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
                          keywordSearch,
                          allKeywordsVisible,
                          custom,
                          dept,
                          grade,
                          status,
                          college,
                          saveProfile,
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
                          deferredNoticeIds,
                          pendingBuckets,
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
                      visible.sort((a, b) => {
                        const rank = (id: string) => {
                          const progress = details[id]?.progress;
                          return progress === 'applied' ? 1 : 0;
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
                                      <CampusButton
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
                                      <CampusButton
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
                                <CampusButton
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
                                <Text style={s.tag}>새 맞춤 공지</Text>
                                <Text
                                  accessibilityRole="header"
                                  style={s.section}
                                >
                                  {demoPreview.title}
                                </Text>
                                <Text style={s.description}>
                                  {confirmedCardText(demoPreview.summary)}
                                </Text>
                                <CampusButton
                                  label="맞춤 공지에서 보기"
                                  onPress={() => navigate(1)}
                                />
                              </View>
                            )}
                            {page === 2 && (
                              <NoticeCalendar
                                month={month}
                                today={today}
                                picked={picked}
                                schedule={home.schedule.filter(
                                  (event) =>
                                    !endedNoticeIds.has(event.noticeId),
                                )}
                                onChangeMonth={setMonth}
                                onPickDate={setPicked}
                              />
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
                                      <CampusButton
                                        label={
                                          page === 1
                                            ? '키워드 설정하기 →'
                                            : '← 맞춤 공지 찾아보기'
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
                                <ProfileFields
                                  college={college}
                                  department={dept}
                                  grade={grade}
                                  enrollment={status}
                                  onCollegeChange={setCollege}
                                  onDepartmentChange={setDept}
                                  onGradeChange={setGrade}
                                  onEnrollmentChange={setStatus}
                                />
                                <View style={s.card}>
                                  <Text style={s.section}>선호 키워드</Text>
                                  <Text style={s.muted}>
                                    선택한 키워드 · {draft.length}개
                                  </Text>
                                  <View style={s.row}>
                                    {draft.map((keyword) => (
                                      <Pressable
                                        key={keyword}
                                        accessibilityRole="button"
                                        accessibilityLabel={keyword}
                                        accessibilityHint="누르면 선택을 해제합니다"
                                        accessibilityState={{ selected: true }}
                                        disabled={deletingKeywords}
                                        onPress={() =>
                                          setDraft((old) =>
                                            old.filter(
                                              (value) => value !== keyword,
                                            ),
                                          )
                                        }
                                        style={[s.button, s.primary]}
                                      >
                                        <Text style={s.light}>{keyword} ✓</Text>
                                      </Pressable>
                                    ))}
                                  </View>
                                  {!draft.length && (
                                    <Text style={s.muted}>
                                      아래에서 관심 있는 키워드를 선택해 주세요.
                                    </Text>
                                  )}
                                  <Text style={s.muted}>
                                    {deletingKeywords
                                      ? '직접 추가한 키워드 삭제'
                                      : '키워드 추가'}
                                  </Text>
                                  <TextInput
                                    accessibilityLabel="키워드 검색"
                                    placeholder="키워드 검색…"
                                    value={keywordSearch}
                                    onChangeText={setKeywordSearch}
                                    style={s.input}
                                  />
                                  <View style={s.row}>
                                    {visibleKeywords.map((keyword) => (
                                      <Pressable
                                        key={keyword}
                                        accessibilityRole="button"
                                        accessibilityLabel={
                                          deletingKeywords
                                            ? `${keyword} 삭제`
                                            : keyword
                                        }
                                        accessibilityState={{ selected: false }}
                                        onPress={() => {
                                          if (deletingKeywords) {
                                            setCustomOptions((old) =>
                                              old.filter(
                                                (value) => value !== keyword,
                                              ),
                                            );
                                            setDraft((old) =>
                                              old.filter(
                                                (value) => value !== keyword,
                                              ),
                                            );
                                          } else {
                                            setDraft((old) =>
                                              old.includes(keyword)
                                                ? old
                                                : [...old, keyword],
                                            );
                                          }
                                        }}
                                        style={[
                                          s.button,
                                          deletingKeywords &&
                                            s.deletableKeyword,
                                        ]}
                                      >
                                        <Text style={s.buttonText}>
                                          {keyword}
                                        </Text>
                                      </Pressable>
                                    ))}
                                  </View>
                                  {!availableKeywords.length && (
                                    <Text style={s.muted}>
                                      {keywordQuery
                                        ? '검색 결과가 없어요.'
                                        : deletingKeywords
                                          ? '삭제할 직접 추가 키워드가 없어요.'
                                          : '모든 키워드를 선택했어요.'}
                                    </Text>
                                  )}
                                  {!keywordQuery &&
                                    !deletingKeywords &&
                                    availableKeywords.length > 8 && (
                                      <Pressable
                                        accessibilityRole="button"
                                        accessibilityLabel={
                                          allKeywordsVisible
                                            ? '키워드 접기'
                                            : '키워드 전체 보기'
                                        }
                                        accessibilityState={{
                                          expanded: allKeywordsVisible,
                                        }}
                                        onPress={() =>
                                          setAllKeywordsVisible((old) => !old)
                                        }
                                        style={s.button}
                                      >
                                        <Text style={s.buttonText}>
                                          {allKeywordsVisible
                                            ? '접기'
                                            : `전체 보기 · ${availableKeywords.length}개`}
                                        </Text>
                                      </Pressable>
                                    )}
                                  {deletingKeywords && (
                                    <Text style={s.deleteHint}>
                                      붉은 테두리의 키워드를 누르면 삭제됩니다.
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
                                      <CampusButton
                                        label={
                                          deletingKeywords
                                            ? '삭제 취소'
                                            : '키워드 삭제'
                                        }
                                        onPress={() => {
                                          setDeletingKeywords((old) => !old);
                                          setKeywordSearch('');
                                        }}
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
                                  <CampusButton
                                    label="설정 저장 다시 시도"
                                    onPress={() =>
                                      setProfileRetry((value) => value + 1)
                                    }
                                  />
                                )}
                                <NotificationSettings />
                                {developerToolsEnabled && (
                                  <CampusButton
                                    label="개발자 도구"
                                    onPress={() => router.push('/dev')}
                                  />
                                )}
                              </>
                            )}
                            <Text style={s.muted}>
                              공지의 내용은 원문에서 확인하세요. 공지 선택과
                              준비물 체크는 이 기기에 저장됩니다.
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
                '카드 안에서 ← 버리기, → 선택 또는 복구, ↕ 보류할 수 있어요. 메인에서 카드를 왼쪽으로 밀면 휴지통으로 이동해요.\n\n보류한 공지는 목록 맨 뒤로 이동해요. 다른 공지를 넘기면 차례대로 다시 나타나요.\n\n카드 바깥 여백에서 좌우로 밀거나 하단 탭을 눌러 화면을 이동하세요. 휴지통에서는 영구 삭제하지 않습니다.'
              }
            </Text>

            <CampusButton
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
