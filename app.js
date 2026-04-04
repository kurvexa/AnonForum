// =======================
// 🔧 Supabase setup
// =======================
const SUPABASE_URL = "https://lqisypgwjzvtxslmsuwc.supabase.co";
const SUPABASE_KEY = "sb_publishable_t0odKZzr5g98bTl1O5yuMw_R86mrL7W";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// =======================
// 👤 User ID
// =======================
function getUserId() {
  let id = localStorage.getItem("userId");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("userId", id);
  }
  return id;
}

// =======================
// 👤 Anonymous name
// =======================
function getAnonName() {
  let name = localStorage.getItem("anonName");
  if (!name) {
    name = "Anon" + Math.floor(Math.random() * 10000);
    localStorage.setItem("anonName", name);
  }
  return name;
}

// =======================
// ⏱️ Time ago (FIXED)
// =======================
function timeAgo(ts) {
  if (!ts) return "just now";

  const past = new Date(ts);
  if (isNaN(past.getTime())) return "just now";

  const now = new Date();

  const diffMs = now - past;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 0) return "just now";

  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

// =======================
// 💬 Quote system (FIXED)
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

  const quoted = post.text
    .split("\n")
    .map(line => "> " + line)
    .join("\n");

  input.value += `\n${post.author} wrote:\n${quoted}\n\n`;
  input.focus();
}

// =======================
// 🔼 Upvote (SAFE)
// =======================
async function upvote(postId) {
  const userId = getUserId();

  const { error } = await db.from("votes").insert({
    post_id: postId,
    user_id: userId
  });

  if (error) {
    if (error.code === "23505") return; // already voted
    console.error(error);
    return;
  }

  await db.rpc("increment_upvotes", { row_id: postId });
}

// =======================
// ➕ Add post
// =======================
async function addPost() {
  const input = document.getElementById("postInput");
  if (!input.value.trim()) return;

  await db.from("posts").insert({
    text: input.value,
    author: getAnonName(),
    parent_id: null
  });

  input.value = "";
}

// =======================
// 💬 Add reply
// =======================
async function addReply(parentId) {
  const input = document.getElementById("replyInput-" + parentId);
  if (!input.value.trim()) return;

  await db.from("posts").insert({
    text: input.value,
    author: getAnonName(),
    parent_id: parentId
  });

  input.value = "";
}

// =======================
// 🌳 Build tree
// =======================
function buildTree(posts) {
  const map = {};
  const roots = [];

  posts.forEach(p => {
    p.replies = [];
    map[p.id] = p;
  });

  posts.forEach(p => {
    if (p.parent_id) {
      map[p.parent_id]?.replies.push(p);
    } else {
      roots.push(p);
    }
  });

  return roots;
}

// =======================
// 🖼️ Render posts
// =======================
function renderPosts(posts) {
  window.__postsCache = posts;

  const container = document.getElementById("posts");
  container.innerHTML = "";

  function render(post, parent) {
    const div = document.createElement("div");
    div.className = post.parent_id ? "reply" : "post";

    const formatted = post.text
      .split("\n")
      .map(line => {
        if (line.startsWith(">")) {
          return `<blockquote>${line}</blockquote>`;
        }
        return line;
      })
      .join("<br>");

    div.innerHTML = `
      <div class="meta">
        <strong>${post.author}</strong> • ${timeAgo(post.created_at)}
      </div>

      <p>${formatted}</p>

      <div>
        ${post.upvotes || 0}
        <button onclick="upvote(${post.id})">Upvote</button>
        <button onclick="quotePost(${post.id})">Quote</button>
        <button onclick="toggleReplyBox(${post.id})">Reply</button>
      </div>

      <div id="replyBox-${post.id}" style="display:none;">
        <textarea id="replyInput-${post.id}"></textarea>
        <button onclick="addReply(${post.id})">Submit</button>
      </div>
    `;

    parent.appendChild(div);

    post.replies.forEach(r => render(r, div));
  }

  buildTree(posts).forEach(p => render(p, container));
}

// =======================
// 🔁 Toggle reply box
// =======================
function toggleReplyBox(id) {
  const el = document.getElementById("replyBox-" + id);
  el.style.display = el.style.display === "none" ? "block" : "none";
}

// =======================
// 🚀 Init + realtime
// =======================
async function init() {
  const { data } = await db
    .from("posts")
    .select("*")
    .order("created_at", { ascending: true });

  renderPosts(data);

  db.channel("forum")
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "posts"
    }, async () => {
      const { data } = await db
        .from("posts")
        .select("*")
        .order("created_at", { ascending: true });

      renderPosts(data);
    })
    .subscribe();
}

init();
