// =======================
// 🔧 Supabase Setup
// =======================
const SUPABASE_URL = "https://lqisypgwjzvtxslmsuwc.supabase.co";
const SUPABASE_KEY = "sb_publishable_t0odKZzr5g98bTl1O5yuMw_R86mrL7W";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// =======================
// 👤 User ID (persistent)
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
// ⏱️ Time ago
// =======================
function timeAgo(timestamp) {
  const now = new Date();
  const past = new Date(timestamp);

  const seconds = Math.floor((now - past) / 1000);

  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds} sec ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

// =======================
// 🔼 Upvote (with protection)
// =======================
async function upvote(postId) {
  const userId = getUserId();

  // Check if already voted
  const { data: existing } = await db
    .from("votes")
    .select("*")
    .eq("post_id", postId)
    .eq("user_id", userId)
    .single();

  if (existing) return; // already voted

  // Insert vote
  await db.from("votes").insert({
    post_id: postId,
    user_id: userId
  });

  // Increment upvotes
  const { data: post } = await db
    .from("posts")
    .select("upvotes")
    .eq("id", postId)
    .single();

  await db
    .from("posts")
    .update({ upvotes: (post.upvotes || 0) + 1 })
    .eq("id", postId);
}

// =======================
// 💬 Quote system
// =======================
function quotePost(id) {
  const input = document.getElementById("postInput");
  input.value += `>>${id}\n`;
  input.focus();
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
    parent_id: null,
    upvotes: 0
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
    parent_id: postId,
    upvotes: 0
  });
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
// 🖼️ Render
// =======================
function renderPosts(posts) {
  const container = document.getElementById("posts");
  container.innerHTML = "";

  function render(post, parent) {
    const div = document.createElement("div");
    div.className = post.parent_id ? "reply" : "post";

    const quotedText = post.text.replace(
      />>(\d+)/g,
      `<span class="quote">>>$1</span>`
    );

    div.innerHTML = `
      <div class="meta">
        <strong>${post.author}</strong> • 
        <span class="timestamp" data-time="${post.created_at}"></span>
      </div>

      <p>${quotedText}</p>

      <div>
        🔼 <span>${post.upvotes || 0}</span>
        <button onclick="upvote(${post.id})">Upvote</button>
        <button onclick="quotePost(${post.id})">Quote</button>
        <button onclick="toggleReplyBox(${post.id})">Reply</button>
      </div>

      <div id="replyBox-${post.id}" style="display:none;">
        <textarea id="replyInput-${post.id}"></textarea>
        <button onclick="addReply(${post.id})">Submit</button>
      </div>

      <div id="replies-${post.id}"></div>
    `;

    parent.appendChild(div);

    post.replies.forEach(r => render(r, div));
  }

  const tree = buildTree(posts);
  tree.forEach(p => render(p, container));

  updateTimestamps();
}

// =======================
// ⏱️ Update timestamps
// =======================
function updateTimestamps() {
  document.querySelectorAll(".timestamp").forEach(el => {
    el.innerText = timeAgo(el.dataset.time);
  });
}

setInterval(updateTimestamps, 30000);

// =======================
// 🔄 Toggle reply box
// =======================
function toggleReplyBox(id) {
  const el = document.getElementById("replyBox-" + id);
  el.style.display = el.style.display === "none" ? "block" : "none";
}

// =======================
// 🚀 Load + realtime
// =======================
async function init() {
  const { data } = await db
    .from("posts")
    .select("*")
    .order("created_at", { ascending: true });

  renderPosts(data);

  db.channel("forum")
    .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, async () => {
      const { data } = await db
        .from("posts")
        .select("*")
        .order("created_at", { ascending: true });

      renderPosts(data);
    })
    .subscribe();
}

init();
