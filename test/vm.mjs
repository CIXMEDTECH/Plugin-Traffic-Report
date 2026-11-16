// Load the plugin script the way the panel does, with a stand-in for `vespera`,
// so its top-level functions can be tested on their own. Scripts run in one
// context share their top-level bindings, as in the panel's QuickJS VM.
import fs from "node:fs";
import vm from "node:vm";

export function loadPlugin(overrides = {}) {
  const stub = {
    cron() {},
    route() {},
    on() {},
    log: { debug() {}, info() {}, warn() {}, error() {} },
    plugin: { id: "x", version: "0.0.0" },
    time: { now: () => ({ ts: 1795000000, year: 2026, month: 11, day: 16, hour: 9, minute: 5, offset_min: 480 }) },
    ...overrides,
  };
  const ctx = vm.createContext({ setTimeout: () => 0, setInterval: () => 0, clearTimeout() {}, clearInterval() {} });
  ctx.require = () => stub;
  ctx.vespera = stub;
  const script = fs.readFileSync(new URL("../main.js", import.meta.url), "utf8");
  vm.runInContext(script, ctx, { filename: "main.js" });
  return (code) => vm.runInContext(code, ctx);
}
