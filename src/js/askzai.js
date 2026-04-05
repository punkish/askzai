// askzai.js
import { Router, reroute } from './router.js';
import { $, $$, toggleVisibility } from './utils.js';
import { populateExampleDropdown } from './exampleQueries.js';

// ─────────────────────────────────────────────────────────────────────────────
// StatusQueue
//
// A small FIFO queue that drains one status message every `interval` ms,
// regardless of how quickly the server sends them.
//
// Why client-side rather than server-side:
//   The server should send events as fast as it genuinely can — adding
//   artificial sleeps there would delay real work (vector search, etc.) and
//   make cache-miss latency worse.  The browser is the right place to pace
//   purely visual updates that have no effect on correctness.
//
// How it works:
//   - Status events are pushed into a queue instead of being painted directly.
//   - A setInterval drains one message per tick.
//   - Token and done/error events bypass the queue entirely — tokens must
//     appear immediately, and "done" must fire only after the queue is empty
//     so treatments/images/debug render after the last status message.
//   - When "done" arrives, the queue is flushed at the same pace and the
//     done callback fires after the last status message clears.
// ─────────────────────────────────────────────────────────────────────────────
class StatusQueue {
    constructor(el, answerEl, interval = 600) {
        this._el          = el;
        this._answerEl    = answerEl;  // where tokens go
        this._interval    = interval;
        this._queue       = [];
        this._timer       = null;
        this._onEmpty     = null;
        this._steps       = new Map();

        // Tokens that arrived before status finished draining are held here.
        // Once the status queue empties they are flushed in order, then
        // subsequent tokens go straight to the DOM.
        this._tokenBuffer  = [];
        this._statusDone   = false;    // true once the queue has fully drained
    }

    get text() {
        return this._el.textContent;
    }

    push({ step, message }) {

        // The separator for the first item in the status div is ''
        let separator = '';

        // Every subsequent item has a separator depending on whether the item 
        // is repeating or is new
        if (this._steps.size) {
            separator = this._steps.has(step) ? '… ': ' → ';
        }

        this._steps.set(step, (this._steps.get(step) ?? 0) + 1);
        this._queue.push({ step, message, separator });
        this._startDrain();
    }

    // Called for every incoming token delta.
    // If status is still draining, buffer it; otherwise write immediately.
    pushToken(delta) {
        if (!this._statusDone) {
            this._tokenBuffer.push(delta);
        }
        else {
            this._writeToken(delta);
        }
    }

    onEmpty(callback) {
        this._onEmpty = callback;

        if (this._queue.length === 0 && !this._timer) {
            setTimeout(callback, 0);
            this._onEmpty = null;
        }
    }

    destroy() {
        this._stopDrain();
        this._queue       = [];
        this._tokenBuffer = [];
        this._steps       = new Map();
        this._onEmpty     = null;
    }

    _writeToken(delta) {
        this._answerEl.appendChild(document.createTextNode(delta));
        this._answerEl.scrollIntoView({ block: 'end', behavior: 'smooth' });
    }

    _flushTokenBuffer() {

        for (const delta of this._tokenBuffer) {
            this._writeToken(delta);
        }

        this._tokenBuffer = [];
    }

    _startDrain() {
        if (this._timer) return;
        this._timer = setInterval(() => this._tick(), this._interval);
    }

    _stopDrain() {

        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }

    }

    _tick() {

        if (this._queue.length > 0) {
            const { message, separator } = this._queue.shift();

            // Append to whatever is already displayed rather than replacing it.
            this._el.textContent += separator + message;
        }
        else {
            this._stopDrain();
            this._statusDone = true;

            // Flush any tokens that arrived while status was still draining.
            this._flushTokenBuffer();

            if (this._onEmpty) {
                const cb = this._onEmpty;
                this._onEmpty = null;
                cb();
            }
        }

    }
}

class StatusQueueOld {
    constructor(el, interval = 600) {
        this._el       = el;
        this._interval = interval;
        this._queue    = [];
        this._timer    = null;
        this._onEmpty  = null;
        this._steps    = new Map(); // track which steps have been seen
    }

