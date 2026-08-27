import { Composer } from "../composer/composer";

interface HomePageProps {
  onSendMessage: (message: string) => void;
}

const QUICK_ACTIONS = [
  { label: "周报总结", icon: "📊", prompt: "帮我写一份本周工作总结报告，包括：1)本周完成的主要工作 2)遇到的问题和解决方案 3)下周工作计划" },
  { label: "报错修复", icon: "🐛", prompt: "帮我分析这段代码的错误并修复：[请粘贴错误信息]" },
  { label: "PPT制作", icon: "📑", prompt: "帮我设计一个PPT大纲，主题是：[请描述主题]" },
  { label: "闲时任务", icon: "⏰", prompt: "帮我处理一些零散的任务：[请描述任务]" },
];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return "夜深了，注意休息 🌙";
  if (hour < 12) return "早上好，今天也要加油 ☀️";
  if (hour < 18) return "下午好，记得休息一下 🍵";
  return "晚上好呀，今天辛苦啦 🌆";
}

export function HomePage({ onSendMessage }: HomePageProps) {
  const handleQuickAction = (prompt: string) => {
    onSendMessage(prompt);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 relative overflow-hidden">
      {/* Background watermark */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
        <span className="text-[200px] font-bold text-[#E2E4ED] opacity-[0.03]">O</span>
      </div>

      <div className="w-full max-w-2xl flex flex-col items-center z-10">
        {/* Greeting */}
        <h1 className="text-2xl font-semibold text-[#E2E4ED] mb-8">
          {getGreeting()}
        </h1>

        {/* Composer */}
        <div className="w-full">
          <Composer 
            onSend={onSendMessage}
            showProjectSelector
            placeholder="向 AI 提问，使用 @ 添加上下文，使用 / 选择命令或能力"
          />
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap gap-2 mt-4 justify-center">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              onClick={() => handleQuickAction(action.prompt)}
              className="px-4 py-2 rounded-full border border-[#2A2D3E] text-sm text-[#8B8FA3] hover:border-[#4C8BF5] hover:text-white transition-all duration-150 flex items-center gap-2"
            >
              <span>{action.icon}</span>
              {action.label}
            </button>
          ))}
        </div>

        {/* Mode hint */}
        <div className="mt-6 text-xs text-[#555872]">
          当前模式：只读 · AI 只会看，不会动你的文件
        </div>
      </div>
    </div>
  );
}
