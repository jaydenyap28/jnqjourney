// Disposable localhost QA proxy. No cloud writes. Browser measurements are
// exposed as DOM text because Work's read-only browser evaluator hides performance.
import http from 'node:http'

const instrumentation = `<script>
(() => {
  const observed = { lcp: null, cls: 0, longTasks: 0, longTaskMs: 0 };
  try { new PerformanceObserver(list => { for (const e of list.getEntries()) observed.lcp = e.startTime }).observe({type:'largest-contentful-paint',buffered:true}); } catch {}
  try { new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) observed.cls += e.value }).observe({type:'layout-shift',buffered:true}); } catch {}
  try { new PerformanceObserver(list => { for (const e of list.getEntries()) { observed.longTasks++; observed.longTaskMs += e.duration } }).observe({type:'longtask',buffered:true}); } catch {}
  window.addEventListener('load', () => setTimeout(() => {
    const entries = performance.getEntriesByType('resource');
    const nav = performance.getEntriesByType('navigation')[0];
    const sum = list => ({count:list.length,transferBytes:list.reduce((s,e)=>s+e.transferSize,0),encodedBytes:list.reduce((s,e)=>s+e.encodedBodySize,0)});
    const pre = document.createElement('pre'); pre.id = 'local-qa-metrics'; pre.hidden = true;
    pre.textContent = JSON.stringify({viewport:[innerWidth,innerHeight],navigation:{transferBytes:nav.transferSize,encodedBytes:nav.encodedBodySize,decodedBytes:nav.decodedBodySize,dclMs:nav.domContentLoadedEventEnd,loadMs:nav.loadEventEnd},paint:performance.getEntriesByType('paint').map(e=>({name:e.name,ms:e.startTime})),requests:sum(entries),scripts:sum(entries.filter(e=>e.initiatorType==='script')),images:sum(entries.filter(e=>e.initiatorType==='img')),domElements:document.querySelectorAll('*').length,imageElements:document.images.length,heapBytes:performance.memory?.usedJSHeapSize,...observed});
    document.body.append(pre);
  }, 8000), {once:true});
})();
</script>`

http.createServer(async (req, res) => {
  if (req.url?.startsWith('/api/page-view')) {
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); return
  }
  try {
    const requestHeaders = { accept: req.headers.accept || '*/*' }
    for (const name of ['rsc', 'next-router-state-tree', 'next-router-prefetch', 'next-url']) {
      if (req.headers[name]) requestHeaders[name] = req.headers[name]
    }
    const response = await fetch(`http://127.0.0.1:3010${req.url}`, { headers: requestHeaders })
    const headers = Object.fromEntries([...response.headers].filter(([name]) => !['content-length', 'content-encoding', 'transfer-encoding'].includes(name)))
    res.writeHead(response.status, headers)
    if (response.headers.get('content-type')?.includes('text/html')) res.end((await response.text()).replace('</head>', `${instrumentation}</head>`))
    else res.end(Buffer.from(await response.arrayBuffer()))
  } catch { res.writeHead(502); res.end('Local QA upstream unavailable') }
}).listen(3011, '127.0.0.1', () => console.log('Local browser QA proxy: http://127.0.0.1:3011'))
