import { Redirect, Stack } from 'expo-router';
import { developerToolsEnabled } from '../../src/features/verification/developerTools';

export default function DeveloperLayout() {
  if (!developerToolsEnabled) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
