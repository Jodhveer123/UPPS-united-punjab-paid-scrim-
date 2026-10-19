const list = document.getElementById("list");
const search = document.getElementById("tournamentSearch");
const modeFilter = document.getElementById("modeFilter");
const entryFilter = document.getElementById("entryFilter");
const statusFilter = document.getElementById("statusFilter");
const resultCount = document.getElementById("resultCount");
let tournaments = [];

fetch("/api/tournaments")
  .then(async response => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not load tournaments.");
    tournaments = data.tournaments || [];
    render();
  })
  .catch(() => {
    list.innerHTML = '<div class="empty"><h3>Events are temporarily unavailable</h3><p>Please try refreshing this page in a moment.</p><button class="btn small" type="button" id="retryLoad">Try again</button></div>';
    resultCount.textContent = "";
    const retry = document.getElementById("retryLoad");
    if (retry) retry.addEventListener("click", () => location.reload());
  });

[search, modeFilter, entryFilter, statusFilter].forEach(control => control.addEventListener("input", render));

function render() {
  const q = search.value.trim().toLowerCase();
  const mode = modeFilter.value;
  const entry = entryFilter.value;
  const status = statusFilter.value;
  const filtered = tournaments.filter(t =>
    String(t.title || "").toLowerCase().includes(q) &&
    (!mode || t.mode === mode) &&
    (!entry || t.entry_type === entry) &&
    (!status || String(t.status || "").toUpperCase() === status)
  );
  list.innerHTML = filtered.map(card).join("") || '<div class="empty"><h3>No matching tournaments</h3><p>Try changing your search or filters.</p><button class="btn small" type="button" id="clearFilters">Clear filters</button></div>';
  const clear = document.getElementById("clearFilters");
  if (clear) clear.addEventListener("click", () => {
    search.value = ""; modeFilter.value = ""; entryFilter.value = ""; statusFilter.value = ""; render();
  });
  resultCount.textContent = `Showing ${filtered.length} of ${tournaments.length} published tournament${tournaments.length === 1 ? "" : "s"}.`;
}

function card(t) {
  const status = String(t.status || "PUBLISHED");
  const fee = t.entry_type === "PAID" ? "₹" + Number(t.entry_fee).toFixed(0) : "FREE";
  const slots = `${Number(t.verified_count || 0)} / ${Number(t.capacity || 0)} slots`;
  return `<article class="card">
    <div class="row" style="padding-top:0"><span class="tag">${esc(status)}</span><span class="muted" style="font-size:12px">${esc(t.mode || "EVENT")}</span></div>
    <h3>${esc(t.title)}</h3><p>${esc(t.description || "Tournament details and instructions are available on the event page.")}</p>
    <div class="meta"><span>◈ ${esc(t.mode || "—")}</span><span>◈ ${esc(fee)}</span><span>◈ ${esc(slots)}</span></div>
    <p class="muted">${t.start_at ? "Starts " + esc(new Date(t.start_at).toLocaleString()) : "Schedule to be announced"}</p>
    <a class="btn small" href="/tournament.html?id=${encodeURIComponent(t.public_id)}">View event details →</a>
  </article>`;
}
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
}
