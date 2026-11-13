import { useState } from 'react';
import { router } from 'expo-router';
import { Linking, Platform, Text, View } from 'react-native';
import { ActionButton, Screen, styles } from '../../src/components/ui';
import { sha256 } from '../../src/platform/sha256';
import { boardConfigs } from '../../src/sources/boards';
import { runCollectionSmoke } from '../../src/sources/smoke';

export default function CollectionVerificationScreen() {
  const [results, setResults] = useState<
    Awaited<ReturnType<typeof runCollectionSmoke>>
  >([]);
  const [status, setStatus] = useState('대기 중');
  const [error, setError] = useState<string | null>(null);
  return (
    <Screen>
      <Text accessibilityRole="header" style={styles.title}>
        T02 수집 검증
      </Text>
      <Text style={styles.body}>
        두 게시판의 목록 1·2페이지와 실제 공지 각 1건을 확인합니다. 이 화면은
        개발 검증용이며 수집 결과를 저장하지 않습니다.
      </Text>
      <Text style={styles.caption}>
        실행 환경: {Platform.OS}. 웹은 게시판 CORS 제한으로 실패할 수 있습니다.
        Android 실기기에서 확인해 주세요.
      </Text>
      <ActionButton
        label="두 게시판 수집 확인"
        onPress={async () => {
          setStatus('수집 중…');
          setError(null);
          setResults([]);
          try {
            setResults(await runCollectionSmoke({ sha256 }));
            setStatus('두 게시판 수집·해시 확인 성공');
          } catch (cause) {
            setStatus('수집 확인 실패');
            setError(
              cause instanceof Error ? cause.message : '다시 시도해 주세요.',
            );
          }
        }}
      />
      <Text accessibilityLiveRegion="polite" style={styles.body}>
        {status}
      </Text>
      {error ? (
        <Text accessibilityRole="alert" style={styles.body}>
          {error}
        </Text>
      ) : null}
      {results.map(
        ({ sourceId, firstPageCount, secondPageNewCount, notice }) => (
          <View key={sourceId} style={styles.panel}>
            <Text style={styles.sectionTitle}>
              {boardConfigs[sourceId].label}
            </Text>
            <Text style={styles.caption}>
              1페이지 {firstPageCount}건 · 2페이지 신규 {secondPageNewCount}건
            </Text>
            <Text selectable style={styles.body}>
              {notice.title}
            </Text>
            <Text selectable style={styles.caption}>
              ID: {notice.id}
              {'\n'}SHA-256: {notice.contentHash}
              {'\n'}수집 시각: {notice.fetchedAt}
            </Text>
            <Text style={styles.caption}>
              본문 이미지:{' '}
              {notice.hasBodyImages ? '있음 · 이미지 내용 확인 필요' : '없음'}
            </Text>
            <Text selectable style={styles.body}>
              {notice.bodyText || '본문 텍스트 없음 · 원문 확인 필요'}
            </Text>
            {notice.attachments.map((file, index) => (
              <Text key={index} style={styles.caption}>
                첨부: {file.name}
                {file.url ? '' : ' · 원문에서 확인'}
              </Text>
            ))}
            {notice.extractedLinks.map((link, index) => (
              <Text selectable key={index} style={styles.caption}>
                본문 링크: {link.url}
              </Text>
            ))}
            <ActionButton
              secondary
              label="공지 원문 열기"
              onPress={() => Linking.openURL(notice.sourceUrl)}
            />
          </View>
        ),
      )}
      <ActionButton
        secondary
        label="공지 찾기로 돌아가기"
        onPress={() => router.replace('/(tabs)/discover')}
      />
    </Screen>
  );
}
