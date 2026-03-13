import { $ } from './utils.js';

const exampleQueries = [
    'What is <span class="speciesName">Saigona baiseensis</span>?',
    'Describe <span class="speciesName">Saigona sinicola</span>',
    'Describe <span class="speciesName">Carvalhoma malcolmae</span>',
    'Does <span class="speciesName">Rhinolophus sinicus</span> live in caves?',
    'Where does <span class="speciesName">Laephotis botswanae</span> roost?',
    'What cockroach species are there in India?',
    'What distinguishes <span class="speciesName">Choanolaimus sparsiporus</span>?',
    'What is the etymology of <span class="speciesName">Gammanema lunatum</span>?',
    'Are there any bats in Southern China?',
    'Describe <span class="speciesName">Amnestus sinuosus</span>',
    'What distinguishes <span class="speciesName">Cynodon gibbus</span> from other cofamilial genera?'
];

export async function populateExampleDropdown() {
    const url = `${Zai.uris.zenodeo}/v3/treatments?cachedQueries=true`;
    const resp = await fetch(url);
    let newList = exampleQueries.map(s => s.replace(/<\/?span[^>]*>/g, ''));

    if (resp.ok) {
        const { query, response } = await resp.json();
        const { count, records } = response;
        
        if (records) {

            // Union of two arrays (with no duplicates)
            // https://stackoverflow.com/a/27997088/183692
            newList = [...new Set([...newList, ...records])];
        }

    }
    
    $("#dropdown").innerHTML = newList
        .map(question => `<li>${question}</li>`).join('');
}