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
    let anonNum = localStorage.getItem("anonNum") || (Math.floor(Math.random() * 10000) + 1);
    localStorage.setItem("anonNum", anonNum);
    return `Anonymous #${anonNum}`;
}

// =======================
// ⏱️ TIME
// =======================
function timeAgo(ts) {
    const date = new Date(ts);
    const diff = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (diff < 60) return `just now`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

// =======================
// 🛡️ XSS SAFE TEXT
// =======================
function escapeHTML(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function formatText(rawText) {
    if (!rawText) return "";

    const safe = escapeHTML(rawText);

    return safe
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
        .replace(/\*(.*?)\*/g, '<i>$1</i>')
        .split("\n")
        .map(line => line.startsWith("&gt;") ? `<span class="quote">${line}</span>` : line)
        .join("<br>");
}

// =======================
// 🖼️ RENDERING
// =======================
async function render() {
    const container = document.getElementById("posts");
    const formContainer = document.getElementById("postFormContainer");
    if (!container) return;

    const myId = await getUserId();
    const isMod = officialMods.includes(myId);

    const params = new URLSearchParams(window.location.search);
    const threadId = params.get("thread");

    const visiblePosts = cachedPosts.filter(p => {
        const isBanned = shadowBannedIds.includes(p.user_id);
        return !isBanned || p.user_id === myId;
    });

    if (threadId) {
        formContainer.style.display = "none";

        container.innerHTML = `
            <a href="index.html" onclick="event.preventDefault(); switchBoard(currentBoard)">[ Back ]</a>
            <hr>
            <div id="thread-wrapper"></div>
            <div id="replies-wrapper"></div>
        `;

        const op = visiblePosts.find(p => String(p.id) === String(threadId));

        if (op) {
            renderSinglePost(op, document.getElementById("thread-wrapper"), true, isMod);

            const replyWrap = document.getElementById("replies-wrapper");

            visiblePosts
                .filter(p => String(p.parent_id) === String(threadId))
                .sort((a,b) => new Date(a.created_at) - new Date(b.created_at))
                .forEach(r => renderSinglePost(r, replyWrap, false, isMod));
        }

    } else {
        formContainer.style.display = "block";
        container.innerHTML = "";

        visiblePosts
            .filter(p => !p.parent_id)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .forEach(t => {
                const div = document.createElement("div");
                div.className = "catalog-item post";
                div.onclick = () => {
                    window.location.search = `?thread=${t.id}&board=${currentBoard}`;
                };

                div.innerHTML = `
                    <span class="subject">${t.text.substring(0, 75)}</span>
                    <div class="meta"><b>${t.author}</b> • ${timeAgo(t.created_at)}</div>
                `;

                container.appendChild(div);
            });
    }
}

// =======================
// 🧱 POST RENDER
// =======================
function renderSinglePost(post, container, isOP, isMod) {
    const div = document.createElement("div");
    div.className = isOP ? "post op" : "post reply";

    div.innerHTML = `
        <div class="post-header">
            <span class="name">${post.author}</span>
            <span class="ts">${timeAgo(post.created_at)}</span>
            <span class="num">No.${post.id}</span>
        </div>
        <div class="post-body">${formatText(post.text)}</div>
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
// ➕ ACTIONS
// =======================
async function addPost() {
    const input = document.getElementById("postInput");
    if (!input.value.trim()) return;

    await db.from("posts").insert({
        text: input.value,
        author: getAnonName(),
        board: currentBoard
    });

    input.value = "";
}

// =======================
// 🔄 BOARD
// =======================
function switchBoard(board) {
    currentBoard = board;
    window.history.pushState({}, "", `?board=${board}`);
    loadPosts();
}

// =======================
// 🚀 INIT
// =======================
(async () => {
    if (localStorage.getItem("tosAgreed") !== "true") {
        document.getElementById("tosOverlay").style.display = "flex";
    }

    await initAuth();
    await loadPosts();
})();
