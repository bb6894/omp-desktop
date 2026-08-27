import { useState, useRef, useEffect } from "react";
import { 
  Plus, Send, StopCircle, 
  Shield, Monitor, ChevronDown
} from "lucide-react";

export interface AttachedImage {
  type: "image";
  data: string;
  mimeType: string;
}

interface ComposerProps {
  onSend: (text: string, images?: AttachedImage[]) => void;
  onSteer?: (text: string, images?: AttachedImage[]) => void;
  turnActive?: boolean;
  placeholder?: string;
  showProjectSelector?: boolean;
}

const MAX_IMAGES = 9;

export function Composer({ 
  onSend, 
  onSteer, 
  turnActive = false,
  placeholder = "向 AI 提问，使用 @ 添加上下文，使用 / 选择命令或能力",
  showProjectSelector = false 
}: ComposerProps) {
  const [value, setValue] = useState("");
  const [images, setImages] = useState<AttachedImage[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + "px";
    }
  }, [value]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    const hasContent = trimmed || images.length > 0;
    if (!hasContent || turnActive) return;

    if (turnActive && onSteer) {
      onSteer(trimmed || "📷", images);
    } else {
      onSend(trimmed || "📷", images);
    }
    
    setValue("");
    setImages([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file && images.length < MAX_IMAGES) {
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = reader.result as string;
            setImages(prev => [...prev, { type: "image", data: base64, mimeType: file.type }]);
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleFileUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      const remaining = MAX_IMAGES - images.length;
      files.slice(0, remaining).forEach(file => {
        const reader = new FileReader();
        reader.onload = () => {
          setImages(prev => [...prev, { type: "image", data: reader.result as string, mimeType: file.type }]);
        };
        reader.readAsDataURL(file);
      });
    };
    input.click();
  };

  return (
    <div className={`bg-[#1E2030] rounded-xl border p-3 transition-colors ${
      isFocused ? "border-[#4C8BF5]" : "border-[#2A2D3E]"
    }`}>
      {/* Project selector (optional, only on welcome page) */}
      {showProjectSelector && (
        <div className="flex items-center gap-2 mb-2">
          <button className="flex items-center gap-2 text-sm text-[#8B8FA3] hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-[#262940]">
            <span>📁</span>
            选择项目
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Input area */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder={placeholder}
        className="w-full bg-transparent border-none outline-none resize-none text-sm text-[#E2E4ED] placeholder:text-[#555872] min-h-[40px] max-h-[200px]"
        rows={3}
      />

      {/* Image preview */}
      {images.length > 0 && (
        <div className="flex gap-2 mt-2 flex-wrap">
          {images.map((img, index) => (
            <div key={index} className="relative w-16 h-16 rounded-lg overflow-hidden bg-[#0F1117]">
              <img src={img.data} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => removeImage(index)}
                className="absolute top-0.5 right-0.5 w-5 h-5 bg-[#F06060]/80 rounded-full flex items-center justify-center text-white text-xs hover:bg-[#F06060]"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          {/* Attachment button */}
          <button
            onClick={handleFileUpload}
            disabled={images.length >= MAX_IMAGES}
            className="w-8 h-8 rounded-lg hover:bg-[#262940] flex items-center justify-center transition-colors disabled:opacity-50"
            title={`附加图片（最多 ${MAX_IMAGES} 张）`}
          >
            <Plus className="w-4 h-4 text-[#8B8FA3]" />
          </button>
          
          {/* Permission mode selector */}
          <button className="flex items-center gap-1.5 text-sm text-[#8B8FA3] hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-[#262940]">
            <Shield className="w-4 h-4 text-[#4C8BF5]" />
            工作区写
            <ChevronDown className="w-3 h-3" />
          </button>
          
          {/* Computer control (optional) */}
          <button className="w-8 h-8 rounded-lg hover:bg-[#262940] flex items-center justify-center transition-colors">
            <Monitor className="w-4 h-4 text-[#8B8FA3]" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Model selector */}
          <button className="flex items-center gap-2 text-xs text-[#8B8FA3] hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-[#262940] font-mono">
            <span>Agnes/agnes-2.5-flash</span>
            <span className="px-1.5 py-0.5 bg-[#262940] rounded text-[#555872]">200K</span>
            <ChevronDown className="w-3 h-3" />
          </button>

          {/* Send/Stop button */}
          <button
            onClick={handleSubmit}
            disabled={!value.trim() && images.length === 0 || turnActive}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              turnActive
                ? "bg-[#F06060] hover:bg-[#d44c4c]"
                : "!bg-[#4C8BF5] hover:bg-[#3B7AE0] disabled:bg-[#262940] disabled:opacity-50"
            }`}
          >
            {turnActive ? (
              <StopCircle className="w-4 h-4 text-white" />
            ) : (
              <Send className="w-4 h-4 text-white" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
