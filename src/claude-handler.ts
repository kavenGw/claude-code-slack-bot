import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { ConversationSession } from './types';
import { Logger } from './logger';
import { McpManager } from './mcp-manager';
import { config, getClaudeEnvDebugInfo } from './config';
import { ClaudeLocalHandler } from './claude-local-handler';

export class ClaudeHandler {
  private sessions: Map<string, ConversationSession> = new Map();
  private logger = new Logger('ClaudeHandler');
  private mcpManager: McpManager;
  private localHandler?: ClaudeLocalHandler;

  constructor(mcpManager: McpManager) {
    this.mcpManager = mcpManager;
    if (config.claude.mode === 'local') {
      this.localHandler = new ClaudeLocalHandler();
      this.logger.info('Using local Claude CLI mode');
    }
  }

  getSessionKey(userId: string, channelId: string, threadTs?: string): string {
    return `${userId}-${channelId}-${threadTs || 'direct'}`;
  }

  getSession(userId: string, channelId: string, threadTs?: string): ConversationSession | undefined {
    return this.sessions.get(this.getSessionKey(userId, channelId, threadTs));
  }

  createSession(userId: string, channelId: string, threadTs?: string): ConversationSession {
    const session: ConversationSession = {
      userId,
      channelId,
      threadTs,
      isActive: true,
      lastActivity: new Date(),
    };
    this.sessions.set(this.getSessionKey(userId, channelId, threadTs), session);
    return session;
  }

  async *streamQuery(
    prompt: string,
    session?: ConversationSession,
    abortController?: AbortController,
    workingDirectory?: string,
    slackContext?: { channel: string; threadTs?: string; user: string },
    appendSystemPrompt?: string,
  ): AsyncGenerator<SDKMessage, void, unknown> {
    if (this.localHandler) {
      yield* this.streamQueryLocal(prompt, session, abortController, workingDirectory, slackContext, appendSystemPrompt);
    } else {
      yield* this.streamQuerySDK(prompt, session, abortController, workingDirectory, slackContext, appendSystemPrompt);
    }
  }

