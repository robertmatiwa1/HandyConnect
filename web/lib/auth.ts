import { NextApiResponse } from "next";
import { serialize } from "cookie";

const SESSION_COOKIE = "handyconnect_auth_token";

export function setAuthCookie(res: NextApiResponse, token: string) {
  const cookie = serialize(SESSION_COOKIE, token, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 8
  });

  res.setHeader("Set-Cookie", cookie);
}

export function clearAuthCookie(res: NextApiResponse) {
  const cookie = serialize(SESSION_COOKIE, "", {
    httpOnly: true,
    path: "/",
    expires: new Date(0)
  });

  res.setHeader("Set-Cookie", cookie);
}

export function getAuthTokenFromCookies(cookies: Partial<Record<string, string>>) {
  return cookies[SESSION_COOKIE] ?? null;
}

export function isAuthenticatedFromCookies(cookies: Partial<Record<string, string>>) {
  return Boolean(getAuthTokenFromCookies(cookies));
}

export const credentialsHint = {
  email: process.env.NEXT_PUBLIC_PORTAL_HINT_EMAIL ?? "ops@handyconnect.io",
  password: process.env.NEXT_PUBLIC_PORTAL_HINT_PASSWORD ?? "secureportal"
};
