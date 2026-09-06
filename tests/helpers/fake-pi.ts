import type { PiToolResult } from '../../src/response';

export type FakeCommand = {
  description?: string;
  handler: (args: string, ctx: any) => Promise<void>;
};

/** Minimal stand-in for the pi ExtensionAPI surface the extension uses. */
export class FakePi {
  tools = new Map<string, any>();
  commands = new Map<string, FakeCommand>();
  shutdownHandlers: Array<() => Promise<void>> = [];

  registerTool(t: any) { this.tools.set(t.name, t); }
  registerCommand(name: string, cmd: FakeCommand) { this.commands.set(name, cmd); }
  on(event: string, handler: () => Promise<void>) {
    if (event === 'session_shutdown') this.shutdownHandlers.push(handler);
  }

  async execute(name: string, params: any = {}, cwd = process.cwd(), onUpdate?: (m: string) => void, signal?: AbortSignal): Promise<PiToolResult> {
    const t = this.tools.get(name);
    if (!t) throw new Error(`tool not registered: ${name}`);
    return t.execute('call-1', params, signal, onUpdate, { cwd });
  }

  text(result: any): string {
    return result.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
  }
}
