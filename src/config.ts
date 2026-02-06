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
    // Set the base URL for the Claude Code SDK to use OpenRouter
    process.env.ANTHROPIC_BASE_URL = config.openRouter.baseUrl;
    // Use ANTHROPIC_AUTH_TOKEN for custom endpoints (required by Claude Code SDK)
    process.env.ANTHROPIC_AUTH_TOKEN = config.openRouter.apiKey;
    // Clear ANTHROPIC_API_KEY to avoid conflicts with custom endpoint
    delete process.env.ANTHROPIC_API_KEY;
  }
}