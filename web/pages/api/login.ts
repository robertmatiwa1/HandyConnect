import type { NextApiRequest, NextApiResponse } from "next";

import { clearAuthCookie, setAuthCookie } from "../../lib/auth";

const API_BASE_URL = process.env.HANDYCONNECT_API_URL ?? "http://localhost:3000";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end("Method Not Allowed");
  }

  const { email, password } = req.body as {
    email?: string;
    password?: string;
  };

  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Email and password are required" });
  }

  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({ message: "Invalid credentials" }));
      clearAuthCookie(res);
      return res.status(response.status).json({ success: false, message: payload.message });
    }

    const payload = (await response.json()) as { accessToken: string };

    if (!payload.accessToken) {
      clearAuthCookie(res);
      return res.status(500).json({ success: false, message: "Missing access token" });
    }

    setAuthCookie(res, payload.accessToken);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Portal login failed", error);
    clearAuthCookie(res);
    return res.status(500).json({ success: false, message: "Unable to sign in" });
  }
}
