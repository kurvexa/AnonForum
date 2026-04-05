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
// 🧠 STATE
// =======================
const BOARDS = ["general", "tech", "gaming", "random"];
let currentBoard = "general";

// =======================
// 👤 USER
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
// ⏱️ TIME FIX
// =======================
function timeAgo(ts) {
  if (!ts) return "just now";

  const past = new Date(ts.replace(" ", "T"));
  const now = new Date();

  if (isNaN(past.getTime())) return "just now";

  const diff = Math.floor((now - past) / 1000);

  if (diff < 0) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// =======================
// ➕ ADD POST
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
}
window.addPost = addPost;

// =======================
// 💬 ADD REPLY
// =======================
async function addReply(parentId) {
  const input = document.getElementById("replyInput-" + parentId);
  if (!input.value.trim()) return;

  await db.from("posts").insert({
    text: input.value,
    author: getAnonName(),
    user_id: getUserId(),
    parent_id: parentId,
    board: currentBoard
  });

  input.value = "";
}
window.addReply = addReply;

// =======================
// 👍 UPVOTE
// =======================
async function upvote(postId) {
  const userId = getUserId();

  const { error } = await db.from("votes").insert({
    post_id: postId,
    user_id: userId
  });

  if (error && error.code !== "23505") return;

  await db.rpc("increment_upvotes", { row_id: postId });
}
window.upvote = upvote;

// =======================
// 💬 QUOTE
// =======================
function quotePost(postId) {
  const posts = window.__postsCache || [];

  function find(list) {
    for (let p of list) {
      if (p.id === postId) return p;
      if (p.replies) {
        const found = find(p.replies);
        if (found) return found;
      }
    }
    return null;
  }

  const post = find(posts);
  if (!post) return;

  const input = document.getElementById("postInput");

  const quoted = (post.text || "")
    .split("\n")
    .map(line => "> " + line)
    .join("\n");

  input.value += `\n${post.author}:\n${quoted}\n\n`;
  input.focus();
}
window.quotePost = quotePost;

// =======================
// 🌳 BUILD TREE
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
// 🖼️ RENDER (FULL FIX)
// =======================
function renderPosts(posts) {
  window.__postsCache = posts || [];

  const container = document.getElementById("posts");
  container.innerHTML = "";

  const tree = buildTree(posts);

  function renderFlat(post, depth = 0) {
    const div = document.createElement("div");

    const isMod = MODS.includes(post.user_id);
    const isYou = post.user_id === getUserId();

    const maxIndent = 5;
    const indent = Math.min(depth, maxIndent);

    div.className = "post";
    div.style.marginLeft = `${indent * 20}px`;

    div.style.border = isYou
      ? "2px solid #4a5a9c"
      : "1px solid #ccd0d5";

    const formatted = (post.text || "")
      .split("\n")
      .map(line =>
        line.startsWith(">")
          ? `<blockquote>${line}</blockquote>`
          : line
      )
      .join("<br>");

    div.innerHTML = `
      <b>
        ${post.author}
        ${isMod ? '<span class="modTag">MODERATOR</span>' : ''}
      </b>
      • ${timeAgo(post.created_at)}

      <p>${formatted}</p>

      ${post.upvotes || 0}
      <button onclick="upvote(${post.id})">Upvote</button>
      <button onclick="quotePost(${post.id})">Quote</button>
      <button onclick="toggleReplyBox(${post.id})">Reply</button>

      <div id="replyBox-${post.id}" style="display:none;">
        <textarea id="replyInput-${post.id}"></textarea>
        <button onclick="addReply(${post.id})">Send</button>
      </div>
    `;

    // 🔥 KEY FIX: always append to main container (NOT nested)
    container.appendChild(div);

    (post.replies || []).forEach(r => renderFlat(r, depth + 1));
  }

  tree.reverse().forEach(p => renderFlat(p));
}

// =======================
// 🔽 TOGGLE REPLY
// =======================
function toggleReplyBox(id) {
  const el = document.getElementById("replyBox-" + id);
  el.style.display = el.style.display === "none" ? "block" : "none";
}
window.toggleReplyBox = toggleReplyBox;

// =======================
// 🔀 SWITCH BOARD
// =======================
function switchBoard(board) {
  board = board.toLowerCase();
  if (!BOARDS.includes(board)) board = "general";

  currentBoard = board;

  document.getElementById("boardTitle").innerText =
    board.charAt(0).toUpperCase() + board.slice(1);

  loadPosts();
}
window.switchBoard = switchBoard;

// =======================
// 📥 LOAD POSTS
// =======================
async function loadPosts() {
  const { data, error } = await db
    .from("posts")
    .select("id, text, author, created_at, parent_id, upvotes, board, user_id")
    .eq("board", currentBoard)
    .order("created_at", { ascending: false });

  if (error) return console.error(error);

  renderPosts(data || []);
}

// =======================
// 🔔 REALTIME
// =======================
function setupRealtime() {
  db.channel("posts-channel")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "posts" },
      () => loadPosts()
    )
    .subscribe();
}

// =======================
// 🚀 INIT
// =======================
setupRealtime();
loadPosts();

// 🔄 keep timestamps fresh
setInterval(loadPosts, 30000);
