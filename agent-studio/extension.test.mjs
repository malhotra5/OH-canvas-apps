import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('./extension.js', import.meta.url), 'utf8');
const { activate } = await import(`data:text/javascript,${encodeURIComponent(source)}`);

class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.listeners = {};
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this._text = '';
    this.className = '';
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map((child) => child.textContent ?? '').join(''); }
  setAttribute(key, value) { this[key] = value; }
  addEventListener(key, listener) { this.listeners[key] = listener; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  remove() { this.removed = true; }
  find(predicate) {
    if (predicate(this)) return this;
    for (const child of this.children) {
      const match = child.find?.(predicate);
      if (match) return match;
    }
    return null;
  }
  findAll(predicate) { return (predicate(this) ? [this] : []).concat(this.children.flatMap((child) => child.findAll?.(predicate) ?? [])); }
}

globalThis.document = { createElement: (tag) => new Element(tag) };
globalThis.window = { confirm: () => true };
const button = (root, label) => root.find((node) => node.tag === 'button' && node.textContent === label);
const input = (root, placeholder) => root.find((node) => node.tag === 'input' && node.placeholder === placeholder);
const tick = async () => { await new Promise((resolve) => setTimeout(resolve, 0)); };

function mount(path = '', overrides = {}) {
  const calls = [], navigation = [], container = new Element('div');
  const state = {
    profiles: overrides.profiles ?? [],
    llms: overrides.llms ?? [{ name: 'existing-model', model: 'openai/gpt-5' }],
    secrets: overrides.secrets ?? [{ name: 'SHARED_TOKEN' }],
    mcps: overrides.mcps ?? { shared: { transport: 'streamable-http', url: 'https://example.org/mcp' } },
  };
  const host = {
    apiVersion: '1',
    backend: { kind: overrides.kind ?? 'local' },
    agentServer: { request: async (request) => {
      calls.push(request);
      if (request.method === 'GET') {
        if (request.path === '/api/agent-profiles') return { profiles: state.profiles };
        if (request.path === '/api/profiles') return { profiles: state.llms };
        if (request.path === '/api/settings/secrets') return { secrets: state.secrets };
        if (request.path.startsWith('/api/settings/secrets?agent_profile_id=')) return { secrets: state.secrets };
        if (request.path === '/api/settings') return { agent_settings: { mcp_config: state.mcps } };
        if (request.path.startsWith('/api/agent-profiles/')) return { profile: overrides.detail };
      }
      if (overrides.fail?.(request)) throw new Error('Server unavailable');
      if (request.method === 'POST' && request.path.startsWith('/api/agent-profiles/')) {
        state.profiles.push({ id: 'profile-uuid', name: decodeURIComponent(request.path.split('/').at(-1)), agent_kind: 'openhands' });
      }
      if (request.path === '/api/conversations') return { id: 'conversation-uuid' };
      return {};
    } },
    registerPage: (id, render) => { calls.push({ register: id }); host.render = render; return () => { host.unregistered = true; }; },
  };
  const deactivate = activate(host);
  const dispose = host.render({ container, path, navigate: (url) => navigation.push(url) });
  return { calls, navigation, container, dispose, deactivate, host };
}

test('host version, registration and cleanup', async () => {
  assert.throws(() => activate({ apiVersion: '2' }), /host API 1/);
  const app = mount();
  await tick();
  assert.equal(app.calls[0].register, 'studio');
  assert.match(app.container.textContent, /Create profile/);
  app.dispose();
  app.deactivate();
  assert.equal(app.container.children.every((child) => child.removed), true);
  assert.equal(app.host.unregistered, true);
});

test('cloud backend is read-only and never calls sandbox profile endpoints', () => {
  const app = mount('', { kind: 'cloud' });
  assert.match(app.container.textContent, /requires a local Agent Canvas backend/);
  assert.equal(app.calls.filter((call) => call.path).length, 0);
  app.dispose();
});


test('create in a single form references existing resources and saves new ones', async () => {
  const app = mount();
  await tick();
  button(app.container, 'Create profile').listeners.click();
  await tick();
  input(app.container, 'e.g. code-review').value = 'reviewer';
  const selects = app.container.findAll((node) => node.tag === 'select');
  selects[0].value = 'existing-model';
  const checks = app.container.findAll((node) => node.tag === 'input' && node.type === 'checkbox');
  checks.forEach((check) => { check.checked = true; });
  input(app.container, 'e.g. GITHUB_TOKEN').value = 'NEW_TOKEN';
  input(app.container, 'Value (never read back)').value = 'secret-value';
  input(app.container, 'e.g. my-mcp').value = 'deepwiki';
  input(app.container, 'https://example.com/mcp or command').value = 'https://mcp.deepwiki.com/mcp';
  await app.container.find((node) => node.tag === 'form').listeners.submit({ preventDefault() {} });
  const save = app.calls.find((call) => call.path === '/api/agent-profiles/reviewer' && call.method === 'POST');
  assert.equal(save.body.llm_profile_ref, 'existing-model');
  assert.deepEqual(save.body.secret_refs, ['SHARED_TOKEN', 'NEW_TOKEN']);
  assert.deepEqual(save.body.mcp_server_refs, ['shared', 'deepwiki']);
  assert.ok(app.calls.some((call) => call.path === '/api/settings/secrets' && call.method === 'PUT' && call.body.value === 'secret-value'));
  assert.ok(app.calls.some((call) => call.path === '/api/settings/mcp/deepwiki' && call.method === 'POST'));
  assert.match(app.container.textContent, /Agent profile saved/);
  app.dispose();
});

