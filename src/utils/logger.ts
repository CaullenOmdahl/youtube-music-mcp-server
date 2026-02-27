import winston from 'winston';
import { config } from '../config.js';

const { combine, timestamp, printf, colorize, json } = winston.format;

// Custom format for development
const devFormat = printf(({ level, message, timestamp, component, ...metadata }) => {
  const meta = Object.keys(metadata).length ? JSON.stringify(metadata) : '';
  return `${timestamp} [${level}] ${component ? `[${component}] ` : ''}${message} ${meta}`;
});

// Create base logger configuration
const loggerConfig: winston.LoggerOptions = {
  level: config.nodeEnv === 'production' ? 'info' : 'debug',
  format: config.nodeEnv === 'production'
    ? combine(timestamp(), json())
    : combine(timestamp({ format: 'HH:mm:ss' }), colorize(), devFormat),
  transports: [
    new winston.transports.Console({
      stderrLevels: Object.keys(winston.config.npm.levels),
    }),
  ],
};

// Create the base logger
const baseLogger = winston.createLogger(loggerConfig);

// Factory function to create component-specific loggers
export function createLogger(component: string) {
  return baseLogger.child({ component });
}

// Export base logger for direct use
export const logger = baseLogger;
