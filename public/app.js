const $ = s => document.querySelector(s), H = { 'Content-Type': 'application/json', 'X-Requested-With': 'quickcart' };
const rs = n => 'Rs.' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const COL = { Electronics: '#0f766e', Clothing: '#7c3aed', Footwear: '#c2410c', Home: '#0369a1', Stationery: '#a16207', Bags: '#be185d' };
let me = null, cartCount = 0, wishCount = 0, tab = 'shop';
let currentCartMap = new Map();
let currentProducts = [];

function getGuestCart() {
  try { return JSON.parse(localStorage.getItem('qc_guest_cart') || '[]'); } catch { return []; }
}
function setGuestCart(items) {
  localStorage.setItem('qc_guest_cart', JSON.stringify(items));
}
async function syncGuestCart() {
  const gc = getGuestCart();
  if (gc.length) {
    for (const item of gc) {
      try { await api('cart/add', { id: item.id, qty: item.qty }); } catch {}
    }
    localStorage.removeItem('qc_guest_cart');
  }
}

function getGuestWishlist() {
  try { return JSON.parse(localStorage.getItem('qc_guest_wish') || '[]'); } catch { return []; }
}
function setGuestWishlist(ids) {
  localStorage.setItem('qc_guest_wish', JSON.stringify(ids));
}
async function syncGuestWishlist() {
  const gw = getGuestWishlist();
  if (gw.length) {
    for (const id of gw) {
      try { await api('wishlist/add', { id }); } catch {}
    }
    localStorage.removeItem('qc_guest_wish');
  }
}

async function api(path, body) {
  const r = await fetch('/api/' + path, body === undefined ? {} : { method: 'POST', headers: H, body: JSON.stringify(body) });
  const d = await r.json(); if (!r.ok) { const e = new Error(d.error); e.status = r.status; throw e; } return d;
}
function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('show'); setTimeout(() => e.classList.remove('show'), 2400); }
const err = (id, m) => { $(id).innerHTML = m ? `<div class="err">${m}</div>` : ''; };
const form = (sel, fn) => { $(sel).onsubmit = async e => { e.preventDefault(); try { await fn(Object.fromEntries(new FormData(e.target))); } catch (x) { if (x.status === 401 && me) { me = null; nav(); go('auth'); } err(sel + '-err', x.message); } }; };

