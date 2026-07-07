"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useTeams } from "@/lib/api/queries/teams";
import { useUsers } from "@/lib/api/queries/users";
import { useRooms } from "@/lib/api/queries/rooms";
import { GroupsIcon, PersonIcon, MeetingRoomIcon } from "@/components/icons";
import type { SVGProps } from "react";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const tabs = ["Teams", "People", "Rooms"];

function SecurityCircle({ pct }: { pct: number }) {
  const r = 36;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (pct / 100) * circumference;
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" className="transform -rotate-90">
      <circle cx="40" cy="40" r={r} fill="none" stroke="currentColor" className="text-surface-container-high" strokeWidth="6" />
      <circle cx="40" cy="40" r={r} fill="none" stroke="currentColor" className="text-primary" strokeWidth="6" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
    </svg>
  );
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState(0);
  const { data: teams, isLoading: teamsLoading } = useTeams();
  const { data: users, isLoading: usersLoading } = useUsers();
  const { data: rooms, isLoading: roomsLoading } = useRooms();

  const totalMembers = users?.length ?? 0;
  const totalTeams = teams?.length ?? 0;
  const totalRooms = rooms?.length ?? 0;
  const activeMeetings = users?.filter((u) => u.isActive).length ?? 0;

  const stats: Array<{ label: string; value: string; Icon: React.ComponentType<SVGProps<SVGSVGElement>>; color: string }> = [
    { label: "Total Teams", value: totalTeams.toString(), Icon: GroupsIcon, color: "text-primary" },
    { label: "Total Members", value: totalMembers.toString(), Icon: PersonIcon, color: "text-tertiary" },
    { label: "Active Rooms", value: totalRooms.toString(), Icon: MeetingRoomIcon, color: "text-primary" },
    { label: "Active Users", value: activeMeetings.toString(), Icon: PersonIcon, color: "text-secondary/80" },
  ];

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-headline text-2xl font-bold text-on-surface">Organization Administration</h1>
          <p className="text-sm text-secondary font-body mt-0.5">Manage teams, members, rooms, and oversee organizational health</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        {stats.map((stat, i) => (
          <div key={i} className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-5 flex items-center gap-4">
            <div className={cn("w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center", stat.color)}>
              <stat.Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold font-headline text-on-surface">{stat.value}</p>
              <p className="text-xs text-secondary font-body">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center border-b border-outline-variant/20 mb-8 gap-1">
        {tabs.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(i)}
            className={cn(
              "px-5 py-3 text-sm font-semibold font-body border-b-2 transition-all",
              i === activeTab
                ? "border-primary text-primary"
                : "border-transparent text-secondary hover:text-on-surface hover:border-outline-variant/40"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 0 && (
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 overflow-hidden">
          {teamsLoading ? (
            <div className="p-12 text-center text-secondary">Loading teams...</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-outline-variant/20">
                  <th className="text-left px-5 py-3 text-[11px] font-bold text-secondary uppercase tracking-wider font-body">Team</th>
                  <th className="text-left px-5 py-3 text-[11px] font-bold text-secondary uppercase tracking-wider font-body">Members</th>
                  <th className="text-left px-5 py-3 text-[11px] font-bold text-secondary uppercase tracking-wider font-body">Status</th>
                </tr>
              </thead>
              <tbody>
                {teams && teams.length > 0 ? (
                  teams.map((team) => (
                    <tr key={team.id} className="border-b border-outline-variant/10 hover:bg-surface-container-low/50 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                            <GroupsIcon className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-on-surface font-body">{team.name}</p>
                            <p className="text-xs text-secondary font-body">{team.id.slice(0, 8)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center justify-center min-w-[2rem] h-6 px-2 rounded-full bg-surface-container-high text-xs font-bold text-secondary font-body">
                          {team.members?.length ?? 0}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={cn(
                          "text-xs font-semibold px-2.5 py-1 rounded-full",
                          team.isActive ? "bg-primary/10 text-primary" : "bg-surface-container-high text-secondary"
                        )}>
                          {team.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="p-12 text-center text-secondary">No teams created yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 1 && (
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 overflow-hidden">
          {usersLoading ? (
            <div className="p-12 text-center text-secondary">Loading users...</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-outline-variant/20">
                  <th className="text-left px-5 py-3 text-[11px] font-bold text-secondary uppercase tracking-wider font-body">Name</th>
                  <th className="text-left px-5 py-3 text-[11px] font-bold text-secondary uppercase tracking-wider font-body">Email</th>
                  <th className="text-left px-5 py-3 text-[11px] font-bold text-secondary uppercase tracking-wider font-body">Role</th>
                  <th className="text-left px-5 py-3 text-[11px] font-bold text-secondary uppercase tracking-wider font-body">Team</th>
                  <th className="text-left px-5 py-3 text-[11px] font-bold text-secondary uppercase tracking-wider font-body">Status</th>
                </tr>
              </thead>
              <tbody>
                {users && users.length > 0 ? (
                  users.map((user) => (
                    <tr key={user.id} className="border-b border-outline-variant/10 hover:bg-surface-container-low/50 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                            {getInitials(user.name)}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-on-surface font-body">{user.name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-secondary font-body">{user.email}</td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-surface-container-high text-secondary">
                          {user.operationalRole}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-secondary font-body">{user.functionalTeam?.name ?? "—"}</td>
                      <td className="px-5 py-4">
                        <span className={cn(
                          "text-xs font-semibold px-2.5 py-1 rounded-full",
                          user.isActive ? "bg-primary/10 text-primary" : "bg-surface-container-high text-secondary"
                        )}>
                          {user.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-secondary">No users found</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 2 && (
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 overflow-hidden">
          {roomsLoading ? (
            <div className="p-12 text-center text-secondary">Loading rooms...</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-outline-variant/20">
                  <th className="text-left px-5 py-3 text-[11px] font-bold text-secondary uppercase tracking-wider font-body">Room</th>
                  <th className="text-left px-5 py-3 text-[11px] font-bold text-secondary uppercase tracking-wider font-body">Status</th>
                </tr>
              </thead>
              <tbody>
                {rooms && rooms.length > 0 ? (
                  rooms.map((room) => (
                    <tr key={room.id} className="border-b border-outline-variant/10 hover:bg-surface-container-low/50 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-tertiary/10 text-tertiary flex items-center justify-center">
                            <MeetingRoomIcon className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-on-surface font-body">{room.name}</p>
                            <p className="text-xs text-secondary font-body">{room.id.slice(0, 8)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={cn(
                          "text-xs font-semibold px-2.5 py-1 rounded-full",
                          room.isActive ? "bg-primary/10 text-primary" : "bg-surface-container-high text-secondary"
                        )}>
                          {room.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={2} className="p-12 text-center text-secondary">No rooms configured</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
