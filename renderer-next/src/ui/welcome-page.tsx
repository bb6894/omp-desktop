import { useState, useRef } from "react";

const QUICK_ACTIONS = [
  { label: "周报总结", prompt: "帮我写一份本周工作总结报告，包括：1)本周完成的主要工作 2)遇到的问题和解决方案 3)下周工作计划" },
  { label: "报错修复", prompt: "帮我分析这段代码的错误并修复：[请粘贴错误信息]" },
  { label: "PPT制作", prompt: "帮我设计一个PPT大纲，主题是：[请描述主题]" },
  { label: "代码审查", prompt: "请帮我审查以下代码，指出潜在问题并提出改进建议：\n\n" },
  { label: "文档撰写", prompt: "帮我撰写一份技术文档，主题是：[请描述]" },
  { label: "数据分析", prompt: "帮我分析这份数据并生成可视化报告：[请上传文件或粘贴数据]" },
];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return "夜深了，注意休息 🌙";
  if (hour < 12) return "早上好，今天也要加油 ☀️";
  if (hour < 18) return "下午好，记得休息一下 🍵";
  return "晚上好呀，今天辛苦啦 🌆";
}

interface WelcomePageProps {
  onSendMessage: (message: string) => void;
}

export function WelcomePage({ onSendMessage }: WelcomePageProps) {
  const [inputText, setInputText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    if (inputText.trim()) {
      onSendMessage(inputText.trim());
      setInputText("");
    }
  };

  const handleQuickAction = (prompt: string) => {
    onSendMessage(prompt);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Auto-resize textarea
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    const textarea = e.target;
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + "px";
  };

  return (
    <div className="welcome-page">
      <h1 className="welcome-page__greeting">{getGreeting()}</h1>
      
      <div className="welcome-page__input-wrap">
        <textarea
          ref={textareaRef}
          className="welcome-page__input"
          value={inputText}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="有什么可以帮你的？输入消息后按 Enter 发送..."
          rows={3}
        />
      </div>

      <div className="welcome-page__quick-actions">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.label}
            className="welcome-page__action"
            onClick={() => handleQuickAction(action.prompt)}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
