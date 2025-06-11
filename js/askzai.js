import { $, $$ } from './utils.js';
import { stopWords } from "./stopwords.js";

// Convert milliseconds to days:hours:mins without seconds
// https://stackoverflow.com/a/8528531/183692
function formatTime(ms) {
    const ms_in_h = 60 * 60 * 1000;
    const ms_in_d = 24 * ms_in_h;
    let d = Math.floor(ms / ms_in_d);
    let h = Math.floor( (ms - (d * ms_in_d)) / ms_in_h);
    let m = Math.round( (ms - (d * ms_in_d) - (h * ms_in_h)) / 60000);
    const pad = (n) => n < 10 ? '0' + n : n;

    if (m === 60) {
        h++;
        m = 0;
    }

    if (h === 24) {
        d++;
        h = 0;
    }

    return `${d} days ${pad(h)} hours ${pad(m)} mins`;
}

function formatDate(d) {
    const yyyy = d.getFullYear();
    const mm = d.getMonth();
    const dd = d.getDate();
    const hh = d.getHours();
    const mn = d.getMinutes();
    const ss = d.getSeconds();
    const months = [ 
        'January', 'February', 'March', 'April', 'May', 'June', 'July', 
        'August', 'September', 'October', 'November', 'December'
    ];

    return `${dd} ${months[mm]}, ${yyyy} ${hh}:${mn}:${ss}`;
}

function literalList(arr) {
    function wrap(item) {
        return `<span class="hl">${item}</span>`;
    }
    
    let str = `${arr.slice(0, arr.length - 1 || 1)
        .map(item => wrap(item))
        .join(', ')}`;

    if (arr.length > 1) {
        str += ` and ${wrap(arr[arr.length - 1])}`;
    }
    
    return str
}

async function toJSON(body) {
    console.log(body);
    const reader = body.getReader(); // `ReadableStreamDefaultReader`
    const decoder = new TextDecoder();
    const chunks = [];
  
    async function read() {
        const { done, value } = await reader.read();
    
        // all chunks have been read?
        if (done) {
            return JSON.parse(chunks.join(''));
        }
    
        const chunk = decoder.decode(value, { stream: true });
        chunks.push(chunk);
        return read(); // read the next chunk
    }
  
    return read();
}

function imageUrl(httpUri) {
    const uris = {};

    // Most figures are on Zenodo, so adjust their url 
    // accordingly
    const id = httpUri.split('/')[4];

    // if the figure is on zenodo, show their thumbnails unless 
    // it is an svg, in which case, apologize with "no preview"
    if (httpUri.indexOf('zenodo') > -1) {
        if (httpUri.indexOf('.svg') > -1) {
            uris.src250 = '/img/kein-preview.png';
            uris.src1200 = '/img/kein-preview.png';
        }
        else {

            // record.uri = `${globals.zenodoUri}/${id}/thumb${figureSize}`;
            // https://zenodo.org/api/iiif/record:6758444:figure.png/full/250,/0/default.png
            uris.src250 = `${Zai.uris.zenodo}/api/iiif/record:${id}:figure.png/full/250,/0/default.jpg`;
            //uris.src250 = `${Zai.uris.zenodo}/${id}/thumb${250}`;

            // record.fullImage = `${globals.zenodoUri}/${id}/thumb1200`;
            // https://zenodo.org/api/iiif/record:6758444:figure.png/full/1200,/0/default.png
            uris.src1200 = `${Zai.uris.zenodo}/api/iiif/record:${id}:figure.png/full/^1200,/0/default.jpg`;
            //uris.src1200 = `${Zai.uris.zenodo}/${id}/thumb1200`;
        }
    }

    // but some are on Pensoft, so use the uri directly
    else {
        uris.src250 = uris.src1200 = `${httpUri}/singlefigAOF/`;
        //uris.orig250 = uris.orig1200 = httpUri;
    }

    return uris;
}

