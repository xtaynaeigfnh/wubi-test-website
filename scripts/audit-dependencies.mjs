import { spawnSync } from "node:child_process";
import { checkParsers } from "./patch-picomatch.mjs";

const paths = checkParsers();
const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["audit", "--include=dev", "--json"], { encoding: "utf8", shell: process.platform === "win32" });
if (result.error) throw result.error;
const report = JSON.parse(result.stdout);
if (report.error || report.auditReportVersion !== 2 || !report.vulnerabilities || ![0, 1].includes(result.status)) {
  throw new Error("Incomplete npm audit: " + (report.error?.summary ?? result.stderr));
}
const findings = Object.values(report.vulnerabilities);
if (findings.length || result.status !== 0) {
  console.log(result.stdout);
  const covered = new Set();
  for (const item of findings) {
    if (item.name === "picomatch" && item.nodes.length && item.nodes.every((p) => paths.includes(p)) &&
        item.via.length && item.via.every((v) => v.url === "https://github.com/advisories/GHSA-fc5q-39xc-vjpf" && v.name === "picomatch")) covered.add(item.name);
  }
  // Accept an indirect entry only when every cause leads to a verified fix.
  for (let i = 0; i < findings.length; i++) {
    for (const item of findings) {
      if (item.via.length && item.via.every((cause) => typeof cause === "string" && covered.has(cause))) covered.add(item.name);
    }
  }
  if (!findings.length || findings.some((item) => !covered.has(item.name))) process.exit(1);
  console.log("GHSA-fc5q-39xc-vjpf: verified patched parsers and dependent findings.");
}
