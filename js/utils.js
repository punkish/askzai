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

    const url = `${Zai.uris.zenodeo}/v3/binomens?binomen=contains(ser)`;
    const resp = await fetch(url);

    if (resp.ok) {
        const { query, response } = await resp.json();
        const { count, records } = response;

        if (records.length) {
            speciesList = records.map(r => r.binomen);
        }
        
    }
    
    return speciesList
}

export { 
    $, 
    $$, 
    getInputText, 
    moveCursorToEnd, 
    toggleVisibility, 
    getSpeciesList 
}