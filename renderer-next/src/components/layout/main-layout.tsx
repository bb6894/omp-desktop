import { useState } from "react";
import { TopBar } from "./topbar";
import { SideBar } from "./sidebar";
import { BottomBar } from "./bottombar";
import type { SessionViewData } from "../../lib/session-lifecycle";

interface MainLayoutProps {
  children: React.ReactNode;
  views?: readonly SessionViewData[];
  selectedId?: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
}

export function MainLayout({ 
  children, 
  views = [], 
  selectedId, 
  onSelectSession,
  onNewSession 
}: MainLayoutProps) {
  const rightPanelOpen = true;
  
  return (
    <div className="h-screen w-screen flex flex-col bg-[#0F1117] overflow-hidden">
      <TopBar />
      
      <div className="flex-1 flex overflow-hidden">
        <SideBar 
          views={views}
          selectedId={selectedId}
          onSelect={onSelectSession}
          onNewSession={onNewSession}
        />
        
        <main className="flex-1 flex flex-col overflow-hidden bg-[#0F1117]">
          {children}
        </main>
        
        {/* Right panel placeholder - will be implemented in Phase 5 */}
        {rightPanelOpen && (
          <aside className="w-[360px] bg-[#161822] border-l border-[#2A2D3E] flex flex-col">
            <div className="flex border-b border-[#2A2D3E]">
              {["详情", "变更", "预览"].map((tab) => (
                <button
                  key={tab}
                  className="flex-1 py-3 text-sm text-[#8B8FA3] hover:text-white transition-colors border-b-2 border-transparent hover:border-[#4C8BF5]"
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="flex-1 p-4 text-sm text-[#555872]">
              右侧面板内容区域
            </div>
          </aside>
        )}
      </div>
      
      <BottomBar />
    </div>
  );
}
