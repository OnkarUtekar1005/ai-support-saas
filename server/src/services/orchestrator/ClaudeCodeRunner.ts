import { spawn, ChildProcess } from 'child_process';
import { config } from './OrchestratorConfig';
import { logger } from './OrchestratorLogger';

export interface ClaudeResult {
  success: boolean;
  output: string;
  sessionId?: string;
  error?: string;
  exitCode: number | null;
}

export type StreamCallback = (chunk: string) => void;

export class ClaudeCodeRunner {
  /**
   * Run Claude Code in analysis mode (read-only, no changes).
   * Returns the analysis output and session ID for later --resume.
   */
  static async analyze(
    prompt: string,
    cwd: string,
    onStream?: StreamCallback
  ): Promise<ClaudeResult> {
    return this.run(prompt, cwd, { onStream });
  }

  /**
   * Run Claude Code to apply a fix.
   * Optionally resume a previous session to preserve context.
   */
  static async fix(
    prompt: string,
    cwd: string,
    options?: { resumeSessionId?: string; onStream?: StreamCallback }
  ): Promise<ClaudeResult> {
    return this.run(prompt, cwd, {
      resumeSessionId: options?.resumeSessionId,
      onStream: options?.onStream,
    });
  }

  /**
   * Kill a running Claude Code process.
   */
  static kill(process: ChildProcess): void {
    if (process && !process.killed) {
      process.kill('SIGTERM');
      // Force kill after 5 seconds
      setTimeout(() => {
        if (!process.killed) {
          process.kill('SIGKILL');
        }
      }, 5000);
    }
  }

