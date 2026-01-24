const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

function getInputText(input) {
    const str = input.textContent || input.innerText || '';
    return str.trim()
}

// Move cursor to end
function moveCursorToEnd(input) {
    const range = document.createRange();
    const selection = window.getSelection();
    range.selectNodeContents(input);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
}

function toggleVisibility(el) {
    el.classList.toggle('is-hidden');
    el.classList.toggle('is-visible');
}

async function getSpeciesList() {
    let count = '583K';

    // Pre-populated species list
    let speciesList = [
        'Panthera leo',
        'Tyrannosaurus rex',
        'Quercus alba',
        'Apis mellifera',
        'Canis lupus',
        'Aquila chrysaetos',
        'Rosa damascena',
        'Balaenoptera musculus',
        'Drosophila melanogaster',
        'Acer saccharum'
    ];

    const url = `${Zai.uris.zenodeo}/v3/binomens`;
    const resp = await fetch(url);

    if (resp.ok) {
        const { query, response } = await resp.json();
        const res = response;
        count = res.count;

        if (res.records.length) {
            speciesList = res.records.map(r => r.binomen);
        }
        
    }
    
    return { count, speciesList }
}

// Example usage:
// const dirtyUrl = "http://askzai.net/?heyzai=What%20is%C2%A0Adalia%20decempunctata";
// console.log(cleanUrlQueryValues(dirtyUrl));
// // Output: "http://askzai.net/?heyzai=What+is+Adalia+decempunctata"
function cleanUrlQuery(query) {
    const urlObj = new URL(url);
    const params = new URLSearchParams(urlObj.search);
    
    // Clean each parameter value
    for (let [key, value] of params.entries()) {

        // Decode and clean the value
        // Normalize whitespace
        let cleaned = query.replace(/\s+/g, ' ');

        // Remove unwanted chars
        cleaned = cleaned.replace(/[^a-zA-Z0-9 .,!?;:()\-'"]/g, '');

        // Single spaces only
        cleaned = cleaned.replace(/ +/g, ' ').trim();
        
        params.set(key, cleaned);
    }
    
    urlObj.search = params.toString();
    return urlObj.toString();
}

function cleanUrlParam(query) {
    
    // Clean each parameter value
    // Decode and clean the value
    // Normalize whitespace
    let cleaned = query.replace(/\s+/g, ' ');

    // Remove unwanted chars
    cleaned = cleaned.replace(/[^a-zA-Z0-9 .,!?;:()\-'"]/g, '');

    // Single spaces only
    cleaned = cleaned.replace(/ +/g, ' ').trim();
      
    return cleaned;
}

export { 
    $, 
    $$, 
    getInputText, 
    moveCursorToEnd, 
    toggleVisibility, 
    getSpeciesList,
    cleanUrlParam
}