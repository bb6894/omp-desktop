/** Format a date string into Chinese-friendly relative format */
export function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "刚刚";
  if (diffMins < 60) return `${diffMins}分钟前`;
  if (diffHours < 24) {
    const h = date.getHours();
    const m = date.getMinutes().toString().padStart(2, '0');
    return `今天 ${h}:${m}`;
  }
  if (diffDays === 1) {
    const h = date.getHours();
    const m = date.getMinutes().toString().padStart(2, '0');
    return `昨天 ${h}:${m}`;
  }
  if (diffDays < 7) {
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const h = date.getHours();
    const m = date.getMinutes().toString().padStart(2, '0');
    return `${weekdays[date.getDay()]} ${h}:${m}`;
  }
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}月${day}日`;
}