  private static run(
    prompt: string,
    cwd: string,
    options?: {
      resumeSessionId?: string;
      onStream?: StreamCallback;
    }
  ): Promise<ClaudeResult> & { process?: ChildProcess } {
    const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20241022';
    const args: string[] = ['--print', '--dangerously-skip-permissions', '--model', model];

    if (options?.resumeSessionId) {
      args.push('--resume', options.resumeSessionId);
    }

    logger.info(`Starting Claude Code in ${cwd}`);
    logger.debug(`Args: ${args.join(' ')}`);
    logger.debug(`Prompt length: ${prompt.length} chars`);

    let childProcess: ChildProcess;

    const promise = new Promise<ClaudeResult>((resolve) => {
      childProcess = spawn(config.claudeCommand, args, {
        cwd,
        timeout: config.claudeTimeout,
        env: { ...process.env },
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Send prompt via stdin
      childProcess.stdin!.write(prompt);
      childProcess.stdin!.end();

      let stdout = '';
      let stderr = '';

      childProcess.stdout!.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;
        if (options?.onStream) {
          options.onStream(chunk);
        }
      });

      childProcess.stderr!.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stderr += chunk;
        // Claude Code outputs progress info to stderr — not always an error
      });

      childProcess.on('close', (code) => {
        logger.info(`Claude Code exited with code ${code}`);

        // Try to extract session ID from output
        const sessionId = this.extractSessionId(stdout + stderr);

        if (code === 0 || stdout.length > 0) {
          resolve({
            success: true,
            output: stdout || stderr,
            sessionId: sessionId || undefined,
            exitCode: code,
          });
        } else {
          resolve({
            success: false,
            output: stdout,
            error: stderr || `Exit code: ${code}`,
            sessionId: sessionId || undefined,
            exitCode: code,
          });
        }
      });

      childProcess.on('error', (err) => {
        logger.error(`Failed to start Claude Code: ${err.message}`);
        resolve({
          success: false,
          output: '',
          error: `Failed to start claude: ${err.message}`,
          exitCode: null,
        });
      });
    }) as Promise<ClaudeResult> & { process?: ChildProcess };

    // Attach the child process to the promise for external kill
    promise.process = childProcess!;
    return promise;
  }

  /**
   * Try to extract a session/conversation ID from Claude Code output.
   * Claude Code may output session info that can be used with --resume.
   */
  private static extractSessionId(output: string): string | null {
    // Claude Code outputs session ID in various formats
    // Look for patterns like "session: abc123" or conversation IDs
    const patterns = [
      /session[:\s]+([a-f0-9-]{36})/i,
      /conversation[:\s]+([a-f0-9-]{36})/i,
      /resume[:\s]+([a-f0-9-]{36})/i,
    ];

    for (const pattern of patterns) {
      const match = output.match(pattern);
      if (match) return match[1];
    }

    return null;
  }

  /**
   * Build a focused analysis prompt — stack-aware, minimizes token usage.
   */
  static buildAnalysisPrompt(
    errorMessage: string,
    errorStack: string | null,
    geminiAnalysis: string | null,
    projectContext: string,
    fileContext: string,
    stackConfig?: { language?: string; framework?: string; entryPoint?: string; sourceDir?: string; customPromptPrefix?: string; excludePaths?: string[] }
  ): string {
    const lang = stackConfig?.language;
    const fw = stackConfig?.framework;
    const stackDesc = lang ? `${lang}${fw ? ` (${fw})` : ''}` : 'software';

    return `You are analyzing a production error in a ${stackDesc} application. Auto-detect the language and framework from the code if not specified. Do NOT make any changes — only analyze.

${projectContext}
${stackConfig?.entryPoint ? `ENTRY POINT: ${stackConfig.entryPoint}` : ''}
${stackConfig?.sourceDir ? `SOURCE DIR: ${stackConfig.sourceDir}` : ''}
${stackConfig?.excludePaths?.length ? `DO NOT MODIFY: ${stackConfig.excludePaths.join(', ')}` : ''}

${stackConfig?.customPromptPrefix || ''}

ERROR:
${errorMessage}

${errorStack ? `STACK TRACE:\n${errorStack}` : ''}

${fileContext}

${geminiAnalysis ? `PREVIOUS AI ANALYSIS:\n${geminiAnalysis}` : ''}

INSTRUCTIONS:
1. Read ONLY the files listed above
2. Identify the root cause in this ${lang} codebase
3. Explain what specific change is needed to fix it
4. List the exact files and lines that need modification
5. Do NOT modify any files — analysis only
6. Auto-detect the programming language and framework from file extensions and code patterns
`;
  }

  /**
   * Build a focused fix prompt — stack-aware, minimizes token usage.
   */
  static buildFixPrompt(
    errorMessage: string,
    errorStack: string | null,
    geminiAnalysis: string | null,
    geminiSuggestion: string | null,
    claudeAnalysis: string | null,
    projectContext: string,
    fileContext: string,
    stackConfig?: { language?: string; framework?: string; entryPoint?: string; sourceDir?: string; testCommand?: string; customPromptPrefix?: string; excludePaths?: string[] }
  ): string {
    const lang = stackConfig?.language;
    const fw = stackConfig?.framework;
    const stackDesc = lang ? `${lang}${fw ? ` (${fw})` : ''}` : 'software';
    const testCmd = stackConfig?.testCommand || 'run available tests';

    return `You are fixing a production error in a ${stackDesc} application. Auto-detect the language and framework from the code if not specified. Apply the minimal change needed.

${projectContext}
${stackConfig?.entryPoint ? `ENTRY POINT: ${stackConfig.entryPoint}` : ''}
${stackConfig?.sourceDir ? `SOURCE DIR: ${stackConfig.sourceDir}` : ''}
${stackConfig?.excludePaths?.length ? `DO NOT MODIFY: ${stackConfig.excludePaths.join(', ')}` : ''}

${stackConfig?.customPromptPrefix || ''}

ERROR:
${errorMessage}

${fileContext}

${claudeAnalysis ? `YOUR PREVIOUS ANALYSIS:\n${claudeAnalysis}` : ''}
${geminiSuggestion ? `SUGGESTED FIX:\n${geminiSuggestion}` : ''}

INSTRUCTIONS:
1. Read ONLY the files listed above
2. Apply the minimal fix — do NOT refactor unrelated code
3. Do NOT explore or modify files outside the listed ones
4. Run tests: ${testCmd}
5. Explain what you changed and why
`;
  }
}
