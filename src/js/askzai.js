import { 
    $, 
    $$, 
    getInputText, 
    moveCursorToEnd, 
    toggleVisibility,
    getSpeciesList,
    cleanUrlParam
} from './utils.js';
import { stopWords } from "./stopwords.js";
import { Router, reroute } from './router.js';
import { populateExampleDropdown } from './exampleQueries.js';
import SpeciesAutosuggest from './autosuggest.js';

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
        let cite = `<li id="source-${i + 1}" class="sources"><a href="${Zai.uris.tb}/${s.treatmentId}" target="_blank">${s.treatmentTitle}</a> from: ${s.articleAuthor} `;
        
        if (s.publicationDate) {
            cite += `(${s.publicationDate}). `;
        }

        if (s.articleTitle) {
            cite += `${s.articleTitle}. `;
        }

        if (s.journalTitle) {
            cite += `<i>${s.journalTitle}</i> `;

            if (s.journalYear) {
                cite += `<i>${s.journalYear}</i>`;
            }
        }

        if (s.articleDOI) {
            cite += `, DOI: <a href="https://doi.org/${s.articleDOI}">${s.articleDOI}</a>`;
        }

        cite += `</li>`;
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

function addToHistory(query) {
    const queryString = `heyzai=${query}`;
    history.pushState({}, '', `?${queryString}`);
    return queryString
}

