import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { NoticeCard } from '../../src/components/NoticeCard';
import {
  ActionButton,
  colors,
  DemoBanner,
  Screen,
  SectionTitle,
  styles,
} from '../../src/components/ui';
import { useDemoNotice } from '../../src/features/demo/DemoNoticeProvider';

export default function HomeScreen() {
  const { notice, saved } = useDemoNotice();
  return (
    <Screen>
      <View style={styles.group}>
        <Text style={styles.eyebrow}>CAMPUS NOTICE</Text>
        <Text accessibilityRole="header" style={styles.title}>
          챙겨 둔 기회,{`\n`}한눈에 살펴보세요.
        </Text>
        <Text style={styles.subtitle}>
          관심 있는 공지와 일정을 모아두었어요.
        </Text>
      </View>
      <DemoBanner />
      {saved ? (
        <>
          <View style={styles.group}>
            <SectionTitle title="다가오는 일정" aside="2026년 가상 일정" />
            <View style={styles.panel}>
              {notice.events.map((event, index) => (
                <View
                  key={event.type}
                  style={[home.eventRow, index > 0 && home.eventDivider]}
                >
                  <View style={home.dateBox}>
                    <Text style={home.month}>{event.date?.slice(5, 7)}월</Text>
                    <Text style={home.day}>{event.date?.slice(8, 10)}</Text>
                  </View>
                  <View style={home.eventBody}>
                    <Text style={home.eventTitle}>{event.label}</Text>
                    <Text style={styles.caption}>
                      AI 캠퍼스 해커톤 · {event.time} KST
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
          <View style={styles.group}>
            <SectionTitle title="저장한 공지" aside="1건" />
            <NoticeCard notice={notice} saved={saved} />
          </View>
        </>
      ) : (
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>아직 저장한 공지가 없어요</Text>
          <Text style={styles.subtitle}>
            공지 찾기에서 관심 있는 공지를 저장하면{`\n`}이곳에서 일정과 함께 볼
            수 있어요.
          </Text>
          <ActionButton
            label="공지 찾으러 가기"
            onPress={() => router.navigate('/discover')}
          />
        </View>
      )}
      <Text style={styles.caption}>
        샘플 일정은 고정된 날짜로 표시하며 실제 알림을 보내지 않습니다.
      </Text>
    </Screen>
  );
}

const home = StyleSheet.create({
  eventRow: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  eventDivider: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
    paddingTop: 16,
  },
  dateBox: {
    borderRadius: 12,
    backgroundColor: colors.mint,
    width: 58,
    padding: 8,
    alignItems: 'center',
  },
  month: { fontSize: 11, color: colors.teal },
  day: { fontSize: 23, fontWeight: '700', color: colors.teal },
  eventBody: { flex: 1, gap: 5 },
  eventTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
});
