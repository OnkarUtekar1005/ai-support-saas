import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',

  jwt: {
    secret: process.env.JWT_SECRET || 'change-me-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'change-refresh-secret-in-production',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  langfuse: {
    secretKey: process.env.LANGFUSE_SECRET_KEY || '',
    publicKey: process.env.LANGFUSE_PUBLIC_KEY || '',
    baseUrl: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
    enabled: !!(process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY),
  },

  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
  },

  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },

  adminEmail: process.env.ADMIN_EMAIL || '',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  notion: {
    apiToken: process.env.NOTION_API_TOKEN || '',
    databaseId: process.env.NOTION_DATABASE_ID || '',
  },
};
