// =======================
// 🔧 Supabase Setup
// =======================
const SUPABASE_URL = "https://lqisypgwjzvtxslmsuwc.supabase.co";
const SUPABASE_KEY = "sb_publishable_t0odKZzr5g98bTl1O5yuMw_R86mrL7W";

// Create client (DO NOT name it supabase)
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// =======================
// 👤 Anonymous username
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
// ⏱️ Time ago formatter
// =======================
function timeAgo(timestamp) {
  if (!timestamp) return "just now";

  const now = new Date();
  const past = new Date(timestamp);

  if (isNaN(past.getTime())) return "just now";

  const seconds = Math.floor((now - past) / 1000);

  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds} seconds ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

// =======================
// 🔄 Update timestamps live
// =======================
function updateTimestamps() {
  document.querySelectorAll(".timestamp").forEach(el => {
    const time = el.getAttribute("data-time");
    el.innerText = timeAgo(time);
  });
}

setInterval(updateTimestamps, 30000);

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
async function addReply(postId) {
  const input = document.getElementById("replyInput-" + postId);
  if (!input.value.trim()) return;

  await db.from("posts").insert({
    text: input.value,
    author: getAnonName(),
    parent_id: postId
  });
}

// =======================
// 🔁 Toggle reply box
// =======================
function toggleReplyBox(id) {
  const el = document.getElementById("replyBox-" + id);
  el.style.display = el.style.display === "none" ? "block" : "none";
}

// =======================
// 📂 Toggle thread
// =======================
function toggleThread(id) {
  const el = document.getElementById("replies-" + id);
  el.style.display = el.style.display === "none" ? "block" : "none";
}

// =======================
// 🌳 Build nested structure
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
  const container = document.getElementById("posts");
  container.innerHTML = "";

  function render(post, parent, depth = 0) {
    const div = document.createElement("div");
    div.className = depth === 0 ? "post" : "reply";

    const repliesDiv = document.createElement("div");
    repliesDiv.id = "replies-" + post.id;

    div.innerHTML = `
      <div class="meta">
        <strong>${post.author}</strong> • 
        <span class="timestamp" data-time="${post.created_at}"></span>
      </div>

      <p>${post.text}</p>

      <button onclick="toggleReplyBox(${post.id})">Reply</button>
      <button onclick="toggleThread(${post.id})">Collapse</button>

      <div id="replyBox-${post.id}" style="display:none;">
        <textarea id="replyInput-${post.id}" placeholder="Reply..."></textarea><br>
        <button onclick="addReply(${post.id})">Submit</button>
      </div>
    `;

    div.appendChild(repliesDiv);
    parent.appendChild(div);

    post.replies.forEach(r => render(r, repliesDiv, depth + 1));
  }

  const tree = buildTree(posts);
  tree.forEach(p => render(p, container));

  updateTimestamps();
}

// =======================
// 🚀 Load + realtime sync
// =======================
async function init() {
  const { data, error } = await db
    .from("posts")
    .select("id, text, author, parent_id, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error);
    return;
  }

  renderPosts(data);

  db.channel("posts-channel")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "posts" },
      async () => {
        const { data } = await db
          .from("posts")
          .select("id, text, author, parent_id, created_at")
          .order("created_at", { ascending: true });

        renderPosts(data);
      }
    )
    .subscribe();
}

init();
