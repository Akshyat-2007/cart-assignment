'use strict';
// QuickCart business logic. Requirement tags (FR1..FR12, NFR1..NFR3) refer to the report.
const fs = require('fs'), crypto = require('crypto');
class ShopError extends Error { constructor(msg, code = 400) { super(msg); this.code = code; } }

const SEED = [ // id, name, category(type), colour, price, stock
  [1,'Wireless Mouse','Electronics','Black',799,25],[2,'Bluetooth Speaker','Electronics','Blue',2199,10],
  [3,'USB-C Charger 30W','Electronics','White',999,30],[4,'Cotton T-Shirt','Clothing','Red',499,40],
  [5,'Denim Jacket','Clothing','Blue',2499,8],[6,'Running Shoes','Footwear','Black',3299,12],
  [7,'Steel Water Bottle','Home','Silver',350,50],[8,'Desk Lamp','Home','White',1299,15],
  [9,'Notebook Pack (5)','Stationery','Green',275,100],[10,'Backpack 25L','Bags','Black',1599,20]
];
const COUPONS = { SAVE10: { type: 'pct', value: 10 }, FLAT100: { type: 'flat', value: 100, min: 1000 } };
const GST = 0.18, SHIP_FEE = 40, FREE_SHIP_AT = 500;
const STAGES = ['PLACED', 'PACKED', 'SHIPPED', 'DELIVERED'];
const CARE = { phone: '1800-000-0000', email: 'care@quickcart.example', hours: '9 AM - 6 PM' };
const r2 = n => Math.round(n * 100) / 100;
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
const RE = { phone: /^[6-9]\d{9}$/, pin: /^[1-9]\d{5}$/, upi: /^[\w.\-]{2,}@[A-Za-z]{2,}$/, email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ };

class Shop {
  constructor(file = null) {
    this.file = file;
    this.users = new Map(); this.carts = new Map(); this.coupons = new Map(); this.wish = new Map();
    this.orders = []; this.complaints = []; this.nextOrder = 1001; this.nextComplaint = 1; this.nextProduct = 11;
    this.fails = new Map();
    this.products = SEED.map(([id, name, category, color, price, stock]) => ({ id, name, category, color, price, stock }));
    if (file && fs.existsSync(file)) this.load();
    if (!this.users.has('admin')) this._mkUser('admin', 'admin123', 'admin@quickcart.example', '9000000000', 'admin');
  }
  _mkUser(username, password, email, phone, role = 'customer') {
    const salt = crypto.randomBytes(8).toString('hex');
    this.users.set(username, { username, salt, hash: hash(password, salt), email, phone, role, addresses: [], payment: null });
  }
  save() {
    if (!this.file) return;
    fs.writeFileSync(this.file, JSON.stringify({ products: this.products, orders: this.orders, complaints: this.complaints,
      nextOrder: this.nextOrder, nextComplaint: this.nextComplaint, nextProduct: this.nextProduct,
      users: [...this.users.values()], wish: [...this.wish].map(([u, s]) => [u, [...s]]) }));
  }
  load() {
    const d = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    Object.assign(this, { products: d.products, orders: d.orders, complaints: d.complaints || [], nextOrder: d.nextOrder, nextComplaint: d.nextComplaint || 1, nextProduct: d.nextProduct || 11 });
    (d.users || []).forEach(u => this.users.set(u.username, u)); (d.wish || []).forEach(([u, a]) => this.wish.set(u, new Set(a)));
  }
  // ---------- FR1, FR2, FR12 accounts ----------
  register(username, password, email, phone) {
    username = String(username || '').trim();
    if (!/^[A-Za-z0-9_]{3,15}$/.test(username)) throw new ShopError('Username must be 3-15 letters, digits or _');
    if (String(password || '').length < 6) throw new ShopError('Password must be at least 6 characters');
    if (!RE.email.test(String(email || ''))) throw new ShopError('Enter a valid email address');
    if (!RE.phone.test(String(phone || ''))) throw new ShopError('Phone must be 10 digits starting with 6-9');
    if (this.users.has(username)) throw new ShopError('Username already taken', 409);
    this._mkUser(username, password, email, phone); this.save(); return this.me(username);
  }
  login(username, password) {
    const f = this.fails.get(username) || { n: 0, until: 0 };
    if (f.until > Date.now()) throw new ShopError('Too many failed attempts. Try again later', 429);
    const u = this.users.get(String(username));
    if (!u || hash(String(password || ''), u.salt) !== u.hash) {
      f.n++; if (f.n >= 5) { f.until = Date.now() + 60000; f.n = 0; } this.fails.set(username, f);
      throw new ShopError('Invalid username or password', 401);
    }
    this.fails.delete(username); return this.me(username);
  }
  user(name) { const u = this.users.get(name); if (!u) throw new ShopError('Please log in', 401); return u; }
  me(name) { const u = this.user(name); return { username: u.username, role: u.role, email: u.email, phone: u.phone }; }
  admin(name) { if (this.user(name).role !== 'admin') throw new ShopError('Administrator access required', 403); }
  deleteAccount(name, password) {
    const u = this.user(name);
    if (u.role === 'admin') throw new ShopError('The administrator account cannot be deleted');
    if (hash(String(password || ''), u.salt) !== u.hash) throw new ShopError('Password is incorrect', 401);
    this.users.delete(name); this.carts.delete(name); this.wish.delete(name); this.coupons.delete(name);
    this.orders.forEach(o => { if (o.user === name) o.user = '(deleted)'; }); this.save();
  }
  // ---------- FR3, FR4 browse and filter ----------
  product(id) { const p = this.products.find(x => x.id === Number(id)); if (!p) throw new ShopError('No product with id ' + id, 404); return p; }
  search(f = {}) {
    const q = String(f.q || '').trim().toLowerCase(), min = f.min === '' || f.min == null ? 0 : Number(f.min), max = f.max === '' || f.max == null ? Infinity : Number(f.max);
    if (Number.isNaN(min) || Number.isNaN(max) || min < 0 || max < min) throw new ShopError('Invalid price range');
    let r = this.products.filter(p => (!q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || p.color.toLowerCase().includes(q)) &&
      (!f.category || p.category === f.category) && (!f.color || p.color === f.color) && p.price >= min && p.price <= max);
    if (f.sort === 'price_asc') r = [...r].sort((a, b) => a.price - b.price);
    if (f.sort === 'price_desc') r = [...r].sort((a, b) => b.price - a.price);
    return r;
  }
  filters() { return { categories: [...new Set(this.products.map(p => p.category))], colors: [...new Set(this.products.map(p => p.color))] }; }
  // ---------- FR5 saved addresses and payment mode ----------
  _addr(d) {
    const a = { label: String(d.label || 'Home').trim() || 'Home', name: String(d.name || '').trim(), phone: String(d.phone || ''), address: String(d.address || '').trim(), pin: String(d.pin || '') };
    if (a.name.length < 2) throw new ShopError('Enter your full name');
    if (!RE.phone.test(a.phone)) throw new ShopError('Phone must be 10 digits starting with 6-9');
    if (a.address.length < 8) throw new ShopError('Address must be at least 8 characters');
    if (!RE.pin.test(a.pin)) throw new ShopError('PIN code must be 6 digits');
    return a;
  }
  addAddress(name, d) { const u = this.user(name), a = this._addr(d); if (u.addresses.length >= 5) throw new ShopError('You can save at most 5 addresses'); u.addresses.push(a); this.save(); return u.addresses; }
  removeAddress(name, i) { const u = this.user(name); if (!Number.isInteger(i) || i < 0 || i >= u.addresses.length) throw new ShopError('Address not found', 404); u.addresses.splice(i, 1); this.save(); return u.addresses; }
  setPayment(name, d) {
    const u = this.user(name);
    if (!['COD', 'UPI'].includes(d.mode)) throw new ShopError('Choose a payment method: COD or UPI');
    if (d.mode === 'UPI' && !RE.upi.test(String(d.upi || ''))) throw new ShopError('Invalid UPI id (expected name@bank)');
    u.payment = d.mode === 'UPI' ? { mode: 'UPI', upi: d.upi } : { mode: 'COD' }; this.save(); return u.payment; // card numbers are never accepted or stored
  }
  profile(name) { const u = this.user(name); return { username: u.username, email: u.email, phone: u.phone, addresses: u.addresses, payment: u.payment }; }
  // ---------- FR6 cart and wishlist, FR7 share ----------
  cart(user) { this.user(user); if (!this.carts.has(user)) this.carts.set(user, new Map()); return this.carts.get(user); }
  add(user, id, qty) {
    if (!Number.isInteger(qty) || qty < 1 || qty > 10) throw new ShopError('Quantity must be a whole number from 1 to 10');
    const p = this.product(id), c = this.cart(user), total = (c.get(p.id) || 0) + qty;
    if (total > 10) throw new ShopError('Maximum 10 units of one product per order');
    if (total > p.stock) throw new ShopError(p.stock === 0 ? `${p.name} is sold out` : `Only ${p.stock} unit(s) of ${p.name} in stock`);
    c.set(p.id, total);
  }
  setQty(user, id, qty) {
    const c = this.cart(user), p = this.product(id);
    if (!c.has(p.id)) throw new ShopError('Item is not in the cart', 404);
    if (!Number.isInteger(qty) || qty < 0 || qty > 10) throw new ShopError('Quantity must be a whole number from 0 to 10');
    if (qty > p.stock) throw new ShopError(`Only ${p.stock} unit(s) of ${p.name} in stock`);
    qty === 0 ? c.delete(p.id) : c.set(p.id, qty);
  }
  wishlist(user) { this.user(user); return [...(this.wish.get(user) || [])].map(id => this.product(id)); }
  wishAdd(user, id) { this.user(user); const p = this.product(id); if (!this.wish.has(user)) this.wish.set(user, new Set()); this.wish.get(user).add(p.id); this.save(); }
  wishRemove(user, id) { this.user(user); const s = this.wish.get(user); if (!s || !s.delete(Number(id))) throw new ShopError('Item is not in the wishlist', 404); this.save(); }
  wishToCart(user, id) { this.add(user, id, 1); this.wishRemove(user, id); }
  share(id) { const p = this.product(id); return { url: `/?product=${p.id}`, text: `Check out ${p.name} (${p.color}) on QuickCart for Rs.${p.price}` }; }
  // ---------- billing ----------
  applyCoupon(user, code) {
    code = String(code || '').trim().toUpperCase();
    if (code === '') { this.coupons.delete(user); return; }
    const c = COUPONS[code]; if (!c) throw new ShopError('Invalid coupon code');
    if (c.min && this.subtotal(user) < c.min) throw new ShopError(`${code} needs a minimum purchase of Rs.${c.min}`);
    this.coupons.set(user, code);
  }
  subtotal(user) { let s = 0; for (const [id, q] of this.cart(user)) s += this.product(id).price * q; return r2(s); }
  bill(user) {
    const subtotal = this.subtotal(user), code = this.coupons.get(user) || null;
    let discount = 0;
    if (code) { const c = COUPONS[code]; discount = c.type === 'pct' ? r2(subtotal * c.value / 100) : (subtotal >= c.min ? c.value : 0); }
    const taxable = r2(subtotal - discount), gst = r2(taxable * GST);
    const shipping = subtotal === 0 || taxable >= FREE_SHIP_AT ? 0 : SHIP_FEE;
    return { subtotal, coupon: code, discount, gst, shipping, total: r2(taxable + gst + shipping) };
  }
  cartView(user) {
    const items = [...this.cart(user)].map(([id, qty]) => { const p = this.product(id); return { id, name: p.name, price: p.price, qty, line: r2(p.price * qty) }; });
    return { items, bill: this.bill(user) };
  }
  // ---------- FR7 order, FR8 track, FR9 cancel / reorder ----------
  checkout(user, d = {}) {
    const u = this.user(user), c = this.cart(user); if (c.size === 0) throw new ShopError('Cart is empty');
    let ship;
    if (d.addressIndex !== undefined && d.addressIndex !== '') { ship = u.addresses[Number(d.addressIndex)]; if (!ship) throw new ShopError('Saved address not found', 404); ship = { ...ship }; }
    else ship = this._addr(d);
    const payment = d.payment || (u.payment && u.payment.mode), upi = d.upi || (u.payment && u.payment.upi);
    if (!['COD', 'UPI'].includes(payment)) throw new ShopError('Choose a payment method: COD or UPI');
    if (payment === 'UPI' && !RE.upi.test(String(upi || ''))) throw new ShopError('Invalid UPI id (expected name@bank)');
    for (const [id, q] of c) { const p = this.product(id); if (q > p.stock) throw new ShopError(`Only ${p.stock} unit(s) of ${p.name} in stock`, 409); }
    const bill = this.bill(user);
    if (payment === 'COD' && bill.total > 10000) throw new ShopError('COD is not available above Rs.10000');
    const lines = [...c].map(([id, q]) => { const p = this.product(id); p.stock -= q; return { id, name: p.name, price: p.price, qty: q }; });
    const at = new Date().toISOString();
    const order = { id: this.nextOrder++, user, lines, bill, payment, ship, status: 'PLACED', history: [{ status: 'PLACED', at }], at };
    this.orders.push(order); c.clear(); this.coupons.delete(user); this.save();
    return order;
  }
  ordersOf(user) { this.user(user); return this.orders.filter(o => o.user === user).reverse(); }
  _own(user, id) { const o = this.orders.find(x => x.id === Number(id) && x.user === user); if (!o) throw new ShopError('Order not found for this user', 404); return o; }
  track(user, id) { const o = this._own(user, id); return { id: o.id, status: o.status, history: o.history, stages: STAGES }; }
  advance(adminUser, id) {
    this.admin(adminUser); const o = this.orders.find(x => x.id === Number(id)); if (!o) throw new ShopError('Order not found', 404);
    if (o.status === 'CANCELLED') throw new ShopError('A cancelled order cannot be updated');
    const i = STAGES.indexOf(o.status); if (i === STAGES.length - 1) throw new ShopError('Order is already delivered');
    o.status = STAGES[i + 1]; o.history.push({ status: o.status, at: new Date().toISOString() }); this.save(); return o;
  }
  cancel(user, id) {
    const o = this._own(user, id);
    if (o.status === 'CANCELLED') throw new ShopError('Order already cancelled');
    if (o.status !== 'PLACED') throw new ShopError(`Only a placed order can be cancelled (this order is ${o.status})`);
    o.lines.forEach(l => { const p = this.products.find(x => x.id === l.id); if (p) p.stock += l.qty; });
    o.status = 'CANCELLED'; o.history.push({ status: 'CANCELLED', at: new Date().toISOString() }); this.save(); return o;
  }
  reorder(user, id) {
    const o = this._own(user, id), added = [], skipped = [];
    for (const l of o.lines) { try { this.add(user, l.id, l.qty); added.push(l.name); } catch (e) { skipped.push(`${l.name}: ${e.message}`); } }
    if (!added.length) throw new ShopError('None of these products can be reordered: ' + skipped.join('; '), 409);
    return { added, skipped };
  }
  // ---------- FR10 help and complaints ----------
  care() { return CARE; }
  raiseComplaint(user, subject, message) {
    this.user(user); subject = String(subject || '').trim(); message = String(message || '').trim();
    if (subject.length < 3) throw new ShopError('Subject must be at least 3 characters');
    if (message.length < 10) throw new ShopError('Describe the problem in at least 10 characters');
    const c = { id: this.nextComplaint++, user, subject, message, status: 'OPEN', reply: '', at: new Date().toISOString() };
    this.complaints.push(c); this.save(); return c;
  }
  complaintsOf(user) { this.user(user); return this.complaints.filter(c => c.user === user).reverse(); }
  allComplaints(adminUser) { this.admin(adminUser); return [...this.complaints].reverse(); }
  resolveComplaint(adminUser, id, reply) {
    this.admin(adminUser); const c = this.complaints.find(x => x.id === Number(id)); if (!c) throw new ShopError('Complaint not found', 404);
    if (String(reply || '').trim().length < 3) throw new ShopError('Write a reply'); c.reply = String(reply).trim(); c.status = 'RESOLVED'; this.save(); return c;
  }
  // ---------- FR11 admin catalogue ----------
  addProduct(adminUser, d) {
    this.admin(adminUser);
    const name = String(d.name || '').trim(), category = String(d.category || '').trim(), color = String(d.color || '').trim(), price = Number(d.price), stock = Number(d.stock);
    if (name.length < 2) throw new ShopError('Product name is required');
    if (!category || !color) throw new ShopError('Category and colour are required');
    if (!(price > 0)) throw new ShopError('Price must be above 0');
    if (!Number.isInteger(stock) || stock < 0) throw new ShopError('Stock must be a whole number, 0 or more');
    if (this.products.some(p => p.name.toLowerCase() === name.toLowerCase())) throw new ShopError('A product with this name already exists', 409);
    const p = { id: this.nextProduct++, name, category, color, price: r2(price), stock }; this.products.push(p); this.save(); return p;
  }
  restock(adminUser, id, qty) {
    this.admin(adminUser); if (!Number.isInteger(qty) || qty < 1) throw new ShopError('Restock quantity must be a whole number above 0');
    const p = this.product(id); p.stock += qty; this.save(); return p;
  }
  removeProduct(adminUser, id) {
    this.admin(adminUser); const p = this.product(id);
    if (p.stock > 0) throw new ShopError('Only sold-out products can be removed');
    this.products = this.products.filter(x => x.id !== p.id);
    for (const c of this.carts.values()) c.delete(p.id); for (const w of this.wish.values()) w.delete(p.id);
    this.save(); return p;
  }
}
module.exports = { Shop, ShopError, COUPONS, STAGES };