function nav() {
  const t = [['shop', 'Shop']];
  t.push(['wish', wishCount ? `Wishlist <b>${wishCount}</b>` : 'Wishlist']);
  t.push(['cart', `Cart <b>${cartCount}</b>`]);
  if (me) t.push(['orders', 'My Orders'], ['profile', 'Profile']);
  t.push(['help', 'Help']);
  if (me && me.role === 'admin') t.push(['admin', 'Admin']);
  $('#nav').innerHTML = t.map(([k, l]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('') + (me ? `<button id="lo">Logout (${me.username})</button>` : `<button data-t="auth" class="${tab === 'auth' ? 'on' : ''}">Login / Register</button>`);
  document.querySelectorAll('[data-t]').forEach(b => b.onclick = () => go(b.dataset.t));
  if ($('#lo')) $('#lo').onclick = async () => { await api('logout', {}); me = null; cartCount = 0; wishCount = 0; currentCartMap.clear(); nav(); go('shop'); toast('Logged out'); };
}

function getQtyInCart(id) {
  return currentCartMap.get(id) || 0;
}

async function refreshCount() {
  currentCartMap.clear();
  if (!me) {
    const gc = getGuestCart();
    cartCount = gc.reduce((n, i) => n + i.qty, 0);
    wishCount = getGuestWishlist().length;
    gc.forEach(i => currentCartMap.set(i.id, i.qty));
    return;
  }
  const [c, w] = await Promise.all([
    api('cart').catch(() => ({ items: [] })),
    api('wishlist').catch(() => [])
  ]);
  const items = c.items || [];
  cartCount = items.reduce((n, i) => n + i.qty, 0);
  items.forEach(i => currentCartMap.set(i.id, i.qty));
  wishCount = (w || []).length;
}

async function go(t) { tab = t; await refreshCount().catch(() => {}); nav(); await ({ shop, wish, cart, orders, profile, help, admin, auth })[t](); }
function needLogin() { $('#main').innerHTML = '<div class="box">Please log in or register to use this page.</div>'; }

// ---------- FR1, FR2 ----------
async function auth() {
  $('#main').innerHTML = `<div class="two"><div class="box"><h3>Login</h3><form id="lf"><label>Username</label><input name="username"><label>Password</label><input name="password" type="password"><br><br><button class="pri">Login</button></form><div id="lf-err"></div></div>
  <div class="box"><h3>New user? Register</h3><form id="rf"><label>Username (3-15 letters, digits, _)</label><input name="username"><label>Email</label><input name="email"><label>Phone</label><input name="phone"><label>Password (min 6)</label><input name="password" type="password"><br><br><button class="pri">Create account</button></form><div id="rf-err"></div></div></div>`;
  form('#lf', async d => {
    me = await api('login', d);
    await syncGuestCart();
    await syncGuestWishlist();
    await refreshCount();
    toast('Welcome ' + me.username);
    go(cartCount > 0 ? 'cart' : 'shop');
  });
  form('#rf', async d => {
    me = await api('register', d);
    await syncGuestCart();
    await syncGuestWishlist();
    await refreshCount();
    toast('Account created');
    go(cartCount > 0 ? 'cart' : 'shop');
  });
}

function renderCartBtn(p) {
  if (p.stock === 0) {
    return `<button class="pri" disabled>Sold out</button>`;
  }
  const qty = getQtyInCart(p.id);
  if (qty > 0) {
    const maxQty = Math.min(10, p.stock);
    return `<div class="cart-stepper" data-prod="${p.id}">
      <button class="step-btn dec" data-dec="${p.id}" title="Decrease quantity" aria-label="Decrease">&minus;</button>
      <button class="pri step-main" data-add="${p.id}" title="Click to add more" aria-label="Add more">
        <span class="step-title">&#10003; Added to cart: <b>${qty}</b></span>
        <span class="step-val">Total: <b>${rs(p.price * qty)}</b></span>
      </button>
      <button class="step-btn inc" data-inc="${p.id}" title="Increase quantity" aria-label="Increase" ${qty >= maxQty ? 'disabled' : ''}>+</button>
    </div>`;
  }
  return `<button class="pri" data-add="${p.id}">Add to cart</button>`;
}

// ---------- FR3, FR4, FR6, FR7 ----------
async function shop() {
  const f = await api('filters'), hl = new URLSearchParams(location.search).get('product');
  $('#main').innerHTML = `<div class="bar"><input id="q" placeholder="Search name, type or colour"><select id="cat"><option value="">All types</option>${f.categories.map(c => `<option>${c}</option>`).join('')}</select>
  <select id="col"><option value="">All colours</option>${f.colors.map(c => `<option>${c}</option>`).join('')}</select><input id="min" type="number" placeholder="Min Rs."><input id="max" type="number" placeholder="Max Rs.">
  <select id="sort"><option value="">Sort: default</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option></select></div><div id="grid" class="grid"></div><p id="empty" hidden>No products match your filters.</p><div id="shop-err"></div>`;

  async function handleAdd(id) {
    const p = currentProducts.find(x => x.id === id);
    if (!p) return;
    const current = getQtyInCart(id);
    const maxQty = Math.min(10, p.stock);
    if (current >= maxQty) {
      toast(current >= p.stock ? `Only ${p.stock} in stock` : 'Maximum 10 units allowed per product');
      return;
    }
    try {
      if (me) {
        await api('cart/add', { id, qty: 1 });
      } else {
        const gc = getGuestCart();
        const existing = gc.find(x => x.id === id);
        if (existing) {
          existing.qty += 1;
        } else {
          gc.push({ id, qty: 1 });
        }
        setGuestCart(gc);
      }
      await refreshCount();
      nav();
      updateCard(id);
      const newQty = getQtyInCart(id);
      toast(`Added to cart (Qty: ${newQty}) • Total: ${rs(p.price * newQty)}`);
    } catch (e) {
      toast(e.message || 'Could not add to cart');
    }
  }

  async function handleDec(id) {
    const p = currentProducts.find(x => x.id === id);
    if (!p) return;
    const current = getQtyInCart(id);
    const newQty = Math.max(0, current - 1);
    try {
      if (me) {
        await api('cart/set', { id, qty: newQty });
      } else {
        let gc = getGuestCart();
        if (newQty <= 0) {
          gc = gc.filter(x => x.id !== id);
        } else {
          const existing = gc.find(x => x.id === id);
          if (existing) existing.qty = newQty;
        }
        setGuestCart(gc);
      }
      await refreshCount();
      nav();
      updateCard(id);
      toast(newQty > 0 ? `Cart updated (Qty: ${newQty}) • Total: ${rs(p.price * newQty)}` : 'Removed from cart');
    } catch (e) {
      toast(e.message || 'Could not update cart');
    }
  }

  function updateCard(id) {
    const p = currentProducts.find(x => x.id === id);
    if (!p) return;
    const slot = document.querySelector(`.card[data-id="${id}"] .btn-slot`);
    if (slot) {
      slot.innerHTML = renderCartBtn(p);
      attachCardListeners(document.querySelector(`.card[data-id="${id}"]`));
    }
  }

  function attachCardListeners(cardEl) {
    cardEl.querySelectorAll('[data-add]').forEach(b => b.onclick = e => { e.stopPropagation(); handleAdd(+b.dataset.add); });
    cardEl.querySelectorAll('[data-inc]').forEach(b => b.onclick = e => { e.stopPropagation(); handleAdd(+b.dataset.inc); });
    cardEl.querySelectorAll('[data-dec]').forEach(b => b.onclick = e => { e.stopPropagation(); handleDec(+b.dataset.dec); });
    cardEl.querySelectorAll('[data-w]').forEach(b => b.onclick = async e => {
      e.stopPropagation();
      const id = +b.dataset.w;
      try {
        if (me) {
          const current = (await api('wishlist').catch(() => [])).map(x => x.id);
          if (current.includes(id)) {
            await api('wishlist/remove', { id });
            b.innerHTML = '&#9825; Wishlist';
            b.style.color = '';
            b.style.borderColor = '';
            toast('Removed from wishlist');
          } else {
            await api('wishlist/add', { id });
            b.innerHTML = '&#9829; Saved!';
            b.style.color = '#be185d';
            b.style.borderColor = '#be185d';
            setTimeout(() => { b.innerHTML = '&#9829; Wishlist'; }, 1200);
            toast('Saved to wishlist');
          }
        } else {
          let gw = getGuestWishlist();
          if (gw.includes(id)) {
            gw = gw.filter(x => x !== id);
            setGuestWishlist(gw);
            b.innerHTML = '&#9825; Wishlist';
            b.style.color = '';
            b.style.borderColor = '';
            toast('Removed from wishlist');
          } else {
            gw.push(id);
            setGuestWishlist(gw);
            b.innerHTML = '&#9829; Saved!';
            b.style.color = '#be185d';
            b.style.borderColor = '#be185d';
            setTimeout(() => { b.innerHTML = '&#9829; Wishlist'; }, 1200);
            toast('Saved to wishlist');
          }
        }
        await refreshCount();
        nav();
      } catch (err) {
        toast(err.message || 'Could not update wishlist');
      }
    });
    cardEl.querySelectorAll('[data-s]').forEach(b => b.onclick = async e => {
      e.stopPropagation();
      const id = +b.dataset.s;
      const originalText = b.textContent;
      try {
        const s = await api('share?id=' + id);
        const link = location.origin + s.url;
        const shareText = s.text + ' ' + link;

        let copied = false;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          try {
            await navigator.clipboard.writeText(shareText);
            copied = true;
          } catch {}
        }
        if (!copied) {
          try {
            const ta = document.createElement('textarea');
            ta.value = shareText;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            copied = document.execCommand('copy');
            document.body.removeChild(ta);
          } catch {}
        }

        b.textContent = '✓ Copied!';
        b.style.borderColor = '#059669';
        b.style.color = '#059669';
        setTimeout(() => {
          b.textContent = originalText;
          b.style.borderColor = '';
          b.style.color = '';
        }, 1500);

        if (navigator.share) {
          try { await navigator.share({ title: 'QuickCart', text: s.text, url: link }); } catch {}
        }

        toast('Link copied! Share link: ' + link);
      } catch (err) {
        toast(err.message || 'Could not share');
      }
    });
  }

  async function load() {
    try {
      const qs = new URLSearchParams({ q: $('#q').value, category: $('#cat').value, color: $('#col').value, min: $('#min').value, max: $('#max').value, sort: $('#sort').value });
      const [list, userWish] = await Promise.all([
        api('products?' + qs),
        me ? api('wishlist').catch(() => []) : Promise.resolve(getGuestWishlist().map(id => ({ id })))
      ]);
      currentProducts = list;
      const wishIds = new Set((userWish || []).map(x => x.id));
      err('#shop-err', '');
      $('#empty').hidden = list.length > 0;
      $('#grid').innerHTML = list.map(p => {
        const inWish = wishIds.has(p.id);
        return `<div class="card ${String(p.id) === hl ? 'hl' : ''}" data-id="${p.id}">
          <div class="thumb" style="background:${COL[p.category] || '#444'}">${p.name[0]}</div>
          <b>${p.name}</b>
          <small>${p.category} | ${p.color}</small>
          <div class="price">${rs(p.price)}</div>
          ${p.stock === 0 ? '<div class="low">Sold out</div>' : p.stock <= 10 ? `<div class="low">Only ${p.stock} left</div>` : '<small>In stock</small>'}
          <div class="btn-slot">${renderCartBtn(p)}</div>
          <div class="acts">
            <button class="sec" data-w="${p.id}" style="${inWish ? 'color:#be185d;border-color:#be185d' : ''}">${inWish ? '&#9829; Wishlist' : '&#9825; Wishlist'}</button>
            <button class="sec" data-s="${p.id}">Share</button>
          </div>
        </div>`;
      }).join('');

      document.querySelectorAll('#grid .card').forEach(attachCardListeners);
    } catch (e) { err('#shop-err', e.message); }
  }
  ['q', 'cat', 'col', 'min', 'max', 'sort'].forEach(i => $('#' + i).addEventListener('input', load)); load();
}

async function wish() {
  let w = [];
  if (me) {
    w = await api('wishlist');
  } else {
    const gw = getGuestWishlist();
    if (gw.length) {
      const allProducts = await api('products');
      w = gw.map(id => allProducts.find(x => x.id === id)).filter(Boolean);
    }
  }

  $('#main').innerHTML = '<h2>My Wishlist</h2>' + (w.length ? `<table><tr><th>Product</th><th>Price</th><th></th></tr>${w.map(p => `<tr><td>${p.name} (${p.color})</td><td>${rs(p.price)}</td><td class="flex"><button class="pri" data-c="${p.id}">Move to cart</button><button class="dng" data-r="${p.id}">Remove</button></td></tr>`).join('')}</table>` : '<p>Your wishlist is empty.</p>') +
  (!me && w.length ? '<div class="box"><p>Log in or create an account to save your wishlist permanently across devices.</p><button class="sec" id="btn-wish-login">Login / Register</button></div>' : '');

  if ($('#btn-wish-login')) $('#btn-wish-login').onclick = () => go('auth');

  document.querySelectorAll('[data-c]').forEach(b => b.onclick = async () => {
    const id = +b.dataset.c;
    try {
      if (me) {
        await api('wishlist/tocart', { id });
      } else {
        let gw = getGuestWishlist().filter(x => x !== id);
        setGuestWishlist(gw);
        const gc = getGuestCart();
        const ex = gc.find(x => x.id === id);
        if (ex) ex.qty = Math.min(10, ex.qty + 1);
        else gc.push({ id, qty: 1 });
        setGuestCart(gc);
      }
      toast('Moved to cart');
    } catch (e) {
      toast(e.message);
    }
    await refreshCount();
    nav();
    go('wish');
  });

  document.querySelectorAll('[data-r]').forEach(b => b.onclick = async () => {
    const id = +b.dataset.r;
    if (me) {
      await api('wishlist/remove', { id });
    } else {
      let gw = getGuestWishlist().filter(x => x !== id);
      setGuestWishlist(gw);
    }
    toast('Removed from wishlist');
    await refreshCount();
    nav();
    go('wish');
  });
}

// ---------- cart, checkout ----------
const billHtml = b => `<div class="row"><span>Subtotal</span><span>${rs(b.subtotal)}</span></div><div class="row"><span>Discount ${b.coupon ? '(' + b.coupon + ')' : ''}</span><span>- ${rs(b.discount)}</span></div>
 <div class="row"><span>GST (18%)</span><span>${rs(b.gst)}</span></div><div class="row"><span>Delivery</span><span>${b.shipping ? rs(b.shipping) : 'FREE'}</span></div><div class="row tot"><span>Total</span><span>${rs(b.total)}</span></div>`;

async function cart(done = '') {
  if (done) { $('#main').innerHTML = done; return; }
  if (!me) {
    const gc = getGuestCart();
    if (!gc.length) {
      $('#main').innerHTML = '<h2>Your Cart</h2><p>Your cart is empty.</p>';
      return;
    }
    const allProducts = await api('products');
    const items = gc.map(g => {
      const p = allProducts.find(x => x.id === g.id) || { id: g.id, name: 'Product #' + g.id, price: 0 };
      return { id: g.id, name: p.name, price: p.price, qty: g.qty, line: rs(p.price * g.qty) };
    });
    const subtotal = gc.reduce((s, g) => {
      const p = allProducts.find(x => x.id === g.id);
      return s + (p ? p.price * g.qty : 0);
    }, 0);
    const gst = Math.round(subtotal * 0.18 * 100) / 100;
    const shipping = subtotal >= 500 ? 0 : 40;
    const total = Math.round((subtotal + gst + shipping) * 100) / 100;
    const bill = { subtotal, coupon: null, discount: 0, gst, shipping, total };

    $('#main').innerHTML = `<h2>Your Cart</h2><table><tr><th>Product</th><th>Price</th><th>Qty</th><th>Total</th><th></th></tr>${items.map(i => `<tr><td>${i.name}</td><td>${rs(i.price)}</td><td><input class="qty" type="number" min="0" max="10" value="${i.qty}" data-q="${i.id}"></td><td>${i.line}</td><td><button class="dng" data-rm="${i.id}">Remove</button></td></tr>`).join('')}</table>
    <div class="box">${billHtml(bill)}</div>
    <div class="box">
      <h3>Ready to Checkout?</h3>
      <p>Log in or create a quick account to apply discount coupons, save delivery address, and place your order.</p>
      <button class="pri" id="btn-guest-checkout">Login / Register to Checkout</button>
    </div>`;

    $('#btn-guest-checkout').onclick = () => go('auth');
    document.querySelectorAll('[data-q]').forEach(i => i.onchange = async () => {
      const id = +i.dataset.q, qty = +i.value;
      let gc = getGuestCart();
      if (qty <= 0) gc = gc.filter(x => x.id !== id);
      else { const it = gc.find(x => x.id === id); if (it) it.qty = Math.min(10, qty); }
      setGuestCart(gc);
      await refreshCount();
      nav();
      go('cart');
    });
    document.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => {
      const id = +b.dataset.rm;
      let gc = getGuestCart().filter(x => x.id !== id);
      setGuestCart(gc);
      await refreshCount();
      nav();
      go('cart');
    });
    return;
  }

  const c = await api('cart'), pr = await api('profile');
  if (!c.items.length) { $('#main').innerHTML = '<h2>Your Cart</h2><p>Your cart is empty.</p>'; return; }
  $('#main').innerHTML = `<h2>Your Cart</h2><table><tr><th>Product</th><th>Price</th><th>Qty</th><th>Total</th><th></th></tr>${c.items.map(i => `<tr><td>${i.name}</td><td>${rs(i.price)}</td><td><input class="qty" type="number" min="0" max="10" value="${i.qty}" data-q="${i.id}"></td><td>${rs(i.line)}</td><td><button class="dng" data-rm="${i.id}">Remove</button></td></tr>`).join('')}</table>
  <div class="box"><form id="cf"><label>Coupon code (SAVE10 or FLAT100)</label><div class="flex"><input name="code" value="${c.bill.coupon || ''}" placeholder="Enter code"><button class="sec">Apply</button></div></form><div id="cf-err"></div>${billHtml(c.bill)}</div>
  <div class="box"><h3>Delivery &amp; Payment</h3><form id="co"><label>Delivery address</label><select name="addressIndex" id="ai"><option value="">Enter a new address</option>${pr.addresses.map((a, i) => `<option value="${i}">${a.label}: ${a.name}, ${a.address} - ${a.pin}</option>`).join('')}</select>
  <div id="newaddr"><label>Full name</label><input name="name"><label>Phone</label><input name="phone" inputmode="numeric"><label>Address</label><input name="address"><label>PIN code</label><input name="pin" inputmode="numeric"></div>
  <label>Payment</label><select name="payment"><option value="COD" ${pr.payment && pr.payment.mode === 'COD' ? 'selected' : ''}>Cash on Delivery</option><option value="UPI" ${pr.payment && pr.payment.mode === 'UPI' ? 'selected' : ''}>UPI</option></select>
  <label>UPI id (only for UPI)</label><input name="upi" value="${pr.payment && pr.payment.upi || ''}" placeholder="name@bank"><br><br><button class="pri">Place Order</button></form><div id="co-err"></div></div>`;
  $('#ai').onchange = () => { $('#newaddr').hidden = $('#ai').value !== ''; };
  document.querySelectorAll('[data-q]').forEach(i => i.onchange = async () => { try { await api('cart/set', { id: +i.dataset.q, qty: +i.value }); } catch (e) { toast(e.message); } go('cart'); });
  document.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => { await api('cart/set', { id: +b.dataset.rm, qty: 0 }); go('cart'); });
  form('#cf', async d => { await api('cart/coupon', d); go('cart'); });
  form('#co', async d => { const o = await api('checkout', d); cartCount = 0; nav(); cart(`<h2>Your Cart</h2><div class="ok"><h3>Order #${o.id} placed successfully</h3><p>Payment: ${o.payment} | Total: ${rs(o.bill.total)}</p><p>Delivering to ${o.ship.name}, ${o.ship.address} - ${o.ship.pin}</p><p>Open <b>My Orders</b> to track it.</p></div>`); });
}

