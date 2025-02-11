import { chromium } from "playwright";
import * as fs from "fs";

const URL = "https://www.planalto.gov.br/ccivil_03/Leis/2002/L10406.htm";

// Define structure of the JSON file (for scraping)
interface Article {
    articleCitation: string;
    articleContent: string;
    sections: string[];
}

async function scrape() {

    // Set up chromium headless browser and navigate to target URL
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(URL);

    // Initialize arrays to keep track of hierarchy of sections 
    // as well as the individual items added to the JSON file after scraping
    let sections: string[] = [];
    let articles: Article[] = [];

    // Retrieve all content and split it line by line
    const content = await page.locator("body").innerText();
    const lines = content.split("\n");

    let currentSections: string[] = []; // Active section hierarchy
    let accumulatingSection = false; // Flag to indicate that we're collecting multi-line section titles
    let currentArticle: Article | null = null; // Current article being processed
    let accumulatingArticleContent: string[] = []; // Accumulate multi-line article content

    for (const line of lines) {
        const trimmed = line.trim();

        // Identify sections (no changes needed here)
        const sectionMatch = trimmed.match(
            /^(P\s*A\s*R\s*T\s*E|L\s*I\s*V\s*R\s*O|T\s*Í\s*T\s*U\s*L\s*O|C\s*A\s*P\s*Í\s*T\s*U\s*L\s*O)|(S\s*e\s*ç\s*ã\s*o)|(S\s*u\s*b\s*s\s*e\s*ç\s*ã\s*o)\s+/i
        );

        if (sectionMatch) {

            // If we're currently processing an article, save it before starting a new section
            if (currentArticle) {
                currentArticle.articleContent = accumulatingArticleContent.join(" ").trim();
                if (!/revogado|revogada/i.test(currentArticle.articleContent)) {
                    articles.push(currentArticle);
                }
                currentArticle = null;
                accumulatingArticleContent = [];
            }

            const sectionType = sectionMatch[0].replace(/\s+/g, ""); // Remove all spaces to determine the section type

            // Finish accumulating the previous section
            if (accumulatingSection && currentSections.length > 0) {
                currentSections[currentSections.length - 1] = currentSections[currentSections.length - 1].trim();
            }

            // Normalize the section title (no changes needed here)
            let normalizedTitle = trimmed;
            if (/^PARTE/i.test(sectionType)) {
                normalizedTitle = trimmed.replace(/(P)\s*(A)\s*(R)\s*(T)\s*(E)\s+/i, "$1$2$3$4$5 ");
                normalizedTitle = normalizedTitle.replace(/(PARTE)\s+([A-Z])(?:\s*([A-Z]))*/gi, (match, p1) => {
                    const restOfWord = match.slice(p1.length + 1).replace(/\s+/g, "");
                    return `${p1} ${restOfWord}`;
                });
            }
            else {
                normalizedTitle = trimmed.replace(/\s+/g, " ");
            }

            // Update hierarchy based on section type (no changes needed here)
            if (/^PARTE/i.test(sectionType)) {
                currentSections = [normalizedTitle];
            }
            else if (/^LIVRO/i.test(sectionType)) {
                currentSections = [currentSections[0], normalizedTitle];
            }
            else if (/^TÍTULO/i.test(sectionType)) {
                currentSections = [currentSections[0], currentSections[1], normalizedTitle];
            }
            else if (/^CAPÍTULO/i.test(sectionType)) {
                currentSections = [
                    currentSections[0],
                    currentSections[1],
                    currentSections[2],
                    normalizedTitle,
                ];
            }
            else if (/^Seção/i.test(sectionType)) {
                currentSections = [
                    currentSections[0],
                    currentSections[1],
                    currentSections[2],
                    currentSections[3],
                    normalizedTitle,
                ];
            }
            else if (/^Subseção/i.test(sectionType)) {
                currentSections = [
                    currentSections[0],
                    currentSections[1],
                    currentSections[2],
                    currentSections[3],
                    currentSections[4],
                    normalizedTitle,
                ];
            }

            // Store current hierarchy for sections that have been matched
            sections = [...currentSections];

            // Once a section has been matched, accumulate all extra text after it but before the next section
            accumulatingSection = true;
            continue;
        }

        // Accumulate extra section details to get full section title (no changes needed here)
        if (accumulatingSection && trimmed !== "" && !/^Art\./.test(trimmed)) {

            // 
            currentSections[currentSections.length - 1] += " " + trimmed.replace(/\s+/g, " ");
            sections = [...currentSections];
            continue;
        }

        // Stop accumulating section when we hit an article or empty line
        if (trimmed === "" || /^Art\./.test(trimmed)) {
            accumulatingSection = false;
        }

        // Identify articles or "Parágrafo único"
        const articleMatch = trimmed.match(/^(Art\. \d+[ºª°]?[-\w]*)\.?\s*/);
        const paragraphMatch = trimmed.match(/^(Parágrafo único)\.?\s*/);

        if (articleMatch) {

            // If we're currently processing an article, save it before starting a new one
            if (currentArticle) {
                currentArticle.articleContent = accumulatingArticleContent.join(" ").trim();
                articles.push(currentArticle);
                accumulatingArticleContent = [];
            }

            // Start a new article
            const articleCitation = articleMatch[1];
            const remainingContent = trimmed.replace(/^(Art\. \d+[ºª°]?[-\w]*)\.?\s*/, "").trim();
            currentArticle = {
                articleCitation,
                articleContent: remainingContent,
                sections: [...sections],
            };

            // If there's content on the same line as the article citation, add it
            if (remainingContent) {
                accumulatingArticleContent.push(remainingContent);
            }
        }

        else if (paragraphMatch) {

            // If we're currently processing an article, save it
            if (currentArticle) {
                currentArticle.articleContent = accumulatingArticleContent.join(" ").trim();
                articles.push(currentArticle);
                accumulatingArticleContent = [];
            }

            // Store "Parágrafo único" as a standalone entry
            const remainingContent = trimmed.replace(/^(Parágrafo único)\.?\s*/, "").trim();
            currentArticle = {
                articleCitation: "Parágrafo único",
                articleContent: remainingContent,
                sections: [...sections],
            };

            // If there's content on the same line as the article citation, add it
            if (remainingContent) {
                accumulatingArticleContent.push(remainingContent);
            }
        }
            
        else if (currentArticle) {
            // If we're inside an article, accumulate the content
            accumulatingArticleContent.push(trimmed);
        }

    }

    // Save the last article if it exists
    if (currentArticle) {
        currentArticle.articleContent = accumulatingArticleContent.join(" ").trim();
        articles.push(currentArticle);
    }

    // Close browser once everything has been read
    await browser.close();

    // Saving to custom JSON file
    fs.writeFileSync("civil_code.json", JSON.stringify(articles, null, 2));
    console.log("Scraping complete.");
}

scrape();
