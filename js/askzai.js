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

    if (arr.length === 1) {
        return `<span class="hl">${arr[0]}</span>`;
    }
    else if (arr.length === 2) {
        return `<span class="hl">${arr[0]}</span> and <span class="hl">${arr[1]}</span>`;
    }
    else {
        return ` <span class="hl">${arr.slice(0, arr.length - 1).join(`</span>, <span class="hl">`)}</span>, and <span class="hl">${arr[arr.length - 1]}</span>`;
    }

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

function submitForm(event) {

    if (event) {
        event.preventDefault();
    }
    
    const input = $('#q');
    const query = input.innerText;

    if (query.length < 3) {
        input.dataset.text = "C'mon now, say something!";
        input.classList.add('warning');
        setTimeout(() => { 
            input.dataset.text = "Ask me something!";
            input.classList.remove('warning');
        }, 2000);
    }
    else {
        history.pushState("", "", `?heyzai=${query}`);
        go(query);
    }
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
            uris.src250 = `${window.uris.zenodo}/api/iiif/record:${id}:figure.png/full/250,/0/default.jpg`;
            //uris.src250 = `${window.uris.zenodo}/${id}/thumb${250}`;

            // record.fullImage = `${globals.zenodoUri}/${id}/thumb1200`;
            // https://zenodo.org/api/iiif/record:6758444:figure.png/full/1200,/0/default.png
            uris.src1200 = `${window.uris.zenodo}/api/iiif/record:${id}:figure.png/full/^1200,/0/default.jpg`;
            //uris.src1200 = `${window.uris.zenodo}/${id}/thumb1200`;
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
    const inputHTML = words
        .map(word => {
            if (uniqWords.includes(word)) {
                return `<span class="hl">${word}</span>\n`
            }
            else if (/^-/.test(word)) {
                return `<span aria-label="word removed from search" ${popPopStr}>${word}</span>\n`
            }
            else if (/^\+/.test(word)) {
                return `<span class="hl" aria-label="stopword included in search" ${popPopStr}>${word}</span>\n`
            }
            else {
                return `<span aria-label="stopword removed from search" ${popPopStr}>${word}</span>\n`
            }
        })
        .join(" ");
    
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

function sourcesHTML({ sourceName, sources }) {
    const srcList = sources.map((s, i) => `<li id="source-${i + 1}" class="sources"><a href="${window.uris.tb}/${s.treatmentId}" target="_blank">${s.treatmentTitle}</a> from <cite>${s.articleAuthor}. ${s.publicationDate}. ${s.articleTitle}, DOI: <a href="https://doi.org/${s.articleDOI}">${s.articleDOI}</a></cite></li>`);

    return `Answer generated based on the following ${sourceName}:
    <ol>${srcList}</ol>`;
}

function responsesHTML(searchTerms, count, stored, ttl, cacheHit) {
    let str = '';

    if (cacheHit) {
        const storedDate = new Date(stored);
        const expires = new Date(stored + ttl) - new Date();
        str = `<span aria-label="cache hit, stored ${formatDate(storedDate)}, expires in ${formatTime(expires)}" data-html="true" data-pop="top" data-pop-no-shadow data-pop-arrow data-pop-multiline>💥</span>`;
    }

    // return `
    // <p>Zai says ${str}</p>
    // <ul>
    //     <li class="message">Conducted a full-text search for "${literalList(searchTerms)}"</li>
    //     <li class="message">Found <span class="res">${count}</span> papers</li>
    //     <li class="message">Using the full text of the <a href="#source-0">top ranked paper</a>, found the following:</li>
    // </ul>`
    return `
    <p>A full-text search for "${literalList(searchTerms)}" found <span class="res">${count}</span> papers. Here is the answer derived from the full text of the <a href="#source-0">top ranked paper</a>:  ${str}`
}

async function go(query) {
    const goButton = $("#go");
    goButton.classList.add("button--loading");

    // Empty all the divs inside the responses div
    const responses = $$("#responses div");
    responses.forEach(div => {
        div.textContent = "";
        div.innerHTML = "";
    });
    
    const input = $("#q");
    const { searchTerms, inputHTML } = prepareSearchTerms(query);
    input.innerHTML = inputHTML;
    const url = `${window.uris.zenodeo}/v3/treatments?heyzai=${query}`;
    const resp = await fetch(url);
    
    //const res = await toJSON(response.body);

    if (resp.ok) {
        const { query, response, stored, ttl, isSemantic, cacheHit } = await resp.json();
        const { fts, answer } = response;
        const { count, sources } = fts;

        const responseContainer = $("#response");
        responseContainer.innerHTML = responsesHTML(searchTerms, count, stored, ttl, cacheHit);

        let { think, conclusion } = stripThink(answer);

        if (sources[0].images.length == 1) {
            conclusion = `${conclusion} Here is a related image\n`
        }
        else if (sources[0].images.length > 1) {
            conclusion = `${conclusion} Here are a few related images\n\n`;
        }

        type({
            answerContainer: $("#answer"), 
            conclusion, 
            relatedImages: sources[0].images, 
            sourceHTML: sourcesHTML({
                sourceName: sources.length > 1 ? 'treatments' : 'treatment',
                sources
            })
        });
        goButton.classList.remove("button--loading");
    }
}

function drawImage(relatedImages, sourceHTML) {
    if (relatedImages) {
        const relatedImagesContainer = $("#relatedImages");

        let defaultImgSrc = '250'
        let defaultImgWidth = 255;

        if (relatedImages.length === 1) {
            relatedImagesContainer.classList.remove("columns");
            relatedImagesContainer.classList.add("column");
            defaultImgSrc = '1200';
            defaultImgWidth = 928;

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

function type({
    answerContainer, 
    conclusion, 
    speed = 5, 
    index = 0, 
    relatedImages, 
    sourceHTML
}) {
    answerContainer.textContent += conclusion.charAt(index);

    setTimeout(() => {
        index++;

        if (index < (conclusion.length)) {
            type({
                answerContainer, 
                conclusion, 
                index,
                relatedImages, 
                sourceHTML
            });
        }
        else {
            drawImage(relatedImages, sourceHTML);
        }
    }, speed)
}

function reset() {
    $("#q").innerHTML = "";
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
    window.uris = {
        zenodo: 'https://zenodo.org',
        zenodeo: 'http://localhost:3010',
        tb: 'https://tb.plazi.org/GgServer/html'
    };

    if (loc.indexOf('askzai.net') > -1) {
        window.uris.zenodeo = 'https://test.zenodeo.org';
    }
    else if (loc.indexOf('lucknow.local') > -1) {
        window.zenodeo = 'http://lucknow.local:3010';
    }
}

export { onPageLoad, submitForm, go, reset, tweakUrl }