function prepareSearchTerms(query) {

    let isQuestion = false;

    if (query.slice(-1) === '?') {
        isQuestion = true;
        query = query.slice(0, -1);
    }

    const words = query.split(/\s+/);

    // include only words…
    const filteredWords = words

        // … longer than 2 chars
        .filter(word => word.length > 2)

        // … not included in the stopWords
        .filter(word => !stopWords.includes(word.toLowerCase()))

        // … don't start with a -
        .filter(word => !/^-/.test(word))

        // … start with an optional +
        .filter(word => /^\+?/.test(word));
    
    // remove duplicates
    const uniqWords = Array.from(new Set(filteredWords));

    const searchTerms = uniqWords.map(word => word
        .toLowerCase()

        // remove leading -
        .replace(/^-/, '')

        // remove leading +
        .replace(/^\+/, '')

        // enclose in double-quotes if the word is hyphenated
        .replace(/(\w+-\w+)/, '"$1"')
    );

    let popPopStr = 'data-pop="top" data-pop-no-shadow data-pop-arrow';
    let inputHTML = words
        .map(word => {
            if (uniqWords.includes(word)) {
                return `<span class="hl">${word}</span>`
            }
            else if (/^-/.test(word)) {
                return `<span aria-label="word removed from search" ${popPopStr}>${word}</span>`
            }
            else if (/^\+/.test(word)) {
                return `<span class="hl" aria-label="stopword included in search" ${popPopStr}>${word}</span>`
            }
            else {
                return `<span aria-label="stopword removed from search" ${popPopStr}>${word}</span>`
            }
        })
        .join(" ");

    if (isQuestion) {
        inputHTML += '?';
    }
    
    return { searchTerms, inputHTML }
}

function stripThink(text) {
    const oTag = '<think>';
    const cTag = '</think>';

    if (text.indexOf(oTag) > -1) {
        const startThink = text.indexOf(oTag) + oTag.length;
        const endThink = text.indexOf(cTag);

        const startAns = text.indexOf(cTag) + cTag.length;

        const think = text.substring(startThink, endThink);
        const conclusion = text.substring(startAns);

        return { think, conclusion }
    }
    else {
        return { conclusion: text }
    }
    
}

function sourcesHTML(records) {
    const srcList = records.map((s, i) => {
        let cite = `<li id="source-${i + 1}" class="sources"><a href="${Zai.uris.tb}/${s.treatmentId}" target="_blank">${s.treatmentTitle}</a> from <cite>${s.articleAuthor} `;
        
        if (s.publicationDate) {
            cite += `${s.publicationDate}. `;
        }

        if (s.articleTitle) {
            cite += `${s.articleTitle}`;
        }

        if (s.articleDOI) {
            cite += `, DOI: <a href="https://doi.org/${s.articleDOI}">${s.articleDOI}</a>`;
        }

        cite += `</cite></li>`;
        return cite;
    }).join('\n');

    const sourceName = records.length > 1 ? 'treatments' : 'treatment';
    return `Answer generated based on the following ${sourceName}:
    <ol>${srcList}</ol>`;
}

function isQueryForSummary(query) {
    const words = query.toLowerCase().trim().split(/\s+/);
    return words.length >= 1 && words[0] === 'describe';
}

