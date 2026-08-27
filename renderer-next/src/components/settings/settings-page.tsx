import { useState } from "react";
import { 
  ArrowLeft, Settings as SettingsIcon, Palette, Cube,
  Brain, Bot, Puzzle, Plug, Zap, Terminal, Anchor,
  Globe, Monitor, Database, BarChart3, Lock,
  Switch as SwitchIcon
} from "lucide-react";

type SettingCategory = "general" | "appearance" | "models" | "memory" | "agents" | "plugins" | "mcp" | "skills" | "commands" | "hooks" | "browser" | "computer" | "database" | "stats" | "security";

interface SettingItem {
  id: SettingCategory;
  label: string;
  icon: typeof SettingsIcon;
  group: string;
}

const settingsItems: SettingItem[] = [
  { id: "general", label: "常规", icon: SettingsIcon, group: "基础设置" },
  { id: "appearance", label: "外观", icon: Palette, group: "基础设置" },
  { id: "models", label: "模型设置", icon: Cube, group: "基础设置" },
  { id: "memory", label: "记忆", icon: Brain, group: "Agent 能力" },
  { id: "agents", label: "子智能体", icon: Bot, group: "Agent 能力" },
  { id: "plugins", label: "插件", icon: Puzzle, group: "Agent 能力" },
  { id: "mcp", label: "MCP 服务器", icon: Plug, group: "Agent 能力" },
  { id: "skills", label: "技能", icon: Zap, group: "Agent 能力" },
  { id: "commands", label: "命令", icon: Terminal, group: "Agent 能力" },
  { id: "hooks", label: "钩子", icon: Anchor, group: "Agent 能力" },
  { id: "browser", label: "浏览器控制", icon: Globe, group: "控制" },
  { id: "computer", label: "电脑控制", icon: Monitor, group: "控制" },
  { id: "database", label: "索引库", icon: Database, group: "数据与安全" },
  { id: "stats", label: "使用统计", icon: BarChart3, group: "数据与安全" },
  { id: "security", label: "安全", icon: Lock, group: "数据与安全" },
];

interface SettingsPageProps {
  onBack: () => void;
}

