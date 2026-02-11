import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import CleanCSS from 'clean-css';
import { minify } from 'terser';

// Minify CSS
async function minifyCSS(inputPath, outputPath) {
    const css = readFileSync(inputPath, 'utf8');
    const minified = new CleanCSS().minify(css);
    writeFileSync(outputPath, minified.styles);
    console.log(`CSS minified: ${inputPath} -> ${outputPath}`);
};

// Minify JS
async function minifyJS(inputPath, outputPath) {
    const js = readFileSync(inputPath, 'utf8');
    const minified = await minify(js);
    writeFileSync(outputPath, minified.code);
    console.log(`JS minified: ${inputPath} -> ${outputPath}`);
};

// Extract external files from HTML
function extractExternalFiles(htmlPath) {
    const html = readFileSync(htmlPath, 'utf8');
    
    // Extract CSS files
    const cssFiles = [...html.matchAll(/<link[^>]+href=["']([^"']+\.css)["']/g)]
      .map(match => match[1]);
    
    // Extract JS files
    const jsFiles = [...html.matchAll(/<script[^>]+src=["']([^"']+\.js)["']/g)]
      .map(match => match[1]);
    
    return { cssFiles, jsFiles };
};

// Minify all assets referenced in HTML
async function minifyAllAssets(htmlPath, outputDir) {
    //const { cssFiles, jsFiles } = extractExternalFiles(htmlPath);
    const cssFiles = [
        "css/styles.css"
    ];

    const jsFiles = [
        './js/utils.js',
        './js/router.js',
        './js/autosuggest.js',
        './js/askzai.js',
        './js/exampleQueries.js',
        './js/stopwords.js',
    ];

    const baseDir = dirname(htmlPath);
    
    // Minify CSS files
    for (const cssFile of cssFiles) {
        const inputPath = join(baseDir, cssFile);
        const outputPath = join(outputDir, cssFile.replace('.css', '.css'));
        
        const css = readFileSync(inputPath, 'utf8');
        const minified = new CleanCSS().minify(css);
        
        mkdirSync(dirname(outputPath), { recursive: true });
        writeFileSync(outputPath, minified.styles);
        console.log(`Minified: ${cssFile}`);
    }
  
    // Minify JS files
    for (const jsFile of jsFiles) {
        const inputPath = join(baseDir, jsFile);
        const outputPath = join(outputDir, jsFile.replace('.js', '.js'));
        
        const js = readFileSync(inputPath, 'utf8');
        const minified = await minify(js);
        
        mkdirSync(dirname(outputPath), { recursive: true });
        writeFileSync(outputPath, minified.code);
        console.log(`Minified: ${jsFile}`);
    }
};

// Usage
// minifyCSS('./styles.css', './styles.min.css');
// minifyJS('./script.js', './script.min.js');
minifyAllAssets('./src/index.html', './docs');