import { Type } from 'typebox';
import { ACTION_TIMEOUT_MS } from '../session';
import { browserTool, type BrowserTool } from './factory';
import type { BrowserSession } from '../session';
import { resolveTarget } from './resolve';

const target = {
  ref: Type.Optional(Type.String({ description: 'Element ref from the latest snapshot (preferred)' })),
  selector: Type.Optional(Type.String({ description: 'CSS selector fallback' })),
  element: Type.Optional(Type.String({ description: 'Human-readable element description' })),
};

export function makeInteractTools(session: BrowserSession): BrowserTool[] {
  return [
    browserTool(session, {
      name: 'browser_click',
      label: 'Click',
      description: 'Click an element. Prefer ref from the latest snapshot.',
      parameters: Type.Object({
        ...target,
        button: Type.Optional(Type.String({ description: 'left (default), right, or middle' })),
        doubleClick: Type.Optional(Type.Boolean()),
        modifiers: Type.Optional(Type.Array(Type.String(), { description: 'Alt, Control, Shift, Meta' })),
      }),
      run: async (s, p, resp) => {
        const loc = await resolveTarget(s, p);
        await loc.click({
          button: (p.button as any) ?? 'left',
          clickCount: p.doubleClick ? 2 : 1,
          modifiers: p.modifiers as any,
          timeout: ACTION_TIMEOUT_MS,
        });
        resp.addResult(`Clicked ${p.element ?? p.ref ?? p.selector}.`);
      },
    }),
    browserTool(session, {
      name: 'browser_type',
      label: 'Type',
      description: 'Clear and fill an editable element, optionally pressing Enter (submit).',
      parameters: Type.Object({
        ...target,
        text: Type.String({ description: 'Text to enter' }),
        submit: Type.Optional(Type.Boolean({ description: 'Press Enter after typing' })),
      }),
      run: async (s, p, resp) => {
        const loc = await resolveTarget(s, p);
        await loc.fill(p.text, { timeout: ACTION_TIMEOUT_MS });
        if (p.submit) await loc.press('Enter', { timeout: ACTION_TIMEOUT_MS });
        resp.addResult(`Typed into ${p.element ?? p.ref ?? p.selector}${p.submit ? ' and pressed Enter' : ''}.`);
      },
    }),
    browserTool(session, {
      name: 'browser_press_key',
      label: 'Press key',
      description: 'Press a key on the keyboard (e.g. Enter, Tab, ArrowLeft, Control+a).',
      parameters: Type.Object({ key: Type.String() }),
      run: async (s, p, resp) => {
        await s.page.keyboard.press(p.key);
        resp.addResult(`Pressed ${p.key}.`);
      },
    }),
    browserTool(session, {
      name: 'browser_fill_form',
      label: 'Fill form',
      description: 'Fill multiple fields in one call. type: textbox | checkbox | radio | combobox | slider.',
      parameters: Type.Object({
        fields: Type.Array(Type.Object({
          type: Type.String({ description: 'textbox, checkbox, radio, combobox, or slider' }),
          ref: Type.Optional(Type.String()),
          selector: Type.Optional(Type.String()),
          value: Type.String({ description: 'Text, "true"/"false" for checkbox/radio, option value for combobox, number for slider' }),
        })),
      }),
      run: async (s, p, resp) => {
        for (const f of p.fields) {
          const loc = await resolveTarget(s, f);
          const t = f.type as string;
          if (t === 'checkbox' || t === 'radio') {
            if (f.value === 'true') await loc.check({ timeout: ACTION_TIMEOUT_MS }); else await loc.uncheck({ timeout: ACTION_TIMEOUT_MS });
          } else if (t === 'combobox') {
            await loc.selectOption(f.value, { timeout: ACTION_TIMEOUT_MS });
          } else {
            await loc.fill(f.value, { timeout: ACTION_TIMEOUT_MS });
          }
        }
        resp.addResult(`Filled ${p.fields.length} field(s).`);
      },
    }),
    browserTool(session, {
      name: 'browser_hover',
      label: 'Hover',
      description: 'Hover over an element (opens hover menus).',
      parameters: Type.Object({ ...target }),
      run: async (s, p, resp) => {
        const loc = await resolveTarget(s, p);
        await loc.hover({ timeout: ACTION_TIMEOUT_MS });
        resp.addResult(`Hovered ${p.element ?? p.ref ?? p.selector}.`);
      },
    }),
  ];
}
