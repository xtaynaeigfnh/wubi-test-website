export type Hand = "left" | "right" | "thumb";
export type KeyboardRow = "number" | "upper" | "home" | "lower" | "space";

export interface KeyboardKeyDefinition {
  code: string;
  label: string;
  hand: Hand;
  finger: string;
  row: KeyboardRow;
  width?: number;
  zone?: "撇区" | "捺区" | "横区" | "竖区" | "折区";
}

export type KeyUsageMap = Record<string, number>;

const key = (
  code: string,
  label: string,
  hand: Hand,
  finger: string,
  row: KeyboardRow,
  width?: number,
  zone?: KeyboardKeyDefinition["zone"],
): KeyboardKeyDefinition => ({ code, label, hand, finger, row, width, zone });

export const KEYBOARD_ROWS: KeyboardKeyDefinition[][] = [
  [
    key("Backquote", "`", "left", "左小指", "number"),
    key("Digit1", "1", "left", "左小指", "number"),
    key("Digit2", "2", "left", "左无名指", "number"),
    key("Digit3", "3", "left", "左中指", "number"),
    key("Digit4", "4", "left", "左食指", "number"),
    key("Digit5", "5", "left", "左食指", "number"),
    key("Digit6", "6", "right", "右食指", "number"),
    key("Digit7", "7", "right", "右食指", "number"),
    key("Digit8", "8", "right", "右中指", "number"),
    key("Digit9", "9", "right", "右无名指", "number"),
    key("Digit0", "0", "right", "右小指", "number"),
    key("Minus", "-", "right", "右小指", "number"),
    key("Equal", "=", "right", "右小指", "number"),
    key("Backspace", "退格", "right", "右小指", "number", 2),
  ],
  [
    key("Tab", "Tab", "left", "左小指", "upper", 1.5),
    ..."QWERT".split("").map((letter) =>
      key(`Key${letter}`, letter, "left", {
        Q: "左小指", W: "左无名指", E: "左中指", R: "左食指", T: "左食指",
      }[letter] ?? "左食指", "upper", 1, "撇区"),
    ),
    ..."YUIOP".split("").map((letter) =>
      key(`Key${letter}`, letter, "right", {
        Y: "右食指", U: "右食指", I: "右中指", O: "右无名指", P: "右小指",
      }[letter] ?? "右食指", "upper", 1, "捺区"),
    ),
    key("BracketLeft", "[", "right", "右小指", "upper"),
    key("BracketRight", "]", "right", "右小指", "upper"),
    key("Backslash", "\\", "right", "右小指", "upper", 1.5),
  ],
  [
    key("CapsLock", "Caps", "left", "左小指", "home", 1.8),
    ..."ASDFG".split("").map((letter) =>
      key(`Key${letter}`, letter, "left", {
        A: "左小指", S: "左无名指", D: "左中指", F: "左食指", G: "左食指",
      }[letter] ?? "左食指", "home", 1, "横区"),
    ),
    ..."HJKL".split("").map((letter) =>
      key(`Key${letter}`, letter, "right", {
        H: "右食指", J: "右食指", K: "右中指", L: "右无名指",
      }[letter] ?? "右食指", "home", 1, "竖区"),
    ),
    key("Semicolon", ";", "right", "右小指", "home"),
    key("Quote", "'", "right", "右小指", "home"),
    key("Enter", "回车", "right", "右小指", "home", 2.2),
  ],
  [
    key("ShiftLeft", "Shift", "left", "左小指", "lower", 2.3),
    key("KeyZ", "Z", "left", "左小指", "lower"),
    ..."XCVBN".split("").map((letter) =>
      key(`Key${letter}`, letter, "left", {
        X: "左无名指", C: "左中指", V: "左食指", B: "左食指", N: "右食指",
      }[letter] ?? "左食指", "lower", 1, "折区"),
    ).map((item) => item.code === "KeyN" ? { ...item, hand: "right" as const } : item),
    key("KeyM", "M", "right", "右食指", "lower", 1, "竖区"),
    key("Comma", ",", "right", "右中指", "lower"),
    key("Period", ".", "right", "右无名指", "lower"),
    key("Slash", "/", "right", "右小指", "lower"),
    key("ShiftRight", "Shift", "right", "右小指", "lower", 2.8),
  ],
  [
    key("ControlLeft", "Ctrl", "left", "左小指", "space", 1.4),
    key("AltLeft", "Alt", "left", "左拇指", "space", 1.3),
    key("Space", "空格", "thumb", "拇指", "space", 7),
    key("AltRight", "Alt", "right", "右拇指", "space", 1.3),
    key("ControlRight", "Ctrl", "right", "右小指", "space", 1.4),
  ],
];

