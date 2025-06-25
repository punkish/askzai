import { $, $$ } from './utils.js';
const exampleQueries = [
    'What is Saigona baiseensis?',
    'Describe Saigona sinicola',
    'Describe Carvalhoma malcolmae',
    'Does Rhinolophus sinicus live in caves?',
    'Where does Laephotis botswanae roost?',
    'What distinguishes Choanolaimus sparsiporus?',
    'What is the etymology of Gammanema lunatum?',
    'Describe Amnestus sinuosus',
    'What distinguishes Cynodon gibbus from other cofamilial genera?'
];

export async function populateExampleDropdown() {
    const url = `${Zai.uris.zenodeo}/v3/treatments?cachedQueries=true`;
    const resp = await fetch(url);

    if (resp.ok) {
        const { query, response } = await resp.json();
        const { count, records } = response;
        let newList = exampleQueries;

        if (records) {

            // Union of two arrays (with no duplicates)
            // https://stackoverflow.com/a/27997088/183692
            newList = [...new Set([...exampleQueries, ...records])];
        }

    }
    
    $("#dropdown").innerHTML = exampleQueries
        .map(question => `<li>${question}</li>`).join('');
}