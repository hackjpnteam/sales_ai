// IPアドレスから位置情報を取得
export type GeoInfo = {
  country: string;
  countryCode: string;
  region: string;
  city: string;
};

export async function getGeoFromIP(ip: string): Promise<GeoInfo | null> {
  // ローカルIPやunknownの場合はスキップ
  if (!ip || ip === "unknown" || ip === "::1" || ip.startsWith("127.") || ip.startsWith("192.168.") || ip.startsWith("10.")) {
    return null;
  }

  try {
    // ip-api.com（無料、1分間に45リクエストまで）
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city`, {
      next: { revalidate: 86400 }, // 24時間キャッシュ
    });

    if (!res.ok) return null;

    const data = await res.json();

    if (data.status !== "success") return null;

    return {
      country: data.country || "",
      countryCode: data.countryCode || "",
      region: data.regionName || "",
      city: data.city || "",
    };
  } catch (error) {
    console.error("GeoIP lookup failed:", error);
    return null;
  }
}

// 位置情報を表示用文字列に変換
export function formatGeoLocation(geo: GeoInfo | null): string {
  if (!geo) return "";

  const parts = [];
  if (geo.country) parts.push(geo.country);
  if (geo.region && geo.region !== geo.city) parts.push(geo.region);
  if (geo.city) parts.push(geo.city);

  return parts.join(" / ");
}
