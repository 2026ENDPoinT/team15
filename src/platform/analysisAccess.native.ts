import * as SecureStore from 'expo-secure-store';
import { validateDemoToken } from '../services/analysisClient';

const key = 'team15.analysis-demo-token';
export const analysisAccess = {
  getToken(): Promise<string | null> {
    return SecureStore.getItemAsync(key);
  },
  setToken(value: string): Promise<void> {
    return SecureStore.setItemAsync(key, validateDemoToken(value));
  },
  clearToken(): Promise<void> {
    return SecureStore.deleteItemAsync(key);
  },
};
