# QuickCart 🛒

A full-stack, zero-dependency e-commerce shopping cart web application built with vanilla Node.js, native ES modules/commonjs, and modern browser standards.

---

## 📋 Table of Contents
- [Overview](#overview)
- [Key Features](#key-features)
- [Project Architecture](#project-architecture)
- [Getting Started](#getting-started)
- [API Documentation](#api-documentation)
- [Testing](#testing)
- [Screenshots & Documentation](#screenshots--documentation)
- [Security & Performance](#security--performance)

---

## 🌟 Overview

QuickCart is a lightweight yet fully-featured online shopping platform designed without bloated third-party frameworks. It features a complete business logic engine (`shop.js`), a lightweight HTTP server (`server.js`), a responsive UI (`public/`), and a test suite covering 98 functional and non-functional requirements.

---

## ✨ Key Features

### 👤 User Account & Profile Management
- **Registration & Validation**: Strict input validation for usernames, phone numbers, and email addresses.
- **Secure Authentication**: Salted `scrypt` password hashing, protection against brute-force login attacks (locks out after 5 consecutive failed attempts).
- **Address Book**: Save and manage up to 5 delivery addresses with PIN code verification.
- **Payment Preferences**: Save preferred payment methods (UPI ID or COD).
- **Account Lifecycle**: Self-service account deletion with password verification and order history anonymization.

### 🛍️ Catalogue, Search & Discovery
- **Live Search & Filter**: Real-time filtering by category, colour, price range, and sorting by price or name.
- **Zero External Dependencies**: Fast in-memory catalog search (<50 ms for 10,000 items).
- **Product Sharing**: One-click product sharing links.

### 🧺 Cart, Wishlist & Billing
- **Cart Controls**: Add items, set quantities (up to stock limit or max 10), and remove items.
- **Wishlist Integration**: Save favorite items and move them directly to the shopping cart.
- **Automated Billing Engine**:
  - 18% GST calculation
  - Delivery charge of ₹40 (free shipping for orders above ₹500)
  - Promo code discounts: `SAVE10` (10% off) and `FLAT100` (₹100 off on ₹1000+ orders).

### 📦 Orders & Tracking
- **Order Placement**: Multi-payment support (COD with ₹10,000 cap, UPI validation).
- **Order Lifecycle**: Order status progression (`PLACED` → `PACKED` → `SHIPPED` → `DELIVERED`).
- **Cancellations & Reordering**: Cancel placed orders (automatically restores inventory) or reorder previous carts with 1 click.

### 🛠️ Admin Dashboard & Support
- **Inventory Management**: Add new products, restock items, and remove sold-out items.
- **Order Advancement**: Advance order delivery stages.
- **Customer Care**: In-app ticketing system for customers to file and track grievances.

---

## 📁 Project Architecture

```
QuickCart_Source/
├── public/                 # Static frontend assets
│   ├── app.js              # Client-side UI logic and DOM manipulation
│   ├── index.html          # Semantic HTML layout
│   └── style.css           # Responsive modern styling
├── shots/                  # Documentation screenshots and UI regression runs
│   ├── doc_1_auth.png      # Auth screens
│   ├── doc_2_filter.png    # Product filtering
│   ├── doc_3_wishlist.png  # Wishlist view
│   ├── doc_4_cart.png      # Cart & coupons
│   ├── doc_5_error.png     # Validation feedback
│   ├── doc_6_profile.png   # Profile & saved details
│   ├── doc_7_confirm.png   # Order confirmation
│   ├── doc_8_admin.png     # Admin dashboard
│   ├── doc_9_track.png     # Order tracking
│   ├── doc_10_help.png     # Customer support
│   └── run.js              # Playwright browser automation & UI verification
├── tests/
│   └── shop.test.js        # 98 automated unit and HTTP integration tests
├── .gitignore              # Ignored files and artifacts
├── package.json            # Project manifest & scripts
├── README.md               # Documentation
├── server.js               # Native Node.js HTTP server & REST API
└── shop.js                 # Core e-commerce domain models & persistence
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js version 18.0.0 or higher.
- No npm dependencies required to run the core app or test suite!

### Installation & Run

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Akshyat-2007/cart-assignment.git
   cd cart-assignment
   ```

2. **Start the application**:
   ```bash
   npm start
   ```
   Or directly:
   ```bash
   node server.js
   ```

3. Open your browser and navigate to:
   ```
   http://localhost:8080
   ```

### Default Credentials
- **Admin**: Username: `admin` | Password: `admin123`
- **Customer**: Register any new account through the UI or test accounts.

---

## 🧪 Testing

The project uses the built-in Node.js test runner (`node:test` and `node:assert/strict`).

Run all 98 unit and integration tests:
```bash
npm test
```

Test coverage includes:
- **FR1–FR12**: Functional test suites (registration, authentication, catalogue search, wishlist, cart billing, ordering, cancellation, complaints, admin controls, account deletion).
- **NFR1–NFR3**: Non-functional tests (password hashing salts, session cookie security, custom header verification, concurrency/overselling prevention, high-throughput search, data persistence).

---

## 🔒 Security & Performance

- **Zero External Dependencies**: Minimal attack surface, zero vulnerable transitive packages.
- **Session Security**: Session cookies configured with `HttpOnly`, `SameSite=Strict`.
- **CSRF Mitigation**: Mutating HTTP requests require the `X-Requested-With: quickcart` header.
- **Safe Password Storage**: Passwords hashed using Node.js `crypto.scryptSync` with unique cryptographic salts.
- **Concurrency Control**: Prevents stock overselling during simultaneous checkout spikes.
- **Persistence**: ACID-safe atomic JSON file persistence across server restarts.

---

## 📄 License

ISC License.
