'use client';
import { signOut, useSession } from 'next-auth/react';
import Link from 'next/link';

export function UserMenu() {
  const { data } = useSession();
  if (!data?.user?.email) return null;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="font-medium">{data.user.email}</span>
      <span className="rounded bg-muted px-2 py-0.5 text-xs uppercase">{data.user.role}</span>
      <Link href="/settings#account" className="underline">
        Account
      </Link>
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: '/login' })}
        className="underline"
      >
        Logout
      </button>
    </div>
  );
}
