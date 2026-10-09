
fetch('/api/tournaments').then(r=>r.json()).then(d=>{
 const list=(d.tournaments||[]).slice(0,6);
 document.getElementById('featured').innerHTML=list.length?list.map(t=>card(t)).join(''):'<div class="empty">No tournaments published yet.</div>';
}).catch(()=>document.getElementById('featured').innerHTML='<div class="empty">Unable to load tournaments.</div>');
function card(t){return `<article class="card"><div class="tag">${t.status}</div><h3>${esc(t.title)}</h3><p>${esc(t.description||'Tournament event')}</p><div class="meta"><span>${t.mode}</span><span>${t.entry_type==='PAID'?'₹'+Number(t.entry_fee).toFixed(0):'FREE'}</span><span>${t.verified_count}/${t.capacity}</span></div><a class="text-link" href="/tournament.html?id=${encodeURIComponent(t.public_id)}">View event →</a></article>`}
function esc(x){return String(x??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}

