import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";

export function TopBar() {
  return (
    <header className="h-12 bg-[#0F1117] border-b border-[#2A2D3E] flex items-center justify-between px-4">
      {/* Left: Logo + Navigation */}
      <div className="flex items-center gap-3">
        <div className="w-6 h-6 bg-[#4C8BF5] rounded flex items-center justify-center">
          <span className="text-white text-xs font-bold">O</span>
        </div>
        <button className="p-1.5 hover:bg-[#1E2030] rounded transition-colors" disabled>
          <ArrowLeft className="w-4 h-4 text-[#555872]" />
        </button>
        <button className="p-1.5 hover:bg-[#1E2030] rounded transition-colors" disabled>
          <ArrowRight className="w-4 h-4 text-[#555872]" />
        </button>
      </div>

      {/* Center: Breadcrumb */}
      <div className="text-sm text-[#8B8FA3]">
        <span>omp-desktop</span>
        <span className="mx-2">▸</span>
        <span className="text-[#E2E4ED]">欢迎页</span>
      </div>

      {/* Right: Status + Window controls */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-xs">
          <ShieldCheck className="w-4 h-4 text-[#4ADE80]" />
          <span className="text-[#4ADE80]">已验证</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 bg-[#4ADE80] rounded-full animate-pulse" />
          <span className="text-[#8B8FA3]">已连接</span>
        </div>
        <div className="flex items-center gap-1 ml-2">
          <button className="w-8 h-8 hover:bg-[#1E2030] rounded flex items-center justify-center">
            <span className="text-[#8B8FA3]">─</span>
          </button>
          <button className="w-8 h-8 hover:bg-[#1E2030] rounded flex items-center justify-center">
            <span className="text-[#8B8FA3]">□</span>
          </button>
          <button className="w-8 h-8 hover:bg-[#F06060]/20 rounded flex items-center justify-center">
            <span className="text-[#F06060]">✕</span>
          </button>
        </div>
      </div>
    </header>
  );
}
