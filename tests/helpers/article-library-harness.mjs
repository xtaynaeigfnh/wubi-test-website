import { readFile } from "node:fs/promises";
import { transpileModule, ScriptTarget } from "typescript";
import * as lib from "../../app/lib.ts";
import * as storage from "../../app/storage.ts";

// Run the real library hook without its loading effects to isolate selection.
export async function createArticleLibraryHarness() {
  const source = await readFile(new URL("../../app/components/views/typing/useArticleLibrary.ts", import.meta.url), "utf8");
  const compiled = transpileModule(source.slice(source.indexOf("export function useArticleLibrary(")).replace("export function", "function"), {
    compilerOptions: { target: ScriptTarget.ES2022 },
  }).outputText;
  const slots = [];
  let cursor = 0;
  let resets = 0;
  const deps = {
    ...lib,
    ...storage,
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
    useEffect() {},
  };
  const hook = new Function(...Object.keys(deps), `${compiled}\nreturn useArticleLibrary;`)(...Object.values(deps));
  function render() {
    cursor = 0;
    return hook({ preferredLength: "short" }, {
      settingsReady: true,
      articleTextRef: { current: null },
      inputRef: { current: null },
      practiceControls: { current: {
        hasPendingSave: () => false,
        resetForArticle() { resets += 1; },
      } },
    });
  }
  return {
    choose(article) { return render().chooseArticle(article, false); },
    get article() { return render().article; },
    get resets() { return resets; },
  };
}