    // Expose current text so callers can read it if needed,
    // though with the append model below they rarely need to.
    get text() {
        return this._el.textContent;
    }

    push({ step, message }) {

        // Build the appended label before queuing it.
        // First occurrence of a step: append "message… "
        // Repeat of the same step (e.g. a count update): append "→ message"
        const separator = this._steps.has(step) ? ' → ' : '… ';
        this._steps.set(step, (this._steps.get(step) ?? 0) + 1);

        //message = message ? message + separator : separator;
        this._queue.push({ step, message, separator });
        this._startDrain();
    }

    onEmpty(callback) {
        this._onEmpty = callback;

        if (this._queue.length === 0 && !this._timer) {
            setTimeout(callback, 0);
            this._onEmpty = null;
        }

    }

    destroy() {
        this._stopDrain();
        this._queue   = [];
        this._steps   = new Map();
        this._onEmpty = null;
    }

    _startDrain() {
        if (this._timer) return;
        this._timer = setInterval(() => this._tick(), this._interval);
    }

    _stopDrain() {

        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }

    }

    _tick() {

        if (this._queue.length > 0) {
            const { message, separator } = this._queue.shift();

            // Append to whatever is already displayed rather than replacing it.
            this._el.textContent += message + separator;
        }
        else {
            this._stopDrain();
            if (this._onEmpty) {
                const cb = this._onEmpty;
                this._onEmpty = null;
                cb();
            }
        }

    }
}

