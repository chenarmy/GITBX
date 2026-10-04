const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = path.resolve(
  'C:\\Users\\Administrator\\.gemini\\antigravity\\brain\\d4dcf94c-c44c-4207-8e41-01a587b69341\\screenshots\\ai_agent'
);
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:5173';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log('====================================================');
  console.log(' Starting Agent Mode Tool Execution E2E Test');
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

  let apiChatCallCount = 0;
  let receivedMessages = [];

  // Mock /api/ai/chat to simulate LLM tool calling flow
  await page.route('**/api/ai/chat', async (route) => {
    apiChatCallCount++;
    const postData = JSON.parse(route.request().postData() || '{}');
    receivedMessages = postData.messages || [];
    console.log(`[API /api/ai/chat call #${apiChatCallCount}] Received ${receivedMessages.length} messages`);

    if (apiChatCallCount === 1) {
      // Turn 1: LLM returns plain conversational text without tool_calls (user's exact scenario)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          content: '我来帮你分析代码改动。先查看当前仓库状态和改动情况。',
          tool_calls: null,
        }),
      });
    } else {
      // Turn 2: LLM receives tool output and produces comprehensive change analysis
      const toolMsg = receivedMessages.find((m) => m.role === 'tool');
      console.log('  -> Turn 2 received tool output successfully:', !!toolMsg);

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          content: '### 代码改动深度分析报告\n\n已完成仓库状态与变更检查：\n- **分支**: `main`\n- **工作区改动**: 发现待提交修改文件。\n- **分析建议**: 代码结构良好，建议进行语义化 Commit 提交。',
          tool_calls: null,
        }),
      });
    }
  });

  try {
    console.log('[1/4] Navigating to GITBX app...');
    await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await sleep(800);

    console.log('[2/4] Opening AI Sidebar...');
    const aiButton = page.locator('button:has-text("AI 助手"), button:has-text("AI Copilot")').first();
    await aiButton.waitFor({ state: 'visible', timeout: 8000 });
    await aiButton.click();
    await sleep(800);

    const sidebar = page.locator('[data-testid="ai-chat-sidebar"]').first();
    await sidebar.waitFor({ state: 'visible', timeout: 5000 });

    console.log('[3/4] Activating Agent Mode...');
    const agentTab = sidebar.locator('button:has-text("Agent"), button:has-text("智能代理")').first();
    await agentTab.click();
    await sleep(500);

    console.log('[4/4] Sending prompt: "@main 分析代码改动"...');
    const textarea = sidebar.locator('textarea').first();
    await textarea.fill('@main 分析代码改动');
    await sleep(300);

    const sendBtn = sidebar.locator('[data-testid="ai-chat-send-btn"]').first();
    await sendBtn.click();

    console.log('Waiting for tool call execution and final analysis...');
    // Wait for the tool card to appear and be executed
    await page.waitForSelector('text=git_status', { timeout: 10000 });
    console.log('  -> Found git_status tool card on page!');

    // Wait for the final markdown report to be rendered
    await page.waitForSelector('text=代码改动深度分析报告', { timeout: 12000 });
    console.log('  -> Found final markdown analysis report rendered!');

    await sleep(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_agent_execution_complete.png') });
    console.log('  -> Captured 01_agent_execution_complete.png');

    console.log('\n====================================================');
    console.log(' Agent Mode Tool Execution Verification SUCCEEDED!');
    console.log(` Total API Turns: ${apiChatCallCount}`);
    console.log('====================================================\n');
  } catch (err) {
    console.error('Test failed:', err);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'ERROR_agent_execution.png') });
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
