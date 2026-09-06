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
  run: (session: BrowserSession, params: any, resp: BrowserResponse, onUpdate?: (m: string) => void, ctx?: { cwd: string }) => Promise<void>;
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
 * embeds the fresh snapshot) is rethrown from execute, which per pi's native
 * tool contract marks the call as failed and reports the message to the LLM;
 * unknown errors are rethrown as well.
 */
export function browserTool(session: BrowserSession, def: BrowserToolDef): BrowserTool {
  return {
    name: def.name,
    label: def.label,
    description: def.description,
    promptSnippet: def.promptSnippet,
    promptGuidelines: def.promptGuidelines,
    parameters: def.parameters,
    execute: async (_id, params, _signal, onUpdate, ctx) => {
      const resp = new BrowserResponse();
      if (def.omitSnapshot) resp.omitSnapshot();
      if (def.requireLaunched !== false && !session.active) throw new NotLaunchedError();
      await def.run(session, params, resp, onUpdate, ctx);
      return await resp.build({ page: session.page, store: session.store, takeModal: () => session.takeModal() });
    },
  };
}
