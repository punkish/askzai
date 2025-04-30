import { $, $$ } from './utils.js';

export class Router {
    
    constructor(routes) {
        this.routes = routes;
        this._loadInitialRoute();
        window.addEventListener('popstate', () => this._loadRoute());
    }

    _loadInitialRoute() {
        const path = window.location.pathname;
        this._navigate(path, false);
    }

    _navigate(path, addToHistory = true) {
        const route = this.routes.find(r => r.path === path);
        
        if (!route) {
            console.log(`Route not found: ${path}`);
            return;
        }

        if (addToHistory) {
            window.history.pushState({}, '', path);
        }

        route.component();
    }

    _loadRoute() {
        const path = window.location.pathname;
        this._navigate(path, false);
    }

    navigateTo(path) {
        this._navigate(path);
    }

    listen() {

        this.routes.forEach(route => {
            const link = route.link;

            link.addEventListener('click', (event) => {
                event.preventDefault();
                const path = link.getAttribute('href');
                this.navigateTo(path);
            });
            
        });

    }
}

export function reroute(page) {
    const sections = $$('section');

    sections.forEach(section => {
        section.classList.add('hidden');
    });

    const homeSection = $(`section#${page}`);

    if (homeSection) {
        homeSection.classList.remove('hidden');
    }
}