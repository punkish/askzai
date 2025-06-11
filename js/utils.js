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

export { $, $$, getInputText, moveCursorToEnd, toggleVisibility }