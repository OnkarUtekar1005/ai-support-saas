export interface FileRef {
  file: string;
  line: number | null;
  column: number | null;
  fn: string;
}

type Language = 'javascript' | 'python' | 'java' | 'go' | 'ruby' | 'csharp' | 'php' | 'rust' | 'unknown';

/**
 * Universal stack trace parser — supports 8 languages with auto-detection.
 */
export class StackTraceParser {
  /**
   * Parse a stack trace. Auto-detects language if not specified.
   */
  static parse(stack: string, language?: string): FileRef[] {
    const lang = (language as Language) || this.detectLanguage(stack);
    const parser = this.parsers[lang] || this.parseGeneric;
    const refs = parser(stack);
    return this.dedup(refs);
  }

  /**
   * Auto-detect language from stack trace format.
   */
  static detectLanguage(stack: string): Language {
    // JavaScript/Node.js: "at Function (file:line:col)"
    if (/^\s+at\s+.+\(.+:\d+:\d+\)/m.test(stack)) return 'javascript';
    // Python: 'File "path", line N'
    if (/File ".+", line \d+/m.test(stack)) return 'python';
    // Java: "at pkg.Class.method(File.java:line)"
    if (/at\s+[\w$.]+\([\w]+\.java:\d+\)/m.test(stack)) return 'java';
    // Go: "file.go:line"
    if (/\.go:\d+/m.test(stack)) return 'go';
    // Ruby: "path.rb:line:in"
    if (/\.rb:\d+:in/m.test(stack)) return 'ruby';
    // C#: "in file.cs:line N"
    if (/in\s+.+\.cs:line\s+\d+/m.test(stack) || /\.cs:\d+/m.test(stack)) return 'csharp';
    // PHP: "#N path.php(line)"
    if (/#\d+\s+.+\.php\(\d+\)/m.test(stack)) return 'php';
    // Rust: ".rs:line"
    if (/\.rs:\d+/m.test(stack)) return 'rust';
    return 'unknown';
  }

  static extractFilePaths(stack: string, language?: string): string[] {
    return this.parse(stack, language).map(ref => ref.file);
  }

  static buildFileContext(stack: string, language?: string): string {
    const refs = this.parse(stack, language);
    if (refs.length === 0) return 'No file references found in stack trace.';

    const lang = (language as Language) || this.detectLanguage(stack);
    const lines: string[] = [`AFFECTED FILES (${lang} stack trace):`];
    refs.forEach((ref, i) => {
      const label = i === 0 ? 'PRIMARY (error origin)' : 'CALLER';
      const lineInfo = ref.line ? `:${ref.line}` : '';
      lines.push(`  - ${ref.file}${lineInfo} — ${label} [${ref.fn}]`);
    });
    return lines.join('\n');
  }

  // ─── Language-specific parsers ───

  private static parsers: Record<Language, (stack: string) => FileRef[]> = {
    javascript: StackTraceParser.parseJavaScript,
    python: StackTraceParser.parsePython,
    java: StackTraceParser.parseJava,
    go: StackTraceParser.parseGo,
    ruby: StackTraceParser.parseRuby,
    csharp: StackTraceParser.parseCSharp,
    php: StackTraceParser.parsePHP,
    rust: StackTraceParser.parseRust,
    unknown: StackTraceParser.parseGeneric,
  };

  /** JavaScript/Node.js: at Fn (file:line:col) */
  private static parseJavaScript(stack: string): FileRef[] {
    const refs: FileRef[] = [];
    const regex = /at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?/g;
    let match;
    while ((match = regex.exec(stack)) !== null) {
      const file = match[2];
      if (StackTraceParser.isInternal(file, ['node_modules', 'node:', 'internal/'])) continue;
      refs.push({ file: StackTraceParser.normalizePath(file), line: +match[3], column: +match[4], fn: match[1] || 'anonymous' });
    }
    return refs;
  }

  /** Python: File "path", line N, in fn */
  private static parsePython(stack: string): FileRef[] {
    const refs: FileRef[] = [];
    const regex = /File "(.+?)", line (\d+)(?:, in (.+))?/g;
    let match;
    while ((match = regex.exec(stack)) !== null) {
      const file = match[1];
      if (StackTraceParser.isInternal(file, ['site-packages', '/lib/python', '<frozen'])) continue;
      refs.push({ file: StackTraceParser.normalizePath(file), line: +match[2], column: null, fn: match[3] || 'module' });
    }
    return refs;
  }

  /** Java: at pkg.Class.method(File.java:line) */
  private static parseJava(stack: string): FileRef[] {
    const refs: FileRef[] = [];
    const regex = /at\s+([\w$.]+)\(([\w]+\.java):(\d+)\)/g;
    let match;
    while ((match = regex.exec(stack)) !== null) {
      const qualifiedName = match[1];
      const fileName = match[2];
      // Convert com.app.UserService.get → com/app/UserService.java
      const parts = qualifiedName.split('.');
      parts.pop(); // remove method name
      const filePath = parts.join('/') + '/' + fileName;
      const fn = qualifiedName.split('.').pop() || 'method';
      if (StackTraceParser.isInternal(qualifiedName, ['java.', 'javax.', 'sun.', 'org.springframework.aop'])) continue;
      refs.push({ file: filePath, line: +match[3], column: null, fn });
    }
    return refs;
  }

  /** Go: goroutine/file.go:line +0xNN or pkg.Fn(args)\n\tfile.go:line */
  private static parseGo(stack: string): FileRef[] {
    const refs: FileRef[] = [];
    // Match: /path/to/file.go:line
    const regex = /\t?(.+\.go):(\d+)/g;
    let match;
    while ((match = regex.exec(stack)) !== null) {
      const file = match[1].trim();
      if (StackTraceParser.isInternal(file, ['/usr/local/go/', 'runtime/', 'vendor/'])) continue;
      refs.push({ file: StackTraceParser.normalizePath(file), line: +match[2], column: null, fn: 'func' });
    }
    // Try to extract function names from previous lines
    const fnRegex = /([\w./]+)\(.*\)\n\t(.+\.go):(\d+)/g;
    let fnMatch;
    while ((fnMatch = fnRegex.exec(stack)) !== null) {
      const fn = fnMatch[1].split('/').pop() || 'func';
      const file = fnMatch[2].trim();
      const existing = refs.find(r => r.file === StackTraceParser.normalizePath(file));
      if (existing) existing.fn = fn;
    }
    return refs;
  }

  /** Ruby: /path/file.rb:line:in 'method' */
  private static parseRuby(stack: string): FileRef[] {
    const refs: FileRef[] = [];
    const regex = /(.+\.rb):(\d+):in [`'](.+?)'/g;
    let match;
    while ((match = regex.exec(stack)) !== null) {
      const file = match[1].trim();
      if (StackTraceParser.isInternal(file, ['/gems/', '/ruby/', 'bundler/'])) continue;
      refs.push({ file: StackTraceParser.normalizePath(file), line: +match[2], column: null, fn: match[3] });
    }
    return refs;
  }

  /** C#/.NET: at Namespace.Class.Method() in /path/file.cs:line N */
  private static parseCSharp(stack: string): FileRef[] {
    const refs: FileRef[] = [];
    // Full format: at Ns.Class.Method() in file.cs:line N
    const regex = /at\s+([\w.]+)\(.*?\)\s+in\s+(.+?):line\s+(\d+)/g;
    let match;
    while ((match = regex.exec(stack)) !== null) {
      const fn = match[1].split('.').pop() || 'Method';
      const file = match[2].trim();
      if (StackTraceParser.isInternal(file, ['System.', 'Microsoft.'])) continue;
      refs.push({ file: StackTraceParser.normalizePath(file), line: +match[3], column: null, fn });
    }
    // Short format: file.cs:line
    if (refs.length === 0) {
      const shortRegex = /(.+\.cs):(\d+)/g;
      while ((match = shortRegex.exec(stack)) !== null) {
        refs.push({ file: StackTraceParser.normalizePath(match[1].trim()), line: +match[2], column: null, fn: 'method' });
      }
    }
    return refs;
  }

  /** PHP: #N /path/file.php(line): Class->method() */
  private static parsePHP(stack: string): FileRef[] {
    const refs: FileRef[] = [];
    const regex = /#\d+\s+(.+\.php)\((\d+)\)(?::\s+(.+))?/g;
    let match;
    while ((match = regex.exec(stack)) !== null) {
      const file = match[1].trim();
      if (StackTraceParser.isInternal(file, ['/vendor/', '/laravel/framework/'])) continue;
      const fn = match[3] ? match[3].split('(')[0].trim() : 'function';
      refs.push({ file: StackTraceParser.normalizePath(file), line: +match[2], column: null, fn });
    }
    return refs;
  }

  /** Rust: N: pkg::module::fn at src/file.rs:line */
  private static parseRust(stack: string): FileRef[] {
    const refs: FileRef[] = [];
    // "at src/file.rs:line:col"
    const regex = /at\s+(.+\.rs):(\d+)(?::(\d+))?/g;
    let match;
    while ((match = regex.exec(stack)) !== null) {
      const file = match[1].trim();
      if (StackTraceParser.isInternal(file, ['.cargo/registry', '/rustc/', 'std/src/'])) continue;
      refs.push({ file: StackTraceParser.normalizePath(file), line: +match[2], column: match[3] ? +match[3] : null, fn: 'fn' });
    }
    // Try extracting function names: "N: crate::module::fn"
    const fnRegex = /\d+:\s+([\w:]+)$/gm;
    let fnMatch;
    while ((fnMatch = fnRegex.exec(stack)) !== null) {
      const fn = fnMatch[1].split('::').pop() || 'fn';
      // Associate with the closest file ref (heuristic)
      if (refs.length > 0 && refs[refs.length - 1].fn === 'fn') {
        refs[refs.length - 1].fn = fn;
      }
    }
    return refs;
  }

  /** Generic fallback: match any file:line pattern */
  private static parseGeneric(stack: string): FileRef[] {
    const refs: FileRef[] = [];
    // Match file paths with line numbers
    const regex = /([\w/.\\-]+\.\w{1,5}):(\d+)/g;
    let match;
    while ((match = regex.exec(stack)) !== null) {
      const file = match[1];
      if (file.includes('node_modules') || file.startsWith('node:')) continue;
      refs.push({ file: StackTraceParser.normalizePath(file), line: +match[2], column: null, fn: 'unknown' });
    }
    return refs;
  }

  // ─── Helpers ───

  private static normalizePath(file: string): string {
    return file.replace(/\\/g, '/').replace(/^\/([A-Z]:)/, '$1').trim();
  }

  private static isInternal(path: string, patterns: string[]): boolean {
    return patterns.some(p => path.includes(p));
  }

  private static dedup(refs: FileRef[]): FileRef[] {
    const seen = new Set<string>();
    return refs.filter(ref => {
      if (seen.has(ref.file)) return false;
      seen.add(ref.file);
      return true;
    });
  }
}
