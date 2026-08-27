
import { 
  Copy, ThumbsUp, ThumbsDown, Share2, 
  Terminal, CheckCircle, XCircle, RotateCcw
} from "lucide-react";

interface MessageCardProps {
  entry: {
    kind: "user" | "assistant" | "tool";
    id: string;
    text: string;
    createdAt?: string;
    streaming?: boolean;
    toolName?: string;
    status?: "running" | "ok" | "error";
    output?: string;
    truncated?: boolean;
    code?: string | null;
    language?: string | null;
  };
}

export function MessageCard({ entry }: MessageCardProps) {
  
  

  // User message
  if (entry.kind === "user") {
    return (
      <div className="flex justify-end">
        <div className="bg-[#1E2030] rounded-xl p-4 border-l-2 border-[#4C8BF5] max-w-[80%]">
          <p className="text-sm text-[#E2E4ED] whitespace-pre-wrap">{entry.text}</p>
          {entry.createdAt && (
            <span className="text-xs text-[#555872] mt-2 block text-right font-mono">
              {new Date(entry.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
      </div>
    );
  }

  // AI response
  if (entry.kind === "assistant") {
    return (
      <div className="flex flex-col">
        <div className="border-l-2 border-[#2A2D3E] pl-4 py-2">
          <div className="prose prose-invert prose-sm max-w-none">
            <p className="text-[#E2E4ED] whitespace-pre-wrap">
              {entry.text}
              {entry.streaming && <span className="inline-block w-0.5 h-4 bg-[#4C8BF5] animate-pulse ml-0.5" />}
            </p>
          </div>
        </div>
        
        {/* Action bar */}
        <div className="flex items-center gap-3 mt-2 pl-4">
          <button className="p-1 hover:bg-[#1E2030] rounded transition-colors">
            <Copy className="w-3.5 h-3.5 text-[#555872]" />
          </button>
          <button className="p-1 hover:bg-[#1E2030] rounded transition-colors">
            <ThumbsUp className="w-3.5 h-3.5 text-[#555872]" />
          </button>
          <button className="p-1 hover:bg-[#1E2030] rounded transition-colors">
            <ThumbsDown className="w-3.5 h-3.5 text-[#555872]" />
          </button>
          <button className="p-1 hover:bg-[#1E2030] rounded transition-colors">
            <Share2 className="w-3.5 h-3.5 text-[#555872]" />
          </button>
          {entry.createdAt && (
            <span className="text-xs text-[#555872] font-mono ml-auto">
              {new Date(entry.createdAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })} {new Date(entry.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Tool execution
  if (entry.kind === "tool") {
    const isSuccess = entry.status === "ok";
    const isError = entry.status === "error";
    
    return (
      <div className={`bg-[#0a0b10] rounded-xl p-4 border-l-2 ${
        isSuccess ? "border-[#4ADE80]" : isError ? "border-[#F06060]" : "border-[#E5A04C]"
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Terminal className={`w-4 h-4 ${isSuccess ? "text-[#4ADE80]" : isError ? "text-[#F06060]" : "text-[#E5A04C]"}`} />
            <span className="text-sm font-mono text-[#E2E4ED]">{entry.toolName}</span>
            {entry.status === "running" && (
              <span className="text-xs text-[#E5A04C] animate-pulse">运行中...</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {isSuccess && <CheckCircle className="w-4 h-4 text-[#4ADE80]" />}
            {isError && <XCircle className="w-4 h-4 text-[#F06060]" />}
          </div>
        </div>

        {/* Output */}
        {entry.output && (
          <div className="bg-[#0F1117] rounded-lg p-3 mt-2 max-h-48 overflow-y-auto">
            <pre className="text-xs font-mono text-[#8B8FA3] whitespace-pre-wrap">
              {entry.output}
              {entry.truncated && <span className="text-[#555872]">... (已截断)</span>}
            </pre>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center gap-2 mt-2">
          <button className="text-xs px-2 py-1 rounded-full bg-[#4C8BF5]/20 text-[#4C8BF5] hover:bg-[#4C8BF5]/30 transition-colors">
            在终端分叉继续
          </button>
          {isSuccess && (
            <button className="text-xs px-2 py-1 rounded-full border border-[#2A2D3E] text-[#8B8FA3] hover:text-white transition-colors">
              <RotateCcw className="w-3 h-3 inline mr-1" />
              撤销变更
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}