export function SettingsPage({ onBack }: SettingsPageProps) {
  const [activeSetting, setActiveSetting] = useState<SettingCategory>("models");
  const _settings: Record<string, any> = {
    theme: "dark",
    language: "zh-CN",
    autoSave: true,
    notify: true
  };

  const renderContent = () => {
    switch (activeSetting) {
      case "models":
        return <ModelsSettings />;
      case "computer":
        return <ComputerSettings />;
      case "stats":
        return <StatsSettings />;
      default:
        return (
          <div className="flex flex-col items-center justify-center h-64 text-[#555872]">
            <SettingsIcon className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-sm">设置页面</p>
            <p className="text-xs mt-2">此功能正在开发中...</p>
          </div>
        );
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-[#0F1117]">
      {/* Navigation */}
      <div className="w-[220px] bg-[#161822] border-r border-[#2A2D3E] flex flex-col overflow-y-auto scrollbar-thin">
        <div className="p-4 border-b border-[#2A2D3E]">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-[#8B8FA3] hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            返回工作区
          </button>
        </div>

        <div className="p-3">
          <h2 className="text-xl font-semibold text-[#E2E4ED]">设置</h2>
        </div>

        <div className="flex-1 px-2 pb-4">
          {["基础设置", "Agent 能力", "控制", "数据与安全"].map((group) => (
            <div key={group} className="mb-4">
              <div className="px-3 py-2 text-xs text-[#555872] uppercase tracking-wider">
                {group}
              </div>
              <div className="space-y-1">
                {settingsItems
                  .filter((item) => item.group === group)
                  .map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setActiveSetting(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                        activeSetting === item.id
                          ? "bg-[#1E2030] text-white font-medium"
                          : "text-[#8B8FA3] hover:bg-[#1E2030] hover:text-white"
                      }`}
                    >
                      <item.icon className="w-4 h-4" />
                      {item.label}
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {renderContent()}
      </div>
    </div>
  );
}

function ModelsSettings() {
  const [providers] = useState([
    { name: "OpenAI", online: true, models: ["gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"] },
    { name: "Anthropic", online: true, models: ["claude-3-opus", "claude-3-sonnet", "claude-3-haiku"] },
    { name: "Google", online: false, models: ["gemini-pro", "gemini-ultra"] },
  ]);

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#E2E4ED]">模型设置</h1>
        <p className="text-sm text-[#8B8FA3] mt-1">管理自定义模型供应商，配置后可在聊天时选择使用。</p>
      </div>

      <div className="flex gap-6">
        {/* Provider list */}
        <div className="w-[240px] space-y-2">
          {providers.map((provider) => (
            <div
              key={provider.name}
              className="bg-[#1E2030] rounded-lg p-3 flex items-center gap-3 cursor-pointer hover:bg-[#262940] transition-colors"
            >
              <div className={`w-2 h-2 rounded-full ${provider.online ? "bg-[#4ADE80]" : "bg-[#555872]"}`} />
              <span className="text-sm text-[#E2E4ED]">{provider.name}</span>
            </div>
          ))}
          <button className="w-full py-2 border border-dashed border-[#2A2D3E] rounded-lg text-sm text-[#8B8FA3] hover:text-white hover:border-[#4C8BF5] transition-colors">
            + 添加供应商
          </button>
        </div>

        {/* Provider details */}
        <div className="flex-1 bg-[#1E2030] rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-medium text-[#E2E4ED]">OpenAI</h2>
              <span className="px-2 py-0.5 bg-[#4ADE80]/20 text-[#4ADE80] rounded-full text-xs">已启用</span>
            </div>
            <div className="flex items-center gap-2">
              <button className="p-2 hover:bg-[#262940] rounded-lg transition-colors">
                <SettingsIcon className="w-4 h-4 text-[#8B8FA3]" />
              </button>
              <button className="p-2 hover:bg-[#F06060]/20 rounded-lg transition-colors">
                <ArrowLeft className="w-4 h-4 text-[#F06060]" />
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-[#8B8FA3] mb-2">Base URL</label>
              <input
                type="text"
                defaultValue="https://api.openai.com/v1"
                className="w-full bg-[#0F1117] border border-[#2A2D3E] rounded-lg px-3 py-2 text-sm text-[#E2E4ED] font-mono focus:border-[#4C8BF5] outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm text-[#8B8FA3] mb-2">API Key</label>
              <div className="relative">
                <input
                  type="password"
                  defaultValue="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full bg-[#0F1117] border border-[#2A2D3E] rounded-lg px-3 py-2 text-sm text-[#E2E4ED] font-mono focus:border-[#4C8BF5] outline-none transition-colors pr-10"
                />
                <button className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555872] hover:text-[#8B8FA3]">
                  <EyeIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="pt-4 border-t border-[#2A2D3E]">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-[#E2E4ED]">模型列表</span>
                <button className="text-xs text-[#4C8BF5] hover:text-[#3B7AE0]">+ 添加模型</button>
              </div>
              <div className="space-y-2">
                {["gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"].map((model) => (
                  <div key={model} className="flex items-center justify-between bg-[#0F1117] rounded-lg px-3 py-2">
                    <span className="text-sm font-mono text-[#E2E4ED]">{model}</span>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-[#262940] rounded text-xs text-[#555872]">200K</span>
                      <button className="p-1 hover:bg-[#262940] rounded transition-colors">
                        <SettingsIcon className="w-3 h-3 text-[#555872]" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}

function ComputerSettings() {
  const [controls, setControls] = useState({
    screenShare: true,
    mouseControl: false,
    keyboardControl: false,
    fileAccess: true,
  });

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#E2E4ED]">电脑控制</h1>
        <p className="text-sm text-[#8B8FA3] mt-1">配置 AI 对本地计算机的访问权限。</p>
      </div>

      <div className="space-y-3">
        {[
          { key: "screenShare" as const, label: "屏幕共享", desc: "允许 AI 查看您的屏幕内容" },
          { key: "mouseControl" as const, label: "鼠标控制", desc: "允许 AI 控制鼠标移动和点击" },
          { key: "keyboardControl" as const, label: "键盘控制", desc: "允许 AI 输入键盘指令" },
          { key: "fileAccess" as const, label: "文件访问", desc: "允许 AI 读取和写入文件" },
        ].map(({ key, label, desc }) => (
          <div key={key} className="bg-[#1E2030] rounded-xl p-4 flex items-center justify-between">
            <div>
              <div className="font-medium text-[#E2E4ED]">{label}</div>
              <div className="text-sm text-[#8B8FA3] mt-1">{desc}</div>
            </div>
            <button
              onClick={() => setControls(prev => ({ ...prev, [key]: !prev[key] }))}
              className={`w-12 h-6 rounded-full transition-colors ${
                controls[key] ? "bg-[#4C8BF5]" : "bg-[#2A2D3E]"
              }`}
            >
              <div
                className={`w-5 h-5 bg-white rounded-full transition-transform ${
                  controls[key] ? "translate-x-6" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatsSettings() {
  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#E2E4ED]">使用统计</h1>
          <span className="inline-block mt-2 px-3 py-1 bg-[#4C8BF5]/20 text-[#4C8BF5] rounded-full text-xs">
            应用用量
          </span>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {[
          { value: "9.4亿", label: "累计Token数" },
          { value: "1.5亿", label: "峰值Token数" },
          { value: "13h56m", label: "最长聊天时长" },
          { value: "1天", label: "当前连续天数" },
          { value: "10天", label: "最长连续天数" },
        ].map((stat, i) => (
          <div key={i} className="bg-[#1E2030] rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-[#E2E4ED] font-mono">{stat.value}</div>
            <div className="text-xs text-[#8B8FA3] mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Activity heatmap placeholder */}
      <div className="bg-[#1E2030] rounded-xl p-4 mb-6">
        <h3 className="text-sm font-medium text-[#E2E4ED] mb-4">Token 活动热力图</h3>
        <div className="flex gap-1 flex-wrap">
          {Array.from({ length: 84 }).map((_, i) => {
            const intensity = Math.random();
            const color = intensity > 0.7 ? "bg-[#4C8BF5]" : intensity > 0.4 ? "bg-[#4C8BF5]/60" : intensity > 0.2 ? "bg-[#4C8BF5]/30" : "bg-[#2A2D3E]";
            return <div key={i} className={`w-3 h-3 rounded-sm ${color}`} />;
          })}
        </div>
        <div className="flex justify-between mt-2 text-xs text-[#555872]">
          <span>6周前</span>
          <span>今天</span>
        </div>
      </div>
    </div>
  );
}
