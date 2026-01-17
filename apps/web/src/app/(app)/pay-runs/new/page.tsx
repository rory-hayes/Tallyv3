import { prisma } from "@tally/db";
import { requireUser } from "@/lib/auth";
import { CreatePayRunForm } from "../CreatePayRunForm";

type NewPayRunPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function NewPayRunPage({ searchParams }: NewPayRunPageProps) {
  const { session } = await requireUser();
  const defaultClientId =
    typeof searchParams?.clientId === "string" ? searchParams.clientId : undefined;

  const clients = await prisma.client.findMany({
    where: {
      firmId: session.firmId,
      archivedAt: null
    },
    select: {
      id: true,
      name: true
    },
    orderBy: { name: "asc" }
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">New pay run</h1>
        <p className="mt-2 text-sm text-slate">
          Define the period and keep revisions locked to the client timeline.
        </p>
      </div>
      <div className="rounded-xl border border-slate/20 bg-surface p-6">
        <CreatePayRunForm clients={clients} defaultClientId={defaultClientId} />
      </div>
    </div>
  );
}
