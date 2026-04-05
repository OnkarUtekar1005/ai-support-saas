import { createHash } from 'crypto';

interface FingerprintInput {
  message: string;
  source: string;
  stack?: string | null;
}

export class ErrorFingerprint {
  /**
   * Generate a stable fingerprint for an error.
   * Same logical error → same fingerprint, even if line numbers shift.
   */
  static generate(input: FingerprintInput): string {
    const normalizedMessage = this.normalizeMessage(input.message);
    const topFrames = input.stack ? this.extractTopFrames(input.stack, 3) : '';

    const raw = `${normalizedMessage}|${input.source}|${topFrames}`;
    return createHash('sha256').update(raw).digest('hex').substring(0, 16);
  }

  /**
   * Normalize error message by stripping dynamic values.
   * "Cannot read property 'id' of undefined at row 42" → "Cannot read property of undefined at row"
   */
  private static normalizeMessage(message: string): string {
    return message
      // Remove UUIDs
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
      // Remove hex IDs
      .replace(/\b[0-9a-f]{24,}\b/gi, '<ID>')
      // Remove numbers (port numbers, line numbers, IDs)
      .replace(/\b\d+\b/g, '<N>')
      // Remove quoted strings (dynamic values like usernames, emails)
      .replace(/'[^']*'/g, "'<STR>'")
      .replace(/"[^"]*"/g, '"<STR>"')
      // Remove IP addresses
      .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '<IP>')
      // Collapse whitespace
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  /**
   * Extract top N stack frames as function+file (no line numbers).
   * "at UserService.getProfile (src/services/user.ts:45:12)" → "UserService.getProfile@src/services/user.ts"
   */
  private static extractTopFrames(stack: string, count: number): string {
    const frameRegex = /at\s+(?:(.+?)\s+\()?(.+?)(?::(\d+))?(?::(\d+))?\)?/g;
    const frames: string[] = [];
    let match;

    while ((match = frameRegex.exec(stack)) !== null && frames.length < count) {
      const fn = match[1] || 'anonymous';
      const file = match[2] || '';

      // Skip node_modules and internal frames
      if (file.includes('node_modules') || file.startsWith('node:')) continue;

      frames.push(`${fn}@${file}`);
    }

    return frames.join('|');
  }
}
