// =======================
// 🔧 CONFIG
// =======================
const SUPABASE_URL = "https://lqisypgwjzvtxslmsuwc.supabase.co";
const SUPABASE_KEY = "sb_publishable_t0odKZzr5g98bTl1O5yuMw_R86mrL7W";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// =======================
// 🧠 STATE
// =======================
let currentBoard = "general";
let cachedPosts = [];
let officialMods = [];
let shadowBannedIds = [];
let realtimeChannel = null;

// =======================
// 🔐 AUTH
// =======================
async function initAuth() {
    const { data } = await db.auth.getSession();
    if (!data.session) {
        await db.auth.signInAnonymously();
    }
}

async function getUserId() {
    const { data: { user } } = await db.auth.getUser();
    return user?.id;
}

// =======================
// 👤 ANON NAME
// =======================
function getAnonName() {
    let anonNum = localStorage.getItem("anonNum") || Math.floor(Math.random() * 10000 + 1);
    localStorage.setItem("anonNum", anonNum);
    return `Anonymous #${anonNum}`;
}

// =======================
// ⏱️ TIME
// =======================
function timeAgo(ts) {
    const date = new Date(ts);
    const diff = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));

    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

// =======================
// 🧹 FORMAT TEXT
// =======================
function formatText(rawText) {
    if (!rawText) return "";

    return rawText
        .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
        .replace(/\*(.*?)\*/g, "<i>$1</i>")
        .split("\n")
        .map(line => line.startsWith(">") ? `<span class="quote">${line}</span>` : line)
        .join("<br>");
}

// =======================
// 🖼️ RENDER
// =======================
async function render() {
    const container = document.getElementById("posts");
    const formContainer = document.getElementById("postFormContainer");
    if (!container) return;

    const myId = await getUserId();
    const isCurrentUserMod = officialMods.includes(myId);

    const params = new URLSearchParams(window.location.search);
    const threadId = params.get("thread");

    const visiblePosts = cachedPosts.filter(p => {
        const isBanned = shadowBannedIds.includes(p.user_id);
        return !isBanned || p.user_id === myId;
    });

    if (threadId) {
        formContainer.style.display = "none";

        container.innerHTML = `
            <a href="#" onclick="switchBoard(currentBoard)">[ Back ]</a>
            <hr>
            <div id="thread-wrapper"></div>
            <div id="replies-wrapper"></div>
        `;

        const op = visiblePosts.find(p => String(p.id) === String(threadId));

        if (op) {
            renderSinglePost(op, document.getElementById("thread-wrapper"), true, isCurrentUserMod);

            visiblePosts
                .filter(p => String(p.parent_id) === String(threadId))
                .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
                .forEach(r => renderSinglePost(r, document.getElementById("replies-wrapper"), false, isCurrentUserMod));
        }

    } else {
        formContainer.style.display = "block";
        container.innerHTML = "";

        visiblePosts
            .filter(p => !p.parent_id)
            .sort((a, b) => {
                if (a.is_pinned === b.is_pinned) {
                    return new Date(b.created_at) - new Date(a.created_at);
                }
                return a.is_pinned ? -1 : 1;
            })
            .forEach(t => {
                const div = document.createElement("div");
                div.className = `catalog-item post ${t.is_pinned ? "pinned-thread" : ""}`;

                div.onclick = () => {
                    window.location.search = `?thread=${t.id}&board=${currentBoard}`;
                };

                div.innerHTML = `
                    <span class="subject">
                        ${t.is_pinned ? "📌 " : ""}${t.text.substring(0, 75)}
                    </span>
                    <div class="meta">
                        <b>${t.author}</b> • ${timeAgo(t.created_at)}
                    </div>
                `;

                container.appendChild(div);
            });
    }
}

// =======================
// 🧱 POST RENDER
// =======================
function renderSinglePost(post, container, isOP, isCurrentUserMod) {
    const div = document.createElement("div");
    div.className = isOP ? "post op" : "post reply";

    const isMod = officialMods.includes(post.user_id);

    div.innerHTML = `
        <div class="post-header">
            <span class="name">${post.author}</span>
            ${isMod ? '<span class="modTag"># MOD</span>' : ""}
            <span class="ts">${timeAgo(post.created_at)}</span>
            <span class="num">No.${post.id}</span>

            ${isOP ? `<button onclick="toggleReplyBox(${post.id})">Reply</button>` : ""}

            ${isCurrentUserMod ? `
                <button onclick="event.stopPropagation(); togglePin(${post.id}, ${post.is_pinned})">
                    ${post.is_pinned ? "[Unpin]" : "[Pin]"}
                </button>
                <button onclick="event.stopPropagation(); banUser('${post.user_id}')">
                    [X]
                </button>
            ` : ""}
        </div>

        <div class="post-body">
            ${formatText(post.text)}
        </div>

        <div id="replyBox-${post.id}" style="display:none;">
            <textarea id="replyInput-${post.id}"></textarea><br>
            <button onclick="addReply(${post.id})">Submit</button>
        </div>
    `;

    container.appendChild(div);
}

// =======================
// 📡 DATA
// =======================
async function loadPosts() {
    const { data: mods } = await db.from("moderators").select("user_id");
    officialMods = (mods || []).map(m => m.user_id);

    const { data: bans } = await db.from("shadow_bans").select("user_id");
    shadowBannedIds = (bans || []).map(b => b.user_id);

    const { data: posts } = await db.from("posts").select("*").eq("board", currentBoard);
    cachedPosts = posts || [];

    render();
}

// =======================
// 🔄 REALTIME
// =======================
function initRealtime() {
    if (realtimeChannel) db.removeChannel(realtimeChannel);

    realtimeChannel = db.channel("public:posts")
        .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, loadPosts)
        .subscribe();
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
        user_id: await getUserId(),
        board: currentBoard
    });

    input.value = "";
}

async function addReply(parentId) {
    const input = document.getElementById("replyInput-" + parentId);
    if (!input.value.trim()) return;

    await db.from("posts").insert({
        text: input.value,
        author: getAnonName(),
        user_id: await getUserId(),
        parent_id: parentId,
        board: currentBoard
    });

    input.value = "";
    toggleReplyBox(parentId);
}

async function togglePin(postId, currentState) {
    await db.from("posts").update({ is_pinned: !currentState }).eq("id", postId);
}

async function banUser(targetId) {
    if (!confirm("Shadow ban this ID?")) return;

    await db.from("shadow_bans").insert({
        user_id: targetId
    });

    loadPosts();
}

// =======================
// 🧭 NAV
// =======================
function switchBoard(board) {
    currentBoard = board;
    window.history.pushState({}, "", `?board=${board}`);
    loadPosts();
}

function toggleReplyBox(id) {
    const el = document.getElementById("replyBox-" + id);
    if (el) el.style.display = el.style.display === "none" ? "block" : "none";
}

// =======================
// 🧾 TOS
// =======================
function acceptTOS() {
    localStorage.setItem("tosAgreed", "true");
    document.getElementById("tosOverlay").style.display = "none";
}

// =======================
// GLOBALS
// =======================
window.addPost = addPost;
window.addReply = addReply;
window.switchBoard = switchBoard;
window.toggleReplyBox = toggleReplyBox;
window.banUser = banUser;
window.togglePin = togglePin;
window.acceptTOS = acceptTOS;

// =======================
// INIT
// =======================
(async () => {
    if (localStorage.getItem("tosAgreed") !== "true") {
        document.getElementById("tosOverlay").style.display = "flex";
    }

    await initAuth();
    await loadPosts();
    initRealtime();
})();
