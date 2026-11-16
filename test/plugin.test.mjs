import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPlugin } from "./vm.mjs";

const evalIn = loadPlugin();

test("periods", () => {
  // (from, to, label) of the period a report sent on a day covers; "none" when none is due.
  const due = (kind, [y, m, d], weeklyOn) =>
    evalIn(`(() => { const p = duePeriod('${kind}', day(${y}, ${m}, ${d}), ${weeklyOn}); return p ? [key(p.from), key(p.to), p.label].join(' ') : 'none'; })()`);
  // 2026-10-19 is a Monday.
  assert.equal(due("daily", [2026, 10, 19], 1), "20261018 20261018 2026-10-18");
  assert.equal(due("weekly", [2026, 10, 19], 1), "20261012 20261018 2026-10-12 ~ 2026-10-18");
  assert.equal(due("weekly", [2026, 10, 20], 1), "none");
  // Weekly on Fridays.
  assert.equal(due("weekly", [2026, 10, 23], 5), "20261016 20261022 2026-10-16 ~ 2026-10-22");
  assert.equal(due("monthly", [2026, 3, 1], 1), "20260201 20260228 2026-02");
  assert.equal(due("monthly", [2026, 3, 2], 1), "none");
  assert.equal(due("monthly", [2026, 1, 1], 1), "20251201 20251231 2025-12");
  // A leap year, and a day after a month's end.
  assert.equal(due("monthly", [2028, 3, 1], 1), "20280201 20280229 2028-02");
  assert.equal(due("daily", [2026, 3, 1], 1), "20260228 20260228 2026-02-28");
  // Asked for by hand mid-month: the month before.
  assert.equal(evalIn("(() => { const p = lastPeriod('monthly', day(2026, 3, 17)); return key(p.from) + ' ' + key(p.to); })()"), "20260201 20260228");
  assert.equal(evalIn("String(key(lastPeriod('weekly', day(2026, 10, 21)).from))"), "20261014");
  assert.equal(evalIn("String(lastPeriod('yearly', day(2026, 10, 21)))"), "null");
});

test("report body", () => {
  const gib = 2 ** 30;
  const out = evalIn(`(() => { const l = lines([{name:'a', rx:${gib}, tx:0}, {name:'b', rx:${2 * gib}, tx:${gib}}]); return [l.text.split('\\n')[0], l.rx, l.tx].join('|'); })()`);
  assert.equal(out, `b：↑ 1.00 GiB  ↓ 2.00 GiB  共 3.00 GiB|${3 * gib}|${gib}`);
  assert.ok(evalIn("lines(Array.from({length: 35}, (_, i) => ({name: 'n' + i, rx: i, tx: 0}))).text").endsWith("其余 5 台"));
  assert.equal(evalIn("lines([]).text"), "（无数据）");
  assert.equal(evalIn("[bytes(0), bytes(1023), bytes(1536), bytes(-5)].join(',')"), "0 B,1023 B,1.50 KiB,-5 B");
  // With "all nodes" the list names the ones left out.
  assert.equal(
    evalIn(
      "[selected({all_nodes: true, node_ids: [2]}, 1), selected({all_nodes: true, node_ids: [2]}, 2), " +
        "selected({all_nodes: false, node_ids: [2]}, 2), selected({all_nodes: false, node_ids: [2]}, 1), selected(undefined, 9)].join(',')",
    ),
    "true,false,true,false,true",
  );
});
