const $ = i => document.getElementById(i);
const rs = n => "Rs " + Math.round(n).toLocaleString("en-PK");
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LABEL = { new: "Received", preparing: "Cooking", out: "On the way", delivered: "Delivered", cancelled: "Cancelled" };
const FLOW = ["new", "preparing", "out", "delivered"];
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const api = async (u, o) => { const r = await fetch(u, o), d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "Request failed"); return d; };

let M = [], CFG = { fee: 150, free: 1500, min: 500 }, cart = read("cart", {}), cat = "All", poll = null;
const find = id => M.find(m => m.id == id);
const isOpen = () => new Date().getHours() >= 12;

function toast(t) { const e = $("toast"); e.textContent = t; e.style.display = "block"; clearTimeout(toast.t); toast.t = setTimeout(() => e.style.display = "none", 1800); }
function totals() {
  let sub = 0, n = 0;
  for (const id in cart) { const m = find(id); if (m) { sub += m.p * cart[id]; n += cart[id]; } }
  const fee = !sub || sub >= CFG.free ? 0 : CFG.fee;
  return { sub, n, fee, tot: sub + fee };
}
const sumHTML = t => `<div><span>Subtotal</span><span>${rs(t.sub)}</span></div><div><span>Delivery</span><span>${t.fee ? rs(t.fee) : "Free"}</span></div><div class="tot"><span>Total (cash)</span><span>${rs(t.tot)}</span></div>`;

function drawChips() {
  const cs = ["All", ...new Set(M.map(m => m.c))];
  $("chips").innerHTML = cs.map(c => `<button class="chip" aria-pressed="${c === cat}" data-c="${c}">${c}</button>`).join("");
}
function drawMenu() {
  $("menu").innerHTML = M.filter(m => cat === "All" || m.c === cat).map(m =>
    `<article class="item"><div class="pic" aria-hidden="true">${m.e}</div><div class="body">${m.t ? `<span class="tag">${m.t}</span>` : ""}<h3>${esc(m.n)}</h3><p>${esc(m.d)}</p><div class="row"><span class="price">${rs(m.p)}</span><button class="add" data-add="${m.id}">Add</button></div></div></article>`).join("");
}
function drawCart() {
  write("cart", cart);
  const t = totals();
  $("cnt").textContent = t.n;
  $("fab").className = "fab" + (t.n ? " on" : "");
  $("fabN").textContent = t.n + (t.n === 1 ? " item" : " items") + " · View cart";
  $("fabT").textContent = rs(t.sub);
  let h = "";
  for (const id in cart) { const m = find(id); if (m) h += `<div class="line"><b>${esc(m.n)}<br><small>${rs(m.p)}</small></b><div class="q"><button data-m="${id}" aria-label="Remove one">−</button><span>${cart[id]}</span><button data-p="${id}" aria-label="Add one">+</button></div></div>`; }
  $("lines").innerHTML = h || '<div class="empty">Your cart is empty. Add a biryani to start.</div>';
  const short = t.sub > 0 && t.sub < CFG.min;
  $("sum").innerHTML = sumHTML(t)
    + (short ? `<div class="err">Add ${rs(CFG.min - t.sub)} more to reach the Rs ${CFG.min} minimum.</div>` : "")
    + (!isOpen() ? '<div class="err">We are closed now. Orders open at 12 PM.</div>' : "")
    + `<button class="go" id="toChk" ${t.sub < CFG.min || !isOpen() ? "disabled" : ""}>Go to checkout</button>`;
  $("chkSum").innerHTML = sumHTML(t);
}
function show(id) {
  ["cart", "chk", "trk"].forEach(a => $(a).classList.toggle("on", a === id));
  $("shade").classList.toggle("on", !!id);
  clearInterval(poll);
  if (id === "trk") { tracker(); poll = setInterval(tracker, 10000); }
}
async function tracker() {
  const my = read("my", []);
  if (!my.length) { $("trkBody").innerHTML = '<div class="empty">No orders on this device yet.</div>'; return; }
  const rows = await Promise.all(my.map(o => api(`/api/track?id=${o.id}&phone=${o.phone}`).catch(() => null)));
  $("trkBody").innerHTML = rows.filter(Boolean).map(o => {
    const at = FLOW.indexOf(o.status);
    const steps = o.status === "cancelled" ? '<div class="err">This order was cancelled. Please call us.</div>'
      : `<div class="track">${FLOW.map((s, i) => `<span class="${i <= at ? "d" : ""}">${LABEL[s]}</span>`).join("")}</div>`;
    return `<div class="box"><b>${o.id}</b> · ${rs(o.total)} cash on delivery<br><small>${new Date(o.created).toLocaleString("en-PK")}</small>${steps}</div>`;
  }).join("");
}

document.addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.c) { cat = b.dataset.c; drawChips(); drawMenu(); }
  if (b.dataset.add) { cart[b.dataset.add] = (cart[b.dataset.add] || 0) + 1; drawCart(); toast("Added to cart"); }
  if (b.dataset.p) { cart[b.dataset.p]++; drawCart(); }
  if (b.dataset.m) { if (--cart[b.dataset.m] <= 0) delete cart[b.dataset.m]; drawCart(); }
  if (b.id === "toChk") show("chk");
  if (b.hasAttribute("data-close")) show(null);
});
$("cartBtn").onclick = $("fab").onclick = () => show("cart");
$("trackBtn").onclick = () => show("trk");
$("shade").onclick = () => show(null);
document.addEventListener("keydown", e => { if (e.key === "Escape") show(null); });

$("form").onsubmit = async e => {
  e.preventDefault();
  const ph = $("ph").value.replace(/[\s-]/g, "").replace(/^\+92/, "0");
  if ($("nm").value.trim().length < 2) return $("err").textContent = "Enter your full name.";
  if (!/^03\d{9}$/.test(ph)) return $("err").textContent = "Enter a valid mobile number, like 03322930638.";
  if ($("ad").value.trim().length < 10) return $("err").textContent = "Enter a full address with house, street and area.";
  $("err").textContent = ""; $("place").disabled = true;
  try {
    const o = await api("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: $("nm").value, phone: ph, address: $("ad").value, note: $("nt").value, items: Object.keys(cart).map(id => ({ id, q: cart[id] })) }) });
    write("my", [{ id: o.id, phone: o.phone }, ...read("my", [])].slice(0, 10));
    cart = {}; drawCart(); $("form").reset(); show("trk"); toast("Order " + o.id + " placed");
  } catch (er) { $("err").textContent = er.message; }
  $("place").disabled = false;
};

(async function init() {
  const s = $("status"), o = isOpen();
  s.className = o ? "open" : "closed"; s.textContent = o ? "Open now" : "Closed · opens 12 PM";
  try { const d = await api("/api/menu"); M = d.items; CFG = d; }
  catch (er) { $("menu").innerHTML = '<div class="empty">Menu could not load. Start the server with: node server.js</div>'; return; }
  drawChips(); drawMenu(); drawCart();
})();