// ---------- FR8, FR9 ----------
async function orders(trackId) {
  if (!me) return needLogin(); const o = await api('orders');
  $('#main').innerHTML = '<h2>My Orders</h2>' + (o.length ? `<table><tr><th>Order</th><th>Items</th><th>Total</th><th>Status</th><th>Actions</th></tr>${o.map(x => `<tr><td>#${x.id}</td><td>${x.lines.map(l => l.name + ' x' + l.qty).join(', ')}</td><td>${rs(x.bill.total)}</td><td><span class="tag ${x.status}">${x.status}</span></td>
  <td class="flex"><button class="sec" data-tr="${x.id}">Track</button>${x.status === 'PLACED' ? `<button class="dng" data-c="${x.id}">Cancel</button>` : ''}<button class="sec" data-ro="${x.id}">Reorder</button></td></tr>`).join('')}</table><div id="trk"></div>` : '<p>No orders yet.</p>');
  const show = async id => { const t = await api('track?id=' + id), at = t.history.map(h => h.status); $('#trk').innerHTML = `<div class="box"><h3>Tracking order #${t.id}: ${t.status}</h3><div class="steps">${t.stages.map(s => `<span class="step ${at.includes(s) ? 'done' : ''}">${at.includes(s) ? '&#10003; ' : ''}${s}</span>`).join('')}</div>${t.status === 'CANCELLED' ? '<div class="err">This order was cancelled.</div>' : ''}<div class="note">${t.history.map(h => h.status + ' at ' + new Date(h.at).toLocaleString()).join(' | ')}</div></div>`; };
  document.querySelectorAll('[data-tr]').forEach(b => b.onclick = () => show(b.dataset.tr));
  document.querySelectorAll('[data-c]').forEach(b => b.onclick = async () => { try { await api('orders/cancel', { id: +b.dataset.c }); toast('Order cancelled, stock restored'); } catch (e) { toast(e.message); } go('orders'); });
  document.querySelectorAll('[data-ro]').forEach(b => b.onclick = async () => { try { const r = await api('orders/reorder', { id: +b.dataset.ro }); toast('Added to cart: ' + r.added.join(', ')); await refreshCount(); nav(); } catch (e) { toast(e.message); } });
  if (trackId) show(trackId);
}

