import { App } from '@slack/bolt';
import { config, validateConfig, applyOpenRouterConfig, getClaudeEnvDebugInfo } from './config';
import { ClaudeHandler } from './claude-handler';
import { SlackHandler } from './slack-handler';
import { McpManager } from './mcp-manager';
import { Logger } from './logger';

const logger = new Logger('Main');

async function start() {
  try {
    // Validate configuration
    logger.info('Validating configuration...');
    validateConfig();
    logger.info('Configuration validated successfully');

    // Apply OpenRouter configuration if enabled
    logger.info('Applying OpenRouter configuration (if enabled)...');
    applyOpenRouterConfig();

    // Log Claude SDK environment state after configuration
    logger.info('Claude SDK environment state after configuration:', getClaudeEnvDebugInfo());

    logger.info('Starting Claude Code Slack bot', {
      debug: config.debug,
      useBedrock: config.claude.useBedrock,
      useVertex: config.claude.useVertex,
      useOpenRouter: config.openRouter.enabled,
    });

    // Initialize Slack app
    const app = new App({
      token: config.slack.botToken,
      signingSecret: config.slack.signingSecret,
      socketMode: true,
      appToken: config.slack.appToken,
    });

    // Initialize MCP manager
    const mcpManager = new McpManager();
    const mcpConfig = mcpManager.loadConfiguration();
    
    // Initialize handlers
    const claudeHandler = new ClaudeHandler(mcpManager);
    const slackHandler = new SlackHandler(app, claudeHandler, mcpManager);

    // Setup event handlers
    slackHandler.setupEventHandlers();

    // Start the app
    await app.start();
    logger.info('⚡️ Claude Code Slack bot is running!');
    logger.info('Configuration:', {
      claudeMode: config.claude.mode,
      claudeCliPath: config.claude.mode === 'local' ? config.claude.cliPath : undefined,
      usingBedrock: config.claude.useBedrock,
      usingVertex: config.claude.useVertex,
      usingOpenRouter: config.openRouter.enabled,
      usingAnthropicAPI: config.claude.mode === 'sdk' && !config.claude.useBedrock && !config.claude.useVertex && !config.openRouter.enabled,
      openRouterBaseUrl: config.openRouter.enabled ? config.openRouter.baseUrl : undefined,
      debugMode: config.debug,
      baseDirectory: config.baseDirectory || 'not set',
      mcpServers: mcpConfig ? Object.keys(mcpConfig.mcpServers).length : 0,
      mcpServerNames: mcpConfig ? Object.keys(mcpConfig.mcpServers) : [],
    });
  } catch (error) {
    logger.error('Failed to start the bot', error);
    process.exit(1);
  }
}

start();