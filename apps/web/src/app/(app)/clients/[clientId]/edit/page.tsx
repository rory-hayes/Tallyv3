import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { ClientForm } from "../../ClientForm";
import { updateClientAction } from "../../actions";

type EditClientPageProps = {
  params: { clientId: string };
};

export default async function EditClientPage({ params }: EditClientPageProps) {
  const { session } = await requireUser();
  const [client, reviewers] = await Promise.all([
    prisma.client.findFirst({
      where: {
        id: params.clientId,
        firmId: session.firmId
      }
    }),
    prisma.user.findMany({
      where: {
        firmId: session.firmId,
        status: "ACTIVE",
        role: { in: ["REVIEWER", "ADMIN"] }
      },
      select: {
        id: true,
        email: true,
        role: true
      },
      orderBy: { email: "asc" }
    })
  ]);

  if (!client) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">Edit client</h1>
        <p className="mt-2 text-sm text-slate">
          Update payroll settings and reviewer defaults.
        </p>
      </div>
      <div className="rounded-xl border border-slate/20 bg-surface p-6">
        <ClientForm
          reviewers={reviewers}
          action={updateClientAction}
          submitLabel="Save changes"
          values={{
            clientId: client.id,
            name: client.name,
            payrollSystem: client.payrollSystem,
            payrollSystemOther: client.payrollSystemOther,
            payrollFrequency: client.payrollFrequency,
            defaultReviewerUserId: client.defaultReviewerUserId
          }}
        />
      </div>
    </div>
  );
}
