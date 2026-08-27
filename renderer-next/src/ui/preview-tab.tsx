import { useState, useRef } from "react";

const DEFAULT_URL = "http://localhost:3000";

export function PreviewTab() {
  const [url, setUrl] = useState(DEFAULT_URL);
  const [currentUrl, setCurrentUrl] = useState(DEFAULT_URL);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCurrentUrl(url);
  }

  function handleReload() {
    const iframe = iframeRef.current;
    if (iframe) {
      iframe.src = iframe.src;
    }
  }

  return (
    <div className="preview-tab">
      <div className="preview-tab__toolbar">
        <button
          type="button"
          className="preview-tab__btn"
          onClick={() => window.open(currentUrl, "_blank")}
          title="在新窗口打开"
        >
          ↗
        </button>
        <form onSubmit={handleSubmit} className="preview-tab__url-bar">
          <input
            type="url"
            className="preview-tab__input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="输入预览地址..."
          />
          <button type="submit" className="preview-tab__btn" title="导航">
            →
          </button>
          <button
            type="button"
            className="preview-tab__btn"
            onClick={handleReload}
            title="刷新"
          >
            ↻
          </button>
        </form>
      </div>
      <div className="preview-tab__content">
        {currentUrl ? (
          <iframe
            ref={iframeRef}
            src={currentUrl}
            className="preview-tab__iframe"
            sandbox="allow-scripts allow-same-origin allow-forms"
            title="预览"
          />
        ) : (
          <div className="preview-tab__empty">
            <p>启动开发服务器后，预览将在此显示</p>
            <p className="preview-tab__hint">默认地址: {DEFAULT_URL}</p>
          </div>
        )}
      </div>
    </div>
  );
}
