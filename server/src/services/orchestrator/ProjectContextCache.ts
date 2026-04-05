import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';
import { logger } from './OrchestratorLogger';

interface ProjectContext {
  generatedAt: string;
  gitChangedSince: number; // files changed since last generation
  structure: string;
  keyFiles: Record<string, string>;
  errorHotspots: string[];
  recentFixes: Array<{ file: string; pipelineId: string; date: string }>;
}

const CONTEXT_FILENAME = '.orchestrator-context.json';
const MAX_CHANGED_FILES_BEFORE_REFRESH = 10;

export class ProjectContextCache {
  /**
   * Get or generate project context for a given project path.
   * Returns a string suitable for inclusion in Claude Code prompts.
   */
  static getContext(projectPath: string): string {
    const contextPath = join(projectPath, CONTEXT_FILENAME);

    if (existsSync(contextPath)) {
      const cached = this.readCache(contextPath);
      if (cached && !this.needsRefresh(projectPath, cached)) {
        logger.debug(`Using cached context for ${projectPath}`);
        return this.formatForPrompt(cached);
      }
    }

    logger.info(`Generating fresh context for ${projectPath}`);
    const context = this.generateContext(projectPath);
    this.writeCache(contextPath, context);
    return this.formatForPrompt(context);
  }

  /**
   * Force regenerate context (e.g., after a significant code change).
   */
  static regenerate(projectPath: string): string {
    const contextPath = join(projectPath, CONTEXT_FILENAME);
    const context = this.generateContext(projectPath);
    this.writeCache(contextPath, context);
    return this.formatForPrompt(context);
  }

  /**
   * Add a recent fix record to the cache.
   */
  static addRecentFix(projectPath: string, file: string, pipelineId: string): void {
    const contextPath = join(projectPath, CONTEXT_FILENAME);
    if (!existsSync(contextPath)) return;

    const cached = this.readCache(contextPath);
    if (!cached) return;

    cached.recentFixes.unshift({ file, pipelineId, date: new Date().toISOString() });
    // Keep last 20 fixes
    cached.recentFixes = cached.recentFixes.slice(0, 20);
    this.writeCache(contextPath, cached);
  }

  private static readCache(path: string): ProjectContext | null {
    try {
      return JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
      return null;
    }
  }

