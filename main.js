// Traffic reports: built into Vespera, and written as a plugin like any other. It
// reads its reports from the plugin settings, sums each node's traffic over the
// period with `vespera.traffic.between`, and sends the result with
// `vespera.notify.send`. What it already sent is remembered in `vespera.storage`.
const v = require("vespera");

const KINDS = ["daily", "weekly", "monthly"];
const KIND_NAME = { daily: "日报", weekly: "周报", monthly: "月报" };
const DEFAULT_BODY = "{lines}\n\n合计：↑ {total_tx}  ↓ {total_rx}  共 {total}";
const MAX_LINES = 30;

// ---- dates: plain calendar days in the server's time zone -------------------
const pad = (n) => String(n).padStart(2, "0");
const day = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const plus = (date, days) => new Date(date.getTime() + days * 86400000);
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
/** 20261101: how days are numbered in traffic totals and in markers. */
const key = (d) => d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
/** 1 = Monday ... 7 = Sunday */
const weekday = (d) => ((d.getUTCDay() + 6) % 7) + 1;

/** The latest complete period before `today`: yesterday, the 7 days up to it, or last month. */
function lastPeriod(kind, today) {
  const yesterday = plus(today, -1);
  if (kind === "daily") return { from: yesterday, to: yesterday, label: iso(yesterday) };
  if (kind === "weekly") {
    const from = plus(today, -7);
    return { from, to: yesterday, label: `${iso(from)} ~ ${iso(yesterday)}` };
  }
  if (kind === "monthly") {
    const to = plus(day(today.getUTCFullYear(), today.getUTCMonth() + 1, 1), -1);
    const from = day(to.getUTCFullYear(), to.getUTCMonth() + 1, 1);
    return { from, to, label: iso(from).slice(0, 7) };
  }
  return null;
}

/** The period a report sent on `today` covers, or null when none is due that day. */
function duePeriod(kind, today, weeklyOn) {
  if (kind === "weekly" && weekday(today) !== Math.min(Math.max(weeklyOn, 1), 7)) return null;
  if (kind === "monthly" && today.getUTCDate() !== 1) return null;
  return lastPeriod(kind, today);
}

// ---- the report --------------------------------------------------------------
function bytes(b) {
  const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
  let n = Math.max(0, b), i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return i === 0 ? `${b} B` : `${n.toFixed(2)} ${units[i]}`;
}

/** Lines, largest first, at most MAX_LINES of them, and the totals. */
function lines(rows) {
  rows.sort((a, b) => b.rx + b.tx - (a.rx + a.tx) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const rx = rows.reduce((s, r) => s + r.rx, 0);
  const tx = rows.reduce((s, r) => s + r.tx, 0);
  const out = rows.slice(0, MAX_LINES).map((r) => `${r.name}：↑ ${bytes(r.tx)}  ↓ ${bytes(r.rx)}  共 ${bytes(r.rx + r.tx)}`);
  if (rows.length > MAX_LINES) out.push(`……其余 ${rows.length - MAX_LINES} 台`);
  if (out.length === 0) out.push("（无数据）");
  return { text: out.join("\n"), rx, tx };
}

function selected(sel, id) {
  const ids = (sel && sel.node_ids) || [];
  // With "all nodes", the list holds the ones left out.
  return !sel || sel.all_nodes !== false ? !ids.includes(id) : ids.includes(id);
}

async function build(report, kind, period) {
  const [site, nodes, sums, now] = [await v.site.info(), await v.nodes.list(), await v.traffic.between(key(period.from), key(period.to)), v.time.now()];
  const rows = nodes
    .filter((n) => selected(report.nodes, n.id))
    .map((n) => ({ name: n.name, rx: (sums[n.id] || {}).rx || 0, tx: (sums[n.id] || {}).tx || 0 }));
  const l = lines(rows);
  const vars = {
    period_name: KIND_NAME[kind],
    period: period.label,
    lines: l.text,
    nodes: String(rows.length),
    total_rx: bytes(l.rx),
    total_tx: bytes(l.tx),
    total: bytes(l.rx + l.tx),
    site: site.name,
    time: `${now.date} ${pad(now.hour)}:${pad(now.minute)}`,
  };
  const fill = (tpl) => tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  const custom = (report.template || "").trim();
  return {
    title: `[${site.name}] 📊 流量${vars.period_name} ${vars.period}`,
    body: fill(custom || DEFAULT_BODY),
    data: { kind, period: period.label, rx: l.rx, tx: l.tx },
  };
}

async function send(report, kind, period) {
  const m = await build(report, kind, period);
  await v.notify.send({ event: "traffic_report", channels: report.channels || [], title: m.title, body: m.body, data: m.data });
  return m;
}

// ---- the schedule ------------------------------------------------------------
let checking = false;
async function check() {
  if (checking) return;
  checking = true;
  try {
    const cfg = await v.config.get();
    const now = v.time.now();
    const today = day(now.year, now.month, now.day);
    for (const report of cfg.reports || []) {
      if (report.enabled === false || now.hour < Math.min(Math.max(Number(report.hour) || 0, 0), 23)) continue;
      for (const kind of KINDS) {
        if (!report[kind]) continue;
        const period = duePeriod(kind, today, Number(report.weekday) || 1);
        if (!period) continue;
        // One report per period: the marker is the period's first day.
        const marker = `marker:${report.id}:${kind}`;
        if ((await v.storage.get(marker)) === String(key(period.from))) continue;
        try {
          await send(report, kind, period);
          v.log.info(`sent the ${kind} report "${report.name || report.id}" for ${period.label}`);
        } catch (e) {
          // No channel, or the hourly limit: try again on the next round.
          v.log.warn(`${kind} report "${report.name || report.id}" not sent: ${e.message}`);
          continue;
        }
        await v.storage.set(marker, String(key(period.from)));
      }
    }
  } finally {
    checking = false;
  }
}
v.cron("* * * * *", check);
// Also right after starting, for a report that came due while the panel was down.
setTimeout(check, 3000);

// ---- routes, for the page ----------------------------------------------------
v.route("GET", "/reports", async () => {
  const cfg = await v.config.get();
  return (cfg.reports || []).map((r) => ({ id: r.id, name: r.name || "", enabled: r.enabled !== false, kinds: KINDS.filter((k) => r[k]) }));
});

// The latest complete period of a report, shown or sent on request.
v.route("POST", "/send", async (req) => {
  const { report: id, kind, preview } = req.json() || {};
  const cfg = await v.config.get();
  const report = (cfg.reports || []).find((r) => r.id === id);
  const now = v.time.now();
  const period = lastPeriod(kind, day(now.year, now.month, now.day));
  if (!report || !period) return { status: 400, json: { error: "unknown report or kind" } };
  try {
    const m = preview ? await build(report, kind, period) : await send(report, kind, period);
    return { title: m.title, body: m.body, sent: !preview };
  } catch (e) {
    return { status: 400, json: { error: e.message } };
  }
});
