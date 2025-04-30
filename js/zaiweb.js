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
    const tgt = event.target.q;
    const query = tgt.value;

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

async function go(query) {
    const answerContainer = document.getElementById("answer");
    const responseContainer = document.getElementById("response");
    const goButton = document.getElementById("go");
    const relatedImagesContainer = document.getElementById("relatedImages");

    goButton.classList.add("button--loading");
    answerContainer.textContent = "";
    responseContainer.innerHTML = "";
    relatedImagesContainer.innerHTML = "";
    
    const input = document.getElementById("q");
    const output = document.getElementById("q_shadow");
    const words = query.split(/\s+/);
    const filteredWords = words
        .filter(word => word.length > 2)
        .filter(word => !stopWords.includes(word.toLowerCase()));
    
    const uniqWords = Array.from(new Set(filteredWords));
    const str = words
        .map(w => {
            return uniqWords.includes(w) 
                ? `<span class="hl">${w}</span>` 
                : `<span aria-label="stop word removed from search" 
                        data-pop="top" data-pop-no-shadow  
                        data-pop-arrow>${w}</span>`;
        })
        .join(" ");
    
    output.innerHTML = str;
    input.classList.add("obscure");
    const response = await fetch(`http://test.zenodeo.org/v3/treatments?zai=${query}`);
    
    //const res = await toJSON(response.body);

    if (response.ok) {
        const res = await response.json();

        const messages = [
            `Conducted a full-text search for "${literalList(uniqWords)}"`,
            `Found <span class="res">${res.count}</span> papers`,
            `Using the full text of the top ranked paper, asked Zai: <span class="res">"${query}"</span>`
        ];

        const str = messages
            .map(message => `<li class="message">${message}</li>`)
            .join("");

        responseContainer.innerHTML = `<ol>${str}</ol>`;

        const speed = 5;
        const index = 0;
        const relatedImages = res.response.images;
        const s = relatedImages.length > 1
            ? ` Here are a few related images`
            : ` Here is a related image`;
        const answer = relatedImages
            ? res.response.answer + `${s}\n\n`
            : res.response.answer;

        type(answerContainer, answer, speed, index, relatedImages);
        goButton.classList.remove("button--loading");
    }
}

function type(container, text, speed = 10, index = 0, relatedImages) {

    if (index < text.length) {
        container.textContent += text.charAt(index);
        index++;
        setTimeout(() => {
            type(container, text, speed, index, relatedImages);

            if (index === text.length - 1) {
                
                if (relatedImages) {
                    const relatedImagesContainer = document.getElementById("relatedImages");

                    if (relatedImages.length === 1) {
                        relatedImagesContainer.classList.remove("columns-250");
                        relatedImagesContainer.classList.add("column");
                    }

                    relatedImages.forEach((image, index) => {
                        const fig = document.createElement("figure");
                        fig.classList.add("treatment-image");
                        fig.classList.add("treatment-image-" + index);
                        const img = document.createElement("img");
                        img.src = image.httpUri;
                        img.alt = "Treatment Image";
                        img.classList.add("treatment-image");
                        fig.appendChild(img);
                        const figcaption = document.createElement("figcaption");
                        figcaption.textContent = image.captionText;
                        fig.appendChild(figcaption);
                        relatedImagesContainer.appendChild(fig);
                    });
                }

            }

        }, speed);
    }

}

function reset() {
    const input = document.getElementById("q");
    const output = document.getElementById("q_shadow");
    input.classList.remove("obscure");
    input.value = "";
    output.innerHTML = "";
}

function onPageLoad(router) {
    router.listen();
    document.querySelector('header img').addEventListener('click', () => {
        document.querySelector('nav').classList.toggle('fade-in-normal');
        setTimeout(() => { 
            document.querySelector('nav').classList.remove('fade-in-normal');
        }, 4000);
    });
    document.querySelector('#q').focus();
    document.querySelector('#reset').addEventListener('click', reset);
}

export { onPageLoad, submitForm, go, reset }