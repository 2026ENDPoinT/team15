import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { NoticeCard } from '../../src/components/NoticeCard';
import {
  ActionButton,
  DemoBanner,
  Screen,
  SectionTitle,
  styles,
} from '../../src/components/ui';
import { demoProfileLabel } from '../../src/features/demo/demoNotice';
import { useDemoNotice } from '../../src/features/demo/DemoNoticeProvider';

export default function DiscoverScreen() {
  const { notice, saved, actions } = useDemoNotice();
  return (
    <Screen>
      <View style={styles.group}>
        <Text style={styles.eyebrow}>DISCOVER</Text>
        <Text accessibilityRole="header" style={styles.title}>
          새로운 기회를{`\n`}발견해 보세요.
        </Text>
        <Text style={styles.subtitle}>
          여러 곳의 공지를 한곳에서 살펴보고,{`\n`}관심 있는 소식을 저장하세요.
        </Text>
      </View>
      <DemoBanner />
      <View style={styles.tagRow}>
        <Text style={styles.tag}>샘플 프로필 · {demoProfileLabel}</Text>
        <Text style={styles.tag}>관심 키워드 · AI, 해커톤</Text>
      </View>
      <View style={styles.group}>
        <SectionTitle title="둘러볼 공지" aside="가상 공지 1건" />
        <NoticeCard notice={notice} saved={saved} />
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
          {saved
            ? '저장한 공지는 홈에서도 확인할 수 있어요.'
            : '관심 저장하면 홈에서 일정과 함께 볼 수 있어요.'}
        </Text>
      </View>
      {__DEV__ ? (
        <ActionButton
          secondary
          label="T02 수집 검증 열기"
          onPress={() => router.push('/dev/collection')}
        />
      ) : null}
    </Screen>
  );
}