export const KEYBOARD_KEYS = KEYBOARD_ROWS.flat();
const TRACKED_CODES = new Set(KEYBOARD_KEYS.map((item) => item.code));

export function normalizeKeyUsage(value: unknown): KeyUsageMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([code, count]) =>
          TRACKED_CODES.has(code) &&
          typeof count === "number" &&
          Number.isInteger(count) &&
          count >= 0 &&
          count <= 1_000_000_000,
      ),
  );
}

export function incrementKeyUsage(
  usage: KeyUsageMap,
  code: string,
): KeyUsageMap {
  if (!TRACKED_CODES.has(code)) return usage;
  return { ...usage, [code]: Math.min(1_000_000_000, (usage[code] ?? 0) + 1) };
}

export function isValidKeyUsage(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length <= KEYBOARD_KEYS.length &&
    entries.every(
      ([code, count]) =>
        TRACKED_CODES.has(code) &&
        typeof count === "number" &&
        Number.isInteger(count) &&
        count >= 0 &&
        count <= 1_000_000_000,
    )
  );
}

export function summarizeKeyUsage(usage: KeyUsageMap) {
  const countFor = (definition: KeyboardKeyDefinition) => usage[definition.code] ?? 0;
  const total = KEYBOARD_KEYS.reduce((sum, item) => sum + countFor(item), 0);
  const activeKeys = KEYBOARD_KEYS.filter((item) => countFor(item) > 0).length;
  const mostUsed = [...KEYBOARD_KEYS].sort((a, b) => countFor(b) - countFor(a))[0];
  const groups = <T extends string>(values: readonly T[], selector: (item: KeyboardKeyDefinition) => T) =>
    values.map((name) => ({
      name,
      count: KEYBOARD_KEYS.filter((item) => selector(item) === name)
        .reduce((sum, item) => sum + countFor(item), 0),
    }));
  const hands = (["left", "right"] as const).map((name) => ({
    name,
    label: name === "left" ? "左手" : "右手",
    count: KEYBOARD_KEYS.filter((item) => item.hand === name)
      .reduce((sum, item) => sum + countFor(item), 0),
  }));
  const rows = (["number", "upper", "home", "lower"] as const).map((name) => ({
    name,
    label: { number: "数字排", upper: "上排", home: "中排", lower: "下排" }[name],
    count: KEYBOARD_KEYS.filter((item) => item.row === name)
      .reduce((sum, item) => sum + countFor(item), 0),
  }));
  const fingerNames = ["左小指", "左无名指", "左中指", "左食指", "左拇指", "拇指", "右拇指", "右食指", "右中指", "右无名指", "右小指"] as const;
  const fingers = groups(fingerNames, (item) => item.finger);
  const zoneNames = ["撇区", "捺区", "横区", "竖区", "折区"] as const;
  const zones = zoneNames.map((name) => ({
    name,
    count: KEYBOARD_KEYS.filter((item) => item.zone === name)
      .reduce((sum, item) => sum + countFor(item), 0),
  }));
  return {
    total,
    activeKeys,
    mostUsed: mostUsed && countFor(mostUsed) > 0
      ? { label: mostUsed.label, count: countFor(mostUsed) }
      : null,
    hands,
    rows,
    fingers: fingers.filter((item) => item.count > 0),
    zones,
  };
}
