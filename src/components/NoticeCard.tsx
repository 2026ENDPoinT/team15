import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { DemoNotice } from '../features/demo/demoNotice';
import { colors, styles } from './ui';

export function NoticeCard({
  notice,
  saved,
}: {
  notice: DemoNotice;
  saved: boolean;
}) {
  const deadline = notice.events.find(
    (event) => event.type === 'application_close',
  );
  return (
    <Link
      href={{ pathname: '/notice/[id]', params: { id: notice.id } }}
      asChild
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${notice.title} 상세 보기`}
        style={styles.panel}
      >
        <View style={card.top}>
          <Text style={styles.caption}>{notice.sourceLabel}</Text>
          {saved ? <Text style={card.saved}>관심 저장됨</Text> : null}
        </View>
        <Text style={card.title}>{notice.title}</Text>
        <Text style={styles.subtitle}>{notice.eligibilityLabel}</Text>
        <View style={styles.tagRow}>
          {notice.tags.map((tag) => (
            <Text key={tag} style={styles.tag}>
              #{tag}
            </Text>
          ))}
        </View>
        <View style={card.footer}>
          <Text style={card.deadline}>
            신청 마감 {deadline?.displayDate} {deadline?.time}
          </Text>
          <Text style={card.arrow}>↗</Text>
        </View>
      </Pressable>
    </Link>
  );
}

const card = StyleSheet.create({
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  title: { fontSize: 21, lineHeight: 30, fontWeight: '700', color: colors.ink },
  saved: { color: colors.teal, fontWeight: '700', fontSize: 12 },
  footer: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
    paddingTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  deadline: { color: colors.amber, fontSize: 13, fontWeight: '600', flex: 1 },
  arrow: { color: colors.teal, fontSize: 23 },
});
