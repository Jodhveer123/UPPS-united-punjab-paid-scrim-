
fetch('/api/tournaments').then(r=>r.json()).then(d=>{document.getElementById('list').innerHTML=(d.tournaments||[]).map(card).join('')||'<div class="empty">No tournaments available.</div>'});
function card(t){return `<article class="card"><div class="tag">${t.status}</div><h3>${esc(t.title)}</h3><p>${esc(t.description||'')}</p><div class="meta"><span>${t.mode}</span><span>${t.entry_type==='PAID'?'₹'+Number(t.entry_fee).toFixed(0):'FREE'}</span><span>${t.verified_count}/${t.capacity} slots</span></div><p class="muted">${t.start_at?new Date(t.start_at).toLocaleString():'Date to be announced'}</p><a class="btn small" href="/tournament.html?id=${encodeURIComponent(t.public_id)}">Open Tournament</a></article>`}
function esc(x){return String(x??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}

