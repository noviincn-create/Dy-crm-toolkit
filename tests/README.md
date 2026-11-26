# Development tests (not shipped in the extension)

Simulated Dynamics Web API + jsdom (and Playwright for the invoice) driving the **built bundles**.

    npm install
    npm run build            # produces dist/
    npm test                 # opp-number, bpf-stage, session (jsdom)
    npx playwright install chromium && npm run test:invoice   # invoice print (also writes invoice.pdf / invoice.png)

`npm run typecheck` checks `src/` strictly and the tests with a relaxed config (`tests/tsconfig.json`, no implicit-any errors).
