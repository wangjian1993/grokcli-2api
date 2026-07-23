/**
 * 品牌资源路径（public/ 下）。
 * - logo.png：不透明白底，用于左上角品牌
 * - avatar.png：透明底，用于右上角个人头像
 * 拼接 VITE_BASE，并带 cache-bust，避免浏览器沿用旧图。
 */
function assetUrl(
  file: 'logo.png' | 'avatar.png',
  query?: Record<string, string | number | undefined>,
): string {
  const base = (import.meta.env.VITE_BASE || '/').replace(/\/?$/, '/');
  const version =
    import.meta.env.VITE_APP_VERSION ||
    import.meta.env.VITE_BUILD_TIME ||
    '3';
  const params = new URLSearchParams({ v: String(version) });
  if (query) {
    for (const [k, val] of Object.entries(query)) {
      if (val !== undefined && val !== '') params.set(k, String(val));
    }
  }
  return `${base}${file}?${params.toString()}`.replace(/([^:]\/)\/+/g, '$1');
}

/** 左上角品牌 logo（不透明） */
export function projectLogoUrl(
  query?: Record<string, string | number | undefined>,
): string {
  return assetUrl('logo.png', query);
}

/** 右上角个人头像（透明底） */
export function projectAvatarUrl(
  query?: Record<string, string | number | undefined>,
): string {
  return assetUrl('avatar.png', query);
}
