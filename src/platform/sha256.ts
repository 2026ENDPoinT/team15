import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';

export function sha256(text: string): Promise<string> {
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, text);
}
