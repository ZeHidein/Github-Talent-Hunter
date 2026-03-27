import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from '../agent/agent-library';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SKILLS_DIR_RELATIVE_PATH = join('.agent', 'skills');
const SKILL_FILE_NAME = 'SKILL.md';

// Mapping of skill folder names to their enable check functions
const SKILL_ENABLE_CHECKS: Record<string, () => boolean> = {};

type ParsedSkill = {
  name?: string;
  description?: string;
  autoload?: boolean;
  body?: string;
};

function findSkillsDir(startDir: string): string | undefined {
  let current = startDir;
  while (true) {
    const candidate = join(current, SKILLS_DIR_RELATIVE_PATH);
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

function parseSkillFile(content: string): ParsedSkill {
  const { data, content: body } = parseFrontmatter(content);
  const autoloadRaw = data?.metadata?.autoload;

  const autoload =
    autoloadRaw === true ||
    autoloadRaw === 1 ||
    autoloadRaw === 'true' ||
    autoloadRaw === '1' ||
    autoloadRaw === 'yes';

  return {
    name: data.name,
    description: data.description,
    autoload,
    body: autoload ? body : undefined,
  };
}

function isSkillEnabled(skillFolderPath: string): boolean {
  const folderName = basename(skillFolderPath);
  const checkFn = SKILL_ENABLE_CHECKS[folderName];

  // If no check function defined, skill is always enabled
  if (!checkFn) {
    return true;
  }

  return checkFn();
}

function collectSkillFiles(dir: string, isRoot = true): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (isRoot && !isSkillEnabled(fullPath)) {
        continue;
      }
      files.push(...collectSkillFiles(fullPath, false));
    } else if (entry.isFile() && entry.name === SKILL_FILE_NAME) {
      files.push(fullPath);
    }
  }

  return files;
}

export function loadSkillsPrompt(): string {
  const agentTemplateRoot = join(__dirname, '..', '..', '..', '..');
  const searchRoots = [process.cwd(), agentTemplateRoot];
  let skillsDir: string | undefined;
  for (const root of searchRoots) {
    skillsDir = findSkillsDir(root);
    if (skillsDir) {
      break;
    }
  }
  if (!skillsDir) {
    return '';
  }

  const skillFiles = collectSkillFiles(skillsDir);
  if (skillFiles.length === 0) {
    return '';
  }

  const autoloadedSections: string[] = [];
  const availableSections: string[] = [];

  for (const filePath of skillFiles) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const parsed = parseSkillFile(content);
      const header = parsed.name ? `Skill: ${parsed.name}` : `Skill: ${filePath}`;
      const descriptionLine = parsed.description ? `Description: ${parsed.description}` : '';

      if (parsed.autoload) {
        autoloadedSections.push([header, descriptionLine, parsed.body].filter(Boolean).join('\n'));
      } else {
        // Calculate relative path from skills directory (without .agent prefix)
        const relativePath = filePath.replace(skillsDir, '').replace(/^\//, '');
        const pathLine = `Path: skills/${relativePath}`;
        availableSections.push([header, descriptionLine, pathLine].filter(Boolean).join('\n'));
      }
    } catch (error) {
      console.warn(`[SkillsLoader] Failed to read skill file: ${filePath}`, error);
    }
  }

  if (autoloadedSections.length === 0 && availableSections.length === 0) {
    return '';
  }

  const autoloadedContent = autoloadedSections.join('\n\n');
  const availableContent = availableSections.join('\n\n');

  const skillsIntro = `You have access to specialized skills that provide instructions, tool guidance, and workflows. Always check the skills listed below before starting any task.

There are two types of skills:

1. **Auto-loaded skills** — These are already loaded below. Follow their instructions directly.

2. **Available skills** — These are NOT loaded automatically. They are regular files that you MUST read yourself using the filesystem tool before you can use them. When a user request matches a skill's domain, read the skill file IMMEDIATELY as your first action — BEFORE generating any other response. Do not attempt to answer from general knowledge if a matching skill exists.

### After loading a skill

1. Follow the skill's instructions faithfully as your primary directive for the task.
2. If the skill references additional files (e.g., references/api-endpoints.md), read them on demand using the filesystem tool with the path relative to the skill folder.
3. Do not load reference files preemptively — only when the skill's instructions or the task requires them.`;

  const sections: string[] = [`<skills>`, skillsIntro];

  if (autoloadedSections.length > 0) {
    sections.push('', `<auto_loaded_skills>`, autoloadedContent, `</auto_loaded_skills>`);
  }

  if (availableSections.length > 0) {
    sections.push('', `<available_skills>`, availableContent, `</available_skills>`);
  }

  sections.push(`</skills>`);

  return sections.join('\n');
}
