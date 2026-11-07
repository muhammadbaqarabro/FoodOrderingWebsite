// Data Biryani server. No npm install needed. Run: node server.js
const http = require("http"), fs = require("fs"), path = require("path");
const PORT = process.env.PORT || 5000;
const PASS = process.env.ADMIN_PASS || "admin123"; // CHANGE THIS before going live
const PUB = path.join(__dirname, "public"), DBF = path.join(__dirname, "data", "db.json");
const FEE = 150, FREE = 1500, MIN = 500;
// p = selling price, k = your cost to make it. Edit to your real numbers.
const MENU = [
  { id: 1, n: "Chicken Biryani", c: "Biryani", p: 420, k: 250, e: "🍛", img: "https://th.bing.com/th/id/OIP.RP4QPyTYAxRZ4_JKmcRz3AHaHa?w=198&h=198&c=7&r=0&o=7&dpr=1.1&pid=1.7&rm=3", d: "Classic masala rice with juicy chicken and potato.", t: "Bestseller" },
  { id: 2, n: "Sada Biryani", c: "Biryani", p: 300, k: 170, e: "🍛", img: "assets/sada-biryani.jpg", d: "Plain biryani rice, lightly spiced, no meat." },
  { id: 3, n: "Beef Pulao", c: "Pulao", p: 450, k: 280, e: "🍚", img: "assets/beef-pulao.jpg", d: "Tender beef cooked into fragrant yakhni rice." },
  { id: 4, n: "Sada Pulao", c: "Pulao", p: 280, k: 150, e: "🍚", img: "assets/sada-pulao.jpg", d: "Mild, light pulao rice. Pairs well with raita." },
  { id: 5, n: "Raita", c: "Beverages", p: 60, k: 25, e: "🥣", img: "assets/raita.jpg", d: "Fresh yoghurt with cucumber and mint." },
  { id: 6, n: "Fizz", c: "Beverages", p: 80, k: 55, e: "🥤", img: "assets/fizz.jpg", d: "Chilled fizzy drink, 345 ml." },
  { id: 7, n: "Cola", c: "Beverages", p: 80, k: 55, e: "🥤", img: "assets/cola.jpg", d: "Chilled cola, 345 ml." }
];
let db = { seq: 0, orders: [], expenses: [] };
try { db = JSON.parse(fs.readFileSync(DBF, "utf8")); } catch (e) { fs.mkdirSync(path.dirname(DBF), { recursive: true }); }
const save = () => { fs.writeFileSync(DBF + ".tmp", JSON.stringify(db)); fs.renameSync(DBF + ".tmp", DBF); };
const send = (r, c, b) => { r.writeHead(c, { "Content-Type": "application/json" }); r.end(JSON.stringify(b)); };
const body = q => new Promise(res => { let s = ""; q.on("data", d => { s += d; if (s.length > 1e5) q.destroy(); }); q.on("end", () => { try { res(JSON.parse(s || "{}")); } catch (e) { res({}); } }); });
const norm = p => String(p || "").replace(/[\s-]/g, "").replace(/^\+92/, "0");
const day = d => new Date(d).toLocaleDateString("en-CA");
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mp4": "video/mp4", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };

// Prices always come from the server, never from the browser.
function build(items) {
  if (!Array.isArray(items) || !items.length) return null;
  const out = []; let sub = 0, cost = 0;
  for (const i of items) {
    const m = MENU.find(x => x.id === +i.id), q = Math.floor(+i.q);
    if (!m || !(q >= 1 && q <= 50)) return null;
    out.push({ id: m.id, n: m.n, q, p: m.p, k: m.k }); sub += m.p * q; cost += m.k * q;
  }
  return { items: out, sub, cost };
}
function make(src, L, fee, extra) {
  const o = Object.assign({ id: "DB" + String(++db.seq).padStart(4, "0"), source: src, status: "new", items: L.items, sub: L.sub, fee, total: L.sub + fee, cost: L.cost, created: new Date().toISOString(), delivered: null }, extra);
  db.orders.push(o); save(); return o;
}

