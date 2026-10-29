const CSS = `
.agent-studio { max-width: 960px; margin: auto; padding: 24px; color: var(--oh-foreground, #eef2f7); font: 14px/1.5 system-ui, sans-serif; }
.agent-studio * { box-sizing: border-box; }
.agent-studio h1, .agent-studio h2 { color: var(--oh-contrast, #fff); margin: 0 0 8px; }
.agent-studio h1 { font-size: 24px; } .agent-studio h2 { font-size: 18px; }
.agent-studio p { color: var(--oh-muted, #a3b0c4); margin: 0 0 16px; }
.agent-studio .bar, .agent-studio .row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
.agent-studio .bar { margin-bottom: 24px; }
.agent-studio .stack { display: grid; gap: 16px; }
.agent-studio .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
.agent-studio .card, .agent-studio details { background: var(--oh-color-base-secondary, #21252f); border: 1px solid var(--oh-border, #4b5468); border-radius: 12px; padding: 18px; }
.agent-studio details summary { cursor: pointer; color: var(--oh-contrast, #fff); font-weight: 600; }
.agent-studio details > .stack { margin-top: 16px; }
.agent-studio label { display: grid; gap: 5px; min-width: 0; }
.agent-studio label.check { display: flex; align-items: center; gap: 6px; }
.agent-studio input:not([type=checkbox]), .agent-studio select, .agent-studio textarea, .agent-studio button { font: inherit; border-radius: 8px; min-height: 36px; }
.agent-studio input:not([type=checkbox]), .agent-studio select, .agent-studio textarea { width: 100%; background: var(--oh-color-base, #0b0e14); color: var(--oh-foreground, #eef2f7); border: 1px solid var(--oh-border, #4b5468); padding: 8px 10px; }
.agent-studio textarea { min-height: 90px; resize: vertical; }
.agent-studio button { cursor: pointer; background: transparent; color: inherit; border: 1px solid var(--oh-border, #4b5468); padding: 5px 12px; }
.agent-studio button.primary { background: var(--oh-color-primary, #c9b974); color: var(--oh-accent-foreground, #0b0e14); border: 0; font-weight: 600; }
.agent-studio button.danger, .agent-studio .error { color: var(--oh-danger, #e76a5e); }
.agent-studio button:disabled { opacity: .55; cursor: not-allowed; }
.agent-studio :is(button, input, select, textarea, summary):focus-visible { outline: 2px solid var(--oh-focus, #fff); outline-offset: 2px; }
.agent-studio .muted { color: var(--oh-muted, #a3b0c4); }
.agent-studio .status { min-height: 22px; } .agent-studio .checks { display: flex; gap: 8px 18px; flex-wrap: wrap; }
@media (max-width: 600px) { .agent-studio { padding: 16px; } }
`;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'text') node.textContent = value;
    else if (key === 'class') node.className = value;
    else if (key === 'value') node.value = value;
    else if (key === 'checked') node.checked = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}
