import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";

const require = createRequire(import.meta.url);
const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
const locations = Object.keys(lock.packages).filter((path) => path.endsWith("node_modules/braces"));
assert(locations.length, "review the temporary mitigation when braces leaves the dependency tree");

for (const location of locations) {
  const braces = require(`../${location}`);
  test(`${location} rejects excessive brace and parenthesis nesting before recursive processing`, () => {
    const rejected = { name: "SyntaxError", message: /nesting exceeds the project limit/ };
    for (const [open, close] of [["{", "}"], ["(", ")"], ["{(", ")}"]]) {
      const pattern = open.repeat(2000) + "a,b" + close.repeat(2000);
      for (const run of [braces, braces.parse, braces.compile, braces.expand, braces.stringify]) {
        assert.throws(() => run(pattern), rejected);
      }
      assert.throws(() => braces.parse(open.repeat(2000) + "a"), rejected);
    }
    let ast = { type: "text", value: "a" };
    for (let index = 0; index < 5000; index++) ast = { type: "root", nodes: [ast] };
    for (const run of [braces.compile, braces.expand, braces.stringify]) {
      assert.throws(() => run(ast), rejected);
    }
  });

  test(`${location} preserves normal nested patterns, ranges and escaped literals`, () => {
    assert.deepEqual(braces.expand("app/{components,styles}/**/*.{ts,tsx,css}"), [
      "app/components/**/*.ts", "app/components/**/*.tsx", "app/components/**/*.css",
      "app/styles/**/*.ts", "app/styles/**/*.tsx", "app/styles/**/*.css",
    ]);
    assert.deepEqual(braces.expand("{a,{b,c}}"), ["a", "b", "c"]);
    assert.deepEqual(braces.expand("{1..3}"), ["1", "2", "3"]);
    assert.equal(braces.stringify(braces.parse("src/{a,b}.ts")), "src/{a,b}.ts");
    assert.deepEqual(braces.expand("\\{literal\\}"), ["{literal}"]);
    assert.doesNotThrow(() => braces.compile("{".repeat(32) + "a,b" + "}".repeat(32)));
  });
}