  private async *streamQuerySDK(
    prompt: string,
    session?: ConversationSession,
    abortController?: AbortController,
    workingDirectory?: string,
    slackContext?: { channel: string; threadTs?: string; user: string },
    appendSystemPrompt?: string,
  ): AsyncGenerator<SDKMessage, void, unknown> {
    const systemPrompt: any = appendSystemPrompt
      ? { type: 'preset', preset: 'claude_code', append: appendSystemPrompt }
      : { type: 'preset', preset: 'claude_code' };

    const options: any = {
      abortController: abortController || new AbortController(),
      permissionMode: slackContext ? 'default' : 'bypassPermissions',
      allowDangerouslySkipPermissions: !slackContext,
      systemPrompt,
      settingSources: ['user', 'project', 'local'] as any,
      stderr: (data: string) => {
        this.logger.error('Claude CLI stderr', { stderr: data.trim() });
      },
    };

    if (slackContext) {
      options.permissionPromptToolName = 'mcp__permission-prompt__permission_prompt';
      this.logger.debug('Added permission prompt tool for Slack integration', slackContext);
    }

    if (workingDirectory) {
      options.cwd = workingDirectory;
    }

    // MCP servers
    const mcpServers = this.mcpManager.getServerConfiguration();

    if (slackContext) {
      const permissionServerPath = path.resolve(process.cwd(), 'src', 'permission-mcp-server.ts');
      const permissionServer = {
        'permission-prompt': {
          command: 'npx',
          args: ['tsx', permissionServerPath],
          env: {
            SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,
            SLACK_CONTEXT: JSON.stringify(slackContext),
          },
        },
      };

      options.mcpServers = mcpServers
        ? { ...mcpServers, ...permissionServer }
        : permissionServer;
    } else if (mcpServers && Object.keys(mcpServers).length > 0) {
      options.mcpServers = mcpServers;
    }

    if (options.mcpServers && Object.keys(options.mcpServers).length > 0) {
      const defaultMcpTools = this.mcpManager.getDefaultAllowedTools();
      if (slackContext) {
        defaultMcpTools.push('mcp__permission-prompt');
      }
      if (defaultMcpTools.length > 0) {
        options.allowedTools = defaultMcpTools;
      }

      this.logger.debug('Added MCP configuration to options', {
        serverCount: Object.keys(options.mcpServers).length,
        servers: Object.keys(options.mcpServers),
        allowedTools: defaultMcpTools,
        hasSlackContext: !!slackContext,
      });
    }

    if (session?.sessionId) {
      options.resume = session.sessionId;
      this.logger.debug('Resuming session', { sessionId: session.sessionId });
    } else {
      this.logger.debug('Starting new Claude conversation');
    }

    this.logger.debug('Claude query options', options);

    const envDebugInfo = getClaudeEnvDebugInfo();
    this.logger.info('Claude SDK environment state before query', envDebugInfo);
    this.logger.info('Starting Claude query (SDK mode)', {
      promptLength: prompt.length,
      promptPreview: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
      workingDirectory: options.cwd || 'not set',
      hasSessionId: !!options.resume,
      permissionMode: options.permissionMode,
      mcpServerCount: options.mcpServers ? Object.keys(options.mcpServers).length : 0,
      hasAppendSystemPrompt: !!appendSystemPrompt,
    });

    try {
      this.logger.debug('Calling @anthropic-ai/claude-agent-sdk query()...');
      for await (const message of query({ prompt, options })) {
        if (message.type === 'system' && message.subtype === 'init') {
          if (session) {
            session.sessionId = message.session_id;
            this.logger.info('Session initialized', {
              sessionId: message.session_id,
              model: (message as any).model,
              tools: (message as any).tools?.length || 0,
            });
          }
        }
        yield message;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Error in Claude query', error);
      this.logger.error('Error details', {
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage,
        workingDirectory: options.cwd,
        hasSessionId: !!options.resume,
        envState: getClaudeEnvDebugInfo(),
      });

      if (errorMessage.includes('exited with code')) {
        await this.diagnoseConnectionFailure();
      }

      throw error;
    }
  }

  private async *streamQueryLocal(
    prompt: string,
    session?: ConversationSession,
    abortController?: AbortController,
    workingDirectory?: string,
    slackContext?: { channel: string; threadTs?: string; user: string },
    appendSystemPrompt?: string,
  ): AsyncGenerator<SDKMessage, void, unknown> {
    // 构建 MCP config 临时文件（如果有 MCP servers）
    let mcpConfigPath: string | undefined;
    const mcpServers = this.mcpManager.getServerConfiguration();
    if (mcpServers && Object.keys(mcpServers).length > 0) {
      const tmpFile = path.join(os.tmpdir(), `claude-mcp-${Date.now()}.json`);
      fs.writeFileSync(tmpFile, JSON.stringify({ mcpServers }, null, 2));
      mcpConfigPath = tmpFile;
    }

    const allowedTools = this.mcpManager.getDefaultAllowedTools();

    const permissionMode = slackContext ? 'default' : 'bypassPermissions';

    this.logger.info('Starting Claude query (local CLI mode)', {
      promptLength: prompt.length,
      promptPreview: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
      workingDirectory: workingDirectory || 'not set',
      hasSessionId: !!session?.sessionId,
      permissionMode,
      hasMcpConfig: !!mcpConfigPath,
      hasAppendSystemPrompt: !!appendSystemPrompt,
    });

    try {
      for await (const message of this.localHandler!.streamQuery({
        prompt,
        cwd: workingDirectory,
        sessionId: session?.sessionId,
        abortController,
        appendSystemPrompt,
        allowedTools: allowedTools.length > 0 ? allowedTools : undefined,
        mcpConfigPath,
        permissionMode,
      })) {
        // 从 init 消息中捕获 session ID
        if (message.type === 'system' && (message as any).subtype === 'init') {
          if (session) {
            session.sessionId = message.session_id;
            this.logger.info('Session initialized (local)', {
              sessionId: message.session_id,
            });
          }
        }
        yield message;
      }
    } catch (error) {
      this.logger.error('Error in local Claude query', error);
      throw error;
    } finally {
      // 清理临时 MCP config 文件
      if (mcpConfigPath) {
        try {
          fs.unlinkSync(mcpConfigPath);
        } catch {
          // ignore
        }
      }
    }
  }

  private async diagnoseConnectionFailure() {
    const baseUrl = process.env.ANTHROPIC_BASE_URL;
    if (!baseUrl) return;

    this.logger.info('Diagnosing API endpoint connectivity...', { baseUrl });
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(baseUrl, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      this.logger.info('API endpoint reachable', {
        status: response.status,
        statusText: response.statusText,
      });
    } catch (fetchError) {
      this.logger.error('API endpoint unreachable', {
        baseUrl,
        error: fetchError instanceof Error ? fetchError.message : String(fetchError),
      });
    }
  }

  cleanupInactiveSessions(maxAge: number = 30 * 60 * 1000) {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, session] of this.sessions.entries()) {
      if (now - session.lastActivity.getTime() > maxAge) {
        this.sessions.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      this.logger.info(`Cleaned up ${cleaned} inactive sessions`);
    }
  }
}
