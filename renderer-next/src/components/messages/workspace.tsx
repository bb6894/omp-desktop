import { useState } from "react";
import { MessageCard } from "./message-card";
import { 
  Terminal as TerminalIcon, 
  Split, 
  FileDiff,


} from "lucide-react";
import type { TimelineEntry } from "../../lib/event-reducer";

interface WorkspaceProps {
  entries: TimelineEntry[];
  onSendMessage: (message: string) => void;
  turnActive?: boolean;
}

export function Workspace({ entries, onSendMessage, turnActive = false }: WorkspaceProps) {
  const [activeTab, setActiveTab] = useState<"messages" | "terminal">("messages");

  return (
    <div className="flex flex-col h-full">
      {/* Session header */}
      <div className="h-14 border-b border-[#2A2D3E] flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-medium text-[#E2E4ED]">当前会话</h1>
          <span className="px-2 py-0.5 bg-[#4C8BF5]/20 text-[#4C8BF5] rounded text-xs font-mono">
            omp-desktop
          </span>
          <span className="px-2 py-0.5 bg-[#262940] text-[#8B8FA3] rounded text-xs font-mono">
            agnes-2.5-flash
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <button className="p-2 hover:bg-[#1E2030] rounded-lg transition-colors" title="分叉终端">
            <TerminalIcon className="w-4 h-4 text-[#8B8FA3]" />
          </button>
          <button className="p-2 hover:bg-[#1E2030] rounded-lg transition-colors" title="拆分视图">
            <Split className="w-4 h-4 text-[#8B8FA3]" />
          </button>
          <button className="p-2 hover:bg-[#1E2030] rounded-lg transition-colors" title="打开变更">
            <FileDiff className="w-4 h-4 text-[#8B8FA3]" />
          </button>
        </div>
      </div>

      {/* Messages / Terminal tabs */}
      <div className="flex border-b border-[#2A2D3E]">
        <button
          onClick={() => setActiveTab("messages")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "messages"
              ? "text-white border-b-2 border-[#4C8BF5]"
              : "text-[#8B8FA3] hover:text-white"
          }`}
        >
          消息 ({entries.length})
        </button>
        <button
          onClick={() => setActiveTab("terminal")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "terminal"
              ? "text-white border-b-2 border-[#4C8BF5]"
              : "text-[#8B8FA3] hover:text-white"
          }`}
        >
          终端
        </button>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
        {activeTab === "messages" ? (
          entries.map((entry) => (
            <MessageCard key={entry.id} entry={entry as any} />
          ))
        ) : (
          <div className="bg-[#0a0b10] rounded-xl p-4 font-mono text-sm text-[#8B8FA3] min-h-[200px]">
            <div className="flex items-center gap-2 mb-2 text-[#555872]">
              <TerminalIcon className="w-4 h-4" />
              <span>omp-desktop — bash — 120×40</span>
            </div>
            <div>$ node --version</div>
            <div className="text-[#4ADE80]">v25.2.1</div>
            <div className="mt-2">$ cargo --version</div>
            <div className="text-[#4ADE80]">cargo 1.98.0</div>
            <div className="mt-2 flex items-center gap-2">
              <span>$</span>
              <span className="w-2 h-4 bg-[#8B8FA3] animate-pulse" />
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-[#2A2D3E] p-4">
        <div className="bg-[#1E2030] rounded-xl border border-[#2A2D3E] p-3 focus-within:border-[#4C8BF5] transition-colors">
          <textarea
            className="w-full bg-transparent border-none outline-none resize-none text-sm text-[#E2E4ED] placeholder:text-[#555872] min-h-[40px] max-h-[120px]"
            placeholder="向 AI 提问..."
            rows={2}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                const target = e.target as HTMLTextAreaElement;
                if (target.value.trim()) {
                  onSendMessage(target.value.trim());
                  target.value = "";
                }
              }
            }}
          />
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2 text-xs text-[#555872]">
              <span>Ctrl+Enter 发送</span>
            </div>
            <button
              className="px-3 py-1.5 bg-[#4C8BF5] hover:bg-[#3B7AE0] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              disabled={turnActive}
              onClick={() => {
                // Send would be handled by parent
              }}
            >
              {turnActive ? "运行中..." : "发送"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
