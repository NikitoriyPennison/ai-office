"use client";

import { create } from "zustand";
import type { Task } from "@/lib/utils/types";
import { getMCWebSocket } from "@/lib/ws";

interface TasksState {
  tasks: Task[];
  isLoading: boolean;
  wsConnected: boolean;
  initWS: () => void;
  fetchTasks: () => Promise<void>;
  createTask: (data: {
    title: string;
    description?: string;
    assignedTo?: string;
    projectId?: string;
    priority?: string;
  }) => Promise<boolean>;
  updateTask: (id: string, data: Partial<Task>) => Promise<boolean>;
  deleteTask: (id: string) => Promise<boolean>;
  deleteTasks: (ids: string[]) => Promise<boolean>;
  moveTask: (id: string, newStatus: string) => Promise<boolean>;
}

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("ai-office-token");
}

export const useTasksStore = create<TasksState>((set, get) => ({
  tasks: [],
  isLoading: false,
  wsConnected: false,

  initWS: () => {
    const ws = getMCWebSocket();
    ws.connect();
    ws.on("connected", () => set({ wsConnected: true }));
    ws.on("disconnected", () => set({ wsConnected: false }));
    ws.on("tasks:sync", (event: { tasks?: Task[] }) => {
      if (event.tasks) {
        set({ tasks: event.tasks });
      }
    });
    ws.on("init", (event: { tasks?: Task[] }) => {
      if (event.tasks) {
        set({ tasks: event.tasks });
      }
    });
  },

  fetchTasks: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch("/api/tasks");
      if (res.ok) {
        const data = await res.json();
        set({ tasks: data.tasks, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch (err) { console.error(err);
      set({ isLoading: false });
    }
  },

  createTask: async (data) => {
    const token = getToken();
    if (!token) return false;
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const { task } = await res.json();
        set({ tasks: [task, ...get().tasks] });
        return true;
      }
      return false;
    } catch (err) { console.error(err);
      return false;
    }
  },

  updateTask: async (id, data) => {
    const token = getToken();
    if (!token) return false;
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const { task } = await res.json();
        set({
          tasks: get().tasks.map((t) => (t.id === id ? task : t)),
        });
        return true;
      }
      return false;
    } catch (err) { console.error(err);
      return false;
    }
  },

  deleteTask: async (id) => {
    const token = getToken();
    if (!token) return false;
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        set({ tasks: get().tasks.filter((t) => t.id !== id) });
        return true;
      }
      return false;
    } catch (err) { console.error(err);
      return false;
    }
  },

  deleteTasks: async (ids) => {
    const token = getToken();
    if (!token) return false;
    try {
      const results = await Promise.all(
        ids.map((id) =>
          fetch(`/api/tasks/${id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          })
        )
      );
      const deletedIds = ids.filter((_, i) => results[i].ok);
      set({ tasks: get().tasks.filter((t) => !deletedIds.includes(t.id)) });
      return deletedIds.length === ids.length;
    } catch (err) { console.error(err);
      return false;
    }
  },

  moveTask: async (id, newStatus) => {
    const token = getToken();
    if (!token) return false;

    // Optimistic update
    const prevTasks = get().tasks;
    set({
      tasks: prevTasks.map((t) =>
        t.id === id ? { ...t, status: newStatus as Task["status"] } : t
      ),
    });

    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        set({ tasks: prevTasks });
        return false;
      }
      return true;
    } catch (err) { console.error(err);
      set({ tasks: prevTasks });
      return false;
    }
  },
}));
