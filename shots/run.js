const { chromium } = require('playwright'); const { spawn } = require('child_process'); const fs = require('fs');
const B = 'http://127.0.0.1:8080'; const log = (k, v) => console.log(k, typeof v === 'string' ? v : JSON.stringify(v));
(async () => {
  const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT: '8080', DATA: 'data.json' }, stdio: 'inherit' });
  await new Promise(r => setTimeout(r, 900));
  const br = await chromium.launch(); const ctxOpt = { viewport: { width: 1100, height: 760 }, deviceScaleFactor: 1.4 };
  const cx = await br.newContext(ctxOpt), ax = await br.newContext(ctxOpt);
  const pg = await cx.newPage(), ad = await ax.newPage(); const errs = [];
  for (const p of [pg, ad]) { p.on('pageerror', e => errs.push('PAGEERROR ' + e.message)); p.on('dialog', d => d.accept('Your parcel ships today.')); p.on('console', m => m.type() === 'error' && errs.push(m.text())); }
  const hide = p => p.addStyleTag({ content: '#toast{display:none}' });
  const nav = (p, t) => p.click(`#nav [data-t="${t}"]`);
  // 1 login / register
  await pg.goto(B); await hide(pg); await pg.waitForSelector('.card'); await nav(pg, 'auth'); await pg.waitForSelector('#rf');
  await pg.fill('#rf [name=username]', 'ravi_k'); await pg.fill('#rf [name=email]', 'ravi.k@mail.com'); await pg.fill('#rf [name=phone]', '9876543210'); await pg.fill('#rf [name=password]', 'secret1');
  await pg.fill('#lf [name=username]', 'ravi_k'); await pg.fill('#lf [name=password]', 'wrongpass'); await pg.click('#lf button'); await pg.waitForSelector('#lf-err .err');
  await pg.screenshot({ path: 'shots/1_auth.png', clip: { x: 0, y: 0, width: 1100, height: 520 } });
  await pg.click('#rf button'); await pg.waitForSelector('#grid .card'); log('REGISTERED_NAV', await pg.textContent('#lo'));
  // 2 filters
  await pg.selectOption('#col', 'Black'); await pg.fill('#max', '3000'); await pg.selectOption('#sort', 'price_asc'); await pg.waitForTimeout(500);
  log('FILTER_COUNT', await pg.locator('#grid .card').count());
  await pg.screenshot({ path: 'shots/2_filter.png', clip: { x: 0, y: 0, width: 1100, height: 520 } });
  await pg.selectOption('#col', ''); await pg.fill('#max', ''); await pg.selectOption('#sort', ''); await pg.waitForTimeout(400);
  // share
  await pg.click('[data-s="1"]'); await pg.waitForTimeout(500); log('SHARE_TOAST', await pg.textContent('#toast'));
  // wishlist + cart
  await pg.click('[data-w="3"]'); await pg.click('[data-w="6"]'); await pg.click('[data-add="1"]'); await pg.click('[data-add="1"]'); await pg.click('[data-add="2"]'); await pg.click('[data-add="7"]'); await pg.waitForTimeout(300);
  await nav(pg, 'wish'); await pg.waitForSelector('table'); await pg.screenshot({ path: 'shots/3_wishlist.png', clip: { x: 0, y: 0, width: 1100, height: 280 } });
  await pg.click('[data-c="3"]'); await pg.waitForTimeout(400); log('WISH_AFTER_MOVE', await pg.locator('tr').count());
  await nav(pg, 'cart'); await pg.waitForSelector('#cf'); await pg.fill('#cf [name=code]', 'save10'); await pg.click('#cf button'); await pg.waitForSelector('#cf');
  await pg.waitForTimeout(400); await pg.screenshot({ path: 'shots/4_cart.png', fullPage: true, clip: { x: 0, y: 0, width: 1100, height: 730 } });
  await pg.fill('#co [name=name]', 'Ravi Kumar'); await pg.fill('#co [name=phone]', '12345'); await pg.fill('#co [name=address]', '12 MG Road, Bengaluru'); await pg.fill('#co [name=pin]', '560001'); await pg.click('#co button'); await pg.waitForSelector('#co-err .err');
  await pg.locator('#co').locator('xpath=..').screenshot({ path: 'shots/5_error.png' });
  // 6 profile: saved address and payment
  await nav(pg, 'profile'); await pg.waitForSelector('#af');
  await pg.fill('#af [name=name]', 'Ravi Kumar'); await pg.fill('#af [name=phone]', '9876543210'); await pg.fill('#af [name=address]', '12 MG Road, Bengaluru'); await pg.fill('#af [name=pin]', '560001'); await pg.click('#af button'); await pg.waitForSelector('[data-ra]');
  await pg.selectOption('#pf [name=mode]', 'UPI'); await pg.fill('#pf [name=upi]', 'ravi@okbank'); await pg.click('#pf button'); await pg.waitForTimeout(500);
  await pg.screenshot({ path: 'shots/6_profile.png', fullPage: true, clip: { x: 0, y: 0, width: 1100, height: 790 } });
  // 7 order using saved address + payment
  await nav(pg, 'cart'); await pg.waitForSelector('#ai'); await pg.selectOption('#ai', '0'); await pg.click('#co button'); await pg.waitForSelector('.ok');
  await pg.screenshot({ path: 'shots/7_confirm.png', clip: { x: 0, y: 0, width: 1100, height: 270 } });
  // admin: login, add product, advance order
  await ad.goto(B); await hide(ad); await nav(ad, 'auth'); await ad.fill('#lf [name=username]', 'admin'); await ad.fill('#lf [name=password]', 'admin123'); await ad.click('#lf button'); await ad.waitForSelector('#grid .card');
  await nav(ad, 'admin'); await ad.waitForSelector('#pa');
  await ad.fill('#pa [name=name]', 'Yoga Mat'); await ad.fill('#pa [name=category]', 'Sports'); await ad.fill('#pa [name=color]', 'Purple'); await ad.fill('#pa [name=price]', '899'); await ad.fill('#pa [name=stock]', '12'); await ad.click('#pa button'); await ad.waitForSelector('[data-ad]');
  await ad.click('[data-ad]'); await ad.waitForTimeout(600);
  await ad.locator('.box').nth(1).screenshot({ path: 'shots/8_admin.png' });
  // sold-out removal (admin removes a sold-out product: buy out Jacket via API as ravi session is page-bound -> use admin context fetch)
  const res = await ad.evaluate(async () => { const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'quickcart' }; const j = (u, b) => fetch('/api/' + u, { method: 'POST', headers: H, body: JSON.stringify(b) }).then(async r => [r.status, (await r.json())]);
    const r1 = await j('admin/product/remove', { id: 5 }); await j('cart/add', { id: 5, qty: 8 }); await j('checkout', { name: 'Admin User', phone: '9000000000', address: 'Admin Office Road', pin: '560002', payment: 'UPI', upi: 'admin@okbank' });
    const r2 = await j('admin/product/remove', { id: 5 }); return [r1, r2]; });
  log('REMOVE_IN_STOCK', res[0]); log('REMOVE_SOLDOUT', res[1][0]);
  // customer tracks
  await nav(pg, 'orders'); await pg.waitForSelector('[data-tr]'); await pg.click('[data-tr]'); await pg.waitForSelector('.steps');
  await pg.screenshot({ path: 'shots/9_track.png', clip: { x: 0, y: 0, width: 1100, height: 430 } });
  log('CANCEL_BTN_AFTER_PACKED', await pg.locator('[data-c]').count());
  // complaint + admin reply
  await nav(pg, 'help'); await pg.waitForSelector('#hf'); await pg.fill('#hf [name=subject]', 'Delivery question'); await pg.fill('#hf [name=message]', 'When will order 1001 reach Bengaluru?'); await pg.click('#hf button'); await pg.waitForSelector('#hf');
  await nav(ad, 'admin'); await ad.waitForSelector('[data-cr]'); await ad.click('[data-cr]'); await ad.waitForTimeout(600);
  await nav(pg, 'shop'); await nav(pg, 'help'); await pg.waitForSelector('i'); await pg.screenshot({ path: 'shots/10_help.png', fullPage: true, clip: { x: 0, y: 0, width: 1100, height: 760 } });
  // cancel + reorder on a new order
  await nav(pg, 'shop'); await pg.click('[data-add="9"]'); await pg.waitForTimeout(300); await nav(pg, 'cart'); await pg.waitForSelector('#ai'); await pg.selectOption('#ai', '0'); await pg.click('#co button'); await pg.waitForSelector('.ok');
  await nav(pg, 'orders'); await pg.waitForSelector('[data-c]'); await pg.click('[data-c]'); await pg.waitForTimeout(600); log('CANCEL_STATUS', (await pg.locator('.tag').allTextContents()).join(','));
  await pg.locator('[data-ro]').first().click(); await pg.waitForTimeout(300); log('CART_AFTER_REORDER', await pg.textContent('#nav [data-t=cart] b'));
  // delete account via UI with a temp user
  const tp = await (await br.newContext(ctxOpt)).newPage(); await tp.goto(B); await nav(tp, 'auth'); await tp.fill('#rf [name=username]', 'temp_user'); await tp.fill('#rf [name=email]', 't@mail.com'); await tp.fill('#rf [name=phone]', '9123456789'); await tp.fill('#rf [name=password]', 'secret1'); await tp.click('#rf button'); await tp.waitForSelector('#lo');
  await nav(tp, 'profile'); await tp.waitForSelector('#df'); await tp.fill('#df [name=password]', 'secret1'); await tp.click('#df button'); await tp.waitForSelector('[data-t=auth]'); log('DELETED_NAV_HAS_LOGIN', true);
  await nav(tp, 'auth'); await tp.fill('#lf [name=username]', 'temp_user'); await tp.fill('#lf [name=password]', 'secret1'); await tp.click('#lf button'); await tp.waitForSelector('#lf-err .err'); log('LOGIN_AFTER_DELETE', await tp.textContent('#lf-err'));
  // logout
  await pg.click('#lo'); await pg.waitForSelector('[data-t=auth]'); log('LOGOUT_OK', true);
  // mobile
  const m = await (await br.newContext({ viewport: { width: 390, height: 844 } })).newPage(); await m.goto(B); await m.waitForSelector('.card'); log('MOBILE', await m.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth })));
  log('PAGE_ERRORS', errs.filter(e => e.startsWith('PAGEERROR'))); log('CONSOLE_HTTP_ERRORS', errs.filter(e => !e.startsWith('PAGEERROR')).length + ' (expected 400/401 responses from deliberate invalid input and logged-out checks)');
  // performance
  const t = []; for (let i = 0; i < 50; i++) { const s = process.hrtime.bigint(); const r = await fetch(B + '/api/products?color=Black'); await r.text(); t.push(Number(process.hrtime.bigint() - s) / 1e6); } t.sort((a, b) => a - b);
  log('PERF_SEQ', { n: 50, median: t[24].toFixed(2), p95: t[47].toFixed(2), max: t[49].toFixed(2) });
  const s0 = process.hrtime.bigint(); const rr = await Promise.all(Array.from({ length: 200 }, () => fetch(B + '/api/products').then(r => r.status))); log('PERF_200_PARALLEL', { ok: rr.filter(x => x === 200).length, ms: (Number(process.hrtime.bigint() - s0) / 1e6).toFixed(0) });
  const h = await (await fetch(B + '/api/health')).json(); log('HEALTH', h);
  await br.close(); srv.kill();
  // backup / restore
  await new Promise(r => setTimeout(r, 400)); fs.copyFileSync('data.json', '/tmp/qc_backup.json'); delete require.cache[require.resolve('../shop')];
  const { Shop } = require('../shop'), a = new Shop('data.json'), b = new Shop('/tmp/qc_backup.json');
  log('RESTORE', { orders: [a.orders.length, b.orders.length], users: [a.users.size, b.users.size], identical: JSON.stringify(a.orders) === JSON.stringify(b.orders), loginOk: b.login('ravi_k', 'secret1').username });
})().catch(e => { console.error('SCRIPT FAIL', e.message); process.exit(1); });
