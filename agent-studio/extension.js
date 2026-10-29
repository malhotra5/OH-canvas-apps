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
.agent-studio .market-grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 230px), 1fr)); max-height: 340px; overflow-y: auto; padding: 2px; }
.agent-studio .market-card { display: flex; flex-direction: column; gap: 8px; min-height: 130px; padding: 14px; background: var(--oh-color-base, #0b0e14); border: 1px solid var(--oh-border, #4b5468); border-radius: 10px; }
.agent-studio .market-card h3 { font-size: 14px; margin: 0; color: var(--oh-contrast, #fff); }
.agent-studio .market-card p { margin: 0; font-size: 12px; line-height: 1.5; }
.agent-studio .market-card .row { margin-top: auto; }
.agent-studio .market-card button { font-size: 12px; min-height: 30px; }
.agent-studio .marketplace { display: grid; gap: 10px; }
.agent-studio .marketplace > label { max-width: 420px; }
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
// Build-time snapshot of Canvas's @openhands/extensions/integrations MCP catalog.
const MCP_MARKETPLACE = [{"id":"github","name":"GitHub","description":"Search code, manage issues and pull requests, and inspect repos via the GitHub API.","categories":["Engineering","Source control"],"keywords":["git","pr","repo","issues","code"],"connectionOptions":[{"transport":{"kind":"shttp","url":"https://api.githubcopilot.com/mcp/"},"auth":{"strategy":"oauth2"}},{"transport":{"kind":"shttp","url":"https://api.githubcopilot.com/mcp/"},"auth":{"strategy":"api_key","credentialLabel":"Personal access token"}}]},{"id":"slack","name":"Slack","description":"Read channels, post messages, and search workspace history from your agent.","categories":["Communication","Operations"],"keywords":["chat","messaging","team"],"connectionOptions":[{"transport":{"kind":"shttp","url":"https://mcp.slack.com/mcp"},"auth":{"strategy":"oauth2"}},{"transport":{"kind":"stdio","serverName":"slack","command":"npx","args":["-y","@zencoderai/slack-mcp-server"],"envFields":[{"key":"SLACK_TEAM_ID","label":"Team / Workspace ID","type":"text","placeholder":"T01234567","helperText":"First get your [Slack URL](https://slack.com/help/articles/221769328-Locate-your-Slack-URL-or-ID#find-your-url). Then use that to get your [Workspace ID](https://slack.com/help/articles/221769328-Locate-your-Slack-URL-or-ID#find-your-workspace-or-org-id).","required":true},{"key":"SLACK_BOT_TOKEN","label":"Bot token","type":"password","placeholder":"xoxb-...","required":true,"helperText":"You'll need to create or have access to a [Slack App](https://github.com/zencoderai/slack-mcp-server#slack-bot-setup) to get a Bot token."}]},"auth":{"strategy":"api_key"}}]},{"id":"tavily","name":"Tavily","description":"Production-grade web search optimized for LLM agents. Free tier available.","keywords":["search","web","browsing","research"],"connectionOptions":[{"transport":{"kind":"stdio","serverName":"tavily","command":"npx","args":["-y","tavily-mcp"],"envFields":[{"key":"TAVILY_API_KEY","label":"Tavily API key","type":"password","placeholder":"tvly-...","required":true,"helperText":"API key from your Tavily dashboard.","helperLink":"https://app.tavily.com/home?tab=keys"}]},"auth":{"strategy":"api_key"}}]},{"id":"atlassian","name":"Atlassian (Jira & Confluence)","description":"Search Jira issues, manage tickets, and read Confluence pages from your agent.","categories":["Project management","Documentation"],"keywords":["jira","confluence","tickets","wiki","issues","sprint"],"connectionOptions":[{"transport":{"kind":"shttp","url":"https://mcp.atlassian.com/v1/mcp"},"auth":{"strategy":"oauth2"}},{"transport":{"kind":"stdio","serverName":"mcp-atlassian","command":"uvx","args":["mcp-atlassian"],"envFields":[{"key":"JIRA_URL","label":"Jira URL","type":"text","placeholder":"https://your-company.atlassian.net","required":false,"helperText":"Your Atlassian Jira base URL. Omit if using Confluence only."},{"key":"JIRA_USERNAME","label":"Jira username (email)","type":"text","placeholder":"your.email@company.com","required":false,"helperText":"Email address linked to your Atlassian account."},{"key":"JIRA_API_TOKEN","label":"Jira API token","type":"password","placeholder":"ATATT...","required":false,"helperText":"Atlassian API token for Jira. Required when JIRA_URL is set.","helperLink":"https://id.atlassian.com/manage-profile/security/api-tokens"},{"key":"CONFLUENCE_URL","label":"Confluence URL","type":"text","placeholder":"https://your-company.atlassian.net/wiki","required":false,"helperText":"Your Atlassian Confluence base URL. Omit if using Jira only."},{"key":"CONFLUENCE_USERNAME","label":"Confluence username (email)","type":"text","placeholder":"your.email@company.com","required":false,"helperText":"Email address linked to your Atlassian account."},{"key":"CONFLUENCE_API_TOKEN","label":"Confluence API token","type":"password","placeholder":"ATATT...","required":false,"helperText":"Atlassian API token for Confluence. Required when CONFLUENCE_URL is set.","helperLink":"https://id.atlassian.com/manage-profile/security/api-tokens"}]},"auth":{"strategy":"api_key"}}]},{"id":"linear","name":"Linear","description":"Browse and update Linear issues, cycles, and projects from the agent.","categories":["Project management","Engineering"],"keywords":["issues","project management","tasks","tickets"],"connectionOptions":[{"transport":{"kind":"shttp","url":"https://mcp.linear.app/mcp"},"auth":{"strategy":"oauth2"}},{"transport":{"kind":"shttp","url":"https://mcp.linear.app/mcp","apiKeyOptional":true},"auth":{"strategy":"bearer","apiKeyOptional":true,"credentialLabel":"Linear API key"}}]},{"id":"notion","name":"Notion","description":"Read and edit Notion pages, databases, and blocks via Notion's MCP server.","categories":["Knowledge base","Documentation"],"keywords":["docs","notes","wiki","knowledge base"],"connectionOptions":[{"transport":{"kind":"stdio","serverName":"notion","command":"npx","args":["-y","@notionhq/notion-mcp-server"],"envFields":[{"key":"NOTION_TOKEN","label":"Internal integration token","type":"password","placeholder":"ntn_...","required":true,"helperText":"Internal integration token from your Notion integrations page.","helperLink":"https://www.notion.so/profile/integrations"}]},"auth":{"strategy":"api_key"}}]},{"id":"vanta","name":"Vanta","description":"Query Vanta compliance controls, tests, evidence, risks, and vulnerabilities from the agent.","categories":["Security","Compliance"],"keywords":["compliance","soc2","security","audit","risk","vanta"],"connectionOptions":[{"transport":{"kind":"shttp","url":"https://mcp.vanta.com/mcp"},"auth":{"strategy":"oauth2"}}]},{"id":"gitlab","name":"GitLab","description":"Access projects, issues, merge requests, and CI/CD workflows through GitLab's official MCP server or API.","categories":["Engineering","Source control"],"keywords":["git","merge request","repo","issues","code","mr","devops"],"connectionOptions":[{"transport":{"kind":"shttp","url":"https://gitlab.com/api/v4/mcp","urlEditable":true},"auth":{"strategy":"oauth2"}}]},{"id":"ordinal","name":"Ordinal","description":"Social media posts, profiles, analytics, labels, approvals, and engagements.","categories":["Social media","Marketing"],"connectionOptions":[{"transport":{"kind":"shttp","url":"https://app.tryordinal.com/api/mcp"},"auth":{"strategy":"bearer","credentialLabel":"Ordinal API key"}}]},{"id":"bitbucket","name":"Bitbucket","description":"Repositories, pull requests, and Atlassian engineering workflows.","categories":["Engineering","Source control"],"connectionOptions":[{"transport":{"kind":"shttp","url":"https://mcp.atlassian.com/v2/mcp"},"auth":{"strategy":"oauth2"}}]},{"id":"quickbooks","name":"QuickBooks","description":"Accounting, invoices, customers, and financial operations via the QuickBooks Online MCP server.","categories":["Finance","Accounting"],"keywords":["accounting","finance","invoices","qbo"],"connectionOptions":[{"transport":{"kind":"stdio","serverName":"quickbooks-online","command":"npx","args":["-y","github:intuit/quickbooks-online-mcp-server"],"envFields":[{"key":"QUICKBOOKS_CLIENT_ID","label":"QuickBooks OAuth Client ID","type":"text","placeholder":"your-intuit-app-client-id","required":true,"helperText":"From the Intuit Developer Portal app you created.","helperLink":"https://developer.intuit.com/"},{"key":"QUICKBOOKS_CLIENT_SECRET","label":"QuickBooks OAuth Client Secret","type":"password","placeholder":"your-intuit-app-client-secret","required":true,"helperText":"From the Intuit Developer Portal app. Stored as a secret.","helperLink":"https://developer.intuit.com/"},{"key":"QUICKBOOKS_REFRESH_TOKEN","label":"QuickBooks Refresh Token","type":"password","placeholder":"your-refresh-token","required":true,"helperText":"Obtained after the one-time OAuth handshake (npm run auth). Auto-rotates; stored as a secret.","helperLink":"https://github.com/intuit/quickbooks-online-mcp-server#authentication"},{"key":"QUICKBOOKS_REALM_ID","label":"QuickBooks Company (Realm) ID","type":"text","placeholder":"your-company-id","required":true,"helperText":"The QBO company ID to connect to.","helperLink":"https://github.com/intuit/quickbooks-online-mcp-server#authentication"},{"key":"QUICKBOOKS_ENVIRONMENT","label":"Environment","type":"text","placeholder":"sandbox","required":false,"helperText":"sandbox or production (default: sandbox)."}]},"auth":{"strategy":"none"}}]},{"id":"sonarqube","name":"SonarQube","description":"Inspect code quality and security findings, quality gates, and analyze code snippets from SonarQube Server or Cloud.","categories":["Engineering","Security"],"keywords":["code quality","static analysis","security","sast","quality gate","sonarcloud"],"connectionOptions":[{"transport":{"kind":"stdio","serverName":"sonarqube","command":"docker","args":["run","--init","--pull=always","-i","--rm","-e","SONARQUBE_TOKEN","-e","SONARQUBE_ORG","-e","SONARQUBE_URL","sonarsource/sonarqube-mcp"],"envFields":[{"key":"SONARQUBE_TOKEN","label":"SonarQube token","type":"password","required":true,"helperText":"User token generated in your SonarQube Server or Cloud account settings.","helperLink":"https://docs.sonarsource.com/sonarqube-cloud/managing-your-account/managing-tokens/"},{"key":"SONARQUBE_ORG","label":"Organization key (SonarQube Cloud)","type":"text","required":false,"placeholder":"my-org","helperText":"Required for SonarQube Cloud. Your organization key, found in SonarQube Cloud."},{"key":"SONARQUBE_URL","label":"Server URL (SonarQube Server)","type":"text","required":false,"placeholder":"https://sonarqube.example.com","helperText":"Required for a self-managed SonarQube Server. For SonarQube Cloud US, use https://sonarqube.us."}]},"auth":{"strategy":"api_key"}}]},{"id":"supabase","name":"Supabase","description":"Query and manage your Supabase project, including database, auth, and storage.","categories":["Database","Developer tools"],"keywords":["database","auth","storage","postgres"],"connectionOptions":[{"transport":{"kind":"stdio","serverName":"supabase","command":"npx","args":["-y","@supabase/mcp-server-supabase@latest"],"envFields":[{"key":"SUPABASE_ACCESS_TOKEN","label":"Supabase access token","type":"password","required":true,"helperText":"Personal access token from your Supabase dashboard.","helperLink":"https://supabase.com/dashboard/account/tokens"}]},"auth":{"strategy":"api_key"}}]},{"id":"posthog","name":"PostHog","description":"Product analytics, feature flags, and session insights.","categories":["Analytics","Product"],"keywords":["analytics","feature flags","product","experiments"],"connectionOptions":[{"transport":{"kind":"shttp","url":"https://mcp.posthog.com/mcp?readonly=true","urlEditable":true},"auth":{"strategy":"oauth2"}},{"transport":{"kind":"shttp","url":"https://mcp.posthog.com/mcp"},"auth":{"strategy":"bearer","credentialLabel":"PostHog personal API key"}}]},{"id":"sentry","name":"Sentry","description":"Triage issues, inspect events, and run Seer fixes against your Sentry org.","categories":["Observability","Engineering"],"keywords":["errors","observability","monitoring","crash"],"connectionOptions":[{"transport":{"kind":"shttp","url":"https://mcp.sentry.dev/mcp"},"auth":{"strategy":"oauth2"}},{"transport":{"kind":"shttp","url":"https://mcp.sentry.dev/mcp"},"auth":{"strategy":"oauth2"}},{"transport":{"kind":"stdio","serverName":"sentry","command":"npx","args":["-y","@sentry/mcp-server"],"envFields":[{"key":"SENTRY_ACCESS_TOKEN","label":"Personal auth token","type":"password","placeholder":"sntryu_...","required":true,"helperText":"Create a [personal auth token](https://docs.sentry.io/account/auth-tokens/) with org:read, project:read, project:write, team:read, team:write, event:read and event:write. With read scopes only, tools that change issues or projects fail. On a self-hosted server, create it there."},{"key":"SENTRY_HOST","label":"Self-hosted Sentry host","type":"text","placeholder":"sentry.example.com","required":false,"helperText":"Leave empty for sentry.io. For a self-hosted server, enter its hostname without https://."}]},"auth":{"strategy":"api_key"}}]},{"id":"datadog","name":"Datadog","description":"Logs, metrics, monitors, incidents, and observability workflows.","categories":["Observability","Operations"],"connectionOptions":[{"transport":{"kind":"shttp","url":"https://mcp.datadoghq.com/v1/mcp"},"auth":{"strategy":"oauth2"}},{"transport":{"kind":"shttp","url":"https://mcp.datadoghq.com/v1/mcp","urlEditable":true,"headerFields":[{"key":"DD-API-KEY","label":"Datadog API key","type":"password","required":true,"placeholder":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx","helperText":"Created in Datadog under Organization Settings → API Keys. Used to authenticate to the Datadog MCP server. See the [setup docs](https://docs.datadoghq.com/mcp_server/setup/?tab=other#authentication)."},{"key":"DD-APPLICATION-KEY","label":"Datadog Application key","type":"password","required":true,"placeholder":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx","helperText":"Created in Datadog under Organization Settings → Application Keys. Grants the MCP server access to your Datadog data. See the [setup docs](https://docs.datadoghq.com/mcp_server/setup/?tab=other#authentication)."}]},"auth":{"strategy":"none"}}]},{"id":"miro","name":"Miro","description":"Whiteboards, diagrams, notes, and workshop collaboration.","categories":["Whiteboard","Collaboration"],"keywords":["whiteboard","collaboration","diagrams","visual"],"connectionOptions":[{"transport":{"kind":"shttp","url":"https://mcp.miro.com/"},"auth":{"strategy":"oauth2"}}]},{"id":"webflow","name":"Webflow","description":"CMS items, sites, and web publishing workflows.","categories":["CMS","Marketing"],"connectionOptions":[{"transport":{"kind":"shttp","url":"https://mcp.webflow.com/mcp"},"auth":{"strategy":"oauth2"}}]},{"id":"stripe","name":"Stripe","description":"Query customers, payments, subscriptions, and invoices via Stripe's hosted MCP server.","categories":["Payments","Finance"],"keywords":["payments","billing","subscriptions","finance"],"connectionOptions":[{"transport":{"kind":"shttp","url":"https://mcp.stripe.com/"},"auth":{"strategy":"bearer","credentialLabel":"Stripe restricted key"}}]},{"id":"hubspot","name":"HubSpot","description":"CRM, marketing, tickets, and customer lifecycle workflows.","categories":["CRM","Marketing"],"connectionOptions":[{"transport":{"kind":"shttp","url":"https://mcp.hubspot.com"},"auth":{"strategy":"oauth2"}}]},{"id":"salesforce","name":"Salesforce","description":"CRM records, accounts, opportunities, and sales operations.","categories":["CRM","Sales"],"keywords":["crm","sales","records","enterprise"],"connectionOptions":[{"transport":{"kind":"shttp","url":"https://api.salesforce.com/platform/mcp/v1/platform/sobject-reads","urlEditable":true},"auth":{"strategy":"oauth2"}}]},{"id":"airtable","name":"Airtable","description":"List bases, query records, and update fields across your Airtable workspace.","categories":["Database","Operations"],"keywords":["spreadsheet","database","records","bases"],"connectionOptions":[{"transport":{"kind":"stdio","serverName":"airtable","command":"npx","args":["-y","airtable-mcp-server"],"envFields":[{"key":"AIRTABLE_API_KEY","label":"Airtable personal access token","type":"password","required":true,"helperText":"Personal access token from your Airtable account.","helperLink":"https://airtable.com/create/tokens"}]},"auth":{"strategy":"api_key"}}]},{"id":"monday","name":"Monday.com","description":"Boards, automations, and work management across teams.","categories":["Project management","Operations"],"keywords":["project management","boards","work","operations"],"connectionOptions":[{"transport":{"kind":"shttp","url":"https://mcp.monday.com/mcp"},"auth":{"strategy":"oauth2"}}]},{"id":"figma","name":"Figma","description":"Read Figma frames, components, and styles to ground UI work in your designs.","categories":["Design","Frontend"],"keywords":["design","ui","frames","components"],"connectionOptions":[{"transport":{"kind":"stdio","serverName":"figma","command":"npx","args":["-y","figma-developer-mcp","--stdio"],"envFields":[{"key":"FIGMA_API_KEY","label":"Figma personal access token","type":"password","required":true,"helperText":"Personal access token from your Figma account settings.","helperLink":"https://developers.figma.com/docs/rest-api/authentication/#personal-access-tokens"}]},"auth":{"strategy":"api_key"}}]},{"id":"apify","name":"Apify Actors","description":"Run any of Apify's 5,000+ Actors (scrapers, automations) from the agent.","keywords":["scraping","automation","crawl","actors"],"connectionOptions":[{"transport":{"kind":"stdio","serverName":"apify","command":"npx","args":["-y","@apify/actors-mcp-server"],"envFields":[{"key":"APIFY_TOKEN","label":"Apify token","type":"password","required":true,"helperText":"API token from your Apify account settings.","helperLink":"https://console.apify.com/account/integrations"}]},"auth":{"strategy":"api_key"}}]},{"id":"atlassian-rovo","name":"Atlassian Rovo","description":"Search, create, and update Jira issues, Confluence pages, and Jira Service Management tickets, and read, commit to, and open pull requests on Bitbucket repos - all through Atlassian's official hosted MCP server, powered by your Teamwork Graph.","categories":["Project management","Documentation","Engineering"],"keywords":["atlassian","rovo","jira","confluence","bitbucket","jsm","tickets","wiki","issues","sprint","mcp"],"connectionOptions":[{"transport":{"kind":"shttp","url":"https://mcp.atlassian.com/v2/mcp"},"auth":{"strategy":"oauth2"}}]},{"id":"brave-search","name":"Brave Search","description":"Privacy-first web and local search using the Brave Search API.","keywords":["search","web"],"connectionOptions":[{"transport":{"kind":"stdio","serverName":"brave_search","command":"npx","args":["-y","@brave/brave-search-mcp-server","--transport","stdio"],"envFields":[{"key":"BRAVE_API_KEY","label":"Brave API key","type":"password","required":true,"helperText":"API key from the Brave Search API portal.","helperLink":"https://api-dashboard.search.brave.com/app/keys"}]},"auth":{"strategy":"api_key"}}]},{"id":"browser-mcp","name":"Browser MCP","description":"Control your local browser tab — navigate, click, type, and read DOM contents.","keywords":["browser","automation","chrome","playwright"],"connectionOptions":[{"transport":{"kind":"stdio","serverName":"browser_mcp","command":"npx","args":["-y","@browsermcp/mcp"]},"auth":{"strategy":"none"}}]},{"id":"clickhouse","name":"ClickHouse","description":"Run analytical SQL queries against a ClickHouse cluster.","keywords":["analytics","olap","database","sql"],"connectionOptions":[{"transport":{"kind":"stdio","serverName":"clickhouse","command":"uvx","args":["mcp-clickhouse"],"envFields":[{"key":"CLICKHOUSE_HOST","label":"Host","type":"text","placeholder":"clickhouse.example.com","required":true},{"key":"CLICKHOUSE_USER","label":"Username","type":"text","required":true},{"key":"CLICKHOUSE_PASSWORD","label":"Password","type":"password","required":true,"helperText":"Password for your ClickHouse user.","helperLink":"https://clickhouse.com/docs/operations/access-rights"}]},"auth":{"strategy":"api_key"}}]},{"id":"cloudflare-bindings","name":"Cloudflare Workers Bindings","description":"Inspect and manage KV, D1, R2, and Durable Object bindings on your Cloudflare account.","keywords":["cloudflare","workers","kv","d1","r2","durable objects"],"connectionOptions":[{"transport":{"kind":"shttp","url":"https://bindings.mcp.cloudflare.com/mcp"},"auth":{"strategy":"oauth2"}}]},{"id":"cloudflare-browser-rendering","name":"Cloudflare Browser Rendering","description":"Fetch and screenshot pages using Cloudflare's hosted browser rendering.","keywords":["cloudflare","browser","rendering","screenshots"],"connectionOptions":[{"transport":{"kind":"shttp","url":"https://browser.mcp.cloudflare.com/mcp"},"auth":{"strategy":"oauth2"}}]},{"id":"cloudflare-builds","name":"Cloudflare Builds","description":"Inspect Workers Builds — logs, statuses, and rerun failed deploys.","keywords":["cloudflare","workers","ci","builds","deploys"],"connectionOptions":[{"transport":{"kind":"shttp","url":"https://builds.mcp.cloudflare.com/mcp"},"auth":{"strategy":"oauth2"}}]},{"id":"cloudflare-docs","name":"Cloudflare Docs","description":"Search and reference Cloudflare's developer documentation directly from the agent.","keywords":["cloudflare","docs","reference","workers"],"connectionOptions":[{"transport":{"kind":"shttp","url":"https://docs.mcp.cloudflare.com/mcp"},"auth":{"strategy":"none"}}]},{"id":"cloudflare-observability","name":"Cloudflare Observability","description":"Tail Workers logs and query observability data from your Cloudflare account.","keywords":["cloudflare","logs","tail","observability","workers"],"connectionOptions":[{"transport":{"kind":"shttp","url":"https://observability.mcp.cloudflare.com/mcp"},"auth":{"strategy":"oauth2"}}]},{"id":"deepwiki","name":"DeepWiki","description":"Ask grounded questions about any public GitHub repository via Devin's DeepWiki MCP.","keywords":["devin","code","wiki","github","docs","qa"],"connectionOptions":[{"transport":{"kind":"shttp","url":"https://mcp.deepwiki.com/mcp"},"auth":{"strategy":"none"}}]},{"id":"everything","name":"Everything (demo)","description":"Reference server exercising every MCP capability — useful for testing.","keywords":["demo","test","reference"],"connectionOptions":[{"transport":{"kind":"stdio","serverName":"everything","command":"npx","args":["-y","@modelcontextprotocol/server-everything"]},"auth":{"strategy":"none"}}]},{"id":"exa","name":"Exa","description":"Neural web search with semantic ranking, content extraction, and similar-page lookup.","keywords":["search","web","research","neural"],"connectionOptions":[{"transport":{"kind":"stdio","serverName":"exa","command":"npx","args":["-y","exa-mcp-server"],"envFields":[{"key":"EXA_API_KEY","label":"Exa API key","type":"password","required":true,"helperText":"API key from your Exa account.","helperLink":"https://exa.ai/docs/reference/getting-started"}]},"auth":{"strategy":"api_key"}}]},{"id":"fetch","name":"Fetch","description":"Plain HTTP fetcher: download a URL and convert HTML to readable markdown.","keywords":["http","web","url","scrape"],"connectionOptions":[{"transport":{"kind":"stdio","serverName":"fetch","command":"uvx","args":["mcp-server-fetch"]},"auth":{"strategy":"none"}}]},{"id":"filesystem","name":"Filesystem","description":"Give the agent secure, scoped filesystem access outside the workspace.","keywords":["files","local","disk"],"connectionOptions":[{"transport":{"kind":"stdio","serverName":"filesystem","command":"npx","args":["-y","@modelcontextprotocol/server-filesystem"],"argFields":[{"key":"paths","label":"Paths (space separated)","type":"text","placeholder":"/Users/me/Documents /Users/me/Projects","required":true,"helperText":"Each whitespace-separated token is appended as its own argument."}]},"auth":{"strategy":"api_key"}}]},{"id":"firecrawl","name":"Firecrawl","description":"Crawl any site and return clean markdown, structured data, or screenshots.","keywords":["scraping","crawl","web","markdown"],"connectionOptions":[{"transport":{"kind":"stdio","serverName":"firecrawl","command":"npx","args":["-y","firecrawl-mcp"],"envFields":[{"key":"FIRECRAWL_API_KEY","label":"Firecrawl API key","type":"password","required":true,"helperText":"API key from your Firecrawl dashboard.","helperLink":"https://www.firecrawl.dev/app/api-keys"}]},"auth":{"strategy":"api_key"}}]},{"id":"git","name":"Git","description":"Local git repository operations: log, diff, blame, status, and more.","keywords":["version control","log","diff","blame"],"connectionOptions":[{"transport":{"kind":"stdio","serverName":"git","command":"uvx","args":["mcp-server-git","--repository"],"argFields":[{"key":"repo_path","label":"Repository path","type":"text","placeholder":"/Users/me/code/my-repo","required":true,"helperText":"Appended as --repository <path>."}]},"auth":{"strategy":"api_key"}}]},{"id":"granola","name":"Granola","description":"Search and query your Granola meeting notes, transcripts, folders, and action items.","categories":["Meetings","Knowledge base"],"keywords":["meeting notes","transcripts","meetings","notes","action items"],"connectionOptions":[{"transport":{"kind":"shttp","url":"https://mcp.granola.ai/mcp"},"auth":{"strategy":"oauth2"}}]},{"id":"huggingface","name":"Hugging Face","description":"Search models, datasets, and Spaces on the Hugging Face Hub from your agent.","keywords":["ml","models","datasets","ai","hub"],"connectionOptions":[{"transport":{"kind":"shttp","url":"https://huggingface.co/mcp","apiKeyOptional":true},"auth":{"strategy":"none","apiKeyOptional":true}}]},{"id":"kagi","name":"Kagi Search","description":"Paid, privacy-first search with high signal-to-noise — great for research.","keywords":["search","web","privacy"],"connectionOptions":[{"transport":{"kind":"stdio","serverName":"kagi","command":"uvx","args":["kagimcp"],"envFields":[{"key":"KAGI_API_KEY","label":"Kagi API key","type":"password","required":true,"helperText":"API key from your Kagi account settings.","helperLink":"https://kagi.com/settings?p=api"}]},"auth":{"strategy":"api_key"}}]},{"id":"memory","name":"Memory","description":"Persistent key-value memory for the agent across conversations.","keywords":["memory","kv","state","persistence"],"connectionOptions":[{"transport":{"kind":"stdio","serverName":"memory","command":"npx","args":["-y","@modelcontextprotocol/server-memory"]},"auth":{"strategy":"none"}}]},{"id":"mongodb","name":"MongoDB","description":"Query MongoDB collections, inspect schemas, and run aggregation pipelines.","keywords":["database","nosql","atlas"],"connectionOptions":[{"transport":{"kind":"stdio","serverName":"mongodb","command":"npx","args":["-y","mongodb-mcp-server"],"envFields":[{"key":"MDB_MCP_CONNECTION_STRING","label":"MongoDB connection string","type":"password","placeholder":"mongodb+srv://user:pass@cluster.mongodb.net","required":true,"helperText":"Connection string from your MongoDB Atlas cluster.","helperLink":"https://www.mongodb.com/docs/atlas/connect-to-database-deployment/#connect-with-a-connection-string"}]},"auth":{"strategy":"api_key"}}]},{"id":"neon","name":"Neon","description":"Serverless Postgres: list projects, run queries, manage branches.","keywords":["database","postgres","serverless"],"connectionOptions":[{"transport":{"kind":"stdio","serverName":"neon","command":"npx","args":["-y","@neondatabase/mcp-server-neon","start"],"envFields":[{"key":"NEON_API_KEY","label":"Neon API key","type":"password","required":true,"helperText":"API key from your Neon account settings.","helperLink":"https://neon.tech/docs/manage/api-keys"}]},"auth":{"strategy":"api_key"}}]},{"id":"obsidian","name":"Obsidian","description":"Read and edit Markdown notes inside an Obsidian vault on the local disk.","keywords":["notes","knowledge","markdown","vault"],"connectionOptions":[{"transport":{"kind":"stdio","serverName":"obsidian","command":"uvx","args":["mcp-obsidian"],"envFields":[{"key":"OBSIDIAN_API_KEY","label":"Local REST API key","type":"password","required":true,"helperText":"From the Obsidian 'Local REST API' community plugin.","helperLink":"https://github.com/coddingtonbear/obsidian-local-rest-api"}]},"auth":{"strategy":"api_key"}}]},{"id":"paypal","name":"PayPal","description":"Manage transactions and merchant data via PayPal's MCP server.","keywords":["payments","billing","finance"],"connectionOptions":[{"transport":{"kind":"shttp","url":"https://mcp.paypal.com/mcp"},"auth":{"strategy":"oauth2"}}]},{"id":"playwright","name":"Playwright","description":"Headless-browser automation backed by Microsoft Playwright.","keywords":["browser","automation","e2e","testing","scrape"],"connectionOptions":[{"transport":{"kind":"stdio","serverName":"playwright","command":"npx","args":["-y","@playwright/mcp"]},"auth":{"strategy":"none"}}]},{"id":"redis","name":"Redis","description":"Get, set, scan, and inspect data on a Redis or Redis-compatible instance.","keywords":["cache","kv","database"],"connectionOptions":[{"transport":{"kind":"stdio","serverName":"redis","command":"uvx","args":["--from","redis-mcp-server@latest","redis-mcp-server","--url"],"argFields":[{"key":"redis_url","label":"Redis URL","type":"password","placeholder":"redis://localhost:6379","required":true,"helperText":"Connection URL for your Redis instance. Appended as --url <redis_url>.","helperLink":"https://redis.io/docs/latest/operate/rc/databases/connect/"}]},"auth":{"strategy":"api_key"}}]},{"id":"reportportal","name":"ReportPortal","description":"Query test launches, test items, history, and analysis from your ReportPortal test automation dashboard.","categories":["Engineering","Analytics"],"keywords":["test reporting","test automation","qa","launches","test analytics","quality gate"],"connectionOptions":[{"transport":{"kind":"stdio","serverName":"reportportal","command":"docker","args":["run","--init","--pull=always","-i","--rm","-e","RP_API_TOKEN","-e","RP_HOST","-e","RP_PROJECT","reportportal/mcp-server"],"envFields":[{"key":"RP_API_TOKEN","label":"ReportPortal API token","type":"password","required":true,"helperText":"API token generated on your ReportPortal Profile page.","helperLink":"https://reportportal.io/docs/external-integrations/MCPServer/"},{"key":"RP_HOST","label":"ReportPortal host URL","type":"text","required":true,"placeholder":"https://your-reportportal-instance.com","helperText":"The base URL of your ReportPortal instance."},{"key":"RP_PROJECT","label":"Default project name","type":"text","required":false,"placeholder":"my-project","helperText":"Optional default ReportPortal project name to use for requests."}]},"auth":{"strategy":"api_key"}}]},{"id":"resend","name":"Resend","description":"Send transactional and marketing emails via the Resend API.","keywords":["email","transactional","smtp"],"connectionOptions":[{"transport":{"kind":"stdio","serverName":"resend","command":"npx","args":["-y","mcp-send-email"],"envFields":[{"key":"RESEND_API_KEY","label":"Resend API key","type":"password","required":true,"helperText":"API key from your Resend dashboard.","helperLink":"https://resend.com/api-keys"},{"key":"SENDER_EMAIL_ADDRESS","label":"From address","type":"text","placeholder":"you@example.com","required":true}]},"auth":{"strategy":"api_key"}}]},{"id":"sequential-thinking","name":"Sequential Thinking","description":"Lets the agent emit and revise a chain of structured thoughts.","keywords":["reasoning","planning","thoughts"],"connectionOptions":[{"transport":{"kind":"stdio","serverName":"sequential_thinking","command":"npx","args":["-y","@modelcontextprotocol/server-sequential-thinking"]},"auth":{"strategy":"none"}}]},{"id":"superhuman-mail","name":"Superhuman Mail","description":"Search, read, draft, and send email via Superhuman's hosted MCP server.","categories":["Communication","Email"],"keywords":["email","mail","superhuman","inbox"],"connectionOptions":[{"transport":{"kind":"shttp","url":"https://mcp.mail.superhuman.com/mcp"},"auth":{"strategy":"oauth2"}}]},{"id":"time","name":"Time","description":"Timezone-aware current time, conversions, and timestamp formatting.","keywords":["clock","timezone","date"],"connectionOptions":[{"transport":{"kind":"stdio","serverName":"time","command":"uvx","args":["mcp-server-time"]},"auth":{"strategy":"none"}}]}];

function marketplace(label, items, makeAction) {
  const query = el('input', { type: 'search', placeholder: `Search ${label} marketplace`, 'aria-label': `Search ${label} marketplace` });
  const grid = el('div', { class: 'market-grid' });
  function update() {
    const search = query.value.trim().toLowerCase();
    const visible = items.filter((item) => [item.name, item.description, item.id, ...(item.keywords ?? []), ...(item.categories ?? [])].join(' ').toLowerCase().includes(search));
    grid.replaceChildren(...visible.map((item) => el('article', { class: 'market-card' },
      text('h3', item.name), text('span', item.origin || item.categories?.[0] || '', 'muted'),
      text('p', item.description || 'No description available.'), el('div', { class: 'row' }, makeAction(item)))));
    if (!visible.length) grid.append(text('p', items.length ? 'No matches found.' : 'No entries available from this backend.'));
  }
  query.addEventListener('input', update);
  update();
  return el('div', { class: 'marketplace' }, field(`Browse ${label} marketplace`, query), grid);
}

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
    let profiles = [], llms = [], secrets = [], mcps = {}, skills = [], plugins = [], installedPlugins = [];
    const base = '/extensions/agent-studio/studio';
    const request = (method, url, body) => host.agentServer.request({ method, path: url, ...(body === undefined ? {} : { body }) });
    const status = text('p', '', 'status');
    const view = el('div');
    const setStatus = (message, error = false) => { status.textContent = message; status.className = `status${error ? ' error' : ''}`; };
    root.append(el('div', { class: 'bar' }, el('div', {}, text('h1', 'Agent Studio'), text('p', 'Build once. Launch with a profile.')),
      el('div', { class: 'row' }, button('Agents', () => navigate(base)), button('Launch', () => navigate(`${base}/launch`)))), status, view);
    const render = (...nodes) => { if (!disposed) view.replaceChildren(...nodes); };
    async function refresh() {
      const [agents, models, savedSecrets, settings, installed] = await Promise.all([
        request('GET', '/api/agent-profiles'), request('GET', '/api/profiles'),
        request('GET', '/api/settings/secrets'), request('GET', '/api/settings'),
        request('GET', '/api/plugins/installed'),
      ]);
      if (disposed) return;
      profiles = agents.profiles ?? [];
      llms = models.profiles ?? [];
      secrets = savedSecrets.secrets ?? [];
      mcps = settings.agent_settings?.mcp_config ?? {};
      installedPlugins = installed.plugins ?? [];
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
        const [skillCatalog, pluginCatalog] = await Promise.all([
          request('GET', '/api/skills/catalog'), request('GET', '/api/plugins/marketplace'),
        ]);
        if (!Array.isArray(skillCatalog.skills) || !Array.isArray(pluginCatalog.plugins)) throw new Error('Marketplace catalog is unavailable.');
        if (!disposed) {
          skills = skillCatalog.skills;
          plugins = pluginCatalog.plugins;
          setStatus(''); showEditor(original);
        }
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
      const mcpName = el('input', { placeholder: 'e.g. my-mcp' });
      const transport = el('select', {}, option('streamable-http', 'Streamable HTTP'), option('sse', 'SSE'), option('stdio', 'stdio'));
      const address = el('input', { placeholder: 'https://example.com/mcp or command' });
      const mcpCredential = el('input', { type: 'password', autocomplete: 'new-password', placeholder: 'MCP access token' });
      const credentialField = field('Marketplace credential (saved on the backend)', mcpCredential);
      credentialField.hidden = true;
      let mcpTemplate = null;
      for (const control of [address, transport]) control.addEventListener('input', () => { mcpTemplate = null; credentialField.hidden = true; mcpCredential.value = ''; });
      const mcpMarket = marketplace('MCP', MCP_MARKETPLACE, (entry) => {
        if (mcpChecks.has(entry.id)) return button(`Select ${entry.name}`, () => {
          mcpChecks.get(entry.id).checked = true;
          setStatus(`${entry.name} selected from configured MCP servers.`);
        });
        const candidate = entry.connectionOptions.find(({ transport: tpl, auth }) =>
          ['none', 'api_key', 'bearer'].includes(auth.strategy) &&
          (['shttp', 'sse'].includes(tpl.kind) && !tpl.headerFields?.length ||
            tpl.kind === 'stdio' && auth.strategy === 'none' && !(tpl.envFields?.length || tpl.argFields?.length)));
        if (!candidate) return button('Configure in Customize', () => {
          if (window.confirm('This connection needs advanced setup in Customize. Leave this unsaved form?')) navigate('/mcp');
        });
        return button(`Use ${entry.name}`, () => {
          mcpTemplate = candidate;
          mcpName.value = entry.id.replace(/[^A-Za-z0-9_-]/g, '-');
          transport.value = candidate.transport.kind === 'shttp' ? 'streamable-http' : candidate.transport.kind;
          address.value = candidate.transport.url || candidate.transport.command || '';
          credentialField.hidden = candidate.auth.strategy === 'none';
          mcpCredential.value = '';
          setStatus(`${entry.name} selected. Review the connection below before saving.`);
        });
      });
      const disabledSkills = new Set(original?.disabled_skills ?? []);
      const skillChecks = new Map();
      const skillMarket = marketplace('skills', skills, (skill) => {
        let check = skillChecks.get(skill.name);
        if (!check) {
          check = el('input', { type: 'checkbox', checked: !disabledSkills.has(skill.name), 'aria-label': `Enable ${skill.name}` });
          skillChecks.set(skill.name, check);
        }
        return el('label', { class: 'check' }, check, text('span', 'Enabled for this profile'));
      });
      const pluginMarket = marketplace('plugins', plugins, (plugin) => {
        const installed = installedPlugins.find((item) => item.name === plugin.name);
        if (installed) return text('span', installed.enabled ? 'Installed on this backend' : 'Disabled in Customize', 'muted');
        const install = button(`Install ${plugin.name}`, async () => {
          if (!window.confirm(`Install trusted plugin "${plugin.name}" from ${plugin.source}? Plugins may run hooks in future conversations.`)) return;
          install.disabled = true;
          try {
            await request('POST', '/api/plugins/install', { source: plugin.source, ...(plugin.ref ? { ref: plugin.ref } : {}), ...(plugin.repo_path ? { repo_path: plugin.repo_path } : {}) });
            if (disposed) return;
            installedPlugins = (await request('GET', '/api/plugins/installed')).plugins ?? [];
            if (!disposed) { install.textContent = 'Installed on this backend'; setStatus(`${plugin.name} installed. Select it on Launch to attach it to a conversation.`); }
          } catch (error) { if (!disposed) { install.disabled = false; setStatus(error.message || 'Plugin installation failed.', true); } }
        });
        return install;
      });
      const persona = el('textarea', { placeholder: 'Leave empty to keep the built-in persona.' });
      persona.value = original?.persona ?? '';
      const suffix = el('textarea', { placeholder: 'Additional instructions for this agent' });
      suffix.value = original?.system_message_suffix ?? '';
      const save = el('button', { type: 'submit', text: original ? 'Save changes' : 'Create profile', class: 'primary' });
      form.append(
        el('div', { class: 'card stack' }, text('h2', original ? `Edit ${original.name}` : 'New agent profile'), field('Profile name', profileName), field('LLM configuration', modelChoice), newModel),
        section('Secrets · optional', el('div', { class: 'stack' }, text('p', 'Choose saved secret names or add a new one. Values stay in the server secret store.'), field('Access', secretScope), secretList, field('New secret name', secretName), field('New secret value', secretValue))),
        section('MCP servers · optional', el('div', { class: 'stack' }, text('p', 'Browse the same MCP library as Customize, or select a configured server. Advanced connections open Customize.'), field('Access', mcpScope), mcpList, mcpMarket, text('h3', 'New server connection'), el('div', { class: 'grid' }, field('Server name', mcpName), field('Transport', transport)), field('URL or command', address), credentialField)),
        section('Skills · optional', el('div', { class: 'stack' }, text('p', 'Available public and user skills are enabled by default. Uncheck a skill to disable it for this profile.'), skillMarket)),
        section('Plugins · optional', el('div', { class: 'stack' }, text('p', 'Plugins are selected when launching a conversation, not saved in agent profiles. Installing a plugin affects this backend; review its source before installing.'), pluginMarket)),
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
          (wantsMCP && (!newMCP || !address.value.trim() || (transport.value !== 'stdio' && !/^https?:\/\//.test(address.value.trim())))) ||
          (wantsMCP && mcpTemplate && mcpTemplate.auth.strategy !== 'none' && !mcpTemplate.auth.apiKeyOptional && !mcpCredential.value.trim())) {
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
        agent.disabled_skills = [...new Set([
          ...[...disabledSkills].filter((skill) => !skillChecks.get(skill)?.checked),
          ...[...skillChecks].filter(([, check]) => !check.checked).map(([skill]) => skill),
        ])];
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
            const auth = mcpTemplate?.auth;
            const credential = mcpCredential.value.trim();
            const connection = transport.value === 'stdio'
              ? { transport: 'stdio', command: address.value.trim(), ...(mcpTemplate?.transport.args?.length ? { args: mcpTemplate.transport.args } : {}) }
              : { transport: transport.value, url: address.value.trim() };
            if (auth && auth.strategy !== 'none' && credential) {
              connection.auth = { strategy: auth.strategy, value: credential, ...(auth.apiKeyHeaderName ? { header_name: auth.apiKeyHeaderName } : {}) };
            }
            await request('POST', `/api/settings/mcp/${encodeURIComponent(newMCP)}`, connection);
          }
          phase = 'agent profile';
          await request('POST', `/api/agent-profiles/${encodeURIComponent(name)}`, agent);
          if (disposed) return;
          apiKey.value = ''; secretValue.value = ''; mcpCredential.value = '';
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
      const pluginChoices = installedPlugins.filter((plugin) => plugin.enabled);
      const pluginChecks = pluginChoices.map((plugin) => [plugin, el('input', { type: 'checkbox', 'aria-label': `Attach ${plugin.name}` })]);
      const pluginList = el('div', { class: 'checks' }, ...pluginChecks.map(([plugin, check]) => el('label', { class: 'check' }, check, text('span', plugin.name))));
      const launch = button('Launch conversation', async () => {
        if (!select.value || !prompt.value.trim() || !workspace.value.startsWith('/')) { setStatus('Select an agent, enter a prompt and an absolute workspace path.', true); return; }
        launch.disabled = true;
        try {
          setStatus('Launching conversation…');
          const allowed = await request('GET', `/api/settings/secrets?agent_profile_id=${encodeURIComponent(select.value)}`);
          const secretSources = Object.fromEntries((allowed.secrets ?? []).map(({ name }) => [name, {
            kind: 'LookupSecret', url: `/api/settings/secrets/${encodeURIComponent(name)}`,
          }]));
          const selectedPlugins = pluginChecks.filter(([, check]) => check.checked).map(([plugin]) => ({
            source: plugin.source,
            ...(plugin.resolved_ref || plugin.requested_ref ? { ref: plugin.resolved_ref || plugin.requested_ref } : {}),
            ...(plugin.repo_path ? { repo_path: plugin.repo_path } : {}),
          }));
          const result = await request('POST', '/api/conversations', {
            agent_profile_id: select.value,
            workspace: { kind: 'LocalWorkspace', working_dir: workspace.value.trim() },
            secrets: secretSources,
            ...(selectedPlugins.length ? { plugins: selectedPlugins } : {}),
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
      render(el('div', { class: 'card stack' }, text('h2', 'Launch from an agent profile'), text('p', 'The server resolves the profile’s LLM, tools, secrets, skills and MCPs at launch.'), field('Agent', select), field('Workspace (absolute path on active backend)', workspace), field('First message', prompt), text('h3', 'Plugins for this conversation'), text('p', 'Plugins are not stored on agent profiles. Select trusted installed plugins for this launch only.'), pluginList, launch));
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
