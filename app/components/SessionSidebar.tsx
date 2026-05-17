"use client";

import { useState } from "react";

interface SessionListItem {
  id: string;
  startedAt: string;
  preview: string;
  messageCount: number;
}

interface SessionSidebarProps {
  sessions: SessionListItem[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onArchiveSession: (id: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

function _formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString();
}

export default function SessionSidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onArchiveSession,
  isOpen,
  onClose,
}: SessionSidebarProps) {
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const handleDelete = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmingDelete === sessionId) {
      onArchiveSession(sessionId);
      setConfirmingDelete(null);
    } else {
      setConfirmingDelete(sessionId);
      // Auto-reset confirmation after 3 seconds
      setTimeout(() => setConfirmingDelete((prev) => (prev === sessionId ? null : prev)), 3000);
    }
  };

  const sidebarContent = (
    <div className="h-full flex flex-col bg-gray-900 border-r border-gray-800">
      {/* Header */}
      <div className="p-4 border-b border-gray-800 flex items-center justify-between">
        <span className="font-semibold text-gray-200">Sessions</span>
        <button
          onClick={onClose}
          className="md:hidden text-gray-400 hover:text-gray-200 p-1"
          aria-label="Close sidebar"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* New Session Button */}
      <div className="p-3">
        <button
          onClick={() => {
            onNewSession();
            onClose();
          }}
          className="w-full flex items-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-200 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Session
        </button>
      </div>

      {/* Session List */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 pb-3 space-y-1" style={{ WebkitOverflowScrolling: "touch" }}>
        {sessions.length === 0 && (
          <p className="text-sm text-gray-500 p-3 text-center">No sessions yet</p>
        )}
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`group relative w-full text-left px-3 py-2.5 rounded-lg transition-colors cursor-pointer ${
              session.id === activeSessionId
                ? "bg-gray-700 text-gray-100"
                : "hover:bg-gray-800 text-gray-300"
            }`}
            onClick={() => {
              onSelectSession(session.id);
              onClose();
            }}
          >
            <div className="text-xs text-gray-500 mb-1">
              {_formatDate(session.startedAt)}
            </div>
            <div className="text-sm truncate pr-6">{session.preview}</div>
            <div className="text-xs text-gray-600 mt-1">
              {session.messageCount} message{session.messageCount !== 1 ? "s" : ""}
            </div>
            {/* Delete button */}
            <button
              onClick={(e) => handleDelete(session.id, e)}
              className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded transition-all ${
                confirmingDelete === session.id
                  ? "bg-red-600 text-white opacity-100"
                  : "text-gray-500 hover:text-red-400 hover:bg-gray-700 opacity-0 group-hover:opacity-100"
              }`}
              title={confirmingDelete === session.id ? "Click again to confirm" : "Archive session"}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: static sidebar */}
      <aside className="hidden md:block w-64 h-full flex-shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile: overlay */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="md:hidden fixed inset-0 bg-black/50 z-40"
            onClick={onClose}
          />
          {/* Slide-in panel */}
          <aside className="md:hidden fixed inset-y-0 left-0 w-72 z-50 transform transition-transform duration-200 ease-out">
            {sidebarContent}
          </aside>
        </>
      )}
    </>
  );
}
