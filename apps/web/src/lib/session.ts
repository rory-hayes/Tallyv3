import "server-only";
import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import type { Role } from "@tally/db";
import { env } from "./env";

export type SessionData = {
  userId: string;
  firmId: string;
  role: Role;
};

const sessionOptions: SessionOptions = {
  password: env.SESSION_SECRET,
  cookieName: "tally_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax"
  }
};

export const getSession = async () => getIronSession<SessionData>(cookies(), sessionOptions);

export const destroySession = async (): Promise<void> => {
  const session = await getSession();
  session.destroy();
};
