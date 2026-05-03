import { SqlSafetyGuard } from '../SqlSafetyGuard';

describe('SqlSafetyGuard', () => {
  describe('valid SELECT queries', () => {
    it('allows simple SELECT', () => {
      expect(SqlSafetyGuard.validate('SELECT * FROM users')).toEqual({ safe: true });
    });

    it('allows SELECT with WHERE', () => {
      expect(SqlSafetyGuard.validate("SELECT id, name FROM users WHERE id = '123'")).toEqual({ safe: true });
    });

    it('allows SELECT with JOIN', () => {
      const q = 'SELECT u.id, t.title FROM users u JOIN tickets t ON t.userId = u.id';
      expect(SqlSafetyGuard.validate(q)).toEqual({ safe: true });
    });

    it('allows WITH (CTE) queries', () => {
      const q = 'WITH recent AS (SELECT * FROM tickets WHERE createdAt > NOW() - INTERVAL 7 DAY) SELECT * FROM recent';
      expect(SqlSafetyGuard.validate(q)).toEqual({ safe: true });
    });

    it('allows lowercase select', () => {
      expect(SqlSafetyGuard.validate('select id from users')).toEqual({ safe: true });
    });

    it('allows SELECT with ORDER BY and LIMIT', () => {
      expect(SqlSafetyGuard.validate('SELECT id FROM tickets ORDER BY createdAt DESC LIMIT 20')).toEqual({ safe: true });
    });
  });

  describe('non-SELECT queries are blocked', () => {
    const nonSelect = ['INSERT INTO users VALUES (1)', 'UPDATE users SET name="x"', 'DELETE FROM users WHERE id=1', 'DROP TABLE users', 'TRUNCATE TABLE users', 'ALTER TABLE users ADD COLUMN x INT'];
    nonSelect.forEach((q) => {
      it(`blocks: ${q.substring(0, 30)}`, () => {
        const result = SqlSafetyGuard.validate(q);
        expect(result.safe).toBe(false);
      });
    });
  });

  describe('blocked keywords inside SELECT', () => {
    const keywords = ['DELETE', 'DROP', 'TRUNCATE', 'ALTER', 'INSERT', 'UPDATE', 'EXEC', 'EXECUTE', 'GRANT', 'REVOKE', 'BACKUP', 'RESTORE', 'SHUTDOWN'];
    keywords.forEach((kw) => {
      it(`blocks SELECT with ${kw}`, () => {
        const result = SqlSafetyGuard.validate(`SELECT * FROM users; ${kw} TABLE x`);
        expect(result.safe).toBe(false);
        expect(result.reason).toBeDefined();
      });
    });

    it('returns the blocked keywords list', () => {
      const result = SqlSafetyGuard.validate('SELECT * FROM users; DROP TABLE users');
      expect(result.safe).toBe(false);
      expect(result.blockedKeywords).toContain('DROP');
    });
  });

  describe('dangerous patterns', () => {
    it('blocks UNION ALL SELECT (exfiltration)', () => {
      const result = SqlSafetyGuard.validate('SELECT id FROM users UNION ALL SELECT password FROM admins');
      expect(result.safe).toBe(false);
    });

    it('blocks SQL line comments (--)', () => {
      const result = SqlSafetyGuard.validate("SELECT id FROM users WHERE 1=1 --");
      expect(result.safe).toBe(false);
    });

    it('blocks block comments (/* */)', () => {
      const result = SqlSafetyGuard.validate('SELECT /* injected */ * FROM users');
      expect(result.safe).toBe(false);
    });

    it('blocks WAITFOR DELAY (time-based injection)', () => {
      const result = SqlSafetyGuard.validate("SELECT 1; WAITFOR DELAY '0:0:5'");
      expect(result.safe).toBe(false);
    });

    it('blocks SLEEP()', () => {
      const result = SqlSafetyGuard.validate('SELECT SLEEP(5) FROM users');
      expect(result.safe).toBe(false);
    });
  });

  describe('SafetyResult structure', () => {
    it('returns { safe: true } for valid queries with no extra keys', () => {
      const result = SqlSafetyGuard.validate('SELECT 1');
      expect(result).toEqual({ safe: true });
    });

    it('returns reason when blocked', () => {
      const result = SqlSafetyGuard.validate('UPDATE users SET x=1');
      expect(result.safe).toBe(false);
      expect(typeof result.reason).toBe('string');
    });
  });
});
