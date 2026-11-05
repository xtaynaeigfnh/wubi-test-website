export type RootZone = "pie" | "na" | "heng" | "shu" | "zhe";

/** 86 版键名字。Z 是万能查询键，不占五个字根区。 */
export const WUBI_KEY_ROOTS: Record<string, { name: string; zone: RootZone | "mark" }> = {
  q: { name: "金", zone: "pie" },
  w: { name: "人", zone: "pie" },
  e: { name: "月", zone: "pie" },
  r: { name: "白", zone: "pie" },
  t: { name: "禾", zone: "pie" },
  y: { name: "言", zone: "na" },
  u: { name: "立", zone: "na" },
  i: { name: "水", zone: "na" },
  o: { name: "火", zone: "na" },
  p: { name: "之", zone: "na" },
  a: { name: "工", zone: "heng" },
  s: { name: "木", zone: "heng" },
  d: { name: "大", zone: "heng" },
  f: { name: "土", zone: "heng" },
  g: { name: "一", zone: "heng" },
  h: { name: "目", zone: "shu" },
  j: { name: "日", zone: "shu" },
  k: { name: "口", zone: "shu" },
  l: { name: "田", zone: "shu" },
  m: { name: "山", zone: "shu" },
  x: { name: "纟", zone: "zhe" },
  c: { name: "又", zone: "zhe" },
  v: { name: "女", zone: "zhe" },
  b: { name: "子", zone: "zhe" },
  n: { name: "已", zone: "zhe" },
  z: { name: "查询", zone: "mark" },
};

export interface RootStep {
  letter: string;
  name: string;
  zone: RootZone | "mark";
  stamped: boolean;
}

/** 按编码逐键拆开。只有从第一键连续打对的字根才盖章。 */
export function buildRootSteps(code: string, typed: string): RootStep[] {
  const normalized = code.toLowerCase().replace(/[^a-z]/g, "");
  const prefix = typed.toLowerCase().replace(/[^a-z]/g, "");
  return [...normalized].map((letter, index) => {
    const root = WUBI_KEY_ROOTS[letter];
    const stamped = prefix.startsWith(normalized.slice(0, index + 1));
    return {
      letter,
      name: root?.name ?? letter.toUpperCase(),
      zone: root?.zone ?? "mark",
      stamped,
    };
  });
}