async function go(query, refreshCache) {
    hidePlaceholder();
    const goButton = $("#go");
    goButton.classList.add("button--loading");

    // Empty all the divs inside the responses div
    const responses = $$("#responses div");
    responses.forEach(div => {
        div.textContent = "";
        div.innerHTML = "";
    });

    const { searchTerms, inputHTML } = prepareSearchTerms(query);
    const input = $("#q");
    input.innerHTML = inputHTML;

    const queryString = `heyzai=${encodeURIComponent(query)}`;
    history.pushState("", "", `?${queryString}`);
    let url = `${Zai.uris.zenodeo}/v3/treatments?${queryString}`;

    if (refreshCache) {
        url += `&refreshCache=true`;
    }

    const resp = await fetch(url);

    const qords = query.split(' ');
    let binomen;

    if (qords[0].toLowerCase() === 'describe') {
        binomen = qords.slice(1).join(' ');
    }
    
    //const res = await toJSON(response.body);

    if (resp.ok) {
        const { 
            query, 
            response, 
            stored, 
            ttl, 
            isSemantic, 
            cacheHit 
        } = await resp.json();
        
        const { count, records, answer } = response;
        const niceCount = niceNumbers(count);

        $("#response").innerHTML = isQueryForSummary(query)
            ? responseForSummary({ count: niceCount, binomen, records })
            : responseForLLM({ searchTerms, count: niceCount, stored, ttl, cacheHit });

        let imageMsg = '';

        if (records[0].images && records[0].images.length) {
            imageMsg = records[0].images.length > 1
                ? 'Here are a few related images\n\n'
                : 'Here is a related image\n\n';
        }

        const conclusion = `${answer} ${imageMsg}`;

        type({
            container: $("#answer"), 
            text: conclusion, 
            cb: () => drawImage({
                relatedImages: records[0].images, 
                sourceHTML: sourcesHTML(records)
            })
        });
    }

    goButton.classList.remove("button--loading");
}

function niceNumbers(num) {
    
    if (num > 9) return num;
    const numbers = {
        '1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five', 
        '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine'
    }

    return numbers[String(num)]
}

function responseForLLM({ searchTerms, count, stored, ttl, cacheHit }) {
    let str;
    
    if (count === 'one') {
        str = `A full-text search for "${literalList(searchTerms)}" found <a href="#source-0">${count} paper</a>. Here is the answer derived from its full text:`;
    }
    else {
        str = `A full-text search for "${literalList(searchTerms)}" found <span class="res">${count}</span> papers. Here is the answer derived from the full text of the <a href="#source-0">top ranked paper</a>:`;
    }

    if (cacheHit) {
        const storedDate = new Date(stored);
        const expires = new Date(stored + ttl) - new Date();

        const cacheHitStr = `<span aria-label="cache hit, stored ${formatDate(storedDate)}, expires in ${formatTime(expires)}" data-html="true" data-pop="top" data-pop-no-shadow data-pop-arrow data-pop-multiline>💥</span>`;

        str += ` ${cacheHitStr}`;
    }

    return `<p>${str}</p>`
}

function responseForSummary({ count, binomen, records }) {
    let str;
    
    if (count === 'one') {
        str = `Found <span class="res">${count}</span> treatment of the binomen <span class="res">${binomen}</span>. `;
    }
    else {
        str = `Found <span class="res">${count}</span> treatments of the binomen <span class="res">${binomen}</span>. `;
    }

    const i = records.findIndex(e => e.status === 'sp. nov.');
    const source = i > -1 ? records[i] : records[0];

    if (i > -1) {
        str += `Here is the summary derived from the full text of the <a href="#source-0">treatment</a>`;
    }
    else {
        str += `Here is the summary derived from the full text of the first <a href="#source-0">treatment</a>`;
    }

    if (source.status) {
        str += ` with a status <span class="res">${source.status}</span>`
    }

    str += ':';
    
    return `<p>${str}</p>`;
}

function drawImage({ relatedImages, sourceHTML }) {
    if (relatedImages) {
        const relatedImagesContainer = $("#relatedImages");

        let defaultImgSrc = '250'
        let defaultImgWidth = 255;

        if (relatedImages.length === 1) {
            relatedImagesContainer.classList.remove("columns");
            relatedImagesContainer.classList.add("column");

            if (Zai.isWideScreen) {
                defaultImgSrc = '1200';
                defaultImgWidth = 928;
            }

        }
        else {
            relatedImagesContainer.classList.remove("column");
            relatedImagesContainer.classList.add("columns");
        }

        relatedImages.forEach((image, index) => {
            const fig = document.createElement("figure");
            fig.classList.add(`treatment-image-${index}`);
            const img = document.createElement("img");

            const uris = imageUrl(image.httpUri);
            img.src = "img/bug.gif";
            img.dataset.src = uris[`src${defaultImgSrc}`];
            img.width = defaultImgWidth;
            img.alt = "Treatment Image";
            img.classList.add("lazyload");
            fig.appendChild(img);
            const figcaption = document.createElement("figcaption");
            figcaption.textContent = image.captionText;
            fig.appendChild(figcaption);
            relatedImagesContainer.appendChild(fig);
        });
    }

    const sourceContainer = $("#source");
    sourceContainer.innerHTML = sourceHTML;
}

