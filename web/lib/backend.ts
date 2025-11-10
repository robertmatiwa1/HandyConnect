const API_BASE_URL = process.env.HANDYCONNECT_API_URL ?? "http://localhost:3000";

export async function fetchFromBackend<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`Backend request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}
