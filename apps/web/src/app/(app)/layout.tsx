import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { prisma } from "@tally/db";
import { AppShell } from "@/components/AppShell";
import { requireSession } from "@/lib/auth";

export default async function AppLayout({
  children
}: {
  children: ReactNode;
}) {
  const session = await requireSession();
  const user = await prisma.user.findFirst({
    where: {
      id: session.userId,
      status: "ACTIVE"
    }
  });

  if (!user) {
    redirect("/login");
  }

  return (
    <AppShell user={{ email: user.email, role: user.role }}>{children}</AppShell>
  );
}
