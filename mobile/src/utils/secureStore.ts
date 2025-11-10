import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'handyconnect.token';
const USER_ID_KEY = 'handyconnect.user';
const ROLE_KEY = 'handyconnect.role';

export async function getStoredCredentials() {
  const [token, userId, role] = await Promise.all([
    SecureStore.getItemAsync(TOKEN_KEY),
    SecureStore.getItemAsync(USER_ID_KEY),
    SecureStore.getItemAsync(ROLE_KEY),
  ]);

  return { token, userId, role };
}

export async function storeCredentials(token: string, userId: string, role: string) {
  await Promise.all([
    SecureStore.setItemAsync(TOKEN_KEY, token),
    SecureStore.setItemAsync(USER_ID_KEY, userId),
    SecureStore.setItemAsync(ROLE_KEY, role),
  ]);
}

export async function clearCredentials() {
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY),
    SecureStore.deleteItemAsync(USER_ID_KEY),
    SecureStore.deleteItemAsync(ROLE_KEY),
  ]);
}
