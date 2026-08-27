import { useState } from "react";
import { 
  RefreshCw, RotateCcw, FileCode, GitCommit, 
  Clock, Cpu, Layers, AlertCircle
} from "lucide-react";

interface RightPanelProps {
  sessionId?: string;
}

export function RightPanel({ sessionId }: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<"detail" | "changes" | "preview">("detail");

  return (
    <aside className="w-[360px] bg-[#161822] border-l border-[#2A2D3E] flex flex-col">
      {/* Tabs */}
      <div className="flex border-b border-[#2A2D3E]">
        {(["detail", "changes", "preview"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 text-sm font-medium transition-all duration-200 ${
              activeTab === tab
                ? "text-white border-b-2 border-[#4C8BF5]"
                : "text-[#8B8FA3] hover:text-white"
            }`}
          >
            {tab === "detail" ? "详情" : tab === "changes" ? "变更" : "预览"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
        {activeTab === "detail" && <DetailTab sessionId={sessionId} />}
        {activeTab === "changes" && <ChangesTab />}
        {activeTab === "preview" && <PreviewTab />}
      </div>
    </aside>
  );
}

function DetailTab({ sessionId }: { sessionId?: string }) {
  return (
    <div className="space-y-4">
      {/* Session info */}
      <div className="bg-[#1E2030] rounded-xl p-4">
        <h3 className="text-sm font-medium text-[#E2E4ED] mb-3">会话信息</h3>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-[#8B8FA3]">创建时间</span>
            <span className="text-[#E2E4ED] font-mono">2026-08-27 22:30</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#8B8FA3]">模型</span>
            <span className="text-[#E2E4ED] font-mono">agnes-2.5-flash</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#8B8FA3]">Token 用量</span>
            <span className="text-[#E2E4ED] font-mono">12.4K / 200K</span>
          </div>
        </div>
      </div>

      {/* Context usage */}
      <div className="bg-[#1E2030] rounded-xl p-4">
        <h3 className="text-sm font-medium text-[#E2E4ED] mb-3">上下文占用</h3>
        <div className="flex items-center gap-4">
          <div className="relative w-16 h-16">
            <svg className="w-full h-full" viewBox="0 0 36 36">
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="#2A2D3E"
                strokeWidth="3"
              />
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="#4C8BF5"
                strokeWidth="3"
                strokeDasharray="6.2, 100"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs font-mono text-[#E2E4ED]">6%</span>
            </div>
          </div>
          <div className="flex-1 text-xs text-[#8B8FA3]">
            <div>已使用 12.4K tokens</div>
            <div className="mt-1">剩余 187.6K</div>
          </div>
        </div>
      </div>

      {/* Event timeline */}
      <div className="bg-[#1E2030] rounded-xl p-4">
        <h3 className="text-sm font-medium text-[#E2E4ED] mb-3">事件时间线</h3>
        <div className="space-y-3">
          {[
            { icon: Clock, color: "text-[#4C8BF5]", label: "会话开始", time: "22:30" },
            { icon: Layers, color: "text-[#4ADE80]", label: "收到回复", time: "22:31" },
            { icon: AlertCircle, color: "text-[#E5A04C]", label: "等待审批", time: "22:32" },
          ].map((event, i) => (
            <div key={i} className="flex items-center gap-3">
              <event.icon className={`w-4 h-4 ${event.color}`} />
              <div className="flex-1">
                <div className="text-sm text-[#E2E4ED]">{event.label}</div>
                <div className="text-xs text-[#555872]">{event.time}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChangesTab() {
  const changes = [
    { file: "src/app.tsx", additions: 12, deletions: 3, status: "modified" },
    { file: "src/styles.css", additions: 45, deletions: 0, status: "added" },
    { file: "README.md", additions: 0, deletions: 2, status: "modified" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-[#E2E4ED]">工作区变更</h3>
        <button className="p-1.5 hover:bg-[#1E2030] rounded transition-colors">
          <RefreshCw className="w-4 h-4 text-[#8B8FA3]" />
        </button>
      </div>

      <div className="space-y-2">
        {changes.map((change, i) => (
          <div key={i} className="bg-[#1E2030] rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-[#4C8BF5]" />
                <span className="text-sm font-mono text-[#E2E4ED]">{change.file}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[#4ADE80]">+{change.additions}</span>
                <span className="text-[#F06060]">−{change.deletions}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button className="w-full py-2 border border-[#F06060] text-[#F06060] rounded-lg text-sm hover:bg-[#F06060]/10 transition-colors flex items-center justify-center gap-2">
        <RotateCcw className="w-4 h-4" />
        全部回滚
      </button>
    </div>
  );
}

function PreviewTab() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <div className="w-16 h-16 bg-[#1E2030] rounded-full flex items-center justify-center mb-4">
        <GitCommit className="w-8 h-8 text-[#555872]" />
      </div>
      <p className="text-sm text-[#8B8FA3] mb-2">没有可预览的内容</p>
      <p className="text-xs text-[#555872]">执行文件操作后，预览将在此显示</p>
    </div>
  );
}
