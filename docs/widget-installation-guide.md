# OpenAgent Chat: Universal Website Widget Installation & Integration Guide

The OpenAgent Chat widget is an ultra-lightweight (**< 8 KB gzipped**), standalone JavaScript component that can be embedded into any website or web application regardless of framework. It renders entirely within an isolated **Shadow DOM**, guaranteeing that host website styles cannot break the chat interface and the chat styles cannot alter host elements.

---

## 1. Quick Installation (Standard Script Tag)

Add the following snippet directly before the closing `</body>` tag of your website:

```html
<script
  src="https://api.yourdomain.com/widget.js"
  data-site-id="pk_live_YOUR_SITE_KEY"
  defer
></script>
```

> **Note:** Replace `https://api.yourdomain.com` with your actual deployed OpenAgent API domain (or `http://localhost:3001` in local development). Replace `pk_live_YOUR_SITE_KEY` with the public key generated in your OpenAgent Admin Dashboard.

### Supported Configuration Attributes

| Attribute | Required | Default | Description |
|---|:---:|:---:|---|
| `data-site-id` | **Yes** | — | Unique public widget identifier (`pk_live_...`). |
| `data-api-url` | No | Auto-detected | Backend API base URL. |
| `data-position` | No | `bottom-right` | Corner placement: `'bottom-right'` or `'bottom-left'`. |
| `data-primary-color`| No | From Dashboard | Hex accent color (e.g. `#6366f1`). |
| `data-bot-name` | No | From Dashboard | Name displayed in chat header and launcher. |
| `data-welcome-message`| No | From Dashboard | Initial greeting message displayed to visitors. |

---

## 2. Programmatic JavaScript API

For Single Page Applications (Next.js, React, Vue, Angular), you can load `widget.js` without attributes and initialize it programmatically:

```html
<script src="https://api.yourdomain.com/widget.js" defer></script>
```

```javascript
window.addEventListener('DOMContentLoaded', () => {
  if (window.OpenAgentChat) {
    window.OpenAgentChat.init({
      siteId: 'pk_live_YOUR_SITE_KEY',
      position: 'bottom-right',
      primaryColor: '#0ea5e9',
      botName: 'Store Concierge',
      welcomeMessage: 'How can I assist you with your purchase today?',
    });
  }
});
```

### Global API Methods

Once loaded, `window.OpenAgentChat` exposes the following helper functions:

```javascript
// Open the chat panel
window.OpenAgentChat.open();

// Close or minimize the chat panel
window.OpenAgentChat.close();

// Toggle panel visibility
window.OpenAgentChat.toggle();

// Reset the conversation and return to the welcome card
window.OpenAgentChat.restart();

// Programmatically send an inquiry (e.g. from an FAQ link)
window.OpenAgentChat.sendMessage('Tell me about your shipping policy');
```

---

## 3. Framework-Specific Guides

### Next.js (App Router & Pages Router)
Using `next/script` in your root layout:

```tsx
import Script from 'next/script';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Script
          src="https://api.yourdomain.com/widget.js"
          data-site-id={process.env.NEXT_PUBLIC_OPENAGENT_SITE_ID}
          strategy="lazyOnload"
        />
      </body>
    </html>
  );
}
```

### React (SPA)
In your top-level `App.tsx` or `index.html`:

```tsx
import { useEffect } from 'react';

export function ChatWidget() {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://api.yourdomain.com/widget.js';
    script.setAttribute('data-site-id', 'pk_live_YOUR_SITE_KEY');
    script.defer = true;
    document.body.appendChild(script);

    return () => {
      // Script is retained across client-side page transitions
    };
  }, []);

  return null;
}
```

### Vue 3 / Nuxt 3
In `nuxt.config.ts`:

```typescript
export default defineNuxtConfig({
  app: {
    head: {
      script: [
        {
          src: 'https://api.yourdomain.com/widget.js',
          'data-site-id': 'pk_live_YOUR_SITE_KEY',
          defer: true,
        },
      ],
    },
  },
});
```

### WordPress / Shopify / Webflow
1. In your store or CMS admin panel, open **Theme Settings** -> **Custom Code** or `footer.php`.
2. Paste the snippet directly before `</body>`:
   ```html
   <script
     src="https://api.yourdomain.com/widget.js"
     data-site-id="pk_live_YOUR_SITE_KEY"
     defer
   ></script>
   ```

---

## 4. Architectural Guarantees & Security

1. **Shadow DOM Isolation**: The widget attaches to `<openagent-chat>` and mounts inside `attachShadow({ mode: 'open' })`. Host website CSS overrides cannot distort the widget, and widget styles will never bleed into host forms or headers.
2. **Duplicate Injection Immunity**: Multiple `<script>` tags on the same page are automatically deduplicated using a window-level singleton guard.
3. **Safe Markdown & XSS Defense**: All visitor input and assistant replies are sanitized with HTML entity encoding before rendering. Script injection, unsafe image tags, and `javascript:` URIs are neutralized.
4. **Allowed Origins Security**: Handshake requests dynamically verify the `Origin` header against `sites.allowed_origins`. Unauthorized domains are rejected with `403 Forbidden`.
5. **Reduced Motion**: Automatically honors `@media (prefers-reduced-motion: reduce)` by disabling animations for users with vestibular sensitivity.
6. **Mobile Responsiveness**: Automatically transitions to a full-screen sheet on screens under 600px width using dynamic viewport units (`100dvh`).

---

## 5. Working Demos

Two working demonstrations are included in the repository:
- [apps/widget/demo/plain-html.html](file:///c:/robotic-agent/apps/widget/demo/plain-html.html) — Verifies style immunity against aggressive global Comic Sans CSS rules.
- [apps/widget/demo/component-demo.html](file:///c:/robotic-agent/apps/widget/demo/component-demo.html) — Verifies component integration, programmatic triggers, and e-commerce product inquiries.
