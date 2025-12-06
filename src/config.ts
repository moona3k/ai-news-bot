// Config module - loads environment variables
// Bun automatically loads .env files

export interface Config {
  // z.ai for everything (summaries + agentic research)
  zaiApiKey: string;
  anthropicBaseUrl: string;

  // Slack
  slackBotToken: string;
  slackChannelId: string;

  // Optional: State file path
  stateFilePath: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

export function loadConfig(): Config {
  return {
    zaiApiKey: requireEnv('ZAI_API_KEY'),
    anthropicBaseUrl: optionalEnv('ANTHROPIC_BASE_URL', 'https://api.z.ai/api/anthropic'),
    slackBotToken: optionalEnv('SLACK_BOT_TOKEN', ''), // Optional for testing
    slackChannelId: optionalEnv('SLACK_CHANNEL_ID', ''), // Optional for testing
    stateFilePath: optionalEnv('STATE_FILE_PATH', './seen_articles.json'),
  };
}

// Singleton config instance
let _config: Config | null = null;

export function getConfig(): Config {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}