  private static writeCache(path: string, context: ProjectContext): void {
    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify(context, null, 2), 'utf-8');
    } catch (err) {
      logger.warn(`Failed to write context cache: ${(err as Error).message}`);
    }
  }

  private static needsRefresh(projectPath: string, cached: ProjectContext): boolean {
    try {
      // Check how many files changed since context was generated
      const since = cached.generatedAt;
      const result = execSync(
        `git diff --name-only --diff-filter=ACMR HEAD`,
        { cwd: projectPath, encoding: 'utf-8', timeout: 10000 }
      );
      const changedFiles = result.trim().split('\n').filter(Boolean).length;
      return changedFiles > MAX_CHANGED_FILES_BEFORE_REFRESH;
    } catch {
      // If git fails, don't force refresh
      return false;
    }
  }

  private static generateContext(projectPath: string): ProjectContext {
    const keyFiles: Record<string, string> = {};
    const structure = this.detectStructure(projectPath);

    // Find key source files (entry points, routes, services, configs)
    const patterns = [
      'src/index.ts', 'src/index.js', 'src/app.ts', 'src/app.js',
      'src/server.ts', 'src/server.js', 'index.ts', 'index.js',
      'package.json',
    ];

    for (const pattern of patterns) {
      const fullPath = join(projectPath, pattern);
      if (existsSync(fullPath)) {
        keyFiles[pattern] = this.describeFile(pattern);
      }
    }

    // Discover routes, services, controllers
    // Discover directories for multiple tech stacks
    const srcDirs = [
      // Node.js / TypeScript
      'src/routes', 'src/services', 'src/controllers', 'src/middleware', 'src/api',
      'routes', 'services', 'controllers', 'middleware',
      // Python / Django / Flask
      'app', 'api', 'views', 'models', 'serializers', 'urls',
      // Java / Spring
      'src/main/java', 'src/main/resources',
      // Go
      'cmd', 'internal', 'pkg', 'handlers',
      // Ruby / Rails
      'app/controllers', 'app/models', 'app/services', 'app/views', 'config',
      // PHP / Laravel
      'app/Http/Controllers', 'app/Models', 'app/Services',
      // C# / .NET
      'Controllers', 'Services', 'Models',
    ];
    for (const dir of srcDirs) {
      const fullDir = join(projectPath, dir);
      try {
        if (!existsSync(fullDir)) continue;
        const files = readdirSync(fullDir).slice(0, 20);
        for (const file of files) {
          const relPath = `${dir}/${file}`;
          keyFiles[relPath] = this.describeFile(relPath);
        }
      } catch {
        // Directory doesn't exist or not readable, skip
      }
    }

    // Find error hotspots (files with most recent git changes)
    const errorHotspots: string[] = [];
    try {
      const gitLog = execSync(
        'git log --oneline --all --diff-filter=M --name-only -50',
        { cwd: projectPath, encoding: 'utf-8', timeout: 10000 }
      );
      const fileCounts: Record<string, number> = {};
      for (const line of gitLog.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && /\.(ts|js|py|go|java|rb|php|cs|rs|jsx|tsx)$/.test(trimmed) && !trimmed.includes('node_modules')) {
          fileCounts[trimmed] = (fileCounts[trimmed] || 0) + 1;
        }
      }
      const sorted = Object.entries(fileCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
      for (const [file] of sorted) {
        errorHotspots.push(file);
      }
    } catch {
      // Git log may fail on new repos
    }

    return {
      generatedAt: new Date().toISOString(),
      gitChangedSince: 0,
      structure,
      keyFiles,
      errorHotspots,
      recentFixes: [],
    };
  }

  private static detectStructure(projectPath: string): string {
    const indicators: string[] = [];
    const check = (file: string, label: string) => {
      if (existsSync(join(projectPath, file))) indicators.push(label);
    };

    // Node.js
    check('package.json', 'Node.js');
    check('tsconfig.json', 'TypeScript');
    // Python
    check('requirements.txt', 'Python');
    check('pyproject.toml', 'Python');
    check('setup.py', 'Python');
    check('Pipfile', 'Python');
    // Java / Kotlin
    check('pom.xml', 'Java/Maven');
    check('build.gradle', 'Java/Gradle');
    check('build.gradle.kts', 'Kotlin/Gradle');
    // Go
    check('go.mod', 'Go');
    // Ruby
    check('Gemfile', 'Ruby');
    // C# / .NET
    check('*.csproj', 'C#/.NET');
    check('*.sln', 'C#/.NET');
    // PHP
    check('composer.json', 'PHP');
    // Rust
    check('Cargo.toml', 'Rust');

    // Detect frameworks from manifest files
    try {
      const pkg = JSON.parse(readFileSync(join(projectPath, 'package.json'), 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps['express']) indicators.push('Express');
      if (deps['@prisma/client']) indicators.push('Prisma');
      if (deps['react']) indicators.push('React');
      if (deps['next']) indicators.push('Next.js');
      if (deps['vue']) indicators.push('Vue');
      if (deps['fastify']) indicators.push('Fastify');
      if (deps['@nestjs/core']) indicators.push('NestJS');
      if (deps['koa']) indicators.push('Koa');
      if (deps['hapi'] || deps['@hapi/hapi']) indicators.push('Hapi');
    } catch {}

    // Python frameworks
    try {
      const req = readFileSync(join(projectPath, 'requirements.txt'), 'utf-8');
      if (req.includes('django') || req.includes('Django')) indicators.push('Django');
      if (req.includes('flask') || req.includes('Flask')) indicators.push('Flask');
      if (req.includes('fastapi') || req.includes('FastAPI')) indicators.push('FastAPI');
    } catch {}

    // PHP frameworks
    try {
      const composer = JSON.parse(readFileSync(join(projectPath, 'composer.json'), 'utf-8'));
      const deps = { ...composer.require, ...composer['require-dev'] };
      if (deps['laravel/framework']) indicators.push('Laravel');
      if (deps['symfony/framework-bundle']) indicators.push('Symfony');
    } catch {}

    // Ruby frameworks
    try {
      const gemfile = readFileSync(join(projectPath, 'Gemfile'), 'utf-8');
      if (gemfile.includes("'rails'") || gemfile.includes('"rails"')) indicators.push('Rails');
      if (gemfile.includes("'sinatra'")) indicators.push('Sinatra');
    } catch {}

    // Go frameworks
    try {
      const gomod = readFileSync(join(projectPath, 'go.mod'), 'utf-8');
      if (gomod.includes('gin-gonic/gin')) indicators.push('Gin');
      if (gomod.includes('gofiber/fiber')) indicators.push('Fiber');
      if (gomod.includes('labstack/echo')) indicators.push('Echo');
    } catch {}

    // Java frameworks
    try {
      const pom = readFileSync(join(projectPath, 'pom.xml'), 'utf-8');
      if (pom.includes('spring-boot')) indicators.push('Spring Boot');
    } catch {}

    return indicators.join(' + ') || 'Unknown';
  }

  private static describeFile(path: string): string {
    const name = path.split('/').pop() || path;
    if (name.includes('index')) return 'Entry point';
    if (name.includes('auth')) return 'Authentication';
    if (name.includes('error')) return 'Error handling';
    if (name.includes('route')) return 'API routes';
    if (name.includes('middleware')) return 'Middleware';
    if (name.includes('config')) return 'Configuration';
    if (name.includes('model')) return 'Data model';
    if (name.includes('service')) return 'Business logic';
    if (name.includes('controller')) return 'Request handler';
    if (name.includes('test') || name.includes('spec')) return 'Tests';
    return 'Source file';
  }

  /**
   * Format cached context into a prompt-friendly string.
   */
  private static formatForPrompt(context: ProjectContext): string {
    const lines: string[] = [
      `PROJECT STRUCTURE: ${context.structure}`,
      `Context generated: ${context.generatedAt}`,
      '',
      'KEY FILES:',
    ];

    for (const [path, desc] of Object.entries(context.keyFiles)) {
      lines.push(`  ${path} — ${desc}`);
    }

    if (context.errorHotspots.length > 0) {
      lines.push('', 'ERROR HOTSPOTS (frequently modified):');
      for (const file of context.errorHotspots) {
        lines.push(`  ${file}`);
      }
    }

    if (context.recentFixes.length > 0) {
      lines.push('', 'RECENT AUTO-FIXES:');
      for (const fix of context.recentFixes.slice(0, 5)) {
        lines.push(`  ${fix.file} — fixed on ${fix.date}`);
      }
    }

    return lines.join('\n');
  }
}