function init() {
    const md = new showdown.Converter({
        tables: true,
        simpleLineBreaks: true
    });

    const ui = {};
    let suggestions = [];
    let highlighted = -1;
    let selected = false;
    let aborter = null;
    let cache = new Map();

    function initializeUi() {
        ui.form = $('form');
        ui.input = $('#queryInput');
        ui.openEnded = $('#openEnded');
        ui.describeTag = $('#describeTag');
        ui.suggestions = $('#suggestions');
        ui.response = $('#response');
        ui.reset = $('#resetBtn');
        ui.refreshCache = $('#refreshCache');
        ui.refreshCacheMsg = $('#refreshCacheMsg')
        ui.input.setAttribute('role','combobox');
        ui.input.setAttribute('aria-autocomplete','list');
        ui.submitBtn = $('#submitBtn');
        ui.suggestions.setAttribute('role','listbox');
        ui.hint = $('#hint');
        ui.showExamples = $('#hint a');
        ui.exampleQueries = $('#example-queries');
        ui.response = $('#response');

        // EVENTS
        ui.input.addEventListener('input', debounce(handleAutocomplete, 250));
        ui.input.addEventListener('keydown', handleKeyNav);
        ui.form.addEventListener('submit', handleSubmit);
        ui.reset.addEventListener('click', resetUI);
        ui.openEnded.addEventListener('click', toggleOpenEnded);
        // ui.refreshCache.addEventListener('change', () => {
        //     ui.refreshCacheMsg.classList.toggle('invisible', !ui.refreshCache.checked);
        // });
        ui.showExamples.addEventListener('click', (e) => {
            e.preventDefault();
            ui.response.classList.toggle('dimmed');
            ui.hint.classList.toggle('open');
            toggleVisibility(ui.exampleQueries);
        });

        document.addEventListener('click', e => {

            if(!ui.suggestions.contains(e.target) && e.target!==ui.input) {
                hideSuggestions();
            }

        });
    }

    function activateExampleQueries() {
        ui.examplesList = $$('#dropdown li');

            // if an example query is selected from the list
        ui.examplesList.forEach((item) => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                let query = e.target.tagName === 'SPAN'
                    ? e.target.parentNode.innerText
                    : e.target.innerText;
                query = query.trim();

                if (isDescribeQuery(query)) {
                    deActivateOpenEnded(query);
                }
                else {
                    activateOpenEnded(query);
                }
                
                ui.response.classList.toggle('dimmed');
                ui.hint.classList.toggle('open');
                toggleVisibility($("#example-queries"));
                executeQuery(query);
            });
        });
    }

    function isDescribeQuery(query){
        return query.toLowerCase().includes('describe');
    }

    function initializeRoutes() {

        // Initialize the router
        const routes = Array.from($$('.route')).map(link => { 
            return {
                link, 
                path: link.getAttribute('href'),
                component: () => reroute(
                    link.getAttribute('href')
                        .replace('/', '')
                        .replace('.html', '')
                )
            }
        });

        const router = new Router(routes);
        router.listen();
    }

    /** 
     * adjust the server urls based on where the app is running
     */
    function tweakUrl(loc) {
        if (!window.Zai) {
            window.Zai = {};
        }
        
        // default URIs on localhost
        Zai.uris = {
            zenodo: 'https://zenodo.org',
            zenodeo: 'http://localhost:3010',
            tb: 'https://tb.plazi.org/GgServer/html'
        };

        if (loc.includes('askzai.net')) {
            Zai.uris.zenodeo = 'https://test.zenodeo.org';
        }
        else if (loc.includes('lucknow.local')) {
            Zai.uris.zenodeo = 'http://lucknow.local:3010';
        }

        Zai.bodyWidth = $('body').clientWidth - 40;
        Zai.isWideScreen = Zai.bodyWidth > 550;
    }

    function deActivateOpenEnded(query) {
        ui.describeTag.classList.remove('hidden');
        ui.input.classList.add('queryInput-describeTag');
        ui.input.classList.remove('queryInput');

        if (query) {
            const queryArr = query.split(/ /);
            ui.input.value = `${queryArr[1]} ${queryArr[2]}`;
        }
        
    }

    function activateOpenEnded(query) {
        ui.openEnded.checked = true;
        ui.describeTag.classList.add('hidden');
        ui.input.classList.remove('queryInput-describeTag');
        ui.input.classList.add('queryInput');

        if (query) {
            ui.input.value = query;
        }
        
    }

    function toggleOpenEnded() {
        if (ui.openEnded.checked) {
            activateOpenEnded();
            ui.input.placeholder = "ask me anything…";
        }

        // default is not checked
        else {
            deActivateOpenEnded();
            ui.input.placeholder = "binomen…";
        }
        
    }

    // AUTOCOMPLETE
    async function handleAutocomplete() {

        if(ui.openEnded.checked) { 
            hideSuggestions(); 
            return; 
        }

        const q = ui.input.value.trim();
        selected = false;
        highlighted = -1;

        if(q.length<3) { 
            hideSuggestions(); 
            return; 
        }

        if(cache.has(q)) { 
            suggestions = cache.get(q); 
            renderSuggestions(); 
            return; 
        }

        if(aborter) aborter.abort();

        aborter = new AbortController();
        const fetchOpts = { signal: aborter.signal };
        const encBinomen = encodeURIComponent(q);
        const url = `${Zai.uris.zenodeo}/v3/binomens?binomen=${encBinomen}`;

        try {
            const res = await fetch(url, fetchOpts);
            const json = await res.json();
            suggestions = json.response.records.map(r => r.binomen);
            cache.set(q, suggestions);
            renderSuggestions();
        } 
        catch(e) {
            if(e.name!=='AbortError') console.error(e);
        }
    }

    function renderSuggestions() {
        ui.suggestions.innerHTML = '';

        if(!suggestions.length) { 
            hideSuggestions(); 
            return; 
        }

        suggestions.forEach((s,i)=>{
            const li = document.createElement('li');
            li.textContent = s;
            li.setAttribute('role','option');
            li.addEventListener('mousedown',()=>chooseSuggestion(i));
            ui.suggestions.appendChild(li);
        });

        ui.suggestions.style.display = 'block';
    }

    function hideSuggestions() {
        ui.suggestions.style.display='none';
        ui.suggestions.innerHTML='';
    }

    function handleKeyNav(e) {

        // Only active when 'describe' is active,
        // that, openEnded is not checked
        if (ui.openEnded.checked) {
            //console.log('openEnded is checked, so not doing anything');
            return;
        }

        const items = $$('li', ui.suggestions);
        
        if (!items.length) {
            //console.log('There are no suggestions, so not doing anything');
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            highlighted = (highlighted + 1) % items.length;
            scrollHighlightIntoView(items);
        }

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            highlighted = (highlighted - 1 + items.length) % items.length;
            scrollHighlightIntoView(items);
        }

        if (e.key === 'Escape') {
            hideSuggestions();
        }

        if (e.key === 'Enter' && highlighted >= 0) {
            e.preventDefault();
            chooseSuggestion(highlighted);
        }
    }

    /**
     * Scrolls the currently highlighted item into view inside ul.suggestions
     * @param {HTMLElement[]} items - list of li elements
     */
    function scrollHighlightIntoView(items) {
        items.forEach((item, idx) => {
            item.classList.toggle('highlight', idx === highlighted);
        });

        const selected = items[highlighted];

        if (selected) {
            selected.scrollIntoView({
                block: 'nearest',
                inline: 'nearest'
            });
        }
    }

    function chooseSuggestion(i){
        ui.input.value = suggestions[i];
        selected = true;
        hideSuggestions();
    }

    function handleSubmit(e){
        e.preventDefault();
        const query = ui.input.value.trim();

        if(!query) {
            const tmp = ui.input.placeholder;
            ui.input.placeholder = "c'mon, ask me something!";
            setTimeout(() => ui.input.placeholder = tmp, 1000)
            return;
        }
        else {

            if(!ui.openEnded.checked && !selected) {
                return;
            }
            else {
                executeQuery(query);
            }

        }

    }

    // ─────────────────────────────────────────────────────────────────────────
    // renderStreamingResponse
    //
    // status events are fed through a StatusQueue instead of being
    // painted immediately.
    //
    // The "done" handler now asks the queue to call its finalisation logic via
    // onEmpty(), so images/treatments/debug only render after the last status
    // message has been displayed — preventing the answer and citations from
    // popping in while the status bar is still mid-sequence.
    // ─────────────────────────────────────────────────────────────────────────
    async function renderStreamingResponse(res) {
        ui.response.innerHTML = '';

        // ── Status bar ───────────────────────────────────────────────────────
        // A small line above the answer that shows which pipeline step is 
        // running. Optionally, hidden once the "done" event arrives.
        const statusEl = document.createElement('p');
        statusEl.className = 'zai-status';
        ui.response.appendChild(statusEl);

        // ── Answer container ─────────────────────────────────────────────────
        // Tokens are appended here as plain text while streaming.
        // After the stream ends, innerHTML is replaced with the markdown 
        // render.
        const answerEl = document.createElement('div');
        ui.response.appendChild(answerEl);

        scrollToResults();

        // One queue per response — destroyed when the stream closes.
        // 600 ms between status messages gives a comfortable visual pace.
        // Adjust the third argument to taste.
        const statusQueue = new StatusQueue(statusEl, answerEl, 800);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        // Accumulate fields for the current SSE frame.
        let currentEvent = '';
        let currentData  = '';

        // Accumulate raw token text for the final markdown render.
        let rawAnswer = '';

        outer: while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Process every complete line in the buffer.
            // Lines are separated by \n; keep any trailing incomplete line.
            const lines = buffer.split('\n');

            // last element may be incomplete — hold it over
            buffer = lines.pop();

            for (const line of lines) {

                if (line.startsWith('event:')) {
                    currentEvent = line.slice(6).trim();
                }
                else if (line.startsWith('data:')) {
                    currentData = line.slice(5).trim();
                }
                else if (line === '') {

                    // Blank line → frame is complete, dispatch it.
                    if (currentEvent && currentData) {
                        const shouldStop = handleSSEFrame(
                            currentEvent,
                            currentData,

                            // pass the queue, not the element
                            statusQueue,
                            answerEl,
                            (delta) => { rawAnswer += delta; }
                        );

                        if (shouldStop) break outer;
                    }

                    // Reset for the next frame.
                    currentEvent = '';
                    currentData  = '';
                }
            }
        }

        // Flush any bytes the TextDecoder held back.
        buffer += decoder.decode();
        statusQueue.destroy();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // handleSSEFrame
    //
    //   - Accepts `statusQueue` (a StatusQueue instance) instead of `statusEl`.
    //   - status case: calls statusQueue.push() instead of setting textContent.
    //   - done case: defers finalisation via statusQueue.onEmpty() so the last
    //     status message is visible before the answer/images/treatments paint.
    //     Returns false (not true) so the outer reader loop can continue until
    //     the stream actually closes — the queue's onEmpty callback handles teardown.
    //
    // token and error cases are unchanged.
    //
    // @param {string}   eventType - the SSE event name
    // @param {string}   rawData   - the unparsed JSON data string
    // @param {Element}  statusEl  - the status <p> element
    // @param {Element}  answerEl  - the answer <div> element
    // @param {Function} onToken   - called with each token delta string
    // @returns {boolean}
    // ─────────────────────────────────────────────────────────────────────────

    function handleSSEFrame(eventType, rawData, statusQueue, answerEl, onToken) {
        let payload;

        try {
            payload = JSON.parse(rawData);
        }
        catch {

            // Malformed frame — skip silently.
            return false;
        }

        switch (eventType) {

            case 'status': {

                // Show which pipeline step is currently running.
                // Pass message and step so the queue can decide the separator.
                statusQueue.push(payload);
                break;
            }

            case 'token': {

                // Append the raw token text to the answer element.
                // Using textContent += would escape HTML entities; using a 
                // text node is equivalent and avoids any accidental HTML 
                // injection from the LLM.
                //
                // We intentionally do NOT render markdown yet — partial 
                // markdown is not valid and would cause the rendered output 
                // to flicker.
                statusQueue.pushToken(payload.delta ?? '');
                onToken(payload.delta ?? '');

                // Keep the answer scrolled into view as tokens arrive.
                //answerEl.scrollIntoView({ block: 'end', behavior: 'smooth' });
                break;
            }

            case 'done': {

                // Don't paint immediately.  Register a callback on the
                // queue; it fires after the last status message has been 
                // displayed.

                // Stream is complete.  
                // payload = { answer, model, treatments, debugInfo }

                // Uncomment the following line to optionally, hide the status 
                // bar — the pipeline is done.
                //statusEl.remove();

                // Replace the raw streamed text with the proper markdown 
                // render. `payload.answer` is the server-assembled string with 
                // <think> blocks already stripped; prefer it over the 
                // client-accumulated rawAnswer.
                statusQueue.onEmpty(() => {
                    // Optionally, remove the status bar by uncommenting the 
                    // following two lines
                    // const statusEl = statusQueue._el;
                    // statusEl.remove();

                    // Swap raw streamed text for the markdown render.
                    const answer = payload.answer || '';
                    const renderedHtml = md.makeHtml(answer);
                    let msg = renderedHtml;

                    if (ui.openEnded.checked && payload.query) {
                        msg = `<p>A vector search for <em>${payload.query}</em> determined the following:</p>${msg}`;
                    }

                    answerEl.innerHTML = msg;

                    renderImages(payload);
                    renderTreatments(payload);
                    renderDebug(payload);
                    scrollToResults();
                });

                // Return false — let the reader loop exit naturally when the 
                // server closes the connection.  The onEmpty callback handles 
                // the UI work.
                return false;
            }

            case 'error': {

                // Errors are urgent — bypass the queue and paint immediately.
                const statusEl = statusQueue._el;
                statusEl.remove();
                answerEl.innerHTML = `<p class="zai-error">${payload.message ?? 'An error occurred.'}</p>`;
                statusQueue.destroy();
                return true;
            }
        }

        return false;
    }

    // RESPONSE RENDER
    // ─────────────────────────────────────────────────────────────────────────
    // renderResponse  (non-streaming / cache-hit path)
    //
    // called when the server returns plain JSON.
    // The only structural change: renderImages/renderTreatments/renderDebug 
    // now accept the inner response object directly (see note at bottom of 
    // file).
    // ─────────────────────────────────────────────────────────────────────────

    function renderResponse(data){
        ui.response.innerHTML='';
        const query = data.query;
        const answer = md.makeHtml(data.response?.answer||'');
        const intro = document.createElement('div');
        ui.response.appendChild(intro);

        let msg = answer;

        if (ui.openEnded.checked) {
            msg = `<p>A vector search for <em>${query}</em> determined the following:</p>${msg}`;
        }

        typewriterHTML(msg, intro, ()=>{
            renderImages(data);
            renderTreatments(data);
            renderDebug(data);
        });

        scrollToResults();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // renderImages
    //
    // CHANGED: now accepts the inner `response` object (which has 
    // `.treatments`) rather than the outer `data` wrapper.  This makes it work 
    // with both paths:
    //   - streaming "done" payload  → { answer, model, treatments, debugInfo }
    //   - cache-hit via renderResponse → data.response passed explicitly above
    //
    // PREVIOUSLY: data.response?.treatments
    // NOW:        response?.treatments   (caller passes the right level)
    // ─────────────────────────────────────────────────────────────────────────

    function renderImages(response) {
        const images = [];
        response?.treatments?.forEach(t => images.push(...(t.images || [])));
        if (!images.length) return;

        const title = document.createElement('p');
        title.textContent = images.length > 1
            ? 'Here are a few related images'
            : 'Here is a related image';
        ui.response.appendChild(title);

        const container = document.createElement('div');
        container.className = 'zai-image-grid';
        ui.response.appendChild(container);

        images.forEach(img => {
            const fig   = document.createElement('figure');
            const image = document.createElement('img');
            image.src = getUri(img.httpUri);
            image.loading = 'lazy';
            const cap = document.createElement('figcaption');
            cap.textContent = img.captionText;
            fig.append(image, cap);
            container.appendChild(fig);
        });

        // applyImageLayout(container, images.length);
    }

    function extractId(url) {

        // Use a regular expression to find the number between 'records/' 
        // and '/files'
        const regex = /record\/([0-9]+)\/files/;

        // Use the URL.match() method to find the match
        const match = url.match(regex);

        // If a match is found, return the number; otherwise, return null
        return match ? match[1] : null;
    }

    // https://zenodo.org/records/266210/files/figure.png
    function getUri(uri) {
        let u;

        // if the figure is on zenodo, show their thumbnails unless 
        // it is an svg, in which case, apologize with "no preview"
        if (uri.indexOf('zenodo') > -1) {
            if (uri.indexOf('.svg') > -1) {
                u = '/img/kein-preview.png';
            }
            else {
                const id = extractId(uri);

                // https://zenodo.org/api/iiif/record:6758444:figure.png/full/250,/0/default.png
                u = `https://zenodo.org/record/${id}/thumb${250}`;
            }
        }

        // but some are on Pensoft, so use the uri directly
        else {
            u = `${uri}/singlefigAOF/`;
        }

        return u;
    }


    // ─────────────────────────────────────────────────────────────────────────
    // renderTreatments
    //
    // CHANGED: same shape change as renderImages — accepts the inner response.
    // Also added a guard for null/undefined treatments (was a silent crash 
    // before if treatments was undefined: [].length works but undefined.length 
    // throws).
    // ─────────────────────────────────────────────────────────────────────────
    function renderTreatments(response) {
        const treatments = response?.treatments;

        // FIXED: was !treatments.length (throws if undefined)
        if (!treatments?.length) return;

        const title = document.createElement('p');
        title.textContent = 'Answer generated based on the following treatments:';
        ui.response.appendChild(title);

        const ul = document.createElement('ul');
        ul.classList.add('citations');

        treatments.forEach(t => {
            const li = document.createElement('li');
            li.innerHTML = `${t.articleAuthor}. ${t.journalYear}. <a href="https://tb.plazi.org/GgServer/xhtml/${t.treatmentId}">${t.treatmentTitle} (${t.status})</a> <em>in</em> "${t.articleTitle}", <em>${t.journalTitle}</em>, ${t.publicationDate}`;
            ul.appendChild(li);
        });

        ui.response.appendChild(ul);
    }


    // ─────────────────────────────────────────────────────────────────────────
    // renderDebug
    //
    // CHANGED: for the streaming path the "done" payload has debugInfo at the 
    // top level ({ answer, model, treatments, debugInfo }).  For the cache-hit 
    // path, debugInfo is on the outer data object (data.debugInfo).
    // Accept either shape by checking both locations.
    // ─────────────────────────────────────────────────────────────────────────
    function renderDebug(data) {

        // Works for both: streaming done payload (data.debugInfo) and
        // cache-hit outer wrapper (data.debugInfo).
        const debugInfo = data?.debugInfo;
        if (!debugInfo) return;

        const details = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = 'Debug information';
        const pre = document.createElement('pre');
        pre.textContent = JSON.stringify(debugInfo, null, 2);
        details.append(summary, pre);
        ui.response.appendChild(details);
    }

    // TYPEWRITER
    function typewriterHTML(html, el, done, cps = 120){
        const tmp = document.createElement('div'); 
        tmp.innerHTML = html;
        const text = tmp.innerHTML; 
        const total = text.length;
        let start = null; 
        let lastIndex=0;

        function frame(timestamp){
            if(!start) start=timestamp;

            const elapsed = (timestamp-start)/1000;
            const index = Math.min(Math.floor(elapsed*cps), total);

            if(index!==lastIndex){ 
                el.innerHTML = text.slice(0,index); 
                lastIndex=index; 
            }

            if(index<total) {
                requestAnimationFrame(frame); 
            }
            else {
                done && done();
            }
        }

        requestAnimationFrame(frame);
    }

    function loadQueryFromURL(){
        const params=new URLSearchParams(location.search);
        const query=params.get("heyzai");
        if(!query) return;

        if (isDescribeQuery(query)) {
            deActivateOpenEnded(query);
            
            const queryArr = query.split(/ /);
            ui.input.value = `${queryArr[1]} ${queryArr[2]}`;
        }
        else {
            activateOpenEnded(query);
            ui.input.value=query;
        }

        if(params.get("refreshCache")==="true"){ 
            ui.refreshCache.checked=true; 
        }

        executeQuery(query);
    }

    async function executeQuery(query){
        //console.log(`query: ${query}`);
        hideSuggestions(); 
        ui.submitBtn.classList.add("button--loading");

        if (!ui.openEnded.checked) {

            if (!query.toLowerCase().includes('describe')) {
                query = `Describe ${query}`;
            }
            
        }

        updateBrowserURL(query);

        try{
            const params=new URLSearchParams(); 
            params.set("heyzai",query);

            if(ui.refreshCache.checked){ 
                params.set("refreshCache","true"); 
            }

            const url = `${Zai.uris.zenodeo}/v3/treatments?${params.toString()}`;
            const res = await fetch(url);
            ui.submitBtn.classList.remove("button--loading");
            ui.refreshCache.checked = false;
            // ui.refreshCacheMsg.classList.toggle('hidden');
            //renderResponse(data);

            if (res.headers.get('Content-Type')?.startsWith('text/event-stream')) {
                await renderStreamingResponse(res);
            } 
            else {
                renderResponse(await res.json());
            }
        } 
        catch(e){ 
            console.error(e); 
        }
    }

    function updateBrowserURL(query){
        const params=new URLSearchParams(); 
        params.set("heyzai",query);

        if(ui.refreshCache?.checked){ 
            params.set("refreshCache","true"); 
        }

        history.replaceState(null,"",`${location.pathname}?${params.toString()}`);
    }

    function scrollToResults(){ 
        ui.response.scrollIntoView({behavior:'smooth', block:'start'}); 
    }

    function resetUI(){ 
        hideSuggestions(); 
        ui.response.innerHTML=''; 
        selected=false; 
    }

    function debounce(fn,delay){ 
        let t; 
        return (...args)=>{ 
            clearTimeout(t); 
            t=setTimeout(()=>fn(...args),delay); 
        }; 
    }

    function applyImageLayout(container, count){

        // remove old classes
        container.classList.remove('images-1','images-2','images-3plus');

        if(count === 1){
            container.classList.add('images-1');
        } 
        else if(count === 2){
            container.classList.add('images-2');
        } 
        else if(count > 2){
            container.classList.add('images-3plus');
        }

    }
    
    tweakUrl(window.location.href);
    
    // Initialize the autosuggest when DOM is loaded
    document.addEventListener('DOMContentLoaded', async () => {
        initializeUi();
        initializeRoutes();
        await populateExampleDropdown();
        activateExampleQueries();
        loadQueryFromURL();
        ui.input.focus();
    });
}

export { init }