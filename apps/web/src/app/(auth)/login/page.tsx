import Link from "next/link";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold text-ink">Sign in</h2>
        <p className="mt-2 text-sm text-slate">
          Use your firm credentials to continue.
        </p>
      </div>
      <LoginForm />
      <div className="text-sm text-slate">
        New here?{" "}
        <Link className="font-semibold text-accent-strong" href="/create-firm">
          Create a workspace
        </Link>
      </div>
    </div>
  );
}
