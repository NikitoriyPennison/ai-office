"use client";

import { useEffect, useState, useCallback } from "react";

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        ready: () => void;
        expand: () => void;
        close: () => void;
        themeParams: Record<string, string>;
        colorScheme: "light" | "dark";
        MainButton: {
          text: string;
          show: () => void;
          hide: () => void;
          onClick: (fn: () => void) => void;
        };
      };
    };
  }
}

interface Agent {
  id: string;
  name: string;
  emoji: string;
  role: string;
  currentStatus: string;
  description?: string | null;
}

interface FeedItem {
  id: string;
  entityId: string;
  action: string;
  details?: string;
  createdAt: string;
}

const STATUS_CONFIG: Record<string, { icon: string; label: string; color: string; pulse: string }> = {
  working:  { icon: "🟢", label: "работает",  color: "#00b894", pulse: "animate-pulse" },
  thinking: { icon: "🟡", label: "думает",    color: "#fdcb6e", pulse: "animate-pulse" },
  busy:     { icon: "🟠", label: "занят",     color: "#e17055", pulse: "animate-pulse" },
  idle:     { icon: "⚪", label: "ожидает",   color: "#636e72", pulse: "" },
  offline:  { icon: "🔴", label: "офлайн",    color: "#e17055", pulse: "" },
};

export default function TmaPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<"agents" | "feed">("agents");

  const fetchData = useCallback(async () => {
    try {
      const [agentsRes, sessionsRes, feedRes] = await Promise.all([
        fetch("/api/agents"),
        fetch("/api/openclaw/sessions"),
        fetch("/api/activity/feed"),
      ]);

      const agentsData = await agentsRes.json();
      const sessionsData = sessionsRes.ok ? await sessionsRes.json() : null;
      const feedData = await feedRes.json();

      let merged: Agent[] = agentsData.agents || [];

      if (sessionsData?.agents) {
        merged = merged.map((a) => {
          const live = sessionsData.agents.find((s: Agent) => s.id === a.id);
          return live ? { ...a, currentStatus: live.currentStatus || a.currentStatus, description: live.description || a.description } : a;
        });
      }

      setAgents(merged);
      setFeed((feedData.feed || []).slice(0, 20));
      setLastUpdate(new Date());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.Telegram?.WebApp) {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
    }
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const activeCount = agents.filter((a) => ["working", "thinking", "busy"].includes(a.currentStatus)).length;

  function formatTime(iso: string) {
    try {
      return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    } catch { return ""; }
  }

  function parseFeedText(item: FeedItem): string {
    try {
      const d = item.details ? JSON.parse(item.details) : {};
      return d.statusText || d.message || item.action;
    } catch { return item.action; }
  }

  if (loading) {
    return (
      <div style={{ background: "#0f1117", minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: "#9ba1b5" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏢</div>
          <div style={{ fontSize: 14 }}>Загружаю офис...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "#0f1117", minHeight: "100dvh", color: "#e4e6f0", fontFamily: "system-ui, -apple-system, sans-serif", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div style={{ background: "#1a1d27", borderBottom: "1px solid #363a4a", padding: "12px 16px", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>🏢</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: "#ecb00a", letterSpacing: "0.5px" }}>AI Office</div>
              <div style={{ fontSize: 11, color: "#9ba1b5" }}>
                {activeCount > 0 ? `${activeCount} агент${activeCount === 1 ? "" : "а"} активно` : "все ожидают"}
              </div>
            </div>
          </div>
          <button
            onClick={fetchData}
            style={{ background: "#252836", border: "1px solid #363a4a", borderRadius: 8, padding: "6px 10px", color: "#9ba1b5", fontSize: 12, cursor: "pointer" }}
          >
            ↻ {lastUpdate ? lastUpdate.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : ""}
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginTop: 10 }}>
          {(["agents", "feed"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1, padding: "6px 0", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500,
                background: activeTab === tab ? "#ecb00a" : "#252836",
                color: activeTab === tab ? "#0f1117" : "#9ba1b5",
                transition: "all 0.15s",
              }}
            >
              {tab === "agents" ? `👥 Агенты (${agents.length})` : `📋 Лента`}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", paddingBottom: 24 }}>

        {/* Agents Tab */}
        {activeTab === "agents" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {agents.map((agent) => {
              const s = STATUS_CONFIG[agent.currentStatus] || STATUS_CONFIG.idle;
              return (
                <div
                  key={agent.id}
                  style={{
                    background: "#1a1d27",
                    border: "1px solid #363a4a",
                    borderRadius: 12,
                    padding: "12px 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    borderLeft: `3px solid ${s.color}`,
                  }}
                >
                  <div style={{ fontSize: 28, lineHeight: 1 }}>{agent.emoji}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{agent.name}</span>
                      <span style={{ fontSize: 12 }}>{s.icon}</span>
                      <span style={{ fontSize: 11, color: s.color }}>{s.label}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#9ba1b5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {agent.description || agent.role}
                    </div>
                  </div>
                </div>
              );
            })}

            {agents.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#9ba1b5", fontSize: 14 }}>
                Нет данных об агентах
              </div>
            )}
          </div>
        )}

        {/* Feed Tab */}
        {activeTab === "feed" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {feed.map((item) => (
              <div
                key={item.id}
                style={{ background: "#1a1d27", border: "1px solid #363a4a", borderRadius: 10, padding: "10px 12px" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ fontSize: 13, color: "#e4e6f0", flex: 1 }}>{parseFeedText(item)}</div>
                  <div style={{ fontSize: 11, color: "#636e72", whiteSpace: "nowrap" }}>{formatTime(item.createdAt)}</div>
                </div>
                <div style={{ fontSize: 11, color: "#6c5ce7", marginTop: 3 }}>{item.entityId}</div>
              </div>
            ))}

            {feed.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#9ba1b5", fontSize: 14 }}>
                Лента пуста
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer status bar */}
      <div style={{ background: "#1a1d27", borderTop: "1px solid #363a4a", padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#00b894", display: "inline-block" }} />
        <span style={{ fontSize: 11, color: "#9ba1b5" }}>обновляется каждые 3 сек</span>
      </div>
    </div>
  );
}
