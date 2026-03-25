const BLOCKED_KEYWORDS = [
  'DELETE', 'UPDATE', 'INSERT', 'DROP', 'TRUNCATE', 'ALTER',
  'CREATE', 'EXEC', 'EXECUTE', 'GRANT', 'REVOKE', 'DENY',
  'BACKUP', 'RESTORE', 'SHUTDOWN', 'DBCC', 'BULK', 'OPENROWSET',
  'OPENQUERY', 'xp_', 'sp_configure', 'RECONFIGURE',
];

const DANGEROUS_PATTERNS = [
  /;\s*(DELETE|UPDATE|INSERT|DROP|TRUNCATE|ALTER|EXEC)/i,
  /UNION\s+ALL\s+SELECT/i,
  /INTO\s+(OUTFILE|DUMPFILE)/i,
  /LOAD_FILE/i,
  /BENCHMARK\s*\(/i,
  /SLEEP\s*\(/i,
  /WAITFOR\s+DELAY/i,
  /--\s*$/m,
  /\/\*.*\*\//s,
];

export interface SafetyResult {
  safe: boolean;
  reason?: string;
  blockedKeywords?: string[];
}

export class SqlSafetyGuard {
  static validate(query: string): SafetyResult {
    const normalized = query.toUpperCase().trim();

    // Must start with SELECT or WITH (CTE)
    if (!normalized.startsWith('SELECT') && !normalized.startsWith('WITH')) {
      return { safe: false, reason: 'Only SELECT queries are allowed' };
    }

    // Check blocked keywords
    const found = BLOCKED_KEYWORDS.filter((kw) => {
      const regex = new RegExp(`\\b${kw}\\b`, 'i');
      return regex.test(normalized);
    });

    if (found.length > 0) {
      return { safe: false, reason: 'Query contains blocked keywords', blockedKeywords: found };
    }

    // Check dangerous patterns
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(query)) {
        return { safe: false, reason: `Query matches dangerous pattern: ${pattern.source}` };
      }
    }

    return { safe: true };
  }
}
