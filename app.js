// Get posts
function getPosts() {
  return JSON.parse(localStorage.getItem("posts")) || [];
}

// Save posts
function savePosts(posts) {
  localStorage.setItem("posts", JSON.stringify(posts));
}

// Persistent anonymous username
function getAnonName() {
  let name = localStorage.getItem("anonName");

  if (!name) {
    name = "Anon" + Math.floor(Math.random() * 10000);
    localStorage.setItem("anonName", name);
  }

  return name;
}

// Format timestamp
function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

// Add a new post
function addPost() {
  const input = document.getElementById("postInput");
  if (!input.value.trim()) return;

  const posts = getPosts();

  posts.push({
    id: Date.now(),
    text: input.value,
    author: getAnonName(),
    time: Date.now(),
    replies: []
  });

  savePosts(posts);
  input.value = "";
  renderPosts();
}

// Add a reply (recursive)
function addReply(postId, posts = getPosts()) {
  for (let post of posts) {
    if (post.id === postId) {
      const input = document.getElementById("replyInput-" + postId);
      if (!input.value.trim()) return;

      post.replies.push({
        id: Date.now(),
        text: input.value,
        author: getAnonName(),
        time: Date.now(),
        replies: []
      });

      savePosts(posts);
      renderPosts();
      return true;
    }

    if (addReply(postId, post.replies)) return true;
  }
  return false;
}

// Toggle reply box
function toggleReplyBox(postId) {
  const el = document.getElementById("replyBox-" + postId);
  el.style.display = el.style.display === "none" ? "block" : "none";
}

// Render posts recursively
function renderPosts() {
  const container = document.getElementById("posts");
  container.innerHTML = "";

  const posts = getPosts();

  function render(post, parent, depth = 0) {
    const div = document.createElement("div");
    div.className = depth === 0 ? "post" : "reply";

    div.innerHTML = `
      <div class="meta">
        <strong>${post.author}</strong> • ${formatTime(post.time)}
      </div>
      <p>${post.text}</p>
      <button onclick="toggleReplyBox(${post.id})">Reply</button>

      <div id="replyBox-${post.id}" style="display:none;">
        <textarea id="replyInput-${post.id}" placeholder="Reply..."></textarea><br>
        <button onclick="addReply(${post.id})">Submit</button>
      </div>
    `;

    parent.appendChild(div);

    post.replies.forEach(r => render(r, div, depth + 1));
  }

  posts.forEach(p => render(p, container));
}

// Initial load
renderPosts();
