export class RobotsParser {
  private disallowRules: string[] = [];

  constructor(robotsTxtContent = '') {
    this.parse(robotsTxtContent);
  }

  private parse(content: string): void {
    const lines = content.split('\n');
    let appliesToBot = false;

    for (const rawLine of lines) {
      const line = rawLine.split('#')[0]!.trim();
      if (!line) continue;

      const [key, ...rest] = line.split(':');
      if (!key || rest.length === 0) continue;

      const field = key.trim().toLowerCase();
      const value = rest.join(':').trim();

      if (field === 'user-agent') {
        const agent = value.toLowerCase();
        appliesToBot = agent === '*' || agent.includes('openagent') || agent.includes('bot');
      } else if (appliesToBot && field === 'disallow') {
        if (value.length > 0) {
          this.disallowRules.push(value);
        }
      }
    }
  }

  public isAllowed(pathname: string): boolean {
    for (const rule of this.disallowRules) {
      if (rule === '/' && pathname.length > 0) return false;
      if (pathname.startsWith(rule)) return false;
    }
    return true;
  }
}
