import { useState } from "react";
import { 
  Plus, Search, Zap, Puzzle, Folder, ChevronDown, ChevronRight,
  User, Settings
} from "lucide-react";
import type { SessionViewData } from "../../lib/session-lifecycle";

interface SidebarProps {
  views?: readonly SessionViewData[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  onNewSession: () => void;
}

function SessionItem({ view, selected, onSelect }: {
  view: SessionViewData;
  selected: boolean;
  onSelect: () => void;
}) {
  const statusColor = view.runtimeState === "running" ? "bg-[#4C8BF5] animate-pulse" 
    : view.runtimeState === "waiting-user" ? "bg-[#E5A04C]" 
    : "bg-[#555872]";
  
  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#1E2030] transition-colors duration-150 ${
        selected ? "bg-[#1E2030]" : ""
      }`}
    >
      <span className={`w-1 h-1 rounded-full ${statusColor} flex-shrink-0`} />
      <span className="text-sm text-[#E2E4ED] truncate flex-1">
        {view.title || "未命名会话"}
      </span>
      <span className="text-xs text-[#555872]">
        {new Date(view.updatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
      </span>
    </button>
  );
}

export function SideBar({ views = [], selectedId, onSelect, onNewSession }: SidebarProps) {
  const [expanded, setExpanded] = useState(true);
  
  return (
    <aside className="w-[272px] bg-[#161822] border-r border-[#2A2D3E] flex flex-col">
      {/* Top actions */}
      <div className="p-3 space-y-1">
        <button
          onClick={onNewSession}
          className="w-full flex items-center gap-2 px-3 py-2 bg-[#4C8BF5] hover:bg-[#3B7AE0] text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          新建任务
          <span className="ml-auto text-xs text-white/60">Ctrl+N</span>
        </button>
        <button className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#1E2030] text-[#8B8FA3] rounded-lg text-sm transition-colors">
          <Search className="w-4 h-4" />
          搜索
          <span className="ml-auto text-xs">Ctrl+K</span>
        </button>
        <button className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#1E2030] text-[#8B8FA3] rounded-lg text-sm transition-colors">
          <Zap className="w-4 h-4" />
          自动化
        </button>
        <button className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#1E2030] text-[#8B8FA3] rounded-lg text-sm transition-colors">
          <Puzzle className="w-4 h-4" />
          插件市场
        </button>
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#555872] uppercase tracking-wider">项目</span>
            <button 
              onClick={() => setExpanded(!expanded)}
              className="text-[#555872] hover:text-[#8B8FA3]"
            >
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
        
        {expanded && (
          <div className="px-1">
            <div className="flex items-center gap-2 px-3 py-2 text-[#8B8FA3]">
              <Folder className="w-4 h-4" />
              <span className="text-sm">omp-desktop</span>
            </div>
            <div className="mt-1 space-y-0.5">
              {views.map((view) => (
                <SessionItem
                  key={view.id}
                  view={view}
                  selected={view.id === selectedId}
                  onSelect={() => onSelect(view.id)}
                />
              ))}
              {views.length === 0 && (
                <div className="px-3 py-4 text-center text-xs text-[#555872]">
                  暂无会话
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tasks section */}
        <div className="px-3 py-2 mt-2">
          <span className="text-xs text-[#555872] uppercase tracking-wider">任务</span>
        </div>
        <div className="px-3 py-2 text-xs text-[#555872]">
          暂无任务
        </div>
      </div>

      {/* Bottom user area */}
      <div className="p-3 border-t border-[#2A2D3E] flex items-center gap-2">
        <div className="w-8 h-8 bg-[#262940] rounded-full flex items-center justify-center">
          <User className="w-4 h-4 text-[#8B8FA3]" />
        </div>
        <span className="text-sm text-[#E2E4ED] flex-1 truncate">旅行者1860</span>
        <button className="p-1.5 hover:bg-[#1E2030] rounded transition-colors">
          <Settings className="w-4 h-4 text-[#8B8FA3]" />
        </button>
      </div>
    </aside>
  );
}
