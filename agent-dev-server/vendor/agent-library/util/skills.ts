export const parseFrontmatter = (
  content: string,
): { data: Record<string, any>; content: string } => {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);

  if (!frontmatterMatch) {
    return { data: {}, content: content.trim() };
  }

  const frontmatter = frontmatterMatch[1];
  const body = frontmatterMatch[2]?.trim() || '';
  const data: Record<string, any> = {};

  const coerceValue = (raw: string): any => {
    const value = raw.trim().replace(/^["']|["']$/g, '');

    if (value === 'true') {
      return true;
    }
    if (value === 'false') {
      return false;
    }
    if (value === 'null') {
      return null;
    }

    // Handle arrays/objects in JSON form (common in our frontmatter)
    if (
      (value.startsWith('[') && value.endsWith(']')) ||
      (value.startsWith('{') && value.endsWith('}'))
    ) {
      try {
        return JSON.parse(value);
      } catch {
        // fall through
      }
    }

    // Handle numbers
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      return Number(value);
    }

    return value;
  };

  const setNested = (obj: Record<string, any>, path: string[], value: any) => {
    let current: Record<string, any> = obj;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i]!;
      const existing = current[key];
      if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
        current[key] = {};
      }
      current = current[key];
    }
    current[path[path.length - 1]!] = value;
  };

  const lines = frontmatter.split('\n');

  const parseBlock = (startIndex: number, blockIndent: number): [Record<string, any>, number] => {
    const obj: Record<string, any> = {};
    let i = startIndex;

    while (i < lines.length) {
      const line = lines[i]!;
      if (!line.trim()) {
        i += 1;
        continue;
      }

      const indent = line.match(/^\s*/)?.[0]?.length ?? 0;
      if (indent < blockIndent) {
        break;
      }

      const trimmed = line.trim();
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex === -1) {
        i += 1;
        continue;
      }

      const key = trimmed.substring(0, colonIndex).trim();
      const rawValue = trimmed.substring(colonIndex + 1).trim();

      if (rawValue === '') {
        let j = i + 1;
        while (j < lines.length && !lines[j]!.trim()) {
          j += 1;
        }
        const childIndent =
          j < lines.length ? (lines[j]!.match(/^\s*/)?.[0]?.length ?? 0) : indent + 2;
        const [child, nextIndex] = parseBlock(i + 1, Math.max(childIndent, indent + 1));
        obj[key] = child;
        i = nextIndex;
        continue;
      }

      obj[key] = coerceValue(rawValue);
      i += 1;
    }

    return [obj, i];
  };

  // Parse YAML-like frontmatter with simple nested blocks (metadata: ...) support.
  const [parsed] = parseBlock(0, 0);

  // Support dot-notation keys by expanding them into nested objects.
  for (const [key, value] of Object.entries(parsed)) {
    if (key.includes('.')) {
      setNested(data, key.split('.'), value);
    } else {
      data[key] = value;
    }
  }

  return { data, content: body };
};
