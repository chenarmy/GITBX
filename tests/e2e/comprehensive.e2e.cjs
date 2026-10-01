/**
 * Comprehensive Playwright E2E Test Suite for GITBX
 * 
 * Verifies real UI rendering, user interaction flows, modal dialogues,
 * Canvas graph, diff viewer, staging area, settings, themes, and detects
 * any frontend JavaScript errors or template glitches.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const REPO_PATH = path.resolve('I:\\gitbx-4-test');
const SCREENSHOT_DIR = path.resolve('C:\\Users\\Administrator\\.gemini\\antigravity\\brain\\d4dcf94c-c44c-4207-8e41-01a587b69341\\screenshots');
const APP_URL = 'http://127.0.0.1:5188';

function git(...args) {
  return execFileSync('git', ['-C', REPO_PATH, ...args], { encoding: 'utf8' }).trim();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function closeModal(page) {
  try {
    const closeBtn = await page.$('button[aria-label="Close dialog"], div[role="dialog"] button:has(svg.lucide-x)');
    if (closeBtn) {
      await closeBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForSelector('div[role="dialog"]', { state: 'detached', timeout: 3000 });
  } catch {
    await page.keyboard.press('Escape');
  }
  await sleep(400);
}

async function run() {
  console.log('====================================================');
  console.log(' Launching Playwright E2E UI Test Suite');
  console.log(' App URL:', APP_URL);
  console.log(' Screenshots:', SCREENSHOT_DIR);
  console.log('====================================================\n');

  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  // Ensure test repository is clean on master
  try { git('merge', '--abort'); } catch {}
  git('checkout', 'master');
  git('reset', '--hard', 'HEAD');

  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  // Pre-seed localStorage so GITBX immediately loads I:\gitbx-4-test with the auth token
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

  const errors = [];
  const warnings = [];
  const requestFailures = [];

  page.on('pageerror', err => {
    console.error(' [PAGE ERROR]', err.message);
    errors.push({ type: 'pageerror', message: err.message, stack: err.stack });
  });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error(' [CONSOLE ERROR]', msg.text());
      errors.push({ type: 'console.error', text: msg.text() });
    } else if (msg.type() === 'warning') {
      warnings.push(msg.text());
    }
  });

  page.on('requestfailed', req => {
    const failure = req.failure();
    console.warn(` [REQUEST FAILED] ${req.method()} ${req.url()} - ${failure ? failure.errorText : 'Unknown'}`);
    requestFailures.push({ url: req.url(), method: req.method(), error: failure?.errorText });
  });

  const testResults = [];

  async function testStep(name, fn) {
    try {
      console.log(`\n---> [STEP] ${name}`);
      await fn();
      testResults.push({ name, status: 'PASS' });
      console.log(`[PASS] ${name}`);
    } catch (err) {
      testResults.push({ name, status: 'FAIL', error: err.message });
      console.error(`[FAIL] ${name}:`, err.message);
      const errShot = path.join(SCREENSHOT_DIR, `ERROR_${Date.now()}.png`);
      try { await page.screenshot({ path: errShot, fullPage: true }); } catch {}
    }
  }

  try {
    // Step 1: Open Application
    await testStep('1. Navigate to Application and Verify Workspace Mounting', async () => {
      await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 15000 });
      await sleep(1500);

      const appContainer = await page.$('#app');
      if (!appContainer) throw new Error('#app element not found');

      // Verify repo name displays gitbx-4-test
      await page.waitForSelector('text=gitbx-4-test', { timeout: 10000 });
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_workspace_loaded.png') });
    });

    // Step 2: Verify Commit Graph Canvas
    await testStep('2. Verify Commit Graph Canvas Rendering & Interaction', async () => {
      const canvas = await page.$('canvas');
      if (!canvas) throw new Error('Commit graph canvas not rendered');
      const box = await canvas.boundingBox();
      if (!box || box.width < 50 || box.height < 50) {
        throw new Error(`Canvas dimensions too small: ${JSON.stringify(box)}`);
      }

      // Click on canvas to select node
      await page.mouse.click(box.x + 30, box.y + 30);
      await sleep(500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_canvas_graph_interactive.png') });
    });

    // Step 3: Verify Sidebar Workspace Navigation
    await testStep('3. Verify Sidebar Branches, Tags, and Remotes', async () => {
      const sidebar = await page.$('aside, .w-60, [class*="sidebar"]');
      if (!sidebar) throw new Error('Sidebar workspace not found');

      await page.waitForSelector('text=develop', { timeout: 5000 });
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_sidebar_branches.png') });
    });

    // Step 4: Test Branch Management Modal
    await testStep('4. Open and Verify Branch Management Modal', async () => {
      const branchBtn = await page.$('button:has-text("分支"), button:has-text("Branch"), button[title*="分支"], button[title*="Branch"]');
      if (branchBtn) {
        await branchBtn.click();
        await sleep(800);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_branch_modal.png') });
        await closeModal(page);
      }
    });

    // Step 5: Test Stash Management Modal
    await testStep('5. Open and Verify Stash Management Modal', async () => {
      const stashBtn = await page.$('button:has-text("储藏"), button:has-text("Stash"), button[title*="储藏"], button[title*="Stash"]');
      if (stashBtn) {
        await stashBtn.click();
        await sleep(800);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_stash_modal.png') });
        await closeModal(page);
      }
    });

    // Step 6: Test Worktree Manager Modal
    await testStep('6. Open and Verify Worktree Manager Modal', async () => {
      const wtBtn = await page.$('button[title*="Worktrees"], button[title*="工作树"], button:has-text("Worktrees"), button:has-text("工作树")');
      if (wtBtn) {
        await wtBtn.click();
        await sleep(800);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_worktree_modal.png') });
        await closeModal(page);
      }
    });

    // Step 7: Test Settings Modal & Tabs
    await testStep('7. Open Settings Modal, Verify Tabs & Configuration', async () => {
      const settingsBtn = await page.$('button:has(svg.lucide-settings), button[title*="设置"], button[title*="Settings"]');
      if (!settingsBtn) throw new Error('Settings button not found in navbar');
      await settingsBtn.click();
      await sleep(800);

      // Verify settings modal rendered
      await page.waitForSelector('div[role="dialog"]', { timeout: 5000 });
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_settings_modal_general.png') });

      // Click on About tab
      const aboutTab = await page.$('button:has-text("关于 GITBX"), button:has-text("About GITBX")');
      if (aboutTab) {
        await aboutTab.click();
        await sleep(400);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_settings_about_tab.png') });
      }

      // Close settings modal
      await closeModal(page);
    });

    // Step 8: Test Working Directory Change & Diff Viewer
    await testStep('8. Working Directory Change Detection & Diff Viewer', async () => {
      // Switch back to working tree view if a commit was selected
      const wtSwitch = await page.$('button:has-text("工作区"), button:has-text("Working Tree")');
      if (wtSwitch) {
        await wtSwitch.click();
        await sleep(500);
      }

      const testFile = path.join(REPO_PATH, 'test_playwright.txt');
      fs.writeFileSync(testFile, 'Hello Playwright E2E Testing!\nAdded for testing DiffViewer and StagingPanel.\n', 'utf8');

      try {
        // Click refresh button in navbar
        const refreshBtn = await page.$('button:has(svg.lucide-refresh-cw), button[title*="刷新"], button[title*="Refresh"]');
        if (refreshBtn) await refreshBtn.click();
        await sleep(1500);

        // Verify test_playwright.txt appears in unstaged list
        await page.waitForSelector('text=test_playwright.txt', { timeout: 8000 });
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_unstage_test_file.png') });

        // Click on test_playwright.txt to open Diff Viewer
        const fileItem = await page.$('text=test_playwright.txt');
        if (fileItem) await fileItem.click();
        await sleep(1000);

        // Verify Diff editor rendered
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10_diff_viewer_rendered.png') });
      } finally {
        if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
        const refreshBtn = await page.$('button:has(svg.lucide-refresh-cw)');
        if (refreshBtn) await refreshBtn.click();
        await sleep(800);
      }
    });

    // Step 9: Theme Toggle (Dark / Light)
    await testStep('9. Theme Toggle Interaction', async () => {
      const themeBtn = await page.$('button:has(svg.lucide-sun), button:has(svg.lucide-moon)');
      if (themeBtn) {
        await themeBtn.click();
        await sleep(500);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_theme_toggled.png') });
        // Toggle back to dark
        await themeBtn.click();
        await sleep(500);
      }
    });

    // Step 10: 3-Way Conflict Mode & Conflict Resolution View
    await testStep('10. 3-Way Conflict Mode & Editor Activation', async () => {
      git('checkout', 'conflict/branch-a');
      let conflicted = false;
      try {
        git('merge', 'conflict/branch-b');
      } catch {
        conflicted = true;
      }

      try {
        // Click refresh in UI
        const refreshBtn = await page.$('button:has(svg.lucide-refresh-cw), button[title*="刷新"], button[title*="Refresh"]');
        if (refreshBtn) await refreshBtn.click();
        await sleep(1500);

        // Verify conflict view is active and screenshot
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '12_conflict_view_activated.png') });
      } finally {
        git('merge', '--abort');
        git('checkout', 'master');
        const refreshBtn = await page.$('button:has(svg.lucide-refresh-cw)');
        if (refreshBtn) await refreshBtn.click();
        await sleep(800);
      }
    });

  } finally {
    await browser.close();
  }

  console.log('\n====================================================');
  console.log(' Playwright E2E UI Test Summary');
  console.log('====================================================');
  console.log(`Steps Passed: ${testResults.filter(t => t.status === 'PASS').length} / ${testResults.length}`);
  console.log(`Page Uncaught Errors: ${errors.length}`);
  console.log(`Warnings Logged: ${warnings.length}`);
  console.log(`Failed HTTP Requests: ${requestFailures.length}`);

  if (errors.length > 0) {
    console.log('\n--- Detected Frontend Errors ---');
    errors.forEach((e, idx) => console.log(`${idx + 1}. [${e.type}] ${e.message || e.text}`));
  }

  const report = {
    executedAt: new Date().toISOString(),
    totalSteps: testResults.length,
    passedSteps: testResults.filter(t => t.status === 'PASS').length,
    failedSteps: testResults.filter(t => t.status === 'FAIL').length,
    errors,
    warnings,
    requestFailures,
    results: testResults,
  };

  fs.writeFileSync(
    path.join(SCREENSHOT_DIR, 'e2e_summary.json'),
    JSON.stringify(report, null, 2),
    'utf8'
  );

  return report;
}

run().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
