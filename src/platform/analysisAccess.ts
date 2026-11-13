import { validateDemoToken } from '../services/analysisClient';

// Browser verification only: never persist a bearer token in web storage or SQLite.
let token: string | null = null;
export const analysisAccess = {
  async getToken(): Promise<string | null> {
    return token;
  },
  async setToken(value: string): Promise<void> {
    token = validateDemoToken(value);
  },
  async clearToken(): Promise<void> {
    token = null;
  },
};
