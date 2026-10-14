import { extension_settings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const KEY = "gd_music_player";
const API = "https://music-api.gdstudio.xyz/api.php";
const defaults = { source: "netease", br: "320", proxy: false, open: false };
const st = { results: [], idx: -1, lines: [], cur: -1 };
const $id = (id) => document.getElementById(id);

function cfg() {
    extension_settings[KEY] = Object.assign({}, defaults, extension_settings[KEY]);
    return extension_settings[KEY];
}

async function call(params) {
    const c = cfg();
    const url = API + "?" + new URLSearchParams(params);
    const r = await fetch(c.proxy ? `${location.origin}/proxy/${url}` : url);
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
}

const artistOf = (t) => (Array.isArray(t.artist) ? t.artist.join(" / ") : t.artist);

async function search() {
    const name = $id("gdm-q").value.trim();
    if (!name) return;
    const list = $id("gdm-list");
    list.innerHTML = '<li>搜尋中…</li>';
    try {
        st.results = await call({ types: "search", source: cfg().source, name, count: 20 });
        list.innerHTML = "";
        if (!st.results.length) { list.innerHTML = "<li>沒有結果</li>"; return; }
        st.results.forEach((t, i) => {
            const li = document.createElement("li");
            li.textContent = t.name;
            const s = document.createElement("small");
            s.textContent = artistOf(t) + " · " + t.album;
            li.appendChild(s);
            li.onclick = () => play(i);
            list.appendChild(li);
        });
    } catch (e) {
        list.innerHTML = `<li>搜尋失敗：${e.message}。若是跨域問題，請在設定開啟「使用酒館 CORS 代理」。</li>`;
    }
}

async function play(i) {
    st.idx = i;
    const t = st.results[i], src = t.source || cfg().source;
    [...$id("gdm-list").children].forEach((li, k) => li.classList.toggle("on", k === i));
    $id("gdm-title").textContent = t.name + " — " + artistOf(t);
    $id("gdm-lyrics").innerHTML = '<div class="gdm-ln">載入中…</div>';
    try {
        const u = await call({ types: "url", source: src, id: t.id, br: cfg().br });
        if (!u.url) throw new Error("沒有可用音源");
        const au = $id("gdm-au");
        au.src = u.url;
        au.play().catch(() => {});
    } catch (e) {
        $id("gdm-lyrics").innerHTML = `<div class="gdm-ln">播放失敗：${e.message}</div>`;
        return;
    }
    try {
        const d = await call({ types: "lyric", source: src, id: t.lyric_id || t.id });
        const tr = new Map(parse(d.tlyric).map((x) => [x.t.toFixed(1), x.text]));
        st.lines = parse(d.lyric).filter((x) => x.text).map((x) => ({ ...x, tr: tr.get(x.t.toFixed(1)) || "" }));
    } catch (e) { st.lines = []; }
    renderLyrics();
}

function parse(lrc) {
    const out = [];
    (lrc || "").split(/\r?\n/).forEach((l) => {
        const text = l.replace(/\[[^\]]*\]/g, "").trim();
        for (const m of l.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)) out.push({ t: +m[1] * 60 + +m[2], text });
    });
    return out.sort((a, b) => a.t - b.t);
}

function renderLyrics() {
    const box = $id("gdm-lyrics");
    box.innerHTML = "";
    st.cur = -1;
    if (!st.lines.length) { box.innerHTML = '<div class="gdm-ln">沒有歌詞</div>'; return; }
    st.lines.forEach((l) => {
        const d = document.createElement("div");
        d.className = "gdm-ln";
        d.textContent = l.text;
        if (l.tr) { const s = document.createElement("small"); s.textContent = l.tr; d.appendChild(s); }
        d.onclick = () => { $id("gdm-au").currentTime = l.t; };
        box.appendChild(d);
    });
}

function onTime() {
    if (!st.lines.length) return;
    const t = $id("gdm-au").currentTime;
    let n = -1;
    for (let i = 0; i < st.lines.length && st.lines[i].t <= t; i++) n = i;
    if (n === st.cur) return;
    const els = $id("gdm-lyrics").children;
    if (els[st.cur]) els[st.cur].classList.remove("cur");
    st.cur = n;
    if (els[n]) {
        els[n].classList.add("cur");
        const box = $id("gdm-lyrics");
        box.scrollTop = els[n].offsetTop - box.clientHeight / 2 + els[n].clientHeight / 2;
    }
}

function togglePanel(force) {
    const p = $id("gdm-panel");
    const open = force ?? !p.classList.contains("open");
    p.classList.toggle("open", open);
    cfg().open = open;
    saveSettingsDebounced();
}

function buildUI() {
    const c = cfg();
    const fab = document.createElement("button");
    fab.id = "gdm-fab"; fab.title = "音樂播放器"; fab.textContent = "♪";
    fab.onclick = () => togglePanel();
    const panel = document.createElement("div");
    panel.id = "gdm-panel";
    panel.innerHTML = `
        <div class="gdm-row">
            <input id="gdm-q" class="text_pole" type="search" placeholder="歌名或歌手">
            <button id="gdm-go" class="menu_button">搜尋</button>
        </div>
        <ul id="gdm-list"></ul>
        <div id="gdm-title">尚未播放</div>
        <div id="gdm-lyrics"></div>
        <audio id="gdm-au" controls></audio>`;
    document.body.append(fab, panel);
    $id("gdm-go").onclick = search;
    $id("gdm-q").addEventListener("keydown", (e) => { if (e.key === "Enter") search(); });
    $id("gdm-au").addEventListener("timeupdate", onTime);
    $id("gdm-au").addEventListener("ended", () => { if (st.idx < st.results.length - 1) play(st.idx + 1); });
    if (c.open) panel.classList.add("open");
}

function buildSettings() {
    const c = cfg();
    const html = `
    <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>GD Music Player</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
            <label>音源
                <select id="gdm-set-src" class="text_pole">
                    <option value="netease">netease</option>
                    <option value="joox">joox</option>
                    <option value="bilibili">bilibili</option>
                </select>
            </label>
            <label>音質
                <select id="gdm-set-br" class="text_pole">
                    <option value="128">128</option><option value="192">192</option>
                    <option value="320">320</option><option value="740">740（無損）</option>
                </select>
            </label>
            <label class="checkbox_label">
                <input id="gdm-set-proxy" type="checkbox">
                <span>使用酒館 CORS 代理（需在 config.yaml 開啟 enableCorsProxy）</span>
            </label>
            <small>資料來源：GD音乐台（music.gdstudio.xyz），僅供個人學習，禁止商用。</small>
        </div>
    </div>`;
    $id("extensions_settings2").insertAdjacentHTML("beforeend", html);
    $id("gdm-set-src").value = c.source;
    $id("gdm-set-br").value = c.br;
    $id("gdm-set-proxy").checked = c.proxy;
    $id("gdm-set-src").onchange = (e) => { cfg().source = e.target.value; saveSettingsDebounced(); };
    $id("gdm-set-br").onchange = (e) => { cfg().br = e.target.value; saveSettingsDebounced(); };
    $id("gdm-set-proxy").onchange = (e) => { cfg().proxy = e.target.checked; saveSettingsDebounced(); };
}

jQuery(() => {
    buildUI();
    buildSettings();
});
