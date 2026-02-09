import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { Logger } from './logger';
import { config } from './config';

export interface LocalQueryOptions {
  prompt: string;
  cwd?: string;
  sessionId?: string;
  abortController?: AbortController;
  appendSystemPrompt?: string;
  allowedTools?: string[];
  mcpConfigPath?: string;
  permissionMode?: string;
}

export class ClaudeLocalHandler {
  private logger = new Logger('ClaudeLocalHandler');

  findClaudeCli(): string {
    // 1. 环境变量指定的路径
    if (config.claude.cliPath && config.claude.cliPath !== 'claude') {
      if (fs.existsSync(config.claude.cliPath)) {
        return config.claude.cliPath;
      }
      this.logger.warn('CLAUDE_CLI_PATH not found, falling back to default', {
        path: config.claude.cliPath,
      });
    }

    // 2. 平台默认路径
    const platform = os.platform();
    const defaultPaths: string[] = [];

    if (platform === 'win32') {
      const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
      defaultPaths.push(
        path.join(localAppData, 'Programs', 'claude-code', 'claude.exe'),
        path.join(os.homedir(), '.npm-global', 'claude.cmd'),
      );
    } else {
      defaultPaths.push(
        '/usr/local/bin/claude',
        path.join(os.homedir(), '.local', 'bin', 'claude'),
        path.join(os.homedir(), '.npm-global', 'bin', 'claude'),
      );
    }

    for (const p of defaultPaths) {
      if (fs.existsSync(p)) {
        this.logger.info('Found claude CLI', { path: p });
        return p;
      }
    }

    // 3. 依赖 PATH
    return 'claude';
  }

  buildArgs(options: LocalQueryOptions): string[] {
    const args: string[] = [
      '--print', options.prompt,
      '--output-format', 'stream-json',
      '--verbose',
    ];

    if (options.sessionId) {
      args.push('--resume', options.sessionId);
    }

    if (options.permissionMode === 'bypassPermissions') {
      args.push('--dangerously-skip-permissions');
    }

    if (options.appendSystemPrompt) {
      args.push('--append-system-prompt', options.appendSystemPrompt);
    }

    if (options.allowedTools && options.allowedTools.length > 0) {
      args.push('--allowedTools', ...options.allowedTools);
    }

    if (options.mcpConfigPath) {
      args.push('--mcp-config', options.mcpConfigPath);
    }

    return args;
  }

  async *streamQuery(options: LocalQueryOptions): AsyncGenerator<SDKMessage, void, unknown> {
    const cliPath = this.findClaudeCli();
    const args = this.buildArgs(options);

    this.logger.info('Spawning claude CLI', {
      cliPath,
      cwd: options.cwd,
      argsPreview: args.slice(0, 6).join(' ') + (args.length > 6 ? ' ...' : ''),
    });

    const child: ChildProcess = spawn(cliPath, args, {
      cwd: options.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    // abort 处理
    if (options.abortController) {
      options.abortController.signal.addEventListener('abort', () => {
        this.logger.info('Aborting claude CLI process');
        child.kill('SIGTERM');
      });
    }

    // stderr 日志
    child.stderr?.on('data', (data: Buffer) => {
      this.logger.error('Claude CLI stderr', { stderr: data.toString().trim() });
    });

    // 逐行解析 stdout JSON
    let buffer = '';

    const messageQueue: SDKMessage[] = [];
    let resolve: (() => void) | null = null;
    let done = false;
    let exitError: Error | null = null;

    const pushMessage = (msg: SDKMessage) => {
      messageQueue.push(msg);
      if (resolve) {
        resolve();
        resolve = null;
      }
    };

    child.stdout?.on('data', (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed) as SDKMessage;
          pushMessage(msg);
        } catch {
          this.logger.debug('Non-JSON line from CLI', { line: trimmed.substring(0, 200) });
        }
      }
    });

    child.on('close', (code) => {
      // 处理 buffer 中剩余的数据
      if (buffer.trim()) {
        try {
          const msg = JSON.parse(buffer.trim()) as SDKMessage;
          pushMessage(msg);
        } catch {
          // ignore
        }
      }

      if (code !== 0 && code !== null) {
        exitError = new Error(`Claude CLI exited with code ${code}`);
        this.logger.error('Claude CLI exited with non-zero code', { code });
      }

      done = true;
      if (resolve) {
        resolve();
        resolve = null;
      }
    });

    child.on('error', (err) => {
      exitError = err;
      this.logger.error('Claude CLI spawn error', err);
      done = true;
      if (resolve) {
        resolve();
        resolve = null;
      }
    });

    // yield messages as they arrive
    while (true) {
      if (messageQueue.length > 0) {
        yield messageQueue.shift()!;
        continue;
      }

      if (done) {
        if (exitError) throw exitError;
        return;
      }

      await new Promise<void>((r) => {
        resolve = r;
      });
    }
  }
}
