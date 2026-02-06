import * as path from 'path';
import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { ConversationSession } from './types';
import { Logger } from './logger';
import { McpManager, McpServerConfig } from './mcp-manager';
import { getClaudeEnvDebugInfo } from './config';

export class ClaudeHandler {
  private sessions: Map<string, ConversationSession> = new Map();
  private logger = new Logger('ClaudeHandler');
  private mcpManager: McpManager;

  constructor(mcpManager: McpManager) {
    this.mcpManager = mcpManager;
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
    slackContext?: { channel: string; threadTs?: string; user: string }
  ): AsyncGenerator<SDKMessage, void, unknown> {
    const options: any = {
      abortController: abortController || new AbortController(),
      permissionMode: slackContext ? 'default' : 'bypassPermissions',
      allowDangerouslySkipPermissions: !slackContext,
      // 使用 Claude Code 的完整系统提示和工具集
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      // 加载项目的 CLAUDE.md 和用户设置
      settingSources: ['user', 'project', 'local'] as any,
      // 捕获子进程 stderr 到日志
      stderr: (data: string) => {
        this.logger.error('Claude CLI stderr', { stderr: data.trim() });
      },
    };

    // Add permission prompt tool if we have Slack context
    if (slackContext) {
      options.permissionPromptToolName = 'mcp__permission-prompt__permission_prompt';
      this.logger.debug('Added permission prompt tool for Slack integration', slackContext);
    }

    if (workingDirectory) {
      options.cwd = workingDirectory;
    }

    // Add MCP server configuration if available
    const mcpServers = this.mcpManager.getServerConfiguration();

    // Add permission prompt server if we have Slack context
    if (slackContext) {
      const permissionServerPath = path.resolve(process.cwd(), 'src', 'permission-mcp-server.ts');
      const permissionServer = {
        'permission-prompt': {
          command: 'npx',
          args: ['tsx', permissionServerPath],
          env: {
            SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,
            SLACK_CONTEXT: JSON.stringify(slackContext)
          }
        }
      };

      if (mcpServers) {
        options.mcpServers = { ...mcpServers, ...permissionServer };
      } else {
        options.mcpServers = permissionServer;
      }
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
    this.logger.info('Starting Claude query', {
      promptLength: prompt.length,
      promptPreview: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
      workingDirectory: options.cwd || 'not set',
      hasSessionId: !!options.resume,
      permissionMode: options.permissionMode,
      mcpServerCount: options.mcpServers ? Object.keys(options.mcpServers).length : 0,
    });

    try {
      this.logger.debug('Calling @anthropic-ai/claude-agent-sdk query()...');
      for await (const message of query({
        prompt,
        options,
      })) {
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
