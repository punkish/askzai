const stopWords = [
    /* a */ "able", "about", "above", "ain't", "all", "and", "any", 
            "are", "aren't",
    /* b */ "because", "but", 
    /* c */ "can", "cannot", "could", "couldnt",
    /* d */ "describe", "did", "does", "dont",
    /* e */ "either", "else", "ever", "every",
    /* f */ "for", "from",
    /* g */ "get", "got",
    /* h */ "had", "hadnt", "has", "hasnt", "have", "havent", "her", 
            "hers", "him", "his", "how", "however",
    /* i */ "into", "isnt", "its",
    /* j */ "just",
    /* k */ 
    /* l */ "let", "like", "likely",
    /* m */ "may", "might", "most", "must", 
    /* n */ "nor", "not",
    /* o */ "off", "only", "other", "our", "own", 
    /* p */ 
    /* q */ 
    /* r */ 
    /* s */ "shall", "should", "shouldnt", "since", "so", "some",
    /* t */ "than", "that", "the", "them", "then", "there", "their", 
            "they", "this", "tis", "too", "twas",
    /* u */ "unto", "upon", "use", "used", "using", "useful", "uses", 
            "using", "usually",
    /* v */ "very", "viz",
    /* w */ "want", "wants", "was", "wasnt", "way", "went", "were", 
            "weren't", "we'd", "well", "we'll", "we're", "we've", "what", 
            "what's", "whatever", "whence", "whenever", "where", "whereafter", 
            "whereas", "whereby", "wherein", "whereupon", "wherever", 
            "whether", "when", "which", "while", "whither", "who", "whose", 
            "whoever", "whole", "whom", "why", "will", "willing", "wish", 
            "with", "within", "without", "won't", "would", "wouldn't",
    /* x */ 
    /* y */ "yes", "yet", "you", "your", "you'd", "you're", "you'll",
            "you've", "yours", "yourself", "yourselves",
    /* z */ 
];


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
    popPopStr = '';
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
    
    const res = {
        query,
        uniqWords,
        searchTerms,
        str
    }

    console.log(res)
}

//prepareSearchTerms('What are the -species what that co-roost');
function cb(i) {
    console.log(`\ndone after ${i} turns`);
}

function type(text, speed, cb, i = 0) {
    process.stdout.write(text.charAt(i));
    
    setTimeout(() => {
        i++;
        i < text.length ? type(text, speed, cb, i) : cb(i)
    }, speed)
    
}

type('some text', 100, cb)