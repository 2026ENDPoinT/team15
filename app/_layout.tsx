import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DemoNoticeProvider } from '../src/features/demo/DemoNoticeProvider';
import { InitialSetupGate } from '../src/components/InitialSetupGate';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <DemoNoticeProvider>
          <StatusBar style="dark" />
          <InitialSetupGate>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="notice/[id]" />
            </Stack>
          </InitialSetupGate>
        </DemoNoticeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
