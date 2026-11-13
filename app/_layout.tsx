import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DemoNoticeProvider } from '../src/features/demo/DemoNoticeProvider';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <DemoNoticeProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="notice/[id]" />
        </Stack>
      </DemoNoticeProvider>
    </SafeAreaProvider>
  );
}
