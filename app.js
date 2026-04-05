// =======================
// 🔧 SUPABASE SETUP
// =======================
const SUPABASE_URL = "https://lqisypgwjzvtxslmsuwc.supabase.co";
const SUPABASE_KEY = "sb_publishable_t0odKZzr5g98bTl1O5yuMw_R86mrL7W";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// =======================
// 🛡️ MODERATOR IDS
// =======================
const MODS = ["9878da6b-7e46-4add-b781-daf0aab15672"];

// =======================
// 🧠 STATE & CACHE
// =======================
const BOARDS = ["general", "tech", "gaming", "random"];
let currentBoard = "general";
let cachedPosts = []; 

// =======================
// 👤 USER UTILS
// =======================
function getUserId() {
  let id = localStorage.getItem("userId");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("userId", id);
  }
  return id;
}

function getAnonName() {
  let name = localStorage.getItem("anonName");
  if (!name) {
    name = "Anon" + Math.floor(Math.random() * 10000);
    localStorage.setItem("anonName", name);
  }
  return name;
}

// =======================
// ⏱️ TIME FIX (UTC Standardized)
// =======================
function timeAgo(ts) {
  if (!ts) return "just now";

  // Parse Supabase UTC string to Unix Epoch (milliseconds)
  const past = new Date(ts).getTime();
  const now = Date.now();

  if (isNaN(past)) return "Date Error";

  // Math.floor( (now - past) / 1000 ) gives us the difference in seconds.
  // We use Math.max(0, ...) so that if the user's system clock is slightly 
  // ahead of the server, it doesn't result in a negative number.
  const diff = Math.max(0, Math.floor((now - past) / 1000));

  if (diff < 30) return `just now`;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// =======================
// ➕ ACTIONS
// =======================
async function addPost() {
  const input = document.getElementById("postInput");
  if (!input.value.trim()) return;

  const { error } = await db.from("posts").insert({
    text: input.value,
    author: getAnonName(),
    user_id: getUserId(),
    board: currentBoard
  });

  if (error) console.error("Post error:", error);
  input.value = "";
}
window.addPost = addPost;

async function addReply(parentId) {
  const input = document.getElementById("replyInput-" + parentId);
  if (!input.value.trim()) return;

  const { error } = await db.from("posts").insert({
    text: input.value,
    author: getAnonName(),
    user_id: getUserId(),
    parent_id: parentId,
    board: currentBoard
  });

  if (error) console.error("Reply error:", error);
  input.value = "";
}
window.addReply = addReply;

async function upvote(postId) {
  const userId = getUserId();
  const { error } = await db.from("votes").insert({
    post_id: postId,
    user_id: userId
  });

  // 23505 is the Postgres error code for unique constraint (already voted)
  if (error && error.code !== "23505") return;
  await db.rpc("increment_upvotes", { row_id: postId });
}
window.upvote = upvote;

// =======================
// 🌳 DATA PROCESSING
// =======================
function buildTree(posts = []) {
  const map = {};
  const roots = [];

  posts.forEach(p => {
    p.replies = [];
    map[p.id] = p;
  });

  posts.forEach(p => {
    if (p.parent_id && map[p.parent_id]) {
      map[p.parent_id].replies.push(p);
    } else {
      roots.push(p);
    }
  });

  return roots;
}

// =======================
// 🖼️ RENDER
// =======================
function renderPosts(posts) {
  const container = document.getElementById("posts");
  if (!container) return;
  
  container.innerHTML = "";
  // Create a deep copy to prevent mutating cachedPosts during tree building
  const tree = buildTree(JSON.parse(JSON.stringify(posts)));

  function renderFlat(post, depth = 0) {
    const div = document.createElement("div");
    const isMod = MODS.includes(post.user_id);
    const isYou = post.user_id === getUserId();
    const indent = Math.min(depth, 5);

    div.className = "post";
    div.style.marginLeft = `${indent * 20}px`;
    div.style.border = isYou ? "2px solid #4a5a9c" : "1px solid #ccd0d5";
    div.style.padding = "10px";
    div.style.marginBottom = "5px";

    const formatted = (post.text || "")
      .split("\n")
      .map(line => line.startsWith(">") ? `<blockquote>${line}</blockquote>` : line)
      .join("<br>");

    div.innerHTML = `
      <div class="post-header">
        <b>${post.author} ${isMod ? '<span class="modTag" style="color:red; font-size:0.8em;">MODERATOR</span>' : ''}</b>
        <small> • ${timeAgo(post.created_at)}</small>
      </div>
      <p>${formatted}</p>
      <div class="post-actions">
        <span>${post.upvotes || 0} upvotes</span>
        <button onclick="upvote(${post.id})">Upvote</button>
        <button onclick="quotePost(${post.id})">Quote</button>
        <button onclick="toggleReplyBox(${post.id})">Reply</button>
      </div>
      <div id="replyBox-${post.id}" style="display:none; margin-top:10px;">
        <textarea id="replyInput-${post.id}" style="width:100%"></textarea><br>
        <button onclick="addReply(${post.id})">Send</button>
      </div>
    `;
    container.appendChild(div);
    (post.replies || []).forEach(r => renderFlat(r, depth + 1));
  }

  // Newest threads at the top
  tree.reverse().forEach(p => renderFlat(p));
}

// =======================
// 📥 DATA LOADING
// =======================
async function loadPosts() {
  const { data, error } = await db
    .from("posts")
    .select("id, text, author, created_at, parent_id, upvotes, board, user_id")
    .eq("board", currentBoard)
    .order("created_at", { ascending: false });

  if (error) return console.error("Fetch error:", error);

  cachedPosts = data || [];
  renderPosts(cachedPosts);
}

function refreshUI() {
  if (cachedPosts.length > 0) {
    renderPosts(cachedPosts);
  }
}

// =======================
// 🛠️ UI HELPERS
// =======================
function toggleReplyBox(id) {
  const el = document.getElementById("replyBox-" + id);
  el.style.display = el.style.display === "none" ? "block" : "none";
}
window.toggleReplyBox = toggleReplyBox;

function quotePost(postId) {
  const post = cachedPosts.find(p => p.id === postId);
  if (!post) return;

  const input = document.getElementById("postInput");
  const quoted = (post.text || "").split("\n").map(line => "> " + line).join("\n");
  input.value += `\n${post.author}:\n${quoted}\n\n`;
  input.focus();
}
window.quotePost = quotePost;

function switchBoard(board) {
  board = board.toLowerCase();
  if (!BOARDS.includes(board)) board = "general";
  currentBoard = board;
  const titleEl = document.getElementById("boardTitle");
  if (titleEl) titleEl.innerText = board.charAt(0).toUpperCase() + board.slice(1);
  loadPosts();
}
window.switchBoard = switchBoard;

// =======================
// 🔔 REALTIME & INIT
// =======================
function setupRealtime() {
  db.channel("posts-channel")
    .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => loadPosts())
    .subscribe();
}

// Initialization
setupRealtime();
loadPosts();

// Refresh the relative timestamps (e.g., "5m ago") every 30 seconds
setInterval(refreshUI, 30000);
