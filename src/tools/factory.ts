import type { TObject } from 'typebox';
import { BrowserError, NotLaunchedError } from '../errors';
import { BrowserResponse, type PiToolResult } from '../response';
import type { BrowserSession } from '../session';

export type BrowserToolDef = {
  name: string;
  label: string;
  description: string;
  promptSnippet?: string;
  promptGuidelines?: string[];
  parameters: TObject;
  /** Skip the trailing page snapshot in the result (launch, screenshots, …). */
  omitSnapshot?: boolean;
  /** Default true — reject with NotLaunchedError when the session isn't active. browser_launch sets false. */
  requireLaunched?: boolean;
  run: (session: BrowserSession, params: any, resp: BrowserResponse, onUpdate?: (m: string) => void) => Promise<void>;
};

export type BrowserTool = {
  name: string;
  label: string;
  description: string;
  promptSnippet?: string;
  promptGuidelines?: string[];
  parameters: TObject;
  execute: (id: string, params: any, signal?: AbortSignal, onUpdate?: (m: string) => void, ctx?: { cwd: string }) => Promise<PiToolResult>;
};

/**
 * Wraps a tool definition with the shared error contract:
 * BrowserError family (incl. NotLaunchedError, StaleRefError — whose message
 * embeds the fresh snapshot) becomes an isError result carrying the message as
 * text; unknown errors are rethrown.
 */
export function browserTool(session: BrowserSession, def: BrowserToolDef): BrowserTool {
  return {
    name: def.name,
    label: def.label,
    description: def.description,
    promptSnippet: def.promptSnippet,
    promptGuidelines: def.promptGuidelines,
    parameters: def.parameters,
    execute: async (_id, params, _signal, onUpdate) => {
      const resp = new BrowserResponse();
      if (def.omitSnapshot) resp.omitSnapshot();
      try {
        if (def.requireLaunched !== false && !session.active) throw new NotLaunchedError();
        await def.run(session, params, resp, onUpdate);
        return await resp.build({ page: session.page, store: session.store, takeModal: () => session.takeModal() });
      } catch (e) {
        if (e instanceof BrowserError) {
          return { content: [{ type: 'text', text: e.message }], details: {}, isError: true };
        }
        throw e;
      }
    },
  };
}
