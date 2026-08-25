export function CenterEmpty() {
  return (
    <main className="center-empty" aria-label="工作区">
      <div className="center-empty__inner">
        <h1 className="center-empty__title">开始一项任务</h1>
        <p className="center-empty__hint">选择或新建一个项目，告诉 OMP 你需要的结果。</p>
        <div className="center-empty__actions">
          <button type="button" className="button button--primary" disabled>
            打开项目
          </button>
          <button type="button" className="button" disabled>
            新建任务
          </button>
        </div>
      </div>
    </main>
  );
}
