import { NextApiRequest, NextApiResponse } from "next";
import { serialize } from "cookie";

const SESSION_COOKIE = "handyconnect_auth";
const VALID_USER = {
  email: "ops@handyconnect.io",
  password: "secureportal"
};

export function setAuthCookie(res: NextApiResponse) {
  const cookie = serialize(SESSION_COOKIE, "authenticated", {
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

export function authenticateRequest(req: NextApiRequest) {
  const { email, password } = req.body as { email?: string; password?: string };

  if (email === VALID_USER.email && password === VALID_USER.password) {
    return true;
  }

  return false;
}

export function isAuthenticatedFromCookies(cookies: Partial<Record<string, string>>) {
  return cookies[SESSION_COOKIE] === "authenticated";
}

export const credentialsHint = VALID_USER;
