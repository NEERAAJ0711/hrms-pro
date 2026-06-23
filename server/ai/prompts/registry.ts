// Central registry of named prompt builders. Prompt text lives in the prompts/
// folder (never inline in business logic); modules register their builders here
// so they can be discovered/audited centrally. Resolution by name is optional —
// services may import the builder directly for type safety.

type Builder = (...args: any[]) => string;

const registry = new Map<string, Builder>();

export function registerPrompt(name: string, builder: Builder): void {
  registry.set(name, builder);
}

export function getPrompt(name: string): Builder | undefined {
  return registry.get(name);
}

export function listPrompts(): string[] {
  return Array.from(registry.keys());
}
