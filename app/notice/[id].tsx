import { router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import {
  ActionButton,
  DemoBanner,
  Screen,
  SectionTitle,
  styles,
} from '../../src/components/ui';
import { useDemoNotice } from '../../src/features/demo/DemoNoticeProvider';

export default function NoticeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { notice, saved, actions, checklist, home } = useDemoNotice();
  const progress = home.notices.find((item) => item.id === id)?.progress;
  const goBack = () =>
    router.canGoBack() ? router.back() : router.replace('/');
  if (id !== notice.id)
    return (
      <Screen>
        <Text style={styles.title}>공지를 찾을 수 없어요</Text>
        <ActionButton label="홈으로 이동" onPress={() => router.replace('/')} />
      </Screen>
    );
  return (
    <Screen>
      <ActionButton label="뒤로 가기" secondary onPress={goBack} />
      <DemoBanner />
      <View style={styles.group}>
        <Text style={styles.caption}>
          {notice.sourceLabel} · {notice.publishedLabel}
        </Text>
        <Text accessibilityRole="header" style={styles.title}>
          {notice.title}
        </Text>
        <View style={styles.tagRow}>
          {notice.tags.map((tag) => (
            <Text key={tag} style={styles.tag}>
              #{tag}
            </Text>
          ))}
        </View>
      </View>
      <View style={styles.panel}>
        <SectionTitle title="어떤 활동인가요?" />
        <Text style={styles.body}>{notice.summary}</Text>
        <Text style={styles.subtitle}>
          장소 · {notice.activity}
          {`\n`}혜택 · {notice.benefits.join(', ')}
        </Text>
      </View>
      <View style={styles.panel}>
        <SectionTitle title="모집 대상" />
        <Text style={styles.body}>{notice.eligibilityLabel}</Text>
        <Text style={styles.caption}>
          원문 근거 · {notice.eligibilityEvidence}
        </Text>
      </View>
      <View style={styles.panel}>
        <SectionTitle title="일정" />
        {notice.events.map((event) => (
          <View key={event.type} style={styles.group}>
            <Text style={styles.body}>
              {event.label} · {event.displayDate} {event.time}
            </Text>
            <Text style={styles.caption}>{event.evidence}</Text>
          </View>
        ))}
      </View>
      <View style={styles.panel}>
        <SectionTitle title="준비할 것" />
        {saved
          ? checklist.items.map((item) => (
              <ActionButton
                key={item.id}
                label={`${item.completed ? '체크됨' : '체크하기'} · ${item.text}`}
                secondary
                onPress={() =>
                  actions.setChecklistCompleted(item.id, !item.completed)
                }
              />
            ))
          : notice.checklist.map((item) => (
              <Text key={item.text} style={styles.body}>
                • {item.text}
              </Text>
            ))}
        <Text style={styles.caption}>
          {saved
            ? '항목을 눌러 준비 여부를 기록하세요.'
            : '관심 저장하면 준비 여부를 기록할 수 있어요.'}
        </Text>
      </View>
      {progress && (
        <View style={styles.panel}>
          <SectionTitle title="신청 상태" />
          <Text style={styles.body}>
            {progress === 'applied'
              ? '신청 완료'
              : progress === 'preparing'
                ? '준비 중'
                : '관심 저장'}
          </Text>
          {progress !== 'preparing' && (
            <ActionButton
              label="준비 중으로 변경"
              secondary
              onPress={() => actions.setProgress(notice.id, 'preparing')}
            />
          )}
          {progress !== 'applied' && (
            <ActionButton
              label="신청 완료로 변경"
              onPress={() => actions.setProgress(notice.id, 'applied')}
            />
          )}
        </View>
      )}
      <ActionButton
        label={saved ? '관심 해제' : '관심 저장'}
        secondary={saved}
        onPress={() =>
          saved
            ? actions.unsaveNotice(notice.id)
            : actions.saveNotice(notice.id)
        }
      />
      <Text style={styles.caption}>
        가상 공지이므로 실제 원문·신청 페이지로 연결되지 않습니다.
      </Text>
    </Screen>
  );
}
