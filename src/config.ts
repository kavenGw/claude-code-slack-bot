import dotenv from 'dotenv';

dotenv.config();

export const config = {
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN!,
    appToken: process.env.SLACK_APP_TOKEN!,
    signingSecret: process.env.SLACK_SIGNING_SECRET!,
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY!,
  },
  claude: {
    useBedrock: process.env.CLAUDE_CODE_USE_BEDROCK === '1',
    useVertex: process.env.CLAUDE_CODE_USE_VERTEX === '1',
  },
  openRouter: {
    enabled: process.env.CLAUDE_CODE_USE_OPENROUTER === '1',
    apiKey: process.env.OPENROUTER_API_KEY || '',
    baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
  },
  baseDirectory: process.env.BASE_DIRECTORY || '',
  debug: process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development',
};

export function validateConfig() {
  const required = [
    'SLACK_BOT_TOKEN',
    'SLACK_APP_TOKEN',
    'SLACK_SIGNING_SECRET',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Validate OpenRouter configuration if enabled
  if (config.openRouter.enabled && !config.openRouter.apiKey) {
    throw new Error('OPENROUTER_API_KEY is required when CLAUDE_CODE_USE_OPENROUTER=1');
  }
}

/**
 * Apply OpenRouter configuration by setting environment variables
 * that the Claude Code SDK will use.
 * Must be called before any Claude Code SDK operations.
 */
export function applyOpenRouterConfig() {
  if (config.openRouter.enabled) {
    console.log('[CONFIG] Applying OpenRouter configuration...');
    console.log('[CONFIG] OpenRouter enabled:', config.openRouter.enabled);
    console.log('[CONFIG] OpenRouter baseUrl:', config.openRouter.baseUrl);
    console.log('[CONFIG] OpenRouter apiKey present:', !!config.openRouter.apiKey);
    console.log('[CONFIG] OpenRouter apiKey length:', config.openRouter.apiKey?.length || 0);

    // Set the base URL for the Claude Code SDK to use OpenRouter
    process.env.ANTHROPIC_BASE_URL = config.openRouter.baseUrl;
    console.log('[CONFIG] Set ANTHROPIC_BASE_URL:', process.env.ANTHROPIC_BASE_URL);

    // Use ANTHROPIC_AUTH_TOKEN for custom endpoints (required by Claude Code SDK)
    process.env.ANTHROPIC_AUTH_TOKEN = config.openRouter.apiKey;
    console.log('[CONFIG] Set ANTHROPIC_AUTH_TOKEN: [REDACTED, length:', process.env.ANTHROPIC_AUTH_TOKEN?.length || 0, ']');

    // Clear ANTHROPIC_API_KEY to avoid conflicts with custom endpoint
    const hadApiKey = !!process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    console.log('[CONFIG] Deleted ANTHROPIC_API_KEY (had value:', hadApiKey, ')');

    console.log('[CONFIG] OpenRouter configuration applied successfully');
  } else {
    console.log('[CONFIG] OpenRouter not enabled, using default Anthropic API');
    console.log('[CONFIG] ANTHROPIC_API_KEY present:', !!process.env.ANTHROPIC_API_KEY);
  }
}

/**
 * Get current environment variables relevant to Claude Code SDK
 * for debugging purposes
 */
export function getClaudeEnvDebugInfo(): Record<string, string | undefined> {
  return {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? `[REDACTED, length: ${process.env.ANTHROPIC_API_KEY.length}]` : undefined,
    ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN ? `[REDACTED, length: ${process.env.ANTHROPIC_AUTH_TOKEN.length}]` : undefined,
    ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
    CLAUDE_CODE_USE_BEDROCK: process.env.CLAUDE_CODE_USE_BEDROCK,
    CLAUDE_CODE_USE_VERTEX: process.env.CLAUDE_CODE_USE_VERTEX,
    CLAUDE_CODE_USE_OPENROUTER: process.env.CLAUDE_CODE_USE_OPENROUTER,
  };
}