http.createServer(async (q, r) => {
  const u = new URL(q.url, "http://x"), p = u.pathname, m = q.method;
  try {
    if (p === "/api/menu") return send(r, 200, { items: MENU.map(({ k, ...x }) => x), fee: FEE, free: FREE, min: MIN });
    if (p === "/api/orders" && m === "POST") {
      const b = await body(q), L = build(b.items), ph = norm(b.phone);
      if (!L) return send(r, 400, { error: "Your cart has invalid items." });
      if (!String(b.name || "").trim() || !/^03\d{9}$/.test(ph) || String(b.address || "").trim().length < 10) return send(r, 400, { error: "Check your name, mobile number and full address." });
      if (L.sub < MIN) return send(r, 400, { error: "Minimum order is Rs " + MIN + "." });
      const o = make("online", L, L.sub >= FREE ? 0 : FEE, { name: String(b.name).trim().slice(0, 60), phone: ph, address: String(b.address).trim().slice(0, 200), note: String(b.note || "").slice(0, 120) });
      return send(r, 201, { id: o.id, total: o.total, phone: ph });
    }
    if (p === "/api/track") {
      const o = db.orders.find(x => x.id === u.searchParams.get("id") && x.phone === norm(u.searchParams.get("phone")));
      return o ? send(r, 200, { id: o.id, status: o.status, total: o.total, created: o.created }) : send(r, 404, { error: "Order not found" });
    }
    if (p.startsWith("/api/")) {
      if (q.headers["x-admin"] !== PASS) return send(r, 401, { error: "Wrong admin password." });
      if (p === "/api/orders" && m === "GET") return send(r, 200, db.orders.filter(o => o.status !== "delivered" && o.status !== "cancelled" || day(o.delivered || o.created) === day(new Date())).reverse());
      let x = p.match(/^\/api\/orders\/(\w+)$/);
      if (x && m === "PATCH") {
        const o = db.orders.find(v => v.id === x[1]), b = await body(q);
        if (!o || !["new", "preparing", "out", "delivered", "cancelled"].includes(b.status)) return send(r, 400, { error: "Invalid update" });
        o.status = b.status; if (b.status === "delivered") o.delivered = new Date().toISOString();
        save(); return send(r, 200, o);
      }
      if (p === "/api/onsite" && m === "POST") {
        const L = build((await body(q)).items);
        if (!L) return send(r, 400, { error: "Invalid items" });
        const o = make("onsite", L, 0, {}); o.status = "delivered"; o.delivered = o.created; save();
        return send(r, 201, o);
      }
      if (p === "/api/expenses" && m === "POST") {
        const b = await body(q), a = +b.amount;
        if (!String(b.label || "").trim() || !(a > 0)) return send(r, 400, { error: "Enter a label and an amount." });
        db.expenses.push({ date: b.date || day(new Date()), label: String(b.label).slice(0, 60), amount: a }); save();
        return send(r, 201, { ok: true });
      }
      if (p === "/api/report") {
        const d = u.searchParams.get("date") || day(new Date());
        const done = db.orders.filter(o => o.status === "delivered" && day(o.delivered) === d);
        const R = { date: d, online: { n: 0, sales: 0 }, onsite: { n: 0, sales: 0 }, cost: 0, items: {}, pending: db.orders.filter(o => ["new", "preparing", "out"].includes(o.status)).length };
        for (const o of done) {
          R[o.source].n++; R[o.source].sales += o.total; R.cost += o.cost;
          for (const i of o.items) { R.items[i.n] = R.items[i.n] || { q: 0, sales: 0 }; R.items[i.n].q += i.q; R.items[i.n].sales += i.q * i.p; }
        }
        R.sales = R.online.sales + R.onsite.sales;
        R.expenses = db.expenses.filter(e => e.date === d);
        R.expTotal = R.expenses.reduce((s, e) => s + e.amount, 0);
        R.profit = R.sales - R.cost - R.expTotal;
        return send(r, 200, R);
      }
      return send(r, 404, { error: "Not found" });
    }
    const f = path.join(PUB, p === "/" ? "index.html" : decodeURIComponent(p));
    if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end("Not found"); }
    r.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(r);
  } catch (e) { console.error(e); send(r, 500, { error: "Server error" }); }
}).listen(PORT, () => console.log("Data Biryani running: http://localhost:" + PORT + "  Admin: /admin.html"));