function type2({
    container, 
    text, 
    speed = 5, 
    index = 0, 
    cb
}) {
    container.innerHTML += text.charAt(index);

    setTimeout(() => {
        index++;

        if (index < text.length) {
            type({
                container, 
                text, 
                index,
                cb
            });
        }
        else {

            if (cb) {
                cb();
            }

        }
    }, speed)
}

function type({
    container, 
    text, 
    speed = 5, 
    index = 0, 
    cb
}) {
    const typewriterInterval = setInterval(() => {

        if (index < text.length) {
            const char = text.substring(0, index + 1);
            container.innerHTML = char;
            index++;
        } 
        else {

            // Finished typing current species, 
            // wait a bit then start erasing
            clearInterval(typewriterInterval);
            setTimeout(() => cb(), 2000);
        }
    }, speed);
    
}

function hidePlaceholder() {
    const placeholderOverlay = $('#placeholder-overlay');
    placeholderOverlay.classList.add('hidden');
}

function showPlaceholder() {
    const input = $("#q");
    const placeholderOverlay = $('#placeholder-overlay');

    if (input.textContent.trim() === '') {
        placeholderOverlay.classList.remove('hidden');
    }
}

function reset(e) {
    e.preventDefault();
    const input = $("#q");
    input.innerHTML = "";
    showPlaceholder();
    input.focus();
}

function onPageLoad(router) {
    router.listen();
    $('header img').addEventListener('click', () => {
        $('nav').classList.toggle('fade-in-normal');
        setTimeout(() => { 
            $('nav').classList.remove('fade-in-normal');
        }, 4000);
    });
    $('#q').focus();
    $('#reset').addEventListener('click', reset);
}

/** 
 * adjust the server urls based on where the app is running
 *
 */
function tweakUrl(loc) {
    if (!window.Zai) {
        window.Zai = {};
    }
    
    Zai.uris = {
        zenodo: 'https://zenodo.org',
        zenodeo: 'http://localhost:3010',
        tb: 'https://tb.plazi.org/GgServer/html'
    };

    if (loc.indexOf('askzai.net') > -1) {
        Zai.uris.zenodeo = 'https://test.zenodeo.org';
    }
    else if (loc.indexOf('lucknow.local') > -1) {
        Zai.uris.zenodeo = 'http://lucknow.local:3010';
    }

    Zai.bodyWidth = $('body').clientWidth - 40;
    Zai.isWideScreen = Zai.bodyWidth > 550 ? true : false;
}

function submitForm(input, query) {

    if (query.length < 3) {
        input.dataset.placeholder = "C'mon now, say something!";
        input.classList.add('warning');

        setTimeout(() => { 
            input.dataset.placeholder = "Ask me something!";
            input.classList.remove('warning');
        }, 2000);
    }
    else {
        history.pushState("", "", `?heyzai=${query}`);
        go(query);
    }

}

async function getSpecies(searchTerm) {
    let url = `${Zai.uris.zenodeo}/v3/binomens?binomen=`;

    if (searchTerm) {
        url += `${searchTerm}`;
    }
    else {
        searchTerm = chance.word({ length: 3 })
        url += `contains(${searchTerm})`;
    }

    const resp = await fetch(url);

    if (resp.ok) {
        const { query, response } = await resp.json();
        const { count, records } = response;

        if (records) {
            const species = records.map(r => r.binomen);
            const len = searchTerm.length;
            return species.filter(binomen => 
                binomen.toLowerCase().substring(0, len) === searchTerm.     
                    toLowerCase()
            ).slice(0, 8);
        }
        
    }

}

export { onPageLoad, go, reset, submitForm, tweakUrl, getSpecies, hidePlaceholder, showPlaceholder, type }