const $ = (s,p=document) => p.querySelector(s);
const $$ = (s,p=document) => [...p.querySelectorAll(s)];
function toggleVisibility(el) {
    el.classList.toggle('hidden');
    //el.classList.toggle('visible', !el.classList.contains('hidden'));
}
function getInputText(input) {
    const str = input.textContent || input.innerText || '';
    return str.trim()
}

export { $, $$, toggleVisibility, getInputText }