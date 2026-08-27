/**
 * Keybindings registry for OMP Desktop.
 * Each entry maps a key combination to a command handler.
 */

export type KeyBinding = {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  command: string;
  label: string;
  description: string;
};

export const KEY_BINDINGS: KeyBinding[] = [
  {
    key: "n",
    ctrl: true,
    command: "new-session",
    label: "新建会话",
    description: "创建新的会话"
  },
  {
    key: "w",
    ctrl: true,
    command: "close-session",
    label: "关闭会话",
    description: "关闭当前会话"
  },
  {
    key: "p",
    ctrl: true,
    shift: true,
    command: "command-palette",
    label: "命令面板",
    description: "打开命令面板"
  },
  {
    key: "Enter",
    ctrl: true,
    command: "send-message",
    label: "发送消息",
    description: "发送消息（备用快捷键）"
  },
  {
    key: "Escape",
    command: "cancel",
    label: "取消",
    description: "取消当前操作"
  },
  {
    key: "1",
    ctrl: true,
    command: "switch-tab-1",
    label: "切换至变更面板",
    description: "切换到文件变更面板"
  },
  {
    key: "2",
    ctrl: true,
    command: "switch-tab-2",
    label: "切换至终端面板",
    description: "切换到终端面板"
  },
  {
    key: "3",
    ctrl: true,
    command: "switch-tab-3",
    label: "切换至子Agent面板",
    description: "切换到子Agent面板"
  },
  {
    key: ",",
    ctrl: true,
    command: "open-settings",
    label: "打开设置",
    description: "打开设置页面"
  }
];

export type CommandHandler = (e: KeyboardEvent) => void;

export function createKeybindingRegistry(handlers: Record<string, CommandHandler>) {

  function handleKeyDown(e: KeyboardEvent) {
    // Skip if input is focused
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
      // Allow Ctrl+Enter in textarea
      if (!(e.ctrlKey && e.key === "Enter")) return;
    }

    const binding = KEY_BINDINGS.find((b) => {
      if (b.key.toLowerCase() !== e.key.toLowerCase()) return false;
      if (b.ctrl !== e.ctrlKey) return false;
      if (b.shift !== e.shiftKey) return false;
      if (b.alt !== e.altKey) return false;
      if (b.meta !== e.metaKey) return false;
      return true;
    });

    if (binding && handlers[binding.command]) {
      e.preventDefault();
      handlers[binding.command](e);
    }
  }

  function install() {
    window.addEventListener("keydown", handleKeyDown);
  }

  function uninstall() {
    window.removeEventListener("keydown", handleKeyDown);
  }

  return { install, uninstall };
}

export function getKeyBindingLabel(binding: KeyBinding): string {
  const parts: string[] = [];
  if (binding.ctrl) parts.push("Ctrl");
  if (binding.shift) parts.push("Shift");
  if (binding.alt) parts.push("Alt");
  if (binding.meta) parts.push("⌘");
  parts.push(binding.key.toUpperCase());
  return parts.join("+");
}