const text = (tag, value, className = '') => el(tag, { text: value, class: className });
const button = (label, click, className = '') => el('button', { type: 'button', text: label, class: className, onclick: click });
const field = (label, control) => el('label', {}, text('span', label), control);
const option = (value, label) => el('option', { value, text: label });
const section = (title, body) => el('details', {}, el('summary', { text: title }), body);
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function activate(host) {
  if (host.apiVersion !== '1') throw new Error('Agent Studio requires Canvas host API 1.');
  return host.registerPage('studio', ({ container, path, navigate }) => {
    const style = el('style', { text: CSS });
    const root = el('div', { class: 'agent-studio' });
    container.append(style, root);
    if (host.backend.kind !== 'local') {
      root.append(text('h1', 'Agent Studio'), text('p', 'This experiment requires a local Agent Canvas backend. Cloud agent profiles live in the app server, outside the Canvas App host API.'));
      return () => { style.remove(); root.remove(); };
    }
    let disposed = false;
    let profiles = [], llms = [], secrets = [], mcps = {};
    const base = '/extensions/agent-studio/studio';
    const request = (method, url, body) => host.agentServer.request({ method, path: url, ...(body === undefined ? {} : { body }) });
    const status = text('p', '', 'status');
    const view = el('div');
    const setStatus = (message, error = false) => { status.textContent = message; status.className = `status${error ? ' error' : ''}`; };
    root.append(el('div', { class: 'bar' }, el('div', {}, text('h1', 'Agent Studio'), text('p', 'Build once. Launch with a profile.')),
      el('div', { class: 'row' }, button('Agents', () => navigate(base)), button('Launch', () => navigate(`${base}/launch`)))), status, view);
    const render = (...nodes) => { if (!disposed) view.replaceChildren(...nodes); };
    async function refresh() {
      const [agents, models, savedSecrets, settings] = await Promise.all([
        request('GET', '/api/agent-profiles'), request('GET', '/api/profiles'),
        request('GET', '/api/settings/secrets'), request('GET', '/api/settings'),
      ]);
      if (disposed) return;
      profiles = agents.profiles ?? [];
      llms = models.profiles ?? [];
      secrets = savedSecrets.secrets ?? [];
      mcps = settings.agent_settings?.mcp_config ?? {};
    }
    function showList() {
      const list = el('div', { class: 'stack' });
      if (!profiles.length) list.append(text('p', 'No agent profiles yet. Create one to get started.'));
      for (const profile of profiles) list.append(el('div', { class: 'card row' },
        el('div', {}, text('h2', profile.name), text('span', `${profile.agent_kind} · ${profile.llm_profile_ref || 'no LLM'} · revision ${profile.revision ?? 0}`, 'muted')),
        el('div', { class: 'row' }, button('Edit', () => openEditor(profile.name)),
          button('Delete', async () => {
            if (!window.confirm(`Delete agent profile "${profile.name}"?`)) return;
            try {
              setStatus('Deleting…');
              await request('DELETE', `/api/agent-profiles/${encodeURIComponent(profile.name)}`);
              await refresh();
              if (!disposed) { setStatus('Profile deleted.'); showList(); }
            } catch (error) { if (!disposed) setStatus(error.message || 'Delete failed', true); }
          }, 'danger'))));
      render(el('div', { class: 'bar' }, text('h2', 'Agent profiles'), button('Create profile', () => openEditor(), 'primary')), list);
    }
    async function openEditor(name) {
      try {
        setStatus(name ? 'Loading profile…' : '');
        const original = name ? (await request('GET', `/api/agent-profiles/${encodeURIComponent(name)}`)).profile : null;
        if (original && original.agent_kind !== 'openhands') {
          throw new Error('This experiment edits OpenHands agents only; ACP profiles remain unchanged.');
        }
        if (!disposed) { setStatus(''); showEditor(original); }
      } catch (error) { if (!disposed) setStatus(error.message || 'Could not load profile', true); }
    }
    function showEditor(original) {
      const form = el('form', { class: 'stack' });
      const profileName = el('input', { required: '', maxlength: '64', value: original?.name ?? '', placeholder: 'e.g. code-review' });
      if (original) profileName.disabled = true;
      const modelChoice = el('select', {}, option('', 'Choose an existing LLM configuration'), ...llms.map((llm) => option(llm.name, `${llm.name}${llm.model ? ` · ${llm.model}` : ''}`)));
      modelChoice.value = original?.llm_profile_ref ?? '';
      const llmName = el('input', { placeholder: 'e.g. my-model' });
      const model = el('input', { placeholder: 'e.g. openai/gpt-5' });
      const apiKey = el('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Optional for local models' });
      const baseUrl = el('input', { type: 'url', placeholder: 'Optional custom endpoint' });
      const newModel = section('Or add a new LLM configuration', el('div', { class: 'stack' },
        field('Configuration name', llmName), field('Model identifier', model), field('API key', apiKey), field('Base URL', baseUrl)));
      const secretScope = el('select', {}, option('selected', 'Only selected secrets'), option('all', 'All saved secrets'));
      secretScope.value = original?.secret_refs === null ? 'all' : 'selected';
      const secretChecks = new Map();
      const secretList = el('div', { class: 'checks' });
      for (const secret of secrets) {
        const check = el('input', { type: 'checkbox', checked: original?.secret_refs?.includes(secret.name) ?? false });
        secretChecks.set(secret.name, check);
        secretList.append(el('label', { class: 'check' }, check, text('span', secret.name)));
      }
      const secretName = el('input', { placeholder: 'e.g. GITHUB_TOKEN' });
      const secretValue = el('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Value (never read back)' });
      const mcpScope = el('select', {}, option('selected', 'Only selected MCP servers'), option('all', 'All configured MCP servers'));
      mcpScope.value = original?.mcp_server_refs === null ? 'all' : 'selected';
      const mcpChecks = new Map();
      const mcpList = el('div', { class: 'checks' });
      for (const name of Object.keys(mcps)) {
        const check = el('input', { type: 'checkbox', checked: original?.mcp_server_refs?.includes(name) ?? false });
        mcpChecks.set(name, check);
        mcpList.append(el('label', { class: 'check' }, check, text('span', name)));
      }
      const suggestions = [
        { id: 'deepwiki', label: 'DeepWiki · public repository docs', url: 'https://mcp.deepwiki.com/mcp' },
        { id: 'hugging-face', label: 'Hugging Face · models and datasets', url: 'https://huggingface.co/mcp' },
        { id: 'cloudflare-docs', label: 'Cloudflare Docs · product documentation', url: 'https://docs.mcp.cloudflare.com/mcp' },
      ];
      const preset = el('select', {}, option('', 'Custom MCP server'), ...suggestions.map((item) => option(item.id, item.label)));
      const mcpName = el('input', { placeholder: 'e.g. my-mcp' });
      const transport = el('select', {}, option('streamable-http', 'Streamable HTTP'), option('sse', 'SSE'), option('stdio', 'stdio'));
      const address = el('input', { placeholder: 'https://example.com/mcp or command' });
      preset.addEventListener('change', () => {
        const selected = suggestions.find((item) => item.id === preset.value);
        if (selected) { mcpName.value = selected.id; transport.value = 'streamable-http'; address.value = selected.url; }
      });
      const persona = el('textarea', { placeholder: 'Leave empty to keep the built-in persona.' });
      persona.value = original?.persona ?? '';
      const suffix = el('textarea', { placeholder: 'Additional instructions for this agent' });
      suffix.value = original?.system_message_suffix ?? '';
      const save = el('button', { type: 'submit', text: original ? 'Save changes' : 'Create profile', class: 'primary' });
      form.append(
        el('div', { class: 'card stack' }, text('h2', original ? `Edit ${original.name}` : 'New agent profile'), field('Profile name', profileName), field('LLM configuration', modelChoice), newModel),
        section('Secrets · optional', el('div', { class: 'stack' }, text('p', 'Choose saved secret names or add a new one. Values stay in the server secret store.'), field('Access', secretScope), secretList, field('New secret name', secretName), field('New secret value', secretValue))),
        section('MCP servers · optional', el('div', { class: 'stack' }, text('p', 'Choose configured servers or add a marketplace suggestion or a custom URL/command.'), field('Access', mcpScope), mcpList, field('Marketplace suggestion', preset), el('div', { class: 'grid' }, field('Server name', mcpName), field('Transport', transport)), field('URL or command', address))),
        section('Agent behavior · optional', el('div', { class: 'stack' }, field('Persona (replaces default)', persona), field('Additional system instructions', suffix))),
        el('div', { class: 'row' }, save, button('Cancel', showList))
      );
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const name = profileName.value.trim(), newLLM = llmName.value.trim(), newSecret = secretName.value.trim(), newMCP = mcpName.value.trim();
        const wantsLLM = !!(newLLM || model.value.trim() || apiKey.value || baseUrl.value.trim());
        const wantsSecret = !!(newSecret || secretValue.value);
        const wantsMCP = !!(newMCP || address.value.trim());
        if (!NAME.test(name) || (wantsLLM && (!NAME.test(newLLM) || !model.value.trim())) ||
          (wantsSecret && (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(newSecret) || !secretValue.value)) ||
          (wantsMCP && (!newMCP || !address.value.trim() || (transport.value !== 'stdio' && !/^https?:\/\//.test(address.value.trim()))))) {
          setStatus('Complete each new resource and use valid names and URLs.', true); return;
        }
        const llmRef = wantsLLM ? newLLM : modelChoice.value;
        if (!llmRef) { setStatus('Select or create an LLM configuration.', true); return; }
        if ((wantsLLM && llms.some((item) => item.name === newLLM)) ||
          (wantsSecret && secrets.some((item) => item.name === newSecret)) ||
          (wantsMCP && Object.hasOwn(mcps, newMCP))) {
          setStatus('A resource name already exists. Select it above instead.', true); return;
        }
        const agent = original?.agent_kind === 'openhands' ? { ...original } : { agent_kind: 'openhands' };
        delete agent.id; delete agent.name; delete agent.revision; delete agent.schema_version;
        agent.llm_profile_ref = llmRef;
        agent.secret_refs = secretScope.value === 'all' ? null : [...secretChecks].filter(([, check]) => check.checked).map(([key]) => key).concat(wantsSecret ? [newSecret] : []);
        agent.mcp_server_refs = mcpScope.value === 'all' ? null : [...mcpChecks].filter(([, check]) => check.checked).map(([key]) => key).concat(wantsMCP ? [newMCP] : []);
        agent.persona = persona.value.trim() || null;
        agent.system_message_suffix = suffix.value.trim() || null;
        save.disabled = true;
        let phase = 'agent profile';
        try {
          setStatus('Saving resources and agent profile…');
          if (wantsLLM) {
            phase = 'LLM configuration';
            await request('POST', `/api/profiles/${encodeURIComponent(newLLM)}`, { llm: { model: model.value.trim(), ...(apiKey.value ? { api_key: apiKey.value } : {}), ...(baseUrl.value.trim() ? { base_url: baseUrl.value.trim() } : {}) }, include_secrets: true });
          }
          if (wantsSecret) {
            phase = 'secret';
            await request('PUT', '/api/settings/secrets', { name: newSecret, value: secretValue.value });
          }
          if (wantsMCP) {
            phase = 'MCP server';
            await request('POST', `/api/settings/mcp/${encodeURIComponent(newMCP)}`, transport.value === 'stdio' ? { transport: 'stdio', command: address.value.trim() } : { transport: transport.value, url: address.value.trim() });
          }
          phase = 'agent profile';
          await request('POST', `/api/agent-profiles/${encodeURIComponent(name)}`, agent);
          if (disposed) return;
          apiKey.value = ''; secretValue.value = '';
          await refresh();
          if (!disposed) { setStatus('Agent profile saved.'); showList(); }
        } catch { if (!disposed) setStatus(`Could not save ${phase}. Resources already saved remain available; review before retrying.`, true); }
        finally { save.disabled = false; }
      });
      render(form);
    }
    function showLaunch() {
      const select = el('select', {}, option('', 'Select an agent profile'), ...profiles.filter((p) => p.id).map((p) => option(p.id, p.name)));
      const prompt = el('textarea', { placeholder: 'What should this agent do?' });
      const workspace = el('input', { placeholder: '/absolute/path/to/workspace' });
      const launch = button('Launch conversation', async () => {
        if (!select.value || !prompt.value.trim() || !workspace.value.startsWith('/')) { setStatus('Select an agent, enter a prompt and an absolute workspace path.', true); return; }
        launch.disabled = true;
        try {
          setStatus('Launching conversation…');
          const allowed = await request('GET', `/api/settings/secrets?agent_profile_id=${encodeURIComponent(select.value)}`);
          const secretSources = Object.fromEntries((allowed.secrets ?? []).map(({ name }) => [name, {
            kind: 'LookupSecret', url: `/api/settings/secrets/${encodeURIComponent(name)}`,
          }]));
          const result = await request('POST', '/api/conversations', {
            agent_profile_id: select.value,
            workspace: { kind: 'LocalWorkspace', working_dir: workspace.value.trim() },
            secrets: secretSources,
            initial_message: { role: 'user', content: [{ type: 'text', text: prompt.value.trim() }], run: true },
          });
          if (!disposed) {
            if (!result?.id) throw new Error('Conversation response did not contain an id');
            setStatus('Conversation started.');
            navigate(`/conversations/${encodeURIComponent(result.id)}`);
          }
        } catch (error) { if (!disposed) setStatus(error.message || 'Launch failed', true); }
        finally { launch.disabled = false; }
      }, 'primary');
      render(el('div', { class: 'card stack' }, text('h2', 'Launch from an agent profile'), text('p', 'The server resolves the profile’s LLM, tools, secrets and MCPs at launch.'), field('Agent', select), field('Workspace (absolute path on active backend)', workspace), field('First message', prompt), launch));
    }
    const route = path.replace(/^\/+|\/+$/g, '');
    const load = () => refresh().then(() => {
      if (disposed) return;
      setStatus('');
      if (route === 'launch') showLaunch(); else if (!route) showList(); else render(text('p', 'Page not found.'));
    }).catch((error) => { if (!disposed) { setStatus(error.message || 'Could not load settings', true); render(button('Retry', load)); } });
    setStatus('Loading profiles…');
    load();
    return () => { disposed = true; style.remove(); root.remove(); };
  });
}
