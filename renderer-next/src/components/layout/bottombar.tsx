import { ShieldCheck } from "lucide-react";

export function BottomBar() {
  return (
    <footer className="h-8 bg-[#161822] border-t border-[#2A2D3E] flex items-center justify-between px-4">
      <div className="flex items-center gap-3 text-xs text-[#8B8FA3]">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-[#4ADE80]" />
          <span>运行时已验证</span>
        </div>
        <span>·</span>
        <span className="hover:text-[#E2E4ED] cursor-pointer transition-colors">
          3 个子进程受监管
        </span>
      </div>
      
      <div className="flex items-center gap-3 text-xs">
        <span className="px-2 py-0.5 bg-[#4C8BF5]/20 text-[#4C8BF5] rounded-full">
          工作区写
        </span>
        <span className="text-[#555872] font-mono">
          今日 1.2M tokens
        </span>
      </div>
    </footer>
  );
}
