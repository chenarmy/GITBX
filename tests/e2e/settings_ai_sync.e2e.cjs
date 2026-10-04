const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = path.resolve(
  'C:\\Users\\Administrator\\.gemini\\antigravity\\brain\\d4dcf94c-c44c-4207-8e41-01a587b69341\\screenshots\\settings_ai_sync'
);
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:5173';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log('====================================================');
  console.log(' Starting Settings <-> AI Header <-> Popover Sync Test');
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
  });

  const page = await context.newPage();

  try {
    console.log('[1/5] Loading application...');
    await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await sleep(800);

    console.log('[2/5] Opening AI Sidebar...');
    const aiButton = page.locator('button:has-text("AI 助手"), button:has-text("AI Copilot")').first();
    await aiButton.waitFor({ state: 'visible', timeout: 8000 });
    await aiButton.click();
    await sleep(800);

    const sidebar = page.locator('[data-testid="ai-chat-sidebar"]').first();
    await sidebar.waitFor({ state: 'visible', timeout: 5000 });

    // Initial pill text in sidebar header
    const modelPill = page.locator('[data-testid="ai-model-selector-pill"]').first();
    await modelPill.waitFor({ state: 'visible', timeout: 5000 });
    const initialPillText = await modelPill.innerText();
    console.log('  -> Initial Model Pill in Sidebar:', initialPillText);

    console.log('[3/5] Opening Settings Modal...');
    const settingsBtn = page.locator('[data-testid="navbar-settings-btn"]').first();
    await settingsBtn.click();
    await sleep(600);

    const settingsModal = page.locator('div[role="dialog"][aria-label*="设置"], div:has-text("GITBX 设置")').last();
    await settingsModal.waitFor({ state: 'visible', timeout: 5000 });

    // Find AI Provider select in Settings Modal and select DeepSeek
    console.log('[4/5] Selecting DeepSeek in Settings Modal and saving...');
    const providerSelect = page.locator('[data-testid="settings-provider-select"]').first();
    await providerSelect.waitFor({ state: 'visible', timeout: 5000 });
    await providerSelect.selectOption('deepseek');
    await sleep(400);

    // Save Settings
    const saveBtn = page.locator('[data-testid="settings-save-btn"]').first();
    await saveBtn.click();
    await sleep(800);

    // Verify Pill in AI Sidebar updated to DeepSeek!
    const updatedPillText = await modelPill.innerText();
    console.log('  -> Updated Model Pill in Sidebar:', updatedPillText);
    if (!updatedPillText.includes('DeepSeek')) {
      throw new Error(`Model Pill did not update to DeepSeek! Current text: ${updatedPillText}`);
    }
    console.log('  -> PASS: AI Sidebar header pill successfully updated to DeepSeek!');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_pill_updated_to_deepseek.png') });

    console.log('[5/5] Opening Model Selector Popover to verify popover state...');
    await modelPill.click();
    await sleep(600);

    const popover = page.locator('[data-testid="model-selector-popover"]').first();
    await popover.waitFor({ state: 'visible', timeout: 5000 });

    // Verify DeepSeek is selected and has checkmark on the left
    const deepseekLeftBtn = popover.locator('button:has-text("DeepSeek")').first();
    await deepseekLeftBtn.waitFor({ state: 'visible', timeout: 3000 });
    const hasCheckmark = await deepseekLeftBtn.locator('[data-testid="provider-active-check"]').count();
    console.log('  -> DeepSeek has active checkmark in popover:', hasCheckmark > 0);
    if (hasCheckmark === 0) {
      throw new Error('DeepSeek does not have active checkmark in popover!');
    }

    // Verify deepseek-chat on the right is selected with Active badge
    const activeBadge = popover.locator('[data-testid="model-active-badge"]').first();
    await activeBadge.waitFor({ state: 'visible', timeout: 3000 });
    const isModelActive = await activeBadge.isVisible();
    console.log('  -> deepseek-chat is active on right panel:', isModelActive);
    if (!isModelActive) {
      throw new Error('deepseek-chat does not have active badge in popover!');
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_popover_synced_with_deepseek.png') });
    console.log('  -> Captured 02_popover_synced_with_deepseek.png');

    console.log('\n====================================================');
    console.log(' Settings <-> AI Header <-> Popover Sync SUCCEEDED!');
    console.log('====================================================\n');
  } catch (err) {
    console.error('Test failed:', err);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'ERROR_sync.png') });
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
