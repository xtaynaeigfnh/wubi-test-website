import type { SkinId } from "../../types";

const skinTaglines: Partial<Record<SkinId, string>> = {
  neon: " 夜色载速，码上飞驰。",
  letterpress: " 慢慢练，手会记住。",
};

export function AppFooter({ skin }: { skin: SkinId }) {
  return (
    <footer className="site-footer">
      <span><b>86 / OFFLINE</b>{skinTaglines[skin]}</span>
      <span>
        86 版码表来自 Rime 五笔方案（LGPL-3.0） · 记录不会离开当前浏览器
      </span>
    </footer>
  );
}
