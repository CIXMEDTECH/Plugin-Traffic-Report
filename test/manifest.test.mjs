import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const PERMISSIONS = ["nodes", "nodes:ip", "nodes:billing", "events", "events:security", "notify", "http", "http:private", "routes", "routes:public"];
const here = (p) => new URL(`../${p}`, import.meta.url);

// The same checks the panel makes when it installs the package.
test("the manifest is one the panel accepts", () => {
  const m = JSON.parse(fs.readFileSync(here("vespera-plugin.json"), "utf8"));
  assert.match(m.id, /^[a-z0-9][a-z0-9_-]{0,31}$/);
  assert.ok(m.name && (typeof m.name === "string" || Object.values(m.name).some((s) => s.trim())));
  assert.match(m.version, /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);
  assert.ok(fs.existsSync(here(m.entry || "main.js")), "the script is there");
  for (const p of m.permissions || []) assert.ok(PERMISSIONS.includes(p), `unknown permission ${p}`);
  if ((m.http || []).length) assert.ok(m.permissions.includes("http"));
  if ((m.public_routes || []).length) assert.ok(m.permissions.includes("routes:public"));
  for (const r of m.public_routes || []) assert.ok(r.startsWith("/"));
  for (const page of m.pages || []) {
    assert.match(page.file, /^ui\/.*\.html$/);
    assert.ok(fs.existsSync(here(page.file)), `${page.file} is there`);
  }
  if (m.vespera) assert.match(m.vespera, /^>=\s*\d+\.\d+\.\d+/);
});
