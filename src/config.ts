// Config module - loads environment variables
// Bun automatically loads .env files

export interface Config {
  // z.ai for everything (summaries + agentic research)
  zaiApiKey: string;
  anthropicBaseUrl: string;

  // Slack
  slackBotToken: string;
  slackChannelId: string;
  slackSigningSecret: string;

  // Server
  webhookSecret: string;
  port: number;

  // Optional: State file path
  stateFilePath: string;

  // Image generation mode: 'off' | 'option-a' | 'option-b' | 'both'
  // option-a: Responses API with image_generation tool (model decides)
  // option-b: Separate gpt-image-1 API call (always generates)
  // both: Run both and post both images for comparison
  imageGenMode: 'off' | 'option-a' | 'option-b' | 'both';
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
  const imageMode = optionalEnv('IMAGE_GEN_MODE', 'off');
  if (!['off', 'option-a', 'option-b', 'both'].includes(imageMode)) {
    throw new Error(`Invalid IMAGE_GEN_MODE: ${imageMode}. Must be 'off', 'option-a', 'option-b', or 'both'`);
  }

  return {
    zaiApiKey: requireEnv('ZAI_API_KEY'),
    anthropicBaseUrl: optionalEnv('ANTHROPIC_BASE_URL', 'https://api.z.ai/api/anthropic'),
    slackBotToken: optionalEnv('SLACK_BOT_TOKEN', ''),
    slackChannelId: optionalEnv('SLACK_CHANNEL_ID', ''),
    slackSigningSecret: optionalEnv('SLACK_SIGNING_SECRET', ''),
    webhookSecret: optionalEnv('WEBHOOK_SECRET', ''),
    port: parseInt(optionalEnv('PORT', '3000'), 10),
    stateFilePath: optionalEnv('STATE_FILE_PATH', './seen_articles.json'),
    imageGenMode: imageMode as Config['imageGenMode'],
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