test('new LLM configuration is saved before its agent reference', async () => {
  const app = mount();
  await tick();
  button(app.container, 'Create profile').listeners.click();
  await tick();
  input(app.container, 'e.g. code-review').value = 'new-agent';
  input(app.container, 'e.g. my-model').value = 'new-model';
  input(app.container, 'e.g. openai/gpt-5').value = 'openai/gpt-5';
  input(app.container, 'Optional for local models').value = 'new-key';
  await app.container.find((node) => node.tag === 'form').listeners.submit({ preventDefault() {} });
  const writes = app.calls.filter((call) => call.method === 'POST');
  assert.deepEqual(writes.map((call) => call.path), ['/api/profiles/new-model', '/api/agent-profiles/new-agent']);
  assert.equal(writes[0].body.llm.api_key, 'new-key');
  assert.equal(writes[1].body.llm_profile_ref, 'new-model');
  assert.deepEqual(writes[1].body.secret_refs, []);
  app.dispose();
});


test('editing preserves unknown fields and server-managed identity stays out of save', async () => {
  const app = mount('', { profiles: [{ name: 'reviewer', id: 'profile-uuid', agent_kind: 'openhands' }],
    detail: { name: 'reviewer', id: 'profile-uuid', revision: 7, schema_version: 3, agent_kind: 'openhands', llm_profile_ref: 'existing-model', condenser: { kind: 'NoOp' }, secret_refs: null, mcp_server_refs: [] } });
  await tick();
  button(app.container, 'Edit').listeners.click();
  await tick();
  await app.container.find((node) => node.tag === 'form').listeners.submit({ preventDefault() {} });
  const saved = app.calls.find((call) => call.method === 'POST' && call.path === '/api/agent-profiles/reviewer');
  assert.deepEqual(saved.body.condenser, { kind: 'NoOp' });
  assert.equal(saved.body.id, undefined);
  assert.equal(saved.body.revision, undefined);
  assert.equal(saved.body.secret_refs, null);
  assert.deepEqual(saved.body.mcp_server_refs, []);
  app.dispose();
});


test('ACP profiles cannot be overwritten by the OpenHands-only editor', async () => {
  const app = mount('', { profiles: [{ name: 'other', id: 'acp-uuid', agent_kind: 'acp' }],
    detail: { name: 'other', agent_kind: 'acp', acp_server: 'claude' } });
  await tick();
  button(app.container, 'Edit').listeners.click();
  await tick();
  assert.match(app.container.textContent, /ACP profiles remain unchanged/);
  assert.equal(app.container.find((node) => node.tag === 'form'), null);
  app.dispose();
});

test('delete requires confirmation and targets the selected profile', async () => {
  const app = mount('', { profiles: [{ name: 'reviewer', id: 'profile-uuid', agent_kind: 'openhands' }] });
  await tick();
  const priorConfirm = window.confirm;
  window.confirm = () => false;
  await button(app.container, 'Delete').listeners.click();
  assert.ok(!app.calls.some((call) => call.method === 'DELETE'));
  window.confirm = () => true;
  await button(app.container, 'Delete').listeners.click();
  assert.ok(app.calls.some((call) => call.method === 'DELETE' && call.path === '/api/agent-profiles/reviewer'));
  window.confirm = priorConfirm;
  app.dispose();
});

test('failed resource write does not overwrite the agent and shows failure', async () => {
  const app = mount('', { fail: (call) => call.method === 'PUT' });
  await tick();
  button(app.container, 'Create profile').listeners.click();
  await tick();
  input(app.container, 'e.g. code-review').value = 'reviewer';
  app.container.find((node) => node.tag === 'select').value = 'existing-model';
  input(app.container, 'e.g. GITHUB_TOKEN').value = 'NEW_TOKEN';
  input(app.container, 'Value (never read back)').value = 'private';
  await app.container.find((node) => node.tag === 'form').listeners.submit({ preventDefault() {} });
  assert.match(app.container.textContent, /Could not save secret/);
  assert.ok(!app.calls.some((call) => call.path === '/api/agent-profiles/reviewer'));
  app.dispose();
});

test('launch uses only agent profile id as agent source', async () => {
  const app = mount('/launch', { profiles: [{ name: 'reviewer', id: 'profile-uuid', agent_kind: 'openhands' }] });
  await tick();
  app.container.find((node) => node.tag === 'select').value = 'profile-uuid';
  input(app.container, '/absolute/path/to/workspace').value = '/workspace';
  app.container.find((node) => node.tag === 'textarea').value = 'Review this code';
  await button(app.container, 'Launch conversation').listeners.click();
  const launch = app.calls.find((call) => call.path === '/api/conversations');
  assert.deepEqual(Object.keys(launch.body).sort(), ['agent_profile_id', 'initial_message', 'secrets', 'workspace']);
  assert.equal(launch.body.agent_profile_id, 'profile-uuid');
  assert.deepEqual(launch.body.secrets, { SHARED_TOKEN: { kind: 'LookupSecret', url: '/api/settings/secrets/SHARED_TOKEN' } });
  assert.ok(app.calls.some((call) => call.path === '/api/settings/secrets?agent_profile_id=profile-uuid'));
  assert.deepEqual(app.navigation, ['/conversations/conversation-uuid']);
  app.dispose();
});
