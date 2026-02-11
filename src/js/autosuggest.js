import { $, getInputText, moveCursorToEnd } from './utils.js';

// Species Autosuggest Module
const SpeciesAutosuggest = (() => {

    // Private variables
    let currentSuggestions = [];
    let selectedIndex = -1;
    let isNavigating = false;

    // DOM elements (will be set during initialization)
    let input, id, suggestionsContainer, form, getSpecies, doSomethingWithData;

    const wordsStartWithDescribe = (words) => words.length >= 1 
        && words[0].toLowerCase() === 'describe';

    const shouldShowSuggestions = (text) => {
        const words = text.trim().toLowerCase().split(/\s+/);
        return wordsStartWithDescribe(words)
    };

    const getSearchTerm = (text) => {
        const words = text.trim().split(/\s+/);

        if (wordsStartWithDescribe(words)) {
            return words.slice(1).join(' ').toLowerCase();
        }

        return '';
    };

    const showSuggestions = () => {
        suggestionsContainer.style.display = 'block';
    };

    const hideSuggestions = () => {
        suggestionsContainer.style.display = 'none';
        selectedIndex = -1;
    };

    const highlightSuggestion = (index) => {
        const items = suggestionsContainer.querySelectorAll('.suggestion-item');

        items.forEach((item, i) => {
            if (i === index) {
                item.classList.add('highlighted');
            } 
            else {
                item.classList.remove('highlighted');
            }
        });
    };

    const selectSuggestion = (binomen) => {
        const newText = `Describe ${binomen}`;
        input.textContent = newText;
        moveCursorToEnd(input);        
        hideSuggestions();
        input.focus();
    };

    const renderSuggestions = (suggestions) => {
        if (suggestions.length === 0) {
            hideSuggestions();
            return;
        }

        suggestionsContainer.innerHTML = '';
        currentSuggestions = suggestions;
        selectedIndex = -1;

        suggestions.forEach((binomen, index) => {
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            item.setAttribute('role', 'option');
            item.setAttribute('data-index', index);
            item.innerHTML = `<span class="species-name">${binomen}</span>`;
            item.addEventListener('click', () => selectSuggestion(binomen));
            suggestionsContainer.appendChild(item);
        });

        showSuggestions();
    };

    function debounce(func, delay = 300) {
        let timer;
        
        return function() {
            clearTimeout(timer);
            timer = setTimeout(func, delay);
        };
    }

    const handleAutosuggest = debounce(async () => {

        if (isNavigating) {
            isNavigating = false;
            return;
        }
        
        const text = getInputText(input);
        
        if (shouldShowSuggestions(text)) {
            const searchTerm = getSearchTerm(text);

            if (searchTerm.length > 2) {
                const filteredSpecies = await getSpecies(searchTerm);

                if (filteredSpecies) {
                    renderSuggestions(filteredSpecies);
                }

            }

        } 
        else {
            hideSuggestions();
        }

    });

    const handleKeyDown = (e) => {        
        const isVisible = suggestionsContainer.style.display !== 'none';
        const hasSuggestions = currentSuggestions.length > 0;
        let isSelected = false;

        if (isSelected) {
            input.contentEditable = false;
        }

        if (isVisible && hasSuggestions) {
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    e.stopPropagation();
                    isNavigating = true;
                    
                    if (selectedIndex < currentSuggestions.length - 1) {
                        selectedIndex++;
                    } 
                    else {
                        selectedIndex = 0;
                    }

                    highlightSuggestion(selectedIndex);
                    return false;
                    
                case 'ArrowUp':
                    e.preventDefault();
                    e.stopPropagation();
                    isNavigating = true;

                    if (selectedIndex > 0) {
                        selectedIndex--;
                    } 
                    else {
                        selectedIndex = currentSuggestions.length - 1;
                    }

                    highlightSuggestion(selectedIndex);
                    return false;
                    
                case 'Enter':
                    isSelected = selectedIndex >= 0 
                        && selectedIndex < currentSuggestions.length;

                    if (isSelected) {
                        e.preventDefault();
                        e.stopPropagation();
                        selectSuggestion(currentSuggestions[selectedIndex]);
                        input.contentEditable = false;
                        handleFormSubmit(e);
                        return false;
                    }
                    break;
                    
                case 'Escape':
                    e.preventDefault();
                    e.stopPropagation();
                    hideSuggestions();
                    return false;
            }
        }
        else {

            // If suggestions are not visible, allow default behavior
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                input.contentEditable = false;
                handleFormSubmit(e);
                return false;
            }

        }

    };

    const handleFormSubmit = (e) => {
        e.preventDefault();
        const query = getInputText(input);

        if (query.length < 3) {
            const placeholderOverlay = $('#placeholder-overlay');
            const placeHolder = placeholderOverlay.innerHTML;
            placeholderOverlay.innerHTML = "C'mon now, ask something!";
            placeholderOverlay.classList.add('warning');

            setTimeout(() => { 
                placeholderOverlay.innerHTML = placeHolder;
                placeholderOverlay.classList.remove('warning');
            }, 3000);
        }
        else {
            doSomethingWithData(query);
        }
        
    };

    const handleClickOutside = (e) => {
        if (!input.contains(e.target) && !suggestionsContainer.contains(e.target)) {
            hideSuggestions();
        }
    };

    // Public methods
    const init = (config = {}) => {

        // Get DOM elements
        input = config.input;
        id = config.id;
        suggestionsContainer = config.suggestionsContainer;
        form = config.form;
        getSpecies = config.getSpecies;
        doSomethingWithData = config.doSomethingWithData;

        if (!input) {
            console.error('Required DOM element input not found');
            return false;
        }

        if (!suggestionsContainer) {
            console.error('Required DOM element suggestionsContainer not found');
            return false;
        }

        if (!form) {
            console.error('Required DOM element form not found');
            return false;
        }

        // Add event listeners
        input.addEventListener('input', handleAutosuggest);
        input.addEventListener('keyup', handleAutosuggest);
        input.addEventListener('keydown', handleKeyDown);
        form.addEventListener('submit', handleFormSubmit);
        document.addEventListener('click', handleClickOutside);

        // Focus input on load
        if (window.focusOnInput) {
            input.focus();
        }
        
        //console.log('Species Autosuggest initialized successfully');
        return true;
    };

    const destroy = () => {
        if (input && suggestionsContainer && form) {
            input.removeEventListener('input', handleAutosuggest);
            input.removeEventListener('keyup', handleAutosuggest);
            input.removeEventListener('keydown', handleKeyDown);
            form.removeEventListener('submit', handleFormSubmit);
            document.removeEventListener('click', handleClickOutside);
        }
    };

    const getCurrentSuggestions = () => [...currentSuggestions];

    // Public API
    return {
        init,
        destroy,
        getCurrentSuggestions
    };
})();

export default SpeciesAutosuggest;