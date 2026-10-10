/*
 * Page logic: questions, email gate, generation, result, pushes.
 * Settings (WEBHOOK_URL, PROGRAM_URL, SNAPSHOT_URL) live in /config.js.
 */
(function(){
  var $ = function(id){ return document.getElementById(id); };
  var SOURCE = "minicourse-as-a-lead-magnet";
  var ENV = window.APP_ENV || {};
  var SCREENS = ["sIntro","sQuiz","sGate","sGen","sResult"];

  /* Answers and the outline live in this browser tab only, so a reload does not lose the work. */
  var S = { i:0, answers:{}, lead:null, outline:null, screen:"sIntro" };
  function save(){ try{ sessionStorage.setItem("mc_state", JSON.stringify(S)); }catch(e){} }
  function load(){
    try{
      var p = JSON.parse(sessionStorage.getItem("mc_state") || "null");
      if(p && typeof p === "object") Object.assign(S, p);
    }catch(e){}
  }

  function esc(t){ return String(t == null ? "" : t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
  function show(id, focusId){
    SCREENS.forEach(function(s){ $(s).hidden = s !== id; });
    S.screen = id; save();
    window.scrollTo(0, 0);
    if(focusId && $(focusId)) $(focusId).focus({ preventScroll:true });
  }
  function setErr(el, msg){ el.textContent = msg || ""; el.hidden = !msg; }

  function download(filename, data, type){
    var blob = data instanceof Blob ? data : new Blob([data], { type:type || "text/plain;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 4000);
  }
  function copyText(text, btn){
    function done(){
      if(!btn) return;
      var old = btn.textContent; btn.textContent = "Copied";
      setTimeout(function(){ btn.textContent = old; }, 1400);
    }
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(done, function(){ legacyCopy(text); done(); });
    } else { legacyCopy(text); done(); }
  }
  function legacyCopy(text){
    var t = document.createElement("textarea");
    t.value = text; t.style.position = "fixed"; t.style.opacity = "0";
    document.body.appendChild(t); t.select();
    try{ document.execCommand("copy"); }catch(e){}
    t.remove();
  }
  /* ---------- activity log: what this page did and when, so a problem can be traced ---------- */
  var LOG = [];
  try{ LOG = JSON.parse(sessionStorage.getItem("mc_log") || "[]") || []; }catch(e){ LOG = []; }
  function logEvent(text){
    LOG.push(new Date().toISOString().slice(11, 19) + " UTC  " + String(text).slice(0, 320));
    if(LOG.length > 200) LOG = LOG.slice(-200);
    try{ sessionStorage.setItem("mc_log", JSON.stringify(LOG)); }catch(e){}
    var box = $("logText"); if(box) box.textContent = LOG.join("\n");
  }

  /* ---------- running work: a live status line with seconds, and a warning before the tab is closed ---------- */
  var running = 0;
  window.addEventListener("beforeunload", function(ev){ if(running > 0){ ev.preventDefault(); ev.returnValue = ""; } });
  function startWork(el, text){
    var t0 = Date.now(), done = false;
    running++;
    function tick(){ var sec = Math.round((Date.now() - t0) / 1000); el.textContent = text + (sec >= 3 ? " " + sec + " seconds so far." : ""); }
    el.hidden = false; tick();
    var timer = setInterval(tick, 1000);
    return function stop(){
      if(done) return; done = true;
      running = Math.max(0, running - 1);
      clearInterval(timer); el.textContent = ""; el.hidden = true;
    };
  }

  /* ---------- one call to our own server. Always resolves, never hangs, never shows a raw error. ---------- */
  function api(path, body, timeoutMs, slowMsg){
    var ctl = new AbortController(), timedOut = false;
    var timer = setTimeout(function(){ timedOut = true; ctl.abort(); }, timeoutMs || 60000);
    return fetch(path, { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(body), signal:ctl.signal })
      .then(function(r){
        return r.json().catch(function(){ return { ok:false, error:"The server sent an answer we could not read (" + r.status + "). Try again in a minute." }; });
      }, function(){
        return { ok:false, error: timedOut
          ? (slowMsg || "This is taking longer than it should, so we stopped waiting. It may still have gone through: check there before you try again.")
          : "Could not reach the server. Check your internet connection and try again." };
      }).then(function(r){
        clearTimeout(timer);
        if(!r || typeof r !== "object") r = { ok:false, error:"The server sent an empty answer. Try again." };
        if(!r.ok && !r.error) r.error = "Something went wrong. Try again.";
        if(!r.ok && r.ref) r.error += " (ref " + r.ref + ")";
        logEvent(path + (r.ok ? " ok" + (r.ref ? " (ref " + r.ref + ")" : "") : " failed: " + r.error));
        return r;
      });
  }

  /* ---------- anything unexpected: a calm notice instead of a broken page ---------- */
  function crash(what){
    logEvent("page error: " + what);
    var c = $("crash"); if(c) c.hidden = false;
  }
  window.addEventListener("error", function(ev){
    if(ev && ev.filename && ev.filename.indexOf(location.origin) === 0) crash((ev.message || "script error") + " at " + ev.filename.replace(location.origin, "") + ":" + ev.lineno);
  });
  window.addEventListener("unhandledrejection", function(ev){
    crash(ev && ev.reason && ev.reason.message ? ev.reason.message : String(ev && ev.reason));
  });

  /* ================= questions ================= */

  function renderQuestion(){
    var q = QUESTIONS[S.i], host = $("qInput"), html = "";
    $("qBar").style.width = Math.round((S.i / QUESTIONS.length) * 100) + "%";
    $("qCount").textContent = "Question " + (S.i + 1) + " of " + QUESTIONS.length;
    $("qTitle").textContent = q.title;
    $("qWhy").textContent = q.why;
    setErr($("qErr"), "");
    if(q.type === "textarea"){
      html = '<textarea id="qField" aria-labelledby="qTitle" maxlength="1500" placeholder="' + esc(q.placeholder || "") + '">' + esc(S.answers[q.id] || "") + '</textarea>';
    } else if(q.type === "choice"){
      html = '<div class="choices" role="radiogroup" aria-labelledby="qTitle">' + q.options.map(function(o){
        return '<label class="choice"><input type="radio" name="qChoice" value="' + esc(o) + '"' + (S.answers[q.id] === o ? " checked" : "") + '><span>' + esc(o) + '</span></label>';
      }).join("") + '</div>';
    } else if(q.type === "pair"){
      html = '<div class="fields">' + [q.a, q.b].map(function(p){
        var cur = S.answers[p.id] || p.value;
        return '<div class="field"><label class="flabel" for="q_' + p.id + '">' + esc(p.label) + '</label><select id="q_' + p.id + '">' +
          p.options.map(function(o){ return '<option' + (o === cur ? " selected" : "") + '>' + esc(o) + '</option>'; }).join("") + '</select></div>';
      }).join("") + '</div>';
    }
    host.innerHTML = html;
    $("qNext").textContent = S.i === QUESTIONS.length - 1 ? "Finish" : (q.optional ? "Next (or skip)" : "Next");
    $("qBack").textContent = S.i === 0 ? "Back to start" : "Back";
  }

  function readQuestion(){
    var q = QUESTIONS[S.i];
    if(q.type === "textarea"){
      var v = $("qField").value.trim();
      if(!v && !q.optional){ $("qField").focus(); return "Write a sentence or two. Rough is fine."; }
      S.answers[q.id] = v;
    } else if(q.type === "choice"){
      var c = document.querySelector('input[name="qChoice"]:checked');
      if(!c) return "Pick the one that fits best.";
      S.answers[q.id] = c.value;
    } else if(q.type === "pair"){
      S.answers[q.a.id] = $("q_" + q.a.id).value;
      S.answers[q.b.id] = $("q_" + q.b.id).value;
    }
    return "";
  }

  $("startBtn").addEventListener("click", function(){ S.i = 0; renderQuestion(); show("sQuiz", "qTitle"); });
  $("qForm").addEventListener("submit", function(ev){
    ev.preventDefault();
    var problem = readQuestion();
    if(problem){ setErr($("qErr"), problem); return; }
    if(S.i < QUESTIONS.length - 1){ S.i++; save(); renderQuestion(); $("qTitle").focus(); window.scrollTo(0, 0); }
    else if(S.lead){ openGen(); }
    else { show("sGate", "gateTitle"); }
  });
  $("qBack").addEventListener("click", function(){
    readQuestion();
    if(S.i === 0){ show("sIntro"); return; }
    S.i--; save(); renderQuestion(); $("qTitle").focus();
  });
  /* Enter moves on from a choice screen; in a text box it stays a new line. */
  $("qInput").addEventListener("change", function(ev){ if(ev.target.name === "qChoice") setErr($("qErr"), ""); });

  /* ================= email gate ================= */

  function sendLead(payload){
    if(!WEBHOOK_URL) return;
    try{
      fetch(WEBHOOK_URL, {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body:JSON.stringify(payload), keepalive:true
      }).catch(function(){
        /* If the browser blocks the JSON request (CORS), resend as a plain form post. */
        var flat = new URLSearchParams();
        flat.append("name", payload.name);
        flat.append("email", payload.email);
        flat.append("source", payload.source);
        Object.keys(payload.answers).forEach(function(k){ flat.append(k, String(payload.answers[k])); });
        return fetch(WEBHOOK_URL, { method:"POST", mode:"no-cors", body:flat, keepalive:true });
      }).catch(function(){});
    }catch(e){}
  }

  $("gateForm").addEventListener("submit", function(ev){
    ev.preventDefault();
    var name = $("leadName").value.trim(), email = $("leadEmail").value.trim(), problem = "";
    if(!name) problem = "Enter your first name.";
    else if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) problem = "Enter a valid email address, like name@example.com.";
    if(problem){ setErr($("gateErr"), problem); (name ? $("leadEmail") : $("leadName")).focus(); return; }
    setErr($("gateErr"), "");
    S.lead = { name:name, email:email };
    sendLead({ name:name, email:email, source:SOURCE, answers:S.answers });
    openGen();
  });
  $("gateBack").addEventListener("click", function(){ S.i = QUESTIONS.length - 1; renderQuestion(); show("sQuiz", "qTitle"); });

  /* ================= generation ================= */

  var AI_MODELS = { anthropic:"claude-sonnet-5-5", openai:"gpt-4.1", gemini:"gemini-flash-latest" };

  function openGen(){
    $("promptOut").value = buildPrompt(S.answers);
    show("sGen", "genTitle");
  }
  function pickTab(key){
    $("tabPack").setAttribute("aria-selected", key ? "false" : "true");
    $("tabKey").setAttribute("aria-selected", key ? "true" : "false");
    $("panePack").hidden = key; $("paneKey").hidden = !key;
  }
  $("tabPack").addEventListener("click", function(){ pickTab(false); });
  $("tabKey").addEventListener("click", function(){ pickTab(true); });
  $("genBack").addEventListener("click", function(){ S.i = 0; renderQuestion(); show("sQuiz", "qTitle"); });
  $("copyPrompt").addEventListener("click", function(){ copyText($("promptOut").value, this); });

  function showOutline(o){
    var k = Outline.counts(o);
    S.outline = o; save();
    renderResult();
    show("sResult", "rTitle");
    logEvent("outline ready: " + k.modules + " modules, " + k.lessons + " lessons");
  }
  function acceptOutline(text){ showOutline(Outline.normalize(Outline.extractJson(text))); }
  $("usePaste").addEventListener("click", function(){
    var t = $("pasteIn").value.trim();
    if(!t){ setErr($("pasteErr"), "Paste the answer from your AI app first."); $("pasteIn").focus(); return; }
    try{ setErr($("pasteErr"), ""); acceptOutline(t); }
    catch(e){ setErr($("pasteErr"), e.message); logEvent("pasted answer not accepted: " + e.message); }
  });

  /* The AI key is kept in sessionStorage only and sent from this browser straight to the provider. */
  function loadAi(){
    var saved = {};
    try{ saved = JSON.parse(sessionStorage.getItem("mc_ai") || "{}") || {}; }catch(e){}
    /* Only Gemini is switched on for now. The other providers are listed but disabled in the page. */
    $("aiProvider").value = saved.provider || "gemini";
    if($("aiProvider").selectedIndex < 0 || $("aiProvider").selectedOptions[0].disabled){ $("aiProvider").value = "gemini"; saved.model = ""; }
    $("aiModel").value = saved.model || AI_MODELS[$("aiProvider").value];
    $("aiKey").value = saved.key || "";
  }
  function saveAi(){
    try{ sessionStorage.setItem("mc_ai", JSON.stringify({ provider:$("aiProvider").value, model:$("aiModel").value.trim(), key:$("aiKey").value.trim() })); }catch(e){}
  }
  $("aiProvider").addEventListener("change", function(){ $("aiModel").value = AI_MODELS[this.value]; });

  function aiError(provider, status, body){
    var d = body && body.error && (body.error.message || body.error) ? String(body.error.message || body.error).slice(0, 220) : "";
    if(status === 401 || status === 403) return provider + " did not accept that key. Check that you pasted all of it.";
    if(status === 404) return provider + " does not know that model name. Change the Model field and try again.";
    if(status === 429) return provider + " says this key is out of credit or over its limit. " + d;
    return provider + " returned an error (" + status + "). " + d;
  }
  function callAi(provider, key, model, prompt){
    var url, opts, name, pick;
    if(provider === "anthropic"){
      name = "Anthropic"; url = "https://api.anthropic.com/v1/messages";
      opts = { headers:{ "x-api-key":key, "anthropic-version":"2023-06-01", "anthropic-dangerous-direct-browser-access":"true", "content-type":"application/json" },
        body:{ model:model, max_tokens:16000, messages:[{ role:"user", content:prompt }] } };
      pick = function(j){ return (j.content || []).map(function(b){ return b.text || ""; }).join(""); };
    } else if(provider === "openai"){
      name = "OpenAI"; url = "https://api.openai.com/v1/chat/completions";
      opts = { headers:{ "Authorization":"Bearer " + key, "Content-Type":"application/json" },
        body:{ model:model, messages:[{ role:"user", content:prompt }], response_format:{ type:"json_object" } } };
      pick = function(j){ return j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content : ""; };
    } else {
      name = "Gemini"; url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent";
      opts = { headers:{ "x-goog-api-key":key, "Content-Type":"application/json" },
        body:{ contents:[{ parts:[{ text:prompt }] }], generationConfig:{ responseMimeType:"application/json" } } };
      pick = function(j){ var c = j.candidates && j.candidates[0]; return c && c.content && c.content.parts ? c.content.parts.map(function(p){ return p.text || ""; }).join("") : ""; };
    }
    var ctl = new AbortController(), timer = setTimeout(function(){ ctl.abort(); }, 150000);
    return fetch(url, { method:"POST", headers:opts.headers, body:JSON.stringify(opts.body), signal:ctl.signal }).then(function(r){
      return r.json().catch(function(){ return {}; }).then(function(j){
        if(!r.ok) throw new Error(aiError(name, r.status, j));
        var text = pick(j);
        if(!text) throw new Error(name + " sent back an empty answer. Try again.");
        return text;
      });
    }, function(){ throw new Error(name + " did not answer. It may be busy, or your connection dropped. Try again in a minute."); })
      .then(function(v){ clearTimeout(timer); return v; }, function(e){ clearTimeout(timer); throw e; });
  }
  /* One-click generation with the site's own AI key, which lives on the server. Shown only when it is switched on. */
  if(ENV.AI_HOSTED){
    $("hostedBox").hidden = false;
    $("genHint").textContent = "Or do it yourself. Both ways give the same result.";
  }
  $("hostedGo").addEventListener("click", function(){
    var btn = this;
    setErr($("hostedErr"), "");
    btn.disabled = true;
    var stop = startWork($("hostedStatus"), "Writing your outline. Usually under a minute, sometimes up to two. Keep this tab open.");
    logEvent("one-click generation started");
    api("/api/ai/generate", { answers:S.answers }, 175000, "The AI is taking too long right now, so we stopped waiting. Your answers are safe. Try again in a minute, or use the Prompt Pack below.").then(function(r){
      if(!r.ok) throw new Error(r.error);
      showOutline(Outline.normalize(r.outline));
    }).catch(function(e){ setErr($("hostedErr"), e.message); })
      .then(function(){ btn.disabled = false; stop(); });
  });

  $("aiGo").addEventListener("click", function(){
    var btn = this, key = $("aiKey").value.trim(), model = $("aiModel").value.trim();
    if(!key){ setErr($("aiErr"), "Paste your API key first."); $("aiKey").focus(); return; }
    if(!model){ setErr($("aiErr"), "Enter a model name."); $("aiModel").focus(); return; }
    setErr($("aiErr"), ""); saveAi();
    btn.disabled = true;
    var stop = startWork($("aiStatus"), "Writing your outline with your own key. Usually under a minute. Keep this tab open.");
    logEvent("own-key generation started: " + $("aiProvider").value + " " + model);
    callAi($("aiProvider").value, key, model, buildPrompt(S.answers)).then(function(text){
      acceptOutline(text);
    }).catch(function(e){ setErr($("aiErr"), e.message); logEvent("own-key generation failed: " + e.message); })
      .then(function(){ btn.disabled = false; stop(); });
  });

  /* ================= result ================= */

  function fileBase(){ return Outline.slug(S.outline.course.title); }

  function renderResult(){
    var o = S.outline, c = o.course, k = Outline.counts(o);
    $("rTitle").textContent = c.title;
    $("rPromise").textContent = c.bold_promise;
    $("rFacts").innerHTML = [
      ["Ideal client", c.ideal_client], ["Format", c.format], ["Who delivers", c.delivered_by],
      ["Sessions", k.lessons + " lessons in " + k.modules + " modules" + (c.sessions.duration_minutes ? ", about " + c.sessions.duration_minutes + " min each" : "")],
      ["Unique approach", c.unique_approach.name + (c.unique_approach.summary ? ": " + c.unique_approach.summary : "")],
      ["After the course", c.cta]
    ].filter(function(f){ return f[1]; }).map(function(f){ return '<div class="fact"><b>' + esc(f[0]) + '</b><span>' + esc(f[1]) + '</span></div>'; }).join("");

    $("rLessons").innerHTML = o.modules.map(function(m){
      return '<p class="mod">Module ' + m.position + ': ' + esc(m.title) + '</p>' + (m.outcome ? '<p class="hint">' + esc(m.outcome) + '</p>' : "") +
        m.lessons.map(function(l){
          return '<div class="lesson"><span class="lt">' + m.position + '.' + l.position + ' ' + esc(l.title) + '</span>' +
            (l.relevance ? '<span class="meta">' + esc(l.relevance) + '</span>' : "") +
            '<div class="tdr">' +
              '<div><b>Teach, ' + l.teach.minutes + ' min</b>' + esc(l.teach.points.join(". ")) + '</div>' +
              '<div><b>Do, ' + l["do"].minutes + ' min</b>' + esc(l["do"].exercise) + '</div>' +
              '<div><b>Review, ' + l.review.minutes + ' min</b>' + esc(l.review.check) + '</div>' +
            '</div>' +
            (l.resources.length ? '<span class="meta">Resources: ' + esc(l.resources.map(function(r){ return r.title; }).join(", ")) + '</span>' : "") +
          '</div>';
        }).join("");
    }).join("");

    var all = Outline.lessons(o);
    $("rBriefs").innerHTML = all.map(function(x, i){
      var l = x.lesson;
      return '<div class="lesson"><span class="lt">' + l.playlist_position + '. ' + esc(l.title) + '</span>' +
        '<span class="meta">Keyword: ' + esc(l.keyword) + '</span><span class="meta">Hook: ' + esc(l.hook) + '</span>' +
        '<div class="actions"><button class="inlinebtn" type="button" data-brief="' + i + '">Download this brief (.md)</button></div></div>';
    }).join("");

    $("rYt").innerHTML = all.map(function(x, i){
      var l = x.lesson;
      return '<div class="lesson"><span class="meta">Position ' + l.playlist_position + '</span>' +
        '<div class="copyblock">' + esc(l.youtube.title) + '</div>' +
        '<div class="copyblock">' + esc(l.youtube.description) + '</div>' +
        '<div class="actions"><button class="inlinebtn" type="button" data-yt-title="' + i + '">Copy title</button>' +
        '<button class="inlinebtn" type="button" data-yt-desc="' + i + '">Copy description</button></div></div>';
    }).join("");

    $("rSkool").innerHTML = o.modules.map(function(m, mi){
      return '<p class="mod">Module ' + m.position + '</p><div class="lesson"><div class="copyblock">' + esc(m.title) + '</div>' +
        '<div class="actions"><button class="inlinebtn" type="button" data-sk-mod="' + mi + '">Copy module name</button></div></div>' +
        m.lessons.map(function(l, li){
          return '<div class="lesson"><span class="lt">' + esc(l.title) + '</span>' +
            '<div class="actions"><button class="inlinebtn" type="button" data-sk-title="' + mi + '.' + li + '">Copy lesson title</button>' +
            '<button class="inlinebtn" type="button" data-sk-body="' + mi + '.' + li + '">Copy lesson content</button></div></div>';
        }).join("");
    }).join("");

    $("ytTitle").value = c.title.slice(0, 150);
    $("ytDesc").value = Outline.playlistDescription(o);
    $("programLink").href = PROGRAM_URL;
    $("snapshotPanel").hidden = true;
    $("pdfMsg").textContent = "";
    Array.prototype.forEach.call(document.querySelectorAll(".push"), function(host){ setupPush(host); });
    if(ENV.GOOGLE_CLIENT_ID) loadGoogle();
  }

  /* One listener for every copy and per-lesson download button on the result screen. */
  $("sResult").addEventListener("click", function(ev){
    var b = ev.target.closest("button"); if(!b || !S.outline) return;
    var d = b.dataset, all = Outline.lessons(S.outline), x;
    function at(key){ var p = key.split("."); return S.outline.modules[+p[0]].lessons[+p[1]]; }
    if(d.brief != null){ x = all[+d.brief]; download(fileBase() + "-brief-" + String(x.lesson.playlist_position).padStart(2, "0") + ".md", Outline.videoBriefLessonMd(S.outline, x), "text/markdown;charset=utf-8"); }
    else if(d.ytTitle != null) copyText(all[+d.ytTitle].lesson.youtube.title, b);
    else if(d.ytDesc != null) copyText(all[+d.ytDesc].lesson.youtube.description, b);
    else if(d.skMod != null) copyText(S.outline.modules[+d.skMod].title, b);
    else if(d.skTitle != null) copyText(at(d.skTitle).title, b);
    else if(d.skBody != null) copyText(Outline.lessonContentMd(at(d.skBody)), b);
  });

  /* The jump buttons under the summary open the matching platform panel and scroll to it. */
  $("jumpRow").addEventListener("click", function(ev){
    var b = ev.target.closest("button[data-jump]"); if(!b) return;
    var d = $(b.dataset.jump);
    d.open = true;
    d.scrollIntoView({ behavior:"smooth", block:"start" });
  });

  $("dlPdf").addEventListener("click", function(){
    var msg = $("pdfMsg");
    if(!window.jspdf || !window.jspdf.jsPDF){ msg.textContent = "The PDF tool did not load. Check your connection, reload the page and try again."; return; }
    msg.textContent = "Preparing your PDF.";
    loadPdfFonts().then(function(fonts){
      buildBlueprintPdf(S.outline, S.lead ? S.lead.name : "", PROGRAM_URL, fonts).save("my-course-blueprint.pdf");
      msg.textContent = "Check your downloads for the PDF.";
      logEvent("pdf downloaded");
    }).catch(function(e){
      msg.textContent = "The PDF could not be created. Your outline is safe: download it as .md instead, or reload the page and try again.";
      logEvent("pdf failed: " + (e && e.message));
    });
  });
  $("dlMd").addEventListener("click", function(){ download(fileBase() + "-blueprint.md", Outline.blueprintMd(S.outline), "text/markdown;charset=utf-8"); });
  $("dlJson").addEventListener("click", function(){ download(fileBase() + "-outline.json", JSON.stringify(S.outline, null, 2), "application/json"); });
  $("dlBriefJson").addEventListener("click", function(){ download(fileBase() + "-video-course-content-brief.json", JSON.stringify(Outline.videoBrief(S.outline), null, 2), "application/json"); });
  $("dlBriefMd").addEventListener("click", function(){ download(fileBase() + "-video-course-content-brief.md", Outline.videoBriefMd(S.outline), "text/markdown;charset=utf-8"); });
  $("dlYtCsv").addEventListener("click", function(){ download(fileBase() + "-youtube-playlist.csv", Outline.youtubeCsv(S.outline), "text/csv;charset=utf-8"); });
  $("dlSkoolCsv").addEventListener("click", function(){ download(fileBase() + "-skool.csv", Outline.skoolCsv(S.outline), "text/csv;charset=utf-8"); });
  /* Clearing the outline cannot be undone, so it takes a second click. */
  $("startOver").addEventListener("click", function(){
    var b = this;
    if(b.dataset.armed !== "1"){
      b.dataset.armed = "1"; b.textContent = "Click again to clear this outline and start over";
      setTimeout(function(){ b.dataset.armed = ""; b.textContent = "Start a new outline"; }, 6000);
      return;
    }
    b.dataset.armed = ""; b.textContent = "Start a new outline";
    S.i = 0; S.answers = {}; S.outline = null; save();
    $("pasteIn").value = "";
    logEvent("started over");
    show("sIntro");
  });

  /* ================= pushes: preview (dry run), confirm, result ================= */

  function planHtml(where, note){
    var o = S.outline, k = Outline.counts(o);
    return '<strong>Preview. Nothing has been created yet.</strong>' +
      '<span>This will create in ' + esc(where) + ':</span><ul>' +
      '<li>1 course: ' + esc(o.course.title) + '</li>' +
      '<li>' + k.modules + ' modules: ' + esc(o.modules.map(function(m){ return m.title; }).join(", ")) + '</li>' +
      '<li>' + k.lessons + ' lessons with their Teach, Do, Review content</li></ul>' +
      (note ? '<span>' + esc(note) + '</span>' : "");
  }

  var mcg = { token:"", tools:null };

  var PUSH = {
    whop: {
      previewLabel:"Check my key and preview",
      previewWait:"Checking your key with Whop. A few seconds.",
      confirmWait:"Creating the course, its chapters and lessons in Whop, one by one. This takes up to a minute. Keep this tab open until you see the result.",
      preview:function(ui){
        var key = $("whopKey").value.trim(), company = $("whopCompany").value.trim();
        if(!key) return Promise.reject(new Error("Paste your Whop API key."));
        if(!/^biz_/.test(company)) return Promise.reject(new Error("Enter your company ID. It starts with biz_ and is in your Whop dashboard address."));
        return api("/api/whop/check", { apiKey:key, companyId:company }).then(function(r){
          if(!r.ok) throw new Error(r.error);
          var list = r.experiences.filter(function(e){ return e.isCourses; });
          if(!list.length) throw new Error("Your key works, but this whop has no Courses app yet. In Whop, add the Courses app to your whop, then try again.");
          ui.preview.innerHTML = planHtml("Whop", "It is saved as hidden, so students do not see it until you publish it.") +
            '<label class="flabel" for="whopExp" style="margin:4px 0 0">Put it in</label><select id="whopExp">' +
            list.map(function(e){ return '<option value="' + esc(e.id) + '">' + esc(e.name || e.id) + '</option>'; }).join("") + '</select>';
        });
      },
      confirm:function(){
        return api("/api/whop/push", { apiKey:$("whopKey").value.trim(), experienceId:$("whopExp").value, course:Outline.pushCourse(S.outline) }, 200000).then(function(r){
          if(!r.ok && r.created && r.created.courseId) r.error += " Whop already has part of it: 1 course, " + r.created.chapters + " chapters and " + r.created.lessons + " lessons. Delete that course in Whop before you try again, or you will get a second one.";
          return r;
        });
      },
      done:function(r){ return "Done. Created in Whop: 1 course, " + r.created.chapters + " chapters and " + r.created.lessons + " lessons, saved as hidden. Nothing is running any more, you can close this page."; }
    },
    ghl: {
      previewLabel:"Preview",
      confirmWait:"Sending the course to GoHighLevel. A few seconds. Keep this tab open until you see the result.",
      preview:function(ui){
        var loc = $("ghlLocation").value.trim(), tok = $("ghlToken").value.trim();
        if(!loc) return Promise.reject(new Error("Enter your Location ID."));
        if(!tok) return Promise.reject(new Error("Paste your Private Integration Token."));
        ui.preview.innerHTML = planHtml("GoHighLevel, location " + loc, "Modules become categories and lessons become draft posts. GoHighLevel imports in the background, so lessons can take a minute to appear.");
        return Promise.resolve();
      },
      confirm:function(){
        return api("/api/ghl/push", { token:$("ghlToken").value.trim(), locationId:$("ghlLocation").value.trim(), course:Outline.pushCourse(S.outline) });
      },
      done:function(){
        if(SNAPSHOT_URL){ $("snapshotLink").href = SNAPSHOT_URL; $("snapshotPanel").hidden = false; }
        return "Done on our side. GoHighLevel accepted the course and is importing it in the background. Lessons appear there within a minute or two. You can close this page, the import finishes by itself.";
      }
    },
    mcg: {
      previewLabel:"Connect Mini Course Generator",
      previewWait:"Waiting for you to sign in in the small window. After that, Mini Course Generator checks the course. Nothing is created yet.",
      confirmWait:"Creating the course and its lessons in Mini Course Generator. This takes up to a minute. Keep this tab open until you see the result.",
      /* The sign-in window has to open inside the click, before any waiting, or the browser blocks it. */
      preview:function(ui){
        var popup = mcg.token ? null : window.open("about:blank", "mcg_oauth", "width=520,height=720");
        var p = mcg.token ? Promise.resolve() : mcgConnect(popup);
        /* A real dry run: MCG validates the whole course spec and creates nothing. */
        return p.then(function(){
          return mcgTool("module_push", { spec:Outline.mcgSpec(S.outline), dryRun:true });
        }).then(function(){
          var o = S.outline, k = Outline.counts(o);
          ui.preview.innerHTML = '<strong>Preview. Nothing has been created yet.</strong>' +
            '<span>Mini Course Generator checked the course and accepted it. This will create:</span><ul>' +
            '<li>1 course: ' + esc(o.course.title) + '</li>' +
            '<li>1 draft module with ' + k.modules + ' sections: ' + esc(o.modules.map(function(m){ return m.title; }).join(", ")) + '</li>' +
            '<li>' + k.lessons + ' lessons with their Teach, Do, Review content</li></ul>' +
            '<span>No images are generated, so it uses none of your AI credits. The module stays a draft until you publish it.</span>';
        });
      },
      confirm:function(){ return mcgCreate(); },
      done:function(r){ return (r.message || "Created in Mini Course Generator.") + " Nothing is running any more, you can close this page."; }
    },
    youtube: {
      previewLabel:"Preview",
      confirmWait:"Waiting for you in the Google window. After you allow it, the playlist is created in a few seconds.",
      preview:function(ui){
        if(!ENV.GOOGLE_CLIENT_ID) return Promise.reject(new Error("YouTube connect is not switched on for this page yet."));
        var title = $("ytTitle").value.trim();
        if(!title) return Promise.reject(new Error("Give the playlist a title."));
        ui.preview.innerHTML = '<strong>Preview. Nothing has been created yet.</strong><span>This will create on your YouTube channel:</span><ul>' +
          '<li>1 empty playlist: ' + esc(title) + '</li><li>Visibility: ' + esc($("ytPrivacy").value) + '</li></ul>' +
          '<span>Google will ask you to sign in and allow it. No videos are uploaded and nothing else is changed.</span>';
        return Promise.resolve();
      },
      confirm:function(){
        return googleToken().then(function(token){
          return api("/api/youtube/playlist", { accessToken:token, title:$("ytTitle").value.trim(), description:$("ytDesc").value, privacy:$("ytPrivacy").value }, 45000);
        });
      },
      done:function(){ return "Done. Your empty playlist is ready on your channel. Nothing is running any more, you can close this page."; }
    }
  };

  function setupPush(host){
    var name = host.dataset.platform, def = PUSH[name];
    host.innerHTML =
      '<p class="formerr" role="alert" hidden></p>' +
      '<div class="actions" data-r="start"><button class="btn" type="button" data-a="preview">' + esc(def.previewLabel) + '</button></div>' +
      '<div class="preview" hidden></div>' +
      '<div class="actions" data-r="confirm" hidden><button class="btn big" type="button" data-a="confirm">Confirm and create</button><button class="btn ghost" type="button" data-a="cancel">Cancel</button></div>' +
      '<p class="status" role="status" hidden></p>' +
      '<p class="okmsg" role="status" hidden></p>';
    var ui = {
      err:host.querySelector(".formerr"), preview:host.querySelector(".preview"), ok:host.querySelector(".okmsg"), status:host.querySelector(".status"),
      start:host.querySelector('[data-r="start"]'), confirm:host.querySelector('[data-r="confirm"]')
    };
    var busyNow = false;
    function reset(){ ui.preview.hidden = true; ui.confirm.hidden = true; ui.start.hidden = false; }
    function lock(on){
      busyNow = on;
      Array.prototype.forEach.call(host.querySelectorAll("button"), function(b){ b.disabled = on; });
    }
    function fail(e){
      setErr(ui.err, (e && e.message) || "Something went wrong. Try again.");
      ui.err.scrollIntoView({ behavior:"smooth", block:"nearest" });
    }
    /* A step can fail before it even starts, so it always runs inside a promise. */
    function run(step){ return Promise.resolve().then(step); }

    host.onclick = function(ev){
      var b = ev.target.closest("button[data-a]"); if(!b || busyNow) return;
      var a = b.dataset.a, stop;
      if(a === "cancel"){ reset(); return; }
      setErr(ui.err, ""); ui.ok.hidden = true;
      if(a === "preview"){
        lock(true);
        stop = startWork(ui.status, def.previewWait || "Checking.");
        logEvent(name + ": preview started");
        run(function(){ return def.preview(ui); }).then(function(){
          ui.preview.hidden = false; ui.confirm.hidden = false; ui.start.hidden = true;
          logEvent(name + ": preview shown, nothing created yet");
        }, function(e){ logEvent(name + ": preview failed: " + (e && e.message)); fail(e); })
          .then(function(){ stop(); lock(false); });
      } else if(a === "confirm"){
        lock(true);
        stop = startWork(ui.status, def.confirmWait || "Creating. Keep this tab open.");
        logEvent(name + ": create started");
        run(function(){ return def.confirm(); }).then(function(r){
          if(!r || !r.ok) throw new Error((r && r.error) || "Something went wrong. Try again.");
          reset();
          ui.ok.innerHTML = esc(def.done(r)) + (r.link ? ' <a href="' + esc(r.link) + '" target="_blank" rel="noopener">Open it</a>' : "");
          ui.ok.hidden = false;
          ui.ok.scrollIntoView({ behavior:"smooth", block:"nearest" });
          logEvent(name + ": created" + (r.link ? " " + r.link : ""));
        }).catch(function(e){ logEvent(name + ": create failed: " + (e && e.message)); fail(e); })
          .then(function(){ stop(); lock(false); });
      }
    };
  }

  /* ---------- MCG sign-in (OAuth with PKCE, in a popup) ---------- */

  function b64url(bytes){
    var s = ""; bytes.forEach(function(x){ s += String.fromCharCode(x); });
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function mcgConnect(popup){
    if(!popup) return Promise.reject(new Error("Your browser blocked the sign-in window. Allow pop-ups for this page and try again."));
    var redirectUri = location.origin + "/mcg-callback";
    var verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
    var state = b64url(crypto.getRandomValues(new Uint8Array(12)));
    var client;
    return api("/api/mcg/register", { redirectUri:redirectUri }).then(function(r){
      if(!r.ok) throw new Error(r.error);
      client = r;
      return crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    }).then(function(hash){
      var q = new URLSearchParams({
        response_type:"code", client_id:client.clientId, redirect_uri:redirectUri, scope:"mcp",
        state:state, code_challenge:b64url(new Uint8Array(hash)), code_challenge_method:"S256",
        resource:"https://mcp.minicoursegenerator.com/"
      });
      popup.location.href = client.authorizeUrl + "?" + q.toString();
      return new Promise(function(resolve, reject){
        var timer = setInterval(function(){ if(popup.closed){ cleanup(); reject(new Error("The sign-in window was closed before it finished. Try again.")); } }, 700);
        function cleanup(){ clearInterval(timer); window.removeEventListener("message", onMsg); }
        function onMsg(ev){
          if(ev.origin !== location.origin || !ev.data || ev.data.type !== "mcg-oauth") return;
          cleanup();
          if(ev.data.error) reject(new Error("Mini Course Generator did not connect: " + ev.data.error));
          else if(ev.data.state !== state) reject(new Error("The sign-in answer did not match. Try again."));
          else resolve(ev.data.code);
        }
        window.addEventListener("message", onMsg);
      });
    }).then(function(code){
      return api("/api/mcg/token", { code:code, redirectUri:redirectUri, clientId:client.clientId, clientSecret:client.clientSecret, codeVerifier:verifier });
    }).then(function(r){
      if(!r.ok) throw new Error(r.error);
      mcg.token = r.accessToken;
    }, function(e){ try{ popup.close(); }catch(x){} throw e; });
  }

  /* One MCG tool call through the proxy. Resolves with the tool's text and parsed data, rejects with MCG's own words. */
  function mcgTool(name, args){
    return api("/api/mcg/rpc", { accessToken:mcg.token, method:"tools/call", params:{ name:name, arguments:args } }, 150000).then(function(r){
      if(!r.ok){
        if(/sign-in has expired|did not accept/.test(r.error || "")) mcg.token = "";
        throw new Error(r.error);
      }
      var res = r.result || {};
      var text = (res.content || []).map(function(c){ return c.text || ""; }).join("\n").trim();
      if(res.isError) throw new Error("Mini Course Generator said: " + (text || "the request failed.").slice(0, 400));
      var data = res.structuredContent || null;
      if(!data){ try{ data = JSON.parse(text); }catch(e){ data = null; } }
      return { text:text, data:data };
    });
  }
  /* Finds a value in a tool answer by key name, whether it came back as JSON or as plain text. */
  function mcgPick(r, keys){
    var found = "";
    (function walk(v){
      if(found || !v || typeof v !== "object") return;
      keys.forEach(function(k){ if(!found && v[k] != null && typeof v[k] !== "object") found = String(v[k]); });
      Object.keys(v).forEach(function(k){ walk(v[k]); });
    })(r.data);
    if(found) return found;
    for(var i = 0; i < keys.length; i++){
      var m = new RegExp('"?' + keys[i] + '"?\\s*[:=]\\s*"?([^\\s",}]+)', "i").exec(r.text);
      if(m) return m[1];
    }
    return "";
  }
  /* MCG course: one course, one draft module, our modules as its sections, lessons inside. */
  function mcgCreate(){
    var o = S.outline, desc = o.course.bold_promise.slice(0, 300), course;
    return mcgTool("course_create", { name:o.course.title, description:desc }).then(function(r){
      course = { id:mcgPick(r, ["courseId", "collectionId", "id"]), link:mcgPick(r, ["previewUrl", "url"]) };
      if(!course.id) throw new Error("Mini Course Generator created the course but did not say its ID, so the lessons could not be added. It answered: " + r.text.slice(0, 300));
      return mcgTool("module_push", { spec:Outline.mcgSpec(o), courseId:course.id, description:desc });
    }).then(function(){
      return { ok:true, message:"Created in Mini Course Generator as a draft module. Publish it there when you are ready.", link:/^https?:\/\//.test(course.link) ? course.link : "" };
    }, function(e){
      if(course && course.id) throw new Error(e.message + " The empty course was created, but its lessons were not added.");
      throw e;
    });
  }

  /* ---------- Google sign-in for the one YouTube call ---------- */

  var googleReady = null;
  function loadGoogle(){
    if(googleReady) return googleReady;
    googleReady = new Promise(function(resolve, reject){
      var s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client"; s.async = true;
      s.onload = resolve; s.onerror = function(){ googleReady = null; reject(new Error("Google sign-in did not load. Check your connection and try again.")); };
      document.head.appendChild(s);
    });
    return googleReady;
  }
  function googleToken(){
    return loadGoogle().then(function(){
      return new Promise(function(resolve, reject){
        var client = google.accounts.oauth2.initTokenClient({
          client_id:ENV.GOOGLE_CLIENT_ID,
          scope:"https://www.googleapis.com/auth/youtube.force-ssl",
          callback:function(resp){
            if(resp && resp.access_token) resolve(resp.access_token);
            else if(resp && resp.error === "access_denied") reject(new Error("YouTube connect is in testing, so only approved test accounts can use it for now. Use the playlist plan above and create the playlist by hand."));
            else reject(new Error("Google did not give permission. Try again and allow the YouTube access."));
          },
          error_callback:function(err){
            if(err && err.type === "popup_failed_to_open") reject(new Error("Your browser blocked the Google window. Allow pop-ups for this page and try again."));
            else reject(new Error("The Google window was closed before it finished. If Google showed an access blocked message, this tool is in testing and only approved test accounts can connect for now."));
          }
        });
        client.requestAccessToken();
      });
    });
  }

  /* ================= start ================= */

  $("crashReload").addEventListener("click", function(){ location.reload(); });
  $("logCopy").addEventListener("click", function(){ copyText(LOG.join("\n"), this); });
  $("logText").textContent = LOG.join("\n");

  /* If saved work cannot be shown for any reason, the page still opens: on the questions, with the answers kept. */
  try{
    load();
    loadAi();
    S.i = Math.min(Math.max(0, parseInt(S.i, 10) || 0), QUESTIONS.length - 1);
    if(!S.answers || typeof S.answers !== "object") S.answers = {};
    if(S.lead && S.lead.name){ $("leadName").value = S.lead.name; $("leadEmail").value = S.lead.email || ""; } else { S.lead = null; }
    if(S.outline){ try{ S.outline = Outline.normalize(S.outline); }catch(e){ S.outline = null; logEvent("saved outline could not be read, it was dropped"); } }
    if(S.screen === "sResult" && S.outline){ renderResult(); show("sResult"); }
    else if((S.screen === "sGen" || S.screen === "sResult") && S.lead){ openGen(); }
    else if(S.screen === "sGate"){ show("sGate"); }
    else if(S.screen === "sQuiz"){ renderQuestion(); show("sQuiz"); }
    else { show("sIntro"); }
    logEvent("page opened on " + S.screen);
  }catch(e){
    logEvent("start failed: " + (e && e.message));
    S.outline = null; S.screen = "sIntro"; save();
    try{ show("sIntro"); }catch(x){}
  }
})();
