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
  function api(path, body){
    return fetch(path, { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(body) })
      .then(function(r){ return r.json().catch(function(){ return { ok:false, error:"The server sent an answer we could not read. Try again." }; }); },
            function(){ return { ok:false, error:"Could not reach the server. Check your connection and try again." }; });
  }

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

  function acceptOutline(text){
    var o = Outline.normalize(Outline.extractJson(text));
    S.outline = o; save();
    renderResult();
    show("sResult", "rTitle");
  }
  $("usePaste").addEventListener("click", function(){
    var t = $("pasteIn").value.trim();
    if(!t){ setErr($("pasteErr"), "Paste the answer from your AI app first."); $("pasteIn").focus(); return; }
    try{ setErr($("pasteErr"), ""); acceptOutline(t); }
    catch(e){ setErr($("pasteErr"), e.message); }
  });

  /* The AI key is kept in sessionStorage only and sent from this browser straight to the provider. */
  function loadAi(){
    var saved = {};
    try{ saved = JSON.parse(sessionStorage.getItem("mc_ai") || "{}") || {}; }catch(e){}
    $("aiProvider").value = saved.provider || "anthropic";
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
    return fetch(url, { method:"POST", headers:opts.headers, body:JSON.stringify(opts.body) }).then(function(r){
      return r.json().catch(function(){ return {}; }).then(function(j){
        if(!r.ok) throw new Error(aiError(name, r.status, j));
        var text = pick(j);
        if(!text) throw new Error(name + " sent back an empty answer. Try again.");
        return text;
      });
    }, function(){ throw new Error("Could not reach " + name + ". Check your connection and try again."); });
  }
  $("aiGo").addEventListener("click", function(){
    var btn = this, key = $("aiKey").value.trim(), model = $("aiModel").value.trim();
    if(!key){ setErr($("aiErr"), "Paste your API key first."); $("aiKey").focus(); return; }
    if(!model){ setErr($("aiErr"), "Enter a model name."); $("aiModel").focus(); return; }
    setErr($("aiErr"), ""); saveAi();
    btn.disabled = true; $("aiStatus").textContent = "Writing your outline. This can take up to a minute.";
    callAi($("aiProvider").value, key, model, buildPrompt(S.answers)).then(function(text){
      acceptOutline(text);
    }).catch(function(e){ setErr($("aiErr"), e.message); })
      .then(function(){ btn.disabled = false; $("aiStatus").textContent = ""; });
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
    try{
      buildBlueprintPdf(S.outline, S.lead ? S.lead.name : "", PROGRAM_URL).save("my-course-blueprint.pdf");
      msg.textContent = "Check your downloads for the PDF.";
    }catch(e){ msg.textContent = "The PDF could not be created. Reload the page and try again."; }
  });
  $("dlMd").addEventListener("click", function(){ download(fileBase() + "-blueprint.md", Outline.blueprintMd(S.outline), "text/markdown;charset=utf-8"); });
  $("dlJson").addEventListener("click", function(){ download(fileBase() + "-outline.json", JSON.stringify(S.outline, null, 2), "application/json"); });
  $("dlBriefJson").addEventListener("click", function(){ download(fileBase() + "-video-course-content-brief.json", JSON.stringify(Outline.videoBrief(S.outline), null, 2), "application/json"); });
  $("dlBriefMd").addEventListener("click", function(){ download(fileBase() + "-video-course-content-brief.md", Outline.videoBriefMd(S.outline), "text/markdown;charset=utf-8"); });
  $("dlYtCsv").addEventListener("click", function(){ download(fileBase() + "-youtube-playlist.csv", Outline.youtubeCsv(S.outline), "text/csv;charset=utf-8"); });
  $("dlSkoolCsv").addEventListener("click", function(){ download(fileBase() + "-skool.csv", Outline.skoolCsv(S.outline), "text/csv;charset=utf-8"); });
  $("startOver").addEventListener("click", function(){
    S.i = 0; S.answers = {}; S.outline = null; save();
    $("pasteIn").value = "";
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
        return api("/api/whop/push", { apiKey:$("whopKey").value.trim(), experienceId:$("whopExp").value, course:Outline.pushCourse(S.outline) });
      },
      done:function(r){ return "Created in Whop: " + r.created.chapters + " chapters and " + r.created.lessons + " lessons."; }
    },
    ghl: {
      previewLabel:"Preview",
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
        return "Import started in GoHighLevel. Lessons appear within a minute or two.";
      }
    },
    mcg: {
      previewLabel:"Connect Mini Course Generator",
      /* The sign-in window has to open inside the click, before any waiting, or the browser blocks it. */
      preview:function(ui){
        var popup = mcg.token ? null : window.open("about:blank", "mcg_oauth", "width=520,height=720");
        var p = mcg.token ? Promise.resolve() : mcgConnect(popup);
        return p.then(function(){ return api("/api/mcg/rpc", { accessToken:mcg.token, method:"tools/list" }); }).then(function(r){
          if(!r.ok) throw new Error(r.error);
          mcg.tools = (r.result && r.result.tools) || [];
          ui.preview.innerHTML = planHtml("Mini Course Generator") +
            '<details><summary>Connection details <span class="chev">+</span></summary><div class="body"><div class="copyblock" id="mcgTools">' +
            esc(JSON.stringify(mcg.tools.map(function(t){ return { name:t.name, description:t.description, input:t.inputSchema }; }), null, 2)) + '</div>' +
            '<div class="actions"><button class="inlinebtn" type="button" id="mcgCopyTools">Copy details</button></div></div></details>';
          $("mcgCopyTools").addEventListener("click", function(){ copyText($("mcgTools").textContent, this); });
        });
      },
      confirm:function(){ return mcgCreate(); },
      done:function(r){ return r.message || "Created in Mini Course Generator."; }
    },
    youtube: {
      previewLabel:"Preview",
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
          return api("/api/youtube/playlist", { accessToken:token, title:$("ytTitle").value.trim(), description:$("ytDesc").value, privacy:$("ytPrivacy").value });
        });
      },
      done:function(){ return "Your playlist is ready."; }
    }
  };

  function setupPush(host){
    var def = PUSH[host.dataset.platform];
    host.innerHTML =
      '<p class="formerr" role="alert" hidden></p>' +
      '<div class="actions" data-r="start"><button class="btn" type="button" data-a="preview">' + esc(def.previewLabel) + '</button></div>' +
      '<div class="preview" hidden></div>' +
      '<div class="actions" data-r="confirm" hidden><button class="btn big" type="button" data-a="confirm">Confirm and create</button><button class="btn ghost" type="button" data-a="cancel">Cancel</button></div>' +
      '<p class="okmsg" role="status" hidden></p>';
    var ui = {
      err:host.querySelector(".formerr"), preview:host.querySelector(".preview"), ok:host.querySelector(".okmsg"),
      start:host.querySelector('[data-r="start"]'), confirm:host.querySelector('[data-r="confirm"]')
    };
    function reset(){ ui.preview.hidden = true; ui.confirm.hidden = true; ui.start.hidden = false; }
    function busy(btn, on, label){ btn.disabled = on; if(on){ btn.dataset.label = btn.textContent; btn.textContent = label; } else if(btn.dataset.label){ btn.textContent = btn.dataset.label; } }

    host.onclick = function(ev){
      var b = ev.target.closest("button[data-a]"); if(!b) return;
      var a = b.dataset.a;
      if(a === "cancel"){ reset(); return; }
      setErr(ui.err, ""); ui.ok.hidden = true;
      if(a === "preview"){
        busy(b, true, "Checking");
        def.preview(ui).then(function(){
          ui.preview.hidden = false; ui.confirm.hidden = false; ui.start.hidden = true;
        }, function(e){ setErr(ui.err, e.message); }).then(function(){ busy(b, false); });
      } else if(a === "confirm"){
        busy(b, true, "Creating");
        def.confirm().then(function(r){
          if(!r.ok) throw new Error(r.error);
          reset();
          ui.ok.innerHTML = esc(def.done(r)) + (r.link ? ' <a href="' + esc(r.link) + '" target="_blank" rel="noopener">Open it</a>' : "");
          ui.ok.hidden = false;
        }).catch(function(e){ setErr(ui.err, e.message); }).then(function(){ busy(b, false); });
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

  /* Filled in once the MCG tool list is verified against a real account. */
  function mcgCreate(){
    return Promise.resolve({ ok:false, error:"Direct create for Mini Course Generator is not finished yet. Copy the connection details above and send them to the builder." });
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

  load();
  loadAi();
  if(S.lead){ $("leadName").value = S.lead.name; $("leadEmail").value = S.lead.email; }
  if(S.screen === "sResult" && S.outline){ renderResult(); show("sResult"); }
  else if(S.screen === "sGen" && S.lead){ openGen(); }
  else if(S.screen === "sGate"){ show("sGate"); }
  else if(S.screen === "sQuiz"){ renderQuestion(); show("sQuiz"); }
  else { show("sIntro"); }
})();
