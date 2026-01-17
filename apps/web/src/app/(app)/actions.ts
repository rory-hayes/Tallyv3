"use server";

import { redirect } from "next/navigation";
import { destroySession } from "@/lib/session";

export const logoutAction = async (): Promise<void> => {
  await destroySession();
  redirect("/login");
};
