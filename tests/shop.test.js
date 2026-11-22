const os = require('os'), fs = require('fs'), path = require('path');
const DATAF = path.join(os.tmpdir(), 'qc_http_' + process.pid + '.json'); fs.rmSync(DATAF, { force: true }); process.env.DATA = DATAF;
const test = require('node:test'), assert = require('node:assert/strict');
const { Shop } = require('../shop'); const server = require('../server');
let n = 0; const t = (tag, name, fn) => test(`TC${String(++n).padStart(2, '0')} [${tag}] ${name}`, fn);
const bad = (fn, re) => assert.throws(fn, e => re.test(e.message));
const S = () => { const s = new Shop(); s.register('ravi', 'secret1', 'ravi@mail.com', '9876543210'); return s; };
const U = 'ravi', ADDR = { label: 'Home', name: 'Ravi Kumar', phone: '9876543210', address: '12 MG Road, Bengaluru', pin: '560001' };
const GOOD = { ...ADDR, payment: 'COD' }, UPIG = { ...ADDR, payment: 'UPI', upi: 'ravi@okbank' };

// FR1 register
t('FR1', 'register with valid details -> account created', () => { const s = new Shop(); assert.equal(s.register('ravi_01', 'secret1', 'r@mail.com', '9876543210').username, 'ravi_01'); });
t('FR1', 'duplicate username -> error 409', () => bad(() => S().register('ravi', 'secret1', 'a@b.com', '9876543210'), /already taken/));
t('FR1', 'short password (abc) -> rejected', () => bad(() => new Shop().register('amit', 'abc', 'a@b.com', '9876543210'), /at least 6/));
t('FR1', 'invalid username "a b" -> rejected', () => bad(() => new Shop().register('a b', 'secret1', 'a@b.com', '9876543210'), /Username must/));
t('FR1', 'invalid email "abc" -> rejected', () => bad(() => new Shop().register('amit', 'secret1', 'abc', '9876543210'), /valid email/));
t('FR1', 'invalid phone 12345 -> rejected', () => bad(() => new Shop().register('amit', 'secret1', 'a@b.com', '12345'), /Phone must/));
// FR2 login
t('FR2', 'login with correct credentials -> success', () => assert.equal(S().login('ravi', 'secret1').role, 'customer'));
t('FR2', 'wrong password -> Invalid username or password', () => bad(() => S().login('ravi', 'wrong'), /Invalid username or password/));
t('FR2', 'unknown user -> same error message', () => bad(() => S().login('nobody', 'secret1'), /Invalid username or password/));
t('FR2', 'five wrong attempts lock the account for a while -> 429', () => { const s = S(); for (let i = 0; i < 5; i++) try { s.login('ravi', 'x'); } catch {} bad(() => s.login('ravi', 'secret1'), /Too many failed/); });
// FR3 / FR4 browse and filter
t('FR3', 'catalogue shows 10 products', () => assert.equal(S().search().length, 10));
t('FR3', 'search "SHIRT" (case-insensitive) -> 1 result', () => assert.equal(S().search({ q: 'SHIRT' }).length, 1));
t('FR3', 'search with no match -> 0 results', () => assert.equal(S().search({ q: 'zzz' }).length, 0));
t('FR3', 'search with undefined/null parameters -> all products (regression)', () => { assert.equal(S().search().length, 10); assert.equal(S().search({ q: null, category: null, min: null }).length, 10); });
t('FR4', 'filter by type Electronics -> 3 products', () => assert.equal(S().search({ category: 'Electronics' }).length, 3));
t('FR4', 'filter by colour Black -> 3 products', () => assert.equal(S().search({ color: 'Black' }).length, 3));
t('FR4', 'price range 500 to 1500 -> 3 products (Mouse, Charger, Lamp)', () => assert.deepEqual(S().search({ min: 500, max: 1500 }).map(p => p.id), [1, 3, 8]));
t('FR4', 'type + colour + max price combined -> Wireless Mouse only', () => { const r = S().search({ category: 'Electronics', color: 'Black', max: 1000 }); assert.deepEqual(r.map(p => p.name), ['Wireless Mouse']); });
t('FR4', 'max below min -> Invalid price range', () => bad(() => S().search({ min: 900, max: 100 }), /Invalid price range/));
t('FR4', 'sort by price ascending -> Rs.275 first, Rs.3299 last', () => { const r = S().search({ sort: 'price_asc' }); assert.equal(r[0].price, 275); assert.equal(r.at(-1).price, 3299); });
// FR5 saved address and payment mode
t('FR5', 'save a delivery address -> stored', () => { const s = S(); assert.equal(s.addAddress(U, ADDR).length, 1); assert.equal(s.profile(U).addresses[0].pin, '560001'); });
t('FR5', 'address with bad PIN 0123 -> rejected', () => bad(() => S().addAddress(U, { ...ADDR, pin: '0123' }), /PIN/));
t('FR5', 'sixth saved address -> rejected (max 5)', () => { const s = S(); for (let i = 0; i < 5; i++) s.addAddress(U, ADDR); bad(() => s.addAddress(U, ADDR), /at most 5/); });
t('FR5', 'delete a saved address -> removed', () => { const s = S(); s.addAddress(U, ADDR); assert.equal(s.removeAddress(U, 0).length, 0); });
t('FR5', 'save payment mode UPI ravi@okbank -> stored', () => { const s = S(); assert.equal(s.setPayment(U, { mode: 'UPI', upi: 'ravi@okbank' }).upi, 'ravi@okbank'); });
t('FR5', 'payment mode CARD -> rejected (card numbers are never stored)', () => bad(() => S().setPayment(U, { mode: 'CARD', number: '4111111111111111' }), /COD or UPI/));
t('FR5', 'invalid UPI id "ravi" -> rejected', () => bad(() => S().setPayment(U, { mode: 'UPI', upi: 'ravi' }), /Invalid UPI/));
t('FR5', 'checkout using saved address and saved payment -> order placed', () => { const s = S(); s.addAddress(U, ADDR); s.setPayment(U, { mode: 'UPI', upi: 'ravi@okbank' }); s.add(U, 1, 1); const o = s.checkout(U, { addressIndex: 0 }); assert.equal(o.payment, 'UPI'); assert.equal(o.ship.pin, '560001'); });
// FR6 cart and wishlist
t('FR6', 'add Mouse x2 to cart -> subtotal 1598', () => { const s = S(); s.add(U, 1, 2); assert.equal(s.subtotal(U), 1598); });
t('FR6', 'add same product twice (1+2) -> one line, quantity 3', () => { const s = S(); s.add(U, 1, 1); s.add(U, 1, 2); assert.equal(s.cartView(U).items[0].qty, 3); });
t('FR6', 'quantity 0, -1, 1.5 -> rejected', () => { const s = S(); for (const q of [0, -1, 1.5]) bad(() => s.add(U, 1, q), /whole number/); });
t('FR6', 'quantity above 10 in total -> Maximum 10', () => { const s = S(); s.add(U, 9, 6); bad(() => s.add(U, 9, 6), /Maximum 10/); });
t('FR6', 'Jacket x9 (stock 8) -> Only 8 in stock', () => bad(() => S().add(U, 5, 9), /Only 8 unit/));
t('FR6', 'unknown product id 99 -> No product', () => bad(() => S().add(U, 99, 1), /No product/));
t('FR6', 'set quantity 0 -> line removed', () => { const s = S(); s.add(U, 1, 2); s.setQty(U, 1, 0); assert.equal(s.cartView(U).items.length, 0); });
t('FR6', 'update item not in cart -> error', () => bad(() => S().setQty(U, 1, 2), /not in the cart/));
t('FR6', 'save product to wishlist -> listed', () => { const s = S(); s.wishAdd(U, 3); assert.deepEqual(s.wishlist(U).map(p => p.id), [3]); });
t('FR6', 'remove from wishlist; remove again -> second is an error', () => { const s = S(); s.wishAdd(U, 3); s.wishRemove(U, 3); bad(() => s.wishRemove(U, 3), /not in the wishlist/); });
t('FR6', 'move wishlist item to cart -> in cart, not in wishlist', () => { const s = S(); s.wishAdd(U, 3); s.wishToCart(U, 3); assert.equal(s.cartView(U).items.length, 1); assert.equal(s.wishlist(U).length, 0); });
t('FR6', 'cart and wishlist need a logged-in user -> 401', () => { const s = S(); bad(() => s.add('ghost', 1, 1), /log in/); bad(() => s.wishAdd('ghost', 1), /log in/); });
// FR7 share
t('FR7', 'share product 1 -> link /?product=1 and text with name, colour, price', () => { const x = S().share(1); assert.equal(x.url, '/?product=1'); assert.match(x.text, /Wireless Mouse \(Black\).*Rs\.799/); });
t('FR7', 'share unknown product -> No product', () => bad(() => S().share(99), /No product/));
// billing
t('BILL', '2 Mouse, no coupon -> GST 287.64, total 1885.64', () => { const s = S(); s.add(U, 1, 2); const b = s.bill(U); assert.equal(b.gst, 287.64); assert.equal(b.total, 1885.64); });
t('BILL', 'SAVE10 (lower-case input) -> discount 159.80, total 1697.08', () => { const s = S(); s.add(U, 1, 2); s.applyCoupon(U, 'save10'); const b = s.bill(U); assert.equal(b.discount, 159.8); assert.equal(b.total, 1697.08); });
t('BILL', 'FLAT100 below Rs.1000 -> minimum purchase error', () => { const s = S(); s.add(U, 1, 1); bad(() => s.applyCoupon(U, 'FLAT100'), /minimum purchase/); });
t('BILL', 'FLAT100 on Speaker -> discount 100, total 2476.82', () => { const s = S(); s.add(U, 2, 1); s.applyCoupon(U, 'FLAT100'); assert.equal(s.bill(U).total, 2476.82); });
t('BILL', 'invalid coupon FREE -> Invalid coupon', () => bad(() => S().applyCoupon(U, 'FREE'), /Invalid coupon/));
t('BILL', 'Bottle x1 (Rs.350) -> delivery 40, total 453.00', () => { const s = S(); s.add(U, 7, 1); const b = s.bill(U); assert.equal(b.shipping, 40); assert.equal(b.total, 453); });
t('BILL', 'empty cart -> total 0', () => assert.equal(S().bill(U).total, 0));
// checkout
t('ORDER', 'checkout 2 Mouse -> PLACED, stock 23, cart empty', () => { const s = S(); s.add(U, 1, 2); const o = s.checkout(U, GOOD); assert.equal(o.status, 'PLACED'); assert.equal(s.product(1).stock, 23); assert.equal(s.cartView(U).items.length, 0); });
t('ORDER', 'checkout with empty cart -> Cart is empty', () => bad(() => S().checkout(U, GOOD), /Cart is empty/));
t('ORDER', 'phone 12345 at checkout -> error, stock and cart unchanged', () => { const s = S(); s.add(U, 1, 1); bad(() => s.checkout(U, { ...GOOD, phone: '12345' }), /Phone/); assert.equal(s.product(1).stock, 25); assert.equal(s.cartView(U).items.length, 1); });
t('ORDER', 'invalid UPI id "john" -> error, nothing changes', () => { const s = S(); s.add(U, 1, 1); bad(() => s.checkout(U, { ...GOOD, payment: 'UPI', upi: 'john' }), /Invalid UPI/); assert.equal(s.product(1).stock, 25); });
t('ORDER', 'COD above Rs.10000 (4 shoes) -> rejected, stock unchanged', () => { const s = S(); s.add(U, 6, 4); bad(() => s.checkout(U, GOOD), /COD is not available/); assert.equal(s.product(6).stock, 12); });
// FR8 track
t('FR8', 'new order tracking -> status PLACED with 1 history entry', () => { const s = S(); s.add(U, 1, 1); const o = s.checkout(U, GOOD); const x = s.track(U, o.id); assert.equal(x.status, 'PLACED'); assert.equal(x.history.length, 1); });
t('FR8', 'admin advances order PLACED -> PACKED -> SHIPPED -> DELIVERED', () => { const s = S(); s.add(U, 1, 1); const o = s.checkout(U, GOOD); for (const st of ['PACKED', 'SHIPPED', 'DELIVERED']) assert.equal(s.advance('admin', o.id).status, st); assert.equal(s.track(U, o.id).history.length, 4); });
t('FR8', 'advance a delivered order -> already delivered', () => { const s = S(); s.add(U, 1, 1); const o = s.checkout(U, GOOD); for (let i = 0; i < 3; i++) s.advance('admin', o.id); bad(() => s.advance('admin', o.id), /already delivered/); });
t('FR8', 'customer tries to advance an order -> 403', () => { const s = S(); s.add(U, 1, 1); const o = s.checkout(U, GOOD); bad(() => s.advance(U, o.id), /Administrator/); });
t('FR8', 'track another user\'s order -> not found', () => { const s = S(); s.register('sita', 'secret1', 's@mail.com', '9123456780'); s.add(U, 1, 1); const o = s.checkout(U, GOOD); bad(() => s.track('sita', o.id), /not found/); });
// FR9 cancel / reorder
t('FR9', 'cancel placed order -> CANCELLED, stock restored to 25', () => { const s = S(); s.add(U, 1, 2); const o = s.checkout(U, GOOD); s.cancel(U, o.id); assert.equal(s.product(1).stock, 25); assert.equal(o.status, 'CANCELLED'); });
t('FR9', 'cancel twice -> already cancelled', () => { const s = S(); s.add(U, 1, 1); const o = s.checkout(U, GOOD); s.cancel(U, o.id); bad(() => s.cancel(U, o.id), /already cancelled/); });
t('FR9', 'cancel after packing -> only a placed order can be cancelled', () => { const s = S(); s.add(U, 1, 1); const o = s.checkout(U, GOOD); s.advance('admin', o.id); bad(() => s.cancel(U, o.id), /Only a placed order/); });
t('FR9', 'another user cancels the order -> not found', () => { const s = S(); s.register('sita', 'secret1', 's@mail.com', '9123456780'); s.add(U, 1, 1); const o = s.checkout(U, GOOD); bad(() => s.cancel('sita', o.id), /not found/); });
t('FR9', 'reorder a past order -> same products back in cart', () => { const s = S(); s.add(U, 1, 2); const o = s.checkout(U, GOOD); const r = s.reorder(U, o.id); assert.deepEqual(r.added, ['Wireless Mouse']); assert.equal(s.cartView(U).items[0].qty, 2); });
t('FR9', 'reorder when product is sold out -> error, cart unchanged', () => { const s = S(); s.add(U, 5, 8); const o = s.checkout(U, UPIG); bad(() => s.reorder(U, o.id), /None of these/); assert.equal(s.cartView(U).items.length, 0); });
// FR10 complaints
t('FR10', 'customer care phone and email are available', () => { const c = S().care(); assert.ok(c.phone && c.email); });
t('FR10', 'raise a complaint -> OPEN', () => { const c = S().raiseComplaint(U, 'Late delivery', 'My order has not arrived yet'); assert.equal(c.status, 'OPEN'); });
t('FR10', 'subject "ab" or message too short -> rejected', () => { const s = S(); bad(() => s.raiseComplaint(U, 'ab', 'long enough message'), /Subject/); bad(() => s.raiseComplaint(U, 'Help', 'short'), /at least 10/); });
t('FR10', 'user sees only own complaints', () => { const s = S(); s.register('sita', 'secret1', 's@mail.com', '9123456780'); s.raiseComplaint(U, 'Late delivery', 'My order has not arrived'); assert.equal(s.complaintsOf('sita').length, 0); assert.equal(s.complaintsOf(U).length, 1); });
t('FR10', 'admin replies -> RESOLVED; customer cannot list all complaints', () => { const s = S(); const c = s.raiseComplaint(U, 'Late delivery', 'My order has not arrived'); assert.equal(s.resolveComplaint('admin', c.id, 'Shipped today').status, 'RESOLVED'); bad(() => s.allComplaints(U), /Administrator/); });
// FR11 admin catalogue
t('FR11', 'admin adds a product -> listed with next id 11', () => { const s = S(); const p = s.addProduct('admin', { name: 'Yoga Mat', category: 'Sports', color: 'Purple', price: 899, stock: 12 }); assert.equal(p.id, 11); assert.equal(s.search({ q: 'yoga' }).length, 1); });
t('FR11', 'customer adds a product -> 403', () => bad(() => S().addProduct(U, { name: 'X1', category: 'A', color: 'B', price: 1, stock: 1 }), /Administrator/));
t('FR11', 'price 0 or negative stock -> rejected', () => { const s = S(); bad(() => s.addProduct('admin', { name: 'Yoga Mat', category: 'Sports', color: 'Purple', price: 0, stock: 1 }), /above 0/); bad(() => s.addProduct('admin', { name: 'Yoga Mat', category: 'Sports', color: 'Purple', price: 5, stock: -1 }), /Stock/); });
t('FR11', 'duplicate product name -> 409', () => bad(() => S().addProduct('admin', { name: 'wireless mouse', category: 'A', color: 'B', price: 5, stock: 1 }), /already exists/));
t('FR11', 'remove product that still has stock -> rejected', () => bad(() => S().removeProduct('admin', 1), /Only sold-out/));
t('FR11', 'sold-out product (Jacket, all 8 sold) can be removed and disappears from wishlist', () => { const s = S(); s.wishAdd(U, 5); s.add(U, 5, 8); s.checkout(U, UPIG); assert.equal(s.removeProduct('admin', 5).id, 5); assert.equal(s.search({ q: 'jacket' }).length, 0); assert.equal(s.wishlist(U).length, 0); });
t('FR11', 'sold-out product cannot be added to cart', () => { const s = S(); s.add(U, 5, 8); s.checkout(U, UPIG); bad(() => s.add(U, 5, 1), /sold out/); });
t('FR11', 'admin restocks +10 -> stock 18', () => { assert.equal(S().restock('admin', 5, 10).stock, 18); });
// FR12 logout and delete account
t('FR12', 'delete account with wrong password -> rejected', () => bad(() => S().deleteAccount(U, 'nope'), /incorrect/));
t('FR12', 'delete account -> cannot log in again, orders anonymised', () => { const s = S(); s.add(U, 1, 1); s.checkout(U, GOOD); s.deleteAccount(U, 'secret1'); bad(() => s.login(U, 'secret1'), /Invalid username/); assert.equal(s.orders[0].user, '(deleted)'); });
t('FR12', 'administrator account cannot be deleted', () => bad(() => S().deleteAccount('admin', 'admin123'), /cannot be deleted/));
// NFR1 security
t('NFR1', 'password is stored only as a salted hash', () => { const s = S(), u = s.users.get(U); assert.ok(!JSON.stringify(u).includes('secret1')); assert.equal(u.hash.length, 64); });
t('NFR1', 'two users with the same password get different hashes (salt)', () => { const s = S(); s.register('sita', 'secret1', 's@mail.com', '9123456780'); assert.notEqual(s.users.get(U).hash, s.users.get('sita').hash); });
t('NFR1', 'saved payment contains only mode/UPI id, never card data', () => { const s = S(); s.setPayment(U, { mode: 'UPI', upi: 'ravi@okbank' }); assert.deepEqual(Object.keys(s.profile(U).payment).sort(), ['mode', 'upi']); });
t('NFR1', 'users cannot see each other\'s orders or carts', () => { const s = S(); s.register('sita', 'secret1', 's@mail.com', '9123456780'); s.add(U, 1, 1); s.checkout(U, GOOD); assert.equal(s.ordersOf('sita').length, 0); assert.equal(s.cartView('sita').items.length, 0); });
// HTTP level
const cookies = {};
async function call(who, method, url, body, hdr = { 'X-Requested-With': 'quickcart' }) {
  const port = server.address().port, h = { 'Content-Type': 'application/json', ...hdr }; if (cookies[who]) h.Cookie = cookies[who];
  const r = await fetch(`http://127.0.0.1:${port}${url}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc) cookies[who] = sc.split(';')[0]; return { status: r.status, data: await r.json() };
}
test.before(() => new Promise(r => server.listen(0, r))); test.after(() => server.close());
t('NFR1', 'HTTP: private pages without login -> 401', async () => { for (const u of ['/api/cart', '/api/orders', '/api/profile', '/api/wishlist']) assert.equal((await call('anon', 'GET', u)).status, 401); });
t('NFR1', 'HTTP: change request without custom header -> 403', async () => assert.equal((await call('anon', 'POST', '/api/login', { username: 'a', password: 'b' }, {})).status, 403));
t('NFR1', 'HTTP: customer opening admin routes -> 403', async () => { await call('c1', 'POST', '/api/register', { username: 'cust1', password: 'secret1', email: 'c@mail.com', phone: '9876500001' }); assert.equal((await call('c1', 'GET', '/api/admin/orders')).status, 403); });
t('NFR1', 'HTTP: session cookie is HttpOnly and SameSite=Strict', async () => { const r = await fetch(`http://127.0.0.1:${server.address().port}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'quickcart' }, body: JSON.stringify({ username: 'cust1', password: 'secret1' }) }); const c = r.headers.get('set-cookie'); assert.match(c, /HttpOnly/); assert.match(c, /SameSite=Strict/); });
t('NFR1', 'HTTP: broken JSON -> 400, unknown route -> 404', async () => { const port = server.address().port; const r = await fetch(`http://127.0.0.1:${port}/api/login`, { method: 'POST', headers: { 'X-Requested-With': 'quickcart' }, body: '{bad' }); assert.equal(r.status, 400); assert.equal((await call('anon', 'GET', '/api/nothing')).status, 404); });
t('FR2', 'HTTP: login, view profile, logout, profile again -> 200 then 401', async () => { await call('c1', 'POST', '/api/login', { username: 'cust1', password: 'secret1' }); assert.equal((await call('c1', 'GET', '/api/profile')).status, 200); await call('c1', 'POST', '/api/logout', {}); assert.equal((await call('c1', 'GET', '/api/profile')).status, 401); });
t('FR12', 'HTTP: delete account then old session is rejected', async () => { await call('d1', 'POST', '/api/register', { username: 'temp1', password: 'secret1', email: 't@mail.com', phone: '9876500002' }); assert.equal((await call('d1', 'POST', '/api/me/delete', { password: 'secret1' })).status, 200); assert.equal((await call('d1', 'GET', '/api/cart')).status, 401); });
t('NFR2', 'HTTP: 20 users order the last 5 units at the same time -> exactly 5 succeed, stock 0, no overselling', async () => {
  await call('adm', 'POST', '/api/login', { username: 'admin', password: 'admin123' });
  const p = await call('adm', 'POST', '/api/admin/product', { name: 'Limited Cap', category: 'Clothing', color: 'Black', price: 300, stock: 5 }); const id = p.data.id;
  const users = Array.from({ length: 20 }, (_, i) => 'u' + i);
  const res = await Promise.all(users.map(async u => { await call(u, 'POST', '/api/register', { username: u, password: 'secret1', email: u + '@mail.com', phone: '98765' + String(10000 + users.indexOf(u)) });
    const a = await call(u, 'POST', '/api/cart/add', { id, qty: 1 }); if (a.status !== 200) return 'nostock';
    const c = await call(u, 'POST', '/api/checkout', { ...GOOD }); return c.status === 201 ? 'ok' : 'fail'; }));
  const ok = res.filter(x => x === 'ok').length; const stock = (await call('anon', 'GET', '/api/products?q=limited')).data[0].stock;
  assert.equal(ok, 5); assert.equal(stock, 0);
});
t('NFR2', 'HTTP: 200 parallel catalogue requests all succeed', async () => { const r = await Promise.all(Array.from({ length: 200 }, () => call('anon', 'GET', '/api/products'))); assert.ok(r.every(x => x.status === 200)); });
t('NFR2', 'searching 10,000 products takes under 50 ms', () => { const s = new Shop(); for (let i = 0; i < 10000; i++) s.products.push({ id: 100 + i, name: 'Item ' + i, category: 'X', color: 'Red', price: 10, stock: 5 }); const a = process.hrtime.bigint(); s.search({ q: 'item 9999', color: 'Red' }); assert.ok(Number(process.hrtime.bigint() - a) / 1e6 < 50); });
t('NFR2', 'HTTP: health check reports ok (availability monitoring)', async () => { const r = await call('anon', 'GET', '/api/health'); assert.equal(r.data.status, 'ok'); });
// NFR3 maintainability
t('NFR3', 'data survives a restart (users, orders, stock reloaded from file)', () => { const f = path.join(os.tmpdir(), 'qc_t_' + process.pid + '.json'); fs.rmSync(f, { force: true }); const s = new Shop(f); s.register(U, 'secret1', 'r@mail.com', '9876543210'); s.add(U, 1, 2); s.checkout(U, GOOD); const s2 = new Shop(f); assert.equal(s2.orders.length, 1); assert.equal(s2.product(1).stock, 23); assert.equal(s2.login(U, 'secret1').username, U); });
t('NFR3', 'order IDs keep increasing after restart', () => { const f = path.join(os.tmpdir(), 'qc_t2_' + process.pid + '.json'); fs.rmSync(f, { force: true }); const s = new Shop(f); s.register(U, 'secret1', 'r@mail.com', '9876543210'); s.add(U, 1, 1); const a = s.checkout(U, GOOD); const s2 = new Shop(f); s2.add(U, 1, 1); assert.equal(s2.checkout(U, GOOD).id, a.id + 1); });
