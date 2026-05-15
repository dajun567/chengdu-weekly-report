const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const DOWNLOAD_BASE = process.env.HOME + '/Desktop/周报数据';

// Each entry: [tab, leafText, downloadFolder, chartIndex (0-based among visible download icons)]
// The chart index corresponds to order of charts on the page
// For 新房: 需求量走势=0, 潜客走势=1, 贝壳新房成交量价=2, 贝壳渠道佣金点位=3, 贝壳新房渠道势能=4, ...
// For 二手: 需求量走势=0, 潜客走势=1, 新增客房比走势=2, 供销量价走势=3, 房源/客源成交周期=4, ...
const MODULES = [
  ['新房', '需求量走势', '贝壳新房', 0],
  ['新房', '贝壳新房成交量价', '贝壳新房', 2],
  ['新房', '贝壳渠道佣金点位', '贝壳新房', 3],
  ['新房', '贝壳新房渠道势能', '贝壳新房', 4],
  ['二手', '需求量走势', '贝壳二手', 0],
  ['二手', '供销量价走势', '贝壳二手', 3],
  ['二手', '房源/客源成交周期', '贝壳二手', 4],
  ['二手', '看房次数', '贝壳二手', 7],
];

(async () => {
  const resp = await fetch('http://localhost:9222/json/version');
  const { webSocketDebuggerUrl } = await resp.json();
  const browser = await chromium.connectOverCDP(webSocketDebuggerUrl);
  
  const page = browser.contexts()[0].pages()[0];
  const client = await page.context().newCDPSession(page);
  
  await page.goto('https://zongheng.ke.com/marketMonitor/1349', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  
  let currentTab = '';
  
  for (const [tab, leafName, folder, chartIdx] of MODULES) {
    const downloadDir = path.join(DOWNLOAD_BASE, folder);
    fs.mkdirSync(downloadDir, { recursive: true });
    
    if (currentTab !== tab) {
      console.log(`\n===== ${tab} =====`);
      await page.evaluate((t) => {
        document.querySelectorAll('[class*="tab"]').forEach(el => {
          if (el.textContent.trim() === t && el.offsetHeight > 0) { el.click(); }
        });
      }, tab);
      await page.waitForTimeout(3000);
      currentTab = tab;
      
      await client.send('Browser.setDownloadBehavior', {
        behavior: 'allow', downloadPath: downloadDir, eventsEnabled: true
      });
    }
    
    process.stdout.write(`${leafName} [idx=${chartIdx}]: `);
    
    // Click leaf
    const leafClicked = await page.evaluate((name) => {
      const leaves = document.querySelectorAll('[class*="leaf"]');
      for (const leaf of leaves) {
        if (leaf.textContent.includes(name) && leaf.offsetHeight > 0) {
          leaf.click();
          return true;
        }
      }
      return false;
    }, leafName);
    
    if (!leafClicked) { console.log('leaf not found'); continue; }
    await page.waitForTimeout(1000);
    
    // Find ALL download icon buttons in viewport, sorted by y position
    const dlIcon = await page.evaluate((idx) => {
      const btns = document.querySelectorAll('button.ant-btn');
      const candidates = [];
      for (const btn of btns) {
        const rect = btn.getBoundingClientRect();
        if (rect.width === 32 && rect.height === 32 && 
            btn.querySelector('.ant-btn-icon') &&
            btn.textContent.trim() === '' &&
            rect.y > 300 && rect.y < window.innerHeight - 50) {
          candidates.push({ y: rect.y, x: rect.x + 16, cy: rect.y + 16 });
        }
      }
      candidates.sort((a, b) => a.y - b.y);
      if (idx < candidates.length) {
        return candidates[idx];
      }
      return candidates[0] || null;
    }, chartIdx);
    
    if (!dlIcon) { console.log('no download icon'); continue; }
    
    // Hover JS events
    await page.evaluate((pos) => {
      const btns = document.querySelectorAll('button.ant-btn');
      for (const btn of btns) {
        const rect = btn.getBoundingClientRect();
        if (rect.width === 32 && rect.height === 32 && 
            btn.querySelector('.ant-btn-icon') &&
            btn.textContent.trim() === '' &&
            Math.abs(rect.y - pos.y) < 5) {
          ['mouseenter', 'mouseover', 'pointerenter', 'pointerover'].forEach(evtName => {
            btn.dispatchEvent(new MouseEvent(evtName, { bubbles: true, cancelable: true }));
          });
          return;
        }
      }
    }, dlIcon);
    
    await page.waitForTimeout(600);
    
    // Click "下载数据"
    const clicked = await page.evaluate(() => {
      const all = document.querySelectorAll('*');
      for (const el of all) {
        if (el.textContent.trim() === '下载数据' && el.offsetHeight > 0 && el.offsetWidth > 0) {
          el.click();
          return true;
        }
      }
      return false;
    });
    
    console.log(clicked ? 'OK' : 'menu not found');
    if (clicked) await page.waitForTimeout(1500);
  }
  
  console.log('\n===== RESULTS =====');
  await page.waitForTimeout(3000);
  
  for (const folder of ['贝壳新房', '贝壳二手']) {
    const dir = path.join(DOWNLOAD_BASE, folder);
    console.log(`\n${folder}:`);
    fs.readdirSync(dir).filter(f => f.endsWith('.xlsx')).sort().forEach(f => {
      const s = fs.statSync(path.join(dir, f));
      console.log(`  ${f}  [${s.mtime.toISOString().split('T')[0]}]`);
    });
  }
  
  await browser.close();
  console.log('\nDone!');
})().catch(e => { console.error(e); process.exit(1); });
