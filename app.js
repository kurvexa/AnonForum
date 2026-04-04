// =======================
// 🔧 SUPABASE SETUP
// =======================
const SUPABASE_URL = "https://lqisypgwjzvtxslmsuwc.supabase.co";
const SUPABASE_KEY = "sb_publishable_t0odKZzr5g98bTl1O5yuMw_R86mrL7W";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// =======================
// 🧠 STATE
// =======================
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
// ⏱️ TIME (FIXED)
// =======================
function timeAgo(ts) {
  if (!ts) return "just now";

  const past = new Date(ts);
  if (isNaN(past)) return "just now";

  const diff = Math.floor((new Date() - past) / 1000);

  if (diff < 0) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// =======================
// 🔼 UPVOTE (SAFE)
// =======================
async function upvote(postId) {
  const userId = getUserId();

  const { error } = await db.from("votes").insert({
    post_id: postId,
    user_id: userId
  });

  if (error) {
    if (error.code === "23505") return;
    console.error(error);
    return;
  }

  await db.rpc("increment_upvotes", { row_id: postId });

  loadPosts();
}

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

// =======================
// ➕ ADD POST
// =======================
async function addPost() {
  const input = document.getElementById("postInput");
  if (!input.value.trim()) return;

  const { error } = await db.from("posts").insert({
    text: input.value,
    author: getAnonName(),
    board: currentBoard
  });

  if (error) {
    console.error(error);
    return;
  }

  input.value = "";
  setTimeout(loadPosts, 150);
}

// =======================
// 💬 ADD REPLY
// =======================
async function addReply(parentId) {
  const input = document.getElementById("replyInput-" + parentId);
  if (!input.value.trim()) return;

  const { error } = await db.from("posts").insert({
    text: input.value,
    author: getAnonName(),
    parent_id: parentId,
    board: currentBoard
  });

  if (error) {
    console.error(error);
    return;
  }

  input.value = "";
  loadPosts();
}

// =======================
// 🌳 BUILD TREE (SAFE)
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
  window.__postsCache = posts || [];

  const container = document.getElementById("posts");
  container.innerHTML = "";

  function render(post, parent) {
    const div = document.createElement("div");
    div.className = post.parent_id ? "reply" : "post";

    const formatted = (post.text || "")
      .split("\n")
      .map(line => line.startsWith(">") ? `<blockquote>${line}</blockquote>` : line)
      .join("<br>");

    div.innerHTML = `
      <b>${post.author}</b> • ${timeAgo(post.created_at)}

      <p>${formatted}</p>

      ❤️ ${post.upvotes || 0}
      <button onclick="upvote(${post.id})">Upvote</button>
      <button onclick="quotePost(${post.id})">Quote</button>
      <button onclick="toggleReplyBox(${post.id})">Reply</button>

      <div id="replyBox-${post.id}" style="display:none;">
        <textarea id="replyInput-${post.id}"></textarea>
        <button onclick="addReply(${post.id})">Send</button>
      </div>
    `;

    parent.appendChild(div);

    (post.replies || []).forEach(r => render(r, div));
  }

  buildTree(posts)
    .reverse()
    .forEach(p => render(p, container));
}

// =======================
// 🔽 TOGGLE REPLY BOX
// =======================
function toggleReplyBox(id) {
  const el = document.getElementById("replyBox-" + id);
  el.style.display = el.style.display === "none" ? "block" : "none";
}

// =======================
// 🔀 SWITCH BOARD
// =======================
function switchBoard(board) {
  currentBoard = board;
  loadPosts();
}

// =======================
// 📥 LOAD POSTS (FIXED)
// =======================
async function loadPosts() {
  document.getElementById("boardTitle").innerText = currentBoard;

  const { data, error } = await db
    .from("posts")
    .select("*")
    .eq("board", currentBoard)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  renderPosts(data || []);
}

// =======================
// 🚀 INIT
// =======================
loadPosts();
