import type { NextApiRequest, NextApiResponse } from "next";
import { authenticateRequest, setAuthCookie } from "../../lib/auth";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end("Method Not Allowed");
  }

  const isAuthenticated = authenticateRequest(req);

  if (!isAuthenticated) {
    return res.status(401).json({ success: false, message: "Invalid credentials" });
  }

  setAuthCookie(res);
  return res.status(200).json({ success: true });
}
