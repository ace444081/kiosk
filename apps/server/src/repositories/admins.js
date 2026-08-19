export class AdminRepository {
  constructor(db) {
    this.db = db;
  }

  findByUsername(username) {
    return (
      this.db.prepare('SELECT * FROM admins WHERE username = ? COLLATE NOCASE').get(username) ||
      null
    );
  }

  findById(id) {
    return this.db.prepare('SELECT * FROM admins WHERE id = ?').get(id) || null;
  }

  listStaff() {
    return this.db
      .prepare(
        `SELECT id, username, role, is_active
         FROM admins WHERE role = 'staff' ORDER BY username COLLATE NOCASE`,
      )
      .all();
  }

  create({ id, username, passwordHash, role = 'admin' }) {
    this.db
      .prepare('INSERT INTO admins (id, username, password_hash, role) VALUES (?, ?, ?, ?)')
      .run(id, username, passwordHash, role);
    return this.findById(id);
  }

  count() {
    return this.db.prepare('SELECT COUNT(*) AS n FROM admins').get().n;
  }
}
