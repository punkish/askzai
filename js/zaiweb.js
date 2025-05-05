import { $, $$ } from './utils.js';
import { stopWords } from "./stopwords.js";

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
    event.preventDefault();
    const input = $('#q');
    input.innerText = input.innerText;
    const query = input.innerText;

    if (query.length < 3) {
        tgt.placeholder = "C'mon now, say something!";
        tgt.classList.add('warning');
        setTimeout(() => { 
            tgt.placeholder = "Ask me something!";
            tgt.classList.remove('warning');
        }, 2000);
    }
    else {
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
    const str = words
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
    
    return { searchTerms, str }
}

function stripThink(text) {
    const oTag = '<think>';
    const cTag = '</think>';

    const startThink = text.indexOf(oTag) + oTag.length;
    const endThink = text.indexOf(cTag);

    const startAns = text.indexOf(cTag) + cTag.length;

    const think = text.substring(startThink, endThink);
    const answer = text.substring(startAns);

    return { think, answer }
}

async function go(query) {
    const goButton = $("#go");
    goButton.classList.add("button--loading");

    const responses = $$("#responses div");
    responses.forEach(div => {
        div.textContent = "";
        div.innerHTML = "";
    });
    const answerContainer = $("#answer");
    const responseContainer = $("#response");
    const relatedImagesContainer = $("#relatedImages");
    const sourceContainer = $("#source");
    
    const output = $("#q");
    const { searchTerms, str } = prepareSearchTerms(query);
    output.innerHTML = str;
    const response = await fetch(`${window.uris.zenodeo}/v3/treatments?zai=${query}`);
    
    //const res = await toJSON(response.body);

    if (response.ok) {
        const res = await response.json();
        let { think, answer } = stripThink(res.response.answer);

        const messages = [
            `Conducted a full-text search for "${literalList(searchTerms)}"`,
            `Found <span class="res">${res.count}</span> papers`,
            `Using the full text of the top ranked paper, asked Zai: <span class="res">"${query}"</span>`
        ];

        const str = messages
            .map(message => `<li class="message">${message}</li>`)
            .join("");

        const source = `<div id="citation">Answer generated based on the treatment: <a href="${window.uris.tb}/${res.response.treatmentId}" target="_blank">${res.response.treatmentTitle}</a> from <cite>${res.response.articleAuthor}. ${res.response.publicationDate}. ${res.response.articleTitle}, DOI: <a href="https://doi.org/${res.response.articleDOI}">${res.response.articleDOI}</a></cite></div>`;

        const speed = 5;
        const index = 0;
        const relatedImages = res.response.images;
        const s = relatedImages.length > 1
            ? ` Here are a few related images`
            : ` Here is a related image`;
        
        if (relatedImages) {
            answer = answer + `${s}\n\n`;
        }
        
        type(answerContainer, answer, speed, index, relatedImages, source);
        goButton.classList.remove("button--loading");
    }
}

function drawImage(relatedImages, source) {
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
    sourceContainer.innerHTML = source;
}

function type(container, text, speed = 10, index = 0, relatedImages, source) {
    container.textContent += text.charAt(index);

    setTimeout(() => {
        index++;

        if (index < (text.length)) {
            type(container, text, speed, index, relatedImages, source);
        }
        else {
            drawImage(relatedImages, source);
        }
    })
    // if (index < (text.length)) {
    //     container.textContent += text.charAt(index);
    //     index++;
    //     setTimeout(() => {
    //         type(container, text, speed, index, relatedImages, source);
    //     }, speed);

    //     if (index === (text.length - 1)) {
    //         drawImage(relatedImages, source);
    //     }
    // }

}

function reset() {
    const input = $("#q");
    // input.classList.add("empty");
    input.innerHTML = "";
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