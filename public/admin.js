const $ = i => document.getElementById(i);
const rs = n => "Rs " + Math.round(n).toLocaleString("en-PK");
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => new Date().toLocaleDateString("en-CA");
const NEXT = { new: ["preparing", "Start cooking"], preparing: ["out", "Send with rider"], out: ["delivered", "Delivered · cash collected"] };
const LABEL = { new: "New", preparing: "Cooking", out: "On the way", delivered: "Delivered", cancelled: "Cancelled" };
let K = sessionStorage.getItem("k") || "", menu = [], pos = {}, lastNew = -1, timer = null;

const api = async (u, o = {}) => {
  const r = await fetch(u, { ...o, headers: { "Content-Type": "application/json", "x-admin": K } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Request failed");
  return d;
};
function toast(t) { const e = $("toast"); e.textContent = t; e.style.display = "block"; clearTimeout(toast.t); toast.t = setTimeout(() => e.style.display = "none", 1800); }
function beep() { try { const c = new AudioContext(), o = c.createOscillator(); o.connect(c.destination); o.frequency.value = 880; o.start(); o.stop(c.currentTime + .25); } catch (e) {} }

async function login() {
  try {
    await api("/api/orders");
    sessionStorage.setItem("k", K);
    $("login").hidden = true; $("app").hidden = false;
    menu = (await (await fetch("/api/menu")).json()).items;
    drawPos(); loadOrders(); clearInterval(timer); timer = setInterval(loadOrders, 8000);
  } catch (e) { K = ""; $("lerr").textContent = e.message; }
}
$("loginBtn").onclick = () => { K = $("pw").value; login(); };
$("pw").onkeydown = e => { if (e.key === "Enter") $("loginBtn").click(); };
$("out").onclick = () => { sessionStorage.removeItem("k"); location.reload(); };
if (K) login();

async function loadOrders() {
  let list; try { list = await api("/api/orders"); } catch (e) { return; }
  const open = list.filter(o => ["new", "preparing", "out"].includes(o.status));
  const newN = list.filter(o => o.status === "new").length;
  $("newCnt").textContent = newN ? "(" + newN + " new)" : "";
  if (lastNew >= 0 && newN > lastNew) { beep(); toast("New order received"); }
  lastNew = newN;
  const card = o => {
    const n = NEXT[o.status];
    return `<div class="ord s-${o.status}"><div class="top"><b>${o.id} <span class="badge ${o.source}">${o.source === "online" ? "Online" : "On-site"}</span> <span class="badge">${LABEL[o.status]}</span></b><span>${new Date(o.created).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })}</span></div>
    ${o.source === "online" ? `<p><b>${esc(o.name)}</b> · <a href="tel:${esc(o.phone)}">${esc(o.phone)}</a><br>${esc(o.address)}${o.note ? `<br><i>Note: ${esc(o.note)}</i>` : ""}</p>` : ""}
    <p>${o.items.map(i => i.q + "× " + esc(i.n)).join(", ")}</p>
    <b>${rs(o.total)}</b> ${o.source === "online" ? "· cash on delivery" : "· paid at counter"}
    ${n ? `<div class="acts"><button class="btn" data-id="${o.id}" data-s="${n[0]}">${n[1]}</button><button class="btn alt" data-id="${o.id}" data-s="cancelled">Cancel</button></div>` : ""}</div>`;
  };
  const done = list.filter(o => !open.includes(o));
  $("p-orders").innerHTML = (open.length ? open.map(card).join("") : '<div class="empty">No active orders. New orders appear here automatically.</div>')
    + (done.length ? "<h3>Finished today</h3>" + done.map(card).join("") : "");
}
$("p-orders").onclick = async e => {
  const b = e.target.closest("button[data-id]"); if (!b) return;
  if (b.dataset.s === "cancelled" && !confirm("Cancel this order?")) return;
  b.disabled = true;
  try { await api("/api/orders/" + b.dataset.id, { method: "PATCH", body: JSON.stringify({ status: b.dataset.s }) }); loadOrders(); }
  catch (er) { toast(er.message); b.disabled = false; }
};

document.querySelectorAll(".tab").forEach(t => t.onclick = () => {
  document.querySelectorAll(".tab").forEach(x => x.setAttribute("aria-selected", x === t));
  ["orders", "onsite", "report"].forEach(p => $("p-" + p).hidden = p !== t.dataset.t);
  if (t.dataset.t === "report") report();
});

function drawPos() {
  $("pos").innerHTML = menu.map(m => `<div class="box"><span>${esc(m.n)}<br><small>${rs(m.p)}</small></span><div class="q"><button data-m="${m.id}" aria-label="Remove one">−</button> <b>${pos[m.id] || 0}</b> <button data-p="${m.id}" aria-label="Add one">+</button></div></div>`).join("");
  $("posTot").textContent = "Total: " + rs(menu.reduce((s, m) => s + m.p * (pos[m.id] || 0), 0));
}
$("pos").onclick = e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.p) pos[b.dataset.p] = (pos[b.dataset.p] || 0) + 1;
  if (b.dataset.m) pos[b.dataset.m] = Math.max(0, (pos[b.dataset.m] || 0) - 1);
  drawPos();
};
$("posGo").onclick = async () => {
  const items = Object.keys(pos).filter(id => pos[id] > 0).map(id => ({ id, q: pos[id] }));
  if (!items.length) return $("posErr").textContent = "Add at least one item.";
  $("posErr").textContent = "";
  try { await api("/api/onsite", { method: "POST", body: JSON.stringify({ items }) }); pos = {}; drawPos(); toast("On-site sale recorded"); loadOrders(); }
  catch (er) { $("posErr").textContent = er.message; }
};

