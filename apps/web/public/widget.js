var OpenAgentChat=(function(u){"use strict";var T=Object.defineProperty;var L=(u,b,g)=>b in u?T(u,b,{enumerable:!0,configurable:!0,writable:!0,value:g}):u[b]=g;var c=(u,b,g)=>L(u,typeof b!="symbol"?b+"":b,g);const b=`
:host {
  all: initial;
  display: block;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: #1e293b;
  -webkit-font-smoothing: antialiased;
  z-index: 2147483647;
}

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

/* Floating Launcher Button */
.oa-launcher {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 60px;
  height: 60px;
  border-radius: 30px;
  background: var(--oa-primary, #6366f1);
  color: #ffffff;
  border: none;
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s ease;
  z-index: 2147483647;
  outline: none;
}

.oa-launcher:hover {
  transform: scale(1.06);
  box-shadow: 0 8px 28px rgba(99, 102, 241, 0.45);
}

.oa-launcher:active {
  transform: scale(0.96);
}

.oa-launcher:focus-visible {
  outline: 3px solid #ffffff;
  outline-offset: 3px;
}

.oa-launcher.oa-left {
  right: auto;
  left: 24px;
}

.oa-launcher-icon {
  width: 28px;
  height: 28px;
  fill: currentColor;
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.oa-launcher.oa-open .oa-icon-chat {
  display: none;
}

.oa-launcher:not(.oa-open) .oa-icon-close {
  display: none;
}

/* Chat Window Panel */
.oa-panel {
  position: fixed;
  bottom: 96px;
  right: 24px;
  width: 400px;
  max-width: calc(100vw - 32px);
  height: 640px;
  max-height: calc(100vh - 120px);
  background: #ffffff;
  border-radius: 20px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.18), 0 4px 12px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 2147483647;
  border: 1px solid rgba(0, 0, 0, 0.08);
  transform-origin: bottom right;
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease, visibility 0.25s;
}

.oa-panel.oa-left {
  right: auto;
  left: 24px;
  transform-origin: bottom left;
}

.oa-panel.oa-hidden {
  opacity: 0;
  visibility: hidden;
  transform: scale(0.92) translateY(20px);
  pointer-events: none;
}

/* Header */
.oa-header {
  background: var(--oa-primary, #6366f1);
  color: #ffffff;
  padding: 16px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.oa-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.oa-avatar {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
}

.oa-header-info {
  display: flex;
  flex-direction: column;
}

.oa-header-title {
  font-weight: 700;
  font-size: 15px;
  line-height: 1.2;
}

.oa-header-status {
  font-size: 11px;
  opacity: 0.85;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
}

.oa-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
}

.oa-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.oa-btn-icon {
  background: transparent;
  border: none;
  color: #ffffff;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0.8;
  transition: opacity 0.15s, background-color 0.15s;
}

.oa-btn-icon:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.15);
}

.oa-btn-icon:focus-visible {
  outline: 2px solid #ffffff;
}

/* Message List */
.oa-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: #f8fafc;
  scroll-behavior: smooth;
}

/* Welcome Card */
.oa-welcome-card {
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.oa-welcome-text {
  font-size: 14px;
  color: #334155;
  line-height: 1.5;
}

/* Suggested Questions */
.oa-suggested {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.oa-suggested-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: #94a3b8;
  letter-spacing: 0.04em;
  margin-bottom: 2px;
}

.oa-chip {
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 12px;
  color: #475569;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;
  outline: none;
}

.oa-chip:hover {
  background: #e2e8f0;
  color: #1e293b;
  border-color: #cbd5e1;
}

.oa-chip:focus-visible {
  outline: 2px solid var(--oa-primary, #6366f1);
}

/* Message Rows */
.oa-message-row {
  display: flex;
  flex-direction: column;
  max-width: 86%;
}

.oa-row-visitor {
  align-self: flex-end;
  align-items: flex-end;
}

.oa-row-assistant {
  align-self: flex-start;
  align-items: flex-start;
}

.oa-bubble {
  padding: 12px 16px;
  border-radius: 16px;
  font-size: 13.5px;
  line-height: 1.5;
  word-break: break-word;
}

.oa-row-visitor .oa-bubble {
  background: var(--oa-primary, #6366f1);
  color: #ffffff;
  border-bottom-right-radius: 4px;
}

.oa-row-assistant .oa-bubble {
  background: #ffffff;
  color: #1e293b;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-bottom-left-radius: 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

.oa-message-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.oa-row-assistant:hover .oa-message-actions {
  opacity: 1;
}

.oa-copy-btn,
.oa-feedback-btn {
  background: transparent;
  border: none;
  font-size: 11px;
  color: #94a3b8;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px;
  border-radius: 4px;
  transition: transform 0.1s ease, color 0.15s ease;
}

.oa-copy-btn:hover,
.oa-feedback-btn:hover {
  color: #475569;
  transform: scale(1.1);
}

.oa-feedback-btn.oa-selected {
  color: var(--oa-primary, #6366f1);
  font-weight: 700;
}

/* Markdown Styling inside bubbles */
.oa-bubble p {
  margin-bottom: 6px;
}

.oa-bubble p:last-child {
  margin-bottom: 0;
}

.oa-bubble strong {
  font-weight: 700;
}

.oa-bubble em {
  font-style: italic;
}

.oa-bubble .oa-inline-code {
  background: rgba(0, 0, 0, 0.06);
  padding: 2px 5px;
  border-radius: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}

.oa-row-visitor .oa-bubble .oa-inline-code {
  background: rgba(255, 255, 255, 0.25);
  color: #ffffff;
}

.oa-bubble .oa-code-block {
  background: #0f172a;
  color: #f8fafc;
  padding: 10px 12px;
  border-radius: 8px;
  margin: 8px 0;
  overflow-x: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}

.oa-bubble .oa-link {
  color: var(--oa-primary, #6366f1);
  text-decoration: underline;
}

.oa-bubble ul.oa-list {
  padding-left: 18px;
  margin: 6px 0;
}

/* Typing Indicator */
.oa-typing {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 10px 14px;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 16px;
  border-bottom-left-radius: 4px;
  align-self: flex-start;
}

.oa-typing-dot {
  width: 6px;
  height: 6px;
  background: #94a3b8;
  border-radius: 50%;
  animation: oaPulse 1.4s infinite ease-in-out;
}

.oa-typing-dot:nth-child(2) { animation-delay: 0.2s; }
.oa-typing-dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes oaPulse {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}

/* Error Banner */
.oa-error-banner {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
}

.oa-retry-btn {
  background: transparent;
  border: 1px solid #f87171;
  color: #b91c1c;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

/* Input Area */
.oa-footer {
  border-top: 1px solid #e2e8f0;
  padding: 12px 16px;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.oa-input-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.oa-textarea {
  flex: 1;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  padding: 10px 12px;
  font-family: inherit;
  font-size: 13.5px;
  color: #1e293b;
  resize: none;
  outline: none;
  max-height: 120px;
  min-height: 42px;
  line-height: 1.4;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.oa-textarea:focus {
  border-color: var(--oa-primary, #6366f1);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
}

.oa-btn-send {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--oa-primary, #6366f1);
  color: #ffffff;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.15s, opacity 0.15s;
  flex-shrink: 0;
}

.oa-btn-send:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.oa-btn-send:not(:disabled):hover {
  transform: scale(1.04);
}

.oa-branding {
  text-align: center;
  font-size: 10.5px;
  color: #94a3b8;
}

.oa-branding a {
  color: inherit;
  text-decoration: none;
  font-weight: 600;
}

/* Mobile Layout */
@media (max-width: 600px) {
  .oa-panel {
    bottom: 0;
    right: 0;
    left: 0;
    width: 100vw;
    max-width: 100vw;
    height: 100%;
    height: 100dvh;
    max-height: 100dvh;
    border-radius: 0;
    border: none;
    transform-origin: bottom center;
  }
  .oa-launcher {
    bottom: 16px;
    right: 16px;
  }
}

/* Reduced Motion Support */
@media (prefers-reduced-motion: reduce) {
  .oa-launcher, .oa-panel, .oa-btn-send, .oa-typing-dot {
    transition: none !important;
    animation: none !important;
  }
}
`;function g(n){return n.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function M(n){try{const e=new URL(n);return e.protocol==="https:"||e.protocol==="http:"}catch{return!1}}function v(n){if(!n)return"";let e=g(n);return e=e.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g,(r,s,t)=>`<pre class="oa-code-block"><code>${t.trim()}</code></pre>`),e=e.replace(/`([^`]+)`/g,'<code class="oa-inline-code">$1</code>'),e=e.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>"),e=e.replace(/__([^_]+)__/g,"<strong>$1</strong>"),e=e.replace(/\*([^*]+)\*/g,"<em>$1</em>"),e=e.replace(/_([^_]+)_/g,"<em>$1</em>"),e=e.replace(/\[([^\]]+)\]\(([^)]+)\)/g,(r,s,t)=>{const o=t.replace(/&amp;/g,"&");return M(o)?`<a href="${t}" target="_blank" rel="noopener noreferrer" class="oa-link">${s}</a>`:`${s} (${t})`}),e=e.replace(/(?:^|\n)[-*]\s+([^\n]+)/g,'<li class="oa-list-item">$1</li>'),e=e.replace(/(<li class="oa-list-item">[\s\S]*?<\/li>)/g,'<ul class="oa-list">$1</ul>'),e=e.replace(/<\/ul>\s*<ul class="oa-list">/g,""),e=e.replace(/\n/g,"<br/>"),e=e.replace(/<pre class="oa-code-block">([\s\S]*?)<\/pre>/g,r=>r.replace(/<br\/>/g,`
`)),e=e.replace(/<br\/>\s*(<\/?(ul|li|pre))/g,"$1"),e=e.replace(/(<\/(ul|li|pre)>)\s*<br\/>/g,"$1"),e}class C{constructor(e){c(this,"config");c(this,"visitorSessionId");c(this,"siteName","AI Assistant");this.config={apiUrl:e.apiUrl||window.__OPENAGENT_API_URL__||window.location.origin.replace(":3000",":3001"),...e};const r=`openagent_visitor_${e.siteId}`;let s=localStorage.getItem(r);s||(s="v_"+Math.random().toString(36).substring(2,15)+Date.now().toString(36),localStorage.setItem(r,s)),this.visitorSessionId=s}async loadConfig(){var e,r,s,t,o,i,a,l,m,y;try{const h=`${this.config.apiUrl}/api/v1/site/config?publicKey=${encodeURIComponent(this.config.siteId)}`,d=await fetch(h,{method:"GET",headers:{"x-visitor-session":this.visitorSessionId}});if(!d.ok)throw new Error(`Failed to load site config: HTTP ${d.status}`);const f=await d.json();if(f!=null&&f.success&&(f!=null&&f.data)){const x=f.data;if(this.siteName=x.name||this.siteName,x.studioConfig){const p=x.studioConfig;this.config.primaryColor=((e=p.theme)==null?void 0:e.primaryColor)||this.config.primaryColor,this.config.accentColor=((r=p.theme)==null?void 0:r.accentColor)||this.config.accentColor,this.config.botName=((s=p.assistant)==null?void 0:s.name)||this.config.botName,this.config.avatar=((t=p.assistant)==null?void 0:t.avatar)||this.config.avatar,this.config.welcomeMessage=((o=p.messaging)==null?void 0:o.welcomeMessage)||this.config.welcomeMessage,this.config.suggestedQuestions=((i=p.messaging)==null?void 0:i.suggestedQuestions)||this.config.suggestedQuestions,this.config.position=((a=p.theme)==null?void 0:a.launcherPosition)||this.config.position,this.config.panelWidth=((l=p.theme)==null?void 0:l.panelWidth)||this.config.panelWidth,this.config.panelHeight=((m=p.theme)==null?void 0:m.panelHeight)||this.config.panelHeight,this.config.borderRadius=((y=p.theme)==null?void 0:y.borderRadius)||this.config.borderRadius,this.config.studioConfig=p}else x.branding&&(this.config.primaryColor=x.branding.primaryColor||this.config.primaryColor,this.config.botName=x.branding.botName||this.config.botName,this.config.welcomeMessage=x.branding.welcomeMessage||this.config.welcomeMessage,this.config.position=x.branding.position||this.config.position)}}catch(h){console.warn("[OpenAgent] Handshake warning; using local defaults:",h)}return this.config}async sendMessage(e,r,s,t,o){var a;const i=`${this.config.apiUrl}/api/v1/chat/stream`;try{const l=await fetch(i,{method:"POST",headers:{"Content-Type":"application/json","x-visitor-session":this.visitorSessionId},body:JSON.stringify({siteId:this.config.siteId,message:e,history:r.slice(-6).map(d=>({role:d.role,content:d.content}))})});if(!l.ok){const d=await l.json().catch(()=>({})),f=((a=d==null?void 0:d.error)==null?void 0:a.message)||`Server responded with ${l.status}`;throw new Error(f)}if(!l.body)throw new Error("ReadableStream not supported by browser response");const m=l.body.getReader(),y=new TextDecoder;let h="";for(;;){const{done:d,value:f}=await m.read();if(d)break;const p=y.decode(f,{stream:!0}).split(`
`);for(const A of p){const w=A.trim();if(w.startsWith("data:")){const E=w.substring(5).trim();if(E==="[DONE]")continue;try{const S=JSON.parse(E);S.text&&(h+=S.text,s(h))}catch{h+=E,s(h)}}else w.length>0&&!w.startsWith(":")&&(h+=w,s(h))}}t()}catch(l){o(l instanceof Error?l:new Error(String(l)))}}async sendFeedback(e,r){try{const s=`${this.config.apiUrl}/api/v1/chat/feedback`;return(await fetch(s,{method:"POST",headers:{"Content-Type":"application/json","x-visitor-session":this.visitorSessionId},body:JSON.stringify({siteId:this.config.siteId,rating:e,comment:r})})).ok}catch{return!1}}}class k{constructor(e){c(this,"client");c(this,"shadow");c(this,"host");c(this,"isOpen",!1);c(this,"isGenerating",!1);c(this,"messages",[]);c(this,"lastVisitorMessage","");c(this,"launcherBtn");c(this,"panelEl");c(this,"messagesEl");c(this,"inputEl");c(this,"sendBtn");c(this,"typingEl");c(this,"errorEl");this.client=new C(e),this.host=document.createElement("openagent-chat"),this.shadow=this.host.attachShadow({mode:"open"})}async mount(){this.render(),document.body.appendChild(this.host),await this.client.loadConfig(),this.updateTheme()}render(){const e=this.client.config.position==="bottom-left";this.shadow.innerHTML=`
      <style>${b}</style>

      <!-- Floating Launcher Button -->
      <button
        class="oa-launcher ${e?"oa-left":""}"
        aria-label="Open AI chat assistant"
        aria-expanded="false"
        type="button"
      >
        <svg class="oa-launcher-icon oa-icon-chat" viewBox="0 0 24 24">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
        </svg>
        <svg class="oa-launcher-icon oa-icon-close" viewBox="0 0 24 24">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      </button>

      <!-- Chat Panel -->
      <div
        class="oa-panel oa-hidden ${e?"oa-left":""}"
        role="dialog"
        aria-label="Chat with AI assistant"
      >
        <!-- Header -->
        <div class="oa-header">
          <div class="oa-header-left">
            <div class="oa-avatar" aria-hidden="true">🤖</div>
            <div class="oa-header-info">
              <span class="oa-header-title">${g(this.client.config.botName||"AI Assistant")}</span>
              <span class="oa-header-status">
                <span class="oa-status-dot"></span> Online & Grounded
              </span>
            </div>
          </div>
          <div class="oa-header-actions">
            <button class="oa-btn-icon oa-btn-restart" title="Restart Conversation" aria-label="Restart conversation" type="button">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
              </svg>
            </button>
            <button class="oa-btn-icon oa-btn-close" title="Close Chat" aria-label="Close chat" type="button">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Messages Area -->
        <div class="oa-messages" role="log" aria-live="polite">
          <div class="oa-welcome-card">
            <div class="oa-welcome-text">
              ${v(this.client.config.welcomeMessage||"Hello! How can I assist you with this website today?")}
            </div>
            <div class="oa-suggested">
              <span class="oa-suggested-title">Suggested Inquiries</span>
              <button type="button" class="oa-chip" data-query="What can you help me with?">What can you help me with?</button>
              <button type="button" class="oa-chip" data-query="Tell me about your services">Tell me about your services</button>
            </div>
          </div>
        </div>

        <!-- Typing Indicator (Hidden by default) -->
        <div class="oa-typing" style="display: none; margin: 0 20px 10px;" aria-label="Assistant is generating response">
          <span class="oa-typing-dot"></span>
          <span class="oa-typing-dot"></span>
          <span class="oa-typing-dot"></span>
        </div>

        <!-- Error Banner (Hidden by default) -->
        <div class="oa-error-banner" style="display: none; margin: 0 20px 10px;">
          <span class="oa-error-text">Network error occurred</span>
          <button type="button" class="oa-retry-btn">Retry</button>
        </div>

        <!-- Footer / Input -->
        <div class="oa-footer">
          <div class="oa-input-row">
            <textarea
              class="oa-textarea"
              placeholder="Ask a question..."
              rows="1"
              aria-label="Message input"
            ></textarea>
            <button class="oa-btn-send" aria-label="Send message" type="button" disabled>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
          </div>
          <div class="oa-branding">
            Powered by <strong>OpenAgent Chat</strong>
          </div>
        </div>
      </div>
    `,this.launcherBtn=this.shadow.querySelector(".oa-launcher"),this.panelEl=this.shadow.querySelector(".oa-panel"),this.messagesEl=this.shadow.querySelector(".oa-messages"),this.inputEl=this.shadow.querySelector(".oa-textarea"),this.sendBtn=this.shadow.querySelector(".oa-btn-send"),this.typingEl=this.shadow.querySelector(".oa-typing"),this.errorEl=this.shadow.querySelector(".oa-error-banner"),this.bindEvents(),this.updateTheme()}updateTheme(){const e=this.client.config.primaryColor||"#6366f1";this.host.style.setProperty("--oa-primary",e),this.client.config.accentColor&&this.host.style.setProperty("--oa-accent",this.client.config.accentColor),this.client.config.borderRadius!==void 0&&(this.host.style.setProperty("--oa-border-radius",`${this.client.config.borderRadius}px`),this.panelEl.style.borderRadius=`${this.client.config.borderRadius}px`),this.client.config.panelWidth&&(this.panelEl.style.width=`${this.client.config.panelWidth}px`),this.client.config.panelHeight&&(this.panelEl.style.height=`${this.client.config.panelHeight}px`);const r=this.shadow.querySelector(".oa-header-title");r&&this.client.config.botName&&(r.textContent=this.client.config.botName);const s=this.shadow.querySelector(".oa-avatar");s&&this.client.config.avatar&&(s.textContent=this.client.config.avatar);const t=this.shadow.querySelector(".oa-welcome-text");if(t&&this.client.config.welcomeMessage&&(t.innerHTML=v(this.client.config.welcomeMessage)),this.client.config.suggestedQuestions&&this.client.config.suggestedQuestions.length>0){const o=this.shadow.querySelector(".oa-suggested");if(o){let i='<span class="oa-suggested-title">Suggested Inquiries</span>';for(const a of this.client.config.suggestedQuestions)i+=`<button type="button" class="oa-chip" data-query="${g(a)}">${g(a)}</button>`;o.innerHTML=i}}}bindEvents(){var e,r,s;this.launcherBtn.addEventListener("click",()=>this.toggle()),(e=this.shadow.querySelector(".oa-btn-close"))==null||e.addEventListener("click",()=>this.close()),(r=this.shadow.querySelector(".oa-btn-restart"))==null||r.addEventListener("click",()=>this.restart()),this.messagesEl.addEventListener("click",t=>{const o=t.target;if(o.classList.contains("oa-chip")){const i=o.getAttribute("data-query");i&&this.submitMessage(i)}else if(o.classList.contains("oa-copy-btn")||o.closest(".oa-copy-btn")){const i=o.classList.contains("oa-copy-btn")?o:o.closest(".oa-copy-btn"),a=i.getAttribute("data-text");a&&(navigator.clipboard.writeText(a),i.textContent="✓ Copied!",setTimeout(()=>{i.innerHTML="📋 Copy"},2e3))}else if(o.classList.contains("oa-feedback-btn")||o.closest(".oa-feedback-btn")){const i=o.classList.contains("oa-feedback-btn")?o:o.closest(".oa-feedback-btn"),a=i.getAttribute("data-rating");if(a){const l=i.closest(".oa-message-actions");l==null||l.querySelectorAll(".oa-feedback-btn").forEach(m=>{m.classList.remove("oa-selected"),m.disabled=!0}),i.classList.add("oa-selected"),this.client.sendFeedback(a)}}}),(s=this.errorEl.querySelector(".oa-retry-btn"))==null||s.addEventListener("click",()=>{this.lastVisitorMessage&&this.submitMessage(this.lastVisitorMessage)}),this.inputEl.addEventListener("input",()=>{this.inputEl.style.height="auto",this.inputEl.style.height=Math.min(this.inputEl.scrollHeight,120)+"px",this.sendBtn.disabled=this.inputEl.value.trim().length===0||this.isGenerating}),this.inputEl.addEventListener("keydown",t=>{if(t.key==="Enter"&&!t.shiftKey){t.preventDefault();const o=this.inputEl.value.trim();o&&!this.isGenerating&&this.submitMessage(o)}else t.key==="Escape"&&this.close()}),this.sendBtn.addEventListener("click",()=>{const t=this.inputEl.value.trim();t&&!this.isGenerating&&this.submitMessage(t)}),window.addEventListener("keydown",t=>{t.key==="Escape"&&this.isOpen&&this.close()})}open(){this.isOpen=!0,this.panelEl.classList.remove("oa-hidden"),this.launcherBtn.classList.add("oa-open"),this.launcherBtn.setAttribute("aria-expanded","true"),setTimeout(()=>this.inputEl.focus(),150)}close(){this.isOpen=!1,this.panelEl.classList.add("oa-hidden"),this.launcherBtn.classList.remove("oa-open"),this.launcherBtn.setAttribute("aria-expanded","false")}toggle(){this.isOpen?this.close():this.open()}restart(){this.messages=[],this.messagesEl.querySelectorAll(".oa-message-row").forEach(e=>e.remove()),this.errorEl.style.display="none",this.typingEl.style.display="none",this.isGenerating=!1,this.sendBtn.disabled=this.inputEl.value.trim().length===0}appendMessageElement(e,r,s){const t=document.createElement("div");t.className=`oa-message-row oa-row-${e}`;let o="";return e==="assistant"&&(o=`
        <div class="oa-message-actions">
          <button type="button" class="oa-feedback-btn" data-rating="positive" aria-label="Thumbs up" title="Helpful response">
            👍
          </button>
          <button type="button" class="oa-feedback-btn" data-rating="negative" aria-label="Thumbs down" title="Unhelpful response">
            👎
          </button>
          <button type="button" class="oa-copy-btn" data-text="${g(s)}" aria-label="Copy assistant answer">
            📋 Copy
          </button>
        </div>
      `),t.innerHTML=`
      <div class="oa-bubble">${r}</div>
      ${o}
    `,this.messagesEl.appendChild(t),this.scrollToBottom(),t}scrollToBottom(){this.messagesEl.scrollTop=this.messagesEl.scrollHeight}async submitMessage(e){if(!e||this.isGenerating)return;this.lastVisitorMessage=e,this.inputEl.value="",this.inputEl.style.height="auto",this.sendBtn.disabled=!0,this.errorEl.style.display="none";const r={id:"msg_"+Date.now(),role:"visitor",content:e,timestamp:new Date().toISOString()};this.messages.push(r),this.appendMessageElement("visitor",g(e),e),this.isGenerating=!0,this.typingEl.style.display="inline-flex",this.scrollToBottom();let s=null,t=null,o="";await this.client.sendMessage(e,this.messages,i=>{if(s||(this.typingEl.style.display="none",s=this.appendMessageElement("assistant","",""),t=s.querySelector(".oa-bubble")),o=i,t){t.innerHTML=v(o);const a=s==null?void 0:s.querySelector(".oa-copy-btn");a&&a.setAttribute("data-text",o),this.scrollToBottom()}},()=>{this.isGenerating=!1,this.typingEl.style.display="none",this.sendBtn.disabled=this.inputEl.value.trim().length===0,o&&this.messages.push({id:"msg_a_"+Date.now(),role:"assistant",content:o,timestamp:new Date().toISOString()})},i=>{this.isGenerating=!1,this.typingEl.style.display="none",this.sendBtn.disabled=this.inputEl.value.trim().length===0;const a=i.message||"Unable to connect to assistant",l=this.errorEl.querySelector(".oa-error-text");l&&(l.textContent=a),this.errorEl.style.display="flex",this.scrollToBottom()})}}if(window.__OPENAGENT_WIDGET_LOADED__)console.warn("[OpenAgent] Chat widget script is already loaded.");else{window.__OPENAGENT_WIDGET_LOADED__=!0;let n=null;const e=async t=>{if(n)return console.warn("[OpenAgent] Chat widget has already been initialized."),n;const o=new k(t);return await o.mount(),n=o,window.OpenAgentChat&&(window.OpenAgentChat.instance=o),o},r=(t,o="immediate")=>{if(o==="idle"){const i=window.requestIdleCallback?a=>window.requestIdleCallback(a,{timeout:3e3}):a=>setTimeout(a,1e3);document.readyState==="complete"?i(()=>e(t).catch(console.error)):window.addEventListener("load",()=>{i(()=>e(t).catch(console.error))},{once:!0})}else if(o==="interaction"){const i=["mousemove","touchstart","scroll","keydown"],a=()=>{i.forEach(l=>window.removeEventListener(l,a)),e(t).catch(console.error)};i.forEach(l=>window.addEventListener(l,a,{once:!0,passive:!0}))}else e(t).catch(i=>{console.error("[OpenAgent] Initialization failed:",i)})};window.OpenAgentChat={init:e,open:()=>n==null?void 0:n.open(),close:()=>n==null?void 0:n.close(),toggle:()=>n==null?void 0:n.toggle(),restart:()=>n==null?void 0:n.restart(),sendMessage:t=>n==null?void 0:n.submitMessage(t)};const s=document.currentScript;if(s){const t=s.getAttribute("data-site-id"),o=s.getAttribute("data-api-url")||void 0,i=s.getAttribute("data-position")||void 0,a=s.getAttribute("data-primary-color")||void 0,l=s.getAttribute("data-bot-name")||void 0,m=s.getAttribute("data-welcome-message")||void 0,y=s.getAttribute("data-strategy"),h=s.getAttribute("data-defer")==="true",d=y==="idle"||h?"idle":y==="interaction"?"interaction":"immediate";t&&r({siteId:t,apiUrl:o,position:i,primaryColor:a,botName:l,welcomeMessage:m,strategy:d},d)}}return u.OpenAgentWidget=k,Object.defineProperty(u,Symbol.toStringTag,{value:"Module"}),u})({});
