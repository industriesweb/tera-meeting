import Link from "next/link";
import { Leaf } from "lucide-react";

export const metadata = { title: "Signup Unavailable — Terra Meetings" };

export default function SignupPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center">
        <div className="flex items-center justify-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-accent text-primary ring-1 ring-border">
            <Leaf className="h-5 w-5" />
          </span>
        </div>
        <h1 className="mt-6 font-headline text-2xl text-foreground">Signup unavailable</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Accounts are created by your organization administrator.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-95"
        >
          Go to login
        </Link>
      </div>
    </div>
  );
}
