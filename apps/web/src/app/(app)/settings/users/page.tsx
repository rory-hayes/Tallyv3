import { prisma } from "@/lib/prisma";
import { InviteUserForm } from "./InviteUserForm";
import { updateUserRoleFromForm } from "./actions";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { SettingsNav } from "@/components/SettingsNav";

export default async function UsersPage() {
  const { session, user } = await requireUser();
  const users = await prisma.user.findMany({
    where: {
      firmId: session.firmId
    },
    orderBy: {
      createdAt: "asc"
    }
  });
  const canManageUsers = can(user.role, "user:invite");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">Users</h1>
        <p className="mt-2 text-sm text-slate">
          Invite teammates and manage roles for this workspace.
        </p>
      </div>
      <SettingsNav />

      <section className="rounded-xl border border-slate/20 bg-surface p-5">
        <h2 className="font-display text-lg font-semibold text-ink">Invite user</h2>
        <p className="mt-2 text-sm text-slate">
          Send an invite link to onboard preparers and reviewers.
        </p>
        <div className="mt-4">
          {canManageUsers ? (
            <InviteUserForm />
          ) : (
            <p className="text-sm text-slate">
              Only admins can invite users.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-slate/20 bg-surface p-5">
        <h2 className="font-display text-lg font-semibold text-ink">Team</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate">
                <th className="pb-3">Email</th>
                <th className="pb-3">Role</th>
                <th className="pb-3">Status</th>
                {canManageUsers ? <th className="pb-3">Action</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate/10">
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="py-3 text-ink">{user.email}</td>
                  <td className="py-3">
                    {canManageUsers ? (
                      <form action={updateUserRoleFromForm}>
                        <input type="hidden" name="userId" value={user.id} />
                        <div className="flex items-center gap-2">
                          <select
                            name="role"
                            defaultValue={user.role}
                            className="rounded-lg border border-slate/30 bg-surface px-2 py-1"
                          >
                            <option value="ADMIN">Admin</option>
                            <option value="PREPARER">Preparer</option>
                            <option value="REVIEWER">Reviewer</option>
                          </select>
                          <button
                            type="submit"
                            className="rounded-lg border border-slate/30 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate"
                          >
                            Save
                          </button>
                        </div>
                      </form>
                    ) : (
                      <span className="text-ink">{user.role}</span>
                    )}
                  </td>
                  <td className="py-3 text-slate">{user.status}</td>
                  {canManageUsers ? (
                    <td className="py-3 text-xs text-slate">Role updates are logged.</td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
