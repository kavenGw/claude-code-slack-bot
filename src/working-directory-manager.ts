import { WorkingDirectoryConfig } from './types';
import { Logger } from './logger';
import { config } from './config';
import * as path from 'path';
import * as fs from 'fs';

export class WorkingDirectoryManager {
  private configs: Map<string, WorkingDirectoryConfig> = new Map();
  private logger = new Logger('WorkingDirectoryManager');

  getConfigKey(channelId: string, threadTs?: string, userId?: string): string {
    if (threadTs) {
      return `${channelId}-${threadTs}`;
    }
    if (userId && channelId.startsWith('D')) { // Direct message
      return `${channelId}-${userId}`;
    }
    return channelId;
  }

  setWorkingDirectory(channelId: string, directory: string, threadTs?: string, userId?: string): { success: boolean; resolvedPath?: string; error?: string } {
    try {
      const resolvedPath = this.resolveDirectory(directory);
      
      if (!resolvedPath) {
        return { 
          success: false, 
          error: `Directory not found: "${directory}"${config.baseDirectory ? ` (checked in base directory: ${config.baseDirectory})` : ''}` 
        };
      }

      const stats = fs.statSync(resolvedPath);
      
      if (!stats.isDirectory()) {
        this.logger.warn('Path is not a directory', { directory: resolvedPath });
        return { success: false, error: 'Path is not a directory' };
      }

      const key = this.getConfigKey(channelId, threadTs, userId);
      const workingDirConfig: WorkingDirectoryConfig = {
        channelId,
        threadTs,
        userId,
        directory: resolvedPath,
        setAt: new Date(),
      };

      this.configs.set(key, workingDirConfig);
      this.logger.info('Working directory set', {
        key,
        directory: resolvedPath,
        originalInput: directory,
        isThread: !!threadTs,
        isDM: channelId.startsWith('D'),
      });

      return { success: true, resolvedPath };
    } catch (error) {
      this.logger.error('Failed to set working directory', error);
      return { success: false, error: 'Directory does not exist or is not accessible' };
    }
  }

  private resolveDirectory(directory: string): string | null {
    // If it's an absolute path, use it directly
    if (path.isAbsolute(directory)) {
      if (fs.existsSync(directory)) {
        return path.resolve(directory);
      }
      return null;
    }

    // If we have a base directory configured, try relative to base directory first
    if (config.baseDirectory) {
      const baseRelativePath = path.join(config.baseDirectory, directory);
      if (fs.existsSync(baseRelativePath)) {
        this.logger.debug('Found directory relative to base', { 
          input: directory,
          baseDirectory: config.baseDirectory,
          resolved: baseRelativePath 
        });
        return path.resolve(baseRelativePath);
      }
    }

    // Try relative to current working directory
    const cwdRelativePath = path.resolve(directory);
    if (fs.existsSync(cwdRelativePath)) {
      this.logger.debug('Found directory relative to cwd', { 
        input: directory,
        resolved: cwdRelativePath 
      });
      return cwdRelativePath;
    }

    return null;
  }

  getWorkingDirectory(channelId: string, threadTs?: string, userId?: string): string | undefined {
    // Priority: Thread > Channel/DM > BASE_DIRECTORY
    if (threadTs) {
      const threadKey = this.getConfigKey(channelId, threadTs);
      const threadConfig = this.configs.get(threadKey);
      if (threadConfig) {
        this.logger.debug('Using thread-specific working directory', {
          directory: threadConfig.directory,
          threadTs,
        });
        return threadConfig.directory;
      }
    }

    // Fall back to channel or DM config
    const channelKey = this.getConfigKey(channelId, undefined, userId);
    const channelConfig = this.configs.get(channelKey);
    if (channelConfig) {
      this.logger.debug('Using channel/DM working directory', {
        directory: channelConfig.directory,
        channelId,
      });
      return channelConfig.directory;
    }

    // Fall back to BASE_DIRECTORY if configured
    if (config.baseDirectory) {
      this.logger.debug('Using BASE_DIRECTORY as working directory', {
        directory: config.baseDirectory,
        channelId,
        threadTs,
      });
      return config.baseDirectory;
    }

    this.logger.debug('No working directory configured', { channelId, threadTs });
    return undefined;
  }

  removeWorkingDirectory(channelId: string, threadTs?: string, userId?: string): boolean {
    const key = this.getConfigKey(channelId, threadTs, userId);
    const result = this.configs.delete(key);
    if (result) {
      this.logger.info('Working directory removed', { key });
    }
    return result;
  }

  listConfigurations(): WorkingDirectoryConfig[] {
    return Array.from(this.configs.values());
  }

  parseSetCommand(text: string): string | null {
    const cwdMatch = text.match(/^cwd\s+(.+)$/i);
    if (cwdMatch) {
      return cwdMatch[1].trim();
    }

    const setMatch = text.match(/^set\s+(?:cwd|dir|directory|working[- ]?directory)\s+(.+)$/i);
    if (setMatch) {
      return setMatch[1].trim();
    }

    return null;
  }

  isGetCommand(text: string): boolean {
    return /^(get\s+)?(cwd|dir|directory|working[- ]?directory)(\?)?$/i.test(text.trim());
  }

  formatDirectoryMessage(directory: string | undefined, context: string): string {
    if (directory) {
      let message = `Current working directory for ${context}: \`${directory}\``;
      if (config.baseDirectory && directory === config.baseDirectory) {
        message += ` (using BASE_DIRECTORY)`;
      }
      if (config.baseDirectory) {
        message += `\n\nYou can override with \`cwd project-name\` or \`cwd /absolute/path\``;
      }
      return message;
    }

    let message = `No working directory available for ${context}.\n`;
    message += `Please configure the \`BASE_DIRECTORY\` environment variable, or set one using:\n`;
    message += `\`cwd /path/to/directory\``;
    return message;
  }

  getChannelWorkingDirectory(channelId: string): string | undefined {
    const key = this.getConfigKey(channelId);
    const config = this.configs.get(key);
    return config?.directory;
  }

  hasChannelWorkingDirectory(channelId: string): boolean {
    return !!this.getChannelWorkingDirectory(channelId);
  }

  formatChannelSetupMessage(channelId: string, channelName: string): string {
    const hasBaseDir = !!config.baseDirectory;

    let message = `🏠 **Working Directory for #${channelName}**\n\n`;

    if (hasBaseDir) {
      message += `Using BASE_DIRECTORY: \`${config.baseDirectory}\`\n\n`;
      message += `**Override options:**\n`;
      message += `• \`cwd project-name\` (relative to base directory)\n`;
      message += `• \`cwd /absolute/path/to/project\` (absolute path)\n\n`;
    } else {
      message += `No BASE_DIRECTORY configured. Please set a working directory:\n\n`;
      message += `• \`cwd /path/to/project\`\n`;
      message += `• \`set directory /path/to/project\`\n\n`;
    }

    message += `Individual threads can use a different directory by mentioning me with a \`cwd\` command.`;

    return message;
  }
}