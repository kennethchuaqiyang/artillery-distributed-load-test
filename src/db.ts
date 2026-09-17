import Database from "better-sqlite3";

// Using SQLite here purely for zero-setup local practice.
// The SQL patterns (JOIN, UPDATE ... WHERE, transactions) are the same
// ones you'd validate against MySQL - that's the transferable skill.
export const db = new Database(":memory:");

db.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    region TEXT NOT NULL
  );

  CREATE TABLE orders (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    total REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

const insertUser = db.prepare(
  "INSERT INTO users (id, name, email, region) VALUES (?, ?, ?, ?)"
);
const insertOrder = db.prepare(
  "INSERT INTO orders (id, user_id, total, status) VALUES (?, ?, ?, ?)"
);

// Seed ~30 users across a couple of regions, some with multiple orders,
// some with none - deliberately messy, like real data.
const regions = ["SG", "MY", "TH"];
for (let i = 1; i <= 30; i++) {
  insertUser.run(i, `User ${i}`, `user${i}@example.com`, regions[i % 3]);
}
let orderId = 1;
for (let i = 1; i <= 30; i++) {
  const numOrders = i % 5; // some users get 0 orders on purpose
  for (let j = 0; j < numOrders; j++) {
    insertOrder.run(orderId++, i, Math.round(Math.random() * 1000), "pending");
  }
}

// --- Practice ground for JOIN + UPDATE scoping ---
// Example of the exact pattern you were validating at Shopee:
// flag high-value SG orders. Try changing the WHERE/JOIN here and
// re-running scripts/preview-update.ts to see row counts change.
export function previewFlagQuery() {
  return db
    .prepare(
      `SELECT o.id, o.user_id, o.total, u.region
       FROM orders o
       JOIN users u ON o.user_id = u.id
       WHERE u.region = 'SG' AND o.total > 500`
    )
    .all();
}

export function runFlagUpdate() {
  const tx = db.transaction(() => {
    const result = db
      .prepare(
        `UPDATE orders
         SET status = 'flagged'
         WHERE id IN (
           SELECT o.id FROM orders o
           JOIN users u ON o.user_id = u.id
           WHERE u.region = 'SG' AND o.total > 500 AND o.status != 'flagged'
         )`
      )
      .run();
    return result.changes;
  });
  return tx();
}
