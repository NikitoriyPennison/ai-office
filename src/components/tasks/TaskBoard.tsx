"use client";

import { useState, DragEvent } from "react";
import { useTasksStore } from "@/stores/tasksStore";
import { useAgentsStore } from "@/stores/agentsStore";
import { TaskCard } from "./TaskCard";
import { useUiStore } from "@/stores/uiStore";

const COLUMNS = [
  { id: "planning", label: "PLANNING", color: "#a29bfe" },
  { id: "todo", label: "TODO", color: "#9ba1b5" },
  { id: "assigned", label: "ASSIGNED", color: "#e17055" },
  { id: "in_progress", label: "IN PROGRESS", color: "#0984e3" },
  { id: "review", label: "REVIEW", color: "#fdcb6e" },
  { id: "done", label: "DONE", color: "#00b894" },
] as const;

export function TaskBoard() {
  const { tasks, moveTask } = useTasksStore();
  const { agents } = useAgentsStore();
  const { openTaskForm } = useUiStore();
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [filterAgent, setFilterAgent] = useState<string>("");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const { deleteTasks } = useTasksStore();

  const filteredTasks = filterAgent
    ? tasks.filter((t) => t.assignedTo === filterAgent)
    : tasks;

  function handleDragStart(e: DragEvent, taskId: string) {
    e.dataTransfer.setData("taskId", taskId);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: DragEvent, columnId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(columnId);
  }

  function handleDragLeave() {
    setDragOverColumn(null);
  }

  async function handleDrop(e: DragEvent, columnId: string) {
    e.preventDefault();
    setDragOverColumn(null);
    const taskId = e.dataTransfer.getData("taskId");
    if (taskId) {
      await moveTask(taskId, columnId);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Board Header */}
      <div className="px-6 py-2.5 border-b border-[#2a2a2a] flex items-center justify-between bg-[#0f0f0f]/50 shrink-0">
        <h2 className="text-xs font-semibold tracking-widest text-[#555] uppercase">
          Задачи
        </h2>
        <div className="flex items-center gap-3">
          <select
            value={filterAgent}
            onChange={(e) => setFilterAgent(e.target.value)}
            className="text-[10px] bg-[#111118] border border-[#2a2a2a] rounded px-2 py-1.5 text-[#9ca3af] focus:outline-none focus:border-[#ecb00a]/30"
          >
            <option value="">Все агенты</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.emoji} {a.name}
              </option>
            ))}
          </select>
          <button aria-label="action" onClick={() => {
              if (selectMode) {
                setSelectMode(false);
                setSelected(new Set());
              } else {
                setSelectMode(true);
              }
            }}
            className={`text-[10px] px-3 py-1.5 rounded font-semibold transition-colors ${
              selectMode
                ? "bg-red-500/20 text-red-400 border border-red-500/30"
                : "bg-[#252836] text-[#9ba1b5] hover:text-[#ecb00a]"
            }`}
          >
            {selectMode ? `✕ Отмена (${selected.size})` : "☑ Выбрать"}
          </button>
          {selectMode && selected.size > 0 && (
            <button aria-label="action" onClick={async () => {
                if (!confirm(`Удалить ${selected.size} задач?`)) return;
                setDeleting(true);
                await deleteTasks([...selected]);
                setSelected(new Set());
                setSelectMode(false);
                setDeleting(false);
              }}
              disabled={deleting}
              className="text-[10px] bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded font-semibold transition-colors disabled:opacity-50"
            >
              {deleting ? "Удаление..." : `🗑 Удалить (${selected.size})`}
            </button>
          )}
          <button aria-label="action" onClick={() => openTaskForm()}
            className="text-[10px] bg-[#ecb00a] hover:bg-[#d4a00a] text-[#0a0a12] px-3 py-1.5 rounded font-semibold transition-colors"
          >
            + Задача
          </button>
        </div>
      </div>

      {/* Columns */}
      <div className="flex-1 flex gap-4 p-4 overflow-x-auto">
        {COLUMNS.map((column) => {
          const columnTasks = filteredTasks.filter(
            (t) => t.status === column.id
          );
          const isDragOver = dragOverColumn === column.id;

          return (
            <div
              key={column.id}
              className={`flex-1 min-w-[260px] flex flex-col rounded-xl transition-colors ${
                isDragOver
                  ? "bg-[#ecb00a]/5 ring-1 ring-[#ecb00a]/20"
                  : "bg-[#16161f]"
              }`}
              onDragOver={(e) => handleDragOver(e, column.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, column.id)}
            >
              {/* Column Header */}
              <div className="px-3 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: column.color }}
                  />
                  <span className="text-xs font-semibold tracking-wider text-[#9ba1b5]">
                    {column.label}
                  </span>
                </div>
                <span className="text-xs text-[#9ba1b5] bg-[#252836] px-2 py-0.5 rounded-full">
                  {columnTasks.length}
                </span>
              </div>

              {/* Tasks */}
              <div className="flex-1 px-2 pb-2 space-y-2 overflow-y-auto">
                {columnTasks.map((task) => (
                  <div key={task.id} className="flex items-start gap-1">
                    {selectMode && (
                      <input
                        type="checkbox"
                        checked={selected.has(task.id)}
                        onChange={() => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(task.id)) next.delete(task.id);
                            else next.add(task.id);
                            return next;
                          });
                        }}
                        className="mt-3 ml-1 accent-[#ecb00a] shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <TaskCard
                        task={task}
                        onDragStart={(e) => handleDragStart(e, task.id)}
                      />
                    </div>
                  </div>
                ))}
                {columnTasks.length === 0 && (
                  <div className="text-center py-8 text-xs text-[#9ba1b5]">
                    {isDragOver ? "Drop here" : "No tasks"}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
