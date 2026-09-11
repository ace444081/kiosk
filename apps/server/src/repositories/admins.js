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
         FROM admins WHERE role <> 'admin' ORDER BY username COLLATE NOCASE`,
      )
      .all();
  }

  listAll() {
    return this.db
      .prepare('SELECT * FROM admins ORDER BY full_name COLLATE NOCASE, username')
      .all();
  }

  countActiveAdmins() {
    return this.db
      .prepare("SELECT COUNT(*) AS n FROM admins WHERE role = 'admin' AND is_active = 1")
      .get().n;
  }

  create({
    id,
    username,
    passwordHash,
    role = 'admin',
    fullName = username,
    employeeId = null,
    email = null,
    mustChangePassword = false,
  }) {
    this.db
      .prepare(
        `INSERT INTO admins
          (id, username, password_hash, role, full_name, employee_id, email, must_change_password)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        username,
        passwordHash,
        role,
        fullName,
        employeeId,
        email,
        mustChangePassword ? 1 : 0,
      );
    return this.findById(id);
  }

  updateProfile(id, { fullName, role, email, isActive }, expectedVersion) {
    const fields = [];
    const values = [];
    if (fullName !== undefined) {
      fields.push('full_name = ?');
      values.push(fullName);
    }
    if (role !== undefined) {
      fields.push('role = ?');
      values.push(role);
    }
    if (email !== undefined) {
      fields.push('email = ?');
      values.push(email);
    }
    if (isActive !== undefined) {
      fields.push('is_active = ?');
      values.push(isActive ? 1 : 0);
    }
    if (!fields.length) return this.findById(id);
    fields.push('version = version + 1');
    fields.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')");
    const result = this.db
      .prepare(`UPDATE admins SET ${fields.join(', ')} WHERE id = ? AND version = ?`)
      .run(...values, id, expectedVersion);
    return result.changes ? this.findById(id) : null;
  }

  resetPassword(id, passwordHash, expectedVersion) {
    const result = this.db
      .prepare(
        `UPDATE admins SET password_hash = ?, must_change_password = 1,
           version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ? AND version = ?`,
      )
      .run(passwordHash, id, expectedVersion);
    return result.changes ? this.findById(id) : null;
  }

  touchLastLogin(id) {
    this.db
      .prepare(
        "UPDATE admins SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
      )
      .run(id);
  }

  count() {
    return this.db.prepare('SELECT COUNT(*) AS n FROM admins').get().n;
  }
}
