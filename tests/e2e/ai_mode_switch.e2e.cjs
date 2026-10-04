const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = path.resolve(
  'C:\\Users\\Administrator\\.gemini\\antigravity\\brain\\d4dcf94c-c44c-4207-8e41-01a587b69341\\screenshots\\ai_mode_switch'
);
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:5173';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log('====================================================');
  console.log(' Starting Ask Mode vs Agent Mode Blue Selection Test');
  console.log('====================================================\n');

  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  await context.addInitScript(() => {
    localStorage.setItem('gitbx_web_token', 'playwright-test-token');
    localStorage.setItem('gitbx_active_repo', 'I:\\gitbx-4-test');
    localStorage.setItem('gitbx_managed_repos', JSON.stringify([
      { path: 'I:\\gitbx-4-test', name: 'gitbx-4-test', lastOpened: Date.now() }
    ]));
    localStorage.setItem('gitbx_locale', 'zh-CN');
    localStorage.setItem('gitbx_theme', 'dark');
    localStorage.removeItem('gitbx_ai_mode');
  });

  const page = await context.newPage();

  try {
    console.log('[1/4] Loading application...');
    await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await sleep(800);

    console.log('[2/4] Opening AI Sidebar...');
    const aiButton = page.locator('button:has-text("AI 助手"), button:has-text("AI Copilot")').first();
    await aiButton.waitFor({ state: 'visible', timeout: 8000 });
    await aiButton.click();
    await sleep(800);

    const askBtn = page.locator('[data-testid="ai-mode-ask-btn"]').first();
    const agentBtn = page.locator('[data-testid="ai-mode-agent-btn"]').first();
    await askBtn.waitFor({ state: 'visible', timeout: 5000 });
    await agentBtn.waitFor({ state: 'visible', timeout: 5000 });

    // Initial state: Agent is active, has text-primary
    const initialAgentClass = await agentBtn.getAttribute('class');
    const initialAskClass = await askBtn.getAttribute('class');
    console.log('  -> Default Agent Mode class includes text-primary:', initialAgentClass.includes('text-primary'));
    console.log('  -> Default Ask Mode class is inactive:', initialAskClass.includes('text-muted-foreground'));

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_default_agent_active.png') });
    console.log('  -> Captured 01_default_agent_active.png');

    console.log('[3/4] Clicking Ask Mode button...');
    await askBtn.click();
    await sleep(400);

    const activeAskClass = await askBtn.getAttribute('class');
    const inactiveAgentClass = await agentBtn.getAttribute('class');
    console.log('  -> Clicked Ask Mode class includes text-primary:', activeAskClass.includes('text-primary'));
    console.log('  -> Agent Mode class is now inactive:', inactiveAgentClass.includes('text-muted-foreground'));

    if (!activeAskClass.includes('text-primary')) {
      throw new Error(`Ask Mode button did not get text-primary class! Class: ${activeAskClass}`);
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_ask_mode_clicked_blue.png') });
    console.log('  -> Captured 02_ask_mode_clicked_blue.png');

    console.log('[4/4] Clicking Agent Mode button back...');
    await agentBtn.click();
    await sleep(400);

    const reAgentClass = await agentBtn.getAttribute('class');
    const reAskClass = await askBtn.getAttribute('class');
    console.log('  -> Re-clicked Agent Mode class includes text-primary:', reAgentClass.includes('text-primary'));
    console.log('  -> Ask Mode class is now inactive:', reAskClass.includes('text-muted-foreground'));

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_agent_mode_clicked_blue.png') });
    console.log('  -> Captured 03_agent_mode_clicked_blue.png');

    console.log('\n====================================================');
    console.log(' Ask Mode <-> Agent Mode Blue State Toggle SUCCEEDED!');
    console.log('====================================================\n');
  } catch (err) {
    console.error('Test failed:', err);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'ERROR_mode_switch.png') });
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
