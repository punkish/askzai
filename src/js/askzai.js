// askzai.js
import { Router, reroute } from './router.js';
import { $, $$, toggleVisibility, getInputText } from './utils.js';
import { populateExampleDropdown } from './exampleQueries.js';

export async function init() {
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

    tweakUrl(window.location.href);
    initializeUi();

    // Initialize the autosuggest when DOM is loaded
    document.addEventListener('DOMContentLoaded', async () => {
        initializeRoutes();
        await populateExampleDropdown();
        activateExampleQueries();
        ui.input.focus();
    });

    loadQueryFromURL();

    function initializeUi() {
        ui.form = $('form');
        ui.input = $('#queryInput');
        ui.openEnded = $('#openEnded');
        ui.describeTag = $('#describeTag');
        ui.suggestions = $('#suggestions');
        //ui.suggestionItems = $$('li', ui.suggestions);
        ui.response = $('#response');
        ui.reset = $('#resetBtn');
        ui.refreshCache = $('#refreshCache');
        ui.refreshCacheMsg = $('#refreshCacheMsg')
        ui.input.setAttribute('role','combobox');
        ui.input.setAttribute('aria-autocomplete','list');
        ui.submitBtn = $('#submitBtn');
        ui.suggestions.setAttribute('role','listbox');
        ui.showExamples = $('.hint a');

        // EVENTS
        ui.input.addEventListener('input', debounce(handleAutocomplete, 250));
        ui.input.addEventListener('keydown', handleKeyNav);
        ui.form.addEventListener('submit', handleSubmit);
        ui.reset.addEventListener('click', resetUI);
        ui.openEnded.addEventListener('click', toggleOpenEnded);
        ui.refreshCache.addEventListener('change', () => {
            ui.refreshCacheMsg.classList.toggle('hidden', !ui.refreshCache.checked);
        });
        ui.showExamples.addEventListener('click', (e) => {
            e.preventDefault();
            toggleVisibility($("#example-queries"));
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
        const url = `${Zai.uris.zenodeo}/v3/binomens?binomen=${encodeURIComponent(q)}`;

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

    // RESPONSE RENDER
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

    function renderImages(data){
        const images=[];
        data.response?.treatmentsByBinomens?.forEach(b=>b.treatments?.forEach(t=>images.push(...(t.images||[]))));
        if(!images.length) return;

        const title = document.createElement('p');
        title.textContent = images.length>1 ? "Here are a few related images" : "Here is a related image";
        ui.response.appendChild(title);

        const container = document.createElement('div');
        container.className='zai-image-grid';
        ui.response.appendChild(container);

        images.forEach(img=>{
            const fig = document.createElement('figure');
            const image = document.createElement('img'); image.src = img.httpUri; image.loading='lazy';
            const cap = document.createElement('figcaption'); cap.textContent = img.captionText;
            fig.append(image, cap); container.appendChild(fig);
        });

        //applyImageLayout(container, images.length);
    }

    function renderTreatments(data){
        const treatments=[];
        data.response?.treatmentsByBinomens?.forEach(b=>b.treatments?.forEach(t=>treatments.push(t)));
        if(!treatments.length) return;

        const title = document.createElement('p');
        title.textContent = "Answer generated based on the following treatments:";
        ui.response.appendChild(title);

        const ul = document.createElement('ul');
        ul.classList.add('citations');

        treatments.forEach(t=>{
            const li = document.createElement('li');
            li.innerHTML=`${t.articleAuthor}. ${t.journalYear}. <a href="https://tb.plazi.org/GgServer/xhtml/${t.treatmentId}">${t.treatmentTitle} (${t.status})</a> <em>in</em> "${t.articleTitle}", <em>${t.journalTitle}</em>, ${t.publicationDate}`;

            ul.appendChild(li);
        });

        ui.response.appendChild(ul);
    }

    function renderDebug(data){
        if(!data.debugInfo) return;

        const details=document.createElement('details');
        const summary=document.createElement('summary'); 
        summary.textContent="Debug information";
        const pre=document.createElement('pre'); 
        pre.textContent=JSON.stringify(data.debugInfo,null,2);
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
        console.log(`query: ${query}`);
        hideSuggestions(); 
        ui.submitBtn.classList.add("button--loading");

        if (!ui.openEnded.checked) {

            if (query.toLowerCase().indexOf('describe') === -1) {
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
            console.log(`url: ${url}`);
            // const res = await fetch(url);
            // const data = await res.json();
            ui.submitBtn.classList.remove("button--loading");
            //renderResponse(data);
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
}