// ---------- FR5, FR12 ----------
async function profile() {
  if (!me) return needLogin(); const p = await api('profile');
  $('#main').innerHTML = `<h2>My Profile</h2><div class="box"><b>${p.username}</b><br>Email: ${p.email}<br>Phone: ${p.phone}</div><div class="two"><div class="box"><h3>Saved addresses</h3>${p.addresses.length ? p.addresses.map((a, i) => `<div class="row"><span>${a.label}: ${a.name}, ${a.address} - ${a.pin}</span><button class="dng" data-ra="${i}">Delete</button></div>`).join('') : '<p class="note">No saved address yet.</p>'}
  <form id="af"><label>Label</label><input name="label" value="Home"><label>Full name</label><input name="name"><label>Phone</label><input name="phone"><label>Address</label><input name="address"><label>PIN code</label><input name="pin"><br><br><button class="pri">Save address</button></form><div id="af-err"></div></div>
  <div class="box"><h3>Preferred payment</h3><p class="note">Current: ${p.payment ? p.payment.mode + (p.payment.upi ? ' (' + p.payment.upi + ')' : '') : 'not set'}. Card numbers are never stored.</p><form id="pf"><label>Mode</label><select name="mode"><option>COD</option><option>UPI</option></select><label>UPI id (for UPI)</label><input name="upi" placeholder="name@bank"><br><br><button class="pri">Save payment mode</button></form><div id="pf-err"></div>
  <h3>Delete account</h3><form id="df"><label>Confirm with your password</label><input name="password" type="password"><br><br><button class="dng">Delete my account</button></form><div id="df-err"></div></div></div>`;
  document.querySelectorAll('[data-ra]').forEach(b => b.onclick = async () => { await api('profile/address/remove', { index: +b.dataset.ra }); go('profile'); });
  form('#af', async d => { await api('profile/address', d); toast('Address saved'); go('profile'); });
  form('#pf', async d => { await api('profile/payment', d); toast('Payment mode saved'); go('profile'); });
  form('#df', async d => { await api('me/delete', d); me = null; cartCount = 0; toast('Account deleted'); go('shop'); });
}

