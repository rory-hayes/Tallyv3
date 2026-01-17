import Link from "next/link";
import { CreateFirmForm } from "./CreateFirmForm";

export default function CreateFirmPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold text-ink">
          Create a workspace
        </h2>
        <p className="mt-2 text-sm text-slate">
          Set up your firm and invite your team later.
        </p>
      </div>
      <CreateFirmForm />
      <div className="text-sm text-slate">
        Already have access?{" "}
        <Link className="font-semibold text-accent-strong" href="/login">
          Sign in instead
        </Link>
      </div>
    </div>
  );
}
