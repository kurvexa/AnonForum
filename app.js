// =======================
// 🔧 CONFIG
// =======================
const SUPABASE_URL = "https://lqisypgwjzvtxslmsuwc.supabase.co";
const SUPABASE_KEY = "sb_publishable_t0odKZzr5g98bTl1O5yuMw_R86mrL7W";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const MODS = ["9878da6b-7e46-4add-b781-daf0aab15672"];

// =======================
// 🧠 STATE
// =======================
let currentBoard = "general";
let cachedPosts = [];
let viewingThread = null;

// =======================
// ⏱️ TIME & UTILS
// =======================
function getUserId() {
  let id = localStorage.getItem("userId") || crypto.randomUUID();
  localStorage.setItem("userId", id);
  return id;
}

function getAnonName() {
  return localStorage.getItem("anonName") || "Anonymous";
}

function timeAgo(ts) {
  if (!ts) return "just now";
  const diff = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// =======================
// 🖼️ RENDER LOGIC
// =======================
function render() {
  const container = document.getElementById("posts");
  container.innerHTML = "";

  // Check URL for thread ID
  const params = new URLSearchParams(window.location.search);
  viewingThread = params.get("thread");

  if (viewingThread) {
    renderThreadView(container, parseInt(viewingThread));
  } else {
    renderCatalogView(container);
  }
}

function renderCatalogView(container) {
  const threads = cachedPosts.filter(p => !p.parent_id);
  
  threads.forEach(t => {
    const replies = cachedPosts.filter(p => p.parent_id === t.id);
    const div = document.createElement("div");
    div.className = "thread-link";
    div.innerHTML = `
      <div class="post topic-row">
        <span class="subject" onclick="openThread(${t.id})">${t.text.substring(0, 60)}...</span>
        <span class="meta">By <b>${t.author}</b> • ${timeAgo(t.created_at)} • [${replies.length} replies]</span>
        <button onclick="openThread(${t.id})">View Thread</button>
      </div>
    `;
    container.appendChild(div);
  });
}

function renderThreadView(container, threadId) {
  const op = cachedPosts.find(p => p.id === threadId);
  const replies = cachedPosts.filter(p => p.parent_id === threadId);

  if (!op) {
    container.innerHTML = "Thread not found. <a href='#' onclick='goHome()'>Go Back</a>";
    return;
  }

  const backLink = document.createElement("div");
  backLink.innerHTML = `<a href="#" onclick="goHome()" class="backBtn">[ Back ]</a><hr>`;
  container.appendChild(backLink);

  // Render OP
  renderSinglePost(op, container, true);

  // Render Replies
  const replyWrap = document.createElement("div");
  replyWrap.className = "reply-section";
  replies.reverse().forEach(r => renderSinglePost(r, replyWrap, false));
  container.appendChild(replyWrap);
}

function renderSinglePost(post, container, isOP) {
  const div = document.createElement("div");
  div.className = isOP ? "post op" : "post reply";
  div.id = `p${post.id}`;
  
  const isMod = MODS.includes(post.user_id);
  const formatted = (post.text || "")
    .split("\n")
    .map(line => line.startsWith(">") ? `<blockquote>${line}</blockquote>` : line)
    .join("<br>");

  div.innerHTML = `
    <div class="post-header">
      <input type="checkbox">
      <span class="name">${post.author}</span> 
      ${isMod ? '<span class="modTag"># MOD</span>' : ''}
      <span class="ts">${timeAgo(post.created_at)}</span>
      <span class="relink" onclick="quotePost(${post.id})">No.${post.id}</span>
      ${isOP ? `<button class="replyBtn" onclick="toggleReplyBox(${post.id})">Reply</button>` : ''}
    </div>
    <div class="post-body">${formatted}</div>
    <div id="replyBox-${post.id}" class="inline-reply" style="display:none">
       <textarea id="replyInput-${post.id}"></textarea><br>
       <button onclick="submitReply(${post.id})">Post Reply</button>
    </div>
  `;
  container.appendChild(div);
}

// =======================
// ➕ ACTIONS
// =======================
async function addPost() {
  const input = document.getElementById("postInput");
  if (!input.value.trim()) return;

  await db.from("posts").insert({
    text: input.value,
    author: getAnonName(),
    user_id: getUserId(),
    board: currentBoard
  });

  input.value = "";
  loadPosts();
}

async function submitReply(parentId) {
  const input = document.getElementById("replyInput-" + parentId);
  if (!input.value.trim()) return;

  await db.from("posts").insert({
    text: input.value,
    author: getAnonName(),
    user_id: getUserId(),
    parent_id: parentId,
    board: currentBoard
  });

  loadPosts();
}

// =======================
// 🛠️ NAVIGATION
// =======================
function openThread(id) {
  window.history.pushState({}, "", `?thread=${id}`);
  render();
}

function goHome() {
  window.history.pushState({}, "", window.location.pathname);
  render();
}

function switchBoard(board) {
  currentBoard = board;
  document.getElementById("boardTitle").innerText = board.toUpperCase();
  goHome();
  loadPosts();
}

async function loadPosts() {
  const { data, error } = await db.from("posts").select("*")
    .eq("board", currentBoard)
    .order("created_at", { ascending: false });

  if (!error) {
    cachedPosts = data;
    render();
  }
}

// Global scope
window.openThread = openThread;
window.goHome = goHome;
window.switchBoard = switchBoard;
window.toggleReplyBox = (id) => {
  const b = document.getElementById(`replyBox-${id}`);
  b.style.display = b.style.display === "none" ? "block" : "none";
};

// Initial Load
loadPosts();
setInterval(render, 30000);
