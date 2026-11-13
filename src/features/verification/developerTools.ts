// Explicit opt-in also lets exported web builds exercise the device tools in CI.
export const developerToolsEnabled =
  __DEV__ || process.env.EXPO_PUBLIC_ENABLE_DEV_TOOLS === '1';
