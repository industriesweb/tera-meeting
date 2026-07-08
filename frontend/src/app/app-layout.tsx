"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useCurrentUser } from "@/lib/api/queries/auth";
import { useUnreadCount } from "@/lib/api/queries/notifications";
import { useAuth } from "@/components/providers/auth-provider";
import { DashboardIcon, GroupsIcon, ParkingIcon, PriorityHighIcon, CalendarIcon, NotificationsIcon, AdminIcon, PlusCircleIcon } from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { playBeep } from "@/lib/sounds";

const navItems = [
  { href: "/dashboard", label: "Dashboard", Icon: DashboardIcon },
  { href: "/meetings", label: "Meetings", Icon: GroupsIcon },
  { href: "/parking-lot", label: "Parking Lot", Icon: ParkingIcon },
  { href: "/executive-requests", label: "Exec Requests", Icon: PriorityHighIcon },
  { href: "/calendar", label: "Calendar", Icon: CalendarIcon },
  { href: "/notifications", label: "Notifications", Icon: NotificationsIcon },
  { href: "/admin", label: "Administration", Icon: AdminIcon },
];

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: user } = useCurrentUser();
  const { signOut } = useAuth();
  const { data: unreadData } = useUnreadCount();
  const prevRef = useRef(0);

  useEffect(() => {
    const current = unreadData?.count ?? 0;
    if (current > prevRef.current) playBeep();
    prevRef.current = current;
  }, [unreadData?.count]);

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="fixed left-0 top-0 h-screen w-60 flex flex-col z-40 bg-surface-container-low border-r border-outline-variant/20">
        <div className="px-5 pt-6 pb-4">
          <h1 className="font-headline text-lg font-bold text-primary tracking-tight">Terra Meetings</h1>
          <p className="text-[10px] text-secondary font-semibold uppercase tracking-[0.2em] mt-0.5">Enterprise Suite</p>
        </div>

        <nav className="flex-1 px-3 space-y-0.5">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${
                  isActive
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-secondary hover:text-on-surface hover:bg-surface-container-high/60"
                }`}
              >
                <item.Icon className="h-[18px] w-[18px] shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-3 pb-4 space-y-3">
          <ThemeToggle />
          {user && (
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-surface-container-high/40">
              <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                {getInitials(user.name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-on-surface truncate">{user.name}</p>
                <p className="text-[10px] text-secondary font-medium uppercase tracking-wider">{user.operationalRole}</p>
              </div>
              <button
                onClick={() => signOut()}
                className="text-[10px] text-secondary hover:text-error transition-colors font-medium shrink-0"
                title="Sign out"
              >
                Sign out
              </button>
            </div>
          )}
          <Link
            href="/meetings/new"
            className="w-full bg-primary text-primary-foreground py-3 px-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.98] transition-all"
          >
            <PlusCircleIcon className="h-4 w-4" />
            Schedule Meeting
          </Link>
        </div>
      </aside>

      <main className="ml-60 flex-1 min-h-screen">{children}</main>
    </div>
  );
}
