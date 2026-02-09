import { Logger } from './logger';

export interface SkillDefinition {
  name: string;
  aliases: string[];
  description: string;
  systemPrompt: string;
}

export interface SkillMatch {
  skill: SkillDefinition;
  userPrompt: string;
}

export class SkillManager {
  private skills: Map<string, SkillDefinition> = new Map();
  private logger = new Logger('SkillManager');

  constructor() {
    this.registerBuiltinSkills();
  }

  register(skill: SkillDefinition): void {
    // 注册主名称和所有别名
    const keys = [skill.name, ...skill.aliases].map((k) => k.toLowerCase());
    for (const key of keys) {
      this.skills.set(key, skill);
    }
    this.logger.info('Registered skill', { name: skill.name, aliases: skill.aliases });
  }

  parseMessage(text: string): SkillMatch | null {
    const trimmed = text.trim();

    // 格式 1: /skill args
    const slashMatch = trimmed.match(/^\/(\S+)\s*(.*)/s);
    if (slashMatch) {
      const skill = this.skills.get(slashMatch[1].toLowerCase());
      if (skill) {
        return { skill, userPrompt: slashMatch[2].trim() };
      }
    }

    // 格式 2: !skill args
    const bangMatch = trimmed.match(/^!(\S+)\s*(.*)/s);
    if (bangMatch) {
      const skill = this.skills.get(bangMatch[1].toLowerCase());
      if (skill) {
        return { skill, userPrompt: bangMatch[2].trim() };
      }
    }

    // 格式 3: skill: args
    const colonMatch = trimmed.match(/^(\S+):\s+(.*)/s);
    if (colonMatch) {
      const skill = this.skills.get(colonMatch[1].toLowerCase());
      if (skill) {
        return { skill, userPrompt: colonMatch[2].trim() };
      }
    }

    return null;
  }

  listSkills(): SkillDefinition[] {
    // 去重（同一个 skill 注册了多个 key）
    const seen = new Set<string>();
    const result: SkillDefinition[] = [];
    for (const skill of this.skills.values()) {
      if (!seen.has(skill.name)) {
        seen.add(skill.name);
        result.push(skill);
      }
    }
    return result;
  }

  formatSkillList(): string {
    const skills = this.listSkills();
    if (skills.length === 0) {
      return '🔧 No skills registered.';
    }

    let msg = '🔧 *Available Skills:*\n\n';
    for (const skill of skills) {
      const aliases = skill.aliases.length > 0
        ? ` (aliases: ${skill.aliases.map((a) => `\`${a}\``).join(', ')})`
        : '';
      msg += `• *${skill.name}*${aliases}\n  ${skill.description}\n`;
    }
    msg += '\n*Trigger formats:* `/skill args`, `!skill args`, `skill: args`';
    return msg;
  }

  isListCommand(text: string): boolean {
    return /^skills?(\s+(list|info|help))?(\?)?$/i.test(text.trim());
  }

  private registerBuiltinSkills(): void {
    this.register({
      name: 'brainstorm',
      aliases: ['superpowers:brainstorm', 'bs'],
      description: 'Creative exploration mode — explore ideas, requirements and design before implementation',
      systemPrompt: `You are in BRAINSTORM mode. Your role is to help the user explore ideas creatively before jumping to implementation.

Rules for brainstorm mode:
1. Do NOT write any code or create any files
2. Do NOT use any tools (no Bash, Edit, Write, Read, etc.)
3. Focus on understanding the user's intent, exploring requirements, and discussing design
4. Ask clarifying questions to understand what the user really wants
5. Suggest multiple approaches and discuss trade-offs
6. Think about edge cases and potential issues
7. Help the user refine their idea before implementation
8. When the discussion is complete, summarize the agreed approach as a clear plan

Start by acknowledging you're in brainstorm mode and ask the user what they'd like to explore.`,
    });
  }
}
