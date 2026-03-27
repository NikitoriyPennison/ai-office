"use client";
import { useBranding } from "@/lib/useBranding";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";
import { useAgentsStore } from "@/stores/agentsStore";
import { PixelOffice } from "@/components/office/PixelOffice";

interface ActivityItem {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  details: string | null;
  createdAt: string | null;
}

export default function StreamPage() {
  const branding = useBranding();
  const router = useRouter();
  const { checkAuth, user } = useAuthStore();
  const { agents, costs, fetchAgents, fetchLiveStatus, fetchCosts } = useAgentsStore();
  const [feed, setFeed] = useState<ActivityItem[]>([]);
  const [crtEnabled, setCrtEnabled] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tokenCount, setTokenCount] = useState(0);
  const [tokenCost, setTokenCost] = useState(0);
  const [displayTokens, setDisplayTokens] = useState(0);
  const officeRef = useRef<any>(null);

  // Fetch real token stats from API
  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("/api/openclaw/stats?t=" + Date.now());
        if (res.ok) {
          const data = await res.json();
          setTokenCount(data.totalTokens || 0);
          setTokenCost(data.cost || 0);
        }
      } catch (err) { console.error(err); }
    }
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  // Smooth animated counter
  useEffect(() => {
    if (displayTokens === tokenCount) return;
    const diff = tokenCount - displayTokens;
    const step = Math.max(1, Math.ceil(Math.abs(diff) / 20));
    const timer = setTimeout(() => {
      setDisplayTokens(prev => diff > 0 ? Math.min(prev + step, tokenCount) : Math.max(prev - step, tokenCount));
    }, 30);
    return () => clearTimeout(timer);
  }, [tokenCount, displayTokens]);

  useEffect(() => {
    checkAuth();
    fetchAgents().then(() => { fetchLiveStatus(); fetchCosts(); });
    fetchFeed();

    const agentInterval = setInterval(fetchLiveStatus, 10000);
    const feedInterval = setInterval(fetchFeed, 10000);
    const costInterval = setInterval(fetchCosts, 30000);
    return () => {
      clearInterval(agentInterval);
      clearInterval(feedInterval);
      clearInterval(costInterval);
    };
  }, [checkAuth, fetchAgents, fetchLiveStatus, fetchCosts]);

  async function fetchFeed() {
    try {
      const res = await fetch("/api/activity/feed");
      if (res.ok) {
        const data = await res.json();
        setFeed(data.feed);
      }
    } catch (err) { console.error(err);
      // ignore
    }
  }

  const onlineAgents = agents.filter((a) => a.currentStatus !== "offline");

  function getActivityMessage(item: ActivityItem): string {
    try {
      const details = item.details ? JSON.parse(item.details) : {};
      if (details.message) return details.message;
      if (details.statusText) return details.statusText;
      if (details.title) return `${item.action}: ${details.title}`;
      return `${item.entityType} ${item.action}`;
    } catch (err) { console.error(err);
      return `${item.entityType} ${item.action}`;
    }
  }

  function getAgentForActivity(item: ActivityItem) {
    if (item.entityType === "agent") {
      return agents.find((a) => a.id === item.entityId);
    }
    return null;
  }

  const STATUS_COLORS: Record<string, string> = {
    working: "text-green-400",
    thinking: "text-yellow-400",
    busy: "text-orange-400",
    idle: "text-gray-500",
    offline: "text-gray-700",
  };

  return (
    <div className="h-screen flex flex-col bg-[#0a0a12]">
      {/* Header — office style */}
      <header className="h-11 bg-[#0f0f0f] border-b border-[#2a2a2a] flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-lg">📁</span>
          <h1 className="text-base font-bold tracking-wider text-white">OpenClaw <span className="text-[#ecb00a]">Content Factory</span></h1>
          <span className="text-[10px] text-[#9ca3af] border border-[#2a2a2a] px-1.5 py-0.5 rounded">LIVE</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Token stats — running counter */}
          <span className="text-[10px] text-[#9ca3af] font-mono">
            {agents.length} агентов • {onlineAgents.length} онлайн
          </span>
          <span className="text-[10px] text-[#ecb00a] font-mono tabular-nums">
            {displayTokens > 0 ? `${(displayTokens / 1000).toFixed(1)}k tokens` : "—"}
          </span>
          <span className="text-[10px] text-green-400/70 font-mono">
            {tokenCost > 0 ? `$${tokenCost.toFixed(2)}` : ""}
          </span>
          <span className="text-xs text-green-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full inline-block animate-pulse" />
          </span>
          <a
            href={branding.website || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 text-[11px] font-semibold bg-[#ecb00a] hover:bg-[#d4a00a] text-[#0a0a12] px-3 py-1 rounded transition-colors"
          >
            {(branding.website || "").replace("https://", "")} →
          </a>
        </div>
      </header>

      {/* Main: Office (left, big) + Feed (right column) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Office — takes most of the space */}
        <main className="flex-1 relative overflow-hidden flex items-center justify-center bg-[#0a0a12]">
          <div className="w-full h-full pointer-events-none select-none">
            <PixelOffice ref={officeRef} agents={agents} className="w-full h-full" />
          </div>
          {crtEnabled && <div className="crt-overlay" />}

          {/* Stats overlay bottom-left */}
          <div className="absolute bottom-3 left-3 flex items-center gap-3 text-[10px] text-[#9ca3af] bg-[#0f0f0f]/80 border border-[#2a2a2a] px-3 py-1.5 rounded backdrop-blur">
            <span className="text-green-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full inline-block animate-pulse" />
              LIVE
            </span>
          </div>

          {/* Admin controls — only for logged-in users */}
          {user && (
            <div className="absolute bottom-3 right-3 flex gap-2 pointer-events-auto z-10">
              <button aria-label="action" onClick={() => officeRef.current?.triggerAllMeeting()}
                className="text-[10px] bg-[#ecb00a]/20 hover:bg-[#ecb00a]/40 text-[#ecb00a] border border-[#ecb00a]/30 px-3 py-1.5 rounded backdrop-blur transition-colors cursor-pointer"
              >
                🤝 Собрать всех
              </button>
            </div>
          )}
        </main>

        {/* Right sidebar — Agent list + Live Feed */}
        {/* Hidden on mobile by default, toggled via sidebarOpen */}
        <aside className="w-80 bg-[#0f0f0f] border-l border-[#2a2a2a] flex flex-col shrink-0 overflow-hidden hidden md:flex">
          {/* Stream mode — no interactive buttons */}

          {/* Agent list */}
          <div className="p-4 border-b border-[#2a2a2a]/50">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider">
                👥 Agents
              </h3>
              <a
                href={branding.website || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-[#ecb00a] hover:text-[#d4a00a] font-medium transition-colors"
              >
                📊 Расход токенов →
              </a>
            </div>
            <div className="space-y-2">
              {agents.map((agent) => (
                <div key={agent.id} className="flex items-center gap-3 text-sm">
                  <span className="text-lg">{agent.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-white truncate">{agent.name}</div>
                    <div className="text-xs text-[#6b7280] truncate">{agent.role}</div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className={`text-xs font-medium ${STATUS_COLORS[agent.currentStatus ?? "idle"] || "text-gray-500"}`}>
                      {agent.currentStatus === "working" && "● Working"}
                      {agent.currentStatus === "thinking" && "● Thinking"}
                      {agent.currentStatus === "busy" && "● Busy"}
                      {agent.currentStatus === "idle" && "● Idle"}
                      {agent.currentStatus === "offline" && "● Offline"}
                    </span>
                    {costs[agent.id] > 0 && (
                      <span className="text-[10px] text-[#6b7280] font-mono">${costs[agent.id].toFixed(2)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Live Feed */}
          <div className="flex-1 overflow-y-auto p-4">
            <h3 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="w-2 h-2 bg-red-500 rounded-full inline-block animate-pulse" />
              Live Feed
            </h3>
            <div className="space-y-2">
              {feed.map((item) => {
                const agent = getAgentForActivity(item);
                return (
                  <div key={item.id} className="text-xs py-1.5 border-b border-[#2a2a2a]/30">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[#6b7280]">
                        {item.createdAt
                          ? new Date(item.createdAt).toLocaleTimeString("ru", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : ""}
                      </span>
                      {agent && <span>{agent.emoji}</span>}
                    </div>
                    <div className="text-[#e4e6f0]">{getActivityMessage(item)}</div>
                  </div>
                );
              })}
              {feed.length === 0 && (
                <div className="text-[#6b7280] text-xs">Waiting for activity...</div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
