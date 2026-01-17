import { AcceptInviteForm } from "./AcceptInviteForm";

export default function InvitePage({
  params
}: {
  params: { token: string };
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold text-ink">
          Accept invite
        </h2>
        <p className="mt-2 text-sm text-slate">
          Create a password to join your firm workspace.
        </p>
      </div>
      <AcceptInviteForm token={params.token} />
    </div>
  );
}