// ---------- FR10 ----------
async function help() {
  const c = await api('care'), mine = me ? await api('complaints') : [];
  $('#main').innerHTML = `<h2>Help &amp; Customer Care</h2><div class="box"><b>Call customer care:</b> ${c.phone} (${c.hours})<br><b>Email:</b> ${c.email}</div>
  ${me ? `<div class="box"><h3>Raise a complaint or ask for help</h3><form id="hf"><label>Subject</label><input name="subject"><label>Message</label><input name="message"><br><br><button class="pri">Submit</button></form><div id="hf-err"></div></div>
  <div class="box"><h3>My requests</h3>${mine.length ? mine.map(x => `<div class="row"><span><b>#${x.id} ${x.subject}</b> - ${x.message}${x.reply ? '<br><i>Reply: ' + x.reply + '</i>' : ''}</span><span class="tag ${x.status === 'OPEN' ? 'PLACED' : 'CANCELLED'}" style="background:${x.status === 'OPEN' ? '#b45309' : '#0f766e'}">${x.status}</span></div>`).join('') : '<p class="note">No requests yet.</p>'}</div>` : '<div class="box">Log in to raise a complaint.</div>'}`;
  if (me) form('#hf', async d => { await api('complaints', d); toast('Complaint submitted'); go('help'); });
}

