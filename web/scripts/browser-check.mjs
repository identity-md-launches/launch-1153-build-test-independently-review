import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {dirname,extname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

// A bounded foreground preview: no daemon survives this verification command.
const here=dirname(fileURLToPath(import.meta.url));
const repo=resolve(here,'../..');
const sourceRequire=createRequire(resolve(repo,'web/package.json'));
const dependencyRequire=process.env.PRISM_REVIEW_DEPENDENCIES?createRequire(resolve(process.env.PRISM_REVIEW_DEPENDENCIES,'package.json')):sourceRequire;
const {chromium}=dependencyRequire('playwright');
const AxeBuilder=dependencyRequire('@axe-core/playwright').default;
const exportRoot=resolve(repo,'dist');
const artifactRoot=resolve(repo,process.env.PRISM_REVIEW_ARTIFACTS||'artifacts/browser');
await mkdir(artifactRoot,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(!pathname.startsWith('/preview/')){res.writeHead(404);res.end();return;}
  const path=resolve(exportRoot,pathname.slice('/preview/'.length)||'index.html');
  if(path!==exportRoot&&!path.startsWith(exportRoot+sep)){res.writeHead(403);res.end();return;}
  const real=(await stat(path)).isDirectory()?resolve(path,'index.html'):path;
  const bytes=await readFile(real);res.writeHead(200,{'Content-Type':mime[extname(real)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);
 }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}/preview/`;
const report={timestamp:new Date().toISOString(),previewPath:'/preview/',checks:[],views:[],consoleErrors:[],pageErrors:[],failedRequests:[],failedResponses:[],limitations:['Chromium emulation is not a physical device or screen-reader test.','Wallet signatures and Ethereum transactions are not broadcast by this review.','Native browser zoom and 10%-speed DevTools animation review are not performed.']};
let browser;
const record=(name,pass,detail)=>{report.checks.push({name,pass,detail});console.log(`${pass?'PASS':'FAIL'} ${name}${detail?': '+JSON.stringify(detail):''}`)};
const check=async(name,run)=>{try{const value=await run();record(name,true,value)}catch(error){record(name,false,String(error.message).slice(0,1000))}};
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-gpu'],...(process.env.PRISM_REVIEW_CHROMIUM?{executablePath:process.env.PRISM_REVIEW_CHROMIUM}:{})});
 report.browserVersion=browser.version();
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'no-preference'});
 const page=await context.newPage();
 page.setDefaultTimeout(10000);
 page.on('console',msg=>{if(msg.type()==='error')report.consoleErrors.push(msg.text().slice(0,500))});
 page.on('pageerror',err=>report.pageErrors.push(String(err).slice(0,500)));
 page.on('requestfailed',req=>report.failedRequests.push({url:req.url(),error:req.failure()?.errorText}));
 page.on('response',response=>{if(response.status()>=400)report.failedResponses.push({url:response.url(),status:response.status()})});
 await page.goto(url,{waitUntil:'domcontentloaded'});
 console.log('Production page navigation completed');
 try { await page.locator('h1').waitFor({timeout:15000}); } catch(error) { report.initialBody=await page.content(); await page.screenshot({path:resolve(artifactRoot,'startup-failure.jpg'),type:'jpeg',quality:70}); throw error; }
 await page.evaluate(()=>document.fonts.ready);
 await check('Local production assets load beneath /preview/',async()=>{
  const scripts=await page.locator('script[src]').evaluateAll(nodes=>nodes.map(n=>n.src));
  if(scripts.some(x=>!x.includes('/preview/')))throw Error('Script escaped subpath');
  await page.locator('.hero-art img').evaluate(img=>img.decode());
  return {scripts: scripts.map(x=>new URL(x).pathname),fonts:await page.evaluate(()=>[...document.fonts].map(f=>({family:f.family,status:f.status})))};
 });
 await check('Keyboard skip link has visible focus',async()=>{
  await page.keyboard.press('Tab');
  const v=await page.evaluate(()=>{const e=document.activeElement,s=getComputedStyle(e),r=e.getBoundingClientRect();return {text:e.textContent,outline:s.outline,top:r.top}});
  if(!v.text.includes('Skip to arcade')||v.top<0)throw Error(JSON.stringify(v));
  await page.screenshot({path:resolve(artifactRoot,'keyboard-focus.jpg'),type:'jpeg',quality:65});return v;
 });
 await page.locator('h1').click();
 for(const selector of ['#arcade','#factions','#economy','footer']){await page.locator(selector).scrollIntoViewIfNeeded();await page.waitForTimeout(80)}
 await page.evaluate(async()=>{window.scrollTo({top:0,behavior:'instant'});await Promise.all([...document.images].map(img=>img.decode().catch(()=>{})))});
 for(const width of [1440,850,390,320]){
  await page.setViewportSize({width,height:width<500?844:1000});
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:resolve(artifactRoot,`lobby-${width}.jpg`),type:'jpeg',quality:65,fullPage:true});
  if(width===1440)await page.screenshot({path:resolve(artifactRoot,'hero-desktop.jpg'),type:'jpeg',quality:65});
  if(width===390)await page.screenshot({path:resolve(artifactRoot,'hero-mobile.jpg'),type:'jpeg',quality:75});
  const view=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,h1:getComputedStyle(document.querySelector('h1')).fontSize,unlabelledButtons:[...document.querySelectorAll('button')].filter(e=>e.getBoundingClientRect().width&&!(e.getAttribute('aria-label')||e.innerText.trim())).map(e=>e.className),overflow:[...document.querySelectorAll('main *,header *,footer *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+2||r.left<-2)&&getComputedStyle(e).position!=='absolute'&&!e.closest('.hero-art,.prism-particles,.world-strip')}).slice(0,15).map(e=>({tag:e.tagName,class:e.className,width:e.getBoundingClientRect().width}))}));
  report.views.push(view);record(`Viewport ${width} reflows without page overflow`,view.scrollWidth<=width,view);
 }
 await page.setViewportSize({width:390,height:844});
 await check('Mobile navigation opens and faction navigation closes it',async()=>{
  await page.getByRole('button',{name:'Toggle navigation'}).click();
  await page.getByRole('link',{name:'Factions',exact:true}).click();
  if(await page.getByRole('button',{name:'Toggle navigation'}).getAttribute('aria-expanded')!=='false')throw Error('Menu remains expanded');
 });
 await check('Faction selection changes readable allegiance',async()=>{
  await page.locator('.faction-card').nth(1).click();
  if(await page.locator('.faction-card').nth(1).getAttribute('aria-pressed')!=='true')throw Error('Not selected');
  if(!await page.locator('.faction-detail').innerText().then(t=>t.includes('Small. Strange. Unstoppable.')))throw Error('Description unchanged');
  await page.screenshot({path:resolve(artifactRoot,'factions-mobile.jpg'),type:'jpeg',quality:65});
 });
 await check('Faction artwork animates only while onscreen and motion enabled',async()=>{
  await page.locator('.faction-grid').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelector('.faction-card img')?.getAttribute('src').includes('-loop'));
  const onscreen=await page.locator('.faction-card img').evaluateAll(n=>n.map(i=>i.getAttribute('src')));
  const loops=[];
  for(let i=0;i<4;i++){
   const card=page.locator('.faction-card').nth(i);await card.scrollIntoViewIfNeeded();
   await page.waitForFunction(i=>document.querySelectorAll('.faction-card img')[i]?.getAttribute('src').includes('-loop'),i);
   await card.locator('img').evaluate(img=>img.decode());
   const first=await card.screenshot();await page.waitForTimeout(320);const next=await card.screenshot();
   if(first.equals(next))throw Error(`Faction ${i} animated frames did not change`);
   loops.push({faction:i,framesDiffer:true});
  }
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.waitForFunction(()=>![...document.querySelectorAll('.faction-card img')].some(i=>i.getAttribute('src').includes('-loop')));
  await page.getByRole('button',{name:'Pause animations'}).click();
  await page.locator('.faction-grid').scrollIntoViewIfNeeded();
  const paused=await page.locator('.faction-card img').evaluateAll(n=>n.map(i=>i.getAttribute('src')));
  if(paused.some(x=>x.includes('-loop')))throw Error('Pause retained raster loops');
  return {onscreen,paused,loops};
 });
 await check('Missing wallet gives a recoverable message',async()=>{
  await page.locator('.wallet-button').click();
  await page.getByRole('dialog').getByRole('button',{name:'Connect wallet',exact:true}).click();
  const error=await page.getByRole('alert').innerText();
  if(!/wallet|Ethereum|install/i.test(error))throw Error(error);
  await page.screenshot({path:resolve(artifactRoot,'wallet-unavailable-mobile.jpg'),type:'jpeg',quality:65});
  await page.keyboard.press('Escape');return error;
 });
 await check('Practice selection, reveal, scoring and restart',async()=>{
  await page.getByRole('button',{name:'Play Vault Raid practice'}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('button',{name:'Vault 02',exact:true}).click();
  await dialog.getByRole('button',{name:'Lock choice & reveal'}).click();
  await dialog.getByRole('button',{name:'Play again'}).waitFor();
  const status=await dialog.getByRole('status').innerText();
  if(!status.includes('You chose 2')||!status.includes('awards no PRIO'))throw Error(status);
  await page.screenshot({path:resolve(artifactRoot,'practice-mobile.jpg'),type:'jpeg',quality:65});
  await dialog.getByRole('button',{name:'Play again'}).click();
  if(!await dialog.getByRole('button',{name:'Lock choice & reveal'}).isDisabled())throw Error('Choice was not reset');
  return status;
 });
 await check('Native dialog traps keyboard and returns focus',async()=>{
  const states=[];
  for(let i=0;i<12;i++){await page.keyboard.press('Tab');states.push(await page.evaluate(()=>({tag:document.activeElement.tagName,text:document.activeElement.textContent?.slice(0,80),inside:!!document.activeElement.closest('dialog')})))}
  await page.keyboard.press('Escape');
  if(states.some(v=>!v.inside&&v.tag!=='BODY'))throw Error('Tab reached a background control: '+JSON.stringify(states));
  const focus=await page.evaluate(()=>({label:document.activeElement.getAttribute('aria-label'),text:document.activeElement.textContent}));
  if(focus.label!=='Play Vault Raid practice')throw Error(JSON.stringify(focus));return focus;
 });
 await check('Paid round readiness and recovery surface opens',async()=>{
  await page.getByRole('button',{name:'View on-chain rounds'}).click();
  const text=await page.getByRole('dialog').innerText();
  await page.screenshot({path:resolve(artifactRoot,'rounds-mobile.jpg'),type:'jpeg',quality:65});
  await page.keyboard.press('Escape');return text.slice(0,2400);
 });
 await check('Owner setup separates Phase A bindings and Phase B configuration',async()=>{
  await page.getByRole('button',{name:'Setup & readiness'}).click();
  const text=await page.getByRole('dialog').innerText();
  if(!text.includes('Phase A')||!text.includes('Phase B'))throw Error('Missing setup phase');
  const buttons=await page.getByRole('dialog').getByRole('button').evaluateAll(nodes=>nodes.map(n=>({text:n.textContent,disabled:n.disabled})));
  await page.screenshot({path:resolve(artifactRoot,'owner-mobile.jpg'),type:'jpeg',quality:65});
  await page.keyboard.press('Escape');return {text:text.slice(0,3500),buttons};
 });
 await check('Swap and staking controls are labelled',async()=>{
  await page.getByRole('button',{name:'Get PRIO',exact:true}).click();
  const swap=await page.getByRole('dialog').innerText();
  const inputs=await page.getByRole('dialog').locator('input').evaluateAll(ns=>ns.map(n=>({type:n.type,label:n.labels?.[0]?.textContent,inputMode:n.inputMode,font:getComputedStyle(n).fontSize})));
  await page.getByRole('dialog').locator('input[name="swap-amount"]').fill('0.0001');
  await page.getByRole('dialog').getByRole('button',{name:'Simulate quote'}).click();
  await page.getByRole('dialog').getByText('Expected output',{exact:true}).waitFor({timeout:30000});
  const simulatedQuote=await page.getByRole('dialog').locator('.metric-list').first().innerText();
  if(!simulatedQuote.includes('Minimum received')||!simulatedQuote.includes('Platform protocol fee')||!simulatedQuote.includes('Extra treasury hook fee'))throw Error('Quote omitted fee or protection');
  await page.screenshot({path:resolve(artifactRoot,'swap-quote-mobile.jpg'),type:'jpeg',quality:65});
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Open staking vault'}).click();
  const staking=await page.getByRole('dialog').innerText();
  await page.keyboard.press('Escape');return {swap:swap.slice(0,1500),inputs,simulatedQuote,staking:staking.slice(0,1500)};
 });
 await check('Reduced motion uses still art and stops CSS animation',async()=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.locator('.faction-grid').scrollIntoViewIfNeeded();
  const value=await page.evaluate(()=>({motion:document.documentElement.dataset.motion,sources:[...document.querySelectorAll('.faction-card img')].map(n=>n.getAttribute('src')),running:document.getAnimations().filter(a=>a.playState==='running').length}));
  if(value.motion!=='off'||value.sources.some(s=>s.includes('-loop'))||value.running)throw Error(JSON.stringify(value));return value;
 });
 await check('Axe accessibility scan at mobile',async()=>{
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
  report.axe=result.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,nodes:v.nodes.map(n=>({target:n.target,failureSummary:n.failureSummary}))}));
  if(report.axe.length)throw Error(JSON.stringify(report.axe));return {violations:0,incomplete:result.incomplete.map(v=>v.id)};
 });
 await check('Measured solid text and action contrast',async()=>{
  const pairs=await page.evaluate(()=>{
   const root=getComputedStyle(document.documentElement);const value=n=>root.getPropertyValue(n).trim();
   const rgb=hex=>hex.replace('#','').match(/../g).map(x=>parseInt(x,16));
   const lum=hex=>rgb(hex).map(n=>{const s=n/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
   return [['body','--gray-100','--violet-950'],['muted','--gray-400','--violet-950'],['muted surface','--gray-400','--violet-900'],['primary button','--violet-950','--yellow-300'],['focus ring','--cyan-300','--violet-950']].map(([role,a,b])=>{const foreground=value(a),background=value(b),l1=lum(foreground),l2=lum(background);return {role,foreground,background,ratio:Math.round(((Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05))*100)/100}});
  });report.contrast=pairs;if(pairs.some(p=>p.ratio<4.5))throw Error(JSON.stringify(pairs));return pairs;
 });
 await check('Live Ethereum state resolves or exposes an explicit failure',async()=>{
  const content=await page.locator('.economy-console').innerText();
  if(!/BLOCK|unavailable|failed|retry/i.test(content))throw Error(content);return content;
 });
 await check('Mocked EIP1193 owner connects, switches to Ethereum, and rejects safely',async()=>{
  const mocked=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  await mocked.addInitScript(()=>{
   const account='0x13afb9b5780cd9ae79c61503adb69c57845d8eac';let chain='0x2105';const handlers={};
   window.__mockRequests=[];window.__mockReject=false;
   window.ethereum={on:(event,fn)=>{handlers[event]=fn},removeListener:(event)=>{delete handlers[event]},request:async({method,params})=>{
    window.__mockRequests.push(method);
    if(method==='eth_requestAccounts'){if(window.__mockReject)throw Object.assign(new Error('User rejected request'),{code:4001});return [account]}
    if(method==='eth_chainId')return chain;
    if(method==='eth_accounts')return [account];
    if(method==='wallet_switchEthereumChain'){chain=params[0].chainId;handlers.chainChanged?.(chain);return null}
    throw new Error('Mock refuses unsupported request: '+method);
   }};
  });
  const m=await mocked.newPage();
  try{
   await m.goto(url,{waitUntil:'domcontentloaded'});await m.locator('.wallet-button').click();
   await m.getByRole('dialog').getByRole('button',{name:'Connect wallet',exact:true}).click();
   await m.getByRole('button',{name:'Switch to Ethereum',exact:true}).click();
   if(await m.getByRole('button',{name:'Switch to Ethereum',exact:true}).count())throw Error('Wrong chain remains');
   await m.keyboard.press('Escape');await m.getByRole('button',{name:'Setup & readiness'}).click();
   const dialog=m.getByRole('dialog');
   if(!await dialog.innerText().then(t=>t.includes('Connected owner wallet')))throw Error('Owner not recognized');
   await dialog.getByRole('button',{name:'Phase B · operations'}).click();
   const phaseB=await dialog.innerText();
   if(!phaseB.includes('executor'))throw Error('Missing operating configuration');
   const transactionButtons=await dialog.getByRole('button').evaluateAll(ns=>ns.filter(n=>/wallet|execute|send|simulate/i.test(n.textContent)).map(n=>({text:n.textContent,disabled:n.disabled})));
   await m.screenshot({path:resolve(artifactRoot,'mock-owner-phase-b.jpg'),type:'jpeg',quality:65});
   await m.keyboard.press('Escape');await m.locator('.wallet-button').click();
   await m.getByRole('button',{name:'Disconnect from site'}).click();
   await m.evaluate(()=>{window.__mockReject=true});
   await m.getByRole('dialog').getByRole('button',{name:'Connect wallet',exact:true}).click();
   const rejection=await m.getByRole('alert').innerText();
   if(!/declined|rejected/i.test(rejection))throw Error(rejection);
   const requests=await m.evaluate(()=>window.__mockRequests);
   if(requests.some(x=>/send|sign/i.test(x)))throw Error('Unexpected signing request');
   return {requests,transactionButtons,rejection};
  }finally{await mocked.close()}
 });
 await check('RPC failure stays explicit without invented zero balances',async()=>{
  const offline=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  await offline.route(/https:\/\/(ethereum-rpc\.publicnode\.com|eth\.drpc\.org)/,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({jsonrpc:'2.0',id:1,error:{code:-32000,message:'Test RPC unavailable'}})}));
  const o=await offline.newPage();
  try{
   await o.goto(url,{waitUntil:'domcontentloaded'});
   await o.locator('.economy-console .inline-error').waitFor({timeout:30000});
   const text=await o.locator('.economy-console').innerText();
   if(!text.includes('Live reads unavailable')||!text.includes('Refresh to retry'))throw Error(text);
   await o.locator('.economy-console').scrollIntoViewIfNeeded();await o.screenshot({path:resolve(artifactRoot,'rpc-failure-mobile.jpg'),type:'jpeg',quality:65});return text;
  }finally{await offline.close()}
 });
 report.summary={passed:report.checks.filter(c=>c.pass).length,failed:report.checks.filter(c=>!c.pass).length};
 await context.close();
}catch(error){report.fatal=String(error.stack);console.error(error)}finally{
 await browser?.close();
 await new Promise(resolve=>server.close(resolve));
 await writeFile(resolve(artifactRoot,'review-results.json'),JSON.stringify(report,null,2)+'\n');
}
if(report.fatal||report.checks.some(c=>!c.pass))process.exitCode=1;
