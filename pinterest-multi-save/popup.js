const API = "https://api.pinterest.com/v5";
const $ = (id) => document.getElementById(id);
const msg = (t) => ($("msg").textContent = t);
let token = "", pin = null;

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${data.message || ""}`);
  return data;
}

async function getPin() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const m = tab?.url?.match(/pinterest\.[a-z.]+\/pin\/(\d+)/);
  if (!m) return null;
  let image = null;
  try {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.querySelector('meta[property="og:image"]')?.content || null,
    });
    image = r.result;
  } catch (_) {}
  return { id: m[1], image };
}

async function loadBoards() {
  const boards = [];
  let bookmark = "";
  do {
    const d = await api(`/boards?page_size=250${bookmark ? "&bookmark=" + bookmark : ""}`);
    boards.push(...d.items);
    bookmark = d.bookmark || "";
  } while (bookmark);
  $("list").innerHTML = "";
  boards.forEach((b) => addRow(b));
  if (!boards.length) $("list").textContent = "ボードがありません";
}

function addRow(b, checked = false) {
  const l = document.createElement("label");
  const c = document.createElement("input");
  c.type = "checkbox"; c.value = b.id; c.checked = checked;
  l.append(c, b.name);
  $("list").append(l);
}

// 1ボードへ保存。まず元ピンの再保存を試し、失敗したら画像URLで保存
async function saveTo(boardId) {
  try {
    return await api("/pins", {
      method: "POST",
      body: JSON.stringify({
        board_id: boardId,
        media_source: { source_type: "pin_url", url: `https://www.pinterest.com/pin/${pin.id}/` },
      }),
    });
  } catch (e) {
    if (!pin.image) throw e;
    return await api("/pins", {
      method: "POST",
      body: JSON.stringify({
        board_id: boardId,
        media_source: { source_type: "image_url", url: pin.image },
      }),
    });
  }
}

async function saveAll(ids) {
  if (!ids.length) return msg("ボードを選択してください");
  $("save").disabled = true;
  const ok = [], ng = [];
  for (const id of ids) {
    const name = $("list").querySelector(`input[value="${id}"]`)?.parentElement.textContent || id;
    try { await saveTo(id); ok.push(name); } catch (e) { ng.push(`${name}: ${e.message}`); }
  }
  msg(`保存 ${ok.length}件${ng.length ? "\n失敗:\n" + ng.join("\n") : ""}`);
  $("save").disabled = false;
}

$("gear").onclick = () => chrome.runtime.openOptionsPage();
$("save").onclick = () =>
  saveAll([...$("list").querySelectorAll("input:checked")].map((c) => c.value));
$("create").onclick = async () => {
  const name = $("name").value.trim();
  if (!name) return;
  try {
    const b = await api("/boards", { method: "POST", body: JSON.stringify({ name }) });
    addRow(b, true);
    $("name").value = "";
    msg(`ボード「${name}」を作成しました。保存ボタンで保存します`);
  } catch (e) { msg("作成失敗: " + e.message); }
};

(async () => {
  ({ token = "" } = await chrome.storage.local.get("token"));
  if (!token) return ($("list").textContent = "⚙から アクセストークンを設定してください");
  pin = await getPin();
  if (!pin) return ($("list").textContent = "Pinterestのピン詳細ページ(/pin/…)で開いてください");
  try { await loadBoards(); } catch (e) { $("list").textContent = "ボード取得失敗: " + e.message; }
})();