// ---------- FR11 admin ----------
async function admin() {
  if (!me || me.role !== 'admin') return needLogin(); const ps = await api('products'), os = await api('admin/orders'), cs = await api('admin/complaints');
  $('#main').innerHTML = `<h2>Admin Panel</h2><div class="box"><h3>Add product</h3><form id="pa" class="flex"><input name="name" placeholder="Name"><input name="category" placeholder="Type"><input name="color" placeholder="Colour"><input name="price" type="number" placeholder="Price"><input name="stock" type="number" placeholder="Stock"><button class="pri">Add</button></form><div id="pa-err"></div></div>
  <div class="box"><h3>Products</h3><table><tr><th>ID</th><th>Name</th><th>Price</th><th>Stock</th><th></th></tr>${ps.map(p => `<tr><td>${p.id}</td><td>${p.name}</td><td>${rs(p.price)}</td><td>${p.stock === 0 ? '<b style="color:#b91c1c">Sold out</b>' : p.stock}</td><td class="flex"><button class="sec" data-rs="${p.id}">+10 stock</button><button class="dng" data-rp="${p.id}">Remove</button></td></tr>`).join('')}</table></div>
  <div class="box"><h3>Orders</h3>${os.length ? os.map(o => `<div class="row"><span>#${o.id} (${o.user}) ${rs(o.bill.total)} <span class="tag ${o.status}">${o.status}</span></span><button class="sec" data-ad="${o.id}">Move to next stage</button></div>`).join('') : '<p class="note">No orders.</p>'}</div>
  <div class="box"><h3>Complaints</h3>${cs.length ? cs.map(x => `<div class="row"><span>#${x.id} ${x.user}: ${x.subject} - ${x.message} [${x.status}]</span><button class="sec" data-cr="${x.id}">Reply</button></div>`).join('') : '<p class="note">No complaints.</p>'}</div><div id="ad-err"></div>`;
  const run = async f => { try { await f(); } catch (e) { toast(e.message); } go('admin'); };
  document.querySelectorAll('[data-rs]').forEach(b => b.onclick = () => run(() => api('admin/restock', { id: +b.dataset.rs, qty: 10 })));
  document.querySelectorAll('[data-rp]').forEach(b => b.onclick = () => run(() => api('admin/product/remove', { id: +b.dataset.rp })));
  document.querySelectorAll('[data-ad]').forEach(b => b.onclick = () => run(() => api('admin/order/advance', { id: +b.dataset.ad })));
  document.querySelectorAll('[data-cr]').forEach(b => b.onclick = () => run(() => api('admin/complaints/resolve', { id: +b.dataset.cr, reply: prompt('Reply to the customer') || '' })));
  form('#pa', async d => { await api('admin/product', d); toast('Product added'); go('admin'); });
}

(async () => {
  try { me = await api('me'); } catch {}
  await refreshCount();
  go('shop');
})();
