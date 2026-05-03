import { EventEmitter } from 'events';
import { ClaudeCodeRunner } from '../ClaudeCodeRunner';

// Mock child_process before importing the module
jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

import { spawn } from 'child_process';
const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

function makeMockProcess(exitCode: number, stdout: string, stderr = '') {
  const proc = new EventEmitter() as any;
  proc.stdin = { write: jest.fn(), end: jest.fn() };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.killed = false;
  proc.kill = jest.fn();

  setImmediate(() => {
    proc.stdout.emit('data', Buffer.from(stdout));
    if (stderr) proc.stderr.emit('data', Buffer.from(stderr));
    proc.emit('close', exitCode);
  });

  return proc;
}

describe('ClaudeCodeRunner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('buildAnalysisPrompt', () => {
    it('includes error message', () => {
      const prompt = ClaudeCodeRunner.buildAnalysisPrompt(
        'TypeError: Cannot read properties of undefined',
        'at Object.<anonymous> (src/index.ts:42:5)',
        null, '', '', {}
      );
      expect(prompt).toContain('TypeError: Cannot read properties of undefined');
    });

    it('includes "Do NOT modify" instruction', () => {
      const prompt = ClaudeCodeRunner.buildAnalysisPrompt('err', null, null, '', '', {});
      expect(prompt.toLowerCase()).toContain('do not');
    });

    it('includes gemini analysis when provided', () => {
      const prompt = ClaudeCodeRunner.buildAnalysisPrompt('err', null, 'Root cause: null ref', '', '', {});
      expect(prompt).toContain('Root cause: null ref');
    });

    it('includes stack trace when provided', () => {
      const prompt = ClaudeCodeRunner.buildAnalysisPrompt('err', 'at foo (bar.ts:10)', null, '', '', {});
      expect(prompt).toContain('at foo (bar.ts:10)');
    });

    it('describes the language/framework in the prompt', () => {
      const prompt = ClaudeCodeRunner.buildAnalysisPrompt('err', null, null, '', '', { language: 'python', framework: 'django' });
      expect(prompt).toContain('python');
      expect(prompt).toContain('django');
    });
  });

  describe('buildFixPrompt', () => {
    it('includes error message', () => {
      const prompt = ClaudeCodeRunner.buildFixPrompt('NullPointerException', null, null, null, null, '', '', {});
      expect(prompt).toContain('NullPointerException');
    });

    it('includes minimal-change instruction', () => {
      const prompt = ClaudeCodeRunner.buildFixPrompt('err', null, null, null, null, '', '', {});
      expect(prompt.toLowerCase()).toContain('minimal');
    });

    it('includes claude analysis when provided', () => {
      const prompt = ClaudeCodeRunner.buildFixPrompt('err', null, null, null, 'Previous analysis: bad ref', '', '', {});
      expect(prompt).toContain('Previous analysis: bad ref');
    });

    it('includes test command', () => {
      const prompt = ClaudeCodeRunner.buildFixPrompt('err', null, null, null, null, '', '', { testCommand: 'pytest' });
      expect(prompt).toContain('pytest');
    });
  });

  describe('analyze()', () => {
    it('returns success: true when Claude exits with code 0', async () => {
      const proc = makeMockProcess(0, 'Analysis: the bug is in line 42');
      mockSpawn.mockReturnValue(proc);

      const result = await ClaudeCodeRunner.analyze('analyze this bug', '/tmp/project');
      expect(result.success).toBe(true);
      expect(result.output).toContain('Analysis');
    });

    it('calls spawn with --print and --dangerously-skip-permissions flags', async () => {
      const proc = makeMockProcess(0, 'done');
      mockSpawn.mockReturnValue(proc);

      await ClaudeCodeRunner.analyze('prompt', '/tmp');
      expect(mockSpawn).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['--print', '--dangerously-skip-permissions']),
        expect.any(Object)
      );
    });

    it('returns session ID when present in output', async () => {
      const sessionId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const proc = makeMockProcess(0, `session: ${sessionId}`);
      mockSpawn.mockReturnValue(proc);

      const result = await ClaudeCodeRunner.analyze('prompt', '/tmp');
      expect(result.sessionId).toBe(sessionId);
    });
  });

  describe('fix()', () => {
    it('returns success: false when Claude exits with non-zero code and no stdout', async () => {
      const proc = makeMockProcess(1, '', 'fatal error');
      mockSpawn.mockReturnValue(proc);

      const result = await ClaudeCodeRunner.fix('fix the bug', '/tmp');
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it('includes --resume flag when resumeSessionId is provided', async () => {
      const proc = makeMockProcess(0, 'fixed');
      mockSpawn.mockReturnValue(proc);

      await ClaudeCodeRunner.fix('fix it', '/tmp', { resumeSessionId: 'session-123' });
      expect(mockSpawn).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['--resume', 'session-123']),
        expect.any(Object)
      );
    });
  });

  describe('kill()', () => {
    it('sends SIGTERM to the process', () => {
      const proc = makeMockProcess(0, '');
      ClaudeCodeRunner.kill(proc);
      expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('does not kill already-killed processes', () => {
      const proc = makeMockProcess(0, '');
      proc.killed = true;
      ClaudeCodeRunner.kill(proc);
      expect(proc.kill).not.toHaveBeenCalled();
    });
  });
});