const converter = new showdown.Converter();

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

    // queryString has 'heyzai=' added in front of the query
    const queryString = addToHistory(query);
    let url = `${Zai.uris.zenodeo}/v3/treatments?${queryString}`;
    const refreshCacheCheckbox = $("input[name=refreshCache]");

    if (refreshCache || refreshCacheCheckbox.checked) {
        url += `&refreshCache=true`;
    }

    const resp = await fetch(url);

    const qWords = query.split(' ');
    let binomen;

    if (qWords[0].toLowerCase() === 'describe') {
        binomen = qWords.slice(1).join(' ');
    }
    
    //const res = await toJSON(response.body);

    if (resp.ok) {
        const { 
            query, 
            response, 
            stored, 
            ttl,
            cacheHit
        } = await resp.json();
        
        let question = query;
        let answer = converter.makeHtml(response.answer);
        let records;
        let searchTerms;
        let count;
        
        if (binomen) {
            records = response.records;
            count = response.count;
        }
        else {
            records = response.topRanked;
            searchTerms = response.searchTerms.split(' ');
            count = response.ftsCount;
        }

        //const niceCount = niceNumbers(count);

        $("#response").innerHTML = isQueryForSummary(question)
            ? responseForSummary({ count, binomen, records })
            : responseForLLM({ searchTerms, count, stored, ttl, cacheHit });

        let imageMsg = '';

        if (records[0].images && records[0].images.length) {
            imageMsg = records[0].images.length > 1
                ? 'Here are a few related images\n\n'
                : 'Here is a related image\n\n';
        }

        type({
            container: $("#answer"), 
            text: `${answer} ${imageMsg}`, 
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
    const niceCount = niceNumbers(count);
    
    if (count === 1) {
        str = `A full-text search for "${literalList(searchTerms)}" found <a href="#source-0">one</a> paper that provides the context for the answer:`;
    }
    else {
        str = `A full-text search for "${literalList(searchTerms)}" found <span class="res">${niceCount}</span> papers. The <a href="#source-0">three top ranked</a> papers provide the context for the answer:`;
    }

    if (cacheHit) {
        const storedDate = new Date(stored);
        const expires = ttl === -1
            ? 'never expires'
            : `expires in ${formatTime(new Date(stored + ttl) - new Date())}`;

        const cacheHitStr = `<span aria-label="cache hit, stored ${formatDate(storedDate)}, ${expires}" data-html="true" data-pop="top" data-pop-no-shadow data-pop-arrow data-pop-multiline>💥</span>`;

        str += ` ${cacheHitStr}`;
    }

    return `<p>${str}</p>`
}

function responseForSummary({ count, binomen, records }) {
    const t = count === 1 ? 'treatment' : 'treatments';
    let str = `Found <span class="res">${niceNumbers(count)}</span> ${t} of the binomen <span class="res">${binomen}</span>. `;

    const i = records.findIndex(e => e.status === 'sp. nov.');
    const source = i > -1 ? records[i] : records[0];

    if (i > -1) {
        str += `Here is the summary derived from the full text of the treatment with status "sp. nov."`;
    }
    else {

        if (count > 1) {
            str += `Here is the summary derived from the full text of the first treatment`;
        }
        else {
            str += `Here is the summary derived from the full text of the treatment`;
        }

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

        relatedImages
            .filter(image => image.httpUri != '')
            .forEach((image, index) => {
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
    typingSpeed = 5, 
    index = 0, 
    cb,
    cbDelay = 1000
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
            setTimeout(() => cb(), cbDelay);
        }
    }, typingSpeed);
    
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
        const queryString = addToHistory(query);
        go(queryString);
    }

}

async function getSpecies(searchTerm) {

    if (!searchTerm) {
        searchTerm = chance.word({ length: 3 });
    }

    const url = `${Zai.uris.zenodeo}/v3/binomens?binomen=starts_with(${searchTerm})`;
    const resp = await fetch(url);

    if (resp.ok) {
        const { query, response } = await resp.json();
        const { count, records } = response;

        if (records) {
            const st = searchTerm.toLowerCase();
            const stLen = searchTerm.length;
            
            return records
                .map(r => r.binomen)
                .filter(b => b.substring(0, stLen).toLowerCase() === st)
                .slice(0, 8);
                // .map(b => {
                //     const str = b.substring(0, stLen);
                //     const rest = b.substring(stLen);
                //     return `<span class="searchterm">${str}</span>${rest}`
                // });
        }
        
    }

}

function init() {
    tweakUrl(window.location.href);

    const placeholderOverlay = $('.placeholder-overlay');
    const input = $('#q');
    const id = $('#binomen_id');
    window.focusOnInput = false;
    
    // Set the width of the columns
    $('.columns').style.setProperty(
        '--container-width', 
        `${Zai.bodyWidth}px`
    );
    
    let typewriterInterval;
    let isTypewriterActive = false;

    function stopTypewriter() {

        if (typewriterInterval) {
            clearInterval(typewriterInterval);
            typewriterInterval = null;
        }

        isTypewriterActive = false;
        
        // Clear input and set to just "describe "
        input.innerHTML = 'describe&nbsp;';
        moveCursorToEnd(input)
    }

    function startTypewriter(speciesList) {
        let currentSpeciesIndex = Math.floor(Math.random() * speciesList.length);
        let currentCharIndex = 0;
        let currentSpecies = speciesList[currentSpeciesIndex];

        if (!isTypewriterActive) return;
        
        typewriterInterval = setInterval(() => {

            if (currentCharIndex < currentSpecies.length) {
                const char = currentSpecies.substring(
                    0, 
                    currentCharIndex + 1
                );
                input.innerHTML = `describe&nbsp;<span class="hl">${char}</span>`;
                currentCharIndex++;
            } 
            else {

                // Finished typing current species, 
                // wait a bit then start erasing
                clearInterval(typewriterInterval);
                setTimeout(() => {
                    if (isTypewriterActive) {
                        startErasing(speciesList, currentSpeciesIndex, currentCharIndex, currentSpecies);
                    }
                }, 2000);
            }
        }, 100);
    }
    
    function startErasing(speciesList, currentSpeciesIndex, currentCharIndex, currentSpecies) {
        if (!isTypewriterActive) return;
        
        typewriterInterval = setInterval(() => {

            if (currentCharIndex > 0) {
                currentCharIndex--;
                const char = currentSpecies.substring(0, currentCharIndex);
                input.innerHTML = `describe&nbsp;<span class="hl">${char}</span>`;
            } 
            else {

                // Finished erasing, 
                // pick a new species and start typing again
                clearInterval(typewriterInterval);
                setTimeout(() => {
                    if (isTypewriterActive) {

                        // Pick a new random species 
                        // (different from current one)
                        let newIndex;
                        do {
                            newIndex = Math.floor(Math.random() * speciesList.length);
                        } while (newIndex === currentSpeciesIndex && speciesList.length > 1);
                        startTypewriter(speciesList);
                    }
                }, 500);
            }
        }, 50);
    }

    // Initialize the autosuggest when DOM is loaded
    document.addEventListener('DOMContentLoaded', async () => {
        const { count, speciesList } = await getSpeciesList();

        if (Zai.isWideScreen) {
            placeholderOverlay.innerHTML = `Ask me something, or <span class="placeholder-clickable">I can describe more than ${(count/1000).toFixed(0)}K species</span>`;

            // Handle placeholder clickable span
            $('.placeholder-clickable').addEventListener('click', (e) => {
                e.preventDefault();
                hidePlaceholder();
                input.focus();
                
                // Initialize typewriter
                if (!isTypewriterActive) {
                    isTypewriterActive = true;
                    // currentSpeciesIndex = Math.floor(Math.random() * speciesList.length);
                    // currentCharIndex = 0;
                    // currentSpecies = speciesList[currentSpeciesIndex];
                    
                    // Start with "describe "
                    input.innerHTML = 'describe&nbsp;';
                    startTypewriter(speciesList);
                }

                moveCursorToEnd(input);
            });

            // Stop typewriter when user clicks in the field
            input.addEventListener('click', () => {
                if (isTypewriterActive) {
                    stopTypewriter();
                }
            });
            
            // Stop typewriter when user starts typing
            input.addEventListener('keydown', () => {
                if (isTypewriterActive) {
                    stopTypewriter();
                }
            });

        }

        // Handle input focus and blur
        input.addEventListener('focus', hidePlaceholder);
        input.addEventListener('blur', showPlaceholder);
        input.addEventListener('input', () => {
            if (input.textContent.trim() !== '') {
                hidePlaceholder();
            } 
            else {
                showPlaceholder();
            }
        });
        
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
        
        if (window.focusOnInput) {
            input.focus();
        }
        
        $('#reset').addEventListener('click', reset);

        $('#go').addEventListener('click', (e) => {
            e.preventDefault();
            const query = getInputText(input);

            if (query.length < 3) {
                const placeholderOverlay = $('#placeholder-overlay');
                const origPlaceHolder = placeholderOverlay.innerHTML;
                placeholderOverlay.innerHTML = "C'mon now, ask something!";
                placeholderOverlay.classList.add('warning');

                setTimeout(() => { 
                    placeholderOverlay.innerHTML = origPlaceHolder;
                    placeholderOverlay.classList.remove('warning');
                }, 3000);
            }
            else {
                const cleanedQuery = cleanUrlParam(query);
                go(cleanedQuery);
            }
            
        });

        await populateExampleDropdown();

        // if an example query is selected from the list
        $$('#dropdown li').forEach((item) => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                input.innerText = e.target.tagName === 'SPAN' 
                    ? e.target.parentNode.innerText
                    : e.target.innerText;
                
                toggleVisibility($("#example-queries"));
                const query = getInputText(input);
                go(query);
            });
        });

        $(".hint a").addEventListener('click', (e) => {
            e.preventDefault();
            toggleVisibility($("#example-queries"));
        });

        $('header img').addEventListener('click', () => {
            $('nav').classList.toggle('fade-in-normal');
            setTimeout(() => { 
                $('nav').classList.remove('fade-in-normal');
            }, 4000);
        });

        if (window.location.search) {
            const searchParams = new URLSearchParams(
                decodeURIComponent(window.location.search)
            );

            let refreshCache = false;

            if (searchParams.has('refreshCache')) {
                refreshCache = true;
                searchParams.delete('refreshCache');
            }

            let query;

            if (searchParams.has('heyzai')) {
                const heyzai = searchParams.get('heyzai').toString();
                query = cleanUrlParam(heyzai);
            }

            go(query, refreshCache);
        }
        else {
            SpeciesAutosuggest.init({
                input,
                id,
                suggestionsContainer: $('#suggestions'),
                form: $('#speciesForm'),
                getSpecies,
                doSomethingWithData: go
            });
        }
    });
}

export { 
    // onPageLoad, 
    // go, 
    // reset, 
    // submitForm, 
    // tweakUrl, 
    // getSpecies, 
    // hidePlaceholder, 
    // showPlaceholder, 
    // type,
    init
}