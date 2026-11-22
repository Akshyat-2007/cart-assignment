'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { Shop, ShopError } = require('./shop');
const PORT = process.env.PORT || 8080, DATA = process.env.DATA || path.join(__dirname, 'data.json');
const shop = new Shop(DATA), sessions = new Map(), started = Date.now();
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const cookieOf = req => (/sid=([a-f0-9]{32})/.exec(req.headers.cookie || '') || [])[1];
const body = req => new Promise((ok, no) => { let s = ''; req.on('data', c => { s += c; if (s.length > 1e5) no(new ShopError('Body too large', 413)); }); req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch { no(new ShopError('Invalid JSON')); } }); });
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'), p = url.pathname, m = req.method, g = k => url.searchParams.get(k);
  try {
    if (!p.startsWith('/api/')) {
      const f = path.join(__dirname, 'public', p === '/' ? 'index.html' : p.replace(/\.\./g, ''));
      if (!fs.existsSync(f) || !fs.statSync(f).isFile()) return send(res, 404, { error: 'Not found' });
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); return res.end(fs.readFileSync(f));
    }
    if (m !== 'GET' && req.headers['x-requested-with'] !== 'quickcart') throw new ShopError('Missing X-Requested-With header', 403);
    const b = m === 'GET' ? {} : await body(req), tok = cookieOf(req), U = () => { const u = sessions.get(tok); if (!u) throw new ShopError('Please log in', 401); return u; };
    const login = name => { const t = crypto.randomBytes(16).toString('hex'); sessions.set(t, name); res.setHeader('Set-Cookie', `sid=${t}; HttpOnly; SameSite=Strict; Path=/`); };
    const R = `${m} ${p}`;
    switch (R) {
      case 'GET /api/health': return send(res, 200, { status: 'ok', uptimeSeconds: Math.round((Date.now() - started) / 1000), products: shop.products.length });
      case 'GET /api/products': return send(res, 200, shop.search({ q: g('q'), category: g('category'), color: g('color'), min: g('min'), max: g('max'), sort: g('sort') }));
      case 'GET /api/filters': return send(res, 200, shop.filters());
      case 'GET /api/share': return send(res, 200, shop.share(g('id')));
      case 'GET /api/care': return send(res, 200, shop.care());
      case 'POST /api/register': { const u = shop.register(b.username, b.password, b.email, b.phone); login(u.username); return send(res, 201, u); }
      case 'POST /api/login': { const u = shop.login(b.username, b.password); login(u.username); return send(res, 200, u); }
      case 'POST /api/logout': sessions.delete(tok); res.setHeader('Set-Cookie', 'sid=; Max-Age=0; Path=/'); return send(res, 200, { ok: true });
      case 'GET /api/me': return send(res, 200, shop.me(U()));
      case 'POST /api/me/delete': shop.deleteAccount(U(), b.password); sessions.delete(tok); return send(res, 200, { ok: true });
      case 'GET /api/profile': return send(res, 200, shop.profile(U()));
      case 'POST /api/profile/address': return send(res, 201, shop.addAddress(U(), b));
      case 'POST /api/profile/address/remove': return send(res, 200, shop.removeAddress(U(), b.index));
      case 'POST /api/profile/payment': return send(res, 200, shop.setPayment(U(), b));
      case 'GET /api/cart': return send(res, 200, shop.cartView(U()));
      case 'POST /api/cart/add': shop.add(U(), b.id, b.qty); return send(res, 200, shop.cartView(U()));
      case 'POST /api/cart/set': shop.setQty(U(), b.id, b.qty); return send(res, 200, shop.cartView(U()));
      case 'POST /api/cart/coupon': shop.applyCoupon(U(), b.code); return send(res, 200, shop.cartView(U()));
      case 'GET /api/wishlist': return send(res, 200, shop.wishlist(U()));
      case 'POST /api/wishlist/add': shop.wishAdd(U(), b.id); return send(res, 200, shop.wishlist(U()));
      case 'POST /api/wishlist/remove': shop.wishRemove(U(), b.id); return send(res, 200, shop.wishlist(U()));
      case 'POST /api/wishlist/tocart': shop.wishToCart(U(), b.id); return send(res, 200, shop.wishlist(U()));
      case 'POST /api/checkout': return send(res, 201, shop.checkout(U(), b));
      case 'GET /api/orders': return send(res, 200, shop.ordersOf(U()));
      case 'GET /api/track': return send(res, 200, shop.track(U(), g('id')));
      case 'POST /api/orders/cancel': return send(res, 200, shop.cancel(U(), b.id));
      case 'POST /api/orders/reorder': return send(res, 200, shop.reorder(U(), b.id));
      case 'GET /api/complaints': return send(res, 200, shop.complaintsOf(U()));
      case 'POST /api/complaints': return send(res, 201, shop.raiseComplaint(U(), b.subject, b.message));
      case 'POST /api/admin/product': return send(res, 201, shop.addProduct(U(), b));
      case 'POST /api/admin/product/remove': return send(res, 200, shop.removeProduct(U(), b.id));
      case 'POST /api/admin/restock': return send(res, 200, shop.restock(U(), b.id, b.qty));
      case 'POST /api/admin/order/advance': return send(res, 200, shop.advance(U(), b.id));
      case 'GET /api/admin/orders': shop.admin(U()); return send(res, 200, [...shop.orders].reverse());
      case 'GET /api/admin/complaints': return send(res, 200, shop.allComplaints(U()));
      case 'POST /api/admin/complaints/resolve': return send(res, 200, shop.resolveComplaint(U(), b.id, b.reply));
    }
    throw new ShopError('Unknown route', 404);
  } catch (e) { if (e instanceof ShopError) return send(res, e.code, { error: e.message }); console.error(e); send(res, 500, { error: 'Internal error' }); }
});
if (require.main === module) server.listen(PORT, () => console.log('QuickCart on http://127.0.0.1:' + PORT));
module.exports = server;
module.exports.shop = shop;