$("rd").value = today();
$("rd").onchange = report;
$("print").onclick = () => window.print();
async function report() {
  let R; try { R = await api("/api/report?date=" + $("rd").value); } catch (e) { return toast(e.message); }
  const rows = Object.entries(R.items).map(([n, v]) => `<tr><td>${esc(n)}</td><td>${v.q}</td><td>${rs(v.sales)}</td></tr>`).join("");
  $("rep").innerHTML = `<h2>Sales report: ${R.date}</h2>
  <div class="stats">
    <div class="stat"><small>Online sales (${R.online.n} orders)</small><b>${rs(R.online.sales)}</b></div>
    <div class="stat"><small>On-site sales (${R.onsite.n} orders)</small><b>${rs(R.onsite.sales)}</b></div>
    <div class="stat"><small>Total sales</small><b>${rs(R.sales)}</b></div>
    <div class="stat"><small>Food and drink cost</small><b>${rs(R.cost)}</b></div>
    <div class="stat"><small>Expenses</small><b>${rs(R.expTotal)}</b></div>
    <div class="stat profit ${R.profit < 0 ? "loss" : ""}"><small>${R.profit < 0 ? "Loss" : "Profit"} for the day</small><b>${rs(R.profit)}</b></div>
  </div>
  ${R.pending ? `<p class="err">${R.pending} order(s) are still not delivered. They count only after you mark them delivered.</p>` : ""}
  <table><tr><th>Item</th><th>Sold</th><th>Sales</th></tr>${rows || '<tr><td colspan="3">No delivered orders on this date.</td></tr>'}</table>
  ${R.expenses.length ? "<h3>Expenses</h3><table>" + R.expenses.map(x => `<tr><td>${esc(x.label)}</td><td>${rs(x.amount)}</td></tr>`).join("") + "</table>" : ""}`;
}
$("eadd").onclick = async () => {
  $("eerr").textContent = "";
  try { await api("/api/expenses", { method: "POST", body: JSON.stringify({ date: $("rd").value, label: $("el").value, amount: $("ea").value }) }); $("el").value = $("ea").value = ""; report(); }
  catch (er) { $("eerr").textContent = er.message; }
};
