import { readFile } from "node:fs/promises";
import { transpileModule, JsxEmit, ScriptTarget } from "typescript";
import * as metrics from "../../app/typing-metrics.ts";
import * as rhythm from "../../app/rhythm-lab.ts";

// Execute the real component handlers with a deterministic clock and hook host.
// This checks event ordering; it does not emulate an OS input method or layout.
export async function createAdvancedPracticeHarness(text = "甲乙丙") {
  const source = await readFile(new URL("../../app/components/AdvancedCenter.tsx", import.meta.url), "utf8");
  const component = source.slice(source.indexOf("function AdvancedPractice("), source.indexOf("\nfunction targetForSeason("));
  const compiled = transpileModule(component, {
    compilerOptions: { jsx: JsxEmit.React, target: ScriptTarget.ES2022 },
  }).outputText;
  const slots = [];
  let cursor = 0;
  let now = 0;
  let tree;
  let effects = [];
  const listeners = new Map();
  const timers = new Map();
  const sessions = [];
  const keys = [];
  let sounds = 0;
  let focused = 0;
  let nextTimer = 0;
  const input = { value: "", focus() { focused += 1; } };
  const document = {
    visibilityState: "visible",
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name) => listeners.delete(name),
  };
  const deps = {
    ...metrics, ...rhythm,
    React: { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }) },
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      return slots[index] ??= { current: initial };
    },
    useMemo: (callback) => callback(),
    useCallback: (callback) => callback,
    useEffect(callback, dependencies) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || dependencies.some((dep, i) => dep !== previous.dependencies[i])) {
        effects.push(() => { previous?.cleanup?.(); slots[index] = { dependencies, cleanup: callback() }; });
      }
    },
    usePendingSaveGuard() {},
    performance: { now: () => now },
    document,
    window: {
      setTimeout(callback) { timers.set(++nextTimer, callback); return nextTimer; },
      clearTimeout(id) { timers.delete(id); },
    },
    createLocalId: () => "test-session",
    recordKeyUsage: (code) => keys.push(code),
  };
  const Component = new Function(...Object.keys(deps), `${compiled}\nreturn AdvancedPractice;`)(...Object.values(deps));
  function find(node, predicate) {
    if (!node || typeof node !== "object") return null;
    if (predicate(node)) return node;
    for (const child of (node.children ?? []).flat(Infinity)) {
      const result = find(child, predicate);
      if (result) return result;
    }
    return null;
  }
  function render() {
    cursor = 0;
    effects = [];
    tree = Component({
      target: { id: "test", title: "测试", text, type: "rhythm" },
      playKeySound: () => { sounds += 1; },
      onSave: (session) => { sessions.push(session); return true; },
      onComplete() {}, onCancel() {},
    });
    const textarea = find(tree, (node) => node.type === "textarea");
    textarea.props.ref.current = input;
    input.value = textarea.props.value;
    effects.forEach((effect) => effect());
  }
  render();
  return {
    sessions, keys,
    get sounds() { return sounds; },
    get focused() { return focused; },
    get value() { return input.value; },
    at(value) { now = value; },
    input(eventName, value, nativeEvent = {}) {
      const textarea = find(tree, (node) => node.type === "textarea");
      if (value !== undefined) input.value = value;
      textarea.props[eventName]({ target: input, currentTarget: input, nativeEvent });
      render();
    },
    key(key = "a", code = "KeyA", options = {}) {
      find(tree, (node) => node.type === "textarea").props.onKeyDown({ key, code, nativeEvent: {}, ...options });
      render();
    },
    pause() {
      find(tree, (node) => node.type === "button" && "aria-pressed" in node.props).props.onClick();
      render();
    },
    visibility(state) { document.visibilityState = state; listeners.get("visibilitychange")(); render(); },
    flush() { for (const [id, callback] of [...timers]) { timers.delete(id); callback(); render(); } },
  };